# Design

## Context

- **Preferences file.** `preferences.yaml` is validated by `preferencesSchema` (zod, strict) in `packages/core/src/profile/schema.ts`.
- **Comment-preserving edits.** `setPreferenceValues(text, updates)` edits a `yaml` `Document` with `setIn` and then validates. This already keeps comments.
- **Current UI.**
  - **Settings → General:** a fixed form (`saveSettings`) covers rates for EUR, USD and GBP, capacity, thresholds, models, caps, auto research, quiet hours, digest and follow-up days.
  - **"Hidden companies" card:** edits `keywords.exclude_companies`.
  - **Settings → Profile files:** shows the raw YAML in a textarea (`saveProfileText`).
- **After a save,** the web calls the worker's reload (`reloadWorker`).
- **Existing tests.** The Playwright tests in `apps/web/tests/settings.spec.ts` cover comment preservation and invalid input.

## Goals / Non-Goals

**Goals:**

- Every preference field can be edited without touching YAML, except `sources`.
- One validation path, and the file stays the source of truth.
- The YAML view stays as a first-class view.

**Non-Goals:**

- A form for `sources` (free-form per-source settings).
- Editing `companies.yaml` or the CV here.
- Live collaborative editing or autosave.
- Undo history beyond discard.

## Decisions

### D1. The file is the state; the form is a projection

- **Loading.** The server reads `preferences.yaml` and returns both the text and `parsePreferences(text)` values. The form is initialised from the parsed values, with defaults applied by the schema.
- **Diffing.** On save, the client sends only the changed paths, computed by diffing the form values against the initial values at leaf level, with lists compared as whole values. `cleared` optional fields are sent as deletions.
- **Server action `savePreferences({ changes, baseHash })`.**
  - It reads the file and rejects the save if the file's hash is not `baseHash` ("the file changed since you opened it; reload").
  - It applies the changes to the `yaml` Document.
  - It validates with `preferencesSchema` and writes only if valid.
  - It reloads the worker and returns field errors keyed by path.
- **`setPreferenceValues` becomes `applyPreferenceChanges`.**
  - It accepts `{ path, value } | { path, delete: true }`.
  - It replaces a whole sequence for list fields, keeping flow style (`[a, b]`) when the original node was a flow sequence.

*Alternatives:*

- Re-serialise the whole object from the form. Rejected: it loses comments and order, which the existing test protects.
- Keep separate per-section save actions. Rejected: they validate partially and would duplicate validation.

### D2. Validation errors mapped to fields

- **Errors by path.** `formatIssues` already yields `path: message`. The action returns `{ path: string[], message }[]`. The form shows each message under the field whose path matches. Unmatched errors (for example a cross-field refine at the root) show in the top alert.
- **Client-side checks.** The client checks only required and number formats for quick feedback. The server schema is authoritative.

*Alternative:* run zod on the client too. Rejected: it duplicates the schema in the bundle for little gain. The save round trip is local and fast.

### D3. Views and switching

- **Layout.** One "Preferences" tab with a segmented control **Form | YAML**. The choice is remembered in the URL (`?tab=preferences&view=yaml`).
- **Dirty state.** Each view tracks it.
- **Switching with unsaved changes** opens a small in-app dialog with Save, Discard and Cancel. Save runs the view's save, and the switch happens only if the save succeeds.
- **YAML to form.** The YAML text is parsed and validated first; if it is invalid, the switch is refused and the errors are shown. A valid but unsaved YAML must be saved or discarded first, so the form always reflects the file on disk.

*Alternative:* let the form edit unsaved YAML text in memory. Rejected: two in-memory sources of truth make it unclear what is saved.

### D4. Form building blocks

- **TagInput.** A shadcn `Input` plus `Badge` chips: Enter or comma adds, × removes, and drag or arrow buttons reorder. It is used for roles, skills, languages, work authorization, regions, keywords, stages and companies. Hidden companies keep a one-per-line textarea option, because lists there can be long: a "paste many" toggle.
- **Currency rows.** For `min_hourly` and `target_hourly`: rows of an ISO currency select and an amount, add or remove a row, and at least one row for the minimum.
- **Service lines.** Repeating cards with id (auto-slugged from the name and editable), name and evidence textarea.
- **Engagement types.** Checkboxes from `ENGAGEMENT_PREFERENCES`.
- **Time zone.** A combobox of `Intl.supportedValuesOf("timeZone")`.
- **Times** reuse the existing `TimePicker`.
- **Sections.** Collapsible cards in the order given in the proposal, with a sticky Save bar showing "N unsaved changes".

### D5. Moving existing controls

- **General.** It keeps the `DesktopCard`.
- **Old form and action.** `GeneralForm` and `saveSettings` are replaced by the Preferences form, and `saveExcludedCompanies` by the same action with the path `keywords.exclude_companies`.
- **Profile files.** It keeps the CV.
- **Links.** Old `?tab=general` links still open General. The default tab becomes "preferences".
- **Rescore hint.** Changes to scoring-relevant paths (everything except `notifications`, `research` and `scoring.daily_caps`) show "Rescore open offers" in the success toast.

## Risks / Trade-offs

- **The `yaml` library re-emits edited sequences in its default style.**
  - Mitigation: keep the flow or block style of the original node (D1).
  - A test checks that untouched lines are byte-identical.
- **A concurrent edit of the file outside the app between load and save.** Mitigation: the `baseHash` check in D1.
- **A large form can be overwhelming.** Mitigation: collapsible sections with the most-used ones (Targets, Keywords, Engagement and rates) open by default.

## Migration Plan

None. There is no data or schema change, and existing files load as they are.

## Open Questions

None.
