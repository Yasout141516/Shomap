import fs from "node:fs";
import path from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { Server } from "socket.io";
import { apiError } from "@shomap/shared";
import type { DbHandle } from "./db/client.js";
import { Clock } from "./clock.js";
import { config as defaultConfig, type Config } from "./config.js";
import { registerErrorHandler } from "./errors.js";
import { Realtime } from "./realtime.js";
import { SESSION_COOKIE } from "./auth.js";
import type { Ctx } from "./services/context.js";
import { publicRoutes } from "./routes/public.js";
import { staffRoutes } from "./routes/staff.js";

export interface BuildOptions {
  handle: DbHandle;
  clock?: Clock;
  cfg?: Partial<Config>;
  logger?: boolean | object;
}

export async function buildApp(opts: BuildOptions): Promise<{ app: FastifyInstance; ctx: Ctx }> {
  const cfg: Config = { ...defaultConfig, ...opts.cfg };
  const clock = opts.clock ?? new Clock();
  const app = Fastify({ logger: opts.logger ?? false, bodyLimit: 1024 * 1024 });

  await app.register(cookie, { secret: cfg.sessionSecret });
  await app.register(multipart, { limits: { fileSize: cfg.maxPhotoBytes, files: cfg.maxPhotos, fields: 4 } });
  registerErrorHandler(app);

  const rt = new Realtime(opts.handle.db);
  const ctx: Ctx = { db: opts.handle.db, sqlite: opts.handle.sqlite, clock, cfg, rt };

  publicRoutes(app, ctx);
  staffRoutes(app, ctx);

  // Uploaded photos are served by an access-checked route in routes/public.ts, not statically.
  fs.mkdirSync(path.join(cfg.dataDir, "uploads"), { recursive: true });
  if (fs.existsSync(cfg.offlineDir)) {
    // PMTiles are read with HTTP Range requests, which @fastify/static supports.
    await app.register(fastifyStatic, { root: cfg.offlineDir, prefix: "/offline/", decorateReply: false });
  }
  const hasWeb = fs.existsSync(path.join(cfg.webDist, "index.html"));
  // Files are looked up per request (wildcard), so a rebuild while the server runs is picked up.
  if (hasWeb) await app.register(fastifyStatic, { root: cfg.webDist, prefix: "/" });
  // Single-page app: unknown *page* URLs get index.html. A missing asset (anything with a file
  // extension) must stay a 404, or the browser gets HTML where it expected JS and shows a blank page.
  app.setNotFoundHandler((req, reply) => {
    const pathname = req.url.split("?")[0];
    const isPage = !pathname.startsWith("/api/") && !pathname.startsWith("/socket.io") && !/\.[a-z0-9]+$/i.test(pathname);
    if (hasWeb && req.method === "GET" && isPage) {
      return reply.type("text/html").sendFile("index.html");
    }
    return reply.status(404).send(apiError("not_found"));
  });

  return { app, ctx };
}

/** Attaches Socket.IO to the running server; sockets are identified by the session cookie. */
export function attachRealtime(app: FastifyInstance, ctx: Ctx) {
  const io = new Server(app.server, { path: "/socket.io", serveClient: false });
  ctx.rt.attach(io, (socket) => {
    const header = socket.handshake.headers.cookie;
    if (!header) return null;
    const raw = app.parseCookie(header)[SESSION_COOKIE];
    if (!raw) return null;
    const un = app.unsignCookie(raw);
    return un.valid ? un.value : null;
  });
  return io;
}
