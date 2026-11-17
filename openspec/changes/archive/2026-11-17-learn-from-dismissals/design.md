# Design

## Context

- Triage goes through `setTriage(db, offerId, triage, reason)` in `packages/db/src/queries/offers.ts`. The web actions (`apps/web/src/app/offers/[id]/actions.ts`) and the link import (`apps/worker/src/ingest/import.ts`) call it. The only trace of a dismissal is `offers.triage_reason` (free text) and a timeline event.
- Scoring is `scoreOfferWithModel(deps, profile, offer)` with `SCORING_SYSTEM` and `buildScoringPrompt` in `packages/core/src/scoring/prompt.ts`. The profile goes in as trusted JSON and the offer goes in wrapped in `<untrusted>`. `applyRules` enforces the hard caps after the model call.
- LLM calls go through `callStructured` with a per-kind daily budget. `kind: "extraction"` already exists, used by email parsing and link import.
- `ScoringService.rescoreOpen()` and `POST /scoring/rescore-open` already exist.
- The profile (CV, preferences) lives in files under `data/profile/` and is edited through `setPreferenceValues`. Everything else lives in SQLite.

## Goals / Non-Goals

**Goals:**
- One place that records every triage decision with structured reasons.
- A small, readable list of preferences the owner fully controls, used by scoring.
- Cheap: a learning run is one extraction call; scoring prompt grows by at most about 20 short lines.

**Non-Goals:**
- Embeddings, similarity search or fine-tuning.
- Dismiss buttons in Telegram (alerts stay link-only).
- Bulk dismiss from the offers table.
- Learning from interview outcomes; that is the response-patterns card's job.

## Decisions

**D1. Feedback in its own table, not on the offer.** `offer_feedback(id, offer_id FK cascade, kind dismissed|shortlisted|applied, reasons JSON string[], note, learnable bool, withdrawn_at, learned_at, created_at)`. `setTriage` takes an optional `feedback` object and writes the row in the same transaction. Restoring to "new" sets `withdrawn_at` on the offer's open feedback rows. `createApplication` records an `applied` row. `offers.triage_reason` keeps getting a readable summary ("Contract type, Location or time zone — US W2 only"), so existing screens and the timeline keep working.
*Alternative:* add columns to `offers`. Rejected because it keeps only the last decision, and learning needs history and positive signals.

**D2. Reason ids are a fixed enum in `@job-radar/core/offers`.** The ids are `salary`, `stack`, `seniority`, `company`, `location`, `contract`, `language`, `duplicate`, `other`, each with an English label. They live in the dependency-free subpath because the web bundles them.

**D3. Learned preferences stored in SQLite, not in `preferences.yaml`.** `learned_preferences(id, text ≤200, polarity avoid|prefer, status active|disabled, origin learned|owner, evidence JSON offer ids, created_at, updated_at)`. They carry metadata (evidence, origin) and change often; keeping them out of the hand-edited YAML avoids churn and merge noise there. Deleting a learned preference keeps a tombstone (`status = deleted`, hidden in the UI) so the model is told not to re-create it.
*Alternative:* a `learned:` list in `preferences.yaml`. Rejected: noisy file, no evidence links.

**D4. The learning run returns operations, not a whole new list.** Input to the model:
- The current preferences, each with id and lock state. Owner-origin preferences are read-only context; disabled and deleted ones are labeled "the owner rejected these".
- New learnable feedback, at most 60 items, oldest first. For each: the owner's reasons and note, trusted; and the offer summary (title, company, location/regions, engagement, compensation, listed skills, first 600 characters of the description), wrapped as untrusted.
- Up to 20 recent positive signals (shortlisted/applied) as counterexamples.

Output schema `learned_preferences` (strict zod) is `{ add: [{text, polarity, evidence}], update: [{id, text, evidence}], retire: [id] }`. The worker applies it:
- It ignores operations on owner or disabled preferences.
- It drops any text with a URL, `<`, or imperative patterns aimed at the model ("ignore", "system", "assistant").
- It drops duplicates of rejected preferences by normalized text.
- It drops evidence ids that were not in the input.
- It caps active preferences at 20.

Feedback rows sent get `learned_at`. On any LLM error, nothing is marked and the run is retried at the next trigger.
*Alternative:* the model returns the full list. Rejected because it can silently drop or rewrite preferences.

**D5. Triggers.** `LearningService` runs on a PQueue with concurrency 1:
- After a dismissal, the web calls `POST /learning/feedback-added` fire-and-forget via `after()`. The worker counts learnable, un-learned dismissals and runs at 5 or more.
- A daily cron at 04:20 Europe/Madrid runs if any un-learned feedback exists.
- `POST /learning/run` runs on demand.

`LlmCapReachedError` leaves everything pending.

**D6. Scoring prompt.** `buildScoringPrompt(profile, offer, learned?)` adds a trusted block "Owner's learned preferences (from past decisions)" listing `[avoid] …` / `[prefer] …`. `SCORING_SYSTEM` gains one rule: apply them to the relevant sub-scores and overall; for an avoid match add the red flag `Matches what you avoid: <text>`; never treat them as overriding eligibility or rate rules. `applyRules` runs after the model as today, so the cap at 30 holds regardless (spec: hard cap still wins). The scoring service reads active preferences from the DB per call; this is cheap.

**D7. Rate suggestion is deterministic.** After each dismissal with `salary`, a pure function checks the last 60 days of salary dismissals whose offer states a rate in the owner's currencies above the current minimum. When there are at least 2, it upserts a `preference_suggestions` row: `kind raise_min_hourly|raise_min_daily, currency, value, status pending|accepted|rejected`, unique on `(kind, currency, value)`. Hourly rates compare against `rates.min_hourly[currency]` and daily rates against `min_daily_eur`. The proposed value is the highest stated rate, rounded up to a multiple of 5. Accepting writes it through `setPreferenceValues`, and the profile service reloads as usual.

**D8. Rescore banner.** `learning_state` is a single key in the existing settings/kv store and holds `{ changedAt, rescoredAt }`. A learning run that changes active preferences, or an owner edit, bumps `changedAt`. The banner shows while `changedAt > rescoredAt` and counts open offers. "Rescore" calls the existing endpoint and sets `rescoredAt`; "Dismiss banner" sets `rescoredAt` without rescoring.

**D9. UI.**
- **Dismiss dialog:** checkbox chips (shadcn `ToggleGroup type="multiple"`), Textarea for the note, Switch for "Don't learn from this". For `company`, a Checkbox "Hide all offers from X", which reuses `preferencesWithCompanies` and `applyExclusionsNow`. A one-line hint explains that the reasons teach the scoring.
- **Settings:** new tab "Learning". It holds the preferences list (badge avoid/prefer, origin, status, evidence count with a popover of offer links), edit inline, disable/enable, delete, "Add preference", "Learn now", the suggestions card and the rescore banner.

## Risks / Trade-offs

- [Over-generalizing from few dismissals] → Positive signals are sent as counterexamples. Evidence counts are visible, and new learned preferences raise an in-app notification so the owner reviews them.
- [Prompt injection via offer text into a lasting preference] → Offer text is wrapped as untrusted. The output schema is strict and filtered (D4). Every preference is visible and owner-editable. Preferences only affect scoring, never actions.
- [Scores drift silently] → Every avoid match shows as a red flag on the offer. The rescore is the owner's choice.
- [Budget] → One extraction call per run, and at most a few runs a day. The run is skipped when the cap is reached.

## Migration Plan

- One Drizzle migration adds the three tables. Existing dismissed offers with a `triage_reason` get backfilled as feedback with reason `other` and that note, `learnable = true`, so the first run learns from history.
- Rollback: the tables are additive. Reverting the code leaves them unused.
