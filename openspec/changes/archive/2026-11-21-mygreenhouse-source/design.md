# Design

## Context

- **MyGreenhouse (my.greenhouse.io).** Greenhouse's candidate portal. Sign-in is password-free:
  the owner enters their email and types a one-time code sent by email. According to Greenhouse's
  public pages, the portal offers:
  - **Greenhouse Jobs:** a search across participating employers;
  - **recommended roles;**
  - **applications:** the list of the owner's applications with their status;
  - **actions:** job alerts, "Quick apply" and "Dream job".
- **What we do not know yet.** We have not seen the logged-in pages:
  - their URLs;
  - whether the lists come from same-origin JSON or server-rendered HTML;
  - the exact status names.
- **Existing pieces:**
  - logged-in adapters on `BrowserAccess.withSite` with the `ReadOnlyPage` guard, including
    `jsonResponses()` (simpleapply-source D5);
  - the capture script `apps/worker/scripts/logged-in-capture.ts`;
  - the Greenhouse board adapter (`externalId` `<board>:<id>` on the `greenhouse` source);
  - the email `decide` policy and the `EmailUndo` partial undo from application-emails.

## Goals / Non-Goals

**Goals:**

- Bring recommended and searched Greenhouse roles into scoring.
- Keep the pipeline in step with Greenhouse application statuses, with the same safety as email
  updates: automatic moves only where clear, always reversible.

**Non-Goals:**

- Writing anything to MyGreenhouse: applying, quick apply, dream job, saving, withdrawing, or
  editing the profile or alerts.
- Calling Greenhouse APIs directly or handling the session token.
- Reading application details beyond status and dates, such as interview schedules. Email replies
  still cover those.

## Decisions

### D1. Discover before parsing

Task 1.1 runs the capture script for `mygreenhouse` after the owner logs in. It saves the HTML and
the same-origin JSON of:

- the jobs search, with one keyword;
- the recommendations;
- the applications list.

The capture is read-only and its output stays in `data/`. It settles:

- the URLs and `checkUrl`;
- the login pattern;
- JSON versus HTML;
- the field names;
- pagination;
- the status vocabulary.

Anonymized fixtures are then committed. The parser design below assumes JSON responses and falls
back to card HTML, as for SimpleApply and Wellfound.

**Task 1.1 findings (2026-11-21).** MyGreenhouse is an Inertia (Rails + React) app. Every list
arrives as same-origin JSON, so no card HTML is parsed:

| Read | Page opened | JSON the page loads |
| --- | --- | --- |
| Search | `/jobs/search?query=<kw>[&page=N]` | `/jobs/search?...` (Inertia, `component: "jobs"`) |
| Recommendations | `/dashboard` | `/recommendations` |
| Applications | `/applications` | `/applications.json?page=1&active_only=true`, `...&inactive_only=true` |

- **Fields read.**
  - Search `props.jobPosts[]`: `id`, `title`, `companyName`, `publicUrl`, `urlToken`,
    `locations[]`, `workType` (`remote`, `hybrid`, `in_person`), `firstPublished`; plus
    `props.page` and `props.moreResultsAvailable`.
  - Recommendations: `state` and `recommendations[]`, the same fields plus a plain-text
    `description` and `rank`.
  - Applications: `id`, `company_name`, `job_title`, `job_post_url`, `job_post_id`,
    `locations`, `applied_at`, `inactive`, `stages[]`, and the list's `total_pages`.
- **Login.** `/` redirects a signed-in owner to `/dashboard`, which is the `checkUrl`. The
  provisional login pattern stays.
- **Pagination.** The search scrolls without a "next" button. A GET to `&page=2` returns the
  second page, so pages are opened by URL and nothing is clicked. The site ignores `work_types`,
  so remote filtering stays with Job Radar's pre-filter.
- **Ids.** `publicUrl` and `job_post_url` are public board URLs
  (`job-boards[.eu].greenhouse.io/<board>/jobs/<id>`), so D3 ids are always available.
- **Status vocabulary.** There is no status name. An application carries `inactive` (true once
  Greenhouse closes it: rejected, or the job closed), a `stages[]` list (empty in every captured
  application; some employers share it) and, on the detail page only, `activityHistory[].type`
  (only `applied` seen). D4 derives the status from these.
- **Personal data.** `/profiles/data.json` (profile, résumé, self-identification) loads on every
  page. The adapter reads only the three paths above.

*Alternative considered:* writing parsers from guesses. It was rejected because SimpleApply showed
the page shape decides the approach.

### D2. One source, three reads

- **Source row.** `id: "mygreenhouse"`, `type: "mygreenhouse"`, `requiresLogin: true`, default
  interval 12 hours.
- **Site definition.** `loginUrl` is `https://my.greenhouse.io/`. `checkUrl` and
  `loginUrlPattern` come from task 1.1.
- **Each run:**
  1. **Search:** one search page per keyword in `preferences.search.keywords`, up to 5 keywords
     and 2 pages each, opened by URL (`&page=2`).
  2. **Recommendations:** the dashboard.
  3. **Applications:** `/applications`, which loads page 1 of the active and inactive lists. When
     a list has more pages the run logs it; later pages need a click and are not read.
- **Page cap.** Page views stay under the per-site cap of 20 per hour. A run that reaches the cap
  stops, and the remaining reads happen next run.

### D3. Offer identity

- **External id.** `<board>:<jobId>`, the same as the Greenhouse board adapter, when the board
  slug and job id are known. Otherwise `mygreenhouse:<jobId>`.
- **Duplicates.** Cross-source duplicates fall to the existing company and title rule within 14
  days. A job already ingested from a polled board is matched by external id across both sources
  through a new lookup step in ingestion: when a `mygreenhouse` offer's id equals an existing
  `greenhouse` offer's id, it is treated as known and only gets an `offer_links` row.
- **Metadata.** `companyMeta` keeps `{ via: "MyGreenhouse search" | "MyGreenhouse recommended" }`.
  Greenhouse's own match or recommendation score, if shown, is kept as metadata and never used as
  Job Radar's score.

*Alternative considered:* a separate id space. It was rejected because the same job would be
scored twice.

### D4. Status updates reuse the email policy

- **Status.** Derived from the application (task 1.1): `inactive` when Greenhouse marks it
  inactive; otherwise the name of its last shared stage; otherwise `applied`.
- **Mapping.** A pure function in `packages/core` maps the status to a category: one of
  `acknowledgement` (`applied`), `in_review`, `interview`, `offer`, `rejection`, `closed`
  (`inactive`) or `unknown`. Stage names are matched by keywords (interview, screen, assessment,
  offer, reject, review).
- **Decision.** The category goes through the same `decide` policy as email replies:
  - `rejection` moves to Rejected, automatically;
  - `interview` moves forward to the first interview stage if the application is earlier;
  - `offer` moves to Offer;
  - `acknowledgement` and `in_review` record a timeline entry only;
  - `closed` suggests Rejected and never moves automatically, because inactive may also mean
    the job closed;
  - `unknown` becomes a suggestion.
- **Never.** No move to Accepted, Declined or Withdrawn. Custom or closed stages are only
  suggested.
- **Storage.** Table `portal_applications`:
  - `source`;
  - `portal_id`: Greenhouse's application id or job id;
  - `application_id`: nullable;
  - `last_status`, `status_seen_at`;
  - `candidates`: JSON;
  - `pending`: JSON suggestion;
  - `undo`: JSON in the same shape as `EmailUndo`.

  A row is updated only when `last_status` changes, so a run with no change does nothing.
- **Matching** an application:
  1. an offer link with the same Greenhouse job;
  2. otherwise one open application at the same company with a similar title (normalized
     company name, title token overlap ≥ 0.6);
  3. several candidates become a suggestion asking which.

  No match and an "applied" date creates the application ("Applied through Greenhouse"),
  importing the job as an offer if it is unknown.
- **Undo** reuses the application-emails partial-undo logic, extracted to a shared helper. Stage
  transitions record `source: "greenhouse"`.

*Alternative considered:* treating portal statuses as suggestions only. It was rejected because
the owner chose automatic moves with Undo for emails, and the portal is a more reliable signal.

### D5. Alerts and de-duplication with emails

- **Notification kinds.** `portal_rejection`, `portal_next_step` and `portal_offer`, with dedupe
  key `portal:<id>:<status>`.
- **Telegram.** Messages carry Undo, Apply or Dismiss buttons through the existing callback
  handler, generalized from `em:` to `em:` and `pa:` prefixes.
- **No double moves.** If the application is already at or past the target stage (for example an
  email moved it first), `decide` yields no move and no notification. The status is still recorded
  on the timeline.

### D6. UI

- **Sources and Settings → Sessions.** They list "MyGreenhouse (logged-in)" with the notice:
  "Job Radar reads your MyGreenhouse jobs, recommendations and application statuses. It never
  applies, saves or withdraws. You sign in with the code Greenhouse emails you; Job Radar never
  sees it."
- **Pipeline.**
  - The "From email" card becomes "Updates to review" and lists email and portal suggestions.
  - The application sheet's "Emails" section becomes "Updates", showing both kinds with Undo.
  - Timeline entries read "MyGreenhouse: <status>", and the stage change is labelled
    "from MyGreenhouse".

## Risks / Trade-offs

- **Greenhouse changes its pages.**
  - A run that reaches a logged-in page but finds no list fails with "no job list arrived; the
    site may have changed".
  - Repeated failures stop the source.
- **Status wording is vague** (for example "Application in review" forever). It maps to
  `in_review`, which records the status and moves nothing.
- **Terms of use.** The source is opt-in, low volume (one run every 12 hours, under 20 pages),
  with a notice. Greenhouse alert emails (job-alert-mailboxes) are the zero-risk alternative for
  new roles.
- **Personal data in captures.** Captures stay in `data/` and are never logged. Fixtures are
  anonymized and checked by the private-terms scan.

## Migration Plan

Migration `0007_mygreenhouse`:

- `stage_transitions.source` enum gains `greenhouse`;
- new table `portal_applications`;
- new notification kinds.

`sources-sync` creates the `mygreenhouse` source row, disabled. There is no data migration.

## Open Questions

- The shape of a shared `stages[]` entry: none was seen. The mapper accepts a string, or an
  object with `name`, `title` or `status`.
