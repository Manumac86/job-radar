import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bundleWorker } from "../scripts/bundle";

const repo = join(import.meta.dirname, "..", "..", "..");

describe("bundled worker (macOS app)", () => {
  it("starts from one file with app-style paths and answers /health", async () => {
    const out = await bundleWorker();
    const dir = mkdtempSync(join(tmpdir(), "job-radar-bundle-"));
    const port = 4700 + Math.floor(Math.random() * 200);
    const child = spawn(process.execPath, [out], {
      cwd: dir, // not inside the repo: paths come only from the environment
      env: {
        PATH: process.env["PATH"],
        HOME: dir,
        JOB_RADAR_TEST_MODE: "1",
        JOB_RADAR_DATA_DIR: join(dir, "data"),
        JOB_RADAR_SECRETS_DIR: join(dir, "secrets"),
        JOB_RADAR_ROOT: dir,
        JOB_RADAR_MIGRATIONS_DIR: join(repo, "packages", "db", "drizzle"),
        JOB_RADAR_SEED_DIR: join(repo, "profile-seed"),
        WORKER_PORT: String(port),
        LOG_LEVEL: "warn",
      },
      stdio: "ignore",
    });
    try {
      let body: unknown = null;
      for (let i = 0; i < 60 && !body; i++) {
        await new Promise((r) => setTimeout(r, 250));
        body = await fetch(`http://127.0.0.1:${port}/health`)
          .then((r) => r.json())
          .catch(() => null);
      }
      expect(body).toEqual({ ok: true, app: "job-radar", profile: "ok" });
    } finally {
      child.kill("SIGTERM");
    }
  }, 60_000);
});
