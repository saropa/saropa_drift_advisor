# Home tab: remove sidebar toggles + home screen polish

Improvements to the **web viewer Home tab**.

Home tab markup: [html_content.dart:302-315](../lib/src/server/html_content.dart#L302-L315)
(`#panel-home` → `.home-screen` → `.home-sidebar-toggles` + `#home-tool-grid`).
Home logic: [home-screen.ts](../assets/web/home-screen.ts).
Home styling: [_home-screen.scss](../assets/web/_home-screen.scss) (compiles to `style.css`).
Launcher list + blurbs: [state.ts:255-278](../assets/web/state.ts#L255-L278) (`HOME_LAUNCHERS` + `HOME_EXTRAS`).

---

## 1. Remove the "Tables panel" / "History panel" toggles

Remove the two sidebar toggles from the Home screen.

- Markup: `.home-sidebar-toggles` block — [html_content.dart:304-313](../lib/src/server/html_content.dart#L304-L313)
  (`#home-switch-tables`, `#home-switch-history`).
- Wiring: `syncSidebarTogglesFromLayout()` / `wireHomeSwitch()` and the two
  `togglePanel('tables' | 'history')` listeners — [home-screen.ts:16-43](../assets/web/home-screen.ts#L16-L43), 116-117.
- Styles: `.home-switch` / `.home-switch-on` / `.home-sidebar-toggles` — [_home-screen.scss:7-68](../assets/web/_home-screen.scss#L7-L68).

Note: the sidebar panels themselves stay; only the **Home-screen toggles** for them are removed.
`togglePanel()` in [sidebar-panels.ts:88-97](../assets/web/sidebar-panels.ts#L88-L97) keeps its other callers.

## 2. More spacing between the home panels

The launcher grid is crushed. Loosen it.

- Grid gap: `.home-tool-grid { gap: 0.65rem; }` — [_home-screen.scss:70-74](../assets/web/_home-screen.scss#L70-L74).
- Card padding / min-height: `.home-tool-card` — [_home-screen.scss:76-91](../assets/web/_home-screen.scss#L76-L91).

Increase the grid gap and card padding so the cards breathe.

## 3. Per-tool color accent on each home card

Each tool/screen should carry its own accent color, used as a highlight on its Home card
(e.g. a left border, icon tint, or hover ring).

State today: cards have **no per-tool color** — they all use theme tokens
(`--surface`, `--border`, `--link`) — [_home-screen.scss:76-96](../assets/web/_home-screen.scss#L76-L96).

Work required: assign a color per launcher id and feed it into the card. Add a `color` (or
`accent`) field to each entry in `HOME_LAUNCHERS` — [state.ts:256-271](../assets/web/state.ts#L256-L271) —
so the color is a single source of truth, then apply it in `buildToolGrid()`
[home-screen.ts:45-111](../assets/web/home-screen.ts#L45-L111) and style in `_home-screen.scss`.
Colors must resolve correctly in light, dark, and midnight themes — [_themes.scss](../assets/web/_themes.scss).

## 4. Narrative feature description under the page name

State today: the Home screen has **no page title and no feature list** — only the grid of cards,
each with a terse one-line blurb in `HOME_LAUNCHERS` — [state.ts:256-278](../assets/web/state.ts#L256-L278).

Work required: add a page heading and a narrative intro paragraph that rolls the existing blurbs
into prose **without dropping any detail** (every capability currently listed across the blurbs must
still be mentioned). New markup in `.home-screen` above `#home-tool-grid`
[html_content.dart:303-314](../lib/src/server/html_content.dart#L303-L314).

## 5. Fuzzy feature search box on Home

Add a search box on the Home screen to find a feature by name (e.g. type "theme" → highlight/jump to
the Theme card).

- Fuzzy matching against a large keyword dictionary (tool names, blurbs, synonyms), not exact substring.
- This is **distinct from** the existing Search tab (schema/data search) — [html_content.dart:353-378](../lib/src/server/html_content.dart#L353-L378),
  [search-tab.ts](../assets/web/search-tab.ts). This new box searches **features/tools**, not table data.

Work required: input above `#home-tool-grid`, a fuzzy-match function, and a per-launcher keyword
dictionary (extend `HOME_LAUNCHERS` or a sibling map). Filter/highlight cards as the user types.

---

## Status

Cleaned up and scoped. Not yet implemented. Item 1 (remove toggles) is the only pure-removal task;
items 2-5 are additive features and should each be confirmed before building.
