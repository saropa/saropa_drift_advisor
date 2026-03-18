// Unit tests for SchemaHandler — getDiagramData, getSchemaMetadataList,
// and getFullDumpSql.
//
// Tests the data-returning methods directly with mock query callbacks.

import 'package:saropa_drift_advisor/src/server/schema_handler.dart';
import 'package:test/test.dart';

import 'helpers/test_helpers.dart';

void main() {
  group('SchemaHandler', () {
    // -------------------------------------------------------
    // getDiagramData
    // -------------------------------------------------------
    group('getDiagramData', () {
      test('returns tables with columns and PK booleans', () async {
        final ctx = createTestContext();
        final handler = SchemaHandler(ctx);
        final query = mockQueryWithTables(
          tableColumns: {
            'users': [
              {'name': 'id', 'type': 'INTEGER', 'pk': 1},
              {'name': 'name', 'type': 'TEXT', 'pk': 0},
            ],
          },
        );

        final data = await handler.getDiagramData(query);

        final tables = data['tables'] as List;
        expect(tables, hasLength(1));
        final table = tables.first as Map;
        expect(table['name'], 'users');

        final columns = table['columns'] as List;
        expect(columns, hasLength(2));

        // id column should have pk: true.
        final idCol =
            columns.firstWhere((c) => (c as Map)['name'] == 'id') as Map;
        expect(idCol['pk'], true);

        // name column should have pk: false.
        final nameCol =
            columns.firstWhere((c) => (c as Map)['name'] == 'name') as Map;
        expect(nameCol['pk'], false);
      });

      test('returns foreign key relationships', () async {
        final ctx = createTestContext();
        final handler = SchemaHandler(ctx);
        final query = mockQueryWithTables(
          tableColumns: {
            'orders': [
              {'name': 'id', 'type': 'INTEGER', 'pk': 1},
              {'name': 'user_id', 'type': 'INTEGER', 'pk': 0},
            ],
            'users': [
              {'name': 'id', 'type': 'INTEGER', 'pk': 1},
            ],
          },
          tableForeignKeys: {
            'orders': [
              {'from': 'user_id', 'table': 'users', 'to': 'id'},
            ],
          },
        );

        final data = await handler.getDiagramData(query);
        final foreignKeys = data['foreignKeys'] as List;

        expect(foreignKeys, hasLength(1));
        final fk = foreignKeys.first as Map;
        expect(fk['fromTable'], 'orders');
        expect(fk['fromColumn'], 'user_id');
        expect(fk['toTable'], 'users');
        expect(fk['toColumn'], 'id');
      });

      test('table with no FKs returns empty foreignKeys', () async {
        final ctx = createTestContext();
        final handler = SchemaHandler(ctx);
        final query = mockQueryWithTables(
          tableColumns: {
            'items': [
              {'name': 'id', 'type': 'INTEGER', 'pk': 1},
              {'name': 'name', 'type': 'TEXT', 'pk': 0},
            ],
          },
        );

        final data = await handler.getDiagramData(query);
        final foreignKeys = data['foreignKeys'] as List;

        expect(foreignKeys, isEmpty);
      });

      test('empty database returns empty tables and foreignKeys', () async {
        final ctx = createTestContext();
        final handler = SchemaHandler(ctx);
        // No tables at all.
        final query = mockQueryWithTables(tableColumns: {});

        final data = await handler.getDiagramData(query);

        expect(data['tables'] as List, isEmpty);
        expect(data['foreignKeys'] as List, isEmpty);
      });

      test(
        'parses PRAGMA table_info with uppercase NAME/TYPE/PK keys',
        () async {
          // Some drivers return PRAGMA table_info with uppercase column names.
          final ctx = createTestContext();
          final handler = SchemaHandler(ctx);
          final query = (String sql) async {
            if (sql.contains("type='table'") && sql.contains('ORDER BY name')) {
              return [
                <String, dynamic>{'name': 'items'},
              ];
            }
            if (sql.contains('PRAGMA table_info')) {
              return [
                <String, dynamic>{
                  'cid': 0,
                  'NAME': 'id',
                  'TYPE': 'INTEGER',
                  'PK': 1,
                },
                <String, dynamic>{
                  'cid': 1,
                  'NAME': 'label',
                  'TYPE': 'TEXT',
                  'PK': 0,
                },
              ];
            }
            if (sql.contains('PRAGMA foreign_key_list')) {
              return <Map<String, dynamic>>[];
            }
            return <Map<String, dynamic>>[];
          };

          final data = await handler.getDiagramData(query);

          final tables = data['tables'] as List;
          expect(tables, hasLength(1));
          final columns = (tables.first as Map)['columns'] as List;
          expect(columns, hasLength(2));
          expect((columns[0] as Map)['name'], 'id');
          expect((columns[0] as Map)['type'], 'INTEGER');
          expect((columns[0] as Map)['pk'], true);
          expect((columns[1] as Map)['name'], 'label');
          expect((columns[1] as Map)['type'], 'TEXT');
          expect((columns[1] as Map)['pk'], false);
        },
      );

      test('FK query error is swallowed and tables still returned', () async {
        final ctx = createTestContext();
        final handler = SchemaHandler(ctx);

        // Custom query that throws on FK query but works for others.
        var callCount = 0;
        final query = (String sql) async {
          if (sql.contains("type='table'") && sql.contains('ORDER BY name')) {
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
          if (sql.contains('PRAGMA foreign_key_list')) {
            callCount++;
            throw Exception('Simulated FK query failure');
          }
          return <Map<String, dynamic>>[];
        };

        // Should not throw — error is swallowed.
        final data = await handler.getDiagramData(query);

        expect(data['tables'] as List, hasLength(1));
        expect(data['foreignKeys'] as List, isEmpty);
        // Verify the FK query was actually attempted.
        expect(callCount, 1);
      });
    });

    // -------------------------------------------------------
    // getSchemaMetadataList
    // -------------------------------------------------------
    group('getSchemaMetadataList', () {
      test('returns table name, columns, and rowCount', () async {
        final ctx = createTestContext();
        final handler = SchemaHandler(ctx);
        final query = mockQueryWithTables(
          tableColumns: {
            'items': [
              {'name': 'id', 'type': 'INTEGER', 'pk': 1},
              {'name': 'title', 'type': 'TEXT', 'pk': 0},
            ],
          },
          tableCounts: {'items': 42},
        );

        final tables = await handler.getSchemaMetadataList(query);

        expect(tables, hasLength(1));
        final table = tables.first;
        expect(table['name'], 'items');
        expect(table['rowCount'], 42);

        final columns = table['columns'] as List;
        expect(columns, hasLength(2));

        // Verify PK is boolean.
        final idCol =
            columns.firstWhere((c) => (c as Map)['name'] == 'id') as Map;
        expect(idCol['pk'], true);
      });

      test('handles zero-row table', () async {
        final ctx = createTestContext();
        final handler = SchemaHandler(ctx);
        final query = mockQueryWithTables(
          tableColumns: {
            'empty_table': [
              {'name': 'id', 'type': 'INTEGER', 'pk': 1},
            ],
          },
          tableCounts: {'empty_table': 0},
        );

        final tables = await handler.getSchemaMetadataList(query);

        expect(tables.first['rowCount'], 0);
      });

      test('handles multiple tables', () async {
        final ctx = createTestContext();
        final handler = SchemaHandler(ctx);
        final query = mockQueryWithTables(
          tableColumns: {
            'alpha': [
              {'name': 'id', 'type': 'INTEGER', 'pk': 1},
            ],
            'beta': [
              {'name': 'id', 'type': 'INTEGER', 'pk': 1},
            ],
          },
          tableCounts: {'alpha': 10, 'beta': 20},
        );

        final tables = await handler.getSchemaMetadataList(query);

        expect(tables, hasLength(2));
        final names = tables.map((t) => t['name']).toSet();
        expect(names, containsAll(['alpha', 'beta']));
      });
    });

    // -------------------------------------------------------
    // getFullDumpSql
    // -------------------------------------------------------
    group('getFullDumpSql', () {
      test('includes schema DDL at top', () async {
        final ctx = createTestContext();
        final handler = SchemaHandler(ctx);
        final query = mockQueryWithTables(
          tableColumns: {
            'items': [
              {'name': 'id', 'type': 'INTEGER', 'pk': 1},
            ],
          },
        );

        final sql = await handler.getFullDumpSql(query);

        // Schema DDL should be present at the top.
        expect(sql, contains('CREATE TABLE items'));
        expect(sql, contains('-- Data dump'));
      });

      test('includes INSERT statements for each row', () async {
        final ctx = createTestContext();
        final handler = SchemaHandler(ctx);
        final query = mockQueryWithTables(
          tableColumns: {
            'items': [
              {'name': 'id', 'type': 'INTEGER', 'pk': 1},
              {'name': 'title', 'type': 'TEXT', 'pk': 0},
            ],
          },
          tableData: {
            'items': [
              {'id': 1, 'title': 'Widget'},
              {'id': 2, 'title': 'Gadget'},
            ],
          },
        );

        final sql = await handler.getFullDumpSql(query);

        // INSERT must use quoted column names (SQLite identifier safety).
        expect(sql, contains('INSERT INTO "items"'));
        expect(sql, contains('"id"'));
        expect(sql, contains('"title"'));
        // Values must be present; string values single-quoted.
        expect(sql, contains('1'));
        expect(sql, contains("'Widget'"));
        expect(sql, contains("'Gadget'"));
        // Exact INSERT line shape: INSERT INTO "table" ("col1", "col2") VALUES (...).
        expect(
          sql,
          matches(
            RegExp(r'INSERT INTO "items"\s+\("id",\s*"title"\)\s*VALUES'),
          ),
        );
      });

      test('INSERT values escape single quotes in strings', () async {
        final ctx = createTestContext();
        final handler = SchemaHandler(ctx);
        final query = mockQueryWithTables(
          tableColumns: {
            'items': [
              {'name': 'id', 'type': 'INTEGER', 'pk': 1},
              {'name': 'title', 'type': 'TEXT', 'pk': 0},
            ],
          },
          tableData: {
            'items': [
              {'id': 1, 'title': "O'Brien"},
            ],
          },
        );

        final sql = await handler.getFullDumpSql(query);

        // Single quote in value must be escaped (doubled) for SQL.
        expect(sql, contains("'O''Brien'"));
      });

      test('table with no rows produces no INSERT statements', () async {
        final ctx = createTestContext();
        final handler = SchemaHandler(ctx);
        final query = mockQueryWithTables(
          tableColumns: {
            'empty_table': [
              {'name': 'id', 'type': 'INTEGER', 'pk': 1},
            ],
          },
          // No tableData for empty_table → SELECT * returns empty.
        );

        final sql = await handler.getFullDumpSql(query);

        // Should still have schema but no INSERT.
        expect(sql, contains('CREATE TABLE empty_table'));
        expect(sql, isNot(contains('INSERT INTO "empty_table"')));
      });

      test('handles multiple tables', () async {
        final ctx = createTestContext();
        final handler = SchemaHandler(ctx);
        final query = mockQueryWithTables(
          tableColumns: {
            'alpha': [
              {'name': 'id', 'type': 'INTEGER', 'pk': 1},
            ],
            'beta': [
              {'name': 'id', 'type': 'INTEGER', 'pk': 1},
            ],
          },
          tableData: {
            'alpha': [
              {'id': 1},
            ],
            'beta': [
              {'id': 2},
            ],
          },
        );

        final sql = await handler.getFullDumpSql(query);

        expect(sql, contains('INSERT INTO "alpha"'));
        expect(sql, contains('INSERT INTO "beta"'));
      });
    });
  });
}
