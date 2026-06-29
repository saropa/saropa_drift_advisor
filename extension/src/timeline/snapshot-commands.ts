import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import { ExplainPanel } from '../explain/explain-panel';
import { extractSqlFromContext } from '../explain/sql-extractor';
import { SnapshotDiffPanel } from './snapshot-diff-panel';
import { computeTableDiff, ROW_LIMIT, rowsToObjects, SnapshotStore } from './snapshot-store';
import { TimeTravelPanel } from '../time-travel/time-travel-panel';
import { TimeTravelEngine } from '../time-travel/time-travel-engine';
import type { TableItem } from '../tree/tree-items';
import { samplingOrderBy } from '../sql/sampling-order';
import { blobSafeSelectList } from '../sql/blob-safe-select';

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
          // Fetch metadata first so the current read can mirror the capture's
          // BLOB-safe projection: the stored snapshot recorded blob columns as
          // length() (see snapshot-store), so comparing against a raw `SELECT *`
          // current read would flag every blob row as changed AND re-introduce
          // the same blob-payload OOM the capture avoids. Project length() here
          // too — diff stays length-vs-length and no blob bytes are transferred.
          // BUG_TIMELINE_CAPTURE_SELECT_STAR_BLOB_OOM.md.
          const meta = await client.schemaMetadata();
          const tableMeta = meta.find((t) => t.name === tableName);
          const selectList = tableMeta
            ? blobSafeSelectList(tableMeta.columns)
            : '*';
          // Order by the captured PK, never rowid: WITHOUT ROWID tables and
          // views lack a rowid column and ORDER BY rowid aborts the read (#32).
          const result = await client.sql(
            `SELECT ${selectList} FROM "${tableName}"${samplingOrderBy(snapTable.pkColumns)} LIMIT ${ROW_LIMIT}`,
            { internal: true },
          );
          const currentRows = rowsToObjects(result.columns, result.rows);
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

  // Time Travel: scrub a table's captured snapshots with row-level diff highlighting.
  // Invoked from a table's context menu (passes the TableItem) or the palette (prompts).
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.timeTravel',
      async (item?: TableItem) => {
        if (snapshotStore.snapshots.length === 0) {
          vscode.window.showInformationMessage(
            'No snapshots captured yet. Capture a snapshot first, then time-travel through changes.',
          );
          return;
        }
        let tableName = item?.table?.name;
        if (!tableName) {
          // Palette invocation: pick from the tables that actually have snapshot history.
          const engine = new TimeTravelEngine(snapshotStore);
          const names = engine.getTableNames();
          if (names.length === 0) {
            vscode.window.showInformationMessage('No tables in the captured snapshots.');
            return;
          }
          tableName = await vscode.window.showQuickPick(names, {
            placeHolder: 'Select a table to time-travel through',
          });
          if (!tableName) return;
        }
        TimeTravelPanel.createOrShow(snapshotStore, tableName);
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
          await ExplainPanel.createOrShow(sql, result, suggestions);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Explain failed: ${msg}`);
        }
      },
    ),
  );
}
