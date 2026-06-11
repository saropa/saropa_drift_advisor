/**
 * Post-generation destinations for NL-to-SQL output: the destination quick-pick
 * and the dispatcher that routes validated SQL to the SQL Notebook, Visual Query
 * Builder, snippet library, dashboard widget, or cost analysis.
 */

import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import type { QueryIntelligence } from '../engines/query-intelligence';
import { QueryBuilderPanel } from '../query-builder/query-builder-panel';
import { SqlNotebookPanel } from '../sql-notebook/sql-notebook-panel';

export type NlSqlDestination = 'notebook' | 'vqb' | 'snippet' | 'dashboard' | 'cost';

export async function pickNlSqlDestination(): Promise<NlSqlDestination | undefined> {
  const items: Array<vscode.QuickPickItem & { dest: NlSqlDestination }> = [
    {
      label: '$(notebook) Open in SQL Notebook',
      description: 'Insert into a new query tab',
      dest: 'notebook',
    },
    {
      label: '$(symbol-structure) Edit in Visual Query Builder',
      description: 'Import into the visual query builder (supported SELECT only)',
      dest: 'vqb',
    },
    {
      label: '$(bookmark) Save as SQL snippet',
      description: 'Store in the snippet library (name suggested from your question)',
      dest: 'snippet',
    },
    {
      label: '$(dashboard) Add query widget to dashboard',
      description: 'Append a SQL query-result widget to the current dashboard layout',
      dest: 'dashboard',
    },
    {
      label: '$(pulse) Analyze query cost',
      description: 'Run cost / EXPLAIN analysis with this SQL',
      dest: 'cost',
    },
  ];
  const chosen = await vscode.window.showQuickPick(items, {
    placeHolder: 'Where should the SQL go?',
    ignoreFocusOut: true,
  });
  return chosen?.dest;
}

/** Builds a short snippet name from the NL question (safe for storage). */
function suggestedSnippetName(question: string): string {
  const cleaned = question.replace(/["\n\r]/g, ' ').trim().slice(0, 55);
  return cleaned.length > 0 ? `NL: ${cleaned}` : 'NL-to-SQL';
}

/**
 * Routes validated SQL to the surface the user picked.
 *
 * Dashboard path appends a `queryResult` widget via `driftViewer.addQueryWidgetToDashboard`.
 */
export async function dispatchNlSqlDestination(
  dest: NlSqlDestination,
  sql: string,
  questionSummary: string,
  context: vscode.ExtensionContext,
  client: DriftApiClient,
  queryIntelligence?: QueryIntelligence,
): Promise<void> {
  switch (dest) {
    case 'notebook':
      SqlNotebookPanel.showAndInsertQuery(context, client, {
        sql,
        source: 'nl-to-sql',
        title: `Question: ${questionSummary}`,
      });
      break;
    case 'vqb':
      QueryBuilderPanel.createOrShow(context, client, undefined, {
        importSql: sql,
        queryIntelligence,
      });
      break;
    case 'snippet':
      await vscode.commands.executeCommand(
        'driftViewer.saveAsSnippet',
        sql,
        suggestedSnippetName(questionSummary),
      );
      break;
    case 'dashboard':
      await vscode.commands.executeCommand(
        'driftViewer.addQueryWidgetToDashboard',
        sql,
        `NL: ${questionSummary.slice(0, 100)}`,
      );
      break;
    case 'cost':
      await vscode.commands.executeCommand('driftViewer.analyzeQueryCost', sql);
      break;
  }
}
