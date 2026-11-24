# Tasks

## 1. Implementation (commit ad978b8)

- [x] 1.1 Tokens, fonts and shared components (sidebar, page header, score badge, table, badge, card). Verified by `pnpm verify` (55 UI tests) and the finish review.
- [x] 1.2 Score as magnitude on list, detail, pipeline and dashboard (D1). Verified by UI tests that read scores, and by review captures.
- [x] 1.3 `skyOffers` query and the "Tonight's sky" chart, plus the figure strip and capacity bar (D2). Verified by `packages/db/test/sky-offers.test.ts` and review captures.
- [x] 1.4 Offers list: density, right-aligned rate, status badges (D4), two-line entries below md (D3). Verified by the status-columns and import UI tests and the mobile capture.
- [x] 1.5 Pipeline contained in the work area; settings save bar opaque. Verified by review captures (verdict: ship).
- [x] 1.6 Bundled fonts (D5): no font service in the build or at runtime. Verified by the `next/font/local` sources and `check:local`.

## 2. Pipeline (owner feedback)

- [x] 2.1 Full-width board with its own horizontal scroll, columns filling the window height with their own vertical scroll, and a pipeline search (company, role, next step; case and accents ignored; Escape clears). Shift + wheel scrolls the board sideways anywhere over it, columns included. The inner page wrapper is no longer a second <main> landmark. Verified by `apps/web/tests/pipeline-search.spec.ts` and a 2560px capture.

## 3. Owner check

- [x] 3.1 Owner check:
  - install the app;
  - triage offers in light and dark;
  - open the dashboard's star field and click a star;
  - move a card on the pipeline;
  - open the offers list in a narrow window.
