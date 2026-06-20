import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import type { SchemaIntelligence } from '../engines/schema-intelligence';
import type { QueryIntelligence } from '../engines/query-intelligence';
import { DIAGNOSTIC_CODES } from './diagnostic-codes';
import {
  DIAGNOSTIC_COLLECTION_NAME,
  DIAGNOSTIC_PREFIX,
  DIAGNOSTIC_SOURCE,
  type IDartFileInfo,
  type IDiagnosticConfig,
  type IDiagnosticContext,
  type IDiagnosticIssue,
  type IDiagnosticProvider,
} from './diagnostic-types';
import { parseDartFilesInWorkspace } from './dart-file-parser';
import { loadDiagnosticConfig } from './diagnostic-config';
import {
  isInlineSuppressed,
  type IInlineSuppressions,
} from './suppression';

/** Minimum interval between refreshes (ms). */
const MIN_REFRESH_INTERVAL_MS = 5000;

/**
 * Central coordinator for all diagnostic providers.
 * Owns the single DiagnosticCollection and orchestrates refresh cycles.
 */
export class DiagnosticManager implements vscode.Disposable {
  private readonly _collection: vscode.DiagnosticCollection;
  private readonly _providers = new Map<string, IDiagnosticProvider>();
  private readonly _disposables: vscode.Disposable[] = [];
  private _refreshTimer: ReturnType<typeof setTimeout> | undefined;
  private _isRefreshing = false;
  private _lastRefresh = 0;
  /** Last collected issues (for Log Capture integration). */
  private _lastIssues: IDiagnosticIssue[] = [];
  /** Fires after each refresh cycle so views (e.g. the Rules tree) can update. */
  private readonly _onDidRefresh = new vscode.EventEmitter<void>();
  readonly onDidRefresh = this._onDidRefresh.event;

  constructor(
    private readonly _client: DriftApiClient,
    private readonly _schemaIntel: SchemaIntelligence,
    private readonly _queryIntel: QueryIntelligence,
  ) {
    this._collection = vscode.languages.createDiagnosticCollection(
      DIAGNOSTIC_COLLECTION_NAME,
    );
    this._disposables.push(this._collection);
    this._setupListeners();
  }

  /** The underlying VS Code diagnostic collection. */
  get collection(): vscode.DiagnosticCollection {
    return this._collection;
  }

  /** Number of registered providers. */
  get providerCount(): number {
    return this._providers.size;
  }

  /**
   * Register a diagnostic provider.
   * Returns a disposable to unregister the provider.
   */
  registerProvider(provider: IDiagnosticProvider): vscode.Disposable {
    if (this._providers.has(provider.id)) {
      throw new Error(`Provider "${provider.id}" is already registered`);
    }
    this._providers.set(provider.id, provider);

    return {
      dispose: () => {
        this._providers.delete(provider.id);
        provider.dispose();
      },
    };
  }

  /** Get a registered provider by ID. */
  getProvider(id: string): IDiagnosticProvider | undefined {
    return this._providers.get(id);
  }

  /** Get all registered providers. */
  getAllProviders(): IDiagnosticProvider[] {
    return Array.from(this._providers.values());
  }

  /**
   * Trigger a full refresh of all diagnostics.
   * Collects issues from all enabled providers and updates the collection.
   */
  async refresh(): Promise<void> {
    if (this._isRefreshing) {
      return;
    }

    const now = Date.now();
    if (now - this._lastRefresh < MIN_REFRESH_INTERVAL_MS) {
      this._scheduleRefresh(MIN_REFRESH_INTERVAL_MS - (now - this._lastRefresh));
      return;
    }

    this._isRefreshing = true;
    this._lastRefresh = now;

    try {
      const config = loadDiagnosticConfig();
      if (!config.enabled) {
        this._collection.clear();
        this._lastIssues = [];
        return;
      }

      const context = await this._buildContext(config);
      const allIssues: IDiagnosticIssue[] = [];

      const enabledProviders = Array.from(this._providers.values()).filter(
        (p) => config.categories[p.category],
      );

      const results = await Promise.allSettled(
        enabledProviders.map((p) => p.collectDiagnostics(context)),
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          allIssues.push(...result.value);
        }
      }

      this._lastIssues = [...allIssues];
      this._applyDiagnostics(allIssues, config, context.dartFiles);
    } finally {
      this._isRefreshing = false;
      // Notify listeners (Rules tree) that counts may have changed.
      this._onDidRefresh.fire();
    }
  }

  /**
   * Count the last collected issues by diagnostic code. Drives the live counts
   * in the Rules tree. Counts the collected set (pre-suppression) so the view
   * reflects how much each rule actually fires.
   */
  getCollectedCountsByCode(): Map<string, number> {
    const counts = new Map<string, number>();
    for (const issue of this._lastIssues) {
      counts.set(issue.code, (counts.get(issue.code) ?? 0) + 1);
    }
    return counts;
  }

  /** Clear all diagnostics. */
  clear(): void {
    this._collection.clear();
  }

  /**
   * Returns a copy of the last collected issues (for Log Capture session export).
   * Returns empty array when diagnostics are disabled or never run.
   */
  getLastCollectedIssues(): IDiagnosticIssue[] {
    return [...this._lastIssues];
  }

  /**
   * Provide code actions for a diagnostic.
   * Delegates to the appropriate provider based on category.
   */
  provideCodeActions(
    diagnostic: vscode.Diagnostic,
    document: vscode.TextDocument,
  ): vscode.CodeAction[] {
    const codeStr = diagnostic.code;
    if (typeof codeStr !== 'string') {
      return [];
    }

    const codeInfo = DIAGNOSTIC_CODES[codeStr];
    if (!codeInfo) {
      return [];
    }

    const provider = Array.from(this._providers.values()).find(
      (p) => p.category === codeInfo.category,
    );

    const actions: vscode.CodeAction[] = provider?.provideCodeActions
      ? provider.provideCodeActions(diagnostic, document)
      : [];

    // Inline-suppression quick fixes, offered on every advisor diagnostic so a
    // user drowning in findings can silence one column or a whole file in one
    // click instead of editing settings JSON. These insert the
    // `// drift-advisor:ignore[-file]` directives the parser honors.
    const line = diagnostic.range.start.line;
    const ignoreColumn = new vscode.CodeAction(
      `Ignore "${codeStr}" for this column`,
      vscode.CodeActionKind.QuickFix,
    );
    ignoreColumn.command = {
      command: 'driftViewer.suppressDiagnosticInColumn',
      title: 'Ignore for this column',
      arguments: [{ uri: document.uri.toString(), line, code: codeStr }],
    };
    actions.push(ignoreColumn);

    const ignoreFile = new vscode.CodeAction(
      `Ignore "${codeStr}" in this file`,
      vscode.CodeActionKind.QuickFix,
    );
    ignoreFile.command = {
      command: 'driftViewer.suppressDiagnosticInFile',
      title: 'Ignore in this file',
      arguments: [{ uri: document.uri.toString(), code: codeStr }],
    };
    actions.push(ignoreFile);

    return actions;
  }

  private _applyDiagnostics(
    issues: IDiagnosticIssue[],
    config: IDiagnosticConfig,
    dartFiles: IDartFileInfo[],
  ): void {
    const byFile = new Map<string, vscode.Diagnostic[]>();

    // Index inline-suppression directives by file URI so an issue can be
    // checked against the `// drift-advisor:ignore[-file]` comments in its own
    // source file. Built once per refresh rather than per issue.
    const suppressionsByUri = new Map<string, IInlineSuppressions>();
    for (const file of dartFiles) {
      suppressionsByUri.set(file.uri.toString(), file.suppressions);
    }

    for (const issue of issues) {
      // Skip disabled rules
      if (config.disabledRules.has(issue.code)) {
        continue;
      }

      // Skip inline-suppressed issues (file-level or field-level directives in
      // the source). Field-level matches on the diagnostic's pinned line, which
      // is the column getter / table class line the providers anchor to.
      const supps = suppressionsByUri.get(issue.fileUri.toString());
      if (
        supps &&
        isInlineSuppressed(supps, issue.code, issue.range.start.line)
      ) {
        continue;
      }

      // Skip per-table exclusions. Most providers set data.tableName, but the
      // runtime event converter emits data.table; accept either so runtime/query
      // diagnostics are actually suppressible (they previously never matched
      // because only `tableName` was read). See plans/full-codebase-audit-2026.06.12.md M12.
      const tableName = issue.data?.tableName ?? issue.data?.table;
      if (typeof tableName === 'string') {
        const excludedTables = config.tableExclusions.get(issue.code);
        if (excludedTables?.has(tableName)) {
          continue;
        }

        // Per-column exclusion: finer than the table check above. Suppress a
        // rule on a single `table.column` (e.g. a column expected to be mostly
        // NULL) while leaving the rest of the table reporting. Only applies to
        // column-scoped diagnostics that carry data.column.
        const columnName = issue.data?.column;
        if (typeof columnName === 'string') {
          const excludedColumns = config.columnExclusions.get(issue.code);
          if (excludedColumns?.has(`${tableName}.${columnName}`)) {
            continue;
          }
        }
      }

      const codeInfo = DIAGNOSTIC_CODES[issue.code];
      if (!codeInfo) {
        continue;
      }

      const overrideSeverity = config.severityOverrides[issue.code];
      const severity =
        overrideSeverity ?? issue.severity ?? codeInfo.defaultSeverity;

      const prefixedMessage = `${DIAGNOSTIC_PREFIX} ${issue.message}`;

      const diag = new vscode.Diagnostic(issue.range, prefixedMessage, severity);
      diag.source = DIAGNOSTIC_SOURCE;
      diag.code = issue.code;

      if (issue.relatedInfo) {
        diag.relatedInformation = issue.relatedInfo;
      }

      const key = issue.fileUri.toString();
      const list = byFile.get(key) ?? [];
      list.push(diag);
      byFile.set(key, list);
    }

    this._collection.clear();
    byFile.forEach((diags, uri) => {
      this._collection.set(vscode.Uri.parse(uri), diags);
    });
  }

  private async _buildContext(
    config: IDiagnosticConfig,
  ): Promise<IDiagnosticContext> {
    const dartFiles = await parseDartFilesInWorkspace();

    return {
      client: this._client,
      schemaIntel: this._schemaIntel,
      queryIntel: this._queryIntel,
      dartFiles,
      config,
    };
  }

  private _setupListeners(): void {
    this._disposables.push(
      vscode.workspace.onDidSaveTextDocument((doc) => {
        const config = loadDiagnosticConfig();
        if (config.refreshOnSave && doc.languageId === 'dart') {
          this._scheduleRefresh(MIN_REFRESH_INTERVAL_MS);
        }
      }),
    );

    this._disposables.push(
      this._schemaIntel.onDidChange(() => {
        this._scheduleRefresh(MIN_REFRESH_INTERVAL_MS);
      }),
    );

    this._disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('driftViewer.diagnostics')) {
          this.refresh();
        }
      }),
    );
  }

  private _scheduleRefresh(delayMs: number): void {
    if (this._refreshTimer) {
      clearTimeout(this._refreshTimer);
    }
    this._refreshTimer = setTimeout(() => {
      this._refreshTimer = undefined;
      this.refresh();
    }, delayMs);
  }

  dispose(): void {
    if (this._refreshTimer) {
      clearTimeout(this._refreshTimer);
    }
    this._providers.forEach((p) => p.dispose());
    this._providers.clear();
    this._onDidRefresh.dispose();
    for (const d of this._disposables) {
      d.dispose();
    }
  }
}

export { DiagnosticCodeActionProvider } from './code-action-provider';
