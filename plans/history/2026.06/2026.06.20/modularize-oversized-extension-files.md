# Modularize six oversized extension source files

Six TypeScript files in the VS Code extension exceeded the repository line-count
gate (`scripts/modules/ext_build.py check_file_line_limits`: 300-line cap for
production source, 500-line cap for `*.test.ts`). This task split each file so
every unit lands under its cap while keeping the original file as the unchanged
public entry point, so no importer or test had to change.

## Finish Report (2026-06-20)

### Scope

VS Code extension (TypeScript, `extension/src/`) plus a CHANGELOG entry. No
Flutter/Dart app code touched.

### Defect

The build gate reported six files over the limit:

- `extension/src/saropa-lints-diagnostics.ts` — 303 (limit 300)
- `extension/src/dashboard/dashboard-css.ts` — 302 (limit 300)
- `extension/src/diagnostics/diagnostic-manager.ts` — 376 (limit 300)
- `extension/src/diagnostics/providers/data-quality-provider.ts` — 316 (limit 300)
- `extension/src/er-diagram/er-diagram-script.ts` — 320 (limit 300)
- `extension/src/test/data-quality-provider.test.ts` — 512 (limit 500)

### Change

Each original file remained the public entry point; extracted logic moved to a
sibling file following the codebase's existing `-helpers` / `-checks` split
convention. Importers and test imports were left untouched (re-export or
concatenation preserves the original surface).

| Original (new line count) | Extracted to (line count) | Mechanism |
|---|---|---|
| `saropa-lints-diagnostics.ts` (192) | `saropa-lints-report.ts` (138) | Pure report parsing/mapping (severity map, tolerant JSON parse, per-file diagnostic mapping, `IScanDiagnostic`/`IScanReport`) moved out; original re-exports `mapScanSeverity`, `parseScanReport`, `mapReportToFileDiagnostics`, and the types so the existing test imports keep resolving from the original module. |
| `dashboard/dashboard-css.ts` (127) | `dashboard/dashboard-css-widgets.ts` (189) | Widget-content and modal CSS moved to `getDashboardWidgetCss()`, appended by `getDashboardCss()` via string concatenation. |
| `diagnostics/diagnostic-manager.ts` (276) | `diagnostics/diagnostic-apply.ts` (139) | Diagnostic-building/suppression filtering extracted as `buildDiagnosticsByFile(issues, config, dartFiles)`; the inline-suppression quick-fix builder extracted as `buildSuppressionQuickFixes(document, diagnostic, codeStr)`. `_applyDiagnostics` now delegates and sets the collection; `provideCodeActions` appends the helper's actions. |
| `diagnostics/providers/data-quality-provider.ts` (97) | `diagnostics/providers/data-quality-checks.ts` (237) | Data-skew and high-null-rate checks plus the null-by-design / SQL-probe / escape helpers and their threshold constants extracted as `checkDataSkew(...)` and `checkHighNullRates(...)`. The provider class retains only VS Code wiring (`collectDiagnostics` orchestration, `provideCodeActions`, `dispose`). |
| `er-diagram/er-diagram-script.ts` (132) | `er-diagram/er-diagram-script-events.ts` (203) | The webview event-handler block (mouse drag/pan, zoom wheel, double-click, context menu, toolbar buttons, field filters, message + resize listeners, and the `hideContextMenu` helper they share) moved to `getErDiagramScriptEvents()`, concatenated into the same IIFE alongside the pre-existing `getErDiagramHelperJs()`. Scope (`nodes`, `edges`, `zoom`, `pan`, `renderDiagram`, `fitToView`, `showLoading`/`hideLoading`) is preserved because the text is concatenated into one IIFE, not a separate function. |
| `test/data-quality-provider.test.ts` (415) | `test/data-quality-test-helpers.ts` (51) + `test/data-quality-provider-actions.test.ts` (76) | The shared `createContext` fixture moved to a helper module imported by both test files. The `provideCodeActions` suite moved to its own test file with an independent `beforeEach`/`afterEach` (fetch stub + provider + `resetMocks`). The original keeps the `collectDiagnostics` suite and now imports `createContext`; unused `Diagnostic`/`Range` mock-class imports were dropped. |

No behavior changed: every move is a verbatim relocation of logic, comments, CSS,
and script text. No new user-facing strings were introduced.

### Verification

- `tsc --noEmit -p ./` — clean (exit 0).
- Full extension test suite — 2905 passing. Affected suites exercised:
  `data-quality-provider.test`, `data-quality-provider-actions.test`,
  `saropa-lints-diagnostics.test`, `er-diagram-resize.test`,
  `diagnostic-code-actions.test`.
- Line-count gate: no file in `extension/src` exceeds its cap (300 source / 500
  test) after the split.

### Files added

- `extension/src/saropa-lints-report.ts`
- `extension/src/dashboard/dashboard-css-widgets.ts`
- `extension/src/diagnostics/diagnostic-apply.ts`
- `extension/src/diagnostics/providers/data-quality-checks.ts`
- `extension/src/er-diagram/er-diagram-script-events.ts`
- `extension/src/test/data-quality-test-helpers.ts`
- `extension/src/test/data-quality-provider-actions.test.ts`
