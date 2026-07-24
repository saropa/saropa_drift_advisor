// Performance handler extracted from _DriftDebugServerImpl.
// Handles query performance analytics.

import 'dart:convert';
import 'dart:io';

import 'server_context.dart';
import 'server_types.dart';

/// Handles performance analytics API endpoints.
final class PerformanceHandler {
  /// Creates a [PerformanceHandler] with the given [ServerContext].
  PerformanceHandler(this._ctx);

  final ServerContext _ctx;

  /// Returns performance data map for VM service RPC (Plan 68).
  ///
  /// [slowThresholdMs] controls the minimum duration (in ms) for a query
  /// to be classified as "slow". Defaults to 100 ms when omitted.
  Future<Map<String, dynamic>> getPerformanceData({int slowThresholdMs = 100}) {
    final timings = List<QueryTiming>.of(_ctx.queryTimings);

    // Drop PRAGMA statements from EVERY perf output, including recentQueries.
    // The schema browser issues one `PRAGMA table_info("<table>")` per table
    // through the instrumented query path (source:"browser"); browsing a
    // schema before an export otherwise fills the 50-entry recentQueries
    // window — and, on a large schema, evicts real app queries from the
    // 500-entry ring buffer — with the advisor measuring its own
    // introspection. These are never application workload, so they must not
    // appear in performance analytics or the exported report.
    // See plans/history/2026.07/2026.07.24/BUG_EXPORT_PERF_SECTION_FALSE_POSITIVES.md (Finding 2).
    final workloadTimings = timings.where((t) => !_isIntrospection(t)).toList();

    // Exclude extension-internal queries (change-detection probes,
    // sqlite_master lookups, etc.) so the extension's own overhead
    // is not reported as a user-application performance problem.
    // Aggregate stats, slow queries, and patterns all use this
    // filtered list; recentQueries still includes internal queries
    // (tagged via isInternal in JSON) for full visibility.
    final userTimings = workloadTimings.where((t) => !t.isInternal).toList();

    final totalQueries = userTimings.length;
    final totalDuration = userTimings.fold<int>(
      0,
      (sum, t) => sum + t.durationMs,
    );
    final avgDuration = totalQueries > 0
        ? (totalDuration / totalQueries).round()
        : 0;

    final slowQueries =
        userTimings.where((t) => t.durationMs > slowThresholdMs).toList()
          ..sort((a, b) => b.durationMs.compareTo(a.durationMs));

    final queryGroups = <String, List<QueryTiming>>{};
    for (final t in userTimings) {
      final key = t.sql.trim().length > 60
          ? t.sql.trim().substring(0, 60)
          : t.sql.trim();
      queryGroups.putIfAbsent(key, () => []).add(t);
    }

    final patterns =
        queryGroups.entries.map((e) {
          final durations = e.value.map((t) => t.durationMs).toList();
          final total = durations.fold<int>(0, (a, b) => a + b);
          final avg = total / durations.length;
          final max = durations.fold<int>(0, (a, b) => a > b ? a : b);
          return <String, dynamic>{
            'pattern': e.key,
            'count': durations.length,
            'avgMs': avg.round(),
            'maxMs': max,
            'totalMs': total,
          };
        }).toList()..sort(
          (a, b) => ((b['totalMs'] as int?) ?? 0).compareTo(
            (a['totalMs'] as int?) ?? 0,
          ),
        );

    final data = <String, dynamic>{
      'totalQueries': totalQueries,
      'totalDurationMs': totalDuration,
      'avgDurationMs': avgDuration,
      'slowThresholdMs': slowThresholdMs,
      'slowQueries': slowQueries.take(20).map((t) => t.toJson()).toList(),
      'queryPatterns': patterns.take(20).toList(),
      'recentQueries': workloadTimings.reversed
          .take(50)
          .map((t) => t.toJson())
          .toList(),
    };

    // Self-advertising discoverability (Finding 1): when NO query the advisor
    // has seen is app-sourced, the host almost certainly has not installed the
    // Drift QueryInterceptor, so this report reflects only advisor/browser
    // traffic — the `totalQueries: 0` (or PRAGMA-only) symptom the bug was filed
    // for. Attach the fix right where the symptom is read (this payload rides
    // into the exported sidecar). The hint clears itself the moment one app
    // query is recorded. A wired server with no traffic yet shows it briefly,
    // which is still correct guidance.
    final hasAppQueries = timings.any((t) => t.source == 'app');
    if (!hasAppQueries) {
      data['hint'] =
          'No application queries captured — recorded timings are advisor- or '
          'browser-issued only. Install a Drift QueryInterceptor that calls '
          'DriftDebugServer.reportAppQuery so this report reflects real app '
          'traffic. See example/lib/database/advisor_timing_interceptor.dart.';
    }

    return Future<Map<String, dynamic>>.value(data);
  }

  /// True when a timing records the advisor's own schema introspection rather
  /// than application workload. Two forms:
  ///  - any `PRAGMA` statement — the schema browser's `PRAGMA table_info`
  ///    sweeps and the handlers that inspect column metadata all emit PRAGMAs
  ///    the developer never wrote;
  ///  - any statement referencing `sqlite_master` / `sqlite_schema` — the
  ///    engine's schema catalog, read only to enumerate tables/indexes, never
  ///    application data.
  ///
  /// The original fix matched PRAGMA alone; the catalog check hardens against a
  /// future internal helper that introspects via `SELECT ... FROM sqlite_master`
  /// on the instrumented path instead of PRAGMA. A developer who manually runs
  /// such a query in the SQL console is likewise inspecting the schema, not
  /// exercising app workload, so excluding it from performance stats is correct
  /// either way. Matching is case-insensitive after trimming leading space.
  static bool _isIntrospection(QueryTiming t) {
    final normalized = t.sql.trimLeft().toUpperCase();
    return normalized.startsWith('PRAGMA') ||
        normalized.contains('SQLITE_MASTER') ||
        normalized.contains('SQLITE_SCHEMA');
  }

  /// GET /api/analytics/performance — returns query timing stats,
  /// slow queries, and patterns.
  ///
  /// Accepts optional `?slowThresholdMs=<int>` query parameter to
  /// override the default 100 ms slow-query threshold.
  Future<void> handlePerformanceAnalytics(
    HttpResponse response, {
    Uri? requestUri,
  }) async {
    final res = response;
    try {
      // Parse optional slow-threshold override from query string
      final thresholdParam = requestUri?.queryParameters['slowThresholdMs'];
      final threshold = thresholdParam != null
          ? (int.tryParse(thresholdParam) ?? 100)
          : 100;
      final data = await getPerformanceData(slowThresholdMs: threshold);
      _ctx.setJsonHeaders(res);
      res.write(jsonEncode(data));
    } on Object catch (error, stack) {
      _ctx.logError(error, stack);
      await _ctx.sendErrorResponse(res, error);
      return;
    }
    await res.close();
  }

  /// Clears recorded query timings (for VM service RPC and DELETE).
  void clearPerformance() {
    _ctx.queryTimings.clear();
  }

  // -------------------------------------------------------
  // History sidebar endpoints
  // -------------------------------------------------------

  /// GET /api/history — returns the full query timing ring buffer
  /// (most recent first, up to [ServerConstants.maxQueryTimings])
  /// with a computed `source` field on each entry.
  Future<void> handleHistory(HttpResponse response) async {
    final res = response;
    try {
      final entries = _ctx.queryTimings.reversed
          .map((t) => t.toJson())
          .toList();
      _ctx.setJsonHeaders(res);
      res.write(jsonEncode(<String, dynamic>{'entries': entries}));
    } on Object catch (error, stack) {
      _ctx.logError(error, stack);
      await _ctx.sendErrorResponse(res, error);
      return;
    }
    await res.close();
  }

  /// DELETE /api/history — clears all recorded query timings
  /// (shared with performance analytics since both read from the
  /// same ring buffer).
  Future<void> handleClearHistory(HttpResponse response) async {
    final res = response;
    try {
      _ctx.queryTimings.clear();
      _ctx.setJsonHeaders(res);
      res.write(jsonEncode(<String, String>{'status': 'cleared'}));
    } on Object catch (error, stack) {
      _ctx.logError(error, stack);
      await _ctx.sendErrorResponse(res, error);
      return;
    }
    await res.close();
  }

  /// DELETE /api/analytics/performance — clears all recorded query
  /// timings.
  Future<void> clearPerformanceData(HttpResponse response) async {
    final res = response;
    try {
      clearPerformance();
      _ctx.setJsonHeaders(res);
      res.write(jsonEncode(<String, String>{'status': 'cleared'}));
    } on Object catch (error, stack) {
      _ctx.logError(error, stack);
      await _ctx.sendErrorResponse(res, error);
      return;
    }
    await res.close();
  }
}
