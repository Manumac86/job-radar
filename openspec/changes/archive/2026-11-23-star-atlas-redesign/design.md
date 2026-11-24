# Design

## Context

The visual system is recorded in `apps/web/DESIGN.md`, with tokens in `.impeccable/design.json`, and the direction in `apps/web/.impeccable/surfaces/src-app.md`. This change only records the behavior-level decisions. See proposal.md for motivation.

## Decisions

**D1. One encoding for score class.** Score class is the dot's size on a fixed 12/8/4px ramp (an 8px dashed circle when unscored). The number carries the score. Colour stays ink, so the one vermilion accent stays free for live state (selection, shortlisted ring, primary action).

**D2. Star field data.** `skyOffers(db, { days, now })` returns open offers: new or shortlisted, no application, scored, first seen within the period. It caps the list at 400. The chart's time axis spans the offers actually charted, at least 7 days and at most the period, so the stars spread out. Each star is an SVG link to its offer, with a 12px hit target and a native tooltip.

**D3. Narrow offers list.** Below the `md` breakpoint the table is hidden and an ordered list of two-line entries is shown. Role-based queries ignore the hidden copy. One UI test switched from `getByText` to `getByRole("link")` for that reason.

**D4. Status badges.** Live states keep a tinted colour: applied amber, shortlisted blue, new outlined in ink. Spent states use one quiet grey, told apart by their mark: dismissed is struck through, filtered has a dashed border, archived is plain. This supersedes the earlier "each status its own color" rule (see the modified requirement).

**D5. Fonts.** Geist (variable) and Spectral (300/400, italic and roman) are self-hosted under `src/app/fonts` and loaded with `next/font/local`.
