# Proposal

## Why

Replies to applications (rejections, interview invitations, take-homes, offers, scheduling
requests) arrive by email across several of the owner's mailboxes, and today the owner must spot
each one and update the pipeline by hand. 42 applications are open; replies get missed, stages go
stale and follow-up reminders fire for applications that already have news.

## What Changes

- **Email accounts in Settings**: the owner adds any number of IMAP mailboxes (presets for Gmail and
  iCloud, custom host for other providers such as a custom-domain mailbox). Each account's app
  password is typed once into a write-only field and stored as a file under `secrets/`; it is never
  shown again or logged. Every enabled account is checked.
- **Read-only, incremental reading**: each account's configured folders (default `INBOX`) are opened
  read-only; only messages newer than the last one seen are fetched. Mail is never marked as read,
  moved, deleted or answered.
- **Local prefilter**: headers are matched on the machine against open applications (company
  website domain or name) and a list of known hiring-platform senders (Greenhouse, Lever, Ashby,
  Workable, Teamtailor, LinkedIn, …). Messages that don't match never leave the machine.
- **Classification by the model**: each match is sent, as untrusted data, with at most five
  candidate applications. The model picks the application and returns a category (rejection,
  interview invitation, take-home, offer, information request, acknowledgement, other), a
  confidence, a one-line summary and any next step or interview with date and time zone.
- **Automatic updates with Undo**: a high-confidence match moves the application forward
  (screening call, technical, take-home, final interview, offer received) or to Rejected. It records
  the email in the timeline, sets the next step and, when a date is given, adds the interview. It
  never moves to Accepted, Declined or Withdrawn, never moves backwards and never reopens a closed
  application. Every automatic change can be undone. Unclear matches become suggestions the owner
  applies or dismisses.
- **Notifications**: next steps, offers and rejections found in email are sent to the app and to
  Telegram. Each message carries an Undo button (for automatic changes) or an Apply button (for
  suggestions); the buttons only work from the owner's chat.
- **Open in Mail**: every email entry links to the message in Apple Mail.
- Out of scope: replying to or drafting answers to emails, Microsoft accounts that require OAuth
  sign-in, and voice access through Siri (a separate change).

## Capabilities

### New Capabilities
- `application-emails`: reading the owner's mailboxes for replies to applications, matching them
  to applications, and updating the pipeline from them with undo and suggestions.

### Modified Capabilities
- `notifications`: Telegram alerts add email next steps, offers and rejections, with inline Undo and
  Apply buttons that answer only the owner's chat.
- `application-pipeline`: the timeline also records emails matched to an application, with a link
  to open them in Mail.

## Impact

- **New package code**:
  - `packages/sources`: an IMAP reader for replies, separate from the job-alert adapter.
  - `packages/core`: a prefilter, the classification prompt and schema, and the action policy.
- **Database** (new migration):
  - new tables `mail_accounts` and `application_emails`;
  - new notification kinds;
  - a timeline kind `email`;
  - a `source` field on stage transitions.
- **Worker**: a scheduled job, plus routes for accounts (CRUD, test connection, check now) and for
  undo, apply and dismiss.
- **Telegram bot**: handles callback queries with an owner check.
- **Web**:
  - an Email accounts card in Settings;
  - email entries and suggestions in the application sheet and offer timeline;
  - a suggestions list in the pipeline.
- **LLM**: classification counts against the scoring cap, as extraction does today.
- **No change** to the existing job-alert email source or to `secrets/imap_app_password`.
