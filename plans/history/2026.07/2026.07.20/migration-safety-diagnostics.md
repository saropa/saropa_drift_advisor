# Migration Safety Diagnostics

Two Drift migration pitfalls — described in an r/FlutterDev post (2026-07-18)
— can brick user installs with a silent black screen. Both are now surfaced as
VS Code Problems-panel diagnostics.

## Diagnostics Added

### `no-schema-snapshots` (Warning, bestPractices)

Fires when a Drift workspace has no `drift_schemas/` or
`test/generated_migrations/` directory. Prompts the developer to run
`dart run drift_dev schema dump` and set up `SchemaVerifier` for N-to-M
migration path testing.

- Runs without a server connection (workspace-level static check via
  `vscode.workspace.findFiles` with `maxResults: 1`).
- Anchored to `pubspec.yaml` line 0 (workspace-level pattern from
  `table-checker.ts`).
- Skipped when no Dart files with table classes exist.

### `schema-version-mismatch` (Error, schema)

Fires when the database's `PRAGMA user_version` differs from the Dart-declared
`schemaVersion`. Indicates a migration that failed or was skipped.

- Requires a live debug connection.
- The Dart server derives the declared `schemaVersion` via duck typing
  (`db.schemaVersion` on the `Object` database reference) and exposes it
  alongside `dbSchemaVersion` in the `/api/schema/metadata` JSON response
  (additive — existing `tables` field preserved) and the VM Service bridge.
- `PRAGMA user_version` is queried via `queryRaw` (not instrumented) to avoid
  polluting perf stats and DVR timelines per architecture invariant #9.

## Files Changed (21)

### Dart package
- `lib/src/server/server_context.dart` — `declaredSchemaVersion` field
- `lib/src/server/server_constants.dart` — JSON key constants
- `lib/src/server/server_types.dart` — `AnomalySuppression.copyWith` (unrelated maintenance)
- `lib/src/server/schema_handler.dart` — PRAGMA user_version in metadata response
- `lib/src/server/router.dart` — `getDbSchemaVersion()` helper for VM bridge
- `lib/src/server/vm_service_bridge.dart` — version fields in VM response
- `lib/src/drift_debug_server_io.dart` — `declaredSchemaVersion` parameter threading
- `lib/src/start_drift_viewer_extension.dart` — `_deriveDeclaredSchemaVersion` duck-typing

### VS Code extension
- `extension/src/api-types.ts` — `SchemaVersionInfo` interface
- `extension/src/api-client-http-schema.ts` — `httpSchemaVersionInfo()`
- `extension/src/api-client.ts` — `schemaVersionInfo()` routing
- `extension/src/transport/vm-service-api.ts` — `apiGetSchemaVersionInfo()`
- `extension/src/transport/vm-service-client.ts` — `getSchemaVersionInfo()`
- `extension/src/diagnostics/codes/best-practice-codes.ts` — `no-schema-snapshots` code
- `extension/src/diagnostics/codes/schema-codes.ts` — `schema-version-mismatch` code
- `extension/src/diagnostics/providers/best-practice-provider.ts` — `_checkSchemaSnapshots`
- `extension/src/diagnostics/providers/schema-provider.ts` — `_checkSchemaVersionMatch`

### Tests
- `extension/src/test/best-practice-provider.test.ts` — 3 new tests
- `extension/src/test/schema-provider.test.ts` — 3 new tests
- `test/anomaly_detector_test.dart` — `AnomalySuppression.copyWith` tests (unrelated)

## Finish Report (2026-07-20)

Review identified one defect: `sendSchemaMetadata` ran `PRAGMA user_version`
through the instrumented query callback, which would pollute DVR timelines and
slow-query diagnostics with internal probe entries on every metadata fetch.
Fixed by switching to `_ctx.queryRaw` — the same untagged path used by
`Router.getDbSchemaVersion()` for the VM bridge.

All TypeScript compilation passes clean. Unit tests pass: 15/15
best-practice-provider (including 3 new), 12/12 schema-provider (including 3
new).
