// VM-only implementation: this file is selected by conditional export when
// dart.library.io is available. The stub (drift_debug_server_stub.dart) is
// used on web.
//
// Architecture: [_DriftDebugServerImpl] creates a [ServerContext] and [Router]
// on start; the router dispatches to handler classes in lib/src/server/.
// All DB access goes through [DriftDebugQuery] callbacks only.
// ignore_for_file: document_ignores

import 'dart:async';
import 'dart:io';

// Use a relative import instead of `package:saropa_drift_advisor/...` because
// this file is part of the same package — a self-referential package URI
// trips depend_on_referenced_packages (the rule checks whether the imported
// package is declared as a dependency, and the package never depends on
// itself).
import 'drift_debug_session.dart';

import 'server/router.dart';
import 'server/server_constants.dart';
import 'server/server_context.dart';
import 'server/mutation_tracker.dart';
import 'server/vm_service_bridge.dart';
import 'query_recorder.dart';

// Public API typedefs are defined in server/server_typedefs.dart
// and re-exported here so the barrel export chain is preserved.
export 'server/server_typedefs.dart';

/// Internal implementation; state is instance-based to satisfy
/// avoid_static_state. Database access is via [DriftDebugQuery]
/// callbacks only; this class does not hold sqflite or any DB
/// reference.
class _DriftDebugServerImpl {
  HttpServer? _server;
  StreamSubscription<HttpRequest>? _serverSubscription;

  /// Router for dispatching requests; null when server is not running.
  Router? _router;

  /// In-memory shared sessions for collaborative debug.
  ///
  /// Constructed in [start] with the configured session duration
  /// (or default 1 hour if not specified).
  DriftDebugSessionStore _sessionStore = DriftDebugSessionStore();

  /// Starts the debug server if [enabled] is true and [query] is provided.
  ///
  /// No-op if [enabled] is false or the server is already running. [query]
  /// must execute the given SQL and return rows as a list of maps. The server
  /// serves a web UI and JSON APIs for table listing and table data; see the
  /// package README for endpoints.
  ///
  /// Parameters:
  /// * [query] — Required. Executes SQL and returns rows.
  /// * [queryWithBindings] — Optional. When set, read queries that include DVR
  ///   declared bindings are executed through this callback with
  ///   `positionalArgs` / `namedArgs`; when null, bindings are metadata-only
  ///   (same as passing only [query]).
  /// * [enabled] — If false, the server is not started (default true).
  /// * [port] — Port to bind (default 8642).
  /// * [loopbackOnly] — If true, bind to 127.0.0.1 only.
  /// * [corsOrigin] — Value for Access-Control-Allow-Origin.
  /// * [authToken] — Optional Bearer token for auth.
  /// * [basicAuthUser] and [basicAuthPassword] — Optional HTTP Basic auth.
  /// * [getDatabaseBytes] — Optional callback for raw .sqlite download.
  /// * [queryCompare] — Optional second query for DB diff.
  /// * [writeQuery] — Optional write callback for import / batch / cell updates.
  /// * [writeQueryWithBindings] — Optional write callback with binding parameters;
  ///   when both [writeQuery] and this are set, this wins. HTTP paths still pass
  ///   SQL strings only until a caller adds bound-write metadata.
  /// * [onLog] — Optional log callback.
  /// * [onError] — Optional error callback.
  /// * [sessionDuration] — Optional session expiry override (default 1 hour).
  /// * [maxRequestsPerSecond] — Optional per-IP rate limit. When set,
  ///   requests exceeding this limit receive HTTP 429 (Too Many Requests)
  ///   with a `Retry-After: 1` header. The `/api/generation` (long-poll)
  ///   and `/api/health` endpoints are exempt. Defaults to null (no limit).
  ///
  /// Throws [ArgumentError] for invalid port or partial Basic auth.
  ///
  /// ## Example (callback-based)
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
  Future<void> start({
    required DriftDebugQuery query,
    DriftDebugQueryWithBindings? queryWithBindings,
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
    DriftDebugWriteQueryWithBindings? writeQueryWithBindings,
    DriftDebugOnLog? onLog,
    DriftDebugOnError? onError,
    Duration? sessionDuration,
    int? maxRequestsPerSecond,
  }) async {
    if (!enabled) {
      return;
    }
    final existing = _server;
    if (existing != null) {
      return;
    }

    // Construct session store with the configured duration
    // (or default 1 hour if not specified).
    _sessionStore = DriftDebugSessionStore(sessionExpiry: sessionDuration);

    // Defensive: reject invalid port and partial Basic auth.
    if (port < ServerConstants.minPort || port > ServerConstants.maxPort) {
      throw ArgumentError(
        'Port must be in range '
        '${ServerConstants.minPort}..${ServerConstants.maxPort} '
        '(0 = any port), got: $port',
      );
    }

    final hasBasicUser = basicAuthUser != null && basicAuthUser.isNotEmpty;
    final hasBasicPassword =
        basicAuthPassword != null && basicAuthPassword.isNotEmpty;

    if (hasBasicUser != hasBasicPassword) {
      throw ArgumentError(
        'Basic auth requires both basicAuthUser and basicAuthPassword '
        'to be set, or neither. Partial configuration is not allowed.',
      );
    }

    // Reject non-positive rate limit (null = disabled, which is fine).
    if (maxRequestsPerSecond != null && maxRequestsPerSecond <= 0) {
      throw ArgumentError(
        'maxRequestsPerSecond must be a positive integer, '
        'got: $maxRequestsPerSecond',
      );
    }

    MutationTracker? mutationTracker;
    QueryRecorder? queryRecorder;
    late DriftDebugQuery readQueryForMutation;
    DriftDebugWriteQuery? wrappedWriteQuery;

    queryRecorder = QueryRecorder();

    // Prefer [writeQueryWithBindings] when both are set so hosts can migrate
    // to the richer callback without duplicate execution paths.
    final DriftDebugWriteQuery? baseWrite = writeQueryWithBindings != null
        ? (String sql) => writeQueryWithBindings(sql)
        : writeQuery;

    if (baseWrite != null) {
      mutationTracker = MutationTracker();
      final originalWrite = baseWrite;
      wrappedWriteQuery = (String sql) async {
        final tracker = mutationTracker;
        if (tracker == null) {
          throw StateError(
            'Mutation tracker must be initialized when writeQuery is provided.',
          );
        }
        // Capture semantic mutation events around the existing writeQuery
        // behavior (best-effort row capture + ring-buffer storage).
        final startedAt = DateTime.now().toUtc();
        final snapshots = await tracker.captureFromWriteQuery(
          originalWrite: originalWrite,
          readQuery: readQueryForMutation,
          sql: sql,
        );
        final elapsed = DateTime.now().toUtc().difference(startedAt);
        // SQLite `changes()` reflects rows touched by the last statement on this
        // connection — best-effort when [writeQuery] does not return a count.
        var affectedRowCount = 0;
        try {
          final cr = await readQueryForMutation('SELECT changes() AS c');
          if (cr.isNotEmpty) {
            final v = cr.first['c'];
            if (v is int) {
              affectedRowCount = v;
            } else if (v is num) {
              affectedRowCount = v.toInt();
            }
          }
        } on Object catch (e, st) {
          // `changes()` is best-effort; failures must not break the write path.
          onError?.call(e, st);
          affectedRowCount = 0;
        }
        queryRecorder?.recordWrite(
          sql: sql,
          startedAtUtc: startedAt,
          elapsed: elapsed,
          affectedRowCount: affectedRowCount,
          beforeState: snapshots?.beforeRows,
          afterState: snapshots?.afterRows,
        );
      };
    }

    final ctx = ServerContext(
      query: query,
      queryWithBindings: queryWithBindings,
      corsOrigin: corsOrigin,
      onLog: onLog,
      onError: onError,
      authToken: (authToken != null && authToken.isNotEmpty) ? authToken : null,
      basicAuthUser: basicAuthUser,
      basicAuthPassword: basicAuthPassword,
      getDatabaseBytes: getDatabaseBytes,
      queryCompare: queryCompare,
      writeQuery: wrappedWriteQuery ?? writeQuery,
      mutationTracker: mutationTracker,
      queryRecorder: queryRecorder,
      changeDetectionMinInterval: ServerConstants.changeDetectionMinInterval,
    );

    if (baseWrite != null) {
      // Use raw reads for mutation capture and `changes()` so DVR/timing buffers
      // are not flooded with helper SELECTs.
      readQueryForMutation = ctx.queryRaw;
    }

    _router = Router(
      ctx,
      _sessionStore,
      maxRequestsPerSecond: maxRequestsPerSecond,
    );

    // cspell:ignore SO_REUSEADDR SO_REUSEPORT
    try {
      final address = loopbackOnly
          ? InternetAddress.loopbackIPv4
          : InternetAddress.anyIPv4;

      // shared: true enables SO_REUSEADDR/SO_REUSEPORT so the new
      // isolate can bind the same port during a Flutter hot restart,
      // before the old isolate has released its socket.
      _server = await HttpServer.bind(address, port, shared: true);
      final server = _server;
      if (server == null) {
        return;
      }

      final router = _router;
      if (router == null) {
        return;
      }
      _serverSubscription = server.listen(router.onRequest);

      VmServiceBridge.setRouter(router);
      VmServiceBridge.register();

      // IMPORTANT: print() is the ONLY output method that appears as
      // I/flutter lines on Android. Do NOT replace with ctx.log(),
      // developer.log(), or stdout.writeln() — all three are invisible
      // on Android emulators/devices. This was fixed in v1.4.1, broken
      // again in v1.7.0, and regressed a third time in 086152f when a
      // lint tool replaced print() to satisfy avoid_print. The banner
      // is the user's only confirmation that the server started.
      // See plans/connection-reliability-ongoing.md for full history.
      final title = _bannerCentered(
        'DRIFT DEBUG SERVER   v${ServerConstants.packageVersion}',
      );
      final desc = _bannerCentered(ServerConstants.bannerDescription);
      final url = _bannerCentered('http://127.0.0.1:$port');
      // ignore: avoid_print, avoid_print_in_release
      print(
        '${ServerConstants.bannerTop}\n'
        '$title\n'
        '${ServerConstants.bannerDivider}\n'
        '${ServerConstants.bannerEmpty}\n'
        '$desc\n'
        '$url\n'
        '${ServerConstants.bannerEmpty}\n'
        '${ServerConstants.bannerBottom}',
      );
    } on Object catch (error, stack) {
      // Print server startup failure visibly — same reasoning as the
      // banner above: developer.log is invisible on Android.
      // ignore: avoid_print, avoid_print_error, avoid_print_in_release
      print('[DriftDebugServer] FAILED TO START: $error');
      ctx.logError(error, stack);
    }
  }

  /// Builds a banner line with [text] horizontally centered
  /// between │ borders, padded to [ServerConstants.bannerInnerWidth].
  static String _bannerCentered(String text) {
    final w = ServerConstants.bannerInnerWidth;
    final pad = (w - text.length) ~/ 2;
    final left = ' ' * pad;
    final right = ' ' * (w - pad - text.length);
    return '│$left$text$right│';
  }

  /// The port the server is bound to, or null if not running.
  int? get port => _server?.port;

  /// Stops the server if running and clears stored state.
  Future<void> stop() async {
    final server = _server;
    if (server == null) {
      return;
    }

    await _serverSubscription?.cancel();
    _serverSubscription = null;
    VmServiceBridge.clear();
    _router = null;
    _server = null;
    await server.close();
  }

  /// Whether change detection (row-count fingerprinting)
  /// is currently enabled. Returns null if the server
  /// is not running.
  bool? get changeDetectionEnabled => _router?.isChangeDetectionEnabled;

  /// Enables or disables automatic change detection
  /// at runtime. No-op if the server is not running.
  void setChangeDetection(bool enabled) {
    _router?.setChangeDetectionEnabled(enabled);
  }

  @override
  String toString() =>
      '_DriftDebugServerImpl(port: ${_server?.port}, '
      'running: ${_server != null})';
}

// --- Public API ---
// Single instance so one server per process; avoid_static_state is
// satisfied by instance-based state in _DriftDebugServerImpl.

/// Debug-only HTTP server that exposes SQLite/Drift table data as JSON
/// and a minimal web viewer.
///
/// Use [start] to bind the server (default port 8642); open
/// http://127.0.0.1:8642 in a browser. Only one server can run per
/// process; use [stop] to shut down before calling [start] again.
///
/// See the package README for API endpoints and optional features.
mixin DriftDebugServer {
  /// Lazy singleton without [late]: avoids avoid_late_keyword while
  /// keeping one server per process.
  static _DriftDebugServerImpl? _instanceStorage;

  static _DriftDebugServerImpl get _instance {
    final existing = _instanceStorage;
    if (existing != null) {
      return existing;
    }

    final created = _DriftDebugServerImpl();
    _instanceStorage = created;

    return created;
  }

  /// Starts the debug server if [enabled] is true and [query] is
  /// provided.
  ///
  /// No-op if [enabled] is false or the server is already running.
  /// Throws [ArgumentError] if [port] is out of range or Basic auth
  /// is partially configured.
  static Future<void> start({
    required DriftDebugQuery query,
    DriftDebugQueryWithBindings? queryWithBindings,
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
    DriftDebugWriteQueryWithBindings? writeQueryWithBindings,
    DriftDebugOnLog? onLog,
    DriftDebugOnError? onError,

    /// Optional session duration override. Defaults to 1 hour.
    /// Controls how long collaborative shared sessions remain valid
    /// before they expire and are cleaned up.
    Duration? sessionDuration,

    /// Optional per-IP rate limit (requests per second). When set,
    /// requests exceeding this limit receive HTTP 429. The long-poll
    /// `/api/generation` and `/api/health` endpoints are exempt.
    int? maxRequestsPerSecond,
  }) => _instance.start(
    query: query,
    queryWithBindings: queryWithBindings,
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
    writeQueryWithBindings: writeQueryWithBindings,
    onLog: onLog,
    onError: onError,
    sessionDuration: sessionDuration,
    maxRequestsPerSecond: maxRequestsPerSecond,
  );

  /// The port the server is bound to, or null if not running.
  static int? get port => _instance.port;

  /// Whether change detection (generation bumping via
  /// periodic row-count fingerprinting) is currently
  /// enabled. Returns null if the server is not running.
  ///
  /// When disabled, no COUNT queries are issued during
  /// the long-poll loop, eliminating console spam from
  /// logStatements. The generation number freezes at
  /// its current value until re-enabled.
  static bool? get changeDetectionEnabled => _instance.changeDetectionEnabled;

  /// Enables or disables automatic change detection
  /// at runtime. When [enabled] is false, the
  /// long-poll loop still runs but skips the COUNT
  /// queries, so no log spam is produced.
  ///
  /// No-op if the server is not running.
  static void setChangeDetection(bool enabled) =>
      _instance.setChangeDetection(enabled);

  /// Stops the server and releases the port. No-op if not running.
  static Future<void> stop() => _instance.stop();
}
