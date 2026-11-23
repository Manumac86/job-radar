# Design

## Context

The SimpleApply mapping (`mapSimpleApplyMatch`) takes the company from the dashboard's `company_name` or the CSV "Company" column. For Dover jobs it is the Dover client id, "humanized" with spaces. Dover's careers page is a single-page app, but the page loads `https://app.dover.com/api/v1/inbound/application-portal-job/<job id>`. That endpoint is public and returns `client_name`, `client_domain`, `title`, `user_provided_description` (HTML) and `workplace_type`. The job id is the UUID in the job link (`jobs.dover.com/company/<id>` or `jobs.dover.com/apply/<slug>/<id>`).

De-duplication matches company id plus `normalizeTitle`. `normalizeTitle` already drops "remote" and region words anywhere, but keeps "contract", "full time" and the like.

## Goals / Non-Goals

**Goals:** correct company and description for Dover jobs; no id ever shown as a company; qualifier-only title variants merge.

**Non-Goals:** merging offers that are already duplicates; Dover as a source of its own; looking up other hosts.

## Decisions

**D1. Dover lookup in the sources package, called by the worker runner.** `doverJobId(url)`, `fetchDoverJob(fetcher, id)` and `enrichDoverOffers(offers, fetcher, needsLookup, log)` live in `packages/sources/src/dover.ts`. The runner calls it for the SimpleApply source, after the adapter and before ingest, with the run's polite fetcher. The CSV import does not call it: its spec says it makes no request to the job links. It handles only offers with a Dover link that need it: not yet stored, or stored with an id-like or unknown company. A run therefore does not refetch hundreds of known jobs, and the offers already stored with an id are fixed on the next run. It runs at most 50 lookups per run; others keep SimpleApply's data until the next run. The function takes a `needsLookup(externalId)` callback so it stays free of database code.
- *Alternative:* inside the adapter. Rejected: the adapter has no database to decide what needs a lookup.
- *Alternative:* resolve in the worker pipeline for any source. Rejected: only Dover is known to need it, and the pipeline should not make network calls.

**D2. Id-like names.** `isIdLikeCompany(name)` is true for a UUID with dashes or spaces (in any case), or a run of 16 or more hex characters with nothing else. `normalizeCompany` stays as it is. The mapping replaces an id-like name with "Unknown company" when no lookup resolved it. The worker never adds "Unknown company" to the hidden-company match, and research is refused for it. This uses the existing "Unknown company" label.

**D3. Correcting a stored offer.** In the pipeline's "already known" branch, when the stored `companyName` is id-like or "Unknown company" and the incoming one is a real name, the offer's company, company id and website are updated, and the description too if the stored one is SimpleApply's summary. Nothing else on the offer changes, and its score is not touched. The owner can rescore.

**D4. Title qualifiers.** After lower-casing and before the existing replacements, the title is split into segments on separators that are not inside a word: " - ", "- ", " –", "|", ",", "/", "·", ":". Trailing segments are dropped while every word in them is a qualifier: remote, hybrid, onsite, on site, contract, contractor, freelance, full time, full-time, part time, part-time, permanent, temporary, temp, international, global, worldwide, anywhere, and the existing region words. Emojis already drop out as non-alphanumeric. The first segment is always kept, so "Contract Manager" stays.

**D5. Recompute once.** A setting `title_normalizer_version` (stored with the existing settings helpers) is compared to a constant on worker start. When it differs, `normalized_title` is recomputed for every offer in one transaction (a few thousand rows), and the setting is updated. Existing duplicate pairs stay; only new postings merge.

## Risks / Trade-offs

- [Dover changes or closes the endpoint] → the lookup fails softly (spec scenario), and a fixture test pins the shape.
- [Merging postings that really differ only in contract type] → engagement type stays on the kept offer, and the other link stays visible under its source links. This is acceptable for a personal radar.
- [Network call during a logged-in run] → it is a public API on another host, made by the worker's fetcher, never through the browser profile, so SimpleApply sees nothing.
