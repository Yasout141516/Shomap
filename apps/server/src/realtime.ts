import { eq, inArray } from "drizzle-orm";
import type { Server, Socket } from "socket.io";
import type { NotificationDTO, ServerEvents, SosState } from "@shomap/shared";
import type { DB } from "./db/client.js";
import * as s from "./db/schema.js";
import { commentDTOs, incidentDTOs } from "./services/repo.js";
import { toViewer } from "./auth.js";

/** Side effects collected during a write; flushed to sockets after the transaction commits. */
export class Effects {
  created = new Set<string>();
  updated = new Set<string>();
  comments: { incidentId: string; id: string }[] = [];
  notifications: string[] = [];
  sosIssued: string[] = [];
  sosClosed: { incidentId: string; sosId: string; state: SosState }[] = [];
  reset = false;
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

export class Realtime {
  private io: IO | null = null;

  constructor(private readonly db: DB) {}

  attach(io: IO, userIdFromSocket: (socket: Socket) => string | null) {
    this.io = io;
    io.on("connection", (socket) => {
      const userId = userIdFromSocket(socket);
      socket.data.userId = userId;
      if (userId) void socket.join(`user:${userId}`);
    });
  }

  /**
   * Every socket gets its own serialisation of each incident, so anonymity rules apply to
   * real-time payloads exactly as they do to REST (spec §4).
   */
  async flush(fx: Effects): Promise<void> {
    const io = this.io;
    if (!io) return;
    if (fx.reset) {
      io.emit("demo:reset");
      return;
    }
    const sockets = await io.fetchSockets();
    const users = new Map(this.db.select().from(s.users).all().map((u) => [u.id, u]));
    const viewerFor = (sock: { data: { userId?: string | null } }) => toViewer(users.get(sock.data.userId ?? "") ?? null);

    const ids = [...new Set([...fx.created, ...fx.updated, ...fx.sosIssued])];
    const rows = ids.length ? this.db.select().from(s.incidents).where(inArray(s.incidents.id, ids)).all() : [];

    for (const sock of sockets) {
      const viewer = viewerFor(sock);
      const dtos = new Map(incidentDTOs(this.db, rows, viewer).map((d) => [d.id, d]));
      for (const id of ids) {
        const dto = dtos.get(id);
        if (!dto) continue;
        if (fx.sosIssued.includes(id)) sock.emit("sos:issued", { incident: dto });
        sock.emit(fx.created.has(id) ? "incident:created" : "incident:updated", dto);
      }
      for (const c of fx.comments) {
        for (const dto of commentDTOs(this.db, c.incidentId, viewer, [c.id])) sock.emit("comment:created", dto);
      }
    }
    for (const closed of fx.sosClosed) io.emit("sos:closed", closed);
    if (fx.notifications.length) {
      const notes = this.db.select().from(s.notifications).where(inArray(s.notifications.id, fx.notifications)).all();
      for (const n of notes) io.to(`user:${n.userId}`).emit("notification:new", notificationDTO(n));
    }
  }

  /** Forces a user's sockets to reconnect (after a demo role switch). */
  async disconnectUser(userId: string) {
    if (!this.io) return;
    for (const sock of await this.io.in(`user:${userId}`).fetchSockets()) sock.disconnect(true);
  }
}

export function userExists(db: DB, id: string) {
  return !!db.select({ id: s.users.id }).from(s.users).where(eq(s.users.id, id)).get();
}
