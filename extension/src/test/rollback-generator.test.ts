/**
 * Tests for the migration rollback generator — change types and extractColumnName.
 * See rollback-generator-ordering.test.ts and rollback-generator-dart.test.ts for ordering and Dart output.
 */

import * as assert from 'assert';
import {
  generateRollback,
  extractColumnName,
} from '../rollback/rollback-generator';
import type { ISchemaChange } from '../schema-timeline/schema-timeline-types';
import { col, snap } from './rollback-generator-test-helpers';

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

});
