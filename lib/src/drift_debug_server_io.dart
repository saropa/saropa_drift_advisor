// VM-only implementation: this file is selected by conditional export when
// dart.library.io is available. The stub (drift_debug_server_stub.dart) is
// used on web.
//
// Architecture: [_DriftDebugServerImpl] creates a [ServerContext] and [Router]
// on start; the router dispatches to handler classes in lib/src/server/.
// All DB access goes through [DriftDebugQuery] callbacks only.
// ignore_for_file: document_ignores -- rationales live in block comments above each ignore for readability rather than inline

import 'dart:async';
import 'dart:convert';
import 'dart:developer' as developer;
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
import 'server/server_types.dart';
import 'server/mutation_tracker.dart';
import 'server/table_activity_tracker.dart';
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

  /// Synchronous re-entrancy guard for [start].
  ///
  /// [_server] is the "is running" signal, but it is not assigned until after
  /// several awaits inside [start] (loadPersistedSnapshots, HttpServer.bind).
  /// A second start() arriving during that window would pass an
  /// `_server != null` check while the first call is still binding; with
  /// `shared: true` (SO_REUSEPORT) both binds succeed and BOTH print the
  /// startup banner — the duplicate-banner bug. This flag is set before the
  /// first await and cleared in a finally, closing that race window.
  bool _starting = false;

  /// Router for dispatching requests; null when server is not running.
  Router? _router;

  /// In-memory shared sessions for collaborative debug.
  ///
  /// Constructed in [start] with the configured session duration
  /// (or default 1 hour if not specified).
  DriftDebugSessionStore _sessionStore = DriftDebugSessionStore();

  /// Directory the discovery manifest is written into for THIS server, or null
  /// to use the user-home default (`$home/.saropa_drift_advisor`).
  ///
  /// Set from the [start] `discoveryDirectory` argument and read again by
  /// [stop] so write and remove target the same file. The default home path is
  /// a single global location shared by every server in the process; when
  /// multiple servers run concurrently (most visibly: parallel test suites,
  /// where dart's `pid` is identical across in-process suite isolates) they
  /// clobber and delete each other's manifest. Pointing a server at its own
  /// directory isolates it so its manifest lifecycle is deterministic.
  String? _discoveryDir;

  /// Error sink captured from the running [ServerContext] (`ctx.logError`) so
  /// best-effort cleanup in [stop] / [_removeDiscoveryManifest] can route a
  /// failure through the SAME channel as the rest of the server (dart:developer
  /// + the caller's onError callback). Stored because [stop] runs after [start]
  /// returns and has no `ctx` in scope; null until the first successful start.
  void Function(Object, StackTrace)? _logError;

  /// The running server's context, held so [stop] can detach the
  /// kill-switch manifest hook ([ServerContext.onMonitoringChanged]) BEFORE
  /// deleting the discovery manifest. Without the detach, a monitoring
  /// toggle racing [stop] could rewrite server.json after its removal and
  /// leave a stale manifest advertising a dead server. Null when not running.
  ServerContext? _runningCtx;

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
  /// * [declaredTableNames] — Optional set of table names the app's Drift
  ///   schema declares (Drift `GeneratedDatabase.allTables` →
  ///   `actualTableName`). When supplied, the orphan physical-table check
  ///   (`GET /api/analytics/orphan-tables`, merged into `GET /api/issues`)
  ///   flags physical tables absent from this set. When null, that check is
  ///   report-only and emits no findings. The `startDriftViewer` extension
  ///   derives this automatically from a Drift database.
  /// * [monitoringEnabled] — Global monitoring & logging kill switch
  ///   (default true). When false the server starts dormant: no recording,
  ///   no sweeps, data endpoints answer 403; /api/health and /api/monitoring
  ///   stay live. Flip at runtime via [setMonitoringEnabled] or
  ///   POST /api/monitoring.
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
    // SECURE DEFAULT: bind to loopback only. This server exposes the app's
    // entire database; binding to 0.0.0.0 (the old default) made it readable
    // by any host on the network. Hosts that genuinely need a non-loopback
    // bind (e.g. an emulator/dev-tunnel scenario) must opt in explicitly and
    // should also set an authToken. See plans/history/2026.06/2026.06.12/full-codebase-audit-2026.06.12.md C1.
    bool loopbackOnly = true,
    // SECURE DEFAULT: no Access-Control-Allow-Origin header. The wildcard '*'
    // default let any website the developer visited read DB responses
    // cross-origin (a DNS-rebinding / malicious-page vector). The web viewer is
    // served same-origin and does not need CORS; only set this when a real
    // cross-origin consumer requires it. See audit C1.
    String? corsOrigin,
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
    Set<String>? declaredTableNames,
    DeclaredSchemaCallback? declaredSchema,
    DeclaredRelationshipsCallback? declaredRelationships,
    String? snapshotStorePath,
    String? discoveryDirectory,
    bool monitoringEnabled = true,
  }) async {
    if (!enabled) {
      return;
    }
    // Re-entrancy guard: reject if already running OR a start() is in flight.
    // Checking [_starting] (not just [_server]) is required because [_server]
    // is assigned only after the awaits below; without this a concurrent/rapid
    // second start() would race through and print a duplicate banner.
    if (_server != null || _starting) {
      return;
    }
    _starting = true;
    try {
      await _startInternal(
        query: query,
        queryWithBindings: queryWithBindings,
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
        declaredTableNames: declaredTableNames,
        declaredSchema: declaredSchema,
        declaredRelationships: declaredRelationships,
        snapshotStorePath: snapshotStorePath,
        discoveryDirectory: discoveryDirectory,
        monitoringEnabled: monitoringEnabled,
      );
    } finally {
      _starting = false;
    }
  }

  /// Body of [start]; runs under the [_starting] re-entrancy guard so the
  /// flag is cleared exactly once whether this returns, throws, or binds.
  Future<void> _startInternal({
    required DriftDebugQuery query,
    DriftDebugQueryWithBindings? queryWithBindings,
    int port = ServerConstants.defaultPort,
    bool loopbackOnly = true,
    String? corsOrigin,
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
    Set<String>? declaredTableNames,
    DeclaredSchemaCallback? declaredSchema,
    DeclaredRelationshipsCallback? declaredRelationships,
    String? snapshotStorePath,
    String? discoveryDirectory,
    bool monitoringEnabled = true,
  }) async {
    // Record the discovery-manifest directory override (null = home default)
    // so both the write below and the remove in [stop] target the same file.
    _discoveryDir = discoveryDirectory;

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

    // Assigned right after the ServerContext is constructed below (same
    // deferred-capture pattern as readQueryForMutation): the write wrapper
    // closure is built BEFORE the context exists but only runs afterward.
    // Nullable rather than late so a write racing startup degrades to
    // "record no activity" instead of a LateInitializationError.
    ServerContext? activityCtx;

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
        // Feature 80: remember the mutation-event high-water mark so the
        // activity feed below can read back the table name(s) the tracker
        // inferred for THIS statement via eventsSince(), reusing its
        // inference through public API instead of widening its return type.
        final mutationIdBefore = tracker.latestId;
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

        // Feature 80: record a heartbeat "write" per affected table.
        // Preferred source: the mutation event(s) MutationTracker appended
        // during captureFromWriteQuery (its table inference already ran).
        // Concurrent writes could interleave events here — best-effort by
        // design, same accepted weakness as the tracker's regex parsing.
        // When no event was appended (SQL not recognized as tracked DML,
        // e.g. the batch handler's BEGIN/COMMIT framing, or quoting shapes
        // the tracker's regexes don't match) fall back to the extraction
        // below; unattributable SQL records nothing.
        //
        // COUPLING WARNING (Feature 22): heartbeat write attribution rides
        // MutationTracker's eventsSince(id) semantics via the high-water
        // mark captured above. A Mutation Stream / MutationTracker refactor
        // that changes what eventsSince returns (non-monotonic ids, deferred
        // or batched event appends, events emitted on a different tick than
        // captureFromWriteQuery) will SILENTLY kill write glow — no error,
        // the board just stops lighting on writes. The extraction fallback
        // in the empty-events branch is the safety net that keeps SOME
        // attribution alive; tests in test/table_activity_tracker_test.dart
        // ("write-path fallback safety net") pin it. If Feature 22 lands,
        // re-verify this block against the new event semantics first.
        //
        // Kill switch: monitoringEnabled false must record nothing anywhere.
        final ctxForActivity = activityCtx;
        if (ctxForActivity != null && ctxForActivity.monitoringEnabled) {
          final newEvents = tracker.eventsSince(mutationIdBefore);
          if (newEvents.isEmpty) {
            for (final table in TableActivityTracker.extractTableNames(sql)) {
              ctxForActivity.tableActivity.recordWrite(table);
            }
          } else {
            for (final event in newEvents) {
              ctxForActivity.tableActivity.recordWrite(event.table);
            }
          }
        }
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
      declaredTableNames: declaredTableNames,
      declaredSchema: declaredSchema,
      declaredRelationships: declaredRelationships,
      snapshotStorePath: snapshotStorePath,
      loopbackOnly: loopbackOnly,
      monitoringEnabled: monitoringEnabled,
    );

    // Capture the context error sink so [stop]'s manifest cleanup (which has no
    // ctx in scope) logs through the same channel instead of swallowing.
    _logError = ctx.logError;
    // Held so [stop] can detach the kill-switch manifest hook (see field doc).
    _runningCtx = ctx;
    // Late-bind the context into the write wrapper's activity feed (the
    // closure was built before ctx existed — see the declaration comment).
    activityCtx = ctx;

    // Restore any snapshots persisted by a previous run before serving, so the
    // list survives a server restart (Feature 72 Phase 4). No-op when no store
    // path was configured.
    await ctx.loadPersistedSnapshots();

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
      // onError keeps a socket-accept failure from escaping as an uncaught
      // async error that would tear down the serving isolate; log and keep
      // the subscription alive so later connections still arrive.
      _serverSubscription = server.listen(
        router.onRequest,
        onError: ctx.logError,
      );

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
      // Use the ACTUAL bound port (server.port), not the requested [port]
      // argument: when callers pass 0 they ask the OS for an ephemeral port,
      // so [port] is 0 here while server.port holds the real assignment.
      // Printing the request value would emit ":0" and a useless
      // `adb forward tcp:0` — the banner must show what the user can connect
      // to and copy-paste.
      final boundPort = server.port;
      final url = _bannerCentered('http://127.0.0.1:$boundPort');
      // The bound port lives in the host app's network namespace. On an
      // Android emulator or a physical device this is NOT the dev machine's
      // loopback, so the http://127.0.0.1 URL above is unreachable from a
      // host browser/viewer until the port is forwarded. Show the exact
      // command (with the actual bound port) so the user can act without
      // guessing — this closes the "server started but viewer offline"
      // diagnostic gap that otherwise looks like a contradiction.
      final hint = _bannerCentered(ServerConstants.bannerEmulatorHint);
      final forwardCmd = _bannerCentered(
        'adb forward tcp:$boundPort tcp:$boundPort',
      );

      // Bind-mode block: the loopback-only default is reachable ONLY via the
      // host loopback (so adb forward, never the device LAN IP). State that
      // explicitly so a developer debugging over Wi-Fi who tries
      // http://<device-lan-ip>:<port> understands the connection-refused is by
      // design, not a dead server — the discoverability gap the security
      // hardening left. When loopbackOnly is false, print the actual reachable
      // LAN URL(s) so the same user gets a copy-paste address.
      // See BUG_drift_server_unreachable_by_lan_ip.
      final bindModeLines = <String>[];
      if (loopbackOnly) {
        bindModeLines
          ..add(_bannerCentered(ServerConstants.bannerLanDisabledHint))
          ..add(_bannerCentered(ServerConstants.bannerLanEnableHint));
      } else {
        final lanIps = await _lanIpv4Addresses(ctx.logError);
        if (lanIps.isEmpty) {
          bindModeLines.add(
            _bannerCentered(ServerConstants.bannerLanNoInterface),
          );
        } else {
          bindModeLines.add(
            _bannerCentered(ServerConstants.bannerLanReachableHeader),
          );
          for (final ip in lanIps) {
            bindModeLines.add(_bannerCentered('http://$ip:$boundPort'));
          }
        }
      }

      // Startup banner must reach Android logcat (I/flutter); developer.log
      // and ctx.log do not surface there, so print is the only viable channel.
      // ignore: avoid_print, avoid_print_in_release -- print() is the only output that surfaces as I/flutter on Android; developer.log/ctx.log/stdout are invisible there, so the startup banner must use print
      print(
        '${ServerConstants.bannerTop}\n'
        '$title\n'
        '${ServerConstants.bannerDivider}\n'
        '${ServerConstants.bannerEmpty}\n'
        '$desc\n'
        '$url\n'
        '${ServerConstants.bannerEmpty}\n'
        '$hint\n'
        '$forwardCmd\n'
        '${ServerConstants.bannerEmpty}\n'
        '${bindModeLines.join('\n')}\n'
        '${ServerConstants.bannerEmpty}\n'
        '${ServerConstants.bannerBottom}',
      );

      // Write the discovery manifest so an external agent (or CLI) can find the
      // running server by reading one well-known file instead of guessing the
      // port. Best-effort: a failure (no home dir on a mobile embedder, a
      // read-only disk) is logged and ignored — it never blocks startup.
      // See E1 in BUG_loopback_server_wedges_and_hard_to_discover_for_agents.md.
      await _writeDiscoveryManifest(
        port: boundPort,
        loopbackOnly: loopbackOnly,
        writeEnabled: ctx.writeQuery != null,
        monitoringEnabled: ctx.monitoringEnabled,
        logError: ctx.logError,
      );

      // Push-notify the VS Code extension (via the VM Service Extension
      // stream) that the server is ready, so discovery does not have to wait
      // for the next 30-60s poll cycle. The event carries the bound port so
      // the extension can target it directly. Try/catch because postEvent
      // is a best-effort signal — it must never block startup or fail on
      // embedders that do not support the VM service.
      // Phase 5 of plans/connection-reliability-ongoing.md (gap 5).
      try {
        developer.postEvent('ext.saropa.drift.ServerStarted', {
          'port': boundPort,
          'version': ServerConstants.packageVersion,
        });
      } on Object catch (e) {
        // postEvent may throw on web stubs or restricted embedders — log but
        // never block startup. The extension falls back to polling discovery.
        ctx.logError(e, StackTrace.current);
      }

      // Keep the manifest's `monitoring` field current across runtime
      // kill-switch flips (setMonitoringEnabled or POST /api/monitoring),
      // so an external profiling tool reading server.json sees the live
      // state without a restart. Fire-and-forget: the manifest is a
      // desktop convenience and must never block or fail a toggle.
      ctx.onMonitoringChanged = (bool enabled) {
        unawaited(
          _writeDiscoveryManifest(
            port: boundPort,
            loopbackOnly: loopbackOnly,
            writeEnabled: ctx.writeQuery != null,
            monitoringEnabled: enabled,
            logError: ctx.logError,
          ),
        );
      };
    } on Object catch (error, stack) {
      // Print server startup failure visibly — same reasoning as the
      // banner above: developer.log is invisible on Android.
      // ignore: avoid_print, avoid_print_error, avoid_print_in_release -- startup failure must be visible on Android where developer.log/ctx.log do not surface; print is the only reliable channel
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

  /// Enumerates the host's non-loopback IPv4 addresses for the startup banner.
  ///
  /// Only called when the server bound a non-loopback interface
  /// (`loopbackOnly: false`), so the banner can print a copy-paste
  /// `http://<lan-ip>:<port>` URL instead of leaving a Wi-Fi-by-IP user to
  /// guess the device address. Loopback is excluded (`includeLoopback: false`)
  /// because the 127.0.0.1 URL is already printed above. Best-effort: a
  /// platform that throws on interface enumeration yields an empty list, and
  /// the caller falls back to [ServerConstants.bannerLanNoInterface] rather
  /// than failing the banner. The failure is routed to [logError] so an
  /// enumeration problem is still visible for debugging even though it never
  /// blocks startup.
  static Future<List<String>> _lanIpv4Addresses(
    void Function(Object, StackTrace) logError,
  ) async {
    try {
      final interfaces = await NetworkInterface.list(
        includeLoopback: false,
        type: InternetAddressType.IPv4,
      );
      return <String>[
        for (final iface in interfaces)
          for (final addr in iface.addresses) addr.address,
      ];
    } on Object catch (error, stack) {
      // Interface enumeration is unsupported / denied on some platforms; the
      // banner degrades to a generic LAN-on line rather than crashing startup.
      // Log so the degradation is not silent, then return the empty fallback.
      logError(error, stack);
      return const <String>[];
    }
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

    // Detach the kill-switch manifest hook BEFORE removing the manifest: a
    // monitoring toggle still in flight must not rewrite server.json after
    // the removal below, or a stale manifest advertises a dead server.
    _runningCtx?.onMonitoringChanged = null;
    _runningCtx = null;

    // Remove this process's discovery manifest so a later agent does not read a
    // stale host:port for a server that is gone. Only deletes the file when it
    // belongs to this process (pid match), so a second server still running in
    // another process keeps its own manifest. Best-effort.
    await _removeDiscoveryManifest();
  }

  /// Resolves the discovery manifest file path.
  ///
  /// When [_discoveryDir] is set (the `discoveryDirectory` override) the
  /// manifest lives directly in that directory; otherwise it resolves under the
  /// user's home directory (`$home/.saropa_drift_advisor`), or null when no
  /// home dir is known (e.g. a mobile embedder), in which case discovery is
  /// silently skipped.
  File? _discoveryManifestFile() {
    final override = _discoveryDir;
    if (override != null && override.isNotEmpty) {
      return File('$override/${ServerConstants.discoveryFileName}');
    }
    final env = Platform.environment;
    // USERPROFILE on Windows, HOME on POSIX. Prefer USERPROFILE first so the
    // Windows desktop case (the primary agent host) resolves even when a shell
    // also exports a HOME.
    final home = env['USERPROFILE'] ?? env['HOME'];
    if (home == null || home.isEmpty) {
      return null;
    }
    return File(
      '$home/${ServerConstants.discoveryDirName}/'
      '${ServerConstants.discoveryFileName}',
    );
  }

  /// Writes the discovery manifest JSON (host, port, version, flags, pid,
  /// workspace, startedAt, endpoints). Best-effort and fully guarded: any
  /// failure is routed to [logError] and swallowed so it cannot break startup.
  Future<void> _writeDiscoveryManifest({
    required int port,
    required bool loopbackOnly,
    required bool writeEnabled,
    required bool monitoringEnabled,
    required void Function(Object, StackTrace) logError,
  }) async {
    try {
      final file = _discoveryManifestFile();
      if (file == null) {
        return;
      }
      await file.parent.create(recursive: true);
      final manifest = <String, dynamic>{
        ServerConstants.jsonKeyHost: ServerConstants.discoveryHost,
        ServerConstants.jsonKeyPort: port,
        ServerConstants.jsonKeyVersion: ServerConstants.packageVersion,
        ServerConstants.jsonKeySchemaVersion:
            ServerConstants.issuesSchemaVersion,
        ServerConstants.jsonKeyWriteEnabled: writeEnabled,
        ServerConstants.jsonKeyLoopbackOnly: loopbackOnly,
        // Kill-switch state so external profiling tools can tell a
        // deliberately dormant server ("disabled") from a broken one.
        ServerConstants.jsonKeyMonitoring: monitoringEnabled
            ? ServerConstants.monitoringStateEnabled
            : ServerConstants.monitoringStateDisabled,
        ServerConstants.jsonKeyPid: pid,
        ServerConstants.jsonKeyWorkspace: Directory.current.path,
        ServerConstants.jsonKeyStartedAt: DateTime.now()
            .toUtc()
            .toIso8601String(),
        ServerConstants.jsonKeyEndpoints: ServerConstants.healthEndpoints,
      };
      await file.writeAsString(
        const JsonEncoder.withIndent('  ').convert(manifest),
        flush: true,
      );
    } on Object catch (error, stack) {
      // Disk/permission/home-dir problems must never block the server.
      logError(error, stack);
    }
  }

  /// Deletes the discovery manifest if it exists AND records this process's pid,
  /// so a still-running server in another process keeps its own manifest. Fully
  /// guarded — a delete failure is ignored.
  Future<void> _removeDiscoveryManifest() async {
    try {
      final file = _discoveryManifestFile();
      if (file == null || !await file.exists()) {
        return;
      }
      // Only remove our own manifest: parse the file and compare pid. A parse
      // failure or pid mismatch leaves the file untouched (another live server).
      final decoded = jsonDecode(await file.readAsString());
      if (decoded is Map<String, dynamic> &&
          decoded[ServerConstants.jsonKeyPid] == pid) {
        await file.delete();
      }
    } on Object catch (error, stack) {
      // Best-effort cleanup; a leftover manifest is harmless (a probing client
      // gets connection-refused on the dead port and moves on). Logged (not
      // swallowed) so a recurring delete failure is still diagnosable. _logError
      // is null only if stop() somehow runs before a successful start.
      _logError?.call(error, stack);
    }
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

  /// Whether monitoring & logging are currently enabled (the global kill
  /// switch is off). Returns null if the server is not running.
  bool? get monitoringEnabled => _router?.isMonitoringEnabled;

  /// Flips the global monitoring & logging kill switch at runtime.
  /// No-op if the server is not running.
  void setMonitoringEnabled(bool enabled) {
    _router?.setMonitoringEnabled(enabled);
  }

  /// Instance half of [DriftDebugServer.reportActivity]; see the static
  /// facade for the full contract. The disarmed/not-running cost is the
  /// point: two null-safe field reads and a boolean — the host wires this
  /// into a PER-QUERY hook, so this path must stay allocation-free.
  void reportActivity(String sql) {
    final tracker = _runningCtx?.tableActivity;
    if (tracker == null || !tracker.captureArmed) {
      return;
    }
    tracker.recordHostStatement(sql);
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

    /// SECURE DEFAULT (true): bind to 127.0.0.1 only. This server exposes the
    /// app's whole database; the previous `false` default bound 0.0.0.0 and made
    /// it readable by any host on the network. Pass `false` only for an
    /// explicit emulator/dev-tunnel scenario, and set [authToken] when you do.
    bool loopbackOnly = true,

    /// SECURE DEFAULT (null = no header): Access-Control-Allow-Origin value. The
    /// previous `'*'` default let any website read DB responses cross-origin.
    /// The bundled web viewer is same-origin and needs no CORS; set this only
    /// for a genuine cross-origin consumer.
    String? corsOrigin,
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

    /// Optional set of table names the app's Drift schema declares
    /// (Drift `GeneratedDatabase.allTables` → `actualTableName`). Enables the
    /// orphan physical-table check: physical tables absent from this set are
    /// flagged via `GET /api/analytics/orphan-tables` and `GET /api/issues`.
    /// When null, that check is report-only and emits no findings. The
    /// `startDriftViewer` extension derives this automatically.
    Set<String>? declaredTableNames,

    /// Optional callback returning the code-declared Drift schema (tables,
    /// columns, types, PK/nullable flags). Served at GET /api/schema/declared
    /// and shown in the web viewer's "Code schema" tab. When null the tab is
    /// empty and the endpoint reports `available: false`. The `startDriftViewer`
    /// extension derives this automatically from a Drift `GeneratedDatabase`.
    DeclaredSchemaCallback? declaredSchema,

    /// Optional callback returning the host-declared relationship manifest:
    /// the parent→child links the app knows in code but does not express as
    /// SQLite foreign keys (Feature 78). Served at GET /api/schema/relationships
    /// and merged into `GET /api/schema/metadata?includeForeignKeys=1` so the
    /// web wizard treats them as authoritative instead of guessing from column
    /// names. When null the endpoint reports `available: false` and the wizard
    /// keeps its heuristic.
    DeclaredRelationshipsCallback? declaredRelationships,

    /// Optional file path the website snapshot list is mirrored to so it
    /// survives a server restart (Feature 72). On start the list is reloaded
    /// from this file; every capture/delete/rename rewrites it atomically.
    /// When null (the default) snapshots stay in memory only, as before — a
    /// browser reload still re-fetches them, but a process restart clears them.
    /// Host configuration; never user/network input.
    String? snapshotStorePath,

    /// Optional directory the discovery manifest is written into, overriding the
    /// default `$home/.saropa_drift_advisor`. The default is a single global
    /// path shared by every server in the process; concurrent servers (most
    /// visibly parallel test suites, where `pid` is identical across in-process
    /// isolates) otherwise clobber and delete each other's manifest. Point a
    /// server at its own directory to isolate its manifest. Host configuration.
    String? discoveryDirectory,

    /// Global monitoring & logging kill switch (default true = monitoring
    /// active). When false the server starts deliberately dormant: no query
    /// recording, no timing capture, no change-detection sweeps, and every
    /// data-inspection endpoint answers a structured 403 while
    /// GET /api/health keeps responding (with `monitoringEnabled: false`)
    /// and GET/POST /api/monitoring stays live so the switch can be flipped
    /// back over HTTP. Unlike [enabled] (which skips starting the server at
    /// all), the server binds and stays discoverable. Flip at runtime via
    /// [setMonitoringEnabled] or POST /api/monitoring.
    bool monitoringEnabled = true,
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
    declaredTableNames: declaredTableNames,
    declaredSchema: declaredSchema,
    declaredRelationships: declaredRelationships,
    snapshotStorePath: snapshotStorePath,
    discoveryDirectory: discoveryDirectory,
    monitoringEnabled: monitoringEnabled,
  );

  /// The port the server is bound to, or null if not running.
  static int? get port => _instance.port;

  /// Whether monitoring & logging are currently enabled (the global kill
  /// switch is off). Returns null if the server is not running.
  static bool? get monitoringEnabled => _instance.monitoringEnabled;

  /// Flips the global monitoring & logging kill switch at runtime.
  ///
  /// When [enabled] is false, all query recording, timing capture, and
  /// change-detection sweeps stop immediately and every data-inspection
  /// endpoint answers a structured 403. GET /api/health keeps responding
  /// (advertising `monitoringEnabled: false`) and GET/POST /api/monitoring
  /// stays live so the switch can be flipped back. The discovery manifest
  /// is rewritten with the new state. No-op if the server is not running.
  static void setMonitoringEnabled(bool enabled) =>
      _instance.setMonitoringEnabled(enabled);

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

  /// Reports one host-app SQL statement for the Heartbeat screen's live
  /// capture (Feature 80, phase 2). Wire it into drift's `logStatements`
  /// or a `QueryInterceptor`:
  ///
  /// ```dart
  /// // e.g. in a QueryInterceptor, or a logStatements listener:
  /// DriftDebugServer.reportActivity(statement.sql);
  /// ```
  ///
  /// Safe to call unconditionally on every statement: while capture is
  /// DISARMED (the default — only the heartbeat screen's toggle arms it,
  /// and a ~5 s poll-renewed lease disarms it the moment no screen is
  /// watching) this is a couple of field reads and a branch, with no
  /// parsing or allocation. While armed, SELECT/WITH statements record
  /// per-table reads and INSERT/UPDATE/DELETE/REPLACE record writes;
  /// everything else (DDL, PRAGMA, transaction framing) records nothing.
  /// Not wiring it at all is fine — the screen then shows phase 1 signals
  /// only (advisor traffic + detected row-count changes).
  static void reportActivity(String sql) => _instance.reportActivity(sql);

  /// Stops the server and releases the port. No-op if not running.
  static Future<void> stop() => _instance.stop();
}
