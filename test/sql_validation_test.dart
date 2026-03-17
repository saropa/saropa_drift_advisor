// Tests for SQL read-only validation logic in SqlHandler.
// Tests isReadOnlySql with various SQL patterns including
// comments, quoted strings, forbidden keywords, and edge cases.

import 'package:test/test.dart';

import 'package:saropa_drift_advisor/src/server/server_context.dart';
import 'package:saropa_drift_advisor/src/server/sql_handler.dart';

void main() {
  late SqlHandler handler;

  setUp(() {
    // SqlHandler needs a ServerContext; the isReadOnlySql method
    // doesn't use any ServerContext state, but we need one to
    // construct the handler.
    handler = SqlHandler(ServerContext(
      query: (_) async => <Map<String, dynamic>>[],
    ));
  });

  group('isReadOnlySql', () {
    group('valid read-only queries', () {
      test('simple SELECT', () {
        expect(handler.isReadOnlySql('SELECT * FROM users'), isTrue);
      });

      test('SELECT with WHERE clause', () {
        expect(
          handler.isReadOnlySql("SELECT id, name FROM users WHERE id = 1"),
          isTrue,
        );
      });

      test('SELECT with trailing semicolon', () {
        expect(handler.isReadOnlySql('SELECT 1;'), isTrue);
      });

      test('SELECT with leading/trailing whitespace', () {
        expect(handler.isReadOnlySql('  SELECT 1  '), isTrue);
      });

      test('case-insensitive SELECT', () {
        expect(handler.isReadOnlySql('select * from users'), isTrue);
        expect(handler.isReadOnlySql('Select * From Users'), isTrue);
      });

      test('WITH ... SELECT (CTE)', () {
        expect(
          handler.isReadOnlySql('WITH cte AS (SELECT 1) SELECT * FROM cte'),
          isTrue,
        );
      });

      test('SELECT with subquery', () {
        expect(
          handler.isReadOnlySql('SELECT * FROM (SELECT id FROM users) AS sub'),
          isTrue,
        );
      });

      test('SELECT with JOIN', () {
        expect(
          handler.isReadOnlySql(
              'SELECT u.name, o.total FROM users u JOIN orders o ON u.id = o.user_id'),
          isTrue,
        );
      });

      test('SELECT with GROUP BY and HAVING', () {
        expect(
          handler.isReadOnlySql(
              'SELECT type, COUNT(*) FROM items GROUP BY type HAVING COUNT(*) > 1'),
          isTrue,
        );
      });
    });

    group('forbidden keywords in string literals are allowed', () {
      test('INSERT keyword inside single-quoted string', () {
        expect(
          handler
              .isReadOnlySql("SELECT * FROM logs WHERE msg = 'INSERT failed'"),
          isTrue,
        );
      });

      test('DELETE keyword inside single-quoted string', () {
        expect(
          handler.isReadOnlySql("SELECT * FROM logs WHERE msg = 'DELETE ok'"),
          isTrue,
        );
      });

      test('UPDATE keyword inside double-quoted identifier', () {
        expect(
          handler.isReadOnlySql('SELECT * FROM "UPDATE_LOG" WHERE id = 1'),
          isTrue,
        );
      });
    });

    group('forbidden keywords in comments are allowed', () {
      test('INSERT in line comment', () {
        expect(
          handler.isReadOnlySql('-- INSERT INTO x\nSELECT * FROM users'),
          isTrue,
        );
      });

      test('DELETE in block comment', () {
        expect(
          handler.isReadOnlySql('/* DELETE FROM x */ SELECT * FROM users'),
          isTrue,
        );
      });
    });

    group('rejected queries', () {
      test('INSERT statement', () {
        expect(
          handler.isReadOnlySql('INSERT INTO users (name) VALUES ("x")'),
          isFalse,
        );
      });

      test('UPDATE statement', () {
        expect(
          handler.isReadOnlySql('UPDATE users SET name = "y" WHERE id = 1'),
          isFalse,
        );
      });

      test('DELETE statement', () {
        expect(
            handler.isReadOnlySql('DELETE FROM users WHERE id = 1'), isFalse);
      });

      test('CREATE TABLE', () {
        expect(
          handler.isReadOnlySql('CREATE TABLE x (id INT)'),
          isFalse,
        );
      });

      test('DROP TABLE', () {
        expect(handler.isReadOnlySql('DROP TABLE users'), isFalse);
      });

      test('ALTER TABLE', () {
        expect(
          handler.isReadOnlySql('ALTER TABLE users ADD COLUMN age INT'),
          isFalse,
        );
      });

      test('PRAGMA', () {
        expect(handler.isReadOnlySql('PRAGMA table_info(users)'), isFalse);
      });

      test('VACUUM', () {
        expect(handler.isReadOnlySql('VACUUM'), isFalse);
      });

      test('REPLACE INTO', () {
        expect(
          handler.isReadOnlySql('REPLACE INTO users (id) VALUES (1)'),
          isFalse,
        );
      });

      test('ATTACH DATABASE', () {
        expect(
          handler.isReadOnlySql("ATTACH DATABASE 'test.db' AS test"),
          isFalse,
        );
      });

      test('DETACH DATABASE', () {
        expect(handler.isReadOnlySql('DETACH DATABASE test'), isFalse);
      });

      test('ANALYZE', () {
        expect(handler.isReadOnlySql('ANALYZE users'), isFalse);
      });

      test('REINDEX', () {
        expect(handler.isReadOnlySql('REINDEX users'), isFalse);
      });

      test('TRUNCATE', () {
        expect(handler.isReadOnlySql('TRUNCATE TABLE users'), isFalse);
      });
    });

    group('multi-statement rejection', () {
      test('two SELECT statements separated by semicolon', () {
        expect(
          handler.isReadOnlySql('SELECT 1; SELECT 2'),
          isFalse,
        );
      });

      test('SELECT followed by INSERT', () {
        expect(
          handler.isReadOnlySql('SELECT 1; INSERT INTO x (id) VALUES (1)'),
          isFalse,
        );
      });

      test('WITH ... INSERT is rejected', () {
        expect(
          handler.isReadOnlySql(
              'WITH cte AS (SELECT 1) INSERT INTO x SELECT * FROM cte'),
          isFalse,
        );
      });
    });

    group('edge cases', () {
      test('empty string is rejected', () {
        expect(handler.isReadOnlySql(''), isFalse);
      });

      test('whitespace-only string is rejected', () {
        expect(handler.isReadOnlySql('   '), isFalse);
      });

      test('just a semicolon is rejected', () {
        expect(handler.isReadOnlySql(';'), isFalse);
      });
    });
  });

  group('parseSqlBody', () {
    // parseSqlBody requires an HttpRequest, which is hard to
    // construct in unit tests. These aspects are tested through
    // integration tests in handler_integration_test.dart via
    // POST /api/sql. Here we only test runSqlResult and
    // explainSqlResult which don't need HttpRequest.

    group('runSqlResult', () {
      test('returns error for empty SQL', () async {
        final result = await handler.runSqlResult(
          (_) async => <Map<String, dynamic>>[],
          '',
        );
        expect(result, containsPair('error', contains('Missing')));
      });

      test('returns error for non-read-only SQL', () async {
        final result = await handler.runSqlResult(
          (_) async => <Map<String, dynamic>>[],
          'INSERT INTO x (id) VALUES (1)',
        );
        expect(result, containsPair('error', contains('read-only')));
      });

      test('returns rows for valid SELECT', () async {
        final result = await handler.runSqlResult(
          (_) async => [
            <String, dynamic>{'id': 1}
          ],
          'SELECT * FROM users',
        );
        expect(result, containsPair('rows', hasLength(1)));
      });

      test('returns error when query callback throws', () async {
        final result = await handler.runSqlResult(
          (_) async => throw Exception('db error'),
          'SELECT 1',
        );
        expect(result, containsPair('error', contains('db error')));
      });
    });

    group('explainSqlResult', () {
      test('returns error for empty SQL', () async {
        final result = await handler.explainSqlResult(
          (_) async => <Map<String, dynamic>>[],
          '',
        );
        expect(result, containsPair('error', contains('Missing')));
      });

      test('returns error for non-read-only SQL', () async {
        final result = await handler.explainSqlResult(
          (_) async => <Map<String, dynamic>>[],
          'DELETE FROM users',
        );
        expect(result, containsPair('error', contains('read-only')));
      });

      test('prepends EXPLAIN QUERY PLAN to valid SQL', () async {
        String? executedSql;
        final result = await handler.explainSqlResult(
          (sql) async {
            executedSql = sql;
            return [
              <String, dynamic>{'detail': 'SCAN TABLE users'}
            ];
          },
          'SELECT * FROM users',
        );

        expect(executedSql, startsWith('EXPLAIN QUERY PLAN'));
        expect(result, containsPair('rows', hasLength(1)));
        expect(result, containsPair('sql', contains('EXPLAIN')));
      });

      test('returns error when explain query throws', () async {
        final result = await handler.explainSqlResult(
          (_) async => throw Exception('explain failed'),
          'SELECT 1',
        );
        expect(result, containsPair('error', contains('explain failed')));
      });
    });
  });
}
