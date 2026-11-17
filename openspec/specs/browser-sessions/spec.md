# browser-sessions Specification

## Purpose
Gives read-only, logged-in access to sites that need a session through an isolated browser profile where the owner logs in by hand; no stored passwords.

## Requirements

### Requirement: No stored site passwords
The system MUST NOT store, log or transmit passwords, one-time codes or recovery codes for any job site. Logged-in access SHALL rely only on sessions created by the owner logging in manually inside an isolated browser profile.

#### Scenario: Owner logs in to a site
- **WHEN** the owner starts "Log in" for a site from Settings
- **THEN** a headed browser using the isolated profile opens the site's login page in a local viewer, the owner types credentials and 2FA there, and the app stores only the resulting browser profile data

#### Scenario: Secret scan
- **WHEN** the database, logs and run payloads are searched for the owner's password strings in a test fixture
- **THEN** no match is found

### Requirement: Isolated browser profile
The system SHALL use a dedicated browser profile, separate from the owner's everyday browser, stored in a local volume readable only by the worker. The profile SHALL be deletable from Settings, which logs out every site.

#### Scenario: Wipe sessions
- **WHEN** the owner clicks "Delete browser profile"
- **THEN** the profile directory is removed and every logged-in source shows "logged out"

### Requirement: Session health
The system SHALL check each logged-in source's session before a run and mark the source "session expired" when the site shows a login page, then notify the owner and skip the run.

#### Scenario: Expired session
- **WHEN** a logged-in adapter detects a login wall
- **THEN** the source is marked "session expired", a notification is sent, and no further runs happen until the owner logs in again

### Requirement: Read-only, human-paced browsing
Logged-in adapters SHALL only read pages (search results, job pages, the owner's own inbox or dashboard). They MUST NOT click apply, submit, send, connect, follow or message controls, MUST NOT fill forms, and SHALL limit page views per site per hour to a configured cap (default 20) with randomized delays of at least 5 seconds between pages.

#### Scenario: Cap reached
- **WHEN** a site's page views in the current hour reach the cap
- **THEN** the adapter stops and resumes in the next window

#### Scenario: Forbidden action guard
- **WHEN** adapter code attempts a click on an element whose label matches apply, submit, send, connect, follow or message
- **THEN** the guard throws, the run fails, and the run log records the blocked action

### Requirement: Opt-in per site with risk notice
Logged-in adapters SHALL be disabled by default. Enabling one SHALL show the site-specific risk notice (for example, that the site's terms restrict automation and could lead to account restrictions) and require explicit confirmation. For sites whose terms prohibit automated access, Settings SHALL recommend the job-alert email source instead.

#### Scenario: Enable Upwork adapter
- **WHEN** the owner enables the Upwork logged-in adapter
- **THEN** the risk notice is shown and the adapter stays disabled unless the owner confirms
