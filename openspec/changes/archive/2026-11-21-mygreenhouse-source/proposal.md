# Proposal

## Why

Many companies the owner applies to hire through Greenhouse. MyGreenhouse (my.greenhouse.io) is
Greenhouse's candidate portal, where the owner is logged in. It offers:

- a job search across every participating employer;
- roles recommended for the owner;
- the status of every application sent through Greenhouse.

Job Radar polls only the Greenhouse boards listed in `companies.yaml`. The recommendations, the
cross-employer search and the application statuses never reach it.

## What Changes

- **New logged-in source "MyGreenhouse (logged-in)".**
  - It is disabled by default and shows a risk notice. Each run reads with the usual page cap and
    pauses; the default interval is 12 hours.
  - The owner logs in once in the isolated browser profile. MyGreenhouse sends a one-time code by
    email, which the owner types there. Job Radar never sees or stores the code.
  - Job Radar never clicks Apply, Quick apply, Dream job, Save, Withdraw or any other action.
- **Offers from search and recommendations:**
  - the job search runs once for each of the owner's search keywords;
  - "recommended for you" roles are read too.
  - Both become normalized offers from the `mygreenhouse` source, with the Greenhouse board and job
    id. They then go through the usual de-duplication, pre-filter and scoring.
- **Application statuses feed the pipeline:**
  - each application listed in MyGreenhouse is matched to a Job Radar application, by Greenhouse
    job id, offer link, or company and title;
  - **new application:** when an application has no match, one is created on its submitted date
    ("Applied through Greenhouse");
  - **status change:** it moves the application with the same rules as email replies, forward
    only or to Rejected, never to Accepted, Declined or Withdrawn, with Undo. Unclear statuses
    become suggestions;
  - Telegram alerts go out for rejections, interviews and offers. An update already made from an
    email is not repeated.
- **Discovery first.** The page structure (URLs, the JSON the page loads, status names) is
  captured read-only after the owner logs in, before the parsers are written.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `job-ingestion`: adds the MyGreenhouse logged-in source (job search and recommendations).
- `application-pipeline`:
  - adds status updates from MyGreenhouse;
  - the Timeline marks changes made from MyGreenhouse.
- `notifications`: Telegram alerts cover rejections, interviews and offers found in MyGreenhouse.

## Impact

- **`packages/sources`:**
  - `adapters/mygreenhouse.ts`: site definition, job and recommendation mapping, application
    status reader;
  - `browser/guard.ts`: forbidden labels gain "quick apply", "dream job" and "withdraw";
  - registry.
- **`packages/core`:** the status-to-stage mapping, reusing the email `decide` policy.
- **`packages/db`:**
  - `stage_transitions.source` gains `greenhouse`;
  - new table `portal_applications` (last status seen per Greenhouse application, linked
    application, pending suggestion and undo record);
  - new notification kinds;
  - migration.
- **`apps/worker`:**
  - a service that applies status updates with undo;
  - routes for undo, apply and dismiss;
  - Telegram buttons.
- **`apps/web`:**
  - Sources and Settings → Sessions list MyGreenhouse with its notice;
  - the pipeline sheet and timeline show Greenhouse status entries with Undo;
  - suggestions join the "From email" card, renamed "Updates to review".
- **Fixtures** are captured from the owner's account and anonymized before commit.
