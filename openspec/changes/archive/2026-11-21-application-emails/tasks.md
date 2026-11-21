# Tasks

## 1. Data model

- [x] 1.1 Migration `0005_application_emails`:
  - tables `mail_accounts`, `mail_cursors` and `application_emails` (unique `message_id`);
  - `stage_transitions.source` (default `"manual"`) and `email_id`;
  - notification kinds `email_next_step`, `email_offer` and `email_rejection`.

  Verified by db migration tests: the migration applies to a copy of a 0004 database, keeps the existing rows, and the unique `message_id` constraint rejects a duplicate.
- [x] 1.2 Queries for:
  - account CRUD, keeping `hasPassword` separate from the password;
  - cursors;
  - inserting an email idempotently;
  - suggestions per application and pending suggestions;
  - email entries in the timeline.

  Verified by `db.test.ts` cases.

## 2. Core logic (pure, in `packages/core`)

- [x] 2.1 Prefilter (D3):
  - `HIRING_SENDERS`;
  - company name normalization;
  - matching by domain or parent domain;
  - matching through ATS sender plus company name;
  - excluding own addresses;
  - at most 5 candidates.

  Verified by unit tests: a direct-domain match, a Greenhouse sender with the company in the subject, a newsletter, own sent mail, and two applications at one company.
- [x] 2.2 Quoted-history stripping and truncation to 6,000 characters. Verified by unit tests on Gmail-, Apple Mail- and Outlook-style reply bodies.
- [x] 2.3 Classification prompt and zod schema (D4), with untrusted-data wrapping, plus post-validation:
  - a non-candidate id becomes null;
  - a bad or past date becomes a suggestion.

  Verified by `FakeLlmClient` tests, including an injected "mark as accepted" body.
- [x] 2.4 Action policy `decide()` (D5) and the stage mapping. Verified by table-driven unit tests:
  - every category;
  - backwards moves;
  - closed applications;
  - custom stages;
  - medium confidence;
  - several candidates.

## 3. Worker

- [x] 3.1 Account service:
  - writes passwords to `secrets/mail/<id>` with mode 0600 and registers them for redaction;
  - test connection (read-only, returns the INBOX count);
  - routes `GET/POST/PATCH/DELETE /mail/accounts` and `POST /mail/accounts/:id/test`.

  Verified by worker route tests:
  - no response body contains the password;
  - a log capture contains no password or address;
  - delete removes the secret file.
- [x] 3.2 IMAP reader (D2): read-only EXAMINE, envelopes after the cursor, the first-run lookback (oldest open application, at most 60 days), the UIDVALIDITY reset, source fetched only for matches, the cursor advanced after storing, and a per-account timeout and error. Verified by tests against an in-process fake IMAP client:
  - no STORE, MOVE, COPY, EXPUNGE or APPEND commands are issued;
  - a failing account does not stop the others.
- [x] 3.3 Processing service:
  - classify, then decide;
  - apply automatic updates (transition, next step, interview, `firstResponseAt`/`lastActivityAt`, the interview-prep trigger);
  - store suggestions;
  - queue emails when the cap is reached.

  Verified by service tests with a fake LLM covering an invitation, a rejection, an acknowledgement, a capped day and a duplicate message.
- [x] 3.4 Undo, apply and dismiss services with partial-undo reporting (D6), and routes `POST /mail/emails/:id/{undo,apply,dismiss}` plus `POST /mail/check`. Verified by tests:
  - undo after a manual stage change only reverts the parts that are unchanged;
  - pressing twice is a no-op.
- [x] 3.5 Cron job `mail-replies` (`mail.check_minutes`, skipped while a run is in progress), and `mail.check_minutes` in the preferences schema and the seed. Verified by a scheduler unit test and the profile tests.
- [x] 3.6 Notifications and Telegram (D8):
  - the new kinds and message texts;
  - an inline keyboard;
  - a `callback_query` handler that checks the owner's chat id;
  - message editing;
  - quiet-hour holding.

  Verified by tests with a fake bot API: a stranger's callback is ignored and logged, and Undo edits the message to "Undone".

## 4. Web

- [x] 4.1 Settings → Email accounts card:
  - presets (Gmail, iCloud, Custom);
  - a write-only password field;
  - folders, enable, test, check now;
  - status and errors.

  Verified by Playwright tests against the test-mode worker.
- [x] 4.2 The application sheet and offer timeline show email entries with summary, status badge, "Open in Mail" (`message:` link), and Undo, Apply or Dismiss. The pipeline shows a "From email" suggestions strip, with a candidate picker for ambiguous suggestions. Verified by Playwright tests on seeded fictional emails.
- [x] 4.3 The Preferences form gains the `mail.check_minutes` field. Verified by an extended `settings.spec.ts`.
- [x] 4.4 The desktop shell opens `message:` URLs with `shell.openExternal`, and only that scheme beyond http(s). Verified by a desktop unit test of the URL allowlist.

## 5. Docs and verify

- [x] 5.1 README: an "Email replies" section covering:
  - adding Gmail, iCloud and custom accounts, and creating app passwords;
  - what is sent to the model;
  - the read-only guarantee;
  - Undo.

  Verified by review.
- [x] 5.2 Run `pnpm verify` and commit locally after each group. Verified by the command passing.
- [x] 5.3 Owner check:
  - add the Gmail, iCloud and custom-domain accounts and check all three connect;
  - run "Check now" and confirm that real replies from the last weeks land on the right applications, nothing in Mail is marked as read, and a Telegram alert with Undo arrives and works.

## Workflow follow-up

- Rebuild and reinstall the Mac app (`pnpm desktop:build`) so the change reaches the installed app.
- Archive `application-emails` after the owner check.
