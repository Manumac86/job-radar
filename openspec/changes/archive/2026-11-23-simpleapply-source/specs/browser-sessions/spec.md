# Spec Delta

## ADDED Requirements

### Requirement: Reading the page's own data responses
A logged-in adapter SHALL be able to read the bodies of JSON responses that the page itself received from the site's own origin while loading. The adapter MUST NOT issue requests of its own, MUST NOT receive request headers, cookies or tokens, and the captured bodies SHALL be stored only as offer data, never in logs.

#### Scenario: Dashboard loads its jobs
- **WHEN** the SimpleApply dashboard page fetches its job matches as JSON
- **THEN** the adapter receives those response bodies and nothing else (no headers, no authorization values)

#### Scenario: Third-party responses
- **WHEN** the page also receives responses from analytics or image hosts
- **THEN** those responses are not passed to the adapter

#### Scenario: Secret scan
- **WHEN** the database, logs and run payloads are searched for the session's authorization value in a test fixture
- **THEN** no match is found
