import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import { SeedOrchestrator } from './seed-orchestrator';
import { formatAsSql, formatAsDataset } from './seed-formatter';
import { buildSeederHtml } from './seeder-html';
import type {
  ITableSeederConfig,
  ITableSeedResult,
  SeederMessage,
  SeederOutputMode,
} from './seeder-types';

/** Singleton webview panel for test data seeder configuration. */
export class SeederPanel {
  private static _currentPanel: SeederPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _disposables: vscode.Disposable[] = [];
  private readonly _orchestrator: SeedOrchestrator;
  private _configs: ITableSeederConfig[];
  private _busy = false;

  static createOrShow(
    client: DriftApiClient,
    configs: ITableSeederConfig[],
  ): void {
    const column = vscode.ViewColumn.Active;

    if (SeederPanel._currentPanel) {
      SeederPanel._currentPanel._configs = configs;
      SeederPanel._currentPanel._render();
      SeederPanel._currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'driftTestDataSeeder',
      'Test Data Seeder',
      column,
      { enableScripts: true },
    );
    SeederPanel._currentPanel = new SeederPanel(panel, client, configs);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    client: DriftApiClient,
    configs: ITableSeederConfig[],
  ) {
    this._panel = panel;
    this._orchestrator = new SeedOrchestrator(client);
    this._configs = configs;

    this._panel.onDidDispose(
      () => this._dispose(), null, this._disposables,
    );
    this._panel.webview.onDidReceiveMessage(
      (msg: SeederMessage) => this._handleMessage(msg),
      null,
      this._disposables,
    );
    this._render();
  }

  private _render(preview?: ITableSeedResult[]): void {
    this._panel.webview.html = buildSeederHtml(
      this._configs, preview,
    );
  }

  private async _handleMessage(msg: SeederMessage): Promise<void> {
    if (this._busy && msg.command !== 'overrideGenerator'
      && msg.command !== 'setRowCount') {
      return;
    }
    try {
      switch (msg.command) {
        case 'preview': return await this._preview();
        case 'generate': return await this._generate(msg.outputMode);
        case 'exportDataset': return await this._exportDataset();
        case 'overrideGenerator': return this._override(msg);
        case 'setRowCount': return this._setRowCount(msg);
      }
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Seeder error: ${m}`);
    }
  }

  private async _preview(): Promise<void> {
    const previewConfigs = this._configs.map(
      (c) => ({ ...c, rowCount: Math.min(c.rowCount, 5) }),
    );
    this._busy = true;
    try {
      const results = await this._orchestrator.generate(previewConfigs);
      this._render(results);
    } finally {
      this._busy = false;
    }
  }

  private async _generate(outputMode: SeederOutputMode): Promise<void> {
    this._busy = true;
    try {
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Seeding data\u2026' },
        () => this._doGenerate(outputMode),
      );
    } finally {
      this._busy = false;
    }
  }

  private async _doGenerate(
    outputMode: SeederOutputMode,
  ): Promise<void> {
    const results = await this._orchestrator.generate(this._configs);

    if (outputMode === 'execute') {
      const total = await this._orchestrator.execute(results);
      vscode.window.showInformationMessage(
        `Seeded ${total} rows across ${results.length} tables.`,
      );
      return;
    }

    if (outputMode === 'json') {
      const content = JSON.stringify(
        formatAsDataset(results, 'generated-seed'), null, 2,
      );
      await this._openEditor(content, 'json');
      return;
    }

    await this._openEditor(formatAsSql(results), 'sql');
  }

  private async _exportDataset(): Promise<void> {
    this._busy = true;
    try {
      const results = await this._orchestrator.generate(this._configs);
      const dataset = formatAsDataset(results, 'seed-data');
      const content = JSON.stringify(dataset, null, 2);
      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file('seed-data.drift-dataset.json'),
        filters: { 'Drift Dataset': ['drift-dataset.json', 'json'] },
      });
      if (!uri) return;
      await vscode.workspace.fs.writeFile(
        uri, Buffer.from(content, 'utf-8'),
      );
      vscode.window.showInformationMessage(
        `Dataset exported: ${uri.fsPath}`,
      );
    } finally {
      this._busy = false;
    }
  }

  private _override(
    msg: { table: string; column: string; generator: string },
  ): void {
    for (const config of this._configs) {
      if (config.table !== msg.table) continue;
      for (const col of config.columns) {
        if (col.column !== msg.column) continue;
        col.generator = msg.generator as typeof col.generator;
        return;
      }
    }
  }

  private _setRowCount(
    msg: { table: string; rowCount: number },
  ): void {
    const config = this._configs.find((c) => c.table === msg.table);
    if (config) config.rowCount = msg.rowCount;
  }

  private async _openEditor(
    content: string,
    language: string,
  ): Promise<void> {
    const doc = await vscode.workspace.openTextDocument({
      content, language,
    });
    await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
  }

  private _dispose(): void {
    SeederPanel._currentPanel = undefined;
    this._panel.dispose();
    for (const d of this._disposables) {
      d.dispose();
    }
  }
}
