/**
 * Webview form for the Export Dataset command.
 * Replaces the sequential showQuickPick(canPickMany) + showInputBox chain
 * with a single form collecting table selection and dataset name at once.
 */

import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import { DatasetExport } from './dataset-export';
import { buildExportFormHtml } from './export-form-html';

/** Non-singleton form panel for dataset export. */
export class ExportFormPanel {
  private readonly _panel: vscode.WebviewPanel;
  private readonly _disposables: vscode.Disposable[] = [];

  /**
   * Open the export dataset form.
   * Fetches table metadata up-front to populate the checkbox list.
   */
  static async open(client: DriftApiClient): Promise<void> {
    const meta = await client.schemaMetadata();
    const tables = meta
      .filter((t) => !t.name.startsWith('sqlite_'))
      .map((t) => ({ name: t.name, rowCount: t.rowCount }));

    const panel = vscode.window.createWebviewPanel(
      'driftExportForm',
      'Export Dataset',
      vscode.ViewColumn.Active,
      { enableScripts: true },
    );
    new ExportFormPanel(panel, client, tables);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly _client: DriftApiClient,
    tables: Array<{ name: string; rowCount: number }>,
  ) {
    this._panel = panel;

    this._panel.onDidDispose(
      () => this._dispose(), null, this._disposables,
    );
    this._panel.webview.onDidReceiveMessage(
      (msg) => this._handleMessage(msg),
      null,
      this._disposables,
    );
    this._panel.webview.html = buildExportFormHtml(tables);
  }

  private async _handleMessage(
    msg: { command: string; name?: string; tables?: string[] },
  ): Promise<void> {
    switch (msg.command) {
      case 'export': {
        const { name, tables } = msg;
        if (!name || !tables?.length) return;

        try {
          const datasetExport = new DatasetExport(this._client);
          const dataset = await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: 'Exporting dataset\u2026',
            },
            () => datasetExport.export(tables, name),
          );
          const json = JSON.stringify(dataset, null, 2);

          // Close the form and prompt for save location
          this._panel.dispose();

          const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(
              `${name}.drift-dataset.json`,
            ),
            filters: { 'Drift Dataset': ['json'] },
          });
          if (uri) {
            await vscode.workspace.fs.writeFile(
              uri, Buffer.from(json, 'utf-8'),
            );
            vscode.window.showInformationMessage(
              `Dataset exported: ${uri.fsPath}`,
            );
          }
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Export failed: ${errMsg}`);
        }
        break;
      }
      case 'cancel':
        this._panel.dispose();
        break;
    }
  }

  private _dispose(): void {
    // Panel is already disposed when onDidDispose fires — only clean up listeners
    for (const d of this._disposables) {
      d.dispose();
    }
  }
}
