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

  @override
  Future<void> runCustom(
    QueryExecutor executor,
    String statement,
    List<Object?> args,
  ) => _timed(
    statement,
    // customStatement carries anything: DDL, PRAGMA, or an app INSERT/UPDATE.
    // Classify by the leading keyword so app writes issued this way still count
    // toward the mutation signal; introspection PRAGMAs are filtered out
    // server-side anyway. runCustom returns void → row count 0.
    !_isReadKeyword(statement),
    (_) => 0,
    () => executor.runCustom(statement, args),
  );

  @override
  Future<void> runBatched(
    QueryExecutor executor,
    BatchedStatements statements,
  ) => _timed(
    // A batch is one or more writes applied together; time it as a single
    // write pulse. The combined statement text is not reconstructed here — a
    // short label keeps the perf row readable.
    'BATCH (${statements.statements.length} statements)',
    true,
    (_) => 0,
    () => executor.runBatched(statements),
  );

  /// True when [sql]'s first keyword is a read (SELECT/WITH). Used only to
  /// classify runCustom; leading whitespace and a `--`/`/* */` comment prefix
  /// are tolerated so a commented statement is not misclassified.
  static bool _isReadKeyword(String sql) {
    final head = sql.trimLeft().toUpperCase();
    return head.startsWith('SELECT') || head.startsWith('WITH');
  }
}
