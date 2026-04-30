/**
 * Tests for compact schema text built for NL-to-SQL LLM prompts.
 */
import * as assert from 'node:assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import type { ForeignKey, TableMetadata } from '../api-types';
import type { ISchemaInsights, SchemaIntelligence } from '../engines/schema-intelligence';
import { SchemaContextBuilder } from '../nl-sql/schema-context-builder';

/** Stubs `getConfiguration` so `driftViewer.nlSql` keys use [getImpl]; other sections return defaults. */
function stubNlSqlConfig(
  getImpl: (key: string, defaultValue?: unknown) => unknown,
): sinon.SinonStub {
  const emptyCfg = {
    get: <T>(_key: string, defaultValue?: T) => defaultValue as T,
    has: () => false,
    inspect: () => undefined,
    update: async () => undefined,
  } as vscode.WorkspaceConfiguration;
  return sinon.stub(vscode.workspace, 'getConfiguration').callsFake((section?: string) => {
    if (section === 'driftViewer.nlSql') {
      return {
        ...emptyCfg,
        get: <T>(key: string, defaultValue?: T) => {
          const v = getImpl(key, defaultValue);
          return (v !== undefined && v !== null ? v : defaultValue) as T;
        },
      } as vscode.WorkspaceConfiguration;
    }
    return emptyCfg;
  });
}

function makeClient(
  tables: TableMetadata[],
  fkByTable: Record<string, ForeignKey[]>,
): DriftApiClient {
  return {
    async schemaMetadata() {
      return tables;
    },
    async tableFkMeta(tableName: string) {
      return fkByTable[tableName] ?? [];
    },
  } as unknown as DriftApiClient;
}

describe('SchemaContextBuilder', () => {
  it('returns a friendly message when there are no tables', async () => {
    const builder = new SchemaContextBuilder(makeClient([], {}));
    const text = await builder.build();
    assert.strictEqual(text, 'No tables found.');
  });

  it('formats one table with columns and row count', async () => {
    const tables: TableMetadata[] = [
      {
        name: 'users',
        rowCount: 42,
        columns: [
          { name: 'id', type: 'INTEGER', pk: true },
          { name: 'name', type: 'TEXT', pk: false },
        ],
      },
    ];
    const builder = new SchemaContextBuilder(makeClient(tables, { users: [] }));
    const text = await builder.build();
    assert.ok(text.includes('users('));
    assert.ok(text.includes('id INTEGER PK'));
    assert.ok(text.includes('name TEXT'));
    assert.ok(text.includes('[42 rows]'));
  });

  it('uses SchemaIntelligence when provided (FKs from getForeignKeys)', async () => {
    const insights: ISchemaInsights = {
      tables: [
        {
          name: 'orders',
          rowCount: 3,
          columnCount: 2,
          hasPrimaryKey: true,
          foreignKeyCount: 1,
          indexedColumnCount: 2,
          anomalyCount: 0,
          columns: [
            {
              table: 'orders',
              column: 'id',
              type: 'INTEGER',
              nullable: false,
              isPrimaryKey: true,
              hasForeignKey: false,
              hasIndex: true,
            },
            {
              table: 'orders',
              column: 'user_id',
              type: 'INTEGER',
              nullable: false,
              isPrimaryKey: false,
              hasForeignKey: true,
              hasIndex: true,
            },
          ],
        },
      ],
      totalTables: 1,
      totalColumns: 2,
      totalRows: 3,
      missingIndexes: [],
      anomalies: [],
      tablesWithoutPk: [],
      orphanedFkTables: [],
    };
    const fks: ForeignKey[] = [
      { fromColumn: 'user_id', toTable: 'users', toColumn: 'id' },
    ];
    const intel = {
      getInsights: async () => insights,
      getForeignKeys: async (name: string) => (name === 'orders' ? fks : []),
    } as unknown as SchemaIntelligence;
    const client = makeClient([], {});
    const builder = new SchemaContextBuilder(client, intel);
    const text = await builder.build();
    assert.ok(text.includes('FK->users.id'));
    assert.ok(text.includes('orders('));
  });

  it('omits extra tables when maxSchemaTables caps the client path', async () => {
    const stub = stubNlSqlConfig((key) => (key === 'maxSchemaTables' ? 1 : undefined));
    try {
      const t1: TableMetadata = {
        name: 'alpha',
        rowCount: 0,
        columns: [{ name: 'id', type: 'INTEGER', pk: true }],
      };
      const t2: TableMetadata = {
        name: 'beta',
        rowCount: 0,
        columns: [{ name: 'id', type: 'INTEGER', pk: true }],
      };
      const builder = new SchemaContextBuilder(
        makeClient([t1, t2], { alpha: [], beta: [] }),
      );
      const text = await builder.build();
      assert.ok(text.includes('alpha('));
      assert.ok(!text.includes('beta('));
      assert.ok(text.includes('maxSchemaTables'));
    } finally {
      stub.restore();
    }
  });

  it('truncates with notice when maxSchemaContextChars is tiny', async () => {
    const stub = stubNlSqlConfig((key) =>
      key === 'maxSchemaContextChars' ? 12 : undefined,
    );
    try {
      const tables: TableMetadata[] = [
        {
          name: 'wide',
          rowCount: 1,
          columns: [{ name: 'x', type: 'TEXT', pk: false }],
        },
      ];
      const builder = new SchemaContextBuilder(makeClient(tables, { wide: [] }));
      const text = await builder.build();
      assert.ok(text.includes('maxSchemaContextChars'));
      assert.ok(text.length < 500);
    } finally {
      stub.restore();
    }
  });

  it('annotates FK columns from tableFkMeta', async () => {
    const tables: TableMetadata[] = [
      {
        name: 'orders',
        rowCount: 3,
        columns: [
          { name: 'id', type: 'INTEGER', pk: true },
          { name: 'user_id', type: 'INTEGER', pk: false },
        ],
      },
    ];
    const fks: ForeignKey[] = [
      { fromColumn: 'user_id', toTable: 'users', toColumn: 'id' },
    ];
    const builder = new SchemaContextBuilder(
      makeClient(tables, { orders: fks }),
    );
    const text = await builder.build();
    assert.ok(text.includes('FK->users.id'));
  });
});
