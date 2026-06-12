// Helper types extracted from drift_debug_server_io.dart to reduce file size.
// See drift_debug_server_io.dart for usage.

import 'server_constants.dart';

// --- Snapshot (time-travel) ---

/// In-memory snapshot of table state (for time-travel compare). Captured by POST /api/snapshot;
/// the server keeps several (see [ServerContext.snapshots]). GET /api/snapshot/compare diffs
/// current DB (or another stored snapshot) against one (per-table added/removed/unchanged).
class Snapshot {
  const Snapshot({
    required this.id,
    required this.createdAt,
    required this.tables,
    this.label,
  });

  final String id;
  final DateTime createdAt;
  final Map<String, List<Map<String, dynamic>>> tables;

  /// Optional user-supplied label for the snapshot list UI. The timestamp [id]
  /// remains the stable key; the label is display-only and may be renamed.
  final String? label;

  /// Returns a copy with a new [label] (id/createdAt/tables unchanged).
  Snapshot withLabel(String? newLabel) =>
      Snapshot(id: id, createdAt: createdAt, tables: tables, label: newLabel);

  @override
  String toString() =>
      'Snapshot(id: $id, createdAt: $createdAt, tables: ${tables.length} tables)';
}

// --- Declared (code-side) schema (Feature 71) ---

/// One column in a host-declared Drift schema (the schema as written in code,
/// independent of the live SQLite file). Served by GET /api/schema/declared so
/// the web viewer can show code-declared tables and (stretch) flag divergence
/// from the runtime database.
class DeclaredColumn {
  const DeclaredColumn({
    required this.name,
    required this.sqlType,
    this.driftType,
    this.nullable = true,
    this.isPk = false,
  });

  final String name;

  /// Declared SQLite storage type (e.g. INTEGER, TEXT). Free-form string so a
  /// host can pass whatever its schema declares without a fixed enum.
  final String sqlType;

  /// Drift SEMANTIC type ('dateTime' | 'bool' | 'int' | 'double' | 'string' |
  /// 'blob'), when derivable from a Drift `GeneratedColumn`. Null for raw
  /// SQLite hosts. Drift stores DateTime/bool as INTEGER, so [sqlType] alone
  /// can't distinguish them — this carries the lost distinction so the NL
  /// converter can detect dates/bools exactly.
  final String? driftType;
  final bool nullable;
  final bool isPk;
}

/// One table in a host-declared Drift schema, with its columns and any declared
/// index names. `indexes` may be empty when the host cannot supply them.
class DeclaredTable {
  const DeclaredTable({
    required this.name,
    required this.columns,
    this.indexes = const <String>[],
  });

  final String name;
  final List<DeclaredColumn> columns;
  final List<String> indexes;
}

/// The full code-declared schema: an ordered list of tables.
typedef DeclaredSchema = List<DeclaredTable>;

/// Host-supplied callback returning the code-declared Drift schema. When null
/// the GET /api/schema/declared endpoint reports the feature as unavailable
/// (same opt-in posture as `declaredTableNames` for the orphan check).
typedef DeclaredSchemaCallback = DeclaredSchema Function();

// --- Declared (code-side) relationship manifest (Feature 78) ---

/// One declared relationship edge: `fromTable.fromColumn` references
/// `toTable.toColumn`. Descriptive only — the advisor reads it to know the link
/// exists; it never enforces it (no `PRAGMA foreign_keys`, no constraint, no
/// migration). This is how a host that links by convention (a shared UUID/`_id`
/// column) instead of SQLite foreign keys makes its relationships visible to
/// tooling, turning the web wizard's column-name heuristic into a fact.
class DeclaredRelationship {
  const DeclaredRelationship({
    required this.fromTable,
    required this.fromColumn,
    required this.toTable,
    required this.toColumn,
    this.label,
    this.orphanCheckable = true,
  });

  final String fromTable;
  final String fromColumn;
  final String toTable;
  final String toColumn;

  /// Optional human name for the edge ("contact → phones"). Real consumer is
  /// the ER diagram / wizard relationship chip text; omitted from JSON when
  /// null (no field for documentation only — it has a display consumer).
  final String? label;

  /// Whether this edge can be checked for orphaned rows with a scalar
  /// `LEFT JOIN child.col = parent.col`. Defaults to `true`.
  ///
  /// The orphan-row anomaly check ([AnomalyDetector]) reads this to filter the
  /// manifest down to joinable edges. The wizard / ER diagram ignore it — they
  /// want every edge for the graph. Set `false` for edge kinds a single-column
  /// equality join cannot represent: a `list_ref` (a JSON array of many parent
  /// UUIDs in one text cell — a scalar join is simply wrong) or a
  /// `seed_identity` (a static-data UUID that becomes a contact UUID on seed,
  /// not a foreign key at all). Maps 1:1 to the host manifest's
  /// `orphan_checkable` field so no host information is lost.
  final bool orphanCheckable;
}

/// The full host-declared relationship manifest: an ordered list of edges.
typedef DeclaredRelationships = List<DeclaredRelationship>;

/// Host-supplied callback returning the relationship manifest. When null the
/// GET /api/schema/relationships endpoint reports `available: false` and the
/// metadata fold falls back to `PRAGMA foreign_key_list` (same opt-in posture
/// as [DeclaredSchemaCallback]).
typedef DeclaredRelationshipsCallback = DeclaredRelationships Function();

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
///
/// Wraps a record so the extension type can carry the optional
/// `isInternal` tag alongside the sql string without losing the
/// prefer_extension_type_for_wrapper lint compliance.
extension type SqlRequestBody._(
  ({
    String sql,
    bool isInternal,
    List<dynamic>? dvrArgs,
    Map<String, dynamic>? dvrNamedArgs,
  })
  _fields
) implements Object {
  /// Public ctor: preserves the original positional `sql`-only form used by
  /// callers and tests. `isInternal` defaults to false — set it only for
  /// extension-owned diagnostic probes.
  ///
  /// Optional [dvrArgs] / [dvrNamedArgs] are stored on Query Replay DVR entries
  /// for `/api/sql` requests (declared bindings only; the SQL string is unchanged).
  SqlRequestBody(
    String sql, {
    bool isInternal = false,
    List<dynamic>? dvrArgs,
    Map<String, dynamic>? dvrNamedArgs,
  }) : this._((
         sql: sql,
         isInternal: isInternal,
         dvrArgs: dvrArgs,
         dvrNamedArgs: dvrNamedArgs,
       ));

  /// Trimmed sql string.
  String get sql => _fields.sql;

  /// True when the request came from an extension-owned diagnostic probe.
  /// Propagated into the recorded [QueryTiming.isInternal] so the extension's
  /// own scans are excluded from slow-query / perf-regression analysis.
  bool get isInternal => _fields.isInternal;

  /// Positional args for DVR metadata (`args` in POST `/api/sql` JSON).
  List<dynamic>? get dvrArgs => _fields.dvrArgs;

  /// Named args for DVR metadata (`namedArgs` in POST `/api/sql` JSON).
  Map<String, dynamic>? get dvrNamedArgs => _fields.dvrNamedArgs;

  /// Validates shape and returns null on invalid (require_api_response_validation).
  ///
  /// Accepts a legacy body `{"sql": "..."}` as well as the newer
  /// `{"sql": "...", "internal": true}` form. Only literal `true` enables
  /// the internal flag — any other type (including `"1"`, `1`, `"true"`) is
  /// rejected as false. This keeps the boundary strict: the internal tag is
  /// extension-controlled and must not be toggled by arbitrary JSON shapes.
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
    final rawInternal = decoded[ServerConstants.jsonKeyInternal];
    final isInternal = rawInternal == true;

    List<dynamic>? args;
    final rawArgs = decoded['args'];
    if (rawArgs is List<dynamic>) {
      args = rawArgs;
    }

    Map<String, dynamic>? namedArgs;
    final rawNamed = decoded['namedArgs'];
    if (rawNamed is Map<String, dynamic>) {
      namedArgs = rawNamed;
    } else if (rawNamed is Map) {
      namedArgs = <String, dynamic>{};
      for (final e in rawNamed.entries) {
        namedArgs[e.key.toString()] = e.value;
      }
    }

    return SqlRequestBody(
      trimmedSql,
      isInternal: isInternal,
      dvrArgs: args,
      dvrNamedArgs: namedArgs,
    );
  }
}
