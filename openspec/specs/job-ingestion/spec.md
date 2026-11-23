# job-ingestion Specification

## Purpose
Collects remote job offers and freelance projects from configured sources, normalizes and deduplicates them, filters them by keywords, remote policy and hidden companies, and imports offers from a link.

## Requirements

### Requirement: Configurable sources
The system SHALL support a registry of sources, each with a type, an enabled flag, a polling interval and source-specific settings. Supported types in this change: public ATS job boards (Greenhouse, Lever, Ashby) for a configured list of companies, the Y Combinator startup jobs board (Work at a Startup), the Hacker News "Who is hiring" monthly thread, public remote-job feeds (RSS or JSON), job-alert emails read from a dedicated mailbox label, logged-in site adapters (see browser-sessions), and SimpleApply (CSV import and a logged-in adapter).

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
The system SHALL discard offers before any LLM call, recording them as "filtered" with the reason, when they match an exclude keyword (an exclude keyword written as "title:<word>" matches the title only), match none of the include keywords, have a title that contains none of the optional title keywords (role gate), or are on-site or hybrid while the profile is remote-only. A hybrid offer located in one of the owner's hybrid regions SHALL pass.

#### Scenario: Excluded offer
- **WHEN** an offer's title or description matches an exclude keyword
- **THEN** it is stored as filtered with the matched keyword and is not scored

#### Scenario: Title-only exclusion
- **WHEN** a senior offer's description mentions mentoring junior engineers and the exclude list has "title:junior"
- **THEN** the offer is not filtered

#### Scenario: Non-engineering role
- **WHEN** an offer titled "Enterprise Account Executive" mentions AI in its description and the title keywords are set
- **THEN** it is stored as filtered with the reason "Title is not a target role"

#### Scenario: Hybrid role in a hybrid region
- **WHEN** the profile is remote-only with hybrid regions [Spain, Madrid] and a hybrid offer is located in "Madrid, Spain"
- **THEN** the offer is not filtered and is scored

#### Scenario: Hybrid role elsewhere
- **WHEN** the same profile receives a hybrid offer located in "Berlin, Germany", or an on-site offer in Madrid
- **THEN** it is stored as filtered with the reason "Not remote (hybrid)" or "Not remote (onsite)"

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

### Requirement: MyGreenhouse logged-in source
The system SHALL offer a "MyGreenhouse (logged-in)" source, disabled by default, that reads my.greenhouse.io with the owner's session from the isolated browser profile. Each run SHALL read the job search for each of the owner's search keywords and the roles recommended to the owner, and store them as normalized offers that keep the Greenhouse board and job id.

#### Scenario: Recommended role imported
- **WHEN** MyGreenhouse recommends a remote Staff Engineer role at Northwind
- **THEN** a run stores it as an offer from the MyGreenhouse source with its Greenhouse job link, and it is scored like any other offer

#### Scenario: Same job from a polled board
- **WHEN** the same Greenhouse job is already known from Northwind's board in companies.yaml
- **THEN** the MyGreenhouse run does not create a second offer

#### Scenario: Logged out
- **WHEN** a run lands on the MyGreenhouse sign-in page
- **THEN** the source is marked "session expired" and the owner is notified to log in again

### Requirement: MyGreenhouse stays read-only
The MyGreenhouse source SHALL follow the read-only, paced browsing rules of browser-sessions and SHALL NOT click apply, quick apply, dream job, save or withdraw controls. The owner SHALL log in by hand, including the emailed one-time code, which the system never sees or stores.

#### Scenario: Quick apply button on a card
- **WHEN** a recommended role shows a "Quick apply" button
- **THEN** the run reads the card without clicking it, and any attempt to click it is blocked by the guard

### Requirement: Job-alert emails from email accounts
The job-alert source SHALL read every enabled email account that has job alerts turned on, using that account's saved app password. In the account's alert folders it SHALL parse every message, falling back to model extraction for unknown senders or layouts. In INBOX, when the account asks for it, it SHALL parse only messages from known job-alert senders (LinkedIn, Upwork, Malt, Wellfound, Greenhouse) and SHALL NOT send any INBOX message to the model.

#### Scenario: Alerts in two mailboxes
- **WHEN** a LinkedIn alert arrives in the Gmail `job-alerts` label and a Greenhouse alert arrives in the iCloud INBOX, and both accounts have job alerts on (iCloud with "Also look in INBOX")
- **THEN** one run imports the offers from both emails and both messages stay unread

#### Scenario: Personal email in INBOX
- **WHEN** an INBOX message comes from a sender that is not a known job-alert sender
- **THEN** it is not parsed, not stored and not sent to the model

#### Scenario: The same alert in two mailboxes
- **WHEN** the same alert is forwarded to two accounts
- **THEN** its offers are imported once

#### Scenario: One account fails
- **WHEN** one account rejects the login during a run
- **THEN** the other accounts are still read and the run records an error naming the failed account

#### Scenario: Existing setup is kept
- **WHEN** the app starts with the old single-mailbox settings and `secrets/imap_app_password`
- **THEN** the email account with that address has job alerts on with that label as an alert folder (created from those settings if it did not exist), and the next run reads it without the owner re-entering anything

### Requirement: Read-only incremental alert reading
The job-alert source SHALL open folders read-only and never mark, move or delete mail. It SHALL read each account and folder incrementally, independently of the reply reader, starting the first time from the source's look-back window.

#### Scenario: Second run reads only new mail
- **WHEN** a run has read an alert folder and no new message has arrived since
- **THEN** the next run fetches no message from that folder

#### Scenario: Replies and alerts share INBOX
- **WHEN** an account reads INBOX both for replies and for alerts
- **THEN** each reader keeps its own position, so reading one never makes the other skip messages

### Requirement: Hybrid regions applied to open offers
The system SHALL re-apply the hybrid-region rule to open offers without an application when the owner's hybrid regions change: hybrid offers filtered only for not being remote that now match SHALL return to "new" and be queued for scoring, and hybrid offers that no longer match SHALL be filtered again.

#### Scenario: Add Spain to hybrid regions
- **WHEN** the owner adds "Spain" to hybrid regions and saves, and a hybrid offer in Barcelona, Spain was filtered as "Not remote (hybrid)"
- **THEN** the offer returns to "new" and is scored

#### Scenario: Remove Spain again
- **WHEN** the owner removes "Spain" and the Barcelona offer has no application
- **THEN** it is filtered again with the reason "Not remote (hybrid)"

### Requirement: SimpleApply CSV import
The owner SHALL be able to upload a SimpleApply "Export CSV" file in Offers → Import. Each row SHALL become a normalized offer of the SimpleApply source, with the CSV's Job URL as its link and the requirements summary as its description. Rows SHALL go through de-duplication, the keyword pre-filter and scoring like any polled offer. The file SHALL be read locally; no request is made to SimpleApply or to the job links.

#### Scenario: Import an export
- **WHEN** the owner uploads an export with 70 rows of which 5 are already known and 10 fail the pre-filter
- **THEN** 55 new offers are stored and queued for scoring, and the result shows 55 new, 5 already known, 10 filtered and 0 invalid

#### Scenario: Same role from an ATS board
- **WHEN** a row's company and title match an offer Job Radar already has from a Greenhouse or Ashby board within the de-duplication window
- **THEN** no duplicate is created and the SimpleApply link is added to the existing offer

#### Scenario: Re-importing the same file
- **WHEN** the owner uploads the same export twice
- **THEN** the second import creates no new offers

#### Scenario: Not a SimpleApply export
- **WHEN** the uploaded file lacks the Job Title, Company or Job URL columns, or is larger than 5 MB
- **THEN** nothing is imported and the dialog says which columns are missing or that the file is too large

#### Scenario: Invalid row
- **WHEN** a row has no title, no company, or a Job URL that is not an http(s) link
- **THEN** that row is skipped and counted as invalid, and the other rows are imported

### Requirement: SimpleApply match data is not a score
The system SHALL keep SimpleApply's match percentage and its status fields as source metadata only. They MUST NOT replace or influence Job Radar's own score.

#### Scenario: High SimpleApply match
- **WHEN** a row says "95%" match
- **THEN** the offer shows "SimpleApply match 95%" in its details and is scored by Job Radar as usual

### Requirement: Applications recorded by SimpleApply
When a SimpleApply row or match reports that the job was applied (a Date Applied, or an applied or interview status), the system SHALL record an application in "Applied" on that date, noted as applied through SimpleApply, unless the offer already has an application.

#### Scenario: Applied row
- **WHEN** a row has Date Applied 2026-11-10
- **THEN** the offer has an application in "Applied" dated 2026-11-10 with the note "Applied through SimpleApply"

#### Scenario: Already tracked
- **WHEN** the offer already has an application
- **THEN** no second application is created and the existing one is unchanged

### Requirement: SimpleApply logged-in source
The system SHALL provide a "SimpleApply (logged-in)" source that reads the owner's not-yet-applied job matches from the SimpleApply dashboard through the isolated browser profile, following every browser-sessions requirement. It SHALL be disabled by default, poll every 12 hours by default, and produce the same offers as the CSV import of the same matches.

#### Scenario: Run with a valid session
- **WHEN** the source runs and the owner is logged in
- **THEN** the dashboard's current matches are stored as offers with their original job links, de-duplicated against earlier CSV imports and other sources

#### Scenario: Session expired
- **WHEN** the dashboard redirects to SimpleApply's login page or its job data answers "Unauthorized"
- **THEN** the source is marked "session expired", the owner is notified, and nothing is stored

#### Scenario: Never acts on SimpleApply
- **WHEN** the source runs
- **THEN** no control on the page is clicked (including "Simple Apply", "Applied", "not interested", "Unlock" and the Full Auto Apply switch), no form is filled and no request is sent by Job Radar other than loading the dashboard
