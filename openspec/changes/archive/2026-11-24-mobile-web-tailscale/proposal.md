# Proposal

## Why

Today Job Radar can only be used at the Mac. Away from it, the only way in is the Telegram bot, which offers alerts, `/digest` and `/status`. The owner wants the same web app on the iPhone, reached over their own private Tailscale network, with no Siri, no new ports and nothing exposed beyond their own devices. This is ledger item A-0045, which replaces the deferred Siri item A-0029.

The architecture already allows it. The browser only talks to the web server, and the web server calls the worker on 127.0.0.1 (`apps/web/src/lib/worker.ts`), so a proxy in front of the web port is enough. `tailscale serve` keeps the request's `Host` and sets `X-Forwarded-Host`, which Next's Server Actions origin check accepts. What's missing:

- a phone-width layout for a few screens;
- touch dragging on the board;
- message links that open on the phone;
- guard rails that keep the route private.

## What Changes

- **Remote access route, set up by the owner.** The owner's own `tailscale serve` proxies an HTTPS name on their tailnet to the 127.0.0.1 web port: 3300 for the macOS app, 3000 for Docker. Job Radar keeps binding only 127.0.0.1, opens no new port and never runs or configures Tailscale itself.
- **Public tunnels refused.** The web app answers 403, with no page content, to any request that arrives through Tailscale Funnel (the `Tailscale-Funnel-Request` header).
- **Phone-width layout.** At 390 px no screen scrolls sideways as a page:
  - **Dashboard:** today two cards force a 517 px page; they stay within the width.
  - **Settings:** long tags in the Preferences form wrap instead of pushing the page to 400 px.
  - **People:** on narrow screens each person is a stacked entry, and the edit and merge actions stay reachable.
  - **Offers:** the filter row scrolls sideways on its own, as it does today.
- **Pipeline by touch.** With a finger, a press-and-hold picks up a card and a swipe still scrolls the board and the columns. A tap still opens the card's sheet, where the existing Stage control moves it.
- **Actions that happen on the Mac.** When the UI is opened from another device, "Log in" for a logged-in source says the login window opens on the Mac. In Docker, it does not offer the 127.0.0.1 login-viewer link, which that device cannot open.
- **Links that open on the phone.** A new preference, `notifications.link_base_url` (labeled "Open links at" in Settings → Preferences, and also editable in YAML), is the address used by links in Telegram messages and the daily digest. Without it, links keep using the local address. It lives only in the owner's local profile.
- **Documentation:**
  - a "Remote access" guide (`docs/remote-access.md`) covering `tailscale serve`, HTTPS, checking from the phone, and never using Funnel;
  - a note on the localhost rule in `CLAUDE.md` and the README.

**Non-goals:**
- Siri or voice;
- a native iPhone app;
- a home-screen web app manifest or offline mode;
- a sign-in screen (the owner's tailnet is the boundary);
- binding any interface other than 127.0.0.1;
- the app running Tailscale commands;
- optimizing Settings for the phone beyond "works without sideways scrolling".

## Capabilities

### New Capabilities
- `remote-access`: reaching the web app from the owner's other devices over their own private network. Covers the supported route, refusing public tunnels, and telling the owner when an action happens on the Mac.

### Modified Capabilities
- `local-operation`: modifies "Localhost only" to name the owner's private-network proxy to the 127.0.0.1 web port as the only remote route, while every service still binds 127.0.0.1.
- `job-dashboard`:
  - adds "Phone-width layout";
  - modifies "Pipeline board", where touch picks up a card with a press-and-hold and swipes keep scrolling.
- `notifications`: adds "Links in messages": Telegram and digest links use the "Open links at" address when it is set.

## Impact

- **`apps/web`:**
  - a new `src/proxy.ts`, which refuses Funnel requests;
  - a remote-view hook;
  - the Dashboard grid, the tag input, the People page layout, the pipeline board's sensors, and the sessions panel;
  - the "Open links at" field in the Preferences form.
- **`packages/core`:** the preferences schema and example gain `notifications.link_base_url`, optional and checked as an http(s) URL.
- **`apps/worker`:** the Telegram service and the digest build links from the preference, falling back to `WEB_BASE_URL`.
- **Docs:** `docs/remote-access.md`, the README and `CLAUDE.md` rule 1.
- **Tests:** a Playwright phone project at 390 px (no sideways page scroll on every screen, touch drag and tap on the board, People actions), plus unit tests for the Funnel refusal and the link address.
- **Unchanged:** no new dependency, and no change to ports, Docker Compose, the desktop runtime or the worker API.
