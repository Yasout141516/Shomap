import type { IncidentDTO, PersonRef, Role } from "@shomap/shared";
import type { IncidentRow, ReferralRow, SosAlertRow } from "../db/schema.js";

export type Viewer = { id: string; role: Role; authorityId: string | null } | null;

export interface IncidentBundle {
  row: IncidentRow;
  reporter: PersonRef;
  media: { id: string; url: string; publicHidden: boolean }[];
  referral: ReferralRow | null;
  sos: SosAlertRow | null;
  commentCount: number;
  myVote: "confirm" | "dispute" | null;
  myStill: boolean;
}

/** Admins and staff of the assigned authority are privileged for every incident. */
export function isPrivileged(viewer: Viewer, referral: ReferralRow | null): boolean {
  if (!viewer) return false;
  if (viewer.role === "admin") return true;
  return viewer.role === "authority" && !!referral && referral.authorityId === viewer.authorityId;
}

/** PRD FR-9.1–9.3: who may see the real reporter of an anonymous incident. */
export function canSeeIdentity(viewer: Viewer, row: IncidentRow, referral: ReferralRow | null): boolean {
  if (!row.isAnonymous) return true;
  if (!viewer) return false;
  return viewer.id === row.reporterId || isPrivileged(viewer, referral);
}

/**
 * The only way an incident leaves the server. Public payloads never carry an anonymous
 * reporter's id or name (enforced here, not in the UI).
 */
export function serializeIncident(b: IncidentBundle, viewer: Viewer): IncidentDTO {
  const { row, referral, sos } = b;
  const privileged = isPrivileged(viewer, referral) || viewer?.id === row.reporterId;
  return {
    id: row.id,
    categoryId: row.categoryId,
    areaId: row.areaId,
    description: row.description,
    urgency: row.urgency,
    status: row.status,
    verification: row.verification,
    isAnonymous: row.isAnonymous,
    reporter: canSeeIdentity(viewer, row, referral) ? { id: b.reporter.id, displayName: b.reporter.displayName } : null,
    reporterIsYou: !!viewer && viewer.id === row.reporterId,
    lat: row.lat,
    lng: row.lng,
    addressText: row.addressText,
    confirmCount: row.confirmCount,
    disputeCount: row.disputeCount,
    stillHappeningCount: row.stillCount,
    commentCount: b.commentCount,
    occurredAt: row.occurredAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    media: b.media.filter((m) => privileged || !m.publicHidden).map((m) => ({ id: m.id, url: m.url })),
    referral: referral
      ? {
          id: referral.id,
          authorityId: referral.authorityId,
          referredAt: referral.referredAt,
          acknowledgedAt: referral.acknowledgedAt,
          resolvedAt: referral.resolvedAt,
          resolutionNote: referral.resolutionNote,
        }
      : null,
    sos: sos
      ? {
          id: sos.id,
          state: sos.state,
          radiusM: sos.radiusM,
          lat: sos.lat,
          lng: sos.lng,
          issuedAt: sos.issuedAt,
          expiresAt: sos.expiresAt,
          childName: sos.childName,
          childAge: sos.childAge,
          clothing: sos.clothing,
          lastSeenAt: sos.lastSeenAt,
          pendingReview: row.reviewReason === "sos_review",
        }
      : null,
    myVote: b.myVote,
    myStillHappening: b.myStill,
  };
}
