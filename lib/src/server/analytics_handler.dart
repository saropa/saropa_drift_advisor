// Analytics handler extracted from _DriftDebugServerImpl.
// Handles index suggestions, size analytics, and anomaly detection.
//
// Core logic lives in index_analyzer.dart and anomaly_detector.dart.
// This handler provides HTTP wrappers, error logging, and size analytics.

import 'dart:convert';
import 'dart:io';

import 'anomaly_detector.dart';
import 'index_analyzer.dart';
import 'orphan_table_detector.dart';
import 'server_constants.dart';
import 'server_context.dart';
import 'server_types.dart';
import 'server_utils.dart';
import 'soft_relationship_detector.dart';

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

  /// Resolves the host's declared relationship manifest (Feature 78) into a
  /// plain list for the orphan-row anomaly check. Returns empty when no
  /// callback was supplied (host links by real SQLite FKs, or by nothing) or
  /// when the callback throws — a faulty host callback must not break anomaly
  /// scanning, mirroring the skip-on-throw posture of the schema metadata fold.
  List<DeclaredRelationship> _resolveDeclaredRelationships() {
    final callback = _ctx.declaredRelationships;
    if (callback == null) {
      return const <DeclaredRelationship>[];
    }
    try {
      return callback();
    } on Object catch (error, stack) {
      _ctx.logError(error, stack);
      return const <DeclaredRelationship>[];
    }
  }

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
      return await AnomalyDetector.getAnomaliesResult(
        query,
        declaredRelationships: _resolveDeclaredRelationships(),
      );
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

  /// Returns the orphan physical-table scan result for VM service RPC.
  ///
  /// Delegates to [OrphanTableDetector.getOrphanTablesResult], passing the
  /// Drift-declared table set from [ServerContext.declaredTableNames], and
  /// wraps errors with [ServerContext.logError].
  Future<Map<String, dynamic>> getOrphanTablesResult(
    DriftDebugQuery query,
  ) async {
    try {
      return await OrphanTableDetector.getOrphanTablesResult(
        query,
        declaredTableNames: _ctx.declaredTableNames,
      );
    } on Object catch (error, stack) {
      _ctx.logError(error, stack);
      return <String, String>{ServerConstants.jsonKeyError: error.toString()};
    }
  }

  /// Handles GET /api/analytics/orphan-tables: flags physical tables present
  /// in the database but absent from the Drift schema. Writes JSON to
  /// [response].
  Future<void> handleOrphanTables(
    HttpResponse response,
    DriftDebugQuery query,
  ) async {
    final res = response;
    final result = await getOrphanTablesResult(query);
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

  /// Returns the soft-relationship advisory result for VM service RPC and the
  /// dedicated endpoint (Feature 77).
  ///
  /// Delegates to [SoftRelationshipDetector.getSoftRelationshipsResult],
  /// passing the host relationship manifest (Feature 78) so manifested edges are
  /// subtracted (resolved). `manifest` is null when no callback was supplied —
  /// every inferred edge is then reported (`info`, opt-in) and
  /// `manifestAvailable` is false. Wraps errors with [ServerContext.logError].
  Future<Map<String, dynamic>> getSoftRelationshipsResult(
    DriftDebugQuery query,
  ) async {
    try {
      // Null manifest (no callback) ⇒ manifestAvailable:false; a present-but-
      // throwing callback degrades to an empty list (still available) via
      // _resolveDeclaredRelationships, never breaking the scan.
      final manifest = _ctx.declaredRelationships == null
          ? null
          : _resolveDeclaredRelationships();
      return await SoftRelationshipDetector.getSoftRelationshipsResult(
        query,
        manifest: manifest,
      );
    } on Object catch (error, stack) {
      _ctx.logError(error, stack);
      return <String, String>{ServerConstants.jsonKeyError: error.toString()};
    }
  }

  /// Handles GET /api/issues/soft-relationships: edges inferred from column
  /// naming (`<noun>_id`, shared `*UUID`) that no SQLite FK or manifest
  /// declares. Report-only. Writes JSON to [response].
  Future<void> handleSoftRelationships(
    HttpResponse response,
    DriftDebugQuery query,
  ) async {
    final res = response;
    final result = await getSoftRelationshipsResult(query);
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
        final result = await AnomalyDetector.getAnomaliesResult(
          query,
          declaredRelationships: _resolveDeclaredRelationships(),
        );
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

    // Orphan physical tables: only yields findings when the host supplied the
    // Drift-declared table set (via startDriftViewer or declaredTableNames).
    // Without it the detector returns an empty list, so this block is a no-op
    // rather than a source of false positives.
    if (filter.includeOrphanTables) {
      try {
        final result = await OrphanTableDetector.getOrphanTablesResult(
          query,
          declaredTableNames: _ctx.declaredTableNames,
        );
        final orphans = result['orphans'] as List<Map<String, dynamic>>? ?? [];
        for (final o in orphans) {
          final table = o[ServerConstants.jsonKeyTable] as String? ?? '';
          final message = o[ServerConstants.jsonKeyMessage] as String? ?? '';
          final severity =
              o[ServerConstants.jsonKeySeverity] as String? ?? 'warning';
          issues.add(<String, dynamic>{
            ServerConstants.jsonKeySource: 'orphan-table',
            ServerConstants.jsonKeySeverity: severity,
            ServerConstants.jsonKeyTable: table,
            ServerConstants.jsonKeyMessage: message,
            ServerConstants.jsonKeyType: OrphanTableDetector.orphanFindingType,
            ServerConstants.jsonKeySuggestedSql:
                o[ServerConstants.jsonKeySuggestedSql],
          });
        }
      } on Object catch (error, stack) {
        _ctx.logError(error, stack);
        return <String, dynamic>{
          ServerConstants.jsonKeyError: error.toString(),
        };
      }
    }

    // Soft relationships (Feature 77): edges inferred from column naming that
    // no SQLite FK or host manifest declares. Always safe to include — `info`
    // severity, and the finding carries its own from/to/rule so the merged
    // shape needs no per-consumer change (mirrors the orphan-table merge).
    if (filter.includeSoftRelationships) {
      try {
        final result = await getSoftRelationshipsResult(query);
        if (result.containsKey(ServerConstants.jsonKeyError)) {
          return result;
        }
        final softRels =
            result[ServerConstants.jsonKeySoftRelationships]
                as List<Map<String, dynamic>>? ??
            const <Map<String, dynamic>>[];
        for (final s in softRels) {
          issues.add(<String, dynamic>{
            ServerConstants.jsonKeySource: 'soft-relationship',
            ServerConstants.jsonKeySeverity:
                s[ServerConstants.jsonKeySeverity] ??
                SoftRelationshipDetector.severity,
            ServerConstants.jsonKeyTable: s[ServerConstants.fkFromTable] ?? '',
            ServerConstants.jsonKeyMessage:
                s[ServerConstants.jsonKeyMessage] ?? '',
            ServerConstants.jsonKeyType:
                SoftRelationshipDetector.softRelationshipFindingType,
            ServerConstants.fkFromTable: s[ServerConstants.fkFromTable],
            ServerConstants.fkFromColumn: s[ServerConstants.fkFromColumn],
            ServerConstants.fkToTable: s[ServerConstants.fkToTable],
            ServerConstants.fkToColumn: s[ServerConstants.fkToColumn],
            ServerConstants.jsonKeyRule: s[ServerConstants.jsonKeyRule],
          });
        }
      } on Object catch (error, stack) {
        _ctx.logError(error, stack);
        return <String, dynamic>{
          ServerConstants.jsonKeyError: error.toString(),
        };
      }
    }

    return _wrapIssuesEnvelope(issues);
  }

  /// Wraps the merged issue list in the Saropa Diagnostic Envelope (plan 67
  /// §2) so the sibling suite tools can consume `/api/issues` with stable
  /// attribution and version-gate the shape.
  ///
  /// Additive by design: every pre-existing issue field is preserved, so
  /// current `/api/issues` consumers (the Saropa Lints extension, scripts)
  /// keep working. Each issue gains a [ServerConstants.jsonKeyCategory]
  /// (shared taxonomy), a locale-independent [ServerConstants.jsonKeyId]
  /// (cross-tool dedupe key), and a [ServerConstants.jsonKeyTitle] (alias of
  /// `message`). Top-level `schemaVersion` / `producer` / `generatedAt` let a
  /// consumer reject an incompatible shape.
  Map<String, dynamic> _wrapIssuesEnvelope(List<Map<String, dynamic>> issues) {
    for (final issue in issues) {
      final source = issue[ServerConstants.jsonKeySource] as String? ?? '';
      issue[ServerConstants.jsonKeyCategory] = _categoryForSource(source);
      // Title mirrors message — emitted alongside, never replacing it, so the
      // existing public shape stays intact while the suite standardizes on
      // `title`.
      issue[ServerConstants.jsonKeyTitle] =
          issue[ServerConstants.jsonKeyMessage] as String? ?? '';
      issue[ServerConstants.jsonKeyId] = _issueId(issue);
      _attachFix(issue);
    }
    return <String, dynamic>{
      ServerConstants.jsonKeySchemaVersion: ServerConstants.issuesSchemaVersion,
      ServerConstants.jsonKeyProducer: <String, dynamic>{
        ServerConstants.jsonKeyName: ServerConstants.productName,
        ServerConstants.jsonKeyVersion: ServerConstants.packageVersion,
      },
      ServerConstants.jsonKeyGeneratedAt: DateTime.now()
          .toUtc()
          .toIso8601String(),
      ServerConstants.jsonKeyIssues: issues,
    };
  }

  /// Maps a detector `source` to the shared diagnostic category (plan 67
  /// §2.1). Unknown sources fall back to `other` rather than echoing the raw
  /// source, so a consumer's category filter never sees an undocumented bucket.
  String _categoryForSource(String source) {
    switch (source) {
      case 'index-suggestion':
        return ServerConstants.categoryPerformance;
      case 'anomaly':
        return ServerConstants.categoryData;
      case 'orphan-table':
      case 'soft-relationship':
        return ServerConstants.categorySchema;
      default:
        return ServerConstants.categoryOther;
    }
  }

  /// Attaches a `fix` deep-link to a table-scoped issue (plan 67 R1) so a
  /// consumer can jump to the table's Drift class. Targets Advisor's own
  /// navigation command — Advisor's runtime detectors have no static Lints
  /// counterpart to point at. Issues with no table get no fix (nothing to
  /// navigate to). The title is plain English, matching the English-only debug
  /// API surface; consumers may relabel via the command if they localize.
  void _attachFix(Map<String, dynamic> issue) {
    final table = issue[ServerConstants.jsonKeyTable] as String? ?? '';
    if (table.isEmpty) return;
    issue[ServerConstants.jsonKeyFix] = <String, dynamic>{
      ServerConstants.jsonKeyKind: ServerConstants.fixKindCommand,
      ServerConstants.jsonKeyCommand:
          ServerConstants.commandGoToTableDefinition,
      ServerConstants.jsonKeyArgs: <Map<String, dynamic>>[
        <String, dynamic>{ServerConstants.jsonKeyTable: table},
      ],
      ServerConstants.jsonKeyTitle: 'Go to table definition',
    };
  }

  /// Builds a stable, locale-independent dedupe id from semantic fields only
  /// (plan 67 §2.1). Two diagnostics that agree on tool, detector, table,
  /// column, type, and (for inferred edges) target are the same issue
  /// regardless of message wording — so `message`/`title`, which localize,
  /// are deliberately excluded. Empty segments are dropped to keep the id
  /// compact.
  String _issueId(Map<String, dynamic> issue) {
    String field(String key) => issue[key]?.toString() ?? '';
    // Soft relationships carry their endpoint in fk* fields rather than the
    // generic table/column, so fall back to those for table and column.
    final table = field(ServerConstants.jsonKeyTable).isNotEmpty
        ? field(ServerConstants.jsonKeyTable)
        : field(ServerConstants.fkFromTable);
    final column = field(ServerConstants.jsonKeyColumn).isNotEmpty
        ? field(ServerConstants.jsonKeyColumn)
        : field(ServerConstants.fkFromColumn);
    final parts = <String>[
      ServerConstants.productName,
      field(ServerConstants.jsonKeySource),
      table,
      column,
      field(ServerConstants.jsonKeyType),
      // Disambiguate inferred relationships sharing a from-table/column.
      field(ServerConstants.fkToTable),
      field(ServerConstants.fkToColumn),
    ];
    return parts.where((p) => p.isNotEmpty).join(':');
  }

  /// Parses [sources] query param (comma-separated "index-suggestions",
  /// "anomalies", "orphan-tables", "soft-relationships"). Returns which sources
  /// to include. When null/empty, or when no recognized token is present, all
  /// sources are included; otherwise only the recognized tokens present are
  /// included.
  ({
    bool includeIndexSuggestions,
    bool includeAnomalies,
    bool includeOrphanTables,
    bool includeSoftRelationships,
  })
  _parseSourcesFilter(String? sources) {
    // Default (no filter / unrecognized): include everything.
    const all = (
      includeIndexSuggestions: true,
      includeAnomalies: true,
      includeOrphanTables: true,
      includeSoftRelationships: true,
    );
    if (sources == null || sources.trim().isEmpty) {
      return all;
    }
    final parts = sources
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .toList();
    final hasIndex = parts.any((p) => p == 'index-suggestions');
    final hasAnomalies = parts.any((p) => p == 'anomalies');
    final hasOrphanTables = parts.any((p) => p == 'orphan-tables');
    final hasSoftRelationships = parts.any((p) => p == 'soft-relationships');

    // No recognized token → treat as no filter rather than empty result, so
    // a stale or typo'd query param never silently drops every issue.
    if (!hasIndex &&
        !hasAnomalies &&
        !hasOrphanTables &&
        !hasSoftRelationships) {
      return all;
    }
    return (
      includeIndexSuggestions: hasIndex,
      includeAnomalies: hasAnomalies,
      includeOrphanTables: hasOrphanTables,
      includeSoftRelationships: hasSoftRelationships,
    );
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
        final rawError = result[ServerConstants.jsonKeyError];
        res.statusCode = HttpStatus.internalServerError;
        res.headers.contentType = ContentType.json;
        _ctx.setCors(res);
        res.write(
          jsonEncode(<String, String>{
            ServerConstants.jsonKeyError:
                rawError?.toString() ?? 'Unknown error',
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
            'FROM ${ServerUtils.quoteIdent(tableName)}',
          ),
        );
        final rowCount = ServerUtils.extractCountFromRows(countRows);

        final colInfoRows = ServerUtils.normalizeRows(
          await query(
            'PRAGMA table_info(${ServerUtils.quoteIdent(tableName)})',
          ),
        );

        final indexRows = ServerUtils.normalizeRows(
          await query(
            'PRAGMA index_list(${ServerUtils.quoteIdent(tableName)})',
          ),
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
