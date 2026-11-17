// Runs on `pnpm install` (root "prepare"). Points git at the versioned hooks and
// opts this machine out of Turborepo telemetry. Skips quietly outside a git checkout
// (for example inside a Docker build).
import { execFileSync } from "node:child_process";

function run(cmd: string, args: string[]): boolean {
  try {
    execFileSync(cmd, args, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

if (run("git", ["rev-parse", "--is-inside-work-tree"])) {
  run("git", ["config", "core.hooksPath", ".githooks"]);
  console.log("prepare: git core.hooksPath set to .githooks");
}
if (run("pnpm", ["exec", "turbo", "telemetry", "disable"])) {
  console.log("prepare: Turborepo telemetry disabled for this machine");
}
