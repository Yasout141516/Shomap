import { and, eq, lte } from "drizzle-orm";
import { HOUR_MS, DAY_MS, type AdminActionInput, type ReferralActionInput, type Status } from "@shomap/shared";
import * as s from "../db/schema.js";
import { HttpError, badRequest, forbidden, notFound } from "../errors.js";
import { write, type Ctx } from "./context.js";
import { notifyStatus } from "./notify.js";
import { autoRoute, closeSos, logEvent, refer, touch, transition } from "./lifecycle.js";
import { getIncidentRow, referralOf, sosOf } from "./repo.js";
import { insertComment } from "./reports.js";

/** Default text of an authority's official update when they don't write one. Also used by the seed. */
export const OFFICIAL_DEFAULT = {
  acknowledge: "Received. Assigning an officer to the location.",
  start: "Our team is working on it.",
} as const;

/** PRD FR-6.5: each forward step = transition + referral timestamps + official update + notification. */
const STEPS: Record<"acknowledge" | "start" | "resolve", { to: Status; stamp?: "acknowledgedAt" | "resolvedAt" }> = {
  acknowledge: { to: "acknowledged", stamp: "acknowledgedAt" },
  start: { to: "in_progress" },
  resolve: { to: "resolved", stamp: "resolvedAt" },
};

export async function referralAction(ctx: Ctx, user: s.UserRow, referralId: string, input: ReferralActionInput) {
  if (user.role !== "authority") throw forbidden();
  return write(ctx, (fx) => {
    const ref = ctx.db.select().from(s.referrals).where(eq(s.referrals.id, referralId)).get();
    if (!ref) throw notFound();
    if (ref.authorityId !== user.authorityId) throw forbidden();
    const inc = getIncidentRow(ctx.db, ref.incidentId);
    if (!inc) throw notFound();

    if (input.action === "redirect") {
      transition(ctx, fx, inc, "open", "authority", user.id, input.note ?? null);
      ctx.db.delete(s.referrals).where(eq(s.referrals.id, ref.id)).run();
      touch(ctx, fx, inc, { redirected: true, redirectNote: input.note ?? null });
      return { incidentId: inc.id, status: inc.status };
    }

    const step = STEPS[input.action];
    const note = input.note || (input.action === "resolve" ? "" : OFFICIAL_DEFAULT[input.action]);
    transition(ctx, fx, inc, step.to, "authority", user.id, note);
    const now = ctx.clock.iso();
    if (step.stamp) {
      const patch = step.stamp === "resolvedAt" ? { resolvedAt: now, resolutionNote: note } : { acknowledgedAt: now };
      ctx.db.update(s.referrals).set(patch).where(eq(s.referrals.id, ref.id)).run();
    }
    insertComment(ctx, fx, { incidentId: inc.id, authorId: user.id, kind: "official", body: note });
    notifyStatus(ctx, fx, inc, `status_${step.to}`, { authorityId: ref.authorityId }, user.id);
    return { incidentId: inc.id, status: inc.status };
  });
}

export async function adminIncidentAction(ctx: Ctx, user: s.UserRow, incidentId: string, input: AdminActionInput) {
  if (user.role !== "admin") throw forbidden();
  return write(ctx, (fx) => {
    const inc = getIncidentRow(ctx.db, incidentId);
    if (!inc) throw notFound();
    const sos = sosOf(ctx.db, inc.id);

    switch (input.action) {
      case "verify": {
        if (inc.verification !== "verified") {
          logEvent(ctx, { incidentId: inc.id, kind: "verification", from: inc.verification, to: "verified", actor: "admin", actorId: user.id, note: input.note ?? { key: "verifiedByModerators" } });
          touch(ctx, fx, inc, { verification: "verified" });
        }
        autoRoute(ctx, fx, inc);
        break;
      }
      case "remove": {
        if (sos?.state === "active") closeSos(ctx, fx, sos, "cancelled", "admin", user.id, input.note ?? null);
        transition(ctx, fx, inc, "removed", "admin", user.id, input.note ?? null);
        touch(ctx, fx, inc, { redirected: false });
        ctx.db.update(s.abuseFlags).set({ state: "actioned" }).where(eq(s.abuseFlags.incidentId, inc.id)).run();
        notifyStatus(ctx, fx, inc, "status_removed", {}, user.id);
        break;
      }
      case "refer": {
        if (inc.status !== "open") throw new HttpError(409, "invalid_transition", { from: inc.status, to: "referred" });
        const auth = ctx.db.select().from(s.authorities).where(eq(s.authorities.id, input.authorityId!)).get();
        if (!auth) throw badRequest({ field: "authorityId" });
        const old = referralOf(ctx.db, inc.id);
        if (old) ctx.db.delete(s.referrals).where(eq(s.referrals.id, old.id)).run();
        refer(ctx, fx, inc, auth.id, "admin", user.id);
        break;
      }
      case "retract_sos": {
        if (!sos) throw badRequest({ field: "action" });
        closeSos(ctx, fx, sos, "cancelled", "admin", user.id, input.note ?? { key: "sosWithdrawn" });
        break;
      }
      case "clear_review": {
        if (sos && !sos.reviewedAt) {
          ctx.db.update(s.sosAlerts).set({ reviewedAt: ctx.clock.iso() }).where(eq(s.sosAlerts.id, sos.id)).run();
          logEvent(ctx, { incidentId: inc.id, kind: "sos", from: null, to: "reviewed", actor: "admin", actorId: user.id, note: input.note ?? { key: "sosReviewed" } });
        }
        touch(ctx, fx, inc);
        break;
      }
      case "dismiss_flags": {
        ctx.db.update(s.abuseFlags).set({ state: "dismissed" }).where(and(eq(s.abuseFlags.incidentId, inc.id), eq(s.abuseFlags.state, "open"))).run();
        touch(ctx, fx, inc);
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
    const inc = getIncidentRow(ctx.db, c.incidentId);
    if (inc) touch(ctx, fx, inc);
    return { ok: true };
  });
}

/** PRD FR-8.5: the reporter or an admin marks Found or Cancel. */
export async function closeSosByUser(ctx: Ctx, user: s.UserRow, sosId: string, state: "found" | "cancelled") {
  return write(ctx, (fx) => {
    const sos = ctx.db.select().from(s.sosAlerts).where(eq(s.sosAlerts.id, sosId)).get();
    if (!sos) throw notFound();
    const inc = getIncidentRow(ctx.db, sos.incidentId)!;
    if (user.role !== "admin" && inc.reporterId !== user.id) throw forbidden();
    closeSos(ctx, fx, sos, state, user.role === "admin" ? "admin" : "citizen", user.id, { key: state === "found" ? "sosFound" : "sosCancelled" });
    return { state };
  });
}

/** Runs every minute and after a demo fast-forward: auto-close, SOS expiry, stale unverified. */
export async function sweep(ctx: Ctx) {
  return write(ctx, (fx) => {
    const nowMs = ctx.clock.nowMs();
    const { autoCloseHours, sosTtlHours, unverifiedExpiryDays } = ctx.cfg;
    const resolvedBefore = new Date(nowMs - autoCloseHours * HOUR_MS).toISOString();
    const closed = ctx.db.select().from(s.incidents).where(and(eq(s.incidents.status, "resolved"), lte(s.incidents.resolvedAt, resolvedBefore))).all();
    for (const inc of closed) {
      transition(ctx, fx, inc, "closed", "system", null, { key: "autoClosed", params: { hours: autoCloseHours } });
      notifyStatus(ctx, fx, inc, "status_closed", {}, null);
    }
    const expired = ctx.db.select().from(s.sosAlerts).where(and(eq(s.sosAlerts.state, "active"), lte(s.sosAlerts.expiresAt, new Date(nowMs).toISOString()))).all();
    for (const sos of expired) closeSos(ctx, fx, sos, "expired", "system", null, { key: "sosExpired", params: { hours: sosTtlHours } });
    const staleBefore = new Date(nowMs - unverifiedExpiryDays * DAY_MS).toISOString();
    const stale = ctx.db
      .select()
      .from(s.incidents)
      .where(and(eq(s.incidents.status, "open"), eq(s.incidents.verification, "unverified"), eq(s.incidents.redirected, false), lte(s.incidents.updatedAt, staleBefore)))
      .all();
    for (const inc of stale) transition(ctx, fx, inc, "removed", "system", null, { key: "unverifiedExpired", params: { days: unverifiedExpiryDays } });
    return { closed: closed.length, expired: expired.length, removed: stale.length };
  });
}
