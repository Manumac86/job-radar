# job-dashboard Specification

## Purpose
Shows offers, scores, sources and pipeline metrics in a local web UI so the owner can triage and act on matches.

## Requirements

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

### Requirement: Offer detail
The system SHALL provide an offer detail screen showing all normalized fields, every source link, the full description, the current score with sub-scores, rationale and red flags, score history, drafts with versions, the linked application with stage, interviews and next step, and the timeline. Dismissing from this screen SHALL collect structured reasons as defined by the offer-feedback capability, and a dismissed offer SHALL show its reasons and note. It SHALL also show a Company card with the company profile (each fact with its source link and the research date) or the research state, and a "Research company" action.

#### Scenario: Open offer detail
- **WHEN** the owner opens an offer
- **THEN** every stored field is visible, with "Copy draft", "Open offer page", "Shortlist", "Dismiss", "Mark as applied" and "Research company" actions

#### Scenario: Dismissed offer shows its reasons
- **WHEN** the owner opens an offer dismissed for "salary too low" with the note "max 45 €/h"
- **THEN** the detail screen shows "Dismissed: Salary too low — max 45 €/h" and a "Restore" action

#### Scenario: Company card with sources
- **WHEN** the owner opens an offer whose company was researched
- **THEN** the Company card shows the facts, each with a link to its source, and "Researched 3 days ago · Refresh"

### Requirement: Pipeline board
The system SHALL provide a board view of applications grouped by stage, where moving a card changes its stage. The board SHALL use the full width of the work area with its own horizontal scroll, fill the window height with each column scrolling vertically on its own, and offer a search that keeps only the cards whose company, role or next step match, ignoring case and accents. On a touch screen, a card SHALL be picked up only by pressing and holding it; a swipe that starts on a card SHALL scroll the board or the column, and a tap SHALL open the card. While a card is being moved, with the mouse or by touch, it SHALL be drawn above every column until it is dropped.

#### Scenario: Card visible while moving
- **WHEN** the owner drags a card over another column
- **THEN** the card stays visible above that column until it is dropped, and Escape cancels the move

#### Scenario: Drag to final interview
- **WHEN** the owner drags a card to "final interview"
- **THEN** the stage changes and the timeline records it

#### Scenario: Search the pipeline
- **WHEN** the owner types "proseware" in the pipeline search
- **THEN** only Proseware's card stays on the board, the count shows "1 of N applications", and Escape brings every card back

#### Scenario: Long column
- **WHEN** a stage holds more cards than fit in the window
- **THEN** that column scrolls on its own while the board and the other columns stay in place

#### Scenario: Swipe across the board on a phone
- **WHEN** the owner swipes sideways starting on a card, on a touch screen
- **THEN** the board scrolls to the next column and no card moves

#### Scenario: Press and hold to move a card
- **WHEN** the owner presses and holds a card on a touch screen and drops it on another column
- **THEN** the stage changes and the timeline records it

### Requirement: Sources and runs view
The system SHALL show each source with enabled state, session status for logged-in sources, last run result and the run log.

#### Scenario: Failing source
- **WHEN** a source's last run failed
- **THEN** it shows the error message and a "Run now" action

### Requirement: Score as magnitude
The system SHALL show every offer score as a dot sized by its score class on one fixed ramp (strong largest, then possible, then weak, and a dashed dot when not scored) next to the number, the same in the offers list, offer detail, pipeline cards and dashboard. Score class SHALL never be told by hue alone.

#### Scenario: Same ramp everywhere
- **WHEN** an offer scores 84 and appears in the list, its detail and a pipeline card
- **THEN** it shows the same large dot with 84 in all three places

### Requirement: Phone-width layout
At 390 px wide, no screen SHALL scroll sideways as a page. Wide content SHALL either fit or scroll inside its own area, as the pipeline board and the offers filter row do. On narrow screens, the People page SHALL show each person as a stacked entry with its contacts, offers and actions reachable without sideways scrolling. Settings SHALL work at that width without being laid out specially for it. On narrow screens, where the sidebar opens over the page, choosing a page in it SHALL close it.

#### Scenario: Sidebar on a phone
- **WHEN** the owner opens the sidebar on a phone and chooses Pipeline
- **THEN** the pipeline opens and the sidebar closes

#### Scenario: Dashboard on a phone
- **WHEN** the owner opens the dashboard 390 px wide
- **THEN** the page is no wider than the screen, and the figures, the star chart and the tables fit or scroll inside their own cards

#### Scenario: People on a phone
- **WHEN** the owner opens People 390 px wide
- **THEN** each person is one stacked entry, and the edit and merge buttons can be pressed without scrolling sideways

#### Scenario: Long preference tags
- **WHEN** a target role longer than the screen is shown in the Preferences form 390 px wide
- **THEN** the tag wraps within the form and the page does not scroll sideways

### Requirement: Back to the offers list
The offer detail SHALL show a "Back to offers" link. When the offer was opened from the offers list, the link SHALL return to that list with the same filters, search, sort and page; otherwise it SHALL return to the offers list as it opens by default.

#### Scenario: Back with filters
- **GIVEN** the owner filtered the offers list to strong contract offers
- **WHEN** they open an offer and press "Back to offers"
- **THEN** the list shows strong contract offers again

#### Scenario: Opened from elsewhere
- **WHEN** the owner opens an offer from the dashboard and presses "Back to offers"
- **THEN** the offers list opens with its default filters
