# Tasks

## 1. Restricted research client

- [x] 1.1 Spike: confirm WebSearch works through the owner's subscription with the project's CLI env; record the result in design.md and pick full or read-page-only mode
- [x] 1.2 `read_page` tool in `packages/sources` (URL checks on every redirect, GET without cookies, timeout, size and type caps, text with links, `readUrls` tracking); tests with a local fixture server and private-address cases
- [x] 1.3 `createResearchClient` with allowedTools, in-process MCP server and `canUseTool` allowlist; test that every other client keeps `tools: []` and no MCP
- [x] 1.4 Update `CLAUDE.md` rule 4 and the README with the research exception and what the agent may and may not do

## 2. Research core

- [x] 2.1 `company_profile` schema, research prompt (untrusted page content), `groundCompanyProfile` (sources must be read, injection text dropped, caps); unit tests including an injected page
- [x] 2.2 LLM kind `research` with its own cap (`preferences.scoring.daily_caps.research`, default 10) and `research.auto_strong` setting (default true); profile schema tests
- [x] 2.3 Timeout and partial-result path (120 s, one tool-less final call); tests with FakeLlmClient

## 3. Storage and worker

- [x] 3.1 `company_research` table, migration and queries (current profile, fresh check, active row dedupe); db tests
- [x] 3.2 `ResearchService` (queue, dedupe, force refresh, cap re-queue, status), routes `POST/GET /companies/:id/research`, triggers on shortlist and strong score; FakeLlmClient sample; worker tests
- [x] 3.3 Rescore open offers of the company after research; scoring prompt takes the profile; test the stage red flag after research

## 4. Drafts and interview prep

- [x] 4.1 Draft prompt and `company_facts_used` with grounding against the profile; tests
- [x] 4.2 Interview prep awaits fresh research when possible and adds "Company context"; falls back without it; tests

## 5. Web

- [x] 5.1 Company card on offer detail (facts with source links, identified website, research date, states, Research/Refresh/Retry)
- [x] 5.2 Settings: research cap and auto-research toggle; budget display includes research
- [x] 5.3 Draft panel lists company facts with sources; prep plan shows Company context
- [x] 5.4 Playwright: research from an offer with FakeLlmClient, see sourced facts, cap reached message

## 6. Verify

- [x] 6.1 Run `pnpm verify`, commit locally
- [x] 6.2 Owner check: research two real companies (one well known, one small), confirm the facts against their sources, and see the rescore and the draft citing a fact
