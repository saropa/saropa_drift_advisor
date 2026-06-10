// Orphan physical-table detection.
//
// Detects tables that physically exist in the SQLite file but have no
// corresponding definition in the app's Drift schema — the inverse of the
// usual "schema declares a table the DB lacks" check. Drift's own schema
// verification (and drift_dev) only walks the declared classes, so a physical
// table absent from them is never inspected. Only a check that starts from the
// PHYSICAL side (enumerate sqlite_master, subtract the declared set) can
// surface them.
//
// Motivating case: the Saropa Contacts v33 orphan — a physical table left in
// the database by a migration whose Drift definition had since been
// removed/renamed. It sat undetected because nothing in the schema pointed at
// it, silently bloating the file and risking a shadowed re-CREATE on the next
// migration.

import 'server_typedefs.dart';
import 'server_utils.dart';

/// Static orphan physical-table detection.
///
/// All methods are [static] and stateless — they depend only on their
/// parameters, never on instance fields. Mirrors [AnomalyDetector] /
/// [IndexAnalyzer] so the check can be unit-tested and reused without a full
/// handler context.
abstract final class OrphanTableDetector {
  /// Tables that physically exist for non-Drift reasons and must never be
  /// flagged as orphans.
  ///
  /// `sqlite_%` tables (`sqlite_sequence`, `sqlite_stat1`, …) are already
  /// excluded upstream by [ServerUtils.getTableNames] (the `name NOT LIKE
  /// 'sqlite_%'` clause), so they are deliberately NOT repeated here.
  ///
  /// `android_metadata` is created by Android's `SQLiteOpenHelper` (it stores
  /// the database locale), not by Drift — it is present in essentially every
  /// Android SQLite file and is never declared in a Drift schema, so without
  /// this exclusion it would be a guaranteed false positive on every Android
  /// app. Matched case-insensitively (see [getOrphanTablesResult]).
  static const Set<String> defaultInternalTableNames = <String>{
    'android_metadata',
  };

  /// Diagnostic `type` tag shared by the orphan finding and the merged
  /// `/api/issues` shape, so consumers (Saropa Lints, the Health tab) can
  /// filter on a stable key.
  static const String orphanFindingType = 'orphan_table';

  /// Enumerates physical tables and flags any that the connected Drift schema
  /// does not declare.
  ///
  /// [declaredTableNames] is the set of table names the app's Drift schema
  /// declares (Drift `GeneratedDatabase.allTables` → `actualTableName`). It is
  /// REQUIRED to be non-null for any finding to be produced: the advisor sees
  /// only the physical side, so without the declared set there is no way to
  /// tell an orphan from a legitimate table. This makes the check opt-in /
  /// report-only by construction — a caller that does not (or cannot) supply
  /// the declared set gets `declaredSchemaAvailable: false` and zero orphans,
  /// never a false alarm.
  ///
  /// [internalTableNames] are non-Drift bookkeeping tables to exclude
  /// (defaults to [defaultInternalTableNames]).
  ///
  /// The check is purely diagnostic: it suggests a `DROP TABLE` statement but
  /// never executes it. Dropping a table is destructive and must remain a
  /// human decision.
  ///
  /// Returns a map with:
  /// * `orphans` — list of findings (`table`, `severity`, `type`, `message`,
  ///   `suggestedSql`); empty on the healthy, fully-declared case.
  /// * `declaredSchemaAvailable` — whether a declared set was supplied.
  /// * `physicalTablesScanned` — count of physical tables enumerated.
  /// * `declaredTableCount` — size of the declared set (0 when unavailable).
  /// * `analyzedAt` — ISO 8601 timestamp.
  ///
  /// Pure function: no [ServerContext] dependency. Callers are responsible for
  /// error handling and logging.
  static Future<Map<String, dynamic>> getOrphanTablesResult(
    DriftDebugQuery query, {
    required Set<String>? declaredTableNames,
    Set<String> internalTableNames = defaultInternalTableNames,
  }) async {
    // Physical tables only: getTableNames queries sqlite_master with
    // type='table' and excludes sqlite_% bookkeeping tables.
    final physicalTables = await ServerUtils.getTableNames(query);

    final orphans = <Map<String, dynamic>>[];

    // Only compare when the declared set is available. Absent it, every
    // physical table would look like an orphan — so the check stays silent
    // (report-only/opt-in) rather than emit guaranteed false positives.
    if (declaredTableNames != null) {
      // SQLite identifiers are case-insensitive for matching, and Drift's
      // actualTableName casing may differ from the stored sqlite_master
      // casing (e.g. camelCase class vs snake_case table). Compare on a
      // lowercased view of both sides; report the physical name as stored.
      final declaredLower = declaredTableNames
          .map((t) => t.toLowerCase())
          .toSet();
      final internalLower = internalTableNames
          .map((t) => t.toLowerCase())
          .toSet();

      for (final tableName in physicalTables) {
        final lower = tableName.toLowerCase();

        // Skip declared and known-internal tables — neither is an orphan.
        if (declaredLower.contains(lower) || internalLower.contains(lower)) {
          continue;
        }

        orphans.add(<String, dynamic>{
          'table': tableName,
          'severity': 'warning',
          'type': orphanFindingType,
          'message':
              "Orphan physical table '$tableName' — present in the "
              'database but not declared in the Drift schema. Left by a '
              'prior migration? Drop it or restore its definition.',
          // Report-only: suggested remedy the developer can run by hand.
          // The advisor never executes DDL on its own — dropping a table is
          // destructive and stays a human decision.
          'suggestedSql': 'DROP TABLE "$tableName";',
        });
      }
    }

    return <String, dynamic>{
      'orphans': orphans,
      'declaredSchemaAvailable': declaredTableNames != null,
      'physicalTablesScanned': physicalTables.length,
      'declaredTableCount': declaredTableNames?.length ?? 0,
      'analyzedAt': DateTime.now().toUtc().toIso8601String(),
    };
  }
}
