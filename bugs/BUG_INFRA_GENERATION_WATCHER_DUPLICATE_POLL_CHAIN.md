# BUG: GenerationWatcher has no poll-epoch guard, so every server switch forks a duplicate poll chain and applies the old server's generation

**Status: Open**

<!-- Status values: Open → Investigating → Fix Ready → Closed -->

Created: 2026-09-02
Component: Extension
File: `extension/src/generation-watcher.ts` (line ~56)
Severity: Performance

---

## Summary

`GenerationWatcher.stop()` clears the pending `setTimeout` but cannot cancel a
poll that is already awaiting the network. The activation wiring calls
`stop(); reset(); start();` synchronously on every active-server change, so
`_running` is back to `true` before the old in-flight poll resolves. That poll
then passes its `if (!this._running) return;` guard, writes the **old** server's
generation into the freshly reset counter, fires every listener, and schedules
its own `setTimeout` — leaving two independent poll chains racing on one
`_pollTimeout` field. Each subsequent server switch adds another chain.

---

## Attribution Evidence

Both the watcher and its caller are in this repo's extension tree; there is no
Dart counterpart.

```bash
# Positive — the watcher and its (absent) epoch guard live here
grep -n "_running\|_pollTimeout\|reset()" extension/src/generation-watcher.ts
# 18:  private _running = false;
# 21:  private _pollTimeout: ReturnType<typeof setTimeout> | undefined;
# 43:    if (this._running) return;
# 44:    this._running = true;
# 49:    this._running = false;
# 50:    if (this._pollTimeout !== undefined) {
# 51:      clearTimeout(this._pollTimeout);
# 52:      this._pollTimeout = undefined;
# 57:    if (!this._running) return;
# 62:      if (!this._running) return;
# 82:    if (this._running) {
# 83:      this._pollTimeout = setTimeout(() => this._poll(), delay);
# 88:  reset(): void {

# Positive — the synchronous stop/reset/start on every server change
grep -n "watcher.stop()\|watcher.reset()\|watcher.start()" \
  extension/src/extension-activation-event-wiring.ts
# 109:      d.watcher.stop();
# 110:      d.watcher.reset();
# 111:      d.watcher.start();

# Negative — no GenerationWatcher in the Dart tree
grep -rn "GenerationWatcher" lib/src/
# Expected: 0 matches
```

**Emit site(s) — list ALL:**
- `extension/src/generation-watcher.ts:56` (`_poll`, guards on `_running` only)
- `extension/src/extension-activation-event-wiring.ts:109-111` (the caller that
  re-arms `_running` before the old poll settles)

**Diagnostic `source` / `owner` as seen in Problems panel:** n/a — runtime behavior.

---

## Environment

- OS: any
- VS Code version: any
- Extension version: 4.2.5
- Dart SDK version: any
- Flutter SDK version: any
- Database type and version: SQLite (any)
- Connection method: HTTP
- Relevant non-default settings: none
- Other potentially conflicting extensions: none

---

## Steps to Reproduce

1. Run two apps that each start a Drift debug server, on ports 8642 and 8643.
2. Let the extension connect to 8642.
3. While the generation poll is in flight (the window is up to the full request
   timeout — see the related report
   `plans/history/2026.09/20260902/infra_generation_longpoll_timeout_shorter_than_server.md`, which makes it
   8 s wide today and 31 s wide after that fix), run
   **Drift: Select Server** and pick `:8643`.
4. Repeat step 3, switching back and forth, five times.
5. Watch the network/Output activity: the generation endpoint is now hit ~5×
   more often than the intended once-per-`delay` cadence.

Intermittent by nature — it fires whenever the switch lands inside an in-flight
poll. With a 30 s long-poll window (post-fix of the sibling bug) that is close to
100 % of switches; today it is ~8 s out of every ~9 s cycle.

---

## Expected Behavior

A server switch retires the previous polling session entirely. Exactly one poll
chain exists at any time, and a result from the previous server is discarded —
the same guarantee `ServerDiscovery` gets from its `_pollId` counter and
`DriftViewerPanel` gets from `_loadSeq`.

---

## Actual Behavior

Interleaving on a switch at `t1`:

| time | chain A (old server) | chain B (new server) |
|------|----------------------|----------------------|
| t0   | `await client.generation(0)` in flight | — |
| t1   | — | `stop()` sets `_running=false`; `_pollTimeout` is `undefined` (nothing to clear); `reset()` zeroes `_generation`; `start()` sets `_running=true` and calls `_poll()` |
| t2   | resolves; line 62 `if (!this._running) return;` **passes** because start() re-armed it | in flight |
| t2   | writes old server's `gen` into `_generation`, fires all listeners | — |
| t2   | line 83 schedules its own `setTimeout`, **overwriting** `_pollTimeout` | its own handle is now untracked |

Two consequences:

1. **Duplicate poll chains.** `_pollTimeout` holds one handle, so a later
   `stop()` cancels one chain and orphans the other. The orphan survives until
   its next `_poll()` observes `_running === false` — which never happens while
   the extension is enabled, because `start()` is called again on the next
   connect. N switches ⇒ up to N concurrent chains, N× the generation traffic
   and N× the listener fan-out (tree refresh, badges, hover cache clear,
   codelens, watch manager, heavy sweep).
2. **One spurious full refresh per switch.** `reset()` sets `_generation = 0`;
   chain A then writes server A's generation (say 47) and fires
   `onDidChange` — a schema-cache invalidation plus a full tree/badge/sweep
   cycle against server B for a change that happened on server A.

`ServerDiscovery` solves exactly this with `_pollId` (incremented in `stop()`,
captured per poll, re-checked after every await). `GenerationWatcher` has no
equivalent.

---

## Error Output

### VS Code Developer Tools Console

Nothing — no error is thrown; the duplication is silent.

### Extension Output Channel

Duplicated `GenerationWatcher: poll error #N` sequences with independently
advancing counters are the observable tell when the server is also unreachable.

### Terminal / Command Output

n/a

### Stack Traces

n/a — no exception.

---

## Duplicate-Emission Check

Single language path. `grep -rn "GenerationWatcher" lib/src/` returns nothing;
the whole watcher is TypeScript.

---

## Screenshots / Recordings

n/a.

---

## Minimal Reproducible Example

```ts
// Sketch of the failing sequence, independent of VS Code:
const w = new GenerationWatcher(client);   // client.generation() hangs 8s
w.start();                                 // chain A begins, awaits
setTimeout(() => { w.stop(); w.reset(); w.start(); }, 100); // chain B begins
// After ~8s: chain A resolves, sees _running === true, and schedules again.
// Instrument client.generation to count calls — the rate doubles.
```

---

## What I Already Tried

- [x] Compared with `ServerDiscovery._pollId` — the same class of race is
      already solved there, which is the pattern to copy.
- [x] Compared with `DriftViewerPanel._loadSeq` — same monotonic-sequence idea.
- [x] Read `extension/src/test/generation-watcher.test.ts` — it covers
      start/stop/backoff/dispose but has **no** test that calls `stop()` while a
      poll is in flight, which is why this survived.

---

## Regression Info

- Last working version: never worked — the guard has been absent since the class
  was written.
- First broken version: the release that first called `stop(); reset(); start();`
  from the active-server listener.
- What changed: n/a.

---

## Root Cause

`_poll()` re-checks a *mutable global* (`_running`) instead of a *per-session
identity*. `_running` is a level, not an epoch, so a stop/start pair inside the
await window is invisible to the in-flight poll.

Fix sketch — mirror `ServerDiscovery._pollId`:

```ts
/**
 * Monotonic polling-session id. stop() bumps it, so a poll that was already
 * awaiting the network when the session was retired (the server-switch case:
 * stop(); reset(); start() runs synchronously and re-arms _running before the
 * old await settles) discards its result instead of writing the previous
 * server's generation and scheduling a second, untracked poll chain.
 */
private _pollId = 0;

stop(): void {
  this._running = false;
  this._pollId++;                 // retire this polling session
  if (this._pollTimeout !== undefined) { … }
}

start(): void {
  if (this._running) return;
  this._running = true;
  void this._poll(this._pollId);  // capture the current epoch
}

private async _poll(id: number): Promise<void> {
  if (!this._running || id !== this._pollId) return;
  …
  const gen = await this._client.generation(this._generation);
  if (!this._running || id !== this._pollId) return;   // superseded — drop it
  …
  if (this._running && id === this._pollId) {
    this._pollTimeout = setTimeout(() => this._poll(id), delay);
  }
}
```

Note the `catch` branch needs the same `id !== this._pollId` check before it
touches `_consecutiveErrors` or schedules, exactly as
`ServerDiscovery._poll`'s catch does.

---

## Changes Made

<!-- Fill in when a fix is written. -->

---

## Commits

<!-- Add commit hashes as fixes land. -->

---

## Impact

- Who is affected: anyone who switches servers, and — because
  `onDidChangeActive` also fires on auto-switch after a server dies — anyone on
  a flaky link where the active server drops and a survivor is auto-adopted.
- What is blocked: nothing outright; the extension keeps working but does
  progressively more redundant work (extra generation polls, extra full tree
  refreshes, extra heavy sweeps against the connected app's single DB
  connection — the same contention class as `BUG_STARTUP_HANG`).
- Data risk: none — read-only polling.
- Frequency: once per server switch / auto-switch, cumulative for the session.
