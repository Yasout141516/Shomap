import type { DemoInfoDTO } from "@shomap/shared";
import type { useLookup } from "./lookup";

type DemoUser = DemoInfoDTO["users"][number];
type Named = { nameEn: string; nameBn: string } | undefined;

/** "Citizen · Farmgate" / "Authority · Tejgaon Thana" for the account pickers. */
export function describeUser(u: DemoUser, t: (k: string) => string, name: (o: Named) => string, lookup: ReturnType<typeof useLookup>): string {
  const place = lookup.area(u.homeAreaId) ?? lookup.authority(u.authorityId);
  return `${t(`roles.${u.role}`)}${place ? ` · ${name(place)}` : ""}`;
}
