import { dataDir, repoRoot } from "@job-radar/db";
import { join } from "node:path";

type Env = Record<string, string | undefined>;

/** Worker settings from the environment (Docker, `pnpm dev` and the macOS app set them). */
export function loadConfig(env: Env = process.env) {
  const data = dataDir();
  return {
    /** 127.0.0.1 natively. Docker sets 0.0.0.0 inside the container and publishes on 127.0.0.1 only. */
    host: env["WORKER_HOST"] ?? "127.0.0.1",
    port: Number(env["WORKER_PORT"] ?? 4000),
    dataDir: data,
    profileDir: join(data, "profile"),
    seedDir: env["JOB_RADAR_SEED_DIR"] ?? join(repoRoot(), "profile-seed"),
    secretsDir: env["JOB_RADAR_SECRETS_DIR"] ?? join(repoRoot(), "secrets"),
    webBaseUrl: env["WEB_BASE_URL"] ?? `http://127.0.0.1:${env["WEB_PORT"] ?? "3000"}`,
    /** Path to the owner's `claude` CLI (macOS app); otherwise the provider finds it on PATH. */
    claudeExecutable: env["CLAUDE_CODE_EXECUTABLE"]?.trim() || undefined,
  };
}

export const config = loadConfig();
