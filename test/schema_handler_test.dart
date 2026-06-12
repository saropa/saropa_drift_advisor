// Unit tests for SchemaHandler — getDiagramData, getSchemaMetadataList,
// and getFullDumpSql.
//
// Tests the data-returning methods directly with mock query callbacks.

import 'package:saropa_drift_advisor/src/server/schema_handler.dart';
import 'package:saropa_drift_advisor/src/server/server_types.dart';
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

      test('enriches columns with driftType from a declared schema', () async {
        // The host declares Drift semantic types; the metadata endpoint joins
        // them onto the PRAGMA columns by name so the NL converter can detect
        // dates/bools exactly (Drift stores both as INTEGER).
        final ctx = createTestContext(
          declaredSchema: () => <DeclaredTable>[
            const DeclaredTable(
              name: 'events',
              columns: <DeclaredColumn>[
                DeclaredColumn(name: 'id', sqlType: 'INTEGER', isPk: true),
                DeclaredColumn(
                  name: 'starts_at',
                  sqlType: 'INTEGER',
                  driftType: 'dateTime',
                ),
                DeclaredColumn(
                  name: 'is_public',
                  sqlType: 'INTEGER',
                  driftType: 'bool',
                ),
              ],
            ),
          ],
        );
        final handler = SchemaHandler(ctx);
        final query = mockQueryWithTables(
          tableColumns: {
            'events': [
              {'name': 'id', 'type': 'INTEGER', 'pk': 1},
              {'name': 'starts_at', 'type': 'INTEGER', 'pk': 0},
              {'name': 'is_public', 'type': 'INTEGER', 'pk': 0},
            ],
          },
          tableCounts: {'events': 3},
        );

        final tables = await handler.getSchemaMetadataList(query);
        final cols = tables.first['columns'] as List;
        Map<String, dynamic> col(String n) =>
            cols.firstWhere((c) => (c as Map)['name'] == n)
                as Map<String, dynamic>;

        expect(col('starts_at')['driftType'], 'dateTime');
        expect(col('is_public')['driftType'], 'bool');
        // No declared driftType for id → key absent, not null.
        expect(col('id').containsKey('driftType'), false);
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

      test('includeForeignKeys embeds fk-meta maps per table', () async {
        final ctx = createTestContext();
        final handler = SchemaHandler(ctx);
        final query = mockQueryWithTables(
          tableColumns: {
            'orders': [
              {'name': 'id', 'type': 'INTEGER', 'pk': 1},
              {'name': 'user_id', 'type': 'INTEGER', 'pk': 0},
            ],
          },
          tableCounts: {'orders': 3},
          tableForeignKeys: {
            'orders': [
              {
                'id': 0,
                'seq': 0,
                'table': 'users',
                'from': 'user_id',
                'to': 'id',
              },
            ],
          },
        );

        final tables = await handler.getSchemaMetadataList(
          query,
          includeForeignKeys: true,
        );

        expect(tables, hasLength(1));
        final fks = tables.first['foreignKeys'] as List<dynamic>;
        expect(fks, hasLength(1));
        final fk0 = fks.first as Map;
        expect(fk0['fromColumn'], 'user_id');
        expect(fk0['toTable'], 'users');
        expect(fk0['toColumn'], 'id');
      });

      // -----------------------------------------------------
      // Feature 78 — relationship-manifest fold into foreignKeys
      // -----------------------------------------------------
      test(
        'folds a relationship manifest into foreignKeys when no PRAGMA FKs',
        () async {
          // A host that links by convention declares no SQLite FKs; the
          // manifest is the authoritative source and must surface as the
          // per-table `foreignKeys` so the web wizard treats it as ground truth.
          final ctx = createTestContext(
            declaredRelationships: () => const <DeclaredRelationship>[
              DeclaredRelationship(
                fromTable: 'phones',
                fromColumn: 'contactUUID',
                toTable: 'contacts',
                toColumn: 'saropaUUID',
                label: 'contact → phones',
              ),
            ],
          );
          final handler = SchemaHandler(ctx);
          final query = mockQueryWithTables(
            tableColumns: {
              'phones': [
                {'name': 'id', 'type': 'INTEGER', 'pk': 1},
                {'name': 'contactUUID', 'type': 'TEXT', 'pk': 0},
              ],
              'contacts': [
                {'name': 'saropaUUID', 'type': 'TEXT', 'pk': 1},
              ],
            },
            tableCounts: {'phones': 2, 'contacts': 1},
          );

          final tables = await handler.getSchemaMetadataList(
            query,
            includeForeignKeys: true,
          );

          final phones = tables.firstWhere((t) => t['name'] == 'phones');
          final fks = phones['foreignKeys'] as List<dynamic>;
          expect(fks, hasLength(1));
          final fk = fks.first as Map;
          expect(fk['fromColumn'], 'contactUUID');
          expect(fk['toTable'], 'contacts');
          expect(fk['toColumn'], 'saropaUUID');
          // Optional label rides along (consumer: diagram / wizard chip text).
          expect(fk['label'], 'contact → phones');

          // A table the manifest doesn't mention has no foreign keys.
          final contacts = tables.firstWhere((t) => t['name'] == 'contacts');
          expect(contacts['foreignKeys'] as List<dynamic>, isEmpty);
        },
      );

      test('merges manifest + PRAGMA FKs, deduping by edge identity', () async {
        // A host may declare some SQLite FKs and manifest the rest. The same
        // edge from both sources must appear once; the manifest's version wins
        // (it carries the label) — resolved precedence for duplicate edges.
        final ctx = createTestContext(
          declaredRelationships: () => const <DeclaredRelationship>[
            // Duplicates the real PRAGMA FK below (same edge identity).
            DeclaredRelationship(
              fromTable: 'orders',
              fromColumn: 'user_id',
              toTable: 'users',
              toColumn: 'id',
              label: 'order → user',
            ),
            // A manifest-only soft edge with no SQLite FK behind it.
            DeclaredRelationship(
              fromTable: 'orders',
              fromColumn: 'coupon_code',
              toTable: 'coupons',
              toColumn: 'code',
            ),
          ],
        );
        final handler = SchemaHandler(ctx);
        final query = mockQueryWithTables(
          tableColumns: {
            'orders': [
              {'name': 'id', 'type': 'INTEGER', 'pk': 1},
              {'name': 'user_id', 'type': 'INTEGER', 'pk': 0},
              {'name': 'coupon_code', 'type': 'TEXT', 'pk': 0},
            ],
          },
          tableCounts: {'orders': 3},
          tableForeignKeys: {
            'orders': [
              {
                'id': 0,
                'seq': 0,
                'table': 'users',
                'from': 'user_id',
                'to': 'id',
              },
            ],
          },
        );

        final tables = await handler.getSchemaMetadataList(
          query,
          includeForeignKeys: true,
        );

        final fks = tables.first['foreignKeys'] as List<dynamic>;
        // Two distinct edges: the deduped user_id→users.id and coupon→coupons.
        expect(fks, hasLength(2));

        final userEdge =
            fks.firstWhere((e) => (e as Map)['fromColumn'] == 'user_id') as Map;
        // Manifest wins on the duplicate edge → its label survives.
        expect(userEdge['toTable'], 'users');
        expect(userEdge['label'], 'order → user');

        final couponEdge =
            fks.firstWhere((e) => (e as Map)['fromColumn'] == 'coupon_code')
                as Map;
        expect(couponEdge['toTable'], 'coupons');
        expect(couponEdge['toColumn'], 'code');
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
