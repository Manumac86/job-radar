## ADDED Requirements

### Requirement: Company research in interview prep
When an interview prep plan is generated and no company profile younger than 30 days exists, the system SHALL request research first (within the research cap) and SHALL include the profile's product summary, stage, recent news and red flags in the plan, with sources. If research is unavailable, the plan SHALL be generated without it and say so.

#### Scenario: Prep with recent news
- **WHEN** an application moves to technical interview and the company announced a product launch last month
- **THEN** the prep plan has a "Company context" section mentioning the launch with its source link
