/**
 * Performance tree, terminal links, table quick-pick, and profiler commands.
 */

import * as vscode from 'vscode';
import type { QueryEntry } from '../api-client';
import type { IDebugCommandDeps } from './debug-commands-types';
import { PerformanceTreeProvider } from './performance-tree-provider';
import { DriftTerminalLinkProvider } from '../terminal/drift-terminal-link-provider';
import { ColumnItem } from '../tree/tree-items';
import { buildProfileQueries, assembleProfile } from '../profiler/profiler-queries';
import { ProfilerPanel } from '../profiler/profiler-panel';

export interface IPerfRegistrationResult {
  perfProvider: PerformanceTreeProvider;
  revealTable: (name: string) => Promise<void>;
}

/**
 * Register performance tree view, terminal link provider, showAllTables,
 * refreshPerformance, clearPerformance, showQueryDetail, and profileColumn.
 */
export function registerDebugCommandsPerf(
  context: vscode.ExtensionContext,
  deps: IDebugCommandDeps,
): IPerfRegistrationResult {
  const { client, treeProvider, treeView, logBridge } = deps;

  const perfProvider = new PerformanceTreeProvider();
  const perfView = vscode.window.createTreeView(
    'driftViewer.queryPerformance',
    { treeDataProvider: perfProvider },
  );
  context.subscriptions.push(perfView);

  const revealTable = async (name: string): Promise<void> => {
    let item = treeProvider.findTableItem(name);
    if (!item) {
      await treeProvider.refresh();
      item = treeProvider.findTableItem(name);
    }
    if (item) {
      await treeView.reveal(item, { select: true, focus: true });
    } else {
      await vscode.commands.executeCommand(
        'driftViewer.databaseExplorer.focus',
      );
    }
  };

  context.subscriptions.push(
    vscode.window.registerTerminalLinkProvider(
      new DriftTerminalLinkProvider(client, revealTable, logBridge),
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.showAllTables',
      async () => {
        try {
          const meta = await client.schemaMetadata();
          const names = meta.map((t) => t.name).sort();
          if (names.length === 0) {
            vscode.window.showInformationMessage('No tables found.');
            return;
          }
          const picked = await vscode.window.showQuickPick(names, {
            placeHolder: 'Select a table to reveal',
          });
          if (picked) await revealTable(picked);
        } catch {
          vscode.window.showWarningMessage(
            'Drift debug server not reachable.',
          );
        }
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('driftViewer.refreshPerformance', () =>
      perfProvider.refresh(client),
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.clearPerformance',
      async () => {
        try {
          await client.clearPerformance();
          await perfProvider.refresh(client);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Clear stats failed: ${msg}`);
        }
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.showQueryDetail',
      async (query: QueryEntry) => {
        const content = [
          `-- Duration: ${query.durationMs}ms`,
          `-- Rows: ${query.rowCount}`,
          `-- Time: ${query.at}`,
          '',
          query.sql,
        ].join('\n');
        const doc = await vscode.workspace.openTextDocument({
          content,
          language: 'sql',
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.profileColumn',
      async (item: ColumnItem) => {
        try {
          const profile = await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: `Profiling ${item.tableName}.${item.column.name}\u2026`,
            },
            async () => {
              const queries = buildProfileQueries(
                item.tableName, item.column.name, item.column.type,
              );
              const results = new Map<string, unknown[][]>();
              for (const query of queries) {
                try {
                  const r = await client.sql(query.sql);
                  results.set(query.name, r.rows);
                } catch {
                  // Skip failed queries gracefully
                }
              }
              return assembleProfile(
                item.tableName, item.column.name,
                item.column.type, results,
              );
            },
          );
          ProfilerPanel.createOrShow(profile);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Profile failed: ${msg}`);
        }
      },
    ),
  );

  return { perfProvider, revealTable };
}
