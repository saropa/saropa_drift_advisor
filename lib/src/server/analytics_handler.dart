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

  /// Returns a merged list of index suggestions and anomalies in the
  /// stable issue shape for GET /api/issues. [sources] is optional:
  /// comma-separated "index-suggestions" and/or "anomalies"; when null
  /// or empty (or invalid), both sources are included.
  ///
  /// On error from either analysis, returns a map containing
  /// [ServerConstants.jsonKeyError]; callers should respond with 500.
  Future<Map<String, dynamic>> getIssuesList(
    DriftDebugQuery query, {
    String? sources,
  }) async {
    final filter = _parseSourcesFilter(sources);
    final issues = <Map<String, dynamic>>[];

    if (filter.includeIndexSuggestions) {
      try {
        final result = await IndexAnalyzer.getIndexSuggestionsList(query);
        if (result.containsKey(ServerConstants.jsonKeyError)) {
          return result;
        }
        final suggestions =
            result['suggestions'] as List<Map<String, dynamic>>? ?? [];
        for (final s in suggestions) {
          final table = s[ServerConstants.jsonKeyTable] as String? ?? '';
          final column = s[ServerConstants.jsonKeyColumn] as String?;
          final reason = s['reason'] as String? ?? '';
          final sql = s[ServerConstants.jsonKeySql] as String?;
          final priority = s[ServerConstants.jsonKeyPriority] as String? ?? '';
          final severity = priority == 'high' ? 'warning' : 'info';
          final message = column != null && column.isNotEmpty
              ? '$table.$column: $reason'
              : reason;
          final issueMap = <String, dynamic>{
            ServerConstants.jsonKeySource: 'index-suggestion',
            ServerConstants.jsonKeySeverity: severity,
            ServerConstants.jsonKeyTable: table,
            ServerConstants.jsonKeyMessage: message,
            ServerConstants.jsonKeySuggestedSql: sql,
            ServerConstants.jsonKeyPriority: priority,
          };
          if (column != null && column.isNotEmpty) {
            issueMap[ServerConstants.jsonKeyColumn] = column;
          }
          issues.add(issueMap);
        }
      } on Object catch (error, stack) {
        _ctx.logError(error, stack);
        return <String, dynamic>{
          ServerConstants.jsonKeyError: error.toString(),
        };
      }
    }

    if (filter.includeAnomalies) {
      try {
        final result = await AnomalyDetector.getAnomaliesResult(query);
        if (result.containsKey(ServerConstants.jsonKeyError)) {
          return result;
        }
        final anomalies =
            result['anomalies'] as List<Map<String, dynamic>>? ?? [];
        for (final a in anomalies) {
          final table = a[ServerConstants.jsonKeyTable] as String? ?? '';
          final column = a[ServerConstants.jsonKeyColumn] as String?;
          final message = a[ServerConstants.jsonKeyMessage] as String? ?? '';
          final severity =
              a[ServerConstants.jsonKeySeverity] as String? ?? 'info';
          final type = a[ServerConstants.jsonKeyType] as String?;
          final count = a[ServerConstants.jsonKeyCount] as int?;
          final issue = <String, dynamic>{
            ServerConstants.jsonKeySource: 'anomaly',
            ServerConstants.jsonKeySeverity: severity,
            ServerConstants.jsonKeyTable: table,
            ServerConstants.jsonKeyMessage: message,
          };
          if (column != null && column.isNotEmpty) {
            issue[ServerConstants.jsonKeyColumn] = column;
          }
          if (type != null) issue[ServerConstants.jsonKeyType] = type;
          if (count != null) issue[ServerConstants.jsonKeyCount] = count;
          issues.add(issue);
        }
      } on Object catch (error, stack) {
        _ctx.logError(error, stack);
        return <String, dynamic>{
          ServerConstants.jsonKeyError: error.toString(),
        };
      }
    }

    return <String, dynamic>{ServerConstants.jsonKeyIssues: issues};
  }

  /// Parses [sources] query param (comma-separated "index-suggestions",
  /// "anomalies"). Returns which sources to include. When null/empty or
  /// invalid, both are included; when only one token is present, only
  /// that source is included.
  ({bool includeIndexSuggestions, bool includeAnomalies}) _parseSourcesFilter(
    String? sources,
  ) {
    if (sources == null || sources.trim().isEmpty) {
      return (includeIndexSuggestions: true, includeAnomalies: true);
    }
    final parts = sources
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .toList();
    if (parts.isEmpty) {
      return (includeIndexSuggestions: true, includeAnomalies: true);
    }
    final hasIndex = parts.any((p) => p == 'index-suggestions');
    final hasAnomalies = parts.any((p) => p == 'anomalies');
    if (hasIndex && hasAnomalies) {
      return (includeIndexSuggestions: true, includeAnomalies: true);
    }
    if (hasIndex) {
      return (includeIndexSuggestions: true, includeAnomalies: false);
    }
    if (hasAnomalies) {
      return (includeIndexSuggestions: false, includeAnomalies: true);
    }
    return (includeIndexSuggestions: true, includeAnomalies: true);
  }

  /// Handles GET /api/issues: merged index suggestions and anomalies
  /// in a stable issue shape. Writes JSON to [response].
  Future<void> handleIssues(
    HttpRequest request,
    HttpResponse response,
    DriftDebugQuery query,
  ) async {
    final res = response;
    final sources = request.uri.queryParameters['sources'];
    try {
      final result = await getIssuesList(query, sources: sources);
      if (result.containsKey(ServerConstants.jsonKeyError)) {
        res.statusCode = HttpStatus.internalServerError;
        res.headers.contentType = ContentType.json;
        _ctx.setCors(res);
        res.write(
          jsonEncode(<String, String>{
            ServerConstants.jsonKeyError:
                result[ServerConstants.jsonKeyError] as String,
          }),
        );
      } else {
        _ctx.setJsonHeaders(res);
        res.write(jsonEncode(result));
      }
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
