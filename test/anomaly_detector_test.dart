// Unit tests for AnomalyDetector — pure static anomaly detection logic.
//
// Tests getAnomaliesResult() with inline query callbacks to exercise
// null detection, empty string detection, numeric outlier detection,
// orphaned FK detection, duplicate row detection, severity sorting,
// and edge cases.
//
// Common PRAGMA patterns (table names, table_info, foreign_key_list,
// COUNT(*)) are delegated to the shared mockQueryWithTables() helper.
// Anomaly-specific SQL patterns (NULL counts, empty strings, numeric
// stats, orphan detection, DISTINCT counts) are handled by the local
// _anomalyQuery() wrapper.

import 'package:saropa_drift_advisor/src/server/anomaly_detector.dart';
import 'package:test/test.dart';

import 'helpers/test_helpers.dart';

void main() {
  group('AnomalyDetector', () {
    group('getAnomaliesResult', () {
      test('empty database returns empty anomalies', () async {
        final result = await AnomalyDetector.getAnomaliesResult(
          (sql) async => <Map<String, dynamic>>[],
        );

        expect(result['anomalies'] as List, isEmpty);
        expect(result['tablesScanned'], 0);
        expect(result['analyzedAt'], isNotNull);
      });

      test('analyzedAt field is an ISO 8601 string', () async {
        final result = await AnomalyDetector.getAnomaliesResult(
          (sql) async => <Map<String, dynamic>>[],
        );

        final analyzedAt = result['analyzedAt'] as String;
        // Should parse without throwing.
        expect(DateTime.tryParse(analyzedAt), isNotNull);
      });

      test('tablesScanned matches number of tables', () async {
        final result = await AnomalyDetector.getAnomaliesResult(
          _anomalyQuery(
            tableColumns: {
              'a': [_col('id', 'INTEGER', pk: 1)],
              'b': [_col('id', 'INTEGER', pk: 1)],
              'c': [_col('id', 'INTEGER', pk: 1)],
            },
            counts: {'a': 0, 'b': 0, 'c': 0},
          ),
        );

        expect(result['tablesScanned'], 3);
      });

      // -------------------------------------------------------
      // Null value detection
      //
      // Only NOT NULL columns should be scanned for NULLs.
      // NULLs in nullable columns are expected by design and
      // must NOT produce anomalies (false positives).
      // -------------------------------------------------------

      test('detects NULLs in NOT NULL column (constraint violation)', () async {
        final result = await AnomalyDetector.getAnomaliesResult(
          _anomalyQuery(
            tableColumns: {
              'items': [
                _col('id', 'INTEGER', pk: 1),
                // notnull: 1 — NULLs here are a real problem.
                _col('name', 'TEXT', notnull: 1),
              ],
            },
            counts: {'items': 10},
            nullCounts: {'items.name': 3},
          ),
        );

        final anomalies = result['anomalies'] as List;
        final nullAnomaly = anomalies.firstWhere(
          (a) => (a as Map)['type'] == 'null_values',
        );
        expect(nullAnomaly, isNotNull);
        expect(nullAnomaly['column'], 'name');
        expect(nullAnomaly['count'], 3);
        // NULLs in NOT NULL columns are always errors.
        expect(nullAnomaly['severity'], 'error');
      });

      test(
        'null anomaly severity is always error for NOT NULL columns',
        () async {
          final result = await AnomalyDetector.getAnomaliesResult(
            _anomalyQuery(
              tableColumns: {
                'items': [
                  _col('id', 'INTEGER', pk: 1),
                  _col('note', 'TEXT', notnull: 1),
                ],
              },
              counts: {'items': 10},
              // Even a small percentage is still an error —
              // the column forbids NULLs entirely.
              nullCounts: {'items.note': 1},
            ),
          );

          final anomalies = result['anomalies'] as List;
          final nullAnomaly =
              anomalies.firstWhere((a) => (a as Map)['type'] == 'null_values')
                  as Map;
          expect(nullAnomaly['severity'], 'error');
        },
      );

      test(
        'skips null detection for nullable columns (no false positives)',
        () async {
          final result = await AnomalyDetector.getAnomaliesResult(
            _anomalyQuery(
              tableColumns: {
                'items': [
                  _col('id', 'INTEGER', pk: 1),
                  // notnull: 0 — NULLs are expected here.
                  _col('description', 'TEXT', notnull: 0),
                ],
              },
              counts: {'items': 10},
              // Even 100% NULLs should not be flagged — the
              // developer declared this column as nullable.
              nullCounts: {'items.description': 10},
            ),
          );

          final anomalies = result['anomalies'] as List;
          final nullAnomalies = anomalies
              .where((a) => (a as Map)['type'] == 'null_values')
              .toList();
          expect(nullAnomalies, isEmpty);
        },
      );

      test('no anomaly when NOT NULL column has zero NULLs', () async {
        final result = await AnomalyDetector.getAnomaliesResult(
          _anomalyQuery(
            tableColumns: {
              'items': [
                _col('id', 'INTEGER', pk: 1),
                _col('name', 'TEXT', notnull: 1),
              ],
            },
            counts: {'items': 5},
            // Explicitly zero nulls — constraint is intact.
            nullCounts: {'items.name': 0},
          ),
        );

        final anomalies = result['anomalies'] as List;
        final nullAnomalies = anomalies
            .where((a) => (a as Map)['type'] == 'null_values')
            .toList();
        expect(nullAnomalies, isEmpty);
      });

      // -------------------------------------------------------
      // Empty string detection
      // -------------------------------------------------------

      test('detects empty strings in TEXT columns', () async {
        final result = await AnomalyDetector.getAnomaliesResult(
          _anomalyQuery(
            tableColumns: {
              'items': [_col('id', 'INTEGER', pk: 1), _col('title', 'TEXT')],
            },
            counts: {'items': 10},
            emptyCounts: {'items.title': 4},
          ),
        );

        final anomalies = (result['anomalies'] as List)
            .cast<Map<String, dynamic>>();
        final emptyAnomaly = anomalies
            .where((a) => a['type'] == 'empty_strings')
            .firstOrNull;
        expect(emptyAnomaly, isNotNull);
        expect(emptyAnomaly!['severity'], 'warning');
        expect(emptyAnomaly['count'], 4);
      });

      test('skips empty string check for non-text columns', () async {
        final result = await AnomalyDetector.getAnomaliesResult(
          _anomalyQuery(
            tableColumns: {
              'items': [_col('id', 'INTEGER', pk: 1), _col('price', 'REAL')],
            },
            counts: {'items': 5},
          ),
        );

        final anomalies = result['anomalies'] as List;
        final emptyAnomalies = anomalies
            .where((a) => (a as Map)['type'] == 'empty_strings')
            .toList();
        expect(emptyAnomalies, isEmpty);
      });

      // -------------------------------------------------------
      // Numeric outlier detection
      // -------------------------------------------------------

      test('detects outlier when max > 10x average', () async {
        final result = await AnomalyDetector.getAnomaliesResult(
          _anomalyQuery(
            tableColumns: {
              'items': [_col('id', 'INTEGER', pk: 1), _col('price', 'REAL')],
            },
            counts: {'items': 5},
            // avg=10, min=5, max=150 → max (150) > avg*10 (100).
            numericStats: {
              'items.price': {
                'avg_val': 10.0,
                'min_val': 5.0,
                'max_val': 150.0,
              },
            },
          ),
        );

        final anomalies = (result['anomalies'] as List)
            .cast<Map<String, dynamic>>();
        final outlier = anomalies
            .where((a) => a['type'] == 'potential_outlier')
            .firstOrNull;
        expect(outlier, isNotNull);
        expect(outlier!['severity'], 'info');
      });

      test('no outlier when range is within 10x average', () async {
        final result = await AnomalyDetector.getAnomaliesResult(
          _anomalyQuery(
            tableColumns: {
              'items': [_col('id', 'INTEGER', pk: 1), _col('price', 'REAL')],
            },
            counts: {'items': 5},
            // avg=10, min=5, max=50 → max (50) < avg*10 (100).
            numericStats: {
              'items.price': {'avg_val': 10.0, 'min_val': 5.0, 'max_val': 50.0},
            },
          ),
        );

        final anomalies = result['anomalies'] as List;
        final outliers = anomalies
            .where((a) => (a as Map)['type'] == 'potential_outlier')
            .toList();
        expect(outliers, isEmpty);
      });

      test('skips outlier detection when avg is 0', () async {
        final result = await AnomalyDetector.getAnomaliesResult(
          _anomalyQuery(
            tableColumns: {
              'items': [_col('id', 'INTEGER', pk: 1), _col('score', 'INTEGER')],
            },
            counts: {'items': 5},
            numericStats: {
              'items.score': {'avg_val': 0.0, 'min_val': 0.0, 'max_val': 0.0},
            },
          ),
        );

        final anomalies = result['anomalies'] as List;
        final outliers = anomalies
            .where((a) => (a as Map)['type'] == 'potential_outlier')
            .toList();
        expect(outliers, isEmpty);
      });

      test(
        'skips outlier detection for BOOLEAN columns (type-based guard)',
        () async {
          // Boolean columns with skewed distributions (e.g., 9% true)
          // should not trigger the 10× heuristic — the distribution
          // is a valid data pattern, not an anomaly.
          final result = await AnomalyDetector.getAnomaliesResult(
            _anomalyQuery(
              tableColumns: {
                'public_figures': [
                  _col('id', 'INTEGER', pk: 1),
                  _col('is_nickname_only', 'BOOLEAN'),
                ],
              },
              counts: {'public_figures': 100},
              // avg=0.09, min=0, max=1 → would fire without the guard.
              numericStats: {
                'public_figures.is_nickname_only': {
                  'avg_val': 0.09,
                  'min_val': 0.0,
                  'max_val': 1.0,
                },
              },
            ),
          );

          final anomalies = result['anomalies'] as List;
          final outliers = anomalies
              .where((a) => (a as Map)['type'] == 'potential_outlier')
              .toList();
          expect(
            outliers,
            isEmpty,
            reason: 'BOOLEAN columns should be excluded from outlier detection',
          );
        },
      );

      test(
        'skips outlier detection for INTEGER columns with binary domain',
        () async {
          // Drift compiles BoolColumn to INTEGER in SQLite, so
          // boolean flags may have type INTEGER. The binary-domain
          // guard (min == 0 && max == 1) catches these.
          final result = await AnomalyDetector.getAnomaliesResult(
            _anomalyQuery(
              tableColumns: {
                'public_figures': [
                  _col('id', 'INTEGER', pk: 1),
                  _col('is_nickname_only', 'INTEGER'),
                ],
              },
              counts: {'public_figures': 100},
              numericStats: {
                'public_figures.is_nickname_only': {
                  'avg_val': 0.09,
                  'min_val': 0.0,
                  'max_val': 1.0,
                },
              },
            ),
          );

          final anomalies = result['anomalies'] as List;
          final outliers = anomalies
              .where((a) => (a as Map)['type'] == 'potential_outlier')
              .toList();
          expect(
            outliers,
            isEmpty,
            reason:
                'INTEGER columns with binary domain (0–1) should be excluded '
                'from outlier detection',
          );
        },
      );

      test('skips outlier detection for non-numeric columns', () async {
        final result = await AnomalyDetector.getAnomaliesResult(
          _anomalyQuery(
            tableColumns: {
              'items': [_col('id', 'INTEGER', pk: 1), _col('name', 'TEXT')],
            },
            counts: {'items': 5},
          ),
        );

        final anomalies = result['anomalies'] as List;
        final outliers = anomalies
            .where((a) => (a as Map)['type'] == 'potential_outlier')
            .toList();
        expect(outliers, isEmpty);
      });

      // -------------------------------------------------------
      // Orphaned FK detection
      // -------------------------------------------------------

      test('detects orphaned FK references', () async {
        final result = await AnomalyDetector.getAnomaliesResult(
          _anomalyQuery(
            tableColumns: {
              'orders': [
                _col('id', 'INTEGER', pk: 1),
                _col('user_id', 'INTEGER'),
              ],
              'users': [_col('id', 'INTEGER', pk: 1)],
            },
            counts: {'orders': 5, 'users': 3},
            tableForeignKeys: {
              'orders': [
                {'from': 'user_id', 'table': 'users', 'to': 'id'},
              ],
            },
            orphanCounts: {'orders.user_id->users.id': 2},
          ),
        );

        final anomalies = (result['anomalies'] as List)
            .cast<Map<String, dynamic>>();
        final orphan = anomalies
            .where((a) => a['type'] == 'orphaned_fk')
            .firstOrNull;
        expect(orphan, isNotNull);
        expect(orphan!['severity'], 'error');
        expect(orphan['count'], 2);
      });

      test('no anomaly when all FKs reference valid rows', () async {
        final result = await AnomalyDetector.getAnomaliesResult(
          _anomalyQuery(
            tableColumns: {
              'orders': [
                _col('id', 'INTEGER', pk: 1),
                _col('user_id', 'INTEGER'),
              ],
              'users': [_col('id', 'INTEGER', pk: 1)],
            },
            counts: {'orders': 5, 'users': 3},
            tableForeignKeys: {
              'orders': [
                {'from': 'user_id', 'table': 'users', 'to': 'id'},
              ],
            },
            // Zero orphans.
            orphanCounts: {'orders.user_id->users.id': 0},
          ),
        );

        final anomalies = result['anomalies'] as List;
        final orphans = anomalies
            .where((a) => (a as Map)['type'] == 'orphaned_fk')
            .toList();
        expect(orphans, isEmpty);
      });

      test('skips FK check when referenced table not in schema', () async {
        final result = await AnomalyDetector.getAnomaliesResult(
          _anomalyQuery(
            tableColumns: {
              'orders': [
                _col('id', 'INTEGER', pk: 1),
                _col('user_id', 'INTEGER'),
              ],
            },
            // 'users' not in tables list → FK check should be skipped.
            counts: {'orders': 5},
            tableForeignKeys: {
              'orders': [
                {'from': 'user_id', 'table': 'users', 'to': 'id'},
              ],
            },
          ),
        );

        final anomalies = result['anomalies'] as List;
        final orphans = anomalies
            .where((a) => (a as Map)['type'] == 'orphaned_fk')
            .toList();
        expect(orphans, isEmpty);
      });

      // -------------------------------------------------------
      // Duplicate row detection
      // -------------------------------------------------------

      test('detects duplicate rows', () async {
        final result = await AnomalyDetector.getAnomaliesResult(
          _anomalyQuery(
            tableColumns: {
              'items': [_col('id', 'INTEGER', pk: 1), _col('name', 'TEXT')],
            },
            // 10 total rows but only 8 distinct → 2 duplicates.
            counts: {'items': 10},
            distinctCounts: {'items': 8},
          ),
        );

        final anomalies = (result['anomalies'] as List)
            .cast<Map<String, dynamic>>();
        final dupAnomaly = anomalies
            .where((a) => a['type'] == 'duplicate_rows')
            .firstOrNull;
        expect(dupAnomaly, isNotNull);
        expect(dupAnomaly!['severity'], 'warning');
        expect(dupAnomaly['count'], 2);
      });

      test('no anomaly when all rows are distinct', () async {
        final result = await AnomalyDetector.getAnomaliesResult(
          _anomalyQuery(
            tableColumns: {
              'items': [_col('id', 'INTEGER', pk: 1), _col('name', 'TEXT')],
            },
            counts: {'items': 5},
            distinctCounts: {'items': 5},
          ),
        );

        final anomalies = result['anomalies'] as List;
        final dups = anomalies
            .where((a) => (a as Map)['type'] == 'duplicate_rows')
            .toList();
        expect(dups, isEmpty);
      });

      // -------------------------------------------------------
      // Severity sorting
      // -------------------------------------------------------

      test('anomalies sorted by severity: error, warning, info', () async {
        // Produce anomalies of all three severities:
        // - orphaned FK (error)
        // - empty strings (warning)
        // - numeric outlier (info)
        final result = await AnomalyDetector.getAnomaliesResult(
          _anomalyQuery(
            tableColumns: {
              'items': [
                _col('id', 'INTEGER', pk: 1),
                _col('title', 'TEXT'),
                _col('price', 'REAL'),
                _col('cat_id', 'INTEGER'),
              ],
              'categories': [_col('id', 'INTEGER', pk: 1)],
            },
            counts: {'items': 10, 'categories': 3},
            // warning: 2 empty strings.
            emptyCounts: {'items.title': 2},
            // info: numeric outlier (max > 10× avg).
            numericStats: {
              'items.price': {
                'avg_val': 10.0,
                'min_val': 5.0,
                'max_val': 150.0,
              },
            },
            tableForeignKeys: {
              'items': [
                {'from': 'cat_id', 'table': 'categories', 'to': 'id'},
              ],
            },
            // error: 1 orphaned FK.
            orphanCounts: {'items.cat_id->categories.id': 1},
          ),
        );

        final anomalies = result['anomalies'] as List;
        expect(anomalies.length, greaterThanOrEqualTo(3));

        // Extract severity ordering.
        final severities = anomalies
            .map((a) => (a as Map)['severity'])
            .toList();

        // Assert all three severities are present (no silent skip).
        final firstError = severities.indexOf('error');
        final firstWarning = severities.indexOf('warning');
        final firstInfo = severities.indexOf('info');

        expect(
          firstError,
          greaterThanOrEqualTo(0),
          reason: 'Expected at least one error anomaly',
        );
        expect(
          firstWarning,
          greaterThanOrEqualTo(0),
          reason: 'Expected at least one warning anomaly',
        );
        expect(
          firstInfo,
          greaterThanOrEqualTo(0),
          reason: 'Expected at least one info anomaly',
        );

        // error must appear before warning, which must appear before info.
        expect(firstError, lessThan(firstWarning));
        expect(firstWarning, lessThan(firstInfo));
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/// Shorthand to create a column definition map.
Map<String, dynamic> _col(
  String name,
  String type, {
  int pk = 0,
  int notnull = 0,
}) => {'name': name, 'type': type, 'pk': pk, 'notnull': notnull};

/// Creates a query callback for [AnomalyDetector] tests.
///
/// Delegates common patterns (table names, PRAGMA table_info,
/// PRAGMA foreign_key_list, regular COUNT(*)) to [mockQueryWithTables].
/// Adds anomaly-specific handlers for NULL count, empty string count,
/// numeric stats (AVG/MIN/MAX), LEFT JOIN orphan, and DISTINCT count
/// queries.
Future<List<Map<String, dynamic>>> Function(String sql) _anomalyQuery({
  required Map<String, List<Map<String, dynamic>>> tableColumns,
  Map<String, int>? counts,
  Map<String, int>? nullCounts,
  Map<String, int>? emptyCounts,
  Map<String, Map<String, double>>? numericStats,
  Map<String, List<Map<String, dynamic>>>? tableForeignKeys,
  Map<String, int>? orphanCounts,
  Map<String, int>? distinctCounts,
}) {
  // Base handler for common PRAGMA patterns (table names, table_info,
  // foreign_key_list, COUNT(*)).
  final baseQuery = mockQueryWithTables(
    tableColumns: tableColumns,
    tableForeignKeys: tableForeignKeys,
    tableCounts: counts,
  );

  return (String sql) async {
    // LEFT JOIN orphan detection query — must be checked before
    // the generic "IS NULL" handler to avoid collision, since
    // orphan queries also contain COUNT(*) and IS NULL.
    if (sql.contains('LEFT JOIN') && sql.contains('IS NULL')) {
      if (orphanCounts != null) {
        for (final entry in orphanCounts.entries) {
          // Key format: "table.col->refTable.refCol".
          final parts = entry.key.split('->');
          final fromParts = parts[0].split('.');
          final toParts = parts[1].split('.');
          if (sql.contains('"${fromParts[0]}"') &&
              sql.contains('"${toParts[0]}"')) {
            return [
              <String, dynamic>{'c': entry.value},
            ];
          }
        }
      }
      return [
        <String, dynamic>{'c': 0},
      ];
    }

    // NULL count queries (WHERE "col" IS NULL) — excludes LEFT JOIN
    // queries which are handled above.
    if (sql.contains('IS NULL') &&
        sql.contains('COUNT(*)') &&
        !sql.contains('LEFT JOIN')) {
      if (nullCounts != null) {
        for (final entry in nullCounts.entries) {
          // Key format: "table.column".
          final parts = entry.key.split('.');
          if (sql.contains('"${parts[0]}"') &&
              sql.contains('"${parts[1]}" IS NULL')) {
            return [
              <String, dynamic>{'c': entry.value},
            ];
          }
        }
      }
      return [
        <String, dynamic>{'c': 0},
      ];
    }

    // Empty string count queries (WHERE "col" = '').
    if (sql.contains("= ''") && sql.contains('COUNT(*)')) {
      if (emptyCounts != null) {
        for (final entry in emptyCounts.entries) {
          final parts = entry.key.split('.');
          if (sql.contains('"${parts[0]}"') && sql.contains('"${parts[1]}"')) {
            return [
              <String, dynamic>{'c': entry.value},
            ];
          }
        }
      }
      return [
        <String, dynamic>{'c': 0},
      ];
    }

    // DISTINCT count queries (SELECT COUNT(*) ... SELECT DISTINCT *).
    if (sql.contains('SELECT DISTINCT *')) {
      if (distinctCounts != null) {
        for (final entry in distinctCounts.entries) {
          if (sql.contains('"${entry.key}"')) {
            return [
              <String, dynamic>{'c': entry.value},
            ];
          }
        }
      }
      // Default: same as total count (no duplicates).
      if (counts != null) {
        for (final entry in counts.entries) {
          if (sql.contains('"${entry.key}"')) {
            return [
              <String, dynamic>{'c': entry.value},
            ];
          }
        }
      }
      return [
        <String, dynamic>{'c': 0},
      ];
    }

    // AVG/MIN/MAX numeric stats queries.
    if (sql.contains('AVG(') && sql.contains('MIN(') && sql.contains('MAX(')) {
      if (numericStats != null) {
        for (final entry in numericStats.entries) {
          final parts = entry.key.split('.');
          if (sql.contains('"${parts[0]}"') && sql.contains('"${parts[1]}"')) {
            return [entry.value];
          }
        }
      }
      return <Map<String, dynamic>>[];
    }

    // Fall through to shared helper for common patterns
    // (table names, PRAGMA table_info, foreign_key_list, COUNT(*)).
    return baseQuery(sql);
  };
}
