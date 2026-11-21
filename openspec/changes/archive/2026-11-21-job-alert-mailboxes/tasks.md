# Tasks

## 1. Greenhouse alerts and parsing

- [x] 1.1 Get the link format of a real MyGreenhouse or Greenhouse job-alert email. Read it
  read-only from the owner's mailboxes, with the owner's go-ahead, and write an anonymized fixture
  (fictional company, ids and names). Verified by: the fixture is committed and the private-terms
  scan passes.

  Done 2026-11-21: no Greenhouse job alert exists in any of the three mailboxes (read-only search
  of every folder, 180 days; only an application acknowledgement). The fixture is synthetic, from
  Greenhouse's public job-board URL formats (design D4).
- [x] 1.2 Add the `greenhouse` entry to `SITE_RULES` (D4), with an optional second id group in
  `parseWithRule`. Verified by email adapter unit tests:
  - the fixture yields the expected jobs with `greenhouse:<board>:<id>` ids;
  - the existing LinkedIn, Upwork, Malt and Wellfound fixtures still parse unchanged.

## 2. Data model

- [x] 2.1 Migration `0006_job_alert_mailboxes`:
  - `mail_accounts.job_alerts`, `alert_folders` and `alerts_in_inbox`, with defaults;
  - `mail_cursors.purpose`, with unique (account, folder, purpose); existing rows become `replies`.

  Verified by a db migration test: a copy of a 0005 database keeps its accounts and cursors, and
  a reply cursor and an alert cursor can coexist for INBOX.
- [x] 2.2 Queries:
  - `alertAccounts`;
  - cursor get/set with a purpose;
  - account create/update with the alert fields; changing a folder or host resets only that
    account's cursors.

  Verified by `mail.test.ts` cases.

## 3. Reading alerts from the accounts

- [x] 3.1 Add the `mail` connector to `SourceContext` and implement it in the worker (D3):
  - `ReadOnlyImap`, the account password and alert cursors;
  - first read from the lookback;
  - 200 messages per folder per run.

  The mail service passes `purpose: "replies"`. Verified by worker tests against the fake
  mailbox: the cursor advances, a second run reads nothing new, and the mailbox is opened
  read-only.
- [x] 3.2 Rewrite the `email_alerts` adapter on the connector:
  - alert folders use rule parsing plus the LLM fallback;
  - INBOX with `alerts_in_inbox` keeps only known senders, with no LLM fallback;
  - each account is read separately and failures are collected per account.

  Verified by adapter tests covering:
  - alerts from two accounts in one run;
  - a personal INBOX email that is never fetched or sent to the fake model;
  - the same alert in two accounts imported once;
  - one account failing while the other is read, with the error naming the account.
- [x] 3.3 Startup migration `migrateAlertMailbox` (D5), idempotent. Verified by worker tests:
  - an existing account with the same address gets alerts on and the label added;
  - with no matching account, one is created and the password copied to `secrets/mail/<id>`;
  - a second start changes nothing;
  - no log line contains the password.

## 4. Settings UI and docs

- [x] 4.1 Account form: the "Job alerts" section (switch, alert folders, "Also look in INBOX"),
  the alert summary in the account list, and "Test connection" reporting the alert folders' counts.
  Verified by Playwright in `mail.spec.ts`: turn alerts on with a label, see the summary, and test
  shows the folder count from the fake mailbox.
- [x] 4.2 Replace the "Job-alert emails" card with the pointer to Settings → Email, keeping
  "Look back (days)". Verified by Playwright: the old mailbox fields are gone and the link opens
  the Email tab.
- [x] 4.3 README: update the "Job-alert emails" setup for accounts, say `secrets/imap_app_password`
  is no longer needed, and list Greenhouse. Verified by `pnpm verify` (format and check:local).

## 5. Owner check

- [x] 5.1 Owner check:
  - reinstall the app and confirm the Gmail account now shows job alerts on with `job-alerts`;
  - turn on alerts for iCloud and the custom domain (a label or INBOX);
  - press "Run now" on Job-alert emails and see offers from more than one mailbox;
  - confirm nothing in Mail was marked as read.
