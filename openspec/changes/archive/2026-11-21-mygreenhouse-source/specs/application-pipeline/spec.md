## ADDED Requirements

### Requirement: Status updates from MyGreenhouse
The system SHALL read the status of the owner's applications listed in MyGreenhouse and match each to a Job Radar application by Greenhouse job, offer link, or company and title. An application with no match SHALL be created on its submitted date, and an ambiguous match SHALL become a suggestion.

#### Scenario: Applied outside Job Radar
- **WHEN** MyGreenhouse lists an application the owner sent without Job Radar
- **THEN** an application is created at Applied on the submitted date, with the note "Applied through Greenhouse"

#### Scenario: Two applications at one company
- **WHEN** MyGreenhouse lists two applications at Northwind for different jobs
- **THEN** each updates only the application for its own Greenhouse job

### Requirement: MyGreenhouse status rules
A changed MyGreenhouse status SHALL update the pipeline with the same rules as email replies: forward moves and Rejected are applied automatically with Undo, never Accepted, Declined or Withdrawn. Unknown statuses and applications Greenhouse only marks inactive SHALL become suggestions. An unchanged status SHALL change nothing.

#### Scenario: Rejected in the portal
- **WHEN** MyGreenhouse shows a Rejected stage for Northwind's application
- **THEN** the application moves to Rejected, marked "from MyGreenhouse", with Undo

#### Scenario: Inactive in the portal
- **WHEN** MyGreenhouse only marks Northwind's application inactive, which can also mean the job closed
- **THEN** moving it to Rejected is suggested and nothing moves until the owner applies it

#### Scenario: Already updated from an email
- **WHEN** an email already moved the application to Rejected before the portal shows it
- **THEN** the portal status changes nothing and sends no second alert

## MODIFIED Requirements

### Requirement: Timeline
The system SHALL keep an append-only timeline per offer and application of state changes, notes, drafts, interviews and emails matched to the application, marking which changes were made automatically from an email or from MyGreenhouse and which were undone.

#### Scenario: Review history
- **WHEN** the owner opens an application
- **THEN** the timeline lists every change in chronological order

#### Scenario: Change made from an email
- **WHEN** an email moved the application to Technical interview
- **THEN** the timeline shows the email entry and the stage change labelled "from email", with an Undo action while it can still be undone

#### Scenario: Change made from MyGreenhouse
- **WHEN** MyGreenhouse showed the application as rejected
- **THEN** the timeline shows the portal status and the stage change labelled "from MyGreenhouse", with an Undo action while it can still be undone
