## MODIFIED Requirements

### Requirement: Timeline
The system SHALL keep an append-only timeline per offer and application of state changes, notes, drafts, interviews and emails matched to the application, marking which changes were made automatically from an email or from MyGreenhouse and which were undone. The owner SHALL be able to add a note to any offer at any time, from the offer page or the pipeline drawer, without changing its stage.

#### Scenario: Review history
- **WHEN** the owner opens an application
- **THEN** the timeline lists every change in chronological order

#### Scenario: Change made from an email
- **WHEN** an email moved the application to Technical interview
- **THEN** the timeline shows the email entry and the stage change labelled "from email", with an Undo action while it can still be undone

#### Scenario: Change made from MyGreenhouse
- **WHEN** MyGreenhouse showed the application as rejected
- **THEN** the timeline shows the portal status and the stage change labelled "from MyGreenhouse", with an Undo action while it can still be undone

#### Scenario: Note on an offer without an application
- **WHEN** the owner adds the note "Contacted on Telegram" to an offer they have not applied to
- **THEN** the offer's timeline shows the note with its date, and the offer's triage and stage do not change

#### Scenario: Note from the pipeline drawer
- **WHEN** the owner adds a note in an application's drawer without choosing another stage
- **THEN** the note appears in the timeline and the application stays in its stage
