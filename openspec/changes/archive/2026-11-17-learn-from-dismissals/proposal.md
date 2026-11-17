# Proposal

## Why

Dismissing an offer today only stores an optional free-text reason on the offer; scoring never reads it, so Claude keeps rating similar offers just as high and the owner dismisses the same kind of offer again and again. The owner wants the radar to learn from these decisions, and to know what to write so it learns well.

## What Changes

- The Dismiss dialog asks for structured reasons (multi-select): salary too low, stack or technologies, seniority, company or sector, location or time zone, contract type, language, duplicate or already seen, other; plus an optional note and a "Don't learn from this" switch (on by default only for "duplicate"). For "company or sector" it also offers "Hide all offers from <company>" (the existing hidden-companies feature).
- Every dismissal, shortlist and application is recorded as feedback. Restoring a dismissed offer withdraws its feedback.
- A learning job, using the owner's Claude subscription and the extraction budget, condenses feedback into a short list (at most 20) of plain-language **learned preferences** ("Avoid crypto and web3 companies", "Prefer EU-only remote roles"). It runs after 5 new learnable dismissals, once a day, or on demand.
- Scoring includes the active learned preferences as owner preferences: offers that match an "avoid" preference score lower and show a red flag naming it; "prefer" matches score higher. They never override hard caps (eligibility, minimum rate).
- Settings gets a "What Job Radar learned" section: see each preference with the dismissals behind it, edit it (an edited preference is locked against the learning job), disable it, delete it, add one by hand, or run "Learn now".
- Deterministic suggestions that need the owner's acceptance: raise the minimum rate after repeated "salary too low" dismissals of offers that state a rate above the current minimum.
- After learned preferences change, the app offers "Rescore open offers" with the number of offers and scoring calls it will use (existing rescore, same daily budget).

## Capabilities

### New Capabilities

- `offer-feedback`: capturing the owner's triage decisions with structured reasons, condensing them into owner-visible learned preferences, and suggesting changes to hard preferences.

### Modified Capabilities

- `job-scoring`: the scoring prompt includes active learned preferences, with their effect on the score and red flags.
- `job-dashboard`: the Dismiss action on the offer detail screen collects structured reasons instead of free text only.

## Impact

- `packages/db`: new tables `offer_feedback`, `learned_preferences`, `preference_suggestions`; migration; queries.
- `packages/core`: dismiss reason enum, learning prompt and schema (`learned_preferences`), scoring prompt and system text.
- `apps/worker`: learning service (queue, cron, threshold trigger), routes `POST /learning/run`, suggestion generation; scoring service passes learned preferences.
- `apps/web`: dismiss dialog, server actions, Settings section, rescore banner.
- LLM budget: one extraction call per learning run (at most a few per day). No new dependencies. Existing free-text `triage_reason` stays and receives a readable summary of the reasons.
