# Proposal

## Why

People are stored per company (`people.company_id` is required) and only suggested on offers of that same company. A recruiter from an agency who brings offers from several companies has to be entered again for each one, and nothing stops the same person from being saved twice. There is also no place to see everyone the owner has met during the search.

## What Changes

- **"Add person" becomes a search box.** It searches all people by name, email, LinkedIn, other contact or company. The owner picks one to link to the offer, or creates a new person from the typed name. People at the offer's company are still listed first, as "Known at <company>".
- **A person is independent of companies.** "Company" becomes an optional field on the person ("works at"). A new person created from an offer defaults to the offer's company. A person can be linked to offers of any company.
- **Duplicate warning.** Creating or editing a person whose LinkedIn profile or email already belongs to someone else is refused, with a "Use <name>" action that links the existing person instead.
- **People page** (`/people`, in the sidebar):
  - lists every person with their company, contacts and linked offers;
  - search;
  - edit a person;
  - merge two people into one (links, then empty fields, move to the person kept);
  - delete a person (it leaves their offers; timeline entries stay).

## Capabilities

### New Capabilities

### Modified Capabilities
- `contacts`:
  - "People on an offer": the person no longer has to belong to the offer's company.
  - "People known at a company": also people who work there.
  - Added: "Find and link an existing person", "Duplicate people", "People page", "Merge and delete people".

## Impact

- `packages/db`: migration `0010` makes `people.company_id` nullable (table rebuild, data kept). New queries: search, duplicate lookup, merge, delete, all people with their offers.
- `packages/core/src/offers/people.ts`: LinkedIn profile and email normalization for duplicate checks; a `company` field in the person input.
- `apps/web`:
  - the PeopleCard "Add person" search;
  - a company field in the person dialog;
  - the new `/people` page and its sidebar entry.
- Privacy is unchanged: people stay local, are never logged, and never reach the LLM.
