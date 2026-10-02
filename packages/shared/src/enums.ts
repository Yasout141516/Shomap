export const ROLES = ["citizen", "authority", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const URGENCIES = ["low", "medium", "high", "critical"] as const;
export type Urgency = (typeof URGENCIES)[number];
/** Higher number = more urgent. */
export const URGENCY_ORDER: Record<Urgency, number> = { low: 0, medium: 1, high: 2, critical: 3 };

export const STATUSES = [
  "open",
  "referred",
  "acknowledged",
  "in_progress",
  "resolved",
  "closed",
  "removed",
] as const;
export type Status = (typeof STATUSES)[number];
/** Statuses that count as "active" on the map. */
export const ACTIVE_STATUSES: Status[] = ["open", "referred", "acknowledged", "in_progress"];

export const VERIFICATIONS = ["unverified", "verified", "disputed"] as const;
export type Verification = (typeof VERIFICATIONS)[number];

export const COMMENT_KINDS = ["comment", "update", "sighting", "offer_help", "official"] as const;
export type CommentKind = (typeof COMMENT_KINDS)[number];

export const NOTIFICATION_TYPES = [
  "sos",
  "sos_closed",
  "watch_zone",
  "status_change",
  "reply",
  "sighting",
  "referral",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const AUTHORITY_TYPES = ["police", "traffic", "city_corp", "wasa"] as const;
export type AuthorityType = (typeof AUTHORITY_TYPES)[number];

export const SOS_STATES = ["active", "found", "cancelled", "expired"] as const;
export type SosState = (typeof SOS_STATES)[number];

export const LANGS = ["en", "bn"] as const;
export type Lang = (typeof LANGS)[number];

export const CATEGORY_KINDS = ["light_crime", "civic", "special", "blocked"] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

export const REFERRAL_ACTIONS = ["acknowledge", "start", "resolve", "redirect"] as const;
export type ReferralAction = (typeof REFERRAL_ACTIONS)[number];

export const ADMIN_ACTIONS = ["verify", "remove", "refer", "retract_sos", "clear_review", "dismiss_flags"] as const;
export type AdminAction = (typeof ADMIN_ACTIONS)[number];

export const FLAG_REASONS = ["false", "offensive", "personal_info", "spam"] as const;
export type FlagReason = (typeof FLAG_REASONS)[number];

export const WATCH_RADII = [500, 1000, 2000, 5000] as const;

export const DASHBOARD_SCOPES = ["home", "zone", "all"] as const;
export type DashboardScope = (typeof DASHBOARD_SCOPES)[number];

export const QUEUE_REASONS = ["sos_review", "disputed", "flagged", "redirected"] as const;
export type QueueReason = (typeof QUEUE_REASONS)[number];

/** What a timeline entry records: a lifecycle move, a trust change, or an SOS alert change. */
export const EVENT_KINDS = ["status", "verification", "sos"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];
