# Design

## Context

- **Profile.** The profile is two files in `data/profile/`: `cv.md` and `preferences.yaml`.
  - `loadProfile` validates them and returns `Profile { preferences, cv, loadedAt }` with hashes.
  - The worker's `ProfileService` holds the current profile. The web saves files through `saveProfileFiles` and then calls the worker's reload.
- **Scoring.** One structured LLM call per offer, with `modelScoreSchema` (strict).
  - The prompt includes `profile.cv.slice(0, 8_000)`.
  - Results go to the `scores` table, one row per scoring with history kept.
  - A daily cap applies (default 300).
- **Drafts.** The prompt includes `profile.cv.slice(0, 10_000)`. Drafts are versioned rows in `drafts`.
- **Applications.** One row per offer. `sentDraftId` links the draft that was sent.
- **Response patterns.** `packages/db/src/queries/dashboard.ts` groups applications by source, engagement, score band, time to apply and "draft sent".

## Goals / Non-Goals

**Goals:**

- Recommend one CV variant per offer, with gaps, at no extra LLM call.
- Keep the score a measure of the owner's fit, independent of which document is sent.
- Know which CV was sent, so response rates per variant can be compared.

**Non-Goals:**

- Importing PDF or Word CVs. Variants are Markdown text.
- Generating a tailored CV per offer. This could be a later "Adapt CV" draft type.
- Exporting variants to PDF.
- Scoring each variant separately.

## Decisions

### D1. Variant files with front matter

A variant is stored as `data/profile/cvs/<id>.md`:

```markdown
---
name: Tech Lead
use_for: Head of / Lead / EM roles at startups
---
<CV text in Markdown>
```

- **Id.** The file name, kebab-case `[a-z0-9-]+`. The id is stable across renames: renaming changes `name` only.
- **Validation.** Per file: `name` and `use_for` are required, the body must be non-empty and at most 20,000 characters, and there can be at most 8 variants.
- **Invalid files.** An invalid file is skipped with an error. It does not make the whole profile invalid, unlike `preferences.yaml`. A broken variant must not stop scoring.
- **Loading.** `loadProfile` returns `variants: { id, name, useFor, text }[]` and a `variantsHash`.
- **Front matter parsing.** The `yaml` package is already a dependency. Front matter is split on the leading `---` lines, so no new library is needed.

*Alternatives:*

- A `cv_variants:` list in `preferences.yaml`. Rejected: long Markdown in YAML is painful to edit, and it would mix documents with settings.
- A database table. Rejected: the profile is files by spec ("Profile as local files"), and the owner can edit them outside the app.

### D2. Recommendation inside the existing scoring call

`modelScoreSchema` gains an optional, strict block, requested only when variants exist:

```ts
cv: z.object({
  recommended: z.string(),          // variant id
  reason: z.string().max(200),
  gaps: z.array(z.string().max(120)).max(5),
}).strict().optional()
```

- **Prompt.** It adds a trusted section "CV variants" with, for each variant, the id, name, use_for and the first 2,500 characters. The total is capped at 12,000 characters, and variants beyond the cap are listed with name and use_for only. The master CV stays the basis for fit.
- **Instruction to the model.** Judge fit from the master CV. Pick the variant whose emphasis best matches the offer. List as gaps the offer requirements that the master CV supports but the chosen variant omits.
- **Unknown id.** If `recommended` is not a known id, the block is dropped and the score is kept. The scenario "Unknown variant" covers this.
- **Storage.** In `scores`: nullable `recommended_cv` (id), `cv_reason` and `cv_gaps` (JSON). The variant name is resolved at display time. If the variant has since been deleted, the id is shown.
- **Hard rules.** These run after the model, as today, and do not touch the `cv` block.

*Alternatives:*

- Score once per variant. Rejected: it costs N times the calls, and it measures document wording rather than fit.
- A second, cheaper call only for strong offers. Rejected for now: it adds a queue and a budget for little gain, since the scoring model already reads the offer.
- Embedding similarity. Rejected: there is no embedding provider (subscription CLI only), and similarity does not explain gaps.

### D3. Refreshing recommendations

- **Hashes.** The worker records `variantsHash` beside `cvHash`. A change does not trigger rescoring by itself.
- **Refresh route.** `POST /scoring/refresh-cv` queues offers with triage `shortlisted` and no application, through the normal scoring queue, so the cap applies. It returns `{ queued }`.
- **Settings.** It shows "Refresh CV recommendations (N shortlisted)" after variants change, when stored scores were made with a different `variantsHash`. Each score row stores the hash it used, in a nullable `cv_variants_hash` column.
- **Other offers.** New offers are scored with the current variants. Offers that are not shortlisted keep their old recommendation until rescored for another reason.

*Alternative:* rescore all open offers. Rejected because of the cap. The existing "Rescore open offers" button still does that if the owner wants it.

### D4. Drafts

- **Choosing the variant.** `generateDraft` takes an optional `cvVariantId`. It defaults to the latest score's `recommended_cv`, else none.
- **Prompt.**
  - The selected variant goes in as "CV to emphasize" (up to 10,000 characters).
  - The master CV goes in as "Full CV (facts may come from here)", truncated to 10,000 characters as today.
  - The no-fabrication check keeps using the master CV and the profile as trusted text.
- **Storage.** `drafts.cv_variant` (nullable id) and `drafts.cv_variant_name` (a snapshot).
- **UI.** The drafts panel gains a "CV" select beside regenerate.

### D5. Applications and response patterns

- **Columns.** `applications.cv_variant` (id, or `master`) and `applications.cv_variant_name` (a snapshot, so deleted variants still read well). Both are nullable; null means unknown.
- **Pre-selection.** "Mark as applied" pre-selects in this order: the sent draft's variant, then the recommended variant, then `master`. The select is shown only when variants exist.
- **Editing.** In the application sheet. A timeline entry records "CV sent changed to X".
- **Dashboard.** Response patterns gain the dimension `cv`, which groups by `cv_variant_name ?? "Unknown"`.

### D6. Settings UI

- **Where.** The "Profile files" tab gets a "CV variants" card below the master CV: a list with name and use_for, and add, edit, rename and delete actions.
- **Editing.** A dialog with name, use_for and a Markdown textarea.
- **Saving.** Through a server action that writes the file and then reloads the worker.
- **Validation.** Errors are shown per file.
- **Delete.** Asks for confirmation inside the app; this is the owner's own data.

## Risks / Trade-offs

- **Truncated variants in the scoring prompt (2,500 characters each) can produce false gaps.**
  - Mitigation: gaps are labelled "may be missing from this CV", and the draft step reads the full variant.
  - The limit is a constant that can be tuned.
- **The prompt grows by up to 12,000 characters, which makes scoring slower and uses more of the subscription.**
  - Mitigation: the cap, and variants are only included when they exist.
- **Model drift could put variant bias into sub-scores.**
  - Mitigation: the instruction says fit comes from the master CV.
  - A test checks that the prompt places the master CV as the basis for fit.
  - The spec scenario compares scores with and without variants using a fake model.
- **Old scores have no recommendation.** This is expected. The UI shows nothing until a rescore or refresh.

## Migration Plan

- **Migration.** One Drizzle migration adds nullable columns: `scores.recommended_cv`, `scores.cv_reason`, `scores.cv_gaps` and `scores.cv_variants_hash`; `drafts.cv_variant` and `drafts.cv_variant_name`; `applications.cv_variant` and `applications.cv_variant_name`. There is no backfill.
- **Profile folder.** `cvs/` is created on first save.
- **Test data.** The e2e seed writes one fictional variant. `ensureProfileFiles` never copies variants into a new install, so a new owner starts with none.

## Open Questions

None blocking. PDF or Word import is deferred until the owner says what format their variants are in.
