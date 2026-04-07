# Plan: Saropa Log Capture Integration (Drift Advisor Side)

**Status:** Implemented  
**Completed:** 2026-03-19  
**Owner:** Drift Advisor  
**Related:** Saropa Log Capture extension (`saropa.saropa-log-capture`); bilateral design in Log Capture repo: `docs/integrations/DRIFT_ADVISOR_INTEGRATION.md`

## Implementation summary

All four phases are implemented in saropa_drift_advisor:

- **Phase 1:** Full provider contract (LogCaptureEndContext, isEnabled(context), onSessionEnd(context)), meta + sidecar contributions, config `driftViewer.integrations.includeInLogCaptureSession` (none/header/full), unit tests.
- **Phase 2:** DiagnosticManager `_lastIssues` + `getLastCollectedIssues()`, issuesRef wired from extension.ts into bridge, issuesSummary and issues in meta/sidecar, tests.
- **Phase 3:** Public API via `context.exports` (`getSessionSnapshot()`), `extension/src/log-capture-api.ts`, `doc/EXTENSION_API.md`.
- **Phase 4:** Well-known file `.saropa/drift-advisor-session.json` written on session end when full mode, `doc/LOG_CAPTURE_FILE_CONTRACT.md`.

Post-implementation review (2026-03-19): Session-end flow refactored so full mode uses a single parallel fetch (no duplicate `performance()` call); header-only mode fetches only performance. Shared helpers (`severityToString`, `toWorkspaceRelativePath`, `LOG_CAPTURE_SESSION_TIMEOUT_MS`) exported from the bridge and reused by log-capture-api to remove duplication.

---

This plan specifies everything **saropa_drift_advisor** must implement so that optional, tighter integration with Saropa Log Capture works end-to-end. Log Capture's responsibilities (Integrations UI, viewer actions, context popover) are documented in the bilateral doc; this document is the single source of truth for Drift Advisor implementation.

---

## 1. Goals and success criteria

### 1.1 Goals

- **Optional:** No dependency on Log Capture at install time. When Log Capture is not installed, the bridge does nothing; when it is installed, the user can enable "Drift Advisor" in Log Capture's Configure integrations and get rich session data.
- **Full contract:** The integration provider implemented in Drift Advisor must satisfy Log Capture's full provider contract (end context in `onSessionEnd`, contributions that include **meta** and **sidecar**, not just header lines).
- **Rich data:** At session end, contribute a structured meta payload and a sidecar JSON file containing performance, anomalies, schema summary, health, index suggestions, and (optionally) diagnostics/issues.
- **Respect Log Capture config:** When the user disables "Drift Advisor" in Log Capture, the provider must contribute nothing (use `isEnabled(context)` and read `context.config.integrationsAdapters`).
- **Configurable verbosity:** Allow users to choose how much we send to Log Capture: none, header only, or full (header + meta + sidecar) via a new Drift Advisor setting.

### 1.2 Success criteria

- With Log Capture installed and a Drift server connected, when a Log Capture session ends:
  - Session metadata contains `integrations['saropa-drift-advisor']` with performance, anomalies, schema, health, and (when available) issues summary.
  - A file `{baseFileName}.drift-advisor.json` exists next to the log file with full exportable data.
- When `driftViewer.integrations.includeInLogCaptureSession` is `header`, only header lines are contributed; when `none`, no contributions (or provider not registered).
- When "Drift Advisor" is disabled in Log Capture's Integrations list, `isEnabled(context)` returns false and no contributions are sent.
- No crashes or errors when Log Capture is not installed; bridge init is no-op.

---

## 2. Current state (Drift Advisor)

*(Sections 2–10 unchanged from original plan; see repo history for full body.)*

---

## 10. References

- Bilateral design (Log Capture repo): `docs/integrations/DRIFT_ADVISOR_INTEGRATION.md`
- Log Capture integration API (concept): session lifecycle calls `runOnSessionEnd(endContext, metadataStore)`; providers return meta and sidecar contributions.
- Drift Advisor: `extension/src/debug/log-capture-bridge.ts`, `extension/src/api-client.ts`, `extension/src/api-types.ts`, `extension/src/diagnostics/diagnostic-manager.ts`, `extension/src/extension-providers.ts`, `extension/src/extension.ts`, `extension/src/log-capture-api.ts`.
