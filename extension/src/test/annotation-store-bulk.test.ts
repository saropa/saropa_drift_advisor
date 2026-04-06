/**
 * Bulk-operation and import/export tests for AnnotationStore.
 *
 * Covers: export/import, clearAll, removeForTable, removeAllForTable,
 * and removeForColumn. Core CRUD tests (add, update, remove, filtering,
 * persistence, events) live in annotation-store.test.ts.
 */
import * as assert from 'assert';
import { MockMemento } from './vscode-mock';
import { AnnotationStore } from '../annotations/annotation-store';
import type { IAnnotationTarget } from '../annotations/annotation-types';

describe('AnnotationStore – bulk operations', () => {
  let state: MockMemento;
  let store: AnnotationStore;

  // Reusable target fixtures — identical to the ones in the core test
  // file so both suites exercise the same shapes.
  const tableTarget: IAnnotationTarget = { kind: 'table', table: 'users' };
  const colTarget: IAnnotationTarget = {
    kind: 'column', table: 'users', column: 'email',
  };
  const rowTarget: IAnnotationTarget = {
    kind: 'row', table: 'users', rowPk: '42',
  };

  // Fresh store before every test to avoid cross-test leakage.
  beforeEach(() => {
    state = new MockMemento();
    store = new AnnotationStore(state);
  });

  // --- export/import ---

  it('should export all annotations with version and timestamp', () => {
    store.add(tableTarget, 'exported', 'star');
    const data = store.exportJson();
    assert.strictEqual(data.version, 1);
    assert.ok(data.exportedAt);
    assert.strictEqual(data.annotations.length, 1);
    assert.strictEqual(data.annotations[0].note, 'exported');
  });

  it('should import annotations and return count', () => {
    const data = store.exportJson();
    data.annotations = [
      {
        id: 'old-1',
        target: tableTarget,
        icon: 'note' as const,
        note: 'imported',
        createdAt: 1000,
        updatedAt: 1000,
      },
    ];
    const count = store.importJson(data);
    assert.strictEqual(count, 1);
    assert.strictEqual(store.annotations.length, 1);
    assert.strictEqual(store.annotations[0].note, 'imported');
    // ID should be regenerated (not the original)
    assert.notStrictEqual(store.annotations[0].id, 'old-1');
  });

  it('should skip duplicate annotations on import', () => {
    store.add(tableTarget, 'already here', 'note');
    const data = store.exportJson();
    const count = store.importJson(data);
    assert.strictEqual(count, 0);
    assert.strictEqual(store.annotations.length, 1);
  });

  it('should handle empty import gracefully', () => {
    const count = store.importJson({
      version: 1,
      exportedAt: new Date().toISOString(),
      annotations: [],
    });
    assert.strictEqual(count, 0);
  });

  it('should handle malformed import without annotations array', () => {
    const count = store.importJson({} as any);
    assert.strictEqual(count, 0);
  });

  // --- clearAll ---

  it('clearAll should remove every annotation and return count', () => {
    store.add(tableTarget, 'a', 'note');
    store.add(colTarget, 'b', 'warning');
    store.add(rowTarget, 'c', 'bug');
    const removed = store.clearAll();
    assert.strictEqual(removed, 3);
    assert.strictEqual(store.annotations.length, 0);
  });

  it('clearAll should return 0 when already empty', () => {
    assert.strictEqual(store.clearAll(), 0);
  });

  it('clearAll should persist empty state', () => {
    store.add(tableTarget, 'temp', 'note');
    store.clearAll();
    const stored = state.get<unknown[]>('driftViewer.annotations');
    assert.ok(stored);
    assert.strictEqual(stored.length, 0);
  });

  it('clearAll should fire change listener exactly once', () => {
    store.add(tableTarget, 'a', 'note');
    store.add(colTarget, 'b', 'warning');
    let fired = 0;
    store.onDidChange(() => fired++);
    store.clearAll();
    assert.strictEqual(fired, 1);
  });

  // --- removeForTable ---

  it('removeForTable should remove only table-level annotations', () => {
    store.add(tableTarget, 'table level', 'note');
    store.add(colTarget, 'col level', 'warning');
    store.add(rowTarget, 'row level', 'bug');
    const removed = store.removeForTable('users');
    assert.strictEqual(removed, 1);
    // Column and row annotations should survive
    assert.strictEqual(store.annotations.length, 2);
    assert.ok(store.annotations.every((a) => a.target.kind !== 'table'));
  });

  it('removeForTable should return 0 for unknown table', () => {
    store.add(tableTarget, 'note', 'note');
    assert.strictEqual(store.removeForTable('orders'), 0);
    assert.strictEqual(store.annotations.length, 1);
  });

  // --- removeAllForTable ---

  it('removeAllForTable should remove table, column, and row annotations', () => {
    store.add(tableTarget, 'table level', 'note');
    store.add(colTarget, 'col level', 'warning');
    store.add(rowTarget, 'row level', 'bug');
    store.add({ kind: 'table', table: 'orders' }, 'other table', 'star');
    const removed = store.removeAllForTable('users');
    assert.strictEqual(removed, 3);
    // Only the 'orders' annotation should remain
    assert.strictEqual(store.annotations.length, 1);
    assert.strictEqual(store.annotations[0].target.table, 'orders');
  });

  it('removeAllForTable should return 0 for unknown table', () => {
    store.add(tableTarget, 'note', 'note');
    assert.strictEqual(store.removeAllForTable('orders'), 0);
    assert.strictEqual(store.annotations.length, 1);
  });

  it('removeAllForTable should fire change listener exactly once', () => {
    store.add(tableTarget, 'a', 'note');
    store.add(colTarget, 'b', 'warning');
    store.add(rowTarget, 'c', 'bug');
    let fired = 0;
    store.onDidChange(() => fired++);
    store.removeAllForTable('users');
    assert.strictEqual(fired, 1);
  });

  // --- removeForColumn ---

  it('removeForColumn should remove only column annotations for that column', () => {
    store.add(colTarget, 'email note', 'note');
    store.add(
      { kind: 'column', table: 'users', column: 'name' },
      'name note', 'warning',
    );
    store.add(tableTarget, 'table level', 'star');
    const removed = store.removeForColumn('users', 'email');
    assert.strictEqual(removed, 1);
    // Table-level and 'name' column annotation should survive
    assert.strictEqual(store.annotations.length, 2);
  });

  it('removeForColumn should return 0 for column without annotations', () => {
    store.add(colTarget, 'email note', 'note');
    assert.strictEqual(store.removeForColumn('users', 'age'), 0);
    assert.strictEqual(store.annotations.length, 1);
  });
});
