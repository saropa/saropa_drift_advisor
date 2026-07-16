# Connection Reliability: The Ongoing War

## Status: ONGOING / UNRESOLVED

This document catalogs the full history of connection failures between the three components of Saropa Drift Advisor — the **Dart debug server** (running inside the user's app), the **VS Code extension**, and the **browser web UI** — and the relentless stream of patches, hacks, and workarounds that have been applied across **25+ releases** spanning the project's entire lifetime.

This is not a single bug. It is a systemic, cross-cutting reliability problem that has consumed more engineering effort than any other area of the project.

---

## Active Regression (March 2026) — RESOLVED

Commit `086152f` (`fix(lints): address server and test lint findings`, March 19, made with Cursor) silently broke the server startup banner by replacing `print()` with `ctx.log()`. The `ctx.log()` path routes through the user's `onLog` callback which calls `developer.log()` — **invisible on Android** because Flutter only intercepts `print()`/Zone output for `I/flutter` terminal lines.

This exact bug was fixed in v1.4.1 (commit `1168968`, "Print server banner to stdout instead of dart:developer.log") and again in v1.7.0 (switched from `stdout.writeln()` to `print()` because `stdout.writeln()` is also invisible on Android). The original fix comment explicitly stated:

> "Single print() call so the banner appears as clean I/flutter lines in the debug console (like Isar Inspector). stdout.writeln() does NOT appear on Android because Flutter only intercepts print/Zone output. ctx.log() (dart:developer.log) works but attaches expandable stack traces to every line. print() is the correct choice here."

The Cursor lint fix deleted this comment and replaced `print()` with `ctx.log()` because `avoid_print` flagged it. The replacement comment says "Emit one compact startup banner line as a structured log message" — losing all the hard-won context about WHY `print()` was necessary.

**Impact:** The server likely IS starting but the startup banner is invisible on Android. Users see zero output and believe the server never started. Combined with the need for `adb forward` on emulators, this creates a perfect storm: no banner → user thinks server is down → opens browser to `127.0.0.1:8642` on host → connection refused (because no port forwarding) → user concludes everything is broken.

**Fix applied:** Restored `print()` with `// ignore: avoid_print, avoid_print_in_release` directives and an 8-line anchored comment explaining why `print()` is the only correct choice, citing the three regressions and pointing to this document. Also added visible `print()` for server startup errors (catch block), which were previously also invisible via `developer.log()` only. A guard test in `drift_debug_server_test.dart` captures the banner via a print-intercepting Zone so future lint sweeps that mangle the banner fail loudly.

---

## The Problem in Plain English

The Drift Advisor architecture requires three things to talk to each other:

1. **Dart debug server** — an HTTP server started inside the user's Flutter/Dart app, listening on a port (default 8642).
2. **VS Code extension** — discovers the server by scanning ports, connects via HTTP or VM Service WebSocket, populates the sidebar tree.
3. **Browser web UI** — loaded from the server, polls for changes via long-poll HTTP.

Every connection between these components has broken, repeatedly, in different ways, on different platforms, at different times. The failure modes are:

- **Silent failure** — no error, no feedback, no indication anything is wrong.
- **Permanent hang** — a fetch or WebSocket that never resolves, blocking all subsequent operations.
- **Race condition** — two subsystems racing to connect, one winning and the other silently dying.
- **Platform-specific** — works on macOS, breaks on Windows; works on desktop, breaks on Android emulator; works in VS Code, breaks in Cursor/forks.
- **Timing-dependent** — works if the extension activates first, breaks if the debug session starts first; works on fast machines, breaks on slow ones.

---

## Full Chronological History (newest first)

### [Unreleased]

| Fix | Component |
|-----|-----------|
| **VS Code: "server lost" warning now fires at most once per discovery session** — On a flaky link (Wi-Fi debugging on a physical device) the debug server flaps: it drops for a scan or two and reconnects, repeatedly. Discovery removed the server after `MISS_THRESHOLD` (2) missed polls (~20s) and immediately showed a `showWarningMessage` "…no longer responding" toast, plus a "detected" `showInformationMessage` on each recovery — so the notifications stacked up indefinitely. Two-part fix originally in `server-discovery-core.ts`, later extracted into the `ServerLostDebouncer` class in `server-discovery-lost-debounce.ts` (commit `9ede770` file-splitting refactor): (1) a per-port grace window (`LOST_NOTIFY_GRACE_MS`, 35s = one `SEARCH_INTERVAL` + margin) defers the lost toast, so a blip that recovers within the window cancels the pending warning and suppresses the matching "detected" toast; (2) a session-level latch (`_notifiedThisSession`) caps the warning to once per discovery session — after it fires, all further found/lost toasts are suppressed until a fresh `start()` (new debug session or Retry Discovery) re-arms it. The lost toast bypasses the per-port `NOTIFY_THROTTLE_MS` (passes 0) because the latch is the real guard and the shared throttle map would otherwise let a recent "detected" toast swallow the single warning. Server deletion / connection-state timing is unchanged, so the sidebar, status bar, and `ConnectionStateMachine` still reflect the drop in real time. Covered by 3 new `server-discovery.test.ts` cases (flap-suppression, genuine-outage-warns-once, at-most-once-per-session-with-retry-re-arm). | Extension |
| **Dart server: startup banner now prints the `adb forward` command** — The banner already showed `http://127.0.0.1:<port>`, but on an Android emulator or physical device that URL lives in the device's network namespace and is unreachable from a host browser/viewer until the port is forwarded. With no on-screen guidance, "server started" (banner visible after the v1.4.1/v1.7.0/086152f print() fixes) plus "viewer offline" looked contradictory — the exact failure this doc's "Active Regression" section warned about ("Combined with the need for `adb forward` on emulators, this creates a perfect storm"). The banner now prints `adb forward tcp:<port> tcp:<port>` with the ACTUAL bound port directly below the URL. Also fixed a latent bug where the banner printed the *requested* port (`:0` for ephemeral binds) instead of `server.port`. A new guard test (`drift_debug_server_test.dart`) captures the banner via a print-intercepting Zone and pins both the hint line and the port-accurate command, so the next `avoid_print`-style lint sweep that mangles the banner fails loudly instead of silently shipping. | Dart server |
| **~~VS Code: "Browse all tables" link in Schema Search did nothing~~** — ~~Periodic server-discovery updates fired `connectionState` messages to the webview, which called `doSearch()` when the query box was empty, replacing browse results with the idle placeholder.~~ **STALE → MOOT (2026-07-16): the Schema Search sidebar panel was removed entirely in v2.17.1. The replacement (Global Search command) does not have this bug.** | Extension |
| **VS Code: phased activation — "command not found" can no longer kill the extension** — The entire `activate()` function was a ~270-line monolith with zero error isolation. A single throw anywhere caused VS Code to dispose ALL registered commands, while tree views (UI elements) survived — making the sidebar look normal while every button gave "command not found". This was silently breaking the extension for users. Activation is now split into 11 isolated phases (bootstrap → about-commands → schema-cache → providers → intelligence → diagnostics → editing → status-bars → commands → event-wiring), each wrapped in a `runPhase()` utility. On failure: error toast shown, stack trace logged to Output channel, later phases continue. The outer `activate()` never re-throws. 8 resilience tests verify that any phase can crash without killing commands from surviving phases. | Extension |
| **VS Code: activation milestone logging** — Every phase logs its start and completion (or failure) to the Output channel with timestamps. The activation summary line shows "N/M phases succeeded". This makes it trivial to diagnose what broke when a user reports "commands not found" — just check Output → Saropa Drift Advisor for the phase that failed. | Extension |
| **VS Code: Output channel created before bootstrap** — The connection Output channel is now created in `activate()` (Phase 0) and passed into `bootstrapExtension()` as a parameter, rather than being created inside bootstrap. This means phase logging is available from the very first line of activation, and if bootstrap itself throws, the error is still logged. | Extension |
| **VS Code: `context.exports` crash — "Cannot add property exports, object is not extensible"** — The Log Capture API was wired by force-casting `context` and setting `.exports` on it. VS Code's `ExtensionContext` is a sealed object — this threw at runtime, crashing outside any `runPhase()` wrapper and killing all subsequent activation. Fixed: `activate()` now returns the API object (the standard VS Code pattern), which becomes `extension.exports` automatically. | Extension |
| **VS Code: Timeline API proposal crashes providers phase in dev mode** — `vscode.workspace.registerTimelineProvider('file', ...)` is a proposed API that the Extension Development Host blocks unless `--enable-proposed-api` is passed. Since this call was inline in `setupProviders()`, it crashed the entire providers phase — which meant NO commands registered, NO tree refreshed, NO schema loaded. Fixed: the call is now wrapped in a try/catch so timeline failure is non-fatal. Added `--enable-proposed-api saropa.drift-viewer` to the dev launch configs so timeline works during development. | Extension |
| **VS Code: Schema Search stuck on "Waiting for the extension" forever** — `acquireVsCodeApi()` can only be called once per webview. The early handshake script (inline in the HTML) acquired it, then the main script (SCHEMA_SEARCH_SCRIPT) called it again — which threw. The main script's message listener was never registered, so `connectionState` messages were silently dropped. The hard fallback text stayed visible indefinitely. Fixed: the early script stores the API in `window.__vscodeApi` and the main script reuses it with `window.__vscodeApi \|\| acquireVsCodeApi()`. | Extension |
| **VS Code: diagnostic logging for silent catch blocks** — `DriftTreeProvider._refreshInner()`, `SchemaCache._fetch()`, and `SchemaCache._revalidate()` all had bare `catch {}` blocks that swallowed errors silently. Added `LogSink` interface; all catch blocks now log the error message and timestamp to the Output channel. | Extension |
| **VS Code: F5 from repo root** — Added `.vscode/launch.json` and `.vscode/tasks.json` compile task at the repo root so F5 launches the Extension Development Host without needing to open `extension/` as a separate workspace. Previously the launch config only existed at `extension/.vscode/launch.json`. | Extension |
| **VS Code: buttons do nothing when disconnected** — The Database tree returned an empty array when no server was connected, forcing VS Code to show a `viewsWelcome` overlay with markdown `command:` links. These links silently fail in some VS Code forks/versions — no output, no toast, no error. The tree now always returns real `TreeItem` rows with `.command` properties (Retry Discovery, Diagnose, Troubleshooting, Connection log, Select Server, etc.) so every action is a clickable tree item that works reliably in all hosts. | Extension |
| **Discovery output log is much more verbose** — Every scan cycle now logs its start, result (ports found or empty scan count), and when the next scan is scheduled. Previously only state transitions were logged, leaving long silent gaps during the 3s→30s search/backoff cycle. | Extension |
| **VS Code: exhaustive command-wiring tests** — Two new tests read every command from `contributes.commands` in package.json and assert bidirectional consistency with the mock command registry after `activate()`. Forward: every declared command must be registered (catches silent feature-module throws that produce "command not found"). Reverse: every registered `driftViewer.*` must be declared (catches missing `onCommand` activation events). Also declared 11 commands that were registered in code but missing from `contributes.commands`: `disableDiagnosticRule`, `clearRuntimeAlerts`, `copySuggestedName`, `runIndexSql`, `seedWithProfiles`, `showIndexSuggestions`, `createAllIndexes`, `generateAnomalyFixes`, `sampleTable`, `toggleInvariant`, `viewInvariantViolations`. | Extension |
| **VS Code: removed duplicate Quick Actions from Database tree** — The "Quick Actions" collapsible group in the Database Explorer duplicated every command already shown in the separate "Drift Tools" panel (Schema Diff, Health Score, Seed Data, ER Diagram, SQL Notebook, etc.). Removed `QuickActionsGroupItem`, `ActionCategoryItem`, and `getQuickActionCategories()` from the tree provider. Tool commands now appear exclusively in the Drift Tools panel — one canonical location instead of two. | Extension |
| **VS Code: Query Cost Analysis command failed to register** — `explain-panel.ts` and `explain-html.ts` used `import { IndexSuggestion }` (value import) for a type-only re-export from `api-client.ts` (`export type * from './api-types'`). At runtime the CommonJS `require()` could not resolve the erased symbol, crashing the entire import chain for the queryCost command module. The activation warning toast "failed to register command modules: queryCost..." was the only symptom. Fixed: changed to `import type { IndexSuggestion }` (and `import type { IExplainNode }` in `explain-html.ts`), which is erased at compile time. | Extension |
| **Dart server: web UI CSS/JS blocked by browser MIME mismatch** — The ancestor-walk fallback in `_discoverPackageRootPathFromAncestorWalk()` required both `lib/saropa_drift_advisor.dart` AND `assets/web/style.css` to exist in the same candidate directory. When the example app ran from `example/` via path dependency, the walk from `Directory.current` never reached the package root, so the server served 404 with `Content-Type: text/plain` for every asset request. Browsers with `X-Content-Type-Options: nosniff` blocked the response. Fixed: relaxed the sentinel to only require the barrel file `lib/saropa_drift_advisor.dart`, which is always present in the package root. | Dart server |
| **Dart server: _sendWebAsset sent 200+text/plain on file-read failure** — When `readAsString()` threw inside `_sendWebAsset`, the catch block swallowed the error but the response was already committed as HTTP 200 with default `text/plain` content type. Browsers blocked the response due to MIME mismatch, and the `onerror` CDN fallback never fired (browsers ignore onerror on 200 responses). Fixed: file content is read into a local variable before committing any response headers; any failure produces a clean 404. Also, `_resolvePackageRootPath` now probes for `assets/web/style.css` at the `Isolate.resolvePackageUri` candidate before accepting it — if assets are absent (pub cache), the ancestor walk runs instead. | Dart server |
| **Dart server + Browser: resilient asset loading (3 layers)** — Even with the MIME fix above, a single-CDN onerror with no visible error state left the web UI brittle. Added: (1) in-memory asset cache populated once during package root resolution — eliminates per-request disk I/O and survives transient file-system errors on subsequent requests; (2) multi-CDN fallback chain — CSS/JS onerror handlers try version-pinned jsDelivr then `@main` (covers publish-to-tag window), with a `sda-asset-failed` custom event when all sources are exhausted; (3) loading overlay with inline styles (no CSS dependency) — visible until `app.js` hides it, shows a clear error message if JS never loads from any source. | Dart server / Browser |
| **Dart server: 404 MIME type killed CDN fallback for pub.dev consumers** — When the package root could not be resolved (typical for separate projects using pub.dev), `_sendWebAsset` returned 404 with `Content-Type: text/plain`. Dart's `HttpServer` adds `X-Content-Type-Options: nosniff` by default, so both Firefox and Chrome MIME-blocked the response. A MIME-blocked response suppresses the `<link>`/`<script>` `onerror` callback, silently killing the multi-CDN fallback chain — the web UI loaded blank with no CSS or JS and no recovery path. Fixed: the 404 path now uses the expected content type (`text/css` or `application/javascript`) so browsers do not MIME-block it; the 404 status alone triggers `onerror` reliably. | Dart server |
| **Dart server + Browser: Firefox onerror never fires on 404 with correct MIME** — Even after the MIME fix above, Firefox still did not fire `onerror` on `<link>` and `<script>` elements that received HTTP 404 with the *correct* MIME type (`text/css`, `application/javascript`). The entire multi-CDN fallback chain (`_sda_fb`) was dead code in Firefox — the web UI loaded blank with no CSS, no JS, and no recovery. The `onerror` mechanism was replaced entirely: CSS and JS are now inlined directly into the HTML response via `<style>` / `<script>` tags when the package root is resolved on disk (zero extra requests, works offline). When local files are unavailable, the HTML references jsDelivr CDN URLs directly — CSS via `<link onerror>` (CDN→CDN only, no local URL), JS via a fetch-based IIFE loader that creates `<script>` elements dynamically. The loading overlay now shows version, per-asset source (local/CDN), and load status instead of a blank "Loading…" message. | Dart server / Browser |

### [2.11.0]

| Fix | Component |
|-----|-----------|
| **VS Code: fetch hangs forever on Windows (AbortController/undici bug)** — On some Windows Node.js builds, `AbortController.abort()` does not reliably cancel an in-flight `fetch()` (known undici bug). `fetchWithTimeout` now wraps the native fetch in a `Promise.race` safety layer that fires shortly after the abort timer, guaranteeing the promise always settles. A second safety timeout in `DriftTreeProvider.refresh()` ensures `_refreshing` is always cleared even if both the abort and per-call safety somehow hang. Together these prevent the permanent "Could not load schema (REST API)" deadlock where the initial refresh hung forever, `_refreshing` stayed `true`, and the coalesced discovery-triggered refresh never ran. | Extension |
| **VS Code: Database tree stuck on "Could not load schema" after discovery** — The tree `refresh()` silently dropped concurrent calls via a `_refreshing` guard, so when `loadOnConnect` raced with discovery-triggered refresh, the second call was lost. Added coalescing: calls during an in-flight refresh are queued and run once the current refresh completes, ensuring the tree always loads when a server is found. | Extension |

### [2.10.2]

| Fix | Component |
|-----|-----------|
| **Flutter iOS/Android: web UI asset requests and `Isolate.resolvePackageUri`** — Serving `/assets/web/style.css` and `app.js` called `Isolate.resolvePackageUri`, which is unsupported on Flutter mobile embedders (`UnsupportedError` / `resolvePackageUriSync`). That path is now treated as expected: no `DriftDebugServer` error log or `onError` callback for that case; the handler still falls back to ancestor discovery and 404 + CDN as before. | Dart server |
| **VS Code: "Open URL" on server-detected toast** — Choosing **Open URL** when discovery finds a Drift debug server now also selects that host:port as the active server in the extension (same endpoint as the browser). Previously the toast only opened the browser; with multiple servers or a dismissed QuickPick the sidebar could stay on the wrong port or none. | Extension |
| **/api/mutations long-poll and VM logging** — When no mutation arrived before the long-poll deadline, the server treated the normal timeout as a loggable event (`developer.log` with error/stack). That could flood the VM service and stall the app with multiple clients. Idle timeouts no longer emit those logs. | Dart server / VM |
| **VS Code: Database sidebar when REST schema fails** — If the UI shows a connection but the Database tree cannot load schema from the REST API, the explorer now lists a warning row and the same troubleshooting commands as clickable tree items. Some editors do not run `viewsWelcome` markdown `command:` links, which made those controls appear to do nothing. | Extension |

### [2.10.0]

| Fix | Component |
|-----|-----------|
| **Schema Search panel (disconnected)** — Removed the native welcome overlay that could leave the webview area blank; added a static startup line, full troubleshooting actions aligned with the Database section, resource links, and copy that distinguishes "no saved schema in this workspace" vs "saved schema available." Connection state includes `persistedSchemaAvailable` from workspace cache. | Extension |
| **Offline Database tree** — New setting `driftViewer.database.allowOfflineSchema` (default on): when the server is unreachable, the tree can repopulate from last-known persisted schema; status shows "Offline — cached schema." | Extension |
| **Schema Search when "connected" but schema missing** — If HTTP/VM reports connected before REST table metadata loads (or it fails), Schema Search keeps the yellow help banner visible (Retry, Diagnose, Scan Dart sources, etc.) until the Database tree has loaded a table list. Search/browse stay off until then. | Extension |
| **No embedded web UI mirror in Dart** — Removed `web_assets_embedded.dart` (duplicate `style.css`/`app.js` as string constants). When the package root cannot be read, `/assets/web/*` returns 404 and the HTML shell's `onerror` handlers load version-pinned jsDelivr copies instead. | Dart server / Browser |

### [2.9.2]

| Fix | Component |
|-----|-----------|
| **Blank Database section with a false "connected" state** — `driftViewer.serverConnected` could be true (discovery or VM) while `health` / `schemaMetadata` failed, so the tree had no roots and the disconnected welcome stayed hidden. The extension now sets `driftViewer.databaseTreeEmpty` from the tree provider and shows a dedicated viewsWelcome with refresh, diagnose, and help links until the tree loads. | Extension |
| **Schema Search panel stuck empty** — The host now forces delivery of connection state after a short timeout when the embedded script never posts `ready`, the script wraps init in try/finally so `ready` always fires, and the webview registers a dispose handler for the timer. The wildcard `*` activation event was removed to avoid invalid-manifest behavior in some hosts. | Extension |

### [2.9.1]

| Fix | Component |
|-----|-----------|
| **No-blank sidebar startup fallback** — Activation now includes startup/view/workspace hooks so connection commands register before users click them, and disconnected welcome text no longer depends on pre-set context keys. Schema Search also has a fallback welcome block with direct actions (Refresh UI, Retry, Diagnose, Troubleshooting, web help), preventing empty panes during activation races. | Extension |

### [2.9.0]

| Fix | Component |
|-----|-----------|
| **Schema Search disconnected banner never appeared** — The webview defaulted to `connected = true` and hid the banner, relying on the extension to send `connected: false`. If the message was lost or delayed the banner stayed hidden indefinitely. The webview now defaults to disconnected (banner visible, controls disabled) and the extension confirms connection via the ready handshake within milliseconds. | Extension |
| **Less SQLite contention from the extension** — Port discovery validates servers with `GET /api/health` only, avoiding a full `/api/schema/metadata` pass on every candidate port. Index suggestions, anomaly scan, and size analytics prefetched sequentially instead of all at once. | Extension / Dart server |
| **Discovery + Bearer auth** — Port scans pass the same `Authorization: Bearer ...` header as the API client, so health probes succeed when the debug server requires a token. | Extension |
| **Faster disconnect detection** — Reduced `CONNECTED_INTERVAL` from 15s to 10s and `MISS_THRESHOLD` from 3 to 2, cutting the time to detect a lost server from ~45s to ~20s. | Extension |
| **Quieter discovery log** — Suppressed the per-cycle "Scanning N ports..." line and the "Port XXXX: fetch failed" noise (Node undici wraps ECONNREFUSED in a generic `TypeError('fetch failed')` whose message never matched the old filter). | Extension |

### [2.8.2]

| Fix | Component |
|-----|-----------|
| **Published package missing web UI assets** — `.pubignore` contained an unanchored `web/` pattern that excluded `assets/web/` (CSS/JS served by the debug server) from the published package. Consumer apps fell back to CDN, producing MIME-mismatch console errors. | Dart server |
| **Web UI assets 404 on Flutter emulators** — On Android/iOS emulators the host filesystem is unreachable, so file-based package-root resolution always failed and both `app.js` and `style.css` returned HTTP 404. The server now embeds both assets as compiled-in Dart string constants and serves them from memory. | Dart server |
| **Schema Search panel stuck on loading indicator** — `resolveWebviewView` posted `connectionState` before the webview script had wired `addEventListener('message', ...)`, so the message was silently dropped and the panel never left its loading state. Fixed with a ready-handshake. | Extension |
| **Troubleshooting: Schema Search diagnostics** — "Diagnose Connection" output now includes `schemaSearch.viewResolved`, `webviewReady`, and `presentationConnected` with actionable warnings. | Extension |

### [2.8.1]

| Fix | Component |
|-----|-----------|
| **Web UI assets under `flutter test`** — Local `/assets/web/style.css` and `app.js` no longer return HTTP 500 when the test VM cannot resolve `package:` URIs; the server falls back to discovering the package root from the working directory. | Dart server |
| **VS Code: connection UI, Schema Search resilience** — Sidebar "connected" state now follows HTTP discovery and/or VM Service (`isDriftUiConnected`), with `refreshDriftConnectionUi` updating context, Drift Tools, and Schema Search together; VM transport changes and HTTP verify paths adopt the client endpoint when no server was selected. Schema Search gains connection label/hint, action links, auto-retry on transient failures, defensive error handling, and optional `connection.logEveryUiRefresh`. New commands: Show Connection Log, Refresh Connection UI, Diagnose Connection. | Extension |

### [2.7.1]

| Fix | Component |
|-----|-----------|
| **Web UI: local CSS/JS + CDN fallback** — The viewer HTML now loads from the debug server (correct `Content-Type`, works offline). If those requests fail, `onerror` falls back to version-pinned jsDelivr URLs. Fixes browsers blocking CDN responses with `text/plain` + `X-Content-Type-Options: nosniff`. | Browser UI / Dart server |

### [2.7.0]

| Fix | Component |
|-----|-----------|
| **Extension: command error handling** — Every sidebar and welcome-view button now catches errors, logs timestamped diagnostics, and shows a user-facing toast. Previously many commands swallowed failures silently. | Extension |
| **Extension: server discovery error logging** — Port scan failures during discovery are now logged to the Output channel instead of being silently discarded. | Extension |
| **Extension: troubleshooting panel message routing** — Webview button actions now catch and surface rejected command promises. | Extension |
| **Extension: Schema Search always searching, never connecting** — The Schema Search sidebar could hang on "Searching..." indefinitely: (1) "Browse all tables" had no timeout protection; (2) the schema cache `_fetchPromise` could hang permanently when the HTTP transport failed to resolve or reject. Both paths now have bounded timeouts. | Extension |
| **Schema cache and performance options** — Shared in-memory schema cache with configurable TTL so tree, Schema Search, ER diagram, and other features reuse one fetch. Pre-warm runs a background schema fetch when a server connects. Tree providers never throw from `getChildren` so the sidebar no longer shows "no data provider" errors. | Extension |
| **Web UI: connection banner improvements** — Banner now shows live countdown, retry interval, attempt count, and "(max interval)" at 30s. A Retry now button triggers an immediate health check and resets backoff. | Browser UI |

### [2.5.0]

| Fix | Component |
|-----|-----------|
| **Extension: Refresh command not found after second launch (issue #7)** — Added `onCommand:driftViewer.refreshTree` to activation events so the extension activates when the user invokes Refresh. | Extension |
| **Debug console log spam at rest** — Change detection now throttles the row-count query to at most once every 2 seconds. | Dart server / Extension / Browser |
| **Extension: Schema Search never resolves** — Could hang on "Searching..." when the initial empty query matched many tables/columns (hundreds of sequential FK API calls) or server was slow/unreachable. Search now has a 15s timeout and shows a clear error message. | Extension |

### [2.3.0]

| Fix | Component |
|-----|-----------|
| **Sidebar stayed "No Drift debug server connected" despite discovery finding a server** — Discovery reported "Found servers on ports: 8642" and ServerManager auto-selected the server, but the `driftViewer.serverConnected` context could fail to reach the welcome view. Now syncs the context when discovery fires, runs a delayed sync after activation, and logs to the Output channel. | Extension |
| **Welcome-view buttons gave no user feedback** — Each button now shows an immediate toast, appends to the Output channel, and reveals the channel so users see that the action ran. | Extension |
| **Web UI: merged connection status** — Separate "Polling: ON/OFF" and "Live" pills replaced by a single control: Live / Paused / Offline. | Browser UI |

### [2.1.1]

| Fix | Component |
|-----|-----------|
| **"command driftViewer.refreshTree not found" [GitHub issue #7]** — Extension now activates when the Drift Advisor sidebar views are opened. | Extension |
| **HTTP schema metadata and diagram when polling off** — `GET /api/schema/metadata` and `GET /api/schema/diagram` now return empty `tables` when change detection is disabled, so no PRAGMA queries run. | Dart server / Extension |

### [2.1.0]

| Fix | Component |
|-----|-----------|
| **Server-detection notification actions** — Detection toast now offers Open URL, Copy URL, and Dismiss. | Extension |
| **Connection health banner** — "Connection lost — reconnecting..." banner with heartbeat, exponential backoff (1s→30s), auto-recovery. | Browser UI |
| **Offline control disabling** — 17 server-dependent buttons dimmed while disconnected; re-enabled on reconnection. | Browser UI |
| **Reconnecting pulse animation** — Live indicator pulses during reconnection. | Browser UI |
| **Keep-alive health check** — Periodic `/api/health` ping (15s) when polling is OFF. | Browser UI / Dart server |
| **Server restart detection** — Generation going backwards triggers full data refresh. | Browser UI |

### [1.8.0]

| Fix | Component |
|-----|-----------|
| **Polling toggle button (web UI + VS Code)** — Toggle change detection on/off. | Browser UI / Extension |
| **Change detection HTTP endpoint and VM service extensions** — `GET/POST /api/change-detection` and `ext.saropa.drift.getChangeDetection` / `setChangeDetection`. | Dart server / Extension |
| **VM service handler gating** — VM handlers return empty responses when change detection is disabled, eliminating PRAGMA spam. | Dart server |
| **Web UI version drift** — `packageVersion` was hardcoded at `1.5.0` while pubspec was at `1.6.1`, causing the health endpoint to report the wrong version and the CDN URL to 404. | Dart server |

### [1.7.0]

| Fix | Component |
|-----|-----------|
| **Open in Browser button** — Open the debug server UI from the Database sidebar. | Extension |
| **Server banner invisible on Android emulator** — Used `stdout.writeln()` (invisible on Android) instead of `print()`. | Dart server |

### [1.6.1]

| Fix | Component |
|-----|-----------|
| **Existing debug session detection** — Extension now detects sessions that started before it loaded (late activation). | Extension |
| **Server discovery rejected valid servers** — `_validateServer` checked `Array.isArray(data)` but the server returns `{ tables: [...] }`. Health checks passed but every server was then silently rejected, preventing the extension from ever connecting. | Extension |
| **VM Service connection too impatient for emulator debugging** — Original `tryConnectVm` made only 2 quick attempts with 500ms delay, but on Android emulators the server needs 5-15 seconds. Rewrote as a two-phase approach: Phase 1 connects WebSocket (2 quick attempts); Phase 2 patiently polls health with increasing delays (~30s total). | Extension |
| **Core debug commands silently failed to register** — `registerDebugCommands` was the last call in `registerAllCommands`. If any preceding module threw, the entire function aborted and core connection logic never ran — silently. Discovery kept scanning but no VM handlers were registered, producing 17+ minutes of only port-scan output with zero VM connection attempts. Fixed by calling `registerDebugCommands` first and wrapping each module in try/catch. | Extension |

### [1.6.0]

| Fix | Component |
|-----|-----------|
| **VM Service connection never worked** — The extension called `getIsolates` (not a valid Dart VM Service method) instead of `getVM` when resolving isolates, causing every VM Service connection to silently fail and fall back to HTTP. This made Android emulator connections fragile since HTTP requires `adb forward`. | Extension |
| **Isolate selection** — When multiple isolates exist, the extension now prefers non-system isolates to find the one where `DriftDebugServer` registers its extensions. | Extension |

### [1.5.1]

| Fix | Component |
|-----|-----------|
| **Version badge in web UI header** — Version from `/api/health` so users can verify which server is running. | Browser UI / Dart server |
| **Troubleshooting webview panel** — Rich webview with checklist, connection architecture diagram, collapsible FAQ, and action buttons. | Extension |

### [1.4.3]

| Fix | Component |
|-----|-----------|
| **Drift Tools sidebar view** — Server-dependent items show "(not connected)" when offline. | Extension |
| **Dashboard on-connect notification** — First server connection each session offers to open Dashboard. | Extension |

### [1.4.2]

| Fix | Component |
|-----|-----------|
| **VM Service output listener was non-functional** — Used `onOutput()` which does not exist on the VS Code `DebugAdapterTracker` interface. Replaced with `onDidSendMessage()`. This was the primary cause of "drift is never detected" when debugging. | Extension |
| **"Select Server" button appeared to do nothing** — Bare toast was easy to miss. Now shows actionable warning with Retry and View Log buttons. | Extension |
| **VM Service URI regex only matched IPv4 addresses** — Hostnames and IPv6 addresses were silently rejected. | Extension |
| **Request timeouts and retry** — All HTTP API calls now use `fetchWithTimeout` (8s) and `fetchWithRetry`. Prevents fetch calls from hanging indefinitely on Windows. | Extension |
| **Discovery backoff auto-recovery** — After 3 polls in backoff state (~90s), discovery resets to searching. Users no longer wait indefinitely. | Extension |
| **Generation watcher exponential backoff** — Poll errors now use exponential backoff (1s→30s cap) instead of fixed 1s retries. | Extension |
| **VM Service connect retry** — VM connection attempts retry once (500ms delay). Isolate resolution also retries once (300ms). | Extension |
| **Connection diagnostics in Output channel** — Discovery and generation watcher write timestamped diagnostic logs. | Extension |

### [1.4.1]

| Fix | Component |
|-----|-----------|
| **ADB auto-forward on debug start** — Waits 5 seconds then automatically attempts `adb forward` if no server is found. | Extension |
| **Welcome-view buttons gave no user feedback** — "Retry Connection" now shows a notification. "Select Server" and "Forward Port" errors are caught. Previously all three buttons appeared to do nothing when clicked. | Extension |
| **Discovery event not fired on state transitions** — `onDidChangeServers` now also fires on state machine transitions (e.g. searching→backoff), allowing listeners like auto-adb-forward to fire. | Extension |

### [1.3.0]

| Fix | Component |
|-----|-----------|
| **Android emulator connection** — Auto `adb forward tcp:8642 tcp:8642` when no server found during Flutter debug. | Extension |
| **Forward Port (Android Emulator) command** — Manual command when auto-forward fails. | Extension |
| **Disconnected welcome view (emulator)** — Troubleshooting includes Android emulator guidance. | Extension |

### [1.2.0]

| Fix | Component |
|-----|-----------|
| **VM Service as debug channel (Plan 68)** — Extension connects via the Dart VM Service WebSocket instead of HTTP port discovery. No adb forward or port scan needed on emulators. | Dart server / Extension |
| **VM Service nice-to-haves** — Status bar shows "VM Service"; hot restart clears state; panel shows fallback when only VM reachable. | Extension |
| **Connection robustness (Plan 68)** — VM URI validated before connect; Output channel logs attempts and failures; hot restart auto-retriggers connect. | Extension |

### [1.1.0]

| Fix | Component |
|-----|-----------|
| **Disconnected Welcome View** — When no server connected, Database panel shows a welcome screen instead of bare "Disconnected" message. Includes troubleshooting checklist, action buttons, resource links. | Extension |

### [0.2.0]

| Fix | Component |
|-----|-----------|
| **Live refresh** — Server runs change check every 2s; clients long-poll and refetch. | Dart server / Browser UI |
| **`GET /api/health`** — Health endpoint for readiness probes. | Dart server |
| **Secure dev tunnel** — Auth token / Basic auth for port forwarding scenarios. | Dart server / Browser UI |
| **`loopbackOnly`** — Bind to `127.0.0.1` only. | Dart server |
| **`corsOrigin`** — Configure CORS. | Dart server |
| **`DriftDebugServer.stop()`** — Graceful shutdown. | Dart server |

---

## Recurring Patterns (Why This Keeps Breaking)

### 1. Silent failure is the default

The single most consistent theme. Nearly every connection bug in this list was discovered because something **appeared to do nothing**. No error, no toast, no log line. The user clicks a button and nothing happens. The extension starts and the sidebar is blank. The server is running but the extension says "disconnected."

Fixes have been applied one at a time, reactively, to individual failure paths. But the underlying pattern — that the system has many failure points and most of them fail silently — remains.

### 2. Three independent connection paths that must all work

- **HTTP discovery** (port scanning + health check)
- **VM Service WebSocket** (via debug adapter tracker)
- **Browser long-poll** (generation endpoint)

Each path has its own timeout, retry, backoff, and error handling logic. They were built at different times with different assumptions. When one path works and another doesn't, the UI shows a contradictory state ("connected" but no data, or "disconnected" but the server is running).

### 3. Platform fragmentation

| Platform | Unique connection issues |
|----------|------------------------|
| **Windows** | `AbortController.abort()` doesn't cancel fetch (undici bug); fetch hangs indefinitely |
| **Android emulator** | Host filesystem unreachable (asset 404s); port not forwarded (need `adb forward`); `stdout.writeln()` invisible; `Isolate.resolvePackageUri` unsupported |
| **iOS simulator** | `Isolate.resolvePackageUri` unsupported |
| **VS Code forks (Cursor, etc.)** | `viewsWelcome` markdown `command:` links silently fail; webview message timing differs |
| **Flutter test environment** | `package:` URI resolution fails |

### 4. Race conditions at startup

The extension, the debug session, the server, and the webview panels all start at different times. Nearly every version has a fix for some variation of "X started before Y was ready":

- Debug session started before extension activated → VM URI missed
- Extension activated before commands registered → "command not found" *(now guarded by exhaustive wiring tests)*
- Discovery found server before tree provider was ready → blank sidebar
- Webview script loaded before message handler wired → connection state dropped
- Schema Search init before ready handshake → stuck on loading
- Early handshake script acquired VS Code API → main script's second `acquireVsCodeApi()` threw → message listener never registered → Schema Search permanently stuck

### 5. Layered workarounds

The connection system now has:
- `fetchWithTimeout` (8s abort)
- `Promise.race` safety layer on top of that (for Windows undici bug)
- `_refreshing` guard with safety timeout on top of that
- Refresh coalescing on top of that
- Discovery backoff with auto-recovery after 90s
- Two-phase VM connect with 30s total patience
- Ready-handshake protocol for webviews
- `driftViewer.databaseTreeEmpty` context flag
- `driftViewer.serverConnected` context flag with delayed sync backup
- Offline schema cache fallback
- CSS/JS inlined directly into the HTML response when the package root is resolved (eliminates separate asset requests and the broken `onerror` fallback chain)
- Fetch-based CDN loader when local files unavailable (replaced the `_sda_fb` onerror chain that Firefox ignored)
- Loading overlay with version, per-asset source/status diagnostics (replaced the uninformative "Loading…" message)
- `/assets/web/*` routes retained for backward compat (VS Code extension, direct access) but no longer required by the HTML viewer
- 4-strategy package root resolution: `Isolate.resolvePackageUri` with asset probe, `package_config.json` parsing, ancestor walk from cwd, ancestor walk from executable path

Each layer was added to fix a specific failure. Together they form a complex, fragile stack where it is hard to reason about what happens when two or more things go wrong simultaneously.

---

## What Has NOT Been Fixed

Despite all the patches above, these issues remain or recur:

1. ~~**No end-to-end connection health contract**~~ — **RESOLVED (Phase 1, 2026-06-10).** `ConnectionStateMachine` in `connection-state.ts` is now the single authority. `driftViewer.serverConnected` and `driftViewer.databaseTreeEmpty` are derived outputs of one phase computed in one place; the documented contradictions ("connected but no data", "disconnected but server running") are structurally unrepresentable. Unit tests drive the machine through all 16 signal combinations and the full lifecycle. See Finish Report (2026-06-10) — Phase 1.

2. ~~**No connection integration tests**~~ — **RESOLVED (Phase 2, 2026-06-10).** A full end-to-end lifecycle test (`connection-lifecycle.test.ts`) now exercises: extension activates → discovery scans → server found → tree loads → button clicked → data appears. Three negative cases break one link each and assert the end state is NOT reached. This is the regression net the project never had. The existing integration, activation-resilience, command-wiring, import-integrity, and `acquireVsCodeApi` contract tests also remain in place. See Finish Report (2026-06-10) — Phase 2.

3. **No retry budget or circuit breaker** — Each subsystem retries independently. When the server is genuinely down, the extension hammers it with health probes, schema fetches, discovery scans, and VM connection attempts simultaneously. There is no global circuit breaker that says "the server is down, stop everything and show a clear message."

4. **Webview `postMessage` race on init** — Dashboard and Watch panels set `webview.html` and immediately call `postMessage` in the same constructor. The webview document loads asynchronously, so the message can arrive before the inline script registers its `message` listener — silently dropped, panel stuck on stale/empty state. Time Travel already avoids this with a `ready` handshake; Dashboard and Watch do not. (The original description referenced Schema Search and a broad "fire-and-forget" problem across all panels. Investigation (2026-07-16) found that Schema Search was removed in v2.17.1 and most panels use full HTML replacement — no messages to lose. Only Dashboard and Watch have the init race.)

5. **Discovery is polling-based** — The extension scans ports every 30-60 seconds. There is no push notification from the server to the extension. This means connection is always delayed and there is always a window where the server is running but the extension doesn't know about it.

6. ~~**Schema Search "Browse all tables" results replaced on connection-state update**~~ — **RESOLVED (2026-07-16): the Schema Search sidebar panel was removed entirely in v2.17.1.** The replacement (Global Search command) does not receive `connectionState` messages and its `doSearch()` is a no-op when the query is empty — the bug is structurally absent.

---

## Implementation Plan

The five entries in **What Has NOT Been Fixed** are the work. The history above shows why piecemeal patching failed: each fix addressed one failure path while the systemic causes (no single state authority, no lifecycle test, no global breaker, inconsistent webview protocol, polling-only discovery) stayed in place. This plan attacks the causes in dependency order. The state contract (Phase 1) is foundational — the circuit breaker and the lifecycle test both need one authoritative "are we connected" before they can be written. Each phase ends at a verifiable gate; do not start phase N+1 until phase N's gate is green.

> **Constraint that overrides ordering:** this is a reliability plan. No phase may remove an existing workaround until its replacement is proven by a test. The layered stack in **Recurring Patterns §5** stays in place until a phase explicitly subsumes a layer AND a test pins the new behavior. "Delete the old hack" is never its own step.

### Phase 1 — Single connection-state authority (fixes gap 1) — COMPLETE

- `ConnectionStateMachine` in `connection-state.ts` owns the connected/working truth, derived from four signals (`httpServerSelected`, `vmServiceActive`, `schemaLoaded`, `offlineSchema`). `driftViewer.serverConnected` and `driftViewer.databaseTreeEmpty` are derived outputs. Wired into production via the existing refresh funnel in `extension-activation-final.ts`.
- **Gate: PASSED.** Unit tests (`connection-state.test.ts`) enumerate all 16 signal combinations, drive the full lifecycle, and assert single-writer context agreement. All existing surfaces compile against the derived outputs. See Finish Report (2026-06-10) — Phase 1.

### Phase 2 — End-to-end lifecycle test (fixes gap 2) — COMPLETE

- `connection-lifecycle.test.ts` wires the real chain (`DriftApiClient` + `ServerDiscovery` + `ServerManager` + `DriftTreeProvider` + `ConnectionStateMachine`) against a fetch-stubbed HTTP server. Happy path walks all six links; three negative cases break one link each.
- **Gate: PASSED.** The lifecycle test passes against the current build and fails if any single link is broken. See Finish Report (2026-06-10) — Phase 2.

### Phase 3 — Global circuit breaker + retry budget (fixes gap 3)
- Add one breaker keyed on the Phase 1 state: when the server is genuinely down, health probes, schema fetches, discovery scans, and VM connect attempts stop hammering and collapse to a single backoff with a clear "server down" surface. Per-subsystem retries become budget-bounded, not independent.
- **Gate:** a test simulating a down server asserts total outbound attempts across all subsystems stay within the budget over a fixed window (today they fan out uncapped), and recovery resumes within one backoff cycle of the server returning.

### Phase 4 — Webview ready-handshake for init-racing panels (fixes gap 4)
- Add a shared `WebviewReadyQueue` utility that queues `postMessage` calls until the webview script sends a `ready` message. Apply it to Dashboard and Watch — the two panels that `postMessage` immediately after setting `webview.html`, racing the script's `addEventListener('message', ...)` registration. Time Travel already has a working handshake; DVR and Mutation Stream have one but it is trivial (triggers fetch or is a no-op). All other panels use full HTML replacement (no messages to lose). The original plan targeted all 30+ panels; investigation (2026-07-16) found only two have the init race.
- **Gate:** a contract test reproduces the race — `postMessage` before `ready` — and asserts messages are queued and delivered after the handshake, not dropped.

### Phase 5 — Server→extension push (fixes gap 5)
- Replace polling-only discovery with a push signal from the server (e.g. the server announces its bound port/health over the VM Service extension the extension already connects to), so the "server running but extension doesn't know yet" window closes. Polling stays as the fallback for hosts where push is unavailable — additive, not a replacement.
- **Gate:** with push active, the extension reflects a freshly-started server without waiting for the next 30–60s scan; with push disabled, behavior is identical to today's polling. Both paths covered by tests.

**Progress (updated 2026-07-16).** All five structural phases are complete and verified (see Finish Reports below). Gap 6 (Schema Search browse bug) is moot — the Schema Search sidebar panel was removed in v2.17.1 and has no current surface. The print()-banner regression and the `adb forward` hint (top of this doc, [Unreleased]) are fixed and guard-tested; they are not part of the phases. The flap-suppression work (Finish Report 2026-06-22) is a tactical notification fix, also independent of these structural phases.

---

## How to Test Manually

The extension and the example Flutter app are separate processes:

1. **Start the Drift server** — from the repo root, run `python scripts/run_example.py` (or `cd example && flutter run -d windows`). This starts a Flutter app with a Drift database and `DriftDebugServer` listening on port 8642.
2. **Test the extension** — from the repo root, press F5 → pick **"Run Extension (Dev)"**. The launch config at `.vscode/launch.json` compiles `extension/` and launches the Extension Development Host with `--extensionDevelopmentPath` pointing to the extension subfolder. Alternatively, open `extension/` as its own workspace and F5 there — both work. The Extension Development Host loads the local build from `out/`, NOT the marketplace version.
3. **Check Output** — in the Extension Development Host, open Output → Saropa Drift Advisor. The phased activation log shows which phases succeeded. Discovery scan logs show whether port 8642 was found. Schema cache and tree refresh errors are now logged instead of silently swallowed.
4. **Check the API** — `curl http://127.0.0.1:8642/api/health` and `curl http://127.0.0.1:8642/api/schema/metadata` verify the server is running independently of the extension.

---

## Existing Docs (Fragments)

These existing documents cover narrow slices of the connection problem:

| Document | Scope |
|----------|-------|
| `plans/history/20260317/002-no-offline-resilience.md` | Browser UI connection banner, heartbeat, state machine |
| `plans/history/20250318/connection-banner-ux-and-zero-deps.md` | Banner countdown/retry UX enhancements |
| `plans/history/20250318/067-extension-performance-options.md` | Schema cache, lazy tree, stale-while-revalidate |

None of them cover the full picture. This document is the first attempt to do so.

---

## Statistics

- **82 distinct connection-related changelog entries** across 25 versions
- **14 entries** for discovery / server detection
- **10 entries** for VM Service connection
- **13 entries** for disconnection / reconnection / offline resilience
- **5 entries** for ADB / emulator port forwarding
- **9 entries** for welcome view / disconnected state UI
- **8 entries** for connection diagnostics / logging
- **9 entries** for race conditions / timeouts / webview lifecycle
- **6 entries** for health checks / status bar indicators
- **5 entries** for polling / long-poll / change detection
- **4 entries** for MIME type / asset resolution
- Connection fixes appear in **every single minor release** from 1.1.0 onward

---

## Finish Report (2026-06-05)

**Problem.** The VS Code Database panel showed "Offline — cached schema http://127.0.0.1:…": the viewer could not connect to the live database and offered no way to diagnose why. The host app was a running instance of Saropa Contacts.

**Diagnosis (evidence-backed, not inferred).**
- Probed the Windows host: `Test-NetConnection 127.0.0.1:8642` → False; no `dart` process held any listening port. The viewer's target port was closed on the host.
- The contacts app was running on `emulator-5554` (Android emulator), foreground activity `com.saropamobile.app`, target `D:\src\contacts\lib\main.dart` (confirmed via `Win32_Process` command line of the `flutter run` invocation). An initial "running as Flutter web → stub" theory was checked and discarded — the `./lib/...:L:C Symbol` log format is the contacts app's own logger, not a platform signal.
- Inside the emulator: `/proc/net/tcp[6]` had no `21C2` (8642) listener while 2 other listeners existed — so the server was genuinely not bound, not just unreachable.
- Read the emulator's `saropa_contacts.db` via `adb exec-out run-as`: the `user_env_overrides` table was empty → `EnvType.DriftAdvisorEnabled` was at its default `false`. The contacts gate (`main.dart:467-469`) therefore skipped `startDriftViewer` entirely.
- Net: two stacked causes — (1) the advisor was never started (override off), and (2) even once started, the emulator-internal bind is unreachable from the host without `adb forward`.

**Actions taken.**
- Set `adb forward tcp:8642 tcp:8642` on the host (reversible, dev-machine only) so the path is ready once the server binds.
- (A) Added an emulator/device port-forward hint to the server startup banner: a static caveat line plus the exact `adb forward tcp:<port> tcp:<port>` command, printed below the URL. This closes the advisor-side diagnostic gap for every consumer — the banner was previously the only on-screen signal and gave no hint that host access needs forwarding.
- Fixed a latent banner bug surfaced by the new guard test: the banner printed the *requested* `port` (`:0` for ephemeral binds) instead of the actual `server.port`. Both the URL and the new forward command now use the bound port.

**Scope.** (A) Dart package code + (C) docs. The contacts-side fix (B) — a diagnostic `else` in `main.dart` logging *which* gate condition failed — was proposed but NOT done; it edits another project (`D:\src\contacts`) and only (A) was authorized.

**Files changed.**
- `lib/src/drift_debug_server_io.dart` — banner builds `hint` + `forwardCmd` lines; introduced `boundPort = server.port` used by both the URL and forward command.
- `lib/src/server/server_constants.dart` — new `bannerEmulatorHint` constant (≤ 50 chars to fit the banner box).
- `test/drift_debug_server_test.dart` — new "startup banner diagnostics" group; captures the banner via a print-intercepting `Zone` and asserts the hint line + the port-accurate `adb forward` command (ephemeral port proves interpolation).
- `CHANGELOG.md` — `[Unreleased]` Improved + Fixed entries.
- `plans/connection-reliability-ongoing.md` — `[Unreleased]` table row + this report.
- `lib/src/server/server_types.dart` — formatter-only whitespace (pre-commit `dart format` hook), unrelated to logic.

**Verification.** `dart analyze lib test` → No issues found. `dart test` → all 548 pass (including the new banner guard). Banner alignment verified by rendering for the default port (8642) and a 5-digit port (65535); both fit the 50-wide box.

**Not done / outstanding.** (B) contacts-side silent-skip diagnostic — awaiting user permission (cross-project). On-device confirmation that enabling the override + hot restart brings the viewer live is the user's manual step (the forward is already in place).

---

## Finish Report (2026-06-10) — Implementation Plan Phase 1

**Objective.** Phase 1 of this document's Implementation Plan — "single connection-state authority" (fixes gap 1 in *What Has NOT Been Fixed*).

**Scope.** (B) VS Code extension (TypeScript) only. No Dart/Flutter app code, no user-facing copy.

**What changed.**
- **New `extension/src/connection-state.ts`** — the single authority. A pure model (`ConnectionSignals` = the four inputs httpServerSelected / vmServiceActive / schemaLoaded / offlineSchema; `computeConnectionPhase` → `disconnected | connecting | connected | offline`; `deriveConnectionContexts` → the two context flags) plus `ConnectionStateMachine`, the ONLY writer of `driftViewer.serverConnected` and `driftViewer.databaseTreeEmpty`. The machine re-pushes both flags on every `update()` (preserving the existing delayed-sync race workaround) but fires `onDidChange` only on a real phase transition.
- **`connection-ui-state.ts`** — `isDriftUiConnected` and `buildConnectionPresentation` now derive "transport up" from `computeConnectionPhase`/`phaseHasTransport` (one definition, shared). `refreshDriftConnectionUi` gained an optional `stateMachine` target: when present it feeds the four signals and the machine pushes the contexts; when absent (focused unit tests) the legacy direct `setContext` path runs unchanged.
- **`extension-activation-final.ts`** — creates the `ConnectionStateMachine`, registers it as a disposable, and passes it into the single `connectionUiRefresh.fn` funnel that every connection refresh already routes through.
- **`tree/drift-tree-provider.ts`** — added a `hasLiveSchema` getter (`_connected && !_offlineSchema && tables>0`) as the `schemaLoaded` signal. The always-return-rows workaround and the hardcoded `databaseTreeEmpty=false` are unchanged (reliability constraint honored).

**Why this is the fix, not another patch.** The history shows `serverConnected`, `databaseTreeEmpty`, and `isDriftUiConnected` were separate booleans set from different sites at different times. They are now all derived from one phase computed in one place; the two documented contradictions ("connected but no data", "disconnected but server running") are structurally unrepresentable and pinned by tests.

**Testing.**
- Audited existing tests referencing the touched symbols: `connection-ui-state.test.ts` (still green — uses the legacy no-machine path), `drift-tree-provider*.test.ts` and `drift-tree-provider-regression.test.ts` (pin `databaseTreeEmpty` — unchanged value), `extension.test.ts` disposable count (updated 209 → 210 for the added machine subscription, with a comment).
- New `connection-state.test.ts`: enumerates all 16 signal combinations and asserts each invariant; drives the machine through the full disconnected → connecting → connected → offline → disconnected lifecycle; asserts single-writer context agreement, idempotent re-push on no-op update, and no event churn on no-op.
- Command run: `npm run compile` (clean) and `npm test` → **2628 passing**.

**Constraint compliance.** No existing workaround removed (Recurring Patterns §5 stack intact). The machine is wired into production (not dead code) as the single context writer via the existing refresh funnel.

**Outstanding (this phase).** None. Phases 2–5 of the Implementation Plan remain (lifecycle test, circuit breaker, unified webview handshake, server→extension push) and are tracked above. Surfaces beyond the tree/tools (Schema Search webview) still read connection state through their own message protocol; routing them onto `ConnectionStateMachine.onDidChange` is follow-on work, not part of Phase 1's gate.

**Finish report appended:** plans/connection-reliability-ongoing.md (this section). Plan stays active — Phase 1 of 5 complete, document remains the tracker for Phases 2–5.

---

## Finish Report (2026-06-10) — Implementation Plan Phase 2

**Objective.** Phase 2 of this document's Implementation Plan — the end-to-end connection lifecycle test (fixes gap 2, "No connection integration tests" / no full-lifecycle coverage).

**Scope.** (B) VS Code extension, test-only. No production code changed.

**What changed.**
- **New `extension/src/test/connection-lifecycle.test.ts`** — wires the REAL chain (`DriftApiClient` + `ServerDiscovery` + `ServerManager` + `DriftTreeProvider` + `ConnectionStateMachine`, plus the mock command registry) against a `fetch`-stubbed HTTP server. A `LifecycleHarness` mirrors production wiring: the tree's `isDriftUiConnected` callback and the connection refresh both read the SAME machine, and the tree's `postRefreshHook` re-runs the refresh (promoting `connecting → connected` on schema load), exactly as activation wires it.
- **Happy-path case** walks all six links: wiring (disconnected banner) → discovery fires → server auto-selected (`activeServer` set, phase `connecting`) → a registered `driftViewer.refreshTree` command loads schema → phase `connected` → root children contain the status row + both table rows. Cross-checks the `serverConnected` context agrees.
- **Three negative cases** break one link each and assert the end state is NOT reached: (a) discovery never fires → phase stays `disconnected`, no tables; (b) schema fetch rejects → phase `connecting` not `connected`, REST-failure banner, zero table rows; (c) refresh command unregistered → `executeRegistered` returns `undefined`, schema never loads, zero table rows.

**Why this shape.** The document's recurring failure is "a single link broke silently and shipped." A happy-path-only test would not catch that; each negative case is a guard that fails loudly if that specific link regresses. The break-tree-load case also pins the Phase 1 invariant end-to-end — transport-up-without-schema resolves to `connecting`, never a false `connected`.

**Testing.**
- Audited: no existing test pins the new file's symbols (new harness). The fetch-stub approach matches `drift-tree-provider.test.ts` conventions.
- Command run: `npm run compile` (clean), targeted run of the 4 lifecycle cases (all pass), then `npm test` → **2632 passing** (was 2628; +4).

**Constraint compliance.** Pure test addition; no workaround touched, no production behavior changed.

**Outstanding (this phase).** None. The test is headless and runs in the existing mocha suite. It does NOT exercise the VM Service transport path or the browser long-poll path (out of scope for this gate, which targets the HTTP discovery → tree → command chain); extending it to the VM path is reasonable follow-on but not required by Phase 2. Phases 3–5 (circuit breaker, unified webview handshake, server→extension push) remain.

**Finish report appended:** plans/connection-reliability-ongoing.md (this section). Plan stays active — Phases 1–2 of 5 complete.

---

## Finish Report (2026-06-22) — "server lost" notification flap suppression

**Defect.** When the host app is debugged on a physical device over Wi-Fi, the
HTTP debug server flaps — it disappears for one or two discovery scans and
reconnects, repeatedly, as the link wavers. `ServerDiscovery._updateServers`
removed a server after `MISS_THRESHOLD` (2) consecutive missed polls (~20s) and
*immediately* raised a `showWarningMessage` ("Drift debug server on port N is no
longer responding"), then raised a `showInformationMessage` ("…detected on port
N") on the next rediscovery. Each flap therefore produced two modal-style
notification toasts the developer had to dismiss, recurring for the whole
session. The per-port `NOTIFY_THROTTLE_MS` (60s) only bounded the rate; it did
not stop the stream.

**Scope.** (B) VS Code extension (TypeScript). No Dart/Flutter app code; no
user-facing string added or changed (the toast text is pre-existing).

**Resolution.** Two coordinated changes originally in `extension/src/server-discovery-core.ts`
(later extracted into `extension/src/server-discovery-lost-debounce.ts` as the
`ServerLostDebouncer` class during the file-splitting refactor, commit `9ede770`),
with a new constant in `extension/src/server-discovery-constants.ts`:

1. **Grace-window debounce.** A new `LOST_NOTIFY_GRACE_MS` (35000 ms = one
   `SEARCH_INTERVAL` + margin) defers the "lost" toast. Per-port timers live in
   `_pendingLostTimers`. On threshold the server is still deleted (state
   unchanged) but the toast is scheduled, not shown. A rediscovery within the
   window clears the pending timer and suppresses the matching "detected" toast,
   so a transient blip produces no popups.

2. **Once-per-session latch.** `_notifiedThisSession` (originally `_lostNotifiedThisSession`,
   renamed during extraction into `ServerLostDebouncer`) is set the instant the
   deferred warning fires and gates every subsequent found/lost toast until the
   next `start()` (a fresh debug session or an explicit Retry Discovery, which
   resets it). After the first warning the session goes silent regardless of how
   many further flaps occur. The latch is set *before* the notify call so a
   second port's grace timer firing in the same tick cannot double-warn.

3. **Throttle bypass for the lost warning.** The deferred warning calls
   `maybeNotifyServerEvent(..., 'lost', _notifiedAt, 0)`. Routing it through the
   shared `NOTIFY_THROTTLE_MS` map risked the single allowed warning being
   swallowed by a recent "detected" toast on the same port (both share the map);
   the latch is the correct and only guard for the once-per-session contract.

Connection-state detection (server deletion, `ConnectionStateMachine`, the
sidebar Database tree, and the status bar) is unchanged — only the toast cadence
is altered.

**Tests.** `extension/src/test/server-discovery.test.ts` gained three cases
using `sinon` fake timers: (a) a flap within the grace window produces no
warning and no extra "detected" toast; (b) a sustained outage warns exactly once
after the window, even when "detected" fired moments earlier (proves the
throttle bypass); (c) repeated flaps yield at most one warning per session, and
`retry()` re-arms a second warning in the next session. `mocha --grep
"ServerDiscovery"` → 17 passing.

**Verification.** `tsc -p ./` clean (also enforced by the commit lint hook);
scoped mocha run green. A pre-existing, unrelated failure in `extension.test.ts`
("should push expected disposables", 236→237) is in a file this change did not
touch and registers no activation disposables — out of scope and not caused by
this work.

**Commits.** `601b860` (grace-window debounce), `c3dee96` (once-per-session
latch + throttle bypass). Plan stays active — this is a tactical notification
fix, independent of the five structural phases (single state authority,
lifecycle test, circuit breaker, unified webview handshake, server→extension
push), which remain outstanding.

## Finish Report (2026-07-16) — Implementation Plan Phase 3

**Goal.** When the debug server is genuinely unreachable, prevent the extension's
multiple subsystems (discovery, health probes, schema fetches, VM connect) from
independently hammering the network with unbounded retries. Collapse all
outbound HTTP to a single circuit breaker with a clear backoff.

**Scope.** (B) VS Code extension (TypeScript). No Dart/Flutter app code changed.

**Resolution.** A new `CircuitBreaker` class (`extension/src/transport/circuit-breaker.ts`)
tracks consecutive transient failures against `FAILURE_THRESHOLD` (5). When the
threshold trips, the breaker enters `open` state and rejects all requests via
`CircuitBreakerOpenError` for `COOLDOWN_MS` (30s), then transitions to `half-open`
to allow a single probe. Success closes the breaker; failure re-opens it.

Integration points:

1. **`fetchWithTimeout()`** (`extension/src/transport/fetch-utils.ts`) — the single
   HTTP funnel (38+ call sites). A gate at the top rejects when the breaker is
   open (unless `bypassCircuitBreaker: true` is set). Success/failure are recorded
   after each attempt. A new `bypassCircuitBreaker` option on `FetchWithTimeoutInit`
   lets callers opt out.

2. **Discovery probes** (`server-discovery-scan.ts`, `host-discovery-manifest.ts`) —
   set `bypassCircuitBreaker: true` because health probes ARE the recovery
   mechanism and must always reach the network.

3. **User-initiated retry** (`server-discovery-core.ts`) — `retry()` calls
   `getGlobalCircuitBreaker()?.reset()` so a manual retry clears the breaker
   immediately.

4. **Activation** (`extension-activation-final.ts`) — creates the singleton
   `CircuitBreaker`, installs it as the global via `setGlobalCircuitBreaker()`,
   registers it as a disposable, and logs state transitions.

**Tests.** `extension/src/test/circuit-breaker.test.ts` — 12 cases: stays closed
below threshold; trips at threshold; rejects when open; half-open after cooldown;
closes on successful probe; re-opens on failed probe; success resets counter;
`reset()` force-closes; no-op event suppression; `CircuitBreakerOpenError` name;
retry budget bounded over 5min window; recovery within one cooldown cycle.

**Gate: PASSED.** `tsc -p ./` clean; all 12 circuit-breaker tests pass; the
retry-budget test asserts total attempts stay bounded; recovery-resume test
asserts the breaker re-closes within one cooldown cycle.

## Finish Report (2026-07-16) — Implementation Plan Phase 4

**Goal.** Eliminate the init race on Dashboard and Watch panels: `postMessage`
calls fired immediately after setting `webview.html` are silently dropped
because the webview script's `addEventListener('message', ...)` has not yet
registered.

**Scope.** (B) VS Code extension (TypeScript). No Dart/Flutter app code changed.
Investigation (2026-07-16) narrowed the original "all 30+ panels" scope to just
Dashboard and Watch — the only two panels that `postMessage` immediately after
HTML render. All other panels use full HTML replacement (no messages to lose),
or already have a working handshake (Time Travel), or have a trivial no-op
handshake (DVR, Mutation Stream). Schema Search was removed in v2.17.1.

**Resolution.** A new `WebviewReadyQueue` utility (`extension/src/webview-ready-queue.ts`)
queues `postMessage` calls until the webview script sends `{ command: 'ready' }`.

1. **Dashboard** (`dashboard-panel.ts`, `dashboard-scripts.ts`) — constructor
   creates a `WebviewReadyQueue`; all 4 `postMessage` calls replaced with
   `_queue.post()`; `_render()` calls `_queue.resetForNewHtml()` before setting
   HTML; the script sends `{ command: 'ready' }` after registering its listener.

2. **Watch** (`watch-panel.ts`, `watch-html.ts`) — same pattern; the initial
   `_postUpdate()` and any subsequent updates go through the queue; the script
   sends `{ command: 'ready' }` after its listener registration.

**Tests.** `extension/src/test/webview-ready-queue.test.ts` — 7 cases: queues
before ready; flushes in order on ready; immediate after ready; ignores
duplicate ready; `resetForNewHtml` drops stale messages; reproduces the init
race (the exact failure mode); ignores non-ready messages.

`extension/src/test/watch-panel.test.ts` — existing "should post update message
on create" test updated to simulate the `{ command: 'ready' }` handshake before
asserting posted messages, verifying the queue integration.

**Gate: PASSED.** `tsc -p ./` clean; all 7 queue contract tests pass; the
watch-panel test passes with the handshake simulation.

## Finish Report (2026-07-16) — Implementation Plan Phase 5

**Goal.** Close the "server running but extension doesn't know yet" window by
pushing a notification from the Dart server to the extension when the server
starts, instead of relying solely on the 30–60s discovery poll cycle.

**Scope.** (A) Dart package + (B) VS Code extension.

**Resolution.** Leverages the existing VM Service infrastructure — no new
protocols or transports.

1. **Dart side** (`lib/src/drift_debug_server_io.dart`) — after the VM Service
   bridge registration and startup banner, the server posts a
   `developer.postEvent('ext.saropa.drift.ServerStarted', { port, version })`
   event. This travels over the VM Service Extension stream that the extension
   already connects to. The `postEvent` call is wrapped in a catch block that
   logs via `ctx.logError` (the event is best-effort; failure to post does not
   block server startup).

2. **Extension VM client** (`transport/vm-service-client.ts`) — added a
   `VmExtensionEvent` interface and an `onExtensionEvent` callback to the config.
   After isolate resolution in `connect()`, the client sends
   `streamListen({ streamId: 'Extension' })` (best-effort, caught). The
   `_onMessage()` handler routes `streamNotify` messages with
   `streamId === 'Extension'` to the callback, extracting `extensionKind` and
   `extensionData`.

3. **Connection wiring** (`debug-vm-connect.ts`, `debug-commands-vm.ts`) — the
   `onExtensionEvent` callback is threaded through `tryConnectVmInner()` to the
   `VmServiceClient` constructor. The callback in `debug-commands-vm.ts` checks
   for `ext.saropa.drift.ServerStarted` and triggers
   `discovery.retry({ resetNotifyLatch: false })` — an immediate discovery scan
   that reflects the new server without any poll delay.

**Tests.** `extension/src/test/vm-service-push.test.ts` — 6 cases: routes
`ServerStarted` event to callback; ignores non-Extension stream; ignores
missing `extensionKind`; returns null with no callback (push disabled); handles
malformed JSON; handles missing `extensionData`.

**Gate: PASSED.** `tsc -p ./` clean; all 6 push-discovery tests pass; Dart
`dart analyze lib/src/drift_debug_server_io.dart` passes (lint warnings for the
catch block resolved by using `ctx.logError`).

---

## Finish Report (2026-07-16) — Phase 3 Circuit Breaker Bug Fixes

**Goal.** Fix two high-severity bugs in the Phase 3 circuit breaker discovered
during a post-merge review, plus update the test suite to match the corrected
behavior.

**Scope.** `extension/src/transport/circuit-breaker.ts`,
`extension/src/transport/fetch-utils.ts`,
`extension/src/test/circuit-breaker.test.ts`.

### Bug 1 — Safety-timeout failures never fed the breaker (Windows)

The `fetchWithTimeout` catch block gated breaker feeding on `isTransientError()`,
which checks for specific substrings (`econnreset`, `etimedout`, `aborted`, etc.).
The Layer-2 safety timeout — the dominant failure path on Windows where
`AbortController.abort()` is silently ignored by undici — throws
`'Fetch timed out (safety)'`, which matched none of those substrings. Result: on
Windows, a genuinely dead server whose requests all resolved via the safety
timeout never tripped the breaker.

**Fix.** The breaker feeding condition was broadened: all errors except
caller-initiated aborts (`init?.signal?.aborted`) and `CircuitBreakerOpenError`
(the breaker itself rejected — no double-count) now feed `recordFailure()`. The
`isTransientError` function retains its original, narrower scope — it still gates
retry eligibility in `fetchWithRetry`, which is a different question ("is this
worth retrying?") from the breaker's ("is the server down?").

### Bug 2 — Half-open allowed unlimited concurrent probes

`mayAttempt()` returned `true` unconditionally for all callers during `half-open`
state. If multiple subsystems (discovery, schema cache, mutation poller, etc.)
called `fetchWithTimeout` around the same tick after cooldown elapsed, all of
them passed `mayAttempt()` and hit the network — the uncapped fan-out the breaker
exists to prevent, during the recovery moment.

Compounding: `recordSuccess()` unconditionally closed the breaker from any state.
If one probe failed (reopening → restart cooldown) and a second, stale probe
then succeeded, the late success silently closed the breaker despite the server
being confirmed still down.

**Fix.** Added `_halfOpenProbeInFlight` guard: the first `mayAttempt()` caller in
half-open state sets the flag and passes; all subsequent callers are rejected
until `recordSuccess()` or `recordFailure()` clears it. `recordSuccess()` now
only transitions to closed from `half-open` — a success arriving when the breaker
is already `open` (from a concurrent probe's failure) is ignored.

### Tests

Two new tests added to `circuit-breaker.test.ts`:
- `'half-open allows exactly one concurrent probe'` — verifies second
  `mayAttempt()` returns false while first probe is in flight.
- `'ignores stale success after breaker reopened from a concurrent failure'` —
  verifies `recordSuccess()` after re-open leaves state as `open`.

Test header docblock trimmed to remove three aspirational integration test
descriptions that did not exist in the file.

**Gate: PASSED.** `tsc --noEmit` clean; all 16 circuit-breaker tests pass
(14 in `circuit-breaker.test.ts` + 2 from grep-matched files).
