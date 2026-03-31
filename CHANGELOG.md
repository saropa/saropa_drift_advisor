# Changelog

<!-- MAINTENANCE NOTES -- IMPORTANT --

  Format follows Keep a Changelog; versions use SemVer. Omit dates in `## [x.y.z]` headers (pub.dev shows publish dates). Project links and archive location are in the intro below.

  Each release (and [Unreleased]) opens with one plain-language line for humans—user-facing only, casual wording—then end it with:
  `[log](https://github.com/saropa/saropa_drift_advisor/blob/vX.Y.Z/CHANGELOG.md)` substituting X.Y.Z.

  **pub.dev** — [pub.dev / packages / saropa_drift_advisor](https://pub.dev/packages/saropa_drift_advisor)

  **VS Code marketplace** - [marketplace.visualstudio.com / items ? itemName=Saropa.drift-viewer](https://marketplace.visualstudio.com/items?itemName=Saropa.drift-viewer)

  **Open VSX Registry** - [open-vsx.org / extension / saropa / drift-viewer](https://open-vsx.org/extension/saropa/drift-viewer)

-->

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

• **Phantom slow-query diagnostics from analytics introspection (Bug 044)** — The anomaly detector, index-suggestion scanner, size-analytics handler, and merged `/api/issues` endpoint all ran their introspection queries (PRAGMA, COUNT, SELECT DISTINCT, etc.) through the instrumented query callback, recording them in the performance timing buffer. The VS Code extension's performance provider then reported these as slow user queries (e.g. `SELECT COUNT(*) AS c FROM (SELECT DISTINCT * FROM "user_p...")`) — a false positive. Analytics endpoints now use the raw (uninstrumented) query callback so internal queries never appear in performance data.

• **Web UI assets blocked by browser MIME mismatch** — When the debug server's file-read failed (e.g. package root resolved to pub cache without `assets/`), `_sendWebAsset` sent HTTP 200 with default `text/plain` content type instead of 404. Browsers with `X-Content-Type-Options: nosniff` blocked the CSS/JS, and because the response was 200, the `onerror` CDN fallback never fired — leaving the web viewer completely broken. Fixed: file content is now read before committing any response headers; any failure falls through to a clean 404. Additionally, `_resolvePackageRootPath` now validates that the resolved root actually contains web assets before accepting it — if `Isolate.resolvePackageUri` points to the pub cache (where `assets/` may be absent), the ancestor walk runs instead.

---

## [2.12.0]

Fixes several broken commands and stuck webviews, removes duplicate Quick Actions from the Database tree, and upgrades the example app to a live database dashboard. [log](https://github.com/saropa/saropa_drift_advisor/blob/v2.12.0/CHANGELOG.md)

### Changed

• **Removed duplicate Quick Actions from Database tree** — The "Quick Actions" collapsible group in the Database Explorer duplicated every command already in the "Drift Tools" panel. Removed the redundant group so tool commands appear only in Drift Tools.

### Fixed

• **"Browse all tables" link in Schema Search did nothing** — Periodic server-discovery updates fired `connectionState` messages to the webview, which called `doSearch()` with an empty query, overwriting browse results with the idle placeholder. Added a `browseActive` guard so browse-all results persist until the user types, changes filters, disconnects, or encounters an error.

• **11 commands declared but missing from Command Palette** — `disableDiagnosticRule`, `clearRuntimeAlerts`, `copySuggestedName`, `runIndexSql`, `seedWithProfiles`, `showIndexSuggestions`, `createAllIndexes`, `generateAnomalyFixes`, `sampleTable`, `toggleInvariant`, and `viewInvariantViolations` were registered in code but absent from `contributes.commands`, preventing VS Code from auto-generating activation events for them.

• **Exhaustive command-wiring tests** — Two new tests verify that every command declared in `package.json` is registered at activation (forward check) and that every registered command is declared (reverse check). Any future wiring breakage now fails the test suite before publication.

• **Schema Search stuck on "Waiting for the extension" forever** — The early handshake script and the main script both called `acquireVsCodeApi()`, which can only be called once per webview. The second call threw silently, preventing the message listener from registering. Connection state messages were dropped and Schema Search never updated.

• **Query Cost Analysis command failed to register** — The explain-panel module used value imports for type-only re-exports, causing a runtime `require()` failure that silently prevented the queryCost command from registering. A warning toast was the only symptom.

• **Web UI CSS/JS blocked by MIME type mismatch** — The Dart server's fallback package-root resolution required both the barrel file and an asset file to coexist in each candidate directory. When running from the example app, the walk never found the package root, so assets were served as 404 with `text/plain` — blocked by browsers enforcing `X-Content-Type-Options: nosniff`.

### Changed

• **Example app shows a database dashboard instead of a static notice** — The example's landing screen now displays a compact status header with server state and URL, a table overview with row counts for every table, and a recent-posts list showing title, author, draft/published status, and comment count. Error and disabled states still fall back to the original centered layout.

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

For older versions (2.5.0 and prior), see [CHANGELOG_ARCHIVE.md](./CHANGELOG_ARCHIVE.md).
