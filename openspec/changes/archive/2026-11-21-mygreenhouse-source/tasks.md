# Tasks

## 1. Discovery and site definition

- [x] 1.1 Add the `mygreenhouse` site definition: `loginUrl` `https://my.greenhouse.io/` and a
  provisional login pattern. The owner logs in once from Settings → Sessions, then the capture
  script saves the jobs search, the recommendations and the applications list (read-only, output in
  `data/`). Record in design.md the URLs, JSON or HTML shape, pagination and status vocabulary,
  then write anonymized fixtures. Verified by: design D1/D2/D4 open points answered, fixtures
  committed, private-terms scan passes.
- [x] 1.2 Add "quick apply", "dream job" and "withdraw" to `FORBIDDEN_LABELS`. Verified by guard
  unit tests: `safeClick` on those labels throws `ForbiddenActionError`, and "Next page" is still
  allowed.

## 2. Offers from search and recommendations

- [x] 2.1 Mappers from the captured jobs and recommendations to normalized offers (D3 ids,
  `companyMeta.via`), plus the site's card fallback if the page is HTML. Verified by unit tests on
  the fixtures: fields, `<board>:<jobId>` ids, and Greenhouse's own score kept as metadata only.
- [x] 2.2 The logged-in adapter run (D2): searches per keyword, recommendations, page limits,
  login wall → `SessionExpiredError`, and "no job list arrived" when the page loads without
  data. Verified by adapter tests with a fake `ReadOnlyPage`.
- [x] 2.3 Cross-source identity: a `mygreenhouse` offer whose id matches an existing `greenhouse`
  offer is treated as known and only linked. Verified by an ingestion test.

## 3. Application statuses

- [x] 3.1 Migration `0007_mygreenhouse`: the `greenhouse` transition source, the
  `portal_applications` table and the notification kinds, with queries. Verified by a db
  migration test on a copy of a 0006 database, and query tests.
- [x] 3.2 Pure status mapping and matching in `packages/core` (D4): status → category, and
  application matching by job link, then company and title, then suggestion. Verified by unit
  tests: each captured status, two applications at one company, and no match.
- [x] 3.3 Extract the application-emails undo into a shared helper and add the portal status
  service:
  - apply through `decide`;
  - create missing applications;
  - record the timeline;
  - undo, apply and dismiss;
  - notifications with D5 de-duplication.

  Verified by worker tests:
  - a rejection moves and undoes;
  - an email-first rejection causes no second move or alert;
  - an unchanged status does nothing;
  - an unknown status becomes a suggestion;
  - an unmatched application is created;
  - all application-emails tests still pass.
- [x] 3.4 Routes `POST /portal/updates/:id/{undo,apply,dismiss}` and the `pa:` Telegram buttons.
  Verified by route tests and telegram tests (owner-only, idempotent).

## 4. UI and docs

- [x] 4.1 Sources and Settings → Sessions list MyGreenhouse with its notice. The pipeline gets
  "Updates to review" and an "Updates" sheet section, and timeline entries are labelled "from
  MyGreenhouse". Verified by Playwright with seeded portal updates: Undo of an automatic move, and
  applying a suggestion.
- [x] 4.2 README: the MyGreenhouse source (what it reads, sign-in by code, never applies).
  Verified by `pnpm verify`.

## 5. Owner check

- [x] 5.1 Owner check:
  - enable MyGreenhouse and log in with the emailed code;
  - press "Run now";
  - confirm recommended roles appear as offers and your Greenhouse applications match the
    pipeline;
  - confirm a status change moves the right application with Undo and a Telegram alert;
  - confirm nothing changed in MyGreenhouse.
