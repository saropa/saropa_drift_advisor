import * as assert from 'assert';
import { MockMemento } from './vscode-mock';
import { buildFilterQuery } from '../filters/filter-bridge';
import { FilterStore } from '../filters/filter-store';
import type { ISavedFilter } from '../filters/filter-types';

describe('FilterStore', () => {
  let state: MockMemento;
  let store: FilterStore;

  const base: Omit<ISavedFilter, 'id' | 'createdAt' | 'updatedAt'> = {
    name: 'Active users',
    table: 'users',
    where: 'active = 1',
    orderBy: 'created_at DESC',
  };

  function makeDraft(
    overrides?: Partial<ISavedFilter>,
  ): ISavedFilter {
    return {
      id: '',
      createdAt: 0,
      updatedAt: 0,
      ...base,
      ...overrides,
    };
  }

  beforeEach(() => {
    state = new MockMemento();
    store = new FilterStore(state);
  });

  // --- save (add) ---

  it('should add a filter and return an ID', () => {
    const id = store.save(makeDraft());
    assert.ok(id);
    assert.strictEqual(store.filters.length, 1);
    assert.strictEqual(store.filters[0].name, 'Active users');
    assert.strictEqual(store.filters[0].id, id);
  });

  it('should set createdAt and updatedAt timestamps', () => {
    const before = Date.now();
    store.save(makeDraft());
    const f = store.filters[0];
    assert.ok(f.createdAt >= before);
    assert.ok(f.updatedAt >= before);
  });

  it('should generate unique IDs for different filters', () => {
    const id1 = store.save(makeDraft({ name: 'Filter 1' }));
    const id2 = store.save(makeDraft({ name: 'Filter 2' }));
    assert.notStrictEqual(id1, id2);
    assert.strictEqual(store.filters.length, 2);
  });

  // --- save (update) ---

  it('should update an existing filter by ID', () => {
    const id = store.save(makeDraft());
    store.save(makeDraft({ id, name: 'Updated' }));
    assert.strictEqual(store.filters.length, 1);
    assert.strictEqual(store.filters[0].name, 'Updated');
  });

  it('should update the updatedAt timestamp on save', () => {
    const id = store.save(makeDraft());
    const original = store.filters[0].updatedAt;
    store.save(makeDraft({ id, name: 'Changed' }));
    assert.ok(store.filters[0].updatedAt >= original);
  });

  // --- remove ---

  it('should remove by ID', () => {
    const id = store.save(makeDraft());
    assert.strictEqual(store.filters.length, 1);
    const result = store.remove(id);
    assert.strictEqual(result, true);
    assert.strictEqual(store.filters.length, 0);
  });

  it('should return false for unknown ID on remove', () => {
    assert.strictEqual(store.remove('nonexistent'), false);
  });

  // --- forTable ---

  it('should return only filters for the given table', () => {
    store.save(makeDraft({ name: 'Users filter', table: 'users' }));
    store.save(makeDraft({ name: 'Orders filter', table: 'orders' }));
    store.save(makeDraft({ name: 'Users filter 2', table: 'users' }));
    assert.strictEqual(store.forTable('users').length, 2);
    assert.strictEqual(store.forTable('orders').length, 1);
  });

  it('should return empty array for unknown table', () => {
    assert.strictEqual(store.forTable('nonexistent').length, 0);
  });

  // --- getById ---

  it('should return filter by ID', () => {
    const id = store.save(makeDraft());
    const found = store.getById(id);
    assert.ok(found);
    assert.strictEqual(found.name, 'Active users');
  });

  it('should return undefined for unknown ID', () => {
    assert.strictEqual(store.getById('nonexistent'), undefined);
  });

  // --- optional fields ---

  it('should handle filters without where and orderBy', () => {
    const id = store.save(makeDraft({
      where: undefined,
      orderBy: undefined,
      columns: undefined,
    }));
    const f = store.getById(id);
    assert.ok(f);
    assert.strictEqual(f.where, undefined);
    assert.strictEqual(f.orderBy, undefined);
    assert.strictEqual(f.columns, undefined);
  });

  it('should store column visibility list', () => {
    const id = store.save(makeDraft({
      columns: ['id', 'name', 'email'],
    }));
    const f = store.getById(id);
    assert.ok(f);
    assert.deepStrictEqual(f.columns, ['id', 'name', 'email']);
  });

  // --- persistence ---

  it('should persist to workspace state on save', () => {
    store.save(makeDraft());
    const stored = state.get<unknown[]>('driftViewer.savedFilters');
    assert.ok(stored);
    assert.strictEqual(stored.length, 1);
  });

  it('should load from workspace state on construction', () => {
    store.save(makeDraft());
    const store2 = new FilterStore(state);
    assert.strictEqual(store2.filters.length, 1);
    assert.strictEqual(store2.filters[0].name, 'Active users');
  });

  it('should persist on remove', () => {
    const id = store.save(makeDraft());
    store.remove(id);
    const stored = state.get<unknown[]>('driftViewer.savedFilters');
    assert.ok(stored);
    assert.strictEqual(stored.length, 0);
  });

  // --- events ---

  it('should fire change listener on save', () => {
    let fired = 0;
    store.onDidChange(() => fired++);
    store.save(makeDraft());
    assert.strictEqual(fired, 1);
  });

  it('should fire change listener on remove', () => {
    const id = store.save(makeDraft());
    let fired = 0;
    store.onDidChange(() => fired++);
    store.remove(id);
    assert.strictEqual(fired, 1);
  });

  it('should fire change listener on update', () => {
    const id = store.save(makeDraft());
    let fired = 0;
    store.onDidChange(() => fired++);
    store.save(makeDraft({ id, name: 'Changed' }));
    assert.strictEqual(fired, 1);
  });

  it('dispose should unsubscribe listener', () => {
    let fired = 0;
    const sub = store.onDidChange(() => fired++);
    sub.dispose();
    store.save(makeDraft());
    assert.strictEqual(fired, 0);
  });
});

describe('buildFilterQuery', () => {
  function fakeFilter(overrides?: Partial<ISavedFilter>): ISavedFilter {
    return {
      id: 'x', name: 'test', table: 'orders',
      createdAt: 0, updatedAt: 0,
      ...overrides,
    };
  }

  it('should select all columns when columns is undefined', () => {
    assert.strictEqual(
      buildFilterQuery(fakeFilter()),
      'SELECT * FROM "orders"',
    );
  });

  it('should select specific columns when provided', () => {
    assert.strictEqual(
      buildFilterQuery(fakeFilter({ columns: ['id', 'total'] })),
      'SELECT "id", "total" FROM "orders"',
    );
  });

  it('should append WHERE clause', () => {
    assert.strictEqual(
      buildFilterQuery(fakeFilter({ where: 'status = \'failed\'' })),
      'SELECT * FROM "orders" WHERE status = \'failed\'',
    );
  });

  it('should append ORDER BY clause', () => {
    assert.strictEqual(
      buildFilterQuery(fakeFilter({ orderBy: 'created_at DESC' })),
      'SELECT * FROM "orders" ORDER BY created_at DESC',
    );
  });

  it('should combine all clauses', () => {
    const sql = buildFilterQuery(fakeFilter({
      columns: ['id', 'total'],
      where: 'total > 100',
      orderBy: 'total DESC',
    }));
    assert.strictEqual(
      sql,
      'SELECT "id", "total" FROM "orders" WHERE total > 100 ORDER BY total DESC',
    );
  });

  it('should quote table names with special characters', () => {
    assert.strictEqual(
      buildFilterQuery(fakeFilter({ table: 'my table' })),
      'SELECT * FROM "my table"',
    );
  });

  it('should treat empty columns array as select all', () => {
    assert.strictEqual(
      buildFilterQuery(fakeFilter({ columns: [] })),
      'SELECT * FROM "orders"',
    );
  });
});
