import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import type { SchemaIntelligence } from '../engines/schema-intelligence';
import type { QueryIntelligence } from '../engines/query-intelligence';
import { DIAGNOSTIC_CODES } from './diagnostic-codes';
import {
  DIAGNOSTIC_COLLECTION_NAME,
  type IDiagnosticConfig,
  type IDiagnosticContext,
  type IDiagnosticIssue,
  type IDiagnosticProvider,
} from './diagnostic-types';
import { parseDartFilesInWorkspace } from './dart-file-parser';
import { loadDiagnosticConfig } from './diagnostic-config';
import {
  buildDiagnosticsByFile,
  buildSuppressionQuickFixes,
} from './diagnostic-apply';

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
      // Global monitoring kill switch: refuse to collect OR keep any issue
      // while it is engaged, whoever the caller is (connect handler, heavy
      // sweep, generation watcher). Checking here — the single choke point
      // for this collection — is what makes the plan's "zero vscode.Diagnostic
      // emissions" guarantee hold without gating every call site.
      const killSwitchOn = vscode.workspace
        .getConfiguration('driftViewer')
        .get<boolean>('enableMonitoringAndLogging', true) === false;
      const config = loadDiagnosticConfig();
      if (!config.enabled || killSwitchOn) {
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

    actions.push(
      ...buildSuppressionQuickFixes(document, diagnostic, codeStr),
    );

    return actions;
  }

  private _applyDiagnostics(
    issues: IDiagnosticIssue[],
    config: IDiagnosticConfig,
    dartFiles: IDiagnosticContext['dartFiles'],
  ): void {
    const byFile = buildDiagnosticsByFile(issues, config, dartFiles);

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
