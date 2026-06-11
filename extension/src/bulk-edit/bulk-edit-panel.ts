/**
 * Dedicated webview for bulk data editing: summarizes pending changes and
 * exposes shortcuts to preview SQL, apply batch, undo/redo, keyboard grid
 * navigation, and links to invariants / clipboard import / Query DVR (Feature 47).
 */

import * as vscode from 'vscode';
import type { ChangeTracker, PendingChange } from '../editing/change-tracker';
import { bulkEditHtml } from './bulk-edit-html';

const VIEW_TYPE = 'driftViewer.bulkEdit';

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
