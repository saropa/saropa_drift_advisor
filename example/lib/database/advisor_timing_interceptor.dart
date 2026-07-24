// A Drift QueryInterceptor that forwards each query's timing to the Drift
// Advisor, so `performance.totalQueries` and the exported report reflect REAL
// application traffic (Feature 61 / BUG_EXPORT_PERF_SECTION_FALSE_POSITIVES
// Finding 1). Without it the advisor only sees queries it issues itself, and
// `totalQueries` stays 0.
//
// This lives in the EXAMPLE, not in the saropa_drift_advisor package, on
// purpose: the package must not depend on `package:drift` (it duck-types the
// database so it works with any drift version, drift_sqlite_async, or a custom
// executor — see the package README). A QueryInterceptor subclass necessarily
// imports drift, so it belongs in your app, where drift is already a
// dependency. Copy this file (or reference it) into your project.
//
// Wire it by intercepting your executor:
//
// ```dart
// final executor = NativeDatabase(file).interceptWith(AdvisorTimingInterceptor());
// return AppDatabase._(executor, dbPath: path);
// ```

import 'package:drift/drift.dart';
import 'package:saropa_drift_advisor/saropa_drift_advisor.dart';

/// Times every read/write Drift runs and reports it via
/// [DriftDebugServer.reportAppQuery]. Calling that is a no-op when the advisor
/// server is not running (release builds, or before `startDriftViewer`), so
/// this interceptor is safe to leave installed unconditionally.
class AdvisorTimingInterceptor extends QueryInterceptor {
  /// Times [run], reports the timing (success or failure), and returns/rethrows.
  /// [rowCountOf] maps the result to a row count — affected-row count for
  /// writes, result-length for selects. [isWrite] drives the advisor's
  /// table-activity signal (writes mark a table as mutated, which the
  /// static-table candidate ranking relies on).
  Future<T> _timed<T>(
    String statement,
    bool isWrite,
    int Function(T result) rowCountOf,
    Future<T> Function() run,
  ) async {
    final stopwatch = Stopwatch()..start();
    try {
      final result = await run();
      DriftDebugServer.reportAppQuery(
        sql: statement,
        durationMs: stopwatch.elapsedMilliseconds,
        rowCount: rowCountOf(result),
        isWrite: isWrite,
      );
      return result;
    } on Object catch (error) {
      DriftDebugServer.reportAppQuery(
        sql: statement,
        durationMs: stopwatch.elapsedMilliseconds,
        rowCount: 0,
        isWrite: isWrite,
        error: error.toString(),
      );
      rethrow;
    }
  }

  @override
  Future<List<Map<String, Object?>>> runSelect(
    QueryExecutor executor,
    String statement,
    List<Object?> args,
  ) => _timed(
    statement,
    false,
    (rows) => rows.length,
    () => executor.runSelect(statement, args),
  );

  @override
  Future<int> runInsert(
    QueryExecutor executor,
    String statement,
    List<Object?> args,
  ) => _timed(
    statement,
    true,
    (affected) => affected,
    () => executor.runInsert(statement, args),
  );

  @override
  Future<int> runUpdate(
    QueryExecutor executor,
    String statement,
    List<Object?> args,
  ) => _timed(
    statement,
    true,
    (affected) => affected,
    () => executor.runUpdate(statement, args),
  );

  @override
  Future<int> runDelete(
    QueryExecutor executor,
    String statement,
    List<Object?> args,
  ) => _timed(
    statement,
    true,
    (affected) => affected,
    () => executor.runDelete(statement, args),
  );

  // runCustom / runBatched are intentionally left to the default (untimed):
  // runCustom carries DDL, PRAGMA, and transaction framing — not app-data
  // workload the perf report is about — and per-statement timing of a batch
  // would need to split the batch. Add overrides here if you want them.
}
