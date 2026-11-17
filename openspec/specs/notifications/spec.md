# notifications Specification

## Purpose
Alerts the owner about strong matches, digests, interviews, prep plans and follow-ups in the app and through a private Telegram bot.

## Requirements

### Requirement: Telegram alerts
The system SHALL send Telegram messages to the owner's chat for strong matches (title, company, score, rate, one-line rationale, link to the local offer page and to the source), interview reminders, sessions that expired, and sources stopped for repeated failures.

#### Scenario: Strong match alert
- **WHEN** an offer is classified strong
- **THEN** one Telegram message is sent for it, never more than once per offer

#### Scenario: Quiet hours
- **WHEN** a strong match arrives during configured quiet hours
- **THEN** it is held and delivered in a digest when quiet hours end

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
