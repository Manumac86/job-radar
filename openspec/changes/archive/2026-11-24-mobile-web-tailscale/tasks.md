# Tasks

Work on a local branch `a-0045-mobile-web-tailscale` from `main`.

## 1. Route check and guide

- [x] 1.1 Live route check (D1, D2):
  - the owner runs `tailscale serve --bg http://127.0.0.1:3300` on the Mac;
  - a one-off Playwright smoke on the Mac opens the tailnet URL (passed in an environment variable, never written to a file), loads `/offers`, opens an offer and types in the people search, which is a read-only server action that must return results;
  - nothing in the data changes.

  Verified by the smoke passing, `tailscale serve status` showing only the HTTPS → 127.0.0.1:3300 mapping, and `lsof` showing Job Radar's ports on 127.0.0.1 only. If the action is refused, stop and switch to the D2 fallback with `openspec-update-change` before going on.
- [x] 1.2 Add the owner's tailnet hostname to `secrets/private-terms.txt`, so publishing refuses any tracked file that contains it. Verified by `scanTree` (scripts/lib/publish.ts) on a scratch tree holding the hostname reporting that file, and on `HEAD` reporting nothing.
- [x] 1.3 Write `docs/remote-access.md` with only fictional names (`my-mac.tailnet-name.ts.net`):
  - prerequisites: Tailscale on the Mac and the phone, MagicDNS and HTTPS certificates on;
  - the `serve` command for the macOS app (3300) and for Docker (3000);
  - checking with `tailscale serve status`;
  - opening the app on the phone;
  - turning it off with `tailscale serve reset`;
  - "never `funnel`";
  - troubleshooting (Mac asleep; copy buttons need the HTTPS name).

  Also add the localhost-rule note to `CLAUDE.md` rule 1, a "Remote access" link to the README, and a line to `apps/web/PRODUCT.md` (Platform). Verified by the guide's commands matching what 1.1 ran, the `scanTree` check on `HEAD` passing, and `pnpm check:local` passing.

## 2. Guard rails

- [x] 2.1 Add `isPublicTunnel(headers)` and `apps/web/src/proxy.ts`, which answers 403 with an empty body on every path when `Tailscale-Funnel-Request` is present (D3). Verified by Vitest cases (header present in any case, absent, empty) and a Playwright request test: `/offers` with the header returns 403 with no offer text; without it, 200.
- [x] 2.2 Add the `useIsRemote()` hook (D4). Verified by Vitest cases: false on the server and for `127.0.0.1`, `localhost` and `[::1]`; true for `my-mac.tailnet-name.ts.net`.
- [x] 2.3 Sessions panel: when remote, "Log in" says the login window opens on the Mac and hides the local viewer link. Verified by a Playwright test that loads Settings through a test hostname mapped to 127.0.0.1 (`--host-resolver-rules`) and sees the note and no 127.0.0.1 link, and by `sessions.spec.ts` staying green at 127.0.0.1.
- [x] 2.4 Guide: add "What stays on the Mac" (the worker, the login viewer, login windows) and "Funnel is refused" sections. Verified by reading them against 2.1 and 2.3.

## 3. Links that open on the phone

- [x] 3.1 Preferences schema: add the optional `notifications.link_base_url` (http or https only, trailing slash trimmed). The example profile leaves it unset. Verified by schema tests: a valid URL is kept; `my-mac` without a scheme and `ftp://` are rejected; the trailing slash is trimmed.
- [x] 3.2 The Telegram service (offer, pipeline and email links) and the digest use `link_base_url ?? webBaseUrl` for each message (D5). Verified by worker unit tests: a strong match alert, a pipeline link and the digest, each with and without the preference.
- [x] 3.3 Preferences form: add an "Open links at" field to the notifications section, with a short hint. It is also editable in YAML. Verified by a Playwright test:
  - saving an https address keeps it and does not suggest rescoring;
  - saving `my-mac` shows the scheme error and writes nothing.
- [x] 3.4 Guide: add the "Open links at" step. Verified by following it in 5.2.

## 4. Phone layout

- [x] 4.1 Add a Playwright `phone` project (390 × 844, `isMobile`, `hasTouch`) that runs only `tests/phone.spec.ts`. That file checks `scrollWidth <= 390` on Dashboard, Offers, offer detail, Pipeline, People, Sources, Notifications and Settings. Verified by the new test failing first on Dashboard and Settings, and the existing `chromium` project not running it.
- [x] 4.2 Dashboard: add `min-w-0` to the grid items, so wide tables scroll inside their cards (D7). Verified by the phone Dashboard check passing and the desktop dashboard tests staying green.
- [x] 4.3 Tag input: tags get `max-w-full` and wrap their text. Verified by the phone Settings check, with a seeded target role longer than the screen, and by `settings.spec.ts` at desktop width.
- [x] 4.4 People: show a stacked list below `md` (name, role, contacts, offers, edit, merge and delete) and keep the table from `md` up. Verified by:
  - a phone test that presses Edit on a seeded person and opens the dialog;
  - `people.spec.ts` and `people-directory.spec.ts` staying green, with selectors scoped to the visible variant where needed.
- [x] 4.5 Pipeline: use the `MouseSensor` (4 px), `TouchSensor` (about 250 ms hold) and `KeyboardSensor`, and give cards `touch-action: manipulation` (D6). Verified by phone tests through CDP touch events:
  - a sideways swipe that starts on a card scrolls the board and moves no card;
  - press-and-hold then drop on another column changes the stage, and the timeline records it;
  - a tap opens the sheet.

  `pipeline.spec.ts` and `pipeline-search.spec.ts` must stay green with the mouse.
- [x] 4.6 Capture every main screen at 390 px in light and dark (scratch captures, not committed) and fix anything clipped or overlapping. Verified by a review of the captures, and by all the phone checks passing.

## 5. Owner findings from the first iPhone check

- [x] 5.1 Sidebar: on a phone, choosing a page closes the sidebar. Verified by a phone test that opens the sidebar, taps Pipeline, and sees the pipeline with the sidebar closed.
- [x] 5.2 "Back to offers" on the offer detail: links from the offers list carry the list's query, and the link returns to `/offers` with it (or to `/offers` alone). Verified by a test that filters the list, opens an offer, presses the link and sees the same filters, and one that opens an offer directly and returns to the default list.
- [x] 5.3 A-0046: the dragged card is drawn in a dnd-kit `DragOverlay`, above every column; the original stays in place, dimmed. Verified by a desktop test that drags a card over another column and finds the card under the pointer, then cancels with Escape and sees nothing moved; `pipeline.spec.ts` and the phone board tests stay green.

## 6. Integration

- [x] 6.1 Run `pnpm verify`, then `pnpm test:ui`, which includes the phone project. Both must pass.
- [x] 6.2 Owner check from the iPhone over Tailscale, with the app built from the branch:
  - open the tailnet URL;
  - shortlist or dismiss an offer and copy a draft;
  - move a card by press-and-hold;
  - edit a person on People;
  - set "Open links at" and open a Telegram "Open in Job Radar" link on the phone;
  - see the "opens on the Mac" note when starting a log in.

  Verified by the owner's confirmation in chat (2026-11-24, "All good."), saved as ledger evidence. No screenshots were sent; gate 5 captures its own.

## 7. Gate 4 review fixes

- [x] 7.1 Settings → Status: the Telegram setup steps wrap, so the tab fits at 390 px. Verified by a phone test that opens every Settings tab and measures each one.
- [x] 7.2 "Open links at" keeps only the origin and refuses a path, query, fragment or credentials. Verified by schema tests (`/offers`, `?a=1&b=2`, a quote, `#top`, `user:pw@` refused; a port kept).
- [x] 7.3 Sessions panel wording that is true at the Mac too, and in Docker the viewer address as text, never as a link. Verified by `login-step.test.ts` and `remote-access.spec.ts`.
- [x] 7.4 Dashboard table spacing only below `md`, so desktop layouts do not change. Verified by the phone Dashboard check and by reading the built CSS: the rule sits inside the `max-md` media query.
- [x] 7.5 A phone test for the offer detail: copy draft, shortlist, back to new and the dismiss dialog at 390 px.

## 8. Gate 5 findings

- [x] 8.1 Phone offers list: an offer still waiting for a score showed "Awaiting" over its title (the 48 px score column, from the Star Atlas redesign). The column is 56 px and a status label sits under the dot. Verified by a phone test that checks every entry's score ends before its title, with an awaiting entry on screen.
- [x] 8.2 Copy (drafts and contacts) on a page that is not secure says that copying needs a secure address, instead of failing silently. Verified by a test that loads an offer over plain http through a name and presses Copy draft.
- [x] 8.3 The offer-detail phone test generates a draft when its offer has none, so it does not depend on the order of the test projects.

- [x] 8.4 Review of the gate 5 fixes: the insecure-copy test makes a draft when needed (no order dependence), the message no longer says "this Mac" (it only shows on another device), and the guide, spec (remote-access: Copying needs a secure page) and design record the message. Verified by `remote-access.spec.ts` and `openspec validate --strict`.

## Workflow follow-up

- Gate 4: review the local branch against `main` with the independent reviewer, fix confirmed findings with their tests, and merge only on the owner's order.
- Gate 5: verify A-0045's criteria on the live app, log `verified` and `closed`, then archive this change.
