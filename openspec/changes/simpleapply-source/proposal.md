# Proposal

## Why

The owner uses SimpleApply (simpleapply.ai), an AI job-matching and auto-apply service, which surfaces
remote roles (about 180 matches at the moment) from ATS boards Job Radar does not poll, such as
Workday, SmartRecruiters, Workable and Rippling. These matches never reach Job Radar's scoring, drafts
and pipeline. SimpleApply has no public API, RSS feed or alert email. Its "Email inbox" is the proxy
mailbox it uses when it applies, not a digest. The two read-only ways in are its "Export CSV" file and
the owner's logged-in dashboard.

## What Changes

- **CSV import.** Offers → Import accepts a SimpleApply "Export CSV" file.
  - Each row becomes a normalized offer from the `simpleapply` source. It links to the original
    posting (the CSV's Job URL) and uses the requirements summary as its description.
  - Rows go through the usual de-duplication, keyword pre-filter and scoring within the daily caps.
  - SimpleApply's match percentage is kept as metadata, never as Job Radar's score.
  - Rows that SimpleApply reports as applied create an application on that date.
  - The import shows counts: new, already known, filtered and invalid.
- **Logged-in source "SimpleApply (logged-in)".** It is disabled by default and shows a risk notice.
  - The owner logs in once in the isolated browser profile.
  - Each run opens the dashboard and reads the job-match data that the page itself loads.
  - Job Radar never extracts or stores the session token and never calls SimpleApply's API directly.
  - It never clicks anything. "Simple Apply", "Applied", "not interested", "Unlock" and the
    Full Auto Apply switch stay untouched.
  - It uses the same page cap and pauses as the other logged-in sites, with a default interval of
    12 hours.
- **Response reading for the read-only browser.** The read-only browser wrapper can return the JSON
  bodies of responses the page received from its own origin, without making requests itself.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `job-ingestion`:
  - SimpleApply joins the supported source types.
  - Adds a SimpleApply CSV import requirement.
  - Adds a SimpleApply logged-in source requirement.
- `browser-sessions`: logged-in adapters may read the JSON responses the page itself received
  (same-origin, read-only). The adapter never sees or stores session tokens.

## Impact

- **`packages/sources`:**
  - new `adapters/simpleapply.ts`: CSV parser, row and JSON mapping, logged-in adapter;
  - `browser/guard.ts`: response capture on `ReadOnlyPage`, forbidden labels checked for
    "Simple Apply", "Applied" and "Unlock";
  - `browser/sessions.ts`: SimpleApply site definition;
  - registry.
- **`apps/worker`:** `POST /offers/import-csv` route and service reusing `ingestOffers`, application
  creation and the scoring queue.
- **`apps/web`:**
  - Offers → Import dialog gains a "SimpleApply CSV" tab (file upload, results summary);
  - Sources shows the new source;
  - Settings → Sessions lists SimpleApply with its risk notice.
- **Docs:** README source list and logged-in sites section.
- **No new dependencies.** The CSV parser is a small RFC 4180 parser.
- **No change to the no-auto-submission rule.**
