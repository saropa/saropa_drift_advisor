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

## References

- Plan: [Log Capture integration](../plans/log-capture-integration.md)
- Implementation: `extension/src/log-capture-api.ts`, `extension/src/debug/log-capture-bridge.ts`
