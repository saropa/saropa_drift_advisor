// Tests for Feature 73 — website bulk index creation.
//
// Two layers:
//   1. SqlValidator.isSingleCreateIndexSql — static, no server needed.
//   2. IndexBatchHandler via the real DriftDebugServer — POST /api/indexes/
//      preview (no write) and /apply (best-effort, per-index status).

import 'package:test/test.dart';

import 'package:saropa_drift_advisor/saropa_drift_advisor.dart';
import 'package:saropa_drift_advisor/src/server/sql_validator.dart';

import 'helpers/test_helpers.dart';

void main() {
  group('SqlValidator.isSingleCreateIndexSql', () {
    test('accepts a plain CREATE INDEX', () {
      expect(
        SqlValidator.isSingleCreateIndexSql(
          'CREATE INDEX idx_orders_user_id ON "orders"("user_id");',
        ),
        isTrue,
      );
    });

    test('accepts UNIQUE and IF NOT EXISTS variants', () {
      expect(
        SqlValidator.isSingleCreateIndexSql(
          'CREATE UNIQUE INDEX idx_u ON t(a)',
        ),
        isTrue,
      );
      expect(
        SqlValidator.isSingleCreateIndexSql(
          'CREATE INDEX IF NOT EXISTS idx_u ON t(a)',
        ),
        isTrue,
      );
    });

    test('accepts a partial index with a WHERE clause', () {
      expect(
        SqlValidator.isSingleCreateIndexSql(
          'CREATE INDEX idx_active ON users(name) WHERE active = 1',
        ),
        isTrue,
      );
    });

    test('is case-insensitive', () {
      expect(
        SqlValidator.isSingleCreateIndexSql('create index idx ON t(a)'),
        isTrue,
      );
    });

    test('rejects non-index DDL and DML', () {
      expect(
        SqlValidator.isSingleCreateIndexSql('CREATE TABLE t(a INT)'),
        isFalse,
      );
      expect(SqlValidator.isSingleCreateIndexSql('DROP INDEX idx'), isFalse);
      expect(SqlValidator.isSingleCreateIndexSql('SELECT * FROM t'), isFalse);
      expect(
        SqlValidator.isSingleCreateIndexSql("UPDATE t SET a = 1"),
        isFalse,
      );
    });

    test('rejects stacked statements after a semicolon', () {
      expect(
        SqlValidator.isSingleCreateIndexSql(
          'CREATE INDEX idx ON t(a); DROP TABLE t;',
        ),
        isFalse,
      );
    });

    test('rejects empty / whitespace', () {
      expect(SqlValidator.isSingleCreateIndexSql(''), isFalse);
      expect(SqlValidator.isSingleCreateIndexSql('   '), isFalse);
    });
  });

  group('IndexBatchHandler HTTP', () {
    int? port;

    final mockQuery = mockQueryWithTables(
      tableColumns: {
        'orders': [
          <String, dynamic>{'name': 'id', 'type': 'INTEGER', 'pk': 1},
          <String, dynamic>{'name': 'user_id', 'type': 'INTEGER', 'pk': 0},
        ],
      },
    );

    tearDown(() async {
      await DriftDebugServer.stop();
      port = null;
    });

    test(
      'preview classifies valid vs rejected without a write callback',
      () async {
        await DriftDebugServer.start(query: mockQuery, enabled: true, port: 0);
        port = DriftDebugServer.port;

        final res = await httpPost(
          port!,
          '/api/indexes/preview',
          json: <String, dynamic>{
            'indexSqls': <String>[
              'CREATE INDEX idx_orders_user_id ON "orders"("user_id")',
              'DROP TABLE orders', // not an index → rejected
            ],
          },
        );

        expect(res.status, 200);
        final body = res.body as Map<String, dynamic>;
        expect((body['valid'] as List).length, 1);
        final rejected = body['rejected'] as List;
        expect(rejected.length, 1);
        expect((rejected.first as Map)['index'], 1);
      },
    );

    test('apply returns 501 when no write callback is configured', () async {
      await DriftDebugServer.start(query: mockQuery, enabled: true, port: 0);
      port = DriftDebugServer.port;

      final res = await httpPost(
        port!,
        '/api/indexes/apply',
        json: <String, dynamic>{
          'indexSqls': <String>['CREATE INDEX idx ON orders(user_id)'],
        },
      );
      expect(res.status, 501);
    });

    test(
      'apply is best-effort: a bad statement fails without dropping the others',
      () async {
        final executed = <String>[];
        // Simulate a DB failure for one otherwise-valid index statement.
        Future<void> writeQuery(String sql) async {
          executed.add(sql);
          if (sql.contains('idx_fails')) {
            throw StateError('duplicate index name');
          }
        }

        await DriftDebugServer.start(
          query: mockQuery,
          enabled: true,
          port: 0,
          writeQuery: writeQuery,
        );
        port = DriftDebugServer.port;

        final res = await httpPost(
          port!,
          '/api/indexes/apply',
          json: <String, dynamic>{
            'indexSqls': <String>[
              'CREATE INDEX idx_ok ON "orders"("user_id")', // succeeds
              'CREATE INDEX idx_fails ON "orders"("user_id")', // throws in DB
              'DROP TABLE orders', // rejected by validator, never executed
            ],
          },
        );

        expect(res.status, 200);
        final body = res.body as Map<String, dynamic>;
        expect(
          body['applied'],
          1,
          reason: 'only the first index actually created',
        );
        final results = (body['results'] as List).cast<Map<String, dynamic>>();
        expect(results.length, 3);
        expect(results[0]['ok'], true);
        expect(results[1]['ok'], false); // DB failure surfaced per-index
        expect(results[1]['error'], isNotNull);
        expect(results[2]['ok'], false); // validator rejection
        // The validator-rejected statement must never reach the database.
        expect(executed.any((s) => s.contains('DROP TABLE')), isFalse);
        expect(executed.length, 2);
      },
    );

    test('apply rejects a non-array body with 400', () async {
      await DriftDebugServer.start(
        query: mockQuery,
        enabled: true,
        port: 0,
        writeQuery: (_) async {},
      );
      port = DriftDebugServer.port;

      final res = await httpPost(
        port!,
        '/api/indexes/apply',
        json: <String, dynamic>{'indexSqls': 'not-an-array'},
      );
      expect(res.status, 400);
    });
  });
}
