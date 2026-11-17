# local-operation Specification

## Purpose
Runs the whole app on the owner machine only: localhost ports, no remotes or telemetry, secrets in secrets/, Docker Compose and verification scripts.

## Requirements

### Requirement: No git remotes
The repository MUST have no git remotes. A versioned pre-push hook SHALL block every push, and a check script SHALL fail when any remote is configured.

#### Scenario: Remote added by mistake
- **WHEN** a remote is added and the check script runs
- **THEN** the script exits with an error naming the remote

### Requirement: Localhost only
All services SHALL bind to 127.0.0.1, including published Docker ports, the web app, the worker API and the browser login viewer.

#### Scenario: LAN access attempt
- **WHEN** another device on the network requests the web app port
- **THEN** the connection is refused

### Requirement: Local data and secrets
All data (database, browser profile, profile files, logs) SHALL live under a local data directory mounted as Docker volumes. Secrets (Telegram token, Claude Code OAuth token, mailbox app password) SHALL be read from files in a git-ignored secrets directory, never from committed files, and never written to logs.

#### Scenario: Secrets not committed
- **WHEN** `git status` and `git ls-files` are checked after setup
- **THEN** no file under the secrets directory or data directory is tracked

### Requirement: LLM usage budget
The system SHALL count LLM calls per day, enforce a configurable daily cap (default 300 scoring calls and 30 drafts), and pause LLM work with a notification when the cap is reached.

#### Scenario: Cap reached
- **WHEN** the daily scoring cap is reached
- **THEN** remaining offers wait as "awaiting score" until the next day and the owner is notified once

### Requirement: Backups
The system SHALL create a daily local backup of the database, keeping the last 14.

#### Scenario: Restore
- **WHEN** the owner runs the restore command with a backup file
- **THEN** the database is replaced by that backup after a confirmation prompt
