# Design

## Context

See proposal.md (Why). The current state that shapes the approach:

- **The browser never calls the worker.** Pages and server actions call it from the Next server (`apps/web/src/lib/worker.ts`, `WORKER_URL` = `http://127.0.0.1:4000`). One proxied web port therefore carries the whole app.
- **Web ports.** The macOS app serves the web build on 127.0.0.1:3300 (Next standalone, `HOSTNAME=127.0.0.1`). Docker publishes it on 127.0.0.1:3000. The Docker login viewer is on 127.0.0.1:6080.
- **Next 16.4.6 checks the origin of Server Actions.** It accepts an action when the `Origin` host equals `X-Forwarded-Host` or `Host`, and nothing else checks the host in production.
- **What `tailscale serve` sends.** For HTTP targets it keeps the incoming `Host` and sets `X-Forwarded-Host`, `X-Forwarded-Proto: https` and `X-Forwarded-For`. It strips any identity headers sent by the client, then adds `Tailscale-User-*` for tailnet users. For traffic that comes through Funnel, it adds `Tailscale-Funnel-Request: ?1`.
- **Phone-width audit at 390 px (2026-11-23):**
  - the Dashboard lays out at 517 px, because two grid cards grow to the width of their tables;
  - Settings lays out at 400 px, because the Preferences tags are `shrink-0 w-fit`;
  - the People table is cramped, with its row actions cut off;
  - on a touch screen, cards cannot be moved: only the grip icon carries the drag listeners, and the browser cancels the pointer drag as soon as a swipe starts to scroll (so swipes already scroll; corrected during apply, the first audit said a swipe became a drag);
  - Offers, the offer detail, Sources and Notifications already fit.
- **Telegram and digest links** are built from `config.webBaseUrl`: `WEB_BASE_URL`, which the desktop runtime sets to its own 127.0.0.1 address. The Telegram service already reads live preferences through `ProfileService`. Changes under `notifications` already skip the rescore prompt (`affectsScoring`).

## Goals / Non-Goals

**Goals:**
- The built app, as served today by the macOS app and Docker, works unchanged behind `tailscale serve`.
- Guard rails live in the app, not only in the guide: Funnel traffic is refused.
- The phone fixes are minimal and keep the Star Atlas design. Desktop layouts do not change.

**Non-Goals:**
- Remote access to the dev server (`pnpm dev`); Next restricts dev origins and the route targets the built app.
- Any per-request authentication beyond what the tailnet already provides.
- Making Settings a phone layout. It only has to stop scrolling sideways.

## Decisions

### D1. The owner runs `tailscale serve`; the app never does
The guide gives `tailscale serve --bg http://127.0.0.1:3300` (or `:3000` for Docker). That command gives the Mac an HTTPS name on the tailnet with a certificate, and Job Radar's ports stay on 127.0.0.1.

**Alternatives considered:**
- **Bind the web server to the Mac's Tailscale address (100.x).** This adds a bind that the localhost rule forbids, and it serves plain HTTP: no secure context, so copying to the clipboard fails on the phone.
- **Bind to the LAN.** Rejected by the localhost rule, and it would not help away from home.
- **A public tunnel (Funnel, Cloudflare Tunnel, ngrok).** Rejected: it exposes the owner's job search to the internet.
- **A Settings switch that runs `tailscale serve`.** Rejected: the app would change system network configuration and depend on the Tailscale CLI. Keeping it owner-run keeps the app's network footprint unchanged.

### D2. No `allowedOrigins`; check it live first
Because the proxy keeps `Host` and sets `X-Forwarded-Host` to the same name, the origin check passes with the current `next.config`. Task 1.1 confirms it against the owner's running app before anything else is built.

**Alternative: `serverActions.allowedOrigins`.** It would need the owner's hostname, which is personal and must not be tracked, or the wildcard `*.ts.net`, which admits any tailnet's origin. Standalone builds also freeze `next.config` at build time, so the value could not come from the environment at runtime. It stays a fallback, noted in Risks, used only if 1.1 fails.

### D3. Refuse Funnel in `apps/web/src/proxy.ts`
A Next 16 proxy (formerly middleware) that matches every path answers `403` with an empty body whenever the request carries `Tailscale-Funnel-Request`. The check is a pure function `isPublicTunnel(headers)`, unit-tested on its own.

**Alternatives considered:**
- **Trust the guide alone.** Rejected: one wrong command (`funnel` instead of `serve`) would publish everything.
- **Require `Tailscale-User-Login` on every non-loopback request.** Stronger, but it also refuses tagged devices and any other local proxy a self-hoster might use. Considered and left out; the guide covers ACLs instead.
- **Refuse in the worker.** Pointless, since the worker is never proxied.

### D4. "Am I remote?" is decided in the browser
A small hook, `useIsRemote()`, reads `window.location.hostname` through `useSyncExternalStore`. It returns false on the server and for `127.0.0.1`, `localhost` and `[::1]`, and true for any other host. Only client components need it, starting with the sessions panel's login step.

**Alternatives considered:**
- **Read the request's `Host` on the server and pass it down.** This makes server components depend on request headers and threads a prop through layouts, for one client-side message.
- **Detect the `Tailscale-User-Login` header.** This ties the UI to Tailscale, and the header is not visible to the client.

### D5. "Open links at" is a preference, not an environment variable
A new optional `notifications.link_base_url` in the preferences schema: an http(s) address with no path, query, fragment or credentials, kept as its origin (so links append their own path and the value is safe inside an `href`). A path is refused rather than dropped, because the usual mistake is pasting a page address from the phone (found in the gate 4 review). It is edited in the Preferences form's notifications section and in YAML. The Telegram service and the digest choose the link base per message: `link_base_url ?? config.webBaseUrl`. The example profile leaves it unset, and the live value lives in the git-ignored profile folder.

**Alternatives considered:**
- **`WEB_BASE_URL` alone.** In the macOS app it is set at launch from the app's own port, so the owner cannot change it. In Docker it means editing `.env` and restarting. It stays as the fallback.
- **Auto-detect with `tailscale status --json`.** The worker would run a system binary and guess whether serve is on.
- **Remember the host the UI was last opened from.** Surprising, and wrong when the owner opens it from another computer.

### D6. Touch on the board: press-and-hold
The board replaces `PointerSensor` with:
- `MouseSensor` (4 px distance, so the desktop behaves as today);
- `TouchSensor` (about 250 ms hold, small tolerance);
- `KeyboardSensor`.

Cards get `touch-action: manipulation`, so swipes scroll. The touch listener goes on the whole card, so the hold works anywhere on it; the mouse and keyboard listeners stay on the grip, so the desktop is unchanged. On touch screens the card also turns off text selection and the long-press callout. A tap still opens the application sheet, whose Stage control is the precise way to move a card.

**Alternatives considered:**
- **Drag only by the grip icon.** The target is too small for a thumb.
- **Turn dragging off on touch and rely on the sheet.** Simpler, but it loses direct manipulation that the board spec promises.
- **Keep `PointerSensor` and add a delay.** A delay on `PointerSensor` also delays mouse drags on the desktop.

### D7. Phone layout fixes reuse existing patterns
- **Dashboard:** its grid items get `min-w-0`, so wide tables scroll inside their cards.
- **Tag input:** tags get `max-w-full` and wrap their text.
- **People:** follows the offers list pattern, a stacked `<ol>` below `md` and the table from `md` up, with the same row actions.

No new breakpoints or components.

**Alternatives considered:**
- **Let the People table scroll sideways inside its card.** This keeps the actions off-screen, which is what the audit found.
- **A separate mobile route.** It would duplicate pages for one person's use.

### D8. Tests at phone width
A Playwright project `phone` (390 × 844, `isMobile`, `hasTouch`, Chromium) runs `tests/phone.spec.ts`:
- **Layout:** every main route has `document.documentElement.scrollWidth <= 390`. With `isMobile`, an overflowing page widens the layout viewport, which is how the audit measured it.
- **People:** each person has an entry whose actions can be pressed.
- **Board:** a swipe does not move a card, a press-and-hold drag does (touch events dispatched through CDP), and a tap opens the sheet.
- **Funnel:** a request carrying the header gets 403.
- **Log in:** the login step shows the "opens on the Mac" note when the page is loaded through a non-loopback host. Playwright maps a test hostname to 127.0.0.1 with `--host-resolver-rules`.

Unit tests (Vitest) cover `isPublicTunnel`, the preferences schema, and the link base in Telegram and digest messages. Existing desktop-width suites stay as they are.

## Risks / Trade-offs

- **[Anyone on the owner's tailnet can use the app; there is no sign-in]** → The guide recommends not sharing the Mac with other tailnet users and restricting it with ACLs. Funnel is refused (D3).
- **[The live check in 1.1 fails on the owner's Tailscale version]** → Fallback: a build-time `JOB_RADAR_ALLOWED_ORIGINS`, read when the owner builds the macOS app locally from `secrets/`. It is documented as local-build-only and never set in released images.
- **[The duplicate People DOM (list and table) breaks text selectors in existing tests]** → Scope selectors to the visible variant, as `import.spec` did for the offers list.
- **[A Telegram link to the tailnet address opened on a device without Tailscale fails]** → This is the owner's choice. The Mac is on the tailnet too, so the same links still open at the Mac.
- **["Remote" means any address other than 127.0.0.1, localhost or [::1], not another device]** → Opening the tailnet name at the Mac (for example from a Telegram link) also counts. The sessions panel's wording is true either way: it says the login happens on the Mac, and in Docker it names the viewer address as text instead of linking to it (found in the gate 4 review).
- **[Copying needs a secure page]** → The guide uses only the HTTPS name that `tailscale serve` provides. Opened over plain http through a name, the copy buttons say that copying needs a secure address instead of failing silently (found in gate 5).
- **[The Mac sleeps]** → Out of scope: the owner's Mac never sleeps. The guide's troubleshooting mentions it.

## Migration Plan

Nothing to migrate: the preference is optional, and the new proxy only refuses Funnel traffic. To turn remote access off, the owner runs `tailscale serve reset`. Rolling back the code change restores today's behavior exactly.
