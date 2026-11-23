## MODIFIED Requirements

### Requirement: People on an offer
The system SHALL let the owner add a person to any offer, applied or not, with a required name and optional role, company, LinkedIn URL, email, phone, other contact and note. A new person added from an offer SHALL default to the offer's company, and a person MAY be linked to offers of any company. The owner SHALL be able to edit a person and remove a person from an offer. Adding and removing SHALL be recorded in the offer's timeline.

#### Scenario: Add a recruiter
- **WHEN** the owner adds "Jane Roe", role "Recruiter", LinkedIn "https://www.linkedin.com/in/jane-roe" to a Contoso offer they have not applied to
- **THEN** the offer's People list shows Jane Roe and the timeline shows "Added Jane Roe (Recruiter)"

#### Scenario: Invalid LinkedIn link
- **WHEN** the LinkedIn field holds a URL whose host is not linkedin.com
- **THEN** the person is not saved and the field shows the error

#### Scenario: Remove from offer
- **WHEN** the owner removes Jane Roe from the offer
- **THEN** she is no longer listed on that offer, she stays in the owner's people, and the timeline shows "Removed Jane Roe"

#### Scenario: Agency recruiter on offers of two companies
- **WHEN** Jane Roe works at Northwind Talent and the owner links her to a Contoso offer and a Fabrikam offer
- **THEN** both offers list Jane Roe, and her company stays Northwind Talent

### Requirement: People known at a company
The system SHALL list, on an offer, the people who work at the offer's company or are linked to its other offers, and let the owner add one of them to this offer without typing the details again.

#### Scenario: Second offer at the same company
- **WHEN** Jane Roe was added to one Contoso offer and the owner opens another Contoso offer
- **THEN** "Known at Contoso" lists Jane Roe with "Add to this offer"

## ADDED Requirements

### Requirement: Find and link an existing person
The system SHALL let the owner search all their people from an offer, by name, email, LinkedIn, other contact or company, and link the chosen person to the offer. When no one matches, the owner SHALL be able to create a new person from the typed name.

#### Scenario: Link an existing recruiter
- **WHEN** the owner types "jane" in "Add person" on a Fabrikam offer and Jane Roe of Northwind Talent exists
- **THEN** Jane Roe is listed with her company, and choosing her links her to the offer and records "Added Jane Roe (Recruiter)"

#### Scenario: Nobody matches
- **WHEN** the owner types "Sam Lee" and no person matches
- **THEN** "Create Sam Lee" opens the person form with the name filled in

### Requirement: Duplicate people
The system SHALL refuse to create or save a person whose LinkedIn profile or email already belongs to another person, ignoring case, the `www` or country subdomain, query strings and trailing slashes. It SHALL show the existing person's name and offer to use that person instead.

#### Scenario: Same LinkedIn profile
- **WHEN** Jane Roe exists with "https://www.linkedin.com/in/jane-roe" and the owner creates "J. Roe" with "https://es.linkedin.com/in/Jane-Roe/"
- **THEN** nothing is saved, the form says Jane Roe already has this LinkedIn profile, and "Use Jane Roe" links her to the offer

### Requirement: People page
The system SHALL provide a People page that lists every person with their role, company, contacts and the offers they are linked to, with a search over name, email, LinkedIn, other contact and company, and editing as on an offer.

#### Scenario: Browse people
- **WHEN** the owner opens People and searches "northwind"
- **THEN** Jane Roe is listed with her company Northwind Talent and links to the Contoso and Fabrikam offers she is on

### Requirement: Merge and delete people
The system SHALL let the owner merge two people from the People page, keeping one: the other's offer links move to the one kept, the kept person's empty fields are filled from the other, and the other is deleted. The owner SHALL be able to delete a person after confirming: the person leaves every offer, and existing timeline entries stay unchanged.

#### Scenario: Merge a duplicate
- **WHEN** "Jane Roe" (LinkedIn, on a Contoso offer) and "Jane R." (email, on a Fabrikam offer) are merged keeping Jane Roe
- **THEN** one Jane Roe remains with both the LinkedIn and the email, linked to both offers

#### Scenario: Delete a person
- **WHEN** the owner deletes Jane Roe and confirms
- **THEN** she is gone from the People page and from every offer, and the offers' timelines still show "Added Jane Roe (Recruiter)"
