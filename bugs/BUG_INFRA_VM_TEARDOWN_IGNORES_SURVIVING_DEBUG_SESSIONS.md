# BUG: Ending any one Dart/Flutter debug session tears down the VM transport even while other sessions are still running

**Status: Open**

<!-- Status values: Open → Investigating → Fix Ready → Closed -->

Created: 2026-09-02
Component: Extension
File: `extension/src/debug/debug-commands-vm.ts` (line ~190)
Severity: UX

---

## Summary

The `onDidTerminateDebugSession` handler in `debug-commands-vm.ts` checks only
that the *terminating* session is Dart/Flutter, then unconditionally clears the
VM client, stops perf auto-refresh, stops the DVR recorder, hides the DVR status
bar, clears diagnostics and logs "Drift disconnected". In a multi-session
workspace — app plus integration tests, or two flavors of the same app — ending
one session disconnects the extension from the other, which is still running and
still serving. `extension-bootstrap.ts` guards the identical event with
`if (!hasFlutterOrDartDebugSession())` and documents exactly this hazard, so the
correct pattern already exists one file away.

---

## Attribution Evidence

Debug-session teardown is TypeScript-only.

```bash
# Positive — the unguarded teardown
grep -n "onDidTerminateDebugSession" -A 6 extension/src/debug/debug-commands-vm.ts
# 190:    vscode.debug.onDidTerminateDebugSession((session) => {
# 191:      if (session.type !== 'dart' && session.type !== 'flutter') return;
# 192:      logConnection('Debug session ended. Drift disconnected.');
# 193:      void client.dvrStop().catch(() => { … });
# 196:      hideDvrStatusBar();
#      ^ no check for a surviving dart/flutter session

grep -n "setVmClient(null)\|stopAutoRefresh()\|diagnosticManager.clear()" \
  extension/src/debug/debug-commands-vm.ts
# 197:      client.setVmClient(null);
# 200:      perfProvider.stopAutoRefresh();
# 213:      diagnosticManager.clear();

# Positive — the SAME event, guarded, in the sibling file, with the rationale
grep -n "onDidTerminateDebugSession" -A 6 extension/src/extension-bootstrap.ts
# 233:    vscode.debug.onDidTerminateDebugSession(() => {
# 234:      // Stop only when NO dart/flutter session remains — a multi-session
# 235:      // workspace (e.g. app + tests) keeps supervision while any one is live.
# 236:      if (!hasFlutterOrDartDebugSession()) adbSupervisor.stop();
# 237:    }),

# The helper that already exists for this purpose
grep -n "export function hasFlutterOrDartDebugSession" -A 7 extension/src/android-forward.ts
# 39:export function hasFlutterOrDartDebugSession(): boolean {
# 40:  const session = vscode.debug.activeDebugSession;
# 41:  if (!session) return false;
# 42:  const t = session.type?.toLowerCase() ?? '';
# 43:  return t === 'dart' || t === 'flutter';
# 44:}

# Negative — no debug-session handling in the Dart tree
grep -rn "onDidTerminateDebugSession" lib/src/
# Expected: 0 matches
```

**Emit site(s) — list ALL:**
- `extension/src/debug/debug-commands-vm.ts:190-215` (the whole unguarded
  teardown block)

The guarded counterpart at `extension/src/extension-bootstrap.ts:233-237` is
correct and needs no change; it is cited here only as the reference pattern.

---

## Environment

- OS: any
- VS Code version: any
- Extension version: 4.2.5
- Dart SDK version: any
- Flutter SDK version: any
- Database type and version: SQLite (any)
- Connection method: VM Service (Plan 68) — and the HTTP fallback path, whose
  perf auto-refresh is stopped by the same handler
- Relevant non-default settings: none
- Other potentially conflicting extensions: none (Dart-Code is required for the
  debug sessions themselves)

---

## Steps to Reproduce

1. Open a Flutter project that uses Drift.
2. Start the app with **Run and Debug** (session A, type `flutter`). Let the
   extension attach over the VM Service — the status bar shows
   `Drift: VM Service`.
3. Start a second Dart/Flutter session (session B) — for example
   **Debug: Start Debugging** on an integration test, or a second launch
   configuration for a different flavor.
4. Stop **session B** only. Session A is still running and still serving.
5. Look at the status bar, the Database tree, and the Output channel.

Deterministic — 10 out of 10 whenever a second Dart/Flutter session terminates
while another is live. Order does not matter: stopping A first disconnects from
B just the same.

---

## Expected Behavior

Teardown runs only when **no** Dart/Flutter debug session remains, matching
`extension-bootstrap.ts:234-236`. Ending one of several sessions leaves the VM
transport, perf auto-refresh, DVR recording and diagnostics intact for the
session still running.

---

## Actual Behavior

Every listed teardown step runs on the first Dart/Flutter session to end:

| Line | Effect while another session is still live |
| --- | --- |
| 192 | Logs `Debug session ended. Drift disconnected.` — untrue |
| 193 | `client.dvrStop()` — stops the DVR recorder for the surviving app, discarding the recording the user is in the middle of |
| 196 | `hideDvrStatusBar()` — the recording indicator disappears |
| 197 | `client.setVmClient(null)` — closes the VM transport; `usingVmService` flips to `false` |
| 200 | `perfProvider.stopAutoRefresh()` — the Performance tree freezes |
| 213 | `diagnosticManager.clear()` — every Drift diagnostic vanishes from the Problems panel |

Downstream, `client.setVmClient(null)` also fires the VM-transport listeners, so
`isDriftUiConnected` drops to whatever HTTP discovery reports. If discovery has
no active server (the common case on a device where the VM Service was the only
transport), `ConnectionStateMachine` moves to `disconnected` and every
`when: driftViewer.serverConnected` affordance greys out — while the app is
still running and reachable.

Recovery is not automatic. The VM reconnect path is driven by
`registerVmServiceOutputListener`, which fires on **new** VM Service URIs in
debug-adapter output; the surviving session already printed its URI, and
`clearReported` is only called on a VM disconnect callback that this path does
not trigger. In practice the user must restart the surviving session or reload
the window.

Note on the helper: `hasFlutterOrDartDebugSession()` reads
`vscode.debug.activeDebugSession` (the single *active* session), not
`vscode.debug.sessions`. It is the right check to reuse for consistency with the
existing guard, but the fix should consider tightening it to scan
`vscode.debug.sessions` so the answer does not depend on which session the user
has focused in the Call Stack view — see **Root Cause**.

---

## Error Output

### VS Code Developer Tools Console

Nothing — no exception.

### Extension Output Channel

```
[…] Debug session started (flutter). Trying VM Service…
[…] Connected via VM Service (health ready after ~430ms).
[…] Debug session ended. Drift disconnected.          <-- fires when session B ends
```

The last line is the misleading one: it is emitted while session A is still
serving, and it is the only signal the user gets.

### Terminal / Command Output

n/a

### Stack Traces

None.

---

## Duplicate-Emission Check

Two handlers subscribe to `onDidTerminateDebugSession`:

- `extension/src/debug/debug-commands-vm.ts:190` — **unguarded** (this bug).
- `extension/src/extension-bootstrap.ts:233` — **guarded**, correct.

Both are TypeScript; `grep -rn "onDidTerminateDebugSession" lib/src/` returns
nothing, so there is no Dart path. Only the first needs to change.

---

## Screenshots / Recordings

A recording is the right artifact for this one (multi-step, timing-visible):
show two sessions in the Call Stack, stop one, and show the status bar flipping
to disconnected while the other session keeps logging.

---

## Minimal Reproducible Example

```jsonc
// .vscode/launch.json — two Dart/Flutter sessions is the whole setup
{
  "configurations": [
    { "name": "app",   "type": "flutter", "request": "launch", "program": "lib/main.dart" },
    { "name": "tests", "type": "dart",    "request": "launch", "program": "test/smoke_test.dart" }
  ]
}
```

Launch both, stop `tests`, observe the extension disconnect from `app`.

---

## What I Already Tried

- [x] Confirmed `extension-bootstrap.ts:234-236` guards the identical event and
      names the exact scenario ("a multi-session workspace (e.g. app + tests)"),
      so the hazard is already recognised in this codebase — just not applied
      here.
- [x] Traced the reconnect path: `registerVmServiceOutputListener` +
      `clearReported` only re-fire on a *new* URI in adapter output, so a
      surviving session does not self-heal.
- [x] Confirmed the handler's other effects (`dvrStop`, `diagnosticManager.clear`)
      are global, not per-session, so there is no partial-teardown subtlety to
      preserve.
- [x] Checked `debug-commands-vm.ts`'s `onDidStartDebugSession` — it correctly
      handles a second session starting; only the terminate path is asymmetric.

---

## Regression Info

- Last working version: never worked for multi-session workspaces.
- First broken version: the release that added the VM Service transport
  (Plan 68) and its teardown handler.
- What changed: the adb-forward supervisor later added the guarded version of
  the same listener; the VM teardown was not revisited.

---

## Root Cause

The handler treats "a Dart/Flutter session ended" as equivalent to "debugging
has ended". VS Code supports concurrent debug sessions, so the correct predicate
is "no Dart/Flutter session remains".

Fix sketch:

```ts
vscode.debug.onDidTerminateDebugSession((session) => {
  if (session.type !== 'dart' && session.type !== 'flutter') return;
  // Tear down only when NO dart/flutter session remains. A multi-session
  // workspace (app + integration tests, or two flavors) keeps the VM
  // transport, DVR recording and diagnostics alive while any one is live —
  // the same rule extension-bootstrap.ts applies to the adb-forward
  // supervisor. Without this, ending either session disconnected the
  // extension from the other, which was still running and still serving.
  if (hasAnyDartOrFlutterDebugSession()) return;
  logConnection('Debug session ended. Drift disconnected.');
  …
});
```

Because the surviving-session check is now load-bearing for correctness (not
just for suppressing an extra `stop()`), prefer a version that does not depend
on which session has focus:

```ts
/**
 * True when ANY dart/flutter debug session is still live. Distinct from
 * hasFlutterOrDartDebugSession(), which inspects only the single
 * `activeDebugSession` — adequate for the adb supervisor's best-effort stop,
 * but not for a teardown that closes the VM transport, where the answer must
 * not change based on which session the user selected in the Call Stack.
 */
export function hasAnyDartOrFlutterDebugSession(): boolean {
  return vscode.debug.sessions.some((s) => {
    const t = s.type?.toLowerCase() ?? '';
    return t === 'dart' || t === 'flutter';
  });
}
```

One ordering caveat to verify when implementing: whether
`vscode.debug.sessions` has already had the terminating session removed by the
time `onDidTerminateDebugSession` fires. If not, filter it out by
`s.id !== session.id`. A regression test with a mocked `debug.sessions` list
should pin whichever semantics hold.

---

## Changes Made

<!-- Fill in when a fix is written. -->

---

## Commits

<!-- Add commit hashes as fixes land. -->

---

## Impact

- Who is affected: anyone debugging with more than one Dart/Flutter session —
  running integration tests against a live app, or two flavors side by side.
- What is blocked: the VM Service connection to the surviving app, its
  Performance tree, its DVR recording (silently stopped mid-capture), and every
  Drift diagnostic. Recovery generally needs a session restart or window reload.
- Data risk: low. The DVR recording in progress is stopped, so captured query
  history for the surviving session is lost — irritating, not corrupting.
- Frequency: every time a second Dart/Flutter session ends.
