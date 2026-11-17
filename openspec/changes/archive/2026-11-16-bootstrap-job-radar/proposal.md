# Proposal

## Why

The owner (senior full-stack / AI engineer based in Spain) needs several remote projects in parallel within weeks. Offers are spread across a dozen platforms, and checking them by hand loses the best matches to faster applicants. A local agent that watches those sources around the clock, ranks offers against his profile, drafts tailored applications and tracks every process end to end turns the search into a measurable pipeline.

## What Changes

- New local-only monorepo with a Next.js 16 web app (dashboard, offers, pipeline) and a Node.js/Express worker (scheduling, ingestion, scoring, notifications), sharing one SQLite database.
- Ingestion from public sources first (public ATS job boards, Y Combinator's startup jobs board, HN "Who is hiring", remote job feeds, job-alert emails), then opt-in, read-only adapters for logged-in sites through an isolated browser profile.
- LLM scoring and application drafting through the owner's Claude subscription via the local Claude Code CLI, using the Vercel AI SDK.
- Telegram and in-app notifications for high-scoring offers, interview reminders and expired sessions.
- Application pipeline with interview stages, next steps and history.
- Metrics dashboard: volume, scores, funnel conversion and response rate per source.
- Guardrails: no auto-submission anywhere, no stored site passwords, no git remotes, services bound to localhost.

## Capabilities

### New Capabilities

- `candidate-profile`: the owner's CV, offers, rates, keywords and exclusions that every match is judged against.
- `job-ingestion`: collecting offers from configured sources on a schedule, normalizing and de-duplicating them.
- `browser-sessions`: logged-in, read-only access to sites through an isolated browser profile, without storing passwords.
- `job-scoring`: ranking each offer 0–100 against the profile with a written rationale.
- `application-drafts`: generating tailored proposals and screening answers for the owner to send manually.
- `application-pipeline`: tracking each application through stages, interviews and next steps.
- `job-dashboard`: the metrics dashboard, offers list and offer detail screens.
- `notifications`: alerts for strong matches, upcoming interviews and expired sessions.
- `local-operation`: local-only execution, privacy and the LLM usage budget.

### Modified Capabilities

None (new project).

## Impact

- New repository on the owner's machine only; Docker Compose with `web` and `worker` services.
- Dependencies: Next.js 16, React 19, Tailwind v4, shadcn/ui, `ai` v7, `ai-sdk-provider-claude-code` v4, Express, node-cron, Drizzle ORM + better-sqlite3, Playwright, grammY (Telegram), imapflow, rss-parser, zod.
- External: Claude Code CLI logged in to the owner's subscription (programmatic use counts against his plan's Agent SDK allowance), a Telegram bot token, optional Gmail app password for job-alert emails.
