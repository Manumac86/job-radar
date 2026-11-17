## ADDED Requirements

### Requirement: Company profile in scoring
When a company profile exists, the system SHALL give it to the scoring model with its sources, and SHALL use it for the leadership stage and team-size comparison instead of guessing from the offer. Finishing a research SHALL rescore the open offers of that company, within the scoring budget. Hard eligibility rules SHALL still apply after the model.

#### Scenario: Stage known after research
- **WHEN** a Head of Engineering offer scored without stage data is researched and the company is Series D with 400 engineers
- **THEN** the offer is rescored and its red flags include "company stage above target"
