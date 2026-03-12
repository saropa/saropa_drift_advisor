/**
 * Webview panel controller for clipboard import functionality.
 *
 * This module manages the clipboard import UI panel and coordinates
 * between the various import components:
 * - ClipboardParser: Parses raw clipboard text
 * - ImportValidator: Validates data before import
 * - ImportExecutor: Performs the actual database operations
 * - ImportHistory: Tracks imports for undo support
 *
 * The panel uses a VS Code webview to render an interactive UI where
 * users can:
 * - Preview parsed clipboard data
 * - Map clipboard columns to table columns
 * - Select import strategy (insert, upsert, etc.)
 * - Run validation and preview changes
 * - Execute the import with transaction safety
 *
 * @module clipboard-import-panel
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

/**
 * Message from webview to update a column mapping.
 */
interface IUpdateMappingMessage {
  command: 'updateMapping';
  /** Index of the mapping in the mapping array */
  index: number;
  /** Target table column name, or null to skip this column */
  tableColumn: string | null;
}

/**
 * Message from webview to change import strategy.
 */
interface IUpdateStrategyMessage {
  command: 'updateStrategy';
  /** New import strategy selection */
  strategy: ImportStrategy;
}

/**
 * Message from webview to change match-by setting.
 */
interface IUpdateMatchByMessage {
  command: 'updateMatchBy';
  /** Column name to match by, or 'pk' for primary key */
  matchBy: string;
}

/**
 * Message from webview to toggle continue-on-error setting.
 */
interface IUpdateContinueOnErrorMessage {
  command: 'updateContinueOnError';
  /** Whether to continue importing when individual rows fail */
  continueOnError: boolean;
}

/**
 * Simple command messages without additional data.
 */
interface ISimpleMessage {
  command: 'cancel' | 'validate' | 'import';
}

/**
 * Union type of all possible messages from the webview.
 */
type PanelMessage =
  | IUpdateMappingMessage
  | IUpdateStrategyMessage
  | IUpdateMatchByMessage
  | IUpdateContinueOnErrorMessage
  | ISimpleMessage;

/**
 * Manages the clipboard import webview panel.
 *
 * Implements a singleton pattern - only one import panel can be open at
 * a time. If createOrShow is called while a panel exists, it updates
 * the existing panel with new data.
 *
 * The panel lifecycle:
 * 1. User triggers import command
 * 2. Clipboard is read and parsed
 * 3. Panel is created with parsed data and auto-mapped columns
 * 4. User adjusts mappings and options
 * 5. User runs validation (optional) then import
 * 6. Import is recorded in history for undo support
 * 7. Panel can be closed or reused for next import
 */
export class ClipboardImportPanel {
  /** Singleton instance of the current panel */
  private static _currentPanel: ClipboardImportPanel | undefined;

  /** VS Code webview panel instance */
  private readonly _panel: vscode.WebviewPanel;
  /** Disposables to clean up on panel close */
  private readonly _disposables: vscode.Disposable[] = [];
  /** API client for database operations */
  private readonly _client: DriftApiClient;
  /** History tracker for undo support */
  private readonly _history: ImportHistory;
  /** Executor for database import operations */
  private readonly _executor: ImportExecutor;
  /** Validator for pre-import data checking */
  private readonly _validator: ImportValidator;

  /** Current state of the import panel */
  private _state: IClipboardImportState;

  /**
   * Create a new panel or reveal existing one with new data.
   *
   * Reads clipboard content, parses it, auto-maps columns, and shows
   * the import panel. If clipboard is empty or unparseable, shows
   * an error message instead.
   *
   * @param client - API client for database operations
   * @param storage - VS Code Memento for history persistence
   * @param table - Target table name for import
   * @param tableColumns - Column metadata for the target table
   */
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

  /**
   * Private constructor - use createOrShow() to create instances.
   *
   * Sets up the panel, initializes dependencies, and wires up
   * event handlers for webview messages.
   *
   * @param panel - VS Code webview panel
   * @param client - API client for database operations
   * @param storage - Memento for history persistence
   * @param state - Initial panel state
   */
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

  /**
   * Render the panel HTML with current state.
   *
   * Regenerates the complete HTML from current state and updates
   * the webview. Called after any state change.
   *
   * @param loading - Show loading indicator
   * @param error - Error message to display
   * @param success - Success result with row counts
   */
  private _render(loading = false, error?: string, success?: { imported: number; skipped: number }): void {
    this._panel.webview.html = buildClipboardImportHtml(
      this._state,
      loading,
      error,
      success,
    );
  }

  /**
   * Handle messages from the webview.
   *
   * Routes messages to appropriate handlers based on command type.
   * Updates state and re-renders as needed.
   *
   * @param msg - Message from webview
   */
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

  /**
   * Update a column mapping and clear validation results.
   *
   * Changing mappings invalidates previous validation, so results
   * are cleared and user must re-validate.
   *
   * @param index - Index of mapping to update
   * @param tableColumn - New target column, or null to skip
   */
  private _updateMapping(index: number, tableColumn: string | null): void {
    if (index >= 0 && index < this._state.mapping.length) {
      this._state.mapping[index].tableColumn = tableColumn;
      this._state.validationResults = undefined;
      this._state.dryRunResults = undefined;
      this._render();
    }
  }

  /**
   * Run validation on current data and mappings.
   *
   * Validates all rows against table schema and foreign key constraints.
   * Updates state with validation results and shows summary message.
   */
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

  /**
   * Execute the import operation.
   *
   * Flow:
   * 1. Check schema freshness (warn if changed since mapping)
   * 2. Build import payload from current mappings
   * 3. Execute import or dry run based on strategy
   * 4. Record successful import in history for undo
   * 5. Display results in panel
   */
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

  /**
   * Check if table schema has changed since import was started.
   *
   * Compares current schema against snapshot taken when panel opened.
   * Warns user if columns were added, removed, or modified.
   *
   * @returns Whether schema is fresh and list of detected changes
   */
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

  /**
   * Clean up panel resources.
   *
   * Clears singleton reference and disposes all registered disposables.
   */
  private _dispose(): void {
    ClipboardImportPanel._currentPanel = undefined;
    this._panel.dispose();
    for (const d of this._disposables) {
      d.dispose();
    }
  }
}
