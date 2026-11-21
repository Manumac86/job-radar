# Design

## Context

SimpleApply (simpleapply.ai) matches jobs to the owner's CV and can apply for them. We checked the
dashboard on 2026-11-18 by looking only, without acting:

- **The match list is loaded from SimpleApply's own JSON API.** The page calls
  `GET /api/jobs?status=not-applied&relevance_threshold=60&posted_within=30&sort_by=relevance&limit=25&page=1`,
  plus count-only variants and `status=applied|interview` lists.
- **That API needs a bearer token in a header, not a cookie.** Opening the URL directly answers
  `{"message":"Unauthorized"}`.
- **Each card shows** title, company, location, remote, posted date, seniority, salary range and a
  match %. The detail panel has the full description and a "View original job post" button.
- **"Export CSV" downloads these columns:** `Date Posted, Date Applied, Status, Match Percentage,
  Job Title, Company, Location, Workplace Type, Job URL, Requirements Summary`. Fields are quoted and
  can span several lines. The owner's export (70 rows) linked to Ashby (22), Workday (13),
  Greenhouse (9), SmartRecruiters (4), Workable (3) and others. Every row was Remote.
- **"Email inbox" is not usable.** It is the proxy mailbox SimpleApply uses when it applies, not a
  digest of matches.

The existing pieces this builds on:

- `ingestOffers`: normalizes rows, de-duplicates by external id or by company and title within
  14 days, and applies the pre-filter.
- `importOffer`: the manual-import flow, with `createApplication`.
- Logged-in adapters on `BrowserAccess.withSite` with the `ReadOnlyPage` guard.

## Goals / Non-Goals

**Goals:**

- Bring SimpleApply's matches into Job Radar with no risk (CSV) and without manual steps (logged-in).
- Have both paths produce the same offer for the same match.

**Non-Goals:**

- Writing anything back to SimpleApply. That includes applying, marking applied, hiding and
  starting auto-apply.
- Calling SimpleApply's API directly or handling its token.
- Importing other services' CSV formats. The parser is keyed to SimpleApply's header.
- Syncing SimpleApply's pipeline (interviews, failed) beyond "applied".

## Decisions

### D1. One source, two inputs

There is a single source row, `id: "simpleapply"` with `type: "simpleapply"`:

- **Polling.** The logged-in adapter polls this source. It is disabled by default and has
  `requiresLogin: true`.
- **CSV import.** The import writes to the same source whether the source is enabled or not, like
  the manual source does.
- **External id.** Both inputs use the same id, `simpleapply:<host><path>` from the original job
  URL: lowercased host, path without a trailing slash, query dropped except an id-like parameter
  (`gh_jid`, `jobId`, `id`). So a match first imported by CSV and later seen logged-in is the same
  offer.
- **Cross-source duplicates.** These, such as the same job on a Greenhouse board that Job Radar
  polls, fall to the existing company and title rule.

*Alternative considered:* two sources (`simpleapply-csv` and `simpleapply`). This was rejected
because it would double the Sources rows and break same-offer identity.

### D2. Row mapping (CSV and JSON share one mapper)

| Normalized field           | From                                                                                            |
| -------------------------- | ----------------------------------------------------------------------------------------------- |
| title, companyName         | Job Title, Company                                                                              |
| sourceUrl                  | Job URL (the original posting). `applyMethod` is "Apply on the company site (open manually)".   |
| location, remotePolicy     | Location; Workplace Type `Remote` maps to `remote`, else `inferRemotePolicy`                     |
| regions                    | `regionsFrom(location)`                                                                         |
| postedAt                   | Date Posted (date only, read as noon in the app time zone)                                      |
| description                | Requirements Summary (SimpleApply's summary, not the original text)                             |
| compensation               | JSON salary range when present. The CSV has no salary, so the offer is "rate unknown".          |
| raw                        | the row, plus `simpleapplyMatch` (number) and `via: "simpleapply csv"` or `"simpleapply dashboard"` |

Dashboard JSON (confirmed by the task 3.1 capture on 2026-11-18). Each `jobs[]` item has `job_title`,
`company_name`, `job_url` (the original posting; same external id as the CSV for all 28 captured
jobs), `formatted_location`, `workplace_type`, `employment_type`, `experience_level`,
`date_posted`, `match_percentage`, `min_annual_salary`/`max_annual_salary`/`salary_currency`
(yearly), `skills` and `applied`/`applied_last_at`. The list carries **no description**
(`description: null`), so the offer's description is a short summary from experience level,
employment type and skills; the CSV's requirements summary is richer. Hidden (`user_hidden`) and
expired jobs are skipped. Account fields (`user_id`, task ids, SimpleApply's queue state) are never
kept: `raw` holds only the job id, provider and experience level. The committed fixture has the
real field set with fictional values.

The offer detail shows "SimpleApply match N%" from `raw.simpleapplyMatch`. Scoring ignores it
(spec: "match data is not a score").

### D3. CSV parsing and the import path

- **Parser.** A small RFC 4180 parser in `packages/sources` handles quotes, `""` escapes, CRLF and
  newlines inside fields, with no new dependency.
- **Header check.** The header must contain at least Job Title, Company and Job URL; otherwise the
  import is rejected with the missing column names. The file is limited to 5 MB and 2,000 rows.
- **Upload.** The web uploads the file through a server action that posts its text to the worker at
  `POST /offers/import-csv`.
- **Worker.** It parses the file, maps the rows and calls
  `ingestOffers(db, "simpleapply", offers, prefs, now, log)` with the pre-filter on (these are
  SimpleApply's picks, not the owner's). It then enqueues the new ids for scoring and creates
  applications as described in D4.
- **Response.** The route returns `{ found, new, duplicates, filtered, invalid, applications }` for
  the dialog.
- **Scoring cap.** Scoring respects the daily cap. Offers over the cap wait in "awaiting score", as
  today.
- **Network.** Nothing in this path makes a network request.

### D4. Applied rows

A row counts as applied when it has a Date Applied, or a Status of `applied`, `interview` or
`interviewing` (case-insensitive). Then:

- Look the offer up through the de-duplicated id.
- If it has no application, call `createApplication` with that date (or today when only the status
  is known) and the note "Applied through SimpleApply".
- Applied rows skip the pre-filter, because the owner applied, the same as a manual import.

### D5. Logged-in adapter: read the page's own responses

`ReadOnlyPage` gains:

```ts
/** JSON bodies of same-origin responses received since the last goto whose path matches. */
jsonResponses(pathPattern: RegExp): Promise<unknown[]>;
```

- **Implementation.** It uses `page.on("response")`. It keeps only responses whose URL origin
  equals the page's origin, whose path matches, and whose content type is JSON.
- **What it exposes.** It stores `await response.json()` and nothing else. Request headers, response
  headers and cookies never leave the guard.
- **Buffers.** They are cleared on every `goto`.
- **Network.** The adapter cannot issue fetches. The guard has no request method.
- **Lint.** The existing ESLint rule that limits interaction calls to `guard.ts` covers `page.on`,
  and `guard.ts` stays the only file allowed to call it.

Run flow:

1. `withSite(simpleapplySite)`, then `goto("https://simpleapply.ai/dashboard")`.
2. Wait for the job cards. Read
   `jsonResponses(/^\/api\/jobs$/)`. Keep the bodies of list calls (not `count_only`) for
   `status=not-applied`.
3. Scrolling does not load more (confirmed). The list is paged, 25 per page, with "Go to page N"
   and "Next page" buttons; free accounts see at most 5 pages. The adapter clicks
   `button[aria-label="Next page"]:not([disabled])` through `safeClick` (an allowed pagination
   label, and a page view against the cap) until it is gone, up to 5 pages. The applied and interview
   lists the page also loads are read for the applications of design D4.
4. A login wall (redirect to `/auth` (SimpleApply's login page) or `/login`) or a 401 seen on `/api/jobs` throws
   `SessionExpiredError("simpleapply")`.
5. Map with the D2 mapper.

**Site definition.**

- `loginUrl`: `https://simpleapply.ai/auth` (confirmed by the owner).
- `checkUrl`: `/dashboard`.
- `loginUrlPattern`: `/\/(login|sign-?in|auth)\b/i`.

**Forbidden labels.** The guard's `FORBIDDEN_LABELS` gains `applied|unlock|upgrade|not interested|hide|auto apply`.
"Simple Apply" is already covered by `apply`. The adapter never calls `safeClick` anyway. The labels
are defence in depth.

**Risk notice.** Settings shows: "SimpleApply is a service you pay for that can apply on your behalf.
Job Radar only reads your match list, never applies, and never touches Full Auto Apply. Automated
reading may go against SimpleApply's terms. The CSV import has no such risk."

### D6. UI

- **Import dialog.** Offers → "Add from link" becomes "Import", with two tabs: Link (unchanged) and
  SimpleApply CSV. The CSV tab has a file input and a help line: "In SimpleApply, click Export CSV
  and choose the file". After upload it shows the counts and a link to the offers filtered by
  source.
- **Sources.** It lists "SimpleApply (logged-in)" like the other logged-in sources.
- **Offer detail.** It shows the SimpleApply match line when present.

## Risks / Trade-offs

- **SimpleApply changes its API or dashboard.** Mitigation: a run that sees the dashboard but no
  `/api/jobs` list fails with "no job list arrived; the site may have changed" instead of reporting
  0 matches, and repeated failures stop the source as for any other source. The CSV path keeps
  working.
- **The summary is not the original description.** Scoring sees SimpleApply's summary, about 2,000
  characters with responsibilities and requirements, which is enough. Opening the original link
  stays one click away.
- **Terms of use.** Automated reading is opt-in, uses a low volume (one dashboard load every 12
  hours) and carries a notice. CSV is the recommended default.
- **Personal data in captured responses.** These are stored only as offer raw payloads in the local
  database, never logged. The test fixture is anonymized before it is committed (the
  `private-terms` scan would also catch it).

## Migration Plan

There is no schema change. On startup, `sources-sync` creates the `simpleapply` source row,
disabled.

## Open Questions

None. Task 3.1 answered the field names, the login path (`/auth`) and paging ("Next page", not
scrolling). A live read-only run on 2026-11-18 returned 68 matches over 3 pages.
