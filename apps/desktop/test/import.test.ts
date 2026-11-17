import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { importJobRadar, needsFirstRun, resolveImportSource } from "../src/import";

function fakeRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), "jr-repo-"));
  mkdirSync(join(repo, "data", "db"), { recursive: true });
  const db = new DatabaseSync(join(repo, "data", "db", "radar.sqlite"));
  db.exec("PRAGMA journal_mode=WAL; CREATE TABLE offers (id INTEGER PRIMARY KEY, title TEXT);");
  for (let i = 0; i < 25; i++)
    db.prepare("INSERT INTO offers (title) VALUES (?)").run(`Offer ${i}`);
  db.close();
  mkdirSync(join(repo, "data", "profile"), { recursive: true });
  writeFileSync(join(repo, "data", "profile", "preferences.yaml"), "owner: me\n");
  mkdirSync(join(repo, "data", "browser-profile", "Default"), { recursive: true });
  writeFileSync(join(repo, "data", "browser-profile", "Default", "Cookies"), "cookies");
  writeFileSync(join(repo, "data", "browser-profile", "SingletonLock"), "lock");
  mkdirSync(join(repo, "data", "backups"), { recursive: true });
  writeFileSync(join(repo, "data", "backups", "radar-1.sqlite"), "b");
  mkdirSync(join(repo, "secrets"));
  writeFileSync(join(repo, "secrets", "telegram_bot_token"), "123:abc", { mode: 0o644 });
  writeFileSync(join(repo, "secrets", ".gitkeep"), "");
  return repo;
}

function target() {
  const root = mkdtempSync(join(tmpdir(), "jr-app-"));
  return { dataDir: join(root, "data"), secretsDir: join(root, "secrets") };
}

describe("first run", () => {
  it("is needed only while the app has no database", () => {
    const repo = fakeRepo();
    expect(needsFirstRun(join(repo, "data"))).toBe(false);
    expect(needsFirstRun(target().dataDir)).toBe(true);
    expect(resolveImportSource(repo)).toEqual({
      data: join(repo, "data"),
      secrets: join(repo, "secrets"),
    });
    expect(resolveImportSource(join(repo, "data"))).toEqual({
      data: join(repo, "data"),
      secrets: null,
    });
    expect(resolveImportSource(tmpdir())).toBeNull();
  });
});

describe("importJobRadar", () => {
  it("copies database, profile, browser profile, backups and secrets without touching the source", async () => {
    const repo = fakeRepo();
    const t = target();
    const srcDb = join(repo, "data", "db", "radar.sqlite");
    const before = statSync(srcDb).mtimeMs;
    const res = await importJobRadar(repo, t, {
      isRunning: async () => false,
      now: () => new Date("2026-11-17T12:00:00Z"),
    });
    expect(res).toEqual({
      ok: true,
      copied: ["database", "profile", "browser-profile", "backups", "secrets"],
    });

    const db = new DatabaseSync(join(t.dataDir, "db", "radar.sqlite"), { readOnly: true });
    expect(db.prepare("SELECT count(*) AS n FROM offers").get()).toEqual({ n: 25 });
    db.close();
    expect(readFileSync(join(t.dataDir, "profile", "preferences.yaml"), "utf8")).toBe(
      "owner: me\n",
    );
    expect(existsSync(join(t.dataDir, "browser-profile", "Default", "Cookies"))).toBe(true);
    expect(existsSync(join(t.dataDir, "browser-profile", "SingletonLock"))).toBe(false);
    expect(statSync(join(t.secretsDir, "telegram_bot_token")).mode & 0o777).toBe(0o600);
    expect(statSync(t.secretsDir).mode & 0o777).toBe(0o700);
    expect(existsSync(join(t.secretsDir, ".gitkeep"))).toBe(false);
    expect(JSON.parse(readFileSync(join(t.dataDir, "import.json"), "utf8"))).toMatchObject({
      from: repo,
      at: "2026-11-17T12:00:00.000Z",
    });
    expect(statSync(srcDb).mtimeMs).toBe(before);

    const again = await importJobRadar(repo, t, { isRunning: async () => false });
    expect(again.error).toMatch(/already has data/);
  });

  it("refuses while another Job Radar is running and when no data is found", async () => {
    const repo = fakeRepo();
    const t = target();
    const res = await importJobRadar(repo, t, { isRunning: async () => true });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/docker compose down/);
    expect(existsSync(join(t.dataDir, "db", "radar.sqlite"))).toBe(false);
    expect((await importJobRadar(tmpdir(), t, { isRunning: async () => false })).error).toMatch(
      /No Job Radar data found/,
    );
  });
});
