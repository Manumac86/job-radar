# Spec Delta

## ADDED Requirements

### Requirement: CV sent with an application
When CV variants exist, an application SHALL record which CV was sent: a variant or the master CV. "Mark as applied" SHALL pre-select the variant of the sent draft, else the recommended variant, and the owner SHALL be able to change it later from the application.

#### Scenario: Pre-selected on apply
- **WHEN** the owner marks an offer as applied whose sent draft was written for "Tech Lead"
- **THEN** the application records "Tech Lead" as the CV sent

#### Scenario: Changed afterwards
- **WHEN** the owner opens the application and changes the CV sent to "Master CV"
- **THEN** the application records the master CV and the timeline notes the change

#### Scenario: Applications created before variants
- **WHEN** an application was created before any variant existed
- **THEN** it shows no CV sent and is grouped as "Unknown" in response patterns

## MODIFIED Requirements

### Requirement: Response patterns
The dashboard SHALL show, across all applications, the response rate and the number reaching an interview grouped by source, engagement type, score band, time from posting to applying, whether a Job Radar draft was sent, and CV sent, noting when there are fewer than 15 applications.

#### Scenario: Comparing sources
- **WHEN** the owner opens "What gets responses" and picks "Source"
- **THEN** each source shows applications, replies, interviews and response rate, highest rate first

#### Scenario: Comparing CV variants
- **WHEN** the owner opens "What gets responses" and picks "CV sent"
- **THEN** each variant, the master CV and "Unknown" show applications, replies, interviews and response rate, highest rate first
