import fs from "node:fs";
import path from "node:path";
import { count } from "drizzle-orm";
import { openDb } from "./db/client.js";
import { seed } from "./db/seed.js";
import * as s from "./db/schema.js";
import { buildApp, attachRealtime } from "./app.js";
import { config } from "./config.js";
import { sweep } from "./services/actions.js";
import { lanUrls } from "./routes/staff.js";

if (config.sessionSecret.startsWith("shomap-demo-secret") && config.publicDemo) {
  console.warn("WARNING: SESSION_SECRET is the built-in default. Set it in the host's environment.");
}

const logFile = path.join(config.dataDir, "logs", "server.log");
fs.mkdirSync(path.dirname(logFile), { recursive: true });

const handle = openDb(path.join(config.dataDir, "shomap.db"));
const [{ n }] = handle.db.select({ n: count() }).from(s.incidents).all();
if (n === 0) {
  const summary = seed(handle.db, Date.now());
  console.log(`Seeded ${summary.incidents} incidents and ${summary.users} users.`);
}

const { app, ctx } = await buildApp({
  handle,
  logger: {
    level: "info",
    transport: {
      targets: [
        { target: "pino/file", options: { destination: logFile, mkdir: true } },
        { target: "pino/file", options: { destination: 1 } },
      ],
    },
  },
});

await app.listen({ port: config.port, host: config.host });
attachRealtime(app, ctx);

const timer = setInterval(() => {
  sweep(ctx).catch((err) => app.log.error({ err }, "sweep failed"));
}, config.sweepIntervalMs);
await sweep(ctx);

const urls = lanUrls(config.port);
console.log("\n  ShoMap is running.");
console.log(`  On this laptop:  http://localhost:${config.port}`);
for (const u of urls) console.log(`  On the hotspot:  ${u}`);
if (config.demoMode) console.log(`  Demo controls:   http://localhost:${config.port}/demo   (OTP is ${config.demoOtp})\n`);

const shutdown = async () => {
  clearInterval(timer);
  await app.close();
  handle.sqlite.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
