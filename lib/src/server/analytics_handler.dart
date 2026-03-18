// Analytics handler extracted from _DriftDebugServerImpl.
// Handles index suggestions, size analytics, and anomaly detection.
//
// Core logic lives in index_analyzer.dart and anomaly_detector.dart.
// This handler provides HTTP wrappers, error logging, and size analytics.

import 'dart:convert';
import 'dart:io';

import 'anomaly_detector.dart';
import 'index_analyzer.dart';
import 'server_constants.dart';
import 'server_context.dart';
import 'server_utils.dart';

/// Handles analytics-related API endpoints.
///
/// Delegates core analysis to [IndexAnalyzer] and
/// [AnomalyDetector] for pure, testable logic. This
/// handler adds HTTP response handling, CORS headers,
/// and error logging via [ServerContext].
final class AnalyticsHandler {
  /// Creates an [AnalyticsHandler] with the given [ServerContext].
  AnalyticsHandler(this._ctx);

  final ServerContext _ctx;

  /// Returns index suggestions and table count
  /// (for HTTP and VM service RPC).
  ///
  /// Delegates to [IndexAnalyzer.getIndexSuggestionsList].
  Future<Map<String, dynamic>> getIndexSuggestionsList(DriftDebugQuery query) =>
      IndexAnalyzer.getIndexSuggestionsList(query);

  /// Handles GET /api/index-suggestions (writes JSON to [response]).
  Future<void> handleIndexSuggestions(
    HttpResponse response,
    DriftDebugQuery query,
  ) async {
    final res = response;
    try {
      final result = await IndexAnalyzer.getIndexSuggestionsList(query);
      _ctx.setJsonHeaders(res);
      res.write(jsonEncode(result));
    } on Object catch (error, stack) {
      _ctx.logError(error, stack);
      res.statusCode = HttpStatus.internalServerError;
      res.headers.contentType = ContentType.json;
      _ctx.setCors(res);
      res.write(
        jsonEncode(<String, String>{
          ServerConstants.jsonKeyError: error.toString(),
        }),
      );
    } finally {
      await res.close();
    }
  }

  /// Returns anomaly scan result for VM service RPC
  /// (Plan 68).
  ///
  /// Delegates to [AnomalyDetector.getAnomaliesResult]
  /// and wraps errors with [ServerContext.logError].
  Future<Map<String, dynamic>> getAnomaliesResult(DriftDebugQuery query) async {
    try {
      return await AnomalyDetector.getAnomaliesResult(query);
    } on Object catch (error, stack) {
      _ctx.logError(error, stack);
      return <String, String>{ServerConstants.jsonKeyError: error.toString()};
    }
  }

  /// Scans all tables for data quality anomalies.
  Future<void> handleAnomalyDetection(
    HttpResponse response,
    DriftDebugQuery query,
  ) async {
    final res = response;
    final result = await getAnomaliesResult(query);
    if (result.containsKey(ServerConstants.jsonKeyError)) {
      res.statusCode = HttpStatus.internalServerError;
      res.headers.contentType = ContentType.json;
      _ctx.setCors(res);
    } else {
      _ctx.setJsonHeaders(res);
    }
    res.write(jsonEncode(result));
    await res.close();
  }

  /// Handles GET /api/analytics/size: database-level and per-table
  /// storage metrics.
  Future<void> handleSizeAnalytics(
    HttpResponse response,
    DriftDebugQuery query,
  ) async {
    final res = response;

    try {
      // Helper to extract a single integer from a PRAGMA
      // result set (e.g. PRAGMA page_size → 4096).
      int pragmaInt(List<Map<String, dynamic>> rows) {
        if (rows.isEmpty) {
          return 0;
        }

        final v = rows.first.values.firstOrNull;

        return v is int ? v : int.tryParse('$v') ?? 0;
      }

      // Fetch database-level storage metrics from SQLite
      // PRAGMAs (page size, page count, freelist, journal).
      final pageSize = pragmaInt(
        ServerUtils.normalizeRows(await query('PRAGMA page_size')),
      );
      final pageCount = pragmaInt(
        ServerUtils.normalizeRows(await query('PRAGMA page_count')),
      );
      final freelistCount = pragmaInt(
        ServerUtils.normalizeRows(await query('PRAGMA freelist_count')),
      );

      final journalModeRows = ServerUtils.normalizeRows(
        await query('PRAGMA journal_mode'),
      );
      final journalMode =
          journalModeRows.firstOrNull?.values.firstOrNull?.toString() ??
          'unknown';

      // Compute aggregate sizes from page metrics.
      final totalSizeBytes = pageSize * pageCount;
      final freeSpaceBytes = pageSize * freelistCount;

      // Fetch per-table statistics: row count, column
      // count, and index list.
      final tableNames = await ServerUtils.getTableNames(query);
      final tableStats = <Map<String, dynamic>>[];

      for (final tableName in tableNames) {
        final countRows = ServerUtils.normalizeRows(
          await query(
            'SELECT COUNT(*) AS '
            '${ServerConstants.jsonKeyCountColumn} '
            'FROM "$tableName"',
          ),
        );
        final rowCount = ServerUtils.extractCountFromRows(countRows);

        final colInfoRows = ServerUtils.normalizeRows(
          await query('PRAGMA table_info("$tableName")'),
        );

        final indexRows = ServerUtils.normalizeRows(
          await query('PRAGMA index_list("$tableName")'),
        );
        final indexNames = indexRows
            .map((r) => r[ServerConstants.jsonKeyName]?.toString() ?? '')
            .where((n) => n.isNotEmpty)
            .toList();

        tableStats.add(<String, dynamic>{
          ServerConstants.jsonKeyTable: tableName,
          ServerConstants.jsonKeyRowCount: rowCount,
          'columnCount': colInfoRows.length,
          'indexCount': indexNames.length,
          'indexes': indexNames,
        });
      }

      // Sort tables by row count descending so the
      // largest tables appear first.
      tableStats.sort(
        (a, b) => ((b[ServerConstants.jsonKeyRowCount] as int?) ?? 0).compareTo(
          (a[ServerConstants.jsonKeyRowCount] as int?) ?? 0,
        ),
      );

      _ctx.setJsonHeaders(res);
      res.write(
        jsonEncode(<String, dynamic>{
          'pageSize': pageSize,
          'pageCount': pageCount,
          'freelistCount': freelistCount,
          'totalSizeBytes': totalSizeBytes,
          'freeSpaceBytes': freeSpaceBytes,
          'usedSizeBytes': totalSizeBytes - freeSpaceBytes,
          'journalMode': journalMode,
          ServerConstants.jsonKeyTableCount: tableNames.length,
          ServerConstants.jsonKeyTables: tableStats,
        }),
      );
    } on Object catch (error, stack) {
      _ctx.logError(error, stack);
      res.statusCode = HttpStatus.internalServerError;
      res.headers.contentType = ContentType.json;
      _ctx.setCors(res);
      res.write(
        jsonEncode(<String, String>{
          ServerConstants.jsonKeyError: error.toString(),
        }),
      );
    } finally {
      await res.close();
    }
  }
}
