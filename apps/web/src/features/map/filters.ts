import { URGENCY_ORDER, type IncidentDTO } from "@shomap/shared";
import { ACTIVE, type Filters } from "../../lib/appState";

export function applyFilters(list: IncidentDTO[], f: Filters, nowMs = Date.now()): IncidentDTO[] {
  const since = nowMs - f.days * 24 * 3_600_000;
  return list.filter((i) => {
    const sosActive = i.sos?.state === "active";
    if (sosActive) return true; // an active SOS is always shown
    if (Date.parse(i.createdAt) < since) return false;
    if (f.categories.length && !f.categories.includes(i.categoryId)) return false;
    if (f.urgencies.length && !f.urgencies.includes(i.urgency)) return false;
    if (f.verification !== "all" && i.verification !== f.verification) return false;
    if (f.status === "active" && !ACTIVE.includes(i.status)) return false;
    if (f.status === "resolved" && i.status !== "resolved" && i.status !== "closed") return false;
    if (f.areaId && i.areaId !== f.areaId) return false;
    return true;
  });
}

/** List order: active SOS first, then urgency, then newest. */
export function byUrgencyThenRecent(a: IncidentDTO, b: IncidentDTO): number {
  const sa = a.sos?.state === "active" ? 1 : 0;
  const sb = b.sos?.state === "active" ? 1 : 0;
  if (sa !== sb) return sb - sa;
  const u = URGENCY_ORDER[b.urgency] - URGENCY_ORDER[a.urgency];
  if (u) return u;
  return b.createdAt.localeCompare(a.createdAt);
}
