// Integration tests verifying the anomaly scan's timeout/truncation
// behavior degrades gracefully when merged into GET /api/issues.
//
// AnomalyDetector.getAnomaliesResult can emit a `scan_skipped` finding
// (per-table statement timeout) with no `column` key, and a top-level
// `truncated: true` (wall-clock budget exceeded). Neither shape existed
// before the anomaly-scan performance fix, so this file exercises them
// through AnalyticsHandler.getIssuesList to confirm the merged issue
// envelope handles both without crashing or losing other tables' findings.

import 'package:saropa_drift_advisor/src/server/analytics_handler.dart';
import 'package:saropa_drift_advisor/src/server/server_typedefs.dart';
import 'package:test/test.dart';

import 'helpers/test_helpers.dart';

void main() {
  group('AnalyticsHandler getIssuesList anomaly timeout handling', () {
    test('a per-table statement timeout surfaces as a scan_skipped issue '
        'without breaking other tables\' findings', () async {
      // fast_table has a NOT NULL column with a NULL violation — a normal
      // finding that must survive alongside slow_table's timeout.
      final DriftDebugQuery query = (String sql) async {
        if (sql.contains("type IN ('table','view')") &&
            sql.contains('ORDER BY name')) {
          return [
            <String, dynamic>{'name': 'fast_table'},
            <String, dynamic>{'name': 'slow_table'},
          ];
        }
        if (sql.contains('PRAGMA table_info')) {
          if (sql.contains('fast_table')) {
            return [
              <String, dynamic>{
                'cid': 0,
                'name': 'label',
                'type': 'TEXT',
                'notnull': 1,
                'dflt_value': null,
                'pk': 0,
              },
            ];
          }
          return [
            <String, dynamic>{
              'cid': 0,
              'name': 'label',
              'type': 'TEXT',
              'notnull': 1,
              'dflt_value': null,
              'pk': 0,
            },
          ];
        }
        if (sql.contains('_row_count')) {
          if (sql.contains('"slow_table"')) {
            // Longer than the context's sqlStatementTimeout below, so the
            // per-table catch in AnomalyDetector fires for this table only.
            await Future<void>.delayed(const Duration(milliseconds: 200));
          }
          return [
            <String, dynamic>{'_row_count': 5, 'null_0': 2},
          ];
        }
        return <Map<String, dynamic>>[];
      };

      final ctx = createTestContext(
        query: query,
        sqlStatementTimeout: const Duration(milliseconds: 20),
      );
      final handler = AnalyticsHandler(ctx);

      final result = await handler.getIssuesList(query, sources: 'anomalies');

      expect(
        result.containsKey('error'),
        isFalse,
        reason: 'A per-table timeout must not fail the whole request',
      );
      final issues = (result['issues'] as List).cast<Map<String, dynamic>>();

      // fast_table's NULL finding survived slow_table's timeout.
      final nullIssue = issues
          .where(
            (i) => i['table'] == 'fast_table' && i['type'] == 'null_values',
          )
          .toList();
      expect(nullIssue, hasLength(1));

      // slow_table surfaced as a scan_skipped issue, not a crash or a
      // silently dropped table.
      final skipIssue = issues
          .where(
            (i) => i['table'] == 'slow_table' && i['type'] == 'scan_skipped',
          )
          .toList();
      expect(skipIssue, hasLength(1));
      // No column on a table-level scan_skipped finding — the merged
      // envelope must tolerate that (it does: column is read nullable).
      expect(skipIssue.single.containsKey('column'), isFalse);
    });

    test('a wall-clock budget hit propagates to a top-level truncated flag '
        'on the /api/issues envelope', () async {
      // Three tables, each of which takes real time to scan. A budget
      // shorter than the time to scan all three forces the wall-clock
      // guard in AnomalyDetector.getAnomaliesResult to stop early.
      final tableNames = ['t0', 't1', 't2'];
      final DriftDebugQuery query = (String sql) async {
        if (sql.contains("type IN ('table','view')") &&
            sql.contains('ORDER BY name')) {
          return tableNames.map((t) => <String, dynamic>{'name': t}).toList();
        }
        if (sql.contains('PRAGMA table_info')) {
          return [
            <String, dynamic>{
              'cid': 0,
              'name': 'id',
              'type': 'INTEGER',
              'notnull': 0,
              'dflt_value': null,
              'pk': 1,
            },
          ];
        }
        if (sql.contains('_row_count')) {
          // Slow down every combined scan so the between-table budget
          // check has time to trip after the first table.
          await Future<void>.delayed(const Duration(milliseconds: 30));
          return [
            <String, dynamic>{'_row_count': 1},
          ];
        }
        return <Map<String, dynamic>>[];
      };

      final ctx = createTestContext(query: query);
      final handler = AnalyticsHandler(ctx);

      final result = await handler.getIssuesList(
        query,
        sources: 'anomalies',
        anomalyScanBudget: const Duration(milliseconds: 50),
      );

      expect(result.containsKey('error'), isFalse);
      expect(
        result['truncated'],
        true,
        reason:
            'A truncated anomaly scan must surface on the merged '
            '/api/issues envelope, not only on the raw scan result',
      );
    });

    test(
      'truncated is absent from /api/issues when the scan completes in budget',
      () async {
        final DriftDebugQuery query = (String sql) async {
          if (sql.contains("type IN ('table','view')") &&
              sql.contains('ORDER BY name')) {
            return [
              <String, dynamic>{'name': 'items'},
            ];
          }
          if (sql.contains('PRAGMA table_info')) {
            return [
              <String, dynamic>{
                'cid': 0,
                'name': 'id',
                'type': 'INTEGER',
                'notnull': 0,
                'dflt_value': null,
                'pk': 1,
              },
            ];
          }
          if (sql.contains('_row_count')) {
            return [
              <String, dynamic>{'_row_count': 1},
            ];
          }
          return <Map<String, dynamic>>[];
        };

        final ctx = createTestContext(query: query);
        final handler = AnalyticsHandler(ctx);

        final result = await handler.getIssuesList(
          query,
          sources: 'anomalies',
          anomalyScanBudget: const Duration(seconds: 30),
        );

        expect(result.containsKey('error'), isFalse);
        expect(result.containsKey('truncated'), isFalse);
      },
    );
  });
}
