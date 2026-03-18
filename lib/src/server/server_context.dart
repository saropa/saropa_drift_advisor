// Shared state + instance methods extracted from
// _DriftDebugServerImpl to reduce file size.
// See drift_debug_server_io.dart for usage.
//
// Static utility methods live in server_utils.dart.
// Callback typedefs live in server_typedefs.dart.

import 'dart:convert';
import 'dart:developer' as developer;
import 'dart:io';

import 'server_constants.dart';
import 'server_typedefs.dart';
import 'server_types.dart';
import 'server_utils.dart';

// Re-export typedefs so handlers that import
// server_context.dart still see DriftDebugQuery etc.
export 'server_typedefs.dart';

/// Shared state and instance methods for the Drift
/// Debug Server.
///
/// Holds query callbacks, auth state, CORS config,
/// snapshot, generation tracking, and query timing
/// buffer. Static utility methods are in
/// [ServerUtils].
final class ServerContext {
  /// Creates a new [ServerContext] with the given
  /// query callback and optional configuration.
  ///
  /// The [query] callback is wrapped with timing
  /// instrumentation so all queries are recorded.
  ServerContext({
    required DriftDebugQuery query,
    this.corsOrigin,
    this.onLog,
    this.onError,
    this.authToken,
    this.basicAuthUser,
    this.basicAuthPassword,
    this.getDatabaseBytes,
    this.queryCompare,
    this.writeQuery,
    this.changeDetectionMinInterval,
  }) : queryRaw = query;

  /// The raw (unwrapped) query callback, before timing
  /// instrumentation.
  final DriftDebugQuery queryRaw;

  /// Instrumented query callback that wraps [queryRaw]
  /// with timing. Each call records duration, row count,
  /// and errors in [queryTimings].
  ///
  /// Returns the query result rows from [queryRaw]
  /// after recording timing information.
  Future<List<Map<String, dynamic>>> instrumentedQuery(String sql) =>
      timedQuery(queryRaw, sql);

  /// Value for Access-Control-Allow-Origin header; null
  /// omits the header.
  final String? corsOrigin;

  /// Optional log callback (startup banner, info
  /// messages).
  final DriftDebugOnLog? onLog;

  /// Optional error callback.
  final DriftDebugOnError? onError;

  /// Optional Bearer token for auth; stored in memory and
  /// compared constant-time. Null = Bearer auth disabled.
  final String? authToken;

  /// HTTP Basic auth user (dev-tunnel use only).
  final String? basicAuthUser;

  /// HTTP Basic auth password (dev-tunnel use only).
  final String? basicAuthPassword;

  /// Optional callback that returns the raw SQLite
  /// database file bytes.
  final DriftDebugGetDatabaseBytes? getDatabaseBytes;

  /// Second query callback for DB diff (main query vs
  /// [queryCompare]).
  final DriftDebugQuery? queryCompare;

  /// Optional write-query callback for import endpoint;
  /// null = import disabled (501).
  final DriftDebugWriteQuery? writeQuery;

  /// In-memory snapshot: id, createdAt, and full table
  /// data per table.
  Snapshot? snapshot;

  /// Monotonically incremented when table row counts
  /// change; used for live refresh and long-poll.
  int generation = 0;

  /// Fingerprint "table1:count1,table2:count2,..." to
  /// detect changes without storing full data.
  String? lastDataSignature;

  /// Guard to prevent concurrent change-check runs.
  bool isChangeCheckInProgress = false;

  /// Whether automatic change detection (generation
  /// bumping) is active. When false, [checkDataChange]
  /// is a no-op and no COUNT queries are issued,
  /// eliminating console spam from logStatements.
  /// Toggle at runtime via
  /// DriftDebugServer.setChangeDetection() or the
  /// POST /api/change-detection endpoint.
  bool changeDetectionEnabled = true;

  /// Cached table names from sqlite_master. Populated
  /// on first [checkDataChange] call; cleared by
  /// [invalidateTableNameCache].
  List<String>? _cachedTableNames;

  /// Cached row counts per table from the last
  /// [checkDataChange] run. Populated by
  /// [_buildDataSignature]; null before the first
  /// change-detection cycle completes. Cleared by
  /// [invalidateTableNameCache].
  Map<String, int>? _cachedTableCounts;

  /// Minimum interval between running the actual DB check (UNION ALL).
  /// When null, no throttling (every [checkDataChange] call runs the query).
  /// When set (e.g. [ServerConstants.changeDetectionMinInterval]), skips
  /// the query if the last check was more recent, reducing log spam.
  Duration? changeDetectionMinInterval;

  /// UTC time of the last [checkDataChange] run that executed the
  /// row-count query. Used for throttling when [changeDetectionMinInterval]
  /// is non-null.
  DateTime? _lastChangeCheck;

  /// Returns the cached table names list, or null if
  /// not yet populated by [checkDataChange]. Allows
  /// handlers to validate table names without
  /// re-querying sqlite_master on every request.
  List<String>? get cachedTableNames => _cachedTableNames;

  /// Returns the most recent row counts from
  /// [checkDataChange], or null if no change-detection
  /// cycle has completed yet. Keyed by table name,
  /// values are row counts. Callers should fall back
  /// to a fresh query when this returns null.
  Map<String, int>? get cachedTableCounts =>
      _cachedTableCounts;

  /// Clears the cached table name list and row counts
  /// so the next [checkDataChange] call re-queries
  /// sqlite_master. Call after operations that may
  /// change the schema (e.g., data import).
  void invalidateTableNameCache() {
    _cachedTableNames = null;
    _cachedTableCounts = null;
  }

  /// UTC timestamp of the last request bearing a
  /// VS Code extension client header.
  DateTime? _lastExtensionSeen;

  /// Records that the VS Code extension sent a request.
  void markExtensionSeen() {
    _lastExtensionSeen = DateTime.now().toUtc();
  }

  /// Whether the extension has been seen within
  /// [ServerConstants.longPollTimeout].
  bool get isExtensionConnected {
    final last = _lastExtensionSeen;
    if (last == null) {
      return false;
    }
    return DateTime.now().toUtc().difference(last).inSeconds <
        ServerConstants.longPollTimeout.inSeconds;
  }

  /// Ring buffer of recent query timings for the
  /// performance monitor.
  final List<QueryTiming> queryTimings = [];

  // -------------------------------------------------
  // Instance methods (depend on state fields)
  // -------------------------------------------------

  /// Logs an info message via the [onLog] callback
  /// (if set).
  void log(String message) {
    final callback = onLog;

    if (callback != null) callback(message);
  }

  /// Logs an error via dart:developer and the [onError]
  /// callback (if set).
  void logError(Object error, StackTrace stack) {
    developer.log(
      error.toString(),
      name: 'DriftDebugServer',
      error: error,
      stackTrace: stack,
    );

    final callback = onError;

    if (callback != null) callback(error, stack);
  }

  /// Wraps a query call with timing instrumentation.
  ///
  /// Returns the query result rows after recording
  /// duration, row count, and any errors.
  Future<List<Map<String, dynamic>>> timedQuery(
    DriftDebugQuery fn,
    String sql,
  ) async {
    final stopwatch = Stopwatch()..start();

    try {
      final result = await fn(sql);

      stopwatch.stop();
      recordTiming(
        sql: sql,
        durationMs: stopwatch.elapsedMilliseconds,
        rowCount: result.length,
      );

      return result;
    } on Object catch (error) {
      stopwatch.stop();
      recordTiming(
        sql: sql,
        durationMs: stopwatch.elapsedMilliseconds,
        rowCount: 0,
        error: error.toString(),
      );
      rethrow;
    }
  }

  /// Appends a timing entry; evicts oldest when buffer
  /// exceeds [ServerConstants.maxQueryTimings].
  void recordTiming({
    required String sql,
    required int durationMs,
    required int rowCount,
    String? error,
  }) {
    queryTimings.add(
      QueryTiming(
        sql: sql,
        durationMs: durationMs,
        rowCount: rowCount,
        error: error,
        at: DateTime.now().toUtc(),
      ),
    );

    if (queryTimings.length > ServerConstants.maxQueryTimings) {
      queryTimings.removeAt(0);
    }
  }

  /// Sets Access-Control-Allow-Origin when a CORS
  /// origin was provided at start.
  void setCors(HttpResponse response) {
    final origin = corsOrigin;

    if (origin != null) {
      response.headers.set('Access-Control-Allow-Origin', origin);
    }
  }

  /// Sets Content-Type to JSON and CORS. Used by all
  /// JSON API responses.
  void setJsonHeaders(HttpResponse response) {
    response.headers.contentType = ContentType.json;
    setCors(response);
  }

  /// Sends a 500 JSON error response and closes the
  /// response.
  Future<void> sendErrorResponse(HttpResponse response, Object error) async {
    response.statusCode = HttpStatus.internalServerError;
    response.headers.contentType = ContentType.json;
    setCors(response);
    response.write(
      jsonEncode(<String, String>{
        ServerConstants.jsonKeyError: error.toString(),
      }),
    );
    await response.close();
  }

  /// Sets Content-Disposition (attachment) and
  /// Content-Type headers for file downloads.
  void setAttachmentHeaders(HttpResponse response, String filename) {
    response.headers.contentType = ContentType(
      ServerConstants.contentTypeTextPlain,
      'plain',
      charset: ServerConstants.charsetUtf8,
    );
    response.headers.set(
      ServerConstants.headerContentDisposition,
      'attachment; filename="$filename"',
    );
    setCors(response);
  }

  /// Runs a lightweight fingerprint of table row
  /// counts; bumps [generation] when it changes.
  ///
  /// When [changeDetectionEnabled] is false, returns
  /// immediately without issuing any queries.
  ///
  /// When [changeDetectionMinInterval] is set, skips the DB check if the last
  /// successful run was within that interval (reduces "Drift: Sent SELECT"
  /// log spam when the extension or web UI long-polls every 300ms).
  ///
  /// Uses cached table names and a single UNION ALL
  /// query to fetch all row counts in one round-trip,
  /// minimizing console spam when logStatements is
  /// enabled on the user's Drift database.
  Future<void> checkDataChange() async {
    // Skip entirely when change detection is off.
    if (!changeDetectionEnabled) {
      return;
    }

    if (isChangeCheckInProgress) {
      return;
    }

    // Throttle: skip the DB check if we ran one recently (reduces
    // "Drift: Sent SELECT" log spam when long-polling every 300ms).
    final minInterval = changeDetectionMinInterval;
    if (minInterval != null && minInterval.inMilliseconds > 0) {
      final now = DateTime.now().toUtc();
      final last = _lastChangeCheck;
      if (last != null && now.difference(last) < minInterval) {
        return;
      }
    }

    isChangeCheckInProgress = true;
    try {
      // Use cached table names if available; otherwise
      // query sqlite_master and cache the result.
      final tables =
          _cachedTableNames ??
          await ServerUtils.getTableNames(instrumentedQuery);

      // Cache for subsequent calls. Cleared by
      // invalidateTableNameCache() (e.g., after import).
      _cachedTableNames = tables;

      if (tables.isEmpty) {
        // No user tables to fingerprint.
        return;
      }

      // Build a single UNION ALL query to fetch all
      // table row counts in one round-trip instead of
      // N individual SELECT COUNT(*) queries.
      final signature = await _buildDataSignature(tables);

      if (lastDataSignature != null && lastDataSignature != signature) {
        generation++;
      }
      lastDataSignature = signature;

      // Record time so throttling can skip the next run if too soon.
      _lastChangeCheck = DateTime.now().toUtc();
    } on Object catch (error, stack) {
      logError(error, stack);
    } finally {
      isChangeCheckInProgress = false;
    }
  }

  /// Builds a fingerprint string
  /// "table1:count1,table2:count2,..." using a single
  /// UNION ALL query instead of N individual queries.
  ///
  /// Each SELECT returns the table name as a string
  /// literal and its COUNT(*). Single quotes in table
  /// names are escaped for the string literal; double
  /// quotes are escaped in the identifier context.
  Future<String> _buildDataSignature(List<String> tables) async {
    // Build UNION ALL: each arm returns the table name
    // as a literal string and its row count.
    // Example output:
    //   SELECT 'users' AS t, COUNT(*) AS c FROM "users"
    //   UNION ALL
    //   SELECT 'items' AS t, COUNT(*) AS c FROM "items"
    final parts = tables.map((t) {
      // Escape single quotes for the string literal
      // and double quotes for the identifier, so table
      // names containing either character produce valid SQL.
      final literal = t.replaceAll("'", "''");
      final identifier = t.replaceAll('"', '""');

      return "SELECT '$literal' AS t, COUNT(*) AS c "
          'FROM "$identifier"';
    });
    final sql = parts.join(' UNION ALL ');

    final rows = ServerUtils.normalizeRows(await instrumentedQuery(sql));

    // Map the result rows into a lookup by table name.
    final counts = <String, int>{};

    for (final row in rows) {
      final name = row['t'] as String? ?? '';
      final count = row[ServerConstants.jsonKeyCountColumn];

      counts[name] = count is int ? count : (count is num ? count.toInt() : 0);
    }

    // Store the parsed counts so handlers can reuse
    // them (e.g., in the /api/tables response) without
    // re-running the UNION ALL query. Refreshed every
    // checkDataChange cycle.
    _cachedTableCounts = counts;

    // Build signature in sorted table order (tables
    // list is already sorted from getTableNames).
    return tables.map((t) => '$t:${counts[t] ?? 0}').join(',');
  }

  /// Validates that [tableName] exists in the
  /// allow-list (from sqlite_master). Sends 400 and
  /// returns false if unknown; otherwise returns true.
  ///
  /// Uses [_cachedTableNames] when available to avoid
  /// a redundant sqlite_master round-trip on every
  /// single-table endpoint call. Falls back to a fresh
  /// query when the cache is not yet populated.
  Future<bool> requireKnownTable({
    required HttpResponse response,
    required DriftDebugQuery queryFn,
    required String tableName,
  }) async {
    // Use cached table names (populated by
    // checkDataChange) to avoid an extra sqlite_master
    // query on every single-table endpoint call.
    final List<String> allowed =
        _cachedTableNames ??
        await ServerUtils.getTableNames(queryFn);

    if (!allowed.contains(tableName)) {
      response.statusCode = HttpStatus.badRequest;
      setJsonHeaders(response);
      response.write(
        jsonEncode(<String, String>{
          ServerConstants.jsonKeyError:
              '${ServerConstants.errorUnknownTablePrefix}$tableName',
        }),
      );
      await response.close();

      return false;
    }

    return true;
  }

  @override
  String toString() => 'ServerContext(generation: $generation)';
}
