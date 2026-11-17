# job-ingestion Specification

## Purpose
Collects remote job offers and freelance projects from configured sources, normalizes and deduplicates them, filters them by keywords, remote policy and hidden companies, and imports offers from a link.

## Requirements

### Requirement: Configurable sources
The system SHALL support a registry of sources, each with a type, an enabled flag, a polling interval and source-specific settings. Supported types in this change: public ATS job boards (Greenhouse, Lever, Ashby) for a configured list of companies, the Y Combinator startup jobs board (Work at a Startup), the Hacker News "Who is hiring" monthly thread, public remote-job feeds (RSS or JSON), job-alert emails read from a dedicated mailbox label, and logged-in site adapters (see browser-sessions).

#### Scenario: Disable a source
- **WHEN** the owner disables a source in Settings
- **THEN** no further runs of that source happen and its existing offers remain visible

### Requirement: Scheduled polling
The system SHALL poll each enabled source at its interval, at most one concurrent run per source, and record every run with start time, end time, offers found, offers new and errors.

#### Scenario: Run history
- **WHEN** a source run finishes
- **THEN** the run appears in the source's run log with its counts and any error message

#### Scenario: Manual run
- **WHEN** the owner clicks "Run now" on a source
- **THEN** a run starts immediately unless one is already in progress, in which case the UI says so

### Requirement: Normalized offers
The system SHALL store every offer in one normalized shape: source, source URL, external id, title, company, company website, location and remote policy, accepted time zones or regions, engagement type, compensation (min, max, currency, period) when stated, posted date, description, required skills, application method and the raw payload.

#### Scenario: Missing compensation
- **WHEN** a source does not state compensation
- **THEN** compensation fields are empty and the offer is marked "rate unknown", never estimated as fact

### Requirement: Y Combinator startup jobs
The system SHALL ingest open roles from Y Combinator's public jobs board, without logging in, for the roles and title keywords configured in the preferences (defaults include engineering, AI/ML, engineering manager, CTO and Head of Engineering). Each offer SHALL also keep the YC batch, company one-liner, team size, equity range and visa or location terms when shown.

#### Scenario: Remote YC role open to Europe
- **WHEN** a YC company posts a remote full-stack role open to Europe
- **THEN** the offer is stored with its batch, salary and equity ranges, and is scored like any other offer

#### Scenario: US-only remote YC role
- **WHEN** a YC role is marked "Remote (US)" or requires US work authorization
- **THEN** the location terms are stored as stated so that scoring applies the eligibility cap

### Requirement: De-duplication
The system SHALL treat offers as duplicates when they share source and external id, or when company and normalized title match within 14 days across sources, keeping one offer and linking all its source URLs.

#### Scenario: Same role on two boards
- **WHEN** the same role at the same company arrives from an ATS board and a job-alert email
- **THEN** one offer exists with both source links

### Requirement: Keyword pre-filter
The system SHALL discard offers before any LLM call, recording them as "filtered" with the reason, when they match an exclude keyword (an exclude keyword written as "title:<word>" matches the title only), match none of the include keywords, have a title that contains none of the optional title keywords (role gate), or are on-site or hybrid while the profile is remote-only.

#### Scenario: Excluded offer
- **WHEN** an offer's title or description matches an exclude keyword
- **THEN** it is stored as filtered with the matched keyword and is not scored

#### Scenario: Title-only exclusion
- **WHEN** a senior offer's description mentions mentoring junior engineers and the exclude list has "title:junior"
- **THEN** the offer is not filtered

#### Scenario: Non-engineering role
- **WHEN** an offer titled "Enterprise Account Executive" mentions AI in its description and the title keywords are set
- **THEN** it is stored as filtered with the reason "Title is not a target role"

### Requirement: Hidden companies
The system SHALL let the owner hide companies through a `keywords.exclude_companies` list in preferences, editable in Settings and extended by a "Hide company" action on an offer. A company matches as whole words, ignoring case. Offers from a hidden company SHALL be stored as filtered before any LLM call; when the list changes, open offers without an application SHALL be filtered or restored to match it.

#### Scenario: Hide a company from an offer
- **WHEN** the owner clicks "Hide company" on an offer from Crossover
- **THEN** "Crossover" is added to the list and every open Crossover offer is filtered with the reason "Excluded company \"Crossover\""

#### Scenario: Show a company again
- **WHEN** the owner removes a company from the list in Settings
- **THEN** its offers filtered only for that reason return to "new", and never-scored ones are queued for scoring

#### Scenario: Applied offers are kept
- **WHEN** a company is hidden and one of its offers already has an application
- **THEN** that offer stays in the pipeline unchanged

### Requirement: Polite fetching
The system SHALL identify public HTTP requests with a descriptive user agent, respect per-source minimum intervals, back off exponentially on HTTP 429 or 5xx, and stop a source for the day after 5 consecutive failures.

#### Scenario: Rate limited
- **WHEN** a source returns HTTP 429
- **THEN** the run retries later with backoff and the run log records the rate limit

### Requirement: Manual import from a link
The owner SHALL be able to add an offer by pasting its link (Offers → "Add from link"), optionally marking it as already applied with a date. The system SHALL make one read-only request without login or cookies: LinkedIn's public job page for LinkedIn links, otherwise the page itself, read through schema.org JobPosting data or, failing that, Claude on the page text. When the page cannot be read, the owner MAY paste the offer text instead. Local and private network links SHALL be refused.

#### Scenario: LinkedIn offer applied elsewhere
- **WHEN** the owner pastes a linkedin.com/jobs/view link and keeps "I already applied" checked
- **THEN** the offer is stored with its title, company, location, criteria and description, queued for scoring, and an application in "Applied" is created on that date

#### Scenario: Offer already known
- **WHEN** the link points to an offer Job Radar already has from any source (for example a LinkedIn alert email)
- **THEN** no duplicate is created; the existing offer is used and brought back if it was filtered or dismissed

#### Scenario: Owner's choice skips the pre-filter
- **WHEN** an imported offer would fail the keyword or remote pre-filter
- **THEN** it is still stored as new and scored, because the owner chose it
