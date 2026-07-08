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
