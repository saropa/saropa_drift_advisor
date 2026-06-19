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
import 'mutation_tracker.dart';
import 'server_typedefs.dart';
import 'server_types.dart';
import 'server_utils.dart';
import 'snapshot_store.dart';
import '../query_recorder.dart';

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
    DriftDebugQueryWithBindings? queryWithBindings,
    this.corsOrigin,
    this.onLog,
    this.onError,
    this.authToken,
    this.basicAuthUser,
    this.basicAuthPassword,
    this.getDatabaseBytes,
    this.queryCompare,
    this.writeQuery,
    this.mutationTracker,
    this.queryRecorder,
    this.changeDetectionMinInterval,
    this.declaredTableNames,
    this.declaredSchema,
    this.declaredRelationships,
    this.snapshotStorePath,
  }) : queryRaw = query,
       _queryExec =
           queryWithBindings ??
           ((
             String sql, {
             List<Object?>? positionalArgs,
             Map<String, Object?>? namedArgs,
           }) => query(sql));

  /// The raw (unwrapped) query callback, before timing
  /// instrumentation.
  final DriftDebugQuery queryRaw;

  /// Effective executor: either [queryWithBindings] from the constructor or a
  /// thin wrapper around [queryRaw] that ignores binding arguments.
  final DriftDebugQueryWithBindings _queryExec;

  /// Instrumented query callback that wraps [queryRaw]
  /// with timing. Each call records duration, row count,
  /// and errors in [queryTimings].
  ///
  /// Returns the query result rows from [queryRaw]
  /// after recording timing information.
  Future<List<Map<String, dynamic>>> instrumentedQuery(String sql) =>
      timedQuery(sql, isInternal: false);

  /// Like [instrumentedQuery] but forwards optional DVR binding metadata from
  /// `/api/sql` (`args` / `namedArgs`) into the recorder without changing the
  /// SQL string passed to [queryRaw].
  Future<List<Map<String, dynamic>>> instrumentedQueryWithDvrMeta(
    String sql, {
    Map<String, Object?>? dvrDeclaredParams,
    bool dvrDeclaredParamsTruncated = false,
    bool dvrHasDeclaredBindings = false,
  }) => timedQuery(
    sql,
    isInternal: false,
    dvrDeclaredParams: dvrDeclaredParams,
    dvrDeclaredParamsTruncated: dvrDeclaredParamsTruncated,
    dvrHasDeclaredBindings: dvrHasDeclaredBindings,
  );

  /// Like [instrumentedQuery] but tags the timing record as internal.
  /// Used for extension-owned diagnostic probes (change-detection
  /// COUNT(*) queries, sqlite_master lookups, etc.) so they are
  /// excluded from user-facing slow-query diagnostics.
  Future<List<Map<String, dynamic>>> internalQuery(String sql) =>
      timedQuery(sql, isInternal: true);

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

  /// Optional mutation tracker that captures semantic mutation events
  /// triggered via the configured [writeQuery] callback.
  final MutationTracker? mutationTracker;

  /// Optional Query Replay DVR recorder for timeline playback.
  final QueryRecorder? queryRecorder;

  /// Names of the tables the app's Drift schema declares
  /// (Drift `GeneratedDatabase.allTables` → `actualTableName`).
  ///
  /// Used only by the orphan physical-table check
  /// ([OrphanTableDetector.getOrphanTablesResult]): physical tables not in
  /// this set (and not internal) are flagged as orphans. Null when the host
  /// did not supply it (the callback API, or a Drift db that does not expose
  /// `allTables`) — in that case the orphan check is report-only and yields
  /// no findings, since the advisor cannot otherwise tell an orphan from a
  /// legitimate table.
  final Set<String>? declaredTableNames;

  /// Optional callback returning the code-declared Drift schema (Feature 71).
  /// When null, GET /api/schema/declared reports the feature unavailable and the
  /// web tab stays empty — same opt-in posture as [declaredTableNames].
  final DeclaredSchemaCallback? declaredSchema;

  /// Optional callback returning the host-declared relationship manifest
  /// (Feature 78): the parent→child links the app knows from its Dart code but
  /// never expresses as SQLite foreign keys. Read as authoritative ground truth
  /// by GET /api/schema/relationships and merged into the metadata fold's
  /// `foreignKeys`. When null, GET /api/schema/relationships reports
  /// `available: false` and the wizard falls back to its column-name heuristic —
  /// same opt-in posture as [declaredSchema].
  final DeclaredRelationshipsCallback? declaredRelationships;

  /// In-memory snapshots (oldest first): each holds id, createdAt, optional
  /// label, and full table data per table. Capped at [maxSnapshots] with
  /// oldest-first eviction (mirrors the extension's rolling window) so a long
  /// debugging session cannot grow memory unbounded.
  final List<Snapshot> snapshots = <Snapshot>[];

  /// Maximum retained snapshots before the oldest is evicted on a new capture.
  static const int maxSnapshots = 20;

  /// Optional file path the snapshot list is mirrored to so it survives a
  /// SERVER restart (Feature 72 Phase 4). Null (the default) keeps the prior
  /// in-memory-only behavior — nothing is read or written. Host configuration,
  /// passed to `DriftDebugServer.start`; never user/network input.
  final String? snapshotStorePath;

  /// Serializes snapshot writes so two rapid mutations cannot interleave their
  /// file writes. Each [_persistSnapshots] appends to this chain.
  Future<void> _snapshotPersistChain = Future<void>.value();

  /// Completes when all snapshot writes queued so far have finished. Lets a host
  /// await a durable on-disk state before shutting the process down, and gives
  /// tests a deterministic point to read the persisted file. Resolves
  /// immediately when persistence is disabled (the chain stays settled).
  Future<void> get snapshotPersistenceSettled => _snapshotPersistChain;

  /// Loads any persisted snapshots into [snapshots] at startup. No-op when no
  /// store path is configured. Honors [maxSnapshots] (keeps the newest) so a
  /// store written by an older, higher cap can't exceed the current limit.
  Future<void> loadPersistedSnapshots() async {
    final String? path = snapshotStorePath;
    if (path == null) return;
    final List<Snapshot> loaded = await SnapshotStore.load(
      path,
      onError: logError,
    );
    if (loaded.isEmpty) return;
    snapshots
      ..clear()
      ..addAll(
        loaded.length > maxSnapshots
            ? loaded.sublist(loaded.length - maxSnapshots)
            : loaded,
      );
  }

  /// Mirrors the current [snapshots] list to disk when a store path is set.
  /// Best-effort and non-blocking: chained so writes don't overlap, with every
  /// failure routed to [logError] rather than thrown (a disk problem must never
  /// break a capture/delete/rename). No-op when persistence is off.
  void _persistSnapshots() {
    final String? path = snapshotStorePath;
    if (path == null) return;
    // Snapshot the list now so a later mutation can't change what this write
    // serializes mid-flight.
    final List<Snapshot> current = List<Snapshot>.of(snapshots);
    _snapshotPersistChain = _snapshotPersistChain.then(
      (_) => SnapshotStore.save(path, current, onError: logError),
    );
  }

  /// The most recently captured snapshot, or null when none exist. Preserves
  /// the pre-multi-snapshot "current snapshot" semantics for GET /api/snapshot
  /// and the default (no-param) compare.
  Snapshot? get latestSnapshot => snapshots.isEmpty ? null : snapshots.last;

  /// Appends [snap], evicting the oldest when over [maxSnapshots].
  void addSnapshot(Snapshot snap) {
    snapshots.add(snap);
    while (snapshots.length > maxSnapshots) {
      snapshots.removeAt(0);
    }
    _persistSnapshots();
  }

  /// Returns the stored snapshot with [id], or null.
  Snapshot? snapshotById(String id) {
    for (final s in snapshots) {
      if (s.id == id) return s;
    }
    return null;
  }

  /// Removes the snapshot with [id]. Returns true when one was removed.
  bool removeSnapshot(String id) {
    final before = snapshots.length;
    snapshots.removeWhere((s) => s.id == id);
    final removed = snapshots.length != before;
    if (removed) _persistSnapshots();
    return removed;
  }

  /// Replaces the snapshot with [id] with [updated] (used for label rename).
  /// No-op when no snapshot matches [id].
  void replaceSnapshot(String id, Snapshot updated) {
    for (var i = 0; i < snapshots.length; i++) {
      if (snapshots[i].id == id) {
        snapshots[i] = updated;
        _persistSnapshots();
        return;
      }
    }
  }

  /// Clears all stored snapshots.
  void clearSnapshots() {
    snapshots.clear();
    _persistSnapshots();
  }

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
  /// POST /api/change-detection endpoint. Mutated only through
  /// [setChangeDetection] so the toggle has a single owner.
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
  final Duration? changeDetectionMinInterval;

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
  Map<String, int>? get cachedTableCounts => _cachedTableCounts;

  /// Clears the cached table name list and row counts
  /// so the next [checkDataChange] call re-queries
  /// sqlite_master. Call after operations that may
  /// change the schema (e.g., data import).
  void invalidateTableNameCache() {
    _cachedTableNames = null;
    _cachedTableCounts = null;
  }

  /// Enables or disables automatic change detection at runtime.
  /// The single mutation point for [changeDetectionEnabled]; the VM-service
  /// and HTTP toggles route through [Router] into here.
  void setChangeDetection(bool enabled) {
    changeDetectionEnabled = enabled;
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
  /// Captures the caller's source location from the stack
  /// trace so runtime diagnostics can be pinned to the
  /// call site instead of the table definition file.
  ///
  /// Returns the query result rows after recording
  /// duration, row count, and any errors.
  Future<List<Map<String, dynamic>>> timedQuery(
    String sql, {
    bool isInternal = false,
    Map<String, Object?>? dvrDeclaredParams,
    bool dvrDeclaredParamsTruncated = false,
    bool dvrHasDeclaredBindings = false,
  }) async {
    // Capture the stack before awaiting so we get the
    // actual call site, not the async continuation.
    final caller = _parseCallerFrame(StackTrace.current);

    final stopwatch = Stopwatch()..start();

    List<Object?>? execPos;
    Map<String, Object?>? execNamed;
    if (dvrHasDeclaredBindings && dvrDeclaredParams != null) {
      final p = dvrDeclaredParams['positional'];
      if (p is List<dynamic>) {
        execPos = List<Object?>.from(p);
      }
      final n = dvrDeclaredParams['named'];
      if (n is Map) {
        execNamed = <String, Object?>{};
        for (final e in n.entries) {
          execNamed[e.key.toString()] = e.value as Object?;
        }
      }
    }

    try {
      final result = await _queryExec(
        sql,
        positionalArgs: execPos,
        namedArgs: execNamed,
      );

      stopwatch.stop();
      recordTiming(
        sql: sql,
        durationMs: stopwatch.elapsedMilliseconds,
        rowCount: result.length,
        callerFile: caller?.$1,
        callerLine: caller?.$2,
        isInternal: isInternal,
      );

      // Record query playback metadata for DVR timelines (skip internal probes).
      if (!isInternal) {
        queryRecorder?.recordRead(
          sql: sql,
          startedAtUtc: DateTime.now().toUtc().subtract(stopwatch.elapsed),
          elapsed: stopwatch.elapsed,
          resultRowCount: result.length,
          declaredParams: dvrDeclaredParams,
          declaredParamsTruncated: dvrDeclaredParamsTruncated,
          hasDeclaredBindings: dvrHasDeclaredBindings,
        );
      }

      return result;
    } on Object catch (error) {
      stopwatch.stop();
      recordTiming(
        sql: sql,
        durationMs: stopwatch.elapsedMilliseconds,
        rowCount: 0,
        error: error.toString(),
        callerFile: caller?.$1,
        callerLine: caller?.$2,
        isInternal: isInternal,
      );
      rethrow;
    }
  }

  /// Parses the first _user-code_ frame from a [StackTrace],
  /// skipping frames inside this package's server directory
  /// and Dart/Flutter framework internals.
  ///
  /// Returns `(filePath, lineNumber)` or null when no
  /// usable frame is found. This is expected when all
  /// queries originate from the server's own handlers
  /// (router, cell-update, import, etc.) — in that case
  /// the diagnostic falls back to the table definition.
  ///
  /// The infrastructure is in place so that when user code
  /// queries flow through [recordTiming] (e.g. via a custom
  /// executor wrapper), the correct call site is captured.
  static (String, int)? _parseCallerFrame(StackTrace stack) {
    // Dart VM format: "#N  FunctionName (package:foo/bar.dart:42:10)"
    // or:             "#N  FunctionName (file:///path/bar.dart:42:10)"
    final framePattern = RegExp(r'#\d+\s+\S+\s+\((.+?):(\d+):\d+\)');

    for (final match in framePattern.allMatches(stack.toString())) {
      // Defensive `?? ''` over `!`: the regex's capture groups are
      // guaranteed non-null on a successful match today, but a future
      // pattern edit could silently turn these sites into crash points.
      // An empty string falls through the skip filters below and is
      // rejected by `int.tryParse`, so the fallback is safe.
      final file = match.group(1) ?? '';
      if (file.isEmpty) continue;

      // Skip this package's own server files — these are
      // internal handler frames (router, cell-update, etc.)
      // that the end user did not write and cannot edit.
      if (file.contains('saropa_drift_advisor/src/server/')) {
        continue;
      }

      // Skip Dart SDK and Flutter framework internals.
      if (file.startsWith('dart:') || file.startsWith('package:flutter/')) {
        continue;
      }

      final line = int.tryParse(match.group(2) ?? '');
      if (line == null) continue;

      return (file, line);
    }

    return null;
  }

  /// Appends a timing entry; evicts oldest when buffer
  /// exceeds [ServerConstants.maxQueryTimings].
  void recordTiming({
    required String sql,
    required int durationMs,
    required int rowCount,
    String? error,
    String? callerFile,
    int? callerLine,
    bool isInternal = false,
  }) {
    queryTimings.add(
      QueryTiming(
        sql: sql,
        durationMs: durationMs,
        rowCount: rowCount,
        error: error,
        callerFile: callerFile,
        callerLine: callerLine,
        isInternal: isInternal,
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

  /// Sends HTTP 413 (Payload Too Large) when a request body exceeds
  /// [ServerConstants.maxRequestBodyBytes]. Pairs with
  /// [ServerUtils.readBodyBytes], which returns null on overflow (audit H3).
  Future<void> sendPayloadTooLarge(HttpResponse response) async {
    response.statusCode = HttpStatus.requestEntityTooLarge;
    setJsonHeaders(response);
    response.write(
      jsonEncode(<String, String>{
        ServerConstants.jsonKeyError: ServerConstants.errorPayloadTooLarge,
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
          _cachedTableNames ?? await ServerUtils.getTableNames(internalQuery);

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

      return "SELECT '$literal' AS t, COUNT(*) AS c "
          'FROM ${ServerUtils.quoteIdent(t)}';
    });
    final sql = parts.join(' UNION ALL ');

    final rows = ServerUtils.normalizeRows(await internalQuery(sql));

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
        _cachedTableNames ?? await ServerUtils.getTableNames(queryFn);

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
