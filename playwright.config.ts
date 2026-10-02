import path from "node:path";
import { defineConfig } from "@playwright/test";

const PORT = 3100;

/**
 * The PRD §11 demo script as a test (spec §7). It runs on its own port and data folder so it
 * never touches the demo you're presenting from. Uses the locally installed Chrome (offline).
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: "chrome",
    viewport: { width: 1366, height: 860 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run start -w @shomap/server",
    url: `http://localhost:${PORT}/api/meta`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { PORT: String(PORT), SHOMAP_DATA_DIR: path.resolve(".cache/e2e-data"), DEMO_MODE: "1" },
  },
});
