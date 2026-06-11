/**
 * Integration command handlers for the Visual Query Builder: run the query and
 * route the rendered SQL to clipboard, SQL Notebook, snippet library, cost
 * analysis, or a dashboard widget. Extracted from query-builder-panel.ts; each
 * takes the panel's `post` callback so it can message the webview without
 * holding a reference to the panel instance.
 */
import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import type { QueryIntelligence } from '../engines/query-intelligence';
import { SqlNotebookPanel } from '../sql-notebook/sql-notebook-panel';
import type { IQueryModel } from './query-model';
import { renderQuerySql, validateQueryModel } from './sql-renderer';

type PostFn = (msg: unknown) => void;
type IntegrationTarget = 'notebook' | 'snippet' | 'dashboard' | 'cost';

function integrationError(post: PostFn, target: IntegrationTarget, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  post({ command: 'integrationError', target, message });
}

export async function runQuery(
  client: DriftApiClient,
  model: IQueryModel,
  queryIntelligence: QueryIntelligence | undefined,
  requestId: string,
  post: PostFn,
  postState: () => void,
): Promise<void> {
  const errors = validateQueryModel(model);
  if (errors.length > 0) {
    post({ command: 'queryError', requestId, message: errors.join('\n') });
    postState();
    return;
  }
  try {
    const sql = renderQuerySql(model);
    const t0 = Date.now();
    const result = await client.sql(sql);
    const elapsed = Date.now() - t0;
    try {
      queryIntelligence?.recordQuery(sql, elapsed, result.rows.length);
    } catch {
      // Pattern store is best-effort; never block the results grid.
    }
    post({
      command: 'queryResult',
      requestId,
      columns: result.columns,
      rows: result.rows,
      rowCount: result.rows.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    post({ command: 'queryError', requestId, message });
  }
}

export async function copySql(model: IQueryModel, post: PostFn): Promise<void> {
  try {
    const sql = renderQuerySql(model);
    await vscode.env.clipboard.writeText(sql);
    void vscode.window.showInformationMessage('SQL copied to clipboard.');
  } catch (err: unknown) {
    integrationError(post, 'notebook', err);
  }
}

export async function openInNotebook(
  context: vscode.ExtensionContext,
  client: DriftApiClient,
  model: IQueryModel,
  post: PostFn,
): Promise<void> {
  try {
    const sql = renderQuerySql(model);
    SqlNotebookPanel.showAndInsertQuery(context, client, {
      sql,
      title: 'Visual query builder',
      source: 'query-builder',
    });
  } catch (err: unknown) {
    integrationError(post, 'notebook', err);
  }
}

export async function saveAsSnippet(model: IQueryModel, post: PostFn): Promise<void> {
  try {
    const sql = renderQuerySql(model);
    await vscode.commands.executeCommand('driftViewer.saveAsSnippet', sql);
  } catch (err: unknown) {
    integrationError(post, 'snippet', err);
  }
}

export async function analyzeCost(model: IQueryModel, post: PostFn): Promise<void> {
  try {
    const sql = renderQuerySql(model);
    await vscode.commands.executeCommand('driftViewer.analyzeQueryCost', sql);
  } catch (err: unknown) {
    integrationError(post, 'cost', err);
  }
}

export async function addToDashboard(model: IQueryModel, post: PostFn): Promise<void> {
  try {
    const sql = renderQuerySql(model);
    await vscode.commands.executeCommand(
      'driftViewer.addQueryWidgetToDashboard',
      sql,
      'Visual query builder',
    );
  } catch (err: unknown) {
    integrationError(post, 'dashboard', err);
  }
}
