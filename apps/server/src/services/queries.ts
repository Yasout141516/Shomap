import { and, desc, eq, gte, inArray, isNotNull, ne, or } from "drizzle-orm";
import {
  ACTIVE_STATUSES,
  URGENCIES,
  URGENCY_ORDER,
  type DashboardDTO,
  type DashboardScope,
  type EventLogDTO,
  type QueueItemDTO,
} from "@shomap/shared";
import * as s from "../db/schema.js";
import { haversineM } from "../domain/geo.js";
import { notFound } from "../errors.js";
import type { Viewer } from "../serializers/incident.js";
import type { Ctx } from "./context.js";
import { incidentDTOs } from "./repo.js";

/** Map + feed data: everything not removed from the last N days, plus any active SOS. */
export function listIncidents(ctx: Ctx, viewer: Viewer, days: number) {
  const since = new Date(ctx.clock.nowMs() - days * 24 * 3_600_000).toISOString();
  const activeSos = ctx.db
    .select({ id: s.sosAlerts.incidentId })
    .from(s.sosAlerts)
    .where(eq(s.sosAlerts.state, "active"))
    .all()
    .map((r) => r.id);
  const rows = ctx.db
    .select()
    .from(s.incidents)
    .where(
      and(
        ne(s.incidents.status, "removed"),
        activeSos.length ? or(gte(s.incidents.createdAt, since), inArray(s.incidents.id, activeSos)) : gte(s.incidents.createdAt, since),
      ),
    )
    .orderBy(desc(s.incidents.createdAt))
    .all();
  return incidentDTOs(ctx.db, rows, viewer);
}

export function activeSos(ctx: Ctx, viewer: Viewer) {
  const ids = ctx.db.select({ id: s.sosAlerts.incidentId }).from(s.sosAlerts).where(eq(s.sosAlerts.state, "active")).all().map((r) => r.id);
  if (!ids.length) return [];
  return incidentDTOs(ctx.db, ctx.db.select().from(s.incidents).where(inArray(s.incidents.id, ids)).all(), viewer);
}

/** FR-6.4: sorted by urgency, then by age (oldest referral first). */
export function authorityQueue(ctx: Ctx, viewer: NonNullable<Viewer>) {
  if (!viewer.authorityId) return [];
  const recent = new Date(ctx.clock.nowMs() - 72 * 3_600_000).toISOString();
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
    const resolvedA = a.status === "resolved" ? 1 : 0;
    const resolvedB = b.status === "resolved" ? 1 : 0;
    if (resolvedA !== resolvedB) return resolvedA - resolvedB;
    const u = URGENCY_ORDER[b.urgency] - URGENCY_ORDER[a.urgency];
    if (u) return u;
    return (referredAt.get(a.id) ?? "").localeCompare(referredAt.get(b.id) ?? "");
  });
}

/** FR-12.1 tabs: SOS pending review, disputed, flagged, redirected. */
export function adminQueue(ctx: Ctx, viewer: Viewer): QueueItemDTO[] {
  const flags = ctx.db.select().from(s.abuseFlags).where(eq(s.abuseFlags.state, "open")).all();
  const flagCount = new Map<string, number>();
  for (const f of flags) flagCount.set(f.incidentId, (flagCount.get(f.incidentId) ?? 0) + 1);

  const rows = ctx.db
    .select()
    .from(s.incidents)
    .where(
      and(
        ne(s.incidents.status, "removed"),
        or(
          isNotNull(s.incidents.reviewReason),
          eq(s.incidents.verification, "disputed"),
          flagCount.size ? inArray(s.incidents.id, [...flagCount.keys()]) : eq(s.incidents.id, "__none__"),
        ),
      ),
    )
    .orderBy(desc(s.incidents.updatedAt))
    .all();
  const dtos = new Map(incidentDTOs(ctx.db, rows, viewer).map((d) => [d.id, d]));
  const out: QueueItemDTO[] = [];
  for (const r of rows) {
    const incident = dtos.get(r.id)!;
    const n = flagCount.get(r.id) ?? 0;
    if (r.reviewReason === "sos_review") out.push({ incident, reason: "sos_review", flagCount: n, note: r.reviewNote });
    if (r.reviewReason === "redirected") out.push({ incident, reason: "redirected", flagCount: n, note: r.reviewNote });
    if (r.verification === "disputed") out.push({ incident, reason: "disputed", flagCount: n, note: null });
    if (n > 0) out.push({ incident, reason: "flagged", flagCount: n, note: null });
  }
  return out;
}

export function eventLog(ctx: Ctx, limit = 50): EventLogDTO[] {
  const events = ctx.db.select().from(s.statusEvents).orderBy(desc(s.statusEvents.createdAt)).limit(limit).all();
  const ids = [...new Set(events.map((e) => e.actorId).filter((x): x is string => !!x))];
  const actors = new Map(ids.length ? ctx.db.select().from(s.users).where(inArray(s.users.id, ids)).all().map((u) => [u.id, u]) : []);
  return events.map((e) => ({
    id: e.id,
    incidentId: e.incidentId,
    toStatus: e.toStatus,
    note: e.note,
    actorName: e.actorId ? actors.get(e.actorId)?.displayName ?? null : null,
    createdAt: e.createdAt,
  }));
}

/** Dhaka local date (UTC+6) for daily buckets. */
const dhakaDate = (iso: string) => new Date(Date.parse(iso) + 6 * 3_600_000).toISOString().slice(0, 10);

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
  const week = new Date(nowMs - 7 * 24 * 3_600_000).toISOString();
  const fortnight = new Date(nowMs - 14 * 24 * 3_600_000).toISOString();
  const rows = ctx.db.select().from(s.incidents).where(ne(s.incidents.status, "removed")).all().filter(inScope);
  const lastWeek = rows.filter((r) => r.createdAt >= week);

  const byUrgency = Object.fromEntries(URGENCIES.map((u) => [u, 0])) as DashboardDTO["byUrgency"];
  const byCat = new Map<string, number>();
  for (const r of lastWeek) {
    byUrgency[r.urgency]++;
    byCat.set(r.categoryId, (byCat.get(r.categoryId) ?? 0) + 1);
  }

  const days: DashboardDTO["trend"] = [];
  for (let i = 13; i >= 0; i--) days.push({ date: dhakaDate(new Date(nowMs - i * 24 * 3_600_000).toISOString()), reported: 0, resolved: 0 });
  const dayIdx = new Map(days.map((d, i) => [d.date, i]));
  for (const r of rows) {
    if (r.createdAt >= fortnight) {
      const i = dayIdx.get(dhakaDate(r.createdAt));
      if (i !== undefined) days[i].reported++;
    }
    if (r.resolvedAt && r.resolvedAt >= fortnight) {
      const i = dayIdx.get(dhakaDate(r.resolvedAt));
      if (i !== undefined) days[i].resolved++;
    }
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
    byCategory: [...byCat.entries()].map(([categoryId, count]) => ({ categoryId, count })).sort((a, b) => b.count - a.count),
    trend: days,
  };
}
