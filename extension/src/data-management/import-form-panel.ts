/**
 * Webview form for the Import Dataset command.
 * Replaces the two sequential showQuickPick prompts (dataset source + mode)
 * with a single form showing all options at once.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import type { DriftApiClient } from '../api-client';
import type { IDriftDataset } from './dataset-types';
import { DatasetConfig } from './dataset-config';
import { DatasetImport } from './dataset-import';
import { DependencySorter } from './dependency-sorter';
import { DataReset } from './data-reset';
import { buildImportFormHtml } from './import-form-html';

/** Non-singleton form panel for dataset import. */
export class ImportFormPanel {
  private readonly _panel: vscode.WebviewPanel;
  private readonly _disposables: vscode.Disposable[] = [];

  /**
   * Open the import dataset form.
   * @param client API client for the connected database
   */
  static async open(client: DriftApiClient): Promise<void> {
    const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const datasetConfig = new DatasetConfig();
    const config = ws ? await datasetConfig.load(ws) : null;
    const datasetPaths = config?.datasets ?? {};

    // Build list of named datasets from config
    const datasets = Object.entries(datasetPaths).map(([name, p]) => ({
      name,
      path: path.resolve(ws ?? '', p),
    }));

    const panel = vscode.window.createWebviewPanel(
      'driftImportForm',
      'Import Dataset',
      vscode.ViewColumn.Active,
      { enableScripts: true },
    );
    new ImportFormPanel(panel, client, datasets);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly _client: DriftApiClient,
    private readonly _datasets: Array<{ name: string; path: string }>,
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
    this._panel.webview.html = buildImportFormHtml(this._datasets);
  }

  private async _handleMessage(
    msg: { command: string; datasetPath?: string; mode?: string },
  ): Promise<void> {
    switch (msg.command) {
      case 'import': {
        let filePath = msg.datasetPath;
        const mode = msg.mode as 'append' | 'replace' | 'sql' | undefined;
        if (!filePath || !mode) return;

        try {
          // Handle "browse" option — open native file picker
          if (filePath === '__browse__') {
            const uris = await vscode.window.showOpenDialog({
              filters: { 'Drift Dataset': ['json'] },
            });
            if (!uris?.[0]) return;
            filePath = uris[0].fsPath;
          }

          // Read and parse the dataset file
          const raw = await vscode.workspace.fs.readFile(
            vscode.Uri.file(filePath),
          );
          const dataset = JSON.parse(
            Buffer.from(raw).toString(),
          ) as IDriftDataset;

          const sorter = new DependencySorter();
          const dataReset = new DataReset(this._client, sorter);
          const datasetImport = new DatasetImport(this._client, sorter, dataReset);

          // Validate
          const validation = await datasetImport.validate(dataset);
          if (!validation.valid) {
            vscode.window.showErrorMessage(
              `Invalid: ${validation.errors.join('; ')}`,
            );
            return;
          }
          if (validation.warnings.length > 0) {
            vscode.window.showWarningMessage(
              `Warnings: ${validation.warnings.join('; ')}`,
            );
          }

          // SQL-only mode: generate SQL and open in editor
          if (mode === 'sql') {
            const sql = datasetImport.toSql(dataset);
            this._panel.dispose();
            const doc = await vscode.workspace.openTextDocument({
              content: sql, language: 'sql',
            });
            await vscode.window.showTextDocument(doc);
            return;
          }

          // Execute import with progress
          const result = await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: 'Importing dataset\u2026',
            },
            () => datasetImport.import(dataset, mode),
          );

          this._panel.dispose();
          vscode.window.showInformationMessage(
            `Imported ${result.totalInserted} rows across ${result.tables.length} tables.`,
          );
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Import failed: ${errMsg}`);
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
