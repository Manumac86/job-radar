# Tasks

## 1. Profile and matching

- [x] 1.1 Add `location.hybrid_regions` (default `[]`), `location.preferred_regions` (default `[]`) and `location.preferred_bonus` (integer 0–20, default 5) to the preferences schema, and commented examples to `profile-seed/preferences.yaml`. Verified by schema tests: old profiles load unchanged, and a bonus of 25 is rejected.
- [x] 1.2 `regionMatch(offer, names)` in `packages/core`: whole word, case- and accent-insensitive, on `location` and `regions` only. Verified by unit tests: "Madrid, Spain" matches; "Spainish" does not; "España" matches "espana"; a description mention does not match.

## 2. Pre-filter

- [x] 2.1 In `ingest/pipeline.ts`, let hybrid offers through when `remote_only` is set and `regionMatch` finds a hybrid region; on-site offers are still filtered. Verified by pipeline tests for the "Hybrid role in a hybrid region" and "Hybrid role elsewhere" scenarios.
- [x] 2.2 On profile load, re-apply the hybrid rule to open offers without an application, next to `applyCompanyExclusions`. Verified by worker tests: adding Spain restores a filtered Barcelona hybrid offer and queues it; removing Spain filters it again; an offer filtered by a keyword stays filtered.

## 3. Scoring bonus

- [x] 3.1 `applyRules`: add the preferred-region bonus after the caps (none when capped, at most 100), classify after it, and return `regionBonus` and `preferredRegion`. Add the prompt line from D4. Verified by rules tests for the three "Preferred regions" scenarios and a test that the class changes across a threshold.
- [x] 3.2 Migration `0008`: add `region_bonus` and `preferred_region` to `scores`, and store them from the scoring service. Verified by a db upgrade test from 0007 and a scoring service test.

## 4. Settings and offer page

- [x] 4.1 Preferences form, Location section: "Hybrid regions", "Preferred regions" and "Preferred region bonus". After a save that changes the preferred fields, the confirmation offers "Rescore open offers". Verified by a Playwright test: add Spain in the form, save, and the YAML view shows it.
- [x] 4.2 The offer page score shows "+N preferred region (<region>)", and "Capped from" stays correct. Verified by a Playwright test on a seeded score with a bonus.
- [x] 4.3 README: a short note under preferences. Run `pnpm verify`.

## 5. Owner check

- [x] 5.1 Owner check:
  - set hybrid and preferred regions to Spain (plus the cities you want);
  - save, then rescore;
  - confirm Spanish hybrid offers appear with the "+5 preferred region" label, and that remote US and UK offers are still there.
