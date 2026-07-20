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
import 'package:saropa_drift_advisor/src/server/server_types.dart';
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

      test('detects empty strings in NOT NULL TEXT columns', () async {
        final result = await AnomalyDetector.getAnomaliesResult(
          _anomalyQuery(
            tableColumns: {
              'items': [
                _col('id', 'INTEGER', pk: 1),
                // notnull: 1 — empty strings here suggest
                // placeholder data instead of real values.
                _col('title', 'TEXT', notnull: 1),
              ],
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

      test(
        'skips empty string check for nullable TEXT columns (no false positives)',
        () async {
          // Nullable text columns accept missing/absent data by
          // design — empty strings are a valid choice, not anomalies.
          final result = await AnomalyDetector.getAnomaliesResult(
            _anomalyQuery(
              tableColumns: {
                'contacts': [
                  _col('id', 'INTEGER', pk: 1),
                  // notnull: 0 (default) — column is nullable.
                  _col('given_name_phonetic', 'TEXT'),
                ],
              },
              counts: {'contacts': 400},
              emptyCounts: {'contacts.given_name_phonetic': 345},
            ),
          );

          final anomalies = result['anomalies'] as List;
          final emptyAnomalies = anomalies
              .where((a) => (a as Map)['type'] == 'empty_strings')
              .toList();
          expect(
            emptyAnomalies,
            isEmpty,
            reason:
                'Nullable text columns should not trigger empty string warnings',
          );
        },
      );

      test(
        'skips empty string check when column default is empty string',
        () async {
          // Columns with withDefault(const Constant('')) produce
          // empty strings by design — flagging them is a false
          // positive (bugs/empty_string_default_false_positive.md).
          final result = await AnomalyDetector.getAnomaliesResult(
            _anomalyQuery(
              tableColumns: {
                'tv_listings': [
                  _col('id', 'INTEGER', pk: 1),
                  // NOT NULL text column whose default is ''.
                  // SQLite PRAGMA table_info returns "''" for
                  // DEFAULT '' columns.
                  _col('genres', 'TEXT', notnull: 1, dfltValue: "''"),
                ],
              },
              counts: {'tv_listings': 100},
              emptyCounts: {'tv_listings.genres': 84},
            ),
          );

          final anomalies = result['anomalies'] as List;
          final emptyAnomalies = anomalies
              .where((a) => (a as Map)['type'] == 'empty_strings')
              .toList();
          expect(
            emptyAnomalies,
            isEmpty,
            reason:
                'Empty strings matching the column default should not '
                'trigger anomaly warnings',
          );
        },
      );

      test(
        'still flags empty strings when column default is non-empty',
        () async {
          // A column with DEFAULT 'unknown' should still flag
          // empty strings — the default is not empty, so empties
          // are not the designed sentinel.
          final result = await AnomalyDetector.getAnomaliesResult(
            _anomalyQuery(
              tableColumns: {
                'items': [
                  _col('id', 'INTEGER', pk: 1),
                  _col('category', 'TEXT', notnull: 1, dfltValue: "'unknown'"),
                ],
              },
              counts: {'items': 50},
              emptyCounts: {'items.category': 7},
            ),
          );

          final anomalies = (result['anomalies'] as List)
              .cast<Map<String, dynamic>>();
          final emptyAnomaly = anomalies
              .where((a) => a['type'] == 'empty_strings')
              .firstOrNull;
          expect(
            emptyAnomaly,
            isNotNull,
            reason: 'Non-empty default columns should still flag empty strings',
          );
          expect(emptyAnomaly!['count'], 7);
        },
      );

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

      test('detects outlier when max > 3 sigma from mean', () async {
        final result = await AnomalyDetector.getAnomaliesResult(
          _anomalyQuery(
            tableColumns: {
              'items': [_col('id', 'INTEGER', pk: 1), _col('price', 'REAL')],
            },
            // n=50 satisfies the minimum sample size guard
            // (_minSampleSizeForOutliers = 30).
            counts: {'items': 50},
            // avg=10, min=5, max=150, variance=100 (stddev=10).
            // max deviation: |150 - 10| = 140 > 3×10 = 30 → flagged.
            // Log-scale check: all positive, log(5)=1.61, log(150)=5.01,
            // log(10)=2.30, logRange=3.40, logStddev=0.85,
            // logMaxDev=|5.01-2.30|=2.71 > 3×0.85=2.55 → still flagged.
            numericStats: {
              'items.price': {
                'avg_val': 10.0,
                'min_val': 5.0,
                'max_val': 150.0,
                'variance': 100.0,
                'cnt': 50,
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
        // Message should identify which end is the outlier
        // and how many σ from the mean.
        expect(outlier['message'], contains('max value'));
        expect(outlier['message'], contains('σ from mean'));
      });

      test('no outlier when range is within 3 sigma', () async {
        final result = await AnomalyDetector.getAnomaliesResult(
          _anomalyQuery(
            tableColumns: {
              'items': [_col('id', 'INTEGER', pk: 1), _col('price', 'REAL')],
            },
            counts: {'items': 5},
            // avg=10, min=5, max=50, variance=200 (stddev≈14.1).
            // max deviation: |50 - 10| = 40 < 3×14.1 = 42.4 → not flagged.
            numericStats: {
              'items.price': {
                'avg_val': 10.0,
                'min_val': 5.0,
                'max_val': 50.0,
                'variance': 200.0,
              },
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
        'skips outlier detection when all values identical (zero stddev)',
        () async {
          final result = await AnomalyDetector.getAnomaliesResult(
            _anomalyQuery(
              tableColumns: {
                'items': [
                  _col('id', 'INTEGER', pk: 1),
                  _col('score', 'INTEGER'),
                ],
              },
              counts: {'items': 5},
              // All values are 0 → variance=0, stddev=0 → skip.
              numericStats: {
                'items.score': {
                  'avg_val': 0.0,
                  'min_val': 0.0,
                  'max_val': 0.0,
                  'variance': 0.0,
                },
              },
            ),
          );

          final anomalies = result['anomalies'] as List;
          final outliers = anomalies
              .where((a) => (a as Map)['type'] == 'potential_outlier')
              .toList();
          expect(outliers, isEmpty);
        },
      );

      test(
        'skips outlier detection for BOOLEAN columns (type-based guard)',
        () async {
          // Boolean columns with skewed distributions (e.g., 9% true)
          // should not trigger outlier detection — the distribution
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

      // -------------------------------------------------------
      // False positive regression tests
      //
      // These tests verify that domain-aware heuristics
      // prevent anomaly warnings on columns where a wide
      // range is expected and correct.
      // -------------------------------------------------------

      test('no outlier for longitude columns (coordinate skip)', () async {
        // Longitude spans -180..180 for global cities —
        // the wide range is geographic reality, not an anomaly.
        final result = await AnomalyDetector.getAnomaliesResult(
          _anomalyQuery(
            tableColumns: {
              'country_cities': [
                _col('id', 'INTEGER', pk: 1),
                _col('longitude', 'REAL'),
              ],
            },
            counts: {'country_cities': 1000},
            numericStats: {
              'country_cities.longitude': {
                'avg_val': 13.20,
                'min_val': -175.2,
                'max_val': 179.216667,
                'variance': 10443.0,
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
          reason: 'Coordinate columns should be skipped by name pattern',
        );
      });

      test('no outlier for lat/lng/lon column name variants', () async {
        // All coordinate name variants should be skipped.
        for (final colName in ['lat', 'lng', 'lon', 'latitude', 'longitude']) {
          final result = await AnomalyDetector.getAnomaliesResult(
            _anomalyQuery(
              tableColumns: {
                'places': [_col('id', 'INTEGER', pk: 1), _col(colName, 'REAL')],
              },
              counts: {'places': 500},
              numericStats: {
                'places.$colName': {
                  'avg_val': 10.0,
                  'min_val': -170.0,
                  'max_val': 175.0,
                  'variance': 10000.0,
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
            reason: 'Column "$colName" should be skipped as coordinate',
          );
        }
      });

      test('no outlier for version columns (version skip)', () async {
        // Date-encoded version integers (YYYYMMDD format)
        // create legitimately large values.
        final result = await AnomalyDetector.getAnomaliesResult(
          _anomalyQuery(
            tableColumns: {
              'contacts': [
                _col('id', 'INTEGER', pk: 1),
                _col('version', 'INTEGER'),
              ],
            },
            counts: {'contacts': 1000},
            numericStats: {
              'contacts.version': {
                'avg_val': 74744.97,
                'min_val': 1.0,
                'max_val': 26010901.0,
                'variance': 6710000000000.0,
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
          reason: 'Version columns should be skipped by name pattern',
        );
      });

      test('no outlier for timestamp columns (created_at skip)', () async {
        // Unix timestamps spanning a year look like huge
        // ranges (~31M) but are normal time windows.
        //
        // The `last_*` / `lastModified` names are the
        // recency-skewed / tight-window case from
        // bugs/anomaly_false_positive_tight_timestamp_range.md
        // — a column rewritten on every edit where σ is
        // tiny and the newest write is always many σ
        // above the mean. Both snake_case (Drift's
        // default serialization) and camelCase (raw
        // schema) must be suppressed.
        for (final colName in [
          'created_at',
          'updated_at',
          'deleted_at',
          'modified_at',
          'creation_date',
          'update_time',
          'event_timestamp',
          'timestamp',
          'last_modified',
          'lastModified',
          'last_seen',
          'last_accessed',
          'last_used',
          'last_sync',
          'last_login',
          'last_activity',
        ]) {
          final result = await AnomalyDetector.getAnomaliesResult(
            _anomalyQuery(
              tableColumns: {
                'events': [
                  _col('id', 'INTEGER', pk: 1),
                  _col(colName, 'INTEGER'),
                ],
              },
              counts: {'events': 500},
              numericStats: {
                'events.$colName': {
                  'avg_val': 1738480941.76,
                  'min_val': 1735691375.0,
                  'max_val': 1767237956.0,
                  'variance': 8000000000000.0,
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
            reason: 'Timestamp column "$colName" should be skipped',
          );
        }
      });

      test('no outlier for sort order columns (sort_order skip)', () async {
        // Sort order columns use intentional large gaps
        // (e.g., 0–1251) for future insertion.
        for (final colName in [
          'sort_order',
          'display_order',
          'position',
          'rank',
          'ordering',
          'list_position',
          'tab_order',
        ]) {
          final result = await AnomalyDetector.getAnomaliesResult(
            _anomalyQuery(
              tableColumns: {
                'items': [
                  _col('id', 'INTEGER', pk: 1),
                  _col(colName, 'INTEGER'),
                ],
              },
              counts: {'items': 200},
              numericStats: {
                'items.$colName': {
                  'avg_val': 14.12,
                  'min_val': 0.0,
                  'max_val': 1251.0,
                  'variance': 25000.0,
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
            reason: 'Sort order column "$colName" should be skipped',
          );
        }
      });

      test('no outlier for year/founded columns (year skip)', () async {
        // Historical datasets span centuries — banks
        // founded 1472–2019 is legitimate, not an outlier.
        for (final colName in [
          'year',
          'founded_year',
          'founded',
          'birth_year',
        ]) {
          final result = await AnomalyDetector.getAnomaliesResult(
            _anomalyQuery(
              tableColumns: {
                'records': [
                  _col('id', 'INTEGER', pk: 1),
                  _col(colName, 'INTEGER'),
                ],
              },
              counts: {'records': 300},
              numericStats: {
                'records.$colName': {
                  'avg_val': 1956.01,
                  'min_val': 1472.0,
                  'max_val': 2019.0,
                  'variance': 2500.0,
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
            reason: 'Year column "$colName" should be skipped',
          );
        }
      });

      test(
        'no outlier for rating/score/percent columns (rating skip)',
        () async {
          // Rating and score columns are bounded by definition.
          // Skewed distributions are expected (e.g., TV ratings
          // cluster high), so values at the low end of the scale
          // are legitimate, not anomalies.
          // See bugs/anomaly_false_positive_valid_range.md.
          for (final colName in [
            'rating',
            'user_rating',
            'avg_score',
            'score',
            'percent_complete',
            'pct',
            'win_pct',
          ]) {
            final result = await AnomalyDetector.getAnomaliesResult(
              _anomalyQuery(
                tableColumns: {
                  'episodes': [
                    _col('id', 'INTEGER', pk: 1),
                    _col(colName, 'REAL'),
                  ],
                },
                counts: {'episodes': 200},
                // Simulates the bug report scenario: TV ratings on
                // a 1–10 scale with mean ~7.91, min 1.0. The 1.0
                // value is 6.4σ from the mean but is a valid rating.
                numericStats: {
                  'episodes.$colName': {
                    'avg_val': 7.91,
                    'min_val': 1.0,
                    'max_val': 10.0,
                    'variance': 1.51,
                    'cnt': 200,
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
                  'Rating/score column "$colName" should be skipped '
                  'from outlier detection',
            );
          }
        },
      );

      test(
        'no outlier for dimension columns (byte_size, width, height skip)',
        () async {
          // Dimensional columns naturally span orders of magnitude
          // (thumbnails vs full-resolution images). The bimodal
          // distribution is by design, not a defect.
          // See plans/history/2026.07/2026.07.20/BUG_outlier_false_positive_dimensions_and_physical_measurements.md.
          for (final colName in [
            'byte_size',
            'width',
            'height',
            'file_size',
            'content_length',
            'image_width',
            'pixel_height',
            'depth',
            'area',
            'volume',
            'duration',
            'item_count',
            'num_pixels',
            'bandwidth',
            'throughput',
            'latency',
            'network_latency',
            'max_throughput',
          ]) {
            final result = await AnomalyDetector.getAnomaliesResult(
              _anomalyQuery(
                tableColumns: {
                  'image_blur_metas': [
                    _col('id', 'INTEGER', pk: 1),
                    _col(colName, 'INTEGER'),
                  ],
                },
                counts: {'image_blur_metas': 226},
                numericStats: {
                  'image_blur_metas.$colName': {
                    'avg_val': 3797.21,
                    'min_val': 195.0,
                    'max_val': 147776.0,
                    'variance': 100000000.0,
                    'cnt': 226,
                  },
                },
              ),
            );

            final outliers = (result['anomalies'] as List)
                .where((a) => (a as Map)['type'] == 'potential_outlier')
                .toList();
            expect(
              outliers,
              isEmpty,
              reason:
                  'Dimension column "$colName" should be skipped '
                  'from outlier detection',
            );
          }
        },
      );

      test(
        'no outlier for physical measurement columns (weight, mass skip)',
        () async {
          // Physical measurement columns are bounded real-world
          // quantities where small populations are non-Gaussian.
          // See plans/history/2026.07/2026.07.20/BUG_outlier_false_positive_dimensions_and_physical_measurements.md.
          for (final colName in [
            'weight_kilograms',
            'mass',
            'distance',
            'speed',
            'velocity',
            'temperature',
            'pressure',
            'capacity',
            'body_weight',
            'net_weight',
            'top_speed',
            'max_distance',
          ]) {
            final result = await AnomalyDetector.getAnomaliesResult(
              _anomalyQuery(
                tableColumns: {
                  'characters': [
                    _col('id', 'INTEGER', pk: 1),
                    _col(colName, 'REAL'),
                  ],
                },
                counts: {'characters': 149},
                numericStats: {
                  'characters.$colName': {
                    'avg_val': 70.84,
                    'min_val': 40.0,
                    'max_val': 110.0,
                    'variance': 150.0,
                    'cnt': 149,
                  },
                },
              ),
            );

            final outliers = (result['anomalies'] as List)
                .where((a) => (a as Map)['type'] == 'potential_outlier')
                .toList();
            expect(
              outliers,
              isEmpty,
              reason:
                  'Physical measurement column "$colName" should be '
                  'skipped from outlier detection',
            );
          }
        },
      );

      test('no outlier for bounded-scale data (0–10 rating range)', () async {
        // Even without a rating-like column name, data that
        // fits within a known bounded scale (e.g., 0–10, 0–100)
        // should not trigger outlier detection. The bounded-
        // scale guard catches this regardless of column name.
        // See bugs/anomaly_false_positive_valid_range.md.
        final result = await AnomalyDetector.getAnomaliesResult(
          _anomalyQuery(
            tableColumns: {
              'reviews': [
                _col('id', 'INTEGER', pk: 1),
                _col('quality', 'REAL'),
              ],
            },
            counts: {'reviews': 100},
            // Range [1.0, 9.5] fits within the 0–10 scale.
            // Min of 1.0 is 5.1σ from mean — would be flagged
            // without the bounded-scale guard.
            numericStats: {
              'reviews.quality': {
                'avg_val': 7.5,
                'min_val': 1.0,
                'max_val': 9.5,
                'variance': 1.44,
                'cnt': 100,
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
              'Data within a 0–10 bounded scale should not trigger '
              'outlier detection',
        );
      });

      test(
        'no outlier for bounded-scale data (0–100 percentage range)',
        () async {
          // Percentage data [2.0, 98.0] fits within the 0–100
          // scale. Extreme values at scale boundaries are valid.
          final result = await AnomalyDetector.getAnomaliesResult(
            _anomalyQuery(
              tableColumns: {
                'stats': [
                  _col('id', 'INTEGER', pk: 1),
                  _col('completion', 'REAL'),
                ],
              },
              counts: {'stats': 500},
              numericStats: {
                'stats.completion': {
                  'avg_val': 82.3,
                  'min_val': 2.0,
                  'max_val': 98.0,
                  'variance': 25.0,
                  'cnt': 500,
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
                'Data within a 0–100 bounded scale should not trigger '
                'outlier detection',
          );
        },
      );

      test('still detects outlier when data exceeds bounded scales', () async {
        // Data range [5.0, 500.0] does not fit any known
        // bounded scale, so outlier detection should still fire.
        final result = await AnomalyDetector.getAnomaliesResult(
          _anomalyQuery(
            tableColumns: {
              'items': [_col('id', 'INTEGER', pk: 1), _col('amount', 'REAL')],
            },
            counts: {'items': 100},
            // max 500.0 is far beyond any bounded scale.
            // stddev=10, max deviation |500-50|=450 > 3×10=30.
            // Log check: log(5)=1.61, log(500)=6.21,
            // log(50)=3.91, logRange=4.60, logStddev=1.15,
            // logMaxDev=|6.21-3.91|=2.30 < 3×1.15=3.45 → passes log.
            // So we need stats where log also fails.
            numericStats: {
              'items.amount': {
                'avg_val': 10.0,
                'min_val': 5.0,
                'max_val': 150.0,
                'variance': 100.0,
                'cnt': 100,
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
          isNotEmpty,
          reason:
              'Data outside all bounded scales should still trigger '
              'outlier detection',
        );
      });

      test(
        'no outlier for log-normal distributions (log-scale fallback)',
        () async {
          // Engagement points [4, 337], avg 80.61, fail the LINEAR 3σ check but
          // are log-normal, so the log-scale check (now computed from the real
          // mean/variance of LN(x)) suppresses the flag:
          //   geometric mean of logs ≈ 4.0, log variance ≈ 1.21 (logStddev 1.1)
          //   logMaxDev=|ln(337)-4.0|=1.82 < 3×1.1=3.3 → suppressed
          //   logMinDev=|ln(4)-4.0|=2.61 < 3.3 → suppressed
          final result = await AnomalyDetector.getAnomaliesResult(
            _anomalyQuery(
              tableColumns: {
                'contacts': [
                  _col('id', 'INTEGER', pk: 1),
                  _col('points', 'INTEGER'),
                ],
              },
              counts: {'contacts': 100},
              numericStats: {
                'contacts.points': {
                  'avg_val': 80.61,
                  'min_val': 4.0,
                  'max_val': 337.0,
                  // stddev ≈ 50, so maxDev = |337-80.61| = 256
                  // > 3×50 = 150 → fails linear check.
                  'variance': 2500.0,
                  // Log-space stats (mean of LN(x), mean of LN(x)²): geometric
                  // mean ~e^4, variance 17.21-16=1.21 → logStddev 1.1.
                  'log_mean': 4.0,
                  'log_sqmean': 17.21,
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
                'Log-normal distributions should pass the log-scale fallback',
          );
        },
      );

      test(
        'no outlier for exchange rates with high natural variance',
        () async {
          // Multi-currency exchange rates legitimately span
          // several orders of magnitude (e.g., USD/EUR ~0.7
          // to USD/VND ~16000). The 3σ rule correctly sees
          // this as a wide distribution, not isolated outliers.
          //
          // Approximate uniform distribution over [0.7, 16801]:
          //   variance ≈ (16800)² / 12 ≈ 23,520,000
          //   stddev ≈ 4852
          //   avg ≈ 8400 (midpoint)
          //   max deviation: |16801 - 8400| = 8401 < 3×4852 = 14556
          //
          // Using the bug report's actual values:
          //   avg = 581.3 (skewed toward smaller currencies)
          //   but variance from the real distribution is still high.
          final result = await AnomalyDetector.getAnomaliesResult(
            _anomalyQuery(
              tableColumns: {
                'currency_rates': [
                  _col('id', 'INTEGER', pk: 1),
                  _col('exchange_rate', 'REAL'),
                ],
              },
              counts: {'currency_rates': 200},
              numericStats: {
                'currency_rates.exchange_rate': {
                  'avg_val': 581.30,
                  'min_val': 0.70581,
                  'max_val': 16801.0,
                  // Variance from a wide multi-currency distribution.
                  // stddev ≈ 5480, so max deviation |16801-581| = 16220
                  // vs threshold 3×5480 = 16440 → not flagged.
                  'variance': 30000000.0,
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
                'Exchange rates with high natural variance '
                'should not be flagged as outliers',
          );
        },
      );

      test('no outlier for identifier columns (external ID skip)', () async {
        // External IDs (API identifiers, foreign system keys)
        // are opaque — not drawn from a normal distribution.
        // Sigma-based outlier detection is meaningless for them.
        // See bugs/outlier_on_external_id_false_positive.md.
        for (final colName in [
          'tvmaze_id',
          'externalApiId',
          'stripe_key',
          'countryCode',
          'user_id',
          'tmdb_id',
        ]) {
          final result = await AnomalyDetector.getAnomaliesResult(
            _anomalyQuery(
              tableColumns: {
                'items': [
                  _col('id', 'INTEGER', pk: 1),
                  _col(colName, 'INTEGER'),
                ],
              },
              counts: {'items': 50},
              numericStats: {
                'items.$colName': {
                  'avg_val': 3576818.33,
                  'min_val': 3387744.0,
                  'max_val': 3595125.0,
                  'variance': 100000000000.0,
                  'cnt': 50,
                },
              },
            ),
          );

          final outliers = (result['anomalies'] as List)
              .where((a) => (a as Map)['type'] == 'potential_outlier')
              .toList();
          expect(
            outliers,
            isEmpty,
            reason:
                'Identifier column "$colName" should be excluded '
                'from outlier detection',
          );
        }
      });

      test('no outlier for primary key columns', () async {
        // Primary key columns (auto-increment) are sequential
        // by definition, not measurements — skip them.
        final result = await AnomalyDetector.getAnomaliesResult(
          _anomalyQuery(
            tableColumns: {
              'items': [
                // pk: 1 marks this as a primary key column.
                _col('item_num', 'INTEGER', pk: 1),
                _col('price', 'REAL'),
              ],
            },
            counts: {'items': 50},
            numericStats: {
              // Would trigger outlier if not skipped as PK.
              'items.item_num': {
                'avg_val': 25.0,
                'min_val': 1.0,
                'max_val': 999.0,
                'variance': 100.0,
                'cnt': 50,
              },
              'items.price': {
                'avg_val': 10.0,
                'min_val': 8.0,
                'max_val': 12.0,
                'variance': 2.0,
                'cnt': 50,
              },
            },
          ),
        );

        final outliers = (result['anomalies'] as List)
            .where((a) => (a as Map)['type'] == 'potential_outlier')
            .toList();
        expect(
          outliers,
          isEmpty,
          reason:
              'Primary key columns should be excluded from '
              'outlier detection',
        );
      });

      test('no outlier when sample size is below minimum (n < 30)', () async {
        // With fewer than 30 data points, the sample mean and
        // standard deviation are unreliable. A single extreme
        // value dominates the statistics, producing false
        // positives. The detector should skip small samples.
        final result = await AnomalyDetector.getAnomaliesResult(
          _anomalyQuery(
            tableColumns: {
              'items': [_col('id', 'INTEGER', pk: 1), _col('price', 'REAL')],
            },
            counts: {'items': 5},
            numericStats: {
              'items.price': {
                'avg_val': 10.0,
                'min_val': 5.0,
                'max_val': 150.0,
                'variance': 100.0,
                // Only 5 non-null values — below the 30 threshold.
                'cnt': 5,
              },
            },
          ),
        );

        final outliers = (result['anomalies'] as List)
            .where((a) => (a as Map)['type'] == 'potential_outlier')
            .toList();
        expect(
          outliers,
          isEmpty,
          reason:
              'Outlier detection should be skipped when '
              'sample size is below the minimum threshold',
        );
      });

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
      // Declared-relationship orphan detection (Feature 78)
      //
      // A host that links tables by a shared UUID column declares ZERO SQLite
      // FKs, so the PRAGMA is empty. The orphan check must consume the host's
      // declared manifest instead, and report those orphans as WARNINGS (an
      // unenforced convention link orphan is expected steady state, not
      // corruption).
      // -------------------------------------------------------

      test(
        'detects declared-relationship orphan as a warning (zero FKs)',
        () async {
          final result = await AnomalyDetector.getAnomaliesResult(
            _anomalyQuery(
              tableColumns: {
                'contact_points': [
                  _col('id', 'INTEGER', pk: 1),
                  _col('contact_saropa_u_u_i_d', 'TEXT'),
                ],
                'contacts': [
                  _col('id', 'INTEGER', pk: 1),
                  _col('contact_saropa_u_u_i_d', 'TEXT'),
                ],
              },
              counts: {'contact_points': 5, 'contacts': 3},
              // No PRAGMA foreign keys at all — host links by convention.
              orphanCounts: {
                'contact_points.contact_saropa_u_u_i_d->'
                        'contacts.contact_saropa_u_u_i_d':
                    1,
              },
            ),
            declaredRelationships: const [
              DeclaredRelationship(
                fromTable: 'contact_points',
                fromColumn: 'contact_saropa_u_u_i_d',
                toTable: 'contacts',
                toColumn: 'contact_saropa_u_u_i_d',
              ),
            ],
          );

          final anomalies = (result['anomalies'] as List)
              .cast<Map<String, dynamic>>();
          final orphan = anomalies
              .where((a) => a['type'] == 'orphaned_fk')
              .firstOrNull;
          expect(orphan, isNotNull);
          // Declared (unenforced) edge → warning, NOT error.
          expect(orphan!['severity'], 'warning');
          expect(orphan['count'], 1);
          expect(orphan['table'], 'contact_points');
          expect(orphan['column'], 'contact_saropa_u_u_i_d');
        },
      );

      test(
        'skips declared edge whose parent table is absent from schema',
        () async {
          final result = await AnomalyDetector.getAnomaliesResult(
            _anomalyQuery(
              tableColumns: {
                'contact_points': [
                  _col('id', 'INTEGER', pk: 1),
                  _col('contact_saropa_u_u_i_d', 'TEXT'),
                ],
                // 'contacts' table not in schema.
              },
              counts: {'contact_points': 5},
              orphanCounts: {
                'contact_points.contact_saropa_u_u_i_d->'
                        'contacts.contact_saropa_u_u_i_d':
                    9,
              },
            ),
            declaredRelationships: const [
              DeclaredRelationship(
                fromTable: 'contact_points',
                fromColumn: 'contact_saropa_u_u_i_d',
                toTable: 'contacts',
                toColumn: 'contact_saropa_u_u_i_d',
              ),
            ],
          );

          final orphans = (result['anomalies'] as List)
              .where((a) => (a as Map)['type'] == 'orphaned_fk')
              .toList();
          expect(orphans, isEmpty);
        },
      );

      test('ignores declared edge flagged orphanCheckable: false', () async {
        final result = await AnomalyDetector.getAnomaliesResult(
          _anomalyQuery(
            tableColumns: {
              'contacts': [
                _col('id', 'INTEGER', pk: 1),
                _col('group_uuids', 'TEXT'),
                _col('contact_saropa_u_u_i_d', 'TEXT'),
              ],
              'groups': [
                _col('id', 'INTEGER', pk: 1),
                _col('group_uuid', 'TEXT'),
              ],
            },
            counts: {'contacts': 5, 'groups': 3},
            orphanCounts: {
              // A scalar join would (wrongly) find orphans for the list_ref.
              'contacts.group_uuids->groups.group_uuid': 4,
            },
          ),
          declaredRelationships: const [
            // list_ref: a JSON array of UUIDs in one text cell — a scalar
            // LEFT JOIN is wrong, so it is excluded from the orphan check.
            DeclaredRelationship(
              fromTable: 'contacts',
              fromColumn: 'group_uuids',
              toTable: 'groups',
              toColumn: 'group_uuid',
              orphanCheckable: false,
            ),
          ],
        );

        final orphans = (result['anomalies'] as List)
            .where((a) => (a as Map)['type'] == 'orphaned_fk')
            .toList();
        expect(orphans, isEmpty);
      });

      test(
        'declared edge duplicating an enforced FK stays a single error',
        () async {
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
            // Same edge the host also declares — must NOT double-report or
            // downgrade the enforced FK's error severity.
            declaredRelationships: const [
              DeclaredRelationship(
                fromTable: 'orders',
                fromColumn: 'user_id',
                toTable: 'users',
                toColumn: 'id',
              ),
            ],
          );

          final orphans = (result['anomalies'] as List)
              .where((a) => (a as Map)['type'] == 'orphaned_fk')
              .toList();
          expect(orphans.length, 1);
          expect((orphans.first as Map)['severity'], 'error');
        },
      );

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
                // notnull: 1 so empty strings trigger a warning.
                _col('title', 'TEXT', notnull: 1),
                _col('price', 'REAL'),
                _col('cat_id', 'INTEGER'),
              ],
              'categories': [_col('id', 'INTEGER', pk: 1)],
            },
            // n=50 satisfies the minimum sample size guard.
            counts: {'items': 50, 'categories': 3},
            // warning: 2 empty strings.
            emptyCounts: {'items.title': 2},
            // info: numeric outlier (max > 3σ from mean).
            numericStats: {
              'items.price': {
                'avg_val': 10.0,
                'min_val': 5.0,
                'max_val': 150.0,
                'variance': 100.0,
                'cnt': 50,
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

      // -------------------------------------------------------
      // Server-side suppression (drift-advisor:ignore)
      // -------------------------------------------------------

      test(
        'suppression removes matching anomalies by table and column',
        () async {
          final result = await AnomalyDetector.getAnomaliesResult(
            _anomalyQuery(
              tableColumns: {
                'items': [_col('id', 'INTEGER', pk: 1), _col('price', 'REAL')],
              },
              counts: {'items': 50},
              numericStats: {
                'items.price': {
                  'avg_val': 10.0,
                  'min_val': 5.0,
                  'max_val': 150.0,
                  'variance': 100.0,
                  'cnt': 50,
                },
              },
            ),
            suppressions: const [
              AnomalySuppression(table: 'items', column: 'price'),
            ],
          );

          final outliers = (result['anomalies'] as List)
              .where((a) => (a as Map)['type'] == 'potential_outlier')
              .toList();
          expect(outliers, isEmpty);
        },
      );

      test('suppression with type filter only removes matching type', () async {
        final result = await AnomalyDetector.getAnomaliesResult(
          _anomalyQuery(
            tableColumns: {
              'items': [
                _col('id', 'INTEGER', pk: 1),
                _col('title', 'TEXT', notnull: 1),
                _col('price', 'REAL'),
              ],
            },
            counts: {'items': 50},
            emptyCounts: {'items.title': 3},
            numericStats: {
              'items.price': {
                'avg_val': 10.0,
                'min_val': 5.0,
                'max_val': 150.0,
                'variance': 100.0,
                'cnt': 50,
              },
            },
          ),
          suppressions: const [
            AnomalySuppression(table: 'items', type: 'potential_outlier'),
          ],
        );

        final anomalies = (result['anomalies'] as List)
            .cast<Map<String, dynamic>>();
        final outliers = anomalies.where(
          (a) => a['type'] == 'potential_outlier',
        );
        final empties = anomalies.where((a) => a['type'] == 'empty_strings');
        expect(outliers, isEmpty, reason: 'Outlier suppressed by type filter');
        expect(
          empties,
          isNotEmpty,
          reason: 'Empty strings NOT suppressed — different type',
        );
      });

      test(
        'wildcard table suppression removes anomalies from all tables',
        () async {
          final result = await AnomalyDetector.getAnomaliesResult(
            _anomalyQuery(
              tableColumns: {
                'items': [_col('id', 'INTEGER', pk: 1), _col('price', 'REAL')],
                'products': [
                  _col('id', 'INTEGER', pk: 1),
                  _col('price', 'REAL'),
                ],
              },
              counts: {'items': 50, 'products': 50},
              numericStats: {
                'items.price': {
                  'avg_val': 10.0,
                  'min_val': 5.0,
                  'max_val': 150.0,
                  'variance': 100.0,
                  'cnt': 50,
                },
                'products.price': {
                  'avg_val': 10.0,
                  'min_val': 5.0,
                  'max_val': 150.0,
                  'variance': 100.0,
                  'cnt': 50,
                },
              },
            ),
            suppressions: const [
              AnomalySuppression(table: '*', type: 'potential_outlier'),
            ],
          );

          final outliers = (result['anomalies'] as List)
              .where((a) => (a as Map)['type'] == 'potential_outlier')
              .toList();
          expect(
            outliers,
            isEmpty,
            reason: 'Wildcard table should suppress across all tables',
          );
        },
      );

      test('suppression does not remove non-matching anomalies', () async {
        final result = await AnomalyDetector.getAnomaliesResult(
          _anomalyQuery(
            tableColumns: {
              'items': [_col('id', 'INTEGER', pk: 1), _col('price', 'REAL')],
            },
            counts: {'items': 50},
            numericStats: {
              'items.price': {
                'avg_val': 10.0,
                'min_val': 5.0,
                'max_val': 150.0,
                'variance': 100.0,
                'cnt': 50,
              },
            },
          ),
          suppressions: const [
            AnomalySuppression(table: 'other_table', column: 'price'),
          ],
        );

        final outliers = (result['anomalies'] as List)
            .where((a) => (a as Map)['type'] == 'potential_outlier')
            .toList();
        expect(
          outliers,
          isNotEmpty,
          reason: 'Non-matching suppression should not remove anomalies',
        );
      });

      test('table-level suppression removes column-less anomalies', () async {
        final result = await AnomalyDetector.getAnomaliesResult(
          _anomalyQuery(
            tableColumns: {
              'items': [_col('id', 'INTEGER', pk: 1), _col('name', 'TEXT')],
            },
            counts: {'items': 10},
            distinctCounts: {'items': 8},
          ),
          suppressions: const [
            AnomalySuppression(table: 'items', type: 'duplicate_rows'),
          ],
        );

        final dups = (result['anomalies'] as List)
            .where((a) => (a as Map)['type'] == 'duplicate_rows')
            .toList();
        expect(
          dups,
          isEmpty,
          reason: 'Table-level duplicate_rows should be suppressible',
        );
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
  // SQLite PRAGMA table_info dflt_value — pass the raw
  // default expression (e.g., "''" for an empty string).
  Object? dfltValue,
}) => {
  'name': name,
  'type': type,
  'pk': pk,
  'notnull': notnull,
  'dflt_value': dfltValue,
};

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

    // Log-scale stats query (M2): SELECT AVG(LN(col)) AS log_mean,
    // AVG(LN(col)*LN(col)) AS log_sqmean. When the test supplies `log_mean` /
    // `log_sqmean` in numericStats, return them so the log-scale suppression can
    // be exercised; otherwise return no row (simulates a SQLite build without
    // math functions — the detector then does not suppress).
    if (sql.contains('AVG(LN(')) {
      if (numericStats != null) {
        for (final entry in numericStats.entries) {
          final parts = entry.key.split('.');
          if (sql.contains('"${parts[0]}"') && sql.contains('"${parts[1]}"')) {
            final lm = entry.value['log_mean'];
            final ls = entry.value['log_sqmean'];
            if (lm != null && ls != null) {
              return [
                <String, dynamic>{'log_mean': lm, 'log_sqmean': ls},
              ];
            }
          }
        }
      }
      return <Map<String, dynamic>>[];
    }

    // Second-pass variance query (M2): SELECT AVG((col-mean)*(col-mean)) AS
    // variance. Has AVG( but not MIN(/MAX(, so it is distinct from the stats
    // query below. Returns the `variance` supplied in numericStats.
    if (sql.contains('AS variance') && !sql.contains('MIN(')) {
      if (numericStats != null) {
        for (final entry in numericStats.entries) {
          final parts = entry.key.split('.');
          if (sql.contains('"${parts[0]}"') && sql.contains('"${parts[1]}"')) {
            return [
              <String, dynamic>{'variance': entry.value['variance'] ?? 0.0},
            ];
          }
        }
      }
      return [
        <String, dynamic>{'variance': 0.0},
      ];
    }

    // AVG/MIN/MAX numeric stats queries.
    if (sql.contains('AVG(') && sql.contains('MIN(') && sql.contains('MAX(')) {
      if (numericStats != null) {
        for (final entry in numericStats.entries) {
          final parts = entry.key.split('.');
          if (sql.contains('"${parts[0]}"') && sql.contains('"${parts[1]}"')) {
            // Default cnt to 50 (above the minimum sample size
            // threshold) so existing tests pass without needing
            // to specify cnt explicitly. Tests that want to
            // exercise the small-sample guard set cnt directly.
            final stats = Map<String, dynamic>.of(entry.value);
            stats.putIfAbsent('cnt', () => 50);
            return [stats];
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
