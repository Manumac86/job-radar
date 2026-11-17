# Tasks

## 1. Worker and web ready for the app

- [x] 1.1 Worker reads `CLAUDE_CODE_EXECUTABLE` and passes it to `createClaudeCodeClient` and `createResearchClient`. Seed dir is configurable (`JOB_RADAR_SEED_DIR`). Verified by a worker config unit test.
- [x] 1.2 Add `GET /status/summary` (LLM state, pause-until, sources needing attention, unread count, running sources) and `POST /sources/run-all` (skips running sources). Verified by worker route tests with supertest.
- [x] 1.3 "Log in" returns a `browser_missing` error when Playwright's Chromium is not installed, and the web shows it as a prompt. Verified by a sessions unit test with a fake launcher.
- [x] 1.4 Bundle the worker with esbuild into `worker.mjs` with the externals from design D2 (`pnpm --filter @job-radar/worker bundle`). Verified by a script test that starts the bundle in test mode with Node and gets `/health`.

## 2. Desktop app skeleton and process supervisor

- [x] 2.1 Scaffold the `apps/desktop` workspace (TypeScript, Electron and electron-builder pinned to the latest stable, `tsc` build, lint and test scripts). Verified by `pnpm --filter @job-radar/desktop typecheck` and by the package appearing in `pnpm verify`.
- [x] 2.2 `desktop.json` config and paths (data, secrets 0700, logs, browsers) under Application Support, with ports defaulting to 3300/4000. Verified by unit tests on a temp home dir.
- [x] 2.3 Supervisor: spawn the worker and the web server with `ELECTRON_RUN_AS_NODE`, wait for health, log to rotating files, restart with backoff (3 in 10 min), and on stop send SIGTERM, then SIGKILL after 8 s. Verified by unit tests with fake child scripts (crash loop, slow start, clean stop).
- [x] 2.4 Port check before start, with an "another Job Radar is running" message when `/health` answers. Verified by a unit test that holds a port.
- [x] 2.5 Claude CLI discovery (config path, known locations, login-shell `command -v`) and login-shell PATH for children. Verified by unit tests with fake executables and a fake shell.

## 3. Window, menu bar and bridge

- [x] 3.1 Main window with a bundled loading screen, then the web URL. Sandbox, context isolation and spellcheck off. Navigation allowlist; other http(s)/mailto links go to `openExternal`; permission requests denied. Verified by unit tests on the URL policy functions and a manual check that "Open offer page" opens the default browser.
- [x] 3.2 Single instance lock. Close hides the window, Quit stops the children, and the Dock icon shows only with the window open. Verified by a supervisor stop test plus a manual check.
- [x] 3.3 Menu bar item that polls `/status/summary` every 30 s, with the three icon states, unread count, Open, Run all sources now, Launch at login and Quit. Verified by unit tests on the menu model built from status fixtures.
- [x] 3.4 Launch at login through login item settings, starting hidden when launched as a login item. Verified by a unit test of the config round trip and a manual check after logging out and back in.
- [x] 3.5 Preload bridge `window.jobRadarDesktop` (launch at login, Claude path with validation and worker restart, install browser). The web Settings shows a "Desktop" card only when the bridge exists. Verified by a Playwright test that injects a fake bridge and a web unit test that the card is hidden without it.
- [x] 3.6 Chromium install on request through the bridge into `PLAYWRIGHT_BROWSERS_PATH`, with progress and a size warning. Verified by a unit test with a fake installer and a manual check.
- [x] 3.7 Logins open the owner's Google Chrome as a plain process (isolated profile, mock keychain, no automation flags) and scheduled runs use that Chrome headless; Chromium stays as the fallback and the Desktop card offers to remove a downloaded Chromium. Verified by sessions unit tests (browser choice, login args without automation flags, fake Chrome stopped on Done), a headless run on the owner's Chrome 157, and Playwright tests of the Desktop card.

## 4. First-run import

- [x] 4.1 First-run dialog (Import from a folder / Start fresh), shown when the data folder has no database. Verified by a unit test of the decision function.
- [x] 4.2 Import: refuse when the worker port answers; copy the database with an online backup, then profile, browser profile and backups; copy secrets as 0600; write `import.json`; leave the source untouched. Verified by unit tests on a temp repo-like folder (row counts equal, source mtime unchanged, permissions 0600, refusal while a fake `/health` answers).

## 5. Packaging and local-only guarantees

- [x] 5.1 electron-builder config: arm64 `dmg` and `dir`, `mac.identity: null`, `publish: null`, resources (web standalone, `worker.mjs`, externals, `profile-seed`, migrations), better-sqlite3 rebuilt for Electron. `pnpm desktop:build` runs everything. Verified by the command producing `Job Radar.app` and a `.dmg`.
- [x] 5.2 Packaging smoke test: run the packaged worker with `ELECTRON_RUN_AS_NODE=1` in test mode on a temp data dir. It must migrate the database and answer `/health`, and one fake scoring call must succeed. Verified by `pnpm desktop:smoke`.
- [x] 5.3 `check:local` fails on a non-null `publish`, a signing identity, `electron-updater`, or a non-127.0.0.1 bind in desktop sources. Verified by script tests with bad fixtures.
- [x] 5.4 README "macOS app" section: build, first open (right-click → Open or `xattr`), import, Docker vs app (don't run both), where data and logs live, Chromium download, rollback. CLAUDE.md stack line adds Electron. Verified by review in the owner check.

## 6. Verify

- [x] 6.1 Run `pnpm verify` and `pnpm desktop:build`, then commit locally. Verified by both commands passing.
- [x] 6.2 Owner check:
  - stop Docker, open the app, import the repo data, and see the same offers
  - close the window and confirm schedules keep running from the menu bar
  - run all sources from the menu bar
  - log in to one logged-in source in the Chromium window
  - turn on launch at login and log out and back in
  - quit and confirm no Job Radar process is left
