# Tasks

## 1. Normalization

- [x] 1.1 `normalizeTitle` drops trailing qualifier segments (design D4). Verified by unit tests: the two Dover titles normalize equally; "Contract Manager" ≠ "Manager"; "Engineer, Platform" keeps "platform"; existing normalize tests still pass.
- [x] 1.2 `isIdLikeCompany` (D2). Verified by unit tests: a spaced UUID, a dashed UUID and a 24-character hex string are id-like; "Acme" and "3M" are not.

## 2. Dover lookup

- [x] 2.1 `packages/sources/src/dover.ts`: `doverJobId(url)` and `fetchDoverJob` (D1). Verified by tests on a synthetic fixture with the captured response shape (Contoso as client): the name, website (from `client_domain`) and plain-text description are returned, and an HTTP error returns null.
- [x] 2.2 `enrichDoverOffers`, called by the runner for the SimpleApply source (at most 50 per run). An id-like name becomes "Unknown company" in the mapping (CSV import included), unless resolved. Verified by adapter tests with a fake fetcher: the resolved name and description are used, a known external id with a real company is not fetched, one stored with an id is, and a failing fetch gives "Unknown company" without failing the run.

## 3. Pipeline

- [x] 3.1 A known offer with an id-like or unknown company is corrected from a later real name (D3). Hidden-company rules and research skip "Unknown company". Verified by worker tests.
- [x] 3.2 A one-time recompute of `normalized_title` (D5). Verified by a worker test: an older offer stored with the old normalization is matched by a qualifier variant after start.
- [x] 3.3 Run `pnpm verify`.

## 4. Owner check

- [x] 4.1 Owner check: after the next SimpleApply run, the Dover offers show "Contoso Staffing", and a new qualifier repost does not appear as a second offer.
