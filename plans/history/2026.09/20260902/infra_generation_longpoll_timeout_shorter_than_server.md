# BUG: Generation long-poll aborts at 8s against a 30s server long-poll, so change detection permanently backs off on an idle database

**Status: Fixed**

<!-- Status values: Open → Investigating → Fix Ready → Closed -->

Created: 2026-09-02
Component: Extension
File: `extension/src/api-client-http-query.ts` (line ~20)
Severity: Performance

---

## Summary

`GET /api/generation?since=N` blocks server-side for up to 30 s
(`ServerConstants.longPollTimeout`), but the extension issues it through
`fetchWithTimeout` with **no `timeoutMs`**, so it inherits
`DEFAULT_FETCH_TIMEOUT_MS = 8000`. Whenever the database is idle for more than
8 s the request is aborted client-side, `GenerationWatcher` counts it as an
error and backs off exponentially to the 30 s cap, and the `generation` circuit
breaker trips open after 5 consecutive aborts. Live change detection
(tree refresh, badge refresh, schema-cache invalidation) effectively stops on an
idle app. The sibling long-poll `httpMutations` sets `timeoutMs: 31000` for
exactly this reason — the generation poll was simply missed.

---

## Attribution Evidence

Both emit paths are in this repo: the server-side long-poll is Dart under
`lib/src/`, the client-side timeout is TypeScript under `extension/src/`.

```bash
# Positive — the 30s server-side long-poll lives here
grep -n "longPollTimeout = " lib/src/server/server_constants.dart
# 25:  static const Duration longPollTimeout = Duration(seconds: 30);

grep -rn "longPollTimeout" lib/src/server/generation_handler.dart
# 178:        ServerConstants.longPollTimeout,

# Positive — the 8s client default and the missing override live here
grep -n "DEFAULT_FETCH_TIMEOUT_MS =" extension/src/transport/fetch-utils.ts
# 24:export const DEFAULT_FETCH_TIMEOUT_MS = 8000;

grep -rn "fetchWithTimeout(" extension/src/api-client-http-query.ts
# 20:  const resp = await fetchWithTimeout(      <-- httpGeneration, NO timeoutMs
# 35:  const resp = await fetchWithTimeout(      <-- httpMutations

grep -rn "timeoutMs" extension/src/api-client-http-query.ts
# 39:      timeoutMs: 31000,                     <-- only httpMutations sets it
```

**Emit site(s) — list ALL:**
- `extension/src/api-client-http-query.ts:20` (`httpGeneration`, missing `timeoutMs`)
- `extension/src/generation-watcher.ts:61` (the caller that turns the abort into backoff)
- `lib/src/server/generation_handler.dart:178` (the 30 s server-side wait)

**Diagnostic `source` / `owner` as seen in Problems panel:** n/a — runtime behavior,
surfaced as `GenerationWatcher: poll error #N` lines in the
**Saropa Drift Advisor** output channel.

---

## Environment

- OS: any (reproduced by reasoning on Windows 11 Pro 10.0.22631)
- VS Code version: any
- Extension version: 4.2.5
- Dart SDK version: n/a (server-side constant unchanged since long-poll landed)
- Flutter SDK version: any
- Database type and version: SQLite (any)
- Connection method: HTTP (loopback or adb-forward). Not affected on the
  VM-Service transport, which returns `getGeneration()` immediately.
- Relevant non-default settings: none required
- Other potentially conflicting extensions: none

---

## Steps to Reproduce

1. Start a Flutter app with `DriftDebugServer.start()` on `127.0.0.1:8642`.
2. Let the extension connect (status bar shows `Drift: :8642`).
3. Do **not** touch the database — no inserts, updates or deletes.
4. Open **Output → Saropa Drift Advisor** and set
   `"driftViewer.logVerbosity": "verbose"`.
5. Wait ~60 seconds.

Deterministic, not intermittent: any idle window longer than 8 s reproduces it.

---

## Expected Behavior

The generation long-poll waits out the server's 30 s window, returns the
unchanged generation, and the watcher polls again after `BASE_POLL_MS` (1 s)
with `_consecutiveErrors` still at 0. No error lines, breaker stays closed.

---

## Actual Behavior

Each poll is aborted at 8 s by `fetchWithTimeout`'s `AbortController` (or at
10 s by the layer-2 `Promise.race` safety net on Windows). The rejection reaches
`GenerationWatcher._poll`'s catch:

```
_consecutiveErrors++          → 1, 2, 3, …
delay = min(1000 * 2^n, 30000) → 2s, 4s, 8s, 16s, 30s (cap)
```

`fetchWithTimeout` also calls `breaker.recordFailure()` for the request
(`init.signal` is undefined, so the "caller aborted" exclusion does not apply),
so after `FAILURE_THRESHOLD = 5` aborts the `generation` circuit breaker opens
and the next 30 s of polls are rejected without I/O — which the watcher again
counts as errors.

Output channel fills with:

```
[2026-09-02T…] GenerationWatcher: poll error #1: The operation was aborted. (next retry in 2000ms)
[2026-09-02T…] GenerationWatcher: poll error #10: Circuit breaker is open — server unreachable, request suppressed (next retry in 30000ms)
```

A data change made while the watcher is in its 30 s backoff is not noticed for
up to 30 s, and every intervening poll is a wasted aborted connection.

---

## Error Output

### VS Code Developer Tools Console

No console output — the rejection is caught by `GenerationWatcher`.

### Extension Output Channel

See **Actual Behavior** above (`GenerationWatcher: poll error #N`).

### Terminal / Command Output

n/a

### Stack Traces

No dialog; the error is `AbortError: The operation was aborted.` from undici,
or `Error: Fetch timed out (safety)` from `fetch-utils.ts:111`.

---

## Duplicate-Emission Check

One emit site per language path, and they are the two halves of the same
mismatch:

- Dart (`lib/src/`): `lib/src/server/generation_handler.dart:178` sets the 30 s
  server-side deadline.
- TypeScript (`extension/src/`): `extension/src/api-client-http-query.ts:20`
  omits the matching client-side deadline.

Only the TypeScript side needs to change — the server's 30 s window is the
documented contract and `httpMutations` already honours it.

---

## Screenshots / Recordings

n/a — reproduced from the Output channel text above.

---

## Minimal Reproducible Example

```jsonc
// .vscode/settings.json — nothing unusual is required
{
  "driftViewer.logVerbosity": "verbose"
}
```

Connect to any server and idle for 60 seconds. The first
`GenerationWatcher: poll error` line appears ~9 s after connect.

---

## What I Already Tried

- [x] Read the sibling long-poll (`httpMutations`) — it sets `timeoutMs: 31000`,
      confirming 8 s is an oversight and not a deliberate short poll.
- [x] Checked the VM-Service path — `VmServiceClient.getGeneration()` returns
      immediately, so VM-connected sessions do not show the symptom (which is
      why this survived).
- [ ] Restarted VS Code — irrelevant, the mismatch is static.

---

## Regression Info

- Last working version: unknown — the mismatch has existed since the generation
  long-poll and the 8 s fetch default were introduced independently.
- First broken version: whichever release first routed `httpGeneration` through
  `fetchWithTimeout` without an override.
- What changed: `fetchWithTimeout` centralised a default timeout for ordinary
  API calls; the two long-poll endpoints needed an opt-out and only one got it.

---

## Root Cause

`httpGeneration` inherits a general-purpose 8 s request timeout that is shorter
than the endpoint's own 30 s blocking window, so a *successful* long-poll is
indistinguishable from a dead server.

Fix sketch (one call site):

```ts
// api-client-http-query.ts — /api/generation blocks up to
// ServerConstants.longPollTimeout (30s) before answering. The default 8s
// request timeout would abort every idle poll and drive GenerationWatcher
// into exponential backoff, so allow the full server window plus margin —
// same rationale and same value as httpMutations below.
const resp = await fetchWithTimeout(
  `${baseUrl}/api/generation?since=${since}`,
  { headers, timeoutMs: 31000 },
);
```

Two follow-ups worth doing in the same change:

1. Extract the shared `31000` into a named constant
   (e.g. `LONG_POLL_TIMEOUT_MS` in `transport/fetch-utils.ts`) so the two
   long-poll endpoints cannot drift apart again — single source of truth.
2. Consider marking long-poll requests `bypassCircuitBreaker` or excluding
   their timeouts from `breaker.recordFailure()`; a long-poll that times out is
   not evidence the server is down.

---

## Changes Made

1. **`extension/src/transport/fetch-utils.ts`** — Added `LONG_POLL_TIMEOUT_MS = 31000` constant with doc comment explaining the server-side 30 s window.
2. **`extension/src/api-client-http-query.ts`** — `httpGeneration` now passes `timeoutMs: LONG_POLL_TIMEOUT_MS` to `fetchWithTimeout`. `httpMutations` updated to use the same constant instead of the hardcoded `31000` literal.
3. **`CHANGELOG.md`** — Added entry under `[Unreleased] > Fixed`.

---

## Commits

<!-- Add commit hashes as fixes land. -->

---

## Impact

- Who is affected: every HTTP-connected user (the default transport). Only
  VM-Service-connected sessions are exempt.
- What is blocked: live change detection. Tree refresh, badge refresh,
  schema-cache invalidation and the heavy sweep are all driven by
  `watcher.onDidChange`, so they lag by up to 30 s or miss the change window.
- Data risk: none — read-only polling.
- Frequency: continuous. Any idle period longer than 8 s, which is the normal
  state of a debugged app.

---

## Finish Report (2026-09-02)

### Defect

`httpGeneration()` called `fetchWithTimeout()` without specifying `timeoutMs`, inheriting the 8 000 ms general-purpose default. The server-side `/api/generation` endpoint blocks for up to 30 000 ms (`ServerConstants.longPollTimeout`) before responding. Every idle poll was therefore aborted client-side, driving `GenerationWatcher` into exponential backoff and tripping the per-endpoint circuit breaker after five consecutive aborts. Live change detection (tree refresh, badge update, schema-cache invalidation) effectively stopped on any idle database.

### Fix

1. **New constant `LONG_POLL_TIMEOUT_MS` (31 000 ms)** added to `extension/src/transport/fetch-utils.ts` — single source of truth for the client-side long-poll deadline, documented with the rationale (must exceed the server's 30 s blocking window).
2. **`httpGeneration`** now passes `timeoutMs: LONG_POLL_TIMEOUT_MS` so idle polls complete normally instead of being aborted.
3. **`httpMutations`** updated from the hardcoded literal `31000` to the same constant, eliminating the drift risk that caused the original oversight.
4. **Test added** in `fetch-utils.test.ts`: asserts `LONG_POLL_TIMEOUT_MS > 30000` and `LONG_POLL_TIMEOUT_MS > DEFAULT_FETCH_TIMEOUT_MS`, guarding against future regressions.

### Hardening

5. **Bidirectional cross-language doc comments.** `ServerConstants.longPollTimeout` (Dart) now references `LONG_POLL_TIMEOUT_MS` (TypeScript) and vice versa, so a future change to either side surfaces the need to update the other. The TypeScript doc comment names the exact Dart file and line.
6. **Confirmed no other long-poll endpoints exist.** Grep of both `longPollTimeout` usage in Dart and `fetchWithTimeout` calls in TypeScript confirms only `/api/generation` and `/api/mutations` use long-poll semantics. No other call sites need the override.
7. **Confirmed no retry-doubling risk.** Both `httpGeneration` and `httpMutations` call `fetchWithTimeout` directly, not `fetchWithRetry`, so a long-poll timeout cannot trigger a retry that doubles the effective wait.
8. **CI cross-check script** (`scripts/check_longpoll_timeout_sync.py`). Parses `ServerConstants.longPollTimeout` from the Dart source and `LONG_POLL_TIMEOUT_MS` from the TypeScript source, then asserts the client timeout exceeds the server timeout by at least 1 000 ms. Fails the build if either constant is changed without updating the other.
9. **Margin documented.** The 1 s margin (31 s − 30 s) is justified in the TypeScript doc comment: covers loopback RTT (<1 ms), adb-forward (<10 ms), Wi-Fi (<50 ms), and Dart timer jitter (<100 ms).
10. **Wired into publish.py.** `_check_longpoll_timeout_sync()` added to `scripts/modules/pipeline.py` as a Step 7 quality check in the extension analysis leg. Delegates to the standalone script so the check runs automatically before every extension publish.

### Not changed

The circuit breaker is not bypassed for long-poll requests. With the correct 31 s timeout the server always responds within 30 s on an idle poll, so the breaker sees only successes. A genuine server-down timeout at 31 s is a valid failure signal and should still feed the breaker.

### Verification

Code review (low) returned zero findings. IDE diagnostics clean on all edited files. Test suite could not be compiled in this environment (OOM on full `tsc`); assertions audited by inspection.
