# Proposal

## Why

Job Radar runs only through Docker Compose and a terminal today. In Docker, a logged-in source needs the noVNC viewer to log in, the worker needs a separate Claude OAuth token file, and nothing shows that the radar is running. A native macOS app makes the radar something the owner opens like any other app. It runs in the background from the menu bar and uses the Claude Code login the owner already has.

## What Changes

- **New desktop app** (`apps/desktop`, Electron, TypeScript):
  - **Runs everything natively, without Docker.** The app starts the worker and the Next.js server as child processes on 127.0.0.1 and shows the UI in its own window.
  - **Menu bar item:**
    - status: running, paused, Claude login problem, or a source that needs attention
    - unread notifications
    - "Open Job Radar", "Run all sources now", "Launch at login" and "Quit"
  - **Closing the window** keeps the radar running in the menu bar; Quit stops it cleanly.
  - **Logins to logged-in sources** open a real Chromium window that uses the isolated browser profile, instead of the noVNC viewer.
  - **Claude:** the app uses the owner's installed `claude` CLI and its existing login. It finds the CLI even though apps opened from Finder don't get the shell PATH. No OAuth token file is needed.
  - **Data location:** data and secrets live in `~/Library/Application Support/Job Radar`. On first launch, the app offers to import the existing repo `data/` and `secrets/`. The database is copied safely, and the import refuses to run while the Docker stack is still running.
- **Unsigned local build:**
  - `pnpm desktop:build` produces `Job Radar.app` and a `.dmg`.
  - There is no signing, no notarization, no auto-update and no update server; an update means rebuilding from the repo.
  - **Same local-only rules as today:** 127.0.0.1 only, no telemetry, the window only loads the app's own localhost pages, external links open in the default browser, and the spellchecker is off (it would download dictionaries).
- **Packaging changes:** the worker is bundled into one JavaScript file, the web uses the Next.js standalone output, and better-sqlite3 is rebuilt for Electron's Node. Docker Compose and `pnpm dev` keep working unchanged.

## Capabilities

### New Capabilities

- `desktop-app`: the native macOS app. It covers:
  - process supervision of the worker and the web server
  - app window and menu bar
  - launch at login
  - login windows for logged-in sources
  - Claude CLI discovery
  - data location and first-run import
  - unsigned local build without auto-update

### Modified Capabilities

- `local-operation`:
  - "Localhost only" also covers the desktop app's servers and window.
  - "Local data and secrets" allows the desktop data directory (Application Support) besides the Docker volumes. Secrets keep the same rules there.

## Impact

- **New workspace** `apps/desktop`: Electron main process, menu bar, process supervisor, first-run import, packaging config (electron-builder, `publish: null`, no signing identity).
- `apps/worker`:
  - A bundled build (esbuild) runs under Electron's Node.
  - Paths for seed, migrations and secrets come from env vars already in place (`JOB_RADAR_ROOT`, `JOB_RADAR_MIGRATIONS_DIR`, `JOB_RADAR_SECRETS_DIR`, `JOB_RADAR_DATA_DIR`).
  - A `CLAUDE_CODE_EXECUTABLE` option is passed to both LLM clients.
  - New endpoints: `GET /status/summary` for the menu bar and `POST /sources/run-all`, if not covered by existing routes.
- `apps/web`: the standalone build is used by the app; links to third-party sites already open with `target="_blank"`, which the app routes to the default browser.
- `packages/sources`: the "window" login viewer is used in the app. `PLAYWRIGHT_BROWSERS_PATH` points to Application Support, and Chromium is installed on first use after the owner confirms.
- **Dependencies:** `electron`, `electron-builder` and `@electron/rebuild` (dev). Versions are pinned to the latest stable at implementation time.
- **Docs:** README gets a "macOS app" section (build, first launch with right-click → Open, import, Docker vs app). CLAUDE.md stack line adds Electron.
- `scripts/check-local.ts` also fails if the desktop packaging config enables publishing or auto-update.
