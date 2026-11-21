# candidate-profile Specification

## Purpose
Holds the owner CV, preferences and skills that scoring, filtering and drafting read, editable from the app and validated on every change.

## Requirements

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

### Requirement: Preferences form with YAML view
The system SHALL offer the preferences as a form covering every preference field except per-source settings, and as the raw YAML file, switchable in one place. Both views SHALL edit the same file and SHALL validate it with the same rules before writing; an invalid result MUST NOT be written.

#### Scenario: Add a target role from the form
- **WHEN** the owner adds "Staff AI Engineer" to target roles in the form and saves
- **THEN** preferences.yaml lists the new role and switching to the YAML view shows it

#### Scenario: Edit in YAML, see it in the form
- **WHEN** the owner adds a skill in the YAML view, saves and switches to the form
- **THEN** the form's skills list includes it

#### Scenario: Invalid form value
- **WHEN** the owner sets the possible threshold above the strong threshold and saves
- **THEN** nothing is written and the field shows "possible must be lower than strong"

#### Scenario: Per-source settings
- **WHEN** preferences.yaml has a sources block
- **THEN** the form does not show it, says it is edited in the YAML view, and saving the form leaves it unchanged

### Requirement: Form saves keep the file's formatting
Saving from the form SHALL change only the fields the owner edited and SHALL keep the file's comments, key order and the formatting of untouched fields.

#### Scenario: Comment kept
- **WHEN** a comment sits next to service_lines and the owner changes only the weekly capacity in the form
- **THEN** the saved file differs only in the capacity value and the comment remains

#### Scenario: Removing an optional field
- **WHEN** the owner clears the optional target hourly rates in the form and saves
- **THEN** the target_hourly key is removed from the file and the file still validates

### Requirement: Unsaved changes between views
The system SHALL ask the owner to save or discard unsaved changes before switching between the form and the YAML view, and SHALL NOT switch from the YAML view to the form while the YAML text is invalid.

#### Scenario: Switch with unsaved form changes
- **WHEN** the owner edits a field in the form and switches to YAML without saving
- **THEN** the app asks to save or discard, and the YAML view shows the file as saved after the choice

#### Scenario: Invalid YAML blocks the form
- **WHEN** the YAML text has a wrong indentation and the owner switches to the form
- **THEN** the switch is refused and the field errors are shown

### Requirement: CV variants
The system SHALL let the owner keep named CV variants beside the master CV as local Markdown files, each with a name and a short "use for" description. The master CV remains the complete, authoritative CV. With no variants, the system SHALL behave as with a single CV.

#### Scenario: Variants load with the profile
- **WHEN** the profile folder holds the master CV and two valid variants "AI Engineer" and "Tech Lead"
- **THEN** both variants are available to scoring and drafting, and Settings lists them with their "use for" text

#### Scenario: Invalid variant
- **WHEN** a variant file has no name or an empty body
- **THEN** that variant is ignored, the other variants still load, and Settings shows the error for that file

#### Scenario: No variants
- **WHEN** the profile folder holds only the master CV
- **THEN** scoring, drafts and applications behave as before and no CV recommendation is shown

### Requirement: CV variant editing from the UI
The system SHALL let the owner add, edit, rename and delete CV variants from Settings, saving them to the local profile folder. A variant SHALL be limited to 20,000 characters and the number of variants to 8.

#### Scenario: Add a variant
- **WHEN** the owner adds a variant named "Freelance" with a "use for" line and text, and saves
- **THEN** a variant file is created in the profile folder and the variant appears in the list

#### Scenario: Delete a variant used by applications
- **WHEN** the owner deletes a variant that past applications recorded as sent
- **THEN** the file is removed and those applications keep showing the variant's name

### Requirement: Refresh CV recommendations
The system SHALL let the owner refresh CV recommendations after changing variants, re-scoring only shortlisted offers that have no application, within the daily scoring cap. Changing variants alone SHALL NOT re-score every open offer.

#### Scenario: Refresh after adding a variant
- **WHEN** the owner adds a variant and clicks "Refresh CV recommendations"
- **THEN** shortlisted offers without an application are queued for scoring, the count is shown, and other offers keep their current score

#### Scenario: Over the daily cap
- **WHEN** the refresh queues more offers than the remaining daily scoring cap
- **THEN** the offers over the cap wait as "awaiting score" until the next day, as for any other scoring
