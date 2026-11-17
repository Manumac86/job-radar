# Design

## Context

- Marking an offer as applied creates an `applications` row with a `stage`, which is a built-in key or a custom stage key. It does not change `offers.triage`.
- `listOffers` filters on `offers` only, and the web turns URL search params into filters (`parseOfferFilters`).
- Stage labels come from `listStages(db)`, which merges built-in and custom stages.

## Goals / Non-Goals

**Goals:**
- One query for rows and total, so pagination stays correct when applied offers are hidden.
- The switch state lives in the URL, like every other filter, so links and the back button keep it.

**Non-Goals:**
- Sorting by status.
- Changing triage when an offer is applied.
- Filtering by pipeline stage. The pipeline board already groups by stage.

## Decisions

**D1. Left join `applications` in `listOffers`.**
- The query selects `applications.stage` as `applicationStage`, which is null when there is no application.
- With `applied: "exclude"`, a condition `applications.id is null` is added to the WHERE that is shared by the rows and the count.
- Each offer has at most one application, so the join never duplicates rows.

*Alternative:* a `not exists` subquery for the filter, plus a second query for the stages. Rejected: two round trips and the same index use.

**D2. The default is to exclude applied offers, opted out with `applied=1`.**
- Other callers of `listOffers` keep their behavior: the default lives in `parseOfferFilters`, and `listOffers` itself defaults to `include`.
- Only the offers page passes `exclude` when the switch is off.

*Alternative:* the default inside `listOffers`. Rejected: it would change other callers silently.

**D3. Status and Pipeline are two columns, built in the web.**
- Status: "Applied" when `applicationStage` is set, otherwise the triage label from `TRIAGE_LABELS`.
- Pipeline: the stage label from `listStages`, so custom stages show their own label; empty without an application.
- Two columns, per the owner's request: a status column and a separate pipeline column.

**D4. Status colors are their own theme tokens.**
- Tokens `--status-applied` (blue), `--status-shortlisted` (violet), `--status-new` (cyan), `--status-dismissed` (muted red), `--status-filtered` (orange) and `--status-archived` (gray) live in `globals.css`, with a dark-mode value each.
- The badge is a tinted background (about 15%) with a border and text in the same hue. The text is checked for at least 4.5:1 contrast on the card background in both modes.
- The label is always shown, so color is never the only cue.

*Alternative:* reuse the score colors (`strong`/`possible`/`weak`). Rejected: a green "Shortlisted" would read as a strong score next to the score badge.

## Risks / Trade-offs

- [The owner may not notice that applied offers are hidden] → The switch sits with the filters. When it is off and hidden applied offers match, the header says "N offers match these filters (M applied hidden)".
