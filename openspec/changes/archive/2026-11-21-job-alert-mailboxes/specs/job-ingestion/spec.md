## MODIFIED Requirements

### Requirement: Configurable sources
The system SHALL support a registry of sources, each with a type, an enabled flag, a polling interval and source-specific settings. Supported types in this change: public ATS job boards (Greenhouse, Lever, Ashby) for a configured list of companies, the Y Combinator startup jobs board (Work at a Startup), the Hacker News "Who is hiring" monthly thread, public remote-job feeds (RSS or JSON), job-alert emails read from the owner's email accounts (see "Job-alert emails from email accounts"), and logged-in site adapters (see browser-sessions).

#### Scenario: Disable a source
- **WHEN** the owner disables a source in Settings
- **THEN** no further runs of that source happen and its existing offers remain visible

## ADDED Requirements

### Requirement: Job-alert emails from email accounts
The job-alert source SHALL read every enabled email account that has job alerts turned on, using that account's saved app password. In the account's alert folders it SHALL parse every message, falling back to model extraction for unknown senders or layouts. In INBOX, when the account asks for it, it SHALL parse only messages from known job-alert senders (LinkedIn, Upwork, Malt, Wellfound, Greenhouse) and SHALL NOT send any INBOX message to the model.

#### Scenario: Alerts in two mailboxes
- **WHEN** a LinkedIn alert arrives in the Gmail `job-alerts` label and a Greenhouse alert arrives in the iCloud INBOX, and both accounts have job alerts on (iCloud with "Also look in INBOX")
- **THEN** one run imports the offers from both emails and both messages stay unread

#### Scenario: Personal email in INBOX
- **WHEN** an INBOX message comes from a sender that is not a known job-alert sender
- **THEN** it is not parsed, not stored and not sent to the model

#### Scenario: The same alert in two mailboxes
- **WHEN** the same alert is forwarded to two accounts
- **THEN** its offers are imported once

#### Scenario: One account fails
- **WHEN** one account rejects the login during a run
- **THEN** the other accounts are still read and the run records an error naming the failed account

#### Scenario: Existing setup is kept
- **WHEN** the app starts with the old single-mailbox settings and `secrets/imap_app_password`
- **THEN** the email account with that address has job alerts on with that label as an alert folder (created from those settings if it did not exist), and the next run reads it without the owner re-entering anything

### Requirement: Read-only incremental alert reading
The job-alert source SHALL open folders read-only and never mark, move or delete mail. It SHALL read each account and folder incrementally, independently of the reply reader, starting the first time from the source's look-back window.

#### Scenario: Second run reads only new mail
- **WHEN** a run has read an alert folder and no new message has arrived since
- **THEN** the next run fetches no message from that folder

#### Scenario: Replies and alerts share INBOX
- **WHEN** an account reads INBOX both for replies and for alerts
- **THEN** each reader keeps its own position, so reading one never makes the other skip messages
