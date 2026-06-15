# Theme the second status-color cluster the token migration missed

The first design-token migration (see `dashboard-design-token-theming.md`) converted the
fourteen panels that shared one status/grade hex set (`#22c55e`, `#ef4444`, `#eab308`,
`#3b82f6`, `#f97316`). A second, independent group of webview panels hardcoded a *different*
palette — Bootstrap-style `#28a745` / `#dc3545` / `#e0a800` plus fixed dark backgrounds and
light-on-dark badge text — and so was never in the first pass's inventory. Those panels
continued to paint status colors that ignore the user's chosen editor theme and fail
high-contrast accessibility modes: a full-table-scan marker, a removed-row highlight, or a
health-finding dot stayed the same fixed hue whether the editor was light, dark, or
high-contrast, washing out or clashing in non-default themes.

## Finish Report (2026-06-14)

### Scope
(B) VS Code extension (TypeScript), with (C) docs (CHANGELOG, LAUNCH_TEST). No Flutter/Dart
app code touched. Change set is color-only — bare status hexes and their `rgba()` tints
migrated to the existing semantic design tokens. No layout, type-scale, spacing, or logic
changes.

### What changed and why

**Bare status hexes migrated to semantic tokens.** Across the webview panels that hardcoded
the Bootstrap-style palette, the bare green/amber/red/blue hexes were replaced with the
semantic tokens already defined in `extension/src/views/design-tokens.ts`
(`--status-good`, `--status-bad`, `--accent-warning`, `--accent-info`), and the
`rgba(r,g,b,a)` tint backgrounds became `color-mix(in srgb, var(--token) N%, transparent)`
so a tinted surface tracks the same theme-resolved hue as its border/text. Because the token
`:root` block is injected centrally by `secureWebviewHtml`, these panels already had the
tokens in scope — only their CSS still referenced raw hex. Files changed:
`query-cost/query-cost-styles.ts`, `explain/explain-html.ts`,
`schema-diff/schema-diff-html.ts`, `time-travel/time-travel-html.ts`,
`timeline/snapshot-diff-panel.ts`, `suite/drift-health-html.ts`,
`suite/commit-timeline-html.ts`, `suite/suite-notes-html.ts` (shared by the Explain, Index
Suggestions, and Anomalies panels), `mutation-stream/mutation-stream-webview-assets.ts`,
`profiler/profiler-html.ts`, `er-diagram/er-diagram-styles.ts` (webview only),
`constraint-wizard/constraint-wizard-shell.ts`, `isar-gen/isar-gen-html.ts`,
`branching/branch-html.ts`, `seeder/seeder-html-shell.ts`,
`filters/filter-bridge-script.ts`, and `editing/editing-bridge-script.ts`. The two bridge
scripts build inline `style="…"` strings injected into the data-grid webview, which carries
the same token `:root`, so `var(--status-bad)` resolves there too.

**Standalone schema-docs export re-skinned to the brand palette.** `DocsHtmlRenderer`
(`schema-docs/docs-html-renderer.ts`) emits a self-contained HTML documentation file that has
no host VS Code theme to inherit, and it shipped a hand-painted indigo light palette
(`#303f9f`, `#e8eaf6`, `#fafafa`) that ignored dark mode entirely. It now prepends
`getStandaloneTokens()` — the same canonical brand fallback the exported report uses — and
references `--surface-*` / `--text` / `--border` / `--brand-2` / `--link` tokens, so the
export adopts the Saropa brand orange and follows the reader's OS color scheme via the token
block's `prefers-color-scheme` dark override.

**Intentionally left fixed.** Theme-bound `var(--vscode-*, #hex)` fallbacks were untouched —
the hex there is only a last-resort fallback and the value already follows the theme. SQL
syntax-highlight palettes (content rendering, not chrome) and the standalone ER-diagram SVG
export (`er-diagram/er-export.ts`, a separate artifact from the webview styles) keep their
deliberate fixed colors.

**Dangling style-guide citations repointed.** The `§` references in `design-tokens.ts` and
`report-css.ts` cited `docs/design/SAROPA_DASHBOARD_STYLE_GUIDE.md`, a path that does not
resolve in this repository. The guide is the shared cross-project source of truth and is
checked into the `saropa_lints` repository; the comments now point at its resolvable GitHub
URL so the references are no longer dead.

### Verification
- `tsc --noEmit -p ./` clean (also `npm run lint` clean via the pre-commit hook).
- Full mocha suite: 2851 passing. A scoped run was attempted against the touched panels'
  test files, but `.mocharc.yml`'s `spec: out/test/**/*.test.js` glob expands to the whole
  suite; the result is conclusive and includes every converted panel's render test.

### Test audit
A grep of `extension/src/test/` for each removed hex (`#28a745`, `#dc3545`, `#e0a800`,
`#d32f2f`, `#2e7d32`, `#0e639c`, `#d6a92b`, `#1e88e5`, `#fbbf24`, `#60a5fa`, and the light
badge-text hexes) returned no matches. No existing assertion pinned a status hex or a tint
rgba string, so no test required rewriting. The migration changes only resolved color values,
not class names or DOM structure, so the panel render tests (which assert class names and
markup) continue to pass unchanged.

### Localization
No new or changed user-facing strings. The two bridge scripts contain pre-existing hardcoded
English button labels ("Apply", "Delete this row?", "+ Add Row") that were left untouched —
they predate this change and are outside its color-only scope.

### Files
- Changed (extension):
  `extension/src/views/design-tokens.ts`,
  `extension/src/report/report-css.ts`,
  `extension/src/query-cost/query-cost-styles.ts`,
  `extension/src/explain/explain-html.ts`,
  `extension/src/schema-diff/schema-diff-html.ts`,
  `extension/src/time-travel/time-travel-html.ts`,
  `extension/src/timeline/snapshot-diff-panel.ts`,
  `extension/src/suite/drift-health-html.ts`,
  `extension/src/suite/commit-timeline-html.ts`,
  `extension/src/suite/suite-notes-html.ts`,
  `extension/src/mutation-stream/mutation-stream-webview-assets.ts`,
  `extension/src/profiler/profiler-html.ts`,
  `extension/src/er-diagram/er-diagram-styles.ts`,
  `extension/src/constraint-wizard/constraint-wizard-shell.ts`,
  `extension/src/isar-gen/isar-gen-html.ts`,
  `extension/src/branching/branch-html.ts`,
  `extension/src/seeder/seeder-html-shell.ts`,
  `extension/src/filters/filter-bridge-script.ts`,
  `extension/src/editing/editing-bridge-script.ts`,
  `extension/src/schema-docs/docs-html-renderer.ts`
- Changed (docs): `CHANGELOG.md`, `docs/launch/LAUNCH_TEST.md`
- Created: `plans/history/2026.06/2026.06.14/theme-token-second-status-cluster.md`

### Outstanding
The token system still covers the color layer only. The style guide's spacing and type
scales, the brand banner/eyebrow overlay, and the loading/empty/error state contracts remain
unadopted by these panels — the same layout-phase scope the first migration deferred.
On-device visual confirmation across light, dark, and high-contrast themes is a manual check
(see `docs/launch/LAUNCH_TEST.md`).
