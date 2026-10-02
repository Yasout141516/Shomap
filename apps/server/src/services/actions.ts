import { randomUUID } from "node:crypto";
import { and, eq, lte } from "drizzle-orm";
import type { AdminActionInput, ReferralActionInput } from "@shomap/shared";
import * as s from "../db/schema.js";
import { HttpError, badRequest, forbidden, notFound } from "../errors.js";
import type { Effects } from "../realtime.js";
import { write, type Ctx } from "./context.js";
import { notifyStatus } from "./notify.js";
import { autoRoute, closeSos, logEvent, refer, referralOf, touch, transition } from "./lifecycle.js";

const DEFAULT_OFFICIAL: Record<"acknowledge" | "start" | "resolve", string> = {
  acknowledge: "Received. Assigning an officer to the location.",
  start: "Our team is working on it.",
  resolve: "Resolved.",
};

function officialComment(ctx: Ctx, fx: Effects, incidentId: string, authorId: string, body: string) {
  const id = randomUUID();
  ctx.db
    .insert(s.comments)
    .values({ id, incidentId, authorId, parentId: null, kind: "official", body, isAnonymous: false, isHidden: false, lat: null, lng: null, createdAt: ctx.clock.iso() })
    .run();
  fx.comments.push({ incidentId, id });
}

/** PRD FR-6.5: acknowledge → in progress → resolved, or redirect back to moderators. */
export async function referralAction(ctx: Ctx, user: s.UserRow, referralId: string, input: ReferralActionInput) {
  if (user.role !== "authority") throw forbidden();
  return write(ctx, (fx) => {
    const ref = ctx.db.select().from(s.referrals).where(eq(s.referrals.id, referralId)).get();
    if (!ref) throw notFound();
    if (ref.authorityId !== user.authorityId) throw forbidden();
    const inc = ctx.db.select().from(s.incidents).where(eq(s.incidents.id, ref.incidentId)).get();
    if (!inc) throw notFound();
    const now = ctx.clock.iso();

    switch (input.action) {
      case "acknowledge": {
        const note = input.note || DEFAULT_OFFICIAL.acknowledge;
        transition(ctx, fx, inc, "acknowledged", "authority", user.id, note);
        ctx.db.update(s.referrals).set({ acknowledgedAt: now }).where(eq(s.referrals.id, ref.id)).run();
        officialComment(ctx, fx, inc.id, user.id, note);
        notifyStatus(ctx, fx, inc, "status_acknowledged", { authorityId: ref.authorityId }, user.id);
        break;
      }
      case "start": {
        const note = input.note || DEFAULT_OFFICIAL.start;
        transition(ctx, fx, inc, "in_progress", "authority", user.id, note);
        officialComment(ctx, fx, inc.id, user.id, note);
        notifyStatus(ctx, fx, inc, "status_in_progress", { authorityId: ref.authorityId }, user.id);
        break;
      }
      case "resolve": {
        const note = input.note!;
        transition(ctx, fx, inc, "resolved", "authority", user.id, note);
        ctx.db.update(s.referrals).set({ resolvedAt: now, resolutionNote: note }).where(eq(s.referrals.id, ref.id)).run();
        officialComment(ctx, fx, inc.id, user.id, note);
        notifyStatus(ctx, fx, inc, "status_resolved", { authorityId: ref.authorityId }, user.id);
        break;
      }
      case "redirect": {
        transition(ctx, fx, inc, "open", "authority", user.id, `Redirected: ${input.note}`);
        ctx.db.delete(s.referrals).where(eq(s.referrals.id, ref.id)).run();
        touch(ctx, fx, inc.id, { reviewReason: "redirected", reviewNote: input.note ?? null });
        break;
      }
    }
    return { status: inc.status };
  });
}

export async function adminIncidentAction(ctx: Ctx, user: s.UserRow, incidentId: string, input: AdminActionInput) {
  if (user.role !== "admin") throw forbidden();
  return write(ctx, (fx) => {
    const inc = ctx.db.select().from(s.incidents).where(eq(s.incidents.id, incidentId)).get();
    if (!inc) throw notFound();
    const sos = ctx.db.select().from(s.sosAlerts).where(eq(s.sosAlerts.incidentId, inc.id)).get();

    switch (input.action) {
      case "verify": {
        if (inc.verification !== "verified") {
          logEvent(ctx, inc.id, inc.verification, "verified", "admin", user.id, input.note ?? "Verified by moderators.");
          touch(ctx, fx, inc.id, { verification: "verified" });
          inc.verification = "verified";
        }
        autoRoute(ctx, fx, inc);
        break;
      }
      case "remove": {
        if (sos?.state === "active") closeSos(ctx, fx, sos, "cancelled", "admin", user.id, input.note ?? null);
        transition(ctx, fx, inc, "removed", "admin", user.id, input.note ?? null);
        touch(ctx, fx, inc.id, { reviewReason: null });
        ctx.db.update(s.abuseFlags).set({ state: "actioned" }).where(eq(s.abuseFlags.incidentId, inc.id)).run();
        notifyStatus(ctx, fx, inc, "status_removed", {}, user.id);
        break;
      }
      case "refer": {
        if (inc.status !== "open") throw new HttpError(409, "invalid_transition", { from: inc.status, to: "referred" });
        const auth = ctx.db.select().from(s.authorities).where(eq(s.authorities.id, input.authorityId!)).get();
        if (!auth) throw badRequest({ field: "authorityId" });
        const old = referralOf(ctx, inc.id);
        if (old) ctx.db.delete(s.referrals).where(eq(s.referrals.id, old.id)).run();
        refer(ctx, fx, inc, auth.id, "admin", "admin", user.id);
        touch(ctx, fx, inc.id, { reviewReason: inc.reviewReason === "sos_review" ? "sos_review" : null, reviewNote: null });
        break;
      }
      case "retract_sos": {
        if (!sos) throw badRequest({ field: "action" });
        closeSos(ctx, fx, sos, "cancelled", "admin", user.id, input.note ?? "Withdrawn by moderators.");
        break;
      }
      case "clear_review": {
        touch(ctx, fx, inc.id, { reviewReason: null, reviewNote: null });
        if (inc.reviewReason === "sos_review") logEvent(ctx, inc.id, null, "sos_approved", "admin", user.id, input.note ?? "Reviewed by moderators.");
        break;
      }
      case "dismiss_flags": {
        ctx.db.update(s.abuseFlags).set({ state: "dismissed" }).where(and(eq(s.abuseFlags.incidentId, inc.id), eq(s.abuseFlags.state, "open"))).run();
        touch(ctx, fx, inc.id);
        break;
      }
    }
    return { ok: true };
  });
}

export async function hideComment(ctx: Ctx, user: s.UserRow, commentId: string) {
  if (user.role !== "admin") throw forbidden();
  return write(ctx, (fx) => {
    const c = ctx.db.select().from(s.comments).where(eq(s.comments.id, commentId)).get();
    if (!c) throw notFound();
    ctx.db.update(s.comments).set({ isHidden: true }).where(eq(s.comments.id, c.id)).run();
    ctx.db.update(s.abuseFlags).set({ state: "actioned" }).where(and(eq(s.abuseFlags.targetType, "comment"), eq(s.abuseFlags.targetId, c.id))).run();
    touch(ctx, fx, c.incidentId);
    return { ok: true };
  });
}

/** PRD FR-8.5: the reporter or an admin marks Found or Cancel. */
export async function closeSosByUser(ctx: Ctx, user: s.UserRow, sosId: string, state: "found" | "cancelled") {
  return write(ctx, (fx) => {
    const sos = ctx.db.select().from(s.sosAlerts).where(eq(s.sosAlerts.id, sosId)).get();
    if (!sos) throw notFound();
    const inc = ctx.db.select().from(s.incidents).where(eq(s.incidents.id, sos.incidentId)).get()!;
    if (user.role !== "admin" && inc.reporterId !== user.id) throw forbidden();
    closeSos(ctx, fx, sos, state, user.role === "admin" ? "admin" : "citizen", user.id, state === "found" ? "Found safe." : "Cancelled by the reporter.");
    return { state };
  });
}

/** Runs every minute and after a demo fast-forward: auto-close, SOS expiry, stale unverified. */
export async function sweep(ctx: Ctx) {
  return write(ctx, (fx) => {
    const nowMs = ctx.clock.nowMs();
    const closeBefore = new Date(nowMs - ctx.cfg.autoCloseHours * 3_600_000).toISOString();
    let closed = 0;
    let expired = 0;
    let removed = 0;
    for (const inc of ctx.db
      .select()
      .from(s.incidents)
      .where(and(eq(s.incidents.status, "resolved"), lte(s.incidents.resolvedAt, closeBefore)))
      .all()) {
      transition(ctx, fx, inc, "closed", "system", null, "Closed after 72 hours with no objection.");
      notifyStatus(ctx, fx, inc, "status_closed", {}, null);
      closed++;
    }
    for (const sos of ctx.db
      .select()
      .from(s.sosAlerts)
      .where(and(eq(s.sosAlerts.state, "active"), lte(s.sosAlerts.expiresAt, new Date(nowMs).toISOString())))
      .all()) {
      closeSos(ctx, fx, sos, "expired", "system", null, "Alert expired after 72 hours.");
      expired++;
    }
    const staleBefore = new Date(nowMs - ctx.cfg.unverifiedExpiryDays * 24 * 3_600_000).toISOString();
    for (const inc of ctx.db
      .select()
      .from(s.incidents)
      .where(and(eq(s.incidents.status, "open"), eq(s.incidents.verification, "unverified"), lte(s.incidents.updatedAt, staleBefore)))
      .all()) {
      if (inc.reviewReason) continue;
      transition(ctx, fx, inc, "removed", "system", null, "Expired after 7 days without confirmation.");
      removed++;
    }
    return { closed, expired, removed };
  });
}
