## MODIFIED Requirements

### Requirement: No git remotes
In the owner's private checkout, the repository MUST have no git remote other than the public release remote. That remote is named `public` and points to the public GitHub repository. The only push allowed SHALL be the `public` branch, a history that shares no commit with the private history, to the public repository's `main`. A versioned pre-push hook SHALL block every other push, and a check script SHALL fail for any other remote. Checkouts that are not marked private (public clones and forks) SHALL have no remote or push restriction.

#### Scenario: Remote added by mistake
- **WHEN** a remote other than `public` is added in the private checkout and the check script runs
- **THEN** the script exits with an error naming the remote

#### Scenario: Private history push attempt
- **WHEN** the owner pushes `main`, or any commit that descends from the private history, to the public remote
- **THEN** the pre-push hook refuses the push and names the branch

#### Scenario: Public clone
- **WHEN** someone clones the public repository and runs the check script
- **THEN** the `origin` remote does not make it fail

### Requirement: LLM usage budget
The system SHALL count LLM calls per day, enforce a configurable daily cap (default 300 scoring calls and 30 drafts), and pause LLM work with a notification when the cap is reached. The day SHALL be the calendar day in the app's time zone: the configured time zone if set, otherwise the machine's.

#### Scenario: Cap reached
- **WHEN** the daily scoring cap is reached
- **THEN** remaining offers wait as "awaiting score" until midnight in the app's time zone, and the owner is notified once

## ADDED Requirements

### Requirement: Publish without private data
The system SHALL provide one command that updates the `public` branch from the current tree as a new commit, authored with the GitHub noreply address. The command SHALL refuse when any tracked file contains a term from the owner's private terms list, a list kept in the secrets folder and never published. It SHALL also refuse when any tracked path is a secret, data or environment file. The pre-push hook SHALL run the same check on the pushed tree.

#### Scenario: Private term in a file
- **WHEN** a tracked file contains the owner's surname and the owner runs the publish command
- **THEN** no commit is made, and the command names the file and the matching term without printing the rest of the line

#### Scenario: Clean publish
- **WHEN** no tracked file contains a private term
- **THEN** the `public` branch gains one commit whose tree equals the current tree

### Requirement: App time zone
Dates, quiet hours, schedules and daily caps SHALL use the app's time zone: `JOB_RADAR_TIMEZONE` when set, otherwise the machine's time zone, otherwise UTC. In the browser, dates SHALL use the browser's time zone.

#### Scenario: Owner in New York
- **WHEN** the app runs on a Mac set to America/New_York with no time zone configured
- **THEN** daily caps reset at midnight New York time, and the cap message says so

### Requirement: Public release artifacts
A release SHALL consist of:
- an unsigned Apple Silicon disk image attached to a GitHub release
- web and worker Docker images for linux/amd64 and linux/arm64 on the GitHub container registry
- a standalone compose file that runs those images with ports bound to 127.0.0.1 and with data and secrets mounted from the folder it runs in

None of them SHALL contain the owner's data, secrets or real profile.

#### Scenario: Docker without cloning
- **WHEN** a user downloads the release compose file, adds their Claude token to `secrets/`, and runs `docker compose -f docker-compose.release.yml up -d`
- **THEN** the images are pulled, the dashboard answers on 127.0.0.1:3000, and it starts with the example profile

#### Scenario: App on another Mac
- **WHEN** another person installs the disk image on an Apple Silicon Mac, opens it with right-click → Open, and chooses "Start fresh"
- **THEN** the app starts with the example profile and none of the owner's data
