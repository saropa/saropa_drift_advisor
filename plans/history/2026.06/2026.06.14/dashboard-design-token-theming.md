# Dashboard design-token theming + widget data-shape fixes

The extension's webview panels each carried hand-painted status colors: the same
five-to-six status/grade hexes (`#22c55e`, `#ef4444`, `#eab308`, `#3b82f6`,
`#f97316`) were duplicated across fourteen files, with no shared token layer.
Fixed hexes ignore the user's chosen light/dark/high-contrast theme and fail
high-contrast accessibility modes. Separately, the dashboard's Row Count widget
rendered "NaN" and Table Preview rendered blank cells because both read SQL
result rows by array position, while the debug server returns each row as an
object keyed by column name; and the feature-discovery category buttons rendered
as plain text because their secondary-button background blended into the card
behind them with no border.

## Finish Report (2026-06-14)

### Scope
(B) VS Code extension (TypeScript), with (C) docs (CHANGELOG, LAUNCH_TEST). No
Flutter/Dart app code touched. Change set is color/gradient/button-styling plus
three widget data/rendering bug fixes — no layout, type-scale, or spacing
changes.

### What changed and why

**New shared token module — `extension/src/views/design-tokens.ts`.** A single
source of truth for the color layer of the Saropa Dashboard & Webview Style
Guide. `getWebviewTokens()` returns a `:root` block binding canonical token
names (`--surface-*`, `--text`, `--border`, `--status-*`, `--accent-*`,
`--grade-a..f`, `--brand`) to the host `--vscode-*` theme so every surface
follows the editor theme; the brand orange is the only fixed color, used as an
accent. `getStandaloneTokens()` returns the style guide's fallback palette with a
`prefers-color-scheme` dark override for HTML exports that have no host theme.
The module deliberately omits the spacing and type scales — adopting those would
reflow existing layouts, which was out of scope.

**Central token injection — `extension/src/webview-csp.ts`.** `secureWebviewHtml`
is the choke point every panel's HTML passes through (it stamps the CSP `<meta>`
into `<head>`). The webview token `:root` is now injected there as a `<style>`
alongside the meta, so all ~50 panels resolve `var(--status-bad)` etc. with no
per-panel import and a single edit re-themes them all. `style-src
'unsafe-inline'` already permits the injected style, so it needs no nonce.

**Status/grade hex replacement.** Fixed status and grade hexes (including
alpha-suffixed badge tints like `#ef444433`) were replaced with semantic tokens
across the dashboard, health, invariants, anomalies, index-suggestions,
analysis-history renderers, perf-baseline, and the export / breakpoint / compare
/ changelog / annotate forms. Tinted badge backgrounds became
`color-mix(in srgb, var(--status-bad) 20%, transparent)`. Grades A–F now derive
from the semantic tokens via `color-mix` rather than bespoke greens/reds.

**Standalone report re-skin — `extension/src/report/report-css.ts`.** The
exported HTML report's self-contained palette was revalued from its former blue
accent (`#0066cc`) to the Saropa brand orange plus the guide's neutral surfaces,
text, borders, and semantic anomaly colors. The report's local token names
(`--bg`, `--accent`, …) and its `[data-theme]` light/dark toggle were left intact
— values changed, structure unchanged. The SQL syntax-highlight palette inside
code blocks was left as-is (content rendering, not chrome).

**Secondary-button fallbacks.** Secondary buttons that bound to
`var(--vscode-button-secondaryBackground)` with no fallback were given the
`var(--surface-3)` / `var(--text)` token fallbacks (and `var(--border)` for the
one border usage in watch), so they stay visible in themes that leave the
secondary-button tokens unset — across bulk-edit, annotations, suite-findings,
query-builder, refactoring, sql-notebook, snippets, and watch.

**Widget data-shape fixes — `extension/src/dashboard/widgets/data-widgets.ts`
and `discovery-widget.ts`.** Row Count now reads the count from the first object
value (with positional-array and empty-result fallbacks), rendering the number
or 0 instead of NaN. Table Preview derives its column list from the row objects'
keys (the HTTP transport omits the `columns` key) and projects each object row
into the positional value array the mini-table renderer expects. The
feature-discovery buttons gained a border and theme-neutral fallbacks so they
read as buttons.

### Verification
- `tsc --noEmit -p ./` clean.
- Full mocha suite: 2851 passing (was 2848 before three regression tests were
  added).
- The `secureWebviewHtml` change keeps exactly one CSP `<meta>` (the injected
  token block is a `<style>`); `webview-csp.test.ts` passes unchanged.

### Tests
`extension/src/test/widget-data-fetcher.test.ts` gained three regression cases
that the prior suite lacked: the existing Row Count test mocked the old
array-of-arrays shape and so never exercised the actual bug. New cases pin (1)
Row Count over object-keyed rows renders the count and never "NaN", (2) Row Count
over an empty result renders 0, (3) Table Preview over object-keyed rows with no
`columns` key derives headers and fills cells.

### Test audit
The only existing test referencing a changed symbol is
`extension/src/test/health-html.test.ts`, which asserts the presence of the
`grade-a` CSS class name — unchanged by the migration (only the class's color
value moved to a token). No test pinned a status hex, the report's former blue
accent, or the widget rendering output, so no existing assertion required
rewriting.

### Files
- Added: `extension/src/views/design-tokens.ts`
- Changed: `extension/src/webview-csp.ts`,
  `extension/src/dashboard/dashboard-css.ts`,
  `extension/src/dashboard/widgets/data-widgets.ts`,
  `extension/src/dashboard/widgets/discovery-widget.ts`,
  `extension/src/health/health-css.ts`,
  `extension/src/invariants/invariant-styles.ts`,
  `extension/src/health/anomalies-html.ts`,
  `extension/src/health/index-suggestions-html.ts`,
  `extension/src/analysis-history/analysis-renderers.ts`,
  `extension/src/debug/perf-baseline-html.ts`,
  `extension/src/data-management/export-form-html.ts`,
  `extension/src/data-breakpoint/breakpoint-form-html.ts`,
  `extension/src/comparator/compare-form-html.ts`,
  `extension/src/changelog/changelog-form-html.ts`,
  `extension/src/annotations/annotate-form-html.ts`,
  `extension/src/report/report-css.ts`,
  `extension/src/bulk-edit/bulk-edit-html.ts`,
  `extension/src/annotations/annotation-panel-html.ts`,
  `extension/src/dashboard/widgets/suite-findings-widget.ts`,
  `extension/src/query-builder/query-builder-css.ts`,
  `extension/src/refactoring/refactoring-html.ts`,
  `extension/src/sql-notebook/sql-notebook-styles.ts`,
  `extension/src/snippets/snippet-library-html.ts`,
  `extension/src/watch/watch-html.ts`,
  `extension/src/test/widget-data-fetcher.test.ts`,
  `CHANGELOG.md`, `docs/launch/LAUNCH_TEST.md`

### Outstanding
The token system covers the color layer only. The style guide's brand overlay
(eyebrow/banner strip, KPI-card contracts), the spacing and type scales, and the
loading/empty/error state contracts remain unadopted by these panels — a separate
layout-phase effort. On-device visual confirmation across light, dark, and
high-contrast themes is a manual check (see LAUNCH_TEST).
