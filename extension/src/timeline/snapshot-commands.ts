import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import { ExplainPanel } from '../explain/explain-panel';
import { extractSqlFromContext } from '../explain/sql-extractor';
import { SnapshotDiffPanel } from './snapshot-diff-panel';
import { computeTableDiff, ROW_LIMIT, rowsToObjects, SnapshotStore } from './snapshot-store';

/** Register snapshot and explain commands. */
export function registerSnapshotCommands(
  context: vscode.ExtensionContext,
  client: DriftApiClient,
  snapshotStore: SnapshotStore,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('driftViewer.captureSnapshot', async () => {
      const snap = await snapshotStore.capture(client);
      if (snap) {
        vscode.window.showInformationMessage('Drift snapshot captured.');
      } else {
        vscode.window.showWarningMessage(
          'Snapshot skipped (too soon or server unreachable).',
        );
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.showSnapshotDiff',
      async (snapshotId: string, tableName: string) => {
        const snapshot = snapshotStore.getById(snapshotId);
        if (!snapshot) return;
        const snapTable = snapshot.tables.get(tableName);
        if (!snapTable) return;
        try {
          const [result, meta] = await Promise.all([
            client.sql(
              `SELECT * FROM "${tableName}" ORDER BY rowid LIMIT ${ROW_LIMIT}`,
            ),
            client.schemaMetadata(),
          ]);
          const currentRows = rowsToObjects(result.columns, result.rows);
          const tableMeta = meta.find((t) => t.name === tableName);
          const diff = computeTableDiff(
            tableName,
            snapTable.columns,
            snapTable.pkColumns,
            snapTable.rows,
            currentRows,
            snapTable.rowCount,
            tableMeta?.rowCount ?? currentRows.length,
          );
          SnapshotDiffPanel.createOrShow(tableName, diff);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Snapshot diff failed: ${msg}`);
        }
      },
    ),
  );

  // Explain query plan (right-click SQL in Dart files)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.explainQuery',
      async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        const sql = extractSqlFromContext(
          editor.document.getText(),
          editor.document.getText(editor.selection),
          editor.selection.start.line,
        );
        if (!sql) {
          vscode.window.showWarningMessage(
            'No SQL query found at cursor position.',
          );
          return;
        }
        try {
          const [result, suggestions] = await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: 'Explaining query plan\u2026',
            },
            () => Promise.all([
              client.explainSql(sql),
              client.indexSuggestions(),
            ]),
          );
          ExplainPanel.createOrShow(sql, result, suggestions);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Explain failed: ${msg}`);
        }
      },
    ),
  );
}
