// `pnpm desktop:smoke` (macos-app task 5.2): runs the PACKAGED worker with the app's own
// Electron binary as Node, in test mode on a temp data folder. It must migrate the database,
// answer /health and complete fake LLM calls (an import extraction and a score).
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const desktop = join(dirname(fileURLToPath(import.meta.url)), "..");
const app = join(desktop, "build", "release", "mac-arm64", "Job Radar.app");
const resources = join(app, "Contents", "Resources");
// The app runs its servers on the helper (no Dock icon); the smoke test does the same.
const binary = join(
  app,
  "Contents",
  "Frameworks",
  "Job Radar Helper.app",
  "Contents",
  "MacOS",
  "Job Radar Helper",
);
if (!existsSync(binary)) throw new Error(`Build the app first (pnpm desktop:build): ${binary}`);

const dir = mkdtempSync(join(tmpdir(), "job-radar-smoke-"));
const port = 4890;
const child = spawn(binary, [join(resources, "worker", "worker.mjs")], {
  cwd: join(resources, "worker"),
  env: {
    PATH: "/usr/bin:/bin",
    HOME: dir,
    ELECTRON_RUN_AS_NODE: "1",
    JOB_RADAR_TEST_MODE: "1",
    JOB_RADAR_DATA_DIR: join(dir, "data"),
    JOB_RADAR_SECRETS_DIR: join(dir, "secrets"),
    JOB_RADAR_ROOT: join(resources, "worker"),
    JOB_RADAR_MIGRATIONS_DIR: join(resources, "drizzle"),
    JOB_RADAR_SEED_DIR: join(resources, "profile-seed"),
    WORKER_PORT: String(port),
    LOG_LEVEL: "warn",
  },
  stdio: ["ignore", "inherit", "inherit"],
});

const api = (path: string, init?: RequestInit) =>
  fetch(`http://127.0.0.1:${port}${path}`, {
    ...init,
    headers: { "content-type": "application/json" },
  });

try {
  let healthy: unknown = null;
  for (let i = 0; i < 80 && !healthy; i++) {
    await new Promise((r) => setTimeout(r, 250));
    healthy = await api("/health")
      .then((r) => r.json())
      .catch(() => null);
  }
  if ((healthy as { app?: string } | null)?.app !== "job-radar")
    throw new Error("packaged worker did not answer /health");
  const imported = await api("/offers/import", {
    method: "POST",
    body: JSON.stringify({
      url: "https://jobs.example.invalid/smoke",
      text: "Founding AI Engineer at Imported Labs. Remote (Europe). Build agentic RAG with TypeScript. ".repeat(
        4,
      ),
    }),
  });
  if (!imported.ok) throw new Error(`import failed: ${imported.status} ${await imported.text()}`);
  let used = 0;
  for (let i = 0; i < 40 && used < 2; i++) {
    await new Promise((r) => setTimeout(r, 250));
    const s = (await (await api("/scoring/status")).json()) as {
      budget: { scoring: { used: number } };
    };
    used = s.budget.scoring.used;
  }
  if (used < 2) throw new Error(`expected an extraction and a score, saw ${used} LLM calls`);
  console.log(
    `desktop smoke ok: packaged worker on Electron's Node migrated the database, imported and scored (${used} fake LLM calls)`,
  );
} finally {
  child.kill("SIGTERM");
}
