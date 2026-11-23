# Tasks

## 1. Parsing and mapping

- [x] 1.1 RFC 4180 CSV parser in `packages/sources` (quotes, `""`, CRLF, newlines in fields, BOM). Verified by unit tests on a fictional fixture shaped like the SimpleApply export (multiline summaries, commas in titles).
- [x] 1.2 SimpleApply mapper (design D2), with the external id `simpleapply:<host><path>` keeping only id-like query parameters, header validation (Job Title, Company, Job URL), invalid-row handling, and `raw.simpleapplyMatch`. Verified by unit tests: field mapping, the same id for URLs that differ only in tracking parameters, a missing column error that names the columns, rows with a non-http URL counted invalid.

## 2. CSV import

- [x] 2.1 `simpleapply` source synced on startup (disabled, interval 720, requires login) and the worker `POST /offers/import-csv` (5 MB, 2,000 rows): `ingestOffers` with the pre-filter, scoring enqueue, applied rows per design D4 (pre-filter skipped, no second application), counts response, no network access. Verified by worker route tests: counts for new, duplicate, filtered and invalid rows; re-import creates nothing; dedup against an existing Greenhouse offer adds a link; an applied row creates one application "Applied through SimpleApply"; the fetcher is never called.
- [x] 2.2 Web: "Import" dialog with Link and SimpleApply CSV tabs, a server action uploading the file text, results summary with a link to the source's offers, and "SimpleApply match N%" in the offer detail. Verified by a Playwright test that uploads a fictional export and sees the counts and the new offers, plus a test that a non-SimpleApply CSV shows the missing columns.

## 3. Logged-in source

- [x] 3.1 With the owner logged in to SimpleApply in the isolated profile, capture one dashboard load (`/api/jobs` bodies only) with a dev script into `data/` (git-ignored), confirm the login path and whether scrolling loads more pages, then write an anonymized fixture under `packages/sources/test/fixtures/`. Update design D2 and D5 with the confirmed field names. Verified by the fixture existing and passing `pnpm check:local` (private-terms scan).
- [x] 3.2 `ReadOnlyPage.jsonResponses(pathPattern)`: same-origin, JSON-only, body-only, cleared on `goto`, no request method. Add `applied|unlock|upgrade|not interested|hide|auto apply` to `FORBIDDEN_LABELS`. Verified by guard tests with a fake page: third-party and non-JSON responses are dropped, headers are never exposed, the buffer resets on navigation, and `safeClick` throws on "Simple Apply", "Applied", "Unlock" and "Full Auto Apply".
- [x] 3.3 SimpleApply site definition and logged-in adapter (design D5): dashboard load, up to 6 scrolls while new pages arrive, mapping through the shared mapper, session expired on a login redirect or 401, "needs attention" when no job list arrives. Verified by adapter tests with the fixture and a fake `BrowserAccess`: the offers match the CSV mapping for the same jobs, 401 → `SessionExpiredError`, no `safeClick` or `goto` beyond the dashboard.
- [x] 3.4 Settings → Sessions and Sources list SimpleApply with the risk notice from design D5, disabled by default and enabled only after confirmation. Verified by the existing logged-in source Playwright tests extended to SimpleApply.

## 4. Docs and verify

- [x] 4.1 README: SimpleApply in "Collects offers" (CSV import, and the optional logged-in source with its notice). Verified by review.
- [x] 4.2 Run `pnpm verify` and commit locally. Verified by the command passing.
- [x] 4.3 Owner check: import the real export (expect about 70 rows, with duplicates of Ashby or Greenhouse offers merged); log in to SimpleApply in Settings → Sessions, enable the source, run it, and confirm new matches appear and that SimpleApply shows no new applications, hidden jobs or auto-apply change.
