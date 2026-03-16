/**
 * Tests for the migration rollback generator.
 * Verifies that each schema change type produces the correct reverse SQL,
 * that statements are ordered properly for rollback execution,
 * and that Dart output is correctly formatted.
 */

import * as assert from 'assert';
import {
  generateRollback,
  extractColumnName,
} from '../rollback/rollback-generator';
import type { ISchemaChange, ISchemaSnapshot } from '../schema-timeline/schema-timeline-types';

// ---- Helpers ----

/** Create a schema snapshot with sensible defaults. */
function snap(
  generation: number,
  tables: ISchemaSnapshot['tables'] = [],
  timestamp = '2026-01-01T00:00:00.000Z',
): ISchemaSnapshot {
  return { generation, timestamp, tables };
}

/** Create a column definition for use in snapshots. */
function col(name: string, type = 'TEXT', pk = false) {
  return { name, type, pk };
}

/** Create a foreign key definition for use in snapshots. */
function fk(fromColumn: string, toTable: string, toColumn: string) {
  return { fromColumn, toTable, toColumn };
}

// ---- extractColumnName tests ----

describe('extractColumnName', () => {
  it('extracts column name from "colName" (TYPE) format', () => {
    assert.strictEqual(extractColumnName('"phone" (TEXT)'), 'phone');
  });

  it('extracts column name from bare "colName" format', () => {
    assert.strictEqual(extractColumnName('"age"'), 'age');
  });

  it('returns null when no quoted name is found', () => {
    assert.strictEqual(extractColumnName('no quotes here'), null);
  });

  it('extracts the first quoted name when multiple exist', () => {
    // The regex matches the first quoted string.
    assert.strictEqual(extractColumnName('"first" and "second"'), 'first');
  });
});

// ---- generateRollback tests ----

describe('generateRollback', () => {
  // ---- Empty / no-op cases ----

  it('returns empty result for empty changes', () => {
    const result = generateRollback([], snap(1), snap(2));
    assert.deepStrictEqual(result.sql, []);
    assert.strictEqual(result.dart, '');
    assert.deepStrictEqual(result.warnings, []);
  });

  // ---- table_added → DROP TABLE ----

  it('generates DROP TABLE for table_added', () => {
    const changes: ISchemaChange[] = [
      { type: 'table_added', table: 'users', detail: '' },
    ];
    const result = generateRollback(changes, snap(1), snap(2));

    assert.strictEqual(result.sql.length, 1);
    assert.strictEqual(result.sql[0], 'DROP TABLE IF EXISTS "users";');
    // Should have no warnings for a simple drop.
    assert.strictEqual(result.warnings.length, 0);
  });

  // ---- table_dropped → CREATE TABLE ----

  it('generates CREATE TABLE for table_dropped from before snapshot', () => {
    const before = snap(1, [
      {
        name: 'orders',
        columns: [col('id', 'INTEGER', true), col('total', 'REAL')],
        fks: [],
      },
    ]);
    const after = snap(2, []);
    const changes: ISchemaChange[] = [
      { type: 'table_dropped', table: 'orders', detail: '' },
    ];

    const result = generateRollback(changes, before, after);

    // Should produce a CREATE TABLE statement.
    assert.strictEqual(result.sql.length, 1);
    assert.ok(result.sql[0].includes('CREATE TABLE "orders"'));
    assert.ok(result.sql[0].includes('"id" INTEGER PRIMARY KEY'));
    assert.ok(result.sql[0].includes('"total" REAL'));
    // Should warn about potentially missing constraints.
    assert.ok(result.warnings.some((w) => w.includes('orders')));
  });

  it('warns when table_dropped has no column data in snapshot', () => {
    // The "before" snapshot has no matching table data.
    const before = snap(1, []);
    const after = snap(2, []);
    const changes: ISchemaChange[] = [
      { type: 'table_dropped', table: 'missing_table', detail: '' },
    ];

    const result = generateRollback(changes, before, after);

    // Should produce a comment (not executable SQL).
    assert.ok(result.sql[0].startsWith('--'));
    assert.ok(result.warnings.some((w) => w.includes('missing_table')));
  });

  // ---- column_added → DROP COLUMN ----

  it('generates ALTER TABLE DROP COLUMN for column_added', () => {
    const changes: ISchemaChange[] = [
      { type: 'column_added', table: 'users', detail: '"phone" (TEXT)' },
    ];
    const result = generateRollback(changes, snap(1), snap(2));

    assert.strictEqual(result.sql.length, 1);
    assert.strictEqual(
      result.sql[0],
      'ALTER TABLE "users" DROP COLUMN "phone";',
    );
    // Should warn about SQLite 3.35.0 requirement.
    assert.ok(result.warnings.some((w) => w.includes('3.35.0')));
  });

  it('handles column_added with unparseable detail', () => {
    const changes: ISchemaChange[] = [
      { type: 'column_added', table: 'users', detail: 'no quotes' },
    ];
    const result = generateRollback(changes, snap(1), snap(2));

    // Should produce a comment explaining the parse failure.
    assert.ok(result.sql[0].startsWith('--'));
  });

  // ---- column_removed → ADD COLUMN ----

  it('generates ALTER TABLE ADD COLUMN for column_removed', () => {
    const before = snap(1, [
      {
        name: 'users',
        columns: [col('id', 'INTEGER', true), col('age', 'INTEGER')],
        fks: [],
      },
    ]);
    const after = snap(2, [
      { name: 'users', columns: [col('id', 'INTEGER', true)], fks: [] },
    ]);
    const changes: ISchemaChange[] = [
      { type: 'column_removed', table: 'users', detail: '"age"' },
    ];

    const result = generateRollback(changes, before, after);

    assert.strictEqual(result.sql.length, 1);
    assert.strictEqual(
      result.sql[0],
      'ALTER TABLE "users" ADD COLUMN "age" INTEGER;',
    );
  });

  it('defaults to TEXT when column type not found in snapshot', () => {
    // Before snapshot has no "users" table, so column type is unknown.
    const before = snap(1, []);
    const changes: ISchemaChange[] = [
      { type: 'column_removed', table: 'users', detail: '"age"' },
    ];

    const result = generateRollback(changes, before, snap(2));

    // Should default to TEXT and warn about it.
    assert.ok(result.sql[0].includes('TEXT'));
    assert.ok(result.warnings.some((w) => w.includes('defaulted to TEXT')));
  });

  // ---- column_type_changed → warning only ----

  it('generates warning comment for column_type_changed', () => {
    const changes: ISchemaChange[] = [
      {
        type: 'column_type_changed',
        table: 'products',
        detail: '"price" REAL → TEXT',
      },
    ];
    const result = generateRollback(changes, snap(1), snap(2));

    // Should produce comment lines, not executable SQL.
    assert.ok(result.sql.every((s) => s.startsWith('--')));
    assert.ok(result.warnings.some((w) => w.includes('cannot be reversed')));
  });

  // ---- fk_added → warning only ----

  it('generates warning comment for fk_added', () => {
    const changes: ISchemaChange[] = [
      { type: 'fk_added', table: 'orders', detail: 'user_id → users.id' },
    ];
    const result = generateRollback(changes, snap(1), snap(2));

    assert.ok(result.sql.every((s) => s.startsWith('--')));
    assert.ok(result.warnings.some((w) => w.includes('FK change')));
  });

  // ---- fk_removed → warning only ----

  it('generates warning comment for fk_removed', () => {
    const changes: ISchemaChange[] = [
      { type: 'fk_removed', table: 'orders', detail: 'user_id → users.id' },
    ];
    const result = generateRollback(changes, snap(1), snap(2));

    assert.ok(result.sql.every((s) => s.startsWith('--')));
    assert.ok(result.warnings.some((w) => w.includes('FK change')));
  });

  // ---- Rollback ordering ----

  it('orders rollback: drops before recreates', () => {
    // Forward migration: added a table AND dropped a table.
    // Rollback should drop the added table first, then recreate the dropped one.
    const before = snap(1, [
      { name: 'old_table', columns: [col('id', 'INTEGER', true)], fks: [] },
    ]);
    const after = snap(2, [
      { name: 'new_table', columns: [col('id', 'INTEGER', true)], fks: [] },
    ]);
    const changes: ISchemaChange[] = [
      { type: 'table_dropped', table: 'old_table', detail: '' },
      { type: 'table_added', table: 'new_table', detail: '' },
    ];

    const result = generateRollback(changes, before, after);

    // DROP TABLE (undoing table_added) should come before
    // CREATE TABLE (undoing table_dropped).
    const dropIdx = result.sql.findIndex((s) => s.includes('DROP TABLE'));
    const createIdx = result.sql.findIndex((s) => s.includes('CREATE TABLE'));
    assert.ok(dropIdx >= 0, 'Expected a DROP TABLE statement');
    assert.ok(createIdx >= 0, 'Expected a CREATE TABLE statement');
    assert.ok(
      dropIdx < createIdx,
      `DROP TABLE (${dropIdx}) should come before CREATE TABLE (${createIdx})`,
    );
  });

  it('orders column drops before column adds', () => {
    const before = snap(1, [
      {
        name: 't',
        columns: [col('id'), col('removed_col', 'INTEGER')],
        fks: [],
      },
    ]);
    const changes: ISchemaChange[] = [
      { type: 'column_removed', table: 't', detail: '"removed_col"' },
      { type: 'column_added', table: 't', detail: '"added_col" (TEXT)' },
    ];

    const result = generateRollback(changes, before, snap(2));

    // DROP COLUMN (undoing column_added) should come before
    // ADD COLUMN (undoing column_removed).
    const dropIdx = result.sql.findIndex((s) => s.includes('DROP COLUMN'));
    const addIdx = result.sql.findIndex((s) => s.includes('ADD COLUMN'));
    assert.ok(dropIdx >= 0, 'Expected a DROP COLUMN statement');
    assert.ok(addIdx >= 0, 'Expected an ADD COLUMN statement');
    assert.ok(
      dropIdx < addIdx,
      `DROP COLUMN (${dropIdx}) should come before ADD COLUMN (${addIdx})`,
    );
  });

  // ---- Multiple changes ----

  it('handles multiple changes of different types', () => {
    const before = snap(1, [
      {
        name: 'users',
        columns: [col('id', 'INTEGER', true), col('email', 'TEXT')],
        fks: [],
      },
    ]);
    const changes: ISchemaChange[] = [
      { type: 'table_added', table: 'sessions', detail: '' },
      { type: 'column_added', table: 'users', detail: '"phone" (TEXT)' },
      { type: 'column_removed', table: 'users', detail: '"email"' },
    ];

    const result = generateRollback(changes, before, snap(2));

    // Should produce 3 SQL statements.
    assert.strictEqual(result.sql.length, 3);
    // One DROP TABLE, one DROP COLUMN, one ADD COLUMN.
    assert.ok(result.sql.some((s) => s.includes('DROP TABLE')));
    assert.ok(result.sql.some((s) => s.includes('DROP COLUMN')));
    assert.ok(result.sql.some((s) => s.includes('ADD COLUMN')));
  });

  // ---- Warning deduplication ----

  it('deduplicates identical warnings', () => {
    // Two column_added changes should produce the same SQLite 3.35 warning,
    // but the result should only contain it once.
    const changes: ISchemaChange[] = [
      { type: 'column_added', table: 'a', detail: '"col1" (TEXT)' },
      { type: 'column_added', table: 'b', detail: '"col2" (TEXT)' },
    ];
    const result = generateRollback(changes, snap(1), snap(2));

    // Both DROP COLUMN statements generated.
    assert.strictEqual(result.sql.length, 2);
    // But the SQLite 3.35 warning should appear only once.
    const sqlite35Warnings = result.warnings.filter((w) =>
      w.includes('3.35.0'),
    );
    assert.strictEqual(
      sqlite35Warnings.length,
      1,
      'SQLite 3.35 warning should be deduplicated',
    );
  });

  // ---- Dart output ----

  it('generates valid Dart with import and customStatement calls', () => {
    const changes: ISchemaChange[] = [
      { type: 'table_added', table: 'users', detail: '' },
    ];
    const result = generateRollback(changes, snap(1), snap(2));

    // Check for Dart import.
    assert.ok(result.dart.includes("import 'package:drift/drift.dart';"));
    // Check for generation comment.
    assert.ok(result.dart.includes('generation 1 to 2'));
    // Check for customStatement() wrapper.
    assert.ok(result.dart.includes('await customStatement('));
    // Check that the SQL is embedded in the Dart output.
    assert.ok(result.dart.includes('DROP TABLE IF EXISTS'));
  });

  it('escapes single quotes in single-line Dart string literals', () => {
    // Single-line SQL (DROP TABLE) uses regular Dart strings which need
    // single-quote escaping. Table names with apostrophes are unusual
    // but the escaping must still work.
    const changes: ISchemaChange[] = [
      { type: 'table_added', table: "it's_a_table", detail: '' },
    ];

    const result = generateRollback(changes, snap(1), snap(2));

    // The Dart output should have the single quote escaped.
    assert.ok(
      result.dart.includes("\\'"),
      'Single quotes should be escaped in Dart strings',
    );
  });

  it('uses triple-quote strings for multi-line SQL in Dart', () => {
    // Multi-line SQL (CREATE TABLE) should use Dart triple-quote strings
    // to match the migration-codegen.ts pattern.
    const before = snap(1, [
      {
        name: 'items',
        columns: [col('id', 'INTEGER', true), col('name', 'TEXT')],
        fks: [],
      },
    ]);
    const changes: ISchemaChange[] = [
      { type: 'table_dropped', table: 'items', detail: '' },
    ];

    const result = generateRollback(changes, before, snap(2));

    // Should use triple-quote wrapper for multi-line CREATE TABLE.
    assert.ok(
      result.dart.includes("await customStatement('''"),
      'Multi-line SQL should use triple-quote Dart strings',
    );
    assert.ok(
      result.dart.includes("''');"),
      'Triple-quote block should be properly closed',
    );
  });

  it('converts SQL comments to Dart comments', () => {
    const changes: ISchemaChange[] = [
      {
        type: 'column_type_changed',
        table: 't',
        detail: '"col" INTEGER → TEXT',
      },
    ];
    const result = generateRollback(changes, snap(1), snap(2));

    // SQL comments (--) should become Dart comments (//).
    assert.ok(result.dart.includes('//'));
    // Should NOT wrap comments in customStatement().
    assert.ok(!result.dart.includes("customStatement(\n  '--"));
  });

  // ---- CREATE TABLE column formatting ----

  it('includes PRIMARY KEY annotation in recreated table', () => {
    const before = snap(1, [
      {
        name: 'items',
        columns: [col('id', 'INTEGER', true), col('name', 'TEXT')],
        fks: [],
      },
    ]);
    const changes: ISchemaChange[] = [
      { type: 'table_dropped', table: 'items', detail: '' },
    ];

    const result = generateRollback(changes, before, snap(2));

    assert.ok(result.sql[0].includes('PRIMARY KEY'));
    // The non-PK column should not have PRIMARY KEY.
    assert.ok(result.sql[0].includes('"name" TEXT'));
    // Verify it doesn't say "name" TEXT PRIMARY KEY.
    assert.ok(!result.sql[0].includes('"name" TEXT PRIMARY KEY'));
  });
});
