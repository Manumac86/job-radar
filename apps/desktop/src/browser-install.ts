// Chromium for logged-in sources, downloaded only when the owner agrees (desktop-app spec,
// "Login windows for logged-in sources"; design D6).
import { spawn as nodeSpawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const CHROMIUM_SIZE_NOTE = "about 150 MB";

/** Google Chrome, used for logins and runs when installed (same lookup as the worker). */
export function findChrome(home = homedir()): string | null {
  for (const app of ["/Applications", join(home, "Applications")]) {
    const exe = join(app, "Google Chrome.app", "Contents", "MacOS", "Google Chrome");
    if (existsSync(exe)) return exe;
  }
  return null;
}

/** Deletes Playwright's downloaded browsers (not needed while Google Chrome is used). */
export function removeDownloadedBrowsers(browsersDir: string): void {
  if (!existsSync(browsersDir)) return;
  for (const name of readdirSync(browsersDir))
    if (/^(chromium|chromium_headless_shell|ffmpeg)[-_]/.test(name))
      rmSync(join(browsersDir, name), { recursive: true, force: true });
}

export function isChromiumInstalled(browsersDir: string): boolean {
  if (!existsSync(browsersDir)) return false;
  return readdirSync(browsersDir).some((n) => /^chromium(_headless_shell)?-\d+$/.test(n));
}

export function installChromium(o: {
  execPath: string;
  playwrightCli: string;
  browsersDir: string;
  onProgress?: (line: string) => void;
  spawn?: (cmd: string, args: string[], opts: SpawnOptions) => ChildProcess;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const spawn = o.spawn ?? nodeSpawn;
  return new Promise((resolve) => {
    const child = spawn(o.execPath, [o.playwrightCli, "install", "chromium"], {
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        PLAYWRIGHT_BROWSERS_PATH: o.browsersDir,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const tail: string[] = [];
    const onData = (d: Buffer) => {
      for (const line of d.toString().split(/\r|\n/)) {
        const l = line.trim();
        if (!l) continue;
        tail.push(l);
        if (tail.length > 5) tail.shift();
        o.onProgress?.(l);
      }
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.on("error", (err) => resolve({ ok: false, error: err.message }));
    child.on("exit", (code) =>
      resolve(
        code === 0
          ? { ok: true }
          : { ok: false, error: tail.at(-1) ?? `Installer exited with code ${code}` },
      ),
    );
  });
}
