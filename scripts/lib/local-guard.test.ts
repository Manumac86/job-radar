import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkLocal, desktopProblems } from "./local-guard.ts";

let dir: string;

function git(...args: string[]): void {
  execFileSync("git", args, { cwd: dir, stdio: "ignore" });
}

function writeRepo(scripts: Record<string, string>, turbo: object): void {
  writeFileSync(join(dir, "package.json"), JSON.stringify({ scripts }));
  writeFileSync(join(dir, "turbo.json"), JSON.stringify(turbo));
}

const safeScripts = { test: "TURBO_TELEMETRY_DISABLED=1 turbo run test" };
const safeTurbo = { remoteCache: { enabled: false } };

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "job-radar-guard-"));
  git("init", "-q");
  writeRepo(safeScripts, safeTurbo);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("checkLocal", () => {
  it("passes on a repo with no remotes, telemetry off and no remote cache", () => {
    expect(checkLocal(dir, {})).toEqual({ ok: true, problems: [] });
  });

  it("allows remotes in a checkout that is not marked private (public clones)", () => {
    git("remote", "add", "origin", "https://github.com/Manumac86/job-radar.git");
    expect(checkLocal(dir, {}).ok).toBe(true);
  });

  it("in the private checkout, fails naming any remote but public, and passes once removed", () => {
    git("config", "jobradar.private", "true");
    git("remote", "add", "public", "git@github.com:Manumac86/job-radar.git");
    expect(checkLocal(dir, {}).ok).toBe(true);
    git("remote", "add", "origin", "https://example.invalid/repo.git");
    const failed = checkLocal(dir, {});
    expect(failed.ok).toBe(false);
    expect(failed.problems.join("\n")).toContain('git remote "origin"');

    git("remote", "remove", "origin");
    expect(checkLocal(dir, {}).ok).toBe(true);
  });

  it("fails when a script runs turbo without disabling telemetry", () => {
    writeRepo({ build: "turbo run build" }, safeTurbo);
    expect(checkLocal(dir, {}).problems).toEqual([
      'package.json script "build" runs turbo or Next.js without disabling telemetry',
    ]);
  });

  it("fails when a workspace package runs Next.js with telemetry on", () => {
    mkdirSync(join(dir, "apps", "web"), { recursive: true });
    writeFileSync(
      join(dir, "apps", "web", "package.json"),
      JSON.stringify({ name: "web", scripts: { dev: "next dev" } }),
    );
    expect(checkLocal(dir, {}).problems).toEqual([
      'package.json script "web dev" runs turbo or Next.js without disabling telemetry',
    ]);
  });

  it("fails when the remote cache is not explicitly disabled", () => {
    writeRepo(safeScripts, {});
    expect(checkLocal(dir, {}).ok).toBe(false);
  });

  it("fails when remote cache credentials are present", () => {
    expect(checkLocal(dir, { TURBO_TOKEN: "x" }).problems[0]).toContain("TURBO_TOKEN");
    mkdirSync(join(dir, ".turbo"));
    writeFileSync(join(dir, ".turbo", "config.json"), JSON.stringify({ teamId: "team_1" }));
    expect(checkLocal(dir, {}).problems[0]).toContain("turbo unlink");
  });
});

describe("desktopProblems", () => {
  const desktop = () => join(dir, "apps", "desktop");
  function writeDesktop(builder: object, src: string, deps: Record<string, string> = {}): void {
    mkdirSync(join(desktop(), "src"), { recursive: true });
    writeFileSync(join(desktop(), "electron-builder.json"), JSON.stringify(builder));
    writeFileSync(join(desktop(), "src", "runtime.ts"), src);
    writeFileSync(
      join(desktop(), "package.json"),
      JSON.stringify({ name: "@job-radar/desktop", devDependencies: deps }),
    );
  }
  const safe = { publish: null, mac: { identity: null } };
  const localSrc = 'const env = { WORKER_HOST: "127.0.0.1", HOSTNAME: "127.0.0.1" };';

  it("passes an unpublished, unsigned, localhost-only app", () => {
    writeDesktop(safe, localSrc);
    expect(desktopProblems(dir)).toEqual([]);
    expect(checkLocal(dir, {}).ok).toBe(true);
  });

  it("fails on publishing, a signing identity, an auto-updater or a public bind", () => {
    writeDesktop(
      { publish: { provider: "github" }, mac: { identity: "Developer ID Application: Me" } },
      'const env = { HOSTNAME: "0.0.0.0" };',
      { "electron-updater": "6.0.0" },
    );
    expect(desktopProblems(dir)).toEqual([
      'apps/desktop/electron-builder.json must set "publish": null',
      "apps/desktop/electron-builder.json names a signing identity (mac.identity)",
      'apps/desktop/electron-builder.json must set "mac": { "identity": null }',
      "@job-radar/desktop depends on an auto-updater",
      "apps/desktop/src/runtime.ts binds a host other than 127.0.0.1",
    ]);
    expect(checkLocal(dir, {}).ok).toBe(false);
  });
});
