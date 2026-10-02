import { inArray } from "drizzle-orm";
import type { Server, Socket } from "socket.io";
import type { NotificationDTO, ServerEvents } from "@shomap/shared";
import type { DB } from "./db/client.js";
import * as s from "./db/schema.js";
import { commentDTOs, loadShared, loadViewerState, serializeFor, usersById } from "./services/repo.js";
import { toViewer } from "./auth.js";

/** Side effects collected during a write; flushed to sockets after the transaction commits. */
export class Effects {
  created = new Set<string>();
  updated = new Set<string>();
  comments: { incidentId: string; id: string }[] = [];
  notifications: string[] = [];
  reset = false;

  isEmpty() {
    return !this.reset && !this.created.size && !this.updated.size && !this.comments.length && !this.notifications.length;
  }
}

export function notificationDTO(n: s.NotificationRow): NotificationDTO {
  return {
    id: n.id,
    type: n.type as NotificationDTO["type"],
    titleKey: n.titleKey,
    params: JSON.parse(n.params),
    incidentId: n.incidentId,
    sosAlertId: n.sosAlertId,
    readAt: n.readAt,
    createdAt: n.createdAt,
  };
}

type IO = Server<Record<string, never>, ServerEvents>;
const GUESTS = "guests";
const roomOf = (userId: string | null) => (userId ? `user:${userId}` : GUESTS);

export class Realtime {
  private io: IO | null = null;

  constructor(private readonly db: DB) {}

  attach(io: IO, userIdFromSocket: (socket: Socket) => string | null) {
    this.io = io;
    io.on("connection", (socket) => {
      const userId = userIdFromSocket(socket);
      socket.data.userId = userId;
      void socket.join(roomOf(userId));
    });
  }

  /** A payload-less event for every client (e.g. the demo clock moved). */
  broadcast(event: "demo:clock") {
    this.io?.emit(event);
  }

  /**
   * Serialises each change once per distinct viewer (anonymity rules apply to real-time payloads
   * exactly as to REST, spec §4) and emits it to that viewer's room.
   */
  async flush(fx: Effects): Promise<void> {
    const io = this.io;
    if (!io || fx.isEmpty()) return;
    if (fx.reset) {
      io.emit("demo:reset");
      return;
    }

    const ids = [...new Set([...fx.created, ...fx.updated])];
    if (ids.length || fx.comments.length) {
      const viewerIds = new Set<string | null>((await io.fetchSockets()).map((sock) => (sock.data.userId as string | null) ?? null));
      const users = usersById(this.db, [...viewerIds].filter((x): x is string => !!x));
      const rows = ids.length ? this.db.select().from(s.incidents).where(inArray(s.incidents.id, ids)).all() : [];
      const shared = loadShared(this.db, rows);
      for (const viewerId of viewerIds) {
        const viewer = toViewer(viewerId ? users.get(viewerId) ?? null : null);
        const room = io.to(roomOf(viewerId));
        for (const dto of serializeFor(shared, loadViewerState(this.db, ids, viewer?.id ?? null), viewer)) {
          room.emit(fx.created.has(dto.id) ? "incident:created" : "incident:updated", dto);
        }
        for (const c of fx.comments) for (const dto of commentDTOs(this.db, c.incidentId, viewer, [c.id])) room.emit("comment:created", dto);
      }
    }
    if (fx.notifications.length) {
      const notes = this.db.select().from(s.notifications).where(inArray(s.notifications.id, fx.notifications)).all();
      for (const n of notes) io.to(roomOf(n.userId)).emit("notification:new", notificationDTO(n));
    }
  }
}
