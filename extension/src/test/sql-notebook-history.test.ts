import * as assert from 'assert';
import * as sinon from 'sinon';
import {
  createdPanels,
  MockMemento,
  MockWebviewPanel,
  resetMocks,
} from './vscode-mock';
import {
  IQueryHistoryEntry,
  SqlNotebookPanel,
} from '../sql-notebook/sql-notebook-panel';
import { DriftApiClient } from '../api-client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Msg = Record<string, any>;

function fakeContext(): any {
  return {
    subscriptions: [],
    globalState: new MockMemento(),
  };
}

function makeClient(): DriftApiClient {
  return new DriftApiClient('127.0.0.1', 8642);
}

function latestPanel(): MockWebviewPanel {
  return createdPanels[createdPanels.length - 1];
}

function posted(command: string): Msg[] {
  return (latestPanel().webview.postedMessages as Msg[]).filter(
    (m) => m.command === command,
  );
}

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

describe('SqlNotebookPanel — History persistence', () => {
  let fetchStub: sinon.SinonStub;

  beforeEach(() => {
    resetMocks();
    (SqlNotebookPanel as any).currentPanel = undefined;
    fetchStub = sinon.stub(globalThis, 'fetch');
    fetchStub.rejects(new Error('connection refused'));
  });

  afterEach(() => {
    fetchStub.restore();
  });

  it('should save history entry via addHistoryEntry', async () => {
    const ctx = fakeContext();
    SqlNotebookPanel.createOrShow(ctx, makeClient());
    await flush();

    const entry: IQueryHistoryEntry = {
      sql: 'SELECT 1',
      timestamp: Date.now(),
      rowCount: 1,
      durationMs: 5,
    };

    latestPanel().webview.simulateMessage({
      command: 'addHistoryEntry',
      entry,
    });
    await flush();

    const stored = ctx.globalState.get(
      'driftViewer.sqlNotebookHistory',
    ) as IQueryHistoryEntry[];
    assert.ok(Array.isArray(stored));
    assert.strictEqual(stored.length, 1);
    assert.strictEqual(stored[0].sql, 'SELECT 1');
  });

  it('should load history from globalState on creation', async () => {
    const ctx = fakeContext();
    const entry: IQueryHistoryEntry = {
      sql: 'SELECT 42',
      timestamp: 1000,
      rowCount: 1,
      durationMs: 3,
    };
    await ctx.globalState.update('driftViewer.sqlNotebookHistory', [entry]);

    SqlNotebookPanel.createOrShow(ctx, makeClient());
    await flush();

    const msgs = posted('historyResults');
    assert.ok(msgs.length >= 1);
    assert.strictEqual(
      (msgs[0].entries as IQueryHistoryEntry[])[0].sql,
      'SELECT 42',
    );
  });

  it('should search history by SQL text', async () => {
    const ctx = fakeContext();
    await ctx.globalState.update('driftViewer.sqlNotebookHistory', [
      { sql: 'SELECT * FROM users', timestamp: 1, rowCount: 5, durationMs: 2 },
      { sql: 'SELECT * FROM orders', timestamp: 2, rowCount: 3, durationMs: 1 },
    ]);

    SqlNotebookPanel.createOrShow(ctx, makeClient());
    await flush();

    latestPanel().webview.simulateMessage({
      command: 'searchHistory',
      query: 'users',
    });
    await flush();

    const results = posted('historyResults');
    const last = results[results.length - 1];
    assert.strictEqual((last.entries as IQueryHistoryEntry[]).length, 1);
    assert.strictEqual(
      (last.entries as IQueryHistoryEntry[])[0].sql,
      'SELECT * FROM users',
    );
    assert.strictEqual(last.total, 2);
  });

  it('should delete a history entry by timestamp', async () => {
    const ctx = fakeContext();
    await ctx.globalState.update('driftViewer.sqlNotebookHistory', [
      { sql: 'keep', timestamp: 1, rowCount: 1, durationMs: 1 },
      { sql: 'remove', timestamp: 2, rowCount: 1, durationMs: 1 },
    ]);

    SqlNotebookPanel.createOrShow(ctx, makeClient());
    await flush();

    latestPanel().webview.simulateMessage({
      command: 'deleteHistoryEntry',
      timestamp: 2,
    });
    await flush();

    const stored = ctx.globalState.get(
      'driftViewer.sqlNotebookHistory',
    ) as IQueryHistoryEntry[];
    assert.strictEqual(stored.length, 1);
    assert.strictEqual(stored[0].sql, 'keep');
  });

  it('should clear all history', async () => {
    const ctx = fakeContext();
    await ctx.globalState.update('driftViewer.sqlNotebookHistory', [
      { sql: 'a', timestamp: 1, rowCount: 1, durationMs: 1 },
      { sql: 'b', timestamp: 2, rowCount: 1, durationMs: 1 },
    ]);

    SqlNotebookPanel.createOrShow(ctx, makeClient());
    await flush();

    latestPanel().webview.simulateMessage({ command: 'clearHistory' });
    await flush();

    const stored = ctx.globalState.get(
      'driftViewer.sqlNotebookHistory',
    ) as IQueryHistoryEntry[];
    assert.deepStrictEqual(stored, []);
  });

  it('should post loadEntry for loadHistoryEntry message', async () => {
    const ctx = fakeContext();
    await ctx.globalState.update('driftViewer.sqlNotebookHistory', [
      { sql: 'SELECT 99', timestamp: 42, rowCount: 1, durationMs: 1 },
    ]);

    SqlNotebookPanel.createOrShow(ctx, makeClient());
    await flush();

    latestPanel().webview.simulateMessage({
      command: 'loadHistoryEntry',
      timestamp: 42,
    });
    await flush();

    const loads = posted('loadEntry');
    assert.strictEqual(loads.length, 1);
    assert.strictEqual(loads[0].sql, 'SELECT 99');
  });
});
