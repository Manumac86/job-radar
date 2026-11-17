## MODIFIED Requirements

### Requirement: Offers list
The system SHALL provide an offers list with sorting and filtering by score, score class, source, triage state, engagement type, remote policy, rate range, posted date and free-text search, showing title, company, score, rate, source, posted date, status and pipeline stage per row. The status SHALL be "Applied" for offers that have an application and the triage state for the others; the pipeline column SHALL show the application's current stage and stay empty for offers without an application. Each status SHALL be shown as a badge with its own color, in light and dark mode, always with its text label. A "Show applied" switch, off by default, SHALL control whether offers with an application are listed; when it is off they SHALL be left out of the rows, the total and the pagination.

#### Scenario: Filter strong contract offers
- **WHEN** the owner filters score class "strong" and engagement "contract"
- **THEN** only matching offers are listed, sorted by score descending by default

#### Scenario: Applied offers hidden by default
- **WHEN** the owner opens the offers list and one matching offer has an application in "technical interview"
- **THEN** that offer is not listed and is not counted in the total

#### Scenario: Status badges by color
- **WHEN** the list shows a new offer, a shortlisted offer and a dismissed offer
- **THEN** each status appears as a badge with its label and a color that differs from the other statuses

#### Scenario: Show applied offers with their stage
- **WHEN** the owner turns on "Show applied"
- **THEN** the applied offer is listed with status "Applied" and pipeline "Technical interview", and the other offers show their triage state, such as "New" or "Shortlisted", with an empty pipeline
