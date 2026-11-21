# Design

## Context

- **Today's alert source.** `email_alerts` (`packages/sources/src/adapters/email.ts`) opens its own
  ImapFlow login:
  - settings: `user`, `label`, `host`, `port`, `lookback_days`;
  - password: `secrets/imap_app_password`;
  - it EXAMINEs one label and SEARCHes `since` the lookback on every run. There is no cursor;
    de-duplication relies on offer external ids.
  - Known senders go through `SITE_RULES` (LinkedIn, Upwork, Malt, Wellfound), others through
    `parseWithLlm`.
- **application-emails added email accounts:**
  - tables `mail_accounts` (label, address, host, port, folders, enabled, status) and
    `mail_cursors` (account + folder → UIDVALIDITY + last UID);
  - passwords in `secrets/mail/<id>`;
  - `ReadOnlyImap` / `readFolder` in `packages/sources/src/mail/replies.ts`;
  - `MailService` in the worker.
- **The owner's mailboxes.** They have three accounts (Gmail, iCloud, a custom domain). Alerts
  land in more than the one Gmail label.

## Goals / Non-Goals

**Goals:**

- Read job alerts from any configured account, with no second password.
- Keep `email_alerts` as the single source, with its interval, run log and counts.
- Keep mail untouched, and keep non-alert INBOX mail away from the model.
- Migrate the current setup with no owner action.

**Non-Goals:**

- New alert parsers beyond Greenhouse.
- Changing how replies are read or classified.
- OAuth mail providers.

## Decisions

### D1. Alert settings live on the email account

`mail_accounts` gains:

| Column            | Type                 | Default |
| ----------------- | -------------------- | ------- |
| `job_alerts`      | boolean              | false   |
| `alert_folders`   | json `string[]`      | `[]`    |
| `alerts_in_inbox` | boolean              | false   |

- **Account on but nothing chosen.** An account with `job_alerts` on and no folders and no INBOX
  is valid, but the form warns "Choose a folder or INBOX".
- **Disabled accounts.** `enabled = false` turns off both replies and alerts.

*Alternative considered:* a separate list of alert mailboxes. It was rejected (owner's choice): it
would need a second app password for the same mailbox.

### D2. Cursors get a purpose

- **Schema.** `mail_cursors` gains `purpose` (`"replies" | "alerts"`, default `"replies"`).
- **Unique key.** It becomes (account, folder, purpose).
- **Why.** Replies and alerts read INBOX on different schedules (15 min and the source interval),
  so they need separate positions.
- **First read.** An alert cursor with no position starts from `now − lookback_days`, through the
  same `readFolder` used for replies.
- **UIDVALIDITY changes.** A change re-reads from the lookback. Offer de-duplication prevents
  double offers.

*Alternative considered:* one pass over INBOX for both. It was rejected because it couples two
sources with different intervals, run logs and failure handling.

### D3. The adapter reads through a connector, not its own login

- **Context.** `SourceContext` gains an optional `mail` connector:
  `{ accounts(): AlertAccount[]; read(account, folder, filter): Promise<AlertMessage[]> }`.
- **Wiring.** The worker implements it with `ReadOnlyImap`, the account password and the alert
  cursors.
- **Adapter run.** The adapter loops over accounts and folders:
  - **alert folders:** fetch the full source of every new message, then call `parseAlertEmail`
    (rule, then the LLM fallback);
  - **INBOX with `alerts_in_inbox`:** the envelope filter keeps only senders matching a
    `SITE_RULES.sender`. Only those are fetched and parsed with `parseWithRule`, with no LLM
    fallback. LinkedIn notifications that are not alerts parse to zero jobs and are dropped.
- **Shared folders.** If INBOX is also listed as an alert folder, the alert-folder behaviour wins.
- **Errors.** Each account is read inside its own try/catch. Errors are collected into the run's
  error text as "<label>: <reason>", using the provider help in `describeMailError`. The run fails
  only when every account fails.
- **Message cap.** Up to 200 messages per folder per run. When more remain, the cursor stops at the
  last one read and the next run continues.

*Alternative considered:* keep the adapter's own ImapFlow login, looping over accounts. It was
rejected because it duplicates the cursor and password logic and spreads password access.

### D4. Greenhouse alert rule

`SITE_RULES` gains a `greenhouse` entry:

- **Sender:** `/greenhouse\.io|greenhouse-mail\.io|greenhouse\.com/i`.
- **Job URL:** `/https?:\/\/(?:job-boards|boards)(?:\.eu)?\.greenhouse\.io\/([^/\s"'<>?]+)\/jobs\/(\d+)/i`,
  with group 1 the board and group 2 the job id.
- **External id:** `greenhouse:<board>:<id>`, the same `<site>:<id>` form as the other alert rules.
- **Company:** from the card; when the card has none, the board slug (`contoso-ai` → "Contoso Ai").

**Task 1.1 finding (2026-11-21).** None of the owner's three mailboxes holds a Greenhouse job
alert: a read-only search of every folder for the last 180 days found only one Greenhouse email,
an application acknowledgement with no job links. The rule therefore uses Greenhouse's public job
board URL formats, and the fixture is synthetic. If MyGreenhouse alerts turn out to link to
`my.greenhouse.io` pages instead, mygreenhouse-source task 1.1 (which captures those pages)
adds that pattern.

`parseWithRule` already handles one id group; it gains support for an optional second group.

### D5. Migration

At worker startup, `migrateAlertMailbox` runs once (it is idempotent):

1. Read the `email_alerts` settings. If they have a `user` and `secrets/imap_app_password` exists,
   continue.
2. Find the `mail_accounts` row whose address matches `user` (case-insensitive):
   - **found:** set `job_alerts = true` and add `label` to `alert_folders` if it is missing;
   - **not found:** create the account from host, port and label, with `folders` `["INBOX"]` and
     `enabled` true (so replies are read too, as for any account). Copy the password to
     `secrets/mail/<id>`.
3. Mark the source settings `migrated: true` and keep `lookback_days`.

The old file is left in place, and the README says it can be deleted.

*Alternative considered:* ask the owner to re-enter the setup. It was rejected because it is
unnecessary friction.

### D6. UI

- **Account form** (Settings → Email): a "Job alerts" section with:
  - a switch;
  - "Alert folders or labels" (comma-separated);
  - "Also look in INBOX (only LinkedIn, Upwork, Malt, Wellfound and Greenhouse alerts)".
- **Account list.** Each account shows "Job alerts: job-alerts, INBOX".
- **Test.** "Test connection" also opens each alert folder read-only and reports its message count,
  or says it does not exist.
- **Sources card.** "Job-alert emails" is replaced by a sentence and a link: "Job alerts are read
  from your email accounts. Choose folders in Settings → Email". "Look back (days)" stays on the
  source.

## Risks / Trade-offs

- **INBOX volume.** The envelope filter is local and cheap, and bodies are fetched only for
  known-sender matches.
- **LinkedIn non-alert mail in INBOX.** It yields zero jobs and is not sent to the model.
- **Model cost on alert folders.** This is the same as today, but now for several folders. The LLM
  fallback is bounded by the extraction cap.
- **Migration picking the wrong account.** It matches only on the exact address. Otherwise it
  creates a new account, which the owner can edit.

## Migration Plan

- **Database.** The migration adds the columns with defaults. `mail_cursors` is rebuilt with
  `purpose` and existing rows become `replies`.
- **Settings.** The startup migration (D5) moves the alert settings.
- **Rollback.** An older build ignores the new columns, but would need
  `secrets/imap_app_password`, which is kept.

## Open Questions

- The link format of MyGreenhouse alert emails: no real alert exists yet (see D4); confirmed when
  one arrives or by mygreenhouse-source task 1.1.
