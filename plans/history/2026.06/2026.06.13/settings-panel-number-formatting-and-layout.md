# Settings panel — numeric formatting and consistent row layout

The web viewer's Settings panel rendered its numeric limits (SQL history max
entries, max saved analyses, slow-query threshold, default page size) with no
thousands separators, so large values read as cramped digit runs (`2000`,
`60000`). The native `<input type="number">` spinner also forbids grouping
separators outright. Separately, the row layout was inconsistent: rows with a
description (sublabel) pushed their control onto its own line because the flex
layout gave the sublabel a full-width basis ahead of the control, so NULL
display, slow-query threshold, "show only matching", and the auto-refresh /
data-formatting toggles dropped their value or toggle underneath the label
instead of sitting inline on the right with the other rows.

## Finish Report (2026-06-13)

This work will be reviewed by another AI.

### Scope

(B) Web-viewer assets that compile into the VS Code extension bundle —
`assets/web/settings.ts` (TypeScript, bundled to `bundle.js` via esbuild) and
`assets/web/_settings.scss` (compiled to `style.css` via sass). No Flutter/Dart
app code and no `extension/src` runtime code changed, beyond extending an
existing extension contract test.

### Deep Review

- **Logic & Safety.** The stepper parses user input by stripping every
  non-digit (`/\D/g`), so any locale's group separator (comma, period, space,
  non-breaking space) round-trips without a locale-specific parser; values here
  are always positive integers, so sign handling is unnecessary. Every commit
  path clamps into the field's `[min, max]` (carried as data-attributes) before
  persisting, so stepper clicks, keyboard Arrow keys, and blur/Enter can never
  store an out-of-range value. An empty/garbage field falls back to `min` so a
  stepper press from a blank box still yields a sane number. `Intl.NumberFormat`
  is wrapped in try/catch that falls back to the bare integer, so a missing Intl
  or bad locale tag degrades instead of blanking the field.
- **Architecture & Adherence.** Formatting routes through one `fmtNum` helper
  bound to the existing `getActiveLocale()` from `l10n.ts` — the same locale
  source the rest of the viewer uses — rather than a second locale lookup. The
  three numeric prefs share a single `numberField()` markup builder and a single
  reworked `bindNumberInput()`, so there is no per-field duplication. Layout is
  expressed once on `.settings-row` as a CSS grid; controls are placed by
  explicit grid-area, so the visual result is independent of DOM order and every
  row type (number stepper / select / toggle) lands in the same right-hand
  column with the sublabel spanning underneath.
- **Performance & UI/UX.** No new dependencies, no new network or bundle assets
  (the stepper chevrons reuse the existing `material-symbols-outlined` font
  already loaded by the viewer). The stepper buttons are `aria-hidden` and
  removed from the tab order; the text input remains the single labeled,
  keyboard-steppable control via its wrapping `<label>`, preserving keyboard and
  screen-reader access that the native spinner provided. A reduced-motion media
  query disables the new button transition.
- **Documentation.** A module-level comment block explains why a custom
  text-input stepper replaces the native number spinner (the grouping-separator
  limitation). The grid rule carries a comment naming the prior flex+wrap
  regression it fixes.

### Testing

- **Existing tests audited.** Grepped `extension/src/test` and `assets/web/test`
  for every touched symbol/selector (`settings-input-number`, `settings-row`,
  `settings-switch`, `settings-sublabel`, `pref-*`, `defaultPageSize`,
  `margin-left: auto`, `type="number"`). The only settings assertion pins
  `.settings-switch` in the compiled CSS — still present. The one
  `margin-left: auto` assertion is in `web-table-view-blob-colvis.test.ts` and
  targets query-builder/results-table heading chevrons, not the
  `.settings-switch` rule that lost its `margin-left: auto` (grid now
  right-aligns it). No assertion pinned the removed native number markup.
- **New tests.** Extended `settings-panel.test.ts` with four contract checks:
  grid-template-areas present in compiled CSS, `.settings-stepper-btn` compiled
  in, `Intl.NumberFormat` + `getActiveLocale` used in `settings.ts`, and the
  stepper input rendered as `type="text" inputmode="numeric"`.
- **Result.** `tsc -p tsconfig.web.json --noEmit` clean; `npm run build:js` and
  `npm run build:style` rebuilt `bundle.js` + `style.css`; extension suite
  `2753 passing, 0 failing` (was 2749 before the four added tests).

### Localization

No new user-facing strings. The numeric values are formatted by
`Intl.NumberFormat` (not translatable text), the page-size option labels are
numbers, and the stepper chevrons are aria-hidden icon glyphs. No ARB / string
catalog changes.

### Files changed

- `assets/web/settings.ts` — added `fmtNum`/`parseNum`/`clampNum` helpers and a
  `numberField()` stepper builder; replaced the three native number inputs with
  the stepper; formatted page-size `<option>` labels via `fmtNum`; reworked
  `setNumberInput`/`bindNumberInput` for formatted display, clamping, keyboard
  and button stepping.
- `assets/web/_settings.scss` — `.settings-row` converted to a two-column grid
  with explicit `grid-template-areas`; controls pinned to the right cell;
  sublabel spans the second row; added `.settings-stepper*` styles; added inline
  padding to `.settings-input-number`; removed the now-redundant
  `margin-left: auto` on `.settings-switch`; action rows reset to flex; stepper
  button added to the reduced-motion block.
- `assets/web/bundle.js`, `assets/web/style.css` — rebuilt artifacts.
- `extension/src/test/settings-panel.test.ts` — four new contract assertions.
- `CHANGELOG.md` — user-facing "Improved" entry under `[Unreleased]`.

### Outstanding work

None. On-device visual confirmation in a running viewer is pending (see the
manual-test handoff).
