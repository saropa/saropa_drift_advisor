import 'drift_debug_server.dart';

/// Convenience API for Drift apps: `await myDb.startDriftViewer(...)`.
///
/// This package intentionally does **not** depend on `drift`, so this extension is
/// implemented via runtime "duck typing". It expects the receiver (and optionally
/// [compareDatabase]) to behave like a Drift database:
/// - `customSelect(String sql)` returning an object with `Future<List> get()`
/// - each returned row having a `data` getter that is `Map`-like
///
/// If you prefer compile-time type safety, call [DriftDebugServer.start] directly.
extension StartDriftViewerExtension on Object {
  Future<void> startDriftViewer({
    bool enabled = true,
    int port = 8642,
    bool loopbackOnly = false,
    String? corsOrigin = '*',
    String? authToken,
    String? basicAuthUser,
    String? basicAuthPassword,
    DriftDebugGetDatabaseBytes? getDatabaseBytes,
    Object? compareDatabase,
    DriftDebugOnLog? onLog,
    DriftDebugOnError? onError,
  }) async {
    Future<List<Map<String, dynamic>>> runFor(Object db, String sql) async {
      try {
        final dynamic driftDb = db;
        final dynamic selectable = driftDb.customSelect(sql);
        final dynamic rows = await selectable.get();
        if (rows is! List) {
          throw StateError(
            'startDriftViewer expected customSelect(sql).get() to return a List, '
            'but got ${rows.runtimeType}.',
          );
        }

        return rows.map<Map<String, dynamic>>((dynamic row) {
          final dynamic data = row.data;
          if (data is! Map) {
            throw StateError(
              'startDriftViewer expected each row to have a Map-like data field, '
              'but got ${data.runtimeType}.',
            );
          }
          return Map<String, dynamic>.from(data);
        }).toList(growable: false);
      } on NoSuchMethodError catch (e, st) {
        Error.throwWithStackTrace(
          StateError(
            'startDriftViewer requires a Drift-like database with customSelect(sql).get() '
            'and rows exposing row.data as a Map. Missing member: $e',
          ),
          st,
        );
      }
    }

    return DriftDebugServer.start(
      query: (sql) => runFor(this, sql),
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
          : (sql) => runFor(compareDatabase, sql),
      onLog: onLog,
      onError: onError,
    );
  }
}
