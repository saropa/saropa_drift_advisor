import * as assert from 'assert';
import { orderPendingChangesForApply } from '../editing/apply-order';
import type { PendingChange } from '../editing/change-tracker';

describe('orderPendingChangesForApply', () => {
  const fk = [
    { fromTable: 'child', toTable: 'parent' },
  ];

  it('orders deletes before inserts; child delete before parent delete', () => {
    const changes: PendingChange[] = [
      {
        kind: 'delete',
        id: '1',
        table: 'parent',
        pkColumn: 'id',
        pkValue: 1,
        timestamp: 0,
      },
      {
        kind: 'delete',
        id: '2',
        table: 'child',
        pkColumn: 'id',
        pkValue: 2,
        timestamp: 0,
      },
    ];
    const ordered = orderPendingChangesForApply(changes, fk);
    assert.strictEqual(ordered[0].table, 'child');
    assert.strictEqual(ordered[1].table, 'parent');
  });

  it('orders inserts parent before child', () => {
    const changes: PendingChange[] = [
      {
        kind: 'insert',
        id: '1',
        table: 'child',
        values: { pid: 1 },
        timestamp: 0,
      },
      {
        kind: 'insert',
        id: '2',
        table: 'parent',
        values: { name: 'p' },
        timestamp: 0,
      },
    ];
    const ordered = orderPendingChangesForApply(changes, fk);
    assert.strictEqual(ordered[0].table, 'parent');
    assert.strictEqual(ordered[1].table, 'child');
  });

  it('runs delete phase before cell then insert', () => {
    const changes: PendingChange[] = [
      {
        kind: 'insert',
        id: 'i',
        table: 'parent',
        values: { x: 1 },
        timestamp: 0,
      },
      {
        kind: 'cell',
        id: 'u',
        table: 'child',
        pkColumn: 'id',
        pkValue: 1,
        column: 'v',
        oldValue: 0,
        newValue: 1,
        timestamp: 0,
      },
      {
        kind: 'delete',
        id: 'd',
        table: 'parent',
        pkColumn: 'id',
        pkValue: 9,
        timestamp: 0,
      },
    ];
    const ordered = orderPendingChangesForApply(changes, fk);
    assert.strictEqual(ordered[0].kind, 'delete');
    assert.strictEqual(ordered[1].kind, 'cell');
    assert.strictEqual(ordered[2].kind, 'insert');
  });
});
