# Bug 086 — Large workspaceState (4.6 MB) contributes to VSCode OOM crashes

## Status: Fixed

## Severity: High

VSCode renderer process OOM-killed during F5 debug launch on a large Flutter
project. VSCode explicitly warns that `saropa.drift-viewer` stores 4.6 MB in
`workspaceState` and recommends migrating to `storageUri`. On projects that
already push the Dart analyzer to its heap limit, this resident memory
contributes to repeated extension host crashes and eventual renderer OOM.

## Problem

VSCode logs on every window load:

```
[warning] large extension state detected (extensionId: saropa.drift-viewer, global: false): 4588.3193359375kb.
Consider to use 'storageUri' or 'globalStorageUri' to store this data on disk instead.
```

Followed by a crash cascade (observed 2026-09-04):

```
14:05:28 [error] CodeWindow: recovered from unresponsive
14:41:18 [error] extensionHost pid 29888: crashed with code -36861 and reason 'crashed'
14:55:07 [error] extensionHost pid 38020: crashed with code -36861 and reason 'crashed'
15:04:19 [error] CodeWindow: renderer process gone (reason: oom, code: -536870904)
```

## Reproduction

1. Open `d:\src\contacts` in VSCode (14 GB project, ~9K files)
2. Let extensions activate — observe the 4.6 MB state warning in main.log
3. Press F5 to launch Flutter debug
4. Extension host crashes, then renderer OOM within minutes

**Frequency:** Multiple times per day on this project.

## Root Cause

`context.workspaceState` is an in-memory key-value store serialized on every
window open/close and held in the renderer heap. At 4.6 MB it is well above the
threshold where VSCode warns. The `saropa.drift-viewer` extension (the Drift
Advisor webview component) accumulates this state — likely cached query results,
table metadata, or viewer state.

Combined with: 6 GB Dart analyzer heap, 10 active log-capture adapters, and the
debug session's own processes, the cumulative memory exceeds what the renderer
can handle.

## Proposed Fix

1. Audit what `saropa.drift-viewer` writes to `workspaceState` — identify the
   large entries (query cache? table schemas? viewer scroll positions?).
2. Migrate bulk data to `context.storageUri` (disk-backed JSON files) — keep
   only lightweight keys/pointers in `workspaceState` (< 100 KB total).
3. Add a startup size check: if `workspaceState` serialized size exceeds 512 KB,
   log a warning and auto-evict oldest/largest entries.
4. Consider lazy-loading patterns — don't deserialize full table schemas into
   memory until the webview panel is actually opened.

## Related

- Also filed as `saropa-log-capture/bugs/bug_047_large-extension-state-vscode-oom.md`
  since the warning names `saropa.drift-viewer` which ships as part of the
  extension suite. Redirect to whichever repo owns the `workspaceState` writes.

## Changes Made

- Created `extension/src/storage/disk-backed-memento.ts` — a `vscode.Memento`
  implementation that persists key-value pairs as individual JSON files under
  `context.storageUri` instead of the in-memory `workspaceState` store. Each key
  maps to a separate file; reads are synchronous from an in-memory cache warmed
  at construction; writes flush to disk async.

- Created `extension/src/storage/bulk-state-factory.ts` — factory that creates
  the disk-backed memento and runs a one-time migration on first activation after
  upgrade: moves the 7 heavy keys out of `workspaceState` into the disk store,
  then clears them from the renderer heap. Also adds a startup size guard that
  warns if `workspaceState` still exceeds 512 KB.

- Migrated 7 heavy stores from `workspaceState` to the disk-backed memento:
  - `BranchManager` (`driftViewer.branches`) — full row snapshots, 1–4 MB
  - `SchemaTracker` (`schema.timeline`) — up to 100 schema snapshots
  - `SchemaCache` (`driftViewer.lastKnownSchema`) — full schema metadata
  - `AnalysisHistoryStore` × 4 (`driftViewer.analysisHistory.*`) — 50 snapshots each

- Wiring changes:
  - `extension-main.ts` — creates `bulkState` early, passes to SchemaCache and SchemaTracker
  - `extension-commands.ts` — added `bulkState` to `CommandRegistrationDeps`
  - `extension-activation-final.ts` — added `bulkState` to `FinalPhaseDeps`, threads through
  - `extension-feature-commands.ts` — passes `bulkState` to branching, export, health modules
  - `branching/branch-commands.ts` — accepts `bulkState`, passes to BranchManager
  - `export/export-commands.ts` — accepts `bulkState`, passes to size AnalysisHistoryStore
  - `health/health-commands.ts` — accepts `bulkState`, passes to 3 AnalysisHistoryStore instances

- Graceful fallback: when `storageUri` is unavailable (test mocks, unusual
  environments) or not writable, falls back to `workspaceState` so the extension
  still works.

- Lazy-load: disk reads deferred to first `get()` per key; `keys()` triggers a
  full directory scan only when called. Activation no longer reads all files.

- Heavy-key guard: warns in the output channel if any migrated key is still found
  in workspaceState after migration, signaling a wiring mistake.

## Tests Added

- `extension/src/test/disk-backed-memento.test.ts` — 9 tests covering:
  - Default values for missing keys
  - Store and retrieve round-trip
  - Persistence across instances (disk survival)
  - Key removal (undefined semantics)
  - keys() accessor
  - Corrupt file handling (graceful skip)
  - Special characters in key names
  - Auto-creation of nested storage directories
  - Value overwrite behavior

## Commits

<!-- Add commit hashes as fixes land. -->
