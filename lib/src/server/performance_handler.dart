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

    // Exclude extension-internal queries (change-detection probes,
    // sqlite_master lookups, etc.) so the extension's own overhead
    // is not reported as a user-application performance problem.
    // Aggregate stats, slow queries, and patterns all use this
    // filtered list; recentQueries still includes internal queries
    // (tagged via isInternal in JSON) for full visibility.
    final userTimings = timings.where((t) => !t.isInternal).toList();

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
      'recentQueries': timings.reversed
          .take(50)
          .map((t) => t.toJson())
          .toList(),
    };
    return Future<Map<String, dynamic>>.value(data);
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
