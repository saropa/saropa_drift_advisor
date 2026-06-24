# Activity-bar labeled-mode alignment

The web viewer's activity-bar (the vertical icon strip on the far left) supports
two display modes — icon-only and labeled. In labeled mode each button rendered
its short `data-label` word, but the buttons shrink-wrapped to their own text
(unequal widths), centered the icon+label pair, and sat with zero vertical gap,
so the labels did not read as an aligned list. This change makes labeled mode
present every button at the same width, with labels left-aligned and rows
vertically spaced.

## Finish Report (2026-06-24)

### Scope

CSS/assets only for the standalone web viewer. No Dart app code (`lib/`,
`test/`) and no VS Code extension behavior changed. Source edit is in
`assets/web/_toolbar.scss`; the compiled `assets/web/style.css` is regenerated
from it via `npm run build:style` (sass). A string-includes test in the
extension suite asserts the compiled CSS, so the extension test tree is touched
only for verification, not behavior.

### Defect

In labeled (density) mode — toggled by `.tb-labeled` on `#toolbar-bar`
(toolbar.ts flips it) — the buttons inherited the icon-only base rule's
`justify-content: center` and used `width: auto`, and the strip kept its
`gap: 0`. Result: buttons were different widths (each sized to its label),
icon+label was centered rather than left-aligned, and there was no spacing
between rows.

### Change

In `assets/web/_toolbar.scss`, the labeled-mode block now:

- sets `align-items: stretch` on `#toolbar-bar.tb-labeled` so its children fill
  the strip's content width — every button becomes the SAME width (the widest
  label sets it, adapting automatically across locales);
- adds `gap: var(--space-1)` on the strip for vertical spacing between rows
  (icon-only mode deliberately keeps `gap: 0` for a dense strip);
- on `#toolbar-bar.tb-labeled .tb-icon-btn`, adds `align-self: stretch` (fill the
  strip width), `justify-content: flex-start` (left-align icon + label), and a
  fixed `height: 2rem` so the stretch affects width only, not height;
- stretches the trailing theme button's flyout wrapper
  (`.tb-flyout-wrap { align-self: stretch }` plus its inner button `width: 100%`)
  so it matches the other rows' width and left edge instead of shrink-wrapping.

Dividers (`.tb-divider`) keep `align-self: center`, so they stay short and
centered rather than stretching — only the buttons align. Icon-only mode (no
`.tb-labeled` class) is unchanged. The mobile/responsive row layout
(`max-width: 900px`) is unaffected because the labeled buttons retain their
fixed `2rem` height and content-driven width when the strip flows as a row.

### Tests

Added two assertions to `extension/src/test/hamburger-menu.test.ts` under the
`Toolbar — style.css` suite, using a helper that slices each rule's body so a
generic property (e.g. `justify-content: flex-start`, which appears elsewhere)
is matched only inside the intended selector block:

- the labeled strip stretches children to equal width and adds row spacing
  (`align-items: stretch`, `gap: var(--space-1)`);
- labeled buttons fill width and left-align labels (`align-self: stretch`,
  `justify-content: flex-start`).

Both pass (`mocha --grep "labeled mode"` → 2 passing). The full extension suite
(2942 tests) also passes after `tsc` compile.

### Changelog

`CHANGELOG.md` gained an `## [Unreleased]` → `### Changed` entry describing the
aligned, equal-width, vertically-spaced labeled mode (user-facing wording, no
date per project convention).
