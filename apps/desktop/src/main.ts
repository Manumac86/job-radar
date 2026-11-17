// Job Radar for macOS (macos-app change). The main process only launches and supervises the
// worker and the web server, shows the window and the menu bar item, and answers the narrow
// preload bridge. All product logic stays in the worker and the web app.
import {
  BrowserWindow,
  Menu,
  Tray,
  app,
  dialog,
  ipcMain,
  nativeImage,
  session,
  shell,
  type IpcMainInvokeEvent,
  type MenuItemConstructorOptions,
} from "electron";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { CHANNELS, type DesktopInfo } from "./bridge";
import {
  CHROMIUM_SIZE_NOTE,
  findChrome,
  installChromium,
  isChromiumInstalled,
  removeDownloadedBrowsers,
} from "./browser-install";
import { childPath, findClaude, isExecutable, type ClaudeLookup } from "./claude";
import { runFirstRunIfNeeded } from "./first-run";
import { buildMenuModel, type MenuModel, type StatusSummary } from "./menu-model";
import { appPaths, ensureDirs, loadConfig, saveConfig, type DesktopConfig } from "./paths";
import { checkPorts } from "./ports";
import { devLayout, helperExecutable, packagedLayout, processSpecs, type Layout } from "./runtime";
import { Supervisor } from "./supervisor";
import { decideNavigation } from "./url-policy";

const here = import.meta.dirname;
const assets = app.isPackaged ? join(process.resourcesPath, "assets") : join(here, "..", "assets");
const loadingFile = join(assets, "loading.html");
const paths = appPaths();
let config: DesktopConfig = loadConfig(paths);
let dataDir = paths.data;
let layout: Layout;
let supervisor: Supervisor | null = null;
let claude: ClaudeLookup = { path: null, source: null, configInvalid: false };
let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let summary: StatusSummary | null = null;
let stoppedMessage: string | null = null;
let quitting = false;

const webUrl = () => `http://127.0.0.1:${config.webPort}/`;
const workerUrl = (p: string) => `http://127.0.0.1:${config.workerPort}${p}`;

// ---------- window ----------

function showLoading(error?: { title?: string; message: string; log?: string; restart?: boolean }) {
  if (!win) return;
  const query: Record<string, string> = {};
  if (error) {
    query["error"] = error.message;
    if (error.title) query["title"] = error.title;
    if (error.log) query["log"] = error.log;
    if (error.restart) query["restart"] = "1";
  }
  void win.loadFile(loadingFile, { query });
}

function createWindow(): BrowserWindow {
  const w = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: "Job Radar",
    show: false,
    webPreferences: {
      preload: join(here, "preload.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      webviewTag: false,
    },
  });
  const loadingPath = pathToFileURL(loadingFile).pathname;
  const guard = (url: string): boolean => {
    const decision = decideNavigation(url, config.webPort, loadingPath);
    if (decision === "external") void shell.openExternal(url);
    return decision === "allow";
  };
  w.webContents.on("will-navigate", (e, url) => {
    if (!guard(url)) e.preventDefault();
  });
  w.webContents.on("will-redirect", (e, url) => {
    if (!guard(url)) e.preventDefault();
  });
  w.webContents.setWindowOpenHandler(({ url }) => {
    guard(url);
    // Even app URLs opened with target=_blank stay in the one window.
    if (decideNavigation(url, config.webPort, loadingPath) === "allow") void w.loadURL(url);
    return { action: "deny" };
  });
  w.on("close", (e) => {
    if (quitting) return;
    // Closing keeps the radar running in the menu bar.
    e.preventDefault();
    w.hide();
    app.dock?.hide();
  });
  w.once("ready-to-show", () => w.show());
  return w;
}

function showWindow(): void {
  if (!win || win.isDestroyed()) {
    win = createWindow();
    if (supervisor?.state("web") === "running") void win.loadURL(webUrl());
    else if (stoppedMessage) showStopped();
    else showLoading();
  }
  void app.dock?.show();
  win.show();
  win.focus();
}

function showStopped(): void {
  const failed = ["worker", "web"].find((n) => supervisor?.state(n) === "failed");
  showLoading({
    title: stoppedMessage ?? "Job Radar stopped",
    message: (failed && supervisor?.error(failed)) || "A server stopped unexpectedly.",
    log: failed ? supervisor?.lastLines(failed).join("\n") : undefined,
    restart: true,
  });
}

// ---------- menu bar ----------

function icon(kind: MenuModel["icon"]) {
  const img = nativeImage.createFromPath(join(assets, `tray-${kind}Template.png`));
  img.setTemplateImage(true);
  return img;
}

function renderTray(): void {
  if (!tray) return;
  const model = buildMenuModel({
    summary,
    stopped: stoppedMessage,
    launchAtLogin: config.launchAtLogin,
    starting: !summary && !stoppedMessage,
  });
  tray.setImage(icon(model.icon));
  tray.setToolTip(model.tooltip);
  const template: MenuItemConstructorOptions[] = model.items.map((i) => {
    if (i.kind === "separator") return { type: "separator" };
    if (i.kind === "label") return { label: i.label, enabled: false };
    const base: MenuItemConstructorOptions = {
      label: i.label,
      enabled: i.enabled ?? true,
      click: () => void onMenuAction(i.id),
    };
    if (i.checked !== undefined) return { ...base, type: "checkbox", checked: i.checked };
    if (i.id === "quit") return { ...base, accelerator: "Command+Q" };
    return base;
  });
  tray.setContextMenu(Menu.buildFromTemplate(template));
}

async function onMenuAction(id: string): Promise<void> {
  if (id === "open") return showWindow();
  if (id === "quit") return void app.quit();
  if (id === "restart") return restartAll();
  if (id === "launch-at-login") return void setLaunchAtLogin(!config.launchAtLogin);
  if (id === "run-all") {
    await fetch(workerUrl("/sources/run-all"), { method: "POST" }).catch(() => null);
    return void refreshStatus();
  }
  if (id === "claude-help") {
    await dialog.showMessageBox({
      type: "warning",
      message: "Claude Code is not ready",
      detail: [
        summary?.llmMessage ?? "",
        "",
        "Open Terminal and run `claude`, then log in with your Claude subscription.",
        claude.path
          ? `Job Radar uses ${claude.path}.`
          : "Job Radar could not find the `claude` CLI. Install it, or set its path in Settings → Desktop.",
        "Scoring resumes automatically within 30 minutes.",
      ].join("\n"),
    });
  }
}

async function refreshStatus(): Promise<void> {
  if (supervisor?.state("worker") !== "running") return renderTray();
  try {
    const res = await fetch(workerUrl("/status/summary"), { signal: AbortSignal.timeout(3000) });
    summary = res.ok ? ((await res.json()) as StatusSummary) : null;
  } catch {
    summary = null;
  }
  renderTray();
}

function setLaunchAtLogin(on: boolean): boolean {
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: on });
  config = saveConfig(paths, { launchAtLogin: on });
  renderTray();
  return config.launchAtLogin;
}

// ---------- servers ----------

/**
 * Node for the children. Packaged: Electron's helper (no Dock icon). Development: the system
 * Node, whose ABI matches the repo's node_modules.
 */
function childNode(): string {
  if (!app.isPackaged) return "node";
  const helper = helperExecutable(process.execPath, app.getName());
  return existsSync(helper) ? helper : process.execPath;
}

async function childEnvInput() {
  claude = await findClaude(config.claudePath);
  return {
    layout,
    execPath: childNode(),
    dataDir,
    secretsDir: paths.secrets,
    browsersDir: paths.browsers,
    logsDir: join(dataDir, "logs"),
    home: homedir(),
    path: await childPath(undefined, claude.path),
    webPort: config.webPort,
    workerPort: config.workerPort,
    claudePath: claude.path,
    testMode: process.env["JOB_RADAR_TEST_MODE"] === "1",
  };
}

async function startServers(): Promise<void> {
  const problem = await checkPorts({ web: config.webPort, worker: config.workerPort });
  if (problem) {
    stoppedMessage = "Another Job Radar is running";
    showWindow();
    showLoading({ title: stoppedMessage, message: problem.message, restart: true });
    return renderTray();
  }
  supervisor = new Supervisor(processSpecs(await childEnvInput()));
  supervisor.onChange((name, state) => {
    if (state === "failed") {
      stoppedMessage = `${name === "worker" ? "Worker" : "Web server"} stopped`;
      if (win && !win.isDestroyed()) showStopped();
    }
    renderTray();
  });
  stoppedMessage = null;
  renderTray();
  await supervisor.start();
  if (supervisor.state("worker") === "running" && supervisor.state("web") === "running") {
    if (win && !win.isDestroyed()) void win.loadURL(webUrl());
    void refreshStatus();
  }
}

async function restartAll(): Promise<void> {
  stoppedMessage = null;
  summary = null;
  if (win && !win.isDestroyed()) showLoading();
  if (!supervisor) return startServers();
  await supervisor.stop();
  supervisor = null;
  await startServers();
}

// ---------- bridge ----------

/** Only the app's own pages may call the bridge. */
function trusted(e: IpcMainInvokeEvent): boolean {
  const url = e.senderFrame?.url ?? "";
  return decideNavigation(url, config.webPort, pathToFileURL(loadingFile).pathname) === "allow";
}

function handle<A extends unknown[], R>(channel: string, fn: (...args: A) => R | Promise<R>) {
  ipcMain.handle(channel, (e, ...args) => {
    if (!trusted(e)) throw new Error("Not allowed");
    return fn(...(args as A));
  });
}

function registerBridge(): void {
  handle(CHANNELS.getInfo, async (): Promise<DesktopInfo> => ({
    version: app.getVersion(),
    dataDir,
    logsDir: join(dataDir, "logs"),
    launchAtLogin: config.launchAtLogin,
    claude: { path: claude.path, configured: config.claudePath, source: claude.source },
    browserInstalled: Boolean(findChrome()) || isChromiumInstalled(paths.browsers),
    browser: findChrome() ? "Google Chrome" : "Chromium",
    chromiumDownloaded: isChromiumInstalled(paths.browsers),
  }));
  handle(CHANNELS.removeChromium, async () => {
    const { response } = await dialog.showMessageBox({
      type: "question",
      buttons: ["Remove", "Cancel"],
      defaultId: 0,
      cancelId: 1,
      message: "Remove the downloaded Chromium?",
      detail:
        "Job Radar uses your Google Chrome (with its own isolated profile) for logins and logged-in sources. Your sessions are kept.",
    });
    if (response !== 0) return { ok: false };
    removeDownloadedBrowsers(paths.browsers);
    return { ok: true };
  });
  handle(CHANNELS.setLaunchAtLogin, (on: boolean) => setLaunchAtLogin(on === true));
  handle(CHANNELS.setClaudePath, async (path: string | null) => {
    const clean = typeof path === "string" && path.trim() ? path.trim() : null;
    if (clean && (!clean.startsWith("/") || !isExecutable(clean)))
      return { ok: false, error: `${clean} is not an executable file` };
    config = saveConfig(paths, { claudePath: clean });
    if (supervisor) {
      supervisor.updateEnv("worker", processSpecs(await childEnvInput())[0]?.env ?? {});
      await supervisor.restart("worker");
    }
    return { ok: true, path: claude.path };
  });
  handle(CHANNELS.installBrowser, async () => {
    const { response } = await dialog.showMessageBox({
      type: "question",
      buttons: ["Download", "Cancel"],
      defaultId: 0,
      cancelId: 1,
      message: `Download Chromium for logged-in sources (${CHROMIUM_SIZE_NOTE})?`,
      detail:
        "It is used only to log in by hand and to read logged-in sources, in a browser profile separate from your everyday browser.",
    });
    if (response !== 0) return { ok: false, error: "Cancelled" };
    return installChromium({
      execPath: childNode(),
      playwrightCli: layout.playwrightCli,
      browsersDir: paths.browsers,
      onProgress: (line) => win?.webContents.send(CHANNELS.browserProgress, line),
    });
  });
  handle(CHANNELS.restart, () => restartAll());
  handle(CHANNELS.openLogs, async () => void (await shell.openPath(join(dataDir, "logs"))));
}

// ---------- lifecycle ----------

// Electron's own caches stay apart from Job Radar's data.
app.setName("Job Radar");
app.setPath("userData", join(paths.root, "electron"));

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => showWindow());
  app.on("activate", () => showWindow());
  app.on("window-all-closed", () => {
    // Keep running in the menu bar.
  });
  // `kill` or Ctrl+C behave like Quit: the children are stopped first.
  for (const sig of ["SIGTERM", "SIGINT"] as const) process.on(sig, () => app.quit());
  app.on("before-quit", (e) => {
    if (quitting) return;
    quitting = true;
    if (!supervisor) return;
    e.preventDefault();
    void supervisor.stop().finally(() => app.exit(0));
  });

  void app.whenReady().then(async () => {
    layout = app.isPackaged
      ? packagedLayout(process.resourcesPath)
      : devLayout(join(here, "..", "..", ".."));
    if (!existsSync(layout.workerEntry))
      dialog.showErrorBox("Job Radar", `Missing ${layout.workerEntry}. Run pnpm desktop:build.`);
    dataDir = ensureDirs(paths, config).data;
    // macOS is the source of truth for the login item (the owner may change it in System Settings).
    if (app.isPackaged) {
      const actual = app.getLoginItemSettings().openAtLogin;
      if (actual !== config.launchAtLogin) config = saveConfig(paths, { launchAtLogin: actual });
    }
    // Deny camera, microphone, location, notifications and every other permission.
    session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    session.defaultSession.setSpellCheckerEnabled(false);
    registerBridge();
    tray = new Tray(icon("ok"));
    renderTray();

    const openedAtLogin = app.getLoginItemSettings().wasOpenedAtLogin === true;
    const proceed = await runFirstRunIfNeeded({
      dataDir,
      secretsDir: paths.secrets,
      workerPort: config.workerPort,
      lastImportFrom: config.lastImportFrom,
      onImported: (from) => {
        config = saveConfig(paths, { lastImportFrom: from });
      },
    });
    if (!proceed) return app.quit();
    if (!openedAtLogin) showWindow();
    else app.dock?.hide();
    await startServers();
    setInterval(() => void refreshStatus(), 30_000);
  });
}
