import type { AuthorityType } from "@shomap/shared";

export interface JurisdictionRow {
  authorityId: string;
  areaId: string;
}
export interface AuthorityRow {
  id: string;
  type: AuthorityType;
}

/**
 * Category's authority type + area jurisdiction → authority id (PRD FR-6.1).
 * Returns null for community-only categories or when no authority covers the area
 * (the incident then goes to the admin "Redirected" tab).
 */
export function routeReferral(
  authorityType: AuthorityType | null,
  areaId: string,
  jurisdictions: JurisdictionRow[],
  authorities: AuthorityRow[],
): string | null {
  if (!authorityType) return null;
  const covering = new Set(jurisdictions.filter((j) => j.areaId === areaId).map((j) => j.authorityId));
  const match = authorities
    .filter((a) => a.type === authorityType && covering.has(a.id))
    .sort((a, b) => a.id.localeCompare(b.id))[0];
  return match?.id ?? null;
}
