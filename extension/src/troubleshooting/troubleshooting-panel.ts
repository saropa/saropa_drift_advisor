/**
 * Singleton webview panel for Troubleshooting guidance.
 * Shows connection tips, setup checklist, architecture diagram,
 * and quick-action buttons for common fixes.
 */

import * as vscode from 'vscode';
import { buildTroubleshootingHtml } from './troubleshooting-html';

/** Singleton panel showing troubleshooting and connection guidance. */
export class TroubleshootingPanel {
  private static _currentPanel: TroubleshootingPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _disposables: vscode.Disposable[] = [];
  /** Configured server port, used in help text and diagrams. */
  private readonly _port: number;

  /** Show the troubleshooting panel (or reveal if already open). */
  static createOrShow(port: number): void {
    const column = vscode.ViewColumn.One;

    if (TroubleshootingPanel._currentPanel) {
      TroubleshootingPanel._currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'driftTroubleshooting',
      'Troubleshooting — Saropa Drift Advisor',
      column,
      { enableScripts: true },
    );
    TroubleshootingPanel._currentPanel = new TroubleshootingPanel(panel, port);
  }

  private constructor(panel: vscode.WebviewPanel, port: number) {
    this._panel = panel;
    this._port = port;

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
    this._panel.webview.html = buildTroubleshootingHtml(this._port);
  }

  /** Route button actions from the webview back to VS Code commands. */
  private _handleMessage(msg: { command: string }): void {
    switch (msg.command) {
      case 'retryConnection':
        void vscode.commands.executeCommand('driftViewer.retryDiscovery');
        break;
      case 'forwardPort':
        void vscode.commands.executeCommand('driftViewer.forwardPortAndroid');
        break;
      case 'selectServer':
        void vscode.commands.executeCommand('driftViewer.selectServer');
        break;
      case 'openOutput':
        // Show the Saropa Drift Advisor output channel
        void vscode.commands.executeCommand(
          'workbench.action.output.show',
          'Saropa Drift Advisor',
        );
        break;
      case 'openSettings':
        void vscode.commands.executeCommand(
          'workbench.action.openSettings',
          'driftViewer',
        );
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
