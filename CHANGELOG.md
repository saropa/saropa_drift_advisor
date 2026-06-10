# Changelog

<!-- MAINTENANCE NOTES -- IMPORTANT --

  Format follows Keep a Changelog; versions use SemVer. Omit dates in `## [x.y.z]` headers (pub.dev shows publish dates). Project links and archive location are in the intro below.

  Each release (and [Unreleased]) opens with one plain-language line for humans—user-facing only, casual wording—then end it with:
  `[log](https://github.com/saropa/saropa_drift_advisor/blob/vX.Y.Z/CHANGELOG.md)` substituting X.Y.Z.

  **Audience separation** — User-facing sections (Added, Fixed, Changed, Improved) describe impact, not implementation. Infrastructure, build tooling, code refactoring, publish pipeline, SDK/linter/formatter changes, and internal test additions go inside a collapsed `<details><summary>Maintenance</summary>` block at the bottom of each release. Users skip it; contributors expand it.

  **pub.dev** — [pub.dev / packages / saropa_drift_advisor](https://pub.dev/packages/saropa_drift_advisor)

  **VS Code marketplace** - [marketplace.visualstudio.com / items ? itemName=Saropa.drift-viewer](https://marketplace.visualstudio.com/items?itemName=Saropa.drift-viewer)

  **Open VSX Registry** - [open-vsx.org / extension / saropa / drift-viewer](https://open-vsx.org/extension/saropa/drift-viewer)

-->

## Introduction

This changelog is for **Saropa Drift Advisor**: the Dart package that wires up
Drift’s debug server and web viewer, plus the **Drift Viewer** extensions for
[VS Code](https://marketplace.visualstudio.com/items?itemName=Saropa.drift-viewer)
and [Open VSX](https://open-vsx.org/extension/saropa/drift-viewer).

Releases are listed newest first. Each version’s opening paragraph sums up what
changed for users and ends with a **log** link to this file at that release’s
tag on GitHub.

Install the library from
[pub.dev](https://pub.dev/packages/saropa_drift_advisor); report issues and
browse source on
[GitHub](https://github.com/saropa/saropa_drift_advisor). History before
**2.6.0** lives in [CHANGELOG_ARCHIVE.md](./CHANGELOG_ARCHIVE.md).

---


## [Unreleased]

Two new ways to work with your data over time: a **Time Travel** slider to scrub a table's snapshot history, and **Data Branches** to capture, diff, and restore named snapshots of the whole database like `git stash` for your data.

### Added

- **Time Travel data slider** — right-click any table in the Database Explorer → **Time Travel** (or run it from the command palette) to open a slider across all captured snapshots of that table. Drag the slider, step with the ◀ ▶ buttons, or press play to animate; each frame highlights rows added (green), removed (red, struck through), and changed (amber, with the exact changed cells marked) versus the previous snapshot. A table picker and 0.5×–4× speed control sit above the grid, and the panel updates live as new snapshots are captured. Built on the existing snapshot history, using each table's real primary key to match rows.
- **Data Branches (git-style)** — capture the whole database as a named branch, then experiment freely and compare. Open **Data Branches** from the Database Explorer toolbar (or "Create Data Branch" from the palette) to capture the current state. Each branch offers **Diff vs Now** (a row-level insert/update/delete view against the live database), **Generate Merge SQL** (differential SQL — forward or the reverse rollback — opened in an editor tab, with deletes ordered children-first so foreign keys are never violated), **Restore** (overwrite the live database with the branch's rows, with an offer to back up the current state first), and **Delete**. Branches persist in the workspace and honor configurable caps (`branching.maxBranches`, `branching.maxRowsPerTable`); a branch that hits the row cap is flagged as truncated so a partial capture is never mistaken for a complete one.
- **Refactoring: extract common column groups** — the schema refactoring advisor now detects column bundles that repeat across two or more tables and suggests defining them once. It recognizes known families — audit/timestamp columns (`created_at`, `updated_at`, …), soft-delete flags, and address blocks (including `addr_*` prefixes) — and tolerates ragged sets where the same bundle appears in slightly different tables, plus any generic group of columns that always appears together. Columns whose type is inconsistent across tables are excluded so an extraction never forces a lossy type decision. Each suggestion opens a migration plan with a shared-table + foreign-key template and a ready-to-use Drift mixin (so per-row metadata like timestamps can reuse definitions instead of being normalized), with the backfill and column drops left as flagged advisory steps. Detection is schema-only and runs no queries against your data.

### Changed

- **Health Score reacts to the refactoring advisor** — the **Schema Quality** metric now applies a small, bounded penalty (up to 15 points) for high-severity refactoring suggestions you have run but not yet acted on or dismissed in the advisor panel. Each deduction is explained in a detail line on the Schema Quality card, and dismissing a suggestion restores the points on the next score. The penalty is separate from the existing missing-primary-key check, so no issue is counted twice, and databases with no advisor session keep their previous grade unchanged.

<details>
<summary>Maintenance</summary>

- **Plan housekeeping** — archived the shipped Mutation Stream plan (`22-realtime-mutation-stream.md` → `plans/history/2026.06/2026.06.10/`), removed the now-redundant `GAP_FIT_PLAN.md` redirect stub from the active tree (its full analysis was already archived and the per-feature plans 71–74 point straight at the archive), and added explicit `## Implementation Plan` headings to `esbuild-ts-migration.md` and `fix-pub-dev-publisher.md` so every active plan presents its plan under one heading.
- **Connection reliability Phase 2 — end-to-end lifecycle test** — added `connection-lifecycle.test.ts`, the full-chain regression net the project never had: wiring → discovery scans → server found → tree loads → command invoked → data appears. It wires the real `DriftApiClient` + `ServerDiscovery` + `ServerManager` + `DriftTreeProvider` + `ConnectionStateMachine` against a stubbed HTTP server, asserts table rows appear at the end, then deliberately breaks each link once (no discovery, failed schema load, unregistered command) and asserts the end state is not reached — so a silent break in any single link fails a test instead of shipping. (Phase 2 of `plans/connection-reliability-ongoing.md`.)
- **Connection reliability Phase 1 — single connection-state authority** — introduced `connection-state.ts` (`ConnectionStateMachine` plus a pure `computeConnectionPhase` / `deriveConnectionContexts` model) as the one place that owns the connection truth and the sole writer of the `driftViewer.serverConnected` and `driftViewer.databaseTreeEmpty` context keys. `isDriftUiConnected`, `buildConnectionPresentation`, and the connection-UI refresh funnel now derive "transport up" from that single model instead of each recomputing their own boolean, so the two long-standing contradictions — "connected but no data" and "disconnected but server running" — are no longer representable. The Database tree exposes a `hasLiveSchema` signal feeding the machine. New `connection-state.test.ts` enumerates all 16 signal combinations and drives the machine through the full disconnected → connecting → connected → offline lifecycle, asserting the flags can never disagree. No behavior change to the tree's always-return-rows workaround. (First structural phase of `plans/connection-reliability-ongoing.md`.)
- **Archive the website-vs-extension gap analysis; split remaining work into per-feature plans** — the parity sweep is complete (all high-impact and quick-win gaps closed on both surfaces), so `plans/GAP_FIT_PLAN.md` moved to `plans/history/2026.06/2026.06.10/` with a short stub left in place. The handful of still-open rows were lifted into standalone, individually trackable plans rather than buried in the archived tables: `71-website-dart-schema-scanning.md` (§5), `72-website-multiple-snapshots.md` (§8), `73-website-bulk-index-creation.md` (§11), and `74-ide-only-capabilities.md` — which reclassifies go-to-definition, code actions, and data breakpoints as intentionally IDE-only rather than unresolved parity gaps. The doc-maintenance backlog (evidence coverage, classification cleanup, parity release gate) retires with the archive.

</details>

---

## [3.6.1]

### Added

- **Orphan physical-table check** — flags tables that physically exist in the SQLite file but are not declared anywhere in your Drift schema (typically left behind by a migration whose Drift definition was later removed or renamed). These are invisible to a schema-first audit and silently bloat the database, so the check starts from the physical side: it enumerates the real tables and subtracts the ones your schema declares. Findings appear in `GET /api/issues` (alongside index suggestions and anomalies) and at the new `GET /api/analytics/orphan-tables` endpoint, each naming the exact table and suggesting a `DROP TABLE` you can run by hand. It is report-only and never drops anything. When you start the viewer with `startDriftViewer`, the declared table set is derived automatically from your Drift database; with the callback API, pass the new `declaredTableNames` parameter to enable it. Without a declared set the check stays silent, so it never produces false positives. Android's `android_metadata` bookkeeping table is excluded by default (`lib/src/server/orphan_table_detector.dart`, `lib/src/server/analytics_handler.dart`, `lib/src/server/router.dart`, `lib/src/server/server_context.dart`, `lib/src/start_drift_viewer_extension.dart`, `lib/src/drift_debug_server_io.dart`)

<details>
<summary>Maintenance</summary>

- **Timeline auto-capture: coalesce write bursts into one re-dump** — an open timeline previously re-scanned every physical table (schema metadata + a per-table `SELECT`, a thousand-plus queries) on every detected DB write, and the old leading-edge guard fired that scan on the *first* write of a burst — the worst moment, mid write-storm — while silently dropping the rest, which could leave the panel stale on the final committed write. `SnapshotStore.requestCapture` now applies a trailing-edge debounce: writes within a quiet window (new `driftViewer.timeline.captureDebounceMs`, default 200 ms) reset the timer, so one re-dump runs after the burst settles, reflecting the coalesced final state, and the coalesced count is logged as `timeline: re-dump (coalesced K writes)` (`extension/src/timeline/snapshot-store.ts`, `extension/src/extension-providers.ts`, `extension/src/extension-activation-final.ts`, `extension/package.json`)

</details>

---

## [3.6.0]

### Improved

- **Startup banner: emulator/device port-forward hint** — the server startup banner now shows the exact `adb forward tcp:<port> tcp:<port>` command alongside the `http://127.0.0.1:<port>` URL. When the host app runs on an Android emulator or a physical device, the bound port lives in that device's network namespace, so a host browser/viewer cannot reach the printed URL until the port is forwarded — previously "server started" and "viewer offline" looked contradictory with no on-screen guidance (`lib/src/drift_debug_server_io.dart`, `lib/src/server/server_constants.dart`)

### Fixed

- **Startup banner showed the requested port, not the bound port** — when the server was started with `port: 0` (let the OS pick an ephemeral port), the banner printed `http://127.0.0.1:0`; it now prints the actual OS-assigned port so the URL and the new `adb forward` command are copy-pasteable. The default fixed port (8642) was unaffected (`lib/src/drift_debug_server_io.dart`)

### Added

- **Web viewer: dimmed NULL cells with display option** — SQL `NULL` values in data tables now render dimmed (muted + italic) so empty cells are visually distinct from real text; new **Settings → Table Defaults → "NULL display"** lets you switch the label between `NULL` (default) and `-` (`assets/web/_data-display.scss`, `state.ts`, `settings.ts`, `table-view.ts`)

### Changed

- **Web viewer: tables sidebar row counts** — the row count next to each table name is now rendered one step smaller (`--text-xs`) so it reads as secondary metadata, and empty-table counts (`(0)`) are dimmed at 50% opacity so non-zero rows win the eye when scanning the list (`assets/web/table-list.ts`, `assets/web/_sidebar.scss`)

<details>
<summary>Maintenance</summary>

- **Lint hygiene** — appended `--` rationales to `// ignore_for_file` and `// ignore` directives in `lib/src/drift_debug_server_io.dart` to satisfy `document_analyzer_ignore_rationale`
- **Doc headers on flagged-complexity methods** — added concise `///` headers on `_isTextAffinity` (`lib/src/server/cell_update_handler.dart`), `_classifySql` / `_parseTableName` / `_record` (`lib/src/query_recorder.dart`), `_recordEvent` / `_extractWhereClause` (`lib/src/server/mutation_tracker.dart`), and `_migrationColumnMap` (`lib/src/server/compare_handler.dart`) so static-analysis complexity reports surface intent alongside the metric

</details>

---

## [3.5.0]

Query Replay DVR is now available in the extension and server API, so you can record SQL activity during debug sessions and inspect recent queries in a timeline panel. Bulk editing also got a dedicated pending-changes grid in the extension, clearer batch-commit failures, and safer inline edits in the browser viewer when writes are enabled. The extension also adds a Visual Query Builder with optional SQL import and a full **natural-language-to-SQL** flow: after the model answers, you can land the SQL in the notebook, the query builder, a **saved snippet**, a **dashboard SQL widget**, or **query cost**, with an optional starter picker and safer prompts on huge schemas. [log](https://github.com/saropa/saropa_drift_advisor/blob/v3.5.0/CHANGELOG.md)

### Added

- **Web debug viewer: multi-table query builder** — on a table tab, choose **Multi-table** next to **Single table** to compose JOINs (FK hints from existing metadata), multi-column `SELECT` with optional aggregates when `GROUP BY` is set, stacked `ORDER BY` clauses, type-aware `WHERE` (including `IN`), and `LIMIT`, with live preview and the same `POST /api/sql` run path as the classic builder (`assets/web/query-builder-sql.ts`, `query-builder-multi.ts`)
- **Visual Query Builder** — compose flat `SELECT` queries against the connected schema (tables, joins, filters, aggregates, `GROUP BY` / `ORDER BY` / `LIMIT`) in a webview with live SQL preview and run; command **Visual Query Builder** (`driftViewer.openQueryBuilder`)
- **Import SQL into Visual Query Builder** — paste or pick generated `SELECT` text and map it back into the visual model where the dialect matches the builder output (best-effort; `WITH` / `UNION` not supported yet); command **Import SQL into Visual Query Builder** (`driftViewer.openQueryBuilderFromSql`)
- **Natural language to SQL (NL-SQL)** — **Ask Natural Language** (`driftViewer.askNaturalLanguage`) and **NL Query History** (`driftViewer.nlSqlHistory`) use OpenAI-compatible chat settings with the API key in **secret storage**. Before calling the LLM you can optionally pick a **starter prompt** from past NL questions, **saved table filters**, and **SQL Notebook run history** (`driftViewer.nlSql.seedSuggestions`); turn that off for a simple single-line prompt instead
- **NL-SQL: where the SQL goes** — after validation, a **QuickPick** sends the generated `SELECT`/`WITH` to **SQL Notebook** (new query tab), **Visual Query Builder**, **Save as Snippet** (with a suggested name), **Add SQL query widget to the dashboard** (`driftViewer.addQueryWidgetToDashboard`), or **Analyze query cost**; the same picker is used when reopening from **NL Query History**
- **NL-SQL: big schemas & follow-on tooling** — schema text for the LLM can follow **Schema Intelligence** when that subsystem started successfully, otherwise live metadata from the server; **table and character caps** (`driftViewer.nlSql.maxSchemaTables`, `maxSchemaContextChars`) keep token-heavy databases from overfilling the prompt. When **Query Intelligence** is active, a successful generation is also **recorded for pattern hints**. If **Saropa Log Capture** is enabled and `performance.logToCapture` is not `off`, each successful NL generation can emit a compact **`nl-query`** JSON line for session logs
- **Query Replay DVR endpoints on the debug server** — added `GET /api/dvr/status`, `POST /api/dvr/start`, `POST /api/dvr/stop`, `POST /api/dvr/pause`, `POST /api/dvr/config`, `GET /api/dvr/queries`, and `GET /api/dvr/query/:sessionId/:id` with versioned envelopes and ring-buffer window metadata for robust client pagination/error handling; status now reports buffer size and before/after capture flags when supported; `POST /api/sql` accepts optional `args` / `namedArgs` for DVR-declared bindings (JSON-safe normalization); write `affectedRowCount` uses SQLite `changes()` when `writeQuery` is configured; optional `queryWithBindings` / **`writeQueryWithBindings`** on `DriftDebugServer.start` for read/write host callbacks that accept declared bindings (HTTP write paths still pass SQL strings until extended); VM Service `ext.saropa.drift.runSql` accepts the same read bindings as flat JSON strings (`args`, `namedArgs`)
- **Query Replay DVR panel + commands in the extension** — added `driftViewer.openDvr`, `driftViewer.dvrStartRecording`, and `driftViewer.dvrStopRecording`, plus a DVR webview with filters, semantic search over row snapshots, timeline stepping (buttons + Home/End/arrows), selection detail (`/api/dvr/query`), JSON export, SQL editor / **SQL Notebook** / **Query Cost** actions, a **status bar** DVR indicator, auto-refresh when schema generation changes, and start/pause/stop/refresh controls; DVR refresh feeds **Query Intelligence** when active and optionally merges DVR timings into **perf baselines** (`driftViewer.perfRegression.recordBaselinesFromDvr`, optional `warnOnDvrPanelRefresh`); toolbar **Snapshot diff** runs `driftViewer.showSnapshotDiff`; **Schema rollback…** runs `driftViewer.generateRollback`
- **Debug lifecycle auto-record wiring** — extension now auto-starts DVR recording on Dart/Flutter debug session start (configurable) and attempts to stop recording on debug-session termination
- **Bulk Edit panel grid** — `driftViewer.editTableData` opens a dashboard-style webview with a paged grid of pending cell changes, redo support, the same preview/apply/discard flows as before, **keyboard navigation** on the pending-changes grid (focus the grid with Tab, move selection with arrows, Enter opens the table viewer, Escape clears selection), and toolbar links to **Data invariants**, **Paste from clipboard**, **Query DVR**, and **Capture DB snapshot** (runs `driftViewer.captureSnapshot` as a safety net before destructive work until full plan-37 data branching exists)
- **Anomaly Detection → bulk edit** — the anomalies webview adds **Bulk edit table…** to pick a single-PK table and jump straight into the bulk edit dashboard
- **Batch apply failure detail** — when `POST /api/edits/apply` fails on one statement in a transaction, the error JSON can include `failedIndex` and `failedStatement`; the extension surfaces formatted messages plus **Preview SQL** and **Copy Failed SQL** actions on commit errors
- **Web viewer inline editing (v1)** — when `/api/health` reports writes enabled and the table has a single-column primary key, you can double-click a cell for explicit Save/Cancel (no blur commit), delete a row with confirmation, and get a leave-page prompt if a cell edit is still open; the row highlights when your draft differs from the loaded value, failed saves offer **Retry save** and **Reload table**, and failed deletes can reload the grid from a confirm dialog
- **Schema refactoring suggestions (Feature 66)** — **Suggest Schema Refactorings** (`driftViewer.suggestSchemaRefactorings`) opens a panel that analyzes the connected schema (normalization, wide-table split hints, overlap-based merge hints), shows advisory migration steps, and can copy SQL or Dart snippets; **Open Refactoring Advisor (External Hint)** (`driftViewer.refactoringOpenWithHint`) opens the same panel with a hint banner for table/column context; toolbar links for **Generate migration**, **Schema diff**, migration preview, and ER diagram; also available from the Database view toolbar when a server is connected
- **Refactoring Phase 3 integrations** — migration preview accepts an optional appended advisory SQL block; ER diagram command accepts optional table focus; NL-to-SQL accepts a pre-filled question; health score webview shows the last refactoring session summary (including dismiss count) and **Schema Quality** metric text can include advisor session lines when you refresh the health panel after analyzing refactorings

<details>
<summary>Maintenance</summary>

- **Cross-stack API typing for DVR** — added DVR envelope/status/query/page types in `extension/src/api-types.ts` and HTTP/client transport methods in `extension/src/api-client-http-impl.ts` and `extension/src/api-client.ts` to keep server/extension contracts aligned
- **DVR integration tests** — extended `test/handler_integration_test.dart` to validate DVR route availability, basic recording flow, `POST /api/dvr/config`, wrong-session lookups, `POST /api/sql` declared `args`/`namedArgs` on DVR entries, and structured `QUERY_NOT_AVAILABLE` behavior; added `test/query_recorder_test.dart`, `test/dvr_bindings_test.dart`, and extension contract/search tests for DVR JSON parsing and semantic search; golden JSON fixtures under `extension/src/test/fixtures/dvr/` (envelope, status, recorded row, `QUERY_NOT_AVAILABLE`, legacy `rowCount`, missing `params`); `extension/src/test/dvr-perf-baseline.test.ts` for DVR → baseline helpers
- **DVR write snapshots** — when `writeQuery` uses the mutation tracker, DVR write entries can include the same best-effort before/after row snapshots as `/api/mutations` (still subject to `captureBeforeAfter` and ring-buffer limits)
- **Bulk edit / edits-apply hardening** — `EditsBatchHandler` wraps per-statement failures in `BatchApplyStatementError`; `test/handler_integration_test.dart` covers semicolon-chained statement rejection and failure payload keys; extension tests cover PK gates, HTTP client error parsing, bulk panel HTML, and web inline-edit contract strings
- **Bulk apply session log + timeline** — after a successful pending-edit batch apply, the extension appends one timestamped line to the Drift Advisor output channel and triggers an immediate **snapshot capture** (debounce bypass) so the **Drift Database** VS Code timeline row-count history updates right away; DVR write capture for each statement remains unchanged
- **Refactoring engine extension tests** — added `extension/src/test/refactoring-analyzer.test.ts` and `refactoring-plan-builder.test.ts` for analyzer heuristics and plan templates
- **Refactoring Phase 3 modules** — `refactoring-advisor-state.ts` and `refactoring-nl-bridge.ts` for workspace session persistence and NL-SQL seed prompts
- **Query builder import** — `extension/src/query-builder/sql-import.ts` parses `FROM`/`JOIN`/`WHERE`/`GROUP BY`/`ORDER BY`/`LIMIT` segments using successive clause boundaries so `LIMIT` is not swallowed into `WHERE` or the `FROM` clause; covered by `extension/src/test/sql-import.test.ts` with renderer round-trips
- **Web query builder SQL layer** — `assets/web/query-builder-sql.ts` mirrors extension `sql-renderer` validation/rendering (join connectivity, `GROUP BY` / aggregate rules) so the browser preview matches execution; `npm run typecheck:web` covers the new modules

</details>

---

## [3.4.1]

Publish-pipeline bug report refreshed (no change to the shipped Dart package or extension behavior in this tag). [log](https://github.com/saropa/saropa_drift_advisor/blob/v3.4.1/CHANGELOG.md)

<details>
<summary>Maintenance</summary>

- **`bugs/PROBABLE_marketplace_failure_blocks_open_vsx_publish.md`** — verified against `scripts/modules/ext_publish.py` (`_run_publish_steps`): added line-level citations for the Marketplace failure path that returns before Step 14 (Open VSX), tightened repro steps, and replaced a Windows-only `rg` example with repo-root commands

</details>

---

## [3.4.0]

No more bogus "potential outlier" warnings on `lastModified` / `last_seen` style timestamp columns, and every anomaly and missing-index suggestion now appears exactly once in the Problems panel instead of twice. Outlier messages also now tell you how many rows were sampled. [log](https://github.com/saropa/saropa_drift_advisor/blob/v3.4.0/CHANGELOG.md)

### Fixed

- **Anomaly false positive on `lastModified` / `last_seen` / `last_accessed` style timestamp columns** — the data-quality scanner was firing a *"Potential outlier in \<table\>.last_modified: max value … is 4.1σ from mean …"* on any Drift table whose `DateTimeColumn get lastModified` had been written to a few times within the same day. The prior skip pattern covered `^created` / `^updated` / `^deleted` / `^modified` prefixes but nothing starting with `last_`, so Drift's canonical `lastModified` (serialized as `last_modified` in SQLite) fell straight through to the 3σ check. On a ~17-hour window σ is tiny by construction and the newest write always sits many σ above the mean — the "outlier" is just "the row we just wrote." The timestamp-skip pattern in `AnomalyDetector._detectNumericOutliers` now matches `last_modified`, `last_seen`, `last_accessed`, `last_used`, `last_sync`/`last_synced`, `last_refresh`/`last_refreshed`, `last_login`/`last_logout`, `last_activity`/`last_active`, `last_read`/`last_written`, `last_opened`/`last_viewed`/`last_played`, `last_fetch`/`last_fetched`, `last_heartbeat`/`last_ping`, `last_visit`/`last_visited`, `last_check`/`last_checked`, `last_poll`/`last_polled`, `last_scan`/`last_scanned` — in both snake_case and camelCase, without widening to generic `^last_.*` (which would have swallowed `last_name` / `last_ip`). Reported in [plans/history/2026.04/2026.04.22/BUG_anomaly_false_positive_tight_timestamp_range.md](plans/history/2026.04/2026.04.22/BUG_anomaly_false_positive_tight_timestamp_range.md)
- **Potential outlier diagnostic now reports sample size** — the message now ends with `n=<sampleCount>` (e.g. *"… (range [1.0, 999.0], n=37)"*) alongside the existing min/mean/max/σ numbers. The minimum sample-size guard (`n ≥ 30`) filters the worst low-`n` false positives, but sigma estimates are still wide between ~30 and ~100 samples and the reader has no way to tell how big the n actually is from the old message. Surfacing it lets "4.1σ at n=35" be treated as weaker evidence than the same value at n=5000 without having to go query the table. Covers suggested fix #5 in the same bug report
- **Duplicate diagnostics — same anomaly and same index suggestion shown twice per file** — every anomaly (null counts, empty strings, potential outliers, orphaned FKs) AND every missing-index suggestion was being published through two separate VS Code `DiagnosticCollection`s inside the extension: the legacy `drift-linter` collection (via `src/linter/schema-diagnostics.ts` → `mergeServerIssues`) and the newer `drift-advisor` collection (via `src/diagnostics/providers/schema-provider.ts` calling `checkAnomalies` + `checkMissingIndexes`). Users saw two Problems-panel entries per issue with different owners, different line numbers for anomalies (class header vs column getter), and — for index suggestions — different codes (`index-suggestion` vs `missing-fk-index` / `missing-id-index`). The entire legacy pipeline has been retired: `src/linter/schema-diagnostics.ts`, `src/linter/issue-mapper.ts`, the `drift-linter` diagnostic collection, the `SchemaDiagnostics` class, and the `DriftCodeActionProvider` are all deleted. The new `DiagnosticManager` pipeline is now the single source of these diagnostics: anomaly warnings land on the column-getter line (with a class-header fallback when the column can't be resolved), index suggestions land on the column line, and the `Copy CREATE INDEX SQL` quick-fix that previously lived on the legacy provider is already wired on `SchemaProvider.provideCodeActions` keyed on the new codes. The `driftViewer.runLinter` command, the VM-disconnect diagnostic clear, and all activation-time refreshes now dispatch to `DiagnosticManager` directly. Reported in [plans/history/2026.04/2026.04.22/BUG_anomaly_false_positive_tight_timestamp_range.md](plans/history/2026.04/2026.04.22/BUG_anomaly_false_positive_tight_timestamp_range.md) (Bug 2 — duplicate emission)

<details>
<summary>Maintenance</summary>

- **`error_logger.dart`: `// ignore: avoid_print` directives now carry rationales** — the analyzer's `document_ignores` rule was flagging three bare `// ignore: avoid_print` lines in `lib/src/error_logger.dart` (lines 68, 116, 119) as info-level diagnostics. Each directive now appends ` -- intentional console output so logs/errors/stack traces are visible without DevTools`, so future readers see why `print` is deliberate here (structured `developer.log` alone is invisible in the standard Flutter console)
- **Legacy `linter/` module deleted** — `extension/src/linter/schema-diagnostics.ts`, `extension/src/linter/issue-mapper.ts`, and their test files have been removed. `SchemaDiagnostics` and `DriftCodeActionProvider` are gone; `ProviderSetupResult.linter` is gone; `IDebugCommandDeps.linter` is now `diagnosticManager: DiagnosticManager`; `registerNavCommands` takes `DiagnosticManager` instead. Callers that previously invoked `linter.refresh()` / `linter.clear()` now dispatch to `DiagnosticManager`, which was already being called next to every legacy-linter call site. Disposable count in `extension.test.ts` updated from 199 → 197 (the `drift-linter` DiagnosticCollection and its `DriftCodeActionProvider` registration are the two that went away; the unified `drift-advisor` collection still lives and is owned by `DiagnosticManager`). `CommandRegistrationDeps.diagnosticManager` is a `Partial<DiagnosticSetupResult>` so the `setupDiagnostics`-throws resilience test still passes: when diagnostics failed, command handlers see a no-op fallback (`refresh → resolved promise`, `clear → noop`) rather than crashing

</details>

---

## [3.3.5]

Sidebar tables list is easier to read at a glance, clicking a history entry actually takes you to the Run SQL tab, the theme picker is no longer see-through, and the three always-on tools now live as toolbar icons above the tab bar instead of fighting for space with your open tabs. [log](https://github.com/saropa/saropa_drift_advisor/blob/v3.3.5/CHANGELOG.md)

### Fixed

- **Sidebar tables: name vs count readability** — in the sidebar's Tables list, the grey row count had been rendering with more visual weight than the table name itself, making the name hard to pick out at a glance. The two colors are now swapped so the table name wins the eye and the count recedes
- **Sidebar tables: unpin icon hidden until hover** — the faint pin/unpin button sat visible on every unpinned row at rest, adding a column of low-level noise down the sidebar. It is now hidden on unpinned rows and only appears when you hover the row (or focus it via keyboard). Pinned rows keep the icon visible so the pinned state is still obvious, and touch devices still see it since hover isn't available there
- **History sidebar: clicking an entry now opens the Run SQL tab** — previously, clicking a query in the History sidebar populated the hidden `#sql-input` editor but left you on whatever tab you were on (Tables, Schema, etc.), so the click looked like it did nothing. The handler now switches to the Run SQL tab first, then drops focus into the editor, so the loaded query is visible immediately and ready to edit / re-run
- **History sidebar: second collapse control removed** — the history heading had a down-chevron that toggled the inner list independently of the sidebar itself, creating two ways to “collapse history” that didn’t agree with each other. The chevron is gone; the right-hand toolbar icon (`⇥`) is now the only collapse affordance, mirroring how the tables sidebar already works
- **Theme menu: flyout no longer reads as “a menu under another menu”** — on Showcase and Midnight the theme dropdown was at 15% opacity, so the toolbar icons behind it bled right through and the whole thing looked like two stacked menus. The flyout is now opaque (92% alpha on the tinted themes) and its `z-index` has been raised above the tab-panel chrome so it can’t be clipped by panels that establish their own stacking context
- **Theme menu: double-fire on selection removed** — `.tb-theme-option` clicks had two listeners attached (one from `initThemeListeners`, one from `initToolbar`). Both applied the theme, but only the toolbar one closed the flyout, so the submenu looked “locked” after the first click. Theme-option wiring now lives only in `initToolbar`; `initThemeListeners` only watches the OS `prefers-color-scheme` change
- **Toolbar icons: middle-aligned in the toolbar row** — 2 rem icon buttons were top-aligned against the 2.75 rem tab row because the flex container used `align-items: stretch` and mixed-height children default to flex-start when stretch can’t apply. The new `#toolbar-bar` sets `align-items: center` and `.tb-icon-btn` pins `align-self: center` as a belt-and-braces guard

### Changed

- **Toolbar split: Tables / Search / Run SQL are now toolbar icons, not fixed tabs** — the three “always-present” tabs used to share the tab row with the rest of the toolbar icons, which meant that opening several table tabs pushed the tools around and the permanent tabs took a lot of horizontal space for labels. Those three are now icon-only launchers in a dedicated top row (`#toolbar-bar`), alongside every other tool. The tab row (`#tab-bar`) below it holds only the tabs you have actually opened. On first load the Tables tab is auto-opened so you still land on the familiar browse view; closing it leaves the Tables panel visible but with no pinned tab, and clicking the Tables icon again re-creates a closeable tab
- **Run SQL: Run button moved beneath the editor** — the primary Run button used to live in the template toolbar above the textarea, visually detached from the query body it executes. It now sits on its own row directly below the editor so it's the natural next action after typing
- **Run SQL: icons added to every toolbar button** — Apply template, Save, Del, Export, Import, Ask in English…, and Run now carry Material Symbols icons (post_add, bookmark_add, delete, download, upload, smart_toy, play_arrow) matching the conventions used elsewhere in the viewer's toolbars
- **Run SQL: empty dropdowns are dimmed** — when a dropdown is still on its placeholder entry (“— Saved queries —”, “— Recent —”, “—” for Table / Fields), it now renders at 55% opacity so the eye skips over unused controls and lands on filled ones. The dim lifts automatically the moment you pick a real value
- **Run SQL: inline “Recent” dropdown replaced with a history icon button** — the old `History:` / `Recent:` label + `<select>` looked like a form input waiting for a value, and the em-dash placeholder read as empty. It also duplicated what the right-hand History sidebar already shows (with more detail: full SQL, duration, rows, timestamp, source badge), which after the previous fix even opens the Run SQL tab on click. The inline dropdown is gone; in its place is a single icon button (Material `history` glyph) that toggles the History sidebar open/closed — same behavior as the toolbar-level history toggle, so both controls stay in sync

---

## [3.3.4]

No more spurious "14 query regression(s) detected" warnings at the end of every debug session — the extension's own diagnostic probes are no longer mistaken for your app's slow queries. [log](https://github.com/saropa/saropa_drift_advisor/blob/v3.3.4/CHANGELOG.md)

### Fixed

- **Perf-regression false positives from the extension's own diagnostic probes** — every debug session ended with a warning of the shape *"Drift: 14 query regression(s) detected: SELECT SUM(CASE WHEN "id" IS NULL THEN …): 55ms vs baseline 6ms (9.17x)"* even when the app's own queries were unchanged. The SQL was not written by the user at all — it was the extension's own null-count scan from `DataQualityProvider`, `scoreNullDensity` in health metrics, and the column profiler, running over tables whose row counts differed from the prior session. The regression detector was comparing these probes against baselines it had captured from itself on a prior run, producing one false warning per probed table per session. The `sql()` client now accepts `{ internal: true }` and plumbs it through POST `/api/sql` (and the VM-service `runSql` RPC) so the server tags those timings as `isInternal: true`; `detectRegressions` skips internal entries in both the compare pass and the baseline-recording pass so internal probes neither fire false warnings nor poison future baselines. Raising `driftViewer.perfRegression.threshold` no longer required as a workaround

<details>
<summary>Maintenance</summary>

- **Publish script: Marketplace propagation failure now points to the publisher page** — when the final Step 16 store-propagation check times out for the VS Code Marketplace, the warning now includes the publisher management URL (`marketplace.visualstudio.com/manage/publishers/Saropa`), the public listing URL, and the absolute path to the packaged `.vsix` so the user can upload it manually in one click instead of hunting for the file. Open VSX and pub.dev timeouts also emit store-specific guidance. Implemented in `scripts/modules/store_propagation.py` (per-store `pending` set) and `scripts/modules/ext_publish.py` (passes `vsix_path` through); new `MARKETPLACE_PUBLISHER_URL` constant added in `scripts/modules/constants.py`
- **Lint cleanup: `prefer_return_await` + `depend_on_referenced_packages`** — removed redundant `Future<T>.value(...)` wrappers in two `async` branches of `vm_service_bridge.dart` (the async function already wraps the return value, so the explicit wrapper both added noise and tripped the lint); converted four self-referential `package:saropa_drift_advisor/...` imports inside `lib/` to relative paths in `drift_debug_server_io.dart`, `server/import_handler.dart`, `server/router.dart`, and `server/session_handler.dart` (a package cannot list itself in its own pubspec dependencies, so the self-import tripped `depend_on_referenced_packages`)
- **Lint cleanup: `avoid_null_assertion` on regex group access in `server_context.dart`** — replaced `match.group(1)!` / `match.group(2)!` in `_parseCallerFrame` with `?? ''` fallbacks, and gated the file check on `file.isEmpty`. The regex literal guarantees both groups are non-null on a successful match today, so behavior is unchanged; the fallback removes a silent crash site if the pattern is ever edited. Related upstream bug filed against `saropa_lints` (`avoid_null_assertion_false_positive_regex_match_group.md`) — the rule should recognize `RegExpMatch.group(N)!` as a safe pattern.

</details>

---

## [3.3.3]

Removed the noisy "Drift server not reachable" diagnostic that stuck around whenever your Flutter app wasn't actively running in debug mode — connection state lives in the tree view and panel now, not in your Problems list. [log](https://github.com/saropa/saropa_drift_advisor/blob/v3.3.3/CHANGELOG.md)

### Removed
- **"Drift server not reachable" diagnostic** — the proactive connection-health check fired whenever your Flutter app wasn't running in debug mode (i.e. most of the time), producing a permanent, low-value Information diagnostic that couldn't be distinguished from real issues. The tree view and panel already reflect live connection state, so the editor diagnostic was noise. Connection state is now surfaced only through the tree view / panel.

<details>
<summary>Maintenance</summary>

- **Publish script: vsce login limited to 3 attempts** — when the Marketplace credential store is unavailable, the script now prompts for the PAT up to 3 times and passes it non-interactively, instead of letting `vsce login` re-prompt indefinitely
- **Removed connection-error diagnostic path** — deleted `connection-checker.ts`, the `connection-error` code, the `'connection-error'` event type, `RuntimeEventStore.hasRecentConnectionError`, `RuntimeProvider.recordConnectionError`, and the connection-error Quick Fix actions (Retry Connection / Don't Show / Open Settings). Tests updated.

</details>

---

## [3.3.2]

The extension sidebar and "Get Started" welcome screen no longer show up in Flutter/Dart projects that don't actually use Drift. [log](https://github.com/saropa/saropa_drift_advisor/blob/v3.3.2/CHANGELOG.md)

### Changed
- **VS Code minimum version bumped to 1.115.0** — aligns `engines.vscode` with the `@types/vscode` typings to fix `.vsix` packaging errors

### Fixed
- **Extension sidebar no longer appears in non-Drift projects** — the Database Explorer, Drift Tools, and activity bar icon are now hidden in workspaces that don't declare `drift` or `saropa_drift_advisor` in pubspec.yaml. Previously, the "Get Started" welcome screen appeared in every Flutter/Dart project regardless of whether it used Drift.

---

## [3.3.1]

Added a real security policy so vulnerabilities can be reported privately through GitHub Security Advisories. [log](https://github.com/saropa/saropa_drift_advisor/blob/v3.3.1/CHANGELOG.md)

<details>
<summary>Maintenance</summary>
- **SECURITY.md** — replaced GitHub default template with a real security policy: private reporting via GitHub Security Advisories, response timeline commitments, scope definition, and coordinated disclosure terms

</details>

---

## [3.3.0]

Brand-new Settings panel for persistent preferences, a right-side History sidebar showing every query the server has run, and every tool launcher is now a visible icon in the tab bar instead of buried in a hamburger menu — plus Showcase and Midnight finally got the glassmorphism overhaul they were always supposed to have. [log](https://github.com/saropa/saropa_drift_advisor/blob/v3.3.0/CHANGELOG.md)

### Added

- **Settings panel** — new Settings tool tab (accessible from the hamburger menu gear icon) lets users configure persistent preferences: SQL history max entries, max saved analyses, default page size, default display format, show-only-matching-rows toggle, slow query threshold, auto-refresh polling, epoch timestamp auto-detection, and navigate-away confirmation; all preferences persist to localStorage and take effect immediately without a page reload; includes "Clear all stored data" (removes project-specific data while keeping theme/sidebar preferences) and "Reset all to defaults" actions
- **Binary size disclosure in README** — added a paragraph in "How it works" clarifying that this package adds zero bytes to release builds when gated on `kDebugMode`, has zero runtime dependencies, and never compiles web UI assets into the binary
- **History sidebar** — new collapsible right-side sidebar shows all SQL query execution history from the server's ring buffer; each entry displays a source badge (Browser / App / Internal), truncated SQL preview, duration, row count, and relative timestamp; filter buttons let you toggle between All, Browser, App, and Internal queries; clicking an entry loads its SQL into the SQL runner input; dedicated `GET /api/history` and `DELETE /api/history` endpoints power the sidebar with the full timing buffer (up to 500 entries) and a computed `source` field derived from caller stack-frame analysis
- **Inline toolbar replaces hamburger menu** — all tool launchers (Snapshot, DB diff, Index, Schema, Diagram, Size, Perf, Health, Import, Export, Settings) are now visible as icon buttons in the tab bar row instead of hidden behind a dropdown; sidebar toggles sit at the edges (left for Tables, right for History); Mask, Theme (flyout picker), and Share are right-aligned; active tool tabs are highlighted on their toolbar icon
- **Collapsible results table** — the data table and status bar are now wrapped in a `▲ Results` expander (matching the existing Table definition and Query builder toggles) so users can collapse the grid and focus on the query builder or definition; heading shows the current row count for context when collapsed
- **Visual / Raw SQL toggle in query builder** — a pill-style toggle above the query builder switches between the existing form controls (Visual) and a free-text SQL textarea (Raw SQL); switching to Raw pre-fills the textarea with the current visual builder query so the user can refine it; both modes share the same Run / Reset buttons and inline results
- **Inline cell edit context and validation** — double-click cell editing now shows a context bar (PK identity, column name, type, nullable) and the original value above the input; client-side format validation checks number, integer, and boolean formats on each keystroke with a red-border + inline error message instead of `alert()` dialogs; validation errors keep the editor open so the user can fix and retry
- **Double-click tab to close others** — double-clicking any tab in the tab bar prompts to close all other closeable tabs, making it quick to declutter when many tables or tools are open
- **Tab icons and per-type accent colors** — every tab type now shows a unique Material Symbols icon (e.g. table_chart for Tables, search for Search, terminal for Run SQL, etc.); on the Midnight and Showcase themes, each tab type also gets a unique accent color for the top border and text when active, replacing the single link color so tabs are visually distinct at a glance

### Improved

- **Showcase and Midnight glassmorphism overhaul** — the tab bar, data table, SQL editor, and sticky table headers now use translucent frosted-glass surfaces with `backdrop-filter`, so the animated body gradient (pastel aurora for Showcase, deep aurora for Midnight) is visible through every major UI surface instead of being hidden behind opaque backgrounds; Midnight's CSS variables (`--surface`, `--header-bg`, `--sidebar-bg`, `--bg-pre`) changed from opaque hex to translucent rgba so all elements automatically participate in the aurora bleed-through; tab bar gets a slide-in entrance animation matching the header; pinned columns and sticky headers use heavier frost for readability; scattered data-table glassmorphism overrides consolidated into the per-theme SCSS partials

### Changed

- **Hamburger menu — Themes submenu** — replaced the single-click theme cycle button with a full submenu listing all four themes (Light, Showcase, Dark, Midnight) with a checkmark on the active selection
- **Hamburger menu — sliding toggle switches** — Sidebar visibility and PII Mask now use sliding boolean switches instead of text-swapping buttons and checkboxes
- **Hamburger menu — layout polish** — section headings use a smaller font with tighter bottom padding; a divider separates Mask from Share for clearer visual grouping

<details><summary>Maintenance</summary>

- **Upgraded `saropa_lints`** from `^11.1.0` to `^12.0.1`; `dart_style`, `analyzer`, and related packages remain pinned below their latest versions because `analyzer ^12.0.0` conflicts with the Flutter SDK's `meta` constraint
- **Pre-commit Dart format gate** — added `dart format --set-exit-if-changed .` to the Husky pre-commit hook so formatting issues are caught locally before they reach CI; mirrors the GitHub Actions format check step

</details>

---

## [3.2.2]

New setting lets you suppress specific diagnostic rules on specific tables, and several false-positive anomaly / slow-query warnings on bounded rating columns and internal probes are gone. [log](https://github.com/saropa/saropa_drift_advisor/blob/v3.2.2/CHANGELOG.md)

### Added

- **Per-table diagnostic suppression** — new `driftViewer.diagnostics.tableExclusions` setting lets users suppress specific diagnostic rules on specific tables while keeping those rules active elsewhere; for example, suppress `no-foreign-keys` on tables that deliberately use UUID soft references without disabling the rule project-wide

### Fixed

- **Slow-query false positives from extension-internal probes** — the extension's own change-detection `COUNT(*)` queries (used to fingerprint table row counts) were recorded in the performance timeline and reported as user-application slow-query warnings; these internal probes are now tagged with `isInternal` and excluded from slow-query diagnostics, aggregate stats, and query patterns so only genuine application queries trigger warnings
- **False-positive anomaly on bounded ratings** — outlier detection no longer flags values at the boundary of known bounded scales (0–5, 0–10, 1–10, 0–100). A TV rating of 1.0 on a 1–10 scale is rare but valid, not a data anomaly
- **Rating/score/percent column skip** — columns matching `rating`, `score`, `percent`, or `pct` are now excluded from sigma-based outlier detection, since bounded-scale data is inherently non-Gaussian

---

## [3.2.0]

All ten toolbar buttons and the floating action button are now a single hamburger menu, the SQL editor auto-runs EXPLAIN as you type and shows an index report, and every theme got a beautification pass with consistent tokens, frosted tables, and fewer invisible borders. [log](https://github.com/saropa/saropa_drift_advisor/blob/v3.2.0/CHANGELOG.md)

### Added

- **Bug report guide** — added `bugs/BUG_REPORT_GUIDE.md` with a comprehensive template and checklist for filing useful bug reports
- **Project name in masthead pill** — "Saropa Drift Advisor" now appears between the logo and version badge, making the product identifiable at a glance
- **Template lock toggle** — lock icon in the Run SQL toolbar; when locked (default), changing table or field selections auto-applies the current template
- **Auto-explain with index report** — the SQL editor now automatically analyzes query plans as you type (1.2 s debounce), showing estimated cost, which indexes are used vs available, and flagging full-scan tables with no indexes

### Changed

- **Hamburger menu replaces toolbar and FAB** — the 10-button toolbar row and the floating action button are consolidated into a single hamburger menu (☰) at the left edge of the tab bar; tools are grouped by purpose (Snapshots & Comparison, Performance Analysis, Schema Tools, Import/Export) with labeled sections; app-wide settings (sidebar toggle, theme cycle, PII mask, share) sit below a heavy divider; reclaims an entire row of vertical space and eliminates the FAB overlay

### Fixed

- **Theme contract tests fail in CLI but pass in IDE** — `extractBlock` test helper matched compound selectors like `body.theme-dark ::-webkit-scrollbar-thumb` before the real variable-defining block; now skips blocks that don't contain CSS custom properties
- **Publish pipeline aborts on test failure with no recovery** — extension and Dart test steps now prompt skip/abort on failure (matching the existing lint step pattern) so a known failure doesn't force a full pipeline restart
- **Publish pipeline prompt defaults** — target selection defaults to option 1 on Enter; "Continue with uncommitted changes?" defaults to Y
- **Publish pipeline git operations hard-abort without asking** — every git failure (add, commit, push, tag) now prompts skip/abort instead of silently ending the script; "nothing to commit" is auto-recovered as success
- **Outlier false positive on external ID columns** — numeric outlier detection now skips identifier columns (`*_id`, `*Id`, `*_key`, `*Key`, `*_code`, `*Code`) and primary key columns, since external IDs are opaque identifiers not drawn from a normal distribution; also adds a minimum sample size guard (n < 30) to prevent unreliable sigma estimates from flagging small datasets
- **Empty-string false positive on columns with empty-string default** — the anomaly detector no longer flags empty strings when the column's schema declares `withDefault(const Constant(''))`, since those values are the designed "no value" sentinel, not data quality problems
- **PII mask toggle now works and gives visible feedback** — toggling the MASK checkbox immediately re-renders tables and search results without a page refresh; a bright "MASKED" badge appears in the masthead pill so the user always knows when masking is active
- **Expanded PII column detection** — the mask heuristic now recognizes many more column names as sensitive: `name`, `first_name`, `last_name`, `username`, `salary`, `credit_card`, `ip`, `dob`, `passport`, `license`, `city`, `zip`, `latitude`/`longitude`, and dozens more; previously only 9 patterns were checked; short words like `tel` and `name` use word-boundary matching to avoid false positives on `hotel` or `filename`

### Improved

- **Unified table grid styling across all panels** — Search, Run SQL, and Query Builder now share the same table formatting as the Tables panel (borders, alternating rows, hover highlight, copy-on-hover, column context menu, drag-to-reorder, double-click cell popup)
- **Theme beautification pass** — all four themes overhauled for contrast, visibility, and visual identity:
  - **Light**: opaque borders (`#c2cde0`) replace invisible rgba hairlines; `--muted` darkened to `#556685` for WCAG AA; card shadows strengthened for visible depth
  - **Dark**: borders lightened to `#4a4d52` for visibility against dark backgrounds
  - **Showcase**: gradient stops changed from near-white to saturated pastels (lavender, pink, peach, sky) so frosted-glass surfaces actually show the moving gradient behind them; surface opacity lowered and blur strengthened; white frost-edge borders; frosted tab panels and data tables
  - **Midnight**: aurora gradient widened from monochrome navy to indigo/teal/purple shifts; primary orb raised from 8% to 18% opacity; second warm-purple orb added; surface opacity lowered so aurora bleeds through; expanded card periwinkle glow halo now visible; input focus glow ring added; frosted tab panels and data tables
  - **All themes**: entrance animations strengthened (12px translate); per-file hardcoded rgba border overrides replaced with `var(--border)` tokens
- **Global UI polish** — systematic beautification across all partials:
  - **Spacing tokens** (`--space-1` through `--space-12`): 4px geometric scale added to `:root`; migrated into tab panels, query builder, and pagination
  - **Global form controls**: centralized input/select/textarea styling in `_base.scss` with consistent border-radius, padding, and theme-aware focus rings (`--focus-ring-color` per theme); removed duplicated focus ring rules from `_search.scss` and `_sql-editor.scss`
  - **Custom scrollbars**: thin, theme-tinted scrollbars for Firefox (scrollbar-width/color) and Chromium (::-webkit-scrollbar) across all themes
  - **Text selection**: theme-aware `::selection` color matching each theme's accent
  - **Tab bar**: active tab gets 2px colored top accent bar and bold weight; close button visible at rest (opacity 0.4) instead of hidden
  - **Buttons**: secondary buttons get subtle shadow for depth; `.btn-danger` uses `--radius-md` token (was hardcoded 4px) with hover glow; toolbar buttons lift on hover (`translateY(-1px)`)
  - **Sidebar**: pin button visible at rest (opacity 0.3) instead of invisible
  - **Masthead**: status button gets subtle pill background so it reads as interactive
  - **Data table**: header row gets 2px bottom border for clear separation; scroll container gets stronger shadow and per-theme frosted glass treatment
  - **Pagination**: "Advanced" toggle gets visible border/background (was invisible text)
  - **Query builder**: hardcoded `border-radius: 3px/4px` replaced with `--radius-sm` token; spacing uses `--space-*` tokens

### Changed

- **Removed project logo from tab bar** — the small icon next to the Tables tab has been removed; the logo remains in the masthead pill
- **Dimmed version number in masthead** — the version badge is now muted grey, keeping it readable but visually secondary to the project name
- **Run SQL panel always visible** — the collapsible header has been removed; the SQL runner is now always expanded inside its tab
- **Smart field substitution in templates** — all templates (except COUNT) now substitute selected fields for `*`, not just the "SELECT columns" template
- **Explain button removed** — replaced by automatic query plan analysis; the separate Explain button is no longer needed

<details><summary>Maintenance</summary>

- **Modularized `tools.ts` (850 lines) into 3 files** — `tools-compare.ts` (snapshot, compare, migration preview), `tools-analytics.ts` (index suggestions, size analytics, anomaly detection), and `tools-import.ts` (CSV/JSON/TSV import); each file has its own imports and no shared private state
- **Modularized `_theme-effects.scss` (482 lines) into 3 files** — `_theme-showcase.scss` (showcase glassmorphism effects), `_theme-midnight.scss` (midnight aurora/glow effects), and a slim `_theme-effects.scss` (shared entrance animations + reduced-motion override)

</details>

---

## [3.1.1]

Killed 40+ false-positive "add a datetime index" suggestions that fired on every `created_at` and `updated_at` column regardless of whether it was actually being queried. [log](https://github.com/saropa/saropa_drift_advisor/blob/v3.1.1/CHANGELOG.md)

### Fixed

- **Eliminated 40+ false-positive datetime index suggestions** — the blanket heuristic that flagged every `created_at`, `updated_at`, and `_at` column as needing an index has been removed (96% false-positive rate in real projects); legitimate datetime index suggestions are still caught by the evidence-based `unindexed-where-clause` diagnostic

---

## [3.1.0]

Save and compare snapshots for Index Suggestions, Size Analytics, Anomaly Detection, and Health Score — plus fewer noisy diagnostics in multi-root and non-Drift workspaces. [log](https://github.com/saropa/saropa_drift_advisor/blob/v3.1.0/CHANGELOG.md)

### Fixed

- **Connection warning no longer targets wrong folder in multi-root workspaces** — in workspaces with several root folders, the "Drift server not reachable" diagnostic attached to whichever folder happened to be first, even non-Drift projects; now scans folders and only targets one that actually uses Drift
- **Consistent `[drift_advisor]` prefix on all diagnostics** — index-suggestion and invariant-violation diagnostics from the legacy linter paths were missing the `[drift_advisor]` message prefix; all diagnostic messages now include it for consistent filtering in the Problems panel
- **Boolean columns no longer flagged as datetime index candidates** — the index-suggestion heuristic matched any column name ending in `time`, causing `BoolColumn` fields like `is_free_time` to produce a spurious "Date/time column" diagnostic; the pattern now requires `timestamp` instead of bare `time`
- **No more "no longer responding" toasts in non-Drift projects** — server discovery port scanning now only starts when the workspace pubspec.yaml declares a Drift dependency; previously every VS Code workspace triggered scanning and stale server-lost notifications

### Added

- **Save & compare analysis history** — Index Suggestions, Size Analytics, Anomaly Detection, and Health Score panels now have Save Snapshot and Compare buttons; snapshots are persisted in workspace state (up to 50 per type) and can be compared side-by-side with a diff summary showing what changed between runs

### Changed

- **Connection diagnostic downgraded from Warning to Information** — "server not reachable" is the normal state when the debug server isn't running; the diagnostic now shows as an info icon instead of a yellow triangle, reducing noise in the Problems panel

---

## [3.0.3]

Schema tab no longer gets stuck on "Loading…", "Ask in English" stops crashing on open, and the DB Diff tab shows a proper setup guide instead of raw developer-facing errors. [log](https://github.com/saropa/saropa_drift_advisor/blob/v3.0.3/CHANGELOG.md)

### Fixed

- **Schema tab stuck on "Loading…"** — when schema DDL was already cached from another view (table data in "both" scope, search tab), the Schema tab never rendered the cached content; now uses cache-first rendering so the tab displays immediately
- **"Ask in English" crashes with `loadSchemaMeta is not defined`** — the NL modal, table-view column-type loader, and cell-edit module all called `loadSchemaMeta` at runtime but the function was scoped inside `app.js` and never reachable from the bundled TS modules; extracted into a shared `schema-meta.ts` module with proper imports

### Improved

- **DB Diff tab shows setup guide instead of error jargon** — when the comparison database is not configured, the panel now explains what the feature does and shows a collapsible "How to enable" section with a code example; buttons are hidden until the feature is active, instead of showing developer-facing error messages after clicking
- **Quieter debug console for stale tables** — when a table is listed in `sqlite_master` but has been dropped since the last metadata fetch, the server now logs a one-line warning instead of a full stack trace; snapshot capture skips failed tables instead of aborting

<details>
<summary>Maintenance</summary>

- **README screenshots** — added 10 feature screenshots (Tables, Table Data, Schema, Index, Size, Perf, Health, Import, Ask in English, Light Mode) in an HTML grid with captions; renamed files from random hashes to descriptive names; added Screenshots link to TOC

</details>

---

## [3.0.2]

Stale tables no longer carry over when you switch Flutter projects, and empty databases stop flagging every Dart table class as a "missing table" error. [log](https://github.com/saropa/saropa_drift_advisor/blob/v3.0.2/CHANGELOG.md)

### Fixed

- **Stale tables persist after project switch** — switching Flutter projects reloaded the webview HTML but localStorage kept pinned tables, nav history, table state, SQL history, bookmarks, and analysis results from the previous project; now detects when the server origin changes and purges all project-specific storage while preserving user preferences (theme, sidebar state)
- **False-positive "missing table" errors on empty database** — when the database had no tables (app never run, or server connected to an empty DB), every Dart table class was flagged with an Error-level `missing-table-in-db` diagnostic; now detects the empty-DB condition and suppresses individual missing-table errors while still flagging genuinely missing tables in partially populated databases

<details>
<summary>Maintenance</summary>

- **File modularization** — split 3 files exceeding 300-line limit: dashboard chart-clipboard logic, ER diagram SVG helpers, and panel test fixtures each extracted into dedicated modules
- **Final IIFE extraction** — moved last 4 inline init blocks (`initPiiMaskToggle`, `initSearchToggle`, `setupCellValuePopupButtons`, `setupChartResize`) into their feature modules; removed 70 unused imports; `app.js` reduced to 926-line init-only glue
- **Test coverage** — added tests verifying extracted helpers compose correctly into webview script output
- **Test coverage** — 22 contract tests for server-origin storage clearing: state constant, persistence function wiring, key targeting, UI-preference preservation, call ordering in app.js, and bundle integration

</details>

---

## [3.0.1]

Version bump for publication. [log](https://github.com/saropa/saropa_drift_advisor/blob/v3.0.1/CHANGELOG.md)

---

## [3.0.0]

Fixed stale data after switching servers, restored broken heartbeat and polling controls, and added Log Capture session export so Drift Advisor diagnostics flow into your capture sessions automatically. [log](https://github.com/saropa/saropa_drift_advisor/blob/v3.0.0/CHANGELOG.md)

### Fixed

- **Wrong project tables after server switch** — webview panel showed stale tables from the previous project when the debug server changed; now detects host/port changes and fully reloads content from the new server
- **Retry targeted wrong server** — the Retry button in the webview used the original server endpoint instead of the current one after a server switch; now always uses the panel's current host/port
- **Heartbeat reconnection stopped working** — heartbeat reconnection silently dropped back to no-op stubs instead of resuming polling; now wired correctly at startup
- **Polling toggle missing** — the masthead pill click handler and keep-alive toggle stopped responding; restored

### Added

- **Log Capture session export** — when both extensions are installed and `driftViewer.integrations.includeInLogCaptureSession` is `full` (the default), session end now writes structured metadata (query stats, anomalies, schema summary, health, diagnostic issues) into the Log Capture session and a `{session}.drift-advisor.json` sidecar file; set to `header` for lightweight headers only, or `none` to opt out entirely
- **Log Capture extension API** — `getSessionSnapshot()` is now available on `context.exports` so Log Capture's built-in provider can request a snapshot directly without the file fallback
- **Session file fallback** — `.saropa/drift-advisor-session.json` is written at session end for tools and scenarios where the extension API is unavailable

<details>
<summary>Maintenance</summary>

- **esbuild bundling** — all web JS/TS assets bundled into a single `bundle.js` via esbuild; Dart server plumbing collapsed from 4 cached fields / 4 script tags to 1
- **Full JS modularization** — `app.js` decomposed from 6882-line monolith to 915-line init glue; 23 TypeScript modules extracted; shared state centralized in `state.ts` with typed exports
- **SCSS modularization** — `style.scss` decomposed from 2184 lines to 28-line import hub with 17 feature partials; migrated from deprecated `@import` to `@use`
- **Connection diagnostic logging** — all connection state transitions, poll cycles, heartbeat, and keep-alive events now emit `[SDA]` prefixed console.log entries for browser dev tools tracing

</details>

---

## [2.19.0]

Type badges on columns, random data sampling, health scores, query cost analysis, and a pile of UI polish. [log](https://github.com/saropa/saropa_drift_advisor/blob/v2.19.0/CHANGELOG.md)

### Added

- **Column type icons** (Website) — data table column headers now show a compact type badge (e.g. TEXT, INT, REAL, BLOB) sourced from schema metadata; full type in tooltip
- **Table definition type icons** (Website) — table definition panel now shows a fixed-width icon column with type glyphs (`#` integer, `T` text, `.#` real, etc.) plus 🔑 PK and 🔗 FK badges for quick visual scanning
- **Data sampling** (Website) — Sample button in the pagination bar loads a random sample of rows via `ORDER BY RANDOM() LIMIT N`
- **Health score** (Website) — anomaly scan results now show a 0–100 health score with letter grade (A–F) and a severity breakdown summary
- **Query cost analysis** (Website) — EXPLAIN output now shows an estimated cost rating (Low/Medium/High) with operation counts (full scans, index lookups, subqueries, sorts, temp storage) and a collapsible raw plan detail view

### Fixed

- **App logo not appearing** (Website) — replaced corrupted inlined base64 PNG (~185 lines) with a CDN-hosted URL using the same jsDelivr + `@main` fallback pattern as CSS/JS assets

### Changed

- **Query history expanded** (Website) — SQL history limit increased from 20 to 200 entries, matching the VS Code extension

- **Collapsible table definition** (Website) — table definition panel above the data grid is now collapsible (collapsed by default), matching the query builder pattern; self-contained in `table-def-toggle.js`
- **Masthead pill** (Website) — combined the version badge and connection status into a single header pill showing logo · version · Online/Offline; styles extracted to `_masthead.scss` partial, HTML extracted to `_buildMastheadPill()` method
- **Connection status terminology** (Website) — renamed "Live" to "Online" throughout the web viewer for clarity
- **Sidebar toggle arrow** (Website) — arrow is now larger, right-aligned, and points left instead of down for clearer collapse affordance
- **FAB opens upward** (Website) — floating action button menu now fans upward from the trigger, with items right-aligned against the trigger edge
- **Share moved to FAB** (Website) — Share button relocated from the header bar into the FAB menu as the first action item
- **FAB modularized** (Website) — FAB styles extracted to `_fab.scss` partial, FAB UI logic extracted to self-contained `fab.js` module
- **Premium theme effects** (Website) — Showcase and Midnight themes now have real glassmorphism (backdrop-filter blur on header, sidebar, cards), animated gradient backgrounds, rainbow shimmer borders on expanded cards, floating glow orb (Midnight), entrance animations, and gradient buttons; removed broken CDN dependency on nonexistent drift-enhanced.css; all four themes are always available without external network requests
- **Monospace font upgrade** (Website) — switched to JetBrains Mono via Google Fonts CDN; centralized font stack into a single `--font-mono` CSS custom property for easy future changes
- **Responsive toolbar** (Website) — tools toolbar no longer wraps to a second row; text labels progressively hide at three breakpoints (1100px, 900px, 700px) leaving icon-only buttons with tooltips at narrow widths

### Added

- **Column visibility toggle** (Extension) — SQL Notebook results now have a "Columns" button to show/hide individual columns, with a dropdown chooser and "Show All" reset
- **Row filter toggle** (Extension) — SQL Notebook filter bar now has a "Matching/All" toggle to switch between showing only matching rows and showing all rows
- **Responsive ER diagram** (Extension) — ER diagram automatically re-fits to the panel when the window is resized, debounced to avoid flicker
- **Export index analysis** (Extension) — Index Suggestions panel has a new "Export Analysis" button that exports as JSON, CSV, or Markdown to clipboard or file
- **Copy chart to clipboard** (Extension) — Dashboard chart widgets now have a clipboard button in the header that copies the chart as a PNG image
- **JSON export** (Website) — Export panel now offers "Table JSON" alongside the existing CSV download
- **Import history log** (Website) — Import panel tracks all import operations during the session in a collapsible history list showing time, table, format, row count, and errors

### Fixed

- **Acronym column name mismatch detection** — When Drift's camelCase-to-snake_case splits acronyms like `UUID` into `u_u_i_d`, but the database uses `uuid`, the advisor now reports a single `column-name-acronym-mismatch` diagnostic instead of a confusing `missing-column-in-db` / `extra-column-in-db` pair. The message explains the root cause and suggests both fix options (rename getter or `.named()` override)
- **Anomaly detector: reduced false positives** — Numeric outlier detection now skips timestamp columns (`created_at`, `*_date`, etc.), sort/ordering columns (`sort_order`, `position`, `rank`, etc.), and year/founded columns. Added a log-scale fallback so distributions spanning orders of magnitude (e.g., currency exchange rates, engagement scores) are no longer flagged. Outlier messages now identify which end (min/max) is the problem and by how many σ
- **Slow-query and N+1 false positives on table definitions** — Runtime performance diagnostics (`slow-query-pattern`, `n-plus-one`) moved from the `performance` category to `runtime` so users can disable them independently of schema checks. Server-internal queries (no caller location) are now downgraded from Warning to Information severity. When caller location is available, diagnostics pin to the call site at full Warning severity. Slow-query messages include row count; N+1 messages hint at batching via JOIN/IN for high repeat counts

---

## [2.17.5]

Super FAB menu, app logo in the tab bar, and premium theme effects that actually look dramatic now. [log](https://github.com/saropa/saropa_drift_advisor/blob/v2.17.5/CHANGELOG.md)

### Added

- **Super FAB menu** — Sidebar toggle, theme cycle, and PII mask moved from the header into a floating action button in the bottom-right corner. Click the gear icon to expand; click outside or press Escape to dismiss
- **App logo in tab bar** — Replaced the "Saropa Drift Adviser" text header with the app logo, positioned inline with the tab buttons

### Fixed

- **Showcase/Midnight themes now show dramatic visual effects** — The premium themes had nearly-opaque backgrounds (75-85% alpha) that made glassmorphism invisible. Completely rewritten with floating ambient orbs, glass shimmer sweeps, card entrance animations with blur-to-clear, rainbow borders visible at rest, dramatic hover lifts, animated gradient buttons, and backgrounds at 25-35% alpha so the frosted glass effect is unmistakable
- **Sticky header preserved in premium themes** — The enhanced CSS was overriding `position: sticky` with `position: relative` on the header, causing it to scroll away instead of staying fixed

---

## [2.17.4]

Fixed the changelog — 2.17.2 had accidentally overwritten the 2.17.1 entry. Both versions are now listed correctly below. [log](https://github.com/saropa/saropa_drift_advisor/blob/v2.17.4/CHANGELOG.md)

<details>
<summary>Maintenance</summary>

- **Publish pipeline: store propagation polling** — After publishing, the pipeline now polls pub.dev, VS Code Marketplace, and/or Open VSX APIs until the new version is visible (30 s interval, 10 min max). Timeout is non-fatal

</details>

---

For older versions (2.17.3 and prior), see [CHANGELOG_ARCHIVE.md](./CHANGELOG_ARCHIVE.md).
