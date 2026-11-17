// Where the worker and web live, and the environment each child gets (design D1, D2, D4).
import { dirname, join } from "node:path";
import type { ProcessSpec } from "./supervisor";

/** Files the app needs; packaged under Resources/, or taken from the repo in development. */
export interface Layout {
  workerEntry: string;
  workerCwd: string;
  webEntry: string;
  webCwd: string;
  seedDir: string;
  migrationsDir: string;
  /** playwright-core's CLI, to install Chromium on request. */
  playwrightCli: string;
}

export function packagedLayout(resources: string): Layout {
  return {
    workerEntry: join(resources, "worker", "worker.mjs"),
    workerCwd: join(resources, "worker"),
    webEntry: join(resources, "web", "apps", "web", "server.js"),
    webCwd: join(resources, "web", "apps", "web"),
    seedDir: join(resources, "profile-seed"),
    migrationsDir: join(resources, "drizzle"),
    playwrightCli: join(resources, "worker", "node_modules", "playwright-core", "cli.js"),
  };
}

/** `electron .` from apps/desktop: the bundled worker and the web standalone build in the repo. */
export function devLayout(repo: string): Layout {
  return {
    workerEntry: join(repo, "apps", "worker", "dist", "worker.mjs"),
    workerCwd: join(repo, "apps", "worker"),
    webEntry: join(repo, "apps", "web", ".next", "standalone", "apps", "web", "server.js"),
    webCwd: join(repo, "apps", "web", ".next", "standalone", "apps", "web"),
    seedDir: join(repo, "profile-seed"),
    migrationsDir: join(repo, "packages", "db", "drizzle"),
    playwrightCli: join(repo, "apps", "worker", "node_modules", "playwright-core", "cli.js"),
  };
}

/**
 * The Electron helper next to the app binary. Children run on it (as Node): it is marked
 * LSUIElement, so macOS does not show the servers in the Dock. The main binary would: Next.js
 * renames its process to "next-server" and macOS then lists it as an app.
 */
export function helperExecutable(execPath: string, productName: string): string {
  const contents = dirname(dirname(execPath));
  return join(
    contents,
    "Frameworks",
    `${productName} Helper.app`,
    "Contents",
    "MacOS",
    `${productName} Helper`,
  );
}

/** Telemetry and update traffic off in every child, as in Docker. */
const QUIET_ENV = {
  DISABLE_TELEMETRY: "1",
  DISABLE_ERROR_REPORTING: "1",
  DISABLE_AUTOUPDATER: "1",
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
  NEXT_TELEMETRY_DISABLED: "1",
  TURBO_TELEMETRY_DISABLED: "1",
};

export interface RuntimeInput {
  layout: Layout;
  /** Electron's binary; children run it as Node. */
  execPath: string;
  dataDir: string;
  secretsDir: string;
  browsersDir: string;
  logsDir: string;
  home: string;
  path: string;
  webPort: number;
  workerPort: number;
  claudePath: string | null;
  /** Smoke tests only: fake LLM and sources in the worker, no schedules. */
  testMode?: boolean;
}

export function processSpecs(r: RuntimeInput): ProcessSpec[] {
  const common: Record<string, string> = {
    ...QUIET_ENV,
    ELECTRON_RUN_AS_NODE: "1",
    NODE_ENV: "production",
    HOME: r.home,
    PATH: r.path,
    JOB_RADAR_DATA_DIR: r.dataDir,
    JOB_RADAR_ROOT: r.layout.workerCwd,
    JOB_RADAR_MIGRATIONS_DIR: r.layout.migrationsDir,
    PLAYWRIGHT_BROWSERS_PATH: r.browsersDir,
    ...(r.testMode ? { JOB_RADAR_TEST_MODE: "1" } : {}),
  };
  return [
    {
      name: "worker",
      command: r.execPath,
      args: [r.layout.workerEntry],
      cwd: r.layout.workerCwd,
      env: {
        ...common,
        WORKER_HOST: "127.0.0.1",
        WORKER_PORT: String(r.workerPort),
        WEB_BASE_URL: `http://127.0.0.1:${r.webPort}`,
        JOB_RADAR_SECRETS_DIR: r.secretsDir,
        JOB_RADAR_SEED_DIR: r.layout.seedDir,
        JOB_RADAR_LOGIN_VIEWER: "window",
        ...(r.claudePath ? { CLAUDE_CODE_EXECUTABLE: r.claudePath } : {}),
      },
      healthUrl: `http://127.0.0.1:${r.workerPort}/health`,
      logFile: join(r.logsDir, "worker.log"),
    },
    {
      name: "web",
      command: r.execPath,
      args: [r.layout.webEntry],
      cwd: r.layout.webCwd,
      env: {
        ...common,
        HOSTNAME: "127.0.0.1",
        PORT: String(r.webPort),
        WORKER_URL: `http://127.0.0.1:${r.workerPort}`,
      },
      healthUrl: `http://127.0.0.1:${r.webPort}/`,
      logFile: join(r.logsDir, "web.log"),
    },
  ];
}
