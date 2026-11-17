## ADDED Requirements

### Requirement: Company facts in drafts
When a company profile exists, drafts MAY mention its facts (product, recent round, news) and SHALL mention only facts present in the profile. Each company fact used in a draft SHALL be listed under the draft with its source link so the owner can check it before sending.

#### Scenario: Draft cites a recent round
- **WHEN** a draft is generated for a company whose profile records "Series B, October 2026"
- **THEN** the draft may mention the round and the draft panel lists "Series B, October 2026" with its source link
