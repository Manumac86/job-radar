# Tasks

## 1. Data and core

- [x] 1.1 Migration `0010`: `people.company_id` nullable (D1). Verified by a db upgrade test from 0009 with a person and a link: both survive, and a person without a company can be inserted.
- [x] 1.2 `linkedInKey`, `emailKey`, and a `company` field in the person input (D4, D1). Verified by core tests: www/es subdomains, letter case, a trailing slash and a query give the same key; a non-LinkedIn URL gives null.
- [x] 1.3 Queries (D1–D6):
  - `searchPeople` and `findDuplicatePerson`;
  - `createPerson` and company resolution;
  - linking without the company check, and the new "known at" rule;
  - `mergePeople`, `deletePerson`, `listPeopleWithOffers`.

  Verified by db tests:
  - an agency recruiter is linked to two companies' offers;
  - a duplicate LinkedIn or email is refused with the existing person;
  - a merge moves links and fills fields;
  - a delete keeps the timeline entries.

## 2. Offer page and drawer

- [x] 2.1 The "Add person" search with "Create <name>" (D3), a company field in the dialog, the duplicate message with "Use <name>" (D4), and the person's company shown when it differs. Verified by Playwright tests: link an existing person from another company by searching, create from the typed name, and use the existing person after a duplicate warning.

## 3. People page

- [x] 3.1 `/people` with search, the offers column, Edit, and the sidebar entry (D7). Verified by a Playwright test: search by company, see the linked offers, and edit a role.
- [x] 3.2 Merge and Delete with confirmation (D5, D6). Verified by Playwright tests: merge two seeded people and see one with both offers; delete one and see the offer's timeline entry kept.
- [x] 3.3 README line updated, demo seed with one person on two companies' offers. Run `pnpm verify`.

## 4. Owner check

- [x] 4.1 Owner check:
  - link the same recruiter to offers of two companies from the search;
  - try to create them again with the same LinkedIn and get the warning;
  - open People and merge or delete a test person.
