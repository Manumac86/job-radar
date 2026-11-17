## ADDED Requirements

### Requirement: Structured score per offer
The system SHALL score every offer that passes the pre-filter with a structured result: overall score 0–100, sub-scores for skills fit, seniority fit, rate fit, location and time-zone eligibility, and engagement fit, a 2–4 sentence rationale, red flags, and which of the owner's offers (service lines) it matches.

#### Scenario: Offer scored
- **WHEN** a new offer passes the pre-filter
- **THEN** it receives a structured score validated against a schema, stored with the model name and timestamp

#### Scenario: Malformed model output
- **WHEN** the model returns output that fails schema validation twice
- **THEN** the offer is marked "scoring failed" with the error and can be retried manually

### Requirement: Hard eligibility rules
The system SHALL cap the overall score at 30 when the offer requires residency or work authorization the owner does not have, or states a rate below the owner's minimum, and SHALL list the reason as a red flag.

#### Scenario: US-only role
- **WHEN** an offer requires US residency
- **THEN** its overall score is at most 30 with the red flag "US residency required"

### Requirement: Leadership roles and company stage
For leadership offers (CTO, Head of Engineering, VP Engineering, Engineering Manager) the system SHALL judge seniority fit on the owner's leadership evidence and SHALL compare the company's stage and engineering team size with the profile's target (default: Seed to Series B, up to about 50 engineers), adding the red flag "company stage above target" when the company is larger or later-stage.

#### Scenario: CTO at a seed-stage startup
- **WHEN** a seed-stage startup posts a remote CTO role
- **THEN** it is scored as a leadership offer with no stage red flag, and its match lists the interim engineering lead service line

#### Scenario: CTO at a large company
- **WHEN** a company with several hundred engineers posts a CTO role
- **THEN** the score carries the red flag "company stage above target"

### Requirement: Subscription-backed model access
Scoring SHALL call Claude through the local Claude Code CLI using the owner's logged-in subscription, via the Vercel AI SDK. The system MUST NOT use an Anthropic API key. A fast model SHALL be used for scoring by default, configurable in Settings.

#### Scenario: CLI not logged in
- **WHEN** the Claude Code CLI is not authenticated
- **THEN** scoring pauses, offers queue as "awaiting score", and Settings shows how to authenticate

### Requirement: Score thresholds
The system SHALL classify offers by score as strong (default ≥ 80), possible (60–79) or weak (< 60), with thresholds editable in Settings.

#### Scenario: Strong match
- **WHEN** an offer scores 85
- **THEN** it is classified strong and triggers a strong-match notification
