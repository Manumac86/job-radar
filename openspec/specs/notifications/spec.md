# notifications Specification

## Purpose
Alerts the owner about strong matches, digests, interviews, prep plans and follow-ups in the app and through a private Telegram bot.

## Requirements

### Requirement: Telegram alerts
The system SHALL send Telegram messages to the owner's chat for strong matches (title, company, score, rate, one-line rationale, link to the local offer page and to the source), interview reminders, sessions that expired, sources stopped for repeated failures, and replies found in email that bring a next step, an offer or a rejection (company, role, one-line summary, the change made or suggested, and the next step with its date).

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

### Requirement: Daily digest
The system SHALL send a daily digest at a configured time with new strong and possible matches, applications awaiting response, and today's interviews and next steps.

#### Scenario: Morning digest
- **WHEN** the digest time is reached
- **THEN** one message summarizes the last 24 hours with counts and the top 5 offers by score

### Requirement: In-app notification center
The system SHALL show every notification in an in-app list with read and unread state, whether or not Telegram is configured.

#### Scenario: Telegram not configured
- **WHEN** no Telegram token is configured
- **THEN** notifications appear only in the app and Settings shows how to connect Telegram

### Requirement: Owner-only bot
The Telegram bot SHALL respond only to the configured owner chat id and ignore all other chats.

#### Scenario: Message from a stranger
- **WHEN** another chat messages the bot
- **THEN** the bot does not reply and the attempt is logged

### Requirement: Telegram action buttons
Telegram messages for email replies SHALL carry an Undo button for automatic changes and Apply and Dismiss buttons for suggestions. A button SHALL act only when pressed in the owner's chat and only once; the message SHALL then be edited to show the result.

#### Scenario: Undo from Telegram
- **WHEN** the owner presses Undo on a rejection alert
- **THEN** the change is undone and the message reads "Undone"

#### Scenario: Button pressed twice
- **WHEN** Undo is pressed again on the same message
- **THEN** nothing changes and the bot answers "Already undone"
