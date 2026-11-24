---
version: 1
slug: "src-app"
primary_target: "src/app"
related_targets: []
---

# Surface: Job Radar app (all screens)

Scope: the whole web app (dashboard, offers, offer detail, pipeline and drawer, people, sources, notifications, settings). Visitor mode: Operate.
Audience and job: the owner's daily triage session (see PRODUCT.md): decide on new offers, apply by hand, move the pipeline, keep notes and people. Constraints: light and dark first-class, dense data, shadcn/Tailwind v4 stack, Playwright contracts (roles, labels, test ids) kept.
Chosen direction: Star Atlas (the user adopted the declined catalog challenger `notation-diagram-systems-star-atlas` over the assigned Timetable). Memorable moment: every offer's score read as a star's magnitude.

## Direction contract

THESIS: The search is a sky to chart, not a feed to scroll: every offer is a star whose brightness is its score, plotted on one fixed magnitude ramp. It refuses the category default of white cards, a violet accent and coloured pill badges.

OWN-WORLD: Dark is the night chart: deep navy ground (#0A1021), indigo panels (#16233D) and chalk-white ink (#F2F2E9). Light is the printed atlas plate: cool chart paper (#F3F5F8) with navy ink. In both themes, red-flashlight vermilion (#FF4D2E dark, #D63A1E light) marks the one live state: selection, focus, the active nav item, the primary action, and the ring around the object under the eye. Spectral light italic names things (page titles, offer titles, company names); Geist with tabular figures carries every label and number. Hairline coordinate rules, square corners at 4px or less, and no shadows: panels are separated by rules.

STORY: The owner opens Offers and sees the night's brightest objects first, with magnitude dots, ranked. They ring one, read its chart (score breakdown, company, people, timeline), and shortlist, dismiss or apply. The pipeline is a set of charted plates, from Applied to Offer, and the dashboard shows tonight's sky at a glance.

FIRST VIEWPORT: Offers. A 232px navy rail on the left with the radar mark, standard nav links and an unread count; the active link wears a vermilion tick. The work area has the page title "Offers" in Spectral italic at 34px, the count in Geist and the Import action top right (no "Run" here: the product has no run-all action; each source runs from Sources). One compact filter toolbar follows. Then a dense table on hairline rules, about 48px rows (Pipeline column kept after Status, required by the offers-applied-status spec; below md the rows become ruled two-line entries): magnitude cell (a dot sized by the score's class plus the tabular score), title in Spectral italic 17px over company and terms in Geist 13px, rate right-aligned in tabular figures, source, posted, status. The selected row carries a vermilion ring on its dot.

FORM: Star atlas chart: dark navy plates, chalk dots on a fixed magnitude ramp, red-flashlight annotation. Position: an adopted catalog challenger, not on my ordered list. seed:0b04e60da014dbdd. Signature move: score as stellar magnitude. The dot's diameter follows one fixed ramp (strong / possible / weak / unscored) on every screen, and the dashboard plots open offers as a star field (age × score), with the brightest labelled and shortlisted ones ringed. Motion: 150–200ms state transitions only; a ring draws in on selection; under reduced motion it snaps.

Raises kept from the round: one accent owns every live state; a complete state vocabulary (rest, hover, pressed, focus, disabled), the same mark on every control; capacity is a hard, visible budget (committed hours as a ruled bar); one work area dominates each screen.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved

- The radar mark stays (brand commitment); it may be redrawn as a chart reticle in the new ink.
