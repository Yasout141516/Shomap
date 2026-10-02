import type { FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import type { Role } from "@shomap/shared";
import type { DB } from "./db/client.js";
import { users, type UserRow } from "./db/schema.js";
import { HttpError } from "./errors.js";
import type { Viewer } from "./serializers/incident.js";

export const SESSION_COOKIE = "shomap_sid";

export function setSession(reply: FastifyReply, userId: string) {
  reply.setCookie(SESSION_COOKIE, userId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    signed: true,
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function clearSession(reply: FastifyReply) {
  reply.clearCookie(SESSION_COOKIE, { path: "/" });
}

/** Reads the signed session cookie. Returns the user row, or null for guests. */
export function currentUser(req: FastifyRequest, db: DB): UserRow | null {
  const raw = req.cookies[SESSION_COOKIE];
  if (!raw) return null;
  const un = req.unsignCookie(raw);
  if (!un.valid || !un.value) return null;
  return db.select().from(users).where(eq(users.id, un.value)).get() ?? null;
}

export function toViewer(u: UserRow | null): Viewer {
  return u ? { id: u.id, role: u.role, authorityId: u.authorityId } : null;
}

export function requireUser(req: FastifyRequest, db: DB): UserRow {
  const u = currentUser(req, db);
  if (!u) throw new HttpError(401, "unauthenticated");
  return u;
}

export function requireRole(req: FastifyRequest, db: DB, roles: Role[]): UserRow {
  const u = requireUser(req, db);
  if (!roles.includes(u.role)) throw new HttpError(403, "forbidden");
  return u;
}
