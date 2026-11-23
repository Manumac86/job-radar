## ADDED Requirements

### Requirement: Preferred regions
The system SHALL add the owner's preferred-region bonus (default 5 points, at most 20) to the overall score of an offer located in, or open to, one of the owner's preferred regions, remote or hybrid, after the model scores it and up to 100. A capped offer SHALL get no bonus. The score SHALL record the bonus and the region that earned it, and the offer SHALL show both.

#### Scenario: Remote role open to Spain
- **WHEN** the preferred regions are [Spain] with a bonus of 5 and the model scores a remote offer open to "Spain, Portugal" at 74
- **THEN** its overall score is 79 and the offer shows "+5 preferred region (Spain)"

#### Scenario: Capped offer in Spain
- **WHEN** an offer in Spain requires a work authorization the owner does not have
- **THEN** its score stays capped at 30 with no bonus

#### Scenario: Remote role elsewhere
- **WHEN** the same profile receives a remote US offer
- **THEN** it gets no bonus and is scored as before
