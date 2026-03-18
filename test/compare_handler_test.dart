// Unit tests for CompareHandler — migration DDL generation.
//
// Since migration methods are private, we test through the server's
// HTTP endpoint (handleMigrationPreview) using integration-style
// tests with DriftDebugServer (static singleton).

import 'package:saropa_drift_advisor/saropa_drift_advisor.dart';
import 'package:test/test.dart';

import 'helpers/test_helpers.dart';

void main() {
  group('CompareHandler', () {
    group('migration preview', () {
      // Port assigned by the OS on each server start.
      int? serverPort;

      /// Starts a server with the given main and compare queries.
      Future<void> startServer({
        required Future<List<Map<String, dynamic>>> Function(String) queryMain,
        Future<List<Map<String, dynamic>>> Function(String)? queryCompare,
      }) async {
        await DriftDebugServer.start(
          query: queryMain,
          queryCompare: queryCompare,
          port: 0,
          enabled: true,
        );
        serverPort = DriftDebugServer.port;
      }

      tearDown(() async {
        await DriftDebugServer.stop();
        serverPort = null;
      });

      test('new table in B produces CREATE TABLE DDL', () async {
        // Main DB has "users", compare DB has "users" + "orders".
        final queryA = mockQueryWithTables(
          tableColumns: {
            'users': [
              {'name': 'id', 'type': 'INTEGER', 'pk': 1},
            ],
          },
        );
        final queryB = mockQueryWithTables(
          tableColumns: {
            'users': [
              {'name': 'id', 'type': 'INTEGER', 'pk': 1},
            ],
            'orders': [
              {'name': 'id', 'type': 'INTEGER', 'pk': 1},
              {'name': 'total', 'type': 'REAL', 'pk': 0},
            ],
          },
        );

        await startServer(queryMain: queryA, queryCompare: queryB);
        final resp = await httpGet(serverPort!, '/api/migration/preview');
        expect(resp.status, 200);

        final body = resp.body as Map;
        final migrationSql = body['migrationSql'] as String;
        expect(migrationSql, contains('NEW TABLE: orders'));
        expect(migrationSql, contains('CREATE TABLE'));
      });

      test('dropped table produces DROP TABLE DDL', () async {
        // Main DB has "users" + "legacy", compare DB has only "users".
        final queryA = mockQueryWithTables(
          tableColumns: {
            'users': [
              {'name': 'id', 'type': 'INTEGER', 'pk': 1},
            ],
            'legacy': [
              {'name': 'id', 'type': 'INTEGER', 'pk': 1},
            ],
          },
        );
        final queryB = mockQueryWithTables(
          tableColumns: {
            'users': [
              {'name': 'id', 'type': 'INTEGER', 'pk': 1},
            ],
          },
        );

        await startServer(queryMain: queryA, queryCompare: queryB);
        final resp = await httpGet(serverPort!, '/api/migration/preview');
        final body = resp.body as Map;
        final migrationSql = body['migrationSql'] as String;

        expect(migrationSql, contains('DROPPED TABLE: legacy'));
        expect(migrationSql, contains('DROP TABLE IF EXISTS "legacy"'));
      });

      test('added column produces ALTER TABLE ADD COLUMN', () async {
        // Same table "users" but compare DB adds an "email" column.
        final queryA = mockQueryWithTables(
          tableColumns: {
            'users': [
              {'name': 'id', 'type': 'INTEGER', 'pk': 1},
              {'name': 'name', 'type': 'TEXT', 'pk': 0},
            ],
          },
        );
        final queryB = mockQueryWithTables(
          tableColumns: {
            'users': [
              {'name': 'id', 'type': 'INTEGER', 'pk': 1},
              {'name': 'name', 'type': 'TEXT', 'pk': 0},
              {'name': 'email', 'type': 'TEXT', 'pk': 0},
            ],
          },
        );

        await startServer(queryMain: queryA, queryCompare: queryB);
        final resp = await httpGet(serverPort!, '/api/migration/preview');
        final body = resp.body as Map;
        final migrationSql = body['migrationSql'] as String;

        expect(migrationSql, contains('MODIFIED TABLE: users'));
        expect(
          migrationSql,
          contains('ALTER TABLE "users" ADD COLUMN "email"'),
        );
      });

      test('removed column produces WARNING comment', () async {
        // Main DB has "email" column, compare DB does not.
        final queryA = mockQueryWithTables(
          tableColumns: {
            'users': [
              {'name': 'id', 'type': 'INTEGER', 'pk': 1},
              {'name': 'email', 'type': 'TEXT', 'pk': 0},
            ],
          },
        );
        final queryB = mockQueryWithTables(
          tableColumns: {
            'users': [
              {'name': 'id', 'type': 'INTEGER', 'pk': 1},
            ],
          },
        );

        await startServer(queryMain: queryA, queryCompare: queryB);
        final resp = await httpGet(serverPort!, '/api/migration/preview');
        final body = resp.body as Map;
        final migrationSql = body['migrationSql'] as String;

        expect(migrationSql, contains('WARNING'));
        expect(migrationSql, contains('"email" removed'));
        expect(body['hasWarnings'], true);
      });

      test('changed column type produces WARNING comment', () async {
        // Column "score" changes from INTEGER to TEXT.
        final queryA = mockQueryWithTables(
          tableColumns: {
            'items': [
              {'name': 'id', 'type': 'INTEGER', 'pk': 1},
              {'name': 'score', 'type': 'INTEGER', 'pk': 0},
            ],
          },
        );
        final queryB = mockQueryWithTables(
          tableColumns: {
            'items': [
              {'name': 'id', 'type': 'INTEGER', 'pk': 1},
              {'name': 'score', 'type': 'TEXT', 'pk': 0},
            ],
          },
        );

        await startServer(queryMain: queryA, queryCompare: queryB);
        final resp = await httpGet(serverPort!, '/api/migration/preview');
        final body = resp.body as Map;
        final migrationSql = body['migrationSql'] as String;

        expect(migrationSql, contains('WARNING'));
        expect(migrationSql, contains('"score"'));
        expect(migrationSql, contains('INTEGER -> TEXT'));
        expect(body['hasWarnings'], true);
      });

      test('changed nullability produces WARNING comment', () async {
        // Column "name" changes from nullable to NOT NULL.
        final queryA = mockQueryWithTables(
          tableColumns: {
            'items': [
              {'name': 'id', 'type': 'INTEGER', 'pk': 1},
              {'name': 'name', 'type': 'TEXT', 'pk': 0, 'notnull': 0},
            ],
          },
        );
        final queryB = mockQueryWithTables(
          tableColumns: {
            'items': [
              {'name': 'id', 'type': 'INTEGER', 'pk': 1},
              {'name': 'name', 'type': 'TEXT', 'pk': 0, 'notnull': 1},
            ],
          },
        );

        await startServer(queryMain: queryA, queryCompare: queryB);
        final resp = await httpGet(serverPort!, '/api/migration/preview');
        final body = resp.body as Map;
        final migrationSql = body['migrationSql'] as String;

        expect(migrationSql, contains('WARNING'));
        expect(migrationSql, contains('Nullable'));
        expect(body['hasWarnings'], true);
      });

      test('unchanged tables produce no migration statements', () async {
        // Both databases are identical.
        final query = mockQueryWithTables(
          tableColumns: {
            'items': [
              {'name': 'id', 'type': 'INTEGER', 'pk': 1},
              {'name': 'name', 'type': 'TEXT', 'pk': 0},
            ],
          },
        );

        await startServer(queryMain: query, queryCompare: query);
        final resp = await httpGet(serverPort!, '/api/migration/preview');
        final body = resp.body as Map;

        expect(body['migrationSql'], isEmpty);
        expect(body['changeCount'], 0);
        expect(body['hasWarnings'], false);
      });

      test('changeCount excludes comment lines', () async {
        // Dropped table produces both a comment and a DDL statement.
        final queryA = mockQueryWithTables(
          tableColumns: {
            'old_table': [
              {'name': 'id', 'type': 'INTEGER', 'pk': 1},
            ],
          },
        );
        final queryB = mockQueryWithTables(tableColumns: {});

        await startServer(queryMain: queryA, queryCompare: queryB);
        final resp = await httpGet(serverPort!, '/api/migration/preview');
        final body = resp.body as Map;

        // Only the DROP statement counts, not the comment.
        expect(body['changeCount'], 1);
      });

      test('new index produces CREATE INDEX DDL', () async {
        // Same tables, but compare DB adds an index.
        final queryA = mockQueryWithTables(
          tableColumns: {
            'orders': [
              {'name': 'id', 'type': 'INTEGER', 'pk': 1},
              {'name': 'user_id', 'type': 'INTEGER', 'pk': 0},
            ],
          },
        );
        // queryB has an index on user_id — we need to provide
        // both the PRAGMA index_list result and the sqlite_master
        // lookup for the index SQL.
        final baseB = mockQueryWithTables(
          tableColumns: {
            'orders': [
              {'name': 'id', 'type': 'INTEGER', 'pk': 1},
              {'name': 'user_id', 'type': 'INTEGER', 'pk': 0},
            ],
          },
          tableIndexes: {
            'orders': [
              {'name': 'idx_orders_user_id'},
            ],
          },
        );
        // Wrap baseB to also handle the index SQL lookup from
        // sqlite_master (the migration handler queries for the
        // CREATE INDEX statement by name).
        Future<List<Map<String, dynamic>>> queryB(String sql) async {
          if (sql.contains('sqlite_master') &&
              sql.contains("type='index'") &&
              sql.contains("name='idx_orders_user_id'")) {
            return [
              {'sql': 'CREATE INDEX idx_orders_user_id ON "orders"("user_id")'},
            ];
          }
          return baseB(sql);
        }

        await startServer(queryMain: queryA, queryCompare: queryB);
        final resp = await httpGet(serverPort!, '/api/migration/preview');
        final body = resp.body as Map;
        final migrationSql = body['migrationSql'] as String;

        expect(migrationSql, contains('CREATE INDEX idx_orders_user_id'));
      });

      test('dropped index produces DROP INDEX DDL', () async {
        // Main DB has an index, compare DB does not.
        final queryA = mockQueryWithTables(
          tableColumns: {
            'orders': [
              {'name': 'id', 'type': 'INTEGER', 'pk': 1},
              {'name': 'user_id', 'type': 'INTEGER', 'pk': 0},
            ],
          },
          tableIndexes: {
            'orders': [
              {'name': 'idx_orders_user_id'},
            ],
          },
        );
        final queryB = mockQueryWithTables(
          tableColumns: {
            'orders': [
              {'name': 'id', 'type': 'INTEGER', 'pk': 1},
              {'name': 'user_id', 'type': 'INTEGER', 'pk': 0},
            ],
          },
        );

        await startServer(queryMain: queryA, queryCompare: queryB);
        final resp = await httpGet(serverPort!, '/api/migration/preview');
        final body = resp.body as Map;
        final migrationSql = body['migrationSql'] as String;

        expect(
          migrationSql,
          contains('DROP INDEX IF EXISTS "idx_orders_user_id"'),
        );
      });

      test('sqlite_ auto-indexes are filtered from migration', () async {
        // Auto-indexes starting with sqlite_ should be ignored.
        final queryA = mockQueryWithTables(
          tableColumns: {
            'orders': [
              {'name': 'id', 'type': 'INTEGER', 'pk': 1},
            ],
          },
          tableIndexes: {
            'orders': [
              {'name': 'sqlite_autoindex_orders_1'},
            ],
          },
        );
        final queryB = mockQueryWithTables(
          tableColumns: {
            'orders': [
              {'name': 'id', 'type': 'INTEGER', 'pk': 1},
            ],
          },
        );

        await startServer(queryMain: queryA, queryCompare: queryB);
        final resp = await httpGet(serverPort!, '/api/migration/preview');
        final body = resp.body as Map;

        // Auto-indexes should be silently filtered — no DDL generated.
        expect(body['migrationSql'], isEmpty);
        expect(body['changeCount'], 0);
      });

      test('returns 501 when queryCompare is null', () async {
        final query = mockQueryWithTables(
          tableColumns: {
            'items': [
              {'name': 'id', 'type': 'INTEGER', 'pk': 1},
            ],
          },
        );

        // No queryCompare provided.
        await startServer(queryMain: query);
        final resp = await httpGet(serverPort!, '/api/migration/preview');
        expect(resp.status, 501);
      });
    });
  });
}
