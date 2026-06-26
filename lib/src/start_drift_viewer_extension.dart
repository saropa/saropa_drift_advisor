import 'dart:developer' as developer;

import 'drift_debug_server.dart';
import 'server/server_types.dart';

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

/// Logs a debug-only diagnostic for the optional declared-schema derivation.
/// Centralized so the catch blocks satisfy "no silent swallow" while staying
/// quiet in release (the feature is optional and never breaks startup).
void _logDeclaredSchemaSkip(Object error, StackTrace stack) {
  if (!bool.fromEnvironment('dart.vm.product', defaultValue: false)) {
    developer.log(
      'startDriftViewer could not derive (part of) the declared schema; the '
      'Code schema tab may be empty/partial. $error',
      name: _kStartViewerLogName,
      error: error,
      stackTrace: stack,
    );
  }
}

/// Maps a duck-typed Drift `GeneratedColumn.type` (a `DriftSqlType` enum) to a
/// SQLite storage type string for the declared-schema view. Best-effort: an
/// unrecognized type falls back to TEXT. May throw if `column.type` is absent;
/// the per-table catch in [_deriveDeclaredSchema] handles that.
///
/// [storeDateTimeAsText] is the database's `DriftDatabaseOptions.storeDateTimeAsText`
/// flag, read once in [_deriveDeclaredSchema]. It decides DateTime storage: Drift's
/// DEFAULT is INTEGER (unix-epoch seconds), and only TEXT (ISO-8601) when the option
/// is set. Hard-mapping DateTime to TEXT regardless made every DateTime column read
/// as a `code TEXT vs database INTEGER` divergence on the common default-storage app.
String _declaredSqlType(dynamic column, {required bool storeDateTimeAsText}) {
  final String t = column.type.toString().toLowerCase();
  // DateTime must be checked before the generic int branch: its default storage
  // is INTEGER, flipping to TEXT only when the database opts into text storage.
  if (t.contains('datetime')) return storeDateTimeAsText ? 'TEXT' : 'INTEGER';
  if (t.contains('int') || t.contains('bool')) return 'INTEGER';
  if (t.contains('double') || t.contains('real')) return 'REAL';
  if (t.contains('blob') || t.contains('uint8')) return 'BLOB';
  // string and anything else → TEXT.
  return 'TEXT';
}

/// Maps a Drift `GeneratedColumn.type` (a `DriftSqlType` enum) to a normalized
/// SEMANTIC token, preserving the date/bool distinction that [_declaredSqlType]
/// collapses (DateTime/bool both store as INTEGER). Used to populate
/// [DeclaredColumn.driftType]. Like [_declaredSqlType], it may throw if
/// `column.type` is absent — the per-table catch in [_deriveDeclaredSchema]
/// handles that, so we don't swallow it here.
String? _declaredDriftType(dynamic column) {
  final String t = column.type.toString().toLowerCase();
  if (t.contains('datetime')) return 'dateTime';
  if (t.contains('bool')) return 'bool';
  if (t.contains('double') || t.contains('real')) return 'double';
  if (t.contains('blob') || t.contains('uint8')) return 'blob';
  if (t.contains('int')) return 'int';
  if (t.contains('string') || t.contains('text')) return 'string';
  return null;
}

/// Reads the PK column names from a duck-typed Drift `TableInfo.$primaryKey`.
///
/// [storeDateTimeAsText] is forwarded to [_declaredSqlType] so DateTime columns
/// map to the database's actual storage affinity (INTEGER by default).
DeclaredTable _declaredTableFrom(
  dynamic table,
  String name, {
  required bool storeDateTimeAsText,
}) {
  final pkNames = <String>{};
  final dynamic pkSet = table.$primaryKey;
  if (pkSet is Iterable) {
    for (final dynamic pc in pkSet) {
      final dynamic pn = pc.name;
      if (pn is String) pkNames.add(pn);
    }
  }

  final declaredCols = <DeclaredColumn>[];
  final dynamic cols = table.$columns;
  if (cols is Iterable) {
    for (final dynamic c in cols) {
      final dynamic cn = c.name;
      if (cn is! String || cn.isEmpty) continue;
      final dynamic nullable = c.$nullable;
      declaredCols.add(
        DeclaredColumn(
          name: cn,
          sqlType: _declaredSqlType(
            c,
            storeDateTimeAsText: storeDateTimeAsText,
          ),
          driftType: _declaredDriftType(c),
          nullable: nullable is bool ? nullable : true,
          isPk: pkNames.contains(cn),
        ),
      );
    }
  }
  return DeclaredTable(name: name, columns: declaredCols);
}

/// Derives the code-declared schema (tables → columns/types/PK/nullable) by
/// duck-typing a Drift `GeneratedDatabase`: `allTables` → each `TableInfo`'s
/// `actualTableName`, `$columns` (each `GeneratedColumn` with `name`, `type`,
/// `$nullable`), and `$primaryKey`.
///
/// Returns null when [db] is not a Drift `GeneratedDatabase` (drift_sqlite_async
/// or a custom executor) or exposes none of these. Like
/// [_deriveDeclaredTableNames], any failure is logged (debug-only) and never
/// rethrown — the declared-schema tab is optional and must not break startup.
/// Each table is derived independently so one malformed table cannot drop the
/// rest.
/// Reads the duck-typed Drift `GeneratedDatabase.options.storeDateTimeAsText`
/// flag, defaulting to false (Drift's default INTEGER/unix-epoch DateTime
/// storage). A non-Drift db or an older Drift without `options` legitimately
/// lacks this getter, so the absence is a benign default — not a derivation
/// failure worth logging — and we return false rather than surfacing it.
bool _readStoreDateTimeAsText(dynamic driftDb) {
  try {
    final dynamic value = driftDb.options.storeDateTimeAsText;
    return value is bool ? value : false;
    // A missing `options`/`storeDateTimeAsText` getter is the EXPECTED path for a
    // non-Drift db; logging it on every such startup would be misleading noise, and
    // the false default is correct (Drift's default INTEGER DateTime storage).
    // ignore: require_catch_logging -- expected non-Drift path; false is the correct default, logging would be noise
  } on Object {
    return false;
  }
}

DeclaredSchema? _deriveDeclaredSchema(Object db) {
  try {
    final dynamic driftDb = db;
    final dynamic tables = driftDb.allTables;
    if (tables is! Iterable) {
      return null;
    }
    // Read the DateTime-storage option once so every DateTime column maps to the
    // affinity the live DB actually uses (INTEGER by default, TEXT only when set).
    final bool storeDateTimeAsText = _readStoreDateTimeAsText(driftDb);
    final result = <DeclaredTable>[];
    for (final dynamic table in tables) {
      try {
        final dynamic name = table.actualTableName;
        if (name is! String || name.isEmpty) {
          continue;
        }
        result.add(
          _declaredTableFrom(
            table,
            name,
            storeDateTimeAsText: storeDateTimeAsText,
          ),
        );
      } on Object catch (error, stack) {
        // One malformed table (missing $columns/$primaryKey/type) is skipped;
        // the remaining tables still produce a usable declared schema.
        _logDeclaredSchemaSkip(error, stack);
      }
    }
    return result.isEmpty ? null : result;
  } on Object catch (error, stack) {
    _logDeclaredSchemaSkip(error, stack);
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
    // SECURE DEFAULT: loopback-only bind + no wildcard CORS. This server exposes
    // the whole database; the old `false`/`'*'` defaults made it reachable by any
    // host on the network and readable cross-origin by any website. Opt into a
    // non-loopback bind explicitly (and set authToken) only when needed.
    // See plans/full-codebase-audit-2026.06.12.md C1.
    bool loopbackOnly = true,
    String? corsOrigin,
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
      // Derive the code-declared schema for the "Code schema" web tab. Captured
      // once and returned by the callback; null (non-Drift db) leaves the tab
      // empty. Best-effort — derivation failures never break startup.
      declaredSchema: (() {
        final schema = _deriveDeclaredSchema(this);
        return schema == null ? null : () => schema;
      })(),
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
