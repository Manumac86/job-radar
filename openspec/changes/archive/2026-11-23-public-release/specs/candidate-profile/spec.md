## ADDED Requirements

### Requirement: Example seed profile
The bundled seed profile SHALL describe a fictional candidate and SHALL contain no real person's data. While the live CV is identical to the seed CV, the dashboard and Settings SHALL show "This is the example profile" with a link to edit it.

#### Scenario: Fresh install
- **WHEN** a new user starts the app for the first time
- **THEN** the profile is the fictional example, and the dashboard shows the notice with a link to the profile editor

#### Scenario: Profile replaced
- **WHEN** the user saves their own CV
- **THEN** the notice disappears
