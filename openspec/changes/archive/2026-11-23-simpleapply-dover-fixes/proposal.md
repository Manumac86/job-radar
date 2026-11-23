# Proposal

## Why

SimpleApply lists Dover-hosted jobs with the hiring company's internal id as its name (for example "7c1f9a20 4b3e 4d8a 9F61 2e0b5c7d3a19"). The offer list then shows a meaningless company, hidden-company rules and research cannot match it, and scoring only sees SimpleApply's short summary. The same company also reposts a role with qualifiers in the title ("🌍 Sr. Full-Stack Software Engineer, Remote- Contract" next to "Sr. Full-Stack Software Engineer, Remote"). De-duplication treats them as two roles because "contract" survives title normalization.

## What Changes

- Offers whose job link is a Dover job get the real company name, website and full description from Dover's public job data (one GET per job, no cookies, through the polite fetcher) when the SimpleApply source runs. The CSV import still makes no requests: an unresolved name is shown as unknown until the next run.
- A company name that is only an id (a UUID, with dashes or spaces, or a long hex string) is never shown as a company. When it cannot be resolved, the offer shows "Unknown company".
- An offer already stored with an id as its company name is corrected the next time any source sees it with a real name.
- Title normalization drops trailing qualifier segments that only state work mode or contract type ("- Contract", "| Remote - Full Time", ", Part-time"). Two postings that differ only by those qualifiers become duplicates. Stored normalized titles are recomputed once, so future postings match older ones.

## Capabilities

### New Capabilities

### Modified Capabilities
- `job-ingestion`: "De-duplication" (qualifier-only title differences) and "Normalized offers" (id-like company names are resolved or shown as unknown). Adds "Dover job details", for offers whose link is a Dover job.

## Impact

- `packages/core/src/offers/normalize.ts`: title qualifiers, and a check for id-like company names.
- `packages/sources`: new `dover.ts` (job id from a link, public job lookup); the SimpleApply mapping uses it.
- `apps/worker/src/ingest/pipeline.ts`: a known offer with an id-like company name is corrected; a one-time recompute of `offers.normalized_title`.
- No schema migration. Offers that are already duplicates are not merged: dismiss the extra one by hand.
