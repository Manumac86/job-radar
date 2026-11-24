---
name: Job Radar
description: A local job and freelance radar, charted as a star atlas.
colors:
  plate-paper: "#f3f5f8"
  plate-card: "#fbfcfd"
  plate-popover: "#ffffff"
  navy-ink: "#0e1730"
  plate-muted: "#e8ecf2"
  plate-secondary: "#e4e9f1"
  plate-accent: "#e2e7ef"
  slate-ink: "#4b5670"
  plate-rule: "#cfd6e1"
  plate-input-rule: "#c2cad8"
  vermilion-plate: "#c2321a"
  flashlight-plate: "#d63a1e"
  destructive-plate: "#b3261e"
  magnitude-possible-plate: "#3d4b6b"
  magnitude-weak-plate: "#8791a6"
  status-applied-plate: "#8a4f00"
  status-shortlisted-plate: "#1f3b8a"
  status-spent-plate: "#7d8699"
  night-ground: "#0a1021"
  night-plate: "#16233d"
  night-popover: "#1b2a47"
  night-muted: "#121c33"
  night-secondary: "#22325a"
  night-rule: "#2a3b5e"
  night-input-rule: "#34476b"
  chalk-ink: "#f2f2e9"
  night-slate-ink: "#a3adc2"
  flashlight-night: "#ff4d2e"
  destructive-night: "#ff6b5a"
  magnitude-possible-night: "#b8c1d6"
  magnitude-weak-night: "#6f7c97"
  status-applied-night: "#ffb36b"
  status-shortlisted-night: "#a9bcff"
  status-spent-night: "#7a87a2"
  rail-sky: "#0a1021"
  rail-sky-night: "#060b18"
  rail-ink: "#c6cddc"
  rail-active: "#16233d"
  rail-rule: "#1d2a45"
typography:
  display:
    fontFamily: "Spectral, ui-serif, Georgia, serif"
    fontSize: "2.125rem"
    fontWeight: 400
    lineHeight: 1.05
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Spectral, ui-serif, Georgia, serif"
    fontSize: "1.25rem"
    fontWeight: 400
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Spectral, ui-serif, Georgia, serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  figure:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.33
    letterSpacing: "-0.02em"
    fontFeature: '"tnum" 1, "ss01" 1'
  body:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
    fontFeature: '"ss01" 1'
  label:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.33
    fontFeature: '"tnum" 1, "ss01" 1'
rounded:
  sm: "2px"
  md: "3px"
  lg: "4px"
  full: "9999px"
spacing:
  unit: "4px"
  cell-y: "6px"
  cell-x: "12px"
  gutter-sm: "16px"
  gutter-md: "32px"
  section: "24px"
components:
  button-primary:
    backgroundColor: "{colors.vermilion-plate}"
    textColor: "{colors.plate-popover}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  button-primary-night:
    backgroundColor: "{colors.flashlight-night}"
    textColor: "{colors.night-ground}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  button-outline:
    backgroundColor: "{colors.plate-paper}"
    textColor: "{colors.navy-ink}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  button-ghost-hover:
    backgroundColor: "{colors.plate-accent}"
    textColor: "{colors.navy-ink}"
    rounded: "{rounded.md}"
  status-annotation:
    textColor: "{colors.slate-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "2px 6px"
  plate:
    backgroundColor: "{colors.plate-card}"
    textColor: "{colors.navy-ink}"
    rounded: "{rounded.lg}"
    padding: "24px"
  plate-night:
    backgroundColor: "{colors.night-plate}"
    textColor: "{colors.chalk-ink}"
    rounded: "{rounded.lg}"
    padding: "24px"
  table-row:
    typography: "{typography.body}"
    padding: "6px 12px"
  table-head:
    textColor: "{colors.slate-ink}"
    typography: "{typography.label}"
    height: "36px"
  rail:
    backgroundColor: "{colors.rail-sky}"
    textColor: "{colors.rail-ink}"
    width: "256px"
  rail-item-active:
    backgroundColor: "{colors.rail-active}"
    textColor: "{colors.chalk-ink}"
    rounded: "{rounded.md}"
    height: "36px"
  pipeline-card:
    backgroundColor: "{colors.plate-card}"
    rounded: "{rounded.sm}"
    padding: "10px"
---

# Design System: Job Radar

## Overview

**Creative North Star: "The Star Atlas"**

The search is a sky to chart, not a feed to scroll. Every offer is a star whose brightness is its score, plotted on one fixed magnitude ramp, and every screen is a plate of that atlas. Light theme is the printed atlas plate: cool chart paper with navy ink. Dark theme is the night chart: a deep navy ground, indigo plates and chalk ink. In both, the sidebar rail stays the night sky, and one red-flashlight vermilion marks whatever is live under the eye.

The system is dense and calm. Tables run on hairline rules at roughly 48px per offer row, panels are separated by rules rather than lifted by shadows, and corners stay square-ish (4px or less). Two voices split the work: Spectral italic names things (page titles, offer titles, company names, stage names, star labels), and Geist with tabular figures carries every label, count and number. Colour is withheld from data; magnitude is ink weight and size, never a hue.

The world deliberately refuses the category default of white rounded cards, a violet accent and coloured pill badges.

**Key Characteristics:**

- Score read as stellar magnitude: a dot whose diameter follows one fixed ramp (strong / possible / weak / unscored) on every screen.
- One accent, the flashlight vermilion, owns every live state: selection, focus, the active nav icon, the primary action, the drag target, the unread count.
- Spectral italic for names, Geist tabular for figures; never the other way round.
- Hairline coordinate rules and tonal plates instead of shadows at rest.
- A navy rail in both themes; light and dark are both first-class.

## Colors

A cool, nearly monochrome navy ink system with a single vermilion signal and quiet annotation tints for offer status.

### Primary

- **Flashlight Vermilion** (plate `{colors.vermilion-plate}` for fills, `{colors.flashlight-plate}` for rings and focus; night `{colors.flashlight-night}` for both): the one live accent. Primary buttons, focus outlines, the caret, text selection (28% mix), the ring on a selected or shortlisted star, the hover ring in the sky chart, the active nav icon, the unread badge, the column border when a card is dragged over it, and the dragged card's border. The rail uses the night value in both themes.

### Neutral

- **Chart Paper** (`{colors.plate-paper}`) / **Night Ground** (`{colors.night-ground}`): page background.
- **Plate White** (`{colors.plate-card}`) / **Indigo Plate** (`{colors.night-plate}`): cards, the offers table container, pipeline cards.
- **Popover** (`{colors.plate-popover}` / `{colors.night-popover}`): menus, selects, dialogs.
- **Navy Ink** (`{colors.navy-ink}`) / **Chalk Ink** (`{colors.chalk-ink}`): primary text and the strong magnitude dot.
- **Slate Ink** (`{colors.slate-ink}` / `{colors.night-slate-ink}`): secondary text, table heads, metadata lines under titles, chart axis labels.
- **Muted, Secondary, Accent tints** (`{colors.plate-muted}`, `{colors.plate-secondary}`, `{colors.plate-accent}`; night `{colors.night-muted}`, `{colors.night-secondary}`): quiet fills for row hover (accent at 55%), segmented controls, closing pipeline stages (muted at 50%).
- **Hairline Rule** (`{colors.plate-rule}` / `{colors.night-rule}`) and **Input Rule** (`{colors.plate-input-rule}` / `{colors.night-input-rule}`): every border, divider and field stroke; the input rule also colours the scrollbar thumb.
- **Rail Sky** (`{colors.rail-sky}`, deepening to `{colors.rail-sky-night}` in dark), **Rail Ink** (`{colors.rail-ink}`), **Rail Active** (`{colors.rail-active}`), **Rail Rule** (`{colors.rail-rule}`): the sidebar, always night.

### Magnitude ramp

- **Strong** (navy ink / chalk ink), **Possible** (`{colors.magnitude-possible-plate}` / `{colors.magnitude-possible-night}`), **Weak** (`{colors.magnitude-weak-plate}` / `{colors.magnitude-weak-night}`): ink weights for the score dot. Same hue, stepped value; the ramp is paired with size so it never depends on colour alone.

### Status annotations

- **Applied** (`{colors.status-applied-plate}` / `{colors.status-applied-night}`, an amber ink) and **Shortlisted** (`{colors.status-shortlisted-plate}` / `{colors.status-shortlisted-night}`, a blue ink): the two live statuses, drawn as a 45% border with a 10% wash.
- **New** (slate ink on a plain rule), **Dismissed** (struck through), **Filtered** (dashed border), **Archived** (borderless), all in **Spent Grey** (`{colors.status-spent-plate}` / `{colors.status-spent-night}`).
- **Destructive** (`{colors.destructive-plate}` / `{colors.destructive-night}`): errors, an over-budget capacity bar, destructive buttons.

Chart series colours (`--series-1..8`, `--chart-1..5` in `globals.css`) exist for per-source charts only and are not part of the atlas voice.

### Named Rules

**The One Flashlight Rule.** Vermilion marks only what is live: selected, focused, active, primary, or being moved. If nothing on the plate is live, nothing on it is vermilion.

**The Ink-Not-Hue Rule.** Score is never coloured. Magnitude is carried by dot diameter and ink weight; the only hue a score may wear is the flashlight ring, and only when the offer is selected or shortlisted.

## Typography

**Display Font:** Spectral italic, self-hosted (300 and 400, italic and roman, latin and latin-ext), with ui-serif and Georgia as fallback
**Body Font:** Geist variable, self-hosted (100 to 900), with ui-sans-serif and system-ui as fallback
**Label/Mono Font:** Geist for labels; ui-monospace, SF Mono or Menlo only for code and YAML

**Character:** A cartographer's italic for names over a precise, engineered sans for every number. The serif names the objects; the sans measures them.

### Hierarchy

- **Display** (Spectral italic 400, 34px, line-height 1.05, -0.01em): page titles in the page header, over a hairline rule.
- **Headline** (Spectral italic 400, 20px, line-height 1.25): every card and plate title (the shared card title carries this voice by default, such as "Tonight's sky" and "Next 7 days"); pipeline stage names at 18px; the wordmark in the rail. Sub-headings inside a plate (such as interview-prep sections) step down to Geist 500 at 14px in full ink.
- **Title** (Spectral italic 400, 17px, line-height 1.2): offer titles in the table and the mobile list, company names on pipeline cards (16px), star labels in the sky chart (13px).
- **Figure** (Geist 600, 24px, -0.02em, tabular): dashboard counts and the large score.
- **Body** (Geist 400, 14px): table cells, rates, sources, dates, descriptions. `ss01` is on globally.
- **Label** (Geist 500, 12px): table heads, figure-strip labels, status annotations, the magnitude key, chart axis text, metadata lines under titles (400).

### Named Rules

**The Two Voices Rule.** Spectral italic names things; Geist measures them. Never set a number, label, button or table head in Spectral, and never set a page, offer, company or stage name in Geist.

**The Tabular Rule.** Every table and every element marked as a count uses tabular figures, so columns of numbers align on the plate.

## Layout

A fixed navy rail (256px, collapsible to icons) on the left, a 48px top bar holding the rail toggle and theme switch, and one work area capped at 1536px wide with a 16px gutter on small screens and 32px from md up (24px / 32px vertical). Spacing runs on a 4px unit.

Each screen has one dominant work area under a page header: Spectral title, a Geist description line, actions top right, then a hairline rule and 24px before the content. Tables use 36px heads and cells padded 6px by 12px (16px at the row ends), giving offer rows of about 48px with a title over a metadata line. Below md, the offers table becomes a ruled list of two-line entries.

The dashboard opens with a figure strip: a single ruled plate divided into 2, 4 or 7 cells (by breakpoint), each a label over a figure. Committed hours sits in the last cell as a hard, visible budget: a 6px ruled bar filled in ink, turning destructive when over. Plates below use a 3-column grid (the sky chart takes two).

The pipeline is a horizontal run of 256px stage columns that share their borders (each overlaps the previous by 1px), so the board reads as one ruled plate.

## Elevation & Depth

Flat by default. Every small shadow token (`2xs` to base) is `none`, so surfaces at rest are separated by hairline rules and tonal plates only: paper, plate, popover in light; ground, plate, popover in dark. Shadows exist only for layers that float above the plate or are being moved, and they are soft navy (black in dark), never hard or offset.

### Shadow Vocabulary

- **Float** (`box-shadow: 0 8px 24px -12px rgb(10 16 33 / 0.28)`): menus and popovers.
- **Lift** (`box-shadow: 0 12px 32px -12px rgb(10 16 33 / 0.32)`): a pipeline card while it is dragged.
- **Overlay** (`0 16px 40px -16px` at 0.36, `0 24px 56px -20px` at 0.4): sheets and dialogs.

### Named Rules

**The Ruled Plate Rule.** Nothing rests on a shadow. If two panels need separating at rest, draw a rule or change the plate tone.

## Shapes

Square-ish and drafted. The base radius is 3px; the scale tops out at 4px for cards and plates, with 2px for annotations, pipeline cards and the unread count. Circles are reserved for stars: magnitude dots, the flashlight ring and the radar mark. Borders are 1px hairlines; the selection ring is 1.5px. Dashed strokes mean "not yet": the unscored dot, the filtered status, an empty pipeline.

## Components

### Buttons

Precise and quiet; only the primary action carries colour.

- **Shape:** drafted corners (3px), 36px tall (32px small, 24px extra small).
- **Primary:** flashlight vermilion fill with white text (night: vermilion with ground-navy text), 16px horizontal padding. One per screen region, for the main action (Import, Save).
- **Hover / Focus:** fill drops to 90%; focus draws the vermilion outline plus a 3px vermilion ring at 50%. Disabled is 50% opacity.
- **Outline / Ghost / Secondary:** plate fill with a hairline (outline), transparent with an accent wash on hover (ghost), secondary tint (secondary). No resting shadow.

### Status annotations

- **Style:** 12px Geist medium, 2px corners, 2px by 6px padding. Applied and Shortlisted are tinted (45% border, 10% wash, full-strength ink); New sits on a plain hairline; spent states (Dismissed struck through, Filtered dashed, Archived bare) fall back to grey.
- **State:** these are annotations, not pills; they never use a solid fill.

### Cards / Plates

- **Corner Style:** 4px.
- **Background:** plate white / indigo plate on chart paper / night ground.
- **Shadow Strategy:** none (see Elevation).
- **Border:** one hairline.
- **Internal Padding:** 24px; titles in the headline voice (Spectral italic 400, 20px), which is the card title's default.

### Inputs / Fields

- **Style:** hairline input-rule stroke, 3px corners, 36px tall, Geist 14px; the filter toolbar is a single wrapped row of selects labelled "Field: value".
- **Focus:** vermilion outline and ring; the text caret is vermilion everywhere.

### Navigation

- **Style:** the rail is the night sky in both themes. Radar mark and Spectral wordmark at the top over a rail rule; seven Geist links, 36px tall, with lucide icons.
- **Active:** rail-active fill, chalk text in medium weight, icon in flashlight vermilion. The unread count is a 2px-cornered vermilion chip.
- **Mobile:** the rail collapses to an off-canvas sheet behind the top-bar toggle.

### Data table

- **Rows:** hairline rule between rows, accent wash at 55% on hover and while a row menu is open, full accent when selected; 150ms colour transition.
- **Cells:** magnitude cell first, title in the title voice over a 12px metadata line, rate right-aligned and tabular, "Rate unknown" in slate.

### Magnitude dot (signature)

A 16px cell holding a filled circle on one ramp: strong 12px in full ink, possible 8px in possible ink, weak 4px in weak ink, unscored an 8px dashed weak circle. The figure sits beside it in Geist 600, weak scores in slate. A selected or shortlisted offer adds a 1.5px flashlight ring drawn 4px outside the dot.

### Tonight's sky (signature)

The dashboard plots open scored offers as a star field inside a ruled coordinate frame: age on x (today on the right), score on y, with the 60 and 80 thresholds as faint declination lines and tick marks on both axes. Stars use the magnitude ramp, shortlisted stars wear the flashlight ring, hover and focus draw a second faint ring, and the five brightest strong offers are labelled with their company name in Spectral italic, set right of the star, or left of it when the name would cross the frame's right edge, so labels never leave the plate. A key below repeats the ramp. Every star is a link to its offer.

### Save bar

A sticky bar at the foot of the settings form: an opaque page-background fill (never translucent over content), one hairline, 2px corners, 8px by 12px padding, an unsaved count in slate on the left and the actions on the right. With no unsaved changes, only its buttons dim (to 80%); the bar itself never fades.

### Radar mark

The brand radar drawn as a chart reticle: two rings, crosshair ticks, a sweep line and one vermilion object under the eye.

### Capacity bar

A 6px bar inside a 25% ink hairline frame, filled in 70% ink up to committed hours; over budget it fills destructive. It is the one bar on the dashboard and it is never decorative.

## Do's and Don'ts

### Do:

- **Do** read every score through the magnitude dot on the fixed ramp (12 / 8 / 4px, dashed when unscored), on every screen that shows a score.
- **Do** reserve vermilion for live state: selection, focus, the active nav icon, the primary action, drag, unread.
- **Do** set page, offer, company and stage names in Spectral italic, and every number, label and control in Geist with tabular figures.
- **Do** separate panels with 1px hairline rules and plate tone; keep corners at 4px or less.
- **Do** keep transitions to 150 to 200ms colour and opacity changes, and let them snap under reduced motion.
- **Do** keep the rail navy in both themes and design every screen in both plate and night.

### Don't:

- **Don't** colour scores or use coloured score pills; magnitude is size and ink weight.
- **Don't** introduce a second accent colour or use vermilion for decoration.
- **Don't** put resting shadows on cards or plates; shadows are for floating and dragged layers only.
- **Don't** use rounded cards above 4px or pill-shaped status badges.
- **Don't** set labels, buttons or figures in Spectral, or names in Geist.
- **Don't** add uppercase, letter-spaced section labels above titles; the Spectral title names the section on its own.
