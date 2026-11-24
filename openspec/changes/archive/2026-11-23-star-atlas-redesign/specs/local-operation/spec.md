## ADDED Requirements

### Requirement: Bundled UI fonts
The system SHALL ship the web UI's fonts with the app and SHALL NOT request fonts or other assets from a font service or CDN, when building or when running.

#### Scenario: Offline start
- **WHEN** the app is built and opened with no network connection
- **THEN** every page renders in its own fonts and no request leaves 127.0.0.1
