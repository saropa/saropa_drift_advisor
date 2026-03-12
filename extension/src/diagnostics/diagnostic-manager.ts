import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import type { SchemaIntelligence } from '../engines/schema-intelligence';
import type { QueryIntelligence } from '../engines/query-intelligence';
import { parseDartTables } from '../schema-diff/dart-parser';
import { DIAGNOSTIC_CODES } from './diagnostic-codes';
import {
  DEFAULT_DIAGNOSTIC_CONFIG,
  DIAGNOSTIC_COLLECTION_NAME,
  DIAGNOSTIC_PREFIX,
  type DiagnosticCategory,
  type IDartFileInfo,
  type IDiagnosticConfig,
  type IDiagnosticContext,
  type IDiagnosticIssue,
  type IDiagnosticProvider,
} from './diagnostic-types';

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
      const config = this._loadConfig();
      if (!config.enabled) {
        this._collection.clear();
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

      this._applyDiagnostics(allIssues, config);
    } finally {
      this._isRefreshing = false;
    }
  }

  /** Clear all diagnostics. */
  clear(): void {
    this._collection.clear();
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

    if (provider?.provideCodeActions) {
      return provider.provideCodeActions(diagnostic, document);
    }

    return [];
  }

  private _applyDiagnostics(
    issues: IDiagnosticIssue[],
    config: IDiagnosticConfig,
  ): void {
    const byFile = new Map<string, vscode.Diagnostic[]>();

    for (const issue of issues) {
      // Skip disabled rules
      if (config.disabledRules.has(issue.code)) {
        continue;
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
      diag.source = 'Drift Advisor';
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
    const dartFiles = await this._parseDartFiles();

    return {
      client: this._client,
      schemaIntel: this._schemaIntel,
      queryIntel: this._queryIntel,
      dartFiles,
      config,
    };
  }

  private async _parseDartFiles(): Promise<IDartFileInfo[]> {
    const dartUris = await vscode.workspace.findFiles(
      '**/*.dart',
      '**/build/**',
    );
    const files: IDartFileInfo[] = [];

    for (const uri of dartUris) {
      try {
        const doc = await vscode.workspace.openTextDocument(uri);
        const text = doc.getText();
        const tables = parseDartTables(text, uri.toString());

        if (tables.length > 0) {
          files.push({ uri, text, tables });
        }
      } catch {
        // Skip files that can't be read
      }
    }

    return files;
  }

  private _loadConfig(): IDiagnosticConfig {
    const cfg = vscode.workspace.getConfiguration('driftViewer.diagnostics');

    const categories: Record<DiagnosticCategory, boolean> = {
      schema: cfg.get('categories.schema', DEFAULT_DIAGNOSTIC_CONFIG.categories.schema),
      performance: cfg.get('categories.performance', DEFAULT_DIAGNOSTIC_CONFIG.categories.performance),
      dataQuality: cfg.get('categories.dataQuality', DEFAULT_DIAGNOSTIC_CONFIG.categories.dataQuality),
      bestPractices: cfg.get('categories.bestPractices', DEFAULT_DIAGNOSTIC_CONFIG.categories.bestPractices),
      naming: cfg.get('categories.naming', DEFAULT_DIAGNOSTIC_CONFIG.categories.naming),
      runtime: cfg.get('categories.runtime', DEFAULT_DIAGNOSTIC_CONFIG.categories.runtime),
    };

    const severityOverrides: Record<string, vscode.DiagnosticSeverity> = {};
    const overridesRaw = cfg.get<Record<string, string>>('severityOverrides', {});
    for (const [code, sev] of Object.entries(overridesRaw)) {
      severityOverrides[code] = this._parseSeverity(sev);
    }

    const disabledRulesArray = cfg.get<string[]>('disabledRules', []);
    const disabledRules = new Set(disabledRulesArray);

    return {
      enabled: cfg.get('enabled', DEFAULT_DIAGNOSTIC_CONFIG.enabled),
      refreshOnSave: cfg.get('refreshOnSave', DEFAULT_DIAGNOSTIC_CONFIG.refreshOnSave),
      refreshIntervalMs: cfg.get('refreshIntervalMs', DEFAULT_DIAGNOSTIC_CONFIG.refreshIntervalMs),
      categories,
      severityOverrides,
      disabledRules,
    };
  }

  private _parseSeverity(sev: string): vscode.DiagnosticSeverity {
    switch (sev.toLowerCase()) {
      case 'error':
        return vscode.DiagnosticSeverity.Error;
      case 'warning':
        return vscode.DiagnosticSeverity.Warning;
      case 'information':
      case 'info':
        return vscode.DiagnosticSeverity.Information;
      case 'hint':
        return vscode.DiagnosticSeverity.Hint;
      default:
        return vscode.DiagnosticSeverity.Warning;
    }
  }

  private _setupListeners(): void {
    this._disposables.push(
      vscode.workspace.onDidSaveTextDocument((doc) => {
        const config = this._loadConfig();
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
    for (const d of this._disposables) {
      d.dispose();
    }
  }
}

/**
 * Code action provider that delegates to registered diagnostic providers.
 */
export class DiagnosticCodeActionProvider implements vscode.CodeActionProvider {
  constructor(private readonly _manager: DiagnosticManager) {}

  provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];

    for (const diag of context.diagnostics) {
      if (diag.source !== 'Drift Advisor') {
        continue;
      }
      const providerActions = this._manager.provideCodeActions(diag, document);
      for (const action of providerActions) {
        action.diagnostics = [diag];
        actions.push(action);
      }
    }

    return actions;
  }
}
