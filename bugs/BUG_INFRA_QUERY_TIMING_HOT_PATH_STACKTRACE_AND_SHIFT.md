# BUG: Every instrumented query captures and regex-parses a full `StackTrace`, then evicts via `List.removeAt(0)`

**Status: Open**

Created: 2026-09-02
Component: Server
File: `lib/src/server/server_context.dart` (lines ~570, ~635-710)
Severity: Performance

---

## Summary

`ServerContext.timedQuery` — the wrapper every non-killed query passes through — does two expensive
things per call:

1. `StackTrace.current` is captured and `_parseCallerFrame` stringifies the whole trace and runs a
   regex over it. The method's own doc concedes the result is normally null ("This is expected when
   all queries originate from the server's own handlers"), so the cost is paid on every query for a
   value that is almost always discarded.
2. `recordTiming` evicts with `queryTimings.removeAt(0)` on a `List`, which shifts all 500 elements
   on every insert past the cap.

Both are the exact costs the codebase has already eliminated elsewhere: `QueryRecorder` moved to a
`ListQueue` specifically to avoid `removeAt(0)`, `TableActivityTracker` documents the same rule as a
memory contract, and `recordAppTiming` explicitly refuses per-query `StackTrace.current` capture
("a cost we refuse"). `timedQuery` was never brought in line.

---

## Attribution Evidence

```bash
# Positive — the per-query stack capture
grep -n "StackTrace.current" lib/src/server/server_context.dart
# 570:    final caller = _parseCallerFrame(StackTrace.current);
# 718:  /// meaningless and per-query `StackTrace.current` capture is a cost we refuse.

# _parseCallerFrame stringifies the whole trace and regexes it
grep -n "stack.toString()\|framePattern" lib/src/server/server_context.dart
# 643:    final framePattern = RegExp(r'#\d+\s+\S+\s+\((.+?):(\d+):\d+\)');
# 645:    for (final match in framePattern.allMatches(stack.toString())) {

# The O(n) eviction on a per-query hot path
grep -rn "removeAt(0)" lib/src/
# lib/src/query_recorder.dart:86:  // List.removeAt(0) shifts every element — at the 5000-entry default that made
# lib/src/server/server_context.dart:301:      snapshots.removeAt(0);
# lib/src/server/server_context.dart:705:      queryTimings.removeAt(0);
# lib/src/server/table_activity_tracker.dart:65:/// `List.removeAt(0)`, which shifts every element per eviction on what is a

# The buffer is a plain List despite being called a ring buffer
grep -n "queryTimings\|maxQueryTimings" lib/src/server/server_context.dart lib/src/server/server_constants.dart
# lib/src/server/server_constants.dart:10:  /// Ring buffer of recent query timings for the performance monitor (max [maxQueryTimings] entries).
# lib/src/server/server_constants.dart:11:  static const int maxQueryTimings = 500;
# lib/src/server/server_context.dart:501:  final List<QueryTiming> queryTimings = [];
```

**Emit site(s) — list ALL:** `lib/src/server/server_context.dart:570` (stack capture),
`lib/src/server/server_context.dart:705` (`removeAt(0)`),
`lib/src/server/server_context.dart:301` (`removeAt(0)` on snapshots — same pattern, far lower
frequency).
**Diagnostic `source` / `owner` as seen in Problems panel:** n/a (runtime server behavior).

---

## Environment

- OS:
- VS Code version:
- Extension version:
- Dart SDK version:
- Flutter SDK version (if applicable):
- Database type and version: SQLite (any)
- Connection method: HTTP loopback
- Relevant non-default settings: `monitoringEnabled: true` (the default; the kill switch short-
  circuits both costs)
- Other potentially conflicting extensions:

---

## Steps to Reproduce

1. Start the server against a schema with ~40 tables so change detection and the schema browser both
   drive traffic.
2. Long-poll `/api/generation` from the viewer (the normal state) — `checkDataChange` runs on every
   tick.
3. Open the schema browser, which issues one `PRAGMA table_info` per table through
   `instrumentedQuery`.
4. Profile the connected app (Dart DevTools CPU profiler) during step 3.

`StackTrace.current` plus `toString()` plus `RegExp.allMatches` over the resulting multi-KB string
appear on the profile for every query, and once the 500-entry cap is reached every subsequent
`recordTiming` performs a 500-element `List` shift.

---

## Expected Behavior

The instrumented path should cost approximately one `Stopwatch` and one object allocation per query.
Caller attribution, if kept, should be opt-in.

---

## Actual Behavior

Per query: one `StackTrace.current`, one full trace `toString()`, one regex sweep over it, and —
past the cap — one O(500) list shift. On a mobile embedder under a long-poll plus schema-browse
workload this is measurable overhead attributed to the *app*, not to the advisor, which is exactly
the attribution problem the `isInternal` machinery exists to prevent.

---

## Error Output

No error. The symptom is CPU cost and, on lower-end devices, the "host app startup freeze / sluggish
while the advisor is attached" class of report.

---

## Duplicate-Emission Check

Dart-only.

---

## What I Already Tried

- [x] Confirmed `_parseCallerFrame` skips `saropa_drift_advisor/src/server/`, `dart:`, and
      `package:flutter/` frames — so for a server-originated query it walks the entire trace and
      returns null
- [x] Confirmed `queryTimings` is a plain `List`, unlike `QueryRecorder._queries` (`ListQueue`) and
      `TableActivityTracker`'s event ring (`ListQueue`)
- [x] Confirmed `recordAppTiming` deliberately skips the stack capture for the same reason

---

## Regression Info

- Last working version: n/a
- First broken version:
- What changed: `QueryRecorder` was converted to `ListQueue` in the
  `plans/history/2026.06/2026.06.12/full-codebase-audit-2026.06.12.md` M7 fix; `queryTimings` was
  missed in that pass

---

## Root Cause

Two independent omissions: the audit's `removeAt(0)` sweep did not reach `ServerContext`, and the
caller-attribution feature was built speculatively ("The infrastructure is in place so that when
user code queries flow through `recordTiming`…") without a cost gate.

**Proposed fix sketch:**

1. Change `queryTimings` to a `ListQueue<QueryTiming>` and evict with `removeFirst()`. Update the
   two readers that index it (`PerformanceHandler.getPerformanceData`,
   `PerformanceHandler.handleHistory`) — both already copy to a `List` first.
2. Gate the stack capture behind a `captureCallerFrames` flag on `ServerContext`, defaulting to
   **off**, plumbed from a `DriftDebugServer.start` parameter. Hosts that actually consume
   `callerFile`/`callerLine` opt in.
3. When enabled, bound the work: pass `StackTrace.current` through
   `Trace.from(...).frames.take(N)` or cap the regex to the first ~10 frames rather than the whole
   string.
4. Apply the same `ListQueue` treatment to `ServerContext.snapshots` eviction
   (`server_context.dart:301`) for consistency, though at 20 entries it is not hot.
5. Extend `test/stress_performance_test.dart` with an assertion that recording 10 000 timings stays
   under a wall-clock budget, so a future regression to `removeAt(0)` is caught.

---

## Changes Made

<!-- Fill in when a fix is written. -->

---

## Commits

<!-- Add commit hashes as fixes land. -->

---

## Impact

- Who is affected: every host with monitoring enabled — i.e. the default.
- What is blocked: nothing; the cost is silent overhead attributed to the app under profiling.
- Data risk: none.
- Frequency: every single instrumented query.
