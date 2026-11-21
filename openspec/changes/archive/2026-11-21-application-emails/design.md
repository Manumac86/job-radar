# Design

## Context

Job Radar already reads one Gmail label over IMAP for job alerts. That reader is the
`email_alerts` source in `packages/sources/src/adapters/email.ts`. It uses `imapflow` with
`mailboxOpen(label, { readOnly: true })`, and its password comes from
`secrets/imap_app_password`. The owner uses three mailboxes in Apple Mail:
- a Gmail address;
- an iCloud address;
- a custom-domain address at an unknown provider.

All three must be checked. Apple Mail's own store (`~/Library/Mail`) is protected by macOS and
would need Full Disk Access, so the owner chose IMAP per account.

Applications already have:
- stages (`APPLICATION_STAGES`);
- `stage_transitions`;
- one `next_steps` row per application;
- `interviews` with reminders;
- `timeline_events`;
- `firstResponseAt` and `lastActivityAt`, which drive follow-up and no-response reminders.

Notifications go to `notifications` and the grammY bot, which only answers the owner's chat id.

## Goals / Non-Goals

**Goals:**
- Check every configured mailbox without changing any mail.
- Send the model only emails that plausibly concern an open application.
- Keep the pipeline current on its own, with every automatic change easy to undo.
- Alert the owner when there is something to do.

**Non-Goals:**
- Replying to, drafting or sending emails (project rule 2).
- Microsoft accounts that need OAuth.
- Reading Apple Mail's local files.
- Siri.
- Changing the job-alert source. It keeps its own settings and secret, and can be pointed at an
  account later.
- Matching emails to offers without an application.

## Decisions

### D1. Accounts in the database, passwords in `secrets/mail/<account-id>`
- **Table:** `mail_accounts` (id, label, address, host, port, folders JSON, enabled, status,
  last_error, last_checked_at).
- **Cursors:** `mail_cursors` (account_id, folder, uid_validity, last_uid).
- **Presets:**
  - Gmail: `imap.gmail.com:993`.
  - iCloud: `imap.mail.me.com:993`; the user name is the address.
  - Custom: host and port entered by hand.
- **Password write path:** the Settings form posts the password once to the worker. The worker
  writes `secrets/mail/<id>` (mode 0600) and calls `registerSecret` so the value is redacted from
  logs.
- **Read path:** reads go through `readSecretFile`. No route ever returns the password, only
  `hasPassword`.

Alternative considered: the owner saves files by hand, as with the existing secrets. That is fine
for one secret but awkward for three accounts in the Mac app, whose `secrets/` lives in
Application Support.

### D2. Read headers first, bodies only for matches
For each account and folder:
1. `mailboxOpen(folder, { readOnly: true })` (EXAMINE).
2. Compare `uidValidity` with the cursor.
3. Fetch `envelope` and `internalDate` for UIDs greater than `last_uid`. On the first run or a
   validity change, use `SEARCH SINCE` the lookback instead.
4. Run the prefilter (D3) on the envelopes.
5. For matches only, fetch `source`, parse it with `mailparser` and strip quoted history (reply
   separators and `>` lines) before truncating.
6. Advance the cursor after the batch is stored, so a crash re-reads instead of skipping.

Further rules:
- Accounts are checked one at a time, with a 60 s timeout each.
- A failing account records `last_error` and does not stop the others.
- Gmail's "[Gmail]/All Mail" is not read by default; the owner can add folders.

### D3. Prefilter (pure function in `packages/core`)
**Candidates:** open applications (stage not closing and not accepted), each with:
- the company name, normalized (lowercase, without legal suffixes);
- the website registrable domain;
- the offer title.

**A message matches when:**
- its sender domain (or a parent domain such as `mail.northwind.com`) equals a candidate's
  domain; or
- its sender is on `HIRING_SENDERS` and the normalized company name appears in the sender display
  name or the subject.

`HIRING_SENDERS` covers: greenhouse.io, greenhouse-mail.io, lever.co, ashbyhq.com,
workablemail.com, smartrecruiters.com, myworkday.com, teamtailor-mail.com, recruitee.com,
personio, bamboohr.com, jobvite.com, icims.com, breezy.hr, homerun.co, join.com, linkedin.com
(job application updates only), wellfound.com, malt, upwork.com, viterbit/between and simpleapply.

**Excluded senders:** the owner's own addresses and Job Radar's job-alert senders.

**Candidate limit:** at most 5 per message, ranked by domain match first, then most recent
application.

Messages that don't match are counted in the run log and nothing else is kept.

### D4. Classification call
The call is `callStructured` with kind `"extraction"`, which counts against the scoring cap
(budget.ts maps extraction there) and uses the scoring model.

**Prompt contents:**
- `UNTRUSTED_DATA_RULES`, with the email wrapped by `wrapUntrusted`;
- the candidate list (`id`, company, role, current stage);
- today's date and the owner's time zone.

**Schema fields:**
- `application_id` (an integer or null);
- `category` (one of the seven values);
- `confidence` (`high`, `medium` or `low`);
- `summary` (≤160 characters);
- `next_step` (`{description, due_at, time_zone}` or null);
- `interview` (`{kind, scheduled_at, time_zone, link}` or null).

**Validation after the call:**
- `application_id` must be one of the candidates;
- datetimes must parse;
- a `scheduled_at` in the past turns into a suggestion.

When the cap is reached, the email is stored with status `queued` and retried in order on the
next run after the reset. While queued, the trimmed body (≤6,000 characters) is kept in
`pending_body`, and it is cleared as soon as the email is classified.

### D5. Action policy (pure function, unit-tested)
`decide(result, application)` returns `auto`, `suggest` or `timeline_only`.

| Category | Target stage |
|---|---|
| rejection | rejected (from any open stage) |
| interview invitation | from `interview.kind`: screening → screening_call, technical → technical_interview, final → final_interview, fit → fit_interview; unknown → screening_call when in applied, otherwise suggest |
| take-home | take_home |
| offer | offer_received |
| information request | no stage change; sets the next step |
| acknowledgement, other | timeline only |

**`auto` requires all of:**
- `confidence === "high"`;
- exactly one candidate selected;
- the application is open (not closing, not accepted);
- the target is later in the stage order than the current stage, or is `rejected`.

Custom stages are never a target. An application currently in a custom stage gets suggestions
only.

**An automatic update writes:**
- a `stage_transitions` row with `source = "email"` and `email_id`;
- the next step (replacing the current one; the old one is kept on the email row for undo);
- the interview when `scheduled_at` and `time_zone` are present;
- `firstResponseAt` (if null) and `lastActivityAt`. These reset follow-up and no-response
  reminders.

Acknowledgements update nothing except the timeline.

Moving to an interview stage triggers interview prep as today, through the same code path as a
manual move.

### D6. `application_emails` table, which also holds the undo record
**Columns:**
- `id`, `account_id`, `message_id` (unique), `folder`, `uid`, `received_at`;
- `from_name`, `from_address`, `subject`, `excerpt` (≤500 characters);
- `application_id` (nullable), `category`, `confidence`, `summary`, `result` JSON;
- `status`: queued, auto_applied, suggested, applied, dismissed, undone or timeline_only;
- `undo` JSON: previous stage, previous next step, ids of the created interview and next step,
  and the transition id;
- `created_at`, `updated_at`.

**Undo checks each part before reverting it:**
- the stage, only if it still equals the auto target;
- the interview, only if it is unchanged;
- the next step, only if it is unchanged.

It reports the parts it skipped. Undo then writes a `stage_transitions` row (`note: "Undo email
update"`) and a timeline event.

### D7. Timeline and "Open in Mail"
A timeline event of kind `email` references `application_emails.id`. The sheet renders:
- sender, subject, date and summary;
- a status badge;
- Undo, Apply or Dismiss actions;
- an "Open in Mail" link, `message://%3C<message-id>%3E`.

Apple Mail handles `message:` URLs on macOS: the Electron shell opens them through
`shell.openExternal`, and the browser asks first. Messages without a Message-ID get no link.

### D8. Notifications and Telegram buttons
**New notification kinds:**
- `email_next_step`: an interview invitation, take-home, information request with a next step,
  or a suggestion that has a next step;
- `email_offer`;
- `email_rejection`.

Each notification links to the application. Quiet hours apply as today. Rejections are held
during quiet hours. Offers and next steps due within 24 h are also held, but are listed first
when quiet hours end.

**Telegram buttons:**
- Messages get an inline keyboard. `callback_data` is `em:<action>:<email-id>`, with action
  `undo`, `apply` or `dismiss`, staying under the 64-byte limit.
- The bot's `callback_query` handler checks `ctx.chat.id === ownerChatId` before acting.
- The handler calls the same service as the web routes, then edits the message text and answers
  the query.
- A repeated press is detected from the email `status`, which makes the action idempotent.
- "Apply" for a suggestion with several candidates opens the app instead, because Telegram
  cannot pick a candidate.

### D9. Scheduling and UI
- **Job:** a node-cron job `mail-replies` runs every `mail.check_minutes` (default 15) and skips a
  run while one is in progress. "Check now" is available per account and for all accounts.
- **Settings:** `preferences.yaml` gains `mail: { check_minutes: 15 }`, editable in the
  Preferences form.
- **Settings → Email accounts card:** one row per account with its status, last check and
  errors, plus "Test connection".
- **Pipeline:** a "From email" strip above the board lists pending suggestions.

### D10. Privacy and logging
- Logs record counts and ids only, never addresses, subjects or bodies.
- Only matched emails are stored, and only the D6 fields.
- The email body is sent to the model once and not stored beyond the excerpt.
- The owner's addresses live in the database and in `data/`, never in tracked files.
  Fixtures use fictional addresses.

## Risks / Trade-offs

- **Prompt injection or spoofed senders could move an application.**
  - Targets are limited to the candidates and to forward stages or Rejected.
  - Accepted, Declined and Withdrawn are never targets.
  - Every change is undoable and announced.
  - The worst case is a wrong stage until the owner taps Undo.
- **Missed replies** from an ATS that doesn't name the company in the sender or subject, or from
  an unlisted domain.
  - Mitigation: the sender list is easy to extend; the owner can add folders.
  - Fallback: the 14-day "no response" suggestion still applies.
- **Custom-domain mailbox host unknown.** The owner enters its IMAP host. If it turns out to be
  Microsoft-hosted, IMAP with an app password may be refused; that case is out of scope.
- **Scoring cap consumption.** Expect a few matched emails per day; this is negligible against a
  cap of 300.
- **The `message:` link works only on macOS with Apple Mail.** Elsewhere the entry still shows
  its fields.
- **Gmail labels:** replies a Gmail filter skips past INBOX are missed unless that folder is
  added.
