# Proposal

## Why

Job alerts reach several of the owner's mailboxes (Gmail, iCloud and a custom domain). Today the
"Job-alert emails" source reads only one Gmail label, with its own app password in
`secrets/imap_app_password`. The email accounts added for application replies already connect to
every mailbox read-only, so alerts arriving anywhere else never reach Job Radar.

## What Changes

- **Alerts come from the email accounts.** The job-alert source reads every email account in
  Settings → Email that has job alerts turned on. It uses the account's saved app password; there
  is no second password.
- **Per account settings:**
  - a "Job alerts" switch;
  - alert folders or labels (for example `job-alerts`). Every message in them is parsed, with the
    LLM fallback for unknown layouts;
  - "Also look in INBOX". When on, INBOX messages are parsed only if they come from a known alert
    sender (LinkedIn, Upwork, Malt, Wellfound, Greenhouse). There is no LLM fallback for INBOX.
- **Greenhouse alerts.** Alert emails from Greenhouse and MyGreenhouse become a known sender with
  a job-link rule.
- **Incremental reading.** Each account and folder keeps its own cursor for alerts, separate from
  the reply reader. The first read looks back the source's "Look back (days)". Mail stays
  untouched: folders open read-only, nothing is marked, moved or deleted.
- **One source.** It keeps its interval, "Run now", run log and counts. One account failing does
  not stop the others, and the run reports which account failed.
- **Automatic migration.** The current settings (address, label, host, port and
  `secrets/imap_app_password`) move to the matching email account. If no account has that address,
  one is created. Nothing is re-entered.
- **Settings UI.** The "Job-alert emails" card in Sources settings becomes a short pointer to
  Settings → Email, where each account shows its job-alert fields.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `job-ingestion`:
  - "Configurable sources" now says job alerts are read from the owner's email accounts, not one
    label;
  - a new requirement covers reading job-alert emails from the accounts.
- `application-emails`: the "Email accounts" requirement adds the per-account job-alert settings.

## Impact

- **`packages/db`:**
  - `mail_accounts` gains `job_alerts`, `alert_folders` and `alerts_in_inbox`;
  - `mail_cursors` gains a `purpose` (`replies` or `alerts`) in its unique key;
  - a migration;
  - queries for the alert accounts.
- **`packages/sources`:**
  - `adapters/email.ts` reads accounts through a connector the worker provides, instead of opening
    its own IMAP login;
  - new Greenhouse `SITE_RULES` entry;
  - known-sender filter for INBOX.
- **`apps/worker`:**
  - the source context gets the email accounts and their passwords;
  - a startup migration of the old settings;
  - the mail service passes `purpose: "replies"` to its cursors.
- **`apps/web`:** Settings → Email account form (job-alert fields); Sources card text; README.
