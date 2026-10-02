import { circlesOverlap, haversineM, type LatLng } from "@shomap/shared";

export interface SosCircle extends LatLng {
  radiusM: number;
}
export interface UserHome {
  id: string;
  home: LatLng | null;
}
export interface ZoneCircle extends LatLng {
  userId: string;
  radiusM: number;
}

/**
 * PRD FR-8.3: everyone whose home-area centroid is inside the radius, or whose watch zone
 * overlaps the alert circle. The reporter is excluded. Order is stable (input order).
 */
export function sosRecipients(alert: SosCircle, users: UserHome[], zones: ZoneCircle[], reporterId: string): string[] {
  const out = new Set<string>();
  for (const u of users) {
    if (u.id !== reporterId && u.home && haversineM(alert, u.home) <= alert.radiusM) out.add(u.id);
  }
  for (const z of zones) {
    if (z.userId !== reporterId && circlesOverlap(alert, alert.radiusM, z, z.radiusM)) out.add(z.userId);
  }
  return [...out];
}
