# Web viewer — group identical SQL in the History sidebar

The debug web viewer's right-hand History sidebar previously rendered one row per query execution, so a query run repeatedly produced many duplicate rows. This task collapses identical SQL into a single grouped row with a clickable run-count, shows a `(<n>)` count in the suffix when a query ran more than once, and adds a dialog listing every run's source/time/duration with a Copy button. Groups are kept while the source is noted per-run in a dialog column, and the group header can carry multiple source pills.

## Finish Report (2026-06-11)

### Scope
(B) Web viewer browser assets (`assets/web/` TypeScript + SCSS), plus the changelog. No Flutter/Dart app code, no `extension/` TypeScript. The web-viewer TS is compiled by esbuild into `bundle.js`; SCSS is compiled by sass into `style.css`.

### What changed
- **`assets/web/history-sidebar.ts`**
  - Added `HistoryGroup` interface (`sql`, `latest`, `occurrences`) and module-level `groups` cache.
  - `groupEntries()` collapses the filtered, newest-first entry list into groups keyed by **exact SQL text**, in first-appearance order; `latest` is recomputed by timestamp so the representative row reflects the most recent run.
  - `render()` now renders one row per group: the sidebar count shows group count (collapsed rows, not raw executions). Each row shows **one source pill per distinct source** across the group's runs (first-seen order), the latest run's duration/rows/relative time, and — when the SQL ran more than once — a clickable `(n)` count `<button class="history-count-badge">`.
  - List click handler intercepts `.history-count-badge` first (opens the dialog, returns) so the row's load-SQL-into-runner behavior does not also fire; otherwise loads `groups[idx].sql` into the Run SQL input as before.
  - `showOccurrencesDialog()` builds a reused modal overlay listing every run (Source pill / absolute local Time / Duration / error marker), newest first, with a **Copy** button. Copy writes TSV via `occurrencesToTsv()` (the SQL on line 1, blank line, then `Time\tDuration (ms)` header + one row per run) to the clipboard and shows the existing copy toast (`showCopyToast` reused from `table-view.ts`).
  - Added `formatAbsoluteTime()` helper.
  - Dialog close/Escape/backdrop handlers hoisted to module scope (`closeOccurrencesDialog`, `onOccurrencesKey`); backdrop-click listener attached **once** at overlay creation to avoid a per-open listener leak on the reused overlay node.
- **`assets/web/_history-sidebar.scss`** — added `.history-badges` (flex-wrap pill container), `.history-item-line` (flex row pairing the truncating SQL preview with the non-shrinking count pill), `.history-count-badge` (clickable pill), and the full occurrences-dialog styles (`.history-dialog-overlay` / `-dialog` / `-header` / `-title` / `-close` / `-sql` / `-table-wrap` / `-table` / `-num` / `-row--error` / `-actions` / `-copy`). z-index 10000 matches the viewer's other modal overlays.
- **`CHANGELOG.md`** — entry under `[Unreleased] > Added` describing the grouping, `(n)` count, multi-source pills, and the runs dialog with Copy.
- **`assets/web/bundle.js`, `assets/web/style.css`** — regenerated via `npm run build:js` / `npm run build:style`.

### Deep review notes
- Logic/safety: grouping is O(n) via a `Map`; `latest` selection guards missing `at`. Click handler resolves `data-idx` into the `groups` cache that `render()` populated, kept in sync (re-rendered together). No recursion. Sort uses a stable numeric comparator with `0` fallback for missing timestamps.
- Fixed during review: the backdrop click listener was originally re-added on every `showOccurrencesDialog` call against the reused overlay element — a listener leak. Refactored to attach once at creation; Escape handler is a stable named function (`onOccurrencesKey`), so repeated `addEventListener` calls dedup and `closeOccurrencesDialog` removes it cleanly.
- Architecture: reuses `esc` (utils), `showCopyToast` (table-view), `openTool` (tabs) — no new utilities invented. Follows the surface's existing hardcoded-English string convention.

### Testing
- **Existing-test audit (mandatory):** grepped `test/` and `extension/src/test/` for `history-sidebar`, `initHistorySidebar`, `fetchHistory`, `query-history-list`, `history-count-badge`, `showOccurrencesDialog`, `history-dialog`, `groupEntries`. Two matches:
  - `test/drift_debug_server_test.dart` — asserts the **server-rendered static HTML** contains `id="sql-history-toggle"`, `id="history-sidebar"`, `id="sql-input"`. This change is entirely **client-side rendering JS**; it does not alter the static markup IDs. Not affected.
  - `extension/src/test/sql-notebook-panel.test.ts` — asserts the **extension webview** HTML includes `history-sidebar` (a different surface from `assets/web/`). Not affected.
  - No assertion pins the grouping/rendering behavior this change introduced.
- **No JS/TS test harness exists for `assets/web/` browser modules** (no jest/vitest config, no `assets/web/*.test.*`). Verification gates for this surface are `tsc` typecheck + esbuild build + sass build. New-behavior unit tests (4B) cannot be added without introducing a browser-test framework + dependencies — a blast-radius infrastructure decision out of this task's scope.
- **Commands run (all clean):** `npm run typecheck:web` (tsc `--noEmit`, 0 errors), `npm run build:js` (esbuild → bundle.js), `npm run build:style` (sass → style.css).
- Dart server suite not executed in this environment; this change cannot affect it (no server-HTML delta) — audited by inspection.

### l10n
SKIPPED [B-NOT-IN-SCOPE] for the Flutter ARB pipeline and the extension `l10n()` catalog. The browser web viewer has no i18n catalog; all sibling strings in `history-sidebar.ts` are hardcoded English by existing design. Added strings ("Query runs (n)", "Source"/"Time"/"Duration", "Copy", "Show all N runs of this query", "Copied N runs") follow that established convention.

### Maintenance
- CHANGELOG updated.
- README verified — no updates needed (grouping refines the already-listed "query history" feature; not a new documented capability).
- `docs/launch/LAUNCH_TEST.md` — not present in this repo (Dart package + extension, not the Flutter app). SKIPPED.
- guides reviewed — no guides directory.
- package.json / lock — no release or dependency change.
- Roadmap: SKIPPED [A-NOT-IN-SCOPE] (no Dart roadmap entry for this).
- No bug archive — task did not close a `bugs/*.md` file.

Finish report saved: plans/history/2026.06/2026.06.11/web-viewer-history-group-identical-sql.md
