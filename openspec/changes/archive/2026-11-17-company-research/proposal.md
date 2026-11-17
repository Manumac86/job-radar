# Proposal

## Why

Scoring, drafts and interview prep only know what the offer says about the company, and offers often omit funding stage, team size and what the product does. The leadership scoring rule (stage and team size against the owner's target) is therefore often a guess, drafts can't reference real company facts, and interview prep can't name recent news. A narrow research agent that reads the public web fills that gap for the few offers that matter.

## What Changes

- New **company research agent**: for one company, it searches the web and reads public pages, then returns a **company profile**. The profile covers:
  - what the product does
  - funding stage and last round, with date and amount
  - approximate headcount and engineering team size
  - HQ and remote policy
  - tech stack signals
  - recent news from the last 12 months
  - red flags such as layoffs or lawsuits

  Every fact carries its source URL, and facts without a source are discarded.
- Research runs only:
  - when the owner clicks "Research company" on an offer
  - automatically when an offer is shortlisted
  - automatically for strong offers (switchable in Settings, on by default)

  It never runs for every offer. A company profile is reused for 30 days across all offers from that company.
- Its own daily cap (default 10 researches) and a per-research limit on tool steps and time. It uses the owner's Claude subscription; no API key.
- Tools are limited to web search and a read-only page reader owned by Job Radar:
  - The reader does GET only, without cookies, and refuses local and private addresses.
  - It caps response size and never touches the logged-in browser profile.

  No other tools: no shell, files, forms, logins or messages.
- The company profile feeds scoring (rescore of that offer after research), drafts and interview prep, as trusted-by-source data shown with its links. The offer detail screen gets a "Company" card.
- **BREAKING (project rule):** `CLAUDE.md` rule 4 changes from "tools disabled" to "tools disabled except web search and the read-only page reader in the company research agent". Every other LLM call stays locked down exactly as today.

## Capabilities

### New Capabilities

- `company-research`: on-demand and triggered research of a company from public web sources into a sourced, cached company profile, with its own budget and tool restrictions.

### Modified Capabilities

- `job-scoring`: scoring uses the company profile when one exists, and the offer is rescored after research.
- `application-drafts`: drafts may cite company profile facts, only with a source.
- `application-pipeline`: interview prep includes the company profile and recent news.
- `job-dashboard`: offer detail shows the company profile card and the "Research company" action.

## Impact

- `packages/core/llm`:
  - A second client factory for research with an explicit tool allowlist and a host-side permission check; the existing locked-down settings stay the default.
  - New LLM kind `research` with its own cap.
- `packages/core`: research prompt and `company_profile` schema; scoring, draft and prep prompts take an optional profile.
- `packages/sources`: the page reader reuses the URL safety checks of the link import.
- `packages/db`: `company_research` table (per company, with status, sources, model, expiry); migration.
- `apps/worker`:
  - `ResearchService` (queue, triggers, cap)
  - routes `POST /companies/:id/research` and `GET /companies/:id/research`
  - a hook after research to rescore the offer
- `apps/web`: Company card, action, Settings toggles and cap.
- `CLAUDE.md` and README: the rule-4 exception and what the agent may and may not do.
