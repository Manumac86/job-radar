# Proposal

## Why

Most of `preferences.yaml` can only be changed in the raw YAML editor: target roles, skills, service lines, keywords, locations, engagement types and the owner details. Settings → General covers only rates, caps, thresholds and notifications. Editing lists in YAML is error-prone (a wrong indent fails validation), but the owner also wants to keep the YAML view for quick bulk edits and to see the whole file.

## What Changes

- **New "Preferences" tab.** Settings gains it with a **Form | YAML** switch over the same `preferences.yaml`. Both views edit one file and validate against the same schema before anything is written.
- **The form covers every field of the preferences schema.** Its sections are:
  - **About you:** name, base location, time zone, work authorization, languages.
  - **Targets:** target roles, skills, leadership target (company stages and maximum team).
  - **Service lines:** an editable list of id, name and evidence.
  - **Engagement and rates:** engagement types, weekly capacity, minimum project hours, minimum and target hourly rates per currency, minimum day rate.
  - **Location:** remote only, accepted regions, maximum overlap.
  - **Keywords and companies:** include, exclude, title include, hidden companies.
  - **Scoring and research:** thresholds, models, daily caps, auto research.
  - **Notifications:** quiet hours, digest time, follow-up days.
- **Lists use a tag input:** add, remove and reorder. Per-currency rates use rows of currency and amount.
- **Advanced fields stay in YAML.** The per-source settings block (`sources:`) is not in the form; the form says so and links to the YAML view.
- **Saving from the form keeps the YAML file's comments, key order and formatting** for untouched fields. Only the changed values are written.
- **Unsaved edits.** Switching views with unsaved changes asks to save or discard. The YAML view refuses to switch to the form while its text is invalid, and shows the field errors.
- **Moved controls.**
  - The "General" tab's rates, caps, thresholds and notifications form, and the "Hidden companies" card, move into the Preferences tab.
  - General keeps the desktop app card.
  - "Profile files" keeps the CV only (and CV variants once that change lands).
- **Saving reloads the worker as today.** The "Rescore open offers" hint appears when a field that affects scoring changed.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- **`candidate-profile`:** adds a form for every preference field alongside the YAML view, with comment-preserving saves, a single validation path and safe switching between views.

## Impact

- **`packages/core/profile`:**
  - a helper that turns the parsed preferences into form values and applies a set of changed paths back to the YAML document; this extends `setPreferenceValues`, including deleting keys and replacing lists;
  - unit tests.
- **`apps/web`:**
  - `settings/preferences-panel.tsx`, the form sections and the YAML view;
  - a tag-input component built from shadcn primitives;
  - one server action `savePreferences(changes)` replacing `saveSettings` and `saveExcludedCompanies`;
  - the General and Profile files tabs reduced;
  - Playwright tests updated.
- **No worker or database changes, and no new dependencies.**
