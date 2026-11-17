## MODIFIED Requirements

### Requirement: Localhost only
All services SHALL bind to 127.0.0.1, including published Docker ports, the web app, the worker API and the browser login viewer. In the macOS app, the worker and web server SHALL also bind to 127.0.0.1, and the app window SHALL load only those localhost pages.

#### Scenario: LAN access attempt
- **WHEN** another device on the network requests the web app port
- **THEN** the connection is refused

#### Scenario: LAN access to the macOS app
- **WHEN** another device on the network requests the macOS app's web or worker port
- **THEN** the connection is refused

### Requirement: Local data and secrets
All data (database, browser profile, profile files, logs) SHALL live under a local data directory: the repository's data directory mounted as Docker volumes, or `~/Library/Application Support/Job Radar` for the macOS app. Secrets (Telegram token, Claude Code OAuth token, mailbox app password) SHALL be read from files in a git-ignored secrets directory (in the macOS app, a secrets folder inside its data location readable only by the owner), never from committed files, and never written to logs.

#### Scenario: Secrets not committed
- **WHEN** `git status` and `git ls-files` are checked after setup
- **THEN** no file under the secrets directory or data directory is tracked

#### Scenario: App secrets protected
- **WHEN** the macOS app has created or imported its secrets folder
- **THEN** the folder is readable only by the owner's user account and no secret value appears in the app's logs
