import path from "node:path";
import type { FastifyInstance } from "fastify";
import { and, asc, desc, eq } from "drizzle-orm";
import {
  CommentInput,
  DASHBOARD_SCOPES,
  FlagInput,
  LoginInput,
  MePatch,
  ReportInput,
  VoteInput,
  WatchZoneInput,
  type MeDTO,
  type MetaDTO,
  type WatchZoneDTO,
} from "@shomap/shared";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import * as s from "../db/schema.js";
import { clearSession, currentUser, requireUser, setSession, toViewer } from "../auth.js";
import { HttpError, badRequest, notFound } from "../errors.js";
import type { Ctx } from "../services/context.js";
import { commentDTOs, getIncidentRow, incidentDTO, statusEvents } from "../services/repo.js";
import { addComment, createIncident, flag, precheckReport, stillHappening, vote } from "../services/reports.js";
import { activeSos, dashboard, listIncidents } from "../services/queries.js";
import { closeSosByUser } from "../services/actions.js";
import { deletePhotos, savePhoto } from "../services/uploads.js";
import { notificationDTO } from "../realtime.js";

export function meDTO(u: s.UserRow): MeDTO {
  return {
    id: u.id,
    displayName: u.displayName,
    phone: u.phone,
    role: u.role,
    lang: u.lang,
    homeAreaId: u.homeAreaId,
    authorityId: u.authorityId,
  };
}

const zoneDTO = (z: s.WatchZoneRow): WatchZoneDTO => ({
  id: z.id,
  label: z.label,
  lat: z.lat,
  lng: z.lng,
  radiusM: z.radiusM,
  minUrgency: z.minUrgency,
});

export function publicRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db } = ctx;
  const uploadsDir = path.join(ctx.cfg.dataDir, "uploads");

  // ---- Reference data
  app.get("/api/meta", async (): Promise<MetaDTO> => ({
    areas: db.select().from(s.areas).all(),
    categories: db
      .select()
      .from(s.categories)
      .orderBy(asc(s.categories.sort))
      .all()
      .map(({ sort: _s, ...c }) => c),
    authorities: db.select().from(s.authorities).all(),
    demoMode: ctx.cfg.demoMode,
    config: { confirmThreshold: ctx.cfg.confirmThreshold, sosRadiusM: ctx.cfg.sosRadiusM, dhakaBounds: ctx.cfg.dhakaBounds },
  }));

  // ---- Auth (mock OTP, FR-1.1)
  app.post("/api/auth/login", async (req, reply) => {
    const input = LoginInput.parse(req.body);
    if (input.otp !== ctx.cfg.demoOtp) throw new HttpError(401, "invalid_otp");
    let user = db.select().from(s.users).where(eq(s.users.phone, input.phone)).get();
    let isNew = false;
    if (!user) {
      if (!input.displayName) throw badRequest({ field: "displayName", needsName: true });
      user = {
        id: randomUUID(),
        displayName: input.displayName,
        phone: input.phone,
        role: "citizen",
        lang: "en",
        homeAreaId: null,
        authorityId: null,
        createdAt: ctx.clock.iso(),
      };
      db.insert(s.users).values(user).run();
      isNew = true;
    }
    setSession(reply, user.id);
    return { me: meDTO(user), isNew };
  });

  app.post("/api/auth/logout", async (_req, reply) => {
    clearSession(reply);
    return { ok: true };
  });

  app.get("/api/me", async (req) => {
    const u = currentUser(req, db);
    return { me: u ? meDTO(u) : null };
  });

  app.patch("/api/me", async (req) => {
    const u = requireUser(req, db);
    const patch = MePatch.parse(req.body);
    if (patch.homeAreaId && !db.select().from(s.areas).where(eq(s.areas.id, patch.homeAreaId)).get()) {
      throw badRequest({ field: "homeAreaId" });
    }
    db.update(s.users).set(patch).where(eq(s.users.id, u.id)).run();
    return { me: meDTO({ ...u, ...patch }) };
  });

  // ---- Incidents
  app.get("/api/incidents", async (req) => {
    const q = z.object({ days: z.coerce.number().int().min(1).max(60).default(14) }).parse(req.query);
    return { incidents: listIncidents(ctx, toViewer(currentUser(req, db)), q.days) };
  });

  app.get("/api/incidents/:id", async (req) => {
    const { id } = req.params as { id: string };
    const viewer = toViewer(currentUser(req, db));
    const row = getIncidentRow(db, id);
    if (!row || (row.status === "removed" && viewer?.role !== "admin")) throw notFound();
    return { incident: { ...incidentDTO(db, id, viewer)!, events: statusEvents(db, row, viewer) } };
  });

  app.post("/api/incidents", async (req, reply) => {
    const user = requireUser(req, db);
    if (user.role !== "citizen") throw new HttpError(403, "forbidden");
    let data: unknown = null;
    const files: Buffer[] = [];
    for await (const part of req.parts()) {
      if (part.type === "file") {
        if (!part.mimetype.startsWith("image/")) throw new HttpError(415, "file_type");
        files.push(await part.toBuffer());
      } else if (part.fieldname === "data") {
        data = JSON.parse(String(part.value));
      }
    }
    const input = ReportInput.parse(data);
    precheckReport(ctx, user, input, files.length);
    const urls: string[] = [];
    try {
      for (const f of files) urls.push(await savePhoto(uploadsDir, f));
      const result = await createIncident(ctx, user, input, urls);
      if (result.duplicate) await deletePhotos(uploadsDir, urls);
      reply.status(result.duplicate ? 200 : 201);
      return { ...result, incident: incidentDTO(db, result.id, toViewer(user)) };
    } catch (err) {
      await deletePhotos(uploadsDir, urls);
      throw err;
    }
  });

  app.post("/api/incidents/:id/votes", async (req) => {
    const user = requireUser(req, db);
    const { id } = req.params as { id: string };
    const result = await vote(ctx, user, id, VoteInput.parse(req.body));
    return { ...result, incident: incidentDTO(db, id, toViewer(user)) };
  });

  app.post("/api/incidents/:id/still-happening", async (req) => {
    const user = requireUser(req, db);
    const { id } = req.params as { id: string };
    const result = await stillHappening(ctx, user, id);
    return { ...result, incident: incidentDTO(db, id, toViewer(user)) };
  });

  app.get("/api/incidents/:id/comments", async (req) => {
    const { id } = req.params as { id: string };
    if (!getIncidentRow(db, id)) throw notFound();
    return { comments: commentDTOs(db, id, toViewer(currentUser(req, db))) };
  });

  app.post("/api/incidents/:id/comments", async (req, reply) => {
    const user = requireUser(req, db);
    const { id } = req.params as { id: string };
    const { id: commentId } = await addComment(ctx, user, id, CommentInput.parse(req.body));
    reply.status(201);
    return { comment: commentDTOs(db, id, toViewer(user), [commentId])[0] };
  });

  app.post("/api/flags", async (req) => {
    const user = requireUser(req, db);
    return flag(ctx, user, FlagInput.parse(req.body));
  });

  // ---- SOS
  app.get("/api/sos/active", async (req) => ({ incidents: activeSos(ctx, toViewer(currentUser(req, db))) }));

  app.post("/api/sos/:id/:state", async (req) => {
    const user = requireUser(req, db);
    const { id, state } = req.params as { id: string; state: string };
    if (state !== "found" && state !== "cancel") throw notFound();
    return closeSosByUser(ctx, user, id, state === "found" ? "found" : "cancelled");
  });

  // ---- Watch zones (FR-10)
  app.get("/api/watch-zones", async (req) => {
    const user = requireUser(req, db);
    return { zones: db.select().from(s.watchZones).where(eq(s.watchZones.userId, user.id)).orderBy(asc(s.watchZones.createdAt)).all().map(zoneDTO) };
  });

  app.post("/api/watch-zones", async (req, reply) => {
    const user = requireUser(req, db);
    const input = WatchZoneInput.parse(req.body);
    const count = db.select().from(s.watchZones).where(eq(s.watchZones.userId, user.id)).all().length;
    if (count >= ctx.cfg.maxWatchZones) throw new HttpError(409, "zone_limit", { max: ctx.cfg.maxWatchZones });
    const row: s.WatchZoneRow = { id: randomUUID(), userId: user.id, ...input, createdAt: ctx.clock.iso() };
    db.insert(s.watchZones).values(row).run();
    reply.status(201);
    return { zone: zoneDTO(row) };
  });

  app.patch("/api/watch-zones/:id", async (req) => {
    const user = requireUser(req, db);
    const { id } = req.params as { id: string };
    const zone = db.select().from(s.watchZones).where(and(eq(s.watchZones.id, id), eq(s.watchZones.userId, user.id))).get();
    if (!zone) throw notFound();
    const patch = WatchZoneInput.partial().parse(req.body);
    db.update(s.watchZones).set(patch).where(eq(s.watchZones.id, id)).run();
    return { zone: zoneDTO({ ...zone, ...patch }) };
  });

  app.delete("/api/watch-zones/:id", async (req) => {
    const user = requireUser(req, db);
    const { id } = req.params as { id: string };
    db.delete(s.watchZones).where(and(eq(s.watchZones.id, id), eq(s.watchZones.userId, user.id))).run();
    return { ok: true };
  });

  // ---- Notifications (FR-11)
  app.get("/api/notifications", async (req) => {
    const user = requireUser(req, db);
    const rows = db.select().from(s.notifications).where(eq(s.notifications.userId, user.id)).orderBy(desc(s.notifications.createdAt)).limit(60).all();
    return { notifications: rows.map(notificationDTO) };
  });

  app.post("/api/notifications/:id/read", async (req) => {
    const user = requireUser(req, db);
    const { id } = req.params as { id: string };
    db.update(s.notifications).set({ readAt: ctx.clock.iso() }).where(and(eq(s.notifications.id, id), eq(s.notifications.userId, user.id))).run();
    return { ok: true };
  });

  app.post("/api/notifications/read-all", async (req) => {
    const user = requireUser(req, db);
    db.update(s.notifications).set({ readAt: ctx.clock.iso() }).where(eq(s.notifications.userId, user.id)).run();
    return { ok: true };
  });

  // ---- Dashboard (FR-7)
  app.get("/api/dashboard", async (req) => {
    const q = z.object({ scope: z.enum(DASHBOARD_SCOPES).default("all"), zoneId: z.string().optional(), areaId: z.string().optional() }).parse(req.query);
    return { dashboard: dashboard(ctx, currentUser(req, db), q.scope, q.zoneId, q.areaId) };
  });
}
