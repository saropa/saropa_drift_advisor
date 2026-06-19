// Unit tests for OrphanTableDetector — physical-table orphan detection.
//
// Exercises getOrphanTablesResult() with inline query callbacks: the report-
// only behavior when no declared set is supplied, positive detection of a
// physical table absent from the schema, the healthy no-false-positive case,
// internal-table exclusion (android_metadata), case-insensitive matching, and
// the finding shape (table name, cause/remedy message, suggested DROP).

import 'package:saropa_drift_advisor/src/server/orphan_table_detector.dart';
import 'package:saropa_drift_advisor/src/server/server_typedefs.dart';
import 'package:test/test.dart';

/// Builds a query callback that answers the sqlite_master table-names query
/// (the only query the detector issues) with [physicalTables].
DriftDebugQuery _physicalTablesQuery(List<String> physicalTables) {
  return (String sql) async {
    // The orphan check calls getTableNames(includeViews: false), which runs:
    //   SELECT name FROM sqlite_master WHERE type='table'
    //   AND name NOT LIKE 'sqlite_%' ORDER BY name
    if (sql.contains("type='table'") && sql.contains('ORDER BY name')) {
      return physicalTables
          .map((name) => <String, dynamic>{'name': name})
          .toList();
    }
    return <Map<String, dynamic>>[];
  };
}

void main() {
  group('OrphanTableDetector.getOrphanTablesResult', () {
    test(
      'report-only: no declared set → no orphans, flag unavailable',
      () async {
        // Even with physical tables present, a null declared set must produce
        // zero findings — the advisor cannot tell orphans from real tables.
        final result = await OrphanTableDetector.getOrphanTablesResult(
          _physicalTablesQuery(['users', 'posts', 'leftover_v33']),
          declaredTableNames: null,
        );

        expect(result['orphans'] as List, isEmpty);
        expect(result['declaredSchemaAvailable'], isFalse);
        expect(result['physicalTablesScanned'], 3);
        expect(result['declaredTableCount'], 0);
        expect(DateTime.tryParse(result['analyzedAt'] as String), isNotNull);
      },
    );

    test('flags a physical table absent from the declared schema', () async {
      final result = await OrphanTableDetector.getOrphanTablesResult(
        _physicalTablesQuery(['users', 'posts', 'leftover_v33']),
        declaredTableNames: {'users', 'posts'},
      );

      final orphans = result['orphans'] as List;
      expect(orphans, hasLength(1));
      final orphan = orphans.single as Map<String, dynamic>;
      expect(orphan['table'], 'leftover_v33');
      expect(orphan['severity'], 'warning');
      expect(orphan['type'], OrphanTableDetector.orphanFindingType);
      // Names the exact table + cause + remedy.
      expect(orphan['message'], contains('leftover_v33'));
      expect(orphan['message'], contains('not declared in the Drift schema'));
      expect(orphan['message'], contains('prior migration'));
      // Report-only suggested remedy — never auto-executed.
      expect(orphan['suggestedSql'], 'DROP TABLE "leftover_v33";');
      expect(result['declaredSchemaAvailable'], isTrue);
      expect(result['declaredTableCount'], 2);
    });

    test('healthy fully-declared schema → zero orphans', () async {
      final result = await OrphanTableDetector.getOrphanTablesResult(
        _physicalTablesQuery(['users', 'posts', 'comments']),
        declaredTableNames: {'users', 'posts', 'comments'},
      );

      expect(result['orphans'] as List, isEmpty);
      expect(result['declaredSchemaAvailable'], isTrue);
    });

    test('does not flag android_metadata internal table', () async {
      // android_metadata is created by Android's SQLiteOpenHelper, never by
      // Drift — it would be a guaranteed false positive without the default
      // internal-table exclusion.
      final result = await OrphanTableDetector.getOrphanTablesResult(
        _physicalTablesQuery(['users', 'android_metadata']),
        declaredTableNames: {'users'},
      );

      expect(result['orphans'] as List, isEmpty);
    });

    test('matches declared names case-insensitively', () async {
      // Drift actualTableName casing may differ from the stored sqlite_master
      // casing; SQLite identifiers match case-insensitively.
      final result = await OrphanTableDetector.getOrphanTablesResult(
        _physicalTablesQuery(['users']),
        declaredTableNames: {'Users'},
      );

      expect(result['orphans'] as List, isEmpty);
    });

    test('reports the physical name as stored, not lowercased', () async {
      final result = await OrphanTableDetector.getOrphanTablesResult(
        _physicalTablesQuery(['LegacyCache']),
        declaredTableNames: {'users'},
      );

      final orphan = (result['orphans'] as List).single as Map<String, dynamic>;
      expect(orphan['table'], 'LegacyCache');
      expect(orphan['suggestedSql'], 'DROP TABLE "LegacyCache";');
    });

    test('custom internalTableNames are excluded too', () async {
      final result = await OrphanTableDetector.getOrphanTablesResult(
        _physicalTablesQuery(['users', 'my_meta']),
        declaredTableNames: {'users'},
        internalTableNames: {'my_meta'},
      );

      expect(result['orphans'] as List, isEmpty);
    });

    test('empty database → zero orphans even with declared set', () async {
      final result = await OrphanTableDetector.getOrphanTablesResult(
        _physicalTablesQuery(<String>[]),
        declaredTableNames: {'users', 'posts'},
      );

      expect(result['orphans'] as List, isEmpty);
      expect(result['physicalTablesScanned'], 0);
    });
  });
}
