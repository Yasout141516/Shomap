import { z } from "zod";
import {
  ADMIN_ACTIONS,
  FLAG_REASONS,
  LANGS,
  REFERRAL_ACTIONS,
  URGENCIES,
  WATCH_RADII,
} from "./enums.js";

const lat = z.number().min(-90).max(90);
const lng = z.number().min(-180).max(180);

/** Bangladeshi mobile number: 01XXXXXXXXX (11 digits). */
export const LoginInput = z.object({
  phone: z.string().regex(/^01\d{9}$/),
  otp: z.string().min(4).max(6),
  displayName: z.string().trim().min(2).max(40).optional(),
});
export type LoginInput = z.infer<typeof LoginInput>;

export const MePatch = z.object({
  lang: z.enum(LANGS).optional(),
  homeAreaId: z.string().optional(),
  displayName: z.string().trim().min(2).max(40).optional(),
});
export type MePatch = z.infer<typeof MePatch>;

export const SosDetailsInput = z.object({
  childName: z.string().trim().min(1).max(40),
  childAge: z.number().int().min(0).max(17),
  clothing: z.string().trim().min(3).max(200),
  lastSeenAt: z.string().datetime(),
});
export type SosDetailsInput = z.infer<typeof SosDetailsInput>;

/** Sent as the JSON `data` field of the multipart report request. */
export const ReportInput = z.object({
  categoryId: z.string(),
  lat,
  lng,
  description: z.string().trim().min(10).max(280),
  urgency: z.enum(URGENCIES).optional(),
  occurredAt: z.string().datetime().optional(),
  isAnonymous: z.boolean().default(false),
  addressText: z.string().trim().max(120).optional(),
  sos: SosDetailsInput.optional(),
  idempotencyKey: z.string().min(8).max(64),
});
export type ReportInput = z.infer<typeof ReportInput>;

export const VoteInput = z.object({
  vote: z.enum(["confirm", "dispute"]),
  note: z.string().trim().max(200).optional(),
});
export type VoteInput = z.infer<typeof VoteInput>;

export const CommentInput = z
  .object({
    body: z.string().trim().min(1).max(500),
    kind: z.enum(["comment", "update", "sighting", "offer_help"]).default("comment"),
    parentId: z.string().optional(),
    isAnonymous: z.boolean().default(false),
    lat: lat.optional(),
    lng: lng.optional(),
  })
  .refine((c) => (c.lat === undefined) === (c.lng === undefined), { message: "lat and lng go together" });
export type CommentInput = z.infer<typeof CommentInput>;

export const ReferralActionInput = z
  .object({
    action: z.enum(REFERRAL_ACTIONS),
    note: z.string().trim().max(300).optional(),
  })
  .refine((a) => !(a.action === "resolve" || a.action === "redirect") || (a.note && a.note.length >= 3), {
    message: "A note is required to resolve or redirect",
    path: ["note"],
  });
export type ReferralActionInput = z.infer<typeof ReferralActionInput>;

export const AdminActionInput = z
  .object({
    action: z.enum(ADMIN_ACTIONS),
    note: z.string().trim().max(300).optional(),
    authorityId: z.string().optional(),
  })
  .refine((a) => a.action !== "remove" || (a.note && a.note.length >= 3), {
    message: "A reason is required to remove",
    path: ["note"],
  })
  .refine((a) => a.action !== "refer" || !!a.authorityId, { message: "Pick an authority", path: ["authorityId"] });
export type AdminActionInput = z.infer<typeof AdminActionInput>;

export const WatchZoneInput = z.object({
  label: z.string().trim().min(1).max(30),
  lat,
  lng,
  radiusM: z
    .number()
    .int()
    .refine((r) => (WATCH_RADII as readonly number[]).includes(r), { message: "Radius must be 500, 1000, 2000 or 5000 m" }),
  minUrgency: z.enum(URGENCIES).default("high"),
});
export type WatchZoneInput = z.infer<typeof WatchZoneInput>;

export const FlagInput = z.object({
  targetType: z.enum(["incident", "comment"]),
  targetId: z.string(),
  reason: z.enum(FLAG_REASONS),
});
export type FlagInput = z.infer<typeof FlagInput>;

export const SwitchRoleInput = z.object({ userId: z.string() });
export type SwitchRoleInput = z.infer<typeof SwitchRoleInput>;
