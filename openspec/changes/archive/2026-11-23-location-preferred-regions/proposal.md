# Proposal

## Why

The owner wants to keep seeing remote roles from anywhere (US, UK, Europe) while giving more weight to roles in Spain, remote or hybrid. Today `location.remote_only: true` drops every hybrid offer before scoring, Spain included. Turning it off lets hybrid and on-site offers from every country through, and those all cost scoring calls. A learned "Prefer Spain" preference is only a hint the model may ignore.

## What Changes

- New `location.hybrid_regions`: while the profile is remote-only, hybrid offers located in one of these regions pass the pre-filter instead of being filtered. On-site offers are still filtered. When the list changes, open hybrid offers are filtered or restored to match, like hidden companies.
- New `location.preferred_regions` and `location.preferred_bonus` (default 5, 0–20): offers located in, or open to, one of these regions get a fixed bonus on the overall score after the model, and the model is told to rate location higher for them. Hard eligibility caps still win. The offer shows why it got the bonus.
- Regions match as whole words in the offer's location and regions, ignoring case. The owner lists the names to match (for example Spain, España, Madrid, Barcelona).
- Both lists default to empty, so profiles without them behave as before. `remote_only` and `accepted_regions` keep their meaning.
- The Settings → Profile form shows the new fields under Location, and the YAML view accepts them.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `job-ingestion`: the keyword pre-filter lets hybrid offers in the owner's hybrid regions through while the profile is remote-only, and re-applies the rule to open offers when the list changes.
- `job-scoring`: a preferred-region bonus on the overall score, applied after the model and below the hard eligibility caps.

## Impact

- `packages/core`: profile schema (`location.hybrid_regions`, `preferred_regions`, `preferred_bonus`), a region matcher, `applyRules` (bonus), scoring prompt rule.
- `apps/worker`: pre-filter in `ingest/pipeline.ts`, profile reload re-filter or restore (next to `applyCompanyExclusions`), score storage of the bonus.
- `apps/web`: Location section of the preferences form; the score breakdown on the offer page shows the bonus.
- `profile-seed/preferences.yaml`: the new fields, commented, with empty lists.
- `packages/db`: a migration adding the bonus and the matched region to stored scores (design D3).
