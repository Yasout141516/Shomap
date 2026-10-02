import { useQuery } from "@tanstack/react-query";
import type {
  CommentDTO,
  DashboardDTO,
  DashboardScope,
  DemoInfoDTO,
  EventLogDTO,
  IncidentDTO,
  IncidentDetailDTO,
  MeDTO,
  MetaDTO,
  NotificationDTO,
  QueueItemDTO,
  WatchZoneDTO,
} from "@shomap/shared";
import { api } from "./api";

export const qk = {
  meta: ["meta"] as const,
  me: ["me"] as const,
  incidents: ["incidents"] as const,
  incident: (id: string) => ["incident", id] as const,
  comments: (id: string) => ["comments", id] as const,
  notifications: ["notifications"] as const,
  zones: ["zones"] as const,
  dashboard: (scope: string, id?: string) => ["dashboard", scope, id ?? ""] as const,
  authorityQueue: ["authority-queue"] as const,
  adminQueue: ["admin-queue"] as const,
  events: ["admin-events"] as const,
  demo: ["demo-info"] as const,
};

export const useMeta = () => useQuery({ queryKey: qk.meta, queryFn: () => api<MetaDTO>("/api/meta"), staleTime: Infinity });

export const useMe = () =>
  useQuery({ queryKey: qk.me, queryFn: async () => (await api<{ me: MeDTO | null }>("/api/me")).me, staleTime: 60_000 });

export const useIncidents = () =>
  useQuery({
    queryKey: qk.incidents,
    queryFn: async () => (await api<{ incidents: IncidentDTO[] }>("/api/incidents?days=14")).incidents,
  });

export const useIncident = (id: string | undefined) =>
  useQuery({
    queryKey: qk.incident(id ?? ""),
    queryFn: async () => (await api<{ incident: IncidentDetailDTO }>(`/api/incidents/${id}`)).incident,
    enabled: !!id,
    retry: (count, err) => (err as { status?: number }).status !== 404 && count < 2,
  });

export const useComments = (id: string | undefined) =>
  useQuery({
    queryKey: qk.comments(id ?? ""),
    queryFn: async () => (await api<{ comments: CommentDTO[] }>(`/api/incidents/${id}/comments`)).comments,
    enabled: !!id,
  });

export const useNotifications = (enabled: boolean) =>
  useQuery({
    queryKey: qk.notifications,
    queryFn: async () => (await api<{ notifications: NotificationDTO[] }>("/api/notifications")).notifications,
    enabled,
  });

/** The logged-in citizen's watch zones (nothing for guests and staff). */
export function useZones() {
  const me = useMe();
  return useQuery({
    queryKey: qk.zones,
    queryFn: async () => (await api<{ zones: WatchZoneDTO[] }>("/api/watch-zones")).zones,
    enabled: me.data?.role === "citizen",
  });
}

/** `id` is the zone id for scope "zone", or the home area id for scope "home". */
export const useDashboard = (scope: DashboardScope, id?: string) =>
  useQuery({
    queryKey: qk.dashboard(scope, id),
    queryFn: async () => {
      const param = id ? (scope === "zone" ? `&zoneId=${id}` : `&areaId=${id}`) : "";
      return (await api<{ dashboard: DashboardDTO }>(`/api/dashboard?scope=${scope}${param}`)).dashboard;
    },
  });

export const useAuthorityQueue = (enabled: boolean) =>
  useQuery({
    queryKey: qk.authorityQueue,
    queryFn: async () => (await api<{ incidents: IncidentDTO[] }>("/api/authority/queue")).incidents,
    enabled,
  });

export const useAdminQueue = (enabled: boolean) =>
  useQuery({
    queryKey: qk.adminQueue,
    queryFn: async () => (await api<{ items: QueueItemDTO[] }>("/api/admin/queue")).items,
    enabled,
  });

export const useEventLog = (enabled: boolean) =>
  useQuery({
    queryKey: qk.events,
    queryFn: async () => (await api<{ events: EventLogDTO[] }>("/api/admin/events")).events,
    enabled,
  });

export const useDemoInfo = (enabled: boolean) =>
  useQuery({ queryKey: qk.demo, queryFn: () => api<DemoInfoDTO>("/api/demo/info"), enabled });
