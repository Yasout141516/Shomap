import type {
  AuthorityType,
  CategoryKind,
  CommentKind,
  DashboardScope,
  EventKind,
  Lang,
  NotificationType,
  QueueReason,
  Role,
  SosState,
  Status,
  Urgency,
  Verification,
} from "./enums.js";

export interface AreaDTO {
  id: string;
  nameEn: string;
  nameBn: string;
  cityCorp: "DNCC" | "DSCC";
  lat: number;
  lng: number;
}

export interface CategoryDTO {
  id: string;
  key: string;
  nameEn: string;
  nameBn: string;
  kind: CategoryKind;
  icon: string;
  defaultUrgency: Urgency;
  authorityType: AuthorityType | null;
  triggersSos: boolean;
  isBlocked: boolean;
  redirectHotline: string | null;
  anonymousDefault: boolean;
}

export interface AuthorityDTO {
  id: string;
  nameEn: string;
  nameBn: string;
  type: AuthorityType;
  contactPhone: string;
}

export interface MetaDTO {
  areas: AreaDTO[];
  categories: CategoryDTO[];
  authorities: AuthorityDTO[];
  demoMode: boolean;
  /** Server clock minus real time (non-zero after a demo fast-forward); clients add it to Date.now(). */
  clockOffsetMs: number;
  config: {
    confirmThreshold: number;
    reopenThreshold: number;
    sosRadiusM: number;
    maxPhotos: number;
    maxPhotoBytes: number;
    maxWatchZones: number;
    dhakaBounds: [number, number, number, number];
  };
}

export interface PersonRef {
  id: string;
  displayName: string;
}

export interface MeDTO {
  id: string;
  displayName: string;
  phone: string;
  role: Role;
  lang: Lang;
  homeAreaId: string | null;
  authorityId: string | null;
}

export interface ReferralDTO {
  id: string;
  authorityId: string;
  referredAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
}

export interface SosDTO {
  id: string;
  state: SosState;
  radiusM: number;
  lat: number;
  lng: number;
  issuedAt: string;
  expiresAt: string;
  childName: string;
  childAge: number;
  clothing: string;
  lastSeenAt: string;
  pendingReview: boolean;
  /** This viewer was sent the alert (home area or watch zone inside the radius). */
  alertedYou: boolean;
}

export interface MediaDTO {
  id: string;
  url: string;
}

export interface IncidentDTO {
  id: string;
  categoryId: string;
  areaId: string;
  description: string;
  urgency: Urgency;
  status: Status;
  verification: Verification;
  isAnonymous: boolean;
  /** null when the viewer may not see who reported it. */
  reporter: PersonRef | null;
  reporterIsYou: boolean;
  lat: number;
  lng: number;
  addressText: string | null;
  confirmCount: number;
  disputeCount: number;
  stillHappeningCount: number;
  commentCount: number;
  occurredAt: string;
  createdAt: string;
  updatedAt: string;
  media: MediaDTO[];
  referral: ReferralDTO | null;
  sos: SosDTO | null;
  myVote: "confirm" | "dispute" | null;
  myStillHappening: boolean;
}

export interface StatusEventDTO {
  id: string;
  kind: EventKind;
  fromStatus: string | null;
  /** A Status, a Verification, or an SosState, depending on `kind`. */
  toStatus: string;
  /** Free text written by a person. */
  note: string | null;
  /** System notes are stored as an i18n key (under `eventNotes.`) so they translate. */
  noteKey: string | null;
  noteParams: Record<string, string | number>;
  actorRole: Role | "system";
  actorName: string | null;
  createdAt: string;
}

export interface IncidentDetailDTO extends IncidentDTO {
  events: StatusEventDTO[];
}

export interface CommentDTO {
  id: string;
  incidentId: string;
  parentId: string | null;
  kind: CommentKind;
  body: string;
  isAnonymous: boolean;
  author: PersonRef | null;
  authorIsYou: boolean;
  authorRole: Role;
  authorityId: string | null;
  lat: number | null;
  lng: number | null;
  createdAt: string;
}

export interface NotificationDTO {
  id: string;
  type: NotificationType;
  /** i18n key under `notifications.` with `params` for interpolation. */
  titleKey: string;
  params: Record<string, string | number>;
  incidentId: string | null;
  sosAlertId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface WatchZoneDTO {
  id: string;
  label: string;
  lat: number;
  lng: number;
  radiusM: number;
  minUrgency: Urgency;
}

export interface DashboardDTO {
  scope: DashboardScope;
  scopeLabel: { en: string; bn: string };
  totals: { reported: number; highPlus: number; verified: number; resolved: number };
  byUrgency: Record<Urgency, number>;
  byCategory: { categoryId: string; count: number }[];
  trend: { date: string; reported: number; resolved: number }[];
}

export interface QueueItemDTO {
  incident: IncidentDTO;
  reason: QueueReason;
  flagCount: number;
  note: string | null;
}

export interface EventLogDTO {
  id: string;
  incidentId: string;
  kind: EventKind;
  toStatus: string;
  note: string | null;
  actorName: string | null;
  createdAt: string;
}

export interface DemoInfoDTO {
  lanUrls: string[];
  /** SVG markup of a QR code for the first LAN URL. */
  qrSvg: string | null;
  clockOffsetHours: number;
  /** `hero` names the person's part in the PRD §11 demo script, if any. */
  users: { id: string; displayName: string; role: Role; homeAreaId: string | null; authorityId: string | null; hero: string | null }[];
}

/** Socket events: server → client payloads. */
export interface ServerEvents {
  "incident:created": (incident: IncidentDTO) => void;
  "incident:updated": (incident: IncidentDTO) => void;
  "comment:created": (comment: CommentDTO) => void;
  "notification:new": (n: NotificationDTO) => void;
  "demo:reset": () => void;
  /** The demo clock moved (fast-forward): refetch the clock offset and everything time-based. */
  "demo:clock": () => void;
}
