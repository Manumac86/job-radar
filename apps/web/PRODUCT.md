# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

The UI is a Next.js app served on 127.0.0.1. It runs in the browser, in Docker, or inside the macOS app (`apps/desktop`, an Electron window). The macOS app follows the system appearance. Away from the Mac, the owner opens the same web app on a phone through their own Tailscale Serve (`docs/remote-access.md`), so every screen works 390 px wide.

## Users

Primarily the owner: one person looking for remote jobs and freelance projects, who installs and runs Job Radar on their own machine. Its main use is a **daily triage session**: once or twice a day the owner sits down at a laptop or monitor and works through it in one focused stretch:

- go through new offers;
- shortlist or dismiss them;
- read scores and company research;
- copy drafts and apply by hand on the company site;
- move applications through the pipeline;
- keep notes and people.

The code is open source and published with releases. Other job seekers may install it, but the owner's own workflow comes first (confirmed).

## Product Purpose

Job Radar finds offers from many sources and turns them into a manageable, honest pipeline:

- **Sources:** ATS boards, job feeds, Hacker News, YC, job-alert emails, logged-in sites through an isolated browser profile, SimpleApply, links.
- **Processing:** de-duplicates and pre-filters the offers, scores each one against the owner's CV and preferences with an LLM, drafts applications, and tracks every application from Applied to Offer, including replies read from the owner's mailboxes.

Success means the owner spends the session deciding and applying, not sorting, and never loses track of an application, a reply or a person.

## Positioning

- **Local and private:** everything runs on 127.0.0.1, and the data stays on the owner's machine. There is no telemetry, no account and no API key: it uses the owner's own Claude Code login.
- **Never acts on the owner's behalf:** no auto-apply, no form filling, no messages. Drafts are copied and sent by hand.
- **Honest scoring:** sub-scores, eligibility caps, rationale and red flags; an unknown rate is shown as unknown, never estimated.

## Operating Context

- **The daily triage session:**
  - Offers list (filters, sort, search) → offer detail (score breakdown, company card, drafts, people, timeline) → Shortlist, Dismiss with a reason, or Mark as applied.
- **Pipeline board:**
  - drag a card between stages;
  - the drawer shows stage, notes, people, CV sent, interview prep, interviews, next step and engagement.
- **Dashboard:** metrics, offers ingested per day by source, the funnel, response rate by source, and the next 7 days.
- **Supporting screens:** People (directory), Sources (runs, logs, logged-in sessions), Notifications (in-app and Telegram), Settings (preferences form/YAML, CV variants, mail accounts, learning, desktop).
- **Notifications:** Telegram and macOS for strong matches and reminders.

## Capabilities and Constraints

- English UI copy.
- The UI must handle many rows: hundreds or thousands of offers, dense tables and boards (confirmed: density beats airiness).
- Light and dark themes are both first-class (confirmed).
- Component stack: Next.js 16 App Router, React 19, Tailwind v4 and shadcn/ui; stay on this stack, with no new UI library (confirmed).
- Every interaction is local. Nothing in the UI may send, submit, connect or message on third-party sites; external links only open in the browser, and contacts are copied.
- Terminology:
  - offer, source, run;
  - score class: strong ≥ 80, possible ≥ 60, weak;
  - triage: new, shortlisted, dismissed, filtered;
  - application and stage;
  - draft, CV variant, company research;
  - people, note, timeline.
- Test suites (Playwright) select elements by role, label, text and `data-testid`. A redesign keeps those contracts or updates the tests with it.

## Brand Commitments

- Name: **Job Radar**. The current mark is a radar icon (lucide `Radar`) in the sidebar.
- Fixtures, demo data and screenshots use fictional companies and people only, never real personal data.

## Evidence on Hand

- A demo data seed (`apps/web/scripts/demo-seed.ts`) and a UI test seed (`apps/web/tests/seed.ts`), both with fictional data.
- README screenshots in `docs/images/` and a portfolio entry built from fictional data.
- There are no testimonials, users or metrics to cite, and none may be invented.

## Product Principles

1. **The session is the unit.** Every screen should make the next decision obvious and fast; triage and pipeline work outrank browsing and configuration.
2. **Show the truth plainly.** Scores, caps, unknown rates, automatic changes ("from email", "from MyGreenhouse") and their Undo are visible, never hidden behind a friendlier story.
3. **The owner acts, the tool prepares.** Copy, open, draft and suggest; never send.
4. **Dense but calm.** Lots of information at once, organized so the eye finds the score, the company and the next action first.
5. **Private by construction.** Nothing in the interface suggests data leaves the machine, because it does not.
