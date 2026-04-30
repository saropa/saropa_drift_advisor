/**
 * Dedicated webview for bulk data editing: summarizes pending changes and
 * exposes shortcuts to preview SQL, apply batch, undo/redo, keyboard grid
 * navigation, and links to invariants / clipboard import / Query DVR (Feature 47).
 */

import * as vscode from 'vscode';
import type { ChangeTracker, PendingChange } from '../editing/change-tracker';

const VIEW_TYPE = 'driftViewer.bulkEdit';

/**
 * Builds minimal themed HTML for the bulk-edit dashboard (no external assets).
 */
function bulkEditHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />
  <title>Bulk edit data</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      padding: 1rem 1.25rem;
      line-height: 1.45;
      max-width: 72rem;
    }
    h1 { font-size: 1.1rem; font-weight: 600; margin: 0 0 0.75rem; }
    p { margin: 0.5rem 0; opacity: 0.92; }
    .count { font-weight: 600; color: var(--vscode-textLink-foreground); }
    .row { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 1rem; }
    .meta { opacity: 0.75; margin-top: 0.25rem; }
    .grid-wrap { margin-top: 1rem; border: 1px solid var(--vscode-editorWidget-border); border-radius: 4px; overflow: hidden; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 0.4rem 0.5rem; border-bottom: 1px solid var(--vscode-editorWidget-border); vertical-align: top; }
    th { background: var(--vscode-editorWidget-background); font-weight: 600; position: sticky; top: 0; z-index: 1; }
    td.sql { font-family: var(--vscode-editor-font-family); font-size: 0.9em; }
    .pager { display: flex; gap: 0.5rem; align-items: center; margin-top: 0.6rem; }
    button {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 0.35rem 0.75rem;
      border-radius: 2px;
      cursor: pointer;
      font-size: var(--vscode-font-size);
    }
    button.secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .grid-wrap:focus { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }
    tr.pending-row-selected { background: var(--vscode-list-inactiveSelectionBackground); }
    .keyboard-hint { font-size: 0.78rem; opacity: 0.8; margin-top: 0.35rem; max-width: 48rem; }
  </style>
</head>
<body>
  <h1>Saropa Drift Advisor — Edit table data</h1>
  <p>Pending operations in this workspace: <span class="count" id="c">0</span></p>
  <p class="meta" id="pageMeta"></p>
  <p>Edit cells in the <strong>table viewer panel</strong> (double-click a cell). When the debug server has <code>writeQuery</code> configured, you can apply the batch below.</p>
  <div class="row">
    <button type="button" id="openViewer">Open table viewer</button>
    <button type="button" id="preview" class="secondary">Preview SQL</button>
    <button type="button" id="commit">Apply to database</button>
  </div>
  <div class="row">
    <button type="button" id="undo" class="secondary">Undo</button>
    <button type="button" id="redo" class="secondary">Redo</button>
    <button type="button" id="discard" class="secondary">Discard all</button>
  </div>
  <div class="row">
    <button type="button" id="invariants" class="secondary">Data invariants…</button>
    <button type="button" id="clipboardImport" class="secondary">Paste from clipboard…</button>
    <button type="button" id="openDvr" class="secondary">Query DVR</button>
    <button type="button" id="captureSnapshot" class="secondary" title="Capture row-level snapshot for Timeline / diff (safety net before destructive edits)">Capture DB snapshot…</button>
  </div>
  <p class="keyboard-hint" id="gridHint">Grid: Tab to focus, Arrow Up/Down to move the row selection, Enter opens the table viewer, Escape clears selection. Ctrl+Enter applies (same as toolbar).</p>
  <div class="grid-wrap" id="gridWrap" tabindex="0" role="region" aria-labelledby="gridHint">
    <table>
      <thead><tr><th>Kind</th><th>Table</th><th>Details</th><th>When</th></tr></thead>
      <tbody id="gridBody"><tr><td colspan="4">No pending edits.</td></tr></tbody>
    </table>
  </div>
  <div class="pager">
    <button type="button" id="prevPage" class="secondary">Prev</button>
    <span id="pageInfo">Page 1 / 1</span>
    <button type="button" id="nextPage" class="secondary">Next</button>
  </div>
  <script>
    (function() {
      var vscode = acquireVsCodeApi();
      var page = 0;
      var pageSize = 20;
      var rows = [];
      /** Absolute index into [rows] for keyboard/mouse selection (-1 = none). */
      var selectedAbs = -1;
      function send(cmd) { vscode.postMessage({ command: cmd }); }
      function esc(v) {
        return String(v)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      }
      function fmt(v) {
        if (v === null || v === undefined) return 'NULL';
        if (typeof v === 'string') return '"' + v + '"';
        try { return JSON.stringify(v); } catch (_e) { return String(v); }
      }
      function detail(change) {
        if (change.kind === 'cell') {
          return '<span class="sql">' + esc(change.column) + ': ' + esc(fmt(change.oldValue)) + ' -> ' + esc(fmt(change.newValue)) + '</span>';
        }
        if (change.kind === 'delete') {
          return '<span class="sql">where ' + esc(change.pkColumn) + ' = ' + esc(fmt(change.pkValue)) + '</span>';
        }
        var vals = Object.keys(change.values || {}).slice(0, 5).map(function(k) {
          return esc(k) + '=' + esc(fmt(change.values[k]));
        }).join(', ');
        return '<span class="sql">' + vals + '</span>';
      }
      /** Keep keyboard focus on the grid region so Arrow/Enter/Escape stay predictable. */
      function focusSelectedRow() {
        if (selectedAbs < 0) return;
        var gw = document.getElementById('gridWrap');
        if (gw) gw.focus();
      }
      function renderGrid() {
        var body = document.getElementById('gridBody');
        var pageInfo = document.getElementById('pageInfo');
        var pageMeta = document.getElementById('pageMeta');
        var totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
        if (page >= totalPages) page = totalPages - 1;
        var start = page * pageSize;
        var end = Math.min(rows.length, start + pageSize);
        pageInfo.textContent = 'Page ' + (page + 1) + ' / ' + totalPages;
        pageMeta.textContent = rows.length > 0 ? ('Showing ' + (start + 1) + '-' + end + ' of ' + rows.length + ' pending edits') : 'No pending edits.';
        document.getElementById('prevPage').disabled = page <= 0;
        document.getElementById('nextPage').disabled = page >= totalPages - 1;
        if (rows.length === 0) {
          selectedAbs = -1;
          body.innerHTML = '<tr><td colspan="4">No pending edits.</td></tr>';
          return;
        }
        if (selectedAbs >= rows.length) selectedAbs = rows.length - 1;
        body.innerHTML = rows.slice(start, end).map(function(change, i) {
          var abs = start + i;
          var when = change.timestamp ? new Date(change.timestamp).toLocaleTimeString() : '';
          var sel = abs === selectedAbs ? ' pending-row-selected' : '';
          return '<tr class="pending-row' + sel + '" data-abs-index="' + abs + '">'
            + '<td>' + esc(change.kind) + '</td>'
            + '<td>' + esc(change.table || '') + '</td>'
            + '<td>' + detail(change) + '</td>'
            + '<td>' + esc(when) + '</td>'
            + '</tr>';
        }).join('');
        requestAnimationFrame(focusSelectedRow);
      }
      function moveSelection(delta) {
        if (rows.length === 0) return;
        if (selectedAbs < 0) {
          selectedAbs = page * pageSize;
        } else {
          selectedAbs += delta;
          if (selectedAbs < 0) selectedAbs = 0;
          if (selectedAbs >= rows.length) selectedAbs = rows.length - 1;
        }
        var newPage = Math.floor(selectedAbs / pageSize);
        if (newPage !== page) page = newPage;
        renderGrid();
      }
      document.getElementById('openViewer').onclick = function() { send('openViewer'); };
      document.getElementById('preview').onclick = function() { send('preview'); };
      document.getElementById('commit').onclick = function() { send('commit'); };
      document.getElementById('undo').onclick = function() { send('undo'); };
      document.getElementById('redo').onclick = function() { send('redo'); };
      document.getElementById('discard').onclick = function() { send('discard'); };
      document.getElementById('invariants').onclick = function() { send('invariants'); };
      document.getElementById('clipboardImport').onclick = function() { send('clipboardImport'); };
      document.getElementById('openDvr').onclick = function() { send('openDvr'); };
      document.getElementById('captureSnapshot').onclick = function() { send('captureSnapshot'); };
      document.getElementById('prevPage').onclick = function() { page = Math.max(0, page - 1); renderGrid(); };
      document.getElementById('nextPage').onclick = function() { page += 1; renderGrid(); };
      var gridWrap = document.getElementById('gridWrap');
      var gridBody = document.getElementById('gridBody');
      gridBody.addEventListener('click', function(e) {
        var tr = e.target.closest('tr[data-abs-index]');
        if (!tr) return;
        selectedAbs = parseInt(tr.getAttribute('data-abs-index'), 10);
        renderGrid();
        gridWrap.focus();
      });
      gridWrap.addEventListener('keydown', function(ev) {
        if (ev.key === 'ArrowDown') { ev.preventDefault(); moveSelection(1); return; }
        if (ev.key === 'ArrowUp') { ev.preventDefault(); moveSelection(-1); return; }
        if (ev.key === 'Home' && !ev.ctrlKey) {
          ev.preventDefault();
          selectedAbs = page * pageSize;
          renderGrid();
          return;
        }
        if (ev.key === 'End' && !ev.ctrlKey) {
          ev.preventDefault();
          selectedAbs = Math.min(rows.length - 1, (page + 1) * pageSize - 1);
          renderGrid();
          return;
        }
        if (ev.key === 'Enter' && !ev.ctrlKey) {
          ev.preventDefault();
          send('openViewer');
          return;
        }
        if (ev.key === 'Escape') {
          ev.preventDefault();
          if (selectedAbs >= 0) {
            selectedAbs = -1;
            renderGrid();
          }
          return;
        }
      });
      window.addEventListener('keydown', function(ev) {
        if (ev.key === 'Enter' && ev.ctrlKey) send('commit');
      });
      window.addEventListener('message', function(ev) {
        var m = ev.data;
        if (m && m.command === 'state' && typeof m.count === 'number') {
          document.getElementById('c').textContent = String(m.count);
          rows = Array.isArray(m.changes) ? m.changes : [];
          selectedAbs = -1;
          renderGrid();
        }
      });
    })();
  </script>
</body>
</html>`;
}

export class BulkEditPanel {
  static current: BulkEditPanel | undefined;

  /**
   * Opens or reveals the bulk-edit panel and keeps pending-operation count in sync.
   */
  static createOrShow(
    context: vscode.ExtensionContext,
    changeTracker: ChangeTracker,
  ): void {
    if (BulkEditPanel.current) {
      BulkEditPanel.current._panel.reveal(vscode.ViewColumn.One);
      BulkEditPanel.current._pushState();
      return;
    }
    BulkEditPanel.current = new BulkEditPanel(context, changeTracker);
  }

  private readonly _panel: vscode.WebviewPanel;
  private readonly _disposables: vscode.Disposable[] = [];

  private constructor(
    context: vscode.ExtensionContext,
    private readonly _changeTracker: ChangeTracker,
  ) {
    this._panel = vscode.window.createWebviewPanel(
      VIEW_TYPE,
      'Saropa Drift Advisor: Edit table data',
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    this._panel.webview.html = bulkEditHtml();

    this._disposables.push(
      this._changeTracker.onDidChange(() => this._pushState()),
    );
    this._disposables.push(
      this._panel.webview.onDidReceiveMessage((msg: { command?: string }) => {
        switch (msg.command) {
          case 'openViewer':
            void vscode.commands.executeCommand('driftViewer.openInPanel');
            break;
          case 'preview':
            void vscode.commands.executeCommand('driftViewer.generateSql');
            break;
          case 'commit':
            void vscode.commands.executeCommand('driftViewer.commitPendingEdits');
            break;
          case 'undo':
            void vscode.commands.executeCommand('driftViewer.undoEdit');
            break;
          case 'redo':
            void vscode.commands.executeCommand('driftViewer.redoEdit');
            break;
          case 'discard':
            void vscode.commands.executeCommand('driftViewer.discardAllEdits');
            break;
          case 'invariants':
            void vscode.commands.executeCommand('driftViewer.manageInvariants');
            break;
          case 'clipboardImport':
            void vscode.commands.executeCommand('driftViewer.clipboardImport');
            break;
          case 'openDvr':
            void vscode.commands.executeCommand('driftViewer.openDvr');
            break;
          case 'captureSnapshot':
            void vscode.commands.executeCommand('driftViewer.captureSnapshot');
            break;
          default:
            break;
        }
      }),
    );

    this._panel.onDidDispose(
      () => {
        for (const d of this._disposables) {
          d.dispose();
        }
        this._disposables.length = 0;
        BulkEditPanel.current = undefined;
      },
      null,
      context.subscriptions,
    );

    const self = this;
    context.subscriptions.push({
      dispose: () => {
        if (BulkEditPanel.current === self) {
          self._panel.dispose();
        }
      },
    });

    this._pushState();
  }

  private _pushState(): void {
    void this._panel.webview.postMessage({
      command: 'state',
      count: this._changeTracker.changeCount,
      changes: this._changeTracker.changes as PendingChange[],
    });
  }
}
