# Bug 086 — Large workspaceState causing VS Code OOM

VS Code warned that `saropa.drift-viewer` stored 4.6 MB in `workspaceState`,
an in-memory key-value store held in the renderer heap. On large Flutter
projects (e.g. 14 GB, ~9K files), this contributed to extension host crashes
and renderer OOM kills during debug launches.

## Root Cause

Seven stores persisted bulk data (row snapshots, schema timelines, analysis
history) into `context.workspaceState` with no byte-size limits. BranchManager
alone — storing full row data for up to 10 branches × 10,000 rows/table —
could reach 1–4 MB. Combined with the Dart analyzer's 6 GB heap and debug
session overhead, the cumulative memory exceeded what the renderer could handle.

## Fix

A `DiskBackedMemento` class (`extension/src/storage/disk-backed-memento.ts`)
implements `vscode.Memento` using JSON files under `context.storageUri` instead
of the in-memory store. Each key maps to a separate file named with a SHA-256
prefix to prevent collisions. Reads are lazy-loaded — each key is read from
disk on first `get()` access rather than warming the full cache at construction,
keeping activation fast when most keys are never accessed. `keys()` triggers a
full directory scan only when called. Writes flush to disk asynchronously.

A factory (`extension/src/storage/bulk-state-factory.ts`) creates the
disk-backed memento during activation and runs a one-time ordered migration:
each key is written to disk before being cleared from workspaceState, and the
migration sentinel is set only after all writes succeed, so a crash
mid-migration cannot lose data from both stores. A startup size guard warns if
workspaceState still exceeds 512 KB after migration.

Seven heavy stores were migrated:
- `driftViewer.branches` (BranchManager)
- `schema.timeline` (SchemaTracker)
- `driftViewer.lastKnownSchema` (SchemaCache)
- `driftViewer.analysisHistory.sizeAnalytics`
- `driftViewer.analysisHistory.indexSuggestions`
- `driftViewer.analysisHistory.anomalies`
- `driftViewer.analysisHistory.healthScore`

When `storageUri` is unavailable (test mocks, unusual environments), the
factory falls back to `workspaceState` so the extension still activates.

## Wiring Changes

- `extension-main.ts` creates `bulkState` early, passes to SchemaCache and SchemaTracker
- `extension-commands.ts` added `bulkState` to `CommandRegistrationDeps`
- `extension-activation-final.ts` added `bulkState` to `FinalPhaseDeps`
- `extension-feature-commands.ts` threads `bulkState` to branching, export, health modules
- `branch-commands.ts`, `export-commands.ts`, `health-commands.ts` accept and use `bulkState`

## Tests

9 tests in `extension/src/test/disk-backed-memento.test.ts` covering
round-trip persistence, cross-instance survival, key removal, corrupt file
handling, special characters, nested directory creation, and value overwrite.

4 tests in `extension/src/test/bulk-state-factory.test.ts` covering: heavy-key
migration end to end, migration idempotency (sentinel skip), fallback to
workspaceState when storageUri is unavailable, and the per-key size warning
for a key outside HEAVY_KEYS.

All 3164 tests pass.

## Finish Report (2026-09-04)

Defect: VS Code renderer OOM caused by 4.6 MB of in-memory workspaceState.
Resolution: bulk data migrated to disk-backed storage under `context.storageUri`.

Code-review findings addressed:
1. Migration race condition — two-phase migration: synchronous cache seeding
   via `collectMigrationData()` + `seedCache()`, then async disk flush via
   `flushMigrationToDisk()` with ordered writes (disk before workspaceState
   clear). Sentinel set only after all writes succeed.
2. Key-to-filename collision — filenames now use SHA-256 hex prefix for
   uniqueness with a human-readable suffix for debuggability.

Hardening (reflection gate):
3. StorageUri writability guard — constructor failure caught with graceful
   fallback to workspaceState instead of crashing activation.
4. Forgot-bulkState guard — heavy keys still in workspaceState after migration
   trigger a warning in the output channel. Skipped during first-activation
   migration window to avoid false positives.
5. JSON round-trip assumption documented on `update()`.
6. Lazy-load — disk reads deferred to first `get()` per key; full directory
   scan deferred to first `keys()` call. Activation no longer reads files.
7. Fire-and-forget migration flush now catches its own rejection and logs it,
   instead of surfacing as an unhandled promise rejection; un-flushed keys
   remain in workspaceState (sentinel unset) and retry on next activation.
8. Migration path test coverage added (`bulk-state-factory.test.ts`) — the
   migration logic itself was previously untested, only `DiskBackedMemento`.

Unrequested feature (per-key bloat detection, scoped minimally):
9. `warnIfWorkspaceStateLarge` now flags any individual workspaceState key
   over 100 KB, not just the seven keys in `HEAVY_KEYS`. This closes the gap
   the original size guard had: a future store that grows large without
   being added to `HEAVY_KEYS` would otherwise silently reproduce this bug
   with no operator-facing signal. A dashboard command was considered and
   rejected — it would require a user to know to look for it, so it would
   not catch bloat in practice; an automatic log warning at activation does.
