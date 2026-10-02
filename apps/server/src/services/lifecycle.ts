import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Status } from "@shomap/shared";
import * as s from "../db/schema.js";
import { canTransition, type Actor } from "../domain/lifecycle.js";
import { routeReferral } from "../domain/referral.js";
import { HttpError } from "../errors.js";
import type { Effects } from "../realtime.js";
import type { Ctx } from "./context.js";
import { notifyMany, notifyStatus, staffOf } from "./notify.js";

const actorRoleOf = (a: Actor) => (a === "community" ? "system" : a);

/** Appends to the audit log (NFR-9). Also used for non-status entries such as "verified". */
export function logEvent(
  ctx: Ctx,
  incidentId: string,
  from: string | null,
  to: string,
  actor: Actor,
  actorId: string | null,
  note: string | null,
) {
  ctx.db
    .insert(s.statusEvents)
    .values({
      id: randomUUID(),
      incidentId,
      actorId,
      actorRole: actorRoleOf(actor),
      fromStatus: from,
      toStatus: to,
      note,
      createdAt: ctx.clock.iso(),
    })
    .run();
}

/** Guarded status change per diagram 03. Mutates `inc.status` so callers can chain. */
export function transition(
  ctx: Ctx,
  fx: Effects,
  inc: s.IncidentRow,
  to: Status,
  actor: Actor,
  actorId: string | null,
  note: string | null,
) {
  if (!canTransition(inc.status, to, actor)) {
    throw new HttpError(409, "invalid_transition", { from: inc.status, to });
  }
  const now = ctx.clock.iso();
  const patch: Partial<s.IncidentRow> = { status: to, updatedAt: now };
  if (to === "resolved") patch.resolvedAt = now;
  if (inc.status === "resolved" && to === "in_progress") {
    patch.resolvedAt = null;
    patch.stillCount = 0;
  }
  ctx.db.update(s.incidents).set(patch).where(eq(s.incidents.id, inc.id)).run();
  logEvent(ctx, inc.id, inc.status, to, actor, actorId, note);
  Object.assign(inc, patch);
  fx.updated.add(inc.id);
}

export function touch(ctx: Ctx, fx: Effects, incidentId: string, patch: Partial<s.IncidentRow> = {}) {
  ctx.db
    .update(s.incidents)
    .set({ ...patch, updatedAt: ctx.clock.iso() })
    .where(eq(s.incidents.id, incidentId))
    .run();
  fx.updated.add(incidentId);
}

export function referralOf(ctx: Ctx, incidentId: string) {
  return ctx.db.select().from(s.referrals).where(eq(s.referrals.incidentId, incidentId)).get() ?? null;
}

/** Creates the referral and moves open → referred. Unique per incident. */
export function refer(
  ctx: Ctx,
  fx: Effects,
  inc: s.IncidentRow,
  authorityId: string,
  source: "auto" | "admin",
  actor: "system" | "admin",
  actorId: string | null,
) {
  if (referralOf(ctx, inc.id)) return;
  const now = ctx.clock.iso();
  ctx.db
    .insert(s.referrals)
    .values({ id: randomUUID(), incidentId: inc.id, authorityId, source, referredAt: now, acknowledgedAt: null, resolvedAt: null, resolutionNote: null })
    .run();
  const note = source === "auto" ? (inc.urgency === "critical" ? "Critical report. Referred immediately." : "Verified by neighbours. Referred automatically.") : "Referred by ShoMap moderators.";
  transition(ctx, fx, inc, "referred", actor, actorId, note);
  if (inc.reviewReason === "redirected") touch(ctx, fx, inc.id, { reviewReason: null, reviewNote: null });
  notifyMany(ctx, fx, staffOf(ctx, authorityId), {
    type: "referral",
    key: "referral",
    params: { categoryId: inc.categoryId, areaId: inc.areaId },
    incidentId: inc.id,
  });
  notifyStatus(ctx, fx, inc, "status_referred", { authorityId }, actorId);
}

/** Routes by category and area. No match → admin "Redirected" tab (FR-6.1, §9). */
export function autoRoute(ctx: Ctx, fx: Effects, inc: s.IncidentRow) {
  if (inc.status !== "open" || referralOf(ctx, inc.id)) return;
  const cat = ctx.db.select().from(s.categories).where(eq(s.categories.id, inc.categoryId)).get();
  if (!cat?.authorityType) return; // community-only category
  const authorityId = routeReferral(
    cat.authorityType,
    inc.areaId,
    ctx.db.select().from(s.jurisdictions).all(),
    ctx.db.select({ id: s.authorities.id, type: s.authorities.type }).from(s.authorities).all(),
  );
  if (authorityId) refer(ctx, fx, inc, authorityId, "auto", "system", null);
  else if (inc.reviewReason !== "sos_review") touch(ctx, fx, inc.id, { reviewReason: "redirected", reviewNote: "No authority covers this area." });
}

/** Closes an SOS alert (found / cancelled / expired), hides the child's photo, tells everyone alerted. */
export function closeSos(
  ctx: Ctx,
  fx: Effects,
  sos: s.SosAlertRow,
  state: "found" | "cancelled" | "expired",
  actor: Actor,
  actorId: string | null,
  note: string | null,
) {
  if (sos.state !== "active") throw new HttpError(409, "invalid_transition", { from: sos.state, to: state });
  const now = ctx.clock.iso();
  ctx.db.update(s.sosAlerts).set({ state, closedAt: now }).where(eq(s.sosAlerts.id, sos.id)).run();
  ctx.db.update(s.incidentMedia).set({ publicHidden: true }).where(eq(s.incidentMedia.incidentId, sos.incidentId)).run();
  const inc = ctx.db.select().from(s.incidents).where(eq(s.incidents.id, sos.incidentId)).get()!;
  touch(ctx, fx, inc.id, inc.reviewReason === "sos_review" ? { reviewReason: null } : {});
  logEvent(ctx, inc.id, null, `sos_${state}`, actor, actorId, note);

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
  fx.sosClosed.push({ incidentId: inc.id, sosId: sos.id, state });
}
