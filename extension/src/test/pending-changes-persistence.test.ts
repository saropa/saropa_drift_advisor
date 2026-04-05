import * as assert from 'assert';
import type { PendingChange } from '../editing/change-tracker';
import {
  deserializePendingChanges,
  detectDraftConflicts,
} from '../editing/pending-changes-persistence';

describe('deserializePendingChanges', () => {
  it('returns null for empty array', () => {
    assert.strictEqual(deserializePendingChanges('[]'), null);
  });

  it('returns null for non-array JSON', () => {
    assert.strictEqual(deserializePendingChanges('{}'), null);
  });

  it('returns null for invalid JSON', () => {
    assert.strictEqual(deserializePendingChanges('not json'), null);
  });

  it('parses valid cell changes', () => {
    const changes: PendingChange[] = [
      {
        kind: 'cell',
        id: 'c-1',
        table: 'users',
        pkColumn: 'id',
        pkValue: 1,
        column: 'name',
        oldValue: 'Alice',
        newValue: 'Bob',
        timestamp: 100,
      },
    ];
    const result = deserializePendingChanges(JSON.stringify(changes));
    assert.ok(result);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].kind, 'cell');
  });

  it('returns null when a cell change is missing required fields', () => {
    const bad = [{ kind: 'cell', table: 'x' }]; // missing column, pkColumn, id, timestamp
    assert.strictEqual(deserializePendingChanges(JSON.stringify(bad)), null);
  });

  it('parses valid insert changes', () => {
    const changes: PendingChange[] = [
      {
        kind: 'insert',
        id: 'i-1',
        table: 'users',
        values: { name: 'New' },
        timestamp: 200,
      },
    ];
    const result = deserializePendingChanges(JSON.stringify(changes));
    assert.ok(result);
    assert.strictEqual(result[0].kind, 'insert');
  });

  it('parses valid delete changes', () => {
    const changes: PendingChange[] = [
      {
        kind: 'delete',
        id: 'd-1',
        table: 'users',
        pkColumn: 'id',
        pkValue: 5,
        timestamp: 300,
      },
    ];
    const result = deserializePendingChanges(JSON.stringify(changes));
    assert.ok(result);
    assert.strictEqual(result[0].kind, 'delete');
  });
});

describe('detectDraftConflicts', () => {
  /** Helper: build a mock runSql that returns predefined rows for known queries. */
  function mockSql(
    data: Record<string, { columns: string[]; rows: unknown[][] }>,
  ): (query: string) => Promise<{ columns: string[]; rows: unknown[][] }> {
    return async (query: string) => {
      // Match by table name in the FROM clause.
      for (const [table, result] of Object.entries(data)) {
        if (query.includes(`FROM "${table}"`)) return result;
      }
      throw new Error(`Unexpected query: ${query}`);
    };
  }

  it('returns empty when no cell changes exist', async () => {
    const changes: PendingChange[] = [
      {
        kind: 'insert',
        id: 'i-1',
        table: 'users',
        values: { name: 'X' },
        timestamp: 1,
      },
      {
        kind: 'delete',
        id: 'd-1',
        table: 'users',
        pkColumn: 'id',
        pkValue: 5,
        timestamp: 2,
      },
    ];
    const conflicts = await detectDraftConflicts(changes, mockSql({}));
    assert.deepStrictEqual(conflicts, []);
  });

  it('returns empty when oldValues match live DB', async () => {
    const changes: PendingChange[] = [
      {
        kind: 'cell',
        id: 'c-1',
        table: 'users',
        pkColumn: 'id',
        pkValue: 1,
        column: 'name',
        oldValue: 'Alice',
        newValue: 'Bob',
        timestamp: 1,
      },
    ];
    const sql = mockSql({
      users: { columns: ['id', 'name'], rows: [[1, 'Alice']] },
    });
    const conflicts = await detectDraftConflicts(changes, sql);
    assert.deepStrictEqual(conflicts, []);
  });

  it('detects a value conflict', async () => {
    const changes: PendingChange[] = [
      {
        kind: 'cell',
        id: 'c-1',
        table: 'users',
        pkColumn: 'id',
        pkValue: 1,
        column: 'name',
        oldValue: 'Alice',
        newValue: 'Bob',
        timestamp: 1,
      },
    ];
    // DB now has "Carol" instead of "Alice".
    const sql = mockSql({
      users: { columns: ['id', 'name'], rows: [[1, 'Carol']] },
    });
    const conflicts = await detectDraftConflicts(changes, sql);
    assert.strictEqual(conflicts.length, 1);
    assert.strictEqual(conflicts[0].draftOldValue, 'Alice');
    assert.strictEqual(conflicts[0].liveValue, 'Carol');
    assert.strictEqual(conflicts[0].column, 'name');
  });

  it('detects a deleted row', async () => {
    const changes: PendingChange[] = [
      {
        kind: 'cell',
        id: 'c-1',
        table: 'users',
        pkColumn: 'id',
        pkValue: 99,
        column: 'name',
        oldValue: 'Gone',
        newValue: 'Anything',
        timestamp: 1,
      },
    ];
    // Row 99 is not in the DB anymore.
    const sql = mockSql({
      users: { columns: ['id', 'name'], rows: [] },
    });
    const conflicts = await detectDraftConflicts(changes, sql);
    assert.strictEqual(conflicts.length, 1);
    assert.strictEqual(conflicts[0].liveValue, undefined);
    assert.strictEqual(conflicts[0].pkValue, 99);
  });

  it('skips gracefully when SQL throws', async () => {
    const changes: PendingChange[] = [
      {
        kind: 'cell',
        id: 'c-1',
        table: 'users',
        pkColumn: 'id',
        pkValue: 1,
        column: 'name',
        oldValue: 'Alice',
        newValue: 'Bob',
        timestamp: 1,
      },
    ];
    const failingSql = async () => {
      throw new Error('server not connected');
    };
    // Should not throw; returns empty (best-effort).
    const conflicts = await detectDraftConflicts(changes, failingSql);
    assert.deepStrictEqual(conflicts, []);
  });

  it('handles multiple tables', async () => {
    const changes: PendingChange[] = [
      {
        kind: 'cell',
        id: 'c-1',
        table: 'users',
        pkColumn: 'id',
        pkValue: 1,
        column: 'name',
        oldValue: 'Alice',
        newValue: 'Bob',
        timestamp: 1,
      },
      {
        kind: 'cell',
        id: 'c-2',
        table: 'posts',
        pkColumn: 'id',
        pkValue: 10,
        column: 'title',
        oldValue: 'Old Title',
        newValue: 'New Title',
        timestamp: 2,
      },
    ];
    const sql = mockSql({
      users: { columns: ['id', 'name'], rows: [[1, 'Alice']] },
      // posts.title changed since draft.
      posts: { columns: ['id', 'title'], rows: [[10, 'Changed Title']] },
    });
    const conflicts = await detectDraftConflicts(changes, sql);
    assert.strictEqual(conflicts.length, 1);
    assert.strictEqual(conflicts[0].table, 'posts');
    assert.strictEqual(conflicts[0].liveValue, 'Changed Title');
  });

  it('escapes PK values safely in generated SQL (no injection)', async () => {
    const changes: PendingChange[] = [
      {
        kind: 'cell',
        id: 'c-1',
        table: 'users',
        pkColumn: 'id',
        // A malicious PK value that would break naive string interpolation.
        pkValue: "'; DROP TABLE users; --",
        column: 'name',
        oldValue: 'Alice',
        newValue: 'Bob',
        timestamp: 1,
      },
    ];
    // Capture the query that detectDraftConflicts builds.
    let capturedQuery = '';
    const captureSql = async (query: string) => {
      capturedQuery = query;
      return { columns: ['id', 'name'], rows: [] };
    };
    await detectDraftConflicts(changes, captureSql);
    // The PK value must be properly quoted — sqlLiteral wraps in single quotes
    // and doubles internal single-quotes, so the value is safely escaped.
    assert.ok(
      capturedQuery.includes("'''; DROP TABLE users; --'"),
      `Expected escaped PK in query, got: ${capturedQuery}`,
    );
    // The raw unescaped payload (single-quote followed by semicolon) must not
    // appear outside the properly-quoted literal.
    const outsideLiteral = capturedQuery.replace(/'[^']*'/g, '');
    assert.ok(
      !outsideLiteral.includes('DROP TABLE'),
      `Query contains unescaped injection outside literal: ${capturedQuery}`,
    );
  });

  it('handles NULL oldValue matching NULL in DB', async () => {
    const changes: PendingChange[] = [
      {
        kind: 'cell',
        id: 'c-1',
        table: 'users',
        pkColumn: 'id',
        pkValue: 1,
        column: 'bio',
        oldValue: null,
        newValue: 'new bio',
        timestamp: 1,
      },
    ];
    const sql = mockSql({
      users: { columns: ['id', 'bio'], rows: [[1, null]] },
    });
    const conflicts = await detectDraftConflicts(changes, sql);
    assert.deepStrictEqual(conflicts, []);
  });
});
