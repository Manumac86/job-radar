# Tasks

## 1. Query

- [x] 1.1 `listOffers` accepts `applied: "include" | "exclude"` (default `include`), left-joins `applications` and returns `applicationStage` per row; the count uses the same condition. Also return `appliedHidden` (matching offers left out) when excluding. Verified by db tests: an offer with an application is excluded from rows and total, is included with its stage when `include`, and other filters still combine.

## 2. Web

- [x] 2.1 `parseOfferFilters` reads `applied=1` (default exclude); unit test for both values.
- [x] 2.2 "Show applied" switch in `OffersFilters` (URL param `applied`, resets the page) and the header note "(M applied hidden)". Verified by the Playwright test in 2.4.
- [x] 2.3 Status and Pipeline columns in `OffersTable`: Status is "Applied" for offers with an application, else the triage label; Pipeline is the stage label from `listStages` (custom stages included), empty without an application; the "Shortlisted" badge under the title is removed. Status is a colored badge per status from new `--status-*` tokens (light and dark, text contrast at least 4.5:1, label always shown). Verified by a unit test that every triage state and "Applied" maps to a distinct token, and by the Playwright test in 2.4.
- [x] 2.4 Playwright: with the seeded application (Contoso, moved to technical interview), the offer is hidden by default and the header notes it; turning on "Show applied" lists it with status "Applied" and pipeline "Technical interview", and other rows show "New"/"Shortlisted" with an empty pipeline. Update existing specs that count rows after "Mark as applied".

## 3. Verify

- [x] 3.1 Run `pnpm verify`, commit locally.
- [ ] 3.2 Owner check: in the app, applied offers are hidden by default, "Show applied" lists them with their pipeline stage.
