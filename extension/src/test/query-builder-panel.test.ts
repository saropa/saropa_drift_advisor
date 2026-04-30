/**
 * Query builder panel: HTML contract, webview routing, notebook handoff, and
 * request-id correlation for run results.
 */
import * as assert from 'assert';
import * as sinon from 'sinon';
import type { DriftApiClient } from '../api-client';
import type { QueryIntelligence } from '../engines/query-intelligence';
import { QueryBuilderPanel } from '../query-builder/query-builder-panel';
import { SqlNotebookPanel } from '../sql-notebook/sql-notebook-panel';
import {
  createdPanels,
  MockMemento,
  resetMocks,
} from './vscode-mock';
import type * as vscode from 'vscode';

/** Yield until async panel bootstrap (schema load) has posted [init]. */
async function flushUntilInit(maxTicks = 40): Promise<void> {
  for (let i = 0; i < maxTicks; i++) {
    const posted = createdPanels[0]?.webview.postedMessages as Array<{ command?: string }> | undefined;
    if (posted?.some((m) => m.command === 'init')) {
      return;
    }
    await Promise.resolve();
  }
}

function lastPostedMatching(
  webview: { postedMessages: unknown[] },
  pred: (m: { command?: string }) => boolean,
): { command?: string } | undefined {
  const posted = webview.postedMessages as Array<{ command?: string }>;
  for (let i = posted.length - 1; i >= 0; i--) {
    if (pred(posted[i]!)) return posted[i];
  }
  return undefined;
}

describe('QueryBuilderPanel', () => {
  let context: vscode.ExtensionContext;
  let client: DriftApiClient;
  let notebookStub: sinon.SinonStub;

  beforeEach(() => {
    resetMocks();
    context = {
      subscriptions: [],
      workspaceState: new MockMemento(),
    } as unknown as vscode.ExtensionContext;
    client = {
      schemaMetadata: async () => [
        {
          name: 'users',
          columns: [
            { name: 'id', type: 'INTEGER', pk: true },
            { name: 'name', type: 'TEXT', pk: false },
          ],
          rowCount: 1,
        },
      ],
      tableFkMeta: async () => [],
      sql: async () => ({ columns: ['id'], rows: [[1]] }),
    } as unknown as DriftApiClient;
    notebookStub = sinon.stub(SqlNotebookPanel, 'showAndInsertQuery');
  });

  afterEach(() => {
    notebookStub.restore();
    QueryBuilderPanel.currentPanel?.dispose();
    QueryBuilderPanel.currentPanel = undefined;
    for (const d of context.subscriptions) {
      d.dispose();
    }
  });

  it('embeds GROUP BY / ORDER BY controls and builder message names in HTML', () => {
    QueryBuilderPanel.createOrShow(context, client);
    assert.strictEqual(createdPanels.length, 1);
    const html = createdPanels[0]!.webview.html;
    assert.ok(html.includes('id="gbTable"'), 'GROUP BY table select');
    assert.ok(html.includes('id="btnAddGb"'), 'add GROUP BY');
    assert.ok(html.includes('id="obDir"'), 'ORDER BY direction');
    assert.ok(html.includes("'addGroupBy'"), 'post addGroupBy');
    assert.ok(html.includes("'removeOrderBy'"), 'post removeOrderBy');
  });

  it('routes Open in Notebook through SqlNotebookPanel.showAndInsertQuery', async () => {
    QueryBuilderPanel.createOrShow(context, client);
    await flushUntilInit();
    const webview = createdPanels[0]!.webview;
    webview.simulateMessage({ command: 'addTableInstance', baseTable: 'users' });
    for (let i = 0; i < 20; i++) await Promise.resolve();
    const st = lastPostedMatching(webview, (m) => m.command === 'state') as {
      model?: { tables: Array<{ id: string }> };
    };
    const tableId = st?.model?.tables?.[0]?.id;
    assert.ok(tableId, 'table id from state');
    webview.simulateMessage({
      command: 'toggleColumn',
      tableId,
      column: 'id',
      selected: true,
    });
    for (let i = 0; i < 20; i++) await Promise.resolve();
    webview.simulateMessage({ command: 'openInNotebook' });
    for (let i = 0; i < 20; i++) await Promise.resolve();
    assert.strictEqual(notebookStub.callCount, 1, 'notebook insert invoked once');
    const args = notebookStub.firstCall.args;
    assert.strictEqual(args[2]?.title, 'Visual query builder');
    assert.ok(String(args[2]?.sql || '').includes('SELECT'), 'SQL payload');
  });

  it('records successful runs on QueryIntelligence when provided', async () => {
    const recordQuery = sinon.spy();
    const qi = { recordQuery } as unknown as QueryIntelligence;
    QueryBuilderPanel.createOrShow(context, client, undefined, { queryIntelligence: qi });
    await flushUntilInit();
    const webview = createdPanels[0]!.webview;
    webview.simulateMessage({ command: 'addTableInstance', baseTable: 'users' });
    for (let i = 0; i < 20; i++) await Promise.resolve();
    const st = lastPostedMatching(webview, (m) => m.command === 'state') as {
      model?: { tables: Array<{ id: string }> };
    };
    const tableId = st?.model?.tables?.[0]?.id;
    webview.simulateMessage({
      command: 'toggleColumn',
      tableId,
      column: 'id',
      selected: true,
    });
    for (let i = 0; i < 20; i++) await Promise.resolve();
    webview.simulateMessage({ command: 'runQuery', requestId: 'run_test_1' });
    for (let i = 0; i < 40; i++) await Promise.resolve();
    assert.ok(recordQuery.calledOnce, 'recordQuery after successful sql()');
    assert.strictEqual(recordQuery.firstCall.args[2], 1, 'row count passed');
  });

  it('echoes requestId on queryResult (extension side)', async () => {
    QueryBuilderPanel.createOrShow(context, client);
    await flushUntilInit();
    const webview = createdPanels[0]!.webview;
    webview.simulateMessage({ command: 'addTableInstance', baseTable: 'users' });
    for (let i = 0; i < 20; i++) await Promise.resolve();
    const st = lastPostedMatching(webview, (m) => m.command === 'state') as {
      model?: { tables: Array<{ id: string }> };
    };
    const tableId = st?.model?.tables?.[0]?.id;
    webview.simulateMessage({
      command: 'toggleColumn',
      tableId,
      column: 'id',
      selected: true,
    });
    for (let i = 0; i < 20; i++) await Promise.resolve();
    webview.simulateMessage({ command: 'runQuery', requestId: 'run_correlation_1' });
    for (let i = 0; i < 40; i++) await Promise.resolve();
    const qr = lastPostedMatching(webview, (m) => m.command === 'queryResult') as {
      requestId?: string;
    };
    assert.strictEqual(qr?.requestId, 'run_correlation_1');
  });
});
