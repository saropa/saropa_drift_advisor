# 61 — App query-timing ingest (make `totalQueries` reflect real app traffic)

Status: IMPLEMENTED 2026-07-24 (advisor side). In-process ingest chosen; HTTP
endpoint deferred (§"Decision needed" resolved below). Consumer-side
`QueryInterceptor` wiring remains in the app repo (Saropa Contacts).
Origin: `bugs/BUG_EXPORT_PERF_SECTION_FALSE_POSITIVES.md` Finding 1.

## Resolution (2026-07-24)

Decisions taken: (1) in-process only — no HTTP endpoint (the server is
in-process; no out-of-process consumer exists); (2) explicit `app` origin via a
new `QueryTiming.appReported` flag — the interceptor has no meaningful caller
frame; (3) no per-query `StackTrace.current` capture — cost refused.

Shipped: `DriftDebugServer.reportAppQuery(sql, durationMs, rowCount, isWrite,
error)` (static → instance → `ServerContext.recordAppTiming`), tagged
`source: "app"`, kill-switch- and ring-buffer-bounded, feeding
`TableActivityTracker` so app writes drive the Finding 3 static-table ranking.
Web stub gained a matching no-op. The `QueryInterceptor` recipe lives in the
`reportAppQuery` doc comment (the package can't ship the interceptor itself
under the zero-`package:drift` contract). Tests in
`test/performance_handler_test.dart` (`recordAppTiming` group).

## Problem

`performance.totalQueries` is 0 in 95% of exports because the advisor only
records queries that flow through its own instrumented HTTP path
(`ServerContext.timedQuery`). The consuming app's Drift queries execute in the
app's own isolate against SQLite and never touch the advisor. The perf section
can therefore never reflect application workload — it only ever sees
advisor-issued traffic (schema browser, manual SQL console). See the note at
`lib/src/server/server_context.dart:610-612`: the buffer already anticipates
"user code queries flow through recordTiming ... via a custom executor
wrapper" — that wrapper has never existed.

## Key insight — the server is in-process

The Dart debug server runs INSIDE the consumer app (it is the in-app debug
server, not a separate process). So the app does not need HTTP to report
timings: it can hand them to the running `ServerContext` directly, in-process,
with zero serialization. HTTP ingest is only needed for an out-of-process
reporter, which no current consumer is. Design the in-process path first; the
HTTP endpoint is an optional later addition.

## Proposed design (in-process, recommended)

### 1. Ingest hook on the server

Add a public method that appends an externally-timed query to the existing
ring buffer, reusing `recordTiming`:

```dart
// On the public server object (DriftDebugServer) — forwards to ServerContext.
void reportAppQuery({
  required String sql,
  required int durationMs,
  required int rowCount,
  String? callerFile,
  int? callerLine,
});
```

- Records with `isInternal: false`. `source` resolves to `"app"` when the app
  supplies `callerFile`, else `"browser"` — so pass a caller when available.
  (Optionally add an explicit `QueryTiming.origin` field / `appReported` flag
  if we want a hard `"app"` tag independent of `callerFile`; decide during
  implementation. Additive to `toJson()`, so the export gains a field, no
  removals.)
- Honors the kill switch: no-op when `monitoringEnabled` is false (zero
  capture, matching `timedQuery`).
- Bounded by the same 500-entry `maxQueryTimings` ring buffer. If app volume
  makes 500 too small to be useful, that is a separate cap decision — and if
  raised, migrate `queryTimings` to `ListQueue` first (KNOWN-WEAK item).

### 2. Drift interceptor helper (consumer-side glue)

Provide a Drift `QueryInterceptor` the app installs on its database. Drift's
`QueryInterceptor` wraps `runSelect`/`runUpdate`/`runInsert`/`runDelete`; the
helper times each call and forwards to `reportAppQuery`. Ship it via the
existing duck-typing entry point so the zero-drift-dependency contract holds:
the helper lives behind `startDriftViewer` (already an `extension on Object`)
and only references Drift symbols the host already has — the package itself
still imports nothing from `package:drift`.

Open question for implementation: Drift interceptors do not expose a caller
stack frame, so `callerFile` will usually be null (source `"browser"`) unless
we capture `StackTrace.current` in the interceptor (cost per query — measure).
Leaning: capture the frame only in debug + behind a flag, since the whole
package is debug-only anyway.

### 3. Throttle / batching (only if HTTP path is added later)

In-process ingest is a direct list append — no batching needed. If an
out-of-process HTTP `POST /api/timings` is added later, batch + throttle there
(app query rates can be thousands/sec); never one request per query.

## Invariants to honor

- Server never imports `package:drift` — the interceptor helper stays behind
  the duck-typed `startDriftViewer` surface. (Contract §2.)
- New capture path must be bounded (reuse the 500-cap ring) and respect the
  kill switch. (Contract §7, §9.)
- Any new HTTP endpoint must be reachable by all three clients and not
  rethrow past `Router.onRequest`. (Contract §1, §5.)
- New public API must also exist on the web stub or web consumers break at
  compile time. (Contract §4.)

## Out of scope / follow-ups

- Distinguishing app read vs write in the perf view (interceptor knows which).
- Attributing timings to a Dart source line reliably.

## Decision needed before coding

1. In-process ingest only, or also the HTTP `POST /api/timings` endpoint?
2. Hard `"app"` origin tag (new `QueryTiming` field) vs. rely on `callerFile`?
3. Capture caller stack in the interceptor (cost) or accept `"browser"` source
   for app-reported rows?
