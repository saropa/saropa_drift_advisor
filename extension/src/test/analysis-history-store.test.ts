/**
 * Tests for AnalysisHistoryStore — generic persistence for analysis snapshots.
 * Covers save, retrieval, eviction, deletion, clearing, and change listeners.
 */

import * as assert from 'assert';
import { AnalysisHistoryStore } from '../analysis-history/analysis-history-store';
import type { IAnalysisSnapshot } from '../analysis-history/analysis-history-store';

/** Create a fake vscode.Memento that stores data in a plain object. */
function makeFakeMemento(initial: Record<string, unknown> = {}): {
  get: <T>(key: string, defaultValue: T) => T;
  update: (key: string, value: unknown) => Promise<void>;
  keys: () => string[];
  _data: Record<string, unknown>;
} {
  const data: Record<string, unknown> = { ...initial };
  return {
    get: <T>(key: string, defaultValue: T): T => {
      return key in data ? (data[key] as T) : defaultValue;
    },
    update: (key: string, value: unknown) => {
      data[key] = value;
      return Promise.resolve();
    },
    keys: () => Object.keys(data),
    _data: data,
  };
}

describe('AnalysisHistoryStore', () => {
  it('should start empty when no prior data exists', () => {
    const memento = makeFakeMemento();
    const store = new AnalysisHistoryStore<string>(memento as any, 'test.key');

    assert.strictEqual(store.size, 0);
    assert.deepStrictEqual(store.getAll(), []);
  });

  it('should load existing snapshots from memento on construction', () => {
    const existing: IAnalysisSnapshot<number>[] = [
      { id: 'a1', savedAt: '2025-01-01T00:00:00Z', label: '1/1/2025', data: 42 },
    ];
    const memento = makeFakeMemento({ 'test.key': existing });
    const store = new AnalysisHistoryStore<number>(memento as any, 'test.key');

    assert.strictEqual(store.size, 1);
    assert.strictEqual(store.getAll()[0].data, 42);
  });

  it('should save a snapshot and return it with an id and label', () => {
    const memento = makeFakeMemento();
    const store = new AnalysisHistoryStore<string>(memento as any, 'test.key');

    const entry = store.save('hello');

    assert.strictEqual(store.size, 1);
    assert.ok(entry.id.length > 0, 'id should be non-empty');
    assert.ok(entry.savedAt.length > 0, 'savedAt should be non-empty');
    assert.ok(entry.label.length > 0, 'label should be non-empty');
    assert.strictEqual(entry.data, 'hello');
  });

  it('should prepend new snapshots (newest first)', () => {
    const memento = makeFakeMemento();
    const store = new AnalysisHistoryStore<number>(memento as any, 'test.key');

    store.save(1);
    store.save(2);
    store.save(3);

    const all = store.getAll();
    assert.strictEqual(all.length, 3);
    // Most recent first
    assert.strictEqual(all[0].data, 3);
    assert.strictEqual(all[1].data, 2);
    assert.strictEqual(all[2].data, 1);
  });

  it('should evict oldest entries when exceeding max capacity (50)', () => {
    const memento = makeFakeMemento();
    const store = new AnalysisHistoryStore<number>(memento as any, 'test.key');

    // Save 55 entries — oldest 5 should be evicted
    for (let i = 0; i < 55; i++) {
      store.save(i);
    }

    assert.strictEqual(store.size, 50);
    // Most recent (54) should be first, oldest surviving (5) should be last
    const all = store.getAll();
    assert.strictEqual(all[0].data, 54);
    assert.strictEqual(all[49].data, 5);
  });

  it('should retrieve a snapshot by ID', () => {
    const memento = makeFakeMemento();
    const store = new AnalysisHistoryStore<string>(memento as any, 'test.key');

    const entry = store.save('find-me');
    const found = store.getById(entry.id);

    assert.ok(found, 'should find the snapshot');
    assert.strictEqual(found!.data, 'find-me');
  });

  it('should return undefined for unknown ID', () => {
    const memento = makeFakeMemento();
    const store = new AnalysisHistoryStore<string>(memento as any, 'test.key');

    assert.strictEqual(store.getById('nonexistent'), undefined);
  });

  it('should delete a snapshot by ID', () => {
    const memento = makeFakeMemento();
    const store = new AnalysisHistoryStore<string>(memento as any, 'test.key');

    const entry = store.save('delete-me');
    assert.strictEqual(store.size, 1);

    const deleted = store.delete(entry.id);
    assert.strictEqual(deleted, true);
    assert.strictEqual(store.size, 0);
    assert.strictEqual(store.getById(entry.id), undefined);
  });

  it('should return false when deleting a non-existent ID', () => {
    const memento = makeFakeMemento();
    const store = new AnalysisHistoryStore<string>(memento as any, 'test.key');

    assert.strictEqual(store.delete('missing'), false);
  });

  it('should clear all snapshots', () => {
    const memento = makeFakeMemento();
    const store = new AnalysisHistoryStore<string>(memento as any, 'test.key');

    store.save('a');
    store.save('b');
    assert.strictEqual(store.size, 2);

    store.clear();
    assert.strictEqual(store.size, 0);
    assert.deepStrictEqual(store.getAll(), []);
  });

  it('should persist to memento on save', () => {
    const memento = makeFakeMemento();
    const store = new AnalysisHistoryStore<string>(memento as any, 'test.key');

    store.save('persisted');

    // Verify memento was updated
    const persisted = memento._data['test.key'] as IAnalysisSnapshot<string>[];
    assert.ok(Array.isArray(persisted));
    assert.strictEqual(persisted.length, 1);
    assert.strictEqual(persisted[0].data, 'persisted');
  });

  it('should persist to memento on delete and clear', () => {
    const memento = makeFakeMemento();
    const store = new AnalysisHistoryStore<string>(memento as any, 'test.key');

    const entry = store.save('temp');
    store.delete(entry.id);
    const afterDelete = memento._data['test.key'] as IAnalysisSnapshot<string>[];
    assert.strictEqual(afterDelete.length, 0);

    store.save('another');
    store.clear();
    const afterClear = memento._data['test.key'] as IAnalysisSnapshot<string>[];
    assert.strictEqual(afterClear.length, 0);
  });

  it('should notify listeners on changes', () => {
    const memento = makeFakeMemento();
    const store = new AnalysisHistoryStore<string>(memento as any, 'test.key');

    let callCount = 0;
    store.onDidChange(() => { callCount++; });

    store.save('trigger');
    assert.strictEqual(callCount, 1, 'save should notify');

    const entry = store.save('another');
    assert.strictEqual(callCount, 2, 'second save should notify');

    store.delete(entry.id);
    assert.strictEqual(callCount, 3, 'delete should notify');

    store.clear();
    assert.strictEqual(callCount, 4, 'clear should notify');
  });

  it('should stop notifying after dispose', () => {
    const memento = makeFakeMemento();
    const store = new AnalysisHistoryStore<string>(memento as any, 'test.key');

    let callCount = 0;
    const sub = store.onDidChange(() => { callCount++; });

    store.save('before');
    assert.strictEqual(callCount, 1);

    sub.dispose();
    store.save('after');
    assert.strictEqual(callCount, 1, 'should not fire after dispose');
  });

  it('should generate unique IDs for each snapshot', () => {
    const memento = makeFakeMemento();
    const store = new AnalysisHistoryStore<number>(memento as any, 'test.key');

    const ids = new Set<string>();
    for (let i = 0; i < 20; i++) {
      ids.add(store.save(i).id);
    }
    assert.strictEqual(ids.size, 20, 'all IDs should be unique');
  });
});
