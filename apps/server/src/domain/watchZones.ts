import { URGENCY_ORDER, haversineM, type LatLng, type Urgency } from "@shomap/shared";

export interface ZoneRow extends LatLng {
  id: string;
  userId: string;
  radiusM: number;
  minUrgency: Urgency;
}

/** PRD FR-10.3: zones containing the point whose minimum urgency is met. */
export function zonesMatching<T extends ZoneRow>(pt: LatLng, urgency: Urgency, zones: T[]): T[] {
  return zones.filter(
    (z) => haversineM(pt, z) <= z.radiusM && URGENCY_ORDER[urgency] >= URGENCY_ORDER[z.minUrgency],
  );
}
