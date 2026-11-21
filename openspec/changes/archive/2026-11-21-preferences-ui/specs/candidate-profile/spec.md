# Spec Delta

## ADDED Requirements

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
