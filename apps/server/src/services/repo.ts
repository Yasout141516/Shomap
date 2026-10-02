import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { CommentDTO, IncidentDTO, StatusEventDTO } from "@shomap/shared";
import type { DB } from "../db/client.js";
import * as s from "../db/schema.js";
import { canSeeIdentity, serializeIncident, type IncidentBundle, type Viewer } from "../serializers/incident.js";
import { serializeComment, type CommentAuthor } from "../serializers/comment.js";

/** Loads everything the serializer needs for a set of incident rows, in a few bulk queries. */
export function loadBundles(db: DB, rows: s.IncidentRow[], viewerId: string | null): IncidentBundle[] {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const reporterIds = [...new Set(rows.map((r) => r.reporterId))];

  const reporters = new Map(
    db
      .select({ id: s.users.id, displayName: s.users.displayName })
      .from(s.users)
      .where(inArray(s.users.id, reporterIds))
      .all()
      .map((u) => [u.id, u]),
  );
  const media = groupBy(
    db.select().from(s.incidentMedia).where(inArray(s.incidentMedia.incidentId, ids)).orderBy(asc(s.incidentMedia.createdAt)).all(),
    (m) => m.incidentId,
  );
  const referrals = new Map(
    db.select().from(s.referrals).where(inArray(s.referrals.incidentId, ids)).all().map((r) => [r.incidentId, r]),
  );
  const sos = new Map(
    db.select().from(s.sosAlerts).where(inArray(s.sosAlerts.incidentId, ids)).all().map((a) => [a.incidentId, a]),
  );
  const commentCounts = new Map(
    db
      .select({ id: s.comments.incidentId, n: sql<number>`count(*)` })
      .from(s.comments)
      .where(and(inArray(s.comments.incidentId, ids), eq(s.comments.isHidden, false)))
      .groupBy(s.comments.incidentId)
      .all()
      .map((r) => [r.id, Number(r.n)]),
  );
  const myVotes = new Map<string, "confirm" | "dispute">();
  const myStill = new Set<string>();
  if (viewerId) {
    for (const v of db
      .select({ incidentId: s.verifications.incidentId, vote: s.verifications.vote })
      .from(s.verifications)
      .where(and(inArray(s.verifications.incidentId, ids), eq(s.verifications.userId, viewerId)))
      .all())
      myVotes.set(v.incidentId, v.vote);
    for (const r of db
      .select({ incidentId: s.stillHappening.incidentId })
      .from(s.stillHappening)
      .where(and(inArray(s.stillHappening.incidentId, ids), eq(s.stillHappening.userId, viewerId)))
      .all())
      myStill.add(r.incidentId);
  }

  return rows.map((row) => ({
    row,
    reporter: reporters.get(row.reporterId) ?? { id: row.reporterId, displayName: "?" },
    media: (media.get(row.id) ?? []).map((m) => ({ id: m.id, url: m.url, publicHidden: m.publicHidden })),
    referral: referrals.get(row.id) ?? null,
    sos: sos.get(row.id) ?? null,
    commentCount: commentCounts.get(row.id) ?? 0,
    myVote: myVotes.get(row.id) ?? null,
    myStill: myStill.has(row.id),
  }));
}

export function incidentDTOs(db: DB, rows: s.IncidentRow[], viewer: Viewer): IncidentDTO[] {
  return loadBundles(db, rows, viewer?.id ?? null).map((b) => serializeIncident(b, viewer));
}

export function getIncidentRow(db: DB, id: string): s.IncidentRow | undefined {
  return db.select().from(s.incidents).where(eq(s.incidents.id, id)).get();
}

export function incidentDTO(db: DB, id: string, viewer: Viewer): IncidentDTO | null {
  const row = getIncidentRow(db, id);
  return row ? incidentDTOs(db, [row], viewer)[0] : null;
}

/** Timeline entries. Anonymous reporters' names stay hidden, same rule as the incident. */
export function statusEvents(db: DB, incident: s.IncidentRow, viewer: Viewer): StatusEventDTO[] {
  const referral = db.select().from(s.referrals).where(eq(s.referrals.incidentId, incident.id)).get() ?? null;
  const events = db
    .select()
    .from(s.statusEvents)
    .where(eq(s.statusEvents.incidentId, incident.id))
    .orderBy(asc(s.statusEvents.createdAt), asc(s.statusEvents.id))
    .all();
  const actorIds = [...new Set(events.map((e) => e.actorId).filter((x): x is string => !!x))];
  const actors = new Map(
    actorIds.length
      ? db.select().from(s.users).where(inArray(s.users.id, actorIds)).all().map((u) => [u.id, u])
      : [],
  );
  const authorities = new Map(db.select().from(s.authorities).all().map((a) => [a.id, a]));
  const seeReporter = canSeeIdentity(viewer, incident, referral);
  return events.map((e) => {
    const actor = e.actorId ? actors.get(e.actorId) : undefined;
    let actorName: string | null = null;
    if (actor?.role === "authority" && actor.authorityId) actorName = authorities.get(actor.authorityId)?.nameEn ?? null;
    else if (actor?.role === "admin") actorName = "ShoMap moderators";
    else if (actor && (actor.id !== incident.reporterId || seeReporter)) actorName = actor.displayName;
    return {
      id: e.id,
      fromStatus: e.fromStatus,
      toStatus: e.toStatus,
      note: e.note,
      actorRole: (e.actorRole as StatusEventDTO["actorRole"]) ?? "system",
      actorName,
      createdAt: e.createdAt,
    };
  });
}

export function commentDTOs(db: DB, incidentId: string, viewer: Viewer, onlyIds?: string[]): CommentDTO[] {
  const where = onlyIds
    ? and(eq(s.comments.incidentId, incidentId), inArray(s.comments.id, onlyIds))
    : eq(s.comments.incidentId, incidentId);
  const rows = db
    .select()
    .from(s.comments)
    .where(and(where, eq(s.comments.isHidden, false)))
    .orderBy(asc(s.comments.createdAt), asc(s.comments.id))
    .all();
  if (rows.length === 0) return [];
  const referral = db.select().from(s.referrals).where(eq(s.referrals.incidentId, incidentId)).get() ?? null;
  const authors = new Map<string, CommentAuthor>(
    db
      .select({ id: s.users.id, displayName: s.users.displayName, role: s.users.role, authorityId: s.users.authorityId })
      .from(s.users)
      .where(inArray(s.users.id, [...new Set(rows.map((r) => r.authorId))]))
      .all()
      .map((u) => [u.id, u]),
  );
  return rows.map((c) =>
    serializeComment(c, authors.get(c.authorId) ?? { id: c.authorId, displayName: "?", role: "citizen", authorityId: null }, viewer, referral),
  );
}

export function groupBy<T, K>(items: T[], key: (t: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const it of items) {
    const k = key(it);
    const arr = m.get(k);
    if (arr) arr.push(it);
    else m.set(k, [it]);
  }
  return m;
}
