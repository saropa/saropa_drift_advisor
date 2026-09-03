/// Dart port of `extension/src/sql/blob-safe-select.ts`.
///
/// Why this exists: `snapshot_handler.dart` and `mutation_tracker.dart` issue
/// `SELECT * FROM "<table>"` sweeps to capture row content for diffing /
/// change tracking. On a table with an image/attachment BLOB column,
/// `SELECT *` pulls every blob's raw bytes into the response, which
/// `ServerUtils.normalizeRows`/`jsonEncode` then materializes as a JSON array
/// of integers per row. This is the exact defect the TypeScript extension
/// fixed in v4.1.17 (`blobSafeSelectList`, see that file's doc comment for the
/// full incident) — a capture sweep meant to inspect the DB OOM-killed the
/// connected app instead. See
/// plans/history/2026.09/20260902/005_infra_snapshot_capture_select_star_blob_oom.md.
///
/// Change detection never needed the bytes themselves. Projecting
/// `length("col") AS "col"` makes SQLite compute a single integer instead of
/// returning the payload, so the bytes are never materialized or
/// transferred. The result is aliased back to the original column name so
/// downstream code (row signatures, diffing, column display) is unchanged —
/// a BLOB cell simply reads as its byte length rather than its bytes.
///
/// Limitation (mirrors the TS version): a blob overwritten with a
/// different value of the SAME byte length is not detected as changed. That
/// is the accepted trade for never moving blob payloads through the
/// process — SQLite has no built-in row hash, and `length()` catches the
/// overwhelming majority of real changes (add/remove/replace-with-different-size).
library;

import 'server_constants.dart';
import 'server_typedefs.dart';
import 'server_utils.dart';

/// Builds BLOB-safe `SELECT` projections for full-table capture sweeps.
abstract final class BlobSafeSelect {
  /// True when a declared column [type] has SQLite BLOB affinity. Matches the
  /// substring "BLOB" case-insensitively, mirroring SQLite's own affinity
  /// rule (any declared type containing "BLOB" gets BLOB affinity) and the
  /// TypeScript `isBlobColumn` this ports.
  static bool isBlobColumn(String type) => type.toUpperCase().contains('BLOB');

  /// Builds the comma-separated SELECT projection from `PRAGMA table_info`
  /// [columns] rows, replacing each BLOB-affinity column with
  /// `length("col") AS "col"` and passing every other column through
  /// verbatim (quoted). Falls back to `*` when [columns] is empty (e.g. the
  /// table vanished between the PRAGMA read and this call, or the PRAGMA
  /// itself failed) — preserving the old unconditional-`*` behavior only for
  /// that no-info case, never for the common case.
  static String selectListFromColumns(List<Map<String, dynamic>> columns) {
    if (columns.isEmpty) return '*';

    final parts = <String>[];
    for (final col in columns) {
      final name = col[ServerConstants.jsonKeyName] as String?;
      // A column row without a usable name can't be projected by name;
      // skipping it (rather than aborting to `*`) keeps the other columns
      // BLOB-safe instead of losing the optimization over one bad row.
      if (name == null || name.isEmpty) continue;

      final type = col[ServerConstants.jsonKeyType] as String? ?? '';
      final ident = ServerUtils.quoteIdent(name);
      parts.add(isBlobColumn(type) ? 'length($ident) AS $ident' : ident);
    }

    // All rows were unusable (shouldn't happen for a real table, but keeps
    // the function total rather than emitting an empty projection list).
    return parts.isEmpty ? '*' : parts.join(', ');
  }

  /// Runs `PRAGMA table_info(<table>)` via [queryFn] and returns the
  /// BLOB-safe select list for [table]. One extra round-trip per table, paid
  /// once per capture rather than once per row.
  static Future<String> selectListForTable(
    DriftDebugQuery queryFn,
    String table,
  ) async {
    final rows = ServerUtils.normalizeRows(
      await queryFn('PRAGMA table_info(${ServerUtils.quoteIdent(table)})'),
    );
    return selectListFromColumns(rows);
  }

  /// Builds a full `SELECT <blob-safe list> FROM "<table>" LIMIT <n>`
  /// statement for [table] using [queryFn] to resolve column metadata.
  ///
  /// The `LIMIT` bounds row count the same way [selectListForTable] bounds
  /// column payload size — a table with the BLOB risk mitigated can still
  /// hold an unbounded number of rows, and a capture sweep that reads them
  /// all is the same "materialize everything into one isolate" failure mode
  /// with a different axis. [limit] defaults to
  /// [ServerConstants.maxSqlResultRows] to match the cap `SqlHandler`
  /// already applies to ad-hoc queries.
  static Future<String> buildQuery(
    DriftDebugQuery queryFn,
    String table, {
    int limit = ServerConstants.maxSqlResultRows,
  }) async {
    final selectList = await selectListForTable(queryFn, table);
    final quotedTable = ServerUtils.quoteIdent(table);
    return 'SELECT $selectList FROM $quotedTable LIMIT $limit';
  }
}
