# Spec Delta

## Purpose

Lets the owner use the same Job Radar web app from their other devices, such as a phone away from the Mac, over their own private network, without the app listening beyond 127.0.0.1.

## ADDED Requirements

### Requirement: Private network route
The web app SHALL work in full when the owner's own private-network proxy (`tailscale serve`) forwards an HTTPS name on their tailnet to the 127.0.0.1 web port. Every page and every action SHALL behave as at the Mac, including forms and server actions. The app SHALL NOT bind another interface, open another port, or run or configure the proxy itself.

#### Scenario: Shortlist from the phone
- **WHEN** the owner opens `https://<mac>.<tailnet>.ts.net/offers/<id>` on the phone and presses Shortlist
- **THEN** the offer is shortlisted, exactly as when pressed at the Mac

#### Scenario: Nothing new listens
- **WHEN** the app is running and the owner lists the listening sockets on the Mac
- **THEN** Job Radar's web and worker ports are bound to 127.0.0.1 only

### Requirement: Public tunnels refused
The web app SHALL refuse with HTTP 403, and without any page content, every request that arrives through a public tunnel of the owner's proxy (marked by the `Tailscale-Funnel-Request` header).

#### Scenario: Funnel turned on by mistake
- **WHEN** a request for `/offers` reaches the web app carrying `Tailscale-Funnel-Request: ?1`
- **THEN** the response is 403 and contains no offer data

#### Scenario: Private request
- **WHEN** a request for `/offers` reaches the web app from the owner's tailnet without that header
- **THEN** the offers page is served

### Requirement: Copying needs a secure page
When the UI is opened on a page that is not secure, such as plain http through a name, the copy buttons SHALL say that copying needs a secure address instead of failing silently.

#### Scenario: Copy over plain http
- **WHEN** the owner opens an offer over plain http through a name and presses Copy draft
- **THEN** a message says that copying needs a secure address, and nothing fails silently

### Requirement: Actions that happen on the Mac
When the UI is opened from another device, actions that open windows on the Mac SHALL say so, and links to addresses that only work on the Mac SHALL NOT be offered. Starting "Log in" for a logged-in source SHALL say that the login window opens on the Mac, and SHALL NOT show a link to the local login viewer.

#### Scenario: Log in from the phone
- **WHEN** the owner starts "Log in" for a logged-in source from Settings on the phone
- **THEN** the panel says the login window opens on the Mac and shows no 127.0.0.1 link

#### Scenario: Log in at the Mac
- **WHEN** the owner starts "Log in" from the app at the Mac
- **THEN** the panel behaves as before, including the local viewer link in Docker
