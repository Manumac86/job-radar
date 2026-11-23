# Design

## Context

`people(company_id NOT NULL → companies)` and `offer_people(offer_id, person_id)` exist (migration 0009). `linkPersonToOffer` refuses a person of another company. `peopleKnownForOffer` returns people with the offer's company that are not linked yet. The `PeopleCard` component (offer page and pipeline drawer) has "Add person" (dialog) and "Known at <company>". The UI has no combobox component (no cmdk), but Popover, Input and Dialog are available.

## Goals / Non-Goals

**Goals:** one person reused across companies; search and link from an offer; no silent duplicates; a page to see, edit, merge and delete people.

**Non-Goals:** importing contacts from LinkedIn or email; tags or groups; history of a person's company changes; fuzzy name matching for duplicates (only LinkedIn and email are identities).

## Decisions

**D1. `company_id` becomes nullable.** Migration `0010` rebuilds `people` as drizzle generates it for SQLite (copy, drop, rename), keeping ids and data. Existing people keep their company. The person form gets a "Company" text field with suggestions from existing companies. On save, the name is matched to a company with `normalizeCompany`, or a company row is created with `upsertCompany`; an empty value means no company. From an offer, it defaults to the offer's company name.

**D2. Linking any person.** `linkPersonToOffer` no longer checks the company. "Known at <company>" is the people whose `company_id` is the offer's company, together with the people linked to other offers of that company, minus those already linked.

**D3. Search.** `searchPeople(db, query, limit = 8)`: case-insensitive `LIKE` on name, email, linkedin_url, other and the company name (joined), ordered by name. On an offer, people already linked are excluded, and those at the offer's company come first. In the UI, the "Add person" button opens a Popover with an Input. Results are fetched through a server action as the owner types (debounced 150 ms). Each row shows name, role and company. The last row is "Create <typed text>", which opens the existing dialog with the name filled in. The keyboard works (arrows and Enter) and the input carries `role="combobox"` with a listbox for accessibility.
- *Alternative:* add cmdk/shadcn Command. Rejected: one more dependency for one list.

**D4. Duplicate identity.** In core:
- `linkedInKey(url)`: for a `linkedin.com` URL, the lower-cased path without a trailing slash or query (`/in/jane-roe`), ignoring the subdomain.
- `emailKey(email)`: lower-cased and trimmed.

`findDuplicatePerson(db, fields, exceptId?)` compares the keys in TypeScript over people that have a LinkedIn or email. The list is small (hundreds at most), so no indexed key columns are needed. `addPersonToOffer`, `createPerson` and `updatePerson` throw `DuplicatePersonError(existing)`. The server action returns `{ ok: false, duplicate: PersonView }`, and the dialog shows "Jane Roe already has this LinkedIn profile" with "Use Jane Roe", which links her (on an offer) or opens her (on the People page).

**D5. Merge.** `mergePeople(db, keepId, removeId)` runs in one transaction:
1. moves `offer_people` links that the kept person does not already have;
2. fills null fields of the kept person from the removed one; notes are joined with a blank line when both have one;
3. deletes the removed person.

No timeline events are written: the merge is housekeeping, and the existing entries keep their names.

**D6. Delete.** `deletePerson` removes the person; `offer_people` rows cascade, and timeline entries are not touched (spec). A confirmation dialog names the number of offers the person leaves.

**D7. People page.** `/people` is a server component with `?q=` search. A table lists name and role, company, contacts (LinkedIn link, copy buttons), offers (links to `/offers/<id>`, the title with the company when it differs) and actions (Edit, Merge…, Delete). "Merge…" opens a dialog with a person search (the D3 search over all people); the owner chooses which one to keep. The sidebar gets "People" (icon `Users`) after Pipeline. The person dialog and row components are extracted from `people-card.tsx` into a shared `people/` module, so the offer page, the drawer and the People page use the same form.

## Risks / Trade-offs

- [Table rebuild in a migration] → the migrator wraps migrations in a transaction, where the generated `PRAGMA foreign_keys=OFF` has no effect, so `DROP TABLE people` would cascade-delete `offer_people`. `openDatabase` therefore runs migrations with foreign keys off, checks `foreign_key_check`, then turns them back on. This is verified by a db upgrade test from 0009 with people and links; the test failed before the fix.
- [Two people with the same name but different contacts] → allowed: only LinkedIn and email identify a person. Merge exists for the owner to fix it.
- [A linked person's company differs from the offer's] → shown on the offer as "Jane Roe · Recruiter at Northwind Talent", so it is clear.

## Migration Plan

Migration `0010` runs on start. Rollback means restoring the latest daily backup with `pnpm db:restore` (in the app, the backups folder), as with earlier migrations.
