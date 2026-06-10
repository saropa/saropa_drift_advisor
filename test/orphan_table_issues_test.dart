// Integration tests for orphan physical-table findings in AnalyticsHandler.
//
// Verifies the orphan check flows into the merged GET /api/issues shape and
// the dedicated getOrphanTablesResult path, honoring the declared-table set
// carried on ServerContext and the `sources` filter.

import 'package:saropa_drift_advisor/src/server/analytics_handler.dart';
import 'package:saropa_drift_advisor/src/server/server_typedefs.dart';
import 'package:test/test.dart';

import 'helpers/test_helpers.dart';

/// Query callback that reports [physicalTables] for the table-names query and
/// empty results for everything else, so index-suggestion and anomaly sources
/// contribute nothing and orphan findings can be asserted in isolation.
DriftDebugQuery _physicalTablesQuery(List<String> physicalTables) {
  return (String sql) async {
    if (sql.contains("type='table'") && sql.contains('ORDER BY name')) {
      return physicalTables
          .map((name) => <String, dynamic>{'name': name})
          .toList();
    }
    return <Map<String, dynamic>>[];
  };
}

void main() {
  group('AnalyticsHandler orphan-table issues', () {
    test(
      'getIssuesList includes an orphan-table issue when declared',
      () async {
        final ctx = createTestContext(declaredTableNames: {'users', 'posts'});
        final handler = AnalyticsHandler(ctx);

        final result = await handler.getIssuesList(
          _physicalTablesQuery(['users', 'posts', 'leftover_v33']),
        );

        final issues = (result['issues'] as List).cast<Map<String, dynamic>>();
        final orphanIssues = issues
            .where((i) => i['source'] == 'orphan-table')
            .toList();
        expect(orphanIssues, hasLength(1));
        final issue = orphanIssues.single;
        expect(issue['table'], 'leftover_v33');
        expect(issue['type'], 'orphan_table');
        expect(issue['severity'], 'warning');
        expect(issue['suggestedSql'], 'DROP TABLE "leftover_v33";');
        expect(issue['message'], contains('leftover_v33'));
      },
    );

    test('no orphan issues when declared set is absent', () async {
      // No declaredTableNames on the context → report-only, no findings.
      final ctx = createTestContext();
      final handler = AnalyticsHandler(ctx);

      final result = await handler.getIssuesList(
        _physicalTablesQuery(['users', 'leftover_v33']),
      );

      final issues = (result['issues'] as List).cast<Map<String, dynamic>>();
      expect(issues.where((i) => i['source'] == 'orphan-table'), isEmpty);
    });

    test('sources=orphan-tables returns only orphan-table issues', () async {
      final ctx = createTestContext(declaredTableNames: {'users'});
      final handler = AnalyticsHandler(ctx);

      final result = await handler.getIssuesList(
        _physicalTablesQuery(['users', 'leftover_v33']),
        sources: 'orphan-tables',
      );

      final issues = (result['issues'] as List).cast<Map<String, dynamic>>();
      expect(issues, isNotEmpty);
      expect(issues.every((i) => i['source'] == 'orphan-table'), isTrue);
    });

    test('getOrphanTablesResult reflects declared set from context', () async {
      final ctx = createTestContext(declaredTableNames: {'users'});
      final handler = AnalyticsHandler(ctx);

      final result = await handler.getOrphanTablesResult(
        _physicalTablesQuery(['users', 'leftover_v33']),
      );

      expect(result['declaredSchemaAvailable'], isTrue);
      expect((result['orphans'] as List), hasLength(1));
    });
  });
}
