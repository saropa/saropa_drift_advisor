// Tests for the best-effort table-name extraction (Feature 80 hardening),
// split into lib/src/server/table_name_extractor.dart:
//   - CTE safety: a CTE alias is NEVER recorded as a table, real tables
//     inside CTE bodies and the main query still are, across multiple
//     comma-separated CTEs, RECURSIVE, column lists, and quoted names.
//   - Derived tables (`FROM (SELECT ...)`) yield no fake name.
//   - Schema-qualified references attribute the table, not the schema.
//   - The tracker's public pass-through keeps returning identical results,
//     so feed points that call TableActivityTracker.extractTableNames are
//     unaffected by the file split.

import 'package:test/test.dart';

import 'package:saropa_drift_advisor/src/server/table_activity_tracker.dart';
import 'package:saropa_drift_advisor/src/server/table_name_extractor.dart';

void main() {
  group('CTE-safe extraction', () {
    test('CTE alias is never recorded; real table inside the body is', () {
      expect(
        TableNameExtractor.extractTableNames(
          'WITH cte AS (SELECT * FROM real_table) SELECT * FROM cte',
        ),
        {'real_table'},
      );
    });

    test('multiple comma-separated CTEs, with and without column lists', () {
      expect(
        TableNameExtractor.extractTableNames(
          'WITH a AS (SELECT * FROM t1), '
          'b(x, y) AS (SELECT id, n FROM t2) '
          'SELECT * FROM a JOIN b ON a.id = b.x JOIN t3 ON 1',
        ),
        {'t1', 't2', 't3'},
      );
    });

    test('RECURSIVE CTE: alias excluded even when self-referenced; the '
        'seed/recursive real tables are kept', () {
      // Self-referencing counter CTE touching no real table -> nothing.
      expect(
        TableNameExtractor.extractTableNames(
          'WITH RECURSIVE cnt(x) AS ('
          'SELECT 1 UNION ALL SELECT x + 1 FROM cnt WHERE x < 10'
          ') SELECT x FROM cnt',
        ),
        isEmpty,
      );
      // Recursive tree walk: only the real base table is attributed.
      expect(
        TableNameExtractor.extractTableNames(
          'WITH RECURSIVE tree(id) AS ('
          'SELECT id FROM nodes WHERE parent IS NULL '
          'UNION ALL '
          'SELECT n.id FROM nodes n JOIN tree ON n.parent = tree.id'
          ') SELECT * FROM tree',
        ),
        {'nodes'},
      );
    });

    test('CTE resolution is case-insensitive, matching SQLite', () {
      expect(
        TableNameExtractor.extractTableNames(
          'WITH Cte AS (SELECT * FROM items) SELECT * FROM CTE',
        ),
        {'items'},
      );
    });

    test('quoted CTE names are excluded too (masking unquotes them)', () {
      expect(
        TableNameExtractor.extractTableNames(
          'WITH "cte" AS (SELECT * FROM items) SELECT * FROM "cte"',
        ),
        {'items'},
      );
    });

    test('WITH prologue on DML attributes the write target and the CTE '
        'body table, never the alias', () {
      expect(
        TableNameExtractor.extractTableNames(
          'WITH doomed AS (SELECT id FROM users WHERE stale = 1) '
          'DELETE FROM orders WHERE user_id IN (SELECT id FROM doomed)',
        ),
        {'users', 'orders'},
      );
    });
  });

  group('derived tables and qualifiers', () {
    test('FROM (SELECT ...) derived table yields no fake name', () {
      expect(
        TableNameExtractor.extractTableNames('SELECT * FROM (SELECT 1) AS sub'),
        isEmpty,
      );
      // Derived table joined to a real table: only the real one shows.
      expect(
        TableNameExtractor.extractTableNames(
          'SELECT * FROM (SELECT id FROM inner_t) s JOIN outer_t ON 1',
        ),
        {'inner_t', 'outer_t'},
      );
    });

    test('schema-qualified reference attributes the table, not the schema', () {
      expect(TableNameExtractor.extractTableNames('SELECT * FROM main.items'), {
        'items',
      });
      expect(
        TableNameExtractor.extractTableNames(
          'SELECT * FROM main."items" JOIN temp.users ON 1',
        ),
        {'items', 'users'},
      );
    });
  });

  group('tracker pass-through', () {
    test('TableActivityTracker.extractTableNames delegates unchanged', () {
      const sql =
          'WITH cte AS (SELECT * FROM real_table) SELECT * FROM cte '
          'JOIN "users" u ON 1';
      expect(
        TableActivityTracker.extractTableNames(sql),
        TableNameExtractor.extractTableNames(sql),
      );
      expect(TableActivityTracker.extractTableNames(sql), {
        'real_table',
        'users',
      });
    });
  });
}
