# Design

## Context

Greenfield, single user, runs only on the owner's machine (see proposal.md, Why). Constraints from `openspec/config.yaml`: TypeScript only, no git remotes, no Anthropic API key, no stored site passwords, no auto-submission.

## Goals / Non-Goals

**Goals:**
- One `docker compose up` brings up the web app and the worker on localhost.
- Public sources work with zero credentials; logged-in sources are an opt-in layer on top.
- The LLM layer is swappable behind one interface, so a policy or CLI change touches one module.

**Non-Goals:**
- Multi-user, auth on the web app, cloud deploy, mobile app.
- Auto-applying, auto-messaging recruiters, or any write action on third-party sites.
- Calendar sync (manual interview entry in this change).

## Decisions

### D1. pnpm + Turborepo monorepo with a separate worker
```
apps/web        Next.js 16 App Router: UI, server actions, route handlers
apps/worker     Node 22 + Express: scheduler, ingestion, scoring, drafts, Telegram, browser sessions
packages/db     Drizzle schema, migrations, typed queries (better-sqlite3)
packages/core   zod schemas (profile, offer, score, draft), prompts, LLM client, rules
packages/sources  source adapters + fixtures
```
The web app reads and writes the database directly through `packages/db`. It calls the worker's localhost API only for actions that need the worker: run a source now, rescore, generate a draft, start or stop a login session.
Turborepo (`turbo` 2.x) orchestrates `build`, `typecheck`, `lint` and `test` across packages with a local cache only. Telemetry is disabled (`TURBO_TELEMETRY_DISABLED=1` in every root script) and no remote cache is linked (no `turbo login`, no `turbo link`, no `TURBO_TOKEN`).
*Alternative:* Next.js only, with cron route handlers. Rejected: long Playwright runs, persistent schedulers and the Telegram long-poll loop do not fit the request lifecycle.
*Alternative:* plain `pnpm -r` scripts. Rejected by the owner in favour of Turborepo for task caching and ordering.

### D2. SQLite + Drizzle in WAL mode
One file under `data/db/radar.sqlite`, shared by both containers through a volume, `journal_mode=WAL`, `busy_timeout=5000`. The worker does bulk writes; the web does small transactional writes.
*Alternative:* Postgres container. Rejected: an extra service and backups for one user with modest volume.

### D3. LLM via AI SDK v7 + `ai-sdk-provider-claude-code` v4
`packages/core/llm` exposes `scoreOffer(profile, offer)` and `draftApplication(profile, offer, opts)`, implemented with AI SDK structured output and zod schemas, using the community provider that runs Claude through the official Claude Agent SDK and the local Claude Code CLI on the owner's subscription.
- Auth in Docker: the owner runs `claude setup-token` on the host once; the token is saved to `secrets/claude_oauth_token` and exposed to the worker as `CLAUDE_CODE_OAUTH_TOKEN`. Do not mount the host `~/.claude` (it exposes unrelated config and history).
- Lock the agent down: no tools (empty allowed-tools list), no MCP servers, no file system access beyond a temp working directory, no permission bypass. The model only reads the prompt and returns JSON.
- Models: fast model (Haiku) for scoring, stronger model (Sonnet) for drafts; both configurable.
- Programmatic use counts against the plan's Agent SDK allowance, so the keyword pre-filter and the daily caps (local-operation spec) are part of the design, not extras.
*Alternative:* Anthropic API key. Rejected by the owner. The interface keeps it a one-file swap if subscription access changes.
*Alternative:* AI SDK v6 with provider v3 (the original plan). Rejected by the owner: v7 is the current stable release and the provider ships a matching v4 line.

### D4. Browser sessions: Playwright persistent context inside the worker container
- Profile directory `data/browser-profile/` (volume, worker-only).
- Login: `POST /sessions/:site/login` starts Xvfb + x11vnc + noVNC on `127.0.0.1:6080`, launches headed Chromium on the persistent profile at the site's login URL; the owner logs in (password manager, 2FA) in that viewer, then clicks "Done" in the app to close it. No credentials pass through app code.
- Runs: headless Chromium on the same profile, one site at a time, page-view cap and random 5–20 s delays.
- Guard: adapters may only use the wrapper `readOnlyPage` (goto, wait, read text and attributes, scroll). A `safeClick` exists only for pagination and "show more" with a label denylist (apply, submit, send, connect, follow, message, contact, bid, propose). An ESLint `no-restricted-syntax` rule forbids raw `.click(`, `.fill(`, `.type(`, `.press(` and `.check(` in `packages/sources`.
*Alternative:* connect over CDP to a dedicated Chrome profile on the host (Chrome only allows remote debugging with a non-default user-data-dir). Kept as a documented fallback for when the noVNC viewer is inconvenient; never use the owner's everyday profile.
*Alternative:* storing credentials and auto-logging in. Rejected: it widens the blast radius and breaks on 2FA.

### D5. Source adapters, v1
Each adapter implements `fetch(ctx) -> RawOffer[]` and `normalize(raw) -> Offer`, and ships with recorded fixtures for tests.
- Public ATS boards (company list in `data/profile/companies.yaml`): Greenhouse job board API, Lever postings API, Ashby posting API. Verify current endpoint shapes during implementation.
- Y Combinator startup jobs: public pages under `ycombinator.com/jobs` (role and remote filters, for example `/jobs/role/software-engineer/remote`), parsed from the page's embedded data (Inertia props) with an HTML fallback; extra fields go to a `company_meta` JSON column (batch, team size, one-liner) and `equity_min/max`. No account and no login; the apply link points to Work at a Startup and is opened by the owner. Polling every 6 hours is enough. Verify the embedded-data shape during implementation and keep a fixture.
- Hacker News "Who is hiring": latest thread via the HN Algolia API, then top-level comments; LLM-light extraction with the fast model, counted in the cap.
- Remote feeds: RemoteOK JSON, We Work Remotely RSS (rss-parser).
- Keyword pre-filter: include and exclude keywords plus an optional title gate (`keywords.title_include`) and "title:" exclusions, added after a live dry run showed sales roles at AI companies passing on description words alone. *Alternative:* include keywords on the description only. Rejected: about 1 in 5 non-engineering roles passed and would consume the scoring cap.
- Job-alert emails: imapflow, read-only, a single label (for example `job-alerts`) that receives alerts from LinkedIn, Upwork, Malt and Wellfound; per-sender parsers with an LLM extraction fallback. This is the recommended path for sites that restrict automation.
- Logged-in (opt-in, disabled by default): Malt, Wellfound, Mercor, Upwork, LinkedIn. Read-only search and offer pages only.

### D6. Scheduling and queue
node-cron per source interval plus an in-process queue (p-queue) with concurrency 1 for browser work and 2 for LLM work. State is persisted in `runs` and in the offer status (`awaiting_score`), so restarts resume cleanly.

### D7. Notifications
grammY bot using long polling (no inbound webhook, nothing exposed). It only answers the configured owner chat id. Offer links point to `http://localhost:3000/offers/:id`.

### D8. Web UI
shadcn/ui with sidebar layout. Routes: `/` dashboard, `/offers` (TanStack Table data table), `/offers/[id]`, `/pipeline` (board with dnd-kit), `/sources`, `/notifications`, `/settings` (profile, thresholds, caps, quiet hours, sources, sessions). Charts with shadcn charts (Recharts). Server components read via `packages/db`; mutations are server actions validated with zod.

### D9. Data model (Drizzle)
`profiles_meta`, `sources`, `runs`, `companies`, `offers`, `offer_links`, `scores`, `drafts`, `applications`, `stage_transitions`, `interviews`, `next_steps`, `engagements`, `timeline_events`, `notifications`, `llm_usage`, `settings`. Enums for triage state, application stage (plus custom stages table), interview type and score class. Money as integer minor units plus currency code; dates in UTC with an explicit time zone on interviews.

### D10. Docker Compose
- `web`: Node 22 image, `next start`, port `127.0.0.1:3000:3000`.
- `worker`: based on the official Playwright image (Ubuntu noble) with its bundled Node 26, Claude Code CLI installed globally, Xvfb, x11vnc and noVNC. *Alternative:* copy a Node 22 binary into that image. Rejected by the owner: Node 26 works and keeps the image simple. The web image stays on Node 22 and native development needs Node 22 or later. Ports `127.0.0.1:4000:4000` (API) and `127.0.0.1:6080:6080` (login viewer, only listening during a login session).
- Volumes: `./data` (read-write), `./secrets` (read-only, worker only). Both directories are git-ignored.
- `pnpm dev` runs both apps natively without Docker for development.

### D11. Local-only guardrails
`git init` with no remote, `.githooks/pre-push` that always exits 1, `core.hooksPath=.githooks` set by the root `prepare` script (runs on every `pnpm install`; `pnpm setup` is a built-in pnpm command and would never run a script of that name), and `pnpm check:local` that fails when `git remote -v` prints anything, when Turborepo telemetry is not disabled, or when a Turborepo remote cache is configured. CI-style checks run locally via `pnpm verify` (typecheck, lint, test, check:local).

## Risks / Trade-offs

- [A site restricts the account for automated browsing] → Logged-in adapters off by default, risk notice, low page caps, read-only guard, and job-alert emails as the default path for LinkedIn and Upwork.
- [Subscription access for programmatic use changes] → LLM behind one interface; daily caps; queue degrades to "awaiting score" instead of failing.
- [Agent SDK allowance consumed too fast] → Keyword pre-filter, Haiku for scoring, caps, and LLM usage shown on the dashboard.
- [Scrapers break when sites change markup] → Fixture-based tests per adapter; a failing adapter disables itself after 5 failures and notifies.
- [Model invents facts in drafts] → Grounding rule, "verify before sending" list, owner always sends manually.
- [SQLite lock contention between containers] → WAL, busy timeout, short write transactions.
- [Prompt injection inside job descriptions] → The model has no tools, outputs only schema-validated JSON, and offer text is wrapped and labeled as untrusted data in prompts.

## Migration Plan

Not applicable (new project). Rollback is `docker compose down`; data stays in `./data`.

## Open Questions

- Seed list of companies for the ATS boards: start with 20–30 AI-first startups hiring remotely in EMEA; the owner can extend it in `companies.yaml`.
- Exact quiet hours and digest time: defaults 22:00–08:00 and 08:30 Europe/Madrid, editable in Settings.
