## MODIFIED Requirements

### Requirement: Offer detail
The system SHALL provide an offer detail screen showing all normalized fields, every source link, the full description, the current score with sub-scores, rationale and red flags, score history, drafts with versions, the linked application with stage, interviews and next step, and the timeline. Dismissing from this screen SHALL collect structured reasons as defined by the offer-feedback capability, and a dismissed offer SHALL show its reasons and note.

#### Scenario: Open offer detail
- **WHEN** the owner opens an offer
- **THEN** every stored field is visible, with "Copy draft", "Open offer page", "Shortlist", "Dismiss" and "Mark as applied" actions

#### Scenario: Dismissed offer shows its reasons
- **WHEN** the owner opens an offer dismissed for "salary too low" with the note "max 45 €/h"
- **THEN** the detail screen shows "Dismissed: Salary too low — max 45 €/h" and a "Restore" action
