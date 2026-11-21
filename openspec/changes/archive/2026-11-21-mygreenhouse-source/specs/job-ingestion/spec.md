## ADDED Requirements

### Requirement: MyGreenhouse logged-in source
The system SHALL offer a "MyGreenhouse (logged-in)" source, disabled by default, that reads my.greenhouse.io with the owner's session from the isolated browser profile. Each run SHALL read the job search for each of the owner's search keywords and the roles recommended to the owner, and store them as normalized offers that keep the Greenhouse board and job id.

#### Scenario: Recommended role imported
- **WHEN** MyGreenhouse recommends a remote Staff Engineer role at Northwind
- **THEN** a run stores it as an offer from the MyGreenhouse source with its Greenhouse job link, and it is scored like any other offer

#### Scenario: Same job from a polled board
- **WHEN** the same Greenhouse job is already known from Northwind's board in companies.yaml
- **THEN** the MyGreenhouse run does not create a second offer

#### Scenario: Logged out
- **WHEN** a run lands on the MyGreenhouse sign-in page
- **THEN** the source is marked "session expired" and the owner is notified to log in again

### Requirement: MyGreenhouse stays read-only
The MyGreenhouse source SHALL follow the read-only, paced browsing rules of browser-sessions and SHALL NOT click apply, quick apply, dream job, save or withdraw controls. The owner SHALL log in by hand, including the emailed one-time code, which the system never sees or stores.

#### Scenario: Quick apply button on a card
- **WHEN** a recommended role shows a "Quick apply" button
- **THEN** the run reads the card without clicking it, and any attempt to click it is blocked by the guard
