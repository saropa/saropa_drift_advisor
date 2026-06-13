import * as assert from 'assert';
import { restoreBranch } from '../branching/branch-restore';
import type { DriftApiClient } from '../api-client';
import type { IDataBranch } from '../branching/branch-types';

// Audit M9: restore must submit all clears + inserts as ONE atomic batch
// (POST /api/edits/apply, which the server wraps in a transaction), not as
// individual writes through the read-only /api/sql path.
describe('restoreBranch (M9 — atomic, transactional)', () => {
  function fakeClient(): {
    client: DriftApiClient;
    sqlCalls: string[];
    batches: string[][];
  } {
    const sqlCalls: string[] = [];
    const batches: string[][] = [];
    const client = {
      // DataReset.getAllFks reads FK metadata via tableFkMeta(); return none.
      tableFkMeta: async () => [],
      // Any write that wrongly went through sql() would be recorded here.
      sql: async (q: string) => {
        sqlCalls.push(q);
        return { columns: [] as string[], rows: [] as unknown[][] };
      },
      applyEditsBatch: async (statements: string[]) => {
        batches.push(statements);
      },
    } as unknown as DriftApiClient;
    return { client, sqlCalls, batches };
  }

  const branch: IDataBranch = {
    id: 'b1',
    name: 'snapshot',
    createdAt: '2026-01-01T00:00:00Z',
    tables: [
      { name: 'a', columns: [], rows: [{ id: 1 }], pkColumns: ['id'] },
      { name: 'b', columns: [], rows: [{ id: 2 }, { id: 3 }], pkColumns: ['id'] },
    ],
    metadata: { tableCount: 2, totalRows: 3, truncated: false },
  };

  it('sends one atomic batch and never writes through client.sql', async () => {
    const { client, sqlCalls, batches } = fakeClient();
    const result = await restoreBranch(client, branch);

    // Exactly one transactional apply.
    assert.strictEqual(batches.length, 1);
    // No DELETE/INSERT leaked onto the read-only sql() path.
    assert.ok(
      sqlCalls.every((q) => !/\b(delete|insert)\b/i.test(q)),
      'no write statements via client.sql',
    );

    const stmts = batches[0];
    const deletes = stmts.filter((s) => s.startsWith('DELETE FROM'));
    const inserts = stmts.filter((s) => s.startsWith('INSERT INTO'));
    assert.strictEqual(deletes.length, 2); // one per table
    assert.strictEqual(inserts.length, 3); // one per row
    assert.strictEqual(result.rowsInserted, 3);

    // All clears precede all inserts within the single transaction.
    const firstInsert = stmts.findIndex((s) => s.startsWith('INSERT INTO'));
    const lastDelete = stmts.map((s) => s.startsWith('DELETE FROM')).lastIndexOf(true);
    assert.ok(lastDelete < firstInsert, 'deletes ordered before inserts');

    // Identifiers are quoted.
    assert.ok(stmts.some((s) => s.includes('"a"')));
    assert.ok(stmts.some((s) => s.includes('"b"')));
  });

  it('does nothing (no batch) for an empty branch', async () => {
    const { client, batches } = fakeClient();
    const empty: IDataBranch = {
      ...branch,
      tables: [],
      metadata: { tableCount: 0, totalRows: 0, truncated: false },
    };
    const result = await restoreBranch(client, empty);
    assert.strictEqual(batches.length, 0);
    assert.strictEqual(result.rowsInserted, 0);
  });
});
