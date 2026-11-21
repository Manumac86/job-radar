# Tasks

## 1. Core: change application

- [x] 1.1 `applyPreferenceChanges(text, changes)` in `packages/core/profile` (design D1):
  - sets values, deletes keys and replaces sequences, keeping flow or block style;
  - validates;
  - returns errors with paths.

  `setPreferenceValues` delegates to it. Verified by unit tests on the seed preferences:
  - a single change leaves every other line byte-identical, with comments kept;
  - list replacement keeps flow style;
  - deleting `rates.target_hourly` validates;
  - an invalid change returns path-keyed errors;
  - the `sources` block is untouched.

## 2. Web: Preferences tab

- [x] 2.1 Server side:
  - the settings page loads the preferences text, parsed values and file hash;
  - the `savePreferences({ changes, baseHash })` action applies the hash check, applies the changes, reloads the worker and returns path-keyed errors;
  - it flags scoring-relevant changes.

  Verified by a Playwright test where an external file change between load and save is refused with "reload".
- [x] 2.2 Building blocks: `TagInput` (add, remove, reorder, paste many), currency rows, service-line cards, time zone combobox. Verified by Playwright interactions inside the form tests in 2.3, plus keyboard use (Enter adds, Backspace on empty removes the last item).
- [x] 2.3 Form sections for every field except `sources` (design D4), with a sticky Save bar, the unsaved count and field-level errors.

  Verified by Playwright tests:
  - add a target role and see it in the YAML view;
  - change only the capacity and check the file keeps its comments;
  - possible above strong shows the error and leaves the file unchanged;
  - clear the target rates and the key is removed;
  - the sources note is shown.
- [x] 2.4 Form | YAML switch with the URL state, the unsaved-changes dialog (Save, Discard, Cancel) and the refusal on invalid YAML.

  Verified by Playwright tests:
  - an edit in YAML, saved, appears in the form;
  - an unsaved form edit prompts on switch;
  - invalid YAML blocks the switch and shows the errors.
- [x] 2.5 Move the old controls (design D5):
  - General keeps the desktop card;
  - Profile files keeps the CV;
  - remove `GeneralForm`, `saveSettings` and `saveExcludedCompanies`;
  - the default tab is Preferences.

  Verified by updating `settings.spec.ts` and the other e2e specs that used the General form, all passing.

## 3. Docs and verify

- [x] 3.1 README and Settings help: preferences are edited in Settings → Preferences (form or YAML). Verified by review.
- [x] 3.2 Run `pnpm verify` and commit locally. Verified by the command passing.
- [x] 3.3 Owner check: edit your real preferences from the form (add a role, change a rate, add a hidden company), switch to YAML and confirm your comments are still there.

## Workflow follow-up

- Archive `preferences-ui` after the owner check.
