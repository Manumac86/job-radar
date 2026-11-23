# Design

## Context

- `location` in preferences has `remote_only`, `accepted_regions` and `max_overlap_required` (`packages/core/src/profile/schema.ts`).
- The remote-only check is in `apps/worker/src/ingest/pipeline.ts` step 3. When `remote_only` is set, it filters every `onsite` or `hybrid` offer with the reason `Not remote (<policy>)`. `unknown` passes.
- Offers carry `location` (free text) and `regions[]` from the source.
- Scoring:
  - The model gets the whole `location` block (`profileForPrompt`).
  - `applyRules` (`packages/core/src/scoring/rules.ts`) then applies the deterministic caps and stores `overall` and `modelOverall`.
  - The offer page shows "Capped from N" when the two differ.
- Hidden companies already re-filter or restore open offers on every profile load (`applyCompanyExclusions` in `apps/worker/src/profile-service.ts`).

## Goals / Non-Goals

**Goals:**
- Hybrid offers in chosen regions reach scoring without letting hybrid or on-site offers from everywhere through.
- A fixed, visible bonus for preferred regions that the model cannot skip.
- No change for profiles that do not set the new fields.

**Non-Goals:**
- On-site offers in a preferred region. They stay filtered while `remote_only` is set.
- Geocoding or a country database. The owner lists the names to match.
- A penalty for other regions. Eligibility caps and learned "avoid" preferences already cover that.

## Decisions

### D1. Owner-listed names, matched as whole words

`regionMatch(offer, names)` returns the first name found as a whole word, ignoring case and accents, in `offer.location` or any of `offer.regions`.
- The owner writes the names to match: Spain, España, Madrid, Barcelona.
- This uses the same matching style as `exclude_companies`.
- Alternative considered: reuse `COUNTRY_ALIASES` in `rules.ts`. It covers only US, UK, Canada and EU, and cities would need a gazetteer. Rejected for now. Explicit names are predictable and easy to test.

### D2. `hybrid_regions` only relaxes the remote-only filter

- Hybrid offers whose location matches pass. Everything else is unchanged.
- With `remote_only: false` the list has no effect, because hybrid offers already pass.
- On every profile load, a pass next to `applyCompanyExclusions` handles open offers without an application:
  - offers filtered exactly as `Not remote (hybrid)` that now match return to `new` and are queued for scoring;
  - unfiltered hybrid offers that no longer match are filtered again.
- Offers filtered for another reason are never touched.
- Alternative considered: change `remote_only` into an enum. Rejected because it would break existing profiles and the form.

### D3. Bonus applied in `applyRules`, stored as columns

- Inputs: `preferred_regions` (default `[]`) and `preferred_bonus` (integer 0–20, default 5).
- In `applyRules`, after the caps: when the offer is not capped and `regionMatch` finds a preferred region, `overall = min(100, overall + bonus)`. The class is computed after the bonus.
- `FinalScore` gains `regionBonus` and `preferredRegion`.
- Migration `0008` adds `region_bonus` (integer, default 0) and `preferred_region` (nullable text) to `scores`.
  - Old scores read as no bonus.
  - "Capped from" stays correct because it checks `capped` or the stored cap, not `overall !== modelOverall`.
- The offer page shows "+N preferred region (Spain)".
- Alternative considered: add the bonus only through the prompt. Rejected because the model may ignore it, which is the problem the owner described.
- Alternative considered: hide the bonus in `modelOverall`. Rejected because the history must show what the model said.

### D4. A prompt rule as well

The scoring system prompt gets one line: offers in `preferred_regions` (remote or hybrid) should get a higher location sub-score.
- The location sub-score then reflects it too.
- The overall bonus stays deterministic, so it does not depend on the model.

### D5. Form and seed

- The Location section adds "Hybrid regions" and "Preferred regions" as tag lists, and "Preferred region bonus" as a number from 0 to 20.
- The YAML keeps the existing formatting rules.
- The seed profile gets commented examples with empty lists.
- After a save that changes `preferred_regions` or `preferred_bonus`, Settings shows the existing "Rescore open offers" action in its confirmation message.

## Risks / Trade-offs

- **Ambiguous names:** a name like "Spain" could appear in an unrelated region string. Whole-word matching on location and regions only, never the description, keeps this rare.
- **Score inflation:** the bonus moves offers across the strong or possible thresholds. The cap at 20, the visible label and the rule that capped offers get none limit the effect.
- **More scoring calls:** each hybrid offer in a hybrid region now costs one. The owner picks the regions, and the daily scoring cap still applies.
