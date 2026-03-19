# Log Capture — Drift Advisor file contract

**Status:** Optional  
**Related:** [Log Capture integration plan](../plans/log-capture-integration.md), [Extension API](EXTENSION_API.md)

## Well-known file

When Saropa Log Capture ends a session and Drift Advisor contributes in **full** mode, the extension may also write a well-known file so that tools or other consumers can read the same snapshot without activating the Drift Advisor extension.

- **Path:** `<workspaceRoot>/.saropa/drift-advisor-session.json`
- **Encoding:** UTF-8 JSON
- **Shape:** Same as `DriftAdvisorSnapshot` / sidecar (see [Extension API](EXTENSION_API.md#snapshot-shape-driftadvisorsnapshot)).
- **When written:** On Log Capture session end, when Drift Advisor’s integration provider runs with `includeInLogCaptureSession` set to `full` and a sidecar is produced. The file is overwritten each time.
- **When not written:** If no workspace folder, if mode is `none` or `header`, or if the provider does not run (e.g. Log Capture not installed or “Drift Advisor” disabled in Log Capture).

## Use case

- Scripts or external tools that want the latest Drift Advisor session snapshot without loading the VS Code extension.
- Log Capture or other extensions that prefer reading a file instead of calling the extension API.

## References

- Plan: [Log Capture integration (Phase 4)](../plans/log-capture-integration.md#phase-4-optional-file-contract)
- Snapshot type: `DriftAdvisorSidecar` in `extension/src/debug/log-capture-bridge.ts`
