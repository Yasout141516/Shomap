import type { DB } from "./client.js";
import * as s from "./schema.js";
import {
  ADMIN,
  AREAS,
  AUTHORITIES,
  CATEGORIES,
  CITIZENS,
  CITIZEN_COMMENTS,
  DESCRIPTIONS,
  LANDMARKS,
  OFFICIAL_NOTES,
  PATTERN,
  type AreaId,
} from "./seedData.js";
import { routeReferral } from "../domain/referral.js";
import { OFFICIAL_DEFAULT } from "../services/actions.js";
import { config } from "../config.js";

/** Small deterministic PRNG (mulberry32) so every reset produces the same demo. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const URG = ["low", "medium", "high", "critical"] as const;
/** The /demo panel fast-forwards 72 h at a time. */
const FF_HOURS = 72;

/** Tables in child-first order, for deletes. */
const TABLES = [
  s.notifications,
  s.abuseFlags,
  s.sosAlerts,
  s.statusEvents,
  s.referrals,
  s.comments,
  s.stillHappening,
  s.verifications,
  s.incidentMedia,
  s.incidents,
  s.watchZones,
  s.users,
  s.jurisdictions,
  s.categories,
  s.authorities,
  s.areas,
  s.appState,
];

export const staffIdFor = (authorityId: string) => `u-staff-${authorityId}`;

/** People with a part in the PRD §11 demo script, for the /demo panel and login quick picks. */
export const DEMO_HEROES: Record<string, string> = {
  ...Object.fromEntries(CITIZENS.filter((c) => c.hero).map((c) => [c.id, c.hero!])),
  [staffIdFor("thana-tejgaon")]: "Authority that responds",
  [ADMIN.id]: "Sees anonymous reporters",
};
export const categoryIdFor = (key: string) => `cat-${key}`;

export interface SeedSummary {
  incidents: number;
  users: number;
}

/** Wipes and reseeds everything. Times are relative to `nowMs`; ids and content are fixed. */
export function seed(db: DB, nowMs: number): SeedSummary {
  const R = rng(20261002);
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(R() * arr.length)];
  const iso = (ms: number) => new Date(ms).toISOString();
  const HOUR = 3_600_000;
  const created = iso(nowMs - 30 * 24 * HOUR);

  let summary: SeedSummary = { incidents: 0, users: 0 };

  db.transaction((tx) => {
    for (const t of TABLES) tx.delete(t).run();

    tx.insert(s.areas).values(AREAS.map((a) => ({ ...a }))).run();
    tx.insert(s.authorities)
      .values(AUTHORITIES.map(({ areas: _a, ...a }) => ({ ...a, contactPhone: "" })))
      .run();
    tx.insert(s.jurisdictions)
      .values(AUTHORITIES.flatMap((a) => a.areas.map((areaId) => ({ authorityId: a.id, areaId }))))
      .run();
    tx.insert(s.categories)
      .values(
        CATEGORIES.map((c, i) => ({
          id: categoryIdFor(c.key),
          key: c.key,
          nameEn: c.nameEn,
          nameBn: c.nameBn,
          kind: c.kind,
          icon: c.icon,
          defaultUrgency: c.defaultUrgency,
          authorityType: c.authorityType,
          triggersSos: "triggersSos" in c ? c.triggersSos : false,
          isBlocked: "isBlocked" in c ? c.isBlocked : false,
          redirectHotline: "redirectHotline" in c ? c.redirectHotline : null,
          anonymousDefault: c.anonymousDefault,
          sort: i,
        })),
      )
      .run();

    const users = [
      ...CITIZENS.map((c) => ({
        id: c.id,
        displayName: c.name,
        phone: c.phone,
        role: "citizen" as const,
        lang: c.lang ?? ("en" as const),
        homeAreaId: c.home,
        authorityId: null,
        createdAt: created,
      })),
      {
        id: ADMIN.id,
        displayName: ADMIN.name,
        phone: ADMIN.phone,
        role: "admin" as const,
        lang: "en" as const,
        homeAreaId: null,
        authorityId: null,
        createdAt: created,
      },
      ...AUTHORITIES.map((a, i) => ({
        id: staffIdFor(a.id),
        displayName: `Duty Officer, ${a.nameEn}`,
        phone: `018000000${String(i + 10).padStart(2, "0")}`,
        role: "authority" as const,
        lang: "en" as const,
        homeAreaId: null,
        authorityId: a.id,
        createdAt: created,
      })),
    ];
    tx.insert(s.users).values(users).run();

    tx.insert(s.watchZones)
      .values([
        { id: "wz-arif-mirpur", userId: "u-arif", label: "Sister's home, Mirpur 10", lat: 23.8069, lng: 90.3687, radiusM: 2000, minUrgency: "high", createdAt: created },
        { id: "wz-rahim-office", userId: "u-rahim", label: "Office", lat: 23.778, lng: 90.405, radiusM: 1000, minUrgency: "high", createdAt: created },
        { id: "wz-nila-home", userId: "u-nila", label: "Home", lat: 23.7575, lng: 90.3897, radiusM: 1000, minUrgency: "medium", createdAt: created },
        { id: "wz-tanvir-farmgate", userId: "u-tanvir", label: "Farmgate bus stand", lat: 23.7579, lng: 90.3901, radiusM: 1000, minUrgency: "high", createdAt: created },
      ])
      .run();

    const jur = AUTHORITIES.flatMap((a) => a.areas.map((areaId) => ({ authorityId: a.id, areaId })));
    const auths = AUTHORITIES.map((a) => ({ id: a.id, type: a.type }));
    const citizenIds = CITIZENS.map((c) => c.id);
    const areaById = new Map(AREAS.map((a) => [a.id, a]));

    let n = 0;
    let disputedLeft = 3;
    for (const [catKey, areaId, count] of PATTERN) {
      const cat = CATEGORIES.find((c) => c.key === catKey)!;
      for (let k = 0; k < count; k++) {
        n++;
        const id = `inc-${String(n).padStart(3, "0")}`;
        const area = areaById.get(areaId)!;
        const locals = CITIZENS.filter((c) => c.home === areaId).map((c) => c.id);
        const reporterId = locals.length && R() < 0.7 ? pick(locals) : pick(citizenIds);
        let hoursAgo = 0.5 + R() * (14 * 24 - 1);
        const lat = area.lat + (R() - 0.5) * 0.009;
        const lng = area.lng + (R() - 0.5) * 0.009;
        const baseU = URG.indexOf(cat.defaultUrgency);
        const shift = R() < 0.15 ? (R() < 0.5 ? -1 : 1) : 0;
        const urgency = URG[Math.max(0, Math.min(2, baseU + shift))];
        const isAnonymous = cat.anonymousDefault ? R() < 0.7 : R() < 0.1;

        // Verification mix: ~70% verified, 3 disputed, rest unverified.
        const roll = R();
        let verification: "verified" | "unverified" | "disputed";
        let confirms: number;
        let disputes: number;
        if (disputedLeft > 0 && roll > 0.93) {
          disputedLeft--;
          verification = "disputed";
          confirms = Math.floor(R() * 2);
          disputes = 3 + Math.floor(R() * 2);
        } else if (roll < 0.7) {
          verification = "verified";
          confirms = 3 + Math.floor(R() * 6);
          disputes = R() < 0.3 ? 1 : 0;
        } else {
          verification = "unverified";
          confirms = Math.floor(R() * 3);
          disputes = R() < 0.2 ? 1 : 0;
        }
        // Unverified reports stay young enough that the unverified-expiry sweep can't reach them,
        // even after a demo fast-forward (FF_HOURS).
        if (verification === "unverified") hoursAgo = Math.min(hoursAgo, config.unverifiedExpiryDays * 24 - FF_HOURS - 12);
        const createdMs = nowMs - hoursAgo * HOUR;

        const authorityId =
          verification === "verified" ? routeReferral(cat.authorityType, areaId, jur, auths) : null;

        // Lifecycle by age.
        type St = "open" | "referred" | "acknowledged" | "in_progress" | "resolved" | "closed";
        const chain: St[] = ["open"];
        if (authorityId) {
          chain.push("referred");
          if (hoursAgo > 3) chain.push("acknowledged");
          if (hoursAgo > 10 && R() < 0.8) chain.push("in_progress");
          if (hoursAgo > 24 && R() < 0.65) chain.push("resolved");
          if (chain.at(-1) === "resolved" && hoursAgo > 24 + 72) chain.push("closed");
        }
        const status = chain.at(-1)!;
        const stepMs = (hoursAgo * HOUR * 0.8) / Math.max(1, chain.length);
        const at = (i: number) => iso(createdMs + i * stepMs);
        const resolvedIdx = chain.indexOf("resolved");

        tx.insert(s.incidents)
          .values({
            id,
            reporterId,
            categoryId: categoryIdFor(cat.key),
            areaId,
            description: pick(DESCRIPTIONS[catKey as keyof typeof DESCRIPTIONS]),
            urgency,
            status,
            verification,
            isAnonymous,
            lat,
            lng,
            addressText: pick(LANDMARKS[areaId as AreaId]),
            confirmCount: confirms,
            disputeCount: disputes,
            stillCount: 0,
            redirected: false,
            redirectNote: null,
            idempotencyKey: null,
            occurredAt: iso(createdMs - R() * HOUR),
            createdAt: iso(createdMs),
            updatedAt: at(chain.length - 1),
            resolvedAt: resolvedIdx >= 0 ? at(resolvedIdx) : null,
          })
          .run();

        // Votes from distinct citizens other than the reporter.
        const voters = citizenIds.filter((u) => u !== reporterId).sort(() => R() - 0.5);
        const votes = [
          ...voters.slice(0, confirms).map((u) => ({ u, vote: "confirm" as const })),
          ...voters.slice(confirms, confirms + disputes).map((u) => ({ u, vote: "dispute" as const })),
        ];
        if (votes.length) {
          tx.insert(s.verifications)
            .values(
              votes.map((v, i) => ({
                id: `${id}-v${i}`,
                incidentId: id,
                userId: v.u,
                vote: v.vote,
                note: null,
                createdAt: iso(createdMs + (i + 1) * 0.1 * stepMs),
              })),
            )
            .run();
        }

        // Status history + referral + official comments.
        // Same notes as the live code writes: system notes as i18n keys, official updates as text.
        const systemNote: Partial<Record<St, { key: string; params?: Record<string, number> }>> = {
          referred: { key: "referredAuto" },
          closed: { key: "autoClosed", params: { hours: config.autoCloseHours } },
        };
        const officialText: Partial<Record<St, string>> = {
          acknowledged: OFFICIAL_DEFAULT.acknowledge,
          in_progress: OFFICIAL_DEFAULT.start,
          resolved: pick(OFFICIAL_NOTES.resolve),
        };
        const events = chain.map((to, i) => {
          const system = i > 0 && (to === "referred" || to === "closed");
          return {
            id: `${id}-e${i}`,
            incidentId: id,
            actorId: i === 0 ? reporterId : system ? null : staffIdFor(authorityId!),
            actorRole: i === 0 ? "citizen" : system ? "system" : "authority",
            kind: "status" as const,
            fromStatus: i === 0 ? null : chain[i - 1],
            toStatus: to,
            note: officialText[to] ?? null,
            noteKey: systemNote[to]?.key ?? null,
            noteParams: JSON.stringify(systemNote[to]?.params ?? {}),
            createdAt: at(i),
          };
        });
        tx.insert(s.statusEvents).values(events).run();

        if (authorityId) {
          const ackIdx = chain.indexOf("acknowledged");
          tx.insert(s.referrals)
            .values({
              id: `${id}-r`,
              incidentId: id,
              authorityId,
              source: "auto",
              referredAt: at(1),
              acknowledgedAt: ackIdx >= 0 ? at(ackIdx) : null,
              resolvedAt: resolvedIdx >= 0 ? at(resolvedIdx) : null,
              resolutionNote: resolvedIdx >= 0 ? events[resolvedIdx].note : null,
            })
            .run();
          const officials = events.filter((e) => e.actorRole === "authority");
          if (officials.length) {
            tx.insert(s.comments)
              .values(
                officials.map((e, i) => ({
                  id: `${id}-o${i}`,
                  incidentId: id,
                  authorId: staffIdFor(authorityId),
                  parentId: null,
                  kind: "official" as const,
                  body: e.note!,
                  isAnonymous: false,
                  isHidden: false,
                  lat: null,
                  lng: null,
                  createdAt: e.createdAt,
                })),
              )
              .run();
          }
        }

        // Some neighbour chatter.
        if (R() < 0.45) {
          const howMany = 1 + Math.floor(R() * 3);
          tx.insert(s.comments)
            .values(
              Array.from({ length: howMany }, (_, i) => {
                const c = pick(CITIZEN_COMMENTS);
                return {
                  id: `${id}-c${i}`,
                  incidentId: id,
                  authorId: voters[(i + 3) % voters.length],
                  parentId: null,
                  kind: c.kind,
                  body: c.body,
                  isAnonymous: R() < 0.15,
                  isHidden: false,
                  lat: null,
                  lng: null,
                  createdAt: iso(createdMs + (i + 1) * 0.3 * stepMs),
                };
              }),
            )
            .run();
        }
      }
    }

    // Disputed incidents land in the admin queue via verification state; nothing else to mark.
    tx.insert(s.appState).values({ key: "seeded_at", value: iso(nowMs) }).run();
    summary = { incidents: n, users: users.length };
  });

  return summary;
}
