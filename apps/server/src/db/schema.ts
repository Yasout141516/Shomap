import { sqliteTable, text, integer, real, primaryKey, uniqueIndex, index } from "drizzle-orm/sqlite-core";

/** Tables follow PRD diagram 06 (ERD). IDs are strings; timestamps are ISO-8601 UTC text. */

export const areas = sqliteTable("areas", {
  id: text("id").primaryKey(),
  nameEn: text("name_en").notNull(),
  nameBn: text("name_bn").notNull(),
  cityCorp: text("city_corp", { enum: ["DNCC", "DSCC"] }).notNull(),
  lat: real("centroid_lat").notNull(),
  lng: real("centroid_lng").notNull(),
});

export const authorities = sqliteTable("authorities", {
  id: text("id").primaryKey(),
  nameEn: text("name_en").notNull(),
  nameBn: text("name_bn").notNull(),
  type: text("type", { enum: ["police", "traffic", "city_corp", "wasa"] }).notNull(),
  contactPhone: text("contact_phone").notNull().default(""),
});

export const jurisdictions = sqliteTable(
  "jurisdictions",
  {
    authorityId: text("authority_id").notNull().references(() => authorities.id),
    areaId: text("area_id").notNull().references(() => areas.id),
  },
  (t) => ({ pk: primaryKey({ columns: [t.authorityId, t.areaId] }) }),
);

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  phone: text("phone").notNull().unique(),
  role: text("role", { enum: ["citizen", "authority", "admin"] }).notNull(),
  lang: text("lang", { enum: ["en", "bn"] }).notNull().default("en"),
  homeAreaId: text("home_area_id").references(() => areas.id),
  authorityId: text("authority_id").references(() => authorities.id),
  createdAt: text("created_at").notNull(),
});

export const categories = sqliteTable("categories", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  nameEn: text("name_en").notNull(),
  nameBn: text("name_bn").notNull(),
  kind: text("kind", { enum: ["light_crime", "civic", "special", "blocked"] }).notNull(),
  icon: text("icon").notNull(),
  defaultUrgency: text("default_urgency", { enum: ["low", "medium", "high", "critical"] }).notNull(),
  authorityType: text("authority_type", { enum: ["police", "traffic", "city_corp", "wasa"] }),
  triggersSos: integer("triggers_sos", { mode: "boolean" }).notNull().default(false),
  isBlocked: integer("is_blocked", { mode: "boolean" }).notNull().default(false),
  redirectHotline: text("redirect_hotline"),
  anonymousDefault: integer("anonymous_default", { mode: "boolean" }).notNull().default(false),
  sort: integer("sort").notNull().default(0),
});

export const incidents = sqliteTable(
  "incidents",
  {
    id: text("id").primaryKey(),
    reporterId: text("reporter_id").notNull().references(() => users.id),
    categoryId: text("category_id").notNull().references(() => categories.id),
    areaId: text("area_id").notNull().references(() => areas.id),
    description: text("description").notNull(),
    urgency: text("urgency", { enum: ["low", "medium", "high", "critical"] }).notNull(),
    status: text("status", {
      enum: ["open", "referred", "acknowledged", "in_progress", "resolved", "closed", "removed"],
    }).notNull(),
    verification: text("verification", { enum: ["unverified", "verified", "disputed"] }).notNull(),
    isAnonymous: integer("is_anonymous", { mode: "boolean" }).notNull().default(false),
    lat: real("lat").notNull(),
    lng: real("lng").notNull(),
    addressText: text("address_text"),
    confirmCount: integer("confirm_count").notNull().default(0),
    disputeCount: integer("dispute_count").notNull().default(0),
    stillCount: integer("still_count").notNull().default(0),
    /** Admin queue marker: 'sos_review' | 'redirected' | null. Disputed and flagged are derived. */
    reviewReason: text("review_reason"),
    reviewNote: text("review_note"),
    idempotencyKey: text("idempotency_key").unique(),
    occurredAt: text("occurred_at").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    resolvedAt: text("resolved_at"),
  },
  (t) => ({
    byCreated: index("incidents_created_idx").on(t.createdAt),
    byReporter: index("incidents_reporter_idx").on(t.reporterId, t.createdAt),
  }),
);

export const incidentMedia = sqliteTable("incident_media", {
  id: text("id").primaryKey(),
  incidentId: text("incident_id").notNull().references(() => incidents.id),
  url: text("url").notNull(),
  publicHidden: integer("public_hidden", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
});

export const verifications = sqliteTable(
  "verifications",
  {
    id: text("id").primaryKey(),
    incidentId: text("incident_id").notNull().references(() => incidents.id),
    userId: text("user_id").notNull().references(() => users.id),
    vote: text("vote", { enum: ["confirm", "dispute"] }).notNull(),
    note: text("note"),
    createdAt: text("created_at").notNull(),
  },
  (t) => ({ onePerUser: uniqueIndex("verifications_incident_user").on(t.incidentId, t.userId) }),
);

export const stillHappening = sqliteTable(
  "still_happening",
  {
    incidentId: text("incident_id").notNull().references(() => incidents.id),
    userId: text("user_id").notNull().references(() => users.id),
    createdAt: text("created_at").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.incidentId, t.userId] }) }),
);

export const comments = sqliteTable(
  "comments",
  {
    id: text("id").primaryKey(),
    incidentId: text("incident_id").notNull().references(() => incidents.id),
    authorId: text("author_id").notNull().references(() => users.id),
    parentId: text("parent_id"),
    kind: text("kind", { enum: ["comment", "update", "sighting", "offer_help", "official"] }).notNull(),
    body: text("body").notNull(),
    isAnonymous: integer("is_anonymous", { mode: "boolean" }).notNull().default(false),
    isHidden: integer("is_hidden", { mode: "boolean" }).notNull().default(false),
    lat: real("lat"),
    lng: real("lng"),
    createdAt: text("created_at").notNull(),
  },
  (t) => ({ byIncident: index("comments_incident_idx").on(t.incidentId, t.createdAt) }),
);

export const referrals = sqliteTable("referrals", {
  id: text("id").primaryKey(),
  /** Unique: an incident is referred at most once at a time (Review Focus 1). */
  incidentId: text("incident_id").notNull().unique().references(() => incidents.id),
  authorityId: text("authority_id").notNull().references(() => authorities.id),
  source: text("source", { enum: ["auto", "admin"] }).notNull(),
  referredAt: text("referred_at").notNull(),
  acknowledgedAt: text("acknowledged_at"),
  resolvedAt: text("resolved_at"),
  resolutionNote: text("resolution_note"),
});

export const statusEvents = sqliteTable(
  "status_events",
  {
    id: text("id").primaryKey(),
    incidentId: text("incident_id").notNull().references(() => incidents.id),
    actorId: text("actor_id"),
    actorRole: text("actor_role").notNull(),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    note: text("note"),
    createdAt: text("created_at").notNull(),
  },
  (t) => ({ byIncident: index("status_events_incident_idx").on(t.incidentId, t.createdAt) }),
);

export const watchZones = sqliteTable("watch_zones", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  label: text("label").notNull(),
  lat: real("center_lat").notNull(),
  lng: real("center_lng").notNull(),
  radiusM: integer("radius_m").notNull(),
  minUrgency: text("min_urgency", { enum: ["low", "medium", "high", "critical"] }).notNull(),
  createdAt: text("created_at").notNull(),
});

export const sosAlerts = sqliteTable("sos_alerts", {
  id: text("id").primaryKey(),
  incidentId: text("incident_id").notNull().unique().references(() => incidents.id),
  lat: real("center_lat").notNull(),
  lng: real("center_lng").notNull(),
  radiusM: integer("radius_m").notNull(),
  state: text("state", { enum: ["active", "found", "cancelled", "expired"] }).notNull(),
  childName: text("child_name").notNull(),
  childAge: integer("child_age").notNull(),
  clothing: text("clothing").notNull(),
  lastSeenAt: text("last_seen_at").notNull(),
  issuedAt: text("issued_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  closedAt: text("closed_at"),
});

export const notifications = sqliteTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    incidentId: text("incident_id"),
    sosAlertId: text("sos_alert_id"),
    type: text("type").notNull(),
    titleKey: text("title_key").notNull(),
    params: text("params").notNull().default("{}"),
    readAt: text("read_at"),
    createdAt: text("created_at").notNull(),
  },
  (t) => ({ byUser: index("notifications_user_idx").on(t.userId, t.createdAt) }),
);

export const abuseFlags = sqliteTable(
  "abuse_flags",
  {
    id: text("id").primaryKey(),
    targetType: text("target_type", { enum: ["incident", "comment"] }).notNull(),
    targetId: text("target_id").notNull(),
    incidentId: text("incident_id").notNull(),
    flaggedBy: text("flagged_by").notNull().references(() => users.id),
    reason: text("reason").notNull(),
    state: text("state", { enum: ["open", "actioned", "dismissed"] }).notNull().default("open"),
    createdAt: text("created_at").notNull(),
  },
  (t) => ({ onePerUser: uniqueIndex("abuse_flags_target_user").on(t.targetType, t.targetId, t.flaggedBy) }),
);

export const appState = sqliteTable("app_state", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export type AreaRow = typeof areas.$inferSelect;
export type AuthorityRow = typeof authorities.$inferSelect;
export type UserRow = typeof users.$inferSelect;
export type CategoryRow = typeof categories.$inferSelect;
export type IncidentRow = typeof incidents.$inferSelect;
export type CommentRow = typeof comments.$inferSelect;
export type ReferralRow = typeof referrals.$inferSelect;
export type SosAlertRow = typeof sosAlerts.$inferSelect;
export type WatchZoneRow = typeof watchZones.$inferSelect;
export type NotificationRow = typeof notifications.$inferSelect;
