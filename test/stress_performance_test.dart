// Stress and performance tests for large-database behavior.
//
// Covers: change detection UNION ALL with 100+ tables, query timing
// ring buffer under concurrent writes, snapshot capture with many
// tables/rows, and anomaly detection on wide tables (timeout behavior).
// See bugs/history/20260317/018-no-stress-performance-tests.md.

import 'package:saropa_drift_advisor/saropa_drift_advisor.dart';
import 'package:saropa_drift_advisor/src/server/anomaly_detector.dart';
import 'package:saropa_drift_advisor/src/server/server_constants.dart';
import 'package:saropa_drift_advisor/src/server/server_context.dart';
import 'package:test/test.dart';

import 'helpers/test_helpers.dart';

void main() {
  group('Stress and performance', () {
    // Change detection builds one UNION ALL query for all tables; stress with 100+.
    group('change detection UNION ALL', () {
      test('builds single UNION ALL query for 100+ tables', () async {
        const tableCount = 120;
        final tableNames = List.generate(
          tableCount,
          (i) => 'table_${i.toString().padLeft(3, '0')}',
        );

        final executedSql = <String>[];
        final ctx = ServerContext(
          query: (sql) async {
            executedSql.add(sql);
            if (sql.contains("type='table'") && sql.contains('ORDER BY name')) {
              return tableNames
                  .map((name) => <String, dynamic>{'name': name})
                  .toList();
            }
            if (sql.contains('UNION ALL')) {
              return tableNames
                  .map((name) => <String, dynamic>{'t': name, 'c': 0})
                  .toList();
            }
            return <Map<String, dynamic>>[];
          },
        );

        await ctx.checkDataChange();

        expect(executedSql.length, 2);
        expect(executedSql[0], contains("type='table'"));
        final unionSql = executedSql[1];
        expect(unionSql, contains('UNION ALL'));
        final unionCount = 'UNION ALL'.allMatches(unionSql).length;
        expect(unionCount, tableCount - 1);
        expect(ctx.lastDataSignature, isNotNull);
        expect(ctx.lastDataSignature!.split(',').length, tableCount);
      });

      test(
        'change detection signature is deterministic for many tables',
        () async {
          const tableCount = 150;
          final tableNames = List.generate(tableCount, (i) => 't$i');
          int unionCallCount = 0;
          final ctx = ServerContext(
            query: (sql) async {
              if (sql.contains("type='table'") &&
                  sql.contains('ORDER BY name')) {
                return tableNames
                    .map((name) => <String, dynamic>{'name': name})
                    .toList();
              }
              if (sql.contains('UNION ALL')) {
                unionCallCount++;
                return tableNames
                    .map((name) => <String, dynamic>{'t': name, 'c': 1})
                    .toList();
              }
              return <Map<String, dynamic>>[];
            },
          );

          await ctx.checkDataChange();
          final firstSig = ctx.lastDataSignature;
          await ctx.checkDataChange();
          final secondSig = ctx.lastDataSignature;

          expect(unionCallCount, 2);
          expect(firstSig, secondSig);
          expect(firstSig!.split(',').length, tableCount);
        },
      );
    });

    // Ring buffer capped at maxQueryTimings; must evict oldest under load.
    group('query timing ring buffer', () {
      test(
        'buffer never exceeds maxQueryTimings under concurrent insertions',
        () async {
          final ctx = ServerContext(
            query: (_) async => <Map<String, dynamic>>[],
          );

          const insertCount = 800;
          final futures = List.generate(
            insertCount,
            (i) => Future(() {
              ctx.recordTiming(sql: 'SELECT $i', durationMs: i, rowCount: 0);
            }),
          );
          await Future.wait(futures);

          expect(
            ctx.queryTimings.length,
            lessThanOrEqualTo(ServerConstants.maxQueryTimings),
          );
          expect(ctx.queryTimings.length, ServerConstants.maxQueryTimings);
        },
      );

      test(
        'oldest entries evicted when over limit (sequential then burst)',
        () async {
          final ctx = ServerContext(
            query: (_) async => <Map<String, dynamic>>[],
          );

          for (int i = 0; i < ServerConstants.maxQueryTimings; i++) {
            ctx.recordTiming(sql: 'A$i', durationMs: i, rowCount: 0);
          }
          expect(ctx.queryTimings.length, ServerConstants.maxQueryTimings);
          expect(ctx.queryTimings.first.sql, 'A0');

          for (int i = 0; i < 100; i++) {
            ctx.recordTiming(sql: 'B$i', durationMs: 1000 + i, rowCount: 0);
          }
          expect(ctx.queryTimings.length, ServerConstants.maxQueryTimings);
          // Oldest 100 (A0–A99) evicted; first remaining is A100.
          expect(ctx.queryTimings.first.sql, 'A100');
          expect(ctx.queryTimings.last.sql, 'B99');
        },
      );
    });

    // Full snapshot loads all tables into memory; verify completion at scale.
    group('snapshot with large tables', () {
      int? serverPort;

      tearDown(() async {
        await DriftDebugServer.stop();
        serverPort = null;
      });

      /// Builds a mock DB with [tableCount] tables and [rowsPerTable] rows each,
      /// starts the server, POSTs /api/snapshot, and returns (status, body).
      /// Caller must set [serverPort] for tearDown (e.g. from DriftDebugServer.port).
      Future<({int status, dynamic body})> _runSnapshotStress({
        required int tableCount,
        required int rowsPerTable,
        bool twoColumns = true,
      }) async {
        final tableNames = List.generate(
          tableCount,
          (i) => twoColumns ? 'big_table_$i' : 't$i',
        );
        final tableColumns = <String, List<Map<String, dynamic>>>{};
        final tableData = <String, List<Map<String, dynamic>>>{};
        for (final name in tableNames) {
          tableColumns[name] = twoColumns
              ? [
                  {'name': 'id', 'type': 'INTEGER', 'pk': 1},
                  {'name': 'value', 'type': 'TEXT', 'pk': 0},
                ]
              : [
                  {'name': 'id', 'type': 'INTEGER', 'pk': 1},
                ];
          tableData[name] = List.generate(
            rowsPerTable,
            (i) => twoColumns
                ? <String, dynamic>{'id': i + 1, 'value': 'row_$i'}
                : <String, dynamic>{'id': i},
          );
        }
        final query = mockQueryWithTables(
          tableColumns: tableColumns,
          tableData: tableData,
          tableCounts: {for (final t in tableNames) t: rowsPerTable},
        );
        await DriftDebugServer.start(query: query, port: 0, enabled: true);
        serverPort = DriftDebugServer.port;
        final resp = await httpPost(serverPort!, '/api/snapshot');
        return (status: resp.status, body: resp.body);
      }

      test('POST /api/snapshot completes with many tables and rows', () async {
        const tableCount = 30;
        const rowsPerTable = 200;
        final result = await _runSnapshotStress(
          tableCount: tableCount,
          rowsPerTable: rowsPerTable,
          twoColumns: true,
        );
        expect(result.status, 200);
        final body = result.body as Map;
        expect(body['tableCount'], tableCount);
        expect((body['tables'] as List).length, tableCount);
      });

      test(
        'snapshot capture with 50 tables and 100 rows each completes',
        () async {
          const tableCount = 50;
          const rowsPerTable = 100;
          final result = await _runSnapshotStress(
            tableCount: tableCount,
            rowsPerTable: rowsPerTable,
            twoColumns: false,
          );
          expect(result.status, 200);
          final body = result.body as Map;
          expect(body['tableCount'], tableCount);
          expect((body['tables'] as List).length, tableCount);
        },
      );
    });

    // Anomaly scan is O(tables × columns); assert it completes within timeout.
    group('anomaly detection wide tables', () {
      test(
        'anomaly scan completes within timeout for many tables and columns',
        () async {
          const tableCount = 25;
          const colsPerTable = 20;
          final tableNames = List.generate(tableCount, (i) => 'wide_$i');
          final tableColumns = <String, List<Map<String, dynamic>>>{};
          for (final name in tableNames) {
            tableColumns[name] = List.generate(
              colsPerTable,
              (i) => {
                'name': 'col_$i',
                'type': i % 3 == 0 ? 'TEXT' : 'INTEGER',
                'pk': i == 0 ? 1 : 0,
                'notnull': 0,
              },
            );
          }
          final tableCounts = {for (final t in tableNames) t: 10};

          final query = mockQueryWithTables(
            tableColumns: tableColumns,
            tableCounts: tableCounts,
            tableForeignKeys: {},
          );

          const timeoutSeconds = 15;
          final stopwatch = Stopwatch()..start();
          final result = await AnomalyDetector.getAnomaliesResult(
            query,
          ).timeout(Duration(seconds: timeoutSeconds));
          stopwatch.stop();

          expect(result['tablesScanned'], tableCount);
          expect(result['anomalies'], isA<List<Map<String, dynamic>>>());
          expect(
            stopwatch.elapsedMilliseconds,
            lessThan(timeoutSeconds * 1000),
          );
        },
      );
    });
  });
}
