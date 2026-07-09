# Web viewer activity bar: widen ~20% and tint resting icons

The web viewer's vertical activity bar (`#toolbar-bar`, the left icon strip holding Home,
Tables, Search, Ask and ~18 tool launchers) was a dense, flat-gray icon column that read as
inert and gave the 20+ icons little breathing room. This change widens the strip by ~20% and
gives the resting icons a soft, theme-aware tint so the strip reads as interactive and scans
faster, without disturbing the shared `.tb-icon-btn` styling reused by the tab bar.

## Scope

Styling only — `assets/web/_toolbar.scss` (source) recompiled to `assets/web/style.css`
(generated via `npm run build:style`). No Dart, no TypeScript logic, no HTML markup, no
user-facing strings. The activity-bar markup in `lib/src/server/html_content.dart` was not
touched.

## Changes

- **Strip widened ~20%.** Icon buttons scaled `2rem → 2.4rem` (kept square), the glyph scaled
  `1.15rem → 1.38rem`, and the strip's side padding widened `0.49rem → 0.59rem`. Total strip
  width goes `~2.98rem → ~3.58rem` (+20.1%), giving larger tap targets and more spacing across
  the 20+ item column. The labeled (density) mode button height was raised `2rem → 2.4rem` to
  match so both density modes stay visually consistent.
- **Resting icons tinted.** The resting glyph color moved from flat `var(--muted)` gray to
  `color-mix(in srgb, var(--link) 60%, var(--muted))` — a deliberately soft blend of the
  theme's accent and muted tokens (one unified tint, not a per-icon palette). It is theme-aware
  because each of the four themes defines its own `--link`; when a browser lacks `color-mix` the
  declaration is dropped and the base `--muted` gray applies as a safe fallback. `color-mix` is
  already an established pattern elsewhere in this stylesheet.

## Design rationale

- **Scoping via `#toolbar-bar`.** `.tb-icon-btn` is shared between the activity strip and the
  tab bar. All new rules are prefixed with `#toolbar-bar` so only the activity strip changes; the
  tab-bar icons keep their compact 2rem / flat-gray form.
- **Specificity handling.** The id-prefixed resting rule (specificity 1,0,1) out-ranks the base
  `.tb-icon-btn:hover` / `.active` color rules (0,0,2). To preserve the hover/active escalation,
  the `:hover` (→ `--fg`) and `.active` / `[aria-pressed="true"]` (→ `--link`) colors are
  re-declared at the raised id-scoped specificity (1,0,2). The hover rule precedes the active
  rule in source order so an active-and-hovered button resolves the (1,0,2) tie in favor of the
  active accent color, matching the base rule's intent that an active button stays accent-colored
  while hovered.
- **Single soft tint, not a rainbow.** The request was a light color to aid scanning; a unified
  token-derived tint satisfies that while staying within the design system and avoiding a
  per-category color palette (which would introduce new design-system primitives).

## Test audit

No stack behavior changed. Three contract tests reference the touched area and all pass by
inspection — none pin the width/padding/color values that changed:

- `extension/src/test/hamburger-menu.test.ts` — asserts presence of `.tb-icon-btn`,
  `.tb-divider`, `.tb-flyout` selectors and, for labeled mode, `align-items: stretch`,
  `gap: var(--space-1)`, `align-self: stretch`, `justify-content: flex-start`. Only `height`
  changed in the labeled block; all asserted properties remain.
- `extension/src/test/tab-icons-accent.test.ts` — asserts on `state.ts`, `tabs.ts`,
  `html_content.dart`, `_tab-bar.scss`, theme SCSS, and the presence of `--tab-accent` /
  `.tab-icon` / `var(--tab-accent, var(--link))` in `style.css`. None of those files or strings
  were modified or removed.
- `test/web_viewer_nl_modal_contract_test.dart` — asserts `id="toolbar-bar"` exists in
  `html_content.dart` (unchanged).

Verified in the recompiled `style.css`: every selector and property string the three tests
assert on is present.
