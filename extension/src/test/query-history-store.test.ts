import * as assert from 'assert';
import { MockMemento } from './vscode-mock';
import { IQueryHistoryEntry } from '../sql-notebook/sql-notebook-panel';
import { QueryHistoryStore } from '../sql-notebook/query-history-store';

function makeEntry(overrides: Partial<IQueryHistoryEntry> = {}): IQueryHistoryEntry {
  return {
    sql: 'SELECT * FROM users',
    timestamp: Date.now(),
    rowCount: 10,
    durationMs: 5,
    ...overrides,
  };
}

describe('QueryHistoryStore', () => {
  let memento: MockMemento;
  let store: QueryHistoryStore;

  beforeEach(() => {
    memento = new MockMemento();
    store = new QueryHistoryStore(memento);
  });

  // --- getAll ---

  it('should return empty array when no history', () => {
    assert.deepStrictEqual(store.getAll(), []);
  });

  it('should return stored entries', async () => {
    const entry = makeEntry({ sql: 'SELECT 1' });
    await store.add(entry);
    const all = store.getAll();
    assert.strictEqual(all.length, 1);
    assert.strictEqual(all[0].sql, 'SELECT 1');
  });

  // --- search ---

  it('should return all entries for empty query', async () => {
    await store.add(makeEntry({ sql: 'SELECT 1', timestamp: 1 }));
    await store.add(makeEntry({ sql: 'SELECT 2', timestamp: 2 }));
    assert.strictEqual(store.search('').length, 2);
  });

  it('should filter by SQL text case-insensitively', async () => {
    await store.add(makeEntry({ sql: 'SELECT * FROM users', timestamp: 1 }));
    await store.add(makeEntry({ sql: 'SELECT * FROM orders', timestamp: 2 }));
    await store.add(makeEntry({ sql: 'INSERT INTO users', timestamp: 3 }));

    const results = store.search('USERS');
    assert.strictEqual(results.length, 2);
    assert.ok(results.every((e) => e.sql.toLowerCase().includes('users')));
  });

  it('should match error messages', async () => {
    await store.add(makeEntry({
      sql: 'SELECT * FROM missing',
      timestamp: 1,
      error: 'no such table: missing',
    }));
    await store.add(makeEntry({ sql: 'SELECT 1', timestamp: 2 }));

    const results = store.search('no such table');
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].timestamp, 1);
  });

  it('should return empty for no matches', async () => {
    await store.add(makeEntry({ sql: 'SELECT 1', timestamp: 1 }));
    assert.strictEqual(store.search('nonexistent').length, 0);
  });

  // --- add ---

  it('should prepend new entries', async () => {
    await store.add(makeEntry({ sql: 'first', timestamp: 1 }));
    await store.add(makeEntry({ sql: 'second', timestamp: 2 }));
    const all = store.getAll();
    assert.strictEqual(all[0].sql, 'second');
    assert.strictEqual(all[1].sql, 'first');
  });

  it('should trim to max entries on add', async () => {
    // Default max is 200; add 210 entries
    for (let i = 0; i < 210; i++) {
      await store.add(makeEntry({ sql: `SELECT ${i}`, timestamp: i }));
    }
    const all = store.getAll();
    assert.strictEqual(all.length, 200);
    // Newest entry should be first
    assert.strictEqual(all[0].sql, 'SELECT 209');
  });

  // --- delete ---

  it('should remove entry by timestamp', async () => {
    await store.add(makeEntry({ sql: 'keep', timestamp: 1 }));
    await store.add(makeEntry({ sql: 'remove', timestamp: 2 }));
    await store.delete(2);
    const all = store.getAll();
    assert.strictEqual(all.length, 1);
    assert.strictEqual(all[0].sql, 'keep');
  });

  it('should remove all entries with matching timestamp', async () => {
    await store.add(makeEntry({ sql: 'dup1', timestamp: 100 }));
    // Manually seed a second entry with the same timestamp
    const entries = store.getAll();
    entries.push(makeEntry({ sql: 'dup2', timestamp: 100 }));
    await memento.update('driftViewer.sqlNotebookHistory', entries);

    await store.delete(100);
    assert.strictEqual(store.getAll().length, 0);
  });

  it('should do nothing when timestamp not found', async () => {
    await store.add(makeEntry({ sql: 'keep', timestamp: 1 }));
    await store.delete(999);
    assert.strictEqual(store.getAll().length, 1);
  });

  // --- clear ---

  it('should remove all entries', async () => {
    await store.add(makeEntry({ timestamp: 1 }));
    await store.add(makeEntry({ timestamp: 2 }));
    await store.clear();
    assert.deepStrictEqual(store.getAll(), []);
  });

  // --- persistence ---

  it('should persist across store re-creation', async () => {
    await store.add(makeEntry({ sql: 'persisted', timestamp: 42 }));

    const store2 = new QueryHistoryStore(memento);
    const all = store2.getAll();
    assert.strictEqual(all.length, 1);
    assert.strictEqual(all[0].sql, 'persisted');
  });
});
