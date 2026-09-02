# BUG: ServerDiscovery.resume() during an in-flight scan forks a second poll chain, permanently doubling the port-scan rate

**Status: Open**

<!-- Status values: Open → Investigating → Fix Ready → Closed -->

Created: 2026-09-02
Component: Extension
File: `extension/src/server-discovery-core.ts` (line ~144)
Severity: Performance

---

## Summary

`pause()` clears the pending scan timer but does **not** bump `_pollId`, so an
already-awaiting `_poll` keeps its epoch. If `resume()` runs before that scan
resolves, `resume()` starts a fresh chain **and** the old scan — whose
`id === this._pollId` check still passes and whose `this._paused` check is now
`false` — schedules another `setTimeout`. Both chains then run forever on a
single `_pollTimeout` field, doubling the number of `/api/health` probes per
interval. Every pause/resume that straddles an in-flight scan adds one more
chain.

---

## Attribution Evidence

Discovery is TypeScript-only; there is no Dart counterpart.

```bash
# Positive — the pause/resume/poll trio lives here
grep -n "_pollId\|_paused\|_pollTimeout" extension/src/server-discovery-core.ts
# 34:  private _paused = false;
# 35:  private _pollId = 0;
# 36:  private _pollTimeout: ReturnType<typeof setTimeout> | undefined;
# 127:    this._pollId++;                       <-- stop() bumps the epoch
# 136:    this._paused = true;                  <-- pause() does NOT
# 147:    this._paused = false;
# 150:    void this._poll(this._pollId);        <-- resume() reuses the SAME epoch
# 196:    if (!this._running || id !== this._pollId) return;
# 219:      if (!this._running || id !== this._pollId) return;
# 244:    if (this._running && id === this._pollId) {
# 245:      if (this._paused) return;
# 250:      this._pollTimeout = setTimeout(

# Negative — no discovery poll loop in the Dart tree
grep -rn "ServerDiscovery" lib/src/
# Expected: 0 matches
```

**Emit site(s) — list ALL:**
- `extension/src/server-discovery-core.ts:134` (`pause()`, no `_pollId++`)
- `extension/src/server-discovery-core.ts:144` (`resume()`, unconditional `_poll`)
- `extension/src/server-discovery-core.ts:244-253` (the reschedule the orphan
  chain reaches)

**Diagnostic `source` / `owner` as seen in Problems panel:** n/a — runtime behavior,
visible as duplicated `Scan #N starting` lines in the **Saropa Drift Advisor**
output channel.

---

## Environment

- OS: any
- VS Code version: any
- Extension version: 4.2.5
- Dart SDK version: any
- Flutter SDK version: any
- Database type and version: SQLite (any)
- Connection method: HTTP discovery (any host)
- Relevant non-default settings: `"driftViewer.logVerbosity": "verbose"` to see it
- Other potentially conflicting extensions: none

---

## Steps to Reproduce

1. Open a Drift workspace and let discovery start.
2. Set `"driftViewer.logVerbosity": "verbose"` and open
   **Output → Saropa Drift Advisor**.
3. Watch for a `Discovery: Scan #N starting` line with no matching
   `Scan #N complete` yet — the scan is in flight (up to
   `HEALTH_PROBE_TIMEOUT_MS = 4500` ms when a port is filtered rather than
   refused, which is the normal case on a device/emulator link).
4. Within that window, click **Pause** then **Resume** in the discovery UI.
5. Read the log: the scan counter now advances two at a time and the interval
   between `Scan #N starting` lines is half the logged
   `Next scan in Ns` value.

Intermittent — it depends on hitting the in-flight window. On a link where
probes take the full 4.5 s timeout the window is several seconds wide per
30 s cycle; on fast connection-refused loopback it is very narrow.

---

## Expected Behavior

Pause/resume is idempotent with respect to concurrency: after any number of
pause/resume cycles exactly one scan chain exists, and the cadence stays at
`pollIntervalForState(state)`.

---

## Actual Behavior

Interleaving:

| time | chain A (pre-pause) | chain B (post-resume) |
|------|---------------------|-----------------------|
| t0   | `await scanPorts(...)` in flight, holds `id = 7` | — |
| t1   | — | `pause()`: `_paused = true`, `clearTimeout` (no pending timer), `_pollId` still **7** |
| t2   | — | `resume()`: `_paused = false`, `void this._poll(7)` — chain B begins |
| t3   | resolves; line 219 `id !== this._pollId` → `7 !== 7` is **false**, so it proceeds | in flight |
| t3   | line 244 passes, line 245 `if (this._paused) return;` is **false** now, so it schedules | its own handle gets overwritten |

`_pollTimeout` can only remember one handle, so a later `stop()`/`pause()`
cancels one chain and orphans the other. The orphan does eventually die —
`stop()` bumps `_pollId`, so the orphan's *next* `_poll` returns at line 196 —
but until then both chains run, and every extra chain means a full
`Promise.allSettled` fan-out over the whole configured port range
(`discovery.portRangeStart`–`portRangeEnd` plus `additionalPorts`) per tick.

Note this is strictly a `resume()` bug, not a `pause()` bug: `pause()` alone is
safe because the in-flight scan hits `if (this._paused) return;` at line 245 and
declines to reschedule. It only breaks when `resume()` clears `_paused` first.

---

## Error Output

### VS Code Developer Tools Console

Nothing — no exception.

### Extension Output Channel

```
[…] Discovery: Scan #12 starting — 127.0.0.1 ports 8642–8649 [state=searching]
[…] Discovery: Paused — discovery scans stopped until Resume
[…] Discovery: Resumed — scanning now
[…] Discovery: Scan #13 starting — 127.0.0.1 ports 8642–8649 [state=searching]
[…] Discovery: Scan #12 complete — no server found (empty scans so far: 5)
[…] Discovery: Next scan in 30s [state=searching, empty=5]     <-- chain A reschedules
[…] Discovery: Scan #13 complete — no server found (empty scans so far: 6)
[…] Discovery: Next scan in 30s [state=searching, empty=6]     <-- chain B reschedules
```

Two `Next scan in 30s` lines per cycle from then on.

### Terminal / Command Output

n/a

### Stack Traces

n/a — no exception.

---

## Duplicate-Emission Check

Single language path. `grep -rn "ServerDiscovery" lib/src/` returns nothing.

---

## Screenshots / Recordings

n/a — reproduced from the Output-channel text above.

---

## Minimal Reproducible Example

```ts
const d = new ServerDiscovery({ host: '127.0.0.1', portRangeStart: 8642, portRangeEnd: 8649 });
d.setLog({ appendLine: console.log });
d.start();                       // scan chain A begins and awaits a slow probe
setTimeout(() => { d.pause(); d.resume(); }, 50);  // inside the in-flight window
// Count `Scan #N starting` lines over the next two minutes — the rate doubles.
```

---

## What I Already Tried

- [x] Confirmed `stop()` DOES bump `_pollId` (line 127) — the guard exists, it is
      just not applied on the pause path.
- [x] Confirmed `retry()` is safe: it calls `stop()` (which bumps the epoch)
      before `start()`.
- [x] Read `extension/src/test/server-discovery.test.ts` — it has
      `'should not run further scans while paused'` but **no** test that
      resumes while a scan is in flight, which is why this survived.

---

## Regression Info

- Last working version: never — the asymmetry between `stop()` and `pause()` has
  been there since pause/resume were added.
- First broken version: the release that introduced `pause()`/`resume()`.
- What changed: n/a.

---

## Root Cause

`_pollId` is the epoch that retires a polling session, but only `stop()` bumps
it. `pause()` suspends the chain without retiring it, so `resume()` cannot tell
"restart the suspended chain" from "start a second chain" — and does the latter.

Fix sketch — make `pause()` retire the session, exactly as `stop()` does:

```ts
pause(): void {
  if (!this._running || this._paused) return;
  this._paused = true;
  // Retire the current polling session as stop() does. Without this bump an
  // in-flight scan keeps a matching _pollId, so a resume() that lands before
  // it resolves lets BOTH the old scan and the new chain reschedule — two
  // chains on one _pollTimeout, doubling the probe rate for the session.
  this._pollId++;
  if (this._pollTimeout !== undefined) {
    clearTimeout(this._pollTimeout);
    this._pollTimeout = undefined;
  }
  this._logLine('Paused — discovery scans stopped until Resume');
  this._emitDiscoveryUi(false);
}
```

`resume()` already reads `this._pollId` fresh, so it picks up the new epoch with
no further change. This does not affect the lost-toast debouncer or the notify
latch (neither is touched by `pause`), so the flaky-link contracts documented in
`server-discovery-lost-debounce.ts` are preserved.

---

## Changes Made

<!-- Fill in when a fix is written. -->

---

## Commits

<!-- Add commit hashes as fixes land. -->

---

## Impact

- Who is affected: users who pause and resume discovery — the documented way to
  stop scan noise while working, so a normal interaction.
- What is blocked: nothing outright. The cost is duplicated port-scan traffic
  against the app under debug (each chain fans out over the whole port range) and
  duplicated `onDidChangeServers` fan-out into the status bar and connection UI.
- Data risk: none — health probes are read-only.
- Frequency: once per pause/resume that straddles an in-flight scan; the extra
  chains accumulate for the session.
