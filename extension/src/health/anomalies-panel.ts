/**
 * Singleton webview panel for Anomaly Detection results.
 * Replaces the old showQuickPick-based display with a filterable table.
 */

import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import type { Anomaly } from '../api-types';
import { buildAnomaliesHtml } from './anomalies-html';

/** Singleton panel showing anomaly detection results. */
export class AnomaliesPanel {
  private static _currentPanel: AnomaliesPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _disposables: vscode.Disposable[] = [];
  private _anomalies: Anomaly[];
  private readonly _client: DriftApiClient;

  static createOrShow(
    anomalies: Anomaly[],
    client: DriftApiClient,
  ): void {
    const column = vscode.ViewColumn.Active;

    if (AnomaliesPanel._currentPanel) {
      AnomaliesPanel._currentPanel._update(anomalies);
      AnomaliesPanel._currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'driftAnomalies',
      'Anomaly Detection',
      column,
      { enableScripts: true },
    );
    AnomaliesPanel._currentPanel =
      new AnomaliesPanel(panel, anomalies, client);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    anomalies: Anomaly[],
    client: DriftApiClient,
  ) {
    this._panel = panel;
    this._anomalies = anomalies;
    this._client = client;

    this._panel.onDidDispose(
      () => this._dispose(), null, this._disposables,
    );
    this._panel.webview.onDidReceiveMessage(
      (msg) => this._handleMessage(msg),
      null,
      this._disposables,
    );
    this._render();
  }

  private _update(anomalies: Anomaly[]): void {
    this._anomalies = anomalies;
    this._render();
  }

  private _render(): void {
    this._panel.webview.html = buildAnomaliesHtml(this._anomalies);
  }

  private async _handleMessage(
    msg: { command: string },
  ): Promise<void> {
    switch (msg.command) {
      case 'refresh': {
        try {
          const anomalies = await this._client.anomalies();
          this._update(anomalies);
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Refresh failed: ${errMsg}`);
        }
        break;
      }
      case 'generateFixes': {
        // Delegate to the existing generateAnomalyFixes command with current anomalies
        vscode.commands.executeCommand(
          'driftViewer.generateAnomalyFixes',
          { anomalies: this._anomalies.filter((a) => a.severity === 'error') },
        );
        break;
      }
    }
  }

  private _dispose(): void {
    AnomaliesPanel._currentPanel = undefined;
    this._panel.dispose();
    for (const d of this._disposables) {
      d.dispose();
    }
  }
}
