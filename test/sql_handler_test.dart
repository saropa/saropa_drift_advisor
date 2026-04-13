// Unit tests for SqlHandler.explainSqlResult — specifically the
// index enrichment added alongside the EXPLAIN QUERY PLAN response.

import 'package:test/test.dart';

import 'package:saropa_drift_advisor/src/server/server_context.dart';
import 'package:saropa_drift_advisor/src/server/sql_handler.dart';

void main() {
  /// Creates a [SqlHandler] backed by a minimal [ServerContext].
  SqlHandler makeHandler() {
    // The ServerContext needs a query callback but explainSqlResult
    // takes its own query parameter, so this stub is unused.
    final ctx = ServerContext(query: (_) async => []);
    return SqlHandler(ctx);
  }

  group('explainSqlResult', () {
    test('returns indexes map keyed by tables in the explain plan', () async {
      final handler = makeHandler();

      // Mock query: EXPLAIN returns SCAN TABLE orders; PRAGMA queries
      // return one index on user_id.
      Future<List<Map<String, dynamic>>> mockQuery(String sql) async {
        if (sql.startsWith('EXPLAIN QUERY PLAN')) {
          return [
            <String, dynamic>{
              'id': 0,
              'parent': 0,
              'notused': 0,
              'detail': 'SCAN TABLE orders',
            },
          ];
        }
        if (sql == 'PRAGMA index_list("orders")') {
          return [
            <String, dynamic>{
              'seq': 0,
              'name': 'idx_orders_user_id',
              'unique': 0,
              'origin': 'c',
              'partial': 0,
            },
          ];
        }
        if (sql == 'PRAGMA index_info("idx_orders_user_id")') {
          return [
            <String, dynamic>{'seqno': 0, 'cid': 1, 'name': 'user_id'},
          ];
        }
        return [];
      }

      final result = await handler.explainSqlResult(
        mockQuery,
        'SELECT * FROM orders',
      );

      expect(result['rows'], isA<List<dynamic>>());
      expect(result['sql'], contains('EXPLAIN'));
      // Index enrichment: "orders" table has one index.
      final indexes = result['indexes'] as Map<String, dynamic>;
      expect(indexes, contains('orders'));
      final orderIndexes = indexes['orders'] as List<dynamic>;
      expect(orderIndexes, hasLength(1));
      final idx = orderIndexes[0] as Map<String, dynamic>;
      expect(idx['name'], 'idx_orders_user_id');
      expect(idx['columns'], ['user_id']);
      expect(idx['unique'], false);
    });

    test('returns empty index list when table has no indexes', () async {
      final handler = makeHandler();

      Future<List<Map<String, dynamic>>> mockQuery(String sql) async {
        if (sql.startsWith('EXPLAIN QUERY PLAN')) {
          return [
            <String, dynamic>{
              'id': 0,
              'parent': 0,
              'notused': 0,
              'detail': 'SCAN TABLE logs',
            },
          ];
        }
        // No indexes on the logs table.
        if (sql.contains('PRAGMA index_list')) return [];
        return [];
      }

      final result = await handler.explainSqlResult(
        mockQuery,
        'SELECT * FROM logs',
      );

      final indexes = result['indexes'] as Map<String, dynamic>;
      expect(indexes, contains('logs'));
      expect(indexes['logs'], isEmpty);
    });

    test('returns indexes for multiple tables in a join', () async {
      final handler = makeHandler();

      Future<List<Map<String, dynamic>>> mockQuery(String sql) async {
        if (sql.startsWith('EXPLAIN QUERY PLAN')) {
          return [
            <String, dynamic>{
              'id': 0,
              'parent': 0,
              'notused': 0,
              'detail': 'SCAN TABLE users',
            },
            <String, dynamic>{
              'id': 1,
              'parent': 0,
              'notused': 0,
              'detail':
                  'SEARCH TABLE orders USING INDEX idx_orders_user_id (user_id=?)',
            },
          ];
        }
        if (sql == 'PRAGMA index_list("users")') return [];
        if (sql == 'PRAGMA index_list("orders")') {
          return [
            <String, dynamic>{
              'seq': 0,
              'name': 'idx_orders_user_id',
              'unique': 0,
            },
          ];
        }
        if (sql == 'PRAGMA index_info("idx_orders_user_id")') {
          return [
            <String, dynamic>{'seqno': 0, 'cid': 1, 'name': 'user_id'},
          ];
        }
        return [];
      }

      final result = await handler.explainSqlResult(
        mockQuery,
        'SELECT * FROM users JOIN orders ON users.id = orders.user_id',
      );

      final indexes = result['indexes'] as Map<String, dynamic>;
      // Both tables should appear in the index map.
      expect(indexes, contains('users'));
      expect(indexes, contains('orders'));
      expect(indexes['users'], isEmpty);
      expect((indexes['orders'] as List<dynamic>), hasLength(1));
    });

    test('returns error for empty SQL', () async {
      final handler = makeHandler();
      final result = await handler.explainSqlResult((_) async => [], '   ');
      expect(result, contains('error'));
    });

    test('returns error for non-read-only SQL', () async {
      final handler = makeHandler();
      final result = await handler.explainSqlResult(
        (_) async => [],
        'DROP TABLE users',
      );
      expect(result, contains('error'));
    });
  });
}
