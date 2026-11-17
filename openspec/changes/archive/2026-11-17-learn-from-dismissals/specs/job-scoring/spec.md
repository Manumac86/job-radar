## ADDED Requirements

### Requirement: Learned preferences in scoring
The system SHALL give the scoring model the owner's active learned preferences as trusted owner preferences. An offer that matches an "avoid" preference SHALL score lower and SHALL carry a red flag naming that preference; an offer that matches a "prefer" preference MAY score higher. Learned preferences SHALL NOT override the hard eligibility rules: the cap at 30 still applies, and a "prefer" match never lifts a capped offer above it. Disabled preferences SHALL NOT be sent.

#### Scenario: Avoid preference lowers a score
- **WHEN** the active preference "Avoid crypto and web3 companies" exists and a web3 offer is scored
- **THEN** its score is lower than without the preference and its red flags include "Matches what you avoid: crypto and web3 companies"

#### Scenario: Hard cap still wins
- **WHEN** an offer requires US work authorization and matches a "prefer" preference
- **THEN** its overall score is still at most 30
