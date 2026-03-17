// Request router extracted from _DriftDebugServerImpl._onRequest.
// Dispatches HTTP requests to the appropriate handler.

import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:saropa_drift_advisor/src/drift_debug_session.dart';

import 'analytics_handler.dart';
import 'auth_handler.dart';
import 'compare_handler.dart';
import 'generation_handler.dart';
import 'import_handler.dart';
import 'performance_handler.dart';
import 'schema_handler.dart';
import 'server_constants.dart';
import 'server_context.dart';
import 'server_utils.dart';
import 'session_handler.dart';
import 'snapshot_handler.dart';
import 'sql_handler.dart';
import 'table_handler.dart';

/// Routes incoming HTTP requests to the appropriate handler.
final class Router {
  /// Creates a [Router] with the given [ServerContext] and
  /// [DriftDebugSessionStore].
  Router(ServerContext ctx, DriftDebugSessionStore sessionStore)
      : _ctx = ctx,
        _auth = AuthHandler(ctx),
        _generation = GenerationHandler(ctx),
        _table = TableHandler(ctx),
        _sql = SqlHandler(ctx),
        _schema = SchemaHandler(ctx),
        _snapshot = SnapshotHandler(ctx),
        _compare = CompareHandler(ctx),
        _analytics = AnalyticsHandler(ctx),
        _performance = PerformanceHandler(ctx),
        _session = SessionHandler(ctx, sessionStore),
        _import = ImportHandler(ctx);

  final ServerContext _ctx;
  final AuthHandler _auth;
  final GenerationHandler _generation;
  final TableHandler _table;
  final SqlHandler _sql;
  final SchemaHandler _schema;
  final SnapshotHandler _snapshot;
  final CompareHandler _compare;
  final AnalyticsHandler _analytics;
  final PerformanceHandler _performance;
  final SessionHandler _session;
  final ImportHandler _import;

  /// Main request handler: auth -> health/generation -> route by
  /// method and path.
  Future<void> onRequest(HttpRequest request) async {
    final req = request;
    final res = req.response;
    final String path = req.uri.path;

    // When auth is configured, require it on every request.
    if (_ctx.authTokenHash != null ||
        (_ctx.basicAuthUser != null && _ctx.basicAuthPassword != null)) {
      if (!_auth.isAuthenticated(req)) {
        await _auth.sendUnauthorized(res);

        return;
      }
    }

    // Track VS Code extension client header.
    final driftClient = req.headers.value(ServerConstants.headerDriftClient);
    if (driftClient == ServerConstants.clientVscode) {
      _ctx.markExtensionSeen();
    }

    // Favicon: return 204 so the browser stops requesting /favicon.ico.
    // The HTML <head> already provides an inline SVG data-URI icon.
    if (req.method == ServerConstants.methodGet &&
        (path == ServerConstants.pathFavicon ||
            path == ServerConstants.pathFaviconAlt)) {
      res.statusCode = HttpStatus.noContent;
      await res.close();

      return;
    }

    // Health and generation are checked before the
    // DB query so probes / live-refresh work.
    try {
      if (req.method == ServerConstants.methodGet &&
          (path == ServerConstants.pathApiHealth ||
              path == ServerConstants.pathApiHealthAlt)) {
        await _generation.sendHealth(res);

        return;
      }

      if (req.method == ServerConstants.methodGet &&
          (path == ServerConstants.pathApiGeneration ||
              path == ServerConstants.pathApiGenerationAlt)) {
        await _generation.handleGeneration(req);

        return;
      }

      // Change detection toggle (lightweight control,
      // no DB query needed).
      if (path == ServerConstants.pathApiChangeDetection ||
          path == ServerConstants.pathApiChangeDetectionAlt) {
        if (req.method == ServerConstants.methodGet) {
          await _handleGetChangeDetection(res);

          return;
        }
        if (req.method == ServerConstants.methodPost) {
          await _handleSetChangeDetection(req);

          return;
        }
      }
    } on Object catch (error, stack) {
      _ctx.logError(error, stack);
      await _ctx.sendErrorResponse(res, error);

      return;
    }

    final DriftDebugQuery query = _ctx.instrumentedQuery;

    try {
      if (req.method == ServerConstants.methodGet &&
          (path == '/' || path.isEmpty)) {
        await _generation.sendHtml(res, req);

        return;
      }

      if (req.method == ServerConstants.methodGet &&
          (path == ServerConstants.pathApiTables ||
              path == ServerConstants.pathApiTablesAlt)) {
        await _table.sendTableList(res, query);

        return;
      }

      if (req.method == ServerConstants.methodGet &&
          (path.startsWith(ServerConstants.pathApiTablePrefix) ||
              path.startsWith(ServerConstants.pathApiTablePrefixAlt))) {
        final String suffix = path.replaceFirst(RegExp(r'^/?api/table/'), '');

        if (suffix.endsWith(ServerConstants.pathSuffixCount)) {
          final String tableName = suffix.replaceFirst(RegExp(r'/count$'), '');

          await _table.sendTableCount(
              response: res, query: query, tableName: tableName);

          return;
        }
        if (suffix.endsWith(ServerConstants.pathSuffixColumns)) {
          final String tableName =
              suffix.replaceFirst(RegExp(r'/columns$'), '');

          await _table.sendTableColumns(
              response: res, query: query, tableName: tableName);

          return;
        }
        if (suffix.endsWith(ServerConstants.pathSuffixFkMeta)) {
          final String tableName =
              suffix.replaceFirst(RegExp(r'/fk-meta$'), '');

          await _table.sendTableFkMeta(
              response: res, query: query, tableName: tableName);

          return;
        }

        final String tableName = suffix;
        final int limit = ServerUtils.parseLimit(
            req.uri.queryParameters[ServerConstants.queryParamLimit]);
        final int offset = ServerUtils.parseOffset(
            req.uri.queryParameters[ServerConstants.queryParamOffset]);

        await _table.sendTableData(
            response: res,
            query: query,
            tableName: tableName,
            limit: limit,
            offset: offset);

        return;
      }

      if (req.method == ServerConstants.methodPost &&
          (path == ServerConstants.pathApiSqlExplain ||
              path == ServerConstants.pathApiSqlExplainAlt)) {
        await _sql.handleExplainSql(req, query);

        return;
      }

      if (req.method == ServerConstants.methodPost &&
          (path == ServerConstants.pathApiSql ||
              path == ServerConstants.pathApiSqlAlt)) {
        await _sql.handleRunSql(req, query);

        return;
      }

      if (req.method == ServerConstants.methodGet &&
          (path == ServerConstants.pathApiSchema ||
              path == ServerConstants.pathApiSchemaAlt)) {
        await _schema.sendSchemaDump(res, query);

        return;
      }

      if (req.method == ServerConstants.methodGet &&
          (path == ServerConstants.pathApiSchemaDiagram ||
              path == ServerConstants.pathApiSchemaDiagramAlt)) {
        await _schema.sendSchemaDiagram(res, query);

        return;
      }

      if (req.method == ServerConstants.methodGet &&
          (path == ServerConstants.pathApiSchemaMetadata ||
              path == ServerConstants.pathApiSchemaMetadataAlt)) {
        await _schema.sendSchemaMetadata(res, query);

        return;
      }

      if (req.method == ServerConstants.methodGet &&
          (path == ServerConstants.pathApiDump ||
              path == ServerConstants.pathApiDumpAlt)) {
        await _schema.sendFullDump(res, query);

        return;
      }

      if (req.method == ServerConstants.methodGet &&
          (path == ServerConstants.pathApiDatabase ||
              path == ServerConstants.pathApiDatabaseAlt)) {
        await _schema.sendDatabaseFile(res);

        return;
      }

      if (req.method == ServerConstants.methodPost &&
          (path == ServerConstants.pathApiSnapshot ||
              path == ServerConstants.pathApiSnapshotAlt)) {
        await _snapshot.handleSnapshotCreate(res, query);

        return;
      }

      if (req.method == ServerConstants.methodGet &&
          (path == ServerConstants.pathApiSnapshot ||
              path == ServerConstants.pathApiSnapshotAlt)) {
        await _snapshot.handleSnapshotGet(res);

        return;
      }

      if (req.method == ServerConstants.methodGet &&
          (path == ServerConstants.pathApiSnapshotCompare ||
              path == ServerConstants.pathApiSnapshotCompareAlt)) {
        await _snapshot.handleSnapshotCompare(
            response: res, request: req, query: query);

        return;
      }

      if (req.method == ServerConstants.methodDelete &&
          (path == ServerConstants.pathApiSnapshot ||
              path == ServerConstants.pathApiSnapshotAlt)) {
        await _snapshot.handleSnapshotDelete(res);

        return;
      }

      if (req.method == ServerConstants.methodGet &&
          (path.startsWith(ServerConstants.pathApiComparePrefix) ||
              path.startsWith(ServerConstants.pathApiComparePrefixAlt))) {
        await _compare.handleCompareReport(
          response: res,
          request: req,
          query: query,
        );

        return;
      }

      if (req.method == ServerConstants.methodGet &&
          (path == ServerConstants.pathApiIndexSuggestions ||
              path == ServerConstants.pathApiIndexSuggestionsAlt)) {
        await _analytics.handleIndexSuggestions(res, query);

        return;
      }

      if (req.method == ServerConstants.methodGet &&
          (path == ServerConstants.pathApiMigrationPreview ||
              path == ServerConstants.pathApiMigrationPreviewAlt)) {
        await _compare.handleMigrationPreview(res, query);

        return;
      }

      if (req.method == ServerConstants.methodGet &&
          (path == ServerConstants.pathApiAnalyticsAnomalies ||
              path == ServerConstants.pathApiAnalyticsAnomaliesAlt)) {
        await _analytics.handleAnomalyDetection(res, query);

        return;
      }

      if (req.method == ServerConstants.methodGet &&
          (path == ServerConstants.pathApiAnalyticsSize ||
              path == ServerConstants.pathApiAnalyticsSizeAlt)) {
        await _analytics.handleSizeAnalytics(res, query);

        return;
      }

      if (req.method == ServerConstants.methodPost &&
          (path == ServerConstants.pathApiImport ||
              path == ServerConstants.pathApiImportAlt)) {
        await _import.handleImport(req);

        return;
      }

      if (req.method == ServerConstants.methodPost &&
          (path == ServerConstants.pathApiSessionShare ||
              path == ServerConstants.pathApiSessionShareAlt)) {
        await _session.handleSessionShare(req);

        return;
      }

      if (path.startsWith(ServerConstants.pathApiSessionPrefix) ||
          path.startsWith(ServerConstants.pathApiSessionPrefixAlt)) {
        final suffix = path.startsWith(ServerConstants.pathApiSessionPrefix)
            ? path.substring(ServerConstants.pathApiSessionPrefix.length)
            : path.substring(ServerConstants.pathApiSessionPrefixAlt.length);

        // POST /api/session/{id}/extend — extend session expiry.
        if (suffix.endsWith(ServerConstants.pathSuffixExtend) &&
            req.method == ServerConstants.methodPost) {
          final sessionId = suffix.replaceFirst(RegExp(r'/extend$'), '');

          await _session.handleSessionExtend(req, sessionId);

          return;
        }

        if (suffix.endsWith(ServerConstants.pathSuffixAnnotate) &&
            req.method == ServerConstants.methodPost) {
          final sessionId = suffix.replaceFirst(RegExp(r'/annotate$'), '');

          await _session.handleSessionAnnotate(req, sessionId);

          return;
        }
        if (req.method == ServerConstants.methodGet) {
          await _session.handleSessionGet(res, suffix);

          return;
        }
      }

      if (req.method == ServerConstants.methodGet &&
          (path == ServerConstants.pathApiAnalyticsPerformance ||
              path == ServerConstants.pathApiAnalyticsPerformanceAlt)) {
        await _performance.handlePerformanceAnalytics(res);

        return;
      }

      if (req.method == ServerConstants.methodDelete &&
          (path == ServerConstants.pathApiAnalyticsPerformance ||
              path == ServerConstants.pathApiAnalyticsPerformanceAlt)) {
        await _performance.clearPerformanceData(res);

        return;
      }

      res.statusCode = HttpStatus.notFound;
      await res.close();
    } on Object catch (error, stack) {
      _ctx.logError(error, stack);
      await _ctx.sendErrorResponse(res, error);
    }
  }

  // --- VM Service extension delegates (Plan 68) ---
  // Used by VmServiceBridge to serve ext.saropa.drift.* RPCs without HTTP.

  /// Returns schema metadata for VM service RPC getSchemaMetadata.
  Future<List<Map<String, dynamic>>> getSchemaMetadataList() =>
      _schema.getSchemaMetadataList(_ctx.instrumentedQuery);

  /// Returns FK metadata for a table for VM service RPC getTableFkMeta.
  Future<List<Map<String, dynamic>>> getTableFkMetaList(String tableName) =>
      _table.getTableFkMetaList(
        query: _ctx.instrumentedQuery,
        tableName: tableName,
      );

  /// Runs read-only SQL for VM service RPC runSql.
  Future<Map<String, dynamic>> runSqlResult(String sql) =>
      _sql.runSqlResult(_ctx.instrumentedQuery, sql);

  /// Returns current generation for VM service RPC getGeneration.
  Future<int> getGeneration() => _generation.getCurrentGeneration();

  /// Returns performance data for VM service RPC getPerformance.
  Future<Map<String, dynamic>> getPerformanceData() =>
      _performance.getPerformanceData();

  /// Clears performance timings for VM service RPC clearPerformance.
  void clearPerformance() => _performance.clearPerformance();

  /// Returns anomaly scan result for VM service RPC getAnomalies.
  Future<Map<String, dynamic>> getAnomaliesResult() =>
      _analytics.getAnomaliesResult(_ctx.instrumentedQuery);

  /// Returns explain plan for VM service RPC explainSql.
  Future<Map<String, dynamic>> explainSqlResult(String sql) =>
      _sql.explainSqlResult(_ctx.instrumentedQuery, sql);

  /// Returns index suggestions list for VM service RPC getIndexSuggestions.
  Future<List<Map<String, dynamic>>> getIndexSuggestionsList() async {
    final result =
        await _analytics.getIndexSuggestionsList(_ctx.instrumentedQuery);
    final list = result['suggestions'];
    return list is List<Map<String, dynamic>> ? list : <Map<String, dynamic>>[];
  }

  /// The current generation counter value, without
  /// triggering a change check. Used by VM service
  /// handlers when change detection is disabled.
  int get currentGeneration => _ctx.generation;

  /// Whether change detection is enabled (delegate for
  /// VM service and HTTP endpoints).
  bool get isChangeDetectionEnabled =>
      _ctx.changeDetectionEnabled;

  /// Sets change detection enabled state (delegate for
  /// VM service and HTTP endpoints).
  void setChangeDetectionEnabled(bool enabled) {
    _ctx.changeDetectionEnabled = enabled;
  }

  // --- Change detection HTTP handlers ---

  /// Handles GET /api/change-detection.
  /// Returns {"changeDetection": true|false}.
  Future<void> _handleGetChangeDetection(
    HttpResponse response,
  ) async {
    final res = response;

    _ctx.setJsonHeaders(res);
    res.write(jsonEncode(<String, dynamic>{
      ServerConstants.jsonKeyChangeDetection:
          _ctx.changeDetectionEnabled,
    }));
    await res.close();
  }

  /// Handles POST /api/change-detection.
  /// Expects JSON body: {"enabled": true|false}.
  /// Returns {"changeDetection": true|false}.
  Future<void> _handleSetChangeDetection(
    HttpRequest request,
  ) async {
    final res = request.response;

    try {
      final builder = BytesBuilder();

      await for (final chunk in request) {
        builder.add(chunk);
      }

      final body = utf8.decode(builder.toBytes());
      final decoded = ServerUtils.parseJsonMap(body);

      if (decoded == null ||
          decoded[ServerConstants.jsonKeyEnabled] is! bool) {
        res.statusCode = HttpStatus.badRequest;
        _ctx.setJsonHeaders(res);
        res.write(jsonEncode(<String, String>{
          ServerConstants.jsonKeyError:
              'Expected JSON body with '
                  '"${ServerConstants.jsonKeyEnabled}": '
                  'true|false',
        }));
        await res.close();

        return;
      }

      final enabled =
          decoded[ServerConstants.jsonKeyEnabled] as bool;
      _ctx.changeDetectionEnabled = enabled;

      _ctx.setJsonHeaders(res);
      res.write(jsonEncode(<String, dynamic>{
        ServerConstants.jsonKeyChangeDetection: enabled,
      }));
      await res.close();
    } on Object catch (error, stack) {
      _ctx.logError(error, stack);
      await _ctx.sendErrorResponse(res, error);
    }
  }

  @override
  String toString() => 'Router()';
}
