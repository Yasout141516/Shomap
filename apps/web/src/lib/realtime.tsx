import { useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import { useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query";
import type { CommentDTO, IncidentDTO, NotificationDTO, ServerEvents } from "@shomap/shared";
import { qk, useMe } from "./queries";
import { useApp, useToast } from "./appState";
import { useNotificationText } from "./notificationText";

let socket: Socket<ServerEvents> | null = null;

export function getSocket(): Socket<ServerEvents> {
  if (!socket) {
    socket = io({ path: "/socket.io", withCredentials: true, transports: ["websocket", "polling"] });
    // Lets the e2e test drop and restore the connection deterministically.
    (window as unknown as { __shomapSocket?: Socket }).__shomapSocket = socket;
  }
  return socket;
}

/** Puts a fresh incident into the map/feed list (used by socket events and mutation responses). */
export function upsertIncident(qc: QueryClient, inc: IncidentDTO) {
  qc.setQueryData<IncidentDTO[]>(qk.incidents, (list) => {
    if (!list) return list;
    if (inc.status === "removed") return list.filter((x) => x.id !== inc.id);
    const i = list.findIndex((x) => x.id === inc.id);
    if (i === -1) return [inc, ...list];
    const copy = list.slice();
    copy[i] = inc;
    return copy;
  });
}

/** Views derived from incidents; refreshed once per burst of events, not once per event. */
const DERIVED: QueryKey[] = [["dashboard"], qk.authorityQueue, qk.adminQueue, qk.events];

/** Wires Socket.IO events into the query cache. Mounted once in the app shell. */
export function RealtimeBridge() {
  const qc = useQueryClient();
  const { setConnected } = useApp();
  const { toast } = useToast();
  const me = useMe();
  const text = useNotificationText();

  useEffect(() => {
    const s = getSocket();
    let connectedBefore = false;
    let pending = new Set<string>();
    let timer: number | undefined;
    const invalidateSoon = (keys: QueryKey[]) => {
      for (const k of keys) pending.add(JSON.stringify(k));
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        for (const k of pending) void qc.invalidateQueries({ queryKey: JSON.parse(k) as QueryKey });
        pending = new Set();
      }, 150);
    };

    const handlers = {
      connect: () => {
        setConnected(true);
        // A *re*connect may have missed events (Review Focus 3); the first connect hasn't.
        if (connectedBefore) void qc.invalidateQueries();
        connectedBefore = true;
      },
      disconnect: () => setConnected(false),
      "incident:created": (inc: IncidentDTO) => onIncident(inc),
      "incident:updated": (inc: IncidentDTO) => onIncident(inc),
      "comment:created": (c: CommentDTO) => invalidateSoon([qk.comments(c.incidentId)]),
      "notification:new": (n: NotificationDTO) => {
        qc.setQueryData<NotificationDTO[]>(qk.notifications, (list) => (list ? [n, ...list] : list));
        const tone = n.type === "sos" ? "sos" : n.type === "sos_closed" ? "success" : n.type === "status_change" && n.params.authorityId ? "official" : "info";
        toast(text(n), tone, n.incidentId ? `/incident/${n.incidentId}` : undefined);
      },
      "demo:reset": () => {
        qc.clear();
        void qc.invalidateQueries();
      },
    } as const;
    function onIncident(inc: IncidentDTO) {
      upsertIncident(qc, inc);
      // The detail view also carries the timeline, which the event doesn't, so refetch it if open.
      invalidateSoon([qk.incident(inc.id), ...DERIVED]);
    }

    const entries = Object.entries(handlers) as [string, (...args: never[]) => void][];
    for (const [ev, fn] of entries) s.on(ev as "connect", fn as () => void);
    return () => {
      window.clearTimeout(timer);
      for (const [ev, fn] of entries) s.off(ev as "connect", fn as () => void);
    };
  }, [qc, toast, setConnected, text]);

  // The server serialises per viewer, so reconnect when the logged-in user actually changes.
  const userId = me.isSuccess ? me.data?.id ?? null : undefined;
  const lastUser = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (userId === undefined) return; // still loading
    if (lastUser.current !== undefined && lastUser.current !== userId) {
      const s = getSocket();
      s.disconnect();
      s.connect();
    }
    lastUser.current = userId;
  }, [userId]);

  return null;
}
