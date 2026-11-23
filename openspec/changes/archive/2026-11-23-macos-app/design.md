# Design

## Context

- **Running today.** Job Radar runs in two ways:
  - Docker Compose: web and worker images, data in `./data`, secrets in `./secrets`, noVNC for logins, Claude via an OAuth token file.
  - `pnpm dev`: native, using the shell's Node and `claude`.
- **The worker:**
  - It runs TypeScript sources through `tsx`.
  - It already takes every path from env vars: `JOB_RADAR_DATA_DIR`, `JOB_RADAR_SECRETS_DIR`, `JOB_RADAR_ROOT`, `JOB_RADAR_MIGRATIONS_DIR`, `WORKER_HOST/PORT` and `WEB_BASE_URL`.
  - `BrowserSessions` already has a native `viewer: "window"` mode that opens a headed Chromium window.
- **The web:**
  - It is Next.js 16. `BUILD_STANDALONE=1` produces a self-contained server.
  - It reads the same SQLite file through better-sqlite3, a native module.
- **Owner's setup.** The owner's stack runs on web 127.0.0.1:3300 and worker 127.0.0.1:4000. Telegram messages link to `WEB_BASE_URL`.
- **Why now.** See proposal.md.

## Goals / Non-Goals

**Goals:**
- One `Job Radar.app` that the owner builds locally and opens like any app. It needs neither Docker nor a separately installed Node.js, only the owner's `claude` CLI.
- The same code paths as Docker and dev. The app is a launcher and supervisor, not a fork of the worker or web.
- Nothing new leaves the machine.

**Non-Goals:**
- Code signing, notarization, the Mac App Store, auto-update, Windows or Linux builds.
- Native macOS notifications. Telegram and in-app notifications stay as they are; this can be a later change.
- Moving business logic into the Electron main process.
- Running the app and the Docker stack side by side on the same data.

## Decisions

**D1. The worker and web server run as child processes on Electron's Node.**
- The main process spawns each one with the app's Electron helper (`Job Radar Helper.app`) and `ELECTRON_RUN_AS_NODE=1`, so no system Node is needed.
  - *Implementation note:* this replaced spawning `process.execPath`. The helper is marked `LSUIElement`; the main binary is not. Owner testing showed the web server in the Dock as a bouncing "exec" icon, because Next.js renames its process to "next-server" and macOS then registered it as an app.
- Children get the env from D4. Their stdout and stderr go to rotating log files in `<data>/logs`: 5 files of 5 MB each.
- Each child must answer `/health` (worker) or `/` (web) within 60 s.
- Restart policy: exponential backoff, at most 3 restarts in 10 minutes, then "stopped" with the last 50 log lines.
- On Quit, the main process sends SIGTERM to both children; any still alive after 8 s get SIGKILL.
- `app.requestSingleInstanceLock()` keeps one instance.

*Alternative:* run the worker inside the Electron main process. Rejected: a worker crash or a long synchronous SQLite call would freeze the menu bar and window, and Next's server does not belong in the main process.

*Alternative:* require the system Node (nvm or Homebrew). Rejected: apps opened from Finder don't see the shell's Node, versions drift, and better-sqlite3 would need to match that Node's ABI.

**D2. Packaging: a bundled worker, standalone web, and better-sqlite3's Node-API prebuild.**
- **Worker.** esbuild bundles `apps/worker/src/main.ts` into `worker.mjs`, with these modules external:
  - `better-sqlite3`
  - `playwright` and `playwright-core`
  - `@anthropic-ai/claude-agent-sdk` and `ai-sdk-provider-claude-code`, which spawn processes and resolve files at runtime
- **Web.** It ships the Next standalone output (`BUILD_STANDALONE=1`) with its `.next/static` and `public`.
- **Resources.** `profile-seed/` and `packages/db/drizzle/` are copied as app resources.
- **Native module.** `better-sqlite3` 13 is a Node-API addon and ships prebuilds, so the same binary loads in Node 22 and in Electron's Node 24. Nothing is rebuilt: no Electron headers, no compiler.
  - *Implementation note:* this replaced the first plan, an electron-builder rebuild. The packaged worker was verified on Electron's Node.
- **Staging (implementation notes).**
  - The worker's externals are installed into `build/stage/worker` from the local pnpm store, with `--prod --ignore-scripts --no-optional` and a hoisted layout.
  - `--no-optional` leaves out the Claude Agent SDK's bundled CLI (~215 MB). The app must use the owner's `claude` (spec), never a second one with its own login.
  - The web standalone folder is copied with its pnpm symlinks kept: they are all relative, and the build checks that none is absolute.
  - Both servers are copied in electron-builder's `afterPack` hook. `extraResources` drops `node_modules` and fails on symlinks.
  - `electronDist` points to the installed Electron, so it is not downloaded again.
  - The only build-time download is electron-builder's `dmgbuild` tool, fetched once.
- **Builder config.**
  - Targets: `dmg` and `dir` for `arm64`.
  - `mac.identity: null`, so the build is unsigned.
  - `publish: null`.
  - No `electron-updater` dependency.
- **Command.** `pnpm desktop:build` runs these steps in order:
  1. build web (standalone)
  2. bundle worker
  3. compile `apps/desktop`
  4. stage resources
  5. electron-builder

*Alternative:* ship `tsx` and the TypeScript sources. Rejected: a slower start, a much larger bundle, and a dev tool in production.

*Alternative:* Electron Forge. Rejected: electron-builder handles native rebuilds and unsigned DMGs with less configuration. Both are fine; this is a preference.

**D3. Window, preload bridge and navigation rules.**
- **BrowserWindow settings:**
  - `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`
  - `spellcheck: false`, because Chromium would download dictionaries
  - a session partition with no persistent permissions
- **Navigation:**
  - `will-navigate` and `setWindowOpenHandler` allow only `http://127.0.0.1:<webPort>`.
  - Anything else goes to `shell.openExternal`, and only for `http:`, `https:` and `mailto:`.
- **Permissions.** Requests for camera, microphone, geolocation and notifications are denied.
- **Loading screen.** It is a bundled HTML file, loaded before the server is ready.
- **Preload bridge.** It exposes a narrow `window.jobRadarDesktop` with exactly these calls:
  - `getLaunchAtLogin()` and `setLaunchAtLogin(on)`
  - `getClaudePath()` and `setClaudePath(path | null)`, which validates the path and restarts the worker
  - `installBrowser()`
- **In the web.** Settings shows a "Desktop" card only when the bridge exists, so Docker and dev are unchanged.

*Alternative:* a control HTTP endpoint on the main process. Rejected: it adds another localhost port that any local page could call; the preload bridge is reachable only from the app window.

**D4. Paths, ports and configuration.**
- **Data.** `JOB_RADAR_DATA_DIR = ~/Library/Application Support/Job Radar/data`. Secrets go in `…/Job Radar/secrets`, created with mode 0700 and files 0600.
- **Desktop config.** `…/Job Radar/desktop.json` holds `{ webPort: 3300, workerPort: 4000, claudePath: null, launchAtLogin: false }`.
- **Fixed ports.** The ports match the owner's current Docker ports, so existing Telegram links keep working. A running Docker stack then collides on start, which the spec turns into a clear message instead of two radars sending alerts.
- **Port check.** Before spawning, the app tries to bind each port on 127.0.0.1. If a port is busy and a `/health` there answers like Job Radar, it reports "another Job Radar is running".
- **Children env:**
  - `WORKER_HOST=127.0.0.1` and `WEB_BASE_URL=http://127.0.0.1:<webPort>`
  - `JOB_RADAR_ROOT`, `JOB_RADAR_MIGRATIONS_DIR` and the seed dir set to the app resources
  - `PLAYWRIGHT_BROWSERS_PATH = …/Job Radar/browsers`
  - `JOB_RADAR_LOGIN_VIEWER=window`
  - the telemetry-off variables already used in Docker

*Alternative:* random free ports on each start. Rejected: Telegram deep links and bookmarks would break on every restart.

**D5. Finding the Claude Code CLI.**
- **Search order:**
  1. `claudePath` from `desktop.json`
  2. `~/.local/bin/claude`, `/opt/homebrew/bin/claude`, `/usr/local/bin/claude` and `~/.npm-global/bin/claude`
  3. `command -v claude` in the owner's login shell (`$SHELL -lc`), with a 5 s timeout
- **Passing it on.** The result goes to the worker as `CLAUDE_CODE_EXECUTABLE`.
- **Worker side.** `createClaudeCodeClient` and `createResearchClient` already accept `executable`, and the worker passes it from the env.
- **Login and token.** The CLI keeps using its own stored login. In the app, a `claude_oauth_token` in the secrets folder is still honored if present, but it is not needed.
- **Login-shell PATH.** The children's `PATH` gets the login-shell PATH, because the CLI may need `node` or `git`.

*Alternative:* bundle a pinned Claude Code CLI inside the app. Rejected: a second CLI would need its own login and updates, and the owner already maintains one.

**D6. Login windows use the owner's Google Chrome, not automated, with the isolated profile.**
- **Why.** Owner testing showed that Google refuses to sign in inside Playwright's Chromium: any window that Playwright drives carries automation markers. This decision replaced the first plan, a Playwright-driven Chromium window.
- **Login.** When Google Chrome is installed (`/Applications` or `~/Applications`), "Log in" spawns Chrome as a plain process, with no DevTools port and no automation flags:
  - `--user-data-dir=<data>/browser-profile`
  - `--use-mock-keychain`
  - `--no-first-run` and `--no-default-browser-check`
- **Done.** "Done" sends SIGTERM, so Chrome writes its cookies, and SIGKILL after 5 s. It then also closes whichever process still holds the profile, found through Chrome's `SingletonLock`. Chrome can hand a new window to an instance already running on the profile and exit at once.
- **Leftover windows.** A login window left open while the worker restarted keeps the profile locked, which owner testing hit: runs failed with "Failed to create a ProcessSingleton".
  - The worker now closes the login window on shutdown.
  - Before any login or run, a browser still holding the isolated profile is closed and a stale lock is removed.
  - Only that profile's browser is touched. The owner's everyday Chrome uses another profile.
- **Scheduled runs.** They use Playwright's `launchPersistentContext` with `executablePath` set to that Chrome, on the same profile, headless.
  - Playwright also passes `--use-mock-keychain`, so both read and write cookies with the same key.
  - Verified with Chrome 157.
- **Choice.** `JOB_RADAR_BROWSER` is `auto` (default), `chrome` or `chromium`. `auto` means Chrome on macOS when installed, else Chromium. Docker on Linux keeps Chromium and noVNC unchanged.
- **Downloaded Chromium.** While Chrome is used, the Desktop card offers to remove a previously downloaded Chromium.
- **Chromium install (fallback, only without Chrome):**
  - It goes into `PLAYWRIGHT_BROWSERS_PATH`.
  - It runs `playwright-core`'s installer through Electron's Node.
  - It happens only after the owner confirms, either from the Desktop card or when "Log in" finds no browser (the worker returns a `browser_missing` error, which the web turns into the prompt).

*Alternative:* use an Electron `BrowserWindow` for logins. Rejected: the scheduled logged-in adapters use Playwright on the same profile, and Electron and Playwright Chromium profiles are not interchangeable.

*Alternative:* a Playwright-driven Chrome window for the login (`channel: "chrome"`). Rejected: it carries the same automation markers, and Google sign-in refuses it.

*Trade-off:* Chrome updates itself. A Chrome release newer than the one Playwright supports could break headless runs until the project's Playwright is updated. The login window is unaffected because it is plain Chrome.

**D7. First-run import.**
- **When it runs.** The data folder has no `db/radar.sqlite`.
- **The dialog.** It offers:
  - "Import from a Job Radar folder…", with a folder picker whose default is the last known repo path
  - "Start fresh"
- **Import steps:**
  1. Refuse if `127.0.0.1:<workerPort>/health` answers.
  2. Copy the database with better-sqlite3's online `backup()` into the new data folder, which is consistent even if a writer slipped in.
  3. Copy `profile/`, `browser-profile/` and `backups/` recursively.
  4. Copy `secrets/*` with 0600 permissions.
  5. Write `import.json` with the source path and date.
- **Safety.** It never moves or deletes the source. The worker's migrations then run as usual on first start.
- **Also offered later** from the Desktop card, but only while the data folder holds no offers.

*Alternative:* point the app at the repo's `data/` directly. Rejected: Application Support is where macOS apps keep data, and the repo folder could be moved or deleted. The owner can still do it by editing `desktop.json` (`dataDir`), which is documented but not in the UI.

**D8. Menu bar and status.**
- **Tray item.** It uses a template icon in three states: OK, attention and stopped.
- **Polling.** Every 30 s the main process polls a new `GET /status/summary` on the worker, which returns:
  - LLM state and pause-until
  - sources needing attention (session expired, failing)
  - unread notification count
  - running sources
- **Run all.** "Run all sources now" calls a new `POST /sources/run-all`. It reuses the scheduler's manual run for each enabled source and skips ones already running.
- **Window behavior.** Closing the window hides it. The Dock icon is shown only while the window is open (`app.dock.hide/show`).
- **Launch at login.** It uses `app.setLoginItemSettings({ openAtLogin, openAsHidden: true })`. When the app is launched as a login item, it does not open the window.

*Alternative:* derive status from several existing endpoints. Rejected: that means more requests every 30 s, and status logic would end up in the desktop code instead of the worker.

**D9. Local-only checks.**
- `scripts/check-local.ts` gains two checks:
  - It fails if the electron-builder config has a `publish` value other than `null` or names a signing identity, or if `electron-updater` is in any `package.json`.
  - It fails if any desktop source binds a host other than `127.0.0.1`.
- A desktop unit test asserts the navigation allowlist and the `openExternal` protocol filter.

## Risks / Trade-offs

- **[Unsigned app blocked by Gatekeeper]**
  - Locally built files carry no quarantine flag, so they usually open directly.
  - If the app is copied from elsewhere, the README explains right-click → Open, or `xattr -dr com.apple.quarantine "Job Radar.app"`.
- **[better-sqlite3 ABI mismatch]**
  - The addon uses Node-API, so it needs no rebuild.
  - `pnpm desktop:smoke` starts the packaged worker with the app's binary and `ELECTRON_RUN_AS_NODE`, migrates a database and runs fake LLM calls.
  - In development (`electron .`), the children run on the system Node.
- **[Two radars on the same data, or both sending Telegram]**
  - Fixed ports make a running Docker stack block the app.
  - The import refuses while Docker answers.
  - The README says to choose one way of running it.
- **[Claude CLI not on PATH or updated in place]**
  - Discovery order (D5) and a Settings path field cover the first case.
  - A missing CLI degrades to "awaiting score", as today.
- **[Bundle size: measured 407 MB for the app and 144 MB for the .dmg (Electron 267 MB, worker 95 MB, web server 44 MB; Chromium is separate and on demand)]** → Acceptable for a local app. The first estimate was ~250 MB.
- **[Electron Chromium background traffic]**
  - The spellchecker is off and no component updater is used.
  - The app loads only localhost.
  - The README lists Chromium's on-demand download as the single extra download.
- **[Bundling breaks a runtime file lookup in a dependency]** → Those packages are kept external (D2), and the packaging smoke test runs one scoring call against FakeLlmClient in test mode.

## Migration Plan

1. Build with `pnpm desktop:build` and stop Docker with `docker compose down`.
2. Open the app and import from the repo folder.
3. Check the dashboard, then log in again only if a session expired. The browser profile is copied, so sessions usually survive.
4. **Rollback:** quit the app and run `docker compose up -d` again. The repo `data/` was never modified, but everything that happened in the app since the import lives only in Application Support. Exporting back to `data/` is not part of this change.
5. Docker Compose stays supported. `pnpm start` keeps meaning Docker.
