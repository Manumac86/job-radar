# Spec Delta

## ADDED Requirements

### Requirement: CV variant in drafts
When CV variants exist, a draft SHALL be generated for one variant: the offer's recommended variant by default, or the one the owner picks before generating. The draft SHALL emphasize that variant's evidence, SHALL record which variant it used, and MUST still ground every fact in the master CV or the profile.

#### Scenario: Default variant
- **WHEN** an offer's score recommends "Tech Lead" and a draft is generated
- **THEN** the draft emphasizes the Tech Lead variant's evidence and shows "Written for CV: Tech Lead"

#### Scenario: Owner picks another variant
- **WHEN** the owner picks "AI Engineer" and regenerates
- **THEN** a new draft version is written for AI Engineer and earlier versions keep their variant

#### Scenario: Fact only in the master CV
- **WHEN** the selected variant omits a metric that the master CV contains and the offer asks for it
- **THEN** the draft may state the metric, and nothing absent from both the master CV and the profile is stated as fact
