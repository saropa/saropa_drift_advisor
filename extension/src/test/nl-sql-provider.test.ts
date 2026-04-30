/**
 * Tests for NL-to-SQL orchestration: validation must run before history writes.
 */
import * as assert from 'node:assert';
import * as sinon from 'sinon';
import { MockMemento } from './vscode-mock';
import { LlmClient } from '../nl-sql/llm-client';
import { NlSqlHistory } from '../nl-sql/nl-sql-history';
import { NlSqlProvider } from '../nl-sql/nl-sql-provider';
import { SchemaContextBuilder } from '../nl-sql/schema-context-builder';
import type { DriftApiClient } from '../api-client';
import type { TableMetadata } from '../api-types';

describe('NlSqlProvider', () => {
  it('does not append history when validation fails after LLM returns unsafe SQL', async () => {
    const tables: TableMetadata[] = [
      {
        name: 't',
        rowCount: 0,
        columns: [{ name: 'id', type: 'INTEGER', pk: true }],
      },
    ];
    const client = {
      async schemaMetadata() {
        return tables;
      },
      async tableFkMeta() {
        return [];
      },
    } as unknown as DriftApiClient;

    const schemaBuilder = new SchemaContextBuilder(client);
    const llm = sinon.createStubInstance(LlmClient);
    llm.generateSql.resolves('DELETE FROM t');

    const memento = new MockMemento();
    const history = new NlSqlHistory(memento);
    const addSpy = sinon.spy(history, 'add');

    const provider = new NlSqlProvider(schemaBuilder, llm as unknown as LlmClient, history);

    await assert.rejects(() => provider.ask('remove everything'), /Only SELECT/i);
    assert.strictEqual(addSpy.callCount, 0);
    addSpy.restore();
  });

  it('persists history after successful validation', async () => {
    const tables: TableMetadata[] = [
      {
        name: 't',
        rowCount: 1,
        columns: [{ name: 'id', type: 'INTEGER', pk: true }],
      },
    ];
    const client = {
      async schemaMetadata() {
        return tables;
      },
      async tableFkMeta() {
        return [];
      },
    } as unknown as DriftApiClient;

    const schemaBuilder = new SchemaContextBuilder(client);
    const llm = sinon.createStubInstance(LlmClient);
    llm.generateSql.resolves('SELECT * FROM "t"');

    const memento = new MockMemento();
    const history = new NlSqlHistory(memento);
    const provider = new NlSqlProvider(schemaBuilder, llm as unknown as LlmClient, history);

    const sql = await provider.ask('all rows');
    assert.strictEqual(sql, 'SELECT * FROM "t"');
    assert.strictEqual(history.entries.length, 1);
    assert.strictEqual(history.entries[0].question, 'all rows');
  });
});
