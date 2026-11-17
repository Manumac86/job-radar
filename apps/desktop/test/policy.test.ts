import { describe, expect, it } from "vitest";
import { buildMenuModel, type StatusSummary } from "../src/menu-model";
import { helperExecutable, packagedLayout, processSpecs } from "../src/runtime";
import { decideNavigation, isExternalAllowed } from "../src/url-policy";

describe("window URL policy", () => {
  it("keeps the app on its own localhost pages and sends the rest to the browser", () => {
    expect(decideNavigation("http://127.0.0.1:3300/offers/12", 3300)).toBe("allow");
    expect(decideNavigation("http://localhost:3300/", 3300)).toBe("external");
    expect(decideNavigation("http://127.0.0.1:4000/health", 3300)).toBe("external");
    expect(decideNavigation("https://jobs.lever.co/acme/1", 3300)).toBe("external");
    expect(decideNavigation("mailto:hr@acme.example", 3300)).toBe("external");
    expect(decideNavigation("file:///etc/passwd", 3300, "/App/loading.html")).toBe("deny");
    expect(decideNavigation("file:///App/loading.html", 3300, "/App/loading.html")).toBe("allow");
    expect(decideNavigation("javascript:alert(1)", 3300)).toBe("deny");
    expect(isExternalAllowed("smb://server/share")).toBe(false);
  });
});

const summary = (s: Partial<StatusSummary> = {}): StatusSummary => ({
  overall: "ok",
  llm: "ok",
  llmMessage: null,
  pausedUntil: null,
  attention: [],
  unread: 0,
  running: [],
  ...s,
});

describe("menu bar model", () => {
  it("shows running status, unread count and the actions", () => {
    const m = buildMenuModel({
      summary: summary({ unread: 3 }),
      stopped: null,
      launchAtLogin: true,
    });
    expect(m.icon).toBe("ok");
    expect(m.items).toContainEqual({ kind: "label", label: "3 unread notifications" });
    const ids = m.items.flatMap((i) => (i.kind === "action" ? [i.id] : []));
    expect(ids).toEqual(["open", "run-all", "launch-at-login", "quit"]);
    expect(m.items).toContainEqual(
      expect.objectContaining({ id: "launch-at-login", checked: true }),
    );
  });

  it("warns about Claude login and sources needing attention", () => {
    const m = buildMenuModel({
      summary: summary({
        llm: "not_authenticated",
        attention: [{ id: "linkedin", name: "LinkedIn", status: "session_expired" }],
      }),
      stopped: null,
      launchAtLogin: false,
    });
    expect(m.icon).toBe("attention");
    expect(m.items).toContainEqual({ kind: "label", label: "Claude not logged in" });
    expect(m.items).toContainEqual({ kind: "action", id: "claude-help", label: "How to fix…" });
    expect(m.items).toContainEqual({ kind: "label", label: "LinkedIn: session expired" });
  });

  it("shows a stopped worker with Restart and disables Run all", () => {
    const m = buildMenuModel({ summary: null, stopped: "Worker stopped", launchAtLogin: false });
    expect(m.icon).toBe("stopped");
    expect(m.items).toContainEqual({ kind: "action", id: "restart", label: "Restart" });
    expect(m.items).toContainEqual(expect.objectContaining({ id: "run-all", enabled: false }));
  });
});

describe("children environment", () => {
  it("binds to localhost, uses app paths and passes the Claude CLI", () => {
    const [worker, web] = processSpecs({
      layout: packagedLayout("/App/Resources"),
      execPath: "/App/MacOS/Job Radar",
      dataDir: "/Data",
      secretsDir: "/Secrets",
      browsersDir: "/Browsers",
      logsDir: "/Data/logs",
      home: "/Users/me",
      path: "/usr/bin",
      webPort: 3300,
      workerPort: 4000,
      claudePath: "/Users/me/.local/bin/claude",
    });
    expect(worker?.env).toMatchObject({
      ELECTRON_RUN_AS_NODE: "1",
      WORKER_HOST: "127.0.0.1",
      JOB_RADAR_DATA_DIR: "/Data",
      JOB_RADAR_SECRETS_DIR: "/Secrets",
      JOB_RADAR_SEED_DIR: "/App/Resources/profile-seed",
      JOB_RADAR_MIGRATIONS_DIR: "/App/Resources/drizzle",
      CLAUDE_CODE_EXECUTABLE: "/Users/me/.local/bin/claude",
      JOB_RADAR_LOGIN_VIEWER: "window",
      PLAYWRIGHT_BROWSERS_PATH: "/Browsers",
      DISABLE_TELEMETRY: "1",
    });
    expect(worker?.env).not.toHaveProperty("ANTHROPIC_API_KEY");
    expect(web?.env).toMatchObject({
      HOSTNAME: "127.0.0.1",
      PORT: "3300",
      WORKER_URL: "http://127.0.0.1:4000",
      NEXT_TELEMETRY_DISABLED: "1",
    });
    expect(web?.env).not.toHaveProperty("JOB_RADAR_SECRETS_DIR");
  });
});

describe("children run on the Electron helper", () => {
  it("finds the helper next to the app binary", () => {
    expect(
      helperExecutable("/Applications/Job Radar.app/Contents/MacOS/Job Radar", "Job Radar"),
    ).toBe(
      "/Applications/Job Radar.app/Contents/Frameworks/Job Radar Helper.app/Contents/MacOS/Job Radar Helper",
    );
  });
});
