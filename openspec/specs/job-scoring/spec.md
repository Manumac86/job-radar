# job-scoring Specification

## Purpose
Scores each offer against the owner profile through the owner Claude subscription, with explanations, hard caps and a daily budget.

## Requirements

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

### Requirement: Learned preferences in scoring
The system SHALL give the scoring model the owner's active learned preferences as trusted owner preferences. An offer that matches an "avoid" preference SHALL score lower and SHALL carry a red flag naming that preference; an offer that matches a "prefer" preference MAY score higher. Learned preferences SHALL NOT override the hard eligibility rules: the cap at 30 still applies, and a "prefer" match never lifts a capped offer above it. Disabled preferences SHALL NOT be sent.

#### Scenario: Avoid preference lowers a score
- **WHEN** the active preference "Avoid crypto and web3 companies" exists and a web3 offer is scored
- **THEN** its score is lower than without the preference and its red flags include "Matches what you avoid: crypto and web3 companies"

#### Scenario: Hard cap still wins
- **WHEN** an offer requires US work authorization and matches a "prefer" preference
- **THEN** its overall score is still at most 30

### Requirement: Company profile in scoring
When a company profile exists, the system SHALL give it to the scoring model with its sources, and SHALL use it for the leadership stage and team-size comparison instead of guessing from the offer. Finishing a research SHALL rescore the open offers of that company, within the scoring budget. Hard eligibility rules SHALL still apply after the model.

#### Scenario: Stage known after research
- **WHEN** a Head of Engineering offer scored without stage data is researched and the company is Series D with 400 engineers
- **THEN** the offer is rescored and its red flags include "company stage above target"

### Requirement: CV variant recommendation
When CV variants exist, the same scoring call SHALL also return the recommended variant for the offer, a one-sentence reason, and up to five gaps: offer requirements the master CV supports but the recommended variant does not show. Fit SHALL still be judged against the master CV, so variants SHALL NOT change the overall score or sub-scores.

#### Scenario: Leadership offer
- **WHEN** variants "AI Engineer" and "Tech Lead" exist and a Head of Engineering offer is scored
- **THEN** the score recommends "Tech Lead" with a reason, and the offer detail shows "Recommended CV: Tech Lead"

#### Scenario: Gap shown
- **WHEN** an offer asks for Kubernetes, the master CV mentions Kubernetes and the recommended variant does not
- **THEN** the gaps include Kubernetes and the offer detail lists it under the recommendation

#### Scenario: Unknown variant in model output
- **WHEN** the model names a variant that does not exist
- **THEN** the score is stored without a recommendation and the offer detail shows no recommendation

#### Scenario: Recommendation does not change the score
- **WHEN** the same offer is scored with and without variants and the model returns the same fit
- **THEN** the overall score and sub-scores are stored identically and the hard eligibility rules apply as before

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
