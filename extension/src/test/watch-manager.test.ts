import * as assert from 'assert';
import * as sinon from 'sinon';
import { MockMemento, resetMocks } from './vscode-mock';
import { DriftApiClient } from '../api-client';
import { WatchManager } from '../watch/watch-manager';

// watch-diff pure function tests moved to watch-diff.test.ts

describe('WatchManager', () => {
  let fetchStub: sinon.SinonStub;
  let client: DriftApiClient;
  let manager: WatchManager;
  let memento: MockMemento;

  const sampleResponse = {
    columns: ['id', 'name', 'age'],
    rows: [[1, 'Alice', 30], [2, 'Bob', 25]],
  };

  function stubSqlResponse(data: object): void {
    fetchStub.resolves(
      new Response(JSON.stringify(data), { status: 200 }),
    );
  }

  beforeEach(() => {
    resetMocks();
    fetchStub = sinon.stub(globalThis, 'fetch');
    client = new DriftApiClient('127.0.0.1', 8642);
    memento = new MockMemento();
    manager = new WatchManager(client, memento);
  });

  afterEach(() => {
    fetchStub.restore();
  });

  describe('add()', () => {
    it('should add a watch and run initial query', async () => {
      stubSqlResponse(sampleResponse);
      const id = await manager.add('SELECT * FROM users', 'users');
      assert.ok(id);
      assert.strictEqual(manager.entries.length, 1);
      assert.strictEqual(manager.entries[0].label, 'users');
      assert.deepStrictEqual(manager.entries[0].columns, ['id', 'name', 'age']);
    });

    it('should detect pk from schema columns', async () => {
      stubSqlResponse(sampleResponse);
      const schema = [
        { name: 'id', type: 'INTEGER', pk: true },
        { name: 'name', type: 'TEXT', pk: false },
        { name: 'age', type: 'INTEGER', pk: false },
      ];
      await manager.add('SELECT * FROM users', 'users', schema);
      assert.strictEqual(manager.entries[0].pkIndex, 0);
    });

    it('should set error on failed query', async () => {
      fetchStub.rejects(new Error('connection refused'));
      const id = await manager.add('SELECT * FROM bad', 'bad');
      assert.ok(id);
      assert.ok(manager.entries[0].error);
    });

    it('should fire change listeners', async () => {
      stubSqlResponse(sampleResponse);
      let fired = false;
      manager.onDidChange(() => { fired = true; });
      await manager.add('SELECT 1', 'test');
      assert.strictEqual(fired, true);
    });

    it('should persist to workspace state', async () => {
      stubSqlResponse(sampleResponse);
      await manager.add('SELECT 1', 'test');
      const stored = memento.get<unknown[]>('driftViewer.watchList');
      assert.ok(stored);
      assert.strictEqual(stored.length, 1);
    });

    it('should enforce maxWatchers limit', async () => {
      // Default maxWatchers is 10 from mock config
      stubSqlResponse(sampleResponse);
      for (let i = 0; i < 10; i++) {
        await manager.add(`SELECT ${i}`, `q${i}`);
      }
      const result = await manager.add('SELECT extra', 'extra');
      assert.strictEqual(result, undefined);
      assert.strictEqual(manager.entries.length, 10);
    });
  });

  describe('remove()', () => {
    it('should remove a watch by id', async () => {
      stubSqlResponse(sampleResponse);
      const id = await manager.add('SELECT 1', 'test');
      assert.strictEqual(manager.entries.length, 1);
      manager.remove(id!);
      assert.strictEqual(manager.entries.length, 0);
    });

    it('should no-op for unknown id', () => {
      manager.remove('nonexistent');
      assert.strictEqual(manager.entries.length, 0);
    });

    it('should fire change listeners', async () => {
      stubSqlResponse(sampleResponse);
      const id = await manager.add('SELECT 1', 'test');
      let fired = false;
      manager.onDidChange(() => { fired = true; });
      manager.remove(id!);
      assert.strictEqual(fired, true);
    });
  });

  describe('setPaused()', () => {
    it('should pause a watch', async () => {
      stubSqlResponse(sampleResponse);
      const id = await manager.add('SELECT 1', 'test');
      manager.setPaused(id!, true);
      assert.strictEqual(manager.entries[0].paused, true);
    });

    it('should resume a watch', async () => {
      stubSqlResponse(sampleResponse);
      const id = await manager.add('SELECT 1', 'test');
      manager.setPaused(id!, true);
      manager.setPaused(id!, false);
      assert.strictEqual(manager.entries[0].paused, false);
    });
  });

  describe('clearDiff()', () => {
    it('should clear the diff for a watch', async () => {
      stubSqlResponse(sampleResponse);
      const id = await manager.add('SELECT 1', 'test');
      assert.ok(manager.entries[0].diff);
      manager.clearDiff(id!);
      assert.strictEqual(manager.entries[0].diff, null);
    });
  });

  describe('refresh()', () => {
    it('should re-run all non-paused watches', async () => {
      stubSqlResponse(sampleResponse);
      await manager.add('SELECT * FROM users', 'users');

      const updated = {
        columns: ['id', 'name', 'age'],
        rows: [[1, 'Alice', 31], [2, 'Bob', 25]],
      };
      stubSqlResponse(updated);
      await manager.refresh();

      const entry = manager.entries[0];
      assert.ok(entry.diff);
      assert.strictEqual(entry.diff!.changedRows.length, 1);
    });

    it('should skip paused watches', async () => {
      stubSqlResponse(sampleResponse);
      const id = await manager.add('SELECT 1', 'test');
      manager.setPaused(id!, true);

      fetchStub.resetBehavior();
      fetchStub.rejects(new Error('should not be called'));
      await manager.refresh();

      // No error means the paused entry was skipped
      assert.strictEqual(manager.entries[0].error, null);
    });

    it('should set error on failed query', async () => {
      stubSqlResponse(sampleResponse);
      await manager.add('SELECT 1', 'test');

      fetchStub.rejects(new Error('query failed'));
      await manager.refresh();

      assert.ok(manager.entries[0].error);
      assert.ok(manager.entries[0].error!.includes('query failed'));
    });

    it('should increment unseenChanges when diff has changes', async () => {
      stubSqlResponse(sampleResponse);
      await manager.add('SELECT * FROM users', 'users');
      manager.resetUnseen();

      const updated = {
        columns: ['id', 'name', 'age'],
        rows: [[1, 'Alice', 31]],
      };
      stubSqlResponse(updated);
      await manager.refresh();

      assert.ok(manager.unseenChanges > 0);
    });

    it('should not run when no entries exist', async () => {
      fetchStub.rejects(new Error('should not be called'));
      await manager.refresh();
      // No error — refresh was skipped
    });
  });

  describe('restore()', () => {
    it('should restore watches from workspace state', async () => {
      await memento.update('driftViewer.watchList', [
        { id: 'w1', label: 'users', sql: 'SELECT * FROM users' },
      ]);
      stubSqlResponse(sampleResponse);
      await manager.restore();
      assert.strictEqual(manager.entries.length, 1);
      assert.strictEqual(manager.entries[0].label, 'users');
    });

    it('should handle empty workspace state', async () => {
      stubSqlResponse(sampleResponse);
      await manager.restore();
      assert.strictEqual(manager.entries.length, 0);
    });
  });

  describe('unseenChanges', () => {
    it('should reset unseen count', async () => {
      stubSqlResponse(sampleResponse);
      await manager.add('SELECT 1', 'test');
      assert.ok(manager.unseenChanges >= 0);
      manager.resetUnseen();
      assert.strictEqual(manager.unseenChanges, 0);
    });
  });

  describe('onDidChange()', () => {
    it('should return a disposable', async () => {
      stubSqlResponse(sampleResponse);
      let count = 0;
      const disposable = manager.onDidChange(() => { count++; });
      await manager.add('SELECT 1', 'a');
      assert.strictEqual(count, 1);

      disposable.dispose();
      await manager.add('SELECT 2', 'b');
      assert.strictEqual(count, 1, 'listener should not fire after dispose');
    });
  });
});
