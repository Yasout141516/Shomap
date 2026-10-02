import { randomUUID } from "node:crypto";
import { and, count, eq, gt, ne } from "drizzle-orm";
import {
  HOUR_MS,
  clampUrgency,
  inBounds,
  nearestArea,
  type CommentInput,
  type FlagInput,
  type ReportInput,
  type Urgency,
  type VoteInput,
} from "@shomap/shared";
import * as s from "../db/schema.js";
import { evaluateVerification } from "../domain/verification.js";
import { sosRecipients } from "../domain/sos.js";
import { zonesMatching } from "../domain/watchZones.js";
import { withinRateLimit } from "../domain/rateLimit.js";
import { HttpError, badRequest, forbidden, notFound } from "../errors.js";
import type { Effects } from "../realtime.js";
import { write, type Ctx } from "./context.js";
import { adminIds, notify, notifyMany, staffOf } from "./notify.js";
import { autoRoute, logEvent, touch, transition } from "./lifecycle.js";
import { categoryOf, getIncidentRow, referralOf, sosOf } from "./repo.js";
import { deletePhotos, savePhoto } from "./uploads.js";

export interface SubmitResult {
  id: string;
  duplicate: boolean;
  /** How many neighbours were asked to verify (for the post-submit screen, PRD §12.4). */
  neighboursAsked: number;
}

function requireCitizen(user: s.UserRow) {
  if (user.role !== "citizen") throw forbidden();
}

/** Every check that doesn't need the photos, so a rejected report never writes files. */
function precheck(ctx: Ctx, user: s.UserRow, input: ReportInput, photoCount: number): s.CategoryRow {
  const cat = categoryOf(ctx.db, input.categoryId);
  if (!cat) throw badRequest({ field: "categoryId" });
  if (cat.isBlocked) throw new HttpError(422, "blocked_category", { hotline: cat.redirectHotline });
  if (cat.triggersSos) {
    if (!input.sos) throw badRequest({ field: "sos" });
    if (input.isAnonymous) throw new HttpError(422, "sos_not_anonymous");
    if (photoCount === 0) throw badRequest({ field: "photos" });
  }
  if (!inBounds(input, ctx.cfg.dhakaBounds)) throw new HttpError(422, "out_of_area");

  const nowMs = ctx.clock.nowMs();
  const recent = ctx.db
    .select({ createdAt: s.incidents.createdAt })
    .from(s.incidents)
    .where(and(eq(s.incidents.reporterId, user.id), gt(s.incidents.createdAt, new Date(nowMs - HOUR_MS).toISOString())))
    .all()
    .map((r) => Date.parse(r.createdAt));
  if (!withinRateLimit(recent, nowMs, ctx.cfg.reportsPerHour, HOUR_MS)) {
    const retryAfterMin = Math.max(1, Math.ceil((Math.min(...recent) + HOUR_MS - nowMs) / 60_000));
    throw new HttpError(429, "rate_limited", { retryAfterMin });
  }
  return cat;
}

/**
 * The one entry point for a new report (FR-2): checks, then photos (EXIF stripped, in parallel),
 * then a single transaction. Photos are removed again if anything after them fails.
 */
export async function submitReport(ctx: Ctx, user: s.UserRow, input: ReportInput, photos: Buffer[], uploadsDir: string): Promise<SubmitResult> {
  requireCitizen(user);
  const existing = ctx.db.select().from(s.incidents).where(eq(s.incidents.idempotencyKey, input.idempotencyKey)).get();
  if (existing) {
    if (existing.reporterId !== user.id) throw badRequest({ field: "idempotencyKey" });
    return { id: existing.id, duplicate: true, neighboursAsked: 0 };
  }

  const cat = precheck(ctx, user, input, photos.length);
  const urls = await Promise.all(photos.map((p) => savePhoto(uploadsDir, p)));
  let result: SubmitResult;
  try {
    result = await write(ctx, (fx) => insertIncident(ctx, fx, user, cat, input, urls));
  } catch (err) {
    await deletePhotos(uploadsDir, urls);
    throw err;
  }
  // A retry that raced the first request (both were encoding photos) loses here, cleanly.
  if (result.duplicate) await deletePhotos(uploadsDir, urls);
  return result;
}

function insertIncident(ctx: Ctx, fx: Effects, user: s.UserRow, cat: s.CategoryRow, input: ReportInput, photoUrls: string[]): SubmitResult {
  // Checked again inside the transaction: the first check ran before the (async) photo work.
  const existing = ctx.db.select().from(s.incidents).where(eq(s.incidents.idempotencyKey, input.idempotencyKey)).get();
  if (existing) {
    if (existing.reporterId !== user.id) throw badRequest({ field: "idempotencyKey" });
    return { id: existing.id, duplicate: true, neighboursAsked: 0 };
  }
  const areas = ctx.db.select().from(s.areas).all();
  const area = nearestArea(input, areas);
  const now = ctx.clock.iso();
  const urgency: Urgency = cat.triggersSos ? "critical" : clampUrgency(input.urgency, cat.defaultUrgency);
  const inc: s.IncidentRow = {
    id: randomUUID(),
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
    redirected: false,
    redirectNote: null,
    idempotencyKey: input.idempotencyKey,
    occurredAt: input.occurredAt ?? now,
    createdAt: now,
    updatedAt: now,
    resolvedAt: null,
  };
  ctx.db.insert(s.incidents).values(inc).run();
  if (photoUrls.length) {
    ctx.db.insert(s.incidentMedia).values(photoUrls.map((url) => ({ id: randomUUID(), incidentId: inc.id, url, publicHidden: false, createdAt: now }))).run();
  }
  logEvent(ctx, { incidentId: inc.id, kind: "status", from: null, to: "open", actor: "citizen", actorId: user.id });
  fx.created.add(inc.id);

  const zones = ctx.db.select().from(s.watchZones).all();
  const alerted = new Set<string>();

  if (cat.triggersSos && input.sos) {
    const sos: s.SosAlertRow = {
      id: randomUUID(),
      incidentId: inc.id,
      lat: input.lat,
      lng: input.lng,
      radiusM: ctx.cfg.sosRadiusM,
      state: "active",
      childName: input.sos.childName,
      childAge: input.sos.childAge,
      clothing: input.sos.clothing,
      lastSeenAt: input.sos.lastSeenAt,
      issuedAt: now,
      expiresAt: new Date(ctx.clock.nowMs() + ctx.cfg.sosTtlHours * HOUR_MS).toISOString(),
      closedAt: null,
      reviewedAt: null, // FR-8.6: goes out now, moderators review after
    };
    ctx.db.insert(s.sosAlerts).values(sos).run();
    autoRoute(ctx, fx, inc); // FR-6.2: critical → referred immediately
    const centroid = new Map(areas.map((a) => [a.id, a]));
    const citizens = ctx.db
      .select({ id: s.users.id, homeAreaId: s.users.homeAreaId })
      .from(s.users)
      .where(eq(s.users.role, "citizen"))
      .all()
      .map((u) => ({ id: u.id, home: u.homeAreaId ? centroid.get(u.homeAreaId) ?? null : null }));
    const recipients = sosRecipients(sos, citizens, zones, user.id);
    notifyMany(ctx, fx, recipients, {
      type: "sos",
      key: "sos",
      params: { name: sos.childName, age: sos.childAge, areaId: area.id },
      incidentId: inc.id,
      sosAlertId: sos.id,
    });
    recipients.forEach((r) => alerted.add(r));
    notifyMany(ctx, fx, adminIds(ctx), { type: "sos", key: "sos_review", params: { name: sos.childName, areaId: area.id }, incidentId: inc.id, sosAlertId: sos.id });
  }

  // One watch-zone notification per person, even with several matching zones.
  const watchers = new Map<string, s.WatchZoneRow>();
  for (const z of zonesMatching(inc, urgency, zones)) {
    if (z.userId !== user.id && !alerted.has(z.userId) && !watchers.has(z.userId)) watchers.set(z.userId, z);
  }
  for (const z of watchers.values()) {
    notify(ctx, fx, { userId: z.userId, type: "watch_zone", key: "watch_zone", params: { categoryId: cat.id, zone: z.label, areaId: area.id }, incidentId: inc.id });
  }

  const [{ n: neighbours }] = ctx.db
    .select({ n: count() })
    .from(s.users)
    .where(and(eq(s.users.role, "citizen"), eq(s.users.homeAreaId, area.id), ne(s.users.id, user.id)))
    .all();
  return { id: inc.id, duplicate: false, neighboursAsked: neighbours + watchers.size };
}

function openIncident(ctx: Ctx, id: string) {
  const inc = getIncidentRow(ctx.db, id);
  if (!inc || inc.status === "removed") throw notFound();
  return inc;
}

export async function vote(ctx: Ctx, user: s.UserRow, incidentId: string, input: VoteInput) {
  requireCitizen(user);
  return write(ctx, (fx) => {
    const inc = openIncident(ctx, incidentId);
    if (inc.reporterId === user.id) throw new HttpError(409, "self_vote");
    const dup = ctx.db
      .select({ id: s.verifications.id })
      .from(s.verifications)
      .where(and(eq(s.verifications.incidentId, inc.id), eq(s.verifications.userId, user.id)))
      .get();
    if (dup) throw new HttpError(409, "duplicate_vote");

    ctx.db.insert(s.verifications).values({ id: randomUUID(), incidentId: inc.id, userId: user.id, vote: input.vote, note: input.note ?? null, createdAt: ctx.clock.iso() }).run();
    const confirms = inc.confirmCount + (input.vote === "confirm" ? 1 : 0);
    const disputes = inc.disputeCount + (input.vote === "dispute" ? 1 : 0);
    const before = inc.verification;
    const next = evaluateVerification({ confirms, disputes, current: before }, ctx.cfg);
    touch(ctx, fx, inc, { confirmCount: confirms, disputeCount: disputes, verification: next });

    if (next !== before) {
      const note =
        next === "verified"
          ? { key: "confirmedBy", params: { count: confirms } }
          : next === "disputed"
            ? { key: "disputedBy", params: { count: disputes } }
            : { key: "disputeCleared", params: { count: confirms } };
      logEvent(ctx, { incidentId: inc.id, kind: "verification", from: before, to: next, actor: "community", actorId: null, note });
      if (next === "verified") {
        notify(ctx, fx, { userId: inc.reporterId, type: "status_change", key: "status_verified", params: { count: confirms, categoryId: inc.categoryId, areaId: inc.areaId }, incidentId: inc.id });
        autoRoute(ctx, fx, inc);
      }
    }
    return { verification: next };
  });
}

/** FR-6.7: enough "still happening" votes reopen a resolved incident. */
export async function stillHappening(ctx: Ctx, user: s.UserRow, incidentId: string) {
  requireCitizen(user);
  return write(ctx, (fx) => {
    const inc = openIncident(ctx, incidentId);
    if (inc.status !== "resolved") throw new HttpError(409, "invalid_transition", { from: inc.status, to: "in_progress" });
    const dup = ctx.db
      .select()
      .from(s.stillHappening)
      .where(and(eq(s.stillHappening.incidentId, inc.id), eq(s.stillHappening.userId, user.id)))
      .get();
    if (dup) throw new HttpError(409, "duplicate_vote");
    ctx.db.insert(s.stillHappening).values({ incidentId: inc.id, userId: user.id, createdAt: ctx.clock.iso() }).run();
    const n = inc.stillCount + 1;
    if (n < ctx.cfg.reopenThreshold) {
      touch(ctx, fx, inc, { stillCount: n });
      return { reopened: false, count: n };
    }
    transition(ctx, fx, inc, "in_progress", "community", null, { key: "reopened", params: { count: n } });
    ctx.db.delete(s.stillHappening).where(eq(s.stillHappening.incidentId, inc.id)).run();
    const ref = referralOf(ctx.db, inc.id);
    if (ref) {
      ctx.db.update(s.referrals).set({ resolvedAt: null }).where(eq(s.referrals.id, ref.id)).run();
      notifyMany(ctx, fx, staffOf(ctx, ref.authorityId), { type: "referral", key: "reopened_authority", params: { categoryId: inc.categoryId, areaId: inc.areaId, count: n }, incidentId: inc.id });
    }
    notify(ctx, fx, { userId: inc.reporterId, type: "status_change", key: "status_reopened", params: { count: n, categoryId: inc.categoryId, areaId: inc.areaId }, incidentId: inc.id });
    return { reopened: true, count: n };
  });
}

/** Inserts a comment and marks it for broadcast. Shared by citizen comments and official updates. */
export function insertComment(
  ctx: Ctx,
  fx: Effects,
  c: Pick<s.CommentRow, "incidentId" | "authorId" | "kind" | "body"> & Partial<Pick<s.CommentRow, "parentId" | "isAnonymous" | "lat" | "lng">>,
): string {
  const id = randomUUID();
  ctx.db
    .insert(s.comments)
    .values({ id, parentId: null, isAnonymous: false, isHidden: false, lat: null, lng: null, ...c, createdAt: ctx.clock.iso() })
    .run();
  fx.comments.push({ incidentId: c.incidentId, id });
  return id;
}

export async function addComment(ctx: Ctx, user: s.UserRow, incidentId: string, input: CommentInput) {
  return write(ctx, (fx) => {
    const inc = openIncident(ctx, incidentId);
    const isStaff = user.role !== "citizen";
    if (user.role === "authority" && referralOf(ctx.db, inc.id)?.authorityId !== user.authorityId) throw forbidden();
    const sos = input.kind === "sighting" ? sosOf(ctx.db, inc.id) : null;
    if (input.kind === "sighting" && !sos && !isStaff) throw badRequest({ field: "kind" });
    const kind: s.CommentRow["kind"] = isStaff ? "official" : input.kind;

    let parentId: string | null = null;
    let parentAuthor: string | null = null;
    if (input.parentId) {
      const parent = ctx.db.select().from(s.comments).where(eq(s.comments.id, input.parentId)).get();
      if (!parent || parent.incidentId !== inc.id) throw badRequest({ field: "parentId" });
      parentId = parent.parentId ?? parent.id; // one level of replies (FR-5.3)
      parentAuthor = parent.authorId;
    }

    const id = insertComment(ctx, fx, {
      incidentId: inc.id,
      authorId: user.id,
      parentId,
      kind,
      body: input.body,
      isAnonymous: !isStaff && input.isAnonymous,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
    });
    touch(ctx, fx, inc);

    const params = { name: sos?.childName ?? "", categoryId: inc.categoryId, areaId: inc.areaId };
    if (inc.reporterId !== user.id && kind !== "official") {
      const type = kind === "sighting" ? "sighting" : "reply";
      notify(ctx, fx, { userId: inc.reporterId, type, key: type, params, incidentId: inc.id });
    }
    if (parentAuthor && parentAuthor !== user.id && parentAuthor !== inc.reporterId) {
      notify(ctx, fx, { userId: parentAuthor, type: "reply", key: "reply_comment", params, incidentId: inc.id });
    }
    return { id };
  });
}

export async function flag(ctx: Ctx, user: s.UserRow, input: FlagInput) {
  return write(ctx, (fx) => {
    let incidentId: string;
    if (input.targetType === "incident") {
      incidentId = openIncident(ctx, input.targetId).id;
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
