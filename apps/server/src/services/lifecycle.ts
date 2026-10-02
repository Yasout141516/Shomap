import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { canTransition, type Actor, type EventKind, type Status } from "@shomap/shared";
import * as s from "../db/schema.js";
import { routeReferral } from "../domain/referral.js";
import { HttpError } from "../errors.js";
import type { Effects } from "../realtime.js";
import type { Ctx } from "./context.js";
import { notifyMany, notifyStatus, staffOf } from "./notify.js";
import { categoryOf, referralOf } from "./repo.js";

/** A system-written note, stored as an i18n key under `eventNotes.` so the timeline translates it. */
export interface SystemNote {
  key: string;
  params?: Record<string, string | number>;
}
/** A person's free text, or a system note. */
export type EventNote = string | SystemNote | null;

const actorRoleOf = (a: Actor) => (a === "community" ? "system" : a);

/** Appends to the audit log (NFR-9). */
export function logEvent(
  ctx: Ctx,
  e: { incidentId: string; kind: EventKind; from: string | null; to: string; actor: Actor; actorId: string | null; note?: EventNote },
) {
  const note = e.note ?? null;
  ctx.db
    .insert(s.statusEvents)
    .values({
      id: randomUUID(),
      incidentId: e.incidentId,
      actorId: e.actorId,
      actorRole: actorRoleOf(e.actor),
      kind: e.kind,
      fromStatus: e.from,
      toStatus: e.to,
      note: typeof note === "string" ? note : null,
      noteKey: note && typeof note === "object" ? note.key : null,
      noteParams: JSON.stringify(note && typeof note === "object" ? note.params ?? {} : {}),
      createdAt: ctx.clock.iso(),
    })
    .run();
}

/** Writes a patch to the incident, keeps the in-memory row in sync, and marks it for broadcast. */
export function touch(ctx: Ctx, fx: Effects, inc: s.IncidentRow, patch: Partial<s.IncidentRow> = {}) {
  const full = { ...patch, updatedAt: ctx.clock.iso() };
  ctx.db.update(s.incidents).set(full).where(eq(s.incidents.id, inc.id)).run();
  Object.assign(inc, full);
  fx.updated.add(inc.id);
}

/** Guarded status change per diagram 03. */
export function transition(ctx: Ctx, fx: Effects, inc: s.IncidentRow, to: Status, actor: Actor, actorId: string | null, note: EventNote) {
  const from = inc.status;
  if (!canTransition(from, to, actor)) throw new HttpError(409, "invalid_transition", { from, to });
  const patch: Partial<s.IncidentRow> = { status: to };
  if (to === "resolved") patch.resolvedAt = ctx.clock.iso();
  if (from === "resolved" && to === "in_progress") Object.assign(patch, { resolvedAt: null, stillCount: 0 });
  touch(ctx, fx, inc, patch);
  logEvent(ctx, { incidentId: inc.id, kind: "status", from, to, actor, actorId, note });
}

/** Creates the referral and moves open → referred. At most one per incident. */
export function refer(ctx: Ctx, fx: Effects, inc: s.IncidentRow, authorityId: string, source: "auto" | "admin", actorId: string | null) {
  if (referralOf(ctx.db, inc.id)) return;
  ctx.db
    .insert(s.referrals)
    .values({ id: randomUUID(), incidentId: inc.id, authorityId, source, referredAt: ctx.clock.iso(), acknowledgedAt: null, resolvedAt: null, resolutionNote: null })
    .run();
  const note: SystemNote = { key: source === "admin" ? "referredAdmin" : inc.urgency === "critical" ? "referredCritical" : "referredAuto" };
  transition(ctx, fx, inc, "referred", source === "auto" ? "system" : "admin", actorId, note);
  if (inc.redirected) touch(ctx, fx, inc, { redirected: false, redirectNote: null });
  notifyMany(ctx, fx, staffOf(ctx, authorityId), {
    type: "referral",
    key: "referral",
    params: { categoryId: inc.categoryId, areaId: inc.areaId },
    incidentId: inc.id,
  });
  notifyStatus(ctx, fx, inc, "status_referred", { authorityId }, actorId);
}

/** Routes by category and area. No covering authority → admin "Redirected" tab (FR-6.1, §9). */
export function autoRoute(ctx: Ctx, fx: Effects, inc: s.IncidentRow) {
  if (inc.status !== "open" || referralOf(ctx.db, inc.id)) return;
  const cat = categoryOf(ctx.db, inc.categoryId);
  if (!cat?.authorityType) return; // community-only category
  const authorityId = routeReferral(
    cat.authorityType,
    inc.areaId,
    ctx.db.select().from(s.jurisdictions).where(eq(s.jurisdictions.areaId, inc.areaId)).all(),
    ctx.db.select({ id: s.authorities.id, type: s.authorities.type }).from(s.authorities).where(eq(s.authorities.type, cat.authorityType)).all(),
  );
  if (authorityId) refer(ctx, fx, inc, authorityId, "auto", null);
  else touch(ctx, fx, inc, { redirected: true, redirectNote: null });
}

/** Closes an SOS alert (found / cancelled / expired), hides the child's photo, tells everyone alerted. */
export function closeSos(
  ctx: Ctx,
  fx: Effects,
  sos: s.SosAlertRow,
  state: "found" | "cancelled" | "expired",
  actor: Actor,
  actorId: string | null,
  note: EventNote,
) {
  if (sos.state !== "active") throw new HttpError(409, "invalid_transition", { from: sos.state, to: state });
  ctx.db.update(s.sosAlerts).set({ state, closedAt: ctx.clock.iso() }).where(eq(s.sosAlerts.id, sos.id)).run();
  ctx.db.update(s.incidentMedia).set({ publicHidden: true }).where(eq(s.incidentMedia.incidentId, sos.incidentId)).run();
  const inc = ctx.db.select().from(s.incidents).where(eq(s.incidents.id, sos.incidentId)).get()!;
  touch(ctx, fx, inc);
  logEvent(ctx, { incidentId: inc.id, kind: "sos", from: sos.state, to: state, actor, actorId, note });

  const alerted = ctx.db
    .select({ userId: s.notifications.userId })
    .from(s.notifications)
    .where(and(eq(s.notifications.sosAlertId, sos.id), eq(s.notifications.type, "sos")))
    .all()
    .map((r) => r.userId);
  const recipients = new Set([...alerted, inc.reporterId]);
  if (actorId) recipients.delete(actorId);
  notifyMany(ctx, fx, recipients, {
    type: "sos_closed",
    key: `sos_${state}`,
    params: { name: sos.childName, areaId: inc.areaId },
    incidentId: inc.id,
    sosAlertId: sos.id,
  });
}
