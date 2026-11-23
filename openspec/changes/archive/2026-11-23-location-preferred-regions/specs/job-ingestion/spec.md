## MODIFIED Requirements

### Requirement: Keyword pre-filter
The system SHALL discard offers before any LLM call, recording them as "filtered" with the reason, when they match an exclude keyword (an exclude keyword written as "title:<word>" matches the title only), match none of the include keywords, have a title that contains none of the optional title keywords (role gate), or are on-site or hybrid while the profile is remote-only. A hybrid offer located in one of the owner's hybrid regions SHALL pass.

#### Scenario: Excluded offer
- **WHEN** an offer's title or description matches an exclude keyword
- **THEN** it is stored as filtered with the matched keyword and is not scored

#### Scenario: Title-only exclusion
- **WHEN** a senior offer's description mentions mentoring junior engineers and the exclude list has "title:junior"
- **THEN** the offer is not filtered

#### Scenario: Non-engineering role
- **WHEN** an offer titled "Enterprise Account Executive" mentions AI in its description and the title keywords are set
- **THEN** it is stored as filtered with the reason "Title is not a target role"

#### Scenario: Hybrid role in a hybrid region
- **WHEN** the profile is remote-only with hybrid regions [Spain, Madrid] and a hybrid offer is located in "Madrid, Spain"
- **THEN** the offer is not filtered and is scored

#### Scenario: Hybrid role elsewhere
- **WHEN** the same profile receives a hybrid offer located in "Berlin, Germany", or an on-site offer in Madrid
- **THEN** it is stored as filtered with the reason "Not remote (hybrid)" or "Not remote (onsite)"

## ADDED Requirements

### Requirement: Hybrid regions applied to open offers
The system SHALL re-apply the hybrid-region rule to open offers without an application when the owner's hybrid regions change: hybrid offers filtered only for not being remote that now match SHALL return to "new" and be queued for scoring, and hybrid offers that no longer match SHALL be filtered again.

#### Scenario: Add Spain to hybrid regions
- **WHEN** the owner adds "Spain" to hybrid regions and saves, and a hybrid offer in Barcelona, Spain was filtered as "Not remote (hybrid)"
- **THEN** the offer returns to "new" and is scored

#### Scenario: Remove Spain again
- **WHEN** the owner removes "Spain" and the Barcelona offer has no application
- **THEN** it is filtered again with the reason "Not remote (hybrid)"
