# Design

## Context

`timeline_events` already holds offer and application events (`offerId`, `applicationId`, `kind`, `message`, `data`), append-only by design and by spec. The only way to write a note is `moveStage(..., { note })` from the pipeline drawer's StageForm (Move is disabled until another stage is picked). Companies are rows in `companies` (unique `normalized_name`). The offer page renders the timeline with special entries for email and portal events.

## Goals / Non-Goals

**Goals:** notes at any time on any offer; people per company, linked to offers; the same UI on the offer page and in the drawer.

**Non-Goals:** editing or deleting notes (the timeline stays append-only); a global People page; linking interviewers to people; importing contacts from LinkedIn or email.

## Decisions

**D1. A note is a timeline event `kind: "note"`.** `addNote(db, offerId, text)` adds it with the offer's application id when one exists, so it shows on both the offer and the application timelines. The text is trimmed, required, and at most 2000 characters. The offer page and the drawer show notes with a "Note" label.
- *Alternative:* a `notes` table that can be edited. Rejected: the spec makes the timeline append-only, and the owner's need is chronological notes.

**D2. Tables.** `people(id, company_id → companies, name, role, linkedin_url, email, phone, other, note, created_at, updated_at)` and `offer_people(offer_id → offers cascade, person_id → people cascade, created_at, unique(offer_id, person_id))`. Migration `0009`. A person always gets the company of the offer they were first added from; an offer without a company id cannot have people (every ingested offer has one).
- *Alternative:* people on the offer only. Rejected: recruiters cover several roles at one company, and the owner would retype them.

**D3. Validation (zod, in core).** Name: 1–120 characters. LinkedIn: empty, or an `https` URL whose host is `linkedin.com` or ends with `.linkedin.com`. Email: empty or a valid address. Phone, other and role: free text up to 200 characters. Note: up to 1000 characters.

**D4. UI.** A shared `PeopleCard` client component (list, add/edit dialog, remove, "Known at <company>" with "Add to this offer") and a `NoteForm` (textarea and "Add note"). Both are used on the offer page, above the timeline, and in the pipeline drawer, below the stage section. Server actions are in `apps/web/src/app/offers/[id]/actions.ts`. They revalidate the offer page and `/pipeline`. Copy uses the existing clipboard pattern used for drafts. LinkedIn renders as `<a target="_blank" rel="noopener noreferrer">`.

**D5. Timeline messages.** "Added Jane Roe (Recruiter)" and "Removed Jane Roe", with `data.personId`. The timeline message holds only the name and role, never contact details. Editing a person is not a timeline event.

**D6. Privacy.** People are never passed to any `packages/core/llm` call. A test asserts that the interview-prep prompt builder receives no people data. The worker logs never include people fields, because the worker does not read them.

## Risks / Trade-offs

- [A name in the timeline stays after the person is deleted] → it is the owner's own local history, so this is acceptable. There is no person delete in this change, only removal from an offer.
- [Company merge differences: one person, two company rows that are spelled differently] → accepted. Companies are matched by their normalized name already.

## Migration Plan

Migration `0009` only adds tables. Rollback means ignoring the tables.
