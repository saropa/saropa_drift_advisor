# Modularize five over-cap extension files

Five VS Code extension source/test files exceeded the project line caps (300
lines for source, 500 for test). They were split into focused modules with no
intended behavior change; a delegated review then caught four behavior-parity
breaks the extraction had introduced, which were corrected before commit.

## Finish Report (2026-07-09)

### Scope

VS Code extension only (`extension/src/**`, TypeScript). No Dart/Flutter code,
no server code, no user-facing strings, no dependencies. Flutter l10n
validation is not applicable.

### What changed

The five files flagged by the quality-check line-limit warning were reduced
below their caps by extracting cohesive units into new modules. Extraction was
mechanical (move code, wire an import), preserving call semantics:

| Original (over cap) | Extracted modules |
| --- | --- |
| `extension-activation-event-wiring.ts` (338) | `extension-activation-autocapture-recommender.ts`, `extension-activation-heavy-sweep.ts` |
| `server-discovery-core.ts` (312) | `server-discovery-state-updater.ts`, `server-discovery-snapshot.ts` |
| `tree/drift-tree-provider.ts` (304) | `tree/drift-tree-refresh.ts` |
| `test/vscode-mock.ts` (310) | `test/vscode-mock-clipboard.ts`, `-dialog.ts`, `-message.ts`, `-fs.ts` |
| `test/snapshot-store.test.ts` (523) | `test/snapshot-store.test-helpers.ts`, `test/rows-to-objects.test.ts`, `test/compute-table-diff.test.ts` |

The auto-capture recommender and heavy-sweep scheduler became factory closures
(`createAutoCaptureRecommender`, `createHeavySweepScheduler`) consistent with
the existing extension style. The discovery updater is a plain function that
takes current state and returns the next state plus a `changed` flag. The tree
refresh became a `createTreeRefreshOrchestrator` closure owning the
coalescing/`_refreshing`/`_pendingRefresh` mechanics and the 55s safety-timeout
race. The vscode mock kept its unified `window`/`workspace`/`env` API objects in
the barrel file; only the backing state (`clipboardMock`, `dialogMock`,
`messageMock`, `writtenFiles`) moved out, exposed through accessors the API
objects read.

### Behavior-parity breaks found by review and corrected

A first attempt at the mock split moved the `window.show*` methods and
`workspace.fs`/`env` into the sub-files; the barrel's local objects shadowed
those re-exports, so `workspace.fs` and the dialog methods became undefined.
Corrected by keeping the API objects unified in the barrel and moving only
state.

A delegated deep-review pass over the extraction diff then found four semantic
divergences, each corrected:

1. **Discovery fired a stale server list.** The updater built an updated copy of
   the server map and the change event was fired (via a callback) *before* the
   core reassigned `this._servers` from that copy — so the first fire carried
   the pre-scan (empty) list. A listener reading the event argument (e.g.
   `ServerManager` auto-connect, discovery manifest publish) saw zero servers on
   first discovery. Fixed by removing the fire from the updater: it now returns
   `changed`, and the core reassigns `this._servers` and only then fires
   `this.servers`, matching the pre-refactor ordering exactly.
2. **Tree refresh cleared the schema on abort.** The pre-refactor outer catch
   (safety-timeout / unhandled error) logged only and left the table list
   intact, so a transient hang kept the last-known/offline schema visible. The
   extraction routed that catch to a state-clearing callback, blanking the tree
   to disconnected. Fixed: the abort path logs only; state is applied on the
   success path exclusively.
3. **Coalesced re-run bypassed the monitoring kill switch.** The queued
   follow-up refresh called the orchestrator's inner runner directly instead of
   re-entering the provider's `refresh()`, skipping the `isMonitoringKilled()`
   guard. If monitoring was killed between the in-flight refresh and its pending
   re-run, the re-run issued a full health/schema fetch. Fixed with a `reinvoke`
   callback bound to `() => this.refresh()` so the kill switch is re-checked.
4. **Pin store captured at construction.** The orchestrator captured
   `this._pinStore` in the constructor, but the pin store is assigned by
   `setPinStore()` *after* construction (`tree-commands.ts` after
   `extension-providers.ts`), so it was always `undefined` and pinned tables
   never rendered as pinned. Fixed by passing a live accessor
   `() => this._pinStore` read at refresh time. A now-dead `_log` field left by
   the extraction was removed at the same time.

Doc corrections: the updater header no longer claims to be "pure" (it mutates
tracked `IServerInfo` objects and fires notifications), and the tree-refresh
abort comment no longer mislabels the safety-timeout path as the monitoring
kill switch.

### Testing

- Full extension suite: 3012 passing, 0 failing (was 3011 before this change +
  1 new regression test).
- Moved test blocks preserved intact: `snapshot-store.test.ts` went 28 → 20
  `it()` blocks; the 8 removed (`rowsToObjects` ×1, `computeTableDiff` ×7) moved
  verbatim to the two new files (20 + 1 + 7 = 28).
- Added a discovery regression test,
  "fires onDidChangeServers with the freshly-found server in the payload, not a
  stale list," which drives a real scan through the private `_updateServers`
  path and asserts the **event argument** (not the `servers` getter) carries the
  found port. The pre-existing discovery tests only asserted the getter and so
  could not have caught break #1.
- `tsc --noEmit` clean.

### Follow-ups not taken (flagged, out of scope)

- `updateServersFromScan` has an 8-parameter signature — an options object would
  read better, but that is beyond a line-cap split.
- A shared `clearSchemaState()` helper for the tree provider's kill-switch
  branch was considered; after fixing break #2 the abort path no longer clears
  state, so only one clear site remains and the duplication is gone.
