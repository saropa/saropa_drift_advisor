# Saropa Drift Advisor — Extension API

Other VS Code extensions can consume Drift Advisor data by using the public API exposed when this extension is activated.

## Extension ID

- **ID:** `saropa.drift-viewer` (from `publisher.name` in `package.json`)

## Consuming the API

1. Get the extension reference (activation is lazy if you only call `getExtension`).
2. Activate the extension to obtain the exported API.
3. Call `getSessionSnapshot()` to retrieve the current session snapshot.

```typescript
import * as vscode from 'vscode';

const ext = vscode.extensions.getExtension('saropa.drift-viewer');
if (!ext) {
  // Drift Advisor is not installed
  return;
}
const api = await ext.activate();
// api is the object we set as context.exports
const snapshot = await api.getSessionSnapshot();
if (snapshot === null) {
  // No Drift server connected
  return;
}
// Use snapshot (performance, anomalies, schema, health, issues, etc.)
```

## API surface

### `getSessionSnapshot(): Promise<DriftAdvisorSnapshot | null>`

- **Returns:** A snapshot of the current Drift session (performance, anomalies, schema, health, index suggestions, and optional diagnostic issues), or `null` if no Drift debug server is connected.
- **Shape:** Same as the sidecar file written at Log Capture session end (see [Log Capture integration plan](../plans/log-capture-integration.md) and the `DriftAdvisorSidecar` type in the extension source).

### Snapshot shape (`DriftAdvisorSnapshot`)

| Field | Type | Description |
|-------|------|-------------|
| `generatedAt` | string (ISO) | When the snapshot was built |
| `baseUrl` | string | Drift server base URL |
| `performance` | object | `totalQueries`, `totalDurationMs`, `avgDurationMs`, `slowQueries`, `recentQueries` |
| `anomalies` | array | `{ message, severity }[]` |
| `schema` | array | `TableMetadata[]` (name, columns, rowCount) |
| `health` | object | `{ ok, extensionConnected? }` |
| `indexSuggestions` | array (optional) | `IndexSuggestion[]` |
| `issues` | array (optional) | `{ code, message, file, range?, severity }[]` (workspace-relative paths) |

Use this API when you need to pull the same data that Drift Advisor contributes to Saropa Log Capture at session end, without relying on the Log Capture integration provider having run.

## Saropa Suite daily-summary contract

The same exports object also implements the cross-tool **Saropa Suite** API, so a consolidated Suite daily report can pull one small digest from each tool without scraping internals:

```typescript
const api = vscode.extensions.getExtension('saropa.drift-viewer')?.exports;
if (api?.apiVersion === 1) {
  const summary = await api.getDailySummary('2026-07-16'); // YYYY-MM-DD
  if (summary) {
    // summary.headline, summary.counts, summary.trouble, summary.openCommand
  }
}
```

### `apiVersion: 1`

Contract version. Bumps only on a breaking shape change; consumers ignore unknown fields, so growth is additive. Treat every emitted field with the same never-rename discipline as the `driftViewer.*` deep-link ids.

### `getDailySummary(date: string): Promise<DailySummary | undefined>`

- **Returns:** the day's summary when a database has been observed (a Drift server is connected), or `undefined` otherwise so the caller omits the section.
- **Lazy:** built on call from data the dashboard/anomaly-detector/index-analyzer already compute — nothing runs at activation.
- **Per-day history is not retained (apiVersion 1).** The server keeps a live session view (ring buffers of query timings, current anomalies), so the returned summary is that session/snapshot view stamped with the requested `date`.

### Summary shape (`DailySummary`)

| Field | Type | Description |
|-------|------|-------------|
| `tool` | `'drift-viewer'` | Stable tool id within the Suite report |
| `date` | string | Echo of the requested day (`YYYY-MM-DD`) |
| `headline` | string | One plain-language sentence for the executive summary |
| `counts` | `Record<string, number>` | `queries`, `slowQueries`, `anomalies`, `indexSuggestions` |
| `trouble` | array | Failure-only items: `{ label, detail?, command?, args? }` (anomalies + slow-query offenders, worst first) |
| `openCommand` | string (optional) | Deep-link to open the full view (`driftViewer.openInPanel`) |

## File-based access (Log Capture sidecar)

When Saropa Log Capture ends a session and Drift Advisor contributes in **full** mode, the extension writes a well-known file so that scripts or other consumers can read the same snapshot without activating the extension.

- **Path:** `<workspaceRoot>/.saropa/drift-advisor-session.json`
- **Encoding:** UTF-8 JSON
- **Shape:** Same as `DriftAdvisorSnapshot` (see [snapshot shape](#snapshot-shape-driftadvisorsnapshot)).
- **When written:** On Log Capture session end, when the integration provider runs with `includeInLogCaptureSession` set to `full` and a sidecar is produced. Overwritten each time.
- **When not written:** If no workspace folder, if mode is `none` or `header`, or if the provider does not run (e.g. Log Capture not installed or "Drift Advisor" disabled in Log Capture).

Use cases:

- Scripts or external tools that want the latest session snapshot without loading the VS Code extension.
- Extensions that prefer reading a file instead of calling the extension API.

## References

- Plan: [Log Capture integration](../plans/log-capture-integration.md)
- Implementation: `extension/src/log-capture-api.ts`, `extension/src/debug/log-capture-bridge.ts`
- Snapshot type: `DriftAdvisorSidecar` in `extension/src/debug/log-capture-bridge.ts`
