import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { remoteProblems } from "./publish.ts";

export interface GuardResult {
  ok: boolean;
  problems: string[];
}

const REMOTE_CACHE_ENV = ["TURBO_TOKEN", "TURBO_TEAM", "TURBO_TEAMID", "TURBO_API"] as const;

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

export function listRemotes(cwd: string): string[] {
  return git(cwd, ["remote"])
    .split("\n")
    .map((r) => r.trim())
    .filter(Boolean);
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const TELEMETRY_RULES: { tool: RegExp; optOut: string }[] = [
  { tool: /\bturbo\b/, optOut: "TURBO_TELEMETRY_DISABLED=1" },
  { tool: /\bnext (dev|build|start)\b/, optOut: "NEXT_TELEMETRY_DISABLED=1" },
];

function workspacePackageFiles(cwd: string): string[] {
  const files = [join(cwd, "package.json")];
  for (const group of ["apps", "packages"]) {
    const dir = join(cwd, group);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      const f = join(dir, name, "package.json");
      if (existsSync(f)) files.push(f);
    }
  }
  return files;
}

/** Scripts (in every workspace package) that run turbo or Next.js without opting out of telemetry. */
export function turboScriptsWithTelemetry(cwd: string): string[] {
  const out: string[] = [];
  for (const file of workspacePackageFiles(cwd)) {
    const pkg = readJson(file);
    const scripts = isRecord(pkg) && isRecord(pkg["scripts"]) ? pkg["scripts"] : {};
    const prefix =
      file === join(cwd, "package.json") ? "" : `${String(isRecord(pkg) ? pkg["name"] : file)} `;
    for (const [name, cmd] of Object.entries(scripts)) {
      if (typeof cmd !== "string") continue;
      for (const rule of TELEMETRY_RULES) {
        if (rule.tool.test(cmd) && !cmd.includes(rule.optOut)) out.push(`${prefix}${name}`);
      }
    }
  }
  return out;
}

export function remoteCacheProblems(cwd: string, env: NodeJS.ProcessEnv): string[] {
  const problems: string[] = [];
  for (const key of REMOTE_CACHE_ENV) {
    if (env[key]) problems.push(`environment variable ${key} is set (Turborepo remote cache)`);
  }
  const turboJson = readJson(join(cwd, "turbo.json"));
  const remoteCache = isRecord(turboJson) ? turboJson["remoteCache"] : undefined;
  if (!isRecord(remoteCache) || remoteCache["enabled"] !== false) {
    problems.push('turbo.json must set "remoteCache": { "enabled": false }');
  }
  const linked = join(cwd, ".turbo", "config.json");
  if (existsSync(linked)) {
    const cfg = readJson(linked);
    if (isRecord(cfg) && (cfg["teamId"] || cfg["teamid"] || cfg["token"] || cfg["apiUrl"])) {
      problems.push(".turbo/config.json links a remote cache (run `turbo unlink`)");
    }
  }
  return problems;
}

/**
 * The macOS app (macos-app design D9): never published, never signed with an identity, no
 * auto-updater, and its servers bind only to 127.0.0.1.
 */
export function desktopProblems(cwd: string): string[] {
  const problems: string[] = [];
  const desktop = join(cwd, "apps", "desktop");
  const builder = join(desktop, "electron-builder.json");
  if (existsSync(builder)) {
    const cfg = readJson(builder);
    const c = isRecord(cfg) ? cfg : {};
    if (!("publish" in c) || c["publish"] !== null)
      problems.push('apps/desktop/electron-builder.json must set "publish": null');
    for (const platform of ["mac", "win", "linux"]) {
      const p = c[platform];
      if (isRecord(p) && p["identity"] !== undefined && p["identity"] !== null)
        problems.push(
          `apps/desktop/electron-builder.json names a signing identity (${platform}.identity)`,
        );
    }
    if (isRecord(c["mac"]) && c["mac"]["identity"] !== null)
      problems.push('apps/desktop/electron-builder.json must set "mac": { "identity": null }');
    if (isRecord(c["mac"]) && c["mac"]["notarize"])
      problems.push("apps/desktop is set to notarize");
  }
  for (const file of workspacePackageFiles(cwd)) {
    const pkg = readJson(file);
    if (!isRecord(pkg)) continue;
    for (const field of ["dependencies", "devDependencies", "optionalDependencies"]) {
      const deps = pkg[field];
      if (isRecord(deps) && ("electron-updater" in deps || "update-electron-app" in deps))
        problems.push(`${String(pkg["name"] ?? file)} depends on an auto-updater`);
    }
  }
  const src = join(desktop, "src");
  if (existsSync(src)) {
    for (const name of readdirSync(src)) {
      if (!name.endsWith(".ts")) continue;
      const text = readFileSync(join(src, name), "utf8");
      const hosts = [
        ...text.matchAll(/(?:WORKER_HOST|HOSTNAME|host)\s*[:=]\s*["'`]([^"'`]+)["'`]/g),
      ].map((m) => m[1]);
      if (/0\.0\.0\.0|["'`]::["'`]/.test(text) || hosts.some((h) => h !== "127.0.0.1"))
        problems.push(`apps/desktop/src/${name} binds a host other than 127.0.0.1`);
    }
  }
  return problems;
}

export function checkLocal(cwd: string, env: NodeJS.ProcessEnv = process.env): GuardResult {
  // Only the owner's private checkout restricts remotes (public-release design D2).
  const problems: string[] = [...remoteProblems(cwd)];
  for (const script of turboScriptsWithTelemetry(cwd)) {
    problems.push(
      `package.json script "${script}" runs turbo or Next.js without disabling telemetry`,
    );
  }
  problems.push(...remoteCacheProblems(cwd, env));
  problems.push(...desktopProblems(cwd));
  return { ok: problems.length === 0, problems };
}
