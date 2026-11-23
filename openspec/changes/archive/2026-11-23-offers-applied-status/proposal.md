# Proposal

## Why

When an offer is marked as applied, it stays in the offers list with its triage state (new or shortlisted). Offers already in the pipeline therefore mix with the ones still to review, and the table does not say which offers were applied to or where each process stands.

## What Changes

- The offers table gets two columns:
  - **Status**: "Applied" for offers with an application, otherwise the triage state (New, Shortlisted, Dismissed, Filtered or Archived). Each status is a badge with its own color: Applied blue, Shortlisted violet, New cyan, Dismissed muted red, Filtered orange, Archived gray. The label is always written, so color is never the only cue.
  - **Pipeline**: the application's current stage, for example "Technical interview" or "Rejected", including custom stages. It is empty for offers without an application.
- A **"Show applied"** switch next to the filters, off by default:
  - off: offers that have an application are left out of the table, the total and the pagination
  - on: they are listed with the other offers that match the filters
  - the choice is kept in the URL (`applied=1`), like the other filters
- The "Shortlisted" badge under the title is removed, because Status now shows it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `job-dashboard`: the "Offers list" requirement adds the Status and Pipeline columns and the "Show applied" switch, which hides applied offers by default.

## Impact

- `packages/db`:
  - `listOffers` takes `applied: "exclude" | "include"` (default `exclude`).
  - Each row returns the application's stage. A left join to `applications` keeps one query for rows and total.
- `apps/web`:
  - `parseOfferFilters` reads `applied`.
  - `OffersFilters` gets the switch.
  - `OffersTable` gets the Status and Pipeline columns; stage labels come from `listStages`, built-in and custom.
- **Tests:**
  - db query tests
  - filter parsing
  - Playwright: an applied offer is hidden by default and shown with its stage when the switch is on
  - existing UI specs that count rows after "Mark as applied" are updated
- No migration and no worker change.
