// Helper types extracted from drift_debug_server_io.dart to reduce file size.
// See drift_debug_server_io.dart for usage.

import 'server_constants.dart';

// --- Snapshot (time-travel) ---

/// In-memory snapshot of table state (for time-travel compare). Captured by POST /api/snapshot;
/// GET /api/snapshot/compare diffs current DB vs this snapshot (per-table added/removed/unchanged).
class Snapshot {
  const Snapshot({
    required this.id,
    required this.createdAt,
    required this.tables,
  });

  final String id;
  final DateTime createdAt;
  final Map<String, List<Map<String, dynamic>>> tables;

  @override
  String toString() =>
      'Snapshot(id: $id, createdAt: $createdAt, tables: ${tables.length} tables)';
}

/// A single query timing record for the performance monitor.
class QueryTiming {
  QueryTiming({
    required this.sql,
    required this.durationMs,
    required this.rowCount,
    required this.at,
    this.error,
    this.callerFile,
    this.callerLine,
    this.isInternal = false,
  });

  final String sql;
  final int durationMs;
  final int rowCount;
  final DateTime at;
  final String? error;

  /// Source file of the code that issued this query, parsed from the
  /// call stack at recording time. Null when the stack frame could not
  /// be resolved (e.g. in release builds or obfuscated code).
  final String? callerFile;

  /// Source line number that issued this query. Null when the stack
  /// frame could not be resolved.
  final int? callerLine;

  /// True when the query was issued by the extension itself (e.g.
  /// change-detection COUNT(*) probes), not by the user's application
  /// code. Internal queries are excluded from slow-query diagnostics
  /// to avoid a confusing feedback loop where the extension's own
  /// overhead is reported as an application performance problem.
  final bool isInternal;

  /// Computed query source based on [isInternal] and [callerFile].
  /// - `"internal"` — extension-owned diagnostic probe
  /// - `"app"` — originated from the Flutter app (callerFile resolved)
  /// - `"browser"` — manual SQL from the web UI (no callerFile)
  String get source {
    if (isInternal) return 'internal';
    if (callerFile != null) return 'app';
    return 'browser';
  }

  Map<String, dynamic> toJson() => <String, dynamic>{
    'sql': sql,
    'durationMs': durationMs,
    'rowCount': rowCount,
    'error': ?error,
    'at': at.toIso8601String(),
    'source': source,
    'callerFile': ?callerFile,
    'callerLine': ?callerLine,
    if (isInternal) 'isInternal': true,
  };
}

/// Validated POST /api/sql request body (prefer_extension_type_for_wrapper, require_api_response_validation).
extension type SqlRequestBody(String sql) implements Object {
  /// Validates shape and returns null on invalid (require_api_response_validation).
  static SqlRequestBody? fromJson(Object? decoded) {
    if (decoded is! Map<String, dynamic>) {
      return null;
    }
    final raw = decoded[ServerConstants.jsonKeySql];
    if (raw is! String) {
      return null;
    }
    final trimmedSql = raw.trim();
    if (trimmedSql.isEmpty) {
      return null;
    }
    return SqlRequestBody(trimmedSql);
  }
}
