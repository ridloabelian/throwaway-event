import { defineConfig, devices } from "@playwright/test";
import os from "node:os";
import path from "node:path";

const e2eTempRoot = path.join(os.tmpdir(), "throwaway-event-e2e");
const e2eDbPath = path.join(e2eTempRoot, "throwaway-e2e.db");
const e2eStorageDir = path.join(e2eTempRoot, "uploads");

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3199",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `rm -rf "${e2eTempRoot}" && mkdir -p "${e2eStorageDir}" && DATABASE_PATH="${e2eDbPath}" STORAGE_DIR="${e2eStorageDir}" SESSION_SECRET="e2e-test-session-secret-0123456789abcdef" sh -c 'npx next build && npx next start -p 3199'`,
    url: "http://localhost:3199/api/health",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
