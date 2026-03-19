# extension.ts Modularization Plan

**Status: Phase 1 COMPLETE** (2026-03-17). Connection bootstrap extracted to `extension-bootstrap.ts`; `extension.ts` is ~232 lines. Phase 2 (optional) not started.

**Goal:** Reduce `extension/src/extension.ts` below the 300-line quality limit (current: 322 lines) by extracting cohesive blocks into dedicated modules.

**Constraint:** Preserve existing behavior and the current `extension-*` naming pattern (`extension-providers`, `extension-diagnostics`, `extension-editing`, `extension-commands`).

**Implementation summary (Phase 1):** New file `extension/src/extension-bootstrap.ts` exports `bootstrapExtension(context)` and `ExtensionBootstrapResult`. It creates and wires DriftApiClient, GenerationWatcher, ServerDiscovery, ServerManager, output channel, auth token listener, discovery.onDidChangeServers (backup context sync + adb forward), and adb-forward-on-debug-start timer. `extension.ts` calls `bootstrapExtension(context)` and uses the returned client, watcher, discovery, serverManager, connectionChannel, discoveryEnabled, extensionEnabled, cfg for the rest of activation. No behavior change; all tests pass.

**Optional follow-ups:** (1) The "refresh suite" (treeProvider.refresh, codeLensProvider.refreshRowCounts, linter.refresh, diagnosticManager.refresh, refreshBadges) is duplicated in four places in extension.ts; a shared helper could reduce duplication. (2) Optional unit test: assert that `bootstrapExtension(fakeContext)` returns an object with the expected shape (client, watcher, discovery, serverManager, connectionChannel, discoveryEnabled, extensionEnabled, cfg).

---

## Current Structure (extension.ts)

| Lines   | Responsibility |
|---------|----------------|
| 1–27    | Imports and file header |
| 29–48   | Config (host, port, enabled), client + auth token listener |
| 50–76   | Watcher, discovery, output channel, ServerManager, start/stop, dispose |
| 78–95   | `discovery.onDidChangeServers`: backup context sync + adb forward |
| 96–125  | ADB forward on debug session start (timer + cleanup) |
| 127–146 | Package monitor, annotation store, setupProviders, packageMonitor → toolsProvider |
| 148–157 | Schema/query intelligence, SchemaTracker, setupDiagnostics |
| 159–164 | setupEditing, changeTracker → context + logBridge |
| 166–179 | Status bar: statusItem, refreshStatusBar, HealthStatusBar, ToolsQuickPick |
| 181–211 | `applyEnabledState` + `onDidChangeConfiguration` for `driftViewer.enabled` |
| 213–259 | `serverManager.onDidChangeActive`: refresh UI, watcher restart, dashboard prompt |
| 261–274 | Delayed sync context (setTimeout), discovery → refreshStatusBar |
| 276–304 | `watcher.onDidChange` handler, initial refresh if enabled, watcher dispose |
| 306–318 | registerAllCommands |
| 320–321 | deactivate |

---

## Phase 1 — Get Under 300 Lines (minimal change)

Extract a single **connection bootstrap** module so `extension.ts` drops to ~225 lines.

### New file: `extension-bootstrap.ts`

**Responsibility:** Create and wire everything needed for “connection layer” and discovery lifecycle. Push all related subscriptions onto `context.subscriptions`.

**Contents (move from extension.ts):**

- Read config: `driftViewer` (host, port, enabled, authToken, discovery.*).
- Set context `driftViewer.enabled`.
- Create `DriftApiClient`, attach auth token, subscribe to `onDidChangeConfiguration` for `authToken`.
- Create `GenerationWatcher`, restore `lastKnownPorts`, create `ServerDiscovery` and output channel, wire logging.
- Create `ServerManager`, wire show/log; start discovery if enabled; push dispose for discovery and serverManager.
- Subscribe `discovery.onDidChangeServers`: backup `serverConnected` context + call `tryAdbForwardAndRetry` when no servers and Flutter/Dart debug session.
- ADB forward on debug start: `onDidStartDebugSession`, timer (e.g. 5000 ms), and dispose cleanup for the timer.

**Return type:** e.g. `ExtensionBootstrapResult` with:

- `client`, `watcher`, `discovery`, `serverManager`, `connectionChannel`
- `discoveryEnabled`, `extensionEnabled`, `cfg` (or just the values needed by extension.ts)

**Signature:**

```ts
export function bootstrapExtension(
  context: vscode.ExtensionContext,
): ExtensionBootstrapResult;
```

**extension.ts after Phase 1:**

- Imports including `bootstrapExtension` from `./extension-bootstrap`.
- `activate()`: call `const boot = bootstrapExtension(context);` then continue with packageMonitor, annotationStore, setupProviders, … status bars, applyEnabledState, serverManager listener, delayed sync, watcher listener, initial refresh, registerAllCommands.
- No behavioral change; only ~95 lines moved into `extension-bootstrap.ts`.

**Line count (approx.):**

- `extension.ts`: ~225
- `extension-bootstrap.ts`: ~100–110

---

## Phase 2 — Optional further splits (if you want a thinner entry point)

After Phase 1, `extension.ts` is under 300 lines. If desired, additional extractions can make it a thin orchestrator (~80–120 lines).

### 2a. `extension-status-bars.ts`

- Create `statusItem`, `refreshStatusBar`, `HealthStatusBar`, `ToolsQuickPickStatusBar`, `registerToolsQuickPickCommand`.
- Push subscriptions for status bar items.
- Return `{ statusItem, refreshStatusBar, healthStatusBar, toolsQuickPick }` for use by `applyEnabledState` and `registerAllCommands`.

### 2b. `extension-enabled-state.ts`

- Implement `applyEnabledState(enabled)` (start/stop discovery and watcher, clear/refresh UI, status bar, tools provider, health, quick pick).
- Subscribe to `onDidChangeConfiguration('driftViewer.enabled')` and call `applyEnabledState`.
- Requires: discovery, watcher, serverManager, providers, diagnosticManager, healthStatusBar, toolsQuickPick, refreshStatusBar. Either pass these in or return a function that takes them and is called from extension.ts with the right deps.

### 2c. `extension-server-lifecycle.ts`

- Subscribe `serverManager.onDidChangeActive`: refresh status bar, set `serverConnected` context, sync tools provider and tools quick pick, hide health when no server; when server present: restart watcher, refresh tree/codelens/linter/diagnostics/badges/watch, and “Open Dashboard” prompt (once per session, respect config and workspace suppress).
- Subscribe delayed sync (setTimeout 1500 ms) for `serverConnected` context; push dispose to clear timeout.
- Subscribe `discovery.onDidChangeServers(refreshStatusBar)`.

### 2d. `extension-watcher-lifecycle.ts`

- Subscribe `watcher.onDidChange`: refresh tree, definition cache, hover cache, codelens, linter, diagnostics, badges, optional snapshot capture, watch manager, dbpProvider, DashboardPanel.
- If extension enabled: `watcher.start()`, refresh tree/codelens/linter/diagnostics/badges; push dispose to call `watcher.stop()`.

Phase 2 modules would take the appropriate bags of services (from bootstrap + setupProviders + setupDiagnostics + setupEditing + status bars) and only wire listeners; no new domain logic.

---

## Summary

| Phase | Action | extension.ts (approx.) | New/updated files |
|-------|--------|------------------------|-------------------|
| 1     | Extract connection bootstrap | ~225 | `extension-bootstrap.ts` (~100) |
| 2a    | Extract status bar setup     | ~210 | `extension-status-bars.ts` |
| 2b    | Extract enabled-state logic  | ~180 | `extension-enabled-state.ts` |
| 2c    | Extract server lifecycle     | ~120 | `extension-server-lifecycle.ts` |
| 2d    | Extract watcher lifecycle    | ~80  | `extension-watcher-lifecycle.ts` |

**Recommendation:** Implement **Phase 1** first. That satisfies the 300-line limit with one new file and minimal risk. Proceed with Phase 2 only if you want a very small `extension.ts` and clearer separation of “connection,” “status,” “enabled state,” “server lifecycle,” and “watcher lifecycle.”

---

## Testing

- Run the extension in the Extension Development Host and verify: discovery, connect, disconnect, enable/disable from settings, ADB forward path (if applicable), dashboard prompt once per session, status bar and Drift Tools sidebar, watcher-driven refresh.
- Existing tests that activate the extension (e.g. `extension.test.ts`) should still pass; Phase 1 does not change the public `activate`/`deactivate` contract.
