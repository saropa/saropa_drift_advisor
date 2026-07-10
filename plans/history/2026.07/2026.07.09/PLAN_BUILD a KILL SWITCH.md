# Feature Specification: Global Monitoring & Logging Kill Switch

## Overview & Objective

This specification details the implementation of a global **Kill Switch** for the Saropa Drift Advisor ecosystem (covering both the Dart package debug server and the VS Code extension)[cite: 2]. The purpose of this feature is to provide developers with a single, unambiguous mechanism to instantly toggle all database monitoring, background query logging, timeline sweeping, and extension diagnostic telemetry on or off. 

This is critical for performance-sensitive debugging phases, corporate privacy compliance when handling sensitive user data, and mitigating startup lag on constrained devices[cite: 2].

---

## 1. User Experience & UI Design

The kill switch will be accessible via both configuration settings and explicit UI controls within the VS Code Extension.

### 1a. Database Sidebar Actions
A new "Power" icon button will be added to the Database sidebar toolbar (next to the Refresh button)[cite: 2].
* **State: Monitoring Enabled (Default):** The icon displays as a standard active toggle. Clicking it activates the kill switch.
* **State: Monitoring Disabled:** The icon changes to a prominent disconnected state with a caution accent[cite: 2]. The Database sidebar replaces active table/view trees with a blank state message: `"Monitoring and Logging are disabled via Kill Switch."`

### 1b. Drift Tools Hub Integration
A dedicated card will be added to the top of the **Drift Tools Hub**[cite: 2]:

| Status | UI Component | Action Behavior |
|---|---|---|
| **Active** | Green Badge (`--status-good`)[cite: 2] | Displays "Monitoring Active". Contains a button labeled "Kill All Monitoring & Logs". |
| **Killed** | Red/Caution Badge (`--status-bad`)[cite: 2] | Displays "Monitoring Suppressed". Contains a button labeled "Resume Monitoring". |

### 1c. Command Palette
Two new explicit commands will be registered in `package.json`[cite: 2]:
* `Drift Viewer: Kill All Monitoring and Logging` (`driftViewer.monitoring.kill`)
* `Drift Viewer: Resume All Monitoring and Logging` (`driftViewer.monitoring.resume`)

---

## 2. Configuration & Settings

The feature introduces configuration flags on both sides of the mixed-language codebase[cite: 1].

### 2a. VS Code Extension Configuration (`package.json`)
A new workspace setting will control the extension-side behavior[cite: 2]:

```json
"driftViewer.enableMonitoringAndLogging": {
  "type": "boolean",
  "default": true,
  "description": "When false, silences all diagnostics, stops background sweeps, and instructs the Dart debug server to halt all query recording and timeline captures."
}
```

### 2b. Dart SDK Server Configuration (`DriftDebugServer`)
The `DriftDebugServer.start()` method will accept an optional configuration parameter[cite: 2]:

```dart
await DriftDebugServer.start(
  db,
  monitoringEnabled: false, // Defaults to true if omitted
);
```

Additionally, a runtime setter will be exposed on the implementation instance to allow live flipping via API requests[cite: 2]:
```dart
void setMonitoringEnabled(bool enabled);
```

---

## 3. Technical Architecture & Stream Isolation

To ensure that "disabled" truly means zero tracking overhead, structural short-circuits must be injected into the execution paths of both `lib/src/` (Dart) and `extension/src/` (TypeScript)[cite: 1].

```
+-------------------------------------------------------------+
|                     VS Code Extension                       |
|   [ driftViewer.enableMonitoringAndLogging: false ]         |
+------------------------------+------------------------------+
                               |
                   Fires IPC / HTTP State Sync
                               |
                               v
+-------------------------------------------------------------+
|                     Dart Debug Server                       |
|   [ DriftDebugServer.monitoringEnabled = false ]            |
+----+-------------------------+-------------------------+----+
     |                         |                         |
     v                         v                         v
QueryRecorder             Timeline Sweeps           API Gatekeeper
 (Drop all SQL)         (Short-circuit OOM)       (403 Forbidden)
```

### 3a. Dart Server Side (`lib/src/`)
When `monitoringEnabled` is evaluated as `false`:

1. **`QueryRecorder` Interception:** The internal query logging mechanisms will drop raw incoming SQL strings immediately. No memory allocation or analytical processing occurs.
2. **Background Sweep Short-Circuit:** Timeline snapshot captures, data-branching sweeps, and null-rate evaluations immediately abort prior to triggering any `SELECT *` or `length()` query logic[cite: 2].
3. **Host Manifest Masking:** The server-discovery manifest file (`~/.saropa_drift_advisor/server.json`) will add a flag state `"monitoring": "disabled"` so external profiling tools know the target is deliberately dormant[cite: 2].

### 3b. VS Code Extension Side (`extension/src/`)
When the workspace configuration updates to `false`:

1. **Diagnostic Processing Suppressed:** The `DiagnosticManager` will purge all active Problems-panel squiggles and clear its tracking indexes centrally[cite: 2].
2. **File Decoration Badges:** Row-count badges and tooltip decorations for file schemas will be instantly cleared across workspace directories[cite: 2].
3. **API Gatekeeper Routine:** Any interaction within the SQL Notebook, Views screen, or ER Diagrams panel targeting data manipulation or profiling will soft-fail with an informative status toast instead of a backend crash exception[cite: 2].

---

## 4. API Endpoint Invariants

When the server enters a dormant state, the HTTP/VM service endpoints must maintain a strict compliance response posture[cite: 2]:

* **`GET /api/health`**: Returns a modified payload declaring readiness but noting the active safety block[cite: 2]:
  ```json
  {
    "status": "pass",
    "loopbackOnly": true,
    "monitoringEnabled": false
  }
  ```
* **`POST /api/sql` & `GET /api/views`**: Returns a structured `403 Forbidden` error response instead of breaking connection contracts[cite: 2]:
  ```json
  {
    "error": "Access Denied: All monitoring and data inspection has been halted by the global kill switch."
  }
  ```

---

## 5. Verification Checklist & Guardrails

Prior to release staging, implementation must satisfy the following integration parameters modeled around verification steps found in CHANGELOG.md and BUG_REPORT_GUIDE.md:

- [ ] **Zero Leakage:** Running the extension with `enableMonitoringAndLogging: false` yields 0 active `vscode.Diagnostic` emissions[cite: 2].
- [ ] **State Resilience:** Toggling the kill switch mid-session cleanly terminates ongoing heavy database sweeps without throwing async unhandled socket or isolate exceptions[cite: 2].
- [ ] **Failsafe Re-enabling:** Transitioning from `false` back to `true` re-arms the discovery loops, refreshes table metrics, and successfully syncs settings without requiring a VS Code window reload or a host application restart[cite: 2].

---

## Implementation Report (2026-07-09)

Implemented in full across both surfaces. Key decisions and deviations:

### Dart server (`lib/src/`)

- `ServerContext.monitoringEnabled` (seeded from the new `monitoringEnabled`
  start parameter, default `true`) with a single mutation point
  `setMonitoring()` mirroring the existing change-detection pattern.
  `DriftDebugServer.setMonitoringEnabled()` / `monitoringEnabled` exposed on
  the public mixin, stub mirrored for web builds, and `startDriftViewer`
  forwards the parameter.
- **Zero-capture guarantee:** `timedQuery` executes without stack parsing,
  timing records, or DVR entries while killed; `checkDataChange` aborts before
  the sqlite_master lookup. Write-capture paths need no extra guard — they are
  only reachable through HTTP endpoints the 403 gate blocks.
- **Endpoint gate:** one structural check in `Router._dispatch` answers every
  `/api/*` route past the pre-query group with a structured 403
  (`ServerConstants.errorMonitoringDisabled`). Surviving endpoints: health
  (adds `monitoringEnabled`), API index, generation/mutations long-polls
  (issue no queries while killed), web assets, change-detection, root HTML,
  and the new `GET/POST /api/monitoring` (deliberately pre-gate — it is the
  HTTP resume path).
- Discovery manifest carries `"monitoring": "enabled"|"disabled"` and is
  rewritten (best-effort, fire-and-forget) on every runtime flip via a
  `ServerContext.onMonitoringChanged` hook.
- Regression tests: `test/monitoring_kill_switch_test.dart` — 7 tests
  (unit short-circuits + full HTTP integration incl. resume-without-restart
  and manifest state), all passing.

### VS Code extension (`extension/src/`)

- Setting `driftViewer.enableMonitoringAndLogging` (default true) + commands
  `driftViewer.monitoring.kill` / `driftViewer.monitoring.resume`; sidebar
  power toggle swaps between the two via the `driftViewer.monitoringEnabled`
  context key; Drift Tools Hub gets a status card (green "Monitoring Active" /
  red "Monitoring Suppressed") wired to the same commands.
- New `monitoring/monitoring-state.ts` (leaf read-side, no import cycles) +
  `monitoring/monitoring-kill-switch.ts` (commands, reactive config listener,
  on-connect server push, apply function). Reactive like `driftViewer.enabled`,
  not lazily-polled like `lightweight`, so the flip is immediate.
- Kill purges the DiagnosticManager collection (and the manager self-gates in
  `refresh()`, making the zero-leakage guarantee caller-independent), clears
  file badges via a new `clearAll()`, blanks the Database tree with the
  spec's kill-switch banner + one-tap resume row (real TreeItems, matching the
  house pattern), and skips the heavy background sweep.
- Server sync: `GET/POST /api/monitoring` client methods; on connect the
  extension pushes only a KILL (never a force-resume, so a host app that
  deliberately started dormant is not overridden).
- Soft-fail: `fetchWithRetry` converts a 403 carrying the kill switch's JSON
  `error` body into that message, so every surface toasts the explanation
  instead of a bare "failed: 403". Plain/bodyless 403s pass through unchanged
  (existing per-endpoint contracts kept — this surfaced in the suite run and
  was deliberately narrowed).
- Tests: `src/test/monitoring-kill-switch.test.ts` (client endpoints, 403
  interception both ways, config default, hub card composition). Full mocha
  suite passing; `vscode-mock` gained `ConfigurationTarget` + an optional
  `update()` so settings-writing commands run under test.

### Verification checklist from this plan

- **Zero Leakage** — DiagnosticManager clears and refuses collection while
  killed (single choke point); badges cleared; tree blanked; server records
  nothing (Dart tests assert zero query callbacks and empty timing/DVR
  buffers).
- **State Resilience** — runtime kill mid-session verified over HTTP (Dart
  integration test); long-polls stay exempt so no socket churn; manifest
  rewrite is fire-and-forget and cannot fail the toggle.
- **Failsafe Re-enabling** — POST /api/monitoring resume verified to restore
  `/api/sql` immediately with no rebind/restart; extension resume refreshes
  tree, diagnostics, and badges without a window reload.
