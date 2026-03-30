# Connection Reliability: The Ongoing War

## Status: ONGOING / UNRESOLVED

This document catalogs the full history of connection failures between the three components of Saropa Drift Advisor — the **Dart debug server** (running inside the user's app), the **VS Code extension**, and the **browser web UI** — and the relentless stream of patches, hacks, and workarounds that have been applied across **25+ releases** spanning the project's entire lifetime.

This is not a single bug. It is a systemic, cross-cutting reliability problem that has consumed more engineering effort than any other area of the project.

---

## Active Regression (March 2026)

Commit `086152f` (`fix(lints): address server and test lint findings`, March 19, made with Cursor) silently broke the server startup banner by replacing `print()` with `ctx.log()`. The `ctx.log()` path routes through the user's `onLog` callback which calls `developer.log()` — **invisible on Android** because Flutter only intercepts `print()`/Zone output for `I/flutter` terminal lines.

This exact bug was fixed in v1.4.1 (commit `1168968`, "Print server banner to stdout instead of dart:developer.log") and again in v1.7.0 (switched from `stdout.writeln()` to `print()` because `stdout.writeln()` is also invisible on Android). The original fix comment explicitly stated:

> "Single print() call so the banner appears as clean I/flutter lines in the debug console (like Isar Inspector). stdout.writeln() does NOT appear on Android because Flutter only intercepts print/Zone output. ctx.log() (dart:developer.log) works but attaches expandable stack traces to every line. print() is the correct choice here."

The Cursor lint fix deleted this comment and replaced `print()` with `ctx.log()` because `avoid_print` flagged it. The replacement comment says "Emit one compact startup banner line as a structured log message" — losing all the hard-won context about WHY `print()` was necessary.

**Impact:** The server likely IS starting but the startup banner is invisible on Android. Users see zero output and believe the server never started. Combined with the need for `adb forward` on emulators, this creates a perfect storm: no banner → user thinks server is down → opens browser to `127.0.0.1:8642` on host → connection refused (because no port forwarding) → user concludes everything is broken.

**Fix applied:** Restored `print()` with `// ignore: avoid_print, avoid_print_in_release` directives and an 8-line anchored comment explaining why `print()` is the only correct choice, citing the three regressions and pointing to this document. Also added visible `print()` for server startup errors (catch block), which were previously also invisible via `developer.log()` only.

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
| **VS Code: "Browse all tables" link in Schema Search did nothing** — Periodic server-discovery updates fired `connectionState` messages to the webview, which called `doSearch()` when the query box was empty, replacing browse results with the idle placeholder. Added a `browseActive` flag in the webview script that prevents `applyConnectionState` from calling `doSearch()` while browse-all results are displayed. The flag is cleared on user input, scope/type filter changes, errors, and disconnect. | Extension |
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
| **VS Code: Query Cost Analysis command failed to register** — `explain-panel.ts` and `explain-html.ts` used `import { IndexSuggestion }` (value import) for a type-only re-export from `api-client.ts` (`export type * from './api-types'`). At runtime the CommonJS `require()` could not resolve the erased symbol, crashing the entire import chain for the queryCost command module. The activation warning toast "failed to register command modules: queryCost..." was the only symptom. Fixed: changed to `import type { IndexSuggestion }` (and `import type { IExplainNode }` in `explain-html.ts`), which is erased at compile time. | Extension |
| **Dart server: web UI CSS/JS blocked by browser MIME mismatch** — The ancestor-walk fallback in `_discoverPackageRootPathFromAncestorWalk()` required both `lib/saropa_drift_advisor.dart` AND `assets/web/style.css` to exist in the same candidate directory. When the example app ran from `example/` via path dependency, the walk from `Directory.current` never reached the package root, so the server served 404 with `Content-Type: text/plain` for every asset request. Browsers with `X-Content-Type-Options: nosniff` blocked the response. Fixed: relaxed the sentinel to only require the barrel file `lib/saropa_drift_advisor.dart`, which is always present in the package root. | Dart server |

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
- CDN fallback for missing assets
- Embedded asset strings for emulators

Each layer was added to fix a specific failure. Together they form a complex, fragile stack where it is hard to reason about what happens when two or more things go wrong simultaneously.

---

## What Has NOT Been Fixed

Despite all the patches above, these issues remain or recur:

1. **No end-to-end connection health contract** — There is no single source of truth for "are we connected and working." `driftViewer.serverConnected`, `driftViewer.databaseTreeEmpty`, `isDriftUiConnected`, the health endpoint, the tree provider state, the Schema Search state, and the browser's connection state machine are all separate booleans that can disagree.

2. **No connection integration tests** — *(Partially addressed)* The extension now has 21 integration tests verifying every Database tree button produces visible output (toast, output channel line, or webview panel), 8 activation-resilience tests verifying that any activation phase can crash without killing commands from surviving phases, and 2 exhaustive command-wiring tests verifying bidirectional consistency between `contributes.commands` declarations and runtime command registration (catches silent feature-module throws before publication). However, there are still no tests that simulate the full connection lifecycle: extension activates → discovery scans → server found → tree loads → user clicks button → data appears. That end-to-end flow is only covered by manual testing.

3. **No retry budget or circuit breaker** — Each subsystem retries independently. When the server is genuinely down, the extension hammers it with health probes, schema fetches, discovery scans, and VM connection attempts simultaneously. There is no global circuit breaker that says "the server is down, stop everything and show a clear message."

4. **Webview communication is fire-and-forget** — The ready-handshake pattern was added for Schema Search but the extension has multiple webview panels (Troubleshooting, Dashboard, ER Diagram, etc.) and not all of them use the same protocol. A message lost during initialization means a permanently broken panel.

5. **Discovery is polling-based** — The extension scans ports every 3-30 seconds. There is no push notification from the server to the extension. This means connection is always delayed and there is always a window where the server is running but the extension doesn't know about it.

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

- **78 distinct connection-related changelog entries** across 25 versions
- **14 entries** for discovery / server detection
- **10 entries** for VM Service connection
- **13 entries** for disconnection / reconnection / offline resilience
- **5 entries** for ADB / emulator port forwarding
- **9 entries** for welcome view / disconnected state UI
- **8 entries** for connection diagnostics / logging
- **8 entries** for race conditions / timeouts
- **6 entries** for health checks / status bar indicators
- **5 entries** for polling / long-poll / change detection
- Connection fixes appear in **every single minor release** from 1.1.0 onward
