// Unit tests for TableHandler — getTableFkMetaList filtering logic.
//
// Tests the data-returning method directly with mock query callbacks.

import 'package:saropa_drift_advisor/src/server/table_handler.dart';
import 'package:test/test.dart';

import 'helpers/test_helpers.dart';

void main() {
  group('TableHandler', () {
    group('getTableFkMetaList', () {
      test('returns FK metadata with fromColumn, toTable, toColumn', () async {
        final ctx = createTestContext();
        final handler = TableHandler(ctx);
        final query = mockQueryWithTables(
          tableColumns: {
            'orders': [
              {'name': 'id', 'type': 'INTEGER', 'pk': 1},
              {'name': 'user_id', 'type': 'INTEGER', 'pk': 0},
            ],
          },
          tableForeignKeys: {
            'orders': [
              {'from': 'user_id', 'table': 'users', 'to': 'id'},
            ],
          },
        );

        final fks = await handler.getTableFkMetaList(
          query: query,
          tableName: 'orders',
        );

        expect(fks, hasLength(1));
        expect(fks.first['fromColumn'], 'user_id');
        expect(fks.first['toTable'], 'users');
        expect(fks.first['toColumn'], 'id');
      });

      test('returns empty list for table with no FKs', () async {
        final ctx = createTestContext();
        final handler = TableHandler(ctx);
        final query = mockQueryWithTables(
          tableColumns: {
            'items': [
              {'name': 'id', 'type': 'INTEGER', 'pk': 1},
            ],
          },
        );

        final fks = await handler.getTableFkMetaList(
          query: query,
          tableName: 'items',
        );

        expect(fks, isEmpty);
      });

      test('filters out FKs with null fromCol, toTable, or toCol', () async {
        final ctx = createTestContext();
        final handler = TableHandler(ctx);
        final query = mockQueryWithTables(
          tableColumns: {
            'orders': [
              {'name': 'id', 'type': 'INTEGER', 'pk': 1},
            ],
          },
          tableForeignKeys: {
            'orders': [
              // Valid FK.
              {'from': 'user_id', 'table': 'users', 'to': 'id'},
              // Missing 'from' field.
              {'from': null, 'table': 'categories', 'to': 'id'},
              // Missing 'table' field.
              {'from': 'cat_id', 'table': null, 'to': 'id'},
              // Missing 'to' field.
              {'from': 'tag_id', 'table': 'tags', 'to': null},
            ],
          },
        );

        final fks = await handler.getTableFkMetaList(
          query: query,
          tableName: 'orders',
        );

        // Only the valid FK should survive.
        expect(fks, hasLength(1));
        expect(fks.first['fromColumn'], 'user_id');
      });

      test('handles multiple FKs on same table', () async {
        final ctx = createTestContext();
        final handler = TableHandler(ctx);
        final query = mockQueryWithTables(
          tableColumns: {
            'orders': [
              {'name': 'id', 'type': 'INTEGER', 'pk': 1},
              {'name': 'user_id', 'type': 'INTEGER', 'pk': 0},
              {'name': 'product_id', 'type': 'INTEGER', 'pk': 0},
            ],
          },
          tableForeignKeys: {
            'orders': [
              {'from': 'user_id', 'table': 'users', 'to': 'id'},
              {'from': 'product_id', 'table': 'products', 'to': 'id'},
            ],
          },
        );

        final fks = await handler.getTableFkMetaList(
          query: query,
          tableName: 'orders',
        );

        expect(fks, hasLength(2));
        final fromCols = fks.map((fk) => fk['fromColumn']).toSet();
        expect(fromCols, containsAll(['user_id', 'product_id']));
      });
    });
  });
}
