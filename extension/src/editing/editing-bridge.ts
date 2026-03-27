import * as vscode from 'vscode';
import type { TableMetadata } from '../api-types';
import { ChangeTracker, PendingChange } from './change-tracker';
import { EDITING_SCRIPT } from './editing-bridge-script';
import { validateCellEdit, validateRowInsert } from './sqlite-cell-value';

const CELL_EDIT_HINT =
  ' Tip: for nullable columns, an empty cell is saved as NULL.';

/** Messages sent from the webview to the extension. */
interface CellEditMsg {
  command: 'cellEdit';
  table: string;
  pkColumn: string;
  pkValue: unknown;
  column: string;
  oldValue: unknown;
  newValue: unknown;
}
interface RowDeleteMsg {
  command: 'rowDelete';
  table: string;
  pkColumn: string;
  pkValue: unknown;
}
interface RowInsertMsg {
  command: 'rowInsert';
  table: string;
  values: Record<string, unknown>;
}
interface UndoMsg { command: 'undo'; }
interface RedoMsg { command: 'redo'; }
interface DiscardMsg { command: 'discardAll'; }

type EditMessage =
  | CellEditMsg | RowDeleteMsg | RowInsertMsg
  | UndoMsg | RedoMsg | DiscardMsg;

function isEditMessage(msg: unknown): msg is EditMessage {
  if (typeof msg !== 'object' || msg === null) return false;
  const cmd = (msg as Record<string, unknown>).command;
  return (
    cmd === 'cellEdit' || cmd === 'rowDelete' || cmd === 'rowInsert' ||
    cmd === 'undo' || cmd === 'redo' || cmd === 'discardAll'
  );
}

/**
 * Bridge between the webview (injected editing JS) and the ChangeTracker.
 * Also provides the JS script to inject into the webview HTML.
 */
export class EditingBridge implements vscode.Disposable {
  private _webview: vscode.Webview | undefined;
  private readonly _disposables: vscode.Disposable[] = [];

  /**
   * @param _getSchema - Loads live table/column metadata (including NOT NULL) so
   *   cell edits are validated before they enter the pending-change list.
   */
  constructor(
    private readonly _tracker: ChangeTracker,
    private readonly _getSchema?: () => Promise<TableMetadata[]>,
  ) {
    this._disposables.push(
      this._tracker.onDidChange(() => this._syncToWebview()),
    );
  }

  /** Attach to a webview panel to receive messages and push state back. */
  attach(webview: vscode.Webview): void {
    this._webview = webview;
  }

  detach(): void {
    this._webview = undefined;
  }

  /** Handle a message from the webview. Returns true if handled. */
  handleMessage(msg: unknown): boolean {
    if (!isEditMessage(msg)) return false;

    switch (msg.command) {
      case 'cellEdit':
        void this._handleCellEdit(msg);
        break;
      case 'rowDelete':
        this._tracker.addRowDelete(msg.table, msg.pkColumn, msg.pkValue);
        break;
      case 'rowInsert':
        void this._handleRowInsert(msg);
        break;
      case 'undo':
        this._tracker.undo();
        break;
      case 'redo':
        this._tracker.redo();
        break;
      case 'discardAll':
        this._tracker.discardAll();
        break;
    }
    return true;
  }

  private _syncToWebview(): void {
    if (!this._webview) return;
    const payload: PendingChange[] = [...this._tracker.changes];
    this._webview.postMessage({ command: 'pendingChanges', changes: payload });
  }

  /**
   * Validates against schema metadata, then records the change or tells the
   * webview to revert the cell and shows a warning.
   */
  private async _handleCellEdit(msg: CellEditMsg): Promise<void> {
    if (!this._getSchema) {
      this._tracker.addCellChange({
        table: msg.table,
        pkColumn: msg.pkColumn,
        pkValue: msg.pkValue,
        column: msg.column,
        oldValue: msg.oldValue,
        newValue: msg.newValue,
      });
      return;
    }

    try {
      const tables = await this._getSchema();
      const result = validateCellEdit(
        tables,
        msg.table,
        msg.column,
        msg.newValue,
      );
      if (!result.ok) {
        void vscode.window.showWarningMessage(
          `Saropa Drift Advisor: ${result.message}${CELL_EDIT_HINT}`,
        );
        this._postCellEditRejected(
          msg,
          `${result.message}${CELL_EDIT_HINT}`,
        );
        return;
      }
      this._tracker.addCellChange({
        table: msg.table,
        pkColumn: msg.pkColumn,
        pkValue: msg.pkValue,
        column: msg.column,
        oldValue: msg.oldValue,
        newValue: result.value,
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      void vscode.window.showErrorMessage(
        `Saropa Drift Advisor: could not validate edit (${detail}).`,
      );
      this._postCellEditRejected(
        msg,
        `Schema could not be loaded; change was not applied.${CELL_EDIT_HINT}`,
      );
    }
  }

  /**
   * Validates insert values (NOT NULL / types) before tracking; notifies the
   * webview to remove a provisional row on failure.
   */
  private async _handleRowInsert(msg: RowInsertMsg): Promise<void> {
    if (!this._getSchema) {
      this._tracker.addRowInsert(msg.table, msg.values);
      return;
    }
    try {
      const tables = await this._getSchema();
      const result = validateRowInsert(tables, msg.table, msg.values);
      if (!result.ok) {
        void vscode.window.showWarningMessage(
          `Saropa Drift Advisor: ${result.message}${CELL_EDIT_HINT}`,
        );
        this._postRowInsertRejected(msg.table);
        return;
      }
      this._tracker.addRowInsert(msg.table, result.values);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      void vscode.window.showErrorMessage(
        `Saropa Drift Advisor: could not validate new row (${detail}).`,
      );
      this._postRowInsertRejected(msg.table);
    }
  }

  private _postRowInsertRejected(table: string): void {
    if (!this._webview) return;
    void this._webview.postMessage({
      command: 'rowInsertRejected',
      table,
    });
  }

  private _postCellEditRejected(msg: CellEditMsg, reason: string): void {
    if (!this._webview) return;
    void this._webview.postMessage({
      command: 'cellEditRejected',
      table: msg.table,
      pkColumn: msg.pkColumn,
      pkValue: msg.pkValue,
      column: msg.column,
      oldValue: msg.oldValue,
      reason,
    });
  }

  /** Returns inline JS to inject into the webview HTML for cell editing. */
  static injectedScript(): string {
    // This script is injected as a <script> block in the webview HTML.
    // It uses acquireVsCodeApi() to send edit messages back to the extension.
    return EDITING_SCRIPT;
  }

  dispose(): void {
    this._webview = undefined;
    for (const d of this._disposables) d.dispose();
    this._disposables.length = 0;
  }
}
