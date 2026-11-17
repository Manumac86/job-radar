// browser-sessions spec, "Secret scan": the owner's password strings never reach the database,
// the logs or run payloads, even if an adapter or a library echoes them.
import { closeDatabase, getSource, listRuns, openDatabase, upsertSource } from "@job-radar/db";
import {
  LOGGED_IN_SITES,
  loggedInAdapters,
  type BrowserAccess,
  type ReadOnlyPage,
  type SourceAdapter,
} from "@job-radar/sources";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { executeRun } from "../src/ingest/runner";
import { setLogSink } from "../src/log";
import { Notifier } from "../src/notifier";
import { ProfileService } from "../src/profile-service";
import { seedDir } from "./helpers";

const PASSWORDS = ["Tr0ub4dor&3-JobRadar!", "app-pass-abcd-efgh-ijkl", "123456:TELEGRAM-TOKEN-xyz"];

let dir = "";
afterEach(() => {
  setLogSink((line) => process.stderr.write(line + "\n"));
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe("secret scan", () => {
  it("finds no password string in the database, logs or run payloads", async () => {
    dir = mkdtempSync(join(tmpdir(), "job-radar-secrets-"));
    const secretsDir = join(dir, "secrets");
    const profileDir = join(dir, "profile");
    mkdirSync(secretsDir);
    mkdirSync(profileDir);
    writeFileSync(join(secretsDir, "imap_app_password"), PASSWORDS[1]!);
    writeFileSync(join(secretsDir, "telegram_bot_token"), PASSWORDS[2]!);
    for (const f of ["cv.md", "preferences.yaml"])
      writeFileSync(join(profileDir, f), readFileSync(join(seedDir, f)));

    const logs: string[] = [];
    setLogSink((line) => void logs.push(line));
    const dbPath = join(dir, "radar.sqlite");
    const db = openDatabase({ path: dbPath });
    const profile = new ProfileService(db, profileDir);
    profile.reload();

    // 1. A careless adapter that echoes the mailbox password in a log line and an error.
    const leaky: SourceAdapter = {
      type: "email_alerts",
      label: "Leaky",
      defaultIntervalMinutes: 60,
      async fetchOffers(ctx) {
        const pass = ctx.readSecret?.("imap_app_password");
        ctx.log(`connecting with ${pass}`);
        throw new Error(`AUTHENTICATE failed for user owner@example.invalid password=${pass}`);
      },
    };
    // 2. A logged-in page where a password manager autofilled the login form.
    const autofilled = `<form action="/login"><input type="password" value="${PASSWORDS[0]}"></form>`;
    const browser: BrowserAccess = {
      async withSite(site, fn) {
        let url = "";
        const page: ReadOnlyPage = {
          goto: async (u) => void (url = u),
          url: () => url,
          html: async () => autofilled,
          waitFor: async () => true,
          scroll: async () => {},
          safeClick: async () => {},
          pagesViewed: 1,
        };
        void site;
        return fn(page);
      },
    };
    upsertSource(db, { id: "email_alerts", type: "email_alerts", name: "Email", enabled: true });
    upsertSource(db, {
      id: "linkedin",
      type: "linkedin",
      name: "LinkedIn",
      enabled: true,
      requiresLogin: true,
    });
    const deps = {
      db,
      profile,
      notifier: new Notifier(db),
      dataDir: dir,
      secretsDir,
      browser,
      adapters: {
        email_alerts: leaky,
        linkedin: loggedInAdapters.find((a) => a.type === "linkedin")!,
      },
    };
    await executeRun(deps, "email_alerts", "manual");
    await executeRun(deps, "linkedin", "manual");
    expect(getSource(db, "linkedin")?.status).toBe("session_expired");
    expect(LOGGED_IN_SITES["linkedin"]).toBeDefined();

    // Scan run payloads, the raw database file (with its WAL) and every log line.
    const payloads = [...listRuns(db, "email_alerts"), ...listRuns(db, "linkedin")]
      .map((r) => JSON.stringify(r))
      .join("\n");
    expect(payloads).toContain("[redacted]");
    db.$client.pragma("wal_checkpoint(TRUNCATE)");
    closeDatabase(db);
    const files = readdirSync(dir).filter((f) => f.startsWith("radar.sqlite"));
    const dbBytes = files.map((f) => readFileSync(join(dir, f)).toString("latin1")).join("");
    for (const secret of PASSWORDS) {
      expect(payloads, "run payloads").not.toContain(secret);
      expect(dbBytes, "database files").not.toContain(secret);
      expect(logs.join("\n"), "logs").not.toContain(secret);
    }
  });
});
