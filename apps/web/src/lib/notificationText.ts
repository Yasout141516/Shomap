import { useCallback } from "react";
import type { NotificationDTO } from "@shomap/shared";
import { useI18n } from "../i18n";
import { useMeta } from "./queries";

/** Resolves a notification's ids (category, area, authority) into localised names. */
export function useNotificationText() {
  const { t, name } = useI18n();
  const meta = useMeta();
  return useCallback(
    (n: NotificationDTO) => {
      const m = meta.data;
      const p = n.params;
      const params: Record<string, unknown> = { ...p };
      if (m) {
        if (typeof p.categoryId === "string") params.category = name(m.categories.find((c) => c.id === p.categoryId));
        if (typeof p.areaId === "string") params.area = name(m.areas.find((a) => a.id === p.areaId));
        if (typeof p.authorityId === "string") params.authority = name(m.authorities.find((a) => a.id === p.authorityId));
      }
      return t(n.titleKey, params);
    },
    [t, name, meta.data],
  );
}
