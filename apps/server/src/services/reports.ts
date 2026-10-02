import { randomUUID } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import {
  URGENCIES,
  type CommentInput,
  type FlagInput,
  type ReportInput,
  type Urgency,
  type VoteInput,
} from "@shomap/shared";
import * as s from "../db/schema.js";
import { inBounds, nearestArea } from "../domain/geo.js";
import { evaluateVerification } from "../domain/verification.js";
import { sosRecipients } from "../domain/sos.js";
import { zonesMatching } from "../domain/watchZones.js";
import { withinRateLimit } from "../domain/rateLimit.js";
import { HttpError, badRequest, notFound } from "../errors.js";
import type { Effects } from "../realtime.js";
import { write, type Ctx } from "./context.js";
import { adminIds, notify, notifyMany, staffOf } from "./notify.js";
import { autoRoute, logEvent, referralOf, touch, transition } from "./lifecycle.js";

export function getCategory(ctx: Ctx, id: string) {
  return ctx.db.select().from(s.categories).where(eq(s.categories.id, id)).get();
}

/**
 * Checks that don't need the photos, so a rejected report never writes files.
 * Throws the same errors createIncident would.
 */
export function precheckReport(ctx: Ctx, user: s.UserRow, input: ReportInput, photoCount: number) {
  const cat = getCategory(ctx, input.categoryId);
  if (!cat) throw badRequest({ field: "categoryId" });
  if (cat.isBlocked) throw new HttpError(422, "blocked_category", { hotline: cat.redirectHotline });
  if (cat.triggersSos) {
    if (!input.sos) throw badRequest({ field: "sos" });
    if (input.isAnonymous) throw new HttpError(422, "sos_not_anonymous");
    if (photoCount === 0) throw badRequest({ field: "photos" });
  }
  if (!inBounds(input, ctx.cfg.dhakaBounds)) throw new HttpError(422, "out_of_area");
  return cat;
}

function clampUrgency(requested: Urgency | undefined, def: Urgency): Urgency {
  const d = URGENCIES.indexOf(def);
  const r = requested ? URGENCIES.indexOf(requested) : d;
  const clamped = Math.max(d - 1, Math.min(d + 1, r));
  return URGENCIES[Math.min(clamped, 2)]; // only SOS (and admins) reach critical
}

export interface CreateResult {
  id: string;
  duplicate: boolean;
  /** How many neighbours were asked to verify (for the post-submit screen, PRD §12.4). */
  neighboursAsked: number;
}

export async function createIncident(
  ctx: Ctx,
  user: s.UserRow,
  input: ReportInput,
  photoUrls: string[],
): Promise<CreateResult> {
  return write(ctx, (fx) => {
    const existing = ctx.db.select().from(s.incidents).where(eq(s.incidents.idempotencyKey, input.idempotencyKey)).get();
    if (existing && existing.reporterId === user.id) return { id: existing.id, duplicate: true, neighboursAsked: 0 };

    const cat = precheckReport(ctx, user, input, photoUrls.length);
    const nowMs = ctx.clock.nowMs();
    const recent = ctx.db
      .select({ createdAt: s.incidents.createdAt })
      .from(s.incidents)
      .where(and(eq(s.incidents.reporterId, user.id), gt(s.incidents.createdAt, new Date(nowMs - 3_600_000).toISOString())))
      .all()
      .map((r) => Date.parse(r.createdAt));
    if (!withinRateLimit(recent, nowMs, ctx.cfg.reportsPerHour, 3_600_000)) {
      const oldest = Math.min(...recent);
      throw new HttpError(429, "rate_limited", { retryAfterMin: Math.max(1, Math.ceil((oldest + 3_600_000 - nowMs) / 60_000)) });
    }

    const areas = ctx.db.select().from(s.areas).all();
    const area = nearestArea(input, areas);
    const now = ctx.clock.iso();
    const id = randomUUID();
    const urgency: Urgency = cat.triggersSos ? "critical" : clampUrgency(input.urgency, cat.defaultUrgency);

    const inc: s.IncidentRow = {
      id,
      reporterId: user.id,
      categoryId: cat.id,
      areaId: area.id,
      description: input.description,
      urgency,
      status: "open",
      verification: "unverified",
      isAnonymous: cat.triggersSos ? false : input.isAnonymous,
      lat: input.lat,
      lng: input.lng,
      addressText: input.addressText ?? null,
      confirmCount: 0,
      disputeCount: 0,
      stillCount: 0,
      reviewReason: cat.triggersSos ? "sos_review" : null,
      reviewNote: null,
      idempotencyKey: input.idempotencyKey,
      occurredAt: input.occurredAt ?? now,
      createdAt: now,
      updatedAt: now,
      resolvedAt: null,
    };
    ctx.db.insert(s.incidents).values(inc).run();
    if (photoUrls.length) {
      ctx.db
        .insert(s.incidentMedia)
        .values(photoUrls.map((url) => ({ id: randomUUID(), incidentId: id, url, publicHidden: false, createdAt: now })))
        .run();
    }
    logEvent(ctx, id, null, "open", "citizen", user.id, null);
    fx.created.add(id);

    const users = ctx.db.select().from(s.users).all();
    const centroid = new Map(areas.map((a) => [a.id, a]));
    const zones = ctx.db.select().from(s.watchZones).all();
    const alerted = new Set<string>();

    if (cat.triggersSos && input.sos) {
      const sos: s.SosAlertRow = {
        id: randomUUID(),
        incidentId: id,
        lat: input.lat,
        lng: input.lng,
        radiusM: ctx.cfg.sosRadiusM,
        state: "active",
        childName: input.sos.childName,
        childAge: input.sos.childAge,
        clothing: input.sos.clothing,
        lastSeenAt: input.sos.lastSeenAt,
        issuedAt: now,
        expiresAt: new Date(nowMs + ctx.cfg.sosTtlHours * 3_600_000).toISOString(),
        closedAt: null,
      };
      ctx.db.insert(s.sosAlerts).values(sos).run();
      autoRoute(ctx, fx, inc); // FR-6.2: critical → referred immediately
      const recipients = sosRecipients(
        sos,
        users.filter((u) => u.role === "citizen").map((u) => ({ id: u.id, home: u.homeAreaId ? centroid.get(u.homeAreaId) ?? null : null })),
        zones,
        user.id,
      );
      notifyMany(ctx, fx, recipients, {
        type: "sos",
        key: "sos",
        params: { name: sos.childName, age: sos.childAge, areaId: area.id },
        incidentId: id,
        sosAlertId: sos.id,
      });
      recipients.forEach((r) => alerted.add(r));
      notifyMany(ctx, fx, adminIds(ctx), {
        type: "sos",
        key: "sos_review",
        params: { name: sos.childName, areaId: area.id },
        incidentId: id,
        sosAlertId: sos.id,
      });
      fx.sosIssued.push(id);
    }

    const watchers = zonesMatching(inc, urgency, zones).filter((z) => z.userId !== user.id && !alerted.has(z.userId));
    for (const z of watchers) {
      if (alerted.has(z.userId)) continue;
      alerted.add(z.userId);
      notify(ctx, fx, {
        userId: z.userId,
        type: "watch_zone",
        key: "watch_zone",
        params: { categoryId: cat.id, zone: z.label, areaId: area.id },
        incidentId: id,
      });
    }

    const neighboursAsked = users.filter((u) => u.role === "citizen" && u.id !== user.id && u.homeAreaId === area.id).length + watchers.length;
    return { id, duplicate: false, neighboursAsked };
  });
}

function loadOpenIncident(ctx: Ctx, id: string) {
  const inc = ctx.db.select().from(s.incidents).where(eq(s.incidents.id, id)).get();
  if (!inc || inc.status === "removed") throw notFound();
  return inc;
}

export async function vote(ctx: Ctx, user: s.UserRow, incidentId: string, input: VoteInput) {
  if (user.role !== "citizen") throw new HttpError(403, "forbidden");
  return write(ctx, (fx) => {
    const inc = loadOpenIncident(ctx, incidentId);
    if (inc.reporterId === user.id) throw new HttpError(409, "self_vote");
    const dup = ctx.db
      .select({ id: s.verifications.id })
      .from(s.verifications)
      .where(and(eq(s.verifications.incidentId, inc.id), eq(s.verifications.userId, user.id)))
      .get();
    if (dup) throw new HttpError(409, "duplicate_vote");

    ctx.db
      .insert(s.verifications)
      .values({ id: randomUUID(), incidentId: inc.id, userId: user.id, vote: input.vote, note: input.note ?? null, createdAt: ctx.clock.iso() })
      .run();
    const confirms = inc.confirmCount + (input.vote === "confirm" ? 1 : 0);
    const disputes = inc.disputeCount + (input.vote === "dispute" ? 1 : 0);
    const next = evaluateVerification({ confirms, disputes, current: inc.verification }, ctx.cfg);
    touch(ctx, fx, inc.id, { confirmCount: confirms, disputeCount: disputes, verification: next });
    Object.assign(inc, { confirmCount: confirms, disputeCount: disputes });

    if (next !== inc.verification) {
      logEvent(ctx, inc.id, inc.verification, next, "community", null, next === "verified" ? `Confirmed by ${confirms} neighbours.` : `Disputed by ${disputes} neighbours.`);
      inc.verification = next;
      if (next === "verified") {
        notify(ctx, fx, { userId: inc.reporterId, type: "status_change", key: "status_verified", params: { count: confirms, categoryId: inc.categoryId, areaId: inc.areaId }, incidentId: inc.id });
        autoRoute(ctx, fx, inc);
      }
    }
    return { verification: next };
  });
}

export async function stillHappening(ctx: Ctx, user: s.UserRow, incidentId: string) {
  if (user.role !== "citizen") throw new HttpError(403, "forbidden");
  return write(ctx, (fx) => {
    const inc = loadOpenIncident(ctx, incidentId);
    if (inc.status !== "resolved") throw new HttpError(409, "invalid_transition", { from: inc.status, to: "in_progress" });
    const dup = ctx.db
      .select()
      .from(s.stillHappening)
      .where(and(eq(s.stillHappening.incidentId, inc.id), eq(s.stillHappening.userId, user.id)))
      .get();
    if (dup) throw new HttpError(409, "duplicate_vote");
    ctx.db.insert(s.stillHappening).values({ incidentId: inc.id, userId: user.id, createdAt: ctx.clock.iso() }).run();
    const n = inc.stillCount + 1;
    if (n >= ctx.cfg.reopenThreshold) {
      transition(ctx, fx, inc, "in_progress", "community", null, `Reopened: ${n} neighbours say it is still happening.`);
      ctx.db.delete(s.stillHappening).where(eq(s.stillHappening.incidentId, inc.id)).run();
      const ref = referralOf(ctx, inc.id);
      if (ref) {
        ctx.db.update(s.referrals).set({ resolvedAt: null }).where(eq(s.referrals.id, ref.id)).run();
        notifyMany(ctx, fx, staffOf(ctx, ref.authorityId), { type: "referral", key: "reopened_authority", params: { categoryId: inc.categoryId, areaId: inc.areaId, count: n }, incidentId: inc.id });
      }
      notify(ctx, fx, { userId: inc.reporterId, type: "status_change", key: "status_reopened", params: { count: n, categoryId: inc.categoryId, areaId: inc.areaId }, incidentId: inc.id });
      return { reopened: true, count: n };
    }
    touch(ctx, fx, inc.id, { stillCount: n });
    return { reopened: false, count: n };
  });
}

export async function addComment(ctx: Ctx, user: s.UserRow, incidentId: string, input: CommentInput) {
  return write(ctx, (fx) => {
    const inc = loadOpenIncident(ctx, incidentId);
    const ref = referralOf(ctx, inc.id);
    let kind: s.CommentRow["kind"] = input.kind;
    let isAnonymous = input.isAnonymous;
    if (user.role === "authority") {
      if (!ref || ref.authorityId !== user.authorityId) throw new HttpError(403, "forbidden");
      kind = "official";
      isAnonymous = false;
    } else if (user.role === "admin") {
      kind = "official";
      isAnonymous = false;
    } else if (kind === "sighting") {
      const sos = ctx.db.select().from(s.sosAlerts).where(eq(s.sosAlerts.incidentId, inc.id)).get();
      if (!sos) throw badRequest({ field: "kind" });
    }

    let parentId: string | null = null;
    let parentAuthor: string | null = null;
    if (input.parentId) {
      const parent = ctx.db.select().from(s.comments).where(eq(s.comments.id, input.parentId)).get();
      if (!parent || parent.incidentId !== inc.id) throw badRequest({ field: "parentId" });
      parentId = parent.parentId ?? parent.id; // one level of replies (FR-5.3)
      parentAuthor = parent.authorId;
    }

    const id = randomUUID();
    ctx.db
      .insert(s.comments)
      .values({
        id,
        incidentId: inc.id,
        authorId: user.id,
        parentId,
        kind,
        body: input.body,
        isAnonymous,
        isHidden: false,
        lat: input.lat ?? null,
        lng: input.lng ?? null,
        createdAt: ctx.clock.iso(),
      })
      .run();
    fx.comments.push({ incidentId: inc.id, id });
    touch(ctx, fx, inc.id);

    const sosRow = kind === "sighting" ? ctx.db.select().from(s.sosAlerts).where(eq(s.sosAlerts.incidentId, inc.id)).get() : undefined;
    if (inc.reporterId !== user.id && kind !== "official") {
      notify(ctx, fx, {
        userId: inc.reporterId,
        type: kind === "sighting" ? "sighting" : "reply",
        key: kind === "sighting" ? "sighting" : "reply",
        params: { name: sosRow?.childName ?? "", categoryId: inc.categoryId, areaId: inc.areaId },
        incidentId: inc.id,
      });
    }
    if (parentAuthor && parentAuthor !== user.id && parentAuthor !== inc.reporterId) {
      notify(ctx, fx, { userId: parentAuthor, type: "reply", key: "reply_comment", params: { categoryId: inc.categoryId, areaId: inc.areaId }, incidentId: inc.id });
    }
    return { id };
  });
}

export async function flag(ctx: Ctx, user: s.UserRow, input: FlagInput) {
  return write(ctx, (fx) => {
    let incidentId: string;
    if (input.targetType === "incident") {
      incidentId = loadOpenIncident(ctx, input.targetId).id;
    } else {
      const c = ctx.db.select().from(s.comments).where(eq(s.comments.id, input.targetId)).get();
      if (!c) throw notFound();
      incidentId = c.incidentId;
    }
    ctx.db
      .insert(s.abuseFlags)
      .values({ id: randomUUID(), targetType: input.targetType, targetId: input.targetId, incidentId, flaggedBy: user.id, reason: input.reason, state: "open", createdAt: ctx.clock.iso() })
      .onConflictDoNothing()
      .run();
    fx.updated.add(incidentId);
    return { ok: true };
  });
}

export type { Effects };
