import { useMemo } from "react";
import type { AreaDTO, AuthorityDTO, CategoryDTO } from "@shomap/shared";
import { useMeta } from "./queries";

/** id → row lookups over the reference data, built once per load instead of `.find` per render. */
export function useLookup() {
  const meta = useMeta();
  return useMemo(() => {
    const areas = new Map((meta.data?.areas ?? []).map((a) => [a.id, a]));
    const categories = new Map((meta.data?.categories ?? []).map((c) => [c.id, c]));
    const authorities = new Map((meta.data?.authorities ?? []).map((a) => [a.id, a]));
    return {
      area: (id: string | null | undefined): AreaDTO | undefined => (id ? areas.get(id) : undefined),
      category: (id: string | null | undefined): CategoryDTO | undefined => (id ? categories.get(id) : undefined),
      authority: (id: string | null | undefined): AuthorityDTO | undefined => (id ? authorities.get(id) : undefined),
    };
  }, [meta.data]);
}
