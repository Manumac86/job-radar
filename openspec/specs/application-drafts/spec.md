# application-drafts Specification

## Purpose
Drafts cover letters and freelance proposals from the owner profile and the offer, grounded in the CV, for the owner to review and send manually.

## Requirements

### Requirement: Tailored draft generation
The system SHALL generate, on request or automatically for strong matches, an application draft for an offer: a cover message or proposal (default ≤ 180 words) that cites the most relevant evidence from the CV, answers to any screening questions found in the offer, a suggested rate or price consistent with the profile, and a short list of claims the owner must verify.

#### Scenario: Draft for strong match
- **WHEN** an offer is classified strong
- **THEN** a draft is created and linked to the offer within the same run

#### Scenario: Regenerate with instruction
- **WHEN** the owner asks to regenerate with an instruction such as "shorter, emphasize RAG"
- **THEN** a new draft version is created and earlier versions remain viewable

### Requirement: No fabrication
Drafts MUST only use facts present in the CV or profile. Any statement the model cannot ground SHALL be listed under "verify before sending" instead of stated as fact.

#### Scenario: Missing metric
- **WHEN** the offer asks for a metric the CV does not contain
- **THEN** the draft leaves a bracketed placeholder and lists it under "verify before sending"

### Requirement: Human-only submission
The system MUST NEVER submit a draft, fill an application form, or send a message on any site or by email. The UI SHALL offer "Copy draft" and "Open offer page" actions, and a "Mark as applied" action that the owner triggers after sending manually.

#### Scenario: Owner sends manually
- **WHEN** the owner copies the draft, sends it on the site, and clicks "Mark as applied"
- **THEN** an application is created in stage "applied" with the sent draft version attached

### Requirement: Company facts in drafts
When a company profile exists, drafts MAY mention its facts (product, recent round, news) and SHALL mention only facts present in the profile. Each company fact used in a draft SHALL be listed under the draft with its source link so the owner can check it before sending.

#### Scenario: Draft cites a recent round
- **WHEN** a draft is generated for a company whose profile records "Series B, October 2026"
- **THEN** the draft may mention the round and the draft panel lists "Series B, October 2026" with its source link
