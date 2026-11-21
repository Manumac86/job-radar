# Tasks

## 1. Profile: variant files

- [x] 1.1 Variant loading in `packages/core/profile` (design D1):
  - front matter `name` and `use_for`;
  - kebab-case ids, a body of at most 20,000 characters, at most 8 variants;
  - per-file errors that do not invalidate the profile;
  - `variants` and `variantsHash` on the load result;
  - `saveVariant`, `renameVariant` and `deleteVariant` helpers.

  Verified by unit tests: valid load, missing name, empty body, oversize body, a ninth variant rejected, invalid file skipped while the others load, no `cvs/` folder means no variants, and `ensureProfileFiles` never copies variants.
- [x] 1.2 Worker `ProfileService` exposes the variants and records `variantsHash`. Verified by a worker test: after a reload with a new variant file, the profile has it and the hash changes.

## 2. Scoring recommendation

- [x] 2.1 Migration: nullable columns `scores.recommended_cv`, `cv_reason`, `cv_gaps`, `cv_variants_hash`; `drafts.cv_variant`, `cv_variant_name`; `applications.cv_variant`, `cv_variant_name`. Verified by `pnpm --filter @job-radar/db test`, with the migration applied to a fresh database and to a copy of the previous schema.
- [x] 2.2 Scoring prompt and schema (design D2):
  - the optional strict `cv` block, requested only when variants exist;
  - the variants section with 2,500 characters each and 12,000 in total;
  - the master CV stated as the basis for fit;
  - an unknown id drops the block;
  - stored with `cv_variants_hash`.

  Verified by core tests with a fake model:
  - the prompt has no variants section without variants;
  - truncation;
  - an unknown id is dropped;
  - the same fit gives the same overall score and sub-scores with and without variants;
  - the hard cap at 30 is unchanged.
- [x] 2.3 Worker `POST /scoring/refresh-cv` queues shortlisted offers without an application through the scoring queue and returns `{ queued }`. Verified by a route test: only shortlisted offers without an application are queued, and the daily cap leaves the rest "awaiting score".

## 3. Drafts and applications

- [x] 3.1 Draft generation takes `cvVariantId`:
  - it defaults to the recommended variant;
  - the prompt has a "CV to emphasize" section plus the full master CV;
  - the no-fabrication check uses the master CV and the profile;
  - the variant is stored on the draft.

  Verified by core draft tests with a fake model: the default variant, an explicit variant, a fact only in the master CV is allowed, and a fact in neither is flagged.
- [x] 3.2 Applications record the CV sent (design D5):
  - pre-selected from the sent draft's variant, else the recommended one, else master;
  - editable later, with a timeline entry;
  - the response patterns `cv` dimension, with "Unknown" for null.

  Verified by db query tests for the grouping and pre-selection, plus the timeline entry.

## 4. Web UI

- [x] 4.1 Settings → Profile files: the "CV variants" card with add, edit, rename and delete (with confirmation), per-file errors, and "Refresh CV recommendations (N)" when stored scores used another `variantsHash`. Verified by a Playwright test: add a fictional variant, see it listed, rename it, refresh and see the queued count, then delete it.
- [x] 4.2 Offer detail:
  - "Recommended CV: <name>" with the reason and the gaps (labelled "may be missing from this CV");
  - a CV select in the drafts panel;
  - "Written for CV: X" on each draft;
  - a CV select in "Mark as applied" and in the application sheet, shown only when variants exist.

  Verified by Playwright tests on seeded data with a fictional variant and a stored recommendation. A test with no variants sees none of these controls.
- [x] 4.3 Dashboard "What gets responses": the "CV sent" option. Verified by a Playwright test on seeded applications with two variants and one unknown.

## 5. Docs and verify

- [x] 5.1 README: a "CV variants" paragraph (what the recommendation is, that the score is unaffected, and refreshing). Verified by review.
- [x] 5.2 Run `pnpm verify` and commit locally. Verified by the command passing.
- [x] 5.3 Owner check: add your real variants in Settings, refresh recommendations, and check that a leadership offer and an AI engineering offer recommend different variants with sensible gaps; generate a draft and mark one offer as applied with the CV sent.

## Workflow follow-up

- Archive `cv-variants` after the owner check.
