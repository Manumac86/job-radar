# Proposal

## Why

The timeline is where the story of an offer lives, but today a note can only be written while moving an application to another stage. Notes about an offer you have not applied to ("contacted on Telegram", "referral possible through X") have nowhere to go. There is also no place to keep the people behind an offer (recruiter, hiring manager, referral) with their LinkedIn or other contact.

## What Changes

- "Add note" on every offer, applied or not: on the offer page, and in the pipeline drawer separate from the stage move. A note is a timeline entry with its date. The timeline stays append-only, so a correction is a new note.
- People: the owner adds people to an offer with name, role, LinkedIn URL, email, phone and other contact (free text, such as a Telegram handle), plus a short note. A person belongs to the offer's company, so the people known at that company are suggested on its other offers. People can be edited and removed from an offer. Adding and removing are recorded in the timeline.
- People are shown on the offer page and in the pipeline drawer. LinkedIn opens in the browser, and email and other contacts have a Copy button. Job Radar never sends or connects anything (rule 2).
- People's data stays in the local database. It is never logged and never sent to the LLM.

## Capabilities

### New Capabilities
- `contacts`: people linked to offers and companies, with their contact details, and how they are shown and kept private.

### Modified Capabilities
- `application-pipeline`: "Timeline" now lets the owner add a note to any offer at any time, not only with a stage move.

## Impact

- `packages/db`: tables `people` and `offer_people` (migration `0009`), queries, and `addNote`.
- `apps/web`: a Notes form and a People card on the offer page, and both in the pipeline drawer. Note entries are styled in the timeline.
- Demo seed and tests use fictional people only.
