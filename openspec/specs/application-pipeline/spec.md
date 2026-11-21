# application-pipeline Specification

## Purpose
Tracks each application from applied to outcome on a kanban board, with interviews, next steps, interview prep, follow-up reminders and response patterns.

## Requirements

### Requirement: Offer triage states
The system SHALL keep each offer in one triage state: new, shortlisted, dismissed, filtered or archived. Dismissing SHALL ask for an optional reason.

#### Scenario: Shortlist an offer
- **WHEN** the owner shortlists a new offer
- **THEN** its state becomes shortlisted and it appears in the Shortlist view

### Requirement: Application stages
The system SHALL track each application through these stages: applied, screening call, technical interview, take-home or test task, fit or culture interview, final interview, offer received, accepted, and the closing states rejected (by them), declined (by me), withdrawn and no response. The owner SHALL be able to add custom stages in Settings.

#### Scenario: Move to technical interview
- **WHEN** the owner moves an application from screening call to technical interview
- **THEN** the stage changes and the transition is recorded in its timeline with date and optional note

#### Scenario: No response after 14 days
- **WHEN** an application stays in "applied" for 14 days without any update
- **THEN** the system suggests marking it "no response" and offers a follow-up reminder

### Requirement: Interviews and next steps
The system SHALL let the owner record interviews (type, date and time with time zone, interviewers, link, prep notes, outcome) and one current next step per application with a due date.

#### Scenario: Interview tomorrow
- **WHEN** an interview is scheduled within the next 24 hours
- **THEN** it appears in the dashboard's upcoming list and a reminder notification is sent once

### Requirement: Engagement details
For accepted freelance or contract work the system SHALL record rate, currency, weekly hours, start date and client contact, so that active engagements and total committed hours are visible.

#### Scenario: Capacity warning
- **WHEN** committed weekly hours across active engagements exceed the profile's weekly capacity
- **THEN** the dashboard shows a capacity warning

### Requirement: Timeline
The system SHALL keep an append-only timeline per offer and application of state changes, notes, drafts, interviews and emails matched to the application, marking which changes were made automatically from an email and which were undone.

#### Scenario: Review history
- **WHEN** the owner opens an application
- **THEN** the timeline lists every change in chronological order

#### Scenario: Change made from an email
- **WHEN** an email moved the application to Technical interview
- **THEN** the timeline shows the email entry and the stage change labelled "from email", with an Undo action while it can still be undone

### Requirement: Interview prep
The system SHALL generate an interview preparation plan with the drafting model, counted against the daily drafts cap, when an application moves to an interview stage (a built-in interview stage, or a custom stage whose label names an interview) that has no plan yet, and on demand from the application sheet. The plan SHALL contain the focus of the round, likely questions with why they are asked and an answer outline, strengths to highlight with evidence from the CV, gaps to prepare, questions to ask and a checklist. Figures not found in the CV, profile or offer SHALL be replaced with "[VERIFY: …]" and listed. The owner SHALL be notified when an automatic plan is ready; a failed generation SHALL NOT block the stage change.

#### Scenario: Moving to a technical interview
- **WHEN** the owner drags an application to "Technical interview"
- **THEN** a plan for that round is generated in the background, shown in the application sheet, and an "Interview prep ready" notification is sent

#### Scenario: Ungrounded figure
- **WHEN** an answer outline says "cut latency by 40%" and 40% is not in the CV
- **THEN** it reads "[VERIFY: 40%]" and appears under "Check before the interview"

### Requirement: Follow-up reminders
The system SHALL send a "follow_up" notification when an application has stayed in "Applied" with no update for each number of days in `notifications.follow_up_days` (default [7], up to five values, empty to disable). Each threshold SHALL fire once per period of inactivity; any update to the application resets the clock, and a late start sends only the largest threshold reached.

#### Scenario: Seven days without news
- **WHEN** an application has had no update for 7 days and the list is [7, 14]
- **THEN** one reminder is sent, and another only after 14 days if still without news

### Requirement: Response patterns
The dashboard SHALL show, across all applications, the response rate and the number reaching an interview grouped by source, engagement type, score band, time from posting to applying, whether a Job Radar draft was sent, and CV sent, noting when there are fewer than 15 applications.

#### Scenario: Comparing sources
- **WHEN** the owner opens "What gets responses" and picks "Source"
- **THEN** each source shows applications, replies, interviews and response rate, highest rate first

#### Scenario: Comparing CV variants
- **WHEN** the owner opens "What gets responses" and picks "CV sent"
- **THEN** each variant, the master CV and "Unknown" show applications, replies, interviews and response rate, highest rate first

### Requirement: Company research in interview prep
When an interview prep plan is generated and no company profile younger than 30 days exists, the system SHALL request research first (within the research cap) and SHALL include the profile's product summary, stage, recent news and red flags in the plan, with sources. If research is unavailable, the plan SHALL be generated without it and say so.

#### Scenario: Prep with recent news
- **WHEN** an application moves to technical interview and the company announced a product launch last month
- **THEN** the prep plan has a "Company context" section mentioning the launch with its source link

### Requirement: CV sent with an application
When CV variants exist, an application SHALL record which CV was sent: a variant or the master CV. "Mark as applied" SHALL pre-select the variant of the sent draft, else the recommended variant, and the owner SHALL be able to change it later from the application.

#### Scenario: Pre-selected on apply
- **WHEN** the owner marks an offer as applied whose sent draft was written for "Tech Lead"
- **THEN** the application records "Tech Lead" as the CV sent

#### Scenario: Changed afterwards
- **WHEN** the owner opens the application and changes the CV sent to "Master CV"
- **THEN** the application records the master CV and the timeline notes the change

#### Scenario: Applications created before variants
- **WHEN** an application was created before any variant existed
- **THEN** it shows no CV sent and is grouped as "Unknown" in response patterns
