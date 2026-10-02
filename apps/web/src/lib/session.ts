import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { AreaDTO, MeDTO } from "@shomap/shared";
import { api } from "./api";
import { qk, useMe, useMeta } from "./queries";
import { setLanguage } from "../i18n";

const GUEST_AREA_KEY = "shomap.homeArea";

export function guestArea(): string | null {
  try {
    return localStorage.getItem(GUEST_AREA_KEY);
  } catch {
    return null;
  }
}
export function setGuestArea(id: string) {
  try {
    localStorage.setItem(GUEST_AREA_KEY, id);
  } catch {
    /* fine: the choice lasts for this page view */
  }
}

/** Home area for map centring and the dashboard: the account's, else the guest's choice. */
export function useHomeAreaId(): string | null {
  const me = useMe();
  return me.data?.homeAreaId ?? guestArea();
}

/** Where to centre maps: the home area, else Farmgate (central Dhaka). One fallback rule for every map. */
export function useHomeArea(): AreaDTO | undefined {
  const id = useHomeAreaId();
  const meta = useMeta();
  return meta.data?.areas.find((a) => a.id === id) ?? meta.data?.areas.find((a) => a.id === "farmgate");
}

export function useSession() {
  const qc = useQueryClient();
  const me = useMe();

  // Changing user changes `me`; RealtimeBridge then reconnects the socket and refetches
  // everything once (it's all serialised per viewer), so nothing else to do here.
  const afterChange = useCallback(
    (next: MeDTO | null) => {
      qc.setQueryData(qk.me, next);
      if (next?.lang) setLanguage(next.lang);
    },
    [qc],
  );

  const switchTo = useCallback(
    async (userId: string) => {
      const { me: next } = await api<{ me: MeDTO }>("/api/demo/switch-role", { body: { userId } });
      afterChange(next);
      return next;
    },
    [afterChange],
  );

  const logout = useCallback(async () => {
    await api("/api/auth/logout", { method: "POST" });
    afterChange(null);
  }, [afterChange]);

  const updateMe = useCallback(
    async (patch: Partial<Pick<MeDTO, "lang" | "homeAreaId" | "displayName">>) => {
      const { me: next } = await api<{ me: MeDTO }>("/api/me", { method: "PATCH", body: patch });
      qc.setQueryData(qk.me, next);
      return next;
    },
    [qc],
  );

  return { me: me.data ?? null, loading: me.isLoading, afterChange, switchTo, logout, updateMe };
}
