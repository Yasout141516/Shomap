import type { LatLng } from "@shomap/shared";

export { haversineM, inBounds, nearestArea as nearest, type LatLng } from "@shomap/shared";

/** A circle as a GeoJSON polygon (for watch zones and the SOS radius). */
export function circlePolygon(center: LatLng, radiusM: number, steps = 64): GeoJSON.Feature<GeoJSON.Polygon> {
  const coords: [number, number][] = [];
  const dLat = radiusM / 111_320;
  const dLng = radiusM / (111_320 * Math.cos((center.lat * Math.PI) / 180));
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    coords.push([center.lng + dLng * Math.cos(a), center.lat + dLat * Math.sin(a)]);
  }
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [coords] } };
}
