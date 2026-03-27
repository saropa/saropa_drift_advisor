/**
 * Dedicated webview for bulk data editing: summarizes pending changes and
 * exposes shortcuts to preview SQL, apply batch, undo, and open the table viewer.
 */

import * as vscode from 'vscode';
import type { ChangeTracker } from '../editing/change-tracker';

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
      max-width: 36rem;
    }
    h1 { font-size: 1.1rem; font-weight: 600; margin: 0 0 0.75rem; }
    p { margin: 0.5rem 0; opacity: 0.92; }
    .count { font-weight: 600; color: var(--vscode-textLink-foreground); }
    .row { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 1rem; }
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
  </style>
</head>
<body>
  <h1>Saropa Drift Advisor — Edit table data</h1>
  <p>Pending operations in this workspace: <span class="count" id="c">0</span></p>
  <p>Edit cells in the <strong>table viewer panel</strong> (double-click a cell). When the debug server has <code>writeQuery</code> configured, you can apply the batch below.</p>
  <div class="row">
    <button type="button" id="openViewer">Open table viewer</button>
    <button type="button" id="preview" class="secondary">Preview SQL</button>
    <button type="button" id="commit">Apply to database</button>
  </div>
  <div class="row">
    <button type="button" id="undo" class="secondary">Undo</button>
    <button type="button" id="discard" class="secondary">Discard all</button>
  </div>
  <script>
    (function() {
      var vscode = acquireVsCodeApi();
      function send(cmd) { vscode.postMessage({ command: cmd }); }
      document.getElementById('openViewer').onclick = function() { send('openViewer'); };
      document.getElementById('preview').onclick = function() { send('preview'); };
      document.getElementById('commit').onclick = function() { send('commit'); };
      document.getElementById('undo').onclick = function() { send('undo'); };
      document.getElementById('discard').onclick = function() { send('discard'); };
      window.addEventListener('message', function(ev) {
        var m = ev.data;
        if (m && m.command === 'state' && typeof m.count === 'number') {
          document.getElementById('c').textContent = String(m.count);
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
          case 'discard':
            void vscode.commands.executeCommand('driftViewer.discardAllEdits');
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
    });
  }
}
