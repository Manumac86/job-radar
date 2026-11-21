# Proposal

## Why

The owner keeps several versions of their CV (for example AI engineer, tech lead, freelance consultant), each stressing different experience. Job Radar knows only one CV. It cannot say which version to send for an offer, or warn when the chosen version hides a requirement the owner meets. It also cannot learn which version gets replies.

## What Changes

- **Master CV plus variants.** `cv.md` stays the complete master CV. Named variants live in `data/profile/cvs/<id>.md`, each with a short "use for" line. The owner manages them in Settings → Profile files: add, edit, rename, delete.
- **Recommendation in the same scoring call.** Scoring still judges fit against the master CV, so the score does not change and there is no extra LLM call. The score result gains:
  - the recommended variant, with a one-line reason;
  - the offer requirements that variant does not show although the master CV does ("gaps").
- **Offer detail** shows "Recommended CV: <name>", the reason and the gaps.
- **Drafts** cite evidence from the recommended variant. The owner can pick another variant before generating. Facts must still come from the master CV or the profile.
- **Applications** record which CV variant was sent. "Mark as applied" pre-selects the recommended one, and the owner can change it.
- **Response patterns** on the dashboard gain a "CV sent" grouping.
- **Recommendation refresh.** Editing, adding or removing a variant does not rescore everything. A new "Refresh CV recommendations" action re-runs scoring for shortlisted offers only, within the daily cap. New offers get the current variants automatically.
- **No variants.** With no variants, everything behaves as today, and no recommendation is shown.

Assumption: variants are entered as Markdown text (pasted or typed). Importing PDF or Word files is out of scope and can be a follow-up.

## Capabilities

### New Capabilities

None. Variants are part of the candidate profile.

### Modified Capabilities

- **`candidate-profile`:** adds CV variants as profile files, editable from the UI, and the refresh of recommendations after a variant change.
- **`job-scoring`:** the score result carries the recommended variant, a reason and gaps when variants exist.
- **`application-drafts`:** drafts use a chosen variant (the recommended one by default) for emphasis, still grounded in the master CV.
- **`application-pipeline`:**
  - an application records the CV variant sent;
  - response patterns can be grouped by CV sent.

## Impact

- **`packages/core/profile`:**
  - variant loading and validation, and front matter with `name` and `use_for`;
  - a hash per variant set.
- **`packages/core/scoring`:**
  - new optional fields in `modelScoreSchema`;
  - the prompt includes variant summaries, under a size budget.
- **`packages/core/drafts`:** the prompt takes the selected variant.
- **`packages/db`:**
  - a migration adds nullable `scores.recommended_cv`, `scores.cv_reason`, `scores.cv_gaps` and `applications.cv_variant`;
  - the dashboard query gains a grouping.
- **`apps/worker`:**
  - the profile service watches `cvs/`;
  - a new route `POST /scoring/refresh-cv` for shortlisted offers.
- **`apps/web`:**
  - a CV variants editor in Settings;
  - the offer detail block;
  - a variant select in "Mark as applied" and in draft generation;
  - the dashboard grouping.
- **No new dependencies.** Nothing leaves the machine; variants are local files in `data/` (git-ignored).
