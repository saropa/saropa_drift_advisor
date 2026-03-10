import * as assert from 'assert';
import * as sinon from 'sinon';
import {
  GlobalSearchEngine,
  buildCondition,
  isTextType,
  matchesValue,
} from '../global-search/global-search-engine';
import type { DriftApiClient } from '../api-client';
import type { TableMetadata } from '../api-types';

function makeMeta(overrides: Partial<TableMetadata> = {}): TableMetadata {
  return {
    name: 'users',
    columns: [
      { name: 'id', type: 'INTEGER', pk: true },
      { name: 'email', type: 'TEXT', pk: false },
      { name: 'name', type: 'TEXT', pk: false },
    ],
    rowCount: 5,
    ...overrides,
  };
}

function fakeClient(
  tables: TableMetadata[],
  sqlResults: Map<string, { columns: string[]; rows: unknown[][] }>,
): DriftApiClient {
  return {
    schemaMetadata: sinon.stub().resolves(tables),
    sql: sinon.stub().callsFake((query: string) => {
      for (const [key, val] of sqlResults) {
        if (query.includes(`"${key}"`)) return Promise.resolve(val);
      }
      return Promise.resolve({ columns: [], rows: [] });
    }),
  } as unknown as DriftApiClient;
}

describe('GlobalSearchEngine', () => {
  it('should find exact match in correct table and column', async () => {
    const client = fakeClient(
      [makeMeta()],
      new Map([
        ['users', {
          columns: ['id', 'email', 'name'],
          rows: [[42, 'alice@test.com', 'Alice']],
        }],
      ]),
    );
    const engine = new GlobalSearchEngine(client);
    const result = await engine.search('alice@test.com', 'exact', 'all');

    assert.strictEqual(result.matches.length, 1);
    assert.strictEqual(result.matches[0].table, 'users');
    assert.strictEqual(result.matches[0].column, 'email');
    assert.strictEqual(result.matches[0].matchedValue, 'alice@test.com');
    assert.strictEqual(result.matches[0].rowPk, 42);
    assert.strictEqual(result.tablesSearched, 1);
  });

  it('should find contains matches for partial strings', async () => {
    const client = fakeClient(
      [makeMeta()],
      new Map([
        ['users', {
          columns: ['id', 'email', 'name'],
          rows: [[1, 'alice@test.com', 'alice jones']],
        }],
      ]),
    );
    const engine = new GlobalSearchEngine(client);
    const result = await engine.search('alice', 'contains', 'all');

    assert.strictEqual(result.matches.length, 2);
    const cols = result.matches.map((m) => m.column).sort();
    assert.deepStrictEqual(cols, ['email', 'name'].sort());
  });

  it('should return empty matches when nothing found', async () => {
    const client = fakeClient(
      [makeMeta()],
      new Map([['users', { columns: ['id', 'email', 'name'], rows: [] }]]),
    );
    const engine = new GlobalSearchEngine(client);
    const result = await engine.search('nonexistent', 'exact', 'all');

    assert.strictEqual(result.matches.length, 0);
    assert.strictEqual(result.tablesSearched, 1);
    assert.strictEqual(result.query, 'nonexistent');
    assert.strictEqual(result.mode, 'exact');
  });

  it('should skip sqlite_ internal tables', async () => {
    const tables = [
      makeMeta(),
      makeMeta({ name: 'sqlite_sequence', columns: [], rowCount: 0 }),
    ];
    const client = fakeClient(
      tables,
      new Map([['users', { columns: ['id', 'email', 'name'], rows: [] }]]),
    );
    const engine = new GlobalSearchEngine(client);
    const result = await engine.search('test', 'contains', 'all');

    assert.strictEqual(result.tablesSearched, 1);
  });

  it('should filter to text columns when scope is text_only', async () => {
    const client = fakeClient(
      [makeMeta()],
      new Map([
        ['users', {
          columns: ['id', 'email', 'name'],
          rows: [[42, 'alice@test.com', 'Alice']],
        }],
      ]),
    );
    const engine = new GlobalSearchEngine(client);
    const result = await engine.search('42', 'exact', 'text_only');

    // '42' matches nothing in TEXT columns (email and name don't contain '42')
    assert.strictEqual(result.matches.length, 0);
  });

  it('should escape single quotes in SQL', () => {
    const cond = buildCondition('name', "O'Brien", 'exact');
    assert.ok(cond.includes("O''Brien"), 'single quotes should be doubled');
    assert.ok(!cond.includes("O'Brien' "), 'raw quote should not appear');
  });

  it('should handle multiple matches in same table', async () => {
    const client = fakeClient(
      [makeMeta()],
      new Map([
        ['users', {
          columns: ['id', 'email', 'name'],
          rows: [
            [1, 'test@a.com', 'Test User'],
            [2, 'test@b.com', 'Another Test'],
          ],
        }],
      ]),
    );
    const engine = new GlobalSearchEngine(client);
    const result = await engine.search('test', 'contains', 'text_only');

    // Both rows should match in email and/or name columns
    assert.ok(result.matches.length >= 2);
    assert.ok(result.matches.every((m) => m.table === 'users'));
  });

  it('should gracefully skip tables that throw errors', async () => {
    const meta = [makeMeta(), makeMeta({ name: 'dropped', rowCount: 0 })];
    const sqlStub = sinon.stub();
    sqlStub.callsFake((query: string) => {
      if (query.includes('"dropped"')) {
        return Promise.reject(new Error('no such table'));
      }
      return Promise.resolve({ columns: ['id', 'email', 'name'], rows: [] });
    });
    const client = {
      schemaMetadata: sinon.stub().resolves(meta),
      sql: sqlStub,
    } as unknown as DriftApiClient;

    const engine = new GlobalSearchEngine(client);
    const result = await engine.search('test', 'exact', 'all');

    // Should not throw, tables searched includes both
    assert.strictEqual(result.tablesSearched, 2);
  });

  it('should find regex matches via JS post-filter', async () => {
    const client = fakeClient(
      [makeMeta()],
      new Map([
        ['users', {
          columns: ['id', 'email', 'name'],
          rows: [[1, 'alice@test.com', 'Alice99']],
        }],
      ]),
    );
    const engine = new GlobalSearchEngine(client);
    const result = await engine.search('\\d+', 'regex', 'all');

    // Regex \d+ matches '1' in id (cast to text), '99' in name
    assert.ok(result.matches.length >= 1);
    assert.ok(result.matches.some((m) => m.column === 'name'));
  });

  it('should measure duration greater than or equal to zero', async () => {
    const client = fakeClient(
      [makeMeta()],
      new Map([['users', { columns: ['id', 'email', 'name'], rows: [] }]]),
    );
    const engine = new GlobalSearchEngine(client);
    const result = await engine.search('test', 'exact', 'all');

    assert.ok(result.durationMs >= 0);
  });
});

describe('buildCondition', () => {
  it('should build exact match condition', () => {
    const cond = buildCondition('email', 'test@a.com', 'exact');
    assert.strictEqual(cond, 'CAST("email" AS TEXT) = \'test@a.com\'');
  });

  it('should build contains condition with LIKE', () => {
    const cond = buildCondition('name', 'alice', 'contains');
    assert.ok(cond.includes('LIKE'));
    assert.ok(cond.includes('alice'));
  });

  it('should escape LIKE wildcards with ESCAPE clause', () => {
    const cond = buildCondition('name', '100%', 'contains');
    assert.ok(cond.includes('100\\%'), 'percent should be escaped');
    assert.ok(cond.includes("ESCAPE '\\'"), 'ESCAPE clause required for SQLite');
  });
});

describe('matchesValue', () => {
  it('should match exact values', () => {
    assert.ok(matchesValue('hello', 'hello', 'exact'));
    assert.ok(!matchesValue('Hello', 'hello', 'exact'));
  });

  it('should match contains values', () => {
    assert.ok(matchesValue('hello world', 'world', 'contains'));
    assert.ok(!matchesValue('hello', 'world', 'contains'));
  });

  it('should match regex values', () => {
    assert.ok(matchesValue('hello123', '\\d+', 'regex'));
    assert.ok(!matchesValue('hello', '\\d+', 'regex'));
  });

  it('should return false for invalid regex', () => {
    assert.ok(!matchesValue('test', '[invalid', 'regex'));
  });
});

describe('isTextType', () => {
  it('should identify TEXT types', () => {
    assert.ok(isTextType('TEXT'));
    assert.ok(isTextType('VARCHAR(255)'));
    assert.ok(isTextType('CHAR(10)'));
  });

  it('should reject non-text types', () => {
    assert.ok(!isTextType('INTEGER'));
    assert.ok(!isTextType('REAL'));
    assert.ok(!isTextType('BLOB'));
  });
});
