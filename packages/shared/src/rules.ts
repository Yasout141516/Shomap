import { URGENCIES, type Role, type Urgency } from "./enums.js";

export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;
/** Bangladesh Standard Time (UTC+6, no DST), for day buckets and form inputs. */
export const DHAKA_OFFSET_MS = 6 * HOUR_MS;

/**
 * PRD §4.2: a reporter may move urgency one level from the category default; only SOS
 * (and admins) reach critical. The server clamps to this list; the report form offers it.
 */
export function allowedUrgencies(categoryDefault: Urgency): Urgency[] {
  const d = URGENCIES.indexOf(categoryDefault);
  return URGENCIES.filter((_, i) => Math.abs(i - d) <= 1 && i < URGENCIES.indexOf("critical"));
}

export function clampUrgency(requested: Urgency | undefined, categoryDefault: Urgency): Urgency {
  const allowed = allowedUrgencies(categoryDefault);
  if (requested && allowed.includes(requested)) return requested;
  return allowed.includes(categoryDefault) ? categoryDefault : allowed[allowed.length - 1];
}

/** Where each role lands after login or an account switch. */
export function homeRouteFor(role: Role): string {
  return role === "authority" ? "/authority" : role === "admin" ? "/admin" : "/";
}
