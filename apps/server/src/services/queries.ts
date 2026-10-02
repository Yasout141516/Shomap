import { and, desc, eq, gte, inArray, isNull, ne, or, sql } from "drizzle-orm";
import {
  ACTIVE_STATUSES,
  DAY_MS,
  DHAKA_OFFSET_MS,
  HOUR_MS,
  URGENCIES,
  URGENCY_ORDER,
  haversineM,
  type DashboardDTO,
  type DashboardScope,
  type EventKind,
  type EventLogDTO,
  type QueueItemDTO,
} from "@shomap/shared";
import * as s from "../db/schema.js";
import { notFound } from "../errors.js";
import type { Viewer } from "../serializers/incident.js";
import type { Ctx } from "./context.js";
import { activeSosIncidentIds, incidentDTOs, usersById } from "./repo.js";

const isoAgo = (ctx: Ctx, ms: number) => new Date(ctx.clock.nowMs() - ms).toISOString();

/** Map + feed data: everything not removed from the last N days, plus any active SOS. */
export function listIncidents(ctx: Ctx, viewer: Viewer, days: number) {
  const since = isoAgo(ctx, days * DAY_MS);
  const sos = activeSosIncidentIds(ctx.db);
  const recent = gte(s.incidents.createdAt, since);
  const rows = ctx.db
    .select()
    .from(s.incidents)
    .where(and(ne(s.incidents.status, "removed"), sos.length ? or(recent, inArray(s.incidents.id, sos)) : recent))
    .orderBy(desc(s.incidents.createdAt))
    .all();
  return incidentDTOs(ctx.db, rows, viewer);
}

export function activeSos(ctx: Ctx, viewer: Viewer) {
  const ids = activeSosIncidentIds(ctx.db);
  if (!ids.length) return [];
  return incidentDTOs(ctx.db, ctx.db.select().from(s.incidents).where(inArray(s.incidents.id, ids)).all(), viewer);
}

/** FR-6.4: open referrals by urgency, then oldest first; recently resolved ones last. */
export function authorityQueue(ctx: Ctx, viewer: NonNullable<Viewer>) {
  if (!viewer.authorityId) return [];
  const recent = isoAgo(ctx, ctx.cfg.autoCloseHours * HOUR_MS);
  const refs = ctx.db.select().from(s.referrals).where(eq(s.referrals.authorityId, viewer.authorityId)).all();
  if (!refs.length) return [];
  const rows = ctx.db
    .select()
    .from(s.incidents)
    .where(inArray(s.incidents.id, refs.map((r) => r.incidentId)))
    .all()
    .filter((r) => (ACTIVE_STATUSES as string[]).includes(r.status) || (r.status === "resolved" && (r.resolvedAt ?? "") >= recent));
  const referredAt = new Map(refs.map((r) => [r.incidentId, r.referredAt]));
  return incidentDTOs(ctx.db, rows, viewer).sort((a, b) => {
    const done = Number(a.status === "resolved") - Number(b.status === "resolved");
    if (done) return done;
    const u = URGENCY_ORDER[b.urgency] - URGENCY_ORDER[a.urgency];
    if (u) return u;
    return (referredAt.get(a.id) ?? "").localeCompare(referredAt.get(b.id) ?? "");
  });
}

/** FR-12.1 tabs: SOS pending review, disputed, flagged, redirected. */
export function adminQueue(ctx: Ctx, viewer: Viewer): QueueItemDTO[] {
  const flagCount = new Map<string, number>();
  for (const f of ctx.db.select().from(s.abuseFlags).where(eq(s.abuseFlags.state, "open")).all()) {
    flagCount.set(f.incidentId, (flagCount.get(f.incidentId) ?? 0) + 1);
  }
  const pendingSos = new Set(
    ctx.db
      .select({ id: s.sosAlerts.incidentId })
      .from(s.sosAlerts)
      .where(and(eq(s.sosAlerts.state, "active"), isNull(s.sosAlerts.reviewedAt)))
      .all()
      .map((r) => r.id),
  );
  const candidates = [...pendingSos, ...flagCount.keys()];
  const rows = ctx.db
    .select()
    .from(s.incidents)
    .where(
      and(
        ne(s.incidents.status, "removed"),
        or(eq(s.incidents.redirected, true), eq(s.incidents.verification, "disputed"), candidates.length ? inArray(s.incidents.id, candidates) : undefined),
      ),
    )
    .orderBy(desc(s.incidents.updatedAt))
    .all();
  const dtos = new Map(incidentDTOs(ctx.db, rows, viewer).map((d) => [d.id, d]));
  const out: QueueItemDTO[] = [];
  for (const r of rows) {
    const incident = dtos.get(r.id)!;
    const flags = flagCount.get(r.id) ?? 0;
    const item = (reason: QueueItemDTO["reason"], note: string | null = null) => out.push({ incident, reason, flagCount: flags, note });
    if (pendingSos.has(r.id)) item("sos_review");
    if (r.redirected) item("redirected", r.redirectNote);
    if (r.verification === "disputed") item("disputed");
    if (flags > 0) item("flagged");
  }
  return out;
}

export function eventLog(ctx: Ctx, limit = 50): EventLogDTO[] {
  const events = ctx.db.select().from(s.statusEvents).orderBy(desc(s.statusEvents.createdAt), desc(sql`rowid`)).limit(limit).all();
  const actors = usersById(ctx.db, events.map((e) => e.actorId).filter((x): x is string => !!x));
  return events.map((e) => ({
    id: e.id,
    incidentId: e.incidentId,
    kind: e.kind as EventKind,
    toStatus: e.toStatus,
    note: e.note,
    actorName: e.actorId ? actors.get(e.actorId)?.displayName ?? null : null,
    createdAt: e.createdAt,
  }));
}

const dhakaDate = (iso: string) => new Date(Date.parse(iso) + DHAKA_OFFSET_MS).toISOString().slice(0, 10);

export function dashboard(ctx: Ctx, user: s.UserRow | null, scope: DashboardScope, zoneId?: string, areaId?: string): DashboardDTO {
  let inScope: (r: s.IncidentRow) => boolean = () => true;
  let scopeLabel = { en: "All of Dhaka", bn: "সমগ্র ঢাকা" };
  const homeId = areaId ?? user?.homeAreaId;
  if (scope === "home" && homeId) {
    const area = ctx.db.select().from(s.areas).where(eq(s.areas.id, homeId)).get();
    if (area) {
      inScope = (r) => r.areaId === area.id;
      scopeLabel = { en: area.nameEn, bn: area.nameBn };
    }
  } else if (scope === "zone") {
    const zone = zoneId ? ctx.db.select().from(s.watchZones).where(eq(s.watchZones.id, zoneId)).get() : undefined;
    if (!zone || zone.userId !== user?.id) throw notFound();
    inScope = (r) => haversineM(r, zone) <= zone.radiusM;
    scopeLabel = { en: zone.label, bn: zone.label };
  }

  const nowMs = ctx.clock.nowMs();
  const week = isoAgo(ctx, 7 * DAY_MS);
  const fortnight = isoAgo(ctx, 14 * DAY_MS);
  // Only the 14-day window matters; let SQLite filter it (created_at is indexed).
  const rows = ctx.db
    .select()
    .from(s.incidents)
    .where(and(ne(s.incidents.status, "removed"), or(gte(s.incidents.createdAt, fortnight), gte(s.incidents.resolvedAt, fortnight))))
    .all()
    .filter(inScope);
  const lastWeek = rows.filter((r) => r.createdAt >= week);

  const byUrgency = Object.fromEntries(URGENCIES.map((u) => [u, 0])) as DashboardDTO["byUrgency"];
  const byCat = new Map<string, number>();
  for (const r of lastWeek) {
    byUrgency[r.urgency]++;
    byCat.set(r.categoryId, (byCat.get(r.categoryId) ?? 0) + 1);
  }

  const days: DashboardDTO["trend"] = [];
  for (let i = 13; i >= 0; i--) days.push({ date: dhakaDate(new Date(nowMs - i * DAY_MS).toISOString()), reported: 0, resolved: 0 });
  const dayIdx = new Map(days.map((d, i) => [d.date, i]));
  for (const r of rows) {
    const c = dayIdx.get(dhakaDate(r.createdAt));
    if (c !== undefined) days[c].reported++;
    const v = r.resolvedAt ? dayIdx.get(dhakaDate(r.resolvedAt)) : undefined;
    if (v !== undefined) days[v].resolved++;
  }

  return {
    scope,
    scopeLabel,
    totals: {
      reported: lastWeek.length,
      highPlus: lastWeek.filter((r) => URGENCY_ORDER[r.urgency] >= URGENCY_ORDER.high).length,
      verified: lastWeek.filter((r) => r.verification === "verified").length,
      resolved: rows.filter((r) => r.resolvedAt && r.resolvedAt >= week).length,
    },
    byUrgency,
    byCategory: [...byCat.entries()].map(([categoryId, n]) => ({ categoryId, count: n })).sort((a, b) => b.count - a.count),
    trend: days,
  };
}
