# Spec Delta

## ADDED Requirements

### Requirement: Links in messages
Links to Job Radar pages in Telegram messages and in the daily digest SHALL use the "Open links at" address from the owner's preferences (`notifications.link_base_url`: only an http or https address, with no path, query or fragment) when it is set, and the local web address otherwise. The address SHALL be stored only in the owner's local profile, editable from Settings, and SHALL never appear in tracked files.

#### Scenario: Strong match opened on the phone
- **GIVEN** "Open links at" is set to the owner's tailnet address
- **WHEN** a strong match alert is sent
- **THEN** its "Open in Job Radar" link points to that address followed by `/offers/<id>`

#### Scenario: No address set
- **WHEN** "Open links at" is empty and the digest is sent
- **THEN** its offer links point to the local web address, as before

#### Scenario: Address with a path
- **WHEN** the owner saves "Open links at" as `https://my-mac.tailnet-name.ts.net/offers`, copied from the phone's address bar
- **THEN** the preferences are not saved and the form says it must be only the address, without a path

#### Scenario: Invalid address
- **WHEN** the owner saves "Open links at" as `my-mac` without a scheme
- **THEN** the preferences are not saved and the form says the address must start with http:// or https://
