## MODIFIED Requirements

### Requirement: Telegram alerts
The system SHALL send Telegram messages to the owner's chat for strong matches (title, company, score, rate, one-line rationale, link to the local offer page and to the source), interview reminders, sessions that expired, sources stopped for repeated failures, and replies found in email or statuses found in MyGreenhouse that bring a next step, an offer or a rejection (company, role, one-line summary, the change made or suggested, and the next step with its date).

#### Scenario: Strong match alert
- **WHEN** an offer is classified strong
- **THEN** one Telegram message is sent for it, never more than once per offer

#### Scenario: Quiet hours
- **WHEN** a strong match arrives during configured quiet hours
- **THEN** it is held and delivered in a digest when quiet hours end

#### Scenario: Interview invitation by email
- **WHEN** an email moves an application to Screening call with an interview on 3 December
- **THEN** one Telegram message names the company, role and interview time and carries an Undo button, never more than once per email

#### Scenario: Acknowledgement only
- **WHEN** an email is classified as an acknowledgement or "other"
- **THEN** no Telegram message is sent

#### Scenario: Rejection seen in MyGreenhouse
- **WHEN** a MyGreenhouse status moves an application to Rejected
- **THEN** one Telegram message names the company and role and carries an Undo button, never more than once per status change
