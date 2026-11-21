// Isolated browser profile and login sessions (design D4, browser-sessions spec).
// The owner logs in by hand; no credential ever passes through this code.
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readlinkSync, rmSync } from "node:fs";
import { homedir, hostname } from "node:os";
import { join } from "node:path";
import { chromium, type BrowserContext } from "playwright";
import { PageBudget, readOnlyPage, type ReadOnlyPage } from "./guard";

export interface SiteDefinition {
  id: string;
  label: string;
  loginUrl: string;
  /** A page that shows the login wall when the session is gone. */
  checkUrl: string;
  /** URL patterns that mean "you are on a login page". */
  loginUrlPattern: RegExp;
}

/** Playwright's Chromium is not installed (macOS app: the owner is asked before downloading). */
export class BrowserMissingError extends Error {
  override readonly name = "BrowserMissingError";
  readonly code = "browser_missing";
  constructor() {
    super("Chromium for logged-in sources is not installed");
  }
}

export class SessionExpiredError extends Error {
  override readonly name = "SessionExpiredError";
  constructor(readonly site: string) {
    super(`The ${site} session expired: log in again from Settings → Sessions`);
  }
}

/** The site answered with a bot check instead of the page. Job Radar never tries to get past it. */
export class BotCheckError extends Error {
  override readonly name = "BotCheckError";
  constructor(readonly site: string) {
    super(
      `${site} answered with a bot check (Cloudflare) instead of the page. Job Radar does not get past bot checks: use this site's email alerts instead, or disable the source.`,
    );
  }
}

/** A Cloudflare challenge or block page ("Just a moment...", "Attention Required!"). */
export function isBotCheck(html: string): boolean {
  const title = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() ?? "";
  return (
    /^just a moment|^attention required|^access denied/i.test(title) ||
    /cf-browser-verification|Performing security verification|Sorry, you have been blocked/i.test(
      html.length < 200_000 ? html : "",
    )
  );
}

/** A login wall: a login URL, or a page whose main form asks for a password. */
export function isLoginWall(site: SiteDefinition, url: string, html: string): boolean {
  if (site.loginUrlPattern.test(url)) return true;
  return /<input[^>]+type=["']?password/i.test(html);
}

export interface BrowserAccess {
  withSite<T>(
    site: SiteDefinition,
    fn: (page: ReadOnlyPage) => Promise<T>,
    log?: (l: string) => void,
  ): Promise<T>;
}

type LoginState = {
  site: string;
  /** Playwright-driven window (Chromium, Docker viewer). */
  context: BrowserContext | null;
  /** A plain, non-automated Chrome process (Google sign-in refuses automated browsers). */
  chrome: ChildProcess | null;
  viewer: ChildProcess[];
} | null;

/** Which browser the isolated profile uses. */
export type BrowserChoice = { kind: "chrome"; executable: string } | { kind: "chromium" };

/** The owner's Google Chrome on macOS, if installed. */
export function findChrome(home = homedir()): string | null {
  for (const app of ["/Applications", join(home, "Applications")]) {
    const exe = join(app, "Google Chrome.app", "Contents", "MacOS", "Google Chrome");
    if (existsSync(exe)) return exe;
  }
  return null;
}

/**
 * "chrome" or "chromium" from JOB_RADAR_BROWSER; "auto" (default) uses Google Chrome on macOS
 * when installed, else Playwright's Chromium (Docker, Linux).
 */
export function chooseBrowser(
  setting: string | undefined,
  platform: string = process.platform,
  chrome: string | null = platform === "darwin" ? findChrome() : null,
): BrowserChoice {
  if (setting === "chromium") return { kind: "chromium" };
  if ((setting === "chrome" || !setting || setting === "auto") && chrome)
    return { kind: "chrome", executable: chrome };
  return { kind: "chromium" };
}

/**
 * Flags for the login window. Same mock keychain as Playwright's launches, so the scheduled
 * runs can read the cookies this window stores. No automation flags, no DevTools port.
 */
export function chromeLoginArgs(profileDir: string, url: string): string[] {
  return [
    `--user-data-dir=${profileDir}`,
    "--use-mock-keychain",
    "--no-first-run",
    "--no-default-browser-check",
    "--new-window",
    url,
  ];
}

export interface BrowserSessionsOptions {
  profileDir: string;
  /** "window" opens a normal Chromium window (native). "novnc" uses Xvfb + x11vnc + noVNC (Docker). */
  viewer?: "window" | "novnc";
  pageCapPerHour?: number;
  headless?: boolean;
  log?: (line: string, data?: Record<string, unknown>) => void;
  /** Whether the browser binary exists (default: Playwright's Chromium path). */
  browserInstalled?: () => boolean;
  /** Google Chrome (macOS) or Playwright's Chromium (default). */
  browser?: BrowserChoice;
}

/**
 * One persistent profile, used by one thing at a time: a login session or a read-only run.
 * The profile directory lives in the worker's data volume and is never shared with the
 * owner's everyday browser.
 */
export class BrowserSessions implements BrowserAccess {
  private login: LoginState = null;
  private busy = false;
  readonly budget: PageBudget;

  constructor(private readonly o: BrowserSessionsOptions) {
    this.budget = new PageBudget(o.pageCapPerHour ?? 20);
  }

  get profileDir(): string {
    return this.o.profileDir;
  }

  browserName(): string {
    return this.o.browser?.kind === "chrome" ? "Google Chrome" : "Chromium";
  }

  browserInstalled(): boolean {
    if (this.o.browserInstalled) return this.o.browserInstalled();
    if (this.o.browser?.kind === "chrome") return existsSync(this.o.browser.executable);
    try {
      return existsSync(chromium.executablePath());
    } catch {
      return false;
    }
  }

  hasProfile(): boolean {
    return existsSync(this.o.profileDir);
  }

  activeLogin(): string | null {
    return this.login?.site ?? null;
  }

  private async open(headless: boolean, env?: Record<string, string>): Promise<BrowserContext> {
    mkdirSync(this.o.profileDir, { recursive: true });
    return chromium.launchPersistentContext(this.o.profileDir, {
      headless,
      ...(this.o.browser?.kind === "chrome" ? { executablePath: this.o.browser.executable } : {}),
      viewport: { width: 1280, height: 860 },
      locale: "en-GB",
      ...(env ? { env: { ...process.env, ...env } } : {}),
    });
  }

  /** Starts a manual login. Returns the viewer URL when running in Docker. */
  async startLogin(site: SiteDefinition): Promise<{ viewerUrl: string | null }> {
    if (this.busy) throw new Error("A source run is using the browser; try again in a minute");
    if (this.login)
      throw new Error(`A login for ${this.login.site} is already open; finish it first`);
    if (!this.browserInstalled()) throw new BrowserMissingError();
    if (this.o.browser?.kind === "chrome" && this.o.viewer !== "novnc") {
      mkdirSync(this.o.profileDir, { recursive: true });
      await releaseProfile(this.o.profileDir, this.o.log);
      const chrome = spawn(
        this.o.browser.executable,
        chromeLoginArgs(this.o.profileDir, site.loginUrl),
        {
          stdio: "ignore",
        },
      );
      const login: NonNullable<LoginState> = { site: site.id, context: null, chrome, viewer: [] };
      this.login = login;
      chrome.once("exit", () => {
        // The owner closed the window: the login stays open until "Done" so the session is checked.
        login.chrome = null;
      });
      this.o.log?.("login window opened in Google Chrome", { site: site.id });
      return { viewerUrl: null };
    }
    const viewer: ChildProcess[] = [];
    let env: Record<string, string> | undefined;
    if (this.o.viewer === "novnc") {
      // Display :99 inside the container; VNC on localhost only; noVNC web viewer on 6080,
      // which docker-compose publishes on 127.0.0.1 only (design D10).
      viewer.push(
        spawn("Xvfb", [":99", "-screen", "0", "1280x900x24", "-nolisten", "tcp"], {
          stdio: "ignore",
        }),
      );
      await new Promise((r) => setTimeout(r, 800));
      viewer.push(
        spawn(
          "x11vnc",
          [
            "-display",
            ":99",
            "-localhost",
            "-nopw",
            "-forever",
            "-shared",
            "-rfbport",
            "5900",
            "-quiet",
          ],
          { stdio: "ignore" },
        ),
      );
      viewer.push(
        spawn("websockify", ["--web", "/usr/share/novnc", "0.0.0.0:6080", "127.0.0.1:5900"], {
          stdio: "ignore",
        }),
      );
      env = { DISPLAY: ":99" };
      await new Promise((r) => setTimeout(r, 800));
    }
    try {
      const context = await this.open(false, env);
      const page = context.pages()[0] ?? (await context.newPage());
      await page.goto(site.loginUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
      this.login = { site: site.id, context, chrome: null, viewer };
    } catch (err) {
      for (const p of viewer) p.kill();
      throw err;
    }
    this.o.log?.("login session opened", { site: site.id });
    return {
      viewerUrl:
        this.o.viewer === "novnc"
          ? "http://127.0.0.1:6080/vnc.html?autoconnect=1&resize=scale"
          : null,
    };
  }

  /** The owner clicked "Done": close the window and the viewer. Cookies stay in the profile. */
  async finishLogin(): Promise<string | null> {
    const current = this.login;
    if (!current) return null;
    this.login = null;
    await current.context?.close().catch(() => {});
    if (current.chrome) await stopGracefully(current.chrome);
    for (const p of current.viewer) p.kill();
    // Chrome can hand the window to another process; whatever still holds the profile is closed.
    await releaseProfile(this.o.profileDir, this.o.log);
    this.o.log?.("login session closed", { site: current.site });
    return current.site;
  }

  /** Opens the site's check page headless and reports whether the session is still valid. */
  async checkSession(site: SiteDefinition): Promise<"ok" | "logged_out"> {
    return this.withSite(site, async (page) => {
      await page.goto(site.checkUrl);
      return isLoginWall(site, page.url(), await page.html()) ? "logged_out" : "ok";
    });
  }

  /** Runs `fn` with a read-only page on the persistent profile (one at a time). */
  async withSite<T>(
    site: SiteDefinition,
    fn: (page: ReadOnlyPage) => Promise<T>,
    log?: (l: string) => void,
  ): Promise<T> {
    if (this.login) throw new Error(`A login for ${this.login.site} is in progress`);
    if (this.busy) throw new Error("The browser is busy with another source");
    this.busy = true;
    let context: BrowserContext | null = null;
    try {
      // No login is open, so a browser holding the profile is a leftover (e.g. a worker restart).
      await releaseProfile(this.o.profileDir, this.o.log);
      context = await this.open(this.o.headless ?? true);
      const page = context.pages()[0] ?? (await context.newPage());
      return await fn(
        readOnlyPage(page, { site: site.id, budget: this.budget, ...(log ? { log } : {}) }),
      );
    } finally {
      await context?.close().catch(() => {});
      this.busy = false;
    }
  }

  /** "Delete browser profile": logs out of every site by removing the profile directory. */
  async deleteProfile(): Promise<void> {
    await this.finishLogin();
    if (this.busy) throw new Error("A source run is using the browser; try again in a minute");
    rmSync(this.o.profileDir, { recursive: true, force: true });
    this.o.log?.("browser profile deleted");
  }
}

const SINGLETON_FILES = ["SingletonLock", "SingletonSocket", "SingletonCookie"];

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * The browser process holding the profile, from Chromium's SingletonLock ("<host>-<pid>").
 * Null when nothing holds it; a lock left by a dead process is removed.
 */
export function profileLockOwner(profileDir: string, host = hostname()): number | null {
  const lock = join(profileDir, "SingletonLock");
  let target: string;
  try {
    if (!lstatSync(lock).isSymbolicLink()) return null;
    target = readlinkSync(lock);
  } catch {
    return null;
  }
  const m = /^(.*)-(\d+)$/.exec(target);
  const pid = m ? Number(m[2]) : NaN;
  if (m && m[1] === host && Number.isInteger(pid) && alive(pid)) return pid;
  for (const f of SINGLETON_FILES) rmSync(join(profileDir, f), { force: true });
  return null;
}

/**
 * Closes whatever browser still holds the isolated profile (e.g. a login window left open when
 * the worker restarted). Only that profile's browser: the owner's everyday Chrome uses another.
 */
export async function releaseProfile(
  profileDir: string,
  log?: (line: string, data?: Record<string, unknown>) => void,
): Promise<boolean> {
  const pid = profileLockOwner(profileDir);
  if (pid === null) return false;
  log?.("closing a browser left open on the isolated profile", { pid });
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // Already gone.
  }
  for (let i = 0; i < 50 && alive(pid); i++) await new Promise((r) => setTimeout(r, 100));
  if (alive(pid)) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // Already gone.
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  profileLockOwner(profileDir); // removes the stale lock
  return true;
}

/** SIGTERM lets Chrome write its cookies; SIGKILL after 5 s (the app waits 8 s for the worker). */
async function stopGracefully(p: ChildProcess): Promise<void> {
  if (p.exitCode !== null || p.signalCode !== null) return;
  const exited = new Promise<void>((r) => p.once("exit", () => r()));
  p.kill("SIGTERM");
  const t = setTimeout(() => p.kill("SIGKILL"), 5_000);
  await exited;
  clearTimeout(t);
}

export function defaultProfileDir(dataDir: string): string {
  return join(dataDir, "browser-profile");
}
