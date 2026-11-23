# Tasks

## 1. Data

- [x] 1.1 Migration `0009`: `people` and `offer_people` (design D2), with queries to add, update, link, unlink, list for an offer, and list known at a company. Verified by db tests, including an upgrade from 0008 and unique linking.
- [x] 1.2 `addNote` (D1) and the people timeline events (D5). Verified by db tests: a note on an offer without an application has `offerId` only; with an application it shows in both timelines; an empty note is refused.
- [x] 1.3 Validation schema in core (D3). Verified by unit tests: a linkedin.com profile and a country subdomain pass; another host, http, and a 121-character name fail.

## 2. Offer page

- [x] 2.1 `NoteForm` and the note label in the timeline. Verified by a Playwright test: add a note to a seeded offer without an application; it shows at the top of the timeline and the offer's triage is unchanged.
- [x] 2.2 `PeopleCard`: add, edit, remove, Copy, LinkedIn link, "Known at <company>" (D4). Verified by Playwright tests: add a fictional person, see the timeline entry, see them suggested on another offer of the same company and add them there, and get an error for an invalid LinkedIn URL.

## 3. Pipeline drawer

- [x] 3.1 The drawer shows "Add note" separate from the stage move, plus the People card. Verified by a Playwright test: a note is added without moving and the card stays in its stage.

## 4. Privacy and docs

- [x] 4.1 The interview-prep and scoring prompts get no people data (D6). Verified by a worker test that captures the prompt of an offer with a person.
- [x] 4.2 Demo seed: one fictional person on a seeded offer. README: one line on notes and people. Run `pnpm verify`.

## 5. Owner check

- [x] 5.1 Owner check: add a note and a person (with LinkedIn) to an offer you have not applied to, and a note from the pipeline drawer without moving the card.
