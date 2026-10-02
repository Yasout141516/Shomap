import os from "node:os";
import type { FastifyInstance } from "fastify";
import { and, eq, ne } from "drizzle-orm";
import QRCode from "qrcode";
import { z } from "zod";
import { AdminActionInput, ReferralActionInput, SwitchRoleInput, type DemoInfoDTO } from "@shomap/shared";
import * as s from "../db/schema.js";
import { requireRole, requireUser, setSession, toViewer } from "../auth.js";
import { HttpError, notFound } from "../errors.js";
import type { Ctx } from "../services/context.js";
import { incidentDTO } from "../services/repo.js";
import { adminQueue, authorityQueue, eventLog } from "../services/queries.js";
import { adminIncidentAction, hideComment, referralAction, sweep } from "../services/actions.js";
import { vote } from "../services/reports.js";
import { DEMO_HEROES, seed } from "../db/seed.js";
import { Effects } from "../realtime.js";
import { meDTO } from "./public.js";

export function lanUrls(port: number): string[] {
  const out: string[] = [];
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs ?? []) if (a.family === "IPv4" && !a.internal) out.push(`http://${a.address}:${port}`);
  }
  return out;
}

export function staffRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db } = ctx;

  // ---- Authority console (FR-6.4, FR-6.5)
  app.get("/api/authority/queue", async (req) => {
    const user = requireRole(req, db, ["authority"]);
    return { incidents: authorityQueue(ctx, toViewer(user)!) };
  });

  app.post("/api/referrals/:id/actions", async (req) => {
    const user = requireUser(req, db);
    const { id } = req.params as { id: string };
    const result = await referralAction(ctx, user, id, ReferralActionInput.parse(req.body));
    return { ...result, incident: incidentDTO(db, result.incidentId, toViewer(user)) };
  });

  // ---- Admin (FR-12)
  app.get("/api/admin/queue", async (req) => {
    const user = requireRole(req, db, ["admin"]);
    return { items: adminQueue(ctx, toViewer(user)) };
  });

  app.post("/api/admin/incidents/:id/actions", async (req) => {
    const user = requireUser(req, db);
    const { id } = req.params as { id: string };
    await adminIncidentAction(ctx, user, id, AdminActionInput.parse(req.body));
    return { incident: incidentDTO(db, id, toViewer(user)) };
  });

  app.post("/api/admin/comments/:id/hide", async (req) => {
    const user = requireUser(req, db);
    const { id } = req.params as { id: string };
    return hideComment(ctx, user, id);
  });

  app.get("/api/admin/events", async (req) => {
    requireRole(req, db, ["admin"]);
    return { events: eventLog(ctx) };
  });

  // ---- Demo controls (DEMO_MODE only)
  const demoOnly = () => {
    if (!ctx.cfg.demoMode) throw new HttpError(404, "demo_only");
  };

  app.get("/api/demo/info", async (): Promise<DemoInfoDTO> => {
    demoOnly();
    const urls = lanUrls(ctx.cfg.port);
    const users = db
      .select()
      .from(s.users)
      .all()
      .map((u) => ({ id: u.id, displayName: u.displayName, role: u.role, homeAreaId: u.homeAreaId, authorityId: u.authorityId, hero: DEMO_HEROES[u.id] ?? null }));
    return {
      lanUrls: urls,
      qrSvg: urls[0] ? await QRCode.toString(urls[0], { type: "svg", margin: 1 }) : null,
      clockOffsetHours: ctx.clock.offsetHours,
      users,
    };
  });

  app.post("/api/demo/switch-role", async (req, reply) => {
    demoOnly();
    const { userId } = SwitchRoleInput.parse(req.body);
    const user = db.select().from(s.users).where(eq(s.users.id, userId)).get();
    if (!user) throw notFound();
    setSession(reply, user.id);
    return { me: meDTO(user) };
  });

  app.post("/api/demo/reset", async () => {
    demoOnly();
    ctx.clock.setOffsetHours(0);
    const summary = seed(db, ctx.clock.nowMs());
    const fx = new Effects();
    fx.reset = true;
    await ctx.rt.flush(fx);
    return summary;
  });

  app.post("/api/demo/fast-forward", async (req) => {
    demoOnly();
    const { hours } = z.object({ hours: z.number().min(1).max(24 * 14).default(72) }).parse(req.body ?? {});
    ctx.clock.advanceHours(hours);
    const swept = await sweep(ctx);
    ctx.rt.broadcast("demo:clock");
    return { clockOffsetHours: ctx.clock.offsetHours, ...swept };
  });

  /** Adds one confirmation from a seeded neighbour, for a quick stage demo (PRD §11). */
  app.post("/api/demo/neighbour-confirm", async (req) => {
    demoOnly();
    requireUser(req, db);
    const { incidentId } = z.object({ incidentId: z.string() }).parse(req.body);
    const inc = db.select().from(s.incidents).where(eq(s.incidents.id, incidentId)).get();
    if (!inc) throw notFound();
    const voted = new Set(db.select({ u: s.verifications.userId }).from(s.verifications).where(eq(s.verifications.incidentId, inc.id)).all().map((v) => v.u));
    const neighbour = db
      .select()
      .from(s.users)
      .where(and(eq(s.users.role, "citizen"), ne(s.users.id, inc.reporterId)))
      .all()
      .sort((a, b) => Number(b.homeAreaId === inc.areaId) - Number(a.homeAreaId === inc.areaId))
      .find((u) => !voted.has(u.id));
    if (!neighbour) throw new HttpError(409, "duplicate_vote");
    const result = await vote(ctx, neighbour, inc.id, { vote: "confirm" });
    return { ...result, neighbour: neighbour.displayName };
  });
}
