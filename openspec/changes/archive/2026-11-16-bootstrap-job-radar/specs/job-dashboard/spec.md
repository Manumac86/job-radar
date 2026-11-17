## ADDED Requirements

### Requirement: Metrics dashboard
The system SHALL provide a home dashboard with, for a selectable period (7, 30, 90 days): offers ingested per day by source, offers by score class, shortlisted and applied counts, the funnel from applied to each interview stage to offer, response rate and median time to first response per source, active engagements with committed hours, and the next 7 days of interviews and due next steps.

#### Scenario: Funnel by source
- **WHEN** the owner selects the last 30 days
- **THEN** the funnel and response rates are computed only from applications created in that window, per source

#### Scenario: Empty state
- **WHEN** no offers exist yet
- **THEN** the dashboard explains how to enable a source instead of showing empty charts

### Requirement: Offers list
The system SHALL provide an offers list with sorting and filtering by score, score class, source, triage state, engagement type, remote policy, rate range, posted date and free-text search, showing title, company, score, rate, source and posted date per row.

#### Scenario: Filter strong contract offers
- **WHEN** the owner filters score class "strong" and engagement "contract"
- **THEN** only matching offers are listed, sorted by score descending by default

### Requirement: Offer detail
The system SHALL provide an offer detail screen showing all normalized fields, every source link, the full description, the current score with sub-scores, rationale and red flags, score history, drafts with versions, the linked application with stage, interviews and next step, and the timeline.

#### Scenario: Open offer detail
- **WHEN** the owner opens an offer
- **THEN** every stored field is visible, with "Copy draft", "Open offer page", "Shortlist", "Dismiss" and "Mark as applied" actions

### Requirement: Pipeline board
The system SHALL provide a board view of applications grouped by stage, where moving a card changes its stage.

#### Scenario: Drag to final interview
- **WHEN** the owner drags a card to "final interview"
- **THEN** the stage changes and the timeline records it

### Requirement: Sources and runs view
The system SHALL show each source with enabled state, session status for logged-in sources, last run result and the run log.

#### Scenario: Failing source
- **WHEN** a source's last run failed
- **THEN** it shows the error message and a "Run now" action
