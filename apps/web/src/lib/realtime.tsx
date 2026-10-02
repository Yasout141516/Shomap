import { useEffect } from "react";
import { io, type Socket } from "socket.io-client";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { IncidentDTO, NotificationDTO, ServerEvents } from "@shomap/shared";
import { qk, useMe, useMeta } from "./queries";
import { useApp } from "./appState";
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

/** After login, logout or a demo role switch the session cookie changes; reconnect to pick it up. */
export function reconnectSocket() {
  const s = getSocket();
  s.disconnect();
  s.connect();
}

function upsertIncident(qc: QueryClient, inc: IncidentDTO) {
  qc.setQueryData<IncidentDTO[]>(qk.incidents, (list) => {
    if (!list) return list;
    const i = list.findIndex((x) => x.id === inc.id);
    if (inc.status === "removed") return list.filter((x) => x.id !== inc.id);
    if (i === -1) return [inc, ...list];
    const copy = list.slice();
    copy[i] = inc;
    return copy;
  });
  void qc.invalidateQueries({ queryKey: qk.incident(inc.id) });
}

/** Wires Socket.IO events into the query cache. Mounted once in the app shell. */
export function RealtimeBridge() {
  const qc = useQueryClient();
  const { toast, setConnected } = useApp();
  const me = useMe();
  const meta = useMeta();
  const text = useNotificationText();

  useEffect(() => {
    const s = getSocket();
    const onConnect = () => {
      setConnected(true);
      // Catch up on anything missed while disconnected (Review Focus 3).
      void qc.invalidateQueries();
    };
    const onDisconnect = () => setConnected(false);
    const onIncident = (inc: IncidentDTO) => {
      upsertIncident(qc, inc);
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      void qc.invalidateQueries({ queryKey: qk.authorityQueue });
      void qc.invalidateQueries({ queryKey: qk.adminQueue });
      void qc.invalidateQueries({ queryKey: qk.events });
    };
    const onComment = (c: { incidentId: string }) => void qc.invalidateQueries({ queryKey: qk.comments(c.incidentId) });
    const onSos = ({ incident }: { incident: IncidentDTO }) => upsertIncident(qc, incident);
    const onSosClosed = ({ incidentId }: { incidentId: string }) => {
      void qc.invalidateQueries({ queryKey: qk.incidents });
      void qc.invalidateQueries({ queryKey: qk.incident(incidentId) });
    };
    const onNotification = (n: NotificationDTO) => {
      qc.setQueryData<NotificationDTO[]>(qk.notifications, (list) => (list ? [n, ...list] : list));
      void qc.invalidateQueries({ queryKey: qk.notifications });
      const tone = n.type === "sos" ? "sos" : n.type === "status_change" && n.params.authorityId ? "official" : n.type === "sos_closed" ? "success" : "info";
      toast(text(n), tone, n.incidentId ? `/incident/${n.incidentId}` : undefined);
    };
    const onReset = () => {
      qc.clear();
      void qc.invalidateQueries();
    };

    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);
    s.on("incident:created", onIncident);
    s.on("incident:updated", onIncident);
    s.on("comment:created", onComment);
    s.on("sos:issued", onSos);
    s.on("sos:closed", onSosClosed);
    s.on("notification:new", onNotification);
    s.on("demo:reset", onReset);
    return () => {
      s.off("connect", onConnect);
      s.off("disconnect", onDisconnect);
      s.off("incident:created", onIncident);
      s.off("incident:updated", onIncident);
      s.off("comment:created", onComment);
      s.off("sos:issued", onSos);
      s.off("sos:closed", onSosClosed);
      s.off("notification:new", onNotification);
      s.off("demo:reset", onReset);
    };
  }, [qc, toast, setConnected, text, meta.data]);

  // Reconnect when the logged-in user changes so the server serialises for the right viewer.
  const userId = me.data?.id ?? null;
  useEffect(() => {
    reconnectSocket();
  }, [userId]);

  return null;
}
