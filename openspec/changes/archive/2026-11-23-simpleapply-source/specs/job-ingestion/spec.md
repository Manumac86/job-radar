# Spec Delta

## MODIFIED Requirements

### Requirement: Configurable sources
The system SHALL support a registry of sources, each with a type, an enabled flag, a polling interval and source-specific settings. Supported types in this change: public ATS job boards (Greenhouse, Lever, Ashby) for a configured list of companies, the Y Combinator startup jobs board (Work at a Startup), the Hacker News "Who is hiring" monthly thread, public remote-job feeds (RSS or JSON), job-alert emails read from a dedicated mailbox label, logged-in site adapters (see browser-sessions), and SimpleApply (CSV import and a logged-in adapter).

#### Scenario: Disable a source
- **WHEN** the owner disables a source in Settings
- **THEN** no further runs of that source happen and its existing offers remain visible

## ADDED Requirements

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
