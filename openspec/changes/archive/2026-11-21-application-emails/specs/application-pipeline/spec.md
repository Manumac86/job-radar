# Spec Delta

## MODIFIED Requirements

### Requirement: Timeline
The system SHALL keep an append-only timeline per offer and application of state changes, notes, drafts, interviews and emails matched to the application, marking which changes were made automatically from an email and which were undone.

#### Scenario: Review history
- **WHEN** the owner opens an application
- **THEN** the timeline lists every change in chronological order

#### Scenario: Change made from an email
- **WHEN** an email moved the application to Technical interview
- **THEN** the timeline shows the email entry and the stage change labelled "from email", with an Undo action while it can still be undone
