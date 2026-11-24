# Spec Delta

## MODIFIED Requirements

### Requirement: Localhost only
All services SHALL bind to 127.0.0.1, including published Docker ports, the web app, the worker API and the browser login viewer. In the macOS app, the worker and web server SHALL also bind to 127.0.0.1, and the app window SHALL load only those localhost pages. The only supported way to reach the app from another device SHALL be the owner's own private-network proxy to the 127.0.0.1 web port (remote-access spec); the worker API and the login viewer SHALL stay reachable only from the machine itself.

#### Scenario: LAN access attempt
- **WHEN** another device on the network requests the web app port
- **THEN** the connection is refused

#### Scenario: LAN access to the macOS app
- **WHEN** another device on the network requests the macOS app's web or worker port
- **THEN** the connection is refused

#### Scenario: Phone on the owner's tailnet
- **WHEN** the owner has pointed `tailscale serve` at the web port and opens the tailnet name on the phone
- **THEN** the web app answers through that proxy, while the worker port still refuses connections from the phone
