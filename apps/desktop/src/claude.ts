// Finding the owner's Claude Code CLI (desktop-app spec, "Claude Code CLI from the owner's
// installation"; design D5). Apps opened from Finder do not get the shell's PATH.
import { execFile } from "node:child_process";
import { accessSync, constants, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

export function knownClaudeLocations(home = homedir()): string[] {
  return [
    join(home, ".local", "bin", "claude"),
    "/opt/homebrew/bin/claude",
    "/usr/local/bin/claude",
    join(home, ".npm-global", "bin", "claude"),
    join(home, ".claude", "local", "claude"),
  ];
}

/** Runs `cmd` in the owner's login shell; null on error or after `timeoutMs`. */
export function loginShell(
  cmd: string,
  shell = process.env["SHELL"] || "/bin/zsh",
  timeoutMs = 5000,
): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(shell, ["-lc", cmd], { timeout: timeoutMs }, (err, stdout) =>
      resolve(err ? null : stdout.trim() || null),
    );
  });
}

export interface ClaudeLookup {
  path: string | null;
  source: "config" | "known" | "shell" | null;
  /** The configured path was set but is not an executable. */
  configInvalid: boolean;
}

export async function findClaude(
  configured: string | null,
  deps: {
    home?: string;
    exists?: (p: string) => boolean;
    shell?: (cmd: string) => Promise<string | null>;
  } = {},
): Promise<ClaudeLookup> {
  const exists = deps.exists ?? isExecutable;
  const shell = deps.shell ?? ((c: string) => loginShell(c));
  if (configured && exists(configured))
    return { path: configured, source: "config", configInvalid: false };
  const configInvalid = Boolean(configured);
  for (const p of knownClaudeLocations(deps.home))
    if (exists(p)) return { path: p, source: "known", configInvalid };
  const fromShell = (await shell("command -v claude"))?.split("\n").pop()?.trim() ?? null;
  if (fromShell && fromShell.startsWith("/") && exists(fromShell))
    return { path: fromShell, source: "shell", configInvalid };
  return { path: null, source: null, configInvalid };
}

/** PATH for the children: the login shell's PATH, else a sensible default (the CLI may need node). */
export async function childPath(
  shell: (cmd: string) => Promise<string | null> = (c) => loginShell(c),
  claudePath: string | null = null,
): Promise<string> {
  const fromShell = (await shell('printf %s "$PATH"'))?.split("\n").pop()?.trim();
  const base = fromShell || "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin";
  const dirs = base.split(":");
  if (claudePath) {
    const dir = claudePath.slice(0, claudePath.lastIndexOf("/"));
    if (dir && !dirs.includes(dir)) dirs.unshift(dir);
  }
  return dirs.join(":");
}
