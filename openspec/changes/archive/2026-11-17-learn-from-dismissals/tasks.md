# Tasks

## 1. Data and core

- [x] 1.1 Add `DISMISS_REASONS` (ids + labels) and `summarizeDismissal(reasons, note)` to `@job-radar/core/offers`, with unit tests
- [x] 1.2 Add tables `offer_feedback`, `learned_preferences`, `preference_suggestions` and the "learned_preferences" notification kind; generate the migration with a backfill of existing dismissed offers that have a `triage_reason`
- [x] 1.3 Extend `setTriage` with an optional feedback object (same transaction; summary into `triage_reason`), withdraw open feedback on restore to "new", record `applied` feedback in `createApplication`; db tests
- [x] 1.4 Queries for learned preferences (list, active, create, update with owner lock, disable/enable, delete as tombstone) and for pending feedback, positive signals and rate suggestions; db tests

## 2. Learning

- [x] 2.1 Learning prompt and strict `learned_preferences` operations schema in `packages/core`; `applyLearningOps` with the filters from design D4 (locks, URL/instruction filter, rejected-duplicate check, evidence ids, cap 20); unit tests including an injection attempt in offer text
- [x] 2.2 `LearningService` in the worker (PQueue concurrency 1, threshold trigger at 5, daily cron 04:20 Europe/Madrid, budget-aware), in-app notification "Job Radar learned N new preferences", routes `POST /learning/run` and `POST /learning/feedback-added`; FakeLlmClient sample; worker tests
- [x] 2.3 Deterministic rate suggestion (design D7) after salary dismissals; unit and db tests

## 3. Scoring

- [x] 3.1 Add the learned-preferences block to `buildScoringPrompt` and the rule to `SCORING_SYSTEM`; scoring service passes active preferences; tests that disabled ones are not sent and that the cap at 30 still holds

## 4. Web

- [x] 4.1 New dismiss dialog: reason chips, note, "Don't learn from this" switch (auto on for duplicate only), "Hide all offers from X" for company; server action with zod; fire-and-forget `feedback-added`; offer detail shows reasons and note
- [x] 4.2 Settings "Learning" tab: list with polarity, origin, status, evidence popover; inline edit, disable/enable, delete, add, "Learn now"
- [x] 4.3 Rate suggestions card (accept writes preferences via `setPreferenceValues`, reject hides it) and the rescore banner on Settings and the offers list (design D8)
- [x] 4.4 Playwright: dismiss with reasons, learn now with FakeLlmClient, see and edit a learned preference, accept a rate suggestion, rescore banner

## 5. Docs and verify

- [x] 5.1 README section "How Job Radar learns from your dismissals" (what to pick, what each reason teaches, how to undo)
- [x] 5.2 Run `pnpm verify`, commit locally
- [x] 5.3 Owner check: dismiss a few real offers with reasons, run "Learn now", review the learned list, rescore and confirm the red flags on similar offers
