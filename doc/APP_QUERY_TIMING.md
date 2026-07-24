# Capturing your app's query performance

**Audience:** developers integrating `saropa_drift_advisor` into an app who want
the **Performance** tab and the exported report to show their app's real Drift
queries. This is the single source of truth for that integration; it links to
the working code and the API reference where useful.

## The problem this solves

The advisor only times queries **it** issues (schema browser, the web SQL
console, its own probes). Your app's Drift queries run inside your app and never
pass through the advisor, so out of the box:

- `performance.totalQueries` is `0`,
- `recentQueries` / `slowQueries` are empty (or contain only advisor traffic),
- exported reports carry no usable app performance data.

The fix is to forward each query's timing to the advisor from inside your app.
You do this once, with a Drift `QueryInterceptor`.

> If you have *not* wired this up, the performance payload includes a `hint`
> field pointing you back here — that is the symptom, not a separate bug.

## Prerequisites

1. The advisor server is started in your app (`startDriftViewer(...)` or
   `DriftDebugServer.start(...)`). See the **Quick start** in the
   [README](../README.md#quick-start).
2. Your app uses Drift with a `QueryExecutor` you control (the normal case:
   `NativeDatabase`, `drift_flutter`, etc.).

## Step 1 — add the interceptor

Copy the ready-made, tested interceptor into your project:

- **Code to copy:** [`example/lib/database/advisor_timing_interceptor.dart`](../example/lib/database/advisor_timing_interceptor.dart)
- **Test that pins its behavior:** [`example/test/advisor_timing_interceptor_test.dart`](../example/test/advisor_timing_interceptor_test.dart)

It lives in the example rather than the package because `saropa_drift_advisor`
deliberately does **not** depend on `package:drift` (that keeps it
version-agnostic and usable with `drift_sqlite_async` / custom executors). A
`QueryInterceptor` subclass necessarily imports drift, so it belongs in your
app, where drift is already a dependency.

The essential shape (the copy above is the complete version — it also handles
`runCustom` and `runBatched`):

```dart
import 'package:drift/drift.dart';
import 'package:saropa_drift_advisor/saropa_drift_advisor.dart';

class AdvisorTimingInterceptor extends QueryInterceptor {
  Future<T> _timed<T>(String sql, bool isWrite, int Function(T) rowCountOf,
      Future<T> Function() run) async {
    final sw = Stopwatch()..start();
    try {
      final result = await run();
      DriftDebugServer.reportAppQuery(
          sql: sql, durationMs: sw.elapsedMilliseconds,
          rowCount: rowCountOf(result), isWrite: isWrite);
      return result;
    } on Object catch (e) {
      DriftDebugServer.reportAppQuery(
          sql: sql, durationMs: sw.elapsedMilliseconds,
          rowCount: 0, isWrite: isWrite, error: e.toString());
      rethrow;
    }
  }

  @override
  Future<List<Map<String, Object?>>> runSelect(
          QueryExecutor e, String s, List<Object?> a) =>
      _timed(s, false, (r) => r.length, () => e.runSelect(s, a));
  @override
  Future<int> runInsert(QueryExecutor e, String s, List<Object?> a) =>
      _timed(s, true, (r) => r, () => e.runInsert(s, a));
  @override
  Future<int> runUpdate(QueryExecutor e, String s, List<Object?> a) =>
      _timed(s, true, (r) => r, () => e.runUpdate(s, a));
  @override
  Future<int> runDelete(QueryExecutor e, String s, List<Object?> a) =>
      _timed(s, true, (r) => r, () => e.runDelete(s, a));
}
```

## Step 2 — install it on your executor

Wrap the executor you pass to your database, gated on `kDebugMode` so release
builds carry zero overhead:

```dart
import 'package:flutter/foundation.dart' show kDebugMode;

final base = NativeDatabase(file);
final executor = kDebugMode
    ? base.interceptWith(AdvisorTimingInterceptor())
    : base;
final db = AppDatabase(executor);
```

See [`example/lib/database/app_database.dart`](../example/lib/database/app_database.dart)
for this wiring in context.

That is the whole integration. `reportAppQuery` is a no-op when the advisor
server is not running, so the interceptor is safe to leave installed.

## Verify it worked

Open the **Performance** tab (or export a report) and check:

- entries show `"source": "app"`,
- `totalQueries` climbs as your app runs queries,
- the `hint` field is gone.

While the `hint` is still present, the wiring is not taking effect — see
Troubleshooting. The `source` and `hint` fields are documented under
`GET /api/analytics/performance` in [doc/API.md](API.md).

## Troubleshooting — "I wired it but still see `totalQueries: 0`"

1. **Wrong isolate (most common).** `DriftDebugServer` is a per-isolate
   singleton. The interceptor must run in the **same isolate** as the started
   server. If your database runs on a background isolate (drift's
   `computeWithDatabase`, an isolate-hosted executor), start the server **and**
   install the interceptor on that isolate — otherwise `reportAppQuery` reaches
   a never-started instance and silently no-ops.
2. **`kDebugMode` mismatch.** If the advisor is started with
   `enabled: kDebugMode` but the interceptor is installed unconditionally (or
   vice versa), the two disagree about when they are active. Gate both the same
   way.
3. **Work goes through `runCustom` / batches.** Plain `customStatement(...)`
   calls and Drift batches are handled by the complete example interceptor
   (`runCustom` classified by leading keyword, `runBatched` as a write). If you
   hand-rolled a minimal interceptor with only `runSelect`/`runInsert`/…, those
   paths are not timed — copy the full example instead.

## Alternative: the callback API (no interceptor)

If you use the callback form (`DriftDebugServer.start(query: ...)`) or a
non-Drift executor, you can call `reportAppQuery` directly from wherever you
execute SQL — the interceptor is just the turnkey way to do that for Drift.
`reportAppQuery` is the stable public entry point; its full contract (including
the isolate rule) is documented on the method itself in
`DriftDebugServer.reportAppQuery`.

## Reference

- Working code: [`example/lib/database/advisor_timing_interceptor.dart`](../example/lib/database/advisor_timing_interceptor.dart)
- API — `GET /api/analytics/performance` (`source`, `hint` fields): [doc/API.md](API.md)
- Starting the server: [README → Quick start](../README.md#quick-start)
