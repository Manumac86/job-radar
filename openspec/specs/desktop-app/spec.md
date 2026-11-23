# desktop-app Specification

## Purpose
Run Job Radar as a native macOS app: it starts and supervises the worker and the web server without Docker, shows the UI in its own window, stays in the menu bar, and keeps every local-only rule.

## Requirements

### Requirement: Native app without Docker
The app SHALL start the worker and the web server itself, on 127.0.0.1, with no Docker and no separately installed Node.js. It SHALL wait until both are healthy before showing the UI. It SHALL restart a crashed server at most 3 times in 10 minutes and then show the error with a "Restart" action. Only one instance of the app SHALL run at a time; opening it again brings the existing window forward.

#### Scenario: First open
- **WHEN** the owner opens Job Radar.app
- **THEN** a loading view appears, and once the worker and web server answer their health checks the dashboard is shown

#### Scenario: Worker crash
- **WHEN** the worker process exits unexpectedly
- **THEN** the app restarts it, and after a third crash within 10 minutes the window and the menu bar show "Worker stopped" with the last log lines and a "Restart" action

#### Scenario: Port taken
- **WHEN** the web or worker port is already in use (for example by the Docker stack)
- **THEN** the app does not start a second worker and explains that another Job Radar seems to be running, naming the port

### Requirement: App window
The app window SHALL load only the app's own pages: its bundled loading screen and its localhost web server. Links to any other address SHALL open in the owner's default browser, never inside the app. The window SHALL have no Node.js access and no spellchecker downloads. Closing the window SHALL keep the radar running; Quit (menu or Cmd+Q) SHALL stop the worker and web server cleanly.

#### Scenario: External link
- **WHEN** the owner clicks "Open offer page" on an offer
- **THEN** the offer opens in the default browser and the app window stays on Job Radar

#### Scenario: Close vs quit
- **WHEN** the owner closes the window
- **THEN** schedules keep running and the menu bar item stays; choosing Quit stops both servers within 10 seconds

### Requirement: Menu bar
The app SHALL show a menu bar item with the overall status and these entries:
- status: running, paused at the LLM cap, Claude not logged in, or a source needing attention
- the number of unread notifications
- "Open Job Radar"
- "Run all sources now"
- "Launch at login" (checked or unchecked)
- "Quit"

The status SHALL refresh at least every minute.

#### Scenario: Claude login problem
- **WHEN** the worker reports that the Claude Code CLI is not logged in
- **THEN** the menu bar item shows a warning and its menu says "Claude not logged in" with "How to fix…"

#### Scenario: Run all from the menu bar
- **WHEN** the owner chooses "Run all sources now"
- **THEN** every enabled source that is not already running starts a run, the same as "Run now" on each source

### Requirement: Launch at login
The owner SHALL be able to turn launch at login on and off from the menu bar and from Settings. When launched at login, the app SHALL start in the menu bar without opening the window. It is off by default.

#### Scenario: Start at login
- **WHEN** launch at login is on and the owner logs in to macOS
- **THEN** the radar runs in the menu bar with no window open

### Requirement: Login windows for logged-in sources
In the app, "Log in" for a logged-in source SHALL open a browser window that uses the isolated browser profile, separate from the owner's everyday browser profile.
- **Google Chrome installed:** the login window SHALL be the owner's Google Chrome, started as a normal browser without automation control, so sites that refuse automated browsers (Google sign-in) accept it. Scheduled logged-in runs SHALL use the same Chrome and profile.
- **Otherwise:** the app SHALL use Chromium, and SHALL ask before downloading it.

The owner logs in by hand and clicks "Done" in Job Radar to close the window. The app SHALL NOT read, store or fill credentials.

#### Scenario: Log in to LinkedIn with Google
- **WHEN** Google Chrome is installed and the owner clicks "Log in" for LinkedIn in Settings
- **THEN** a Chrome window opens on LinkedIn's login page with the isolated profile, "Sign in with Google" works there, and after the owner clicks "Done" the source shows "session OK"

#### Scenario: Browser missing
- **WHEN** the owner clicks "Log in", Google Chrome is not installed and Chromium is not downloaded
- **THEN** the app asks "Download Chromium for logged-in sources (about 150 MB)?" and installs it only after the owner agrees

### Requirement: Claude Code CLI from the owner's installation
The app SHALL use the owner's installed `claude` CLI and the login already stored by that CLI. It needs no API key and no OAuth token file. The app SHALL find the CLI in its usual install locations and in the owner's login-shell PATH, and SHALL let the owner set the path in Settings. When it is not found, Settings and the menu bar SHALL say so with install instructions.

#### Scenario: CLI found
- **WHEN** `claude` is installed in `~/.local/bin` and the app is opened from Finder
- **THEN** scoring works without any token file

#### Scenario: CLI missing
- **WHEN** no `claude` executable can be found
- **THEN** offers wait as "awaiting score" and Settings shows "Claude Code CLI not found" with the install command and a field for its path

### Requirement: App data location and first-run import
The app SHALL keep all data and secrets in `~/Library/Application Support/Job Radar`. The secrets folder there SHALL be readable only by the owner. On first launch with an empty data folder, the app SHALL offer to import an existing Job Radar `data/` and `secrets/` folder chosen by the owner. The database SHALL be copied as a consistent snapshot. The import SHALL refuse while another Job Radar is running on that data. The original folders SHALL never be modified.

#### Scenario: Import from the repo
- **WHEN** the owner chooses the repo folder on first launch and the Docker stack is stopped
- **THEN** offers, applications, profile files, the browser profile, backups and secrets are copied, and the dashboard shows the same data as before

#### Scenario: Docker still running
- **WHEN** the owner starts an import while the Docker worker answers on its port
- **THEN** the import does not start and the app says to stop it first with `docker compose down`

#### Scenario: Start fresh
- **WHEN** the owner skips the import
- **THEN** the app starts with the seed profile, as a new installation would

### Requirement: Local unsigned build without auto-update
The app SHALL be built locally from the repository with one command, producing an unsigned `Job Radar.app` and a disk image. It SHALL have no auto-update, no update server, no crash reporting and no telemetry. It SHALL make no network requests of its own beyond what the worker and web server already do. The only exception is downloading Chromium after the owner agrees.

#### Scenario: Build
- **WHEN** the owner runs the desktop build command
- **THEN** `Job Radar.app` and a `.dmg` are produced locally without any signing identity or upload

#### Scenario: Update
- **WHEN** a new version is wanted
- **THEN** the owner rebuilds from the repository; the app never checks for updates
