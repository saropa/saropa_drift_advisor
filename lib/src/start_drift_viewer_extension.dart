import 'dart:developer' as developer;

import 'drift_debug_server.dart';

/// Log name for startDriftViewer errors (used when duck-typing fails).
const String _kStartViewerLogName = 'StartDriftViewer';

/// Hint appended to StateErrors when duck-typing fails; guides users of drift_sqlite_async or custom executors to the callback API.
const String _kCallbackApiHint =
    ' If using drift_sqlite_async or a custom executor, use DriftDebugServer.start(query: ...) with an explicit query callback.';

/// Runs [sql] against [db] using Drift-like API: customSelect(sql).get(), then maps row.data to Map.
///
/// Throws [StateError] if the return type or row shape is wrong.
/// [NoSuchMethodError] is caught and rethrown as [StateError] with stack trace.
Future<List<Map<String, dynamic>>> _runDriftQuery(Object db, String sql) async {
  try {
    final dynamic driftDb = db;
    final dynamic selectable = driftDb.customSelect(sql);
    final dynamic rows = await selectable.get();
    if (rows is! List) {
      throw StateError(
        'startDriftViewer expected customSelect(sql).get() to return a List, but got ${rows.runtimeType}.$_kCallbackApiHint',
      );
    }

    return rows
        .map<Map<String, dynamic>>((dynamic row) {
          final dynamic data = row.data;
          if (data is! Map) {
            throw StateError(
              'startDriftViewer expected each row to have a Map-like data field, but got ${data.runtimeType}.$_kCallbackApiHint',
            );
          }
          return Map<String, dynamic>.from(data);
        })
        .toList(growable: false);
  } on NoSuchMethodError catch (e, st) {
    // Only build log message in debug so we avoid expensive string construction in release.
    if (!bool.fromEnvironment('dart.vm.product', defaultValue: false)) {
      developer.log(
        'startDriftViewer requires a Drift-like database with customSelect(sql).get() and rows exposing row.data as a Map. Missing member: $e$_kCallbackApiHint',
        name: _kStartViewerLogName,
        error: e,
        stackTrace: st,
      );
    }
    return Error.throwWithStackTrace(
      StateError(
        'startDriftViewer requires a Drift-like database with customSelect(sql).get() and rows exposing row.data as a Map. Missing member: $e$_kCallbackApiHint',
      ),
      st,
    );
  }
}

/// Derives the set of table names the Drift schema declares by duck-typing
/// the database's `allTables` getter (a Drift `GeneratedDatabase` exposes
/// `Iterable<TableInfo> get allTables`, each with `String get
/// actualTableName`).
///
/// Returns null when [db] does not expose `allTables` (e.g.
/// drift_sqlite_async or a custom executor), or when no usable names are
/// found. Null leaves the orphan physical-table check report-only — it is an
/// optional enhancement, so any failure is swallowed silently rather than
/// breaking server startup.
Set<String>? _deriveDeclaredTableNames(Object db) {
  try {
    final dynamic driftDb = db;
    final dynamic tables = driftDb.allTables;
    if (tables is! Iterable) {
      return null;
    }
    final names = <String>{};
    for (final dynamic table in tables) {
      final dynamic name = table.actualTableName;
      if (name is String && name.isNotEmpty) {
        names.add(name);
      }
    }
    return names.isEmpty ? null : names;
  } on Object catch (error, stack) {
    // Not a Drift GeneratedDatabase, or allTables/actualTableName absent.
    // The viewer still works without the declared set; the orphan check
    // simply stays report-only. Logged (debug-only) for visibility but never
    // rethrown — a missing getter must not break server startup.
    if (!bool.fromEnvironment('dart.vm.product', defaultValue: false)) {
      developer.log(
        'startDriftViewer could not derive declared table names from '
        'allTables; orphan physical-table check stays report-only. $error',
        name: _kStartViewerLogName,
        error: error,
        stackTrace: stack,
      );
    }
    return null;
  }
}

/// Convenience API for Drift apps: `await myDb.startDriftViewer(...)`.
///
/// This package intentionally does **not** depend on `drift`, so this extension is
/// implemented via runtime "duck typing". It expects the receiver (and optionally
/// [compareDatabase]) to behave like a Drift database:
/// - `customSelect(String sql)` returning an object with `Future<List> get()`
/// - each returned row having a `data` getter that is `Map`-like
///
/// If you prefer compile-time type safety, call [DriftDebugServer.start] directly.
///
/// Throws [StateError] if the receiver does not support the required API.
extension StartDriftViewerExtension on Object {
  /// Starts the Drift debug server with this object as the database.
  ///
  /// This starts a **localhost-only** server; no external network call is made.
  /// Wraps this object (and [compareDatabase] if provided) in a [DriftDebugQuery] by
  /// calling customSelect(sql).get() and mapping row.data to Map. See [DriftDebugServer.start] for parameters.
  /// When [compareDatabase] is non-null it must support the same Drift-like API (customSelect, get(), row.data as Map);
  /// otherwise queries that use the compare DB (e.g. GET /api/compare/report) will fail with [StateError] or 500.
  ///
  /// Throws [StateError] when the receiver or [compareDatabase] does not support the Drift-like API.
  /// Throws [NoSuchMethodError] (converted to [StateError] with stack) when customSelect or get() is missing.
  Future<void> startDriftViewer({
    bool enabled = true,
    int port = 8_642,
    bool loopbackOnly = false,
    String? corsOrigin = '*',
    String? authToken,
    String? basicAuthUser,
    String? basicAuthPassword,
    DriftDebugGetDatabaseBytes? getDatabaseBytes,
    Object? compareDatabase,
    DriftDebugWriteQuery? writeQuery,
    DriftDebugWriteQueryWithBindings? writeQueryWithBindings,
    DriftDebugOnLog? onLog,
    DriftDebugOnError? onError,
  }) async {
    // Preserve return await so async stack trace is retained (prefer_return_await).
    return await DriftDebugServer.start(
      query: (sql) => _runDriftQuery(this, sql),
      // Derive the Drift-declared table set so the orphan physical-table
      // check can flag tables present in the DB but absent from the schema.
      // Null (non-Drift db) leaves that check report-only.
      declaredTableNames: _deriveDeclaredTableNames(this),
      enabled: enabled,
      port: port,
      loopbackOnly: loopbackOnly,
      corsOrigin: corsOrigin,
      authToken: authToken,
      basicAuthUser: basicAuthUser,
      basicAuthPassword: basicAuthPassword,
      getDatabaseBytes: getDatabaseBytes,
      queryCompare: compareDatabase == null
          ? null
          : (sql) => _runDriftQuery(compareDatabase, sql),
      writeQuery: writeQuery,
      writeQueryWithBindings: writeQueryWithBindings,
      onLog: onLog,
      onError: onError,
    );
  }
}
