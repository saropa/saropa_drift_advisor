/**
 * Rollback generator tests: ordering and multi-change behavior.
 */

import * as assert from 'assert';
import { generateRollback } from '../rollback/rollback-generator';
import type { ISchemaChange } from '../schema-timeline/schema-timeline-types';
import { col, snap } from './rollback-generator-test-helpers';

describe('generateRollback — ordering & multi-change', () => {
  it('orders rollback: drops before recreates', () => {
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

    const dropIdx = result.sql.findIndex((s) => s.includes('DROP COLUMN'));
    const addIdx = result.sql.findIndex((s) => s.includes('ADD COLUMN'));
    assert.ok(dropIdx >= 0, 'Expected a DROP COLUMN statement');
    assert.ok(addIdx >= 0, 'Expected an ADD COLUMN statement');
    assert.ok(
      dropIdx < addIdx,
      `DROP COLUMN (${dropIdx}) should come before ADD COLUMN (${addIdx})`,
    );
  });

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

    assert.strictEqual(result.sql.length, 3);
    assert.ok(result.sql.some((s) => s.includes('DROP TABLE')));
    assert.ok(result.sql.some((s) => s.includes('DROP COLUMN')));
    assert.ok(result.sql.some((s) => s.includes('ADD COLUMN')));
  });

  it('deduplicates identical warnings', () => {
    const changes: ISchemaChange[] = [
      { type: 'column_added', table: 'a', detail: '"col1" (TEXT)' },
      { type: 'column_added', table: 'b', detail: '"col2" (TEXT)' },
    ];
    const result = generateRollback(changes, snap(1), snap(2));

    assert.strictEqual(result.sql.length, 2);
    const sqlite35Warnings = result.warnings.filter((w) =>
      w.includes('3.35.0'),
    );
    assert.strictEqual(
      sqlite35Warnings.length,
      1,
      'SQLite 3.35 warning should be deduplicated',
    );
  });
});
