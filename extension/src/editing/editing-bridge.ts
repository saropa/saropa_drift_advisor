import * as vscode from 'vscode';
import type { TableMetadata } from '../api-types';
import { ChangeTracker, PendingChange } from './change-tracker';
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

/**
 * Inline JS injected into the Saropa Drift Advisor webview to enable cell editing.
 * Kept as a single template string so it can be injected via <script> tag.
 */
const EDITING_SCRIPT = `
(function() {
  const vscodeApi = window._vscodeApi || (window._vscodeApi = acquireVsCodeApi());
  let pendingChanges = [];
  let editingEnabled = true;

  // --- Detect table metadata ---
  // The server HTML renders tables with class "data-table".
  // Each table has a data-table-name attribute (or we read it from the heading).

  function getTableMeta(table) {
    const name = table.dataset.tableName || table.closest('[data-table-name]')?.dataset.tableName || 'unknown';
    const headers = Array.from(table.querySelectorAll('thead th')).map(th => th.textContent.trim());
    // Heuristic: first column or column named "id" / "_id" is the PK
    let pkIdx = headers.findIndex(h => h === 'id' || h === '_id');
    if (pkIdx < 0) pkIdx = 0;
    return { name, headers, pkColumn: headers[pkIdx], pkIdx };
  }

  function getCellValue(td) {
    const raw = td.dataset.rawValue;
    if (raw !== undefined) return raw === 'null' ? null : raw;
    return td.textContent.trim();
  }

  // --- Cell editing ---
  document.addEventListener('dblclick', function(e) {
    if (!editingEnabled) return;
    const td = e.target.closest('td');
    if (!td) return;
    const tr = td.closest('tr');
    const table = td.closest('table');
    if (!table || !tr) return;

    const meta = getTableMeta(table);
    const colIdx = Array.from(tr.children).indexOf(td);
    if (colIdx < 0 || colIdx >= meta.headers.length) return;

    // Don't edit the PK column
    if (colIdx === meta.pkIdx) return;

    // Already editing?
    if (td.querySelector('input')) return;

    const oldValue = getCellValue(td);
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'cell-inline-editor';
    input.value = oldValue === null ? '' : String(oldValue);
    input.style.cssText = 'width:100%;box-sizing:border-box;font:inherit;padding:2px 4px;';

    const originalContent = td.innerHTML;
    td.innerHTML = '';
    td.appendChild(input);
    input.focus();
    input.select();

    var committedOrCancelled = false;
    function onBlurCommit() {
      if (committedOrCancelled) return;
      committedOrCancelled = true;
      input.removeEventListener('blur', onBlurCommit);
      var newValue = input.value === '' ? null : input.value;
      td.innerHTML = originalContent;
      if (newValue !== oldValue) {
        td.textContent = newValue === null ? 'NULL' : String(newValue);
        td.style.backgroundColor = 'rgba(255, 200, 0, 0.25)';
        td.title = 'Pending change';
        var pkTd = tr.children[meta.pkIdx];
        vscodeApi.postMessage({
          command: 'cellEdit',
          table: meta.name,
          pkColumn: meta.pkColumn,
          pkValue: getCellValue(pkTd),
          column: meta.headers[colIdx],
          oldValue: oldValue,
          newValue: newValue,
        });
      }
    }

    input.addEventListener('blur', onBlurCommit);
    input.addEventListener('keydown', function(ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); }
      if (ev.key === 'Tab') { ev.preventDefault(); input.blur(); }
      if (ev.key === 'Escape') {
        ev.preventDefault();
        committedOrCancelled = true;
        input.removeEventListener('blur', onBlurCommit);
        td.innerHTML = originalContent;
      }
    });
  });

  // --- Row delete via context menu ---
  document.addEventListener('contextmenu', function(e) {
    if (!editingEnabled) return;
    const tr = e.target.closest('tr');
    const table = e.target.closest('table');
    if (!tr || !table || tr.closest('thead')) return;

    e.preventDefault();
    const meta = getTableMeta(table);
    const pkTd = tr.children[meta.pkIdx];
    if (!pkTd) return;

    // Simple confirm via a floating button
    const btn = document.createElement('button');
    btn.textContent = 'Delete this row?';
    btn.style.cssText = 'position:fixed;z-index:9999;padding:4px 12px;' +
      'background:#d32f2f;color:#fff;border:none;border-radius:4px;cursor:pointer;' +
      'font-size:13px;top:' + e.clientY + 'px;left:' + e.clientX + 'px;';
    document.body.appendChild(btn);

    function cleanup() { btn.remove(); document.removeEventListener('click', onOutside); }
    function onOutside() { cleanup(); }
    setTimeout(() => document.addEventListener('click', onOutside), 0);

    btn.addEventListener('click', function(ev) {
      ev.stopPropagation();
      cleanup();
      tr.style.textDecoration = 'line-through';
      tr.style.opacity = '0.4';
      tr.style.backgroundColor = 'rgba(211, 47, 47, 0.15)';
      vscodeApi.postMessage({
        command: 'rowDelete',
        table: meta.name,
        pkColumn: meta.pkColumn,
        pkValue: getCellValue(pkTd),
      });
    });
  });

  // --- Add Row button ---
  function addInsertButtons() {
    document.querySelectorAll('table').forEach(function(table) {
      if (table.querySelector('.drift-add-row-btn')) return;
      const meta = getTableMeta(table);
      const btn = document.createElement('button');
      btn.className = 'drift-add-row-btn';
      btn.textContent = '+ Add Row';
      btn.style.cssText = 'margin:8px 0;padding:4px 12px;font-size:13px;' +
        'cursor:pointer;background:#2e7d32;color:#fff;border:none;border-radius:4px;';
      btn.addEventListener('click', function() {
        const values = {};
        meta.headers.forEach(function(h, i) {
          if (i !== meta.pkIdx) values[h] = null;
        });
        // Add a visual row
        const tbody = table.querySelector('tbody') || table;
        const newRow = document.createElement('tr');
        newRow.setAttribute('data-drift-pending-insert', '1');
        newRow.style.backgroundColor = 'rgba(46, 125, 50, 0.15)';
        meta.headers.forEach(function(h, i) {
          const td = document.createElement('td');
          td.textContent = i === meta.pkIdx ? '(auto)' : 'NULL';
          newRow.appendChild(td);
        });
        tbody.appendChild(newRow);
        vscodeApi.postMessage({ command: 'rowInsert', table: meta.name, values: values });
      });
      table.parentNode.insertBefore(btn, table.nextSibling);
    });
  }

  // --- Revert cell when extension rejects (validation / schema error) ---
  function revertCellEdit(msg) {
    document.querySelectorAll('table').forEach(function(table) {
      var meta = getTableMeta(table);
      if (meta.name !== msg.table) return;
      var colIdx = meta.headers.indexOf(msg.column);
      if (colIdx < 0) return;
      var pkIdx = meta.pkIdx;
      var rows = table.querySelectorAll('tbody tr');
      for (var i = 0; i < rows.length; i++) {
        var tr = rows[i];
        var pkTd = tr.children[pkIdx];
        if (!pkTd) continue;
        if (String(getCellValue(pkTd)) !== String(msg.pkValue)) continue;
        var td = tr.children[colIdx];
        if (!td) continue;
        td.style.backgroundColor = '';
        td.title = '';
        if (msg.oldValue === null || msg.oldValue === undefined) {
          td.innerHTML = '<span class="cell-null">NULL</span>';
        } else {
          td.textContent = String(msg.oldValue);
        }
        break;
      }
    });
  }

  // --- Receive state from extension ---
  window.addEventListener('message', function(event) {
    const msg = event.data;
    if (msg.command === 'pendingChanges') {
      pendingChanges = msg.changes || [];
    }
    if (msg.command === 'editingEnabled') {
      editingEnabled = msg.enabled;
    }
    if (msg.command === 'cellEditRejected') {
      revertCellEdit(msg);
    }
    if (msg.command === 'rowInsertRejected') {
      document.querySelectorAll('table').forEach(function(table) {
        var meta = getTableMeta(table);
        if (meta.name !== msg.table) return;
        var pending = table.querySelector('tbody tr[data-drift-pending-insert="1"]');
        if (pending) pending.remove();
      });
    }
  });

  // Undo last pending-operation when the cell editor is not focused (Ctrl/Cmd+Z).
  document.addEventListener('keydown', function(e) {
    if (!editingEnabled) return;
    if (!(e.ctrlKey || e.metaKey) || e.key !== 'z' || e.shiftKey) return;
    var ae = document.activeElement;
    if (ae && ae.classList && ae.classList.contains('cell-inline-editor')) return;
    e.preventDefault();
    vscodeApi.postMessage({ command: 'undo' });
  }, true);

  // Run once DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addInsertButtons);
  } else {
    addInsertButtons();
  }

  // Re-run after dynamic content loads (the server HTML may fetch and render tables async)
  const observer = new MutationObserver(function() { addInsertButtons(); });
  observer.observe(document.body, { childList: true, subtree: true });
})();
`;
