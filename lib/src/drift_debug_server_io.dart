// VM-only implementation: this file is selected by conditional export when
// dart.library.io is available. The stub (drift_debug_server_stub.dart) is used on web.
// This file is the VM-only implementation selected by conditional export; dart:io is required.
//
// Architecture: Single [_DriftDebugServerImpl] instance holds server, query callback, auth state,
// and optional snapshot/compare. Request flow: _onRequest → auth check → route by path →
// handler (table list, table data, schema, dump, SQL runner, snapshot, compare). All DB access
// goes through [DriftDebugQuery]; table names are allow-listed from sqlite_master. SQL runner
// accepts only read-only SQL (_isReadOnlySql). Live refresh: periodic _checkDataChange bumps
// _ctx!.generation; clients long-poll GET /api/generation?since=N.
import 'dart:async';
import 'dart:convert';
// VM-only implementation: conditional export selects stub on web; dart:io is required here.
import 'dart:io';
import 'dart:typed_data';

import 'package:collection/collection.dart';
import 'package:crypto/crypto.dart';
import 'package:saropa_drift_viewer/src/drift_debug_import.dart';
import 'package:saropa_drift_viewer/src/drift_debug_session.dart';

import 'server/server_constants.dart';
import 'server/server_context.dart';
import 'server/server_types.dart';
import 'server/html_content.dart';

// Public API typedefs are defined in server/server_context.dart
// and re-exported here so the barrel export chain is preserved.
export 'server/server_context.dart'
    show
        DriftDebugQuery,
        DriftDebugOnLog,
        DriftDebugOnError,
        DriftDebugGetDatabaseBytes,
        DriftDebugWriteQuery;

/// Debug-only HTTP server that exposes SQLite/Drift table data as JSON and a minimal web viewer.
///
/// Works with any database: pass a [query] callback that runs SQL and returns rows as maps.
/// Use [start] to bind the server (default port 8642); open http://127.0.0.1:8642 in a browser.
/// Only one server can run per process; use [stop] to shut down before calling [start] again.
///
/// Optional auth for secure dev tunnels (e.g. ngrok): when [authToken] or HTTP Basic
/// ([basicAuthUser] + [basicAuthPassword]) is set, all requests must be authenticated.
///
/// See the package README for API endpoints, UI features (live refresh, SQL runner, export),
/// and optional features (snapshots, database diff, download raw .sqlite).
/// Internal implementation; state is instance-based to satisfy avoid_static_state.
/// Database access is via [DriftDebugQuery] callbacks only; this class does not
/// hold sqflite or any DB reference (require_sqflite_close: N/A).
class _DriftDebugServerImpl {
  HttpServer? _server;
  StreamSubscription<HttpRequest>? _serverSubscription;

  /// Shared server state + utility methods; null when server is not running.
  ServerContext? _ctx;

  /// In-memory shared sessions for collaborative debug (POST /api/session/share, GET /api/session/{id}).
  final DriftDebugSessionStore _sessionStore = DriftDebugSessionStore();

  /// Validated POST /api/sql request body. Checks Content-Type then decodes and validates (require_content_type_validation, require_api_response_validation).
  ({SqlRequestBody? body, String? error}) _parseSqlBody(
      HttpRequest request, String body) {
    final contentType = request.headers.contentType?.mimeType;
    if (contentType != 'application/json') {
      return (body: null, error: 'Content-Type must be application/json');
    }
    Object? decoded;
    try {
      decoded = jsonDecode(body);
    } on Object catch (error, stack) {
      _ctx!.logError(error, stack);
      return (body: null, error: ServerConstants.errorInvalidJson);
    }
    // Explicit shape check here satisfies require_api_response_validation; fromJson repeats for single contract.
    if (decoded is! Map<String, dynamic>) {
      return (body: null, error: ServerConstants.errorInvalidJson);
    }
    final rawSql = decoded[ServerConstants.jsonKeySql];
    if (rawSql is! String || rawSql.trim().isEmpty) {
      return (body: null, error: ServerConstants.errorMissingSql);
    }
    final bodyObj = SqlRequestBody.fromJson(decoded);
    if (bodyObj == null) {
      return (body: null, error: ServerConstants.errorMissingSql);
    }
    return (body: bodyObj, error: null);
  }

  /// Starts the debug server if [enabled] is true and [query] is provided.
  ///
  /// No-op if [enabled] is false or the server is already running. [query] must execute
  /// the given SQL and return rows as a list of maps (e.g. from Drift's `customSelect` or
  /// any SQLite executor). The server serves a web UI and JSON APIs for table listing and
  /// table data; see the package README for endpoints.
  ///
  /// Parameters:
  /// * [query] — Required. Executes SQL and returns rows as `List<Map<String, dynamic>>`.
  /// * [enabled] — If false, the server is not started (default true).
  /// * [port] — Port to bind (default 8642).
  /// * [loopbackOnly] — If true, bind to 127.0.0.1 only; if false, bind to 0.0.0.0.
  /// * [corsOrigin] — Value for Access-Control-Allow-Origin: `'*'`, a specific origin, or null to omit.
  /// * [authToken] — Optional. When set, requests must include `Authorization: Bearer <token>`.
  ///   Token in URL (e.g. ?token=) is not supported to avoid leakage (avoid_token_in_url).
  /// * [basicAuthUser] and [basicAuthPassword] — Optional. When both set, HTTP Basic auth is accepted.
  ///   Stored in memory for dev-tunnel use only (require_data_encryption: production auth should use hashed credentials).
  /// * [getDatabaseBytes] — Optional. When set, GET /api/database serves the raw SQLite file for download (e.g. open in DB Browser). Use e.g. `() => File(dbPath).readAsBytes()`.
  /// * [queryCompare] — Optional. When set, enables database diff: compare this DB (main [query]) with another (e.g. staging) via GET /api/compare/report. Same schema check and per-table row count diff; export diff report.
  /// * [onLog] — Optional callback for startup banner and log messages.
  /// * [onError] — Optional callback for errors (e.g. [DriftDebugErrorLogger.errorCallback]).
  ///
  /// Throws [ArgumentError] if [port] is not in 0..65535 or if Basic auth is partially configured
  /// (one of [basicAuthUser] or [basicAuthPassword] set without the other).
  ///
  /// ## Example (callback-based, e.g. raw SQLite or custom executor)
  ///
  /// ```dart
  /// await DriftDebugServer.start(
  ///   query: (String sql) async {
  ///     final rows = await yourExecutor.customSelect(sql).get();
  ///     return rows.map((r) => Map<String, dynamic>.from(r.data)).toList();
  ///   },
  ///   enabled: kDebugMode,
  ///   onLog: (msg) => debugPrint(msg),
  ///   onError: (err, stack) => debugPrint('$err\n$stack'),
  /// );
  /// ```
  ///
  /// ## Example (Drift: wire customSelect as the query callback)
  ///
  /// When using Drift, implement [query] with your database's customSelect, or use the
  /// package's `startDriftViewer()` extension for one-line setup (see README).
  ///
  /// ```dart
  /// // AppDatabase extends GeneratedDatabase; dbPath is your SQLite file path.
  /// final db = AppDatabase();
  /// await DriftDebugServer.start(
  ///   query: (String sql) async {
  ///     final rows = await db.customSelect(sql).get();
  ///     return rows.map((r) => Map<String, dynamic>.from(r.data)).toList();
  ///   },
  ///   enabled: kDebugMode,
  ///   getDatabaseBytes: () => File(dbPath).readAsBytes(),
  ///   onLog: DriftDebugErrorLogger.logCallback(prefix: 'DriftDebug'),
  ///   onError: DriftDebugErrorLogger.errorCallback(prefix: 'DriftDebug'),
  /// );
  /// ```
  ///
  /// ## Example (with [DriftDebugErrorLogger.callbacks])
  ///
  /// ```dart
  /// final callbacks = DriftDebugErrorLogger.callbacks(prefix: 'DriftDebug');
  /// await DriftDebugServer.start(
  ///   query: runQuery,
  ///   enabled: kDebugMode,
  ///   onLog: callbacks.log,
  ///   onError: callbacks.error,
  /// );
  /// ```
  /// Throws [ArgumentError] for invalid port or partial Basic auth; package does not use @Throws.
  Future<void> start({
    required DriftDebugQuery query,
    bool enabled = true,
    int port = ServerConstants.defaultPort,
    bool loopbackOnly = false,
    String? corsOrigin = '*',
    String? authToken,
    String? basicAuthUser,
    String? basicAuthPassword,
    DriftDebugGetDatabaseBytes? getDatabaseBytes,
    DriftDebugQuery? queryCompare,
    DriftDebugWriteQuery? writeQuery,
    DriftDebugOnLog? onLog,
    DriftDebugOnError? onError,
  }) async {
    if (!enabled) return;
    final existing = _server;
    if (existing != null) return;

    // Defensive: reject invalid port and partial Basic auth before binding.
    if (port < ServerConstants.minPort || port > ServerConstants.maxPort) {
      throw ArgumentError(
        'Port must be in range ${ServerConstants.minPort}..${ServerConstants.maxPort} (0 = any port), got: $port',
      );
    }
    final hasBasicUser = basicAuthUser != null && basicAuthUser.isNotEmpty;
    final hasBasicPassword =
        basicAuthPassword != null && basicAuthPassword.isNotEmpty;
    if (hasBasicUser != hasBasicPassword) {
      throw ArgumentError(
          'Basic auth requires both basicAuthUser and basicAuthPassword to be set, or neither. Partial configuration is not allowed.');
    }

    // Store SHA256 hash of token only (require_data_encryption); never store plain token.
    final List<int>? tokenHash = (authToken != null && authToken.isNotEmpty)
        ? sha256.convert(utf8.encode(authToken)).bytes
        : null;

    _ctx = ServerContext(
      query: query,
      corsOrigin: corsOrigin,
      onLog: onLog,
      onError: onError,
      authTokenHash: tokenHash,
      basicAuthUser: basicAuthUser,
      basicAuthPassword: basicAuthPassword,
      getDatabaseBytes: getDatabaseBytes,
      queryCompare: queryCompare,
      writeQuery: writeQuery,
    );

    final ctx = _ctx;
    if (ctx == null) return;

    try {
      final address =
          loopbackOnly ? InternetAddress.loopbackIPv4 : InternetAddress.anyIPv4;
      _server = await HttpServer.bind(address, port);
      final server = _server;
      if (server == null) return;
      _serverSubscription = server.listen(_onRequest);

      ctx.log(ServerConstants.bannerTop);
      ctx.log(ServerConstants.bannerTitle);
      ctx.log(ServerConstants.bannerDivider);
      ctx.log(ServerConstants.bannerOpen);
      ctx.log('${ServerConstants.bannerUrlPrefix}$port');
      ctx.log(ServerConstants.bannerBottom);
    } on Object catch (error, stack) {
      ctx.logError(error, stack);
    }
  }

  /// The port the server is bound to, or null if not running. Exposed for tests.
  int? get port => _server?.port;

  /// Stops the server if running and clears stored state so [DriftDebugServer.start] can be called again.
  /// No-op if the server was not started.
  Future<void> dispose() => stop();

  @override
  String toString() =>
      '_DriftDebugServerImpl(port: ${_server?.port}, running: ${_server != null})';

  /// Stops the server if running and clears stored state so [DriftDebugServer.start] can be called again.
  /// No-op if the server was not started.
  Future<void> stop() async {
    final server = _server;
    if (server == null) return;
    await _serverSubscription?.cancel();
    _serverSubscription = null;
    _server = null;
    _ctx = null;
    await server.close();
  }


  /// Returns substring from [start] to [end] (or end of string). Safe for auth header parsing (avoids range errors).
  String _safeSubstring(String s, int start, [int? end]) {
    if (start < 0 || start >= s.length) return '';
    final endIndex = end ?? s.length;
    if (endIndex <= start) return '';
    final safeEnd = endIndex > s.length ? s.length : endIndex;
    if (start >= safeEnd) return '';
    return s.replaceRange(safeEnd, s.length, '').replaceRange(0, start, '');
  }

  /// Constant-time string comparison to reduce timing side channels (e.g. Basic auth user/password).
  bool _secureCompare(String a, String b) {
    if (a.length != b.length) return false;
    int result = 0;
    for (int i = 0; i < a.length; i++) {
      result |= a.codeUnitAt(i) ^ b.codeUnitAt(i);
    }
    return result == 0;
  }

  /// Constant-time comparison of two byte lists (for token hash comparison; avoids timing leaks).
  bool _secureCompareBytes(List<int> a, List<int> b) {
    if (a.length != b.length) return false;
    int result = 0;
    for (int i = 0; i < a.length; i++) {
      result |= a[i] ^ b[i];
    }
    return result == 0;
  }

  /// Returns true if the request has valid token (Bearer header only) or HTTP Basic credentials.
  /// Token in URL is not supported (avoid_token_in_url: tokens in URLs leak via history/logs/referrers).
  /// Token is verified via SHA256 hash comparison (constant-time).
  bool _isAuthenticated(HttpRequest request) {
    final tokenHash = _ctx!.authTokenHash;
    if (tokenHash != null) {
      final authHeader = request.headers.value(ServerConstants.headerAuthorization);
      if (authHeader != null &&
          authHeader.length > ServerConstants.authSchemeBearer.length &&
          authHeader.startsWith(ServerConstants.authSchemeBearer)) {
        final token = _safeSubstring(authHeader, ServerConstants.authSchemeBearer.length);
        if (token.isEmpty) return false;
        final incomingHash = sha256.convert(utf8.encode(token)).bytes;
        if (_secureCompareBytes(incomingHash, tokenHash)) return true;
      }
    }
    final user = _ctx!.basicAuthUser;
    final password = _ctx!.basicAuthPassword;
    if (user != null && user.isNotEmpty && password != null) {
      final authHeader = request.headers.value(ServerConstants.headerAuthorization);
      if (authHeader != null &&
          authHeader.length >= ServerConstants.authSchemeBasic.length &&
          authHeader.startsWith(ServerConstants.authSchemeBasic)) {
        try {
          final basicPayload =
              _safeSubstring(authHeader, ServerConstants.authSchemeBasic.length);
          if (basicPayload.isEmpty) return false;
          final decoded = utf8.decode(base64.decode(basicPayload));
          final colon = decoded.indexOf(':');
          if (colon >= 0 && colon < decoded.length) {
            final userPart = _safeSubstring(decoded, 0, colon);
            final passwordPart = _safeSubstring(decoded, colon + 1);
            if (_secureCompare(userPart, user) &&
                _secureCompare(passwordPart, password)) {
              return true;
            }
          }
        } on Object catch (error, stack) {
          _ctx!.logError(error, stack);
        }
      }
    }
    return false;
  }

  /// Sends 401 with JSON body; sets WWW-Authenticate for Basic when Basic auth is configured.
  Future<void> _sendUnauthorized(HttpResponse response) async {
    final res = response;
    res.statusCode = HttpStatus.unauthorized;
    if (_ctx!.basicAuthUser != null && _ctx!.basicAuthPassword != null) {
      res.headers
          .set(ServerConstants.headerWwwAuthenticate, 'Basic realm="${ServerConstants.realmDriftDebug}"');
    }
    _ctx!.setJsonHeaders(res);
    res.write(
        jsonEncode(<String, String>{ServerConstants.jsonKeyError: ServerConstants.authRequiredMessage}));
    await res.close();
  }

  /// Main request handler: auth → health/generation (no query) → route by method and path.
  /// All API routes that need DB access require _ctx!.instrumentedQuery; 503 if null. Errors are logged and sent as JSON.
  Future<void> _onRequest(HttpRequest request) async {
    final req = request;
    final res = req.response;
    final String path = req.uri.path;

    // When auth is configured, require it on every request (including health and HTML).
    if (_ctx!.authTokenHash != null ||
        (_ctx!.basicAuthUser != null && _ctx!.basicAuthPassword != null)) {
      if (!_isAuthenticated(req)) {
        await _sendUnauthorized(res);
        return;
      }
    }

    // Health and generation are handled before query check so probes / live-refresh work without DB.
    try {
      if (req.method == ServerConstants.methodGet &&
          (path == ServerConstants.pathApiHealth || path == ServerConstants.pathApiHealthAlt)) {
        await _sendHealth(res);
        return;
      }
      if (req.method == ServerConstants.methodGet &&
          (path == ServerConstants.pathApiGeneration || path == ServerConstants.pathApiGenerationAlt)) {
        await _handleGeneration(req);
        return;
      }
    } on Object catch (error, stack) {
      _ctx!.logError(error, stack);
      await _ctx!.sendErrorResponse(res, error);
      return;
    }

    final ctx = _ctx;
    if (ctx == null) {
      res.statusCode = HttpStatus.serviceUnavailable;
      await res.close();
      return;
    }
    final DriftDebugQuery query = ctx.instrumentedQuery;

    try {
      if (req.method == ServerConstants.methodGet && (path == '/' || path.isEmpty)) {
        await _sendHtml(res, req);
        return;
      }
      if (req.method == ServerConstants.methodGet &&
          (path == ServerConstants.pathApiTables || path == ServerConstants.pathApiTablesAlt)) {
        await _sendTableList(res, query);
        return;
      }
      if (req.method == ServerConstants.methodGet &&
          (path.startsWith(ServerConstants.pathApiTablePrefix) ||
              path.startsWith(ServerConstants.pathApiTablePrefixAlt))) {
        final String suffix = path.replaceFirst(RegExp(r'^/?api/table/'), '');
        if (suffix.endsWith(ServerConstants.pathSuffixCount)) {
          final String tableName = suffix.replaceFirst(RegExp(r'/count$'), '');
          await _sendTableCount(res, query, tableName);
          return;
        }
        if (suffix.endsWith(ServerConstants.pathSuffixColumns)) {
          final String tableName =
              suffix.replaceFirst(RegExp(r'/columns$'), '');
          await _sendTableColumns(res, query, tableName);
          return;
        }
        if (suffix.endsWith(ServerConstants.pathSuffixFkMeta)) {
          final String tableName =
              suffix.replaceFirst(RegExp(r'/fk-meta$'), '');
          await _sendTableFkMeta(res, query, tableName);
          return;
        }
        final String tableName = suffix;
        final int limit =
            ServerContext.parseLimit(req.uri.queryParameters[ServerConstants.queryParamLimit]);
        final int offset =
            ServerContext.parseOffset(req.uri.queryParameters[ServerConstants.queryParamOffset]);
        await _sendTableData(
            response: res,
            query: query,
            tableName: tableName,
            limit: limit,
            offset: offset);
        return;
      }
      if (req.method == ServerConstants.methodPost &&
          (path == ServerConstants.pathApiSqlExplain || path == ServerConstants.pathApiSqlExplainAlt)) {
        await _handleExplainSql(req, query);
        return;
      }
      if (req.method == ServerConstants.methodPost &&
          (path == ServerConstants.pathApiSql || path == ServerConstants.pathApiSqlAlt)) {
        await _handleRunSql(req, query);
        return;
      }
      if (req.method == ServerConstants.methodGet &&
          (path == ServerConstants.pathApiSchema || path == ServerConstants.pathApiSchemaAlt)) {
        await _sendSchemaDump(res, query);
        return;
      }
      if (req.method == ServerConstants.methodGet &&
          (path == ServerConstants.pathApiSchemaDiagram || path == ServerConstants.pathApiSchemaDiagramAlt)) {
        await _sendSchemaDiagram(res, query);
        return;
      }
      if (req.method == ServerConstants.methodGet &&
          (path == ServerConstants.pathApiSchemaMetadata ||
              path == ServerConstants.pathApiSchemaMetadataAlt)) {
        await _sendSchemaMetadata(res, query);
        return;
      }
      if (req.method == ServerConstants.methodGet &&
          (path == ServerConstants.pathApiDump || path == ServerConstants.pathApiDumpAlt)) {
        await _sendFullDump(res, query);
        return;
      }
      if (req.method == ServerConstants.methodGet &&
          (path == ServerConstants.pathApiDatabase || path == ServerConstants.pathApiDatabaseAlt)) {
        await _sendDatabaseFile(res);
        return;
      }
      if (req.method == ServerConstants.methodPost &&
          (path == ServerConstants.pathApiSnapshot || path == ServerConstants.pathApiSnapshotAlt)) {
        await _handleSnapshotCreate(res, query);
        return;
      }
      if (req.method == ServerConstants.methodGet &&
          (path == ServerConstants.pathApiSnapshot || path == ServerConstants.pathApiSnapshotAlt)) {
        await _handleSnapshotGet(res);
        return;
      }
      if (req.method == ServerConstants.methodGet &&
          (path == ServerConstants.pathApiSnapshotCompare ||
              path == ServerConstants.pathApiSnapshotCompareAlt)) {
        await _handleSnapshotCompare(res, req, query);
        return;
      }
      if (req.method == ServerConstants.methodDelete &&
          (path == ServerConstants.pathApiSnapshot || path == ServerConstants.pathApiSnapshotAlt)) {
        await _handleSnapshotDelete(res);
        return;
      }
      if (req.method == ServerConstants.methodGet &&
          (path.startsWith(ServerConstants.pathApiComparePrefix) ||
              path.startsWith(ServerConstants.pathApiComparePrefixAlt))) {
        await _handleCompareReport(res, req, query);
        return;
      }
      if (req.method == ServerConstants.methodGet &&
          (path == ServerConstants.pathApiIndexSuggestions ||
              path == ServerConstants.pathApiIndexSuggestionsAlt)) {
        await _handleIndexSuggestions(res, query);
        return;
      }
      if (req.method == ServerConstants.methodGet &&
          (path == ServerConstants.pathApiMigrationPreview ||
              path == ServerConstants.pathApiMigrationPreviewAlt)) {
        await _handleMigrationPreview(res, query);
        return;
      }
      if (req.method == ServerConstants.methodGet &&
          (path == ServerConstants.pathApiAnalyticsAnomalies ||
              path == ServerConstants.pathApiAnalyticsAnomaliesAlt)) {
        await _handleAnomalyDetection(res, query);
        return;
      }
      if (req.method == ServerConstants.methodGet &&
          (path == ServerConstants.pathApiAnalyticsSize ||
              path == ServerConstants.pathApiAnalyticsSizeAlt)) {
        await _handleSizeAnalytics(res, query);
        return;
      }
      if (req.method == ServerConstants.methodPost &&
          (path == ServerConstants.pathApiImport || path == ServerConstants.pathApiImportAlt)) {
        await _handleImport(req);
        return;
      }
      if (req.method == ServerConstants.methodPost &&
          (path == ServerConstants.pathApiSessionShare ||
              path == ServerConstants.pathApiSessionShareAlt)) {
        await _handleSessionShare(req);
        return;
      }
      if (path.startsWith(ServerConstants.pathApiSessionPrefix) ||
          path.startsWith(ServerConstants.pathApiSessionPrefixAlt)) {
        final suffix = path.startsWith(ServerConstants.pathApiSessionPrefix)
            ? path.substring(ServerConstants.pathApiSessionPrefix.length)
            : path.substring(ServerConstants.pathApiSessionPrefixAlt.length);
        if (suffix.endsWith(ServerConstants.pathSuffixAnnotate) &&
            req.method == ServerConstants.methodPost) {
          final sessionId =
              suffix.replaceFirst(RegExp(r'/annotate$'), '');
          await _handleSessionAnnotate(req, sessionId);
          return;
        }
        if (req.method == ServerConstants.methodGet) {
          await _handleSessionGet(res, suffix);
          return;
        }
      }

      if (req.method == ServerConstants.methodGet &&
          (path == ServerConstants.pathApiAnalyticsPerformance ||
              path == ServerConstants.pathApiAnalyticsPerformanceAlt)) {
        await _handlePerformanceAnalytics(res);
        return;
      }
      if (req.method == ServerConstants.methodDelete &&
          (path == ServerConstants.pathApiAnalyticsPerformance ||
              path == ServerConstants.pathApiAnalyticsPerformanceAlt)) {
        await _clearPerformanceData(res);
        return;
      }

      res.statusCode = HttpStatus.notFound;
      await res.close();
    } on Object catch (error, stack) {
      _ctx!.logError(error, stack);
      await _ctx!.sendErrorResponse(res, error);
    }
  }

  /// Validates that [sql] is read-only: single statement, SELECT or WITH...SELECT only.
  /// Rejects INSERT/UPDATE/DELETE and DDL (CREATE/ALTER/DROP etc.). Used by POST /api/sql only.
  bool _isReadOnlySql(String sql) {
    final trimmed = sql.trim();
    if (trimmed.isEmpty) return false;
    // Remove single-line and block comments so keywords inside comments are ignored.
    final noLineComments = trimmed.replaceAll(RegExp(r'--[^\n]*'), ' ');
    final noBlockComments =
        noLineComments.replaceAll(RegExp(r'/\*[\s\S]*?\*/'), ' ');
    // Replace string literals with placeholders so keywords inside strings (e.g. SELECT 'INSERT') don't trigger.
    final noSingleQuotes =
        noBlockComments.replaceAllMapped(RegExp(r"'(?:[^']|'')*'"), (_) => '?');
    final noStrings =
        noSingleQuotes.replaceAllMapped(RegExp(r'"(?:[^"]|"")*"'), (_) => '?');
    final sqlNoStrings = noStrings.trim();
    // Only one statement (no semicolon in the middle; trailing semicolon allowed).
    final firstSemicolon = sqlNoStrings.indexOf(';');
    if (firstSemicolon >= 0 &&
        firstSemicolon + ServerConstants.indexAfterSemicolon <= sqlNoStrings.length &&
        firstSemicolon < sqlNoStrings.length - ServerConstants.indexAfterSemicolon) {
      final after =
          _safeSubstring(sqlNoStrings, firstSemicolon + ServerConstants.indexAfterSemicolon)
              .trim();
      if (after.isNotEmpty) return false;
    }
    final withoutTrailingSemicolon = sqlNoStrings.endsWith(';')
        ? _safeSubstring(
                sqlNoStrings, 0, sqlNoStrings.length - ServerConstants.indexAfterSemicolon)
            .trim()
        : sqlNoStrings;
    final upper = withoutTrailingSemicolon.toUpperCase();
    const selectPrefix = 'SELECT ';
    const withPrefix = 'WITH ';
    if (!upper.startsWith(selectPrefix) && !upper.startsWith(withPrefix)) {
      return false;
    }
    // Forbidden keywords (word boundary to avoid false positives in identifiers).
    const forbidden = <String>{
      'INSERT',
      'UPDATE',
      'DELETE',
      'REPLACE',
      'TRUNCATE',
      'CREATE',
      'ALTER',
      'DROP',
      'ATTACH',
      'DETACH',
      'PRAGMA',
      'VACUUM',
      'ANALYZE',
      'REINDEX',
    };
    final words = RegExp(r'\b\w+\b');
    for (final match in words.allMatches(upper)) {
      final word = match.group(0);
      if (word != null && forbidden.contains(word)) return false;
    }
    return true;
  }

  /// Reads, parses, and validates a POST SQL request body. Returns the validated read-only SQL
  /// string, or null if validation failed (error response already sent and closed).
  /// Shared by [_handleRunSql] and [_handleExplainSql] to avoid duplicating body-reading,
  /// Content-Type checking, JSON parsing, and read-only validation.
  Future<String?> _readAndValidateSqlBody(HttpRequest request) async {
    final res = request.response;
    String body;
    try {
      final builder = BytesBuilder();
      await for (final chunk in request) {
        builder.add(chunk);
      }
      body = utf8.decode(builder.toBytes());
    } on Object catch (error, stack) {
      _ctx!.logError(error, stack);
      res.statusCode = HttpStatus.badRequest;
      _ctx!.setJsonHeaders(res);
      res.write(jsonEncode(
          <String, String>{ServerConstants.jsonKeyError: ServerConstants.errorInvalidRequestBody}));
      await res.close();
      return null;
    }
    final result = _parseSqlBody(request, body);
    final bodyObj = result.body;
    if (bodyObj == null) {
      res.statusCode = HttpStatus.badRequest;
      _ctx!.setJsonHeaders(res);
      res.write(jsonEncode(<String, String>{
        ServerConstants.jsonKeyError: result.error ?? ServerConstants.errorInvalidJson,
      }));
      await res.close();
      return null;
    }
    final String sql = bodyObj.sql;
    if (!_isReadOnlySql(sql)) {
      res.statusCode = HttpStatus.badRequest;
      _ctx!.setJsonHeaders(res);
      res.write(jsonEncode(<String, String>{
        ServerConstants.jsonKeyError: ServerConstants.errorReadOnlyOnly,
      }));
      await res.close();
      return null;
    }
    return sql;
  }

  /// Handles POST /api/sql: body {"sql": "SELECT ..."}. Validates read-only via _isReadOnlySql; returns {"rows": [...]}.
  Future<void> _handleRunSql(HttpRequest request, DriftDebugQuery query) async {
    final sql = await _readAndValidateSqlBody(request);
    if (sql == null) return;
    final res = request.response;
    try {
      final dynamic raw = await query(sql);
      final List<Map<String, dynamic>> rows = ServerContext.normalizeRows(raw);
      _ctx!.setJsonHeaders(res);
      res.write(jsonEncode(<String, dynamic>{ServerConstants.jsonKeyRows: rows}));
    } on Object catch (error, stack) {
      _ctx!.logError(error, stack);
      res.statusCode = HttpStatus.internalServerError;
      _ctx!.setJsonHeaders(res);
      res.write(jsonEncode(<String, String>{ServerConstants.jsonKeyError: error.toString()}));
    } finally {
      await res.close();
    }
  }

  /// Handles POST /api/sql/explain: body {"sql": "SELECT ..."}. Prepends EXPLAIN QUERY PLAN; returns {"rows": [...], "sql": "EXPLAIN ..."}.
  Future<void> _handleExplainSql(
      HttpRequest request, DriftDebugQuery query) async {
    final sql = await _readAndValidateSqlBody(request);
    if (sql == null) return;
    final res = request.response;
    try {
      final explainSql = 'EXPLAIN QUERY PLAN $sql';
      final dynamic raw = await query(explainSql);
      final rows = ServerContext.normalizeRows(raw);
      _ctx!.setJsonHeaders(res);
      res.write(jsonEncode(<String, dynamic>{
        ServerConstants.jsonKeyRows: rows,
        ServerConstants.jsonKeySql: explainSql,
      }));
    } on Object catch (error, stack) {
      _ctx!.logError(error, stack);
      res.statusCode = HttpStatus.internalServerError;
      _ctx!.setJsonHeaders(res);
      res.write(jsonEncode(<String, String>{ServerConstants.jsonKeyError: error.toString()}));
    } finally {
      await res.close();
    }
  }


  /// GET /api/tables — returns JSON array of table names (from sqlite_master, excluding sqlite_*).
  Future<void> _sendTableList(
      HttpResponse response, DriftDebugQuery query) async {
    final res = response;
    await _ctx!.checkDataChange();
    final List<String> names = await ServerContext.getTableNames(query);
    _ctx!.setJsonHeaders(res);
    res.write(jsonEncode(names));
    await res.close();
  }

  /// Returns JSON list of column names for GET `/api/table/<name>/columns` (for SQL autofill).
  Future<void> _sendTableColumns(
    HttpResponse response,
    DriftDebugQuery query,
    String tableName,
  ) async {
    final res = response;
    if (!await _ctx!.requireKnownTable(res, query, tableName)) return;
    // PRAGMA table_info returns cid, name, type, notnull, dflt_value, pk.
    final dynamic rawInfo = await query('PRAGMA table_info("$tableName")');
    final List<Map<String, dynamic>> rows = ServerContext.normalizeRows(rawInfo);
    final List<String> columns = rows
        .map((r) => r[ServerConstants.jsonKeyName] as String? ?? '')
        .where((s) => s.isNotEmpty)
        .toList();
    _ctx!.setJsonHeaders(res);
    res.write(jsonEncode(columns));
    await res.close();
  }

  /// Returns FK metadata for GET `/api/table/<name>/fk-meta`.
  Future<void> _sendTableFkMeta(
    HttpResponse response,
    DriftDebugQuery query,
    String tableName,
  ) async {
    final res = response;
    if (!await _ctx!.requireKnownTable(res, query, tableName)) return;
    try {
      final List<Map<String, dynamic>> fkRows = ServerContext.normalizeRows(
        await query('PRAGMA foreign_key_list("$tableName")'),
      );
      final List<Map<String, dynamic>> fks = fkRows
          .map((r) {
            final fromCol = r[ServerConstants.pragmaFrom] as String?;
            final toTable = r[ServerConstants.jsonKeyTable] as String?;
            final toCol = r[ServerConstants.pragmaTo] as String?;
            if (fromCol == null || toTable == null || toCol == null) {
              return null;
            }
            return <String, dynamic>{
              ServerConstants.fkFromColumn: fromCol,
              ServerConstants.fkToTable: toTable,
              ServerConstants.fkToColumn: toCol,
            };
          })
          .whereType<Map<String, dynamic>>()
          .toList();
      _ctx!.setJsonHeaders(res);
      res.write(jsonEncode(fks));
    } on Object catch (error, stack) {
      _ctx!.logError(error, stack);
      await _ctx!.sendErrorResponse(res, error);
    } finally {
      await res.close();
    }
  }

  /// Returns JSON {"count": N} for GET `/api/table/<name>/count`.
  Future<void> _sendTableCount(
    HttpResponse response,
    DriftDebugQuery query,
    String tableName,
  ) async {
    final res = response;
    if (!await _ctx!.requireKnownTable(res, query, tableName)) return;
    final dynamic rawCount =
        await query('SELECT COUNT(*) AS c FROM "$tableName"');
    final List<Map<String, dynamic>> rows = ServerContext.normalizeRows(rawCount);
    final int count = ServerContext.extractCountFromRows(rows);
    _ctx!.setJsonHeaders(res);
    res.write(jsonEncode(<String, int>{ServerConstants.jsonKeyCount: count}));
    await res.close();
  }

  /// GET `/api/table/<name>?limit=&offset=` — returns JSON array of rows. Table name is allow-listed; limit/offset validated.
  Future<void> _sendTableData({
    required HttpResponse response,
    required DriftDebugQuery query,
    required String tableName,
    required int limit,
    required int offset,
  }) async {
    final res = response;
    if (!await _ctx!.requireKnownTable(res, query, tableName)) return;
    // Table name from allow-list; limit/offset validated so interpolation is safe.
    final dynamic raw =
        await query('SELECT * FROM "$tableName" LIMIT $limit OFFSET $offset');
    final List<Map<String, dynamic>> data = ServerContext.normalizeRows(raw);
    _ctx!.setJsonHeaders(res);
    res.write(const JsonEncoder.withIndent('  ').convert(data));
    await res.close();
  }


  /// GET /api/health — returns {"ok": true}. Used by health checks and tunnels.
  Future<void> _sendHealth(HttpResponse response) async {
    final res = response;
    _ctx!.setJsonHeaders(res);
    res.write(jsonEncode(<String, dynamic>{ServerConstants.jsonKeyOk: true}));
    await res.close();
  }

  /// Handles GET /api/generation. Returns current [_ctx!.generation]. Query parameter `since` triggers long-poll
  /// until generation > since or [ServerConstants.longPollTimeout]; reduces client polling when idle.
  /// Change detection runs on demand (here and in the long-poll loop) to satisfy avoid_work_in_paused_state.
  Future<void> _handleGeneration(HttpRequest request) async {
    final req = request;
    final res = req.response;
    await _ctx!.checkDataChange();
    final sinceRaw = req.uri.queryParameters[ServerConstants.queryParamSince];
    final int? since = sinceRaw != null ? int.tryParse(sinceRaw) : null;
    if (since != null && since >= 0) {
      final deadline = DateTime.now().toUtc().add(ServerConstants.longPollTimeout);
      while (
          DateTime.now().toUtc().isBefore(deadline) && _ctx!.generation <= since) {
        await Future<void>.delayed(ServerConstants.longPollCheckInterval);
        await _ctx!.checkDataChange();
      }
    }
    _ctx!.setJsonHeaders(res);
    res.write(jsonEncode(<String, int>{ServerConstants.jsonKeyGeneration: _ctx!.generation}));
    await res.close();
  }


  /// Sends schema-only SQL dump (CREATE statements from sqlite_master, no data).
  Future<void> _sendSchemaDump(
      HttpResponse response, DriftDebugQuery query) async {
    final res = response;
    final String schema = await ServerContext.getSchemaSql(query);
    res.statusCode = HttpStatus.ok;
    _ctx!.setAttachmentHeaders(res, ServerConstants.attachmentSchemaSql);
    res.write(schema);
    await res.close();
  }

  /// Returns diagram data for GET /api/schema/diagram: tables with columns, and foreign keys (PRAGMA foreign_key_list).
  Future<Map<String, dynamic>> _getDiagramData(DriftDebugQuery query) async {
    final List<String> tableNames = await ServerContext.getTableNames(query);
    final List<Map<String, dynamic>> tables = [];
    final List<Map<String, dynamic>> foreignKeys = [];

    for (final tableName in tableNames) {
      final List<Map<String, dynamic>> infoRows =
          await query('PRAGMA table_info("$tableName")');
      final List<Map<String, dynamic>> columns = infoRows.map((r) {
        final name = r['name'];
        final type = r['type'];
        final pk = r['pk'];
        return <String, dynamic>{
          ServerConstants.jsonKeyName: name is String? ? name ?? '' : '',
          ServerConstants.jsonKeyType: type is String? ? type ?? '' : '',
          ServerConstants.jsonKeyPk: pk is int ? pk != 0 : false,
        };
      }).toList();

      tables.add(<String, dynamic>{
        ServerConstants.jsonKeyName: tableName,
        ServerConstants.jsonKeyColumns: columns,
      });

      try {
        final dynamic rawFk =
            await query('PRAGMA foreign_key_list("$tableName")');
        final List<Map<String, dynamic>> fkRows = ServerContext.normalizeRows(rawFk);
        for (final r in fkRows) {
          final toTable = r[ServerConstants.jsonKeyTable] as String?;
          final fromCol = r[ServerConstants.pragmaFrom] as String?;
          final toCol = r[ServerConstants.pragmaTo] as String?;
          if (toTable != null &&
              toTable.isNotEmpty &&
              fromCol != null &&
              toCol != null) {
            foreignKeys.add(<String, dynamic>{
              ServerConstants.fkFromTable: tableName,
              ServerConstants.fkFromColumn: fromCol,
              ServerConstants.fkToTable: toTable,
              ServerConstants.fkToColumn: toCol,
            });
          }
        }
      } on Object catch (error, stack) {
        _ctx!.logError(error, stack);
      }
    }

    return <String, dynamic>{
      ServerConstants.jsonKeyTables: tables,
      ServerConstants.jsonKeyForeignKeys: foreignKeys,
    };
  }

  /// Sends JSON diagram data for GET /api/schema/diagram (tables + columns + foreign keys).
  Future<void> _sendSchemaDiagram(
      HttpResponse response, DriftDebugQuery query) async {
    final res = response;
    try {
      final Map<String, dynamic> data = await _getDiagramData(query);
      _ctx!.setJsonHeaders(res);
      res.write(const JsonEncoder.withIndent('  ').convert(data));
    } on Object catch (error, stack) {
      _ctx!.logError(error, stack);
      res.statusCode = HttpStatus.internalServerError;
      res.headers.contentType = ContentType.json;
      _ctx!.setCors(res);
      res.write(jsonEncode(<String, String>{ServerConstants.jsonKeyError: error.toString()}));
    } finally {
      await res.close();
    }
  }

  /// Sends schema metadata for GET /api/schema/metadata: tables with columns (name, type, pk) and row counts.
  /// Used by the natural-language-to-SQL engine on the client side.
  Future<void> _sendSchemaMetadata(
    HttpResponse response,
    DriftDebugQuery query,
  ) async {
    final res = response;
    try {
      final tableNames = await ServerContext.getTableNames(query);
      final tables = <Map<String, dynamic>>[];
      for (final tableName in tableNames) {
        final infoRows = ServerContext.normalizeRows(
          await query('PRAGMA table_info("$tableName")'),
        );
        final columns = infoRows
            .map((r) => <String, dynamic>{
                  ServerConstants.jsonKeyName: r[ServerConstants.jsonKeyName] ?? '',
                  ServerConstants.jsonKeyType: r[ServerConstants.jsonKeyType] ?? '',
                  ServerConstants.jsonKeyPk: (r[ServerConstants.jsonKeyPk] is int) ? r[ServerConstants.jsonKeyPk] != 0 : false,
                })
            .toList();
        final countRows = ServerContext.normalizeRows(
          await query('SELECT COUNT(*) AS ${ServerConstants.jsonKeyCountColumn} FROM "$tableName"'),
        );
        final count = ServerContext.extractCountFromRows(countRows);
        tables.add(<String, dynamic>{
          ServerConstants.jsonKeyName: tableName,
          ServerConstants.jsonKeyColumns: columns,
          ServerConstants.jsonKeyRowCount: count,
        });
      }
      _ctx!.setJsonHeaders(res);
      res.write(jsonEncode(<String, dynamic>{ServerConstants.jsonKeyTables: tables}));
    } on Object catch (error, stack) {
      _ctx!.logError(error, stack);
      await _ctx!.sendErrorResponse(res, error);
    } finally {
      await res.close();
    }
  }


  /// Builds full dump SQL: schema (CREATEs) plus INSERT statements for every table row.
  /// Table names come from allow-list so interpolation is safe.
  Future<String> _getFullDumpSql(DriftDebugQuery query) async {
    final buffer = StringBuffer();
    final schema = await ServerContext.getSchemaSql(query);
    buffer.writeln(schema);
    buffer.writeln('-- Data dump');
    final tables = await ServerContext.getTableNames(query);
    for (final table in tables) {
      final dynamic raw = await query('SELECT * FROM "$table"');
      final List<Map<String, dynamic>> rows = ServerContext.normalizeRows(raw);
      if (rows.isEmpty) continue;
      final firstRow = rows.firstOrNull;
      if (firstRow == null) continue;
      final keys = firstRow.keys.toList();
      if (keys.isEmpty) continue;
      final colList = keys.map((k) => '"$k"').join(', ');
      for (final row in rows) {
        final values = keys.map((k) => ServerContext.sqlLiteral(row[k])).join(', ');
        buffer.writeln('INSERT INTO "$table" ($colList) VALUES ($values);');
      }
    }
    return buffer.toString();
  }

  /// Sends full dump (schema + data) as downloadable SQL file. May be slow for large DBs.
  Future<void> _sendFullDump(
      HttpResponse response, DriftDebugQuery query) async {
    final res = response;
    final String dump = await _getFullDumpSql(query);
    res.statusCode = HttpStatus.ok;
    _ctx!.setAttachmentHeaders(res, ServerConstants.attachmentDumpSql);
    res.write(dump);
    await res.close();
  }

  /// Sends the raw SQLite database file when the server was started with the getDatabaseBytes callback.
  /// Returns 501 Not Implemented if not configured. Used by the UI "Download database (raw .sqlite)" link.
  Future<void> _sendDatabaseFile(HttpResponse response) async {
    final res = response;
    final getBytes = _ctx!.getDatabaseBytes;
    if (getBytes == null) {
      res.statusCode = HttpStatus.notImplemented;
      _ctx!.setJsonHeaders(res);
      res.write(jsonEncode(<String, String>{
        ServerConstants.jsonKeyError: ServerConstants.errorDatabaseDownloadNotConfigured,
      }));
      await res.close();
      return;
    }
    try {
      final bytes = await getBytes();
      // Empty list is valid (e.g. in-memory DB); respond 200 with zero-length body.
      res.statusCode = HttpStatus.ok;
      res.headers.contentType = ContentType(
          ServerConstants.contentTypeApplicationOctetStream, ServerConstants.contentTypeOctetStream);
      res.headers.set(ServerConstants.headerContentDisposition, ServerConstants.attachmentDatabaseSqlite);
      _ctx!.setCors(res);
      res.add(bytes);
    } on Object catch (error, stack) {
      _ctx!.logError(error, stack);
      res.statusCode = HttpStatus.internalServerError;
      res.headers.contentType = ContentType.json;
      _ctx!.setCors(res);
      res.write(jsonEncode(<String, String>{ServerConstants.jsonKeyError: error.toString()}));
    } finally {
      await res.close();
    }
  }


  /// Handles POST /api/snapshot: captures full table data for all tables into in-memory [_ctx!.snapshot].
  Future<void> _handleSnapshotCreate(
    HttpResponse response,
    DriftDebugQuery query,
  ) async {
    final res = response;
    try {
      final tables = await ServerContext.getTableNames(query);
      final Map<String, List<Map<String, dynamic>>> data = {};
      for (final table in tables) {
        final List<Map<String, dynamic>> rows =
            await query('SELECT * FROM "$table"');
        data[table] = rows.map((r) => Map<String, dynamic>.from(r)).toList();
      }
      final id = DateTime.now().toUtc().toIso8601String();
      final createdAt = DateTime.now().toUtc();
      final created = Snapshot(id: id, createdAt: createdAt, tables: data);
      _ctx!.snapshot = created;
      _ctx!.setJsonHeaders(res);
      res.write(jsonEncode(<String, dynamic>{
        ServerConstants.jsonKeyId: created.id,
        ServerConstants.jsonKeyCreatedAt: created.createdAt.toUtc().toIso8601String(),
        ServerConstants.jsonKeyTableCount: created.tables.length,
        ServerConstants.jsonKeyTables: created.tables.keys.toList(),
      }));
    } on Object catch (error, stack) {
      _ctx!.logError(error, stack);
      res.statusCode = HttpStatus.internalServerError;
      res.headers.contentType = ContentType.json;
      _ctx!.setCors(res);
      res.write(jsonEncode(<String, String>{ServerConstants.jsonKeyError: error.toString()}));
    } finally {
      await res.close();
    }
  }

  /// Handles GET /api/snapshot: returns snapshot metadata (id, createdAt, table counts) or null.
  Future<void> _handleSnapshotGet(HttpResponse response) async {
    final res = response;
    final snap = _ctx!.snapshot;
    if (snap == null) {
      res.statusCode = HttpStatus.ok;
      _ctx!.setJsonHeaders(res);
      res.write(jsonEncode(<String, dynamic>{ServerConstants.jsonKeySnapshot: null}));
      await res.close();
      return;
    }
    final tableCounts = <String, int>{};
    for (final e in snap.tables.entries) {
      tableCounts[e.key] = e.value.length;
    }
    _ctx!.setJsonHeaders(res);
    res.write(jsonEncode(<String, dynamic>{
      ServerConstants.jsonKeySnapshot: <String, dynamic>{
        ServerConstants.jsonKeyId: snap.id,
        ServerConstants.jsonKeyCreatedAt: snap.createdAt.toUtc().toIso8601String(),
        ServerConstants.jsonKeyTables: snap.tables.keys.toList(),
        ServerConstants.jsonKeyCounts: tableCounts,
      },
    }));
    await res.close();
  }

  /// Handles GET /api/snapshot/compare: diffs current DB vs [_ctx!.snapshot] (per-table added/removed/unchanged). Optional ?format=download.
  Future<void> _handleSnapshotCompare(
    HttpResponse response,
    HttpRequest request,
    DriftDebugQuery query,
  ) async {
    final res = response;
    final req = request;
    final snap = _ctx!.snapshot;
    if (snap == null) {
      res.statusCode = HttpStatus.badRequest;
      _ctx!.setJsonHeaders(res);
      res.write(jsonEncode(<String, String>{
        ServerConstants.jsonKeyError: ServerConstants.errorNoSnapshot,
      }));
      await res.close();
      return;
    }
    try {
      final tablesNow = await ServerContext.getTableNames(query);
      final allTables = <String>{...snap.tables.keys, ...tablesNow};
      final List<Map<String, dynamic>> tableDiffs = [];
      for (final table in allTables.toList()..sort()) {
        final rowsThen = snap.tables[table] ?? [];
        final rowsNowList = tablesNow.contains(table)
            ? ServerContext.normalizeRows(await query('SELECT * FROM "$table"'))
            : <Map<String, dynamic>>[];
        final setThen = rowsThen.map(ServerContext.rowSignature).toSet();
        final setNow = rowsNowList.map(ServerContext.rowSignature).toSet();
        final added = setNow.difference(setThen).length;
        final removed = setThen.difference(setNow).length;
        final inBoth = setThen.intersection(setNow).length;
        tableDiffs.add(<String, dynamic>{
          ServerConstants.jsonKeyTable: table,
          ServerConstants.jsonKeyCountThen: rowsThen.length,
          ServerConstants.jsonKeyCountNow: rowsNowList.length,
          ServerConstants.jsonKeyAdded: added,
          ServerConstants.jsonKeyRemoved: removed,
          ServerConstants.jsonKeyUnchanged: inBoth,
        });
      }
      final body = <String, dynamic>{
        ServerConstants.jsonKeySnapshotId: snap.id,
        ServerConstants.jsonKeySnapshotCreatedAt: snap.createdAt.toUtc().toIso8601String(),
        ServerConstants.jsonKeyComparedAt: DateTime.now().toUtc().toIso8601String(),
        ServerConstants.jsonKeyTables: tableDiffs,
      };
      if (req.uri.queryParameters[ServerConstants.queryParamFormat] == ServerConstants.formatDownload) {
        res.statusCode = HttpStatus.ok;
        res.headers.contentType = ContentType.json;
        res.headers.set(ServerConstants.headerContentDisposition, ServerConstants.attachmentSnapshotDiff);
        _ctx!.setCors(res);
        res.write(const JsonEncoder.withIndent('  ').convert(body));
      } else {
        _ctx!.setJsonHeaders(res);
        res.write(const JsonEncoder.withIndent('  ').convert(body));
      }
    } on Object catch (error, stack) {
      _ctx!.logError(error, stack);
      res.statusCode = HttpStatus.internalServerError;
      res.headers.contentType = ContentType.json;
      _ctx!.setCors(res);
      res.write(jsonEncode(<String, String>{ServerConstants.jsonKeyError: error.toString()}));
    } finally {
      await res.close();
    }
  }

  /// Handles DELETE /api/snapshot: clears the in-memory snapshot.
  Future<void> _handleSnapshotDelete(HttpResponse response) async {
    final res = response;
    _ctx!.snapshot = null;
    _ctx!.setJsonHeaders(res);
    res.write(
        jsonEncode(<String, String>{ServerConstants.jsonKeyOk: ServerConstants.messageSnapshotCleared}));
    await res.close();
  }

  /// Handles GET /api/compare/report: schema and per-table row count diff between main [query] and [_ctx!.queryCompare]. Optional ?format=download.
  Future<void> _handleCompareReport(
    HttpResponse response,
    HttpRequest request,
    DriftDebugQuery query,
  ) async {
    final res = response;
    final req = request;
    final queryB = _ctx!.queryCompare;
    if (queryB == null) {
      res.statusCode = HttpStatus.notImplemented;
      _ctx!.setJsonHeaders(res);
      res.write(jsonEncode(<String, String>{
        ServerConstants.jsonKeyError: ServerConstants.errorCompareNotConfigured,
      }));
      await res.close();
      return;
    }
    final path = req.uri.path;
    if (path != ServerConstants.pathApiCompareReport && path != ServerConstants.pathApiCompareReportAlt) {
      res.statusCode = HttpStatus.notFound;
      await res.close();
      return;
    }
    try {
      final schemaA = await ServerContext.getSchemaSql(query);
      final schemaB = await ServerContext.getSchemaSql(queryB);
      final tablesA = await ServerContext.getTableNames(query);
      final tablesB = await ServerContext.getTableNames(queryB);
      final allTables = <String>{...tablesA, ...tablesB}.toList()..sort();
      final schemaSame = schemaA == schemaB;
      final List<Map<String, dynamic>> countDiffs = [];
      for (final table in allTables) {
        final futures = <Future<List<Map<String, dynamic>>>>[];
        if (tablesA.contains(table)) {
          futures.add(query('SELECT COUNT(*) AS c FROM "$table"'));
        }
        if (tablesB.contains(table)) {
          futures.add(queryB('SELECT COUNT(*) AS c FROM "$table"'));
        }
        final results = futures.isEmpty
            ? <List<Map<String, dynamic>>>[]
            : await Future.wait(futures);
        int countA = 0;
        int countB = 0;
        int idx = 0;
        if (tablesA.contains(table)) {
          countA = ServerContext.extractCountFromRows(results[idx++]);
        }
        if (tablesB.contains(table)) {
          countB = ServerContext.extractCountFromRows(results[idx++]);
        }
        countDiffs.add(<String, dynamic>{
          ServerConstants.jsonKeyTable: table,
          ServerConstants.jsonKeyCountA: countA,
          ServerConstants.jsonKeyCountB: countB,
          ServerConstants.jsonKeyDiff: countA - countB,
          ServerConstants.jsonKeyOnlyInA: !tablesB.contains(table),
          ServerConstants.jsonKeyOnlyInB: !tablesA.contains(table),
        });
      }
      final report = <String, dynamic>{
        ServerConstants.jsonKeySchemaSame: schemaSame,
        ServerConstants.jsonKeySchemaDiff: schemaSame
            ? null
            : <String, String>{ServerConstants.jsonKeyA: schemaA, ServerConstants.jsonKeyB: schemaB},
        // JsonEncoder.convert expects List for array values; iterable is not sufficient.
        ServerConstants.jsonKeyTablesOnlyInA:
            tablesA.where((t) => !tablesB.contains(t)).toList(),
        // Same: JSON encoder requires List, not Iterable.
        ServerConstants.jsonKeyTablesOnlyInB:
            tablesB.where((t) => !tablesA.contains(t)).toList(),
        ServerConstants.jsonKeyTableCounts: countDiffs,
        ServerConstants.jsonKeyGeneratedAt: DateTime.now().toUtc().toIso8601String(),
      };
      final format = req.uri.queryParameters[ServerConstants.queryParamFormat];
      if (format == ServerConstants.formatDownload) {
        res.statusCode = HttpStatus.ok;
        res.headers.contentType = ContentType.json;
        res.headers.set(ServerConstants.headerContentDisposition, ServerConstants.attachmentDiffReport);
        _ctx!.setCors(res);
        res.write(const JsonEncoder.withIndent('  ').convert(report));
      } else {
        _ctx!.setJsonHeaders(res);
        res.write(const JsonEncoder.withIndent('  ').convert(report));
      }
    } on Object catch (error, stack) {
      _ctx!.logError(error, stack);
      res.statusCode = HttpStatus.internalServerError;
      res.headers.contentType = ContentType.json;
      _ctx!.setCors(res);
      res.write(jsonEncode(<String, String>{ServerConstants.jsonKeyError: error.toString()}));
    } finally {
      await res.close();
    }
  }

  /// Handles GET /api/migration/preview: compares main DB schema against
  /// [_ctx!.queryCompare] and generates ALTER TABLE / CREATE TABLE / DROP TABLE
  /// DDL statements for migration.
  Future<void> _handleMigrationPreview(
    HttpResponse response,
    DriftDebugQuery query,
  ) async {
    final res = response;
    final queryB = _ctx!.queryCompare;

    if (queryB == null) {
      res.statusCode = HttpStatus.notImplemented;
      _ctx!.setJsonHeaders(res);
      res.write(jsonEncode(<String, String>{
        ServerConstants.jsonKeyError: ServerConstants.errorMigrationRequiresCompare,
      }));
      await res.close();
      return;
    }

    try {
      // "A" = current (source), "B" = compare (target/desired state)
      final tablesA = await ServerContext.getTableNames(query);
      final tablesB = await ServerContext.getTableNames(queryB);
      final migrations = <String>[];

      await _migrationNewTables(migrations, tablesA, tablesB, queryB);
      _migrationDroppedTables(migrations, tablesA, tablesB);
      await _migrationModifiedTables(
        migrations, tablesA, tablesB, query, queryB,
      );

      final migrationSql = migrations.join('\n');

      _ctx!.setJsonHeaders(res);
      res.write(jsonEncode(<String, dynamic>{
        'migrationSql': migrationSql,
        'changeCount': migrations
            .where((l) => !l.startsWith('--') && l.trim().isNotEmpty)
            .length,
        'hasWarnings': migrations.any((l) => l.contains('WARNING')),
        ServerConstants.jsonKeyGeneratedAt: DateTime.now().toUtc().toIso8601String(),
      }));
    } on Object catch (error, stack) {
      _ctx!.logError(error, stack);
      await _ctx!.sendErrorResponse(res, error);
    } finally {
      await res.close();
    }
  }

  /// Generates CREATE TABLE statements for tables in [tablesB] not in
  /// [tablesA] (new tables in target schema).
  Future<void> _migrationNewTables(
    List<String> migrations,
    List<String> tablesA,
    List<String> tablesB,
    DriftDebugQuery queryB,
  ) async {
    for (final table in tablesB) {
      if (tablesA.contains(table)) continue;
      final schemaRows = ServerContext.normalizeRows(
        await queryB(
          "SELECT sql FROM sqlite_master "
          "WHERE type='table' AND name='$table'",
        ),
      );
      final createStmt = schemaRows.isNotEmpty
          ? schemaRows.first['sql'] as String?
          : null;
      if (createStmt != null) {
        migrations.add('-- NEW TABLE: $table');
        migrations.add('$createStmt;');
        migrations.add('');
      }
    }
  }

  /// Generates DROP TABLE statements for tables in [tablesA] not in
  /// [tablesB] (removed tables in target schema).
  static void _migrationDroppedTables(
    List<String> migrations,
    List<String> tablesA,
    List<String> tablesB,
  ) {
    for (final table in tablesA) {
      if (tablesB.contains(table)) continue;
      migrations.add('-- DROPPED TABLE: $table');
      migrations.add('DROP TABLE IF EXISTS "$table";');
      migrations.add('');
    }
  }

  /// Compares columns and indexes for tables present in both schemas,
  /// generating ALTER TABLE ADD/DROP COLUMN and CREATE/DROP INDEX statements.
  Future<void> _migrationModifiedTables(
    List<String> migrations,
    List<String> tablesA,
    List<String> tablesB,
    DriftDebugQuery queryA,
    DriftDebugQuery queryB,
  ) async {
    for (final table in tablesA) {
      if (!tablesB.contains(table)) continue;

      final colMapA = await _migrationColumnMap(queryA, table);
      final colMapB = await _migrationColumnMap(queryB, table);

      final tableChanges = <String>[];

      _migrationAddedColumns(tableChanges, table, colMapA, colMapB);
      _migrationRemovedColumns(tableChanges, table, colMapA, colMapB);
      _migrationChangedColumns(tableChanges, table, colMapA, colMapB);
      await _migrationIndexChanges(
        tableChanges, table, queryA, queryB,
      );

      if (tableChanges.isNotEmpty) {
        migrations.add('-- MODIFIED TABLE: $table');
        migrations.addAll(tableChanges);
        migrations.add('');
      }
    }
  }

  /// Fetches PRAGMA table_info and returns a column-name-keyed map.
  Future<Map<String, Map<String, dynamic>>> _migrationColumnMap(
    DriftDebugQuery query,
    String table,
  ) async {
    final cols = ServerContext.normalizeRows(
      await query('PRAGMA table_info("$table")'),
    );
    final map = <String, Map<String, dynamic>>{};
    for (final c in cols) {
      map[c['name'] as String? ?? ''] = c;
    }
    return map;
  }

  /// Generates ALTER TABLE ADD COLUMN for columns in [colMapB] not in
  /// [colMapA].
  static void _migrationAddedColumns(
    List<String> changes,
    String table,
    Map<String, Map<String, dynamic>> colMapA,
    Map<String, Map<String, dynamic>> colMapB,
  ) {
    for (final colName in colMapB.keys) {
      if (colMapA.containsKey(colName)) continue;
      final col = colMapB[colName]!;
      final type = col['type'] ?? 'TEXT';
      final notNull = col['notnull'] == 1;
      final dfltValue = col['dflt_value'];

      // SQLite requires DEFAULT for NOT NULL columns in ALTER TABLE ADD
      final dflt = dfltValue != null
          ? ' DEFAULT $dfltValue'
          : (notNull ? " DEFAULT ''" : '');
      final nn = notNull ? ' NOT NULL' : '';

      changes.add(
        'ALTER TABLE "$table" ADD COLUMN "$colName" $type$nn$dflt;',
      );
    }
  }

  /// Generates warning comments and DROP COLUMN for columns in [colMapA]
  /// not in [colMapB].
  static void _migrationRemovedColumns(
    List<String> changes,
    String table,
    Map<String, Map<String, dynamic>> colMapA,
    Map<String, Map<String, dynamic>> colMapB,
  ) {
    for (final colName in colMapA.keys) {
      if (colMapB.containsKey(colName)) continue;
      changes.add(
        '-- WARNING: Column "$colName" removed from "$table".',
      );
      changes.add(
        '-- SQLite < 3.35.0: Use table recreation '
        '(CREATE new, INSERT...SELECT, DROP old, ALTER...RENAME).',
      );
      changes.add('-- SQLite >= 3.35.0:');
      changes.add(
        'ALTER TABLE "$table" DROP COLUMN "$colName";',
      );
    }
  }

  /// Generates warning comments for columns whose type or nullability
  /// changed between schemas.
  static void _migrationChangedColumns(
    List<String> changes,
    String table,
    Map<String, Map<String, dynamic>> colMapA,
    Map<String, Map<String, dynamic>> colMapB,
  ) {
    for (final colName in colMapA.keys) {
      if (!colMapB.containsKey(colName)) continue;
      final a = colMapA[colName]!;
      final b = colMapB[colName]!;
      final typeA = a['type']?.toString() ?? '';
      final typeB = b['type']?.toString() ?? '';
      final nnA = a['notnull'] == 1;
      final nnB = b['notnull'] == 1;

      if (typeA != typeB || nnA != nnB) {
        changes.add(
          '-- WARNING: Column "$colName" in "$table" changed:',
        );
        if (typeA != typeB) {
          changes.add('--   Type: $typeA -> $typeB');
        }
        if (nnA != nnB) {
          changes.add(
            "--   Nullable: ${nnA ? 'NOT NULL' : 'nullable'} "
            "-> ${nnB ? 'NOT NULL' : 'nullable'}",
          );
        }
        changes.add(
          '-- SQLite does not support ALTER COLUMN. '
          'Use table recreation pattern.',
        );
      }
    }
  }

  /// Generates CREATE INDEX / DROP INDEX for index differences between
  /// [queryA] and [queryB] for [table]. Excludes sqlite_autoindex_* indexes.
  Future<void> _migrationIndexChanges(
    List<String> changes,
    String table,
    DriftDebugQuery queryA,
    DriftDebugQuery queryB,
  ) async {
    final idxA = ServerContext.normalizeRows(
      await queryA('PRAGMA index_list("$table")'),
    );
    final idxB = ServerContext.normalizeRows(
      await queryB('PRAGMA index_list("$table")'),
    );
    final idxNamesA = idxA
        .map((r) => r['name']?.toString() ?? '')
        .where((n) => n.isNotEmpty && !n.startsWith('sqlite_'))
        .toSet();
    final idxNamesB = idxB
        .map((r) => r['name']?.toString() ?? '')
        .where((n) => n.isNotEmpty && !n.startsWith('sqlite_'))
        .toSet();

    // New indexes
    for (final idxName in idxNamesB) {
      if (idxNamesA.contains(idxName)) continue;
      final idxSqlRows = ServerContext.normalizeRows(
        await queryB(
          "SELECT sql FROM sqlite_master "
          "WHERE type='index' AND name='$idxName'",
        ),
      );
      final idxSql = idxSqlRows.isNotEmpty
          ? idxSqlRows.first['sql'] as String?
          : null;
      if (idxSql != null) {
        changes.add('$idxSql;');
      }
    }

    // Dropped indexes
    for (final idxName in idxNamesA) {
      if (idxNamesB.contains(idxName)) continue;
      changes.add('DROP INDEX IF EXISTS "$idxName";');
    }
  }

  /// Analyzes table schemas for missing indexes. Checks foreign key columns
  /// without indexes, columns with naming patterns suggesting frequent query
  /// use (*_id, *_at, *_date), and existing index coverage.
  Future<void> _handleIndexSuggestions(
    HttpResponse response,
    DriftDebugQuery query,
  ) async {
    final res = response;
    try {
      final tableNames = await ServerContext.getTableNames(query);
      final suggestions = <Map<String, dynamic>>[];

      for (final tableName in tableNames) {
        // Get existing indexed columns
        final existingIndexRows = ServerContext.normalizeRows(
          await query('PRAGMA index_list("$tableName")'),
        );
        final indexedColumns = <String>{};
        for (final idx in existingIndexRows) {
          final idxName = idx['name'] as String?;
          if (idxName == null) continue;
          final idxInfoRows = ServerContext.normalizeRows(
            await query('PRAGMA index_info("$idxName")'),
          );
          for (final col in idxInfoRows) {
            final colName = col['name'] as String?;
            if (colName != null) indexedColumns.add(colName);
          }
        }

        // Check foreign keys — these columns should always be indexed
        final fkRows = ServerContext.normalizeRows(
          await query('PRAGMA foreign_key_list("$tableName")'),
        );
        for (final fk in fkRows) {
          final fromCol = fk['from'] as String?;
          if (fromCol != null && !indexedColumns.contains(fromCol)) {
            suggestions.add(<String, dynamic>{
              'table': tableName,
              'column': fromCol,
              'reason':
                  'Foreign key without index (references ${fk['table']}.${fk['to']})',
              'sql':
                  'CREATE INDEX idx_${tableName}_$fromCol ON "$tableName"("$fromCol");',
              'priority': 'high',
            });
          }
        }

        // Check column naming patterns
        final colInfoRows = ServerContext.normalizeRows(
          await query('PRAGMA table_info("$tableName")'),
        );
        for (final col in colInfoRows) {
          final colName = col['name'] as String?;
          final pk = col['pk'];
          if (colName == null) continue;
          if (pk is int && pk > 0) continue;
          if (indexedColumns.contains(colName)) continue;

          final alreadySuggested = suggestions.any(
            (s) => s['table'] == tableName && s['column'] == colName,
          );

          // Columns ending in _id likely used in JOINs/WHERE
          if (!alreadySuggested &&
              ServerConstants.reIdSuffix.hasMatch(colName)) {
            suggestions.add(<String, dynamic>{
              'table': tableName,
              'column': colName,
              'reason':
                  'Column ending in _id \u2014 likely used in JOINs/WHERE',
              'sql':
                  'CREATE INDEX idx_${tableName}_$colName ON "$tableName"("$colName");',
              'priority': 'medium',
            });
          }

          // Date/time columns often used in ORDER BY or range queries
          if (!alreadySuggested &&
              ServerConstants.reDateTimeSuffix.hasMatch(colName)) {
            suggestions.add(<String, dynamic>{
              'table': tableName,
              'column': colName,
              'reason':
                  'Date/time column \u2014 often used in ORDER BY or range queries',
              'sql':
                  'CREATE INDEX idx_${tableName}_$colName ON "$tableName"("$colName");',
              'priority': 'low',
            });
          }
        }
      }

      // Sort by priority
      const priorityOrder = <String, int>{
        'high': 0,
        'medium': 1,
        'low': 2,
      };
      suggestions.sort(
        (a, b) => (priorityOrder[a['priority']] ?? 3)
            .compareTo(priorityOrder[b['priority']] ?? 3),
      );

      _ctx!.setJsonHeaders(res);
      res.write(jsonEncode(<String, dynamic>{
        'suggestions': suggestions,
        'tablesAnalyzed': tableNames.length,
      }));
    } on Object catch (error, stack) {
      _ctx!.logError(error, stack);
      res.statusCode = HttpStatus.internalServerError;
      res.headers.contentType = ContentType.json;
      _ctx!.setCors(res);
      res.write(jsonEncode(<String, String>{ServerConstants.jsonKeyError: error.toString()}));
    } finally {
      await res.close();
    }
  }

  // --- Collaborative session endpoints (delegates to [_sessionStore]) ---

  /// POST /api/session/share — create a shareable session with captured viewer state.
  Future<void> _handleSessionShare(HttpRequest request) async {
    final res = request.response;
    try {
      final builder = BytesBuilder();
      await for (final chunk in request) {
        builder.add(chunk);
      }
      final body = utf8.decode(builder.toBytes());
      final decoded = jsonDecode(body) as Map<String, dynamic>;
      final result = _sessionStore.create(decoded);

      _ctx!.setJsonHeaders(res);
      res.write(jsonEncode(result));
    } on Object catch (error, stack) {
      _ctx!.logError(error, stack);
      await _ctx!.sendErrorResponse(res, error);
    } finally {
      await res.close();
    }
  }

  /// GET /api/session/{id} — retrieve a shared session by ID.
  Future<void> _handleSessionGet(
    HttpResponse response,
    String sessionId,
  ) async {
    final res = response;
    final session = _sessionStore.get(sessionId);

    if (session == null) {
      res.statusCode = HttpStatus.notFound;
      _ctx!.setJsonHeaders(res);
      res.write(jsonEncode(<String, String>{
        ServerConstants.jsonKeyError: DriftDebugSessionStore.errorNotFound,
      }));
      await res.close();
      return;
    }
    _ctx!.setJsonHeaders(res);
    res.write(jsonEncode(session));
    await res.close();
  }

  /// POST /api/session/{id}/annotate — add a text annotation to an existing session.
  Future<void> _handleSessionAnnotate(
    HttpRequest request,
    String sessionId,
  ) async {
    final res = request.response;
    try {
      final builder = BytesBuilder();
      await for (final chunk in request) {
        builder.add(chunk);
      }
      final body = jsonDecode(utf8.decode(builder.toBytes()))
          as Map<String, dynamic>;

      final added = _sessionStore.annotate(
        sessionId,
        text: (body[DriftDebugSessionStore.keyText] as String?) ?? '',
        author: (body[DriftDebugSessionStore.keyAuthor] as String?) ??
            'anonymous',
      );

      if (!added) {
        res.statusCode = HttpStatus.notFound;
        _ctx!.setJsonHeaders(res);
        res.write(jsonEncode(<String, String>{
          ServerConstants.jsonKeyError: DriftDebugSessionStore.errorNotFound,
        }));
        await res.close();
        return;
      }

      _ctx!.setJsonHeaders(res);
      res.write(jsonEncode(<String, String>{
        DriftDebugSessionStore.keyStatus: 'added',
      }));
    } on Object catch (error, stack) {
      _ctx!.logError(error, stack);
      await _ctx!.sendErrorResponse(res, error);
    } finally {
      await res.close();
    }
  }

  Future<void> _handleSizeAnalytics(
    HttpResponse response,
    DriftDebugQuery query,
  ) async {
    final res = response;
    try {
      int pragmaInt(List<Map<String, dynamic>> rows) {
        if (rows.isEmpty) return 0;
        final v = rows.first.values.first;
        return v is int ? v : int.tryParse('$v') ?? 0;
      }

      final pageSize = pragmaInt(
        ServerContext.normalizeRows(await query('PRAGMA page_size')),
      );
      final pageCount = pragmaInt(
        ServerContext.normalizeRows(await query('PRAGMA page_count')),
      );
      final freelistCount = pragmaInt(
        ServerContext.normalizeRows(await query('PRAGMA freelist_count')),
      );

      final journalModeRows = ServerContext.normalizeRows(
        await query('PRAGMA journal_mode'),
      );
      final journalMode = journalModeRows.isNotEmpty
          ? (journalModeRows.first.values.first?.toString() ?? 'unknown')
          : 'unknown';

      final totalSizeBytes = pageSize * pageCount;
      final freeSpaceBytes = pageSize * freelistCount;

      final tableNames = await ServerContext.getTableNames(query);
      final tableStats = <Map<String, dynamic>>[];

      for (final tableName in tableNames) {
        final countRows = ServerContext.normalizeRows(
          await query(
              'SELECT COUNT(*) AS ${ServerConstants.jsonKeyCountColumn} FROM "$tableName"'),
        );
        final rowCount = ServerContext.extractCountFromRows(countRows);

        final colInfoRows = ServerContext.normalizeRows(
          await query('PRAGMA table_info("$tableName")'),
        );

        final indexRows = ServerContext.normalizeRows(
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

      // Sort tables by row count descending
      tableStats.sort((a, b) =>
          (b[ServerConstants.jsonKeyRowCount] as int).compareTo(a[ServerConstants.jsonKeyRowCount] as int));

      _ctx!.setJsonHeaders(res);
      res.write(jsonEncode(<String, dynamic>{
        'pageSize': pageSize,
        'pageCount': pageCount,
        'freelistCount': freelistCount,
        'totalSizeBytes': totalSizeBytes,
        'freeSpaceBytes': freeSpaceBytes,
        'usedSizeBytes': totalSizeBytes - freeSpaceBytes,
        'journalMode': journalMode,
        ServerConstants.jsonKeyTableCount: tableNames.length,
        ServerConstants.jsonKeyTables: tableStats,
      }));
    } on Object catch (error, stack) {
      _ctx!.logError(error, stack);
      res.statusCode = HttpStatus.internalServerError;
      res.headers.contentType = ContentType.json;
      _ctx!.setCors(res);
      res.write(jsonEncode(<String, String>{ServerConstants.jsonKeyError: error.toString()}));
    } finally {
      await res.close();
    }
  }


  // --- Anomaly detection ---

  /// Scans all tables for data quality anomalies: NULLs, empty strings,
  /// numeric outliers, orphaned foreign keys, and duplicate rows.
  Future<void> _handleAnomalyDetection(
    HttpResponse response,
    DriftDebugQuery query,
  ) async {
    final res = response;
    try {
      final tableNames = await ServerContext.getTableNames(query);
      final anomalies = <Map<String, dynamic>>[];

      for (final tableName in tableNames) {
        final colInfoRows = ServerContext.normalizeRows(
          await query('PRAGMA table_info("$tableName")'),
        );

        // Query total row count once per table (reused by null-check and
        // duplicate-check to avoid redundant COUNT(*) queries).
        final tableRowCount = ServerContext.extractCountFromRows(ServerContext.normalizeRows(
          await query('SELECT COUNT(*) AS c FROM "$tableName"'),
        ));

        for (final col in colInfoRows) {
          final colName = col['name'] as String?;
          final colType = (col['type'] as String?) ?? '';
          final isNullable =
              col['notnull'] is int && (col['notnull'] as int) == 0;
          if (colName == null) continue;

          if (isNullable) {
            await _detectNullValues(
                query, tableName, colName, tableRowCount, anomalies);
          }
          if (ServerContext.isTextType(colType)) {
            await _detectEmptyStrings(
                query, tableName, colName, anomalies);
          }
          if (ServerContext.isNumericType(colType)) {
            await _detectNumericOutliers(
                query, tableName, colName, anomalies);
          }
        }

        await _detectOrphanedForeignKeys(
            query, tableName, tableNames, anomalies);
        await _detectDuplicateRows(
            query, tableName, tableRowCount, anomalies);
      }

      ServerContext.sortAnomaliesBySeverity(anomalies);

      _ctx!.setJsonHeaders(res);
      res.write(jsonEncode(<String, dynamic>{
        'anomalies': anomalies,
        'tablesScanned': tableNames.length,
        'analyzedAt': DateTime.now().toUtc().toIso8601String(),
      }));
    } on Object catch (error, stack) {
      _ctx!.logError(error, stack);
      res.statusCode = HttpStatus.internalServerError;
      res.headers.contentType = ContentType.json;
      _ctx!.setCors(res);
      res.write(jsonEncode(<String, String>{ServerConstants.jsonKeyError: error.toString()}));
    } finally {
      await res.close();
    }
  }

  /// Check 1: NULL values in nullable columns. Severity is warning if >50%,
  /// otherwise info. [tableRowCount] is pre-cached to avoid redundant queries.
  Future<void> _detectNullValues(
    DriftDebugQuery query,
    String tableName,
    String colName,
    int tableRowCount,
    List<Map<String, dynamic>> anomalies,
  ) async {
    final nullCount = ServerContext.extractCountFromRows(ServerContext.normalizeRows(
      await query(
        'SELECT COUNT(*) AS c FROM "$tableName" WHERE "$colName" IS NULL',
      ),
    ));
    if (nullCount == 0) return;

    final pct =
        tableRowCount > 0 ? (nullCount / tableRowCount * 100) : 0;
    anomalies.add(<String, dynamic>{
      'table': tableName,
      'column': colName,
      'type': 'null_values',
      'severity': pct > 50 ? 'warning' : 'info',
      'count': nullCount,
      'message':
          '$nullCount NULL value(s) in $tableName.$colName (${pct.toStringAsFixed(1)}%)',
    });
  }

  /// Check 2: Empty strings in text columns.
  Future<void> _detectEmptyStrings(
    DriftDebugQuery query,
    String tableName,
    String colName,
    List<Map<String, dynamic>> anomalies,
  ) async {
    final emptyCount = ServerContext.extractCountFromRows(ServerContext.normalizeRows(
      await query(
        "SELECT COUNT(*) AS c FROM \"$tableName\" WHERE \"$colName\" = ''",
      ),
    ));
    if (emptyCount == 0) return;

    anomalies.add(<String, dynamic>{
      'table': tableName,
      'column': colName,
      'type': 'empty_strings',
      'severity': 'warning',
      'count': emptyCount,
      'message': '$emptyCount empty string(s) in $tableName.$colName',
    });
  }

  /// Check 3: Numeric outliers where max or min > 10x average.
  Future<void> _detectNumericOutliers(
    DriftDebugQuery query,
    String tableName,
    String colName,
    List<Map<String, dynamic>> anomalies,
  ) async {
    final statsRows = ServerContext.normalizeRows(await query(
      'SELECT AVG("$colName") AS avg_val, '
      'MIN("$colName") AS min_val, '
      'MAX("$colName") AS max_val '
      'FROM "$tableName" WHERE "$colName" IS NOT NULL',
    ));
    if (statsRows.isEmpty) return;

    final avg = ServerContext.toDouble(statsRows.first['avg_val']);
    final min = ServerContext.toDouble(statsRows.first['min_val']);
    final max = ServerContext.toDouble(statsRows.first['max_val']);
    if (avg == null || min == null || max == null || avg == 0) return;

    if (max.abs() > avg.abs() * 10 || min.abs() > avg.abs() * 10) {
      anomalies.add(<String, dynamic>{
        'table': tableName,
        'column': colName,
        'type': 'potential_outlier',
        'severity': 'info',
        'message': 'Potential outlier in $tableName.$colName: '
            'range [$min, $max], avg ${avg.toStringAsFixed(2)}',
      });
    }
  }

  /// Check 4: Orphaned foreign key references (FK points to non-existent parent).
  Future<void> _detectOrphanedForeignKeys(
    DriftDebugQuery query,
    String tableName,
    List<String> tableNames,
    List<Map<String, dynamic>> anomalies,
  ) async {
    final fkRows = ServerContext.normalizeRows(
      await query('PRAGMA foreign_key_list("$tableName")'),
    );
    for (final fk in fkRows) {
      final fromCol = fk['from'] as String?;
      final toTable = fk['table'] as String?;
      final toCol = fk['to'] as String?;
      if (fromCol == null || toTable == null || toCol == null) continue;
      if (!tableNames.contains(toTable)) continue;

      final orphanCount = ServerContext.extractCountFromRows(ServerContext.normalizeRows(
        await query(
          'SELECT COUNT(*) AS c FROM "$tableName" t '
          'LEFT JOIN "$toTable" r ON t."$fromCol" = r."$toCol" '
          'WHERE t."$fromCol" IS NOT NULL AND r."$toCol" IS NULL',
        ),
      ));
      if (orphanCount > 0) {
        anomalies.add(<String, dynamic>{
          'table': tableName,
          'column': fromCol,
          'type': 'orphaned_fk',
          'severity': 'error',
          'count': orphanCount,
          'message':
              '$orphanCount orphaned FK(s): $tableName.$fromCol -> $toTable.$toCol',
        });
      }
    }
  }

  /// Check 5: Duplicate rows (total count vs distinct count).
  /// [tableRowCount] is pre-cached to avoid redundant queries.
  Future<void> _detectDuplicateRows(
    DriftDebugQuery query,
    String tableName,
    int tableRowCount,
    List<Map<String, dynamic>> anomalies,
  ) async {
    final distinctCount = ServerContext.extractCountFromRows(ServerContext.normalizeRows(
      await query(
        'SELECT COUNT(*) AS c FROM (SELECT DISTINCT * FROM "$tableName")',
      ),
    ));
    if (tableRowCount > distinctCount) {
      anomalies.add(<String, dynamic>{
        'table': tableName,
        'type': 'duplicate_rows',
        'severity': 'warning',
        'count': tableRowCount - distinctCount,
        'message':
            '${tableRowCount - distinctCount} duplicate row(s) in $tableName',
      });
    }
  }


  // --- Query performance analytics ---

  /// GET /api/analytics/performance — returns query timing stats, slow queries,
  /// and patterns.
  Future<void> _handlePerformanceAnalytics(HttpResponse response) async {
    final res = response;
    try {
      final timings = List<QueryTiming>.from(_ctx!.queryTimings);
      final totalQueries = timings.length;
      final totalDuration = timings.fold<int>(
        0,
        (sum, t) => sum + t.durationMs,
      );
      final avgDuration =
          totalQueries > 0 ? (totalDuration / totalQueries).round() : 0;

      // Slow queries (> 100ms), sorted by duration desc.
      final slowQueries = timings
          .where((t) => t.durationMs > 100)
          .toList()
        ..sort((a, b) => b.durationMs.compareTo(a.durationMs));

      // Group by SQL pattern (first 60 chars) for frequency.
      final queryGroups = <String, List<QueryTiming>>{};
      for (final t in timings) {
        final key = t.sql.trim().length > 60
            ? t.sql.trim().substring(0, 60)
            : t.sql.trim();
        queryGroups.putIfAbsent(key, () => []).add(t);
      }

      final patterns = queryGroups.entries.map((e) {
        final durations = e.value.map((t) => t.durationMs).toList();
        final avg = durations.reduce((a, b) => a + b) / durations.length;
        final max = durations.reduce((a, b) => a > b ? a : b);
        final total = durations.reduce((a, b) => a + b);
        return <String, dynamic>{
          'pattern': e.key,
          'count': durations.length,
          'avgMs': avg.round(),
          'maxMs': max,
          'totalMs': total,
        };
      }).toList()
        ..sort(
            (a, b) => (b['totalMs'] as int).compareTo(a['totalMs'] as int));

      _ctx!.setJsonHeaders(res);
      res.write(jsonEncode(<String, dynamic>{
        'totalQueries': totalQueries,
        'totalDurationMs': totalDuration,
        'avgDurationMs': avgDuration,
        'slowQueries':
            slowQueries.take(20).map((t) => t.toJson()).toList(),
        'queryPatterns': patterns.take(20).toList(),
        'recentQueries':
            timings.reversed.take(50).map((t) => t.toJson()).toList(),
      }));
    } on Object catch (error, stack) {
      _ctx!.logError(error, stack);
      await _ctx!.sendErrorResponse(res, error);
      return;
    }
    await res.close();
  }

  /// DELETE /api/analytics/performance — clears all recorded query timings.
  Future<void> _clearPerformanceData(HttpResponse response) async {
    final res = response;
    try {
      _ctx!.queryTimings.clear();
      _ctx!.setJsonHeaders(res);
      res.write(jsonEncode(<String, String>{'status': 'cleared'}));
    } on Object catch (error, stack) {
      _ctx!.logError(error, stack);
      await _ctx!.sendErrorResponse(res, error);
      return;
    }
    await res.close();
  }


  /// Handles POST /api/import: imports CSV, JSON, or SQL data into a table.
  /// Requires [_ctx!.writeQuery] to be configured; returns 501 if not.
  Future<void> _handleImport(HttpRequest request) async {
    final res = request.response;
    final writeQuery = _ctx!.writeQuery;

    if (writeQuery == null) {
      res.statusCode = HttpStatus.notImplemented;
      _ctx!.setJsonHeaders(res);
      res.write(jsonEncode(<String, String>{
        ServerConstants.jsonKeyError:
            'Import not configured. Pass writeQuery to DriftDebugServer.start().',
      }));
      await res.close();
      return;
    }

    try {
      final builder = BytesBuilder();
      await for (final chunk in request) {
        builder.add(chunk);
      }
      final body = utf8.decode(builder.toBytes());
      final decoded = jsonDecode(body) as Map<String, dynamic>;
      final format = decoded['format'] as String?;
      final data = decoded['data'] as String?;
      final table = decoded['table'] as String?;

      if (format == null || data == null || table == null) {
        res.statusCode = HttpStatus.badRequest;
        _ctx!.setJsonHeaders(res);
        res.write(jsonEncode(<String, String>{
          ServerConstants.jsonKeyError: 'Missing required fields: format, data, table',
        }));
        await res.close();
        return;
      }

      // Validate table exists
      final tableNames = await ServerContext.getTableNames(_ctx!.instrumentedQuery);
      if (!tableNames.contains(table)) {
        res.statusCode = HttpStatus.badRequest;
        _ctx!.setJsonHeaders(res);
        res.write(jsonEncode(<String, String>{
          ServerConstants.jsonKeyError: 'Table "$table" not found.',
        }));
        await res.close();
        return;
      }

      // Delegate import logic to modular processor.
      const processor = DriftDebugImportProcessor();
      final result = await processor.processImport(
        format: format,
        data: data,
        table: table,
        writeQuery: writeQuery,
        sqlLiteral: ServerContext.sqlLiteral,
      );

      // Bump generation so live-refresh picks up new rows immediately.
      await _ctx!.checkDataChange();

      _ctx!.setJsonHeaders(res);
      res.write(jsonEncode(result.toJson()));
    } on Object catch (error, stack) {
      _ctx!.logError(error, stack);
      res.statusCode = HttpStatus.internalServerError;
      _ctx!.setJsonHeaders(res);
      res.write(jsonEncode(<String, String>{
        ServerConstants.jsonKeyError: error.toString(),
      }));
    } finally {
      await res.close();
    }
  }

  /// Serves the single-page viewer UI (table list, SQL runner, schema, snapshot, compare, etc.).
  Future<void> _sendHtml(HttpResponse response, HttpRequest request) async {
    final res = response;
    res.headers.contentType = ContentType.html;
    res.write(HtmlContent.indexHtml);
    await res.close();
  }

}

// --- Public API ---
// Single instance so one server per process; avoid_static_state is satisfied by instance-based state in _DriftDebugServerImpl.

/// Debug-only HTTP server that exposes SQLite/Drift table data as JSON and a minimal web viewer.
///
/// Use [start] to bind the server (default port 8642); open http://127.0.0.1:8642 in a browser.
/// Only one server can run per process; use [stop] to shut down before calling [start] again.
///
/// See the package README for API endpoints and optional features (snapshots, compare, download).
mixin DriftDebugServer {
  /// Lazy singleton without [late]: avoids avoid_late_keyword while keeping one server per process.
  static _DriftDebugServerImpl? _instanceStorage;
  static _DriftDebugServerImpl get _instance {
    final existing = _instanceStorage;
    if (existing != null) return existing;
    final created = _DriftDebugServerImpl();
    _instanceStorage = created;
    return created;
  }

  /// Starts the debug server if [enabled] is true and [query] is provided.
  ///
  /// No-op if [enabled] is false or the server is already running.
  /// Throws [ArgumentError] if [port] is out of range or Basic auth is partially configured.
  static Future<void> start({
    required DriftDebugQuery query,
    bool enabled = true,
    int port = ServerConstants.defaultPort,
    bool loopbackOnly = false,
    String? corsOrigin = '*',
    String? authToken,
    String? basicAuthUser,
    String? basicAuthPassword,
    DriftDebugGetDatabaseBytes? getDatabaseBytes,
    DriftDebugQuery? queryCompare,
    DriftDebugWriteQuery? writeQuery,
    DriftDebugOnLog? onLog,
    DriftDebugOnError? onError,
  }) =>
      _instance.start(
        query: query,
        enabled: enabled,
        port: port,
        loopbackOnly: loopbackOnly,
        corsOrigin: corsOrigin,
        authToken: authToken,
        basicAuthUser: basicAuthUser,
        basicAuthPassword: basicAuthPassword,
        getDatabaseBytes: getDatabaseBytes,
        queryCompare: queryCompare,
        writeQuery: writeQuery,
        onLog: onLog,
        onError: onError,
      );

  /// The port the server is bound to, or null if not running.
  static int? get port => _instance.port;

  /// Stops the server and releases the port. No-op if not running.
  static Future<void> stop() => _instance.stop();
}
