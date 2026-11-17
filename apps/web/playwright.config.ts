import { defineConfig, devices } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Isolated data and an empty secrets dir: UI tests never touch data/ or real tokens.
const dataDir = join(tmpdir(), "job-radar-ui-test");
const secretsDir = join(tmpdir(), "job-radar-ui-test-secrets");
mkdirSync(secretsDir, { recursive: true });
const port = 3197;
const workerPort = 4997;

const env = {
  JOB_RADAR_DATA_DIR: dataDir,
  JOB_RADAR_SECRETS_DIR: secretsDir,
  NEXT_TELEMETRY_DISABLED: "1",
  WORKER_URL: `http://127.0.0.1:${workerPort}`,
};

export default defineConfig({
  testDir: "./tests",
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: `http://127.0.0.1:${port}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      // Fresh seeded database for every run; the app must be built first (pnpm test:ui does it).
      command: `tsx tests/seed.ts && next start -H 127.0.0.1 -p ${port}`,
      url: `http://127.0.0.1:${port}/offers`,
      reuseExistingServer: false,
      timeout: 120_000,
      env,
    },
    {
      // Worker in test mode: fake LLM, fake source, no schedules, no network.
      command: "pnpm --filter @job-radar/worker exec tsx src/main.ts",
      url: `http://127.0.0.1:${workerPort}/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { ...env, WORKER_PORT: String(workerPort), JOB_RADAR_TEST_MODE: "1", LOG_LEVEL: "warn" },
    },
  ],
});
