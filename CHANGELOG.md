# Changelog

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Dates are not included in version headers — [pub.dev](https://pub.dev/packages/saropa_lints/changelog) displays publish dates separately.

**pub.dev** — [pub.dev / packages / saropa_drift_advisor](https://pub.dev/packages/saropa_drift_advisor)

**VS Code marketplace** - [marketplace.visualstudio.com / items ? itemName=Saropa.drift-viewer](https://marketplace.visualstudio.com/items?itemName=Saropa.drift-viewer)

**Open VSX Registry** - [open-vsx.org / extension / saropa / drift-viewer](https://open-vsx.org/extension/saropa/drift-viewer)

Each version (and [Unreleased]) has a short commentary line in plain language—what this release is about for humans. Only discuss user-facing features; vary the phrasing.

For older versions (1.4.3 and older), see [CHANGELOG_ARCHIVE.md](./CHANGELOG_ARCHIVE.md).

---

## [2.10.0]

Clearer table row counts, inline table column definitions, a more polished Size analytics panel, and a lighter Dart package (no embedded CSS/JS mirror for the web viewer). The VS Code extension improves Schema Search when disconnected, optional offline Database tree from persisted schema, navigation from the sidebar to Dart definitions, and a command to scan Drift table definitions from Dart sources without a connected server.

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

---

## [2.9.2]

Sidebar stays actionable when HTTP/VM says “connected” but the schema tree cannot load, and Schema Search recovers if the webview script never reaches the ready handshake.

### Fixed

• **Blank Database section with a false “connected” state** — `driftViewer.serverConnected` could be true (discovery or VM) while `health` / `schemaMetadata` failed, so the tree had no roots and the disconnected welcome stayed hidden. The extension now sets `driftViewer.databaseTreeEmpty` from the tree provider and shows a dedicated **viewsWelcome** with refresh, diagnose, and help links until the tree loads.

• **Schema Search panel stuck empty** — The host now forces delivery of connection state after a short timeout when the embedded script never posts `ready`, the script wraps init in try/finally so `ready` always fires, and the webview registers a dispose handler for the timer. The wildcard `*` activation event was removed (use `onStartupFinished` and explicit hooks) to avoid invalid-manifest behavior in some hosts.

• **Refresh / About toolbar commands during activation** — `driftViewer.aboutSaropa` and `driftViewer.refreshTree` register immediately after bootstrap and tree creation so title-bar actions work even if a later activation step fails before the bulk command registration pass.

• **Schema Search view visibility** — The Schema Search sidebar entry is no longer hidden when `driftViewer.enabled` flips late; it stays declared like the Database view so the webview can render during startup.

---

## [2.9.1]

No-blank sidebar startup fallback and safer command availability during activation.

### Fixed

• **No-blank sidebar startup fallback** — Activation now includes startup/view/workspace hooks so connection commands register before users click them, and disconnected welcome text no longer depends on pre-set context keys. Schema Search also has a fallback welcome block with direct actions (Refresh UI, Retry, Diagnose, Troubleshooting, web help), preventing empty panes during activation races.

• **Database header icons no longer fail in partial activation contexts** — `About` / `About Saropa` now resolve extension file paths via `extensionUri` with a safe fallback to the hosted docs URL, so the icon commands do not throw when path metadata is unavailable.

---

## [2.9.0]

Faster disconnect detection, quieter logs, and a banner that actually shows up.
 Lighter extension load on SQLite, authenticated discovery, and a path from pending cell edits to the database—batch apply, bulk-edit UI, and foreign-key–aware ordering.

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

### Fixed

• **Web UI assets under `flutter test`** — Local `/assets/web/style.css` and `app.js` no longer return HTTP 500 when the test VM cannot resolve `package:` URIs; the server falls back to discovering the package root from the working directory.

### Improved

• **Publish script: working-tree prompt** — Replaced vague “dirty working tree” wording with explicit copy: uncommitted changes are called out as not-yet-committed, publish runs describe per-target `git add` scope (Dart: repo root; extension: `extension/` + `scripts/`), and **analyze** / `--analyze-only` runs use analysis-only messaging so users are not told a commit/push will happen in that invocation.

• **Publish script: `server_constants` / pubspec** — Dart analysis (`dart` / `analyze` / `all` targets) compares `lib/.../server_constants.dart` `packageVersion` to `pubspec.yaml` and updates the Dart file when they drift, before format/tests—so manual pubspec bumps do not fail `version_sync_test`. Unit tests in `scripts/tests/test_target_config_server_constants.py` cover match (no write), mismatch (sync), and failure paths.

• **VS Code: connection UI, Schema Search resilience** — Sidebar “connected” state now follows **HTTP discovery and/or VM Service** (`isDriftUiConnected`), with `refreshDriftConnectionUi` updating context, Drift Tools, and Schema Search together; VM transport changes and HTTP verify paths adopt the client endpoint when no server was selected. Schema Search gains connection **label/hint**, action links (Output log, Retry discovery, Diagnose, Refresh UI), **auto-retry** on transient failures (`schemaSearch.autoRetryOnError`), defensive error handling and logging, and optional **`connection.logEveryUiRefresh`**. New commands: **Show Connection Log**, **Refresh Connection UI**, **Diagnose Connection**; discovery polling uses a longer health probe and an extra miss before dropping a server. Welcome view links expanded. Unit tests cover presentation (**VM-only must not imply HTTP**) and log deduplication.

---

## [2.7.1]

### Fixed

• **Web UI: local CSS/JS + CDN fallback** — The viewer HTML now loads `/assets/web/style.css` and `/assets/web/app.js` from the debug server (correct `Content-Type`, works offline). If those requests fail, `onerror` falls back to version-pinned jsDelivr URLs. Fixes browsers blocking CDN responses with `text/plain` + `X-Content-Type-Options: nosniff`.

• **VS Code: About / About Saropa / Save Filter "command not found"** — Added `onCommand` activation in `extension/package.json` for `driftViewer.about`, `driftViewer.aboutSaropa`, and `driftViewer.saveFilter` so the extension activates when those commands run before a Dart file has been opened (Command Palette or Database view controls).

## [2.7.1]

Mutation Stream (VS Code) with column-value filtering, Pipeline: saropa_lints report colocation, alongside Single issues API and capability discovery for Saropa Lints and other consumers.

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

---

## [2.7.0]

Web UI: table tabs, self-contained Search tab, and collapsible sidebar; plus ~97% query spam reduction and Dart SDK constraint bump to >=3.9.0 syntax, with shared schema cache and zero runtime dependencies.

### Fixed

• **Extension: command error handling** — Every sidebar and welcome-view button (Open in Browser, Troubleshooting, Add Package, Open in Panel, Run Linter, Copy SQL, Open Walkthrough) now catches errors, logs timestamped diagnostics to the Output channel, and shows a user-facing error or warning toast. Previously many commands swallowed failures silently with no feedback.

• **Extension: server discovery error logging** — Port scan failures during server discovery are now logged to the Output channel instead of being silently discarded.

• **Extension: troubleshooting panel message routing** — Webview button actions now catch and surface rejected command promises instead of discarding them.

### Changed

• **SDK constraint raised to `>=3.9.0 <4.0.0`** — Enables Dart 3.6 digit separators, Dart 3.7 wildcard variables and tall formatter style, and Dart 3.8 null-aware collection elements. Formatter page width explicitly set to 80 in `analysis_options.yaml`.

• **Dart 3.8 null-aware map elements** — `QueryTiming.toJson()` uses `'error': ?error` syntax instead of `if (error != null) 'error': error`.

• **`.firstOrNull` simplifications** — Replaced manual `.isEmpty ? null : .first` and `.isNotEmpty ? .first[...] : null` patterns with `.firstOrNull` / `.firstOrNull?[...]` chaining in `compare_handler.dart`, `drift_debug_session.dart`, `server_utils.dart`, and `analytics_handler.dart`.

• **Digit separators** — Applied to numeric literals: `2_000_000`, `65_535`, `8_642`, `1_000` for readability.

• **Dart 3.7 tall formatter** — All 47 Dart files reformatted with the new tall style (vertical argument lists, automatic trailing commas, chain alignment).

• **New lints enabled** — `unnecessary_underscores` (catches `__`/`___` that should be wildcard `_`), `prefer_digit_separators` (enforces separators on large literals).

• **Dev dependencies** — `saropa_lints` ^9.5.2 → ^9.8.1, `test` ^1.25.0 → ^1.30.0.

• **Web UI: null cell indicator** — Table cells with `NULL` database values now display a dimmed, italic "NULL" label instead of blank space, matching DBeaver/DataGrip/pgAdmin convention. Applied automatically in both the Tables and Search tabs.

### Added

• **Web UI: pin tables to top of sidebar** — Hovering a table in the sidebar reveals a push-pin icon. Clicking it pins the table to the top of the list; clicking again unpins it. Pinned state persists via localStorage and auto-prunes stale entries when tables are dropped. Accessible: keyboard focus ring, `aria-pressed` toggle, visible on touch devices.

• **Web UI: table tabs** — Clicking a table name (sidebar or browse panel) opens it in its own closeable tab. Multiple table tabs can be open simultaneously; clicking an already-open table switches to its tab. The Tables tab now shows a browse-all grid of clickable table cards with row counts.

• **Web UI: collapsible sidebar table list** — The "Tables" heading in the sidebar is now a toggle that collapses/expands the table list. State persists across page reloads via localStorage. Supports keyboard activation (Enter/Space) and ARIA attributes.

• **Web UI: self-contained Search tab** — The Search tab now has its own inline controls (table picker, search input, scope selector, row filter) and loads data independently from the Tables tab. Includes debounced input handling and match navigation.

• **Web UI: Size tab Rows column** — The Rows column in the Size analytics table now has a minimum width and `nowrap` to prevent the bar chart from squeezing the row count number.

### Fixed

• **Web UI: Search tab recursive fetch loop** — The Search tab's count fetch no longer triggers a full re-render (which fired 4 duplicate network requests). Count updates are now applied surgically to the meta text element only.

• **Web UI: Search tab shared pagination state** — The Search tab now uses its own independent `limit`/`offset` variables instead of sharing them with the Tables tab, preventing cross-tab pagination bleed.

• **Web UI: undeclared `stDataJson` variable** — Fixed an implicit global variable (`stDataJson` instead of the declared `stTableJson`) in the schema-only branch of the Search tab.

• **Web UI: Search toolbar button** — The toolbar Search button now correctly opens the Search tab before focusing its input. Previously it only attempted to focus an invisible input.

• **Web UI: duplicate `id="data-table"`** — The Search tab's data table now uses `id="st-data-table"` to avoid conflicting with the Tables panel's `id="data-table"` when both exist in the DOM.

• **Web UI: filter re-fetch on every keystroke** — Row filter changes in the Search tab now re-render from cached data instead of firing fresh network requests for every character typed.

• **Web UI: async count updates for Search dropdown** — When table row counts arrive asynchronously, the Search tab's table dropdown labels are now updated to include the count.

• **Web UI: Diagram tab columns only visible in first column** — SVG `<tspan>` elements for table columns used absolute x-coordinates inside an already-translated `<g>` group, doubling the offset and pushing column text outside the visible box for every table card except the first. Changed to local coordinates.

### Improved

• **Web UI: accessibility** — Sidebar "Tables" heading uses a nested `<button>` inside `<h2>` to preserve both heading landmark navigation and button semantics for screen readers. Browse cards use semantic `<button>` elements instead of `<a href="#">`. Added `:focus-visible` styles to the sidebar toggle and search toolbar buttons (WCAG 2.4.7).

• **Web UI: tab creation** — Extracted a shared `createClosableTab()` helper used by both tool tabs and table tabs, eliminating ~35 lines of duplicated DOM construction code.

• **Query spam reduction (~97%)** — Drastically reduced the number of SQL queries the extension fires through the user's Drift database, eliminating massive "Drift: Sent" console spam when `logStatements` is enabled. Row counts from the existing change-detection UNION ALL query are now cached in `ServerContext` and included inline in the `/api/tables` response. The web UI uses these inline counts instead of firing N individual `/api/table/<name>/count` requests. Table name validation (`requireKnownTable`) and schema metadata now use cached data. For a 40-table database, a refresh cycle drops from ~160 queries to ~2.

• **Web UI: search input debounce** — Search and filter inputs in the Search tab are now debounced (150ms/200ms) to reduce DOM thrashing and prevent floods of abandoned HTTP requests on large tables.

### Fixed

• **Extension: Schema Search always searching, never connecting** — The Schema Search sidebar could hang on "Searching\u2026" indefinitely in two scenarios: (1) "Browse all tables" had no timeout protection, so a slow or unreachable server left the panel loading forever; (2) the schema cache `_fetchPromise` could hang permanently when the underlying HTTP transport failed to resolve or reject, blocking all subsequent cache consumers. Both paths now have bounded timeouts. The panel also shows a "Server not connected" banner with disabled controls when the server goes away, and a **Retry** button appears after timeout/error so the user can retry without retyping their query.

• **Web UI: special-character table names** — Tab lookup now uses iteration instead of `querySelector` attribute selectors, preventing `DOMException` crashes on table names containing quotes, brackets, or backslashes.

• **Web UI: stale tabs on live refresh** — When the database changes and a table is dropped or renamed, its tab is automatically closed instead of remaining as an orphan with an error state.

### Added

• **Extension: schema cache and performance options** — Shared in-memory schema cache with configurable TTL (`driftViewer.schemaCache.ttlMs`) so tree, Schema Search, ER diagram, and other features reuse one fetch. Optional last-known schema persist (`driftViewer.schemaCache.persistKey`) for stale-while-revalidate on startup. Pre-warm runs a background schema fetch when a server connects so the Database view is ready when opened. Lazy Database tree: `driftViewer.database.loadOnConnect` (default true) loads tree on connect; when false, tree loads on first time the Database view is shown. Lightweight mode: `driftViewer.lightweight` (default false) skips file badges, timeline auto-capture, and tree/badges refresh on generation change. Schema Search: configurable timeout (`driftViewer.schemaSearch.timeoutMs`) and cross-ref cap (`driftViewer.schemaSearch.crossRefMatchCap`); "Browse all tables" link returns table list only (one fetch, no cross-refs). Tree providers never throw from `getChildren` so the sidebar no longer shows "no data provider" errors.

• **Web UI: connection banner improvements** — When the server is unreachable, the banner now shows a live countdown ("Next retry in Xs"), the current retry interval (e.g. "Retrying every 5s"), attempt count, and "(max interval)" at 30s. A **Retry now** button triggers an immediate health check and resets backoff; a 1s ticker keeps the countdown accurate. Duplicate in-flight health checks are avoided so Retry does not race with the automatic heartbeat.

### Changed

• **Dart package: zero runtime dependencies** — Removed the `crypto` dependency. Optional Bearer auth now stores the token in memory and compares with a constant-time string comparison; behavior is unchanged. Apps that do not use auth (and those that do) no longer pull in any third-party packages, reducing install size and attack surface.

• **README: Impact on app size** — Documented that the package has no runtime dependencies and clarified tree-shaking and CDN-loaded assets.

---

## [2.5.0]

Web UI: leave confirmation, auto-analyze on Index/Size/Health tabs, refreshed toolbar and Export tab, SQL syntax highlighting, and version→changelog link. Extension: Refresh and Dashboard commands fixed, Search/Tables toolbar, quieter polling, and Schema Search timeout plus portable report fixes.

### Added

• **Web UI: navigate-away confirmation** — Closing the tab, refreshing the page, or navigating away (e.g. back button) now triggers the browser’s native “Leave site?” confirmation dialog so users can avoid losing context by accident.

• **Web UI: Index tab auto-analyze** — Opening the Index tab runs index suggestion analysis automatically (no manual Analyze click). Uses the shared `triggerToolButtonIfReady` helper; does not re-trigger if analysis is in progress or server is offline.

• **Web UI: Size tab auto-analyze** — Opening the Size tab runs database size analysis immediately (no manual Analyze click). The existing "Analyzing…" state and results UI apply; does not re-trigger if a run is already in progress or if the server is offline. Implemented via the same shared `triggerToolButtonIfReady` helper used for Index, Size, Perf, and Health tabs.

• **Web UI: Health tab auto-scan** — Opening the Health tab (toolbar or tab) automatically starts the data quality scan ("Scan for anomalies"). No need to click the button; the existing "Scanning…" state and results UI apply. Does not re-trigger if a scan is already in progress or if the server is offline. Matches the pattern used for Index, Size, and Perf tabs.

• **Web UI: toolbar and tab styling** — Tools toolbar buttons (Search, Snapshot, DB diff, Index, Size, Perf, Health, Import, Schema, Diagram, Export) use distinct styling: surface background, subtle shadow, clear hover and focus states. Tab bar is styled as real tabs: wider header area, rounded top corners, active tab visually connected to content via shared border; tab panels have a full border (except top) so content clearly belongs to the selected tab.

• **Web UI: Export as tab** — Export is now a toolbar button that opens a dedicated **Export** tab. The tab contains a short narrative explaining each option (Schema, Full dump, Database, Table CSV) and the same download links; sidebar shows a single line directing users to the Export tab. Export link IDs unchanged so existing JS (dump, database, CSV handlers) continues to work.

• **SQL syntax highlighting** — Schema tab, Run SQL results, migration preview, Schema Diff panel, Compare report, and portable Report schema section now show SQL with basic syntax highlighting (keywords, strings, numbers, comments, identifiers). Implemented via a shared highlighter module (`extension/src/sql-highlight.ts` and `assets/web/sql-highlight.js`) used everywhere SQL is displayed.

• **Web UI: version badge links to changelog** — The version number in the header (e.g. v2.2.0) is now a link that opens the extension’s changelog on the VS Code Marketplace in a new tab. Tooltip and aria-label indicate version and “View changelog”; hover uses a short opacity transition.

### Changed

• **Web UI: colorful favicon** — Browser tab favicon now uses the same purple-to-cyan gradient database cylinder as the extension store icon (replacing the previous single-tone gray-blue favicon).

• **Web UI: Snapshot compare results in a table** — Compare-to-now results are shown in a summary table (columns: Table | Then | Now | Status) for easier scanning; per-table detail for added/removed/changed rows appears below when present. Result container is a scrollable div with opacity transition; loading state shows "Comparing…" and `aria-busy` for accessibility. Clearing a snapshot or starting a new compare clears the previous result.

• **Web UI: Export diff report in new tab** — The DB diff panel "Export diff report" link now opens in a new browser tab (`target="_blank"` with `rel="noopener noreferrer"`) so the current view stays open.

• **Web UI: sidebar Export section** — Replaced the inline export toolbar in the sidebar with a brief note: "Export schema, dumps, and table data from the **Export** tab (toolbar button above)."

### Fixed

• **Extension: Refresh command not found after second launch (issue #7)** — Added `onCommand:driftViewer.refreshTree` to activation events so the extension activates when the user invokes Refresh (e.g. from the Database view toolbar), fixing the case where the command was not yet registered on later app launches or when the view was restored before activation completed.

• **Extension: Database toolbar and Dashboard command** — The Database view toolbar showed many icons in one row and was hard to scan. Primary actions (About, Open in Browser, Refresh, Health, Dashboard, Drift Tools menu) now stay in the main bar; Schema Docs, Import, Search, Bookmarks, Snippet Library, ER Diagram, Export, and Add Package move to the overflow (…) menu for discoverability. An activation event for `driftViewer.openDashboard` was added so the Dashboard toolbar button works when the extension activates on first use of that command (fixes "command 'driftViewer.openDashboard' not found").

• **Web UI: toolbar Search and Tables buttons** — The toolbar **Search** button now opens the Search tab and expands the sidebar search options (it had no `data-tool`, so it only toggled the sidebar). A **Tables** toolbar button was added so the Tables view can be opened from the toolbar like other tools; both use `data-tool` and the shared `openTool` flow.

• **Debug console log spam at rest** — Change detection now throttles the row-count (UNION ALL) query to at most once every 2 seconds when the extension or web UI long-polls. The long-poll loop still runs every 300ms for responsive UI, but the app’s Drift "Sent SELECT" logs drop from many per second to about one per 2 seconds when the Advisor is open. Turn polling off (web UI or extension) for zero queries when idle.

• **Extension: Schema Search never resolves** — The Schema Search sidebar could hang on "Searching…" when the initial empty query matched many tables/columns (hundreds of sequential FK API calls) or when the server was slow/unreachable. Search now has a 15s timeout and shows a clear error message on timeout or failure; cross-reference building is skipped when there are more than 80 matches so the panel resolves quickly. Loading state uses a pulse animation; errors are shown in the panel so the view always reaches a resolved state.

• **Portable report: schema section test and defensive handling** — The "include schema section when schema is provided" test failed because the SQL highlighter wraps keywords in `<span>`s, so the literal substring "CREATE TABLE" never appears. Test now asserts on content within the schema section slice and on CREATE/TABLE separately. Report HTML builder now guards against null/empty schema array, missing or empty table name (shows "(unnamed)"), non-string or empty sql, and falls back to escaped plain SQL when the highlighter returns empty so schema content is never dropped. Anomaly section uses the same null/empty guard for consistency.

---

## [2.3.0]

PII masking, richer charts/exports, query-builder AND/OR, and page-based pagination; plus improved Search tab, tabbed tools UI, cell popups/status/tooltips, and better About/Save Filter/share feedback.

### Added

• **Web UI: PII masking toggle (BUG-015)** — Header toggle "Mask data" lets you mask sensitive columns (email, phone, password, token, SSN, address, etc.) in the table view and in Table CSV exports. Column detection is name-based (e.g. columns containing "email", "phone", "password"); when masking is on, values are partially redacted (e.g. `j***@example.com`, `***-***-1234`). Copy and export respect the toggle. Server-side config and `.drift-mask.json` are not yet implemented.

• **Web UI: chart improvements (BUG-008)** — New chart types: Scatter, Area, and Stacked bar. Optional chart title. Export toolbar: PNG download, SVG download, and Copy image to clipboard. Charts use responsive sizing (viewBox + container width), X/Y axis labels (default to column names), and readable font size (--text-min-readable). ResizeObserver re-renders chart on container resize (throttled 150ms). Export buttons disable during async export; Copy shows brief "Copied!" feedback.

• **Web UI: query builder AND/OR connectors (BUG-006)** — The visual query builder only supported multiple WHERE conditions combined with AND. It now shows an AND/OR connector dropdown on the second and subsequent conditions so users can build expressions like `status = 'active' AND created_at > '2024-01-01'` or `role = 'admin' OR role = 'moderator'`. The live SQL preview and saved query-builder state include the chosen connectors.

### Changed

• **Web UI: Perf tab auto-update and button label** — Opening the Perf tab now triggers an automatic update of performance data (same pattern as Size and Health). The action button label is renamed from "Refresh" to "Update" with tooltip "Update performance data"; loading state still shows "Loading…".

• **Web UI: full page-based pagination (BUG-005)** — Table pagination is now page-based: First | Prev | Page [dropdown] of N | Next | Last, with a "Showing X–Y of Z rows" status. Rows per page is a clear selector; raw offset and Apply are under an "Advanced" toggle. First/Last and the page dropdown are disabled when not applicable; "(past end of results)" still appears when offset is beyond total.

• **Web UI: small interactive targets (BUG-010)** — Cell copy buttons, chart labels, and other small controls used 10px font and sub-24px tap targets, hurting usability on high-DPI and touch devices. All readable text now uses design token `--text-min-readable` (12px); interactive targets are at least 24×24px (pointer) and 44×44px on touch (WCAG 2.5.8). Copy button has a hover scale effect; breadcrumb and FK label use CSS classes instead of inline font-size.

### Fixed

• **Web UI: Diagram tab table cards empty** — Schema diagram now normalizes PRAGMA table_info results and supports both lowercase and uppercase column keys (name/type/pk and NAME/TYPE/PK), so all table cards show column names and types instead of appearing empty on some drivers.

• **Extension: (i) icon and About/Save Filter commands** — Clicking the info icon on the Database section header could show "command driftViewer.aboutSaropa not found" if the extension had not yet finished activating. About and Save Current Filter are now wired so they always work: activation events for both about commands ensure the extension activates when the command is invoked; about commands are registered first (before other feature modules) so the (i) icon works even if a later module fails; and the previously contributed-but-unregistered `driftViewer.saveFilter` command now has a handler that opens the Data Viewer and directs users to the in-panel Save Filter control.

• **Share modal and dialogs: newlines and ellipsis now render correctly** — The share prompt, "Copy to clipboard" alert, and "Sharing…" / "Extending…" button labels used double-escaped sequences (`\\n`, `\\u2026`) and showed literal `\n` or `\u2026` in the UI. All now use literal newlines and the Unicode ellipsis character so messages and loading states display as intended. CSV export and import were also corrected (row separators and newline-in-cell quoting use real newlines; CSV header split uses `\r?\n`).

• **Sidebar stayed "No Drift debug server connected" despite discovery finding a server** — Discovery reported "Found servers on ports: 8642" and ServerManager auto-selected the server, but the `driftViewer.serverConnected` context could fail to reach the welcome view (e.g. view evaluated before context was set), so the Database sidebar kept showing the disconnected message. Now we sync the context when discovery fires with servers (backup sync after ServerManager’s listener), run a one-time 1.5 s delayed sync after activation so the view catches up if the first poll already found a server, and log "Selected server :port" to the Saropa Drift Advisor output channel when a server is auto-selected for diagnostics.

• **Welcome-view buttons gave no user feedback** — The Database sidebar welcome content (Add Saropa Drift Advisor, Troubleshooting, Retry Connection, Forward Port, Select Server) ran commands with no visible response. Each button now shows an immediate information or error toast, appends a timestamped line to **Output → Saropa Drift Advisor**, and (for Retry, Forward Port, Add Package) reveals the output channel so users see that the action ran and can inspect discovery or adb output. Select Server reports success when connected or when the picker was dismissed.

### Added

• **Web UI: search behind toolbar icon; Search tab; row toggle; collapsible sections** — Search options (search input, scope, filter rows, Prev/Next) are hidden by default and shown via the toolbar **Search** (magnifying glass) button. A dedicated **Search** tab displays search results in a readable panel; when you switch to it, the current Tables content is copied and highlighted so match navigation (Prev/Next, "X of Y") applies there. When viewing a table, **Show: All rows | Matching** lets you toggle between displaying every row or only rows matching the row filter. In the "Both" (schema + table data) view, **Schema** and **Table data** sections are collapsible (click header to expand/collapse).

• **Web UI: tools toolbar and tabbed tools** — Tools (Snapshot, DB diff, Index, Size, Perf, Health, Import, Schema, Diagram) moved from the sidebar into a horizontal toolbar above the main content. Clicking a tool opens it in a dedicated tab, giving full width to each tool. Tables and Run SQL remain fixed tabs; tool tabs can be closed (×). Tab switch uses a short opacity transition; Schema and Diagram load on first open.

• **Web UI: table cell truncation and full-value popup** — Long cell text in the data table is truncated with an ellipsis (max width 18rem). Double-click any cell to open a popup showing the full value, with a Copy button and Close/backdrop/Escape to dismiss. Popup uses a short fade transition; column name appears in the popup title.

• **Web UI: table status bar, scrollbars always on, SQL result pagination** — Data tables show a status bar below the grid: "Showing X–Y of Z rows • N columns" (and "(past end of results)" when offset is beyond total). Table and SQL result scroll containers use `overflow: scroll` so scrollbars are always visible. SQL runner table results are paginated client-side (100 rows per page) with Prev/Next and the same status bar. Column widths use natural content width with horizontal scroll instead of wrapping (e.g. episodes, URLs stay on one line).

• **Web UI: tooltips on all buttons and expanders** — Every button and collapsible header in the web view has a [title] attribute for native hover tooltips. Covers sidebar tools (snapshot, compare, index, size, perf, anomaly, import, schema, diagram), SQL runner and saved queries, pagination, column chooser and context menu, query builder, migration copy, compare panel close, breadcrumb Back/Clear path, and export links.

### Changed

• **Extension: Explain Query Plan context menu only when SQL at cursor** — The right-click "Explain Query Plan" entry now appears only in Dart files when the cursor or selection contains extractable SQL (e.g. SELECT/WITH string, triple-quoted SQL, or customSelect/customStatement). Reduces noise in files without SQL; command remains available from the Command Palette. Context updates are debounced on selection changes (50 ms) to avoid unnecessary work.

• **Web UI: Run SQL Explain and Saved queries** — Explain shows a single plain-English message (e.g. full table scan on table name, or index lookup) instead of raw EXPLAIN output. "Bookmarks" renamed to "Saved queries" throughout the Run SQL section (label, dropdown, prompts, alerts, export filename).

• **Web UI: sidebar collapsible polish** — Removed the blue vertical accent line to the left of collapsible section headers (drift-enhanced.css). Expand/collapse arrow is now right-aligned and dimmed (opacity 0.4) until the header is hovered (0.9), with a 0.15s opacity transition (style.scss / style.css).

• **Web UI: panel padding** — All main panels (sidebar, main content, feature cards, table list links) now use a shared design token `--panel-padding-x: 1.5rem` so content is no longer squashed against the left and right edges. Sidebar and main content use the token for horizontal padding; feature cards and table list links have slightly increased internal padding for consistency.

• **Extension: 300-line limit compliance** — Ten TypeScript source files that exceeded the 300-line limit were modularized so all extension source files are now within the limit. New modules: `api-client-http.ts` (HTTP endpoint helpers), `server-discovery-constants.ts` / `server-discovery-scan.ts` / `server-discovery-notify.ts`, `debug-vm-connect.ts` (VM connect + health retry), `rollback-order.ts` / `rollback-dart.ts` / `rollback-helpers.ts` / `rollback-utils.ts`, `vm-service-api.ts` (VM extension method wrappers), `troubleshooting-styles.ts`. Test files split with shared helpers (`api-contract-helpers`, `compliance-checker-test-helpers`, `rollback-generator-test-helpers`, `schema-provider-test-helpers`) and additional test modules for API contract sessions, compliance rules/general, rollback ordering/Dart. No behavior changes; all 1810 tests pass.

• **Extension: entry point under 300 lines** — `extension.ts` exceeded the limit; connection bootstrap (client, discovery, watcher, server manager, auth token listener, adb-forward on debug start) moved to `extension-bootstrap.ts`. Entry point now delegates to bootstrap then sets up providers, diagnostics, editing, and commands. Behavior unchanged; all tests pass.

• **Web UI: merged connection status** — Header previously showed separate "Polling: ON/OFF" and "● Live" pills. A single connection-status control now shows **Live** | **Paused** | **Offline**. Tap toggles Live ↔ Paused when connected; when disconnected the control shows Offline and is disabled (Reconnecting… during retry). Tooltips and `aria-live="polite"` clarify state; opacity transition (0.2s) on state change.

---

## [2.1.1]

Web UI gets a clearer layout and sidebar; the extension activates when you open the Drift views; drift_sqlite_async users get clearer guidance; and turning polling off no longer spams the console.

### Added

• **Web UI redesign** — Two-column layout (sticky sidebar + main content), semantic header with branding and actions, export toolbar as buttons, feature sections as cards with expand/collapse state. Sidebar sections: Search, Export, Tools, Tables. Design tokens (type scale, radius, tap targets), refreshed light/dark palette, loading spinner for "Loading tables…", copy-toast animation. Table list shows active table; feature cards show expanded state. **Phase 4.1:** Icons via Google Material Symbols Outlined (CDN) on feature headers, Theme/Share, and export links; expand/collapse arrow is CSS-only so icons are preserved. Styling and script loaded from CDN (not embedded in APK). See `docs/UI_REDESIGN_PLAN.md`.

### Changed

• **Web viewer performance** — Table list no longer re-renders on every table count fetch; only the updated table's link text is changed, reducing DOM updates and preserving active state.

### Fixed

• **VS Code: "command driftViewer.refreshTree not found" [GitHub issue #7](https://github.com/saropa/saropa_drift_advisor/issues/7)** — Extension now activates when the Drift Advisor sidebar views are opened (`onView:driftViewer.databaseExplorer`, `onView:driftViewer.toolbox`), so the Refresh command is registered even if no Dart file was opened first.

• **drift_sqlite_async compatibility (issue #7)** — README and error messages now document using `DriftDebugServer.start(query: ...)` with an explicit query callback when the web UI stays on "Loading tables…" or when using drift_sqlite_async; ensure the database is open before starting the server. Error hint extracted to a single constant; unit tests assert error response contains the callback-API guidance.

• **HTTP schema metadata and diagram when polling off** — `GET /api/schema/metadata` and `GET /api/schema/diagram` now return empty `tables` (and empty `foreignKeys` for diagram) with `changeDetection: false` when change detection is disabled, so no `PRAGMA table_info` or `SELECT COUNT(*)` queries run and the app's Drift log is no longer spammed. Matches the existing VM service behavior (extension already received empty schema when polling was off).

---

## [2.1.0]

Connection health, session expiry countdown, clickable FK breadcrumbs, and OS dark-mode sync make the debug experience more resilient and navigable. Search now scrolls to matches and lets you step through them with Next/Previous.

### Added

• **Web UI assets on CDN (BUG-001)** — CSS and JavaScript extracted from inline Dart string into `assets/web/style.css` and `assets/web/app.js`; served via jsDelivr CDN with version pinning. `html_content.dart` reduced from ~4,200 lines to a ~227-line HTML shell. Consuming app binaries no longer embed ~143KB of static UI; CDN URLs use `ServerConstants.packageVersion` (requires matching git tag for CDN to serve).

• **Extension test coverage (BUG-019)** — New unit tests for command handlers (dashboard open/save/load/delete, polling toggle), webview HTML (dashboard, health: structure, XSS escaping, empty state), API client (getChangeDetection/setChangeDetection and error paths), and Tools tree provider (categories, connection state, Add Package visibility). Extension disposable count assertion updated to 173.

• **Example app: multi-table schema and full feature demo (BUG-021)** — example uses 5 tables (users, posts, comments, tags, post_tags) with foreign keys for ER diagram and FK navigation demos; `writeQuery` configured for Import; opt-in auth token (`_kExampleAuthToken`); startup via `startDriftViewer()` with callback-style alternative in comments; seed data with dates, nulls (draft posts), and varied types

• **CSV column mapping in Import (Web UI)** — when importing CSV, the UI shows a mapping step: each CSV header can be mapped to a table column or skipped. Headers no longer need to match table column names exactly. Optional `columnMapping` in POST /api/import (object: CSV header → table column); duplicate table columns resolve with last mapping wins (BUG-007 item 1)

• **Server-detection notification actions** — when a Drift debug server is detected, the notification now offers **Open URL** (opens the server in the default browser), **Copy URL** (copies the URL to the clipboard), and **Dismiss**

• **REST API reference** (`doc/API.md`) — formal specification for all ~30 endpoints with request/response JSON schemas, HTTP status codes, query parameter documentation, authentication details, and error format reference; contract test assertions in Dart integration tests and TypeScript type tests catch API drift between server and extension

• **Connection health banner** — fixed-position "Connection lost — reconnecting..." banner with dismiss button when the server becomes unreachable; slides down with a smooth CSS transition; auto-recovers via `/api/health` heartbeat with exponential backoff (1 s → 30 s max)

• **Offline control disabling** — 17 server-dependent buttons are visually dimmed (`opacity: 0.4`, `pointer-events: none`) while disconnected; re-enabled automatically on reconnection

• **Reconnecting pulse animation** — live indicator pulses during reconnection to convey ongoing retry activity

• **Keep-alive health check** — periodic lightweight `/api/health` ping (every 15 s) when polling is toggled OFF, so disconnection is still detected

• **Server restart detection** — generation going backwards triggers a console log and full data refresh

• **Session expiry countdown** — info bar displays remaining time, switching to yellow under 10 minutes

• **Extend session** button in the info bar resets the timer by another hour (POST `/api/session/{id}/extend`)

• **Expiry warning banner** — yellow banner appears below the info bar when under 10 minutes remain

• **Expired session banner** — red banner with clear message when accessing an expired or unknown session URL (replaces silent failure)

• **Share dialog expiry notice** — prompt now mentions "Session will expire in 1 hour"

• **Configurable session duration** — new optional `sessionDuration` parameter on `DriftDebugServer.start()` (defaults to 1 hour)

• **Clickable FK breadcrumb steps** — each table in the navigation trail is now a link; clicking jumps directly to that table instead of one-step-back only

• **FK breadcrumb persistence** — navigation history saved to localStorage and restored on page refresh, with validation against the current table list

• **"Clear path" breadcrumb button** — discards the entire FK navigation trail

• **OS dark-mode sync** — first visit respects `prefers-color-scheme`; VS Code webview theme auto-detected via body classes and `data-vscode-theme-kind`; real-time updates when OS or VS Code theme changes (MutationObserver for webview, matchMedia listener for OS)

• **Per-IP rate limiting** — optional `maxRequestsPerSecond` parameter on `DriftDebugServer.start()` enables fixed-window counter rate limiting; returns HTTP 429 with `Retry-After` header when exceeded; `/api/generation` (long-poll) and `/api/health` endpoints are exempt (BUG-023)

• **Search result navigation** — auto-scrolls to the first match when typing, shows "X of Y" match counter, and provides Prev/Next buttons to step through results

• **Keyboard shortcuts** — Enter/Shift+Enter for next/prev match in search input, Ctrl+G/Shift+Ctrl+G globally, Ctrl+F to focus search, Escape to clear

• **Active match highlight** — distinct orange highlight with outline distinguishes the current match from passive highlights (supports both light and dark themes)

• **Collapsed section expansion** — navigating to a match inside a collapsed section automatically expands it

• **Saved and shareable analysis results (BUG-014)** — Index suggestions, database size analytics, query performance, and data health (anomaly) sections now offer **Save result** (stores in localStorage with timestamp), **Export as JSON** (download for sharing), **History** dropdown (past runs), and **Compare** (before/after modal with two runs side-by-side). Results persist across refresh and can be compared over time.

### Tests

• **Handler unit tests** — dedicated test files for `IndexAnalyzer`, `AnomalyDetector`, `PerformanceHandler`, `SchemaHandler`, `CompareHandler`, `SnapshotHandler`, `TableHandler`, and `GenerationHandler`; covers edge cases, error paths, boundary conditions, and business logic not exercised by the existing integration tests (BUG-017)

• **Stress and performance tests (BUG-018)** — `test/stress_performance_test.dart`: change detection with 100+ tables (single UNION ALL query), query timing ring buffer under concurrent insertions and eviction, snapshot capture with many tables/rows (30×200 and 50×100), anomaly detection completion within timeout on wide tables (25 tables × 20 columns)

### Fixed

• **Accessibility: color-only severity indicators** — index suggestion priorities (`HIGH`/`MEDIUM`/`LOW`) and performance query durations now show `[!!]`/`[!]`/`[✓]` icon prefixes alongside color, matching the anomaly detection pattern (WCAG 2.1 1.4.1)

• **Stale search match guard** — navigating to a match inside a collapsed section now rebuilds the match list if the expand causes a re-render, preventing scroll-to-nothing

• **Version constant CI guard** — added `version_sync_test.dart` that verifies `ServerConstants.packageVersion` matches `pubspec.yaml`; prevents stale version reporting in health endpoint and web UI (BUG-022)

• **Accessibility: schema diagram** — SVG diagram now has `role="group"` with `aria-label` summary, ARIA-labelled keyboard-focusable table boxes (`tabindex`, `role="button"`, arrow-key grid navigation, Enter/Space activation), `<title>` tooltips on FK relationship paths, and a screen-reader-only text alternative listing all tables and foreign keys (WCAG 2.1 1.1.1, 2.1.1, 4.1.2) (BUG-012)

• **Stale data table highlights** — clearing the search term now properly removes highlight markup from data table cells (previously they persisted until re-render)

---

## [2.0.0]

Internal modularization: split the 793-line server_context.dart god object into three focused modules for maintainability.

### Changed

• **Extracted `ServerUtils`** — 16 static utility methods (normalizeRows, getTableNames, sqlLiteral, etc.) moved from `ServerContext` to a dedicated `abstract final class ServerUtils` in `server_utils.dart`.

• **Extracted `server_typedefs.dart`** — 5 callback typedefs (`DriftDebugQuery`, `DriftDebugOnLog`, etc.) consolidated into a single source of truth, eliminating duplication between `server_context.dart` and the web stub.

• **Slimmed `ServerContext`** — reduced from 793 to 423 lines; now contains only instance state and instance methods (auth, CORS, logging, timing, change detection).

---

## [1.8.0]

Silence the log spam: batched change detection, runtime polling toggle, and UI buttons in both the web viewer and VSCode extension.

### Added

• **Polling toggle button (web UI)** — "Polling: ON/OFF" button in the browser header toggles change detection on/off via `POST /api/change-detection`. The live indicator updates to show "Paused" when polling is disabled.

• **Polling toggle button (VSCode)** — "Toggle Polling" item in the Drift Tools sidebar tree (`driftViewer.togglePolling` command) toggles change detection via VM service or HTTP fallback. Shows an info message confirming the new state.

• **Change detection HTTP endpoint** — `GET/POST /api/change-detection` reads and sets the polling toggle state at runtime.

• **Change detection VM service extensions** — `ext.saropa.drift.getChangeDetection` and `ext.saropa.drift.setChangeDetection` allow the VSCode extension to toggle polling without HTTP.

• **Static Dart API** — `DriftDebugServer.changeDetectionEnabled` getter and `DriftDebugServer.setChangeDetection(bool)` for programmatic control from app code.

### Changed

• **Web UI branding** — Browser tab and page heading now show "Saropa Drift Adviser" instead of "Drift tables" / "Drift DB".

• **Batched row-count queries** — `checkDataChange()` now uses a single `UNION ALL` query instead of N individual `SELECT COUNT(*)` queries, reducing per-check queries from N+1 to 2 (first call) or 1 (cached table names).

• **Table name caching** — sqlite_master table names are cached across change detection cycles and invalidated only on schema-altering operations (e.g., import).

• **VM service handler gating** — `getSchemaMetadata` and `getGeneration` VM service handlers return lightweight cached/empty responses when change detection is disabled, eliminating `PRAGMA table_info` and `SELECT COUNT(*)` spam from the debug console.

### Fixed

• **Web UI version drift** — `packageVersion` in `server_constants.dart` was hardcoded at `1.5.0` while pubspec was at `1.6.1`, causing the health endpoint to report the wrong version and the CDN enhanced CSS URL to 404. The publish scripts now auto-sync `server_constants.dart` alongside `add-package.ts` whenever the Dart version changes.

• **SQL identifier escaping** — `_buildDataSignature()` now escapes double-quote characters in table names for the SQL identifier context, preventing malformed SQL if a table name contains a literal `"`.

• **Polling toggle button UX** — The web UI polling toggle now disables itself and shows "Polling..." during the request, preventing double-clicks and providing clear visual feedback.

## [1.7.0]

Smart package lifecycle management: the extension now detects whether the Dart package is already in your project and hides redundant setup prompts.

### Added

• **Open in Browser button** — quickly open the Drift debug server UI from the Database sidebar:

- Globe icon in the header toolbar (visible when connected)
- Clickable "Connected" status item opens the server URL
- "Open in Browser" button in the welcome view (visible when not connected)

• **Build safeguards (defense-in-depth)** — Seven independent layers now prevent shipping an extension that silently fails to activate:

- `npm install` auto-compiles TypeScript via `postprepare` hook — fresh clones and `git clean` are self-healing
- Pre-commit hook verifies `out/extension.js` exists alongside the existing type check
- F5 launch config (`launch.json`) with `preLaunchTask` ensures compilation before every debug run
- Background `watch` task available for continuous recompilation during development
- Publish pipeline verifies `out/extension.js` on disk after `tsc` exits
- Publish pipeline inspects VSIX archive contents before allowing publish
- Post-install verification confirms the extension directory exists on disk after `code --install-extension`

• **Package upgrade detection** — On activation the extension checks pub.dev for newer versions of `saropa_drift_advisor`. If the workspace pubspec.yaml has an older constraint, an upgrade notification offers a one-click update (rewrites the constraint and runs `pub get`). Checks are throttled to once per hour; network errors are silently ignored.

• **Conditional "Add Package" button** — The "Add Saropa Drift Advisor" button, welcome view link, and tools tree item are now hidden when the package is already present in pubspec.yaml. A new context key `driftViewer.packageInstalled` drives all three locations.

• **Pubspec file watcher** — A `PackageStatusMonitor` watches `pubspec.yaml` for changes and keeps the installed-state UI in sync automatically.

• **Version display in Database header** — The Database section header shows the extension version (e.g. "v1.6.1") at all times, whether connected or disconnected.

• **About Saropa icon** — An `$(info)` icon in the Database section title bar opens `ABOUT_SAROPA.md` in VS Code's markdown preview, giving users quick access to the Saropa product overview. Also available via Command Palette.

### Fixed

• **Server banner invisible on Android emulator** — The startup banner used `stdout.writeln()`, which writes to the native process stdout — invisible on Android because Flutter only intercepts `print()`/Zone output. Switched to `print()` (with `// ignore: avoid_print`) so the banner appears as clean `I/flutter` lines, matching Isar Inspector's banner style.

---

## [1.6.1]

The extension couldn't connect to running servers and now has an About button for easy access to release notes.

### Added

• **About Saropa Drift Advisor** — "About Saropa Drift Advisor vX.Y.Z" item at the top of the Drift Tools sidebar. Opens the bundled CHANGELOG.md in VS Code's markdown preview; falls back to the GitHub changelog if the local file is missing. Also available via Command Palette (`Saropa Drift Advisor: About`).
• **Existing debug session detection** — When the extension activates after a debug session is already running (late activation), it now detects the active Dart/Flutter session and immediately attempts VM Service connection. Previously only `onDidStartDebugSession` was used, which never fires for sessions that started before the extension loaded.

### Fixed

• **Server discovery rejected valid servers** — The secondary validation in `ServerDiscovery._validateServer` checked `Array.isArray(data)` on the `/api/schema/metadata` response, but the server returns `{ tables: [...] }` (an object wrapping the array). Health checks passed but every server was then silently rejected, preventing the extension from ever connecting. Now accepts both raw array and wrapped `{ tables: [...] }` formats.
• **VM Service connection too impatient for emulator debugging** — The original `tryConnectVm` made only 2 quick attempts with 500ms delay, but on Android emulators the Drift debug server typically needs 5–15 seconds after VM Service is available before its extension methods are registered. Rewrote as a two-phase approach: Phase 1 connects the WebSocket (2 quick attempts — the VM port is auto-forwarded by Flutter); Phase 2 patiently polls health with increasing delays (500ms → 1s → 2s → 3s → 5s, ~30s total) while the app initializes. Includes a concurrency guard to prevent concurrent connection attempts.
• **Core debug commands silently failed to register** — `registerDebugCommands` (which wires VM Service lifecycle, debug session listeners, and server connectivity) was the last call in `registerAllCommands`. If any preceding feature module threw during registration, the entire function aborted and the core connection logic never ran — silently. Discovery kept scanning ports, but no VM Service handlers were registered, producing the symptom of 17+ minutes of only port-scan output with zero VM connection attempts. Fixed by calling `registerDebugCommands` first and wrapping each of the 27 feature modules in individual try/catch blocks so one failing module cannot take down the rest.

---

## [1.6.0]

VM Service connection now works — Android emulator connects without port forwarding. Web UI gets a visual polish layer loaded from CDN, and the published package is leaner.

### Added

• **Enhanced CSS loaded from jsDelivr CDN** — The web UI dynamically loads a `drift-enhanced.css` stylesheet from jsDelivr, version-pinned to the exact release tag. Adds polished button hover/active states, focus rings for accessibility, zebra-striped tables with hover highlighting, sticky table headers, a pulsing live indicator, accented collapsible section headers, card-style expanded sections, smooth theme transitions, custom scrollbars, and chart/toast polish. Falls back gracefully to inline styles when offline or CDN-blocked (3-second timeout).

• **`.pubignore`** — Excludes `web/`, `extension/`, `.github/`, and Node tooling from the pub.dev package, reducing download size for consumers.

### Fixed

• **VM Service connection never worked** — The extension called `getIsolates` (not a valid Dart VM Service method) instead of `getVM` when resolving isolates, causing every VM Service connection to silently fail and fall back to HTTP. This made Android emulator connections fragile since HTTP requires `adb forward`. With the fix, the extension connects via VM Service (like Isar Inspector), which Flutter auto-forwards — no manual port forwarding needed.

• **Isolate selection** — When multiple isolates exist (e.g. main + vm-service), the extension now prefers non-system isolates to reliably find the one where `DriftDebugServer` registers its extensions.

## [1.5.1]

Web UI now shows the server version and has a proper favicon.

### Added

• **Version badge in web UI header** — The page header now displays the Drift Advisor version (e.g. "v1.5.0") fetched from the `/api/health` endpoint, so users can verify which server version is running. The health endpoint now includes a `version` field.

• **Favicon** — Added an inline SVG database-cylinder favicon via `<link rel="icon">` data URI in the HTML head, and a lightweight 204 No Content route for `/favicon.ico` requests to silence browser console 404s.

• **Troubleshooting webview panel** — The sidebar "Troubleshooting" button now opens a rich webview with a quick checklist, connection architecture diagram, collapsible FAQ sections for common issues, and action buttons (Retry Connection, Forward Port, Select Server, Open Output Log, Open Settings).

### Changed

• **Renamed "Add package to project" to "Add Saropa Drift Advisor"** — The sidebar button, command palette entry, and walkthrough step now use the clearer name.

• **Sidebar welcome panel formatting** — Replaced `**` markdown bold (which rendered as literal asterisks in VS Code panels) with CAPS headers (GET STARTED, RESOURCES). Moved troubleshooting tips out of inline text into the new webview panel.

• **Walkthrough dependency type corrected** — Changed "dev dependencies" to "dependencies" since the package must be a regular dependency (users import it in `lib/` code).

• **Package version constraint** — Updated the "Add Saropa Drift Advisor" button to install `^0.3.0`.

### Fixed

• **"Add Saropa Drift Advisor" silent failure on missing dependencies section** — When a pubspec.yaml had no `dependencies:` section, the error was thrown but not caught, causing the command to fail silently with no user notification. Now properly caught and shown as an error message.

• **"Already present" feedback** — When the package was already in pubspec.yaml, the success message now explicitly says so instead of only showing "Run your app with the Drift debug server to connect."

• **Query builder LIKE operators caused JS syntax error** — The Dart `'''` string escape `"\"` was consumed by Dart as an escaped double-quote, producing `""` in the served JavaScript. This broke `LIKE`, `NOT LIKE`, and `LIKE_START` operator conditions in the query builder with `Uncaught SyntaxError: missing ) after argument list`. Fixed by using `"\\"` so Dart emits `\"` (a valid JS string escape).

### Internal

• **Publish script syncs PACKAGE_VERSION** — `write_version(DART, ...)` now automatically updates the `PACKAGE_VERSION` constant in `add-package.ts` so the "Add Saropa Drift Advisor" button always installs the correct version after a release.

---

For older versions (1.4.3 and prior), see [CHANGELOG_ARCHIVE.md](./CHANGELOG_ARCHIVE.md).
