// Unit tests for IndexAnalyzer — pure static index suggestion logic.
//
// Tests getIndexSuggestionsList() using the shared mockQueryWithTables()
// helper to exercise FK detection, _id suffix heuristics, datetime
// suffix heuristics, priority sorting, deduplication, and edge cases.

import 'package:saropa_drift_advisor/src/server/index_analyzer.dart';
import 'package:test/test.dart';

import 'helpers/test_helpers.dart';

void main() {
  group('IndexAnalyzer', () {
    group('getIndexSuggestionsList', () {
      test('empty database returns empty suggestions', () async {
        // No tables at all — sqlite_master returns nothing.
        final result = await IndexAnalyzer.getIndexSuggestionsList(
          (sql) async => <Map<String, dynamic>>[],
        );

        final suggestions = result['suggestions'] as List;
        expect(suggestions, isEmpty);
        expect(result['tablesAnalyzed'], 0);
      });

      test(
        'table with no FKs and no heuristic columns returns empty',
        () async {
          // Table "items" has columns that don't match any heuristic.
          final result = await IndexAnalyzer.getIndexSuggestionsList(
            mockQueryWithTables(
              tableColumns: {
                'items': [
                  {'name': 'id', 'type': 'INTEGER', 'pk': 1},
                  {'name': 'title', 'type': 'TEXT', 'pk': 0},
                  {'name': 'price', 'type': 'REAL', 'pk': 0},
                ],
              },
            ),
          );

          final suggestions = result['suggestions'] as List;
          expect(suggestions, isEmpty);
          expect(result['tablesAnalyzed'], 1);
        },
      );

      test(
        'FK column without index produces high priority suggestion',
        () async {
          final result = await IndexAnalyzer.getIndexSuggestionsList(
            mockQueryWithTables(
              tableColumns: {
                'orders': [
                  {'name': 'id', 'type': 'INTEGER', 'pk': 1},
                  {'name': 'user_id', 'type': 'INTEGER', 'pk': 0},
                ],
                // Target table must exist for _id dedup test.
                'users': [
                  {'name': 'id', 'type': 'INTEGER', 'pk': 1},
                ],
              },
              tableForeignKeys: {
                'orders': [
                  {'from': 'user_id', 'table': 'users', 'to': 'id'},
                ],
              },
            ),
          );

          final suggestions = result['suggestions'] as List<dynamic>;
          // Should have FK suggestion (high) and _id suffix suggestion
          // (medium) — FK column also ends in _id.
          final fkSuggestion =
              suggestions.firstWhere((s) => (s as Map)['priority'] == 'high')
                  as Map;
          expect(fkSuggestion['table'], 'orders');
          expect(fkSuggestion['column'], 'user_id');
          expect(fkSuggestion['priority'], 'high');
          expect(
            (fkSuggestion['reason'] as String),
            contains('Foreign key without index'),
          );
          expect((fkSuggestion['sql'] as String), contains('CREATE INDEX'));
        },
      );

      test('FK column with existing index produces no suggestion', () async {
        final result = await IndexAnalyzer.getIndexSuggestionsList(
          mockQueryWithTables(
            tableColumns: {
              'orders': [
                {'name': 'id', 'type': 'INTEGER', 'pk': 1},
                {'name': 'user_id', 'type': 'INTEGER', 'pk': 0},
              ],
              // Target table for _id heuristic.
              'users': [
                {'name': 'id', 'type': 'INTEGER', 'pk': 1},
              ],
            },
            tableForeignKeys: {
              'orders': [
                {'from': 'user_id', 'table': 'users', 'to': 'id'},
              ],
            },
            tableIndexes: {
              'orders': [
                {'name': 'idx_orders_user_id'},
              ],
            },
            indexInfoColumns: {
              'idx_orders_user_id': ['user_id'],
            },
          ),
        );

        final suggestions = result['suggestions'] as List;
        // No FK suggestion because user_id is already indexed.
        // Also no _id suggestion because user_id is already indexed.
        expect(suggestions, isEmpty);
      });

      test(
        '_id column not PK and not indexed produces medium suggestion',
        () async {
          final result = await IndexAnalyzer.getIndexSuggestionsList(
            mockQueryWithTables(
              tableColumns: {
                'orders': [
                  {'name': 'id', 'type': 'INTEGER', 'pk': 1},
                  {'name': 'category_id', 'type': 'INTEGER', 'pk': 0},
                ],
                // Target table must exist for _id heuristic to fire.
                'categories': [
                  {'name': 'id', 'type': 'INTEGER', 'pk': 1},
                ],
              },
              // No FK on category_id, so only _id heuristic fires.
            ),
          );

          final suggestions = result['suggestions'] as List<dynamic>;
          expect(suggestions, hasLength(1));
          final s = suggestions.first as Map;
          expect(s['column'], 'category_id');
          expect(s['priority'], 'medium');
          expect((s['reason'] as String), contains('_id'));
        },
      );

      test('_id column that is a PK produces no suggestion', () async {
        // The "item_id" column is PK — should be skipped even though
        // it ends in _id.
        final result = await IndexAnalyzer.getIndexSuggestionsList(
          mockQueryWithTables(
            tableColumns: {
              'items': [
                {'name': 'item_id', 'type': 'INTEGER', 'pk': 1},
                {'name': 'name', 'type': 'TEXT', 'pk': 0},
              ],
            },
          ),
        );

        final suggestions = result['suggestions'] as List;
        // item_id ends in _id but is PK — skip.
        expect(suggestions, isEmpty);
      });

      test('_id column already indexed produces no suggestion', () async {
        final result = await IndexAnalyzer.getIndexSuggestionsList(
          mockQueryWithTables(
            tableColumns: {
              'orders': [
                {'name': 'id', 'type': 'INTEGER', 'pk': 1},
                {'name': 'category_id', 'type': 'INTEGER', 'pk': 0},
              ],
              // Target table for _id heuristic.
              'categories': [
                {'name': 'id', 'type': 'INTEGER', 'pk': 1},
              ],
            },
            tableIndexes: {
              'orders': [
                {'name': 'idx_orders_category_id'},
              ],
            },
            indexInfoColumns: {
              'idx_orders_category_id': ['category_id'],
            },
          ),
        );

        final suggestions = result['suggestions'] as List;
        expect(suggestions, isEmpty);
      });

      test(
        'FK column ending in _id does not produce duplicate suggestion',
        () async {
          // user_id has FK (high) — should NOT also get _id (medium).
          final result = await IndexAnalyzer.getIndexSuggestionsList(
            mockQueryWithTables(
              tableColumns: {
                'orders': [
                  {'name': 'id', 'type': 'INTEGER', 'pk': 1},
                  {'name': 'user_id', 'type': 'INTEGER', 'pk': 0},
                ],
                // Target table for _id heuristic dedup.
                'users': [
                  {'name': 'id', 'type': 'INTEGER', 'pk': 1},
                ],
              },
              tableForeignKeys: {
                'orders': [
                  {'from': 'user_id', 'table': 'users', 'to': 'id'},
                ],
              },
            ),
          );

          final suggestions = result['suggestions'] as List<dynamic>;
          // Only one suggestion for user_id — the FK one (high).
          final userIdSuggestions = suggestions.where(
            (s) => (s as Map)['column'] == 'user_id',
          );
          expect(userIdSuggestions, hasLength(1));
          expect((userIdSuggestions.first as Map)['priority'], 'high');
        },
      );

      test(
        'datetime-pattern columns no longer produce suggestions (bug 002)',
        () async {
          // The blanket datetime heuristic was removed due to a 96%
          // false-positive rate. Datetime index suggestions are now
          // handled by the evidence-based 'unindexed-where-clause'
          // diagnostic instead.
          final result = await IndexAnalyzer.getIndexSuggestionsList(
            mockQueryWithTables(
              tableColumns: {
                'events': [
                  {'name': 'id', 'type': 'INTEGER', 'pk': 1},
                  {'name': 'created_at', 'type': 'TEXT', 'pk': 0},
                  {'name': 'event_date', 'type': 'TEXT', 'pk': 0},
                  {'name': 'event_timestamp', 'type': 'TEXT', 'pk': 0},
                  {'name': 'created', 'type': 'TEXT', 'pk': 0},
                  {'name': 'updated', 'type': 'TEXT', 'pk': 0},
                  {'name': 'deleted', 'type': 'TEXT', 'pk': 0},
                ],
              },
            ),
          );

          final suggestions = result['suggestions'] as List<dynamic>;
          // No suggestions should be produced for datetime-only columns.
          expect(suggestions, isEmpty);
        },
      );

      test('suggestions sorted by priority: high, medium', () async {
        // Table with FK (high) and _id column (medium).
        final result = await IndexAnalyzer.getIndexSuggestionsList(
          mockQueryWithTables(
            tableColumns: {
              'orders': [
                {'name': 'id', 'type': 'INTEGER', 'pk': 1},
                {'name': 'user_id', 'type': 'INTEGER', 'pk': 0},
                {'name': 'category_id', 'type': 'INTEGER', 'pk': 0},
              ],
              // Target tables for _id heuristic.
              'users': [
                {'name': 'id', 'type': 'INTEGER', 'pk': 1},
              ],
              'categories': [
                {'name': 'id', 'type': 'INTEGER', 'pk': 1},
              ],
            },
            tableForeignKeys: {
              'orders': [
                {'from': 'user_id', 'table': 'users', 'to': 'id'},
              ],
            },
          ),
        );

        final suggestions = result['suggestions'] as List<dynamic>;
        expect(suggestions.length, greaterThanOrEqualTo(2));

        // Verify ordering: high first, then medium.
        final priorities = suggestions
            .map((s) => (s as Map)['priority'])
            .toList();
        final highIdx = priorities.indexOf('high');
        final mediumIdx = priorities.indexOf('medium');
        expect(highIdx, lessThan(mediumIdx));
      });

      test('multiple tables each contribute suggestions', () async {
        final result = await IndexAnalyzer.getIndexSuggestionsList(
          mockQueryWithTables(
            tableColumns: {
              'orders': [
                {'name': 'id', 'type': 'INTEGER', 'pk': 1},
                {'name': 'product_id', 'type': 'INTEGER', 'pk': 0},
              ],
              'reviews': [
                {'name': 'id', 'type': 'INTEGER', 'pk': 1},
                {'name': 'author_id', 'type': 'INTEGER', 'pk': 0},
              ],
              // Target tables for _id heuristic.
              'products': [
                {'name': 'id', 'type': 'INTEGER', 'pk': 1},
              ],
              'authors': [
                {'name': 'id', 'type': 'INTEGER', 'pk': 1},
              ],
            },
          ),
        );

        final suggestions = result['suggestions'] as List<dynamic>;
        final tables = suggestions.map((s) => (s as Map)['table']).toSet();
        expect(tables, containsAll(['orders', 'reviews']));
        // 4 tables total: orders, reviews, products, authors.
        expect(result['tablesAnalyzed'], 4);
      });

      test('tablesAnalyzed count matches number of tables', () async {
        final result = await IndexAnalyzer.getIndexSuggestionsList(
          mockQueryWithTables(
            tableColumns: {
              'a': [
                {'name': 'id', 'type': 'INTEGER', 'pk': 1},
              ],
              'b': [
                {'name': 'id', 'type': 'INTEGER', 'pk': 1},
              ],
              'c': [
                {'name': 'id', 'type': 'INTEGER', 'pk': 1},
              ],
            },
          ),
        );

        expect(result['tablesAnalyzed'], 3);
      });

      test('_id suffix match is case-insensitive', () async {
        final result = await IndexAnalyzer.getIndexSuggestionsList(
          mockQueryWithTables(
            tableColumns: {
              'items': [
                {'name': 'id', 'type': 'INTEGER', 'pk': 1},
                {'name': 'Parent_ID', 'type': 'INTEGER', 'pk': 0},
              ],
              // Target table for _id heuristic (Parent_ID → "parent").
              'parents': [
                {'name': 'id', 'type': 'INTEGER', 'pk': 1},
              ],
            },
          ),
        );

        final suggestions = result['suggestions'] as List<dynamic>;
        expect(suggestions, hasLength(1));
        expect((suggestions.first as Map)['column'], 'Parent_ID');
        expect((suggestions.first as Map)['priority'], 'medium');
      });

      test('suggestion SQL includes correct table and column names', () async {
        final result = await IndexAnalyzer.getIndexSuggestionsList(
          mockQueryWithTables(
            tableColumns: {
              'orders': [
                {'name': 'id', 'type': 'INTEGER', 'pk': 1},
                {'name': 'category_id', 'type': 'INTEGER', 'pk': 0},
              ],
              // Target table for _id heuristic.
              'categories': [
                {'name': 'id', 'type': 'INTEGER', 'pk': 1},
              ],
            },
          ),
        );

        final suggestions = result['suggestions'] as List<dynamic>;
        final s = suggestions.first as Map;
        expect(
          s['sql'],
          'CREATE INDEX idx_orders_category_id '
          'ON "orders"("category_id");',
        );
      });

      test(
        '_id column with no matching table produces no suggestion',
        () async {
          // api_id, swapi_id, wikidata_id etc. should NOT trigger
          // the _id heuristic because no "api", "swapi", or
          // "wikidata" table exists.
          final result = await IndexAnalyzer.getIndexSuggestionsList(
            mockQueryWithTables(
              tableColumns: {
                'characters': [
                  {'name': 'id', 'type': 'INTEGER', 'pk': 1},
                  {'name': 'api_id', 'type': 'TEXT', 'pk': 0},
                  {'name': 'swapi_id', 'type': 'TEXT', 'pk': 0},
                  {'name': 'wikidata_id', 'type': 'TEXT', 'pk': 0},
                  {'name': 'google_event_id', 'type': 'TEXT', 'pk': 0},
                ],
              },
              // No target tables for any of these _id columns.
            ),
          );

          final suggestions = result['suggestions'] as List;
          // None of these external reference IDs should fire.
          expect(suggestions, isEmpty);
        },
      );

      test(
        '_id column with matching plural table produces suggestion',
        () async {
          // user_id should fire because table "users" exists
          // (plural form of "user").
          final result = await IndexAnalyzer.getIndexSuggestionsList(
            mockQueryWithTables(
              tableColumns: {
                'orders': [
                  {'name': 'id', 'type': 'INTEGER', 'pk': 1},
                  {'name': 'user_id', 'type': 'INTEGER', 'pk': 0},
                ],
                'users': [
                  {'name': 'id', 'type': 'INTEGER', 'pk': 1},
                ],
              },
            ),
          );

          final suggestions = result['suggestions'] as List<dynamic>;
          expect(suggestions, hasLength(1));
          final s = suggestions.first as Map;
          expect(s['column'], 'user_id');
          expect(s['priority'], 'medium');
        },
      );

      test(
        '_id column with matching singular table produces suggestion',
        () async {
          // category_id should fire because table "category" exists
          // (exact match).
          final result = await IndexAnalyzer.getIndexSuggestionsList(
            mockQueryWithTables(
              tableColumns: {
                'orders': [
                  {'name': 'id', 'type': 'INTEGER', 'pk': 1},
                  {'name': 'category_id', 'type': 'INTEGER', 'pk': 0},
                ],
                'category': [
                  {'name': 'id', 'type': 'INTEGER', 'pk': 1},
                ],
              },
            ),
          );

          final suggestions = result['suggestions'] as List<dynamic>;
          expect(suggestions, hasLength(1));
          expect((suggestions.first as Map)['column'], 'category_id');
        },
      );

      test(
        'plain id column (not ending in _id) produces no suggestion',
        () async {
          // Column named "id" should NOT match the _id suffix heuristic
          // because _id requires an underscore prefix.
          final result = await IndexAnalyzer.getIndexSuggestionsList(
            mockQueryWithTables(
              tableColumns: {
                'items': [
                  {'name': 'id', 'type': 'INTEGER', 'pk': 0},
                  {'name': 'name', 'type': 'TEXT', 'pk': 0},
                ],
              },
            ),
          );

          final suggestions = result['suggestions'] as List;
          // "id" without underscore prefix should not trigger _id heuristic.
          expect(suggestions, isEmpty);
        },
      );
    });
  });
}
