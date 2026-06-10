/**
 * Phase 3 gate for Data Branching (Feature 37): the merge-SQL generator.
 * Covers forward INSERT/UPDATE/DELETE, rollback reversal, NULL/quote escaping, FK delete order,
 * and the empty-diff comment-only output.
 */

import * as assert from 'assert';
import { generateMergeSql, sqlLiteral } from '../branching/branch-merge-sql';
import type { IBranchDiff, ITableBranchDiff } from '../branching/branch-types';

function tableDiff(partial: Partial<ITableBranchDiff> & { table: string }): ITableBranchDiff {
  return {
    columns: ['id', 'name'],
    pkColumns: ['id'],
    inserts: [],
    updates: [],
    deletes: [],
    ...partial,
  };
}

function diff(tableDiffs: ITableBranchDiff[]): IBranchDiff {
  const inserts = tableDiffs.reduce((s, t) => s + t.inserts.length, 0);
  const updates = tableDiffs.reduce((s, t) => s + t.updates.length, 0);
  const deletes = tableDiffs.reduce((s, t) => s + t.deletes.length, 0);
  return {
    branchA: 'exp',
    branchB: 'current',
    tableDiffs,
    summary: { inserts, updates, deletes, tablesChanged: tableDiffs.length },
  };
}

describe('branch-merge-sql', () => {
  it('sqlLiteral escapes quotes, handles NULL and numbers', () => {
    assert.strictEqual(sqlLiteral(null), 'NULL');
    assert.strictEqual(sqlLiteral(undefined), 'NULL');
    assert.strictEqual(sqlLiteral(42), '42');
    assert.strictEqual(sqlLiteral("O'Brien"), "'O''Brien'");
    assert.strictEqual(sqlLiteral(true), '1');
  });

  it('forward: INSERT for new rows', () => {
    const sql = generateMergeSql(
      diff([tableDiff({ table: 'users', inserts: [{ id: 5, name: 'Eve' }] })]),
      'forward',
      ['users'],
    );
    assert.ok(sql.includes(`INSERT INTO "users" ("id", "name") VALUES (5, 'Eve');`));
  });

  it('forward: UPDATE applies the new value, scoped by PK', () => {
    const sql = generateMergeSql(
      diff([
        tableDiff({
          table: 'users',
          updates: [
            {
              pk: '42',
              pkValues: { id: 42 },
              before: { id: 42, name: 'Al' },
              after: { id: 42, name: 'Alice' },
              changes: [{ column: 'name', oldValue: 'Al', newValue: 'Alice' }],
            },
          ],
        }),
      ]),
      'forward',
      ['users'],
    );
    assert.ok(sql.includes(`UPDATE "users" SET "name" = 'Alice' WHERE "id" = 42;`));
  });

  it('forward: DELETE for removed rows', () => {
    const sql = generateMergeSql(
      diff([tableDiff({ table: 'users', deletes: [{ id: 7, name: 'X' }] })]),
      'forward',
      ['users'],
    );
    assert.ok(sql.includes(`DELETE FROM "users" WHERE "id" = 7;`));
  });

  it('rollback reverses every operation', () => {
    const d = diff([
      tableDiff({
        table: 'users',
        inserts: [{ id: 5, name: 'Eve' }],
        deletes: [{ id: 7, name: 'X' }],
        updates: [
          {
            pk: '42',
            pkValues: { id: 42 },
            before: { id: 42, name: 'Al' },
            after: { id: 42, name: 'Alice' },
            changes: [{ column: 'name', oldValue: 'Al', newValue: 'Alice' }],
          },
        ],
      }),
    ]);
    const sql = generateMergeSql(d, 'rollback', ['users']);
    // Forward-inserted row is deleted; forward-deleted row is re-inserted; update restores old value.
    assert.ok(sql.includes(`DELETE FROM "users" WHERE "id" = 5;`), 'rollback deletes the inserted row');
    assert.ok(sql.includes(`INSERT INTO "users" ("id", "name") VALUES (7, 'X');`), 'rollback re-inserts the deleted row');
    assert.ok(sql.includes(`UPDATE "users" SET "name" = 'Al' WHERE "id" = 42;`), 'rollback restores the old value');
  });

  it('FK order: child deletes precede parent deletes; parent inserts precede child inserts', () => {
    // insertOrder is parent-first: users (parent) then orders (child).
    const d = diff([
      tableDiff({ table: 'users', pkColumns: ['id'], columns: ['id'], inserts: [{ id: 1 }], deletes: [{ id: 9 }] }),
      tableDiff({ table: 'orders', pkColumns: ['id'], columns: ['id'], inserts: [{ id: 2 }], deletes: [{ id: 8 }] }),
    ]);
    const sql = generateMergeSql(d, 'forward', ['users', 'orders']);
    const delOrders = sql.indexOf('DELETE FROM "orders"');
    const delUsers = sql.indexOf('DELETE FROM "users"');
    const insUsers = sql.indexOf('INSERT INTO "users"');
    const insOrders = sql.indexOf('INSERT INTO "orders"');
    assert.ok(delOrders < delUsers, 'child (orders) deleted before parent (users)');
    assert.ok(insUsers < insOrders, 'parent (users) inserted before child (orders)');
    assert.ok(delUsers < insUsers, 'all deletes run before any insert');
  });

  it('empty diff → comments only, no SQL statements', () => {
    const sql = generateMergeSql(diff([]), 'forward', []);
    assert.ok(sql.includes('No differences'));
    assert.ok(!sql.includes('INSERT'));
    assert.ok(!sql.includes('DELETE'));
    assert.ok(!/UPDATE /.test(sql));
  });

  it('NULL in a PK builds an IS NULL clause', () => {
    const sql = generateMergeSql(
      diff([tableDiff({ table: 't', pkColumns: ['k'], columns: ['k'], deletes: [{ k: null }] })]),
      'forward',
      ['t'],
    );
    assert.ok(sql.includes(`DELETE FROM "t" WHERE "k" IS NULL;`));
  });
});
