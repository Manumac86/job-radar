# Tasks

## 1. Repository and local-only guardrails

- [x] 1.1 Initialize pnpm workspace with Turborepo (telemetry disabled, local cache only) (`apps/web`, `apps/worker`, `packages/db`, `packages/core`, `packages/sources`) with TypeScript strict, ESLint and Prettier; verify `pnpm typecheck` (via `turbo run typecheck`) passes on empty packages
- [x] 1.2 Add `.gitignore` for `data/`, `secrets/`, `.env*`, build output; verify `git check-ignore data/x secrets/x` matches both
- [x] 1.3 Add `.githooks/pre-push` (always exits 1), a root `prepare` script that sets `core.hooksPath` on `pnpm install`, and `pnpm check:local` that fails if any git remote exists; verify by adding a dummy remote, running the check (fails), removing it (passes)
- [x] 1.4 Add `pnpm verify` (turbo typecheck, lint, test, then check:local, which also fails if Turborepo telemetry is enabled or a remote cache is configured); verify it runs green

## 2. Database

- [x] 2.1 Define the Drizzle schema from design D9 in `packages/db` and generate the first migration; verify the migration applies to a fresh SQLite file
- [x] 2.2 Open SQLite with WAL and busy_timeout and export typed query helpers for offers, applications and runs; verify with Vitest tests on a temp database
- [x] 2.3 Add daily backup (keep 14) and `pnpm db:restore <file>` with confirmation; verify a test that backs up, mutates and restores

## 3. Candidate profile

- [x] 3.1 Define zod schemas for `data/profile/preferences.yaml` and load `data/profile/cv.md`; ship example files built from the owner's CV; verify invalid fields produce readable errors in a unit test
- [x] 3.2 Expose profile load status and errors through the worker API; verify with a supertest test

## 4. LLM layer

- [x] 4.1 Implement `packages/core/llm` with AI SDK v7 and `ai-sdk-provider-claude-code` v4, tools disabled, no MCP, temp cwd, model names from settings; verify a smoke script returns a schema-valid object when the CLI is logged in, and a clear "not authenticated" error when it is not
- [x] 4.2 Add LLM usage accounting and daily caps (local-operation spec); verify unit tests for cap reached and reset at midnight Europe/Madrid
- [x] 4.3 Wrap untrusted offer text in prompts and validate outputs with zod plus one retry; verify a test with a prompt-injection fixture still returns a valid score and no extra fields

## 5. Ingestion: public sources

- [x] 5.1 Build the source registry, run log, scheduler (node-cron) and queue (p-queue); verify a fake source runs on schedule and records counts in `runs`
- [x] 5.2 Implement normalization, keyword pre-filter and de-duplication rules from the job-ingestion spec; verify unit tests for duplicate across sources and excluded keyword
- [x] 5.3 Implement Greenhouse, Lever and Ashby adapters reading `companies.yaml`; verify fixture tests and one live dry run printing counts
- [x] 5.4 Implement HN "Who is hiring", RemoteOK and We Work Remotely adapters; verify fixture tests
- [x] 5.5 Implement the job-alert email adapter (imapflow, read-only label) with parsers for LinkedIn, Upwork, Malt and Wellfound alerts and an LLM fallback; verify with saved `.eml` fixtures
- [x] 5.6 Add polite fetching (user agent, backoff, stop after 5 failures); verify with a mocked 429 server
- [x] 5.7 Implement the Y Combinator jobs adapter (public `ycombinator.com/jobs` role pages, embedded data with HTML fallback, batch, equity and visa terms) with roles from `preferences.yaml`; verify a fixture test and a live dry run listing remote engineering roles

## 6. Scoring

- [x] 6.1 Implement structured scoring, hard eligibility caps and score classes from the job-scoring spec; verify unit tests: US-only offer capped at 30, below-minimum rate flagged
- [x] 6.2 Score new offers after each run and support "Rescore open offers"; verify score history is kept after a rescore

## 7. Drafts

- [x] 7.1 Implement draft generation with grounding rules, versions and "verify before sending" list; verify a test where a missing metric yields a placeholder, not a number
- [x] 7.2 Auto-draft strong matches and expose regenerate-with-instruction via the worker API; verify with supertest

## 8. Notifications

- [x] 8.1 Implement the in-app notification store and API; verify unit tests
- [x] 8.2 Implement the grammY bot (long polling, owner chat id only), strong-match alerts sent once per offer, quiet hours, daily digest; verify with a mocked Telegram API and a test that a stranger chat gets no reply

## 9. Web app: shell and offers

- [x] 9.1 Create Next.js 16 app with Tailwind v4, shadcn/ui sidebar layout and routes from design D8; verify `pnpm --filter web build` succeeds
- [x] 9.2 Build `/offers` data table with filters, sorting and search from the job-dashboard spec; verify a Playwright UI test filtering "strong" + "contract"
- [x] 9.3 Build `/offers/[id]` detail with scores, drafts, links, actions (copy draft, open page, shortlist, dismiss, mark as applied) and timeline; verify a UI test that "Mark as applied" creates an application

## 10. Web app: pipeline

- [x] 10.1 Implement application stages, custom stages, transitions with notes and the 14-day no-response suggestion; verify unit tests
- [x] 10.2 Build `/pipeline` board with drag and drop, interview form (type, date with time zone, link, notes, outcome), next step with due date and engagement details; verify a UI test moving a card to "technical interview" and adding an interview
- [x] 10.3 Add interview reminders (24 h before, once) and the capacity warning; verify unit tests

## 11. Web app: dashboard, sources and settings

- [x] 11.1 Build the `/` dashboard metrics from the job-dashboard spec with period selector and empty state; verify query tests against a seeded database
- [x] 11.2 Build `/sources` with run log, "Run now" and session status, and `/notifications`; verify a UI test triggering "Run now"
- [x] 11.3 Build `/settings` for profile editing, thresholds, caps, quiet hours, digest time, models, sources and sessions; verify saving updates `preferences.yaml`

## 12. Browser sessions and logged-in adapters

- [x] 12.1 Implement `readOnlyPage`, `safeClick` with label denylist, and the ESLint rule banning raw interaction calls in `packages/sources`; verify a test where clicking an "Apply" button throws and lint fails on a raw `.click(`
- [x] 12.2 Implement the login flow (Xvfb, x11vnc, noVNC on 127.0.0.1:6080, persistent profile), session health checks, "Delete browser profile" and opt-in with risk notice; verify manually: log in to one site, confirm the session survives a worker restart, then delete the profile and see "logged out"
- [x] 12.3 Implement read-only adapters for Malt, Wellfound, Mercor, Upwork and LinkedIn with page caps and random delays, disabled by default; verify fixture tests from saved HTML and that no adapter runs while disabled
- [x] 12.4 Add a secret-scan test asserting no password fixture string appears in the database, logs or run payloads

## 13. Docker and end-to-end

- [x] 13.1 Write Dockerfiles and `docker-compose.yml` per design D10 (localhost-only ports, `./data` and read-only `./secrets` volumes, `CLAUDE_CODE_OAUTH_TOKEN` from secret file); verify `docker compose up` and `curl 127.0.0.1:3000` and `127.0.0.1:4000/health`
- [x] 13.2 Verify from another device on the LAN that ports 3000, 4000 and 6080 refuse connections
- [x] 13.3 End-to-end check: enable one ATS company and RemoteOK, run now, see scored offers, receive a Telegram alert for a strong match, generate a draft, mark as applied, move to technical interview, and see the dashboard funnel update
- [x] 13.4 Write `README.md` (setup, `claude setup-token`, Telegram bot creation, Gmail label and app password, login flow, risks, backup and restore); verify each command in it runs as written

## Workflow follow-up

- Archive the change once all tasks are done and the owner has reviewed the app.

## 14. Owner requests after first run

- [x] 14.1 Hidden companies: `keywords.exclude_companies`, pre-filter, "Hide company" on offers, Settings editor, apply/restore on stored offers (with tests)
- [x] 14.2 Offers table fits the page (long titles wrap instead of scrolling horizontally)
- [x] 14.3 Amethyst Haze theme (tweakcn) and a Light / Dark / System switch (class-based dark mode via next-themes)
- [x] 14.4 Date and time inputs use shadcn components (DatePicker: Popover + Calendar; TimePicker: hour/minute Selects)
- [x] 14.5 Interview prep: `interview_preps` table, PrepService (drafting model, grounded), auto on interview stages, sheet section, notification (with tests)
- [x] 14.6 Follow-up reminders (`notifications.follow_up_days`, Settings field, hourly job) and "What gets responses" dashboard card (with tests)
- [x] 14.7 Add an offer from a link (LinkedIn public page, JSON-LD, Claude fallback, pasted text), optional "already applied" (with tests)
