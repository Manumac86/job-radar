## MODIFIED Requirements

### Requirement: De-duplication
The system SHALL treat offers as duplicates when they share source and external id, or when company and normalized title match within 14 days across sources, keeping one offer and linking all its source URLs. Title normalization SHALL ignore trailing qualifiers that only state work mode or contract type, such as "Remote", "Contract" or "Full Time".

#### Scenario: Same role on two boards
- **WHEN** the same role at the same company arrives from an ATS board and a job-alert email
- **THEN** one offer exists with both source links

#### Scenario: Same role reposted with qualifiers
- **WHEN** a company has the open offer "Sr. Full-Stack Software Engineer, Remote" and, within 14 days, posts "🌍 Sr. Full-Stack Software Engineer, Remote- Contract"
- **THEN** no second offer is created and the new posting's link is added to the existing offer

#### Scenario: A qualifier word inside the title is kept
- **WHEN** offers "Contract Manager" and "Manager" arrive from the same company
- **THEN** they stay two offers

### Requirement: Normalized offers
The system SHALL store every offer in one normalized shape: source, source URL, external id, title, company, company website, location and remote policy, accepted time zones or regions, engagement type, compensation (min, max, currency, period) when stated, posted date, description, required skills, application method and the raw payload. A company name that is only an identifier SHALL never be stored as the company: it is resolved from the job's source, or shown as "Unknown company".

#### Scenario: Missing compensation
- **WHEN** a source does not state compensation
- **THEN** compensation fields are empty and the offer is marked "rate unknown", never estimated as fact

#### Scenario: Company name that is an id
- **WHEN** a source gives the company "7c1f9a20 4b3e 4d8a 9F61 2e0b5c7d3a19" and the name cannot be resolved
- **THEN** the offer shows "Unknown company", and hidden-company rules and company research do not use the id

#### Scenario: Stored id corrected later
- **WHEN** an offer was stored with an id as its company and a later run sees the same job with the real name
- **THEN** the offer shows the real company name

## ADDED Requirements

### Requirement: Dover job details
When the SimpleApply source runs, for an offer whose job link is a Dover job (`jobs.dover.com`), the system SHALL read Dover's public job data and use its company name, company website and full description. The lookup SHALL be one GET per new job through the polite fetcher, with no cookies and outside the browser profile, and SHALL never contact SimpleApply. When it fails, the offer is stored with what the source gave.

#### Scenario: SimpleApply match hosted on Dover
- **WHEN** a SimpleApply match links to a Dover job of Contoso Staffing
- **THEN** the offer shows "Contoso Staffing", its website, and the full Dover description, which is what gets scored

#### Scenario: Dover unavailable
- **WHEN** Dover's job data does not answer
- **THEN** the offer is stored with SimpleApply's summary and "Unknown company", and the run does not fail
