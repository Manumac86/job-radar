## ADDED Requirements

### Requirement: Profile as local files
The system SHALL load the candidate profile from local files: a CV in Markdown and a preferences file containing target roles, offers (service lines), skills, minimum hourly rate per currency, minimum day rate, weekly capacity in hours, accepted work locations and time zones, preferred engagement types (contract, part-time, full-time), include keywords and exclude keywords.

#### Scenario: Profile loads at startup
- **WHEN** the worker starts and both profile files are present and valid
- **THEN** the profile is available to scoring and drafting, and its last-loaded time is shown in Settings

#### Scenario: Invalid preferences file
- **WHEN** the preferences file fails schema validation
- **THEN** the worker refuses to score, logs the exact field errors, and Settings shows the errors

### Requirement: Profile editing from the UI
The system SHALL let the owner view and edit the CV and preferences from a Settings screen, saving them back to the same local files.

#### Scenario: Edit minimum rate
- **WHEN** the owner changes the minimum hourly rate and saves
- **THEN** the file is updated and offers ingested afterwards are scored with the new value

### Requirement: Rescore on profile change
The system SHALL allow the owner to rescore open offers (not archived, not applied) after a profile change.

#### Scenario: Rescore after editing keywords
- **WHEN** the owner clicks "Rescore open offers"
- **THEN** every open offer gets a new score and the previous score remains in its history
