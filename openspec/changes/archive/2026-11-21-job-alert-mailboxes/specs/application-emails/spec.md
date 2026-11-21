## MODIFIED Requirements

### Requirement: Email accounts
The owner SHALL be able to add, edit, disable, test and remove any number of IMAP email accounts in Settings, each with a label, address, host, port and folders to read for replies (default INBOX), with presets for Gmail and iCloud. Each account SHALL also have job-alert settings: a "Job alerts" switch, alert folders or labels, and "Also look in INBOX" (see job-ingestion "Job-alert emails from email accounts"). The app password SHALL be entered in a write-only field, stored only under `secrets/`, never displayed again and never logged.

#### Scenario: Add an iCloud account
- **WHEN** the owner picks the iCloud preset, enters the address and an app-specific password, and presses "Test connection"
- **THEN** the system connects read-only, reports success with the number of messages in INBOX, and saves the password to a file under `secrets/`

#### Scenario: Password stays hidden
- **WHEN** the owner reopens the account
- **THEN** the password field is empty and says a password is saved, and no response or log contains the password

#### Scenario: Wrong password
- **WHEN** the server rejects the login
- **THEN** the account shows an error naming the account and how to create an app password for that provider, and the other accounts keep working

#### Scenario: Turn on job alerts for an account
- **WHEN** the owner turns on "Job alerts" for an account, enters the label `job-alerts`, and presses "Test connection"
- **THEN** the test also reports how many messages the `job-alerts` folder holds, or says the folder does not exist
