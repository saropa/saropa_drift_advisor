/**
 * Tests for import-executor.ts
 */

import * as assert from 'assert';
import type { ColumnMetadata } from '../api-types';
import { ImportExecutor } from '../import/import-executor';
import type { IImportOptions } from '../import/clipboard-import-types';

describe('ImportExecutor', () => {
  const columns: ColumnMetadata[] = [
    { name: 'id', type: 'INTEGER', pk: true, notnull: true },
    { name: 'name', type: 'TEXT', pk: false, notnull: true },
    { name: 'email', type: 'TEXT', pk: false, notnull: false },
  ];

  function createMockClient(options: {
    existingRows?: Record<string, unknown>[];
    shouldFail?: boolean;
    failOnRow?: number;
  } = {}) {
    const insertedRows: Record<string, unknown>[] = [];
    const updatedRows: Record<string, unknown>[] = [];
    const deletedIds: string[] = [];
    let lastInsertId = 100;
    let currentRow = 0;
    let inTransaction = false;

    return {
      insertedRows,
      updatedRows,
      deletedIds,
      sql: async (query: string) => {
        if (query === 'BEGIN TRANSACTION') {
          inTransaction = true;
          return { columns: [], rows: [] };
        }
        if (query === 'COMMIT') {
          inTransaction = false;
          return { columns: [], rows: [] };
        }
        if (query === 'ROLLBACK') {
          inTransaction = false;
          insertedRows.length = 0;
          updatedRows.length = 0;
          return { columns: [], rows: [] };
        }

        if (query.startsWith('SELECT * FROM')) {
          const match = query.match(/WHERE "id" = '(\d+)'/);
          if (match && options.existingRows) {
            const id = parseInt(match[1], 10);
            const existing = options.existingRows.find((r) => r.id === id);
            if (existing) {
              return {
                columns: Object.keys(existing),
                rows: [Object.values(existing)],
              };
            }
          }
          return { columns: [], rows: [] };
        }

        if (query.startsWith('INSERT INTO')) {
          if (options.shouldFail && options.failOnRow === currentRow) {
            currentRow++;
            throw new Error('Simulated failure');
          }
          insertedRows.push({ query });
          currentRow++;
          return { columns: [], rows: [] };
        }

        if (query.startsWith('UPDATE')) {
          if (options.shouldFail && options.failOnRow === currentRow) {
            currentRow++;
            throw new Error('Simulated failure');
          }
          updatedRows.push({ query });
          currentRow++;
          return { columns: [], rows: [] };
        }

        if (query.startsWith('DELETE FROM')) {
          if (options.shouldFail && options.failOnRow === currentRow) {
            currentRow++;
            throw new Error('Simulated failure');
          }
          const match = query.match(/WHERE "id" = '(\d+)'/);
          if (match) {
            deletedIds.push(match[1]);
          }
          return { columns: [], rows: [] };
        }

        if (query === 'SELECT last_insert_rowid()') {
          return { columns: ['id'], rows: [[lastInsertId++]] };
        }

        return { columns: [], rows: [] };
      },
    } as any;
  }

  const defaultOptions: IImportOptions = {
    strategy: 'insert',
    matchBy: 'pk',
    continueOnError: false,
  };

  describe('execute()', () => {
    it('should return success for empty rows', async () => {
      const client = createMockClient();
      const executor = new ImportExecutor(client);

      const result = await executor.execute('users', [], columns, defaultOptions);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.imported, 0);
    });

    it('should insert rows with insert strategy', async () => {
      const client = createMockClient();
      const executor = new ImportExecutor(client);

      const rows = [
        { id: '1', name: 'Alice', email: 'alice@test.com' },
        { id: '2', name: 'Bob', email: 'bob@test.com' },
      ];

      const result = await executor.execute('users', rows, columns, defaultOptions);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.imported, 2);
      assert.strictEqual(client.insertedRows.length, 2);
    });

    it('should track inserted IDs', async () => {
      const client = createMockClient();
      const executor = new ImportExecutor(client);

      const rows = [{ id: '1', name: 'Alice' }];

      const result = await executor.execute('users', rows, columns, defaultOptions);

      assert.strictEqual(result.insertedIds.length, 1);
      assert.strictEqual(result.insertedIds[0], 100);
    });

    it('should rollback on error with continueOnError=false', async () => {
      const client = createMockClient({ shouldFail: true, failOnRow: 1 });
      const executor = new ImportExecutor(client);

      const rows = [
        { id: '1', name: 'Alice' },
        { id: '2', name: 'Bob' },
      ];

      const result = await executor.execute('users', rows, columns, defaultOptions);

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.errors.length, 1);
      assert.strictEqual(result.errors[0].row, 1);
    });

    it('should continue on error with continueOnError=true', async () => {
      const client = createMockClient({ shouldFail: true, failOnRow: 0 });
      const executor = new ImportExecutor(client);

      const rows = [
        { id: '1', name: 'Alice' },
        { id: '2', name: 'Bob' },
      ];

      const result = await executor.execute('users', rows, columns, {
        ...defaultOptions,
        continueOnError: true,
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.errors.length, 1);
      assert.strictEqual(result.imported, 1);
    });

    it('should skip existing rows with insert_skip_conflicts strategy', async () => {
      const client = createMockClient({
        existingRows: [{ id: 1, name: 'Existing' }],
      });
      const executor = new ImportExecutor(client);

      const rows = [
        { id: '1', name: 'Alice' },
        { id: '2', name: 'Bob' },
      ];

      const result = await executor.execute('users', rows, columns, {
        ...defaultOptions,
        strategy: 'insert_skip_conflicts',
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.skipped, 1);
      assert.strictEqual(result.imported, 1);
    });

    it('should update existing rows with upsert strategy', async () => {
      const client = createMockClient({
        existingRows: [{ id: 1, name: 'Existing', email: 'old@test.com' }],
      });
      const executor = new ImportExecutor(client);

      const rows = [{ id: '1', name: 'Alice', email: 'new@test.com' }];

      const result = await executor.execute('users', rows, columns, {
        ...defaultOptions,
        strategy: 'upsert',
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.imported, 1);
      assert.strictEqual(result.updatedRows.length, 1);
      assert.strictEqual(client.updatedRows.length, 1);
    });
  });

  describe('dryRun()', () => {
    it('should count inserts for new rows', async () => {
      const client = createMockClient();
      const executor = new ImportExecutor(client);

      const rows = [
        { id: '1', name: 'Alice' },
        { id: '2', name: 'Bob' },
      ];

      const result = await executor.dryRun('users', rows, columns, defaultOptions);

      assert.strictEqual(result.wouldInsert, 2);
      assert.strictEqual(result.wouldUpdate, 0);
      assert.strictEqual(result.wouldSkip, 0);
    });

    it('should count skips for existing rows with insert strategy', async () => {
      const client = createMockClient({
        existingRows: [{ id: 1, name: 'Existing' }],
      });
      const executor = new ImportExecutor(client);

      const rows = [{ id: '1', name: 'Alice' }];

      const result = await executor.dryRun('users', rows, columns, defaultOptions);

      assert.strictEqual(result.wouldSkip, 1);
      assert.strictEqual(result.wouldInsert, 0);
    });

    it('should count updates for existing rows with upsert strategy', async () => {
      const client = createMockClient({
        existingRows: [{ id: 1, name: 'Existing' }],
      });
      const executor = new ImportExecutor(client);

      const rows = [{ id: '1', name: 'Alice' }];

      const result = await executor.dryRun('users', rows, columns, {
        ...defaultOptions,
        strategy: 'upsert',
      });

      assert.strictEqual(result.wouldUpdate, 1);
      assert.strictEqual(result.wouldInsert, 0);
    });

    it('should generate conflict previews for upserts', async () => {
      const client = createMockClient({
        existingRows: [{ id: 1, name: 'Old Name', email: 'old@test.com' }],
      });
      const executor = new ImportExecutor(client);

      const rows = [{ id: '1', name: 'New Name', email: 'new@test.com' }];

      const result = await executor.dryRun('users', rows, columns, {
        ...defaultOptions,
        strategy: 'upsert',
      });

      assert.strictEqual(result.conflicts.length, 1);
      assert.strictEqual(result.conflicts[0].diff.length, 2);
    });
  });

  describe('undoImport()', () => {
    it('should delete inserted rows', async () => {
      const client = createMockClient();
      const executor = new ImportExecutor(client);

      const result = await executor.undoImport('users', [1, 2, 3], [], 'id');

      assert.strictEqual(result.success, true);
      assert.strictEqual(client.deletedIds.length, 3);
    });

    it('should restore updated rows', async () => {
      const client = createMockClient();
      const executor = new ImportExecutor(client);

      const result = await executor.undoImport(
        'users',
        [],
        [{ id: 1, previousValues: { id: 1, name: 'Original', email: 'orig@test.com' } }],
        'id',
      );

      assert.strictEqual(result.success, true);
      assert.strictEqual(client.updatedRows.length, 1);
    });

    it('should return error on failure', async () => {
      const client = createMockClient({ shouldFail: true, failOnRow: 0 });
      const executor = new ImportExecutor(client);

      const result = await executor.undoImport('users', [1], [], 'id');

      assert.strictEqual(result.success, false);
      assert.ok(result.error);
    });
  });
});
