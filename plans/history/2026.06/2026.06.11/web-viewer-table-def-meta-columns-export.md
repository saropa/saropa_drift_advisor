# Web viewer — table-definition profiling columns + JSON/Flutter export

The debug web viewer's "Table definition" panel (the table-view screen) lacked per-column profiling metadata and export affordances. This task adds a profiling/meta column set (null count, data count, last updated, first created, size, and more), an info icon, a toolbar toggle to show/hide the meta columns, and two copy actions that export the table definition to JSON and to Flutter/Drift code. No bug or pre-existing plan file described this work, so this record is created fresh.

## Finish Report (2026-06-11)

### 2. Scope
**(B) — web viewer assets (TypeScript/JS + SCSS) and extension contract tests.** No Flutter/Dart app code (A) and not docs-only (C). The web viewer lives in `assets/web/*.ts` (bundled by esbuild into `bundle.js`) with styles in `assets/web/*.scss` (compiled by sass into `style.css`); contract tests live in `extension/src/test/`.

### 3. Deep review
- **Logic & safety:** The profiling stats are computed with a single full-table aggregate query against the existing `/api/sql` endpoint (one round trip per table), parsed into a per-column cache (`S.tableDefStats`). Identifiers are quoted with `quoteIdent` (double-quote + doubling) so column/table names with odd characters cannot break the generated SQL. MIN/MAX are skipped for BLOB/binary columns (binary ordering is not meaningful); empty-string ("blank") counts are only emitted for textual columns. Async race handled: after the stats fetch resolves, the live panel is re-found by `data-table-name` selector (a full table re-render may have replaced the original wrap mid-flight) before re-rendering.
- **Event-delegation correctness (the one real risk):** both `table-def-toggle.ts` and the new `table-def-meta.ts` attach delegated click listeners on `document`. `stopPropagation` in the meta handler does NOT stop the toggle handler (same target), so a tool click would also collapse the panel. Fixed by an explicit guard in `table-def-toggle.ts`: `if (target.closest('.table-def-tool')) return;`. Verified the guard is present in the rebuilt bundle.
- **Architecture & adherence:** Reused the existing `/api/sql` endpoint, `S.authOpts()`, `showCopyToast`, `schemaTableByName`, and `S.fkMetaCache` rather than adding new infrastructure. Shared state (`tableDefMetaOn`, `tableDefStats`) lives in `state.ts` so `table-view.ts` and `table-def-meta.ts` both import it and avoid a circular dependency. Single source of truth for rendering: the meta module re-renders the panel by calling `buildTableDefinitionHtml` rather than hand-mutating cells. The byte-format helper (`formatTableDefBytes`) lives in `table-view.ts` (the renderer) only — not duplicated in the meta module.
- **Performance & UX:** Profiling is opt-in because the aggregate query scans the whole table — too costly to run on every table view. Stats are cached per table, so toggling off/on is instant. A transient `is-busy` state shows on the toggle button while the query runs; on error the toggle reverts and a toast names the failure. Toggling meta on expands the panel so the new columns are immediately visible. Copy actions emit item-naming toasts ("Definition copied as JSON" / "Definition copied as Flutter").
- **Documentation quality:** New module `table-def-meta.ts` carries a verbose file-doc header (purpose, DOM contract, why opt-in). Non-obvious decisions are commented at the site (identifier quoting, BLOB MIN/MAX skip, the document-listener guard rationale, the async re-find-the-panel comment).
- **Refactoring:** None beyond scope.

### 4. Testing validation
**A. Existing-test audit (mandatory).** Grepped `extension/src/test/` for every changed symbol (`buildTableDefinitionHtml`, `table-definition-heading`, `table-def-tool`, `formatTableDefBytes`, `table-def-tools`, `tableDefMetaOn`). Four files reference touched symbols:
- `web-table-def-toggle.test.ts` — still green (heading/wrap/scroll classes and `cursor: pointer` / `var(--link)` strings unchanged).
- `web-table-def-icons.test.ts` — still green (icon column unchanged).
- `web-table-view-blob-colvis.test.ts` — **one assertion updated**: the shared "collapsible chevrons — right-aligned and dimmed" test pinned `margin-left: auto` on `.table-definition-heading::after`. The chevron's right-alignment now comes from the new `.table-def-tools` group (auto-margin), with the `::after` carrying only a fixed gap. Rewrote the test to assert right-alignment from the element that now provides it (`.table-def-tools` for the table-definition heading; the `::after` rule itself for the other two headings), keeping the muted-color check on `::after`. Intent preserved (chevron is right-aligned + dimmed), mechanism updated.
- `web-table-def-meta.test.ts` — **new** contract test for the module (export, document delegation, stopPropagation guard, stats SQL shape, Flutter/JSON export, DOM tool buttons + data-table-name, fill-bar style).

**B. New-behavior tests.** Added `web-table-def-meta.test.ts` (12 assertions across 3 describes).

**Commands run:**
- `npm run typecheck:web` → clean.
- `npm run build:js` + `npm run build:style` → both succeeded; verified new symbols in `bundle.js` and `style.css`.
- `cd extension && npm run compile` → clean.
- `mocha --grep "table-def"` → 48 passing. `mocha --grep "collapsible chevrons"` → 4 passing.
- Full suite: `mocha` → **2699 passing**.

### 5. Localization
SKIPPED [B-NOT-IN-SCOPE for Flutter l10n] — this is web-viewer code, not Flutter/Dart. The web viewer has no i18n catalog; all its user-facing strings are hardcoded English (e.g. existing "Copied!", "Table definition", "Show this column in the results table"). The new strings (button titles/aria-labels, toast messages) follow that same existing convention. No ARB/NLS pipeline applies to `assets/web/`.

### 6. Project maintenance & tracking
- CHANGELOG: updated — four `Added` entries under `[Unreleased]` (profiling columns, JSON copy, Flutter copy; plus the toggle described within the profiling entry). No dates (per project convention).
- README verified — no updates needed (no product-fact counts changed).
- package.json / lockfiles — not a release/dependency change; untouched.
- Roadmap: SKIPPED [A-NOT-IN-SCOPE].
- guides reviewed — no user-facing guide affected.
- LAUNCH_TEST: SKIPPED — `docs/launch/LAUNCH_TEST.md` is a Flutter-app artifact; not part of the web-viewer/extension repo workflow.
- No bug archive — task did not close a `bugs/*.md` file.

### 7. Persist finish report
Finish report saved: plans/history/2026.06/2026.06.11/web-viewer-table-def-meta-columns-export.md (this file).

### 9. Files changed
- `assets/web/state.ts` — added `tableDefMetaOn` flag + `tableDefStats` cache (already committed by the concurrent build commit 682c0a9).
- `assets/web/table-def-meta.ts` — **new** module: stats SQL, JSON export, Flutter/Drift export, tool wiring.
- `assets/web/table-view.ts` — `buildTableDefinitionHtml`: heading tools (toggle/json/flutter), `data-table-name`, meta header + cells; new helpers `formatTableDefBytes`, `formatMetaScalar`, `buildColumnMetaCells`.
- `assets/web/table-def-toggle.ts` — guard so tool clicks don't collapse the panel; hover underline scoped to the label span.
- `assets/web/_query-builder.scss` — heading layout (label + tools group), tool-button styles, meta-column styles, fill bar.
- `assets/web/index.js` — wired `initTableDefMeta()`.
- `assets/web/bundle.js`, `assets/web/style.css` — rebuilt artifacts.
- `extension/src/test/web-table-def-meta.test.ts` — **new** contract test.
- `extension/src/test/web-table-view-blob-colvis.test.ts` — updated chevron-alignment assertion.
- `CHANGELOG.md` — four Added entries.

### Outstanding work
None functional. On-device/in-browser visual verification of the fill bar and the toggle interaction is the user's manual step (see What to test).
