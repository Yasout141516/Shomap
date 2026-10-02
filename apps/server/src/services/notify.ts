import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { NotificationType } from "@shomap/shared";
import * as s from "../db/schema.js";
import { zonesMatching } from "../domain/watchZones.js";
import type { Effects } from "../realtime.js";
import type { Ctx } from "./context.js";

export interface NewNotification {
  userId: string;
  type: NotificationType;
  /** Key under `notifications.` in en.json / bn.json. */
  key: string;
  params?: Record<string, string | number>;
  incidentId?: string | null;
  sosAlertId?: string | null;
}

export function notify(ctx: Ctx, fx: Effects, n: NewNotification) {
  const id = randomUUID();
  ctx.db
    .insert(s.notifications)
    .values({
      id,
      userId: n.userId,
      type: n.type,
      titleKey: `notifications.${n.key}`,
      params: JSON.stringify(n.params ?? {}),
      incidentId: n.incidentId ?? null,
      sosAlertId: n.sosAlertId ?? null,
      readAt: null,
      createdAt: ctx.clock.iso(),
    })
    .run();
  fx.notifications.push(id);
}

export function notifyMany(ctx: Ctx, fx: Effects, userIds: Iterable<string>, n: Omit<NewNotification, "userId">) {
  for (const userId of new Set(userIds)) notify(ctx, fx, { ...n, userId });
}

/** Users whose watch zone contains the incident and whose minimum urgency it meets. */
export function watchersOf(ctx: Ctx, inc: s.IncidentRow): string[] {
  const zones = ctx.db.select().from(s.watchZones).all();
  return [...new Set(zonesMatching(inc, inc.urgency, zones).map((z) => z.userId))];
}

export function staffOf(ctx: Ctx, authorityId: string): string[] {
  return ctx.db
    .select({ id: s.users.id })
    .from(s.users)
    .where(and(eq(s.users.role, "authority"), eq(s.users.authorityId, authorityId)))
    .all()
    .map((u) => u.id);
}

export function adminIds(ctx: Ctx): string[] {
  return ctx.db.select({ id: s.users.id }).from(s.users).where(eq(s.users.role, "admin")).all().map((u) => u.id);
}

/** Status-change notification to the reporter and zone watchers, excluding whoever acted. */
export function notifyStatus(
  ctx: Ctx,
  fx: Effects,
  inc: s.IncidentRow,
  key: string,
  params: Record<string, string | number>,
  actorId: string | null,
) {
  const recipients = new Set([inc.reporterId, ...watchersOf(ctx, inc)]);
  if (actorId) recipients.delete(actorId);
  notifyMany(ctx, fx, recipients, {
    type: "status_change",
    key,
    params: { categoryId: inc.categoryId, areaId: inc.areaId, ...params },
    incidentId: inc.id,
  });
}
