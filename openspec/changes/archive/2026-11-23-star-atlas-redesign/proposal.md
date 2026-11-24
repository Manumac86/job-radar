# Proposal

## Why

The web UI was a stock shadcn look (violet accent, pink active nav, colored pill badges, tile metrics) that did not help the owner's daily triage session: scores were hard to compare at a glance, the dashboard led with template tiles, the pipeline overflowed the page and the offers list clipped on narrow screens. The owner asked for a full redesign (impeccable) and chose the "star atlas" direction.

This change records that redesign, already implemented in commit `ad978b8` (code-led, reviewed to "ship"), so the specs match the shipped behavior.

## What Changes

- **New visual system** (documented in `apps/web/DESIGN.md`):
  - light is the "atlas plate", dark the "night chart", with a navy rail in both;
  - one vermilion accent for every live state;
  - Spectral italic for names, Geist with tabular figures for labels and data;
  - hairline rules, no shadows at rest.
- **Score as magnitude:** every score is shown as a dot whose size follows one fixed ramp by class, next to the number, on every screen.
- **Dashboard:**
  - a "Tonight's sky" star field of open offers (age × score, brightest named, shortlisted ringed, each star a link to its offer);
  - a ruled figure strip instead of metric tiles;
  - committed hours as a bar against the weekly capacity.
- **Offers list:**
  - denser rows and a right-aligned rate;
  - below the medium breakpoint, two-line entries instead of a clipped table;
  - status badges keep their label, live states keep their own color, and spent states are quiet and told apart by their mark.
- **Pipeline:** full-width board with its own horizontal scroll, columns that fill the window and scroll vertically on their own, and a search over company, role and next step.
- **Fonts:** the UI fonts are bundled with the app; the UI makes no request to a font service.

## Capabilities

### New Capabilities

### Modified Capabilities
- `job-dashboard`:
  - modifies "Metrics dashboard" (star field, capacity bar), "Offers list" (status badges, narrow screens) and "Pipeline board" (full width, column scroll, search);
  - adds "Score as magnitude".
- `local-operation`: adds "Bundled UI fonts".

## Impact

- `apps/web`:
  - `globals.css` tokens, `layout.tsx` fonts, and the shared components (sidebar, page header, score badge, table, badge, card);
  - the offers table and filters, the dashboard and `_dashboard/sky-chart.tsx`, the pipeline board and drawer, offer detail, the settings save bar.
- `packages/db`: the `skyOffers` query and its test.
- Docs: `apps/web/PRODUCT.md`, `apps/web/DESIGN.md`, `apps/web/.impeccable/` (surface brief and design sidecar).
