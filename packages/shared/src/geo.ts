export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_M = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in metres. Accurate enough at city scale. */
export function haversineM(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Inclusive bounding-box check. bounds = [minLng, minLat, maxLng, maxLat]. */
export function inBounds(pt: LatLng, bounds: [number, number, number, number]): boolean {
  const [minLng, minLat, maxLng, maxLat] = bounds;
  return pt.lng >= minLng && pt.lng <= maxLng && pt.lat >= minLat && pt.lat <= maxLat;
}

export function nearestArea<T extends LatLng>(pt: LatLng, areas: T[]): T {
  if (areas.length === 0) throw new Error("nearestArea: no areas");
  let best = areas[0];
  let bestD = haversineM(pt, best);
  for (const a of areas.slice(1)) {
    const d = haversineM(pt, a);
    if (d < bestD) {
      best = a;
      bestD = d;
    }
  }
  return best;
}

/** Two circles overlap when their centres are strictly closer than the sum of radii. */
export function circlesOverlap(a: LatLng, ra: number, b: LatLng, rb: number): boolean {
  return haversineM(a, b) < ra + rb;
}
