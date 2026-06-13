// Serves the portable snapshot report endpoint `GET /api/report`.
//
// The website-side counterpart to the extension's "Export Portable Report"
// command (Feature 25): it collects a capped slice of every selected table,
// the schema DDL, and the anomaly scan, then streams a single self-contained
// HTML file (CSS/JS/data inlined) as a download. Opening that file needs no
// server — see [ReportHtmlBuilder] for the document it produces.

import 'dart:io';

import 'analytics_handler.dart';
import 'report_html.dart';
import 'server_constants.dart';
import 'server_context.dart';
import 'server_utils.dart';

/// Handles the `GET /api/report` portable-report download.
final class ReportHandler {
  /// Creates a [ReportHandler]; reuses the router's [AnalyticsHandler] so the
  /// anomaly section is produced by the same scan the rest of the API uses
  /// (including any host-declared relationships it resolves).
  ReportHandler(this._ctx, this._analytics);

  final ServerContext _ctx;
  final AnalyticsHandler _analytics;

  /// Hard ceiling on embedded rows per table regardless of the `maxRows` query
  /// parameter — a portable report is meant to be shared, not to mirror a huge
  /// table, and every row is inlined into the HTML.
  static const int _maxRowsCeiling = 50000;

  /// Default rows per table when `maxRows` is absent or unparyable.
  static const int _defaultMaxRows = 1000;

  /// `GET /api/report?tables=a,b&maxRows=1000&schema=true&anomalies=true`
  ///
  /// `tables` (optional) — comma-separated names; defaults to every table.
  /// `maxRows` (optional) — rows embedded per table (clamped 1.._maxRowsCeiling).
  /// `schema` / `anomalies` (optional) — `false` omits that section; any other
  /// value (or absence) includes it.
  Future<void> handle(
    HttpRequest request,
    HttpResponse response,
    DriftDebugQuery query,
  ) async {
    final Map<String, String> qp = request.uri.queryParameters;

    // The live table set is the allow-list: a name in `tables` is only queried
    // if the database actually has it, so the value interpolated into SELECT is
    // always a real table name (no injection surface), matching how the rest of
    // the server treats getTableNames() output.
    final List<String> known = await ServerUtils.getTableNames(query);
    final Set<String> knownSet = known.toSet();

    final String? tablesParam = qp[ServerConstants.queryParamTables];
    final List<String> requested =
        (tablesParam != null && tablesParam.trim().isNotEmpty)
        ? tablesParam
              .split(',')
              .map((String t) => t.trim())
              .where((String t) => t.isNotEmpty)
              .toList()
        : known;
    final List<String> tables = requested
        .where(knownSet.contains)
        .toList(growable: false);

    final int requestedMax =
        int.tryParse(qp[ServerConstants.queryParamMaxRows] ?? '') ??
        _defaultMaxRows;
    final int maxRows = requestedMax.clamp(1, _maxRowsCeiling);

    final bool includeSchema =
        qp[ServerConstants.queryParamSchema] != ServerConstants.valueFalse;
    final bool includeAnomalies =
        qp[ServerConstants.queryParamAnomalies] != ServerConstants.valueFalse;

    final List<ReportTableData> collected = <ReportTableData>[];
    for (final String table in tables) {
      collected.add(await _collectTable(query, table, maxRows));
    }

    String? schemaSql;
    if (includeSchema) {
      schemaSql = await ServerUtils.getSchemaSql(query);
    }

    List<Map<String, dynamic>>? anomalies;
    if (includeAnomalies) {
      anomalies = await _collectAnomalies(query);
    }

    final String html = ReportHtmlBuilder.build(
      generatedAt: DateTime.now().toIso8601String(),
      serverHost: request.headers.host ?? '',
      tables: collected,
      schemaSql: schemaSql,
      anomalies: anomalies,
    );

    response.statusCode = HttpStatus.ok;
    response.headers.contentType = ContentType.html;
    response.headers.set(
      ServerConstants.headerContentDisposition,
      'attachment; filename="${_reportFilename()}"',
    );
    _ctx.setCors(response);
    response.write(html);
    await response.close();
  }

  /// Reads one table's columns, a capped page of rows, and its true row count.
  Future<ReportTableData> _collectTable(
    DriftDebugQuery query,
    String table,
    int maxRows,
  ) async {
    final List<Map<String, dynamic>> infoRows = ServerUtils.normalizeRows(
      await query('PRAGMA table_info(${ServerUtils.quoteIdent(table)})'),
    );
    final List<String> columns = infoRows
        .map(
          (Map<String, dynamic> r) =>
              (r[ServerConstants.jsonKeyName] ?? r['NAME'] ?? '').toString(),
        )
        .where((String c) => c.isNotEmpty)
        .toList();

    final List<Map<String, dynamic>> rows = ServerUtils.normalizeRows(
      await query(
        'SELECT * FROM ${ServerUtils.quoteIdent(table)} LIMIT $maxRows',
      ),
    );

    final List<Map<String, dynamic>> countRows = ServerUtils.normalizeRows(
      await query(
        'SELECT COUNT(*) AS cnt FROM ${ServerUtils.quoteIdent(table)}',
      ),
    );
    final Object? rawCount = countRows.isNotEmpty
        ? countRows.first['cnt']
        : null;
    final int total = rawCount is int
        ? rawCount
        : int.tryParse('${rawCount ?? ''}') ?? rows.length;

    return ReportTableData(
      name: table,
      columns: columns,
      rows: rows,
      totalRowCount: total,
      truncated: total > rows.length,
    );
  }

  /// Runs the anomaly scan and returns its raw `anomalies` list. A failing or
  /// missing scan yields an empty list rather than aborting the whole report —
  /// the data + schema are still worth exporting.
  Future<List<Map<String, dynamic>>> _collectAnomalies(
    DriftDebugQuery query,
  ) async {
    try {
      final Map<String, dynamic> result = await _analytics.getAnomaliesResult(
        query,
      );
      final Object? list = result[ServerConstants.jsonKeyAnomalies];
      if (list is List) {
        return list.whereType<Map<String, dynamic>>().toList(growable: false);
      }
    } on Object catch (error, stack) {
      // A faulty anomaly scan must not sink the export; log and ship without it.
      _ctx.logError(error, stack);
    }
    return <Map<String, dynamic>>[];
  }

  /// `drift-report-YYYY-MM-DD.html`, matching the extension's default filename.
  String _reportFilename() {
    final DateTime now = DateTime.now();
    final String mm = now.month.toString().padLeft(2, '0');
    final String dd = now.day.toString().padLeft(2, '0');
    return 'drift-report-${now.year}-$mm-$dd.html';
  }
}
