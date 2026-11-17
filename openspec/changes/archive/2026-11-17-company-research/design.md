# Design

## Context

- Every LLM call goes through `createClaudeCodeClient` with `lockedDownSettings`: `tools: []`, a deny list (WebFetch and WebSearch included), no MCP servers, and `maxTurns: 3` (`packages/core/src/llm/claude-code.ts`). That lockdown is a project rule (`CLAUDE.md` rule 4) and stays the default.
- `ai-sdk-provider-claude-code` 4.4.1 supports `allowedTools`, a host `canUseTool` callback and in-process MCP servers built from AI SDK tools (`createAiSdkMcpServer`).
- The link import already has `checkImportUrl`, which blocks localhost, private ranges and non-HTTP(S) URLs, and a fetcher (`packages/sources/src/import-url.ts`).
- `companies` rows exist per normalized name, with `website` and `meta`. The budget has kinds scoring, drafting and extraction, and caps for scoring and drafts.

## Goals / Non-Goals

**Goals:**
- One bounded agent, used rarely, whose output is a sourced, schema-checked profile.
- The tool surface is so small that a prompt injection in a web page can at most make the agent read another public page.

**Non-Goals:**
- Researching people, such as founders or interviewers.
- Reading sites that need login, including LinkedIn company pages behind a login; the agent never uses the browser profile.
- Paid data sources (Crunchbase API and similar).
- Multi-agent orchestration. One agent is enough.

## Decisions

**D1. A separate research client, the only one with tools.**
- `createResearchClient()` builds its settings from `lockedDownSettings` and changes only these things:
  - `tools: ["WebSearch"]` (the only built-in tool), and WebSearch removed from the deny list
  - `mcpServers: { jobradar: <in-process server> }`, a fresh one per research
  - `maxTurns: 16`
  - `canUseTool`
- No `allowedTools`. The task 1.1 spike showed that bare `allowedTools` entries auto-approve a tool before `canUseTool` runs, and that setting `allowedTools` makes the provider ignore `disallowedTools`.
- WebFetch stays denied, so all page reads go through our reader.
- `canUseTool` is the only gate: it allows exactly `WebSearch` and `mcp__jobradar__read_page` and denies everything else. This covers the case where a CLI update adds tools by default.
- **Spike result (task 1.1, CLI 2.1.326):** WebSearch works through the owner's subscription with the project env, including `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`. Full mode is used. The read-page-only fallback (Risks) stays as the behavior when a research run reports WebSearch errors.
- A test asserts that every other client still runs with `tools: []` and no MCP.

*Alternative:* allow the built-in WebFetch. Rejected: we could not enforce the private-network block, the size cap or the no-cookie rule on it.

*Alternative:* our own search tool, scraping a search engine HTML. Rejected: fragile and against those sites' terms. WebSearch runs on the owner's subscription.

**D2. `read_page` tool (in `packages/sources`).**
- Input is `{ url }`. It runs `checkImportUrl`, then a GET without cookies with a 10 s timeout.
- At most 3 redirects, each re-checked against the same rules.
- It reads only `text/html` and `text/plain`, caps the response at 1.5 MB, and converts it to text capped at 20,000 characters, keeping links as `[text](url)`.
- Every URL it served goes into a per-research `readUrls` set.
- Its output reaches the model wrapped as untrusted.

**D3. Output and grounding.**
- The final answer is structured output with a strict zod schema `company_profile`: each field is `{ value, sources: url[] } | null`, `news` is an array of `{ date, headline, source }`, and `red_flags` is an array of `{ text, source }`.
- After the call, `groundCompanyProfile` drops every fact whose sources are not in `readUrls`, normalizing for trailing slashes and fragments.
- WebSearch results count as read only for the URL of a page the agent then opened, so a search snippet alone is never a source.
- It also drops text containing instructions aimed at a model and caps all strings.

**D4. Budget.**
- New `LlmKind` `"research"`, a new cap group, and `preferences.scoring.daily_caps.research` (default 10).
- One research is one budget unit, no matter how many turns it takes.
- Per-research wall-clock limit of 120 s through the AI SDK abort signal. On timeout the agent is asked once, without tools, to return the profile from what it has read, and the result is stored as `partial`.
- `LlmCapReachedError` re-queues the research for the next day.

**D5. Storage and triggers.**
- Table `company_research`:
  - `id`, `company_id` FK
  - `status`: queued, running, done, partial, failed
  - `profile` JSON, `read_urls` JSON
  - `error`, `model`, `started_at`, `finished_at`, `expires_at` (finished + 30 days)
- There is at most one active row per company; the latest done or partial row is the current profile.
- `ResearchService` is a PQueue with concurrency 1. Its triggers:
  - The shortlist action calls `POST /companies/:id/research?reason=shortlist` fire-and-forget.
  - A scoring hook covers strong offers when `research.auto_strong` is on.
  - The manual button covers everything else.
- Dedupe: queued, running or fresh rows are reused unless `force=1`.
- When the company has no `website`, the agent gets the name plus the offer's apply/source host as hints.

**D6. Consumers.**
- Scoring, draft and prep prompts get an optional `companyProfile` block, labeled "Company profile (facts from public sources; cite them, don't extend them)".
- After research, the worker calls `scoring.enqueue(openOfferIdsForCompany)`.
- Drafts reuse the existing grounding: company facts used in the draft are listed with sources. The draft schema gets `company_facts_used: [{ fact, source }]`, and only entries present in the profile are kept.
- Interview prep `generate` awaits research when there is no fresh profile and budget remains, with up to 150 s; otherwise it continues without it.

**D7. The rule change is explicit.** `CLAUDE.md` rule 4 and the README are updated in the same task group as D1, so the exception is documented where future work reads it.

## Risks / Trade-offs

- [WebSearch may be unavailable on the subscription or blocked by `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`] → Task 1.1 verifies it first. If it is unavailable, the agent runs with `read_page` only, starting from the company website, its `/about` and `/careers` pages, and the offer's links. This is a degraded but working mode, and the Company card says "Limited research: web search unavailable".
- [Prompt injection from web pages] → The tools only read public pages; nothing writes or sends. Private addresses are blocked. The output is schema-checked and grounded to pages actually read, and the owner sees every source.
- [Wrong company with a common name] → The hints include the company website or apply host. The profile records which site it identified as the company's, and the card shows it so the owner can spot a mismatch and refresh.
- [Subscription usage] → Research has its own cap (default 10/day) and only runs for shortlisted or strong offers. One research costs roughly 5–15 model turns.

## Migration Plan

- One additive migration (`company_research` table). A new optional preferences field with a default, so existing `preferences.yaml` files still validate.
- `learn-from-dismissals` also modifies the "Offer detail" requirement in `job-dashboard`. Whichever change is archived second must merge both texts: the reasons on dismissed offers and the Company card.
- Rollback: disable auto research in Settings, or revert the code; the table is left unused.
