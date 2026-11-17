import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chmodSync, lstatSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { hostname } from "node:os";
import {
  BrowserMissingError,
  BrowserSessions,
  chooseBrowser,
  chromeLoginArgs,
  profileLockOwner,
  releaseProfile,
  isLoginWall,
  type SiteDefinition,
} from "../src/browser/sessions";

let server: Server;
let base = "";
let dir = "";

beforeAll(async () => {
  // A tiny "site": /set-session sets a cookie; /jobs shows a login form unless the cookie is sent.
  server = createServer((req, res) => {
    if (req.url === "/set-session") {
      res.writeHead(200, {
        "set-cookie": "sid=abc; Path=/; Max-Age=86400; HttpOnly",
        "content-type": "text/html",
      });
      return void res.end("<p>logged in</p>");
    }
    const loggedIn = /sid=abc/.test(req.headers.cookie ?? "");
    res.writeHead(200, { "content-type": "text/html" });
    res.end(loggedIn ? "<h1>Your jobs</h1>" : '<form><input type="password" name="p"></form>');
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  dir = mkdtempSync(join(tmpdir(), "job-radar-profile-"));
});
afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  rmSync(dir, { recursive: true, force: true });
});

const site = (): SiteDefinition => ({
  id: "testsite",
  label: "Test site",
  loginUrl: `${base}/set-session`,
  checkUrl: `${base}/jobs`,
  loginUrlPattern: /\/login\b/,
});

describe("isolated browser profile", () => {
  it("detects login walls by URL or password field", () => {
    expect(isLoginWall(site(), "https://x/login", "")).toBe(true);
    expect(isLoginWall(site(), "https://x/jobs", '<input type="password">')).toBe(true);
    expect(isLoginWall(site(), "https://x/jobs", "<h1>Jobs</h1>")).toBe(false);
  });

  it("keeps the session across a worker restart, and 'Delete browser profile' logs out", async () => {
    const profileDir = join(dir, "browser-profile");
    const first = new BrowserSessions({ profileDir });
    expect(await first.checkSession(site())).toBe("logged_out");
    // Stand-in for the owner's manual login: the site sets a session cookie in the profile.
    await first.withSite(site(), async (p) => p.goto(site().loginUrl));
    expect(await first.checkSession(site())).toBe("ok");

    const afterRestart = new BrowserSessions({ profileDir });
    expect(await afterRestart.checkSession(site())).toBe("ok");

    await afterRestart.deleteProfile();
    expect(existsSync(profileDir)).toBe(false);
    expect(await new BrowserSessions({ profileDir }).checkSession(site())).toBe("logged_out");
  }, 60_000);

  it("refuses to start a login when the browser is not installed, without creating the profile", async () => {
    const profileDir = join(dir, "missing");
    const s = new BrowserSessions({ profileDir, browserInstalled: () => false });
    expect(s.browserInstalled()).toBe(false);
    await expect(s.startLogin(site())).rejects.toBeInstanceOf(BrowserMissingError);
    expect(existsSync(profileDir)).toBe(false);
    expect(s.activeLogin()).toBeNull();
    expect(new BrowserSessions({ profileDir }).browserInstalled()).toBe(true);
  });

  it("chooses Google Chrome on macOS when installed, Chromium otherwise", () => {
    const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    expect(chooseBrowser(undefined, "darwin", chrome)).toEqual({
      kind: "chrome",
      executable: chrome,
    });
    expect(chooseBrowser("auto", "darwin", null)).toEqual({ kind: "chromium" });
    expect(chooseBrowser("chromium", "darwin", chrome)).toEqual({ kind: "chromium" });
    expect(chooseBrowser(undefined, "linux", null)).toEqual({ kind: "chromium" });
  });

  it("opens the login in a plain Chrome (no automation flags) and closes it on Done", async () => {
    const args = chromeLoginArgs("/P", "https://www.linkedin.com/login");
    expect(args).toEqual([
      "--user-data-dir=/P",
      "--use-mock-keychain",
      "--no-first-run",
      "--no-default-browser-check",
      "--new-window",
      "https://www.linkedin.com/login",
    ]);
    expect(args.join(" ")).not.toMatch(/enable-automation|remote-debugging|headless/);

    // A fake "Chrome": records its arguments and waits until it is told to stop.
    const exe = join(dir, "fake-chrome.sh");
    const record = join(dir, "chrome-args.txt");
    writeFileSync(
      exe,
      `#!/bin/sh\necho "$@" > "${record}"\ntrap 'echo stopped >> "${record}"; exit 0' TERM\nwhile true; do sleep 0.1; done\n`,
    );
    chmodSync(exe, 0o755);
    const profileDir = join(dir, "chrome-profile");
    const s = new BrowserSessions({ profileDir, browser: { kind: "chrome", executable: exe } });
    expect(s.browserName()).toBe("Google Chrome");
    expect(s.browserInstalled()).toBe(true);
    expect(await s.startLogin(site())).toEqual({ viewerUrl: null });
    expect(s.activeLogin()).toBe("testsite");
    await expect
      .poll(() => (existsSync(record) ? readFileSync(record, "utf8") : ""))
      .toContain(`--user-data-dir=${profileDir} --use-mock-keychain`);
    expect(await s.finishLogin()).toBe("testsite");
    expect(readFileSync(record, "utf8")).toContain("stopped");
    expect(s.activeLogin()).toBeNull();
    expect(
      new BrowserSessions({
        profileDir,
        browser: { kind: "chrome", executable: "/nope" },
      }).browserInstalled(),
    ).toBe(false);
  });

  it("closes a browser left holding the profile and clears a stale lock", async () => {
    const profileDir = join(dir, "locked");
    mkdirSync(profileDir, { recursive: true });
    const holder = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
      stdio: "ignore",
    });
    symlinkSync(`${hostname()}-${holder.pid}`, join(profileDir, "SingletonLock"));
    symlinkSync("123", join(profileDir, "SingletonCookie"));
    expect(profileLockOwner(profileDir)).toBe(holder.pid);
    const exited = new Promise((r) => holder.once("exit", r));
    expect(await releaseProfile(profileDir)).toBe(true);
    await exited;
    expect(() => lstatSync(join(profileDir, "SingletonLock"))).toThrow();
    expect(() => lstatSync(join(profileDir, "SingletonCookie"))).toThrow();

    // A lock left by a process that no longer exists is just removed.
    symlinkSync(`${hostname()}-999999`, join(profileDir, "SingletonLock"));
    expect(profileLockOwner(profileDir)).toBeNull();
    expect(() => lstatSync(join(profileDir, "SingletonLock"))).toThrow();
    expect(await releaseProfile(profileDir)).toBe(false);
  });

  it("Done also closes the Chrome that took over the window (handoff)", async () => {
    const profileDir = join(dir, "handoff");
    mkdirSync(profileDir, { recursive: true });
    // This "Chrome" starts a background browser that holds the profile lock, then exits at once,
    // like Chrome handing a new window to an instance that already runs on the profile.
    const exe = join(dir, "handoff-chrome.sh");
    writeFileSync(
      exe,
      `#!/bin/sh\n(trap 'exit 0' TERM; while true; do sleep 0.1; done) &\nln -sf "$(hostname)-$!" "${profileDir}/SingletonLock"\nexit 0\n`,
    );
    chmodSync(exe, 0o755);
    const s = new BrowserSessions({ profileDir, browser: { kind: "chrome", executable: exe } });
    await s.startLogin(site());
    await expect.poll(() => profileLockOwner(profileDir)).not.toBeNull();
    const holder = profileLockOwner(profileDir)!;
    await s.finishLogin();
    expect(() => process.kill(holder, 0)).toThrow();
    expect(profileLockOwner(profileDir)).toBeNull();
  });

  it("runs one thing at a time", async () => {
    const s = new BrowserSessions({ profileDir: join(dir, "p2") });
    let inner: unknown = null;
    await s.withSite(site(), async () => {
      inner = await s.withSite(site(), async () => "nested").catch((e: Error) => e.message);
    });
    expect(inner).toBe("The browser is busy with another source");
  }, 60_000);
});
