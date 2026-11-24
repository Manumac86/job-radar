## MODIFIED Requirements

### Requirement: Metrics dashboard
The system SHALL provide a home dashboard with, for a selectable period (7, 30, 90 days): offers ingested per day by source, offers by score class, shortlisted and applied counts, the funnel from applied to each interview stage to offer, response rate and median time to first response per source, active engagements with committed hours shown against the weekly capacity, the next 7 days of interviews and due next steps, and a star field of open offers.

#### Scenario: Funnel by source
- **WHEN** the owner selects the last 30 days
- **THEN** the funnel and response rates are computed only from applications created in that window, per source

#### Scenario: Empty state
- **WHEN** no offers exist yet
- **THEN** the dashboard explains how to enable a source instead of showing empty charts

#### Scenario: Star field of open offers
- **WHEN** the period holds scored offers that are new or shortlisted and have no application
- **THEN** each is drawn as a star placed by age and score, sized by its score class, the strongest named, shortlisted ones ringed, and each star opens its offer

#### Scenario: Over capacity
- **WHEN** active engagements commit 46 hours a week against a capacity of 40
- **THEN** the committed-hours bar is full, says "6 h over the week", and the over-capacity warning is shown

### Requirement: Offers list
The system SHALL provide an offers list with sorting and filtering by score, score class, source, triage state, engagement type, remote policy, rate range, posted date and free-text search, showing title, company, score, rate, source, posted date, status and pipeline stage per row. The status SHALL be "Applied" for offers that have an application and the triage state for the others; the pipeline column SHALL show the application's current stage and stay empty for offers without an application. Each status SHALL be shown as a badge with its text label, in light and dark mode: live states (applied, shortlisted, new) each in their own color, spent states (dismissed, filtered, archived) quiet and told apart by their mark. A "Show applied" switch, off by default, SHALL control whether offers with an application are listed; when it is off they SHALL be left out of the rows, the total and the pagination. On narrow screens each offer SHALL be shown as a two-line entry instead of a clipped table.

#### Scenario: Filter strong contract offers
- **WHEN** the owner filters score class "strong" and engagement "contract"
- **THEN** only matching offers are listed, sorted by score descending by default

#### Scenario: Applied offers hidden by default
- **WHEN** the owner opens the offers list and one matching offer has an application in "technical interview"
- **THEN** that offer is not listed and is not counted in the total

#### Scenario: Status badges by color
- **WHEN** the list shows a new offer, a shortlisted offer and a dismissed offer
- **THEN** each status appears as a badge with its label; new and shortlisted differ in color, and dismissed is struck through in a quiet tone

#### Scenario: Show applied offers with their stage
- **WHEN** the owner turns on "Show applied"
- **THEN** the applied offer is listed with status "Applied" and pipeline "Technical interview", and the other offers show their triage state, such as "New" or "Shortlisted", with an empty pipeline

#### Scenario: Narrow screen
- **WHEN** the owner opens the offers list on a phone-width window
- **THEN** each offer shows its score, title, company, rate and status as a two-line entry, with nothing cut off

### Requirement: Pipeline board
The system SHALL provide a board view of applications grouped by stage, where moving a card changes its stage. The board SHALL use the full width of the work area with its own horizontal scroll, fill the window height with each column scrolling vertically on its own, and offer a search that keeps only the cards whose company, role or next step match, ignoring case and accents.

#### Scenario: Drag to final interview
- **WHEN** the owner drags a card to "final interview"
- **THEN** the stage changes and the timeline records it

#### Scenario: Search the pipeline
- **WHEN** the owner types "proseware" in the pipeline search
- **THEN** only Proseware's card stays on the board, the count shows "1 of N applications", and Escape brings every card back

#### Scenario: Long column
- **WHEN** a stage holds more cards than fit in the window
- **THEN** that column scrolls on its own while the board and the other columns stay in place

## ADDED Requirements

### Requirement: Score as magnitude
The system SHALL show every offer score as a dot sized by its score class on one fixed ramp (strong largest, then possible, then weak, and a dashed dot when not scored) next to the number, the same in the offers list, offer detail, pipeline cards and dashboard. Score class SHALL never be told by hue alone.

#### Scenario: Same ramp everywhere
- **WHEN** an offer scores 84 and appears in the list, its detail and a pipeline card
- **THEN** it shows the same large dot with 84 in all three places
