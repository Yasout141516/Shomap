import type Database from "better-sqlite3";
import type { DB } from "../db/client.js";
import type { Clock } from "../clock.js";
import type { Config } from "../config.js";
import { Effects, type Realtime } from "../realtime.js";

export interface Ctx {
  db: DB;
  sqlite: Database.Database;
  clock: Clock;
  cfg: Config;
  rt: Realtime;
}

/**
 * Runs `fn` in one SQLite transaction, then pushes the collected effects to sockets.
 * better-sqlite3 is synchronous, so the whole write is atomic and serialised (Review Focus 1).
 */
export async function write<T>(ctx: Ctx, fn: (fx: Effects) => T): Promise<T> {
  const fx = new Effects();
  const result = ctx.sqlite.transaction(() => fn(fx))();
  await ctx.rt.flush(fx);
  return result;
}
