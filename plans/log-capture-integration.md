# Plan: Saropa Log Capture Integration (Drift Advisor Side)

**Status:** Implemented  
**Completed:** 2026-03-19  
**Owner:** Drift Advisor  

This plan is **fully implemented**. The full plan document and implementation summary have been moved to:

- **plans/history/20260319/log-capture-integration.md**

Implementation lives in:

- `extension/src/debug/log-capture-bridge.ts` — provider, meta/sidecar, session-end flow
- `extension/src/log-capture-api.ts` — public API `getSessionSnapshot()`
- `extension/src/diagnostics/diagnostic-manager.ts` — `getLastCollectedIssues()`
- `extension/src/extension-providers.ts`, `extension/src/extension.ts` — wiring (issuesRef)
- `doc/EXTENSION_API.md` — API documentation
- `doc/LOG_CAPTURE_FILE_CONTRACT.md` — well-known file contract

Related: Saropa Log Capture extension (`saropa.saropa-log-capture`); bilateral design in Log Capture repo: `docs/integrations/DRIFT_ADVISOR_INTEGRATION.md`.
