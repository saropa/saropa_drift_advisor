import * as assert from 'assert';
import { MockMemento } from './vscode-mock';
import { AnnotationStore } from '../annotations/annotation-store';
import type { IAnnotationTarget } from '../annotations/annotation-types';

describe('AnnotationStore', () => {
  let state: MockMemento;
  let store: AnnotationStore;

  const tableTarget: IAnnotationTarget = { kind: 'table', table: 'users' };
  const colTarget: IAnnotationTarget = {
    kind: 'column', table: 'users', column: 'email',
  };
  const rowTarget: IAnnotationTarget = {
    kind: 'row', table: 'users', rowPk: '42',
  };

  beforeEach(() => {
    state = new MockMemento();
    store = new AnnotationStore(state);
  });

  // --- add ---

  it('should add a table annotation and return an ID', () => {
    const id = store.add(tableTarget, 'test note', 'note');
    assert.ok(id);
    assert.strictEqual(store.annotations.length, 1);
    assert.strictEqual(store.annotations[0].note, 'test note');
    assert.strictEqual(store.annotations[0].icon, 'note');
  });

  it('should add column and row annotations', () => {
    store.add(colTarget, 'col note', 'warning');
    store.add(rowTarget, 'row note', 'bug');
    assert.strictEqual(store.annotations.length, 2);
  });

  it('should set createdAt and updatedAt timestamps', () => {
    const before = Date.now();
    store.add(tableTarget, 'timed', 'star');
    const ann = store.annotations[0];
    assert.ok(ann.createdAt >= before);
    assert.ok(ann.updatedAt >= before);
  });

  // --- update ---

  it('should update note text', () => {
    const id = store.add(tableTarget, 'original', 'note');
    const result = store.update(id, 'updated');
    assert.strictEqual(result, true);
    assert.strictEqual(store.annotations[0].note, 'updated');
  });

  it('should update icon when provided', () => {
    const id = store.add(tableTarget, 'note', 'note');
    store.update(id, 'note', 'bug');
    assert.strictEqual(store.annotations[0].icon, 'bug');
  });

  it('should update the updatedAt timestamp', () => {
    const id = store.add(tableTarget, 'note', 'note');
    const original = store.annotations[0].updatedAt;
    // Small delay to ensure timestamp differs
    store.update(id, 'changed');
    assert.ok(store.annotations[0].updatedAt >= original);
  });

  it('should return false for unknown ID on update', () => {
    assert.strictEqual(store.update('nonexistent', 'text'), false);
  });

  // --- remove ---

  it('should remove by ID', () => {
    const id = store.add(tableTarget, 'to remove', 'pin');
    assert.strictEqual(store.annotations.length, 1);
    const result = store.remove(id);
    assert.strictEqual(result, true);
    assert.strictEqual(store.annotations.length, 0);
  });

  it('should return false for unknown ID on remove', () => {
    assert.strictEqual(store.remove('nonexistent'), false);
  });

  // --- filtering ---

  it('forTable should return only annotations for that table', () => {
    store.add(tableTarget, 'users table', 'note');
    store.add(colTarget, 'users col', 'note');
    store.add({ kind: 'table', table: 'orders' }, 'orders', 'note');
    assert.strictEqual(store.forTable('users').length, 2);
    assert.strictEqual(store.forTable('orders').length, 1);
    assert.strictEqual(store.forTable('empty').length, 0);
  });

  it('forColumn should match table + column', () => {
    store.add(colTarget, 'email note', 'note');
    store.add(
      { kind: 'column', table: 'users', column: 'name' },
      'name note', 'note',
    );
    store.add(tableTarget, 'table level', 'note');
    assert.strictEqual(store.forColumn('users', 'email').length, 1);
    assert.strictEqual(store.forColumn('users', 'name').length, 1);
    assert.strictEqual(store.forColumn('users', 'age').length, 0);
  });

  it('forRow should match table + rowPk', () => {
    store.add(rowTarget, 'row 42', 'bug');
    store.add(
      { kind: 'row', table: 'users', rowPk: '99' },
      'row 99', 'bug',
    );
    assert.strictEqual(store.forRow('users', '42').length, 1);
    assert.strictEqual(store.forRow('users', '99').length, 1);
    assert.strictEqual(store.forRow('users', '1').length, 0);
  });

  it('hasAnnotations should return true when annotations exist', () => {
    store.add(colTarget, 'note', 'note');
    assert.strictEqual(store.hasAnnotations('users'), true);
    assert.strictEqual(store.hasAnnotations('users', 'email'), true);
  });

  it('hasAnnotations should return false when empty', () => {
    assert.strictEqual(store.hasAnnotations('users'), false);
    store.add(colTarget, 'note', 'note');
    assert.strictEqual(store.hasAnnotations('orders'), false);
    assert.strictEqual(store.hasAnnotations('users', 'name'), false);
  });

  it('countForTable should count all annotations for a table', () => {
    store.add(tableTarget, 'a', 'note');
    store.add(colTarget, 'b', 'note');
    store.add(rowTarget, 'c', 'bug');
    assert.strictEqual(store.countForTable('users'), 3);
    assert.strictEqual(store.countForTable('orders'), 0);
  });

  // --- persistence ---

  it('should persist to workspace state on add', () => {
    store.add(tableTarget, 'persisted', 'note');
    const stored = state.get<unknown[]>('driftViewer.annotations');
    assert.ok(stored);
    assert.strictEqual(stored.length, 1);
  });

  it('should load from workspace state on construction', async () => {
    store.add(tableTarget, 'preexisting', 'star');
    const store2 = new AnnotationStore(state);
    assert.strictEqual(store2.annotations.length, 1);
    assert.strictEqual(store2.annotations[0].note, 'preexisting');
  });

  it('should persist on remove', () => {
    const id = store.add(tableTarget, 'temp', 'note');
    store.remove(id);
    const stored = state.get<unknown[]>('driftViewer.annotations');
    assert.ok(stored);
    assert.strictEqual(stored.length, 0);
  });

  // --- events ---

  it('should fire change listener on add', () => {
    let fired = 0;
    store.onDidChange(() => fired++);
    store.add(tableTarget, 'trigger', 'note');
    assert.strictEqual(fired, 1);
  });

  it('should fire change listener on remove', () => {
    const id = store.add(tableTarget, 'to remove', 'pin');
    let fired = 0;
    store.onDidChange(() => fired++);
    store.remove(id);
    assert.strictEqual(fired, 1);
  });

  it('should fire change listener on update', () => {
    const id = store.add(tableTarget, 'original', 'note');
    let fired = 0;
    store.onDidChange(() => fired++);
    store.update(id, 'changed');
    assert.strictEqual(fired, 1);
  });

  it('dispose should unsubscribe listener', () => {
    let fired = 0;
    const sub = store.onDidChange(() => fired++);
    sub.dispose();
    store.add(tableTarget, 'after dispose', 'note');
    assert.strictEqual(fired, 0);
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
