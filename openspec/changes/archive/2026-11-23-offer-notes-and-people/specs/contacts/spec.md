## Purpose

Keep the people behind each offer (recruiters, hiring managers, referrals) with their contact details next to the offer and its company, locally and privately.

## ADDED Requirements

### Requirement: People on an offer
The system SHALL let the owner add a person to any offer, applied or not, with a required name and optional role, LinkedIn URL, email, phone, other contact and note. The person SHALL belong to the offer's company. The owner SHALL be able to edit a person and remove a person from an offer. Adding and removing SHALL be recorded in the offer's timeline.

#### Scenario: Add a recruiter
- **WHEN** the owner adds "Jane Roe", role "Recruiter", LinkedIn "https://www.linkedin.com/in/jane-roe" to a Contoso offer they have not applied to
- **THEN** the offer's People list shows Jane Roe and the timeline shows "Added Jane Roe (Recruiter)"

#### Scenario: Invalid LinkedIn link
- **WHEN** the LinkedIn field holds a URL whose host is not linkedin.com
- **THEN** the person is not saved and the field shows the error

#### Scenario: Remove from offer
- **WHEN** the owner removes Jane Roe from the offer
- **THEN** she is no longer listed on that offer, she stays known at Contoso, and the timeline shows "Removed Jane Roe"

### Requirement: People known at a company
The system SHALL list, on an offer, the people already known at the same company through its other offers, and let the owner add one of them to this offer without typing the details again.

#### Scenario: Second offer at the same company
- **WHEN** Jane Roe was added to one Contoso offer and the owner opens another Contoso offer
- **THEN** "Known at Contoso" lists Jane Roe with "Add to this offer"

### Requirement: Contact details stay manual and private
The system SHALL show a LinkedIn URL as a link that opens in the browser, and SHALL offer Copy for email, phone and other contact. It SHALL never send, connect or message anyone. People's details SHALL stay in the local database, SHALL never be written to logs, and SHALL never be included in LLM prompts.

#### Scenario: Contacting a person
- **WHEN** the owner wants to write to Jane Roe
- **THEN** they open her LinkedIn or copy her email, and Job Radar makes no request to LinkedIn or any mail server

#### Scenario: Interview prep for an offer with people
- **WHEN** an interview prep plan is generated for an offer with people
- **THEN** the prompt contains none of their names or contact details
