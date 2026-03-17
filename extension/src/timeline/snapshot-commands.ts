import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import { ExplainPanel } from '../explain/explain-panel';
import { extractSqlFromContext } from '../explain/sql-extractor';
import { SnapshotDiffPanel } from './snapshot-diff-panel';
import { computeTableDiff, ROW_LIMIT, rowsToObjects, SnapshotStore } from './snapshot-store';

const CONTEXT_HAS_SQL_AT_CURSOR = 'driftViewer.hasSqlAtCursor';
/** Debounce (ms) for selection-based context update to avoid work on every cursor move. */
const SELECTION_DEBOUNCE_MS = 50;

/**
 * Returns extractable SQL at the given editor's cursor/selection, or null.
 * Used for both the Explain Query Plan context menu visibility and the command handler.
 */
function getSqlFromEditor(editor: vscode.TextEditor | undefined): string | null {
  if (!editor || editor.document.languageId !== 'dart') return null;
  return extractSqlFromContext(
    editor.document.getText(),
    editor.document.getText(editor.selection),
    editor.selection.start.line,
  );
}

/**
 * Updates the "has SQL at cursor" context key so the Explain Query Plan
 * menu item only appears when the editor has extractable SQL at the selection/cursor.
 */
function updateHasSqlAtCursorContext(): void {
  const sql = getSqlFromEditor(vscode.window.activeTextEditor);
  void vscode.commands.executeCommand('setContext', CONTEXT_HAS_SQL_AT_CURSOR, !!sql);
}

/** Register snapshot and explain commands. */
export function registerSnapshotCommands(
  context: vscode.ExtensionContext,
  client: DriftApiClient,
  snapshotStore: SnapshotStore,
): void {
  // Explain Query Plan context menu: only show when there is SQL at cursor (Dart files).
  updateHasSqlAtCursorContext();
  let selectionDebounce: ReturnType<typeof setTimeout> | undefined;
  const scheduleSelectionUpdate = (): void => {
    if (selectionDebounce !== undefined) clearTimeout(selectionDebounce);
    selectionDebounce = setTimeout(() => {
      selectionDebounce = undefined;
      updateHasSqlAtCursorContext();
    }, SELECTION_DEBOUNCE_MS);
  };
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(updateHasSqlAtCursorContext),
    vscode.window.onDidChangeTextEditorSelection(scheduleSelectionUpdate),
    { dispose: () => { if (selectionDebounce !== undefined) clearTimeout(selectionDebounce); } },
  );

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

  // Explain query plan (right-click SQL in Dart files; command also invokable from palette).
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.explainQuery',
      async () => {
        const sql = getSqlFromEditor(vscode.window.activeTextEditor);
        if (!sql) {
          vscode.window.showWarningMessage(
            'No SQL query found at cursor or selection. Select a SELECT/WITH string or place the cursor on one.',
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
