# Job Radar — instructions for Claude Code

Single-user, local-only, open-source app that finds remote jobs and freelance projects, scores them, drafts applications and tracks the pipeline. Work is spec-driven with OpenSpec: the source of truth is `openspec/specs/` (one spec per capability). The initial build, `bootstrap-job-radar`, is archived in `openspec/changes/archive/`. For any new feature or behavior change: propose a change with `openspec-propose`, implement it with `openspec-apply-change` task by task (ticking `tasks.md`), and archive it with `openspec-archive-change` once the owner has verified it.

## Non-negotiable rules

1. **Local only at runtime.** Bind every port to 127.0.0.1. No telemetry, analytics or auto-update; never deploy the app anywhere. The code is open source (MIT), but this private checkout's history is never published: the only remote is `public`, and the only push is the clean `public` branch built by `pnpm publish:sync` (privacy scan against `secrets/private-terms.txt`), as `git push public public:main`. Never push `main`, and never publish anything from `data/` or `secrets/` (see `docs/publishing.md`).
2. **No auto-submission.** Never write code that clicks apply/submit/send/connect/message, fills forms or sends emails or messages on third-party sites. Drafts are for the owner to send manually.
3. **No stored site passwords.** Logged-in access only through the isolated Playwright profile where the owner logs in by hand (design D4).
4. **No Anthropic API key.** LLM calls go through `packages/core/llm` (AI SDK v7 + `ai-sdk-provider-claude-code` v4) with tools disabled. The one exception is the company research agent (`createResearchClient`): it may use only WebSearch and Job Radar's own `read_page` tool (public GET, no cookies, private addresses refused), gated by `canUseTool`. Never give it, or any other call, shell, file, browser-profile, form, login or messaging tools, and never use `allowedTools` for it (bare entries bypass the gate).
5. **Secrets** live only in `secrets/` (git-ignored) and are never logged.
6. **TypeScript only.** No Python.

## Stack

pnpm workspaces + Turborepo (telemetry off, local cache only) · Node 22+ (worker image on Node 26) · Next.js 16 (App Router) · React 19 · Tailwind v4 · shadcn/ui · Vercel AI SDK v7 · Express · node-cron · p-queue · Drizzle ORM + better-sqlite3 · Playwright · grammY · imapflow · zod · Vitest · Docker Compose · Electron (macOS app in `apps/desktop`: local, unsigned, no auto-update, servers on 127.0.0.1).

## Working agreement

- Read the specs and `design.md` before each task group; if a spec is ambiguous, ask the owner instead of guessing, and update the change with `openspec-update-change` when a decision changes.
- Each task lands with its own tests. Run `pnpm verify` before marking a group done.
- Use the latest stable versions; check package docs when an API looks different from what you expect (Next.js 16, AI SDK v7 and Tailwind v4 changed several APIs).
- Commit locally after each task group with a clear message.
- The live owner profile is `data/profile/` (edited from the app). `profile-seed/` is a fictional example profile, used for first setup and tests; the owner's original seed is in `data/profile-seed-owner/`. Never put real personal data in tracked files.
