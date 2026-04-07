# Changelog

<!-- MAINTENANCE NOTES -- IMPORTANT --

  Format follows Keep a Changelog; versions use SemVer. Omit dates in `## [x.y.z]` headers (pub.dev shows publish dates). Project links and archive location are in the intro below.

  Each release (and [Unreleased]) opens with one plain-language line for humans—user-facing only, casual wording—then end it with:
  `[log](https://github.com/saropa/saropa_drift_advisor/blob/vX.Y.Z/CHANGELOG.md)` substituting X.Y.Z.

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

### Fixed

- **App logo not appearing** (Website) — replaced corrupted inlined base64 PNG (~185 lines) with a CDN-hosted URL using the same jsDelivr + `@main` fallback pattern as CSS/JS assets

### Changed

- **Collapsible table definition** (Website) — table definition panel above the data grid is now collapsible (▼/▲ toggle, collapsed by default), matching the query builder pattern
- **Sidebar toggle arrow** (Website) — arrow is now larger, right-aligned, and points left instead of down for clearer collapse affordance
- **Monospace font upgrade** (Website) — switched to JetBrains Mono via Google Fonts CDN; centralized font stack into a single `--font-mono` CSS custom property for easy future changes

---

## [2.18.0]

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

### Added

- **Super FAB menu** — Sidebar toggle, theme cycle, and PII mask moved from the header into a floating action button in the bottom-right corner. Click the gear icon to expand; click outside or press Escape to dismiss
- **App logo in tab bar** — Replaced the "Saropa Drift Adviser" text header with the app logo, positioned inline with the tab buttons

### Fixed

- **Showcase/Midnight themes now show dramatic visual effects** — The premium themes had nearly-opaque backgrounds (75-85% alpha) that made glassmorphism invisible. Completely rewritten with floating ambient orbs, glass shimmer sweeps, card entrance animations with blur-to-clear, rainbow borders visible at rest, dramatic hover lifts, animated gradient buttons, and backgrounds at 25-35% alpha so the frosted glass effect is unmistakable
- **Sticky header preserved in premium themes** — The enhanced CSS was overriding `position: sticky` with `position: relative` on the header, causing it to scroll away instead of staying fixed

---

## [2.17.4]

Fixed the changelog — 2.17.2 had accidentally overwritten the 2.17.1 entry. Both versions are now listed correctly below. [log](https://github.com/saropa/saropa_drift_advisor/blob/v2.17.4/CHANGELOG.md)

### Changed

- **Publish pipeline: store propagation polling** — After publishing, the pipeline now polls pub.dev, VS Code Marketplace, and/or Open VSX APIs until the new version is visible (30 s interval, 10 min max). Catches CDN propagation delays so you don't close the terminal thinking the release is done when users still see the old version. Timeout is non-fatal

---

## [2.17.3]

Midnight theme, draft conflict detection, masked CSV export, clipboard paste import, and a wave of false-positive fixes across diagnostics. [log](https://github.com/saropa/saropa_drift_advisor/blob/v2.17.2/CHANGELOG.md)

### Added

- **Midnight theme (CDN-only)** — A fourth theme option: deep navy dark mode with periwinkle accents, glassmorphic panels, animated gradient background, and rainbow side borders. Uses the saropa.com dark palette (#1a1d2b / #2c3350 / #8fa8ff). Degrades gracefully to the base dark theme when the CDN is unavailable
- **Draft conflict detection** — When restoring saved pending edits from a previous session, the extension now checks each edit's original value against the live database. Warns if rows were changed or deleted since the draft was saved, with the option to restore anyway or discard
- **BLOB columns blocked at the DOM level** — BLOB columns are now visually non-editable (double-click is silently ignored) rather than requiring a server round-trip rejection. Table headers carry `data-col-type` attributes for client-side detection
- **Copy migration SQL** — Database comparison panel now has a "Copy Migration SQL" button that fetches the DDL migration preview and copies it to the clipboard
- **Clickable ER diagram tables** — Double-click a table node in the ER diagram to open its data view. Drag detection prevents accidental navigation while repositioning
- **Masked CSV export** — New "CSV (PII masked)" option in the extension export picker. Heuristic column-name detection masks emails, phones, SSNs, passwords, tokens, secrets, API keys, and addresses
- **Clear table / clear all** — Web viewer now shows "Clear rows" and "Clear all tables" buttons when write access is enabled. Executes via the batch edits endpoint in a single transaction with double-confirmation
- **Clipboard paste import** — Web viewer import panel has a "Paste" button that reads from the clipboard and auto-detects CSV, TSV, or JSON format
- **Configurable slow-query threshold** — Performance panel now has a threshold input (default 100 ms) that is passed as a query parameter to the server. Recent queries color-coding adapts dynamically

### Changed

- **Light theme is now the default** — The web viewer defaults to light mode when no saved preference or OS/VS Code hint is detected. Previously defaulted to dark
- **Light and showcase palettes overhauled** — Both light themes now use the saropa.com design system: slate-blue text (#242b4a), blue-tinted borders (rgba(143, 168, 255, ...)), multi-layer composited shadows, larger border radii (8/12/16px), and hover lift effects
- **Theme cycle expanded to four** — With enhanced CSS loaded, the toggle cycles Light → Showcase → Dark → Midnight. Without CDN, it toggles Light ↔ Dark
- **Smart premium upgrade** — When enhanced CSS loads with no saved preference, OS dark-mode users get Midnight automatically; light-mode users get Showcase

### Fixed

- **Removed `blob-column-large` diagnostic** — The unconditional "may cause memory issues" warning on every BLOB column has been removed. Developers choose BLOB storage deliberately; the type-only check was unactionable noise. The "Profile Column" command remains available from other diagnostic providers for on-demand column analysis
- **Anomaly false positives on valid wide-range columns** — The numeric outlier detector no longer flags coordinate columns (lat/lng/lon/latitude/longitude), version/revision columns, or any column whose data naturally spans a wide range. Replaced the naive 10× average heuristic with 3-sigma (standard deviation) statistical analysis, plus name-based skips for known domain patterns
- **False positive diagnostics in non-Drift projects** — The extension no longer fires `missing-table-in-db` and `extra-table-in-db` diagnostics in workspaces that don't use Drift. Three fixes: (1) diagnostics now skip scanning when pubspec.yaml lacks `drift` or `saropa_drift_advisor`; (2) the Dart parser ignores `class … extends Table` patterns inside `///` doc comments, `//` line comments, and `/* */` block comments; (3) `extra-table-in-db` reports against the primary schema file instead of an arbitrary first match
- **Saved premium theme restored after CDN loads** — If a user saved Showcase or Midnight but the CDN hadn't loaded yet, initTheme degraded them (Showcase→Light, Midnight→Dark). When the enhanced CSS finally loaded, markEnhancedReady did not restore the saved premium theme. Now it does
- **No-PK table gate uses error, not warning** — Opening the bulk edit panel on a table without a primary key now shows `showErrorMessage` (blocking, unmissable) instead of `showWarningMessage` (dismissible)
- **Commit failure message includes rollback context** — Error now states the statement count and confirms the transaction was rolled back, making it clear pending edits are preserved for retry
- **Table cells carry raw values for editing** — Report table `<td>` elements now include `data-raw-value` attributes so the inline editing script correctly distinguishes `NULL` from the text "NULL"
- **N+1 false positive on activity/log tables** — The N+1 query detector now only counts SELECT operations. Write operations (INSERT, UPDATE, DELETE) are inherently per-record and were incorrectly inflating the hit count, causing false warnings on tables like `activities` that receive frequent independent writes from user actions
- **Index suggestion false positives (`missing-id-index`, `missing-datetime-index`)** — Three fixes: (1) the `_id` heuristic now only fires when a matching table exists in the database (e.g. `user_id` fires if `users` table exists, but `api_id`, `swapi_id`, `wikidata_id` are suppressed); (2) the datetime heuristic now checks the Dart column type and skips non-datetime types like `BoolColumn` (fixes `is_free_time` being flagged as a datetime column); (3) both heuristic codes downgraded from Information to Hint severity so they appear as faded text rather than cluttering the Problems panel

---

## [2.17.1]

Showcase theme, webview panels for all command output, sidebar column counts, and reliable theme activation. [log](https://github.com/saropa/saropa_drift_advisor/blob/v2.17.1/CHANGELOG.md)

### Added

- **Showcase theme (CDN-only)** — A third theme option for the web viewer with glassmorphism frosted-glass panels, animated pastel gradient backgrounds, rainbow side border accents, drop shadows, staggered entrance animations, and purple accent colors. The theme is the default when the enhanced CDN stylesheet loads and cycles between Showcase → Dark → Light via the header toggle. When the CDN is unavailable, the viewer falls back to the existing dark/light two-way toggle with no visual regression

### Removed

- **Schema Search sidebar panel removed** — The dedicated Schema Search webview panel has been removed. Use VS Code's built-in tree filter (funnel icon or type-to-filter) in the Database panel instead. The Global Search command in Drift Tools remains available for cross-table search

### Changed

- **Database tree shows column count** — Table items now display `"3 cols, 42 rows"` instead of just `"42 rows"`, making table shape visible at a glance
- **Command Palette titles cleaned up** — All 106 commands now use VS Code's `category` field (`"Saropa Drift Advisor"`) instead of embedding the prefix in each title, following VS Code extension conventions
- **All command output now uses webview panels** — Ten commands that previously used the VS Code top bar (quick picks, input boxes, info messages) for displaying results or collecting multi-step input now open dedicated webview panels instead. Index suggestions, anomaly detection, and performance baselines render in rich sortable/filterable tables. Annotation, compare rows, data breakpoint, snapshot changelog, import dataset, and export dataset commands now collect all inputs in a single form view with Ctrl+Enter support, replacing sequential top-bar prompts
- **Tables heading now collapses sidebar horizontally** — Clicking the "Tables" heading in the sidebar collapses the entire sidebar panel to the left (same as the header chevron button) instead of vertically collapsing the table list upward

### Fixed

- **Showcase theme now activates reliably** — The enhanced CSS load detection used a 3-second timeout that nulled the `onload` callback, permanently locking out the showcase theme if the CDN was slightly slow or the browser never fired `onload` for `<link>` elements (VS Code webview, some WebKit builds). Replaced with an idempotent `markEnhancedReady()` function called by both `onload` and a polling fallback that checks `link.sheet` every 250ms for up to 10 seconds
- Debug server now survives Flutter hot restart without a `SocketException` — previously required a full cold restart to reconnect the VS Code extension
- Anomaly scanner no longer flags empty strings in nullable text columns — if the schema says the field is optional, empty strings are a valid design choice, not a data quality warning
- **"Run CREATE INDEX Now" quick fix removed** — the action always failed because the debug server only allows read-only SQL; the "Copy CREATE INDEX SQL" action remains and is now the preferred quick fix for all index suggestions

---

## [2.16.0]

Dashboard tab renamed for clarity, and web UI assets now load reliably on Flutter Windows desktop. [log](https://github.com/saropa/saropa_drift_advisor/blob/v2.16.0/CHANGELOG.md)

### Changed

• **Dashboard tab renamed to "Saropa Drift Dashboard"** — The VS Code webview tab previously showed the generic title "Dashboard"; it now displays "Saropa Drift Dashboard" for clarity when multiple editor tabs are open.

### Fixed

• **Web UI assets (CSS/JS) returned 404 in Flutter Windows desktop** — After the embedded-string fallback was removed, the debug server relied entirely on disk-based asset resolution, which silently failed in Flutter desktop where `Directory.current` and `Isolate.resolvePackageUri` do not reliably point to the package source tree. Four resolution strategies now run in sequence: (1) `Isolate.resolvePackageUri` with an asset-existence probe to reject pub-cache paths, (2) `.dart_tool/package_config.json` ancestor walk to locate the declared `rootUri`, (3) ancestor walk from `Directory.current`, and (4) ancestor walk from `Platform.resolvedExecutable` — which catches Flutter Windows where the running executable lives in `build/windows/x64/runner/Debug/` but `Directory.current` is unrelated. Assets are cached in memory on first resolution so subsequent requests skip disk I/O.

• **Asset resolution failures were invisible in the Flutter debug console** — The `DriftDebugErrorLogger` log and error callbacks routed all output exclusively through `developer.log`, which is only visible in Dart DevTools and is invisible in the standard Flutter run console or IDE debug terminal. Both callbacks now also call `print()` so `[SDA]` diagnostic messages appear without needing DevTools open. The server also logs the exact file path it probes, whether the file exists, and byte counts on success, making it straightforward to diagnose any future resolution failure.

---

## [2.14.4]

Eliminates false-positive diagnostics across index, FK, empty-table, and anomaly checks, and fixes blank Web UI caused by MIME-blocked CDN fallback. [log](https://github.com/saropa/saropa_drift_advisor/blob/v2.14.3/CHANGELOG.md)

### Fixed

• **`missing-fk-index` false positive on audit timestamp and `_id` columns** — The `missing-fk-index` diagnostic fired on `created_at`, `updated_at`, and `_id`-suffixed columns that have no foreign key relationship, labeling them "FK column" in the Problems panel. Index suggestions from the server's three heuristics (true FK, `_id` suffix, date/time suffix) now produce distinct diagnostic codes: `missing-fk-index` (Warning) for actual FK columns, `missing-id-index` (Information) for `_id` columns, and `missing-datetime-index` (Information) for date/time columns. Each code has an accurate message and all three retain Copy/Run SQL quick-fix actions.

• **`empty-table` false positive on legitimately empty tables** — The `empty-table` data-quality diagnostic fired on every table with 0 rows, flooding the Problems panel with false positives in fresh or development databases. Empty tables are a valid state (user-data, cache, static-data tables all start empty), so the diagnostic has been removed entirely. The `empty-table` code, its code-action quick fixes (Generate Seed Data / Import Data), and its entry in the diagnostic code registry have all been deleted.

• **Anomaly scanner false positive on boolean columns with skewed distributions** — The `potential_outlier` numeric heuristic fired on boolean columns stored as `INTEGER 0/1` when the true-percentage was low (e.g., 9% → `max(1) > avg(0.09) × 10`). Boolean-typed columns (`BOOLEAN`, `BOOL`, `BIT`) are now excluded from numeric outlier detection, and a binary-domain guard (`min == 0 && max == 1`) catches Drift `BoolColumn` values stored as `INTEGER`.

• **`no-foreign-keys` false positive on intentionally isolated tables** — The `no-foreign-keys` best-practice diagnostic fired on every table that had an `id` column and at least one other column but no `FOREIGN KEY` constraints, producing dozens of false positives on tables intentionally designed without FKs (import caches, config stores, static data, audit logs). The check now only flags tables that have `_id` columns matching a known table name (e.g. `user_id` when a `users` table exists) but lack FK constraints — catching genuine "forgot `references()`" mistakes. Tables referenced by other tables via inbound FKs are also skipped, since they already participate in the relational graph.

• **`missing-table-in-db` false positive on tables with consecutive uppercase letters** — `dartClassToSnakeCase()` grouped acronyms as single tokens (e.g. `DC` → `dc`), but Drift splits every uppercase letter individually (`DC` → `d_c`). Tables like `SuperheroDCCharacters` were flagged as missing even though they existed under the Drift-generated name `superhero_d_c_characters`. The converter now matches Drift's per-letter splitting.

• **Anomaly scanner false positives on nullable columns** — `_detectNullValues()` flagged NULLs in columns declared `.nullable()`, producing up to 13 spurious warnings per table. NULL detection now only scans NOT NULL columns, where NULLs indicate genuine constraint violations (data corruption, direct SQL inserts, failed migrations). Severity changed from threshold-based warning/info to always `error`.

• **Web UI blank for pub.dev consumers — CDN fallback silently killed by MIME mismatch** — When the debug server could not find web assets on disk (typical for separate projects using the package from pub.dev), it returned 404 with `Content-Type: text/plain`. Combined with Dart's default `X-Content-Type-Options: nosniff` header, both Firefox and Chrome MIME-blocked the response, which suppressed the `<link>`/`<script>` `onerror` callback. The multi-CDN fallback chain never fired — the page loaded blank with no CSS or JS. The 404 path now uses the expected content type (`text/css` or `application/javascript`) so browsers do not MIME-block it; the 404 status alone triggers `onerror` reliably.

---

## [2.14.2]

**NOTE:** This changelog version was corrupted - it may not have been deployed

### Fixed

• **Web UI blank in Firefox — CDN fallback never fired after local 404** — The `onerror` attribute on `<link>` and `<script>` elements does not reliably fire in Firefox when the server returns HTTP 404 with the correct MIME type (`text/css`, `application/javascript`). The multi-CDN fallback chain (`_sda_fb`) was dead code in practice. CSS and JS are now inlined directly into the HTML response when the package root is resolved on disk (zero extra requests, works offline). When local files are unavailable, the HTML references jsDelivr CDN URLs directly via a fetch-based JS loader instead of the broken `onerror` mechanism.

### Changed

• **Loading overlay shows startup diagnostics** — The loading screen now displays the package version, asset source (local/CDN), and per-asset load status instead of an uninformative "Loading…" message. Errors use distinct red styling.

---

## [2.14.1]

Fixes silent command failures and missing user feedback, adds annotation previews and removal commands, and moves bookmarks to the tree toolbar. [log](https://github.com/saropa/saropa_drift_advisor/blob/v2.14.1/CHANGELOG.md)

### Fixed

• **Go to Column/Table Definition did nothing with no feedback** — tree-view context-menu commands silently swallowed errors and gave no progress indication. Now shows a progress notification during search, surfaces errors via toast, and falls back to opening the table class when the specific column getter pattern isn't matched. Also excludes `.g.dart` / `.freezed.dart` from the search for faster results.

• **pub.dev publish failed for v2.14.0** — The pubspec `screenshots` path was changed from `assets/banner_v2.png` to `extension/icon_1024.png`, but `.pubignore` excludes the entire `extension/` directory. pub.dev rejected the upload with "Screenshot `extension/icon_1024.png` is missing from archive." Restored the screenshot path to `assets/banner_v3.png`, which lives in the non-excluded `assets/` directory.

• **Query Cost command failed to register** — `driftViewer.analyzeQueryCost` was registered in both `health-commands` and `query-cost-commands`, causing a "command already exists" error on every activation. Removed the duplicate proxy registration.

• **Warning toasts had no actionable buttons** — 11 `showWarningMessage` calls told users to check settings, docs, or output channels but gave no way to get there. Every warning that references a destination now includes a one-click button (Retry, Open Settings, View Docs, Open Output, etc.).

• **Annotation creation gave no user feedback** — After completing the annotation quick-pick and text input, the command silently returned with no toast, no tree change visible if disconnected, and no indication the annotation was saved. All annotation commands now show a confirmation info message (e.g. "Annotation added to column 'users.email'.").

### Changed

• **Annotation preview in Database Explorer tree** — Tree items now show the actual annotation emoji and note text (truncated at 40 chars) instead of the old generic "· 1 note" / "· 📌" placeholders. Multiple annotations show "+N more" suffix.

• **Bookmarks button moved to tree toolbar** — The "Open Bookmarks" command is now a visible `$(bookmark)` icon in the Database Explorer title bar instead of buried in the `...` overflow menu.

### Added

• **Remove annotations from tree context menu** — Right-click a table or column → "Remove Annotations" with a modal confirmation. Table removal clears all annotation kinds (table, column, row) in a single pass.

• **Clear All Annotations command** — Available in the Database Explorer `...` menu. Confirms before wiping all annotations.

---

## [2.14.0]

Stops internal analytics queries from showing up as false-positive slow-query warnings, and hardens web UI asset loading with in-memory caching, multi-CDN fallback, and proper error handling when the package root can't find assets. [log](https://github.com/saropa/saropa_drift_advisor/blob/v2.14.0/CHANGELOG.md)

### Fixed

• **Phantom slow-query diagnostics from analytics introspection (Bug 044)** — The anomaly detector, index-suggestion scanner, size-analytics handler, and merged `/api/issues` endpoint all ran their introspection queries (PRAGMA, COUNT, SELECT DISTINCT, etc.) through the instrumented query callback, recording them in the performance timing buffer. The VS Code extension's performance provider then reported these as slow user queries (e.g. `SELECT COUNT(*) AS c FROM (SELECT DISTINCT * FROM "user_p...")`) — a false positive. Analytics endpoints now use the raw (uninstrumented) query callback so internal queries never appear in performance data.

• **Connection-error diagnostic firing on non-Drift workspaces** — The extension activates on any Dart project (`workspaceContains:**/pubspec.yaml`) and the runtime connection-health check unconditionally tried `client.generation(0)` against `127.0.0.1:8642`. For workspaces that don't use Drift (e.g. `contacts`, a vanilla Dart project), this always failed and surfaced a red Error diagnostic with no clear resolution path. The check now reads `pubspec.yaml` and skips entirely when the project doesn't list `drift` as a dependency.

• **Notification messages drop redundant "Saropa Drift Advisor:" prefix** — Warning and error toasts from inline cell editing and row-insert validation no longer start with the extension name; VS Code already shows the source extension when a notification is expanded.

### Changed

• **Connection-error diagnostic downgraded to Warning with actionable quick fixes** — Connection errors are now Warning severity (was Error), reflecting that a missing server is an operational state, not a code defect. The diagnostic message tells users to run `DriftDebugServer.start()`. Quick fix actions replaced: "Retry Connection" (preferred), "Don't Show Connection Warnings" (permanently disables the check), and "Open Connection Settings" replace the previous generic "Disable rule" / "Refresh Connection" / "Open Extension Settings" actions.

### Added

• **Resilient web UI asset loading** — Three layers of defense prevent the web UI from silently failing when CSS/JS cannot be loaded:

1. **In-memory asset cache** — `style.css` and `app.js` are read into memory once during package root resolution and served from cache on subsequent requests, eliminating per-request disk I/O.
2. **Multi-CDN fallback chain** — CSS and JS `onerror` handlers now try version-pinned jsDelivr (`@v{version}`), then `@main` (covers the window between publishing and git tag creation). All sources exhausted dispatches a `sda-asset-failed` custom event.
3. **Loading overlay with error state** — A self-contained overlay (inline styles, no CSS dependency) shows "Loading Drift Advisor..." until `app.js` hides it. If JS never loads, the overlay updates to a clear error message with instructions to check network and refresh.

• **Web UI assets blocked by browser MIME mismatch** — When the debug server's file-read failed (e.g. package root resolved to pub cache without `assets/`), `_sendWebAsset` sent HTTP 200 with default `text/plain` content type instead of 404. Browsers with `X-Content-Type-Options: nosniff` blocked the CSS/JS, and because the response was 200, the `onerror` CDN fallback never fired — leaving the web viewer completely broken. Fixed: file content is now read before committing any response headers; any failure falls through to a clean 404. Additionally, `_resolvePackageRootPath` now validates that the resolved root actually contains web assets before accepting it — if `Isolate.resolvePackageUri` points to the pub cache (where `assets/` may be absent), the ancestor walk runs instead.

---

## [2.13.0]

Fixes several broken commands and stuck webviews, removes duplicate Quick Actions from the Database tree, and upgrades the example app to a live database dashboard. [log](https://github.com/saropa/saropa_drift_advisor/blob/v2.13.0/CHANGELOG.md)

### Changed

• **Removed duplicate Quick Actions from Database tree** — The "Quick Actions" collapsible group in the Database Explorer duplicated every command already in the "Drift Tools" panel. Removed the redundant group so tool commands appear only in Drift Tools.

• **Example app shows a database dashboard instead of a static notice** — The example's landing screen now displays a compact status header with server state and URL, a table overview with row counts for every table, and a recent-posts list showing title, author, draft/published status, and comment count. Error and disabled states still fall back to the original centered layout.

### Fixed

• **"Browse all tables" link in Schema Search did nothing** — Periodic server-discovery updates fired `connectionState` messages to the webview, which called `doSearch()` with an empty query, overwriting browse results with the idle placeholder. Added a `browseActive` guard so browse-all results persist until the user types, changes filters, disconnects, or encounters an error.

• **11 commands declared but missing from Command Palette** — `disableDiagnosticRule`, `clearRuntimeAlerts`, `copySuggestedName`, `runIndexSql`, `seedWithProfiles`, `showIndexSuggestions`, `createAllIndexes`, `generateAnomalyFixes`, `sampleTable`, `toggleInvariant`, and `viewInvariantViolations` were registered in code but absent from `contributes.commands`, preventing VS Code from auto-generating activation events for them.

• **Exhaustive command-wiring tests** — Two new tests verify that every command declared in `package.json` is registered at activation (forward check) and that every registered command is declared (reverse check). Any future wiring breakage now fails the test suite before publication.

• **Schema Search stuck on "Waiting for the extension" forever** — The early handshake script and the main script both called `acquireVsCodeApi()`, which can only be called once per webview. The second call threw silently, preventing the message listener from registering. Connection state messages were dropped and Schema Search never updated.

• **Query Cost Analysis command failed to register** — The explain-panel module used value imports for type-only re-exports, causing a runtime `require()` failure that silently prevented the queryCost command from registering. A warning toast was the only symptom.

• **Web UI CSS/JS blocked by MIME type mismatch** — The Dart server's fallback package-root resolution required both the barrel file and an asset file to coexist in each candidate directory. When running from the example app, the walk never found the package root, so assets were served as 404 with `text/plain` — blocked by browsers enforcing `X-Content-Type-Options: nosniff`.

---

## [2.11.1]

Fixes the invisible server-startup banner on Android (third regression) and makes disconnected sidebar buttons actually clickable. [log](https://github.com/saropa/saropa_drift_advisor/blob/v2.11.1/CHANGELOG.md)

### Fixed

• **Server startup banner invisible on Android (third regression)** — Commit `086152f` replaced `print()` with `ctx.log()` to satisfy `avoid_print`, routing the banner through `developer.log()` which does not produce `I/flutter` lines on Android. The server was starting but the user saw no output. Restored `print()` with lint ignores and an anchored comment explaining why `print()` is the only correct choice. Server startup errors (e.g. port in use) are now also printed visibly instead of only going through `developer.log()`.

• **VS Code: buttons do nothing when disconnected** — The Database tree returned an empty array when no server was connected, forcing VS Code to show a `viewsWelcome` overlay with markdown `command:` links. These links silently fail in some VS Code forks/versions — no output, no toast, no error. The tree now always returns real `TreeItem` rows with `.command` properties (Retry Discovery, Diagnose, Troubleshooting, Connection log, Select Server, etc.) so every action is a clickable tree item that works reliably in all hosts.

### Changed

• **Discovery output log is much more verbose** — Every scan cycle now logs its start, result (ports found or empty scan count), and when the next scan is scheduled. Previously only state transitions were logged, leaving long silent gaps during the 3s→30s search/backoff cycle.

---

## [2.11.0]

Fixes a Windows-only hang where fetch never completes, permanently locking the Database tree. [log](https://github.com/saropa/saropa_drift_advisor/blob/v2.11.0/CHANGELOG.md)

### Fixed

• **VS Code: fetch hangs forever on Windows (AbortController/undici bug)** — On some Windows Node.js builds, `AbortController.abort()` does not reliably cancel an in-flight `fetch()` (known undici bug). `fetchWithTimeout` now wraps the native fetch in a `Promise.race` safety layer that fires shortly after the abort timer, guaranteeing the promise always settles. A second safety timeout in `DriftTreeProvider.refresh()` ensures `_refreshing` is always cleared even if both the abort and per-call safety somehow hang. Together these prevent the permanent "Could not load schema (REST API)" deadlock where the initial refresh hung forever, `_refreshing` stayed `true`, and the coalesced discovery-triggered refresh never ran.

---

## [2.10.2]

Fixes a batch of reliability issues — stuck Database tree, broken mutation tracking, missing command declarations — and polishes sidebar loading states. [log](https://github.com/saropa/saropa_drift_advisor/blob/v2.10.2/CHANGELOG.md)

### Fixed

• **VS Code: Database tree stuck on "Could not load schema" after discovery** — The tree `refresh()` silently dropped concurrent calls via a `_refreshing` guard, so when `loadOnConnect` raced with discovery-triggered refresh, the second call was lost. Added coalescing: calls during an in-flight refresh are queued and run once the current refresh completes, ensuring the tree always loads when a server is found.

• **VS Code: missing command declarations for Edit Table Data / Commit Edits** — `commitPendingEdits` and `editTableData` were registered in source and referenced in menus but not declared in `contributes.commands`, so VS Code could not auto-generate `onCommand` activation events for them.

• **Flutter iOS/Android: web UI asset requests and `Isolate.resolvePackageUri`** — Serving `/assets/web/style.css` and `app.js` called `Isolate.resolvePackageUri`, which is unsupported on Flutter mobile embedders (`UnsupportedError` / `resolvePackageUriSync`). That path is now treated as expected: no `DriftDebugServer` error log or `onError` callback for that case; the handler still falls back to ancestor discovery and 404 + CDN as before.

• **VS Code: “Open URL” on server-detected toast** — Choosing **Open URL** when discovery finds a Drift debug server now also selects that host:port as the active server in the extension (same endpoint as the browser). Previously the toast only opened the browser; with multiple servers or a dismissed QuickPick the sidebar could stay on the wrong port or none.

• **`/api/mutations` long-poll and VM logging** — When no mutation arrived before the long-poll deadline, the server treated the normal timeout as a loggable event (`developer.log` with error/stack). That could flood the VM service and stall the app with multiple clients. Idle timeouts no longer emit those logs.

• **Mutation SQL classification regex** — INSERT/UPDATE/DELETE patterns in the mutation tracker used `\\s` / `\\b` in raw Dart strings (literal backslashes), so they never matched real SQL whitespace/word boundaries. Semantic mutation capture and `/api/mutations` wakeups now classify typical statements correctly.

### Improved

• **Web viewer: Tables sidebar loading** — While the table list loads, placeholders (shimmer skeleton rows) appear **under** the **Tables** heading instead of above it; the old text-and-spinner line is removed. Failed `GET /api/tables` shows an error message in the same block.

• **VS Code: Database sidebar when REST schema fails** — If the UI shows a connection but the Database tree cannot load schema from the REST API, the explorer now lists a warning row and the same troubleshooting commands as **clickable tree items** (Refresh, Diagnose, Troubleshooting, log, browser, Select Server, web help). Some editors do not run `viewsWelcome` markdown `command:` links, which made those controls appear to do nothing. **Refresh tree** also shows a result notification after each attempt; **Connection help (web)** shows a short toast before opening the docs.

### Documentation

• **`doc/API.md` — Run SQL from links** — Documents the web viewer `GET /?sql=` deep link (prefill Run SQL, `replaceState`, privacy and URL-length caveats) alongside `POST /api/sql`, lists `sql` in the query-parameter reference, nests those endpoints under **SQL** in the table of contents with stable anchor IDs, and links **`GET /`** (Special Routes) to the same web-viewer section. Plan `plans/48-log-capture-sql-deeplink-and-api.md` updated to match (cross-refs, Log Capture as external contract, security notes).

---

## [2.10.0]

Clearer table row counts, inline table column definitions, a more polished Size analytics panel, and a lighter Dart package (no embedded CSS/JS mirror for the web viewer). The VS Code extension improves Schema Search when disconnected, optional offline Database tree from persisted schema, navigation from the sidebar to Dart definitions, and a command to scan Drift table definitions from Dart sources without a connected server. [log](https://github.com/saropa/saropa_drift_advisor/blob/v2.10.0/CHANGELOG.md)

### Changed

• **No embedded web UI mirror in Dart** — Removed `web_assets_embedded.dart` (duplicate `style.css` / `app.js` as string constants). Static assets are still published under `assets/web/` for normal disk serving; when the package root cannot be read, `/assets/web/*` returns 404 and the HTML shell’s `onerror` handlers load version-pinned jsDelivr copies instead — smaller footprint for apps that depend on this package. The VS Code webview CSP now allows jsDelivr and Google Fonts so those fallbacks are not blocked.

### Improved

• **Table definition on table tabs (debug web UI)** — Opening a table shows a **Table definition** block above the query builder and grid: each column’s SQLite type plus PK / NOT NULL flags (from schema metadata). The same block appears when Search uses schema **and** table data (“both”) and a table is loaded.

• **Web UI table row counts** — In the sidebar, Tables browse grid, Search table picker, and Import dropdown, counts appear as comma-separated numbers in parentheses (e.g. `(1,643)`), without the word “rows”; numbers use muted color and align to the right beside the table name.

• **Size tab (debug web UI)** — Summary cards use comma-grouped numbers where appropriate; the Pages card shows total bytes with a dimmed `page_count × page_size` line; index names use smaller type; the Columns column is right-aligned. Table names in the breakdown link to open that table in a tab. Revisiting the Size tab in the same session reuses the last successful analyze (no automatic re-fetch); **Analyze** still refreshes on demand. Read-only metrics have hover tooltips (including journal mode / **wal** and PRAGMA-backed fields).

• **Busy spinners on slow actions (debug web UI)** — Primary and toolbar buttons that wait on the server (e.g. Size/Index/Health analyze, Perf update, Run SQL / Explain, migration preview, share, import, query builder run) show an inline spinner beside the progress label; existing error handling and disabled-state behavior are unchanged.

• **Ask in English (debug web UI)** — Replaces the full-width bright text row with an **Ask in English…** control that opens a modal: multiline question, dark-themed **Generated SQL (preview)** that updates as you type (debounced), and **Use** to copy into the main SQL editor. Cancel, Escape, or the backdrop close without changing the main editor. NL conversion errors stay in the modal so they do not replace SQL run errors below the editor.

• **Sidebar panel toggle (debug web UI)** — Header **Sidebar** control collapses the full left column (search + table list) so the main panel can use the full width; collapsed state is stored in `localStorage`. Removed the redundant sidebar line that only pointed users to the **Export** tab (export downloads are unchanged on that tab).

• **Header chrome (debug web UI)** — Shorter mask and live-status labeling where it reduces clutter; theme button tooltip names the mode you switch to on click.

### VS Code extension

• **Schema Search panel (disconnected)** — Removed the native welcome overlay that could leave the webview area blank; added a static startup line, full troubleshooting actions aligned with the Database section (Open in Browser, Troubleshooting, Retry, Refresh sidebar UI, Forward Port, Select Server, etc.), resource links, and copy that distinguishes “no saved schema in this workspace” vs “saved schema available.” Connection state includes `persistedSchemaAvailable` from workspace cache.

• **Offline Database tree** — New setting `driftViewer.database.allowOfflineSchema` (default on): when the server is unreachable, the tree can repopulate from last-known persisted schema; status shows “Offline — cached schema.” `refreshDriftConnectionUi` passes `schemaCache` and `treeProvider` so Schema Search can enable search against cache when the tree is offline-only.

• **Go to Dart definitions from sidebar** — Context menu and Schema Search result clicks open the Drift table/column definition in the workspace when found (`drift-source-locator.ts` shared with F12 in SQL strings); otherwise Schema Search falls back to revealing the table in the Database tree.

• **Scan Dart schema definitions (offline)** — Command **Saropa Drift Advisor: Scan Dart Schema Definitions** lists Drift `Table` classes, columns, `uniqueKeys`, and `Index` / `UniqueIndex` entries from workspace `.dart` files (excludes `build/`). No debug server or prior session required. Output → **Drift Dart schema**; setting `driftViewer.dartSchemaScan.openOutput` controls auto-opening the channel. The shared parser also records `indexes` / `uniqueKeys` on `IDartTable` for Schema Diff and diagnostics.

• **Schema Search when “connected” but schema missing** — If HTTP/VM reports connected before REST table metadata loads (or it fails), Schema Search keeps the yellow help banner visible (Retry, Diagnose, **Scan Dart sources**, etc.) until the Database tree has loaded a table list. Search/browse stay off until then (`DriftTreeProvider.isSchemaSearchAvailable()`).

• **Schema Search webview readability** — Always-visible header chrome, sidebar background + `min-height`, fallback colors when theme variables are missing in the webview, visible search field borders, and defer hiding the bootstrap block until after connection state is applied (avoids a transient empty panel).

---

## [2.9.2]

Sidebar stays actionable when HTTP/VM says “connected” but the schema tree cannot load, and Schema Search recovers if the webview script never reaches the ready handshake. [log](https://github.com/saropa/saropa_drift_advisor/blob/v2.9.2/CHANGELOG.md)

### Fixed

• **Blank Database section with a false “connected” state** — `driftViewer.serverConnected` could be true (discovery or VM) while `health` / `schemaMetadata` failed, so the tree had no roots and the disconnected welcome stayed hidden. The extension now sets `driftViewer.databaseTreeEmpty` from the tree provider and shows a dedicated **viewsWelcome** with refresh, diagnose, and help links until the tree loads.

• **Schema Search panel stuck empty** — The host now forces delivery of connection state after a short timeout when the embedded script never posts `ready`, the script wraps init in try/finally so `ready` always fires, and the webview registers a dispose handler for the timer. The wildcard `*` activation event was removed (use `onStartupFinished` and explicit hooks) to avoid invalid-manifest behavior in some hosts.

• **Refresh / About toolbar commands during activation** — `driftViewer.aboutSaropa` and `driftViewer.refreshTree` register immediately after bootstrap and tree creation so title-bar actions work even if a later activation step fails before the bulk command registration pass.

• **Schema Search view visibility** — The Schema Search sidebar entry is no longer hidden when `driftViewer.enabled` flips late; it stays declared like the Database view so the webview can render during startup.

---

## [2.9.1]

No-blank sidebar startup fallback and safer command availability during activation. [log](https://github.com/saropa/saropa_drift_advisor/blob/v2.9.1/CHANGELOG.md)

### Fixed

• **No-blank sidebar startup fallback** — Activation now includes startup/view/workspace hooks so connection commands register before users click them, and disconnected welcome text no longer depends on pre-set context keys. Schema Search also has a fallback welcome block with direct actions (Refresh UI, Retry, Diagnose, Troubleshooting, web help), preventing empty panes during activation races.

• **Database header icons no longer fail in partial activation contexts** — `About` / `About Saropa` now resolve extension file paths via `extensionUri` with a safe fallback to the hosted docs URL, so the icon commands do not throw when path metadata is unavailable.

---

## [2.9.0]

Faster disconnect detection, quieter logs, and a banner that actually shows up. Lighter extension load on SQLite, authenticated discovery, and a path from pending cell edits to the database—batch apply, bulk-edit UI, and foreign-key–aware ordering. [log](https://github.com/saropa/saropa_drift_advisor/blob/v2.9.0/CHANGELOG.md)

### Fixed

• **Schema Search disconnected banner never appeared** — The webview defaulted to `connected = true` and hid the banner, relying on the extension to send `connected: false`. If the message was lost or delayed the banner stayed hidden indefinitely. The webview now defaults to disconnected (banner visible, controls disabled) and the extension confirms connection via the ready handshake within milliseconds.

• **Cell update numeric parsing now fails safely** — integer/real coercion uses guarded parsing and rejects non-finite numeric values, returning 400 validation errors for invalid user input instead of risking parse exceptions.

• **Batch transaction failure paths now log cleanup issues** — rollback and primary transaction exceptions are both logged, improving diagnostics when `/api/edits/apply` fails.

### Improved

• **Less SQLite contention from the extension** — Port discovery validates servers with **`GET /api/health` only** (requires `ok` and a non-empty **`version`**), avoiding a full **`/api/schema/metadata`** pass on every candidate port. **`GET /api/schema/metadata?includeForeignKeys=1`** (and VM **`getSchemaMetadata`** with `includeForeignKeys`) returns per-table **foreign keys in the same response**, so health scoring and schema insights no longer fire **N separate fk-meta requests**. **Index suggestions**, **anomaly scan**, and **size analytics** are prefetched **sequentially** instead of all at once, and schema insight cache TTL is **90s**, reducing overlapping full-database scans.

• **Discovery + Bearer auth** — Port scans pass the same **`Authorization: Bearer …`** header as the API client (including after `driftViewer.authToken` changes), so health probes succeed when the debug server requires a token.

• **Batch apply pending data edits** — With `writeQuery` configured, the server exposes **`POST /api/edits/apply`** (validated UPDATE / INSERT INTO / DELETE FROM only, one SQLite transaction). The VS Code command **Apply Pending Edits to Database** runs that batch and clears the pending queue on success.

• **Bulk edit panel** — **Edit Table Data** opens a small dashboard (open table viewer, preview SQL, apply, undo, discard). It appears on the Database table context menu when the server is connected.

• **FK-aware apply order** — Pending edits are ordered for commit as **deletes (child tables first)**, then **cell updates**, then **inserts (parents first)** when schema metadata includes foreign keys; if metadata fails to load, the original queue order is used.

• **VM Service batch apply + health** — **`ext.saropa.drift.applyEditsBatch`** runs the same transactional batch as **`POST /api/edits/apply`**. **`ext.saropa.drift.getHealth`** now includes **`writeEnabled`** and **`editsApply`** (and related capability strings) like the HTTP health endpoint.

### Changed

• **Faster disconnect detection** — Reduced `CONNECTED_INTERVAL` from 15 s to 10 s and `MISS_THRESHOLD` from 3 to 2, cutting the time to detect a lost server from ~45 s to ~20 s.

• **Quieter discovery log** — Suppressed the per-cycle "Scanning N ports…" line and the "Port XXXX: fetch failed" noise for ports with no server (Node undici wraps ECONNREFUSED in a generic `TypeError('fetch failed')` whose message never matched the old filter).

---

## [2.8.2]

Packaging, web assets, Schema Search loading handshake, and Drift Tools registration fixes. [log](https://github.com/saropa/saropa_drift_advisor/blob/v2.8.2/CHANGELOG.md)

### Fixed

• **Published package missing web UI assets** — `.pubignore` contained an unanchored `web/` pattern that excluded `assets/web/` (CSS/JS served by the debug server) from the published package. Consumer apps fell back to CDN, producing `X-Content-Type-Options: nosniff` MIME-mismatch console errors. Fixed by anchoring the pattern to `/web/` (root only).

• **Web UI assets 404 on Flutter emulators** — On Android/iOS emulators the host filesystem is unreachable, so file-based package-root resolution always failed and both `app.js` and `style.css` returned HTTP 404. The server now embeds both assets as compiled-in Dart string constants and serves them from memory when the on-disk path cannot be resolved.

• **Schema Search panel stuck on loading indicator** — `resolveWebviewView` posted `connectionState` before the webview script had wired `addEventListener('message', …)`, so the message was silently dropped and the panel never left its loading state. Fixed with a ready-handshake: the webview sends `{ command: 'ready' }` once its script initializes, and the host defers `connectionState` delivery until the handshake arrives. Visibility changes also re-deliver state.

• **Drift Tools "no data provider" on activation** — `ToolsTreeProvider` was created late in `setupProviders`; if any intermediate registration threw, the tree view was never registered. Moved creation immediately after the Database tree so both sidebar sections are always available.

### Improved

• **Schema Search registered before command wiring** — The Schema Search `WebviewViewProvider` is now created and registered in `setupProviders` (alongside tree views) instead of inside `registerAllCommands`. If command registration fails, the webview still resolves instead of showing VS Code's permanent loading indicator.

• **Troubleshooting: Schema Search diagnostics** — "Diagnose Connection" output now includes `schemaSearch.viewResolved`, `webviewReady`, and `presentationConnected` with actionable warnings. The Troubleshooting panel has a new collapsible section for "Schema Search panel stuck on loading indicator."

---

## [2.8.1]

Web UI asset serving under tests, publish script improvements, and VS Code connection / Schema Search resilience. [log](https://github.com/saropa/saropa_drift_advisor/blob/v2.8.1/CHANGELOG.md)

### Fixed

• **Web UI assets under `flutter test`** — Local `/assets/web/style.css` and `app.js` no longer return HTTP 500 when the test VM cannot resolve `package:` URIs; the server falls back to discovering the package root from the working directory.

### Improved

• **Publish script: working-tree prompt** — Replaced vague “dirty working tree” wording with explicit copy: uncommitted changes are called out as not-yet-committed, publish runs describe per-target `git add` scope (Dart: repo root; extension: `extension/` + `scripts/`), and **analyze** / `--analyze-only` runs use analysis-only messaging so users are not told a commit/push will happen in that invocation.

• **Publish script: `server_constants` / pubspec** — Dart analysis (`dart` / `analyze` / `all` targets) compares `lib/.../server_constants.dart` `packageVersion` to `pubspec.yaml` and updates the Dart file when they drift, before format/tests—so manual pubspec bumps do not fail `version_sync_test`. Unit tests in `scripts/tests/test_target_config_server_constants.py` cover match (no write), mismatch (sync), and failure paths.

• **VS Code: connection UI, Schema Search resilience** — Sidebar “connected” state now follows **HTTP discovery and/or VM Service** (`isDriftUiConnected`), with `refreshDriftConnectionUi` updating context, Drift Tools, and Schema Search together; VM transport changes and HTTP verify paths adopt the client endpoint when no server was selected. Schema Search gains connection **label/hint**, action links (Output log, Retry discovery, Diagnose, Refresh UI), **auto-retry** on transient failures (`schemaSearch.autoRetryOnError`), defensive error handling and logging, and optional **`connection.logEveryUiRefresh`**. New commands: **Show Connection Log**, **Refresh Connection UI**, **Diagnose Connection**; discovery polling uses a longer health probe and an extra miss before dropping a server. Welcome view links expanded. Unit tests cover presentation (**VM-only must not imply HTTP**) and log deduplication.

---

## [2.7.1]

Mutation Stream (VS Code) with column-value filtering, Pipeline saropa_lints report colocation, merged **GET /api/issues** and health **capabilities** for Saropa Lints; plus web UI local assets with CDN fallback and VS Code **onCommand** activation for About / Save Filter. [log](https://github.com/saropa/saropa_drift_advisor/blob/v2.7.1/CHANGELOG.md)

### Added

• **Mutation Stream (VS Code)** — Added a semantic event feed openable from the **Drift Tools** status menu / **Database → Quick Actions**, with **column-value filtering** (schema column dropdown + match value).

• **Pipeline: saropa_lints report colocation** — When the extension pipeline runs the Lint (saropa_lints) step, the generated scan report is copied into the same `reports/YYYYMMDD/` folder as the run's summary report and referenced in the summary (e.g. `Lint report: reports/YYYYMMDD/<timestamp>_saropa_lints_scan_report.log`). Enables one place to find both the drift_advisor run report and the lint report. Optional `--skip-lint` unchanged.

• **GET /api/issues** — Merged endpoint returning index suggestions and data-quality anomalies in one stable JSON shape. Optional `sources` query param (`index-suggestions`, `anomalies`) to filter. Enables IDE integrations (e.g. Saropa Lints) to use one request instead of separate index-suggestions and anomalies calls.

• **Health capabilities** — `GET /api/health` and VM `getHealth` now include a `capabilities` array (e.g. `["issues"]`) so clients can detect support for `GET /api/issues` and fall back on older servers.

• **VM Service getIssues RPC** — `ext.saropa.drift.getIssues` returns the same merged issues list as the HTTP endpoint; optional `sources` param.

• **doc/API.md** — Documented Issues endpoint, issue object fields, and health `capabilities`. README note on Saropa Lints integration.

### Improved

• **Mutation Stream UX** — Debounced filter inputs, added a schema-loading placeholder, and made pause/resume feel immediate.

• **Log Capture integration (extension)** — Session-end flow now uses a single parallel fetch for full mode (no duplicate `performance()` call). Header-only mode still fetches only performance. Shared helpers (`severityToString`, `toWorkspaceRelativePath`, `LOG_CAPTURE_SESSION_TIMEOUT_MS`) exported from the bridge and reused by the public API to remove duplication. Extension test disposable count updated to 181 with a brief comment for the Log Capture subscription.

### Fixed

• **Web UI: local CSS/JS + CDN fallback** — The viewer HTML now loads `/assets/web/style.css` and `/assets/web/app.js` from the debug server (correct `Content-Type`, works offline). If those requests fail, `onerror` falls back to version-pinned jsDelivr URLs. Fixes browsers blocking CDN responses with `text/plain` + `X-Content-Type-Options: nosniff`.

• **VS Code: About / About Saropa / Save Filter "command not found"** — Added `onCommand` activation in `extension/package.json` for `driftViewer.about`, `driftViewer.aboutSaropa`, and `driftViewer.saveFilter` so the extension activates when those commands run before a Dart file has been opened (Command Palette or Database view controls).

---

## [2.7.0]

Web UI: table tabs, self-contained Search tab, and collapsible sidebar; plus ~97% query spam reduction and Dart SDK constraint bump to >=3.9.0 syntax, with shared schema cache and zero runtime dependencies. [log](https://github.com/saropa/saropa_drift_advisor/blob/v2.7.0/CHANGELOG.md)

### Fixed

• **Extension: command error handling** — Every sidebar and welcome-view button (Open in Browser, Troubleshooting, Add Package, Open in Panel, Run Linter, Copy SQL, Open Walkthrough) now catches errors, logs timestamped diagnostics to the Output channel, and shows a user-facing error or warning toast. Previously many commands swallowed failures silently with no feedback.

• **Extension: server discovery error logging** — Port scan failures during server discovery are now logged to the Output channel instead of being silently discarded.

• **Extension: troubleshooting panel message routing** — Webview button actions now catch and surface rejected command promises instead of discarding them.

• **Web UI: Search tab recursive fetch loop** — The Search tab's count fetch no longer triggers a full re-render (which fired 4 duplicate network requests). Count updates are now applied surgically to the meta text element only.

• **Web UI: Search tab shared pagination state** — The Search tab now uses its own independent `limit`/`offset` variables instead of sharing them with the Tables tab, preventing cross-tab pagination bleed.

• **Web UI: undeclared `stDataJson` variable** — Fixed an implicit global variable (`stDataJson` instead of the declared `stTableJson`) in the schema-only branch of the Search tab.

• **Web UI: Search toolbar button** — The toolbar Search button now correctly opens the Search tab before focusing its input. Previously it only attempted to focus an invisible input.

• **Web UI: duplicate `id="data-table"`** — The Search tab's data table now uses `id="st-data-table"` to avoid conflicting with the Tables panel's `id="data-table"` when both exist in the DOM.

• **Web UI: filter re-fetch on every keystroke** — Row filter changes in the Search tab now re-render from cached data instead of firing fresh network requests for every character typed.

• **Web UI: async count updates for Search dropdown** — When table row counts arrive asynchronously, the Search tab's table dropdown labels are now updated to include the count.

• **Web UI: Diagram tab columns only visible in first column** — SVG `<tspan>` elements for table columns used absolute x-coordinates inside an already-translated `<g>` group, doubling the offset and pushing column text outside the visible box for every table card except the first. Changed to local coordinates.

• **Extension: Schema Search always searching, never connecting** — The Schema Search sidebar could hang on "Searching…" indefinitely in two scenarios: (1) "Browse all tables" had no timeout protection, so a slow or unreachable server left the panel loading forever; (2) the schema cache `_fetchPromise` could hang permanently when the underlying HTTP transport failed to resolve or reject, blocking all subsequent cache consumers. Both paths now have bounded timeouts. The panel also shows a "Server not connected" banner with disabled controls when the server goes away, and a **Retry** button appears after timeout/error so the user can retry without retyping their query.

• **Web UI: special-character table names** — Tab lookup now uses iteration instead of `querySelector` attribute selectors, preventing `DOMException` crashes on table names containing quotes, brackets, or backslashes.

• **Web UI: stale tabs on live refresh** — When the database changes and a table is dropped or renamed, its tab is automatically closed instead of remaining as an orphan with an error state.

### Changed

• **SDK constraint raised to `>=3.9.0 <4.0.0`** — Enables Dart 3.6 digit separators, Dart 3.7 wildcard variables and tall formatter style, and Dart 3.8 null-aware collection elements. Formatter page width explicitly set to 80 in `analysis_options.yaml`.

• **Dart 3.8 null-aware map elements** — `QueryTiming.toJson()` uses `'error': ?error` syntax instead of `if (error != null) 'error': error`.

• **`.firstOrNull` simplifications** — Replaced manual `.isEmpty ? null : .first` and `.isNotEmpty ? .first[...] : null` patterns with `.firstOrNull` / `.firstOrNull?[...]` chaining in `compare_handler.dart`, `drift_debug_session.dart`, `server_utils.dart`, and `analytics_handler.dart`.

• **Digit separators** — Applied to numeric literals: `2_000_000`, `65_535`, `8_642`, `1_000` for readability.

• **Dart 3.7 tall formatter** — All 47 Dart files reformatted with the new tall style (vertical argument lists, automatic trailing commas, chain alignment).

• **New lints enabled** — `unnecessary_underscores` (catches `__`/`___` that should be wildcard `_`), `prefer_digit_separators` (enforces separators on large literals).

• **Dev dependencies** — `saropa_lints` ^9.5.2 → ^9.8.1, `test` ^1.25.0 → ^1.30.0.

• **Web UI: null cell indicator** — Table cells with `NULL` database values now display a dimmed, italic "NULL" label instead of blank space, matching DBeaver/DataGrip/pgAdmin convention. Applied automatically in both the Tables and Search tabs.

• **Dart package: zero runtime dependencies** — Removed the `crypto` dependency. Optional Bearer auth now stores the token in memory and compares with a constant-time string comparison; behavior is unchanged. Apps that do not use auth (and those that do) no longer pull in any third-party packages, reducing install size and attack surface.

• **README: Impact on app size** — Documented that the package has no runtime dependencies and clarified tree-shaking and CDN-loaded assets.

### Added

• **Web UI: pin tables to top of sidebar** — Hovering a table in the sidebar reveals a push-pin icon. Clicking it pins the table to the top of the list; clicking again unpins it. Pinned state persists via localStorage and auto-prunes stale entries when tables are dropped. Accessible: keyboard focus ring, `aria-pressed` toggle, visible on touch devices.

• **Web UI: table tabs** — Clicking a table name (sidebar or browse panel) opens it in its own closeable tab. Multiple table tabs can be open simultaneously; clicking an already-open table switches to its tab. The Tables tab now shows a browse-all grid of clickable table cards with row counts.

• **Web UI: collapsible sidebar table list** — The "Tables" heading in the sidebar is now a toggle that collapses/expands the table list. State persists across page reloads via localStorage. Supports keyboard activation (Enter/Space) and ARIA attributes.

• **Web UI: self-contained Search tab** — The Search tab now has its own inline controls (table picker, search input, scope selector, row filter) and loads data independently from the Tables tab. Includes debounced input handling and match navigation.

• **Web UI: Size tab Rows column** — The Rows column in the Size analytics table now has a minimum width and `nowrap` to prevent the bar chart from squeezing the row count number.

• **Extension: schema cache and performance options** — Shared in-memory schema cache with configurable TTL (`driftViewer.schemaCache.ttlMs`) so tree, Schema Search, ER diagram, and other features reuse one fetch. Optional last-known schema persist (`driftViewer.schemaCache.persistKey`) for stale-while-revalidate on startup. Pre-warm runs a background schema fetch when a server connects so the Database view is ready when opened. Lazy Database tree: `driftViewer.database.loadOnConnect` (default true) loads tree on connect; when false, tree loads on first time the Database view is shown. Lightweight mode: `driftViewer.lightweight` (default false) skips file badges, timeline auto-capture, and tree/badges refresh on generation change. Schema Search: configurable timeout (`driftViewer.schemaSearch.timeoutMs`) and cross-ref cap (`driftViewer.schemaSearch.crossRefMatchCap`); "Browse all tables" link returns table list only (one fetch, no cross-refs). Tree providers never throw from `getChildren` so the sidebar no longer shows "no data provider" errors.

• **Web UI: connection banner improvements** — When the server is unreachable, the banner now shows a live countdown ("Next retry in Xs"), the current retry interval (e.g. "Retrying every 5s"), attempt count, and "(max interval)" at 30s. A **Retry now** button triggers an immediate health check and resets backoff; a 1s ticker keeps the countdown accurate. Duplicate in-flight health checks are avoided so Retry does not race with the automatic heartbeat.

### Improved

• **Web UI: accessibility** — Sidebar "Tables" heading uses a nested `<button>` inside `<h2>` to preserve both heading landmark navigation and button semantics for screen readers. Browse cards use semantic `<button>` elements instead of `<a href="#">`. Added `:focus-visible` styles to the sidebar toggle and search toolbar buttons (WCAG 2.4.7).

• **Web UI: tab creation** — Extracted a shared `createClosableTab()` helper used by both tool tabs and table tabs, eliminating ~35 lines of duplicated DOM construction code.

• **Query spam reduction (~97%)** — Drastically reduced the number of SQL queries the extension fires through the user's Drift database, eliminating massive "Drift: Sent" console spam when `logStatements` is enabled. Row counts from the existing change-detection UNION ALL query are now cached in `ServerContext` and included inline in the `/api/tables` response. The web UI uses these inline counts instead of firing N individual `/api/table/<name>/count` requests. Table name validation (`requireKnownTable`) and schema metadata now use cached data. For a 40-table database, a refresh cycle drops from ~160 queries to ~2.

• **Web UI: search input debounce** — Search and filter inputs in the Search tab are now debounced (150ms/200ms) to reduce DOM thrashing and prevent floods of abandoned HTTP requests on large tables.

---

For older versions (2.5.0 and prior), see [CHANGELOG_ARCHIVE.md](./CHANGELOG_ARCHIVE.md).
