/**
 * Singleton webview panel for Troubleshooting guidance.
 * Shows connection tips, setup checklist, architecture diagram,
 * and quick-action buttons for common fixes.
 */

import * as vscode from 'vscode';
import { buildTroubleshootingHtml } from './troubleshooting-html';
import { secureWebviewHtml } from '../webview-csp';
import type { ConnectionDiagnostics } from './connection-diagnostics';

/** Singleton panel showing troubleshooting and connection guidance. */
export class TroubleshootingPanel {
  private static _currentPanel: TroubleshootingPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _disposables: vscode.Disposable[] = [];
  /** Live diagnostics snapshot rendered into the panel (state + config). */
  private _diag: ConnectionDiagnostics;

  /**
   * Show the troubleshooting panel, or reveal + REFRESH it if already open.
   * Refreshing on reveal matters: the panel is a singleton, and reopening it
   * from a now-offline tree row must update the status header rather than show
   * the stale state captured when it first opened.
   */
  static createOrShow(diag: ConnectionDiagnostics): void {
    const column = vscode.ViewColumn.One;

    if (TroubleshootingPanel._currentPanel) {
      TroubleshootingPanel._currentPanel._diag = diag;
      TroubleshootingPanel._currentPanel._render();
      TroubleshootingPanel._currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'driftTroubleshooting',
      'Troubleshooting — Saropa Drift Advisor',
      column,
      { enableScripts: true },
    );
    TroubleshootingPanel._currentPanel = new TroubleshootingPanel(panel, diag);
  }

  private constructor(panel: vscode.WebviewPanel, diag: ConnectionDiagnostics) {
    this._panel = panel;
    this._diag = diag;

    this._panel.onDidDispose(
      () => this._dispose(), null, this._disposables,
    );
    // Handle button clicks from the webview
    this._panel.webview.onDidReceiveMessage(
      (msg) => this._handleMessage(msg),
      null,
      this._disposables,
    );
    this._render();
  }

  private _render(): void {
    this._panel.webview.html = secureWebviewHtml(buildTroubleshootingHtml(this._diag));
  }

  /** Route button actions from the webview back to VS Code commands, with error handling. */
  private _handleMessage(msg: { command: string }): void {
    // Helper that executes a VS Code command and shows an error toast if it rejects
    const safeExec = (cmdId: string, ...args: unknown[]): void => {
      vscode.commands.executeCommand(cmdId, ...args).then(
        undefined,
        (err: unknown) => {
          const errMsg = err instanceof Error ? err.message : String(err);
          void vscode.window.showErrorMessage(
            `Command "${cmdId}" failed: ${errMsg}`,
          );
        },
      );
    };

    switch (msg.command) {
      case 'retryConnection':
        safeExec('driftViewer.retryDiscovery');
        break;
      case 'forwardPort':
        safeExec('driftViewer.forwardPortAndroid');
        break;
      case 'selectServer':
        safeExec('driftViewer.selectServer');
        break;
      case 'openOutput':
        // Show the Saropa Drift Advisor output channel
        safeExec('workbench.action.output.show', 'Saropa Drift Advisor');
        break;
      case 'openSettings':
        safeExec('workbench.action.openSettings', 'driftViewer');
        break;
      default:
        // Unknown command from webview — log it so it's not silently ignored
        console.warn(`Troubleshooting panel: unknown command "${msg.command}"`);
        break;
    }
  }

  private _dispose(): void {
    TroubleshootingPanel._currentPanel = undefined;
    this._panel.dispose();
    for (const d of this._disposables) {
      d.dispose();
    }
  }
}
