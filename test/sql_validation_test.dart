// Tests for SqlValidator (read-only SQL validation) and
// SqlHandler (SQL execution and explain plan endpoints).
//
// SqlValidator.isReadOnlySql tests exercise the static
// validator directly — no ServerContext needed.
// SqlHandler tests (runSqlResult, explainSqlResult) still
// need a ServerContext for the handler constructor.

import 'package:test/test.dart';

import 'package:saropa_drift_advisor/src/server/server_context.dart';
import 'package:saropa_drift_advisor/src/server/sql_handler.dart';
import 'package:saropa_drift_advisor/src/server/sql_validator.dart';

void main() {
  group('SqlValidator.isReadOnlySql', () {
    group('valid read-only queries', () {
      test('accepts simple SELECT as read-only', () {
        expect(SqlValidator.isReadOnlySql('SELECT * FROM users'), isTrue);
      });

      test('SELECT with WHERE clause', () {
        expect(
          SqlValidator.isReadOnlySql("SELECT id, name FROM users WHERE id = 1"),
          isTrue,
        );
      });

      test('SELECT with trailing semicolon', () {
        expect(SqlValidator.isReadOnlySql('SELECT 1;'), isTrue);
      });

      test('SELECT with leading/trailing whitespace', () {
        expect(SqlValidator.isReadOnlySql('  SELECT 1  '), isTrue);
      });

      // Regression: the prefix check used startsWith('SELECT ') with a literal
      // space, so a pretty-printed query with a newline right after the verb
      // (the default editor formatting) was rejected as non-read-only.
      test('multi-line SELECT with newline after the verb', () {
        expect(
          SqlValidator.isReadOnlySql(
            'SELECT\n  id,\n  length(phones_json) AS pj\nFROM\n  contacts',
          ),
          isTrue,
        );
      });

      test('SELECT followed by a tab', () {
        expect(SqlValidator.isReadOnlySql('SELECT\tid FROM contacts'), isTrue);
      });

      test('multi-line WITH (CTE) with newline after the verb', () {
        expect(
          SqlValidator.isReadOnlySql(
            'WITH\n  cte AS (SELECT 1)\nSELECT * FROM cte',
          ),
          isTrue,
        );
      });

      test('case-insensitive SELECT', () {
        expect(SqlValidator.isReadOnlySql('select * from users'), isTrue);
        expect(SqlValidator.isReadOnlySql('Select * From Users'), isTrue);
      });

      test('WITH ... SELECT (CTE)', () {
        expect(
          SqlValidator.isReadOnlySql(
            'WITH cte AS (SELECT 1) SELECT * FROM cte',
          ),
          isTrue,
        );
      });

      test('should accept SELECT with subquery as read-only', () {
        expect(
          SqlValidator.isReadOnlySql(
            'SELECT * FROM (SELECT id FROM users) AS sub',
          ),
          isTrue,
        );
      });

      test('should accept SELECT with JOIN as read-only', () {
        expect(
          SqlValidator.isReadOnlySql(
            'SELECT u.name, o.total FROM users u JOIN orders o ON u.id = o.user_id',
          ),
          isTrue,
        );
      });

      test('SELECT with GROUP BY and HAVING', () {
        expect(
          SqlValidator.isReadOnlySql(
            'SELECT type, COUNT(*) FROM items GROUP BY type HAVING COUNT(*) > 1',
          ),
          isTrue,
        );
      });
    });

    group('forbidden keywords in string literals are allowed', () {
      test('INSERT keyword inside single-quoted string', () {
        expect(
          SqlValidator.isReadOnlySql(
            "SELECT * FROM logs WHERE msg = 'INSERT failed'",
          ),
          isTrue,
        );
      });

      test('DELETE keyword inside single-quoted string', () {
        expect(
          SqlValidator.isReadOnlySql(
            "SELECT * FROM logs WHERE msg = 'DELETE ok'",
          ),
          isTrue,
        );
      });

      test('UPDATE keyword inside double-quoted identifier', () {
        expect(
          SqlValidator.isReadOnlySql('SELECT * FROM "UPDATE_LOG" WHERE id = 1'),
          isTrue,
        );
      });
    });

    group('forbidden keywords in comments are allowed', () {
      test('INSERT in line comment', () {
        expect(
          SqlValidator.isReadOnlySql('-- INSERT INTO x\nSELECT * FROM users'),
          isTrue,
        );
      });

      test('DELETE in block comment', () {
        expect(
          SqlValidator.isReadOnlySql('/* DELETE FROM x */ SELECT * FROM users'),
          isTrue,
        );
      });
    });

    group('rejected queries', () {
      test('should reject INSERT statement as non-read-only', () {
        expect(
          SqlValidator.isReadOnlySql('INSERT INTO users (name) VALUES ("x")'),
          isFalse,
        );
      });

      test('should reject UPDATE statement as non-read-only', () {
        expect(
          SqlValidator.isReadOnlySql(
            'UPDATE users SET name = "y" WHERE id = 1',
          ),
          isFalse,
        );
      });

      test('should reject DELETE statement as non-read-only', () {
        expect(
          SqlValidator.isReadOnlySql('DELETE FROM users WHERE id = 1'),
          isFalse,
        );
      });

      test('rejects CREATE TABLE as non-read-only', () {
        expect(SqlValidator.isReadOnlySql('CREATE TABLE x (id INT)'), isFalse);
      });

      test('rejects DROP TABLE as non-read-only', () {
        expect(SqlValidator.isReadOnlySql('DROP TABLE users'), isFalse);
      });

      test('rejects ALTER TABLE as non-read-only', () {
        expect(
          SqlValidator.isReadOnlySql('ALTER TABLE users ADD COLUMN age INT'),
          isFalse,
        );
      });

      test('rejects PRAGMA as non-read-only', () {
        expect(SqlValidator.isReadOnlySql('PRAGMA table_info(users)'), isFalse);
      });

      test('rejects VACUUM as non-read-only', () {
        expect(SqlValidator.isReadOnlySql('VACUUM'), isFalse);
      });

      test('rejects REPLACE INTO as non-read-only', () {
        expect(
          SqlValidator.isReadOnlySql('REPLACE INTO users (id) VALUES (1)'),
          isFalse,
        );
      });

      test('should reject ATTACH DATABASE as non-read-only', () {
        expect(
          SqlValidator.isReadOnlySql("ATTACH DATABASE 'test.db' AS test"),
          isFalse,
        );
      });

      test('should reject DETACH DATABASE as non-read-only', () {
        expect(SqlValidator.isReadOnlySql('DETACH DATABASE test'), isFalse);
      });

      test('rejects ANALYZE as non-read-only', () {
        expect(SqlValidator.isReadOnlySql('ANALYZE users'), isFalse);
      });

      test('rejects REINDEX as non-read-only', () {
        expect(SqlValidator.isReadOnlySql('REINDEX users'), isFalse);
      });

      test('rejects TRUNCATE TABLE as non-read-only', () {
        expect(SqlValidator.isReadOnlySql('TRUNCATE TABLE users'), isFalse);
      });
    });

    group('multi-statement rejection', () {
      test('two SELECT statements separated by semicolon', () {
        expect(SqlValidator.isReadOnlySql('SELECT 1; SELECT 2'), isFalse);
      });

      test('SELECT followed by INSERT', () {
        expect(
          SqlValidator.isReadOnlySql('SELECT 1; INSERT INTO x (id) VALUES (1)'),
          isFalse,
        );
      });

      test('WITH ... INSERT is rejected', () {
        expect(
          SqlValidator.isReadOnlySql(
            'WITH cte AS (SELECT 1) INSERT INTO x SELECT * FROM cte',
          ),
          isFalse,
        );
      });
    });

    // Regression for audit H1: the old regex chain stripped comments before
    // masking strings, so an apostrophe inside a comment (or a comment marker
    // inside a string) desynchronized quote pairing and hid a trailing write
    // statement. The single-pass tokenizer must catch all of these.
    group('comment/string desync bypasses are rejected (H1)', () {
      test('apostrophe in trailing comment cannot hide a stacked DROP', () {
        expect(
          SqlValidator.isReadOnlySql("SELECT 'a -- b' ; DROP TABLE t --"),
          isFalse,
        );
      });

      test('comment marker inside a string literal does not unmask SQL', () {
        expect(
          SqlValidator.isReadOnlySql("SELECT '/* ' ; DELETE FROM t WHERE 1 /*"),
          isFalse,
        );
      });

      test('bracket-quoted identifier cannot smuggle a second statement', () {
        expect(
          SqlValidator.isReadOnlySql('SELECT [c] FROM t; DROP TABLE t'),
          isFalse,
        );
      });

      test('backtick-quoted identifier cannot smuggle a second statement', () {
        expect(
          SqlValidator.isReadOnlySql('SELECT `c` FROM t; DROP TABLE t'),
          isFalse,
        );
      });

      test('semicolon INSIDE a string literal stays a single valid SELECT', () {
        expect(
          SqlValidator.isReadOnlySql("SELECT * FROM t WHERE note = 'a;b'"),
          isTrue,
        );
      });

      test('forbidden keyword only inside a string is still allowed', () {
        expect(
          SqlValidator.isReadOnlySql(
            "SELECT * FROM t WHERE note = 'DROP TABLE'",
          ),
          isTrue,
        );
      });
    });

    group('edge cases', () {
      test('empty string is rejected', () {
        expect(SqlValidator.isReadOnlySql(''), isFalse);
      });

      test('whitespace-only string is rejected', () {
        expect(SqlValidator.isReadOnlySql('   '), isFalse);
      });

      test('just a semicolon is rejected', () {
        expect(SqlValidator.isReadOnlySql(';'), isFalse);
      });
    });
  });

  group('SqlHandler', () {
    late SqlHandler handler;

    setUp(() {
      // SqlHandler needs a ServerContext for logging and
      // response helpers used by runSqlResult / explainSqlResult.
      handler = SqlHandler(
        ServerContext(query: (_) async => <Map<String, dynamic>>[]),
      );
    });

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
            <String, dynamic>{'id': 1},
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

      test('logs warning instead of full error for missing table', () async {
        // Track which logging path was used.
        final logMessages = <String>[];
        final errors = <Object>[];
        final ctx = ServerContext(
          query: (_) async => <Map<String, dynamic>>[],
          onLog: logMessages.add,
          onError: (e, _) => errors.add(e),
        );
        final h = SqlHandler(ctx);

        final result = await h.runSqlResult(
          (_) async =>
              throw Exception('no such table: activities, SQL logic error'),
          'SELECT * FROM "activities"',
        );

        // Error is still returned to the caller.
        expect(result, containsPair('error', contains('no such table')));
        // Logged as a short warning, not a full error.
        expect(logMessages, hasLength(1));
        expect(logMessages.first, contains('table/view not found'));
        expect(errors, isEmpty);
      });

      test('logs full error for non-table SQLite errors', () async {
        final logMessages = <String>[];
        final errors = <Object>[];
        final ctx = ServerContext(
          query: (_) async => <Map<String, dynamic>>[],
          onLog: logMessages.add,
          onError: (e, _) => errors.add(e),
        );
        final h = SqlHandler(ctx);

        final result = await h.runSqlResult(
          (_) async => throw Exception('disk I/O error'),
          'SELECT 1',
        );

        expect(result, containsPair('error', contains('disk I/O error')));
        // Full error logging path, not the short warning.
        expect(logMessages, isEmpty);
        expect(errors, hasLength(1));
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
        final executedSqls = <String>[];
        final result = await handler.explainSqlResult((sql) async {
          executedSqls.add(sql);
          // Return EXPLAIN rows for the first call; empty for
          // subsequent PRAGMA calls (index enrichment).
          if (sql.startsWith('EXPLAIN QUERY PLAN')) {
            return [
              <String, dynamic>{'detail': 'SCAN TABLE users'},
            ];
          }
          return [];
        }, 'SELECT * FROM users');

        expect(executedSqls.first, startsWith('EXPLAIN QUERY PLAN'));
        expect(result, containsPair('rows', hasLength(1)));
        expect(result, containsPair('sql', contains('EXPLAIN')));
        // Index enrichment should have queried PRAGMA for the
        // "users" table found in the EXPLAIN detail.
        expect(result, contains('indexes'));
      });

      test('returns error when explain query throws', () async {
        final result = await handler.explainSqlResult(
          (_) async => throw Exception('explain failed'),
          'SELECT 1',
        );
        expect(result, containsPair('error', contains('explain failed')));
      });

      test('logs warning instead of full error for missing table', () async {
        final logMessages = <String>[];
        final errors = <Object>[];
        final ctx = ServerContext(
          query: (_) async => <Map<String, dynamic>>[],
          onLog: logMessages.add,
          onError: (e, _) => errors.add(e),
        );
        final h = SqlHandler(ctx);

        final result = await h.explainSqlResult(
          (_) async => throw Exception('no such table: activities'),
          'SELECT * FROM "activities"',
        );

        expect(result, containsPair('error', contains('no such table')));
        expect(logMessages, hasLength(1));
        expect(logMessages.first, contains('table/view not found'));
        expect(errors, isEmpty);
      });
    });
  });

  group('SqlValidator.isSingleDataMutationSql', () {
    group('accepts valid DML', () {
      test('should accept INSERT INTO as valid DML', () {
        expect(
          SqlValidator.isSingleDataMutationSql('INSERT INTO t (id) VALUES (1)'),
          isTrue,
        );
      });

      test('should accept UPDATE as valid DML', () {
        expect(
          SqlValidator.isSingleDataMutationSql('UPDATE t SET x = 1 WHERE id=2'),
          isTrue,
        );
      });

      test('should accept DELETE FROM as valid DML', () {
        expect(
          SqlValidator.isSingleDataMutationSql('DELETE FROM t WHERE id = 1'),
          isTrue,
        );
      });

      test('should accept REPLACE INTO as valid DML (SQLite alias)', () {
        expect(
          SqlValidator.isSingleDataMutationSql(
            "REPLACE INTO t (id, name) VALUES (1, 'a')",
          ),
          isTrue,
        );
      });

      test('should accept INSERT OR REPLACE INTO as valid DML', () {
        expect(
          SqlValidator.isSingleDataMutationSql(
            "INSERT OR REPLACE INTO t (id) VALUES (1)",
          ),
          isTrue,
        );
      });

      test('should accept INSERT OR IGNORE INTO as valid DML', () {
        expect(
          SqlValidator.isSingleDataMutationSql(
            'INSERT OR IGNORE INTO t (id) VALUES (1)',
          ),
          isTrue,
        );
      });

      test('should accept INSERT OR ABORT INTO as valid DML', () {
        expect(
          SqlValidator.isSingleDataMutationSql(
            'INSERT OR ABORT INTO t (id) VALUES (1)',
          ),
          isTrue,
        );
      });

      test('should accept UPDATE OR ROLLBACK as valid DML', () {
        expect(
          SqlValidator.isSingleDataMutationSql(
            'UPDATE OR ROLLBACK t SET x = 1',
          ),
          isTrue,
        );
      });

      test('should accept DML keywords when case-insensitive', () {
        expect(
          SqlValidator.isSingleDataMutationSql(
            'insert or ignore into t (id) values (1)',
          ),
          isTrue,
        );
      });

      test('with trailing semicolon', () {
        expect(
          SqlValidator.isSingleDataMutationSql('INSERT INTO t VALUES (1);'),
          isTrue,
        );
      });

      test('UPDATE with quoted table name (masked to ? by tokenizer)', () {
        // Quoted table names are masked by _maskCommentsAndLiterals before
        // the regex runs. The UPDATE regex must not require a word boundary
        // after the verb, because '?' is non-word and would fail \b.
        expect(
          SqlValidator.isSingleDataMutationSql(
            'UPDATE "Users" SET name = \'x\' WHERE id = 1',
          ),
          isTrue,
        );
      });

      test('UPDATE with backtick-quoted table name', () {
        expect(
          SqlValidator.isSingleDataMutationSql('UPDATE `my table` SET x = 1'),
          isTrue,
        );
      });

      test(
        'accepts REPLACE() function inside INSERT (not a forbidden verb)',
        () {
          // REPLACE() is a SQLite string function — must not trigger the
          // forbidden-keyword scan now that REPLACE is removed from the set.
          expect(
            SqlValidator.isSingleDataMutationSql(
              "INSERT INTO t (name) VALUES (REPLACE('hello','l','r'))",
            ),
            isTrue,
          );
        },
      );

      test('accepts INSERT ... ON CONFLICT DO UPDATE (UPSERT)', () {
        // SQLite 3.24+ native upsert syntax. UPDATE inside DO UPDATE is
        // not in the forbidden-keyword set, so this passes the scan.
        expect(
          SqlValidator.isSingleDataMutationSql(
            'INSERT INTO t (id, name) VALUES (1, \'a\') '
            'ON CONFLICT (id) DO UPDATE SET name = excluded.name',
          ),
          isTrue,
        );
      });

      test('accepts INSERT ... ON CONFLICT DO NOTHING', () {
        expect(
          SqlValidator.isSingleDataMutationSql(
            'INSERT INTO t (id) VALUES (1) ON CONFLICT DO NOTHING',
          ),
          isTrue,
        );
      });

      test('accepts REPLACE() function inside DELETE WHERE clause', () {
        // REPLACE() as a string function in a WHERE condition — not a
        // leading verb, should not be treated as forbidden.
        expect(
          SqlValidator.isSingleDataMutationSql(
            "DELETE FROM t WHERE REPLACE(name, 'a', 'b') = 'x'",
          ),
          isTrue,
        );
      });

      test('rejects bare UPDATE with no table name', () {
        // Structurally invalid — regex requires whitespace after UPDATE
        // but _singleStatementCoreForAnalysis trims to just "UPDATE".
        expect(SqlValidator.isSingleDataMutationSql('UPDATE'), isFalse);
      });

      test('rejects UPDATE with only trailing semicolon', () {
        // After trimming and semicolon removal, core is "UPDATE" — no
        // trailing whitespace, regex fails.
        expect(SqlValidator.isSingleDataMutationSql('UPDATE ;'), isFalse);
      });
    });

    group('rejects non-DML', () {
      test('should reject DROP TABLE as non-DML', () {
        expect(SqlValidator.isSingleDataMutationSql('DROP TABLE t'), isFalse);
      });

      test('should reject CREATE TABLE as non-DML', () {
        expect(
          SqlValidator.isSingleDataMutationSql('CREATE TABLE t (id INT)'),
          isFalse,
        );
      });

      test('should reject PRAGMA as non-DML', () {
        expect(
          SqlValidator.isSingleDataMutationSql('PRAGMA journal_mode=DELETE'),
          isFalse,
        );
      });

      test('should reject ATTACH DATABASE as non-DML', () {
        expect(
          SqlValidator.isSingleDataMutationSql('ATTACH DATABASE "x" AS ext'),
          isFalse,
        );
      });

      test('should reject SELECT as non-DML', () {
        expect(
          SqlValidator.isSingleDataMutationSql('SELECT * FROM t'),
          isFalse,
        );
      });

      test('should reject VACUUM as non-DML', () {
        expect(SqlValidator.isSingleDataMutationSql('VACUUM'), isFalse);
      });

      test('multi-statement (stacked via semicolon)', () {
        expect(
          SqlValidator.isSingleDataMutationSql(
            'INSERT INTO t VALUES (1); DROP TABLE t',
          ),
          isFalse,
        );
      });

      test('should reject empty string as non-DML', () {
        expect(SqlValidator.isSingleDataMutationSql(''), isFalse);
      });

      test('should reject whitespace-only string as non-DML', () {
        expect(SqlValidator.isSingleDataMutationSql('   '), isFalse);
      });
    });
  });
}
