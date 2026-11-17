## MODIFIED Requirements

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
