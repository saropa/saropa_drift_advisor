# BUG: Three phase-10 event subscriptions are discarded instead of registered, so their listeners outlive disposal

**Status: Open**

<!-- Status values: Open → Investigating → Fix Ready → Closed -->

Created: 2026-09-02
Component: Extension
File: `extension/src/extension-activation-event-wiring.ts` (line ~95)
Severity: Low

---

## Summary

`wireEventListeners` registers the three most consequential connection listeners
— active-server change, discovery-servers change, and generation change — by
calling the emitter and **throwing the returned `Disposable` away**. Every other
subscription in the same function, and every equivalent listener elsewhere in the
extension, is pushed onto `context.subscriptions`. The three closures capture
`providers`, `schemaCache`, `diagnostics`, `intel` and the status bars, so they
keep that entire graph reachable after disposal, and the `GenerationWatcher` one
in particular can never be detached because the watcher has no `dispose()` that
clears its listener array.

---

## Attribution Evidence

Activation wiring is TypeScript-only.

```bash
# Positive — the three discarded subscriptions
grep -n "onDidChangeActive(\|onDidChangeServers(\|watcher.onDidChange(" \
  extension/src/extension-activation-event-wiring.ts
#  95:  d.serverManager.onDidChangeActive((server) => {
# 158:  d.discovery.onDidChangeServers(() => {
# 176:  d.watcher.onDidChange(() => {
# (none of the three is wrapped in d.context.subscriptions.push)

# Positive — the SAME file pushes its other subscriptions, so this is inconsistency
grep -n "d.context.subscriptions.push" extension/src/extension-activation-event-wiring.ts
#  84:  d.context.subscriptions.push(        <-- onDidChangeConfiguration
# 155:  d.context.subscriptions.push({ dispose: () => clearTimeout(syncContextTimeout) });
# 165:    d.context.subscriptions.push(      <-- treeView.onDidChangeVisibility
# 225:  d.context.subscriptions.push({ dispose: () => d.watcher.stop() });

# Positive — every comparable listener elsewhere IS registered
grep -rn "onDidChangeActive(\|watcher.onDidChange(" --include=*.ts extension/src \
  | grep -v "/test/"
# extension-activation-event-wiring.ts:95    <-- discarded
# extension-activation-event-wiring.ts:176   <-- discarded
# extension-feature-commands.ts:98           (inside context.subscriptions.push)
# invariants/invariant-commands.ts:211       (inside context.subscriptions.push)
# monitoring/monitoring-kill-switch.ts:158   (inside context.subscriptions.push)
# schema-timeline/schema-tracker.ts:26       (stored as this._disposable)
# suite/commit-timeline-panel.ts:61          (inside context.subscriptions.push)
# suite/diagnostics-mirror.ts:152            (inside context.subscriptions.push)
# suite/drift-health-panel.ts:97             (inside context.subscriptions.push)

# Positive — GenerationWatcher has no dispose(); listeners are only removable
# through the handle that was discarded
grep -n "onDidChange(listener\|dispose\|_listeners" extension/src/generation-watcher.ts
# 20:  private _listeners: Listener[] = [];
# 33:  onDidChange(listener: Listener): { dispose: () => void } {
# 34:    this._listeners.push(listener);
# 37:        this._listeners = this._listeners.filter((l) => l !== listener);
# (no dispose() method on the class)

# Negative — no activation wiring in the Dart tree
grep -rn "wireEventListeners" lib/src/
# Expected: 0 matches
```

**Emit site(s) — list ALL:**
- `extension/src/extension-activation-event-wiring.ts:95`
  (`serverManager.onDidChangeActive`)
- `extension/src/extension-activation-event-wiring.ts:158`
  (`discovery.onDidChangeServers`)
- `extension/src/extension-activation-event-wiring.ts:176`
  (`watcher.onDidChange`)

**Diagnostic `source` / `owner` as seen in Problems panel:** n/a — disposal
hygiene, not a diagnostic.

---

## Environment

- OS: any
- VS Code version: any
- Extension version: 4.2.5
- Dart SDK version: any
- Flutter SDK version: any
- Database type and version: SQLite (any)
- Connection method: any
- Relevant non-default settings: none
- Other potentially conflicting extensions: none

---

## Steps to Reproduce

This is a static defect; the observable consequence is scoped by what currently
holds the emitters alive.

1. Open `extension/src/extension-activation-event-wiring.ts`.
2. Compare line 165 (`d.context.subscriptions.push(d.providers.treeView.onDidChangeVisibility(...))`)
   with lines 95, 158 and 176.
3. The three connection listeners return `vscode.Disposable` /
   `{ dispose(): void }` values that are dropped on the floor.

To see it bite today, add a second `wireEventListeners` call (or call
`activate()` twice against one watcher instance in a test harness): the
generation listener fires twice per change, and there is no handle with which to
remove either copy.

---

## Expected Behavior

Every subscription created during activation is registered on
`context.subscriptions`, so VS Code detaches it on deactivation — the invariant
the rest of the file, and the rest of the extension, already follows.

---

## Actual Behavior

The three handles are discarded. Practical consequences, stated honestly rather
than inflated:

- **`onDidChangeActive` (line 95) and `onDidChangeServers` (line 158)** are
  partly rescued by accident: `ServerManager.dispose()` disposes
  `_onDidChangeActive` and `ServerDiscovery.dispose()` disposes both of its
  emitters, and both objects *are* registered
  (`extension-bootstrap.ts:155-156`). So on a normal deactivation these
  listeners do get torn down — but only because the emitter dies, not because
  the subscription was managed. Disposal order is not guaranteed, and the
  listener will fire during teardown if the emitter is disposed after some of
  the state its closure touches.
- **`watcher.onDidChange` (line 176) is not rescued at all.**
  `GenerationWatcher` exposes no `dispose()`; the only way to remove a listener
  is the handle returned by `onDidChange`, which was discarded. The registered
  disposable at line 225 calls `watcher.stop()`, which halts polling but leaves
  `_listeners` populated. The closure keeps `schemaCache`, `intel`, `providers`
  (tree/definition/hover/codelens/badges/watch manager), `DashboardPanel` and
  the heavy-sweep scheduler reachable for the lifetime of the watcher object.

The concrete risk this creates is a latent one: any future change that
re-invokes `wireEventListeners` (a re-wire on enable/disable, a hot-reload path,
a second workspace folder) silently doubles the listener set with no way to undo
it — and the generation listener is the most expensive one in the extension,
triggering a full tree refresh, badge refresh, hover/definition cache clears and
a heavy DB sweep.

---

## Error Output

### VS Code Developer Tools Console

Nothing — no error is produced.

### Extension Output Channel

Nothing.

### Terminal / Command Output

n/a

### Stack Traces

n/a — no exception.

---

## Duplicate-Emission Check

Three sites, one file, one language path. `grep -rn "wireEventListeners" lib/src/`
returns nothing, so there is no Dart path to mirror the fix into.

---

## Screenshots / Recordings

n/a.

---

## Minimal Reproducible Example

```ts
// The shape of the defect:
d.watcher.onDidChange(() => { /* expensive refresh closure */ });
//  ^ returns { dispose(): void } — discarded

// The shape used everywhere else in the same file:
d.context.subscriptions.push(
  d.providers.treeView.onDidChangeVisibility((e) => { … }),
);
```

---

## What I Already Tried

- [x] Verified the other seven comparable listeners in the extension are all
      registered — this is a three-site inconsistency, not a project convention.
- [x] Verified `ServerManager.dispose()` and `ServerDiscovery.dispose()` are
      themselves registered, which is why two of the three are only latently
      broken and the third is genuinely unremovable.
- [x] Verified `GenerationWatcher` has no `dispose()`, so the discarded handle
      is the only removal path for its listener.
- [x] Confirmed `wireEventListeners` is currently called exactly once, so no
      duplicate-listener symptom exists in shipped behavior today.

---

## Regression Info

- Last working version: n/a — the three sites have never registered their
  handles.
- First broken version: the release that extracted phase 10 into
  `extension-activation-event-wiring.ts`.
- What changed: n/a.

---

## Root Cause

`Event<T>` returns a `Disposable` that is easy to ignore, and TypeScript raises
nothing for an unused return value. Three sites were written without the
`context.subscriptions.push(...)` wrapper the surrounding code uses.

Fix sketch — wrap all three, and give `GenerationWatcher` a real `dispose()` so
its listeners are removable even when a caller forgets:

```ts
// extension-activation-event-wiring.ts — register the handles like every other
// subscription in this file. Without this the closures (which capture providers,
// schemaCache, intel and the status bars) stay attached after disposal, and the
// watcher listener in particular is unremovable: GenerationWatcher has no
// dispose(), so the handle returned here is the ONLY detach path.
d.context.subscriptions.push(
  d.serverManager.onDidChangeActive((server) => { … }),
);
d.context.subscriptions.push(
  d.discovery.onDidChangeServers(() => { … }),
);
d.context.subscriptions.push(
  d.watcher.onDidChange(() => { … }),
);
```

```ts
// generation-watcher.ts — stop() halts polling but leaves _listeners populated,
// so a watcher whose subscription handles were lost keeps the whole provider
// graph reachable. Make teardown total.
dispose(): void {
  this.stop();
  this._listeners = [];
}
```

…and register the watcher itself (`context.subscriptions.push(watcher)`) in
`bootstrapExtension`, replacing the narrower
`{ dispose: () => d.watcher.stop() }` at line 225.

Worth considering as a follow-up: enable the TypeScript/ESLint rule that flags an
ignored `Disposable` return (`@typescript-eslint/no-unused-expressions` does not
catch this shape; a small custom rule or a `no-floating-disposable` convention
would), so the next occurrence is caught at build time rather than by review.

---

## Changes Made

<!-- Fill in when a fix is written. -->

---

## Commits

<!-- Add commit hashes as fixes land. -->

---

## Impact

- Who is affected: no user today — `wireEventListeners` runs once per activation
  and two of the three emitters are disposed by their owners.
- What is blocked: nothing currently. This is a latent-defect / hygiene report:
  it removes the safety margin for any future re-wiring, and it leaves the most
  expensive listener in the extension permanently attached to its watcher.
- Data risk: none.
- Frequency: n/a — static.
