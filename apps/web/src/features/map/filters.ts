import { ACTIVE_STATUSES, DAY_MS, URGENCY_ORDER, type IncidentDTO } from "@shomap/shared";
import type { Filters } from "../../lib/appState";

export function applyFilters(list: IncidentDTO[], f: Filters, nowMs = Date.now()): IncidentDTO[] {
  const since = nowMs - f.days * DAY_MS;
  return list.filter((i) => {
    const sosActive = i.sos?.state === "active";
    if (sosActive) return true; // an active SOS is always shown
    if (Date.parse(i.createdAt) < since) return false;
    if (f.categories.length && !f.categories.includes(i.categoryId)) return false;
    if (f.urgencies.length && !f.urgencies.includes(i.urgency)) return false;
    if (f.verification !== "all" && i.verification !== f.verification) return false;
    if (f.status === "active" && !ACTIVE_STATUSES.includes(i.status)) return false;
    if (f.status === "resolved" && !isDone(i)) return false;
    if (f.areaId && i.areaId !== f.areaId) return false;
    return true;
  });
}

/** Resolved or closed: shown faded, counted as resolved. */
export const isDone = (i: Pick<IncidentDTO, "status">) => i.status === "resolved" || i.status === "closed";

/** List order: active SOS first, then urgency, then newest. */
export function byUrgencyThenRecent(a: IncidentDTO, b: IncidentDTO): number {
  const sa = a.sos?.state === "active" ? 1 : 0;
  const sb = b.sos?.state === "active" ? 1 : 0;
  if (sa !== sb) return sb - sa;
  const u = URGENCY_ORDER[b.urgency] - URGENCY_ORDER[a.urgency];
  if (u) return u;
  return b.createdAt.localeCompare(a.createdAt);
}
