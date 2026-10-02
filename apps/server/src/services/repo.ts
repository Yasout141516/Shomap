import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { CommentDTO, EventKind, IncidentDTO, StatusEventDTO } from "@shomap/shared";
import type { DB } from "../db/client.js";
import * as s from "../db/schema.js";
import { canSeeIdentity, serializeIncident, type IncidentBundle, type Viewer } from "../serializers/incident.js";
import { serializeComment, type CommentAuthor } from "../serializers/comment.js";

// ---- Single-row lookups shared by services and routes

export const getIncidentRow = (db: DB, id: string) => db.select().from(s.incidents).where(eq(s.incidents.id, id)).get();
export const referralOf = (db: DB, incidentId: string) =>
  db.select().from(s.referrals).where(eq(s.referrals.incidentId, incidentId)).get() ?? null;
export const sosOf = (db: DB, incidentId: string) =>
  db.select().from(s.sosAlerts).where(eq(s.sosAlerts.incidentId, incidentId)).get() ?? null;
export const categoryOf = (db: DB, id: string) => db.select().from(s.categories).where(eq(s.categories.id, id)).get();

export function usersById(db: DB, ids: Iterable<string>): Map<string, s.UserRow> {
  const list = [...new Set(ids)];
  if (list.length === 0) return new Map();
  return new Map(db.select().from(s.users).where(inArray(s.users.id, list)).all().map((u) => [u.id, u]));
}

export function activeSosIncidentIds(db: DB): string[] {
  return db
    .select({ id: s.sosAlerts.incidentId })
    .from(s.sosAlerts)
    .where(eq(s.sosAlerts.state, "active"))
    .all()
    .map((r) => r.id);
}

// ---- Incident bundles: the viewer-independent part loads once, the per-viewer part is small

export type SharedBundle = Omit<IncidentBundle, "myVote" | "myStill" | "alertedYou">;

export function loadShared(db: DB, rows: s.IncidentRow[]): SharedBundle[] {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const reporters = usersById(db, rows.map((r) => r.reporterId));
  const media = groupBy(
    db.select().from(s.incidentMedia).where(inArray(s.incidentMedia.incidentId, ids)).orderBy(asc(s.incidentMedia.createdAt)).all(),
    (m) => m.incidentId,
  );
  const referrals = new Map(db.select().from(s.referrals).where(inArray(s.referrals.incidentId, ids)).all().map((r) => [r.incidentId, r]));
  const sos = new Map(db.select().from(s.sosAlerts).where(inArray(s.sosAlerts.incidentId, ids)).all().map((a) => [a.incidentId, a]));
  const commentCounts = new Map(
    db
      .select({ id: s.comments.incidentId, n: sql<number>`count(*)` })
      .from(s.comments)
      .where(and(inArray(s.comments.incidentId, ids), eq(s.comments.isHidden, false)))
      .groupBy(s.comments.incidentId)
      .all()
      .map((r) => [r.id, Number(r.n)]),
  );
  return rows.map((row) => {
    const reporter = reporters.get(row.reporterId);
    return {
      row,
      reporter: { id: row.reporterId, displayName: reporter?.displayName ?? "?" },
      media: (media.get(row.id) ?? []).map((m) => ({ id: m.id, url: m.url, publicHidden: m.publicHidden })),
      referral: referrals.get(row.id) ?? null,
      sos: sos.get(row.id) ?? null,
      commentCount: commentCounts.get(row.id) ?? 0,
    };
  });
}

export interface ViewerState {
  votes: Map<string, "confirm" | "dispute">;
  still: Set<string>;
  alerted: Set<string>;
}

export function loadViewerState(db: DB, incidentIds: string[], viewerId: string | null): ViewerState {
  const state: ViewerState = { votes: new Map(), still: new Set(), alerted: new Set() };
  if (!viewerId || incidentIds.length === 0) return state;
  for (const v of db
    .select({ incidentId: s.verifications.incidentId, vote: s.verifications.vote })
    .from(s.verifications)
    .where(and(inArray(s.verifications.incidentId, incidentIds), eq(s.verifications.userId, viewerId)))
    .all())
    state.votes.set(v.incidentId, v.vote);
  for (const r of db
    .select({ incidentId: s.stillHappening.incidentId })
    .from(s.stillHappening)
    .where(and(inArray(s.stillHappening.incidentId, incidentIds), eq(s.stillHappening.userId, viewerId)))
    .all())
    state.still.add(r.incidentId);
  for (const n of db
    .select({ incidentId: s.notifications.incidentId })
    .from(s.notifications)
    .where(and(eq(s.notifications.userId, viewerId), eq(s.notifications.type, "sos"), inArray(s.notifications.incidentId, incidentIds)))
    .all())
    if (n.incidentId) state.alerted.add(n.incidentId);
  return state;
}

export function serializeFor(shared: SharedBundle[], state: ViewerState, viewer: Viewer): IncidentDTO[] {
  return shared.map((b) =>
    serializeIncident(
      { ...b, myVote: state.votes.get(b.row.id) ?? null, myStill: state.still.has(b.row.id), alertedYou: state.alerted.has(b.row.id) },
      viewer,
    ),
  );
}

export function incidentDTOs(db: DB, rows: s.IncidentRow[], viewer: Viewer): IncidentDTO[] {
  return serializeFor(loadShared(db, rows), loadViewerState(db, rows.map((r) => r.id), viewer?.id ?? null), viewer);
}

export function incidentDTO(db: DB, id: string, viewer: Viewer): IncidentDTO | null {
  const row = getIncidentRow(db, id);
  return row ? incidentDTOs(db, [row], viewer)[0] : null;
}

// ---- Timeline and thread

/** Timeline entries. Anonymous reporters' names stay hidden, same rule as the incident. */
export function statusEvents(db: DB, incident: s.IncidentRow, viewer: Viewer): StatusEventDTO[] {
  const referral = referralOf(db, incident.id);
  const events = db
    .select()
    .from(s.statusEvents)
    .where(eq(s.statusEvents.incidentId, incident.id))
    .orderBy(asc(s.statusEvents.createdAt), asc(s.statusEvents.id))
    .all();
  const actors = usersById(db, events.map((e) => e.actorId).filter((x): x is string => !!x));
  const authorityIds = [...actors.values()].map((u) => u.authorityId).filter((x): x is string => !!x);
  const authorities = new Map(
    authorityIds.length ? db.select().from(s.authorities).where(inArray(s.authorities.id, authorityIds)).all().map((a) => [a.id, a]) : [],
  );
  const seeReporter = canSeeIdentity(viewer, incident, referral);
  return events.map((e) => {
    const actor = e.actorId ? actors.get(e.actorId) : undefined;
    let actorName: string | null = null;
    if (actor?.role === "authority" && actor.authorityId) actorName = authorities.get(actor.authorityId)?.nameEn ?? null;
    else if (actor && actor.role !== "admin" && (actor.id !== incident.reporterId || seeReporter)) actorName = actor.displayName;
    return {
      id: e.id,
      kind: e.kind as EventKind,
      fromStatus: e.fromStatus,
      toStatus: e.toStatus,
      note: e.note,
      noteKey: e.noteKey,
      noteParams: JSON.parse(e.noteParams),
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
  const referral = referralOf(db, incidentId);
  const authors = usersById(db, rows.map((r) => r.authorId));
  const fallback: CommentAuthor = { id: "", displayName: "?", role: "citizen", authorityId: null };
  return rows.map((c) => serializeComment(c, authors.get(c.authorId) ?? { ...fallback, id: c.authorId }, viewer, referral));
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
