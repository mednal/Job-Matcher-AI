---
name: JuniorJob AI
description: An evidentiary job-triage interface where every junior verdict arrives with the sentences that produced it.
colors:
  verdict-blue: "#1d4ed8"
  verdict-blue-deep: "#1a3fae"
  verdict-blue-wash: "#e9efff"
  paper: "#f5f6f8"
  surface: "#ffffff"
  surface-sunk: "#eef0f4"
  hairline: "#dde1e7"
  hairline-strong: "#c3cad4"
  ink: "#15181d"
  ink-muted: "#5b6472"
  affirm: "#146c43"
  affirm-wash: "#e6f4ec"
  caution: "#9a5b00"
  caution-wash: "#fdf3e3"
  refuse: "#b42318"
  refuse-wash: "#fdf2f1"
typography:
  display:
    fontFamily: "'Inter Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "2rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "normal"
  headline:
    fontFamily: "'Inter Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "normal"
  title:
    fontFamily: "'Inter Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "normal"
  body:
    fontFamily: "'Inter Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
  body-small:
    fontFamily: "'Inter Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
  label:
    fontFamily: "'Inter Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: "0.06em"
  quote:
    fontFamily: "'Source Serif 4 Variable', 'Iowan Old Style', Palatino, Georgia, 'Times New Roman', serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
  posting-title:
    fontFamily: "'Source Serif 4 Variable', 'Iowan Old Style', Palatino, Georgia, 'Times New Roman', serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "normal"
rounded:
  sm: "4px"
  md: "8px"
  full: "999px"
spacing:
  "1": "0.25rem"
  "2": "0.5rem"
  "3": "0.75rem"
  "4": "1rem"
  "5": "1.5rem"
  "6": "2rem"
  "7": "3rem"
  "8": "4rem"
components:
  button-primary:
    backgroundColor: "{colors.verdict-blue}"
    textColor: "#ffffff"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "0.5rem 1rem"
  button-primary-hover:
    backgroundColor: "{colors.verdict-blue-deep}"
    textColor: "#ffffff"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0.5rem 1rem"
  button-secondary-hover:
    backgroundColor: "{colors.surface-sunk}"
    textColor: "{colors.ink}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.verdict-blue}"
    rounded: "{rounded.sm}"
    padding: "0.5rem 1rem"
  button-ghost-hover:
    backgroundColor: "{colors.verdict-blue-wash}"
    textColor: "{colors.verdict-blue}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "0.5rem 0.75rem"
    width: "100%"
  chip:
    backgroundColor: "{colors.surface-sunk}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "0.25rem 0.75rem"
  chip-brand:
    backgroundColor: "{colors.verdict-blue-wash}"
    textColor: "{colors.verdict-blue-deep}"
    rounded: "{rounded.full}"
    padding: "0.25rem 0.75rem"
  chip-positive:
    backgroundColor: "{colors.affirm-wash}"
    textColor: "{colors.affirm}"
    rounded: "{rounded.full}"
    padding: "0.25rem 0.75rem"
  chip-caution:
    backgroundColor: "{colors.caution-wash}"
    textColor: "{colors.caution}"
    rounded: "{rounded.full}"
    padding: "0.25rem 0.75rem"
  chip-negative:
    backgroundColor: "{colors.refuse-wash}"
    textColor: "{colors.refuse}"
    rounded: "{rounded.full}"
    padding: "0.25rem 0.75rem"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "1.5rem"
  score-badge-entry:
    backgroundColor: "{colors.affirm-wash}"
    textColor: "{colors.affirm}"
    rounded: "{rounded.md}"
    padding: "0.5rem 0.75rem"
  score-badge-unclear:
    backgroundColor: "{colors.caution-wash}"
    textColor: "{colors.caution}"
    rounded: "{rounded.md}"
    padding: "0.5rem 0.75rem"
  score-badge-experienced:
    backgroundColor: "{colors.refuse-wash}"
    textColor: "{colors.refuse}"
    rounded: "{rounded.md}"
    padding: "0.5rem 0.75rem"
  contradiction-banner:
    backgroundColor: "{colors.refuse-wash}"
    textColor: "{colors.refuse}"
    typography: "{typography.body-small}"
    rounded: "{rounded.sm}"
    padding: "0.5rem 0.75rem"
  nav-link:
    backgroundColor: "transparent"
    textColor: "{colors.ink-muted}"
    typography: "{typography.body-small}"
    rounded: "{rounded.sm}"
    padding: "0.5rem 0.75rem"
  nav-link-active:
    backgroundColor: "{colors.verdict-blue-wash}"
    textColor: "{colors.verdict-blue-deep}"
    rounded: "{rounded.sm}"
    padding: "0.5rem 0.75rem"
  empty-state:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.md}"
    padding: "3rem 1rem"
---

# Design System: JuniorJob AI

## Overview

**Creative North Star: "The Case File"**

Every job in this product is a case file, and every verdict on it arrives with the sentences that produced it. That is not a metaphor borrowed for flavour — it is the product's actual mechanism. A posting titled "Junior Java Developer" whose body demands five years is demoted and shown as demoted, with the offending phrase quoted. The interface's job is to make that evidence legible fast enough to triage twenty postings without opening any of them.

So the system reads like a well-kept dossier rather than a job board. Neutral paper-grey ground, white cards separated by hairlines, uppercase micro-labels standing over the facts they name, and quoted evidence set in italic behind a vertical rule the way a citation is set in a document. There is exactly one accent colour and it is rationed. Semantic colour — green, amber, red — is reserved for the verdict itself and never spent on decoration. Nothing lifts, nothing glows, nothing gradients. The interface is deliberately unexciting so that the one genuinely alarming thing on a card, the contradiction between a title and its own body, reads as alarming.

Density is moderate and comparison-first. The user is holding two or three candidate jobs in mind at once and running the same query across days, so the layout must stay still: the result list is never replaced by a spinner, the confirmation line never pushes the button it sits beside, and the filter chips sit exactly where the hand reaches when there are too few results. Restraint here is not minimalism as a style. It is the condition for reading carefully.

**Key Characteristics:**

- Evidentiary: quoted source phrases are a first-class visual object, not a tooltip.
- **Two voices in two faces:** the application speaks in Inter, the posting speaks in Source Serif 4. Job titles, employers, descriptions and quoted evidence are serif; every label, score, control and sentence the product writes itself is sans.
- Flat by construction: depth comes from 1px hairlines and tonal surface shifts, never lift.
- One rationed accent (Verdict Blue) plus a three-tone semantic verdict palette.
- Uppercase micro-labels (0.75rem, 0.06em tracking) over facts; sentence case everywhere else.
- Small radii — 4px on controls, 8px on containers, pill only on chips.
- Colour never carries meaning alone; the word is always present beside it.
- Light-only (`color-scheme: light`); no dark theme exists today.

## Colors

A cool neutral ground with one saturated cobalt and a three-tone verdict palette; every colour in the system is either structure, or a judgement about a job.

### Primary

- **Verdict Blue** (`#1d4ed8`): The single accent. It marks the one action that moves the user forward — the primary button, the active nav item, the focus ring, and links. It is the blue of an interface making a decision available, not of a brand asserting itself.
- **Verdict Blue Deep** (`#1a3fae`): The pressed and hovered state of anything Verdict Blue, and the text colour on blue-wash surfaces where the plain accent would not hold contrast.
- **Verdict Blue Wash** (`#e9efff`): The tinted ground behind the active nav item, the ghost-button hover, the filter-count pill and brand chips. Signals "this is the current one" without spending the full accent.

### Secondary

The verdict palette. These three are not brand colours and must never be used as such — each one is the interface stating a conclusion about a specific job, and each is always accompanied by the word that says the same thing.

- **Affirm** (`#146c43`) with **Affirm Wash** (`#e6f4ec`): Entry-level and likely-entry-level bands, and positive-signal headings. The colour of evidence in the user's favour.
- **Caution** (`#9a5b00`) with **Caution Wash** (`#fdf3e3`): The ambiguous band, concern headings, and the stale-posting notice. Not a warning about danger — a warning about uncertainty.
- **Refuse** (`#b42318`) with **Refuse Wash** (`#fdf2f1`): The experienced bands, error states, invalid fields, and — most importantly — the contradiction banner. Reserved for when the interface has something firm to say.

### Neutral

- **Ink** (`#15181d`): Body copy and headings. Near-black with a cool cast, never pure black.
- **Ink Muted** (`#5b6472`): Secondary text — company lines, hints, fact labels, counts, attribution. Roughly half the text in this interface is this colour, which is what keeps the primary content legible by contrast.
- **Hairline** (`#dde1e7`): Every border, divider, rule and separator in the system. The workhorse: this is what carries structure in place of shadow.
- **Surface** (`#ffffff`): Cards, panels, the header, the footer, form grounds, inputs.
- **Surface Sunk** (`#eef0f4`): Recessed tone — default chips, the score badge's resting ground, disabled inputs, secondary-button hover, nav hover.
- **Paper** (`#f5f6f8`): The page ground. Cards sit on it; it never sits on anything.

### Named Rules

**The One Verdict Rule.** Verdict Blue appears on the one action that moves the user forward, plus links, the focus ring, and the active nav item — and nowhere else. Never on headings, never on card borders, never on an icon for decoration, never to "add colour" to a flat area. Its rarity is what makes a primary button read as primary.

**The Word Beside the Colour Rule.** No state in this system is communicated by colour alone. The score badge shows the band name next to the number. The signal groups have "Positive" and "Concern" headings, not just green and amber. An invalid field is driven by `aria-invalid="true"`, not a class, so it can never look wrong to a sighted user while reading as fine to a screen reader. Audit test: render the screen in greyscale — if a meaning disappeared, it was never properly stated.

**The Verdict-Only Rule.** Green, amber and red are the product's judgement about a job. They are not available as accents, category colours, or chart series. If a new element wants one of them, the question to answer first is: what is it concluding about this posting?

## Typography

**Two faces, and which one you are reading tells you who is talking.**

**Interface face (`--font-sans`):** Inter Variable — `'Inter Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`. Everything the application says in its own voice: page titles, section headings, labels, facts, scores, band names, controls, hints, notes, nav.

**Document face (`--font-serif`):** Source Serif 4 Variable — `'Source Serif 4 Variable', 'Iowan Old Style', Palatino, Georgia, 'Times New Roman', serif`. Everything the *posting* says: the job title, the employer, the description body, and every phrase quoted as evidence.

Both are self-hosted variable fonts, installed as `@fontsource-variable/inter` and `@fontsource-variable/source-serif-4` and registered in `angular.json`'s `styles` array (roman for both, plus the serif italic that quoted evidence is set in). They are served per-subset by `unicode-range`, which is not an optimization detail here: job content is multilingual by design, and a German, French or Polish posting has to render in the same face as the English one beside it.

**Character:** The sans is neutral to the point of transparency — it is doing hierarchical work in a product where the user is scanning for a disqualifying sentence, and it should not be noticed. The serif is doing the opposite job: it makes the employer's words look like a document quoted into an interface rather than like more interface.

### Named Rules

**The Two-Voice Rule.** Serif is the posting; sans is the product. Before setting any new text, answer which of the two wrote it. A job title is serif because the employer wrote it. "Why this Junior Match" is sans because the product wrote it. The classifier's summary sentence is sans even though it is *about* the posting. This is the central honesty commitment made visible, and it is the one typographic decision in the system that is never made on how it looks.

### Hierarchy

- **Display** (600, 2rem, 1.25): Page titles only — one per screen.
- **Headline** (600, 1.5rem, 1.25): Section headings within a page.
- **Title** (600, 1.125rem, 1.25): Job card titles, detail-page section headings, empty-state titles. The most-used heading in the product, because the card title is the thing being scanned.
- **Body** (400, 1rem, 1.55): Descriptions and prose. Constrained to 70ch on the detail page, 60ch for standalone notes.
- **Body Small** (400, 0.875rem, 1.55): Secondary text — company lines, hints, counts, form labels, nav links. Numerically the most common size in the interface.
- **Label** (500, 0.75rem, 1.25, 0.02em tracking, uppercase): Fact labels, signal-group headings, the score badge's caption. Also used at sentence case for chips, attribution and evidence.

### Named Rules

**The Micro-Label Rule.** Uppercase with 0.06em tracking at 0.75rem is reserved for labels that name a fact appearing directly beneath them — "EXPERIENCE", "LOCATION", "JUNIOR MATCH", "POSITIVE SIGNALS", "POTENTIAL CONCERNS". Uppercase is never used for buttons, headings, nav, or emphasis. It means "this word is the name of the value below it". There is one implementation of it, the global `.ui-label` class in `styles.scss`; the four surfaces that each spelled the declaration out separately had already drifted apart once.

**The Quoted Evidence Rule.** Text lifted verbatim from a job posting is set in the document serif, italic, at 0.875rem in Ink Muted, indented behind a 2px hairline rule, and wrapped in typographic quotation marks via `::before` / `::after`. It never appears as plain body text, because the distinction between what the product says and what the employer said is the product's central honesty commitment. It is deliberately *not* the smallest text on the card — it sits level with the label above it, because the label is the summary and this is the source.

**The Tracking Rule.** Tracking is set optically, not uniformly: `--tracking-display` (-0.018em) at 2rem, `--tracking-title` (-0.008em) at 1.125–1.5rem, `--tracking-label` (0.06em) on uppercase micro-labels, and normal everywhere else. The negative values exist to hold Inter together at display sizes and are never applied to the serif, whose serifs need the room.

**The Two-Weight Rule.** 500 (medium) and 600 (semibold) are the only weights above regular. 500 marks something interactive or nameable; 600 marks a heading. There is no bold body text.

## Layout

A single centered column with 2rem of vertical and 1rem of horizontal page padding, applied once by a global `.page` primitive rather than per feature.

**There are two page measures, and the page's job picks which one.**

- **`--layout-max-width`, 72rem — the scanning measure.** Search and saved jobs, where the eye runs down a column of cards comparing them and the width buys facts side by side. This is the default every routed screen inherits.
- **`--layout-reading-width`, 52rem — the reading measure.** Job detail and the profile form, which are one document rather than a list. A 70ch paragraph inside a 1140px card reads as a half-empty card; the column has to sit near the measure of the text inside it. Applied as `.page.job-detail` / `.page.profile`.

The auth card is narrower still at 26rem, which is a card width rather than a page measure.

The header is sticky at 3.5rem, full-bleed white with a hairline bottom edge, and its inner content aligns to the same 72rem measure as the page. The footer mirrors it with a hairline top edge. Nothing else in the system is sticky.

Spacing runs on a 4px scale expressed in rem (0.25 / 0.5 / 0.75 / 1 / 1.5 / 2 / 3 / 4rem). The rhythm is consistent enough to be predictable: 1.5rem inside cards, 1rem between related blocks, 0.5rem between an element and its label, 1.5rem between result rows.

**Responsive behaviour is deliberately breakpoint-poor.** There is exactly one media query width in the entire application — 40rem — and it does three things: stacks the search bar's three controls into a column with a full-width submit, wraps the header so the nav takes its own row, and collapses the job card's two columns so the score badge returns to the flow under the company line. Everything else reflows on its own using `repeat(auto-fit, minmax(...))` grids (14rem tracks in the filter panel, 16rem in the profile form and signal columns) and `flex-wrap` on fact rows, chip rows and toolbars. Text measures are capped in `ch` (70ch for descriptions, 60ch for notes, 44ch for empty-state body) so line length holds without a breakpoint.

### Named Rules

**The One Breakpoint Rule.** Prefer intrinsic reflow — `auto-fit` grids, `flex-wrap`, `ch` measures, `min-width: 0` — over a new media query. A second breakpoint width needs a reason that intrinsic sizing genuinely cannot serve.

**The Still Layout Rule.** Content that is being compared does not move. The result list stays in place while the next page loads, with a quiet "updating" note beside the count rather than a spinner replacing the list. Status lines that appear on success reserve their space in advance (`min-height: 1lh`) so nothing beneath them jumps.

## Elevation & Depth

**This system is flat by construction, and that is doctrine, not omission.** Separation comes from three sources, in this order: a 1px Hairline border, a tonal shift between Paper, Surface and Surface Sunk, and — only for things that genuinely float above the page — a shadow.

In practice that means cards, panels, forms and the header are defined entirely by their border and their ground. `--shadow-sm` sits on cards as an almost-subliminal seat, not as lift. `--shadow-md` is used exactly once in the entire application, on the skip link, which is the one element that really does fly in over the page.

Hover never lifts. Hover changes tone — Surface Sunk under a secondary button, Verdict Blue Wash under a ghost button, Surface Sunk under a nav link. Nothing in this interface translates on the Y axis.

### Shadow Vocabulary

- **Seat** (`box-shadow: 0 1px 2px rgb(16 24 40 / 6%)`): Cards, the filter panel, the profile form, the auth card. Barely perceptible; it seats the card on the paper rather than lifting it off.
- **Float** (`box-shadow: 0 4px 12px rgb(16 24 40 / 8%)`): Reserved for elements that overlay page content — currently only the skip link. A future popover, menu or dialog would use this and nothing heavier.

### Named Rules

**The Borders-Carry-Depth Rule.** If a new surface needs to feel separate, give it a Hairline border and a tonal ground. Reach for a shadow only when the element genuinely overlays other content. There is no third shadow token, and a new one needs a real overlay to justify it.

**The No-Lift Rule.** Hover and focus change colour, tone or border — never elevation, never `transform: translateY`, never scale.

## Motion

There is one duration and one curve in the system: `--duration-fast` (120ms) and `--ease-out` (`cubic-bezier(0.2, 0.7, 0.3, 1)`). They are spent on state settling — a ground tinting, a border darkening, a disclosure chevron turning — and on nothing else. An interface built for holding two postings in mind at once does not perform; a transition longer than this is decoration.

A global `prefers-reduced-motion: reduce` block collapses every animation and transition in the application, and the loading spinner additionally stops rather than slows, because a small looping rotation is exactly the motion that triggers vestibular discomfort.

**The Settle-Only Rule.** Motion may change colour, tone, border or a rotation that reports state. It may not move layout, fade content in on arrival, or stagger anything.

## Shapes

Small, consistent, unfussy radii. 4px (`sm`) on everything the user operates directly — buttons, inputs, nav links, banners, the brand mark, chip remove targets. 8px (`md`) on everything that contains — cards, panels, forms, empty states, the score badge, error blocks. Fully round (`999px`) on chips and the filter-count pill only, where the pill silhouette says "this is a discrete value you can remove".

Borders are always 1px and always Hairline, with three deliberate exceptions: the dashed 1px Hairline border of an empty state (an outline for content that is absent), the 2px rule beside quoted evidence, and the 1px Refuse border around error blocks and invalid inputs.

The one filled shape in the system is the contradiction mark: a solid Refuse circle carrying a white glyph, sized 1.125rem, sitting inside the contradiction banner. It is the only circular filled element and the only place a glyph is enclosed.

### Named Rules

**The Radius-By-Role Rule.** 4px operates, 8px contains, pill enumerates. A new element takes its radius from which of those three it is doing, not from how it looks.

## Components

### Buttons

- **Shape:** Gently squared (4px), 0.5rem × 1rem padding, medium weight (500), 1px transparent border so the three variants share identical box metrics.
- **Primary:** Verdict Blue ground, white text. One per screen — this is the One Verdict Rule in its most literal form.
- **Secondary:** Surface ground, Hairline border, Ink text. The default for anything that is not the main action.
- **Ghost:** Transparent, Verdict Blue text, no border. For tertiary actions sitting beside other controls.
- **Hover:** Ground darkens or tints — Verdict Blue Deep, Surface Sunk, Verdict Blue Wash respectively. No lift, no shadow, no transition beyond the colour.
- **Disabled:** 0.6 opacity and **`cursor: progress`, not `not-allowed`** — a disabled button in this application is nearly always a submission in flight rather than a refusal, and the cursor should say so.
- **Block:** A `--block` modifier takes full width; used for the auth card's submit and the search bar below 40rem.

### Chips

- **Style:** Pill (999px), 0.25rem × 0.75rem padding, 0.75rem type, `white-space: nowrap`. Default is Surface Sunk ground with a Hairline border and Ink Muted text.
- **Tones:** `brand`, `positive`, `caution`, `negative` swap to the matching wash ground and full-strength text colour, and drop the border to transparent — the tinted ground does the containing.
- **Removable:** The remove control lives *inside* the chip so the chip stays one object the eye reads as a single filter value. Its hit area is 1.25rem square — larger than the glyph — so a finger clears it without the chip growing. It inherits `currentColor` rather than defining a colour per tone.
- **Never** carry urgency, novelty or promotion. Chips state facts: a technology, a location, an active filter, a verdict signal.

### Cards / Containers

- **Corner Style:** 8px.
- **Background:** Surface, on Paper.
- **Border:** 1px Hairline.
- **Shadow:** Seat only. See Elevation.
- **Internal Padding:** 1.5rem for job cards and the profile form, 1rem for the filter panel, 2rem for the auth card.
- **Internal division:** A 1px Hairline top border with 1rem of padding above it separates a card's sections — the signals block on a job card, the actions row on a form, the pagination bar under a result list.

### Inputs / Fields

- **Style:** Surface ground, 1px Hairline border, 4px radius, 0.5rem × 0.75rem padding, `font: inherit`, full width.
- **Focus:** The border shifts to Verdict Blue, *and* the global `:focus-visible` rule paints a 2px Verdict Blue outline at 2px offset. The outline is never removed anywhere in this system.
- **Invalid:** Refuse border, driven by `[aria-invalid='true']` rather than a CSS class, so the visual state and the assistive-technology state cannot diverge.
- **Disabled:** Surface Sunk ground, Ink Muted text.
- **Field anatomy:** Label (0.875rem, 500) above, control, then hint (0.75rem, Ink Muted) or error (0.75rem, Refuse) below, stacked at 0.25rem gaps.

### Navigation

- **Style:** Text links at 0.875rem / 500 in Ink Muted, 0.5rem × 0.75rem padding, 4px radius, no underline.
- **Hover:** Surface Sunk ground, text darkens to Ink.
- **Active:** Verdict Blue Wash ground, Verdict Blue Deep text — the only persistent use of the accent in the header.
- **Brand:** A 1.75rem Verdict Blue square (4px radius) carrying white "JJ" at 0.75rem, followed by the wordmark in Ink at 600. Marked `aria-hidden` — the wordmark beside it is the accessible name.
- **Mobile:** Below 40rem the header wraps and the nav takes its own full-width row at order 3. There is no hamburger and no drawer.
- **Account controls:** Log out is a `<button>` restyled to sit beside the links, because it changes state rather than addressing a page. The signed-in email truncates with an ellipsis at 14rem.

### Job Card (signature)

A two-column grid, not a header row over a body. Everything the posting says runs down column 1 — serif title, serif employer, the contradiction banner, the fact row, the technology chips — while the score badge occupies column 2 and spans the card's rows with `align-self: start`. As a header row it set the card's height to the badge's, which opened a 65px hole under the company line on every desktop card. Row spacing lives on the children's own margins, so the grid sets no row-gap and the badge's row span costs nothing.

The evidence block spans both columns under a full-width hairline. Below 40rem the grid collapses to one column and the badge returns to the flow directly under the company line, which is where the verdict has to be when the facts are a scroll away.

Hover darkens the card's hairline one step to `hairline-strong`. It does not lift.

### Junior Score Badge (signature)

The product's central claim, compressed into one object. A vertical stack in an 8px container: the uppercase micro-label "JUNIOR MATCH", the score at 1.5rem / 600 with display tracking and **tabular figures**, a smaller `%` unit held back to 0.75 opacity, and the band name beneath it at 0.875rem. A `min-width` of 8.5rem is load-bearing rather than cosmetic: the badges sit at the right edge of a column of result cards and the user reads the numbers straight down, so the column edge must not move from row to row.

- **Bands:** entry and likely share the Affirm wash; ambiguous takes Caution; both experienced levels take Refuse. Unscored jobs fall back to Surface Sunk with a Hairline border.
- **The band word is always rendered**, whether or not a score exists. The number never appears alone.
- A score of `0` is a real answer — `CLEARLY_EXPERIENCED` bottoms out there — and must be rendered, not treated as absent.
- The accessible name reads "Junior Match: 94 out of 100, Entry level" — never a percentage alone, and never phrased as a chance of being hired.

### Contradiction Banner (signature)

The single most useful line in the product: the posting's own stated minimum disagreeing with its own title. A Refuse Wash bar with Refuse text at 0.875rem / 600, 4px radius, led by a filled Refuse circle carrying a white glyph.

- Uses **Refuse, not Caution** — this is not a hint that the job might not suit, it is a documented contradiction, and it is what the user came for.
- The mark is a decorative glyph in a filled circle, never an emoji, so it renders identically on every platform, and it is hidden from assistive technology because the sentence beside it already says the whole thing.

### Signal List (signature)

Two auto-fit columns (16rem minimum) headed by uppercase micro-labels — "Positive" in Affirm, "Concern" in Caution. Each item is a 0.875rem / 500 label with the verbatim source phrase beneath it in italic 0.75rem Ink Muted, indented behind a 2px Hairline rule and wrapped in typographic quotes. This is the Case File made literal, and it is the component the rest of the system exists to support.

### Empty State

Surface ground inside a **dashed** 1px Hairline border at 8px radius, 3rem × 1rem padding, centered. Title at 1.125rem, body at 0.875rem Ink Muted capped at 44ch. The dashed edge is the system's one use of a non-solid border, and it means "content is absent here" rather than "content is separated here".

### Inline Error Block

A Refuse Wash panel with a 1px Refuse border at 8px radius and 1rem padding, laying the message and a retry control on one wrapping row, justified apart. The retry control is `border: 1px solid currentcolor` on a transparent ground, so it takes the Refuse tone from its parent rather than defining a fifth button variant.

It is **one implementation**: the global `.ui-error` / `.ui-error__retry` pair in `styles.scss`. Search, saved jobs, job detail, the profile and the auth screens all use it. They previously carried five near-identical copies, one of which had drifted to a white secondary button inside a red panel.

### Saved Toggle

A secondary button whose on-state is driven by `[aria-pressed='true']`, not a class — the same discipline as `aria-invalid` on fields, so the visual state and the announced state cannot diverge. On, it takes the Verdict Blue Wash ground and Verdict Blue Deep text that the active nav item uses; this is not a new meaning for the accent, it is "this is the current one". Off and on previously rendered identically, which made a shortlist unreadable down a page of twenty results.

### Loading Indicator

A 1rem ring — 2px Hairline border with a Verdict Blue top edge — turning once every 0.7s, beside a 0.875rem Ink Muted label. **The animation stops entirely under `prefers-reduced-motion: reduce`** and the label carries the message alone. A small looping spin is exactly the motion that triggers vestibular discomfort, so it is not merely slowed.

## Do's and Don'ts

### Do:

- **Do** carry depth with a 1px Hairline border and a tonal ground. Shadows are for overlays only, and there are exactly two shadow values in the system.
- **Do** state every meaning in words as well as colour. The band name sits beside the score; the signal columns are headed "Positive" and "Concern". Greyscale the screen: if a meaning vanished, restate it.
- **Do** set verbatim posting text as quoted evidence — the document serif, italic, 0.875rem, Ink Muted, behind a 2px rule, in typographic quotes. Never blend the employer's words into the product's voice.
- **Do** ask which voice wrote a string before setting it. Serif is the posting, sans is the product.
- **Do** give numbers that are compared down a column tabular figures (`.ui-tabular`) — scores, result counts, page ranges.
- **Do** theme the surfaces you did not draw: selection, caret, `accent-color`, scrollbars, placeholder, the select's chevron, the disclosure marker. They ship with browser defaults that belong to no design system.
- **Do** reach for intrinsic reflow before a media query: `repeat(auto-fit, minmax(14rem, 1fr))`, `flex-wrap`, `ch` measures, `min-width: 0`. There is one breakpoint (40rem) in the whole application and it should stay that way.
- **Do** take radius from role — 4px operates, 8px contains, pill enumerates.
- **Do** drive invalid states from `aria-invalid`, not a CSS class, so the visual and assistive states cannot disagree.
- **Do** keep the global `:focus-visible` outline (2px Verdict Blue, 2px offset) intact on every new control.
- **Do** use `cursor: progress` on a disabled submit — in this application, disabled almost always means in flight.
- **Do** expect non-English job content on every surface that renders a title, company or description. `Job.language` is real, result sets mix languages on one page, and German strings run long.

### Don't:

- **Don't** use gradients, gradient text, glassmorphism, backdrop blur, or glow. The product uses AI; the interface must not advertise it. This is doubly binding here — PRODUCT.md forbids fabricated accuracy claims, and visuals that imply sophistication are a claim.
- **Don't** add urgency or novelty badges — "NEW", "HOT", "Easy Apply", coloured ribbons, employer logo grids. The thesis is fewer, better-judged results; the card must not look like volume. Chips carry facts only.
- **Don't** spend Verdict Blue on headings, card borders, decorative icons, or flat areas that "need colour". One primary action per screen, plus links, focus and active nav.
- **Don't** use green, amber or red for anything that is not a verdict about a job.
- **Don't** lift on hover. No `translateY`, no scale, no shadow bloom — change tone instead.
- **Don't** replace a result list with a spinner while the next page loads. Leave the list in place with a quiet updating note; the layout must stay still for comparison.
- **Don't** render the junior score as a probability of being hired, in copy, in a progress ring, or in any framing that implies odds. It is a suitability score, and this is a standing honesty constraint on every surface that shows it.
- **Don't** show a number without its band word, and don't treat a score of `0` as missing.
- **Don't** set the product's own words in the serif, or the posting's words in the sans. The two faces are a claim about authorship, not a texture.
- **Don't** put a coloured border thicker than 1px on the side of a card, callout or notice. A tinted wash ground with matching text is how this system says "the interface has a conclusion here" — see the contradiction banner and the stale-posting notice.
- **Don't** name, logo or imply any job source as a partner. Zero sources have cleared the compliance review in `docs/SOURCES.md`, and the only adapter that exists is `fixture`.
