/**
 * Webview panel for clipboard import functionality.
 * Coordinates parsing, validation, and import execution.
 */

import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import type { ColumnMetadata } from '../api-types';
import { buildClipboardImportHtml } from './clipboard-import-html';
import {
  autoMapColumns,
  buildImportPayload,
  ClipboardParser,
} from './clipboard-parser';
import type {
  IClipboardImportState,
  IColumnMapping,
  IImportOptions,
  ImportStrategy,
} from './clipboard-import-types';
import { ImportExecutor } from './import-executor';
import { ImportHistory } from './import-history';
import { ImportValidator, validateForeignKeys } from './import-validator';
import { captureSchemaSnapshot, checkSchemaFreshness } from './schema-freshness';

interface IUpdateMappingMessage {
  command: 'updateMapping';
  index: number;
  tableColumn: string | null;
}

interface IUpdateStrategyMessage {
  command: 'updateStrategy';
  strategy: ImportStrategy;
}

interface IUpdateMatchByMessage {
  command: 'updateMatchBy';
  matchBy: string;
}

interface IUpdateContinueOnErrorMessage {
  command: 'updateContinueOnError';
  continueOnError: boolean;
}

interface ISimpleMessage {
  command: 'cancel' | 'validate' | 'import';
}

type PanelMessage =
  | IUpdateMappingMessage
  | IUpdateStrategyMessage
  | IUpdateMatchByMessage
  | IUpdateContinueOnErrorMessage
  | ISimpleMessage;

export class ClipboardImportPanel {
  private static _currentPanel: ClipboardImportPanel | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private readonly _disposables: vscode.Disposable[] = [];
  private readonly _client: DriftApiClient;
  private readonly _history: ImportHistory;
  private readonly _executor: ImportExecutor;
  private readonly _validator: ImportValidator;

  private _state: IClipboardImportState;

  static async createOrShow(
    client: DriftApiClient,
    storage: vscode.Memento,
    table: string,
    tableColumns: ColumnMetadata[],
  ): Promise<void> {
    const clipboardText = await vscode.env.clipboard.readText();

    if (!clipboardText.trim()) {
      vscode.window.showWarningMessage('Clipboard is empty');
      return;
    }

    const parser = new ClipboardParser();
    let parsed;
    try {
      parsed = parser.parse(clipboardText);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Failed to parse clipboard: ${message}`);
      return;
    }

    if (parsed.rows.length === 0) {
      vscode.window.showWarningMessage('No data rows found in clipboard (only headers)');
      return;
    }

    const mapping = autoMapColumns(
      parsed.headers,
      tableColumns.map((c) => c.name),
    );

    const state: IClipboardImportState = {
      table,
      tableColumns,
      parsed,
      mapping,
      options: {
        strategy: 'insert',
        matchBy: 'pk',
        continueOnError: false,
      },
      schemaSnapshot: captureSchemaSnapshot(table, tableColumns),
    };

    const column = vscode.ViewColumn.Active;

    if (ClipboardImportPanel._currentPanel) {
      ClipboardImportPanel._currentPanel._state = state;
      ClipboardImportPanel._currentPanel._render();
      ClipboardImportPanel._currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'driftClipboardImport',
      `Import: ${table}`,
      column,
      { enableScripts: true },
    );

    ClipboardImportPanel._currentPanel = new ClipboardImportPanel(
      panel,
      client,
      storage,
      state,
    );
  }

  private constructor(
    panel: vscode.WebviewPanel,
    client: DriftApiClient,
    storage: vscode.Memento,
    state: IClipboardImportState,
  ) {
    this._panel = panel;
    this._client = client;
    this._state = state;
    this._history = new ImportHistory(storage);
    this._executor = new ImportExecutor(client);
    this._validator = new ImportValidator(client);

    this._panel.onDidDispose(
      () => this._dispose(),
      null,
      this._disposables,
    );

    this._panel.webview.onDidReceiveMessage(
      (msg: PanelMessage) => this._handleMessage(msg),
      null,
      this._disposables,
    );

    this._render();
  }

  private _render(loading = false, error?: string, success?: { imported: number; skipped: number }): void {
    this._panel.webview.html = buildClipboardImportHtml(
      this._state,
      loading,
      error,
      success,
    );
  }

  private async _handleMessage(msg: PanelMessage): Promise<void> {
    switch (msg.command) {
      case 'cancel':
        this._panel.dispose();
        break;

      case 'updateMapping':
        this._updateMapping(msg.index, msg.tableColumn);
        break;

      case 'updateStrategy':
        this._state.options.strategy = msg.strategy;
        this._state.validationResults = undefined;
        this._state.dryRunResults = undefined;
        this._render();
        break;

      case 'updateMatchBy':
        this._state.options.matchBy = msg.matchBy === 'pk' ? 'pk' : [msg.matchBy];
        this._render();
        break;

      case 'updateContinueOnError':
        this._state.options.continueOnError = msg.continueOnError;
        this._render();
        break;

      case 'validate':
        await this._runValidation();
        break;

      case 'import':
        await this._runImport();
        break;
    }
  }

  private _updateMapping(index: number, tableColumn: string | null): void {
    if (index >= 0 && index < this._state.mapping.length) {
      this._state.mapping[index].tableColumn = tableColumn;
      this._state.validationResults = undefined;
      this._state.dryRunResults = undefined;
      this._render();
    }
  }

  private async _runValidation(): Promise<void> {
    this._render(true);

    try {
      const rows = buildImportPayload(this._state.parsed, this._state.mapping);

      const results = await this._validator.validate(
        this._state.table,
        rows,
        this._state.tableColumns,
        this._state.options,
      );

      const fkResults = await validateForeignKeys(
        this._client,
        this._state.table,
        rows,
        this._state.mapping,
      );

      for (const fkResult of fkResults) {
        const existing = results.find((r) => r.row === fkResult.row);
        if (existing) {
          existing.errors.push(...fkResult.errors);
          existing.warnings.push(...fkResult.warnings);
        } else {
          results.push(fkResult);
        }
      }

      results.sort((a, b) => a.row - b.row);
      this._state.validationResults = results;
      this._state.dryRunResults = undefined;
      this._render();

      const errorCount = ImportValidator.countErrors(results);
      if (errorCount === 0) {
        vscode.window.showInformationMessage(
          `Validation passed: ${rows.length} rows ready to import`,
        );
      } else {
        vscode.window.showWarningMessage(
          `Validation found ${errorCount} error(s) in ${results.filter((r) => r.errors.length > 0).length} rows`,
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this._render(false, `Validation failed: ${message}`);
    }
  }

  private async _runImport(): Promise<void> {
    this._render(true);

    try {
      const freshness = await this._checkSchemaFreshness();
      if (!freshness.fresh) {
        const proceed = await vscode.window.showWarningMessage(
          `Schema has changed:\n${freshness.changes.join('\n')}\n\nContinue anyway?`,
          'Continue',
          'Cancel',
        );
        if (proceed !== 'Continue') {
          this._render();
          return;
        }
      }

      const rows = buildImportPayload(this._state.parsed, this._state.mapping);

      if (this._state.options.strategy === 'dry_run') {
        const dryRunResults = await this._executor.dryRun(
          this._state.table,
          rows,
          this._state.tableColumns,
          this._state.options,
        );
        this._state.dryRunResults = dryRunResults;
        this._state.validationResults = dryRunResults.validationErrors;
        this._render();
        return;
      }

      const result = await this._executor.execute(
        this._state.table,
        rows,
        this._state.tableColumns,
        this._state.options,
      );

      if (result.success) {
        this._history.recordImport(
          this._state.table,
          result,
          this._state.options.strategy,
          this._state.parsed.format,
        );

        this._render(false, undefined, {
          imported: result.imported,
          skipped: result.skipped,
        });

        const msg = result.skipped > 0
          ? `Imported ${result.imported} rows, skipped ${result.skipped}`
          : `Imported ${result.imported} rows into ${this._state.table}`;

        vscode.window.showInformationMessage(msg);
      } else {
        const errorMessages = result.errors
          .slice(0, 3)
          .map((e) => `Row ${e.row + 1}: ${e.error}`)
          .join('\n');

        this._render(false, `Import failed:\n${errorMessages}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this._render(false, message);
    }
  }

  private async _checkSchemaFreshness(): Promise<{ fresh: boolean; changes: string[] }> {
    try {
      const tables = await this._client.schemaMetadata();
      const current = tables.find((t) => t.name === this._state.table);
      if (!current) {
        return { fresh: false, changes: ['Table no longer exists'] };
      }
      return checkSchemaFreshness(this._state.schemaSnapshot, current.columns);
    } catch {
      return { fresh: true, changes: [] };
    }
  }

  private _dispose(): void {
    ClipboardImportPanel._currentPanel = undefined;
    this._panel.dispose();
    for (const d of this._disposables) {
      d.dispose();
    }
  }
}
