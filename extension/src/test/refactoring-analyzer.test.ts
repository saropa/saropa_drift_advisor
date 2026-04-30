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
