import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, "../../..");

export interface DomainConfig {
  confirmThreshold: number;
  disputeThreshold: number;
  reopenThreshold: number;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? "0.0.0.0",
  demoMode: process.env.DEMO_MODE !== "0",
  /** Hosted on the public internet (e.g. Render): show the demo banner, trust the proxy, public QR URL. */
  publicDemo: process.env.PUBLIC_DEMO === "1",
  demoOtp: "1234",
  sessionSecret: process.env.SESSION_SECRET ?? "shomap-demo-secret-change-me-0123456789",
  dataDir: process.env.SHOMAP_DATA_DIR ?? path.join(REPO_ROOT, "data"),
  webDist: path.join(REPO_ROOT, "apps/web/dist"),
  offlineDir: path.join(REPO_ROOT, "assets/offline"),

  // Verification and lifecycle (PRD FR-3.2, FR-3.3, FR-6.7)
  confirmThreshold: 3,
  disputeThreshold: 3,
  reopenThreshold: 3,
  autoCloseHours: 72,
  unverifiedExpiryDays: 7,

  // SOS (PRD FR-8.2)
  sosRadiusM: 3000,
  sosTtlHours: 72,

  // Abuse controls (PRD FR-2.8, FR-10.1)
  reportsPerHour: 5,
  maxWatchZones: 5,
  maxPhotos: 3,
  maxPhotoBytes: 5 * 1024 * 1024,

  // Dhaka demo area [minLng, minLat, maxLng, maxLat]
  dhakaBounds: [90.3, 23.68, 90.5, 23.9] as [number, number, number, number],

  sweepIntervalMs: 60_000,
};

export type Config = typeof config;
