/**
 * Unit tests for refactoring analyzer heuristics (Feature 66).
 */
import * as assert from 'node:assert';
import { describe, it } from 'mocha';
import type { DriftApiClient } from '../api-client';
import type { ForeignKey, TableMetadata } from '../api-types';
import { RefactoringAnalyzer } from '../refactoring/refactoring-analyzer';

function makeClient(handlers: {
  tables: TableMetadata[];
  sqlResults: Map<string, { columns: string[]; rows: unknown[][] }>;
  fks?: Map<string, ForeignKey[]>;
}): DriftApiClient {
  const fks = handlers.fks ?? new Map();
  return {
    async schemaMetadata() {
      return handlers.tables;
    },
    async sql(query: string) {
      for (const [key, res] of handlers.sqlResults) {
        if (query.includes(key)) return res;
      }
      return { columns: ['distinct_count', 'total'], rows: [[0, 0]] };
    },
    async tableFkMeta(tableName: string) {
      return fks.get(tableName) ?? [];
    },
  } as unknown as DriftApiClient;
}

describe('RefactoringAnalyzer', () => {
  it('suggests normalize for low-cardinality TEXT', async () => {
    const tables: TableMetadata[] = [
      {
        name: 'orders',
        rowCount: 1000,
        columns: [{ name: 'status', type: 'TEXT', pk: false }],
      },
    ];
    const sqlResults = new Map<string, { columns: string[]; rows: unknown[][] }>([
      ['COUNT(DISTINCT', { columns: ['distinct_count', 'total'], rows: [[5, 1000]] }],
      ['GROUP BY', { columns: ['v', 'c'], rows: [['a', 400], ['b', 300]] }],
    ]);
    const analyzer = new RefactoringAnalyzer(makeClient({ tables, sqlResults }));
    const out = await analyzer.analyze();
    assert.ok(out.some((s) => s.type === 'normalize' && s.tables[0] === 'orders'));
  });

  it('skips normalize for high cardinality', async () => {
    const tables: TableMetadata[] = [
      {
        name: 't',
        rowCount: 1000,
        columns: [{ name: 'x', type: 'TEXT', pk: false }],
      },
    ];
    const sqlResults = new Map([
      ['COUNT(DISTINCT', { columns: ['distinct_count', 'total'], rows: [[500, 1000]] }],
    ]);
    const analyzer = new RefactoringAnalyzer(makeClient({ tables, sqlResults }));
    const out = await analyzer.analyze();
    assert.ok(!out.some((s) => s.type === 'normalize'));
  });

  it('suggests split for wide tables', async () => {
    const cols: TableMetadata['columns'] = [];
    for (let i = 0; i < 15; i++) {
      cols.push({ name: `c${i}`, type: 'TEXT', pk: i === 0 });
    }
    const tables: TableMetadata[] = [{ name: 'wide', rowCount: 1, columns: cols }];
    const analyzer = new RefactoringAnalyzer(makeClient({ tables, sqlResults: new Map() }));
    const out = await analyzer.analyze();
    assert.ok(out.some((s) => s.type === 'split' && s.tables[0] === 'wide'));
  });

  it('skips merge when FK already links tables', async () => {
    const tables: TableMetadata[] = [
      {
        name: 'a',
        rowCount: 10,
        columns: [{ name: 'user_id', type: 'INTEGER', pk: false }],
      },
      {
        name: 'b',
        rowCount: 10,
        columns: [{ name: 'user_id', type: 'INTEGER', pk: true }],
      },
    ];
    const fks = new Map<string, ForeignKey[]>([
      ['a', [{ fromColumn: 'user_id', toTable: 'b', toColumn: 'user_id' }]],
      ['b', []],
    ]);
    const analyzer = new RefactoringAnalyzer(makeClient({ tables, sqlResults: new Map(), fks }));
    const out = await analyzer.analyze();
    assert.ok(!out.some((s) => s.type === 'merge'));
  });

  it('excludes sqlite_ system tables from analysis inputs', async () => {
    const tables: TableMetadata[] = [
      {
        name: 'sqlite_sequence',
        rowCount: 1,
        columns: [{ name: 'name', type: 'TEXT', pk: false }],
      },
    ];
    const sqlResults = new Map([
      ['COUNT(DISTINCT', { columns: ['distinct_count', 'total'], rows: [[1, 200]] }],
    ]);
    const analyzer = new RefactoringAnalyzer(makeClient({ tables, sqlResults }));
    const out = await analyzer.analyze();
    assert.strictEqual(out.length, 0);
  });
});

/**
 * Golden fixtures for the deterministic `extract` detector (Feature 69).
 * These are schema-only (no SQL probes), so an empty `sqlResults` map is used;
 * the default client response keeps normalization/merge probes quiet.
 */
describe('RefactoringAnalyzer extract detection', () => {
  /** Builds a user table with an `id` PK plus the given (name, type) columns. */
  function table(name: string, cols: Array<[string, string]>): TableMetadata {
    return {
      name,
      rowCount: 10,
      columns: [
        { name: 'id', type: 'INTEGER', pk: true },
        ...cols.map(([n, t]) => ({ name: n, type: t, pk: false })),
      ],
    };
  }

  async function run(tables: TableMetadata[]): Promise<ReturnType<RefactoringAnalyzer['analyze']>> {
    const analyzer = new RefactoringAnalyzer(makeClient({ tables, sqlResults: new Map() }));
    return analyzer.analyze();
  }

  it('suggests extract for an audit column family across tables', async () => {
    const cols: Array<[string, string]> = [['created_at', 'TEXT'], ['updated_at', 'TEXT']];
    const out = await run([table('users', cols), table('orders', cols), table('products', cols)]);
    const ex = out.find((s) => s.type === 'extract');
    assert.ok(ex, 'expected an extract suggestion');
    assert.deepStrictEqual(ex!.columns, ['created_at', 'updated_at']);
    assert.strictEqual(ex!.tables.length, 3);
    assert.ok(ex!.confidence >= 0.8, 'family bundle should score high confidence');
    assert.strictEqual(ex!.severity, 'high');
  });

  it('suggests extract for address columns shared across ragged table sets', async () => {
    const out = await run([
      table('users', [['street', 'TEXT'], ['city', 'TEXT'], ['zip', 'TEXT']]),
      table('companies', [['street', 'TEXT'], ['city', 'TEXT'], ['country', 'TEXT']]),
    ]);
    const ex = out.find((s) => s.type === 'extract' && s.title.includes('address'));
    assert.ok(ex, 'expected an address extract suggestion');
    // zip/country appear in only one table each and are excluded; street/city remain.
    assert.deepStrictEqual(ex!.columns, ['city', 'street']);
  });

  it('suggests extract for a generic recurring column group', async () => {
    const cols: Array<[string, string]> = [['width', 'INTEGER'], ['height', 'INTEGER']];
    const out = await run([table('a', cols), table('b', cols), table('c', cols)]);
    const ex = out.find((s) => s.type === 'extract');
    assert.ok(ex, 'expected a generic extract suggestion');
    assert.deepStrictEqual(ex!.columns, ['height', 'width']);
    assert.ok(ex!.confidence < 0.8, 'generic bundle scores below a known family');
  });

  it('skips extract when a candidate column appears in only one table', async () => {
    const out = await run([
      table('only', [['created_at', 'TEXT'], ['updated_at', 'TEXT']]),
      table('other', [['title', 'TEXT']]),
    ]);
    assert.ok(!out.some((s) => s.type === 'extract'));
  });

  it('excludes a column whose type is inconsistent across tables', async () => {
    const out = await run([
      table('a', [['label', 'TEXT'], ['note', 'TEXT'], ['code', 'TEXT']]),
      table('b', [['label', 'TEXT'], ['note', 'TEXT'], ['code', 'TEXT']]),
      table('c', [['label', 'TEXT'], ['note', 'TEXT'], ['code', 'INTEGER']]),
    ]);
    const ex = out.find((s) => s.type === 'extract');
    assert.ok(ex, 'label/note still form a bundle');
    assert.ok(ex!.columns.includes('label') && ex!.columns.includes('note'));
    assert.ok(!ex!.columns.includes('code'), 'type-inconsistent column must be excluded');
  });
});
