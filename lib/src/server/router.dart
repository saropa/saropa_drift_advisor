// Request router extracted from _DriftDebugServerImpl._onRequest.
// Dispatches HTTP requests to the appropriate handler.
//
// Route matching is grouped by domain — each _route*
// method handles one handler's endpoints and returns
// true when matched. See onRequest() for dispatch order.

import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:saropa_drift_advisor/src/drift_debug_session.dart';

import 'analytics_handler.dart';
import 'auth_handler.dart';
import 'cell_update_handler.dart';
import 'edits_batch_handler.dart';
import 'compare_handler.dart';
import 'generation_handler.dart';
import 'import_handler.dart';
import 'mutation_handler.dart';
import 'performance_handler.dart';
import 'rate_limiter.dart';
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
  ///
  /// When [maxRequestsPerSecond] is non-null, per-IP rate limiting
  /// is enabled: requests exceeding the limit receive HTTP 429.
  /// The `/api/generation` (long-poll) and `/api/health` endpoints
  /// are exempt from rate limiting.
  Router(
    ServerContext ctx,
    DriftDebugSessionStore sessionStore, {
    int? maxRequestsPerSecond,
  }) : _ctx = ctx,
       _rateLimiter = maxRequestsPerSecond != null
           ? RateLimiter(maxRequestsPerSecond, ctx)
           : null,
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
       _import = ImportHandler(ctx),
       _cellUpdate = CellUpdateHandler(ctx),
       _editsBatch = EditsBatchHandler(ctx),
       _mutations = MutationHandler(ctx);

  final ServerContext _ctx;

  /// Per-IP rate limiter; null when rate limiting is disabled.
  final RateLimiter? _rateLimiter;

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
  final CellUpdateHandler _cellUpdate;
  final EditsBatchHandler _editsBatch;
  final MutationHandler _mutations;

  /// Main request handler: auth -> rate limit -> route by
  /// method and path.
  ///
  /// Route groups are dispatched in order — the first
  /// match wins. Each `_route*` method returns true when
  /// it matches and handles the request.
  Future<void> onRequest(HttpRequest request) async {
    final req = request;
    final res = req.response;
    final String path = req.uri.path;

    // When auth is configured, require it on every request.
    if (_ctx.authToken != null ||
        (_ctx.basicAuthUser != null && _ctx.basicAuthPassword != null)) {
      if (!_auth.isAuthenticated(req)) {
        await _auth.sendUnauthorized(res);

        return;
      }
    }

    // Per-IP rate limiting: check before any handler work. Exempt the
    // long-poll generation endpoint (holds connections by design) and
    // the lightweight health probe so monitoring tools are never blocked.
    final limiter = _rateLimiter;
    if (limiter != null) {
      final bool isExempt =
          path == ServerConstants.pathApiGeneration ||
          path == ServerConstants.pathApiGenerationAlt ||
          path == ServerConstants.pathApiMutations ||
          path == ServerConstants.pathApiMutationsAlt ||
          path == ServerConstants.pathApiHealth ||
          path == ServerConstants.pathApiHealthAlt;

      if (!isExempt && limiter.shouldThrottle(req)) {
        await limiter.sendTooManyRequests(res);

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

    // Health, generation, and change-detection are checked
    // before the DB query so probes / live-refresh work.
    try {
      if (await _routePreQuery(req, res, path)) return;
    } on Object catch (error, stack) {
      _ctx.logError(error, stack);
      await _ctx.sendErrorResponse(res, error);

      return;
    }

    final DriftDebugQuery query = _ctx.instrumentedQuery;

    try {
      // Root HTML UI (single route, kept inline).
      if (req.method == ServerConstants.methodGet &&
          (path == '/' || path.isEmpty)) {
        await _generation.sendHtml(res, req);

        return;
      }

      // Dispatch to domain-specific route groups.
      if (await _routeTableApi(req, res, path, query)) return;
      if (await _routeSqlApi(req, res, path, query)) return;
      if (await _routeSchemaApi(req, res, path, query)) return;
      if (await _routeSnapshotApi(req, res, path, query)) return;
      if (await _routeCompareApi(req, res, path, query)) return;
      if (await _routeAnalyticsApi(req, res, path, query)) return;
      if (await _routeWriteApi(req, res, path, query)) return;
      if (await _routeSessionApi(req, res, path, query)) return;
      if (await _routePerformanceApi(req, res, path, query)) return;

      // No route matched — 404.
      res.statusCode = HttpStatus.notFound;
      await res.close();
    } on Object catch (error, stack) {
      _ctx.logError(error, stack);
      await _ctx.sendErrorResponse(res, error);
    }
  }

  // -------- Pre-DB route group --------

  /// Routes health, generation, and change-detection
  /// endpoints. These do not require a DB query.
  Future<bool> _routePreQuery(
    HttpRequest request,
    HttpResponse response,
    String path,
  ) async {
    // GET /api/health — lightweight health probe.
    if (request.method == ServerConstants.methodGet &&
        (path == ServerConstants.pathApiHealth ||
            path == ServerConstants.pathApiHealthAlt)) {
      await _generation.sendHealth(response);

      return true;
    }

    // GET /api/generation — long-poll for data changes.
    if (request.method == ServerConstants.methodGet &&
        (path == ServerConstants.pathApiGeneration ||
            path == ServerConstants.pathApiGenerationAlt)) {
      await _generation.handleGeneration(request);

      return true;
    }

    // GET /api/mutations — long-poll for semantic mutation events.
    if (request.method == ServerConstants.methodGet &&
        (path == ServerConstants.pathApiMutations ||
            path == ServerConstants.pathApiMutationsAlt)) {
      await _mutations.handleMutations(request);
      return true;
    }

    // GET /assets/web/style.css and /assets/web/app.js — local web UI assets.
    // These are served from the package to avoid hard dependency on CDN MIME
    // handling (and to support offline/local development).
    if (request.method == ServerConstants.methodGet &&
        (path == ServerConstants.pathWebStyle ||
            path == ServerConstants.pathWebStyleAlt)) {
      await _generation.sendWebStyle(response);
      return true;
    }
    if (request.method == ServerConstants.methodGet &&
        (path == ServerConstants.pathWebApp ||
            path == ServerConstants.pathWebAppAlt)) {
      await _generation.sendWebApp(response);
      return true;
    }

    // GET/POST /api/change-detection — toggle or query
    // the change-detection flag.
    if (path == ServerConstants.pathApiChangeDetection ||
        path == ServerConstants.pathApiChangeDetectionAlt) {
      if (request.method == ServerConstants.methodGet) {
        await _handleGetChangeDetection(response);

        return true;
      }
      if (request.method == ServerConstants.methodPost) {
        await _handleSetChangeDetection(request);

        return true;
      }
    }

    return false;
  }

  // -------- Table route group --------

  /// Routes GET /api/tables and GET /api/table/{name}/*
  /// endpoints for table listing and data retrieval.
  Future<bool> _routeTableApi(
    HttpRequest request,
    HttpResponse response,
    String path,
    DriftDebugQuery query,
  ) async {
    // GET /api/tables — list all table names.
    if (request.method == ServerConstants.methodGet &&
        (path == ServerConstants.pathApiTables ||
            path == ServerConstants.pathApiTablesAlt)) {
      await _table.sendTableList(response, query);

      return true;
    }

    // GET /api/table/{tableName}[/count|/columns|/fk-meta]
    // — dynamic path parsing for table-specific data.
    if (request.method == ServerConstants.methodGet &&
        (path.startsWith(ServerConstants.pathApiTablePrefix) ||
            path.startsWith(ServerConstants.pathApiTablePrefixAlt))) {
      final String suffix = path.replaceFirst(RegExp(r'^/?api/table/'), '');

      if (suffix.endsWith(ServerConstants.pathSuffixCount)) {
        final String tableName = suffix.replaceFirst(RegExp(r'/count$'), '');

        await _table.sendTableCount(
          response: response,
          query: query,
          tableName: tableName,
        );

        return true;
      }
      if (suffix.endsWith(ServerConstants.pathSuffixColumns)) {
        final String tableName = suffix.replaceFirst(RegExp(r'/columns$'), '');

        await _table.sendTableColumns(
          response: response,
          query: query,
          tableName: tableName,
        );

        return true;
      }
      if (suffix.endsWith(ServerConstants.pathSuffixFkMeta)) {
        final String tableName = suffix.replaceFirst(RegExp(r'/fk-meta$'), '');

        await _table.sendTableFkMeta(
          response: response,
          query: query,
          tableName: tableName,
        );

        return true;
      }

      // Default: fetch table rows with limit/offset.
      final String tableName = suffix;
      final int limit = ServerUtils.parseLimit(
        request.uri.queryParameters[ServerConstants.queryParamLimit],
      );
      final int offset = ServerUtils.parseOffset(
        request.uri.queryParameters[ServerConstants.queryParamOffset],
      );

      await _table.sendTableData(
        response: response,
        query: query,
        tableName: tableName,
        limit: limit,
        offset: offset,
      );

      return true;
    }

    return false;
  }

  // -------- SQL route group --------

  /// Routes POST /api/sql and POST /api/sql/explain
  /// endpoints for read-only SQL execution.
  Future<bool> _routeSqlApi(
    HttpRequest request,
    HttpResponse response,
    String path,
    DriftDebugQuery query,
  ) async {
    // POST /api/sql/explain — explain query plan.
    // Checked before /api/sql so the longer path wins.
    if (request.method == ServerConstants.methodPost &&
        (path == ServerConstants.pathApiSqlExplain ||
            path == ServerConstants.pathApiSqlExplainAlt)) {
      await _sql.handleExplainSql(request, query);

      return true;
    }

    // POST /api/sql — execute read-only SQL.
    if (request.method == ServerConstants.methodPost &&
        (path == ServerConstants.pathApiSql ||
            path == ServerConstants.pathApiSqlAlt)) {
      await _sql.handleRunSql(request, query);

      return true;
    }

    return false;
  }

  // -------- Schema route group --------

  /// Sends minimal JSON (empty tables, optional foreignKeys) when
  /// change detection is disabled so schema endpoints avoid
  /// PRAGMA table_info and SELECT COUNT(*) and spamming the app log.
  Future<void> _sendEmptySchemaResponse(
    HttpResponse response, {
    required bool includeDiagram,
  }) async {
    _ctx.setJsonHeaders(response);
    final body = <String, dynamic>{
      ServerConstants.jsonKeyTables: <Map<String, dynamic>>[],
      ServerConstants.jsonKeyChangeDetection: false,
    };
    if (includeDiagram) {
      body[ServerConstants.jsonKeyForeignKeys] = <Map<String, dynamic>>[];
    }
    response.write(jsonEncode(body));
    await response.close();
  }

  /// Routes GET /api/schema/* and GET /api/dump|database
  /// endpoints for schema inspection and database export.
  Future<bool> _routeSchemaApi(
    HttpRequest request,
    HttpResponse response,
    String path,
    DriftDebugQuery query,
  ) async {
    if (request.method != ServerConstants.methodGet) return false;

    // GET /api/schema — raw schema DDL dump.
    if (path == ServerConstants.pathApiSchema ||
        path == ServerConstants.pathApiSchemaAlt) {
      await _schema.sendSchemaDump(response, query);

      return true;
    }

    // GET /api/schema/diagram — when change detection off, return
    // empty data to avoid PRAGMA table_info/foreign_key_list spam.
    if (path == ServerConstants.pathApiSchemaDiagram ||
        path == ServerConstants.pathApiSchemaDiagramAlt) {
      if (!_ctx.changeDetectionEnabled) {
        await _sendEmptySchemaResponse(response, includeDiagram: true);
        return true;
      }
      await _schema.sendSchemaDiagram(response, query);

      return true;
    }

    // GET /api/schema/metadata — when change detection off, return
    // empty tables to avoid PRAGMA table_info and COUNT(*) spam.
    if (path == ServerConstants.pathApiSchemaMetadata ||
        path == ServerConstants.pathApiSchemaMetadataAlt) {
      if (!_ctx.changeDetectionEnabled) {
        await _sendEmptySchemaResponse(response, includeDiagram: false);
        return true;
      }
      await _schema.sendSchemaMetadata(request, response, query);

      return true;
    }

    // GET /api/dump — full database content dump.
    if (path == ServerConstants.pathApiDump ||
        path == ServerConstants.pathApiDumpAlt) {
      await _schema.sendFullDump(response, query);

      return true;
    }

    // GET /api/database — raw SQLite file download.
    if (path == ServerConstants.pathApiDatabase ||
        path == ServerConstants.pathApiDatabaseAlt) {
      await _schema.sendDatabaseFile(response);

      return true;
    }

    return false;
  }

  // -------- Snapshot route group --------

  /// Routes /api/snapshot/* endpoints for snapshot
  /// create, get, compare, and delete operations.
  Future<bool> _routeSnapshotApi(
    HttpRequest request,
    HttpResponse response,
    String path,
    DriftDebugQuery query,
  ) async {
    // POST /api/snapshot — create a new snapshot.
    if (request.method == ServerConstants.methodPost &&
        (path == ServerConstants.pathApiSnapshot ||
            path == ServerConstants.pathApiSnapshotAlt)) {
      await _snapshot.handleSnapshotCreate(response, query);

      return true;
    }

    // GET /api/snapshot — retrieve current snapshot.
    if (request.method == ServerConstants.methodGet &&
        (path == ServerConstants.pathApiSnapshot ||
            path == ServerConstants.pathApiSnapshotAlt)) {
      await _snapshot.handleSnapshotGet(response);

      return true;
    }

    // GET /api/snapshot/compare — diff snapshot vs current.
    if (request.method == ServerConstants.methodGet &&
        (path == ServerConstants.pathApiSnapshotCompare ||
            path == ServerConstants.pathApiSnapshotCompareAlt)) {
      await _snapshot.handleSnapshotCompare(
        response: response,
        request: request,
        query: query,
      );

      return true;
    }

    // DELETE /api/snapshot — clear snapshot.
    if (request.method == ServerConstants.methodDelete &&
        (path == ServerConstants.pathApiSnapshot ||
            path == ServerConstants.pathApiSnapshotAlt)) {
      await _snapshot.handleSnapshotDelete(response);

      return true;
    }

    return false;
  }

  // -------- Compare route group --------

  /// Routes GET /api/compare/{id} and
  /// GET /api/migration/preview endpoints for database
  /// comparison and migration preview.
  Future<bool> _routeCompareApi(
    HttpRequest request,
    HttpResponse response,
    String path,
    DriftDebugQuery query,
  ) async {
    if (request.method != ServerConstants.methodGet) return false;

    // GET /api/compare/{id} — compare report for a
    // specific snapshot ID (dynamic path prefix match).
    if (path.startsWith(ServerConstants.pathApiComparePrefix) ||
        path.startsWith(ServerConstants.pathApiComparePrefixAlt)) {
      await _compare.handleCompareReport(
        response: response,
        request: request,
        query: query,
      );

      return true;
    }

    // GET /api/migration/preview — preview migration SQL.
    if (path == ServerConstants.pathApiMigrationPreview ||
        path == ServerConstants.pathApiMigrationPreviewAlt) {
      await _compare.handleMigrationPreview(response, query);

      return true;
    }

    return false;
  }

  // -------- Analytics route group --------

  /// Routes GET /api/index-suggestions,
  /// GET /api/analytics/anomalies, and
  /// GET /api/analytics/size endpoints for database
  /// analysis.
  ///
  /// Uses [ServerContext.queryRaw] instead of the
  /// instrumented callback so that analytics
  /// introspection queries (PRAGMA, COUNT, DISTINCT,
  /// etc.) are NOT recorded in [queryTimings] and do
  /// not appear as phantom slow queries in the
  /// performance panel.
  Future<bool> _routeAnalyticsApi(
    HttpRequest request,
    HttpResponse response,
    String path,
    DriftDebugQuery query,
  ) async {
    if (request.method != ServerConstants.methodGet) return false;

    // Use the raw (uninstrumented) query callback for
    // all analytics endpoints so their internal queries
    // do not pollute the performance timing buffer.
    final rawQuery = _ctx.queryRaw;

    // GET /api/index-suggestions — index optimization hints.
    if (path == ServerConstants.pathApiIndexSuggestions ||
        path == ServerConstants.pathApiIndexSuggestionsAlt) {
      await _analytics.handleIndexSuggestions(response, rawQuery);

      return true;
    }

    // GET /api/issues — merged index suggestions and anomalies
    // in a stable issue shape (for Saropa Lints and other consumers).
    if (path == ServerConstants.pathApiIssues ||
        path == ServerConstants.pathApiIssuesAlt) {
      await _analytics.handleIssues(request, response, rawQuery);

      return true;
    }

    // GET /api/analytics/anomalies — data quality scan.
    if (path == ServerConstants.pathApiAnalyticsAnomalies ||
        path == ServerConstants.pathApiAnalyticsAnomaliesAlt) {
      await _analytics.handleAnomalyDetection(response, rawQuery);

      return true;
    }

    // GET /api/analytics/size — storage metrics.
    if (path == ServerConstants.pathApiAnalyticsSize ||
        path == ServerConstants.pathApiAnalyticsSizeAlt) {
      await _analytics.handleSizeAnalytics(response, rawQuery);

      return true;
    }

    return false;
  }

  // -------- Import + cell write route group --------

  /// Routes POST /api/import and POST /api/cell/update.
  Future<bool> _routeWriteApi(
    HttpRequest request,
    HttpResponse response,
    String path,
    DriftDebugQuery query,
  ) async {
    if (request.method == ServerConstants.methodPost &&
        (path == ServerConstants.pathApiCellUpdate ||
            path == ServerConstants.pathApiCellUpdateAlt)) {
      await _cellUpdate.handleCellUpdate(request);
      return true;
    }
    if (request.method == ServerConstants.methodPost &&
        (path == ServerConstants.pathApiEditsApply ||
            path == ServerConstants.pathApiEditsApplyAlt)) {
      await _editsBatch.handleApplyBatch(request);
      return true;
    }
    if (request.method == ServerConstants.methodPost &&
        (path == ServerConstants.pathApiImport ||
            path == ServerConstants.pathApiImportAlt)) {
      await _import.handleImport(request);

      return true;
    }

    return false;
  }

  // -------- Session route group --------

  /// Routes /api/session/* endpoints for session sharing,
  /// retrieval, extension, and annotation.
  Future<bool> _routeSessionApi(
    HttpRequest request,
    HttpResponse response,
    String path,
    DriftDebugQuery query,
  ) async {
    // POST /api/session/share — create a shareable session.
    if (request.method == ServerConstants.methodPost &&
        (path == ServerConstants.pathApiSessionShare ||
            path == ServerConstants.pathApiSessionShareAlt)) {
      await _session.handleSessionShare(request);

      return true;
    }

    // Dynamic /api/session/{id}[/extend|/annotate] routes.
    if (path.startsWith(ServerConstants.pathApiSessionPrefix) ||
        path.startsWith(ServerConstants.pathApiSessionPrefixAlt)) {
      final suffix = path.startsWith(ServerConstants.pathApiSessionPrefix)
          ? path.substring(ServerConstants.pathApiSessionPrefix.length)
          : path.substring(ServerConstants.pathApiSessionPrefixAlt.length);

      // POST /api/session/{id}/extend — extend session expiry.
      if (suffix.endsWith(ServerConstants.pathSuffixExtend) &&
          request.method == ServerConstants.methodPost) {
        final sessionId = suffix.replaceFirst(RegExp(r'/extend$'), '');

        await _session.handleSessionExtend(request, sessionId);

        return true;
      }

      // POST /api/session/{id}/annotate — add annotation.
      if (suffix.endsWith(ServerConstants.pathSuffixAnnotate) &&
          request.method == ServerConstants.methodPost) {
        final sessionId = suffix.replaceFirst(RegExp(r'/annotate$'), '');

        await _session.handleSessionAnnotate(request, sessionId);

        return true;
      }

      // GET /api/session/{id} — retrieve session data.
      if (request.method == ServerConstants.methodGet) {
        await _session.handleSessionGet(response, suffix);

        return true;
      }
    }

    return false;
  }

  // -------- Performance route group --------

  /// Routes GET/DELETE /api/analytics/performance for
  /// query timing metrics.
  Future<bool> _routePerformanceApi(
    HttpRequest request,
    HttpResponse response,
    String path,
    DriftDebugQuery query,
  ) async {
    // GET /api/analytics/performance — retrieve timing data.
    if (request.method == ServerConstants.methodGet &&
        (path == ServerConstants.pathApiAnalyticsPerformance ||
            path == ServerConstants.pathApiAnalyticsPerformanceAlt)) {
      await _performance.handlePerformanceAnalytics(response);

      return true;
    }

    // DELETE /api/analytics/performance — clear timing data.
    if (request.method == ServerConstants.methodDelete &&
        (path == ServerConstants.pathApiAnalyticsPerformance ||
            path == ServerConstants.pathApiAnalyticsPerformanceAlt)) {
      await _performance.clearPerformanceData(response);

      return true;
    }

    return false;
  }

  // --- VM Service extension delegates (Plan 68) ---
  // Used by VmServiceBridge to serve ext.saropa.drift.* RPCs without HTTP.

  /// Returns schema metadata for VM service RPC getSchemaMetadata.
  ///
  /// [includeForeignKeys] mirrors GET `/api/schema/metadata?includeForeignKeys=1`.
  Future<List<Map<String, dynamic>>> getSchemaMetadataList({
    bool includeForeignKeys = false,
  }) => _schema.getSchemaMetadataList(
    _ctx.instrumentedQuery,
    includeForeignKeys: includeForeignKeys,
  );

  /// Returns FK metadata for a table for VM service RPC getTableFkMeta.
  Future<List<Map<String, dynamic>>> getTableFkMetaList(String tableName) =>
      _table.getTableFkMetaList(
        query: _ctx.instrumentedQuery,
        tableName: tableName,
      );

  /// Runs read-only SQL for VM service RPC runSql.
  Future<Map<String, dynamic>> runSqlResult(String sql) =>
      _sql.runSqlResult(_ctx.instrumentedQuery, sql);

  /// Applies validated pending-edit statements (same rules as POST /api/edits/apply).
  Future<void> applyEditsBatchStatements(List<String> statements) =>
      _editsBatch.runValidatedBatchStatements(statements);

  /// Health JSON for VM [ext.saropa.drift.getHealth] — aligns with GET /api/health shape.
  Map<String, dynamic> healthJsonForVmExtension() => <String, dynamic>{
    ServerConstants.jsonKeyOk: true,
    ServerConstants.jsonKeyExtensionConnected: true,
    ServerConstants.jsonKeyVersion: ServerConstants.packageVersion,
    ServerConstants.jsonKeyWriteEnabled: _ctx.writeQuery != null,
    ServerConstants.jsonKeyCapabilities: _ctx.writeQuery != null
        ? <String>[
            ServerConstants.capabilityIssues,
            ServerConstants.capabilityCellUpdate,
            ServerConstants.capabilityEditsApply,
          ]
        : <String>[ServerConstants.capabilityIssues],
  };

  /// Returns current generation for VM service RPC getGeneration.
  Future<int> getGeneration() => _generation.getCurrentGeneration();

  /// Returns performance data for VM service RPC getPerformance.
  Future<Map<String, dynamic>> getPerformanceData() =>
      _performance.getPerformanceData();

  /// Clears performance timings for VM service RPC clearPerformance.
  void clearPerformance() => _performance.clearPerformance();

  /// Returns anomaly scan result for VM service RPC getAnomalies.
  ///
  /// Uses [ServerContext.queryRaw] so introspection
  /// queries are not recorded in [queryTimings].
  Future<Map<String, dynamic>> getAnomaliesResult() =>
      _analytics.getAnomaliesResult(_ctx.queryRaw);

  /// Returns explain plan for VM service RPC explainSql.
  Future<Map<String, dynamic>> explainSqlResult(String sql) =>
      _sql.explainSqlResult(_ctx.instrumentedQuery, sql);

  /// Returns index suggestions list for VM service RPC getIndexSuggestions.
  ///
  /// Uses [ServerContext.queryRaw] so introspection
  /// queries are not recorded in [queryTimings].
  Future<List<Map<String, dynamic>>> getIndexSuggestionsList() async {
    final result = await _analytics.getIndexSuggestionsList(
      _ctx.queryRaw,
    );
    final list = result['suggestions'];
    return list is List<Map<String, dynamic>> ? list : <Map<String, dynamic>>[];
  }

  /// Returns merged issues list (index suggestions + anomalies) for VM
  /// service RPC getIssues. Same shape as GET /api/issues.
  /// On error, the returned map contains [ServerConstants.jsonKeyError].
  ///
  /// Uses [ServerContext.queryRaw] so introspection
  /// queries are not recorded in [queryTimings].
  Future<Map<String, dynamic>> getIssuesResult({String? sources}) =>
      _analytics.getIssuesList(_ctx.queryRaw, sources: sources);

  /// The current generation counter value, without
  /// triggering a change check. Used by VM service
  /// handlers when change detection is disabled.
  int get currentGeneration => _ctx.generation;

  /// Whether change detection is enabled (delegate for
  /// VM service and HTTP endpoints).
  bool get isChangeDetectionEnabled => _ctx.changeDetectionEnabled;

  /// Sets change detection enabled state (delegate for
  /// VM service and HTTP endpoints).
  void setChangeDetectionEnabled(bool enabled) {
    _ctx.changeDetectionEnabled = enabled;
  }

  // --- Change detection HTTP handlers ---

  /// Handles GET /api/change-detection.
  /// Returns {"changeDetection": true|false}.
  Future<void> _handleGetChangeDetection(HttpResponse response) async {
    final res = response;

    _ctx.setJsonHeaders(res);
    res.write(
      jsonEncode(<String, dynamic>{
        ServerConstants.jsonKeyChangeDetection: _ctx.changeDetectionEnabled,
      }),
    );
    await res.close();
  }

  /// Handles POST /api/change-detection.
  /// Expects JSON body: {"enabled": true|false}.
  /// Returns {"changeDetection": true|false}.
  Future<void> _handleSetChangeDetection(HttpRequest request) async {
    final res = request.response;

    try {
      final builder = BytesBuilder();

      await for (final chunk in request) {
        builder.add(chunk);
      }

      final body = utf8.decode(builder.toBytes());
      final decoded = ServerUtils.parseJsonMap(body);

      final enabledValue = decoded?[ServerConstants.jsonKeyEnabled];
      if (enabledValue is! bool) {
        res.statusCode = HttpStatus.badRequest;
        _ctx.setJsonHeaders(res);
        res.write(
          jsonEncode(<String, String>{
            ServerConstants.jsonKeyError:
                'Expected JSON body with '
                '"${ServerConstants.jsonKeyEnabled}": '
                'true|false',
          }),
        );
        await res.close();

        return;
      }

      final enabled = enabledValue;
      _ctx.changeDetectionEnabled = enabled;

      _ctx.setJsonHeaders(res);
      res.write(
        jsonEncode(<String, dynamic>{
          ServerConstants.jsonKeyChangeDetection: enabled,
        }),
      );
      await res.close();
    } on Object catch (error, stack) {
      _ctx.logError(error, stack);
      await _ctx.sendErrorResponse(res, error);
    }
  }

  @override
  String toString() => 'Router()';
}
