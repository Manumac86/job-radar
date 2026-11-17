// `pnpm desktop:build`: builds Job Radar.app and a .dmg locally (macos-app task 5.1).
// 1. web standalone, 2. worker bundle, 3. desktop main/preload, 4. stage resources,
// 5. electron-builder (unsigned, never published).
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  build as electronBuild,
  type AfterPackContext,
  type Configuration,
} from "electron-builder";
import { readFileSync } from "node:fs";
import { bundleWorker } from "../../worker/scripts/bundle";
import { compileDesktop } from "./compile";

const desktop = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = join(desktop, "..", "..");
const stage = join(desktop, "build", "stage");

/** Exact versions of what the worker bundle leaves external (see apps/worker/scripts/bundle.ts). */
function externalDeps(): Record<string, string> {
  const pkg = (name: string, from: string) =>
    (
      JSON.parse(
        execFileSync(process.execPath, [
          "-e",
          `process.stdout.write(JSON.stringify(require(require.resolve("${name}/package.json", { paths: [${JSON.stringify(from)}] }))))`,
        ]).toString(),
      ) as { version: string }
    ).version;
  const worker = join(repo, "apps", "worker");
  return {
    "better-sqlite3": pkg("better-sqlite3", worker),
    playwright: pkg("playwright", worker),
    "ai-sdk-provider-claude-code": pkg("ai-sdk-provider-claude-code", worker),
    zod: pkg("zod", worker),
  };
}

/** A symlink to an absolute path would point back into the repository from the app. */
function assertNoAbsoluteLinks(dir: string): void {
  const abs = execFileSync("find", [dir, "-type", "l", "-lname", "/*"]).toString().trim();
  if (abs) throw new Error(`absolute symlinks in the staged web server:\n${abs}`);
}

/** Drops what a Mac never loads from better-sqlite3: C sources and other platforms' binaries. */
function pruneSqlite(root: string): void {
  const out = execFileSync("find", [
    root,
    "-type",
    "d",
    "-name",
    "better-sqlite3",
    "-path",
    "*node_modules*",
  ])
    .toString()
    .split("\n")
    .filter(Boolean);
  const keep = `${process.platform}-${process.arch}.node`;
  for (const dir of out) {
    for (const sub of ["deps", "src"]) rmSync(join(dir, sub), { recursive: true, force: true });
    const pre = join(dir, "prebuilds");
    if (!existsSync(pre)) continue;
    for (const f of readdirSync(pre)) if (f !== keep) rmSync(join(pre, f), { force: true });
  }
}

/** better-sqlite3 ships Node-API prebuilds that also load in Electron's Node: nothing to compile. */
function checkNativeSqlite(pkgDir: string): void {
  const binary = join(pkgDir, "prebuilds", `${process.platform}-${process.arch}.node`);
  if (!existsSync(binary)) throw new Error(`better-sqlite3 prebuild missing: ${binary}`);
}

function run(cmd: string, args: string[], cwd: string, env: Record<string, string> = {}) {
  execFileSync(cmd, args, { cwd, stdio: "inherit", env: { ...process.env, ...env } });
}

/**
 * The worker and the web server are copied here rather than through extraResources:
 * electron-builder drops node_modules and trips on pnpm's (relative) symlinks. Runs before the
 * .dmg is made.
 */
async function copyServers(ctx: AfterPackContext): Promise<void> {
  const resources = join(
    ctx.appOutDir,
    `${ctx.packager.appInfo.productFilename}.app`,
    "Contents",
    "Resources",
  );
  for (const dir of ["worker", "web"]) {
    rmSync(join(resources, dir), { recursive: true, force: true });
    execFileSync("cp", ["-R", join(stage, dir), join(resources, dir)]);
  }
  // Electron's sample app is not part of Job Radar.
  rmSync(join(resources, "default_app.asar"), { force: true });
}

/**
 * Build tools record the absolute build path in a few metadata files (Next's serialized config,
 * pnpm state). They are not used at runtime; replace them so a published build does not carry
 * the builder's home folder (public-release change, task 4.3).
 */
function scrubBuildPaths(dir: string): void {
  // pnpm install state (store path, workspace path): not read at runtime.
  for (const f of [".modules.yaml", ".pnpm-workspace-state-v1.json"])
    rmSync(join(dir, "worker", "node_modules", f), { force: true });
  for (const [path, replacement] of [
    [repo, "/build/job-radar"],
    [homedir(), "/build/home"],
  ] as const) {
    let out: string;
    try {
      out = execFileSync("grep", ["-rlF", "--binary-files=without-match", path, dir], {
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      });
    } catch {
      continue; // grep exits 1 when nothing matches
    }
    for (const file of out.split("\n").filter(Boolean))
      writeFileSync(file, readFileSync(file, "utf8").split(path).join(replacement));
  }
}

async function main() {
  console.log("1/5 web (standalone)");
  run("pnpm", ["--filter", "@job-radar/web", "exec", "next", "build"], repo, {
    BUILD_STANDALONE: "1",
    NEXT_TELEMETRY_DISABLED: "1",
  });
  const standalone = join(repo, "apps", "web", ".next", "standalone");
  if (!existsSync(join(standalone, "apps", "web", "server.js")))
    throw new Error("Next standalone output missing");

  console.log("2/5 worker bundle");
  const workerFile = await bundleWorker();

  console.log("3/5 desktop main and preload");
  await compileDesktop();

  console.log("4/5 stage resources");
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(join(stage, "worker"), { recursive: true });
  cpSync(workerFile, join(stage, "worker", "worker.mjs"));
  writeFileSync(
    join(stage, "worker", "package.json"),
    `${JSON.stringify({ name: "job-radar-worker-runtime", private: true, type: "module", dependencies: externalDeps() }, null, 2)}\n`,
  );
  // Real folders (no symlinks) from the local pnpm store; no workspace, no dev dependencies.
  run(
    "pnpm",
    [
      "install",
      "--ignore-workspace",
      "--prod",
      "--prefer-offline",
      "--ignore-scripts",
      // Optional platform packages include a bundled Claude Code CLI (~215 MB). The app uses the
      // owner's installed `claude` with its login (desktop-app spec), never a second CLI.
      "--no-optional",
      "--config.node-linker=hoisted",
      "--config.confirmModulesPurge=false",
    ],
    join(stage, "worker"),
  );
  checkNativeSqlite(join(stage, "worker", "node_modules", "better-sqlite3"));
  // cp -R keeps pnpm's symlinks as they are: all relative, inside the standalone folder (checked).
  run("cp", ["-R", standalone, join(stage, "web")], repo);
  assertNoAbsoluteLinks(join(stage, "web"));
  cpSync(
    join(repo, "apps", "web", ".next", "static"),
    join(stage, "web", "apps", "web", ".next", "static"),
    {
      recursive: true,
    },
  );
  if (existsSync(join(repo, "apps", "web", "public")))
    cpSync(join(repo, "apps", "web", "public"), join(stage, "web", "apps", "web", "public"), {
      recursive: true,
    });
  pruneSqlite(stage);
  scrubBuildPaths(stage);
  cpSync(join(repo, "profile-seed"), join(stage, "profile-seed"), { recursive: true });
  cpSync(join(repo, "packages", "db", "drizzle"), join(stage, "drizzle"), { recursive: true });

  console.log("5/5 electron-builder (unsigned, not published)");
  const config = JSON.parse(
    readFileSync(join(desktop, "electron-builder.json"), "utf8"),
  ) as Configuration;
  await electronBuild({
    projectDir: desktop,
    config: { ...config, afterPack: copyServers },
    publish: "never",
  });
  console.log(`Done: ${join(desktop, "build", "release")}`);
}

await main();
