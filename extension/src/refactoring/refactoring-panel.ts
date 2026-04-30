/**
 * Webview panel for schema refactoring suggestions (Feature 66).
 *
 * Runs the analyzer against the connected [DriftApiClient], renders results in
 * a lightweight HTML UI, and supports copy-to-clipboard for generated plans.
 * Never executes generated SQL against the database.
 *
 * Phase 3: persists a short session summary for the health score panel, deep-links
 * migration preview (append advisory SQL), ER diagram (table focus), and NL-SQL
 * with a pre-filled question.
 */

import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import type { TableMetadata } from '../api-types';
import { buildAdvisorSession, writeAdvisorSession } from './refactoring-advisor-state';
import { buildNlSqlSeedFromSuggestion } from './refactoring-nl-bridge';
import { RefactoringAnalyzer } from './refactoring-analyzer';
import { MigrationPlanBuilder } from './refactoring-plan-builder';
import { getRefactoringHtml } from './refactoring-html';
import type { IRefactoringSuggestion, IMigrationPlan } from './refactoring-types';

/**
 * Opens or focuses the singleton refactoring panel.
 */
export class RefactoringPanel implements vscode.Disposable {
  static current: RefactoringPanel | undefined;

  /**
   * Opens the panel (or focuses it) and posts an external hint banner so other
   * features (e.g. future AI schema review) can steer the user before a full analyze.
   */
  static openWithExternalHint(
    context: vscode.ExtensionContext,
    client: DriftApiClient,
    hint: { title?: string; description?: string; table?: string; column?: string },
  ): void {
    const hadPanel = RefactoringPanel.current !== undefined;
    RefactoringPanel.createOrShow(context, client);
    const inst = RefactoringPanel.current;
    if (!inst) return;
    inst._panel.reveal(vscode.ViewColumn.Active);
    const delayMs = hadPanel ? 50 : 300;
    setTimeout(() => inst.notifyExternalHint(hint), delayMs);
  }

  private readonly _panel: vscode.WebviewPanel;
  private readonly _disposables: vscode.Disposable[] = [];
  private _disposed = false;
  private readonly _client: DriftApiClient;
  private readonly _workspaceState: vscode.Memento;
  private readonly _planBuilder = new MigrationPlanBuilder();
  private _tablesMeta: TableMetadata[] = [];
  /** Stable order from the last successful analyze (for advisor session titles). */
  private _lastAnalyzeOrder: IRefactoringSuggestion[] = [];
  private _dismissedIds = new Set<string>();
  private _suggestionsById = new Map<string, IRefactoringSuggestion>();
  private _planCache = new Map<string, IMigrationPlan>();

  /**
   * Pushes an external hint into the webview (title/body from another tool or command).
   */
  notifyExternalHint(hint: {
    title?: string;
    description?: string;
    table?: string;
    column?: string;
  }): void {
    this._post({
      command: 'externalHint',
      title: hint.title ?? 'External schema hint',
      description: hint.description ?? '',
      table: hint.table ?? '',
      column: hint.column ?? '',
    });
  }

  static createOrShow(context: vscode.ExtensionContext, client: DriftApiClient): void {
    if (RefactoringPanel.current) {
      RefactoringPanel.current._panel.reveal(vscode.ViewColumn.Active);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'driftRefactoring',
      'Schema refactoring',
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    const instance = new RefactoringPanel(panel, client, context.workspaceState);
    RefactoringPanel.current = instance;
    context.subscriptions.push(instance);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    client: DriftApiClient,
    workspaceState: vscode.Memento,
  ) {
    this._panel = panel;
    this._client = client;
    this._workspaceState = workspaceState;
    this._panel.webview.html = getRefactoringHtml();
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage(
      (msg) => {
        void this._handleMessage(msg as Record<string, unknown>);
      },
      null,
      this._disposables,
    );
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    RefactoringPanel.current = undefined;
    this._panel.dispose();
    for (const d of this._disposables) d.dispose();
    this._disposables.length = 0;
  }

  private _post(message: unknown): void {
    if (!this._disposed) {
      void this._panel.webview.postMessage(message);
    }
  }

  /** Writes workspace state consumed by the health score panel (Phase 3). */
  private _persistAdvisorSession(): void {
    void writeAdvisorSession(
      this._workspaceState,
      buildAdvisorSession(
        this._tablesMeta.length,
        this._lastAnalyzeOrder,
        this._dismissedIds.size,
      ),
    );
  }

  private async _handleMessage(msg: Record<string, unknown>): Promise<void> {
    const cmd = String(msg.command || '');
    try {
      switch (cmd) {
        case 'analyze':
          await this._runAnalyze();
          break;
        case 'viewPlan':
          await this._viewPlan(String(msg.suggestionId || ''));
          break;
        case 'copySql':
          await this._copySql(String(msg.suggestionId || ''));
          break;
        case 'copyDart':
          await this._copyDart(String(msg.suggestionId || ''));
          break;
        case 'copyDriftTable':
          await this._copyDrift(String(msg.suggestionId || ''));
          break;
        case 'dismiss':
          this._onDismiss(String(msg.suggestionId || ''));
          break;
        case 'openMigrationPreview':
          await vscode.commands.executeCommand('driftViewer.migrationPreview');
          break;
        case 'openMigrationPreviewWithPlan':
          await this._openMigrationPreviewWithPlan(String(msg.suggestionId || ''));
          break;
        case 'openSchemaDiagram':
          await vscode.commands.executeCommand('driftViewer.showErDiagram');
          break;
        case 'openGenerateMigration':
          await vscode.commands.executeCommand('driftViewer.generateMigration');
          break;
        case 'openSchemaDiff':
          await vscode.commands.executeCommand('driftViewer.schemaDiff');
          break;
        case 'openErDiagramFocused':
          await this._openErDiagramFocused(String(msg.suggestionId || ''));
          break;
        case 'openNlSqlPrefilled':
          await this._openNlSqlPrefilled(String(msg.suggestionId || ''));
          break;
        default:
          break;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this._post({ command: 'error', message });
    }
  }

  private _onDismiss(id: string): void {
    if (!id) return;
    this._dismissedIds.add(id);
    this._persistAdvisorSession();
    this._postFilteredSuggestions();
  }

  /** Re-sends suggestions so the webview can drop dismissed rows when extension-authoritative. */
  private _postFilteredSuggestions(): void {
    const visible = this._lastAnalyzeOrder.filter((s) => !this._dismissedIds.has(s.id));
    this._post({
      command: 'suggestions',
      suggestions: visible,
      tableCount: this._tablesMeta.length,
      preserveDismissed: true,
    });
  }

  private async _runAnalyze(): Promise<void> {
    this._post({ command: 'analyzing', tableCount: 0 });
    this._suggestionsById.clear();
    this._planCache.clear();
    this._lastAnalyzeOrder = [];
    this._dismissedIds.clear();
    let tables: TableMetadata[] = [];
    try {
      tables = await this._client.schemaMetadata();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this._post({ command: 'error', message: `Schema metadata failed: ${message}` });
      return;
    }
    this._tablesMeta = tables.filter((t) => !t.name.startsWith('sqlite_'));
    this._post({ command: 'analyzing', tableCount: this._tablesMeta.length });

    const analyzer = new RefactoringAnalyzer(this._client);
    const suggestions = await analyzer.analyze();
    this._lastAnalyzeOrder = suggestions;
    for (const s of suggestions) {
      this._suggestionsById.set(s.id, s);
    }
    if (suggestions.length === 0) {
      this._post({
        command: 'empty',
        reason: 'No refactoring suggestions matched the current heuristics.',
      });
      return;
    }
    this._persistAdvisorSession();
    this._post({
      command: 'suggestions',
      suggestions,
      tableCount: this._tablesMeta.length,
    });
  }

  private _getOrBuildPlan(id: string): IMigrationPlan | undefined {
    const suggestion = this._suggestionsById.get(id);
    if (!suggestion) return undefined;
    const cached = this._planCache.get(id);
    if (cached) return cached;
    const plan = this._planBuilder.buildFor(suggestion, this._tablesMeta);
    this._planCache.set(id, plan);
    return plan;
  }

  private async _viewPlan(id: string): Promise<void> {
    const suggestion = this._suggestionsById.get(id);
    if (!suggestion) {
      this._post({ command: 'error', message: 'Suggestion not found; run Analyze again.' });
      return;
    }
    const plan = this._getOrBuildPlan(id);
    if (!plan) return;
    this._post({ command: 'plan', plan, suggestion });
  }

  private async _maybeConfirmDestructive(plan: IMigrationPlan): Promise<boolean> {
    const destructive = plan.steps.some((s) => s.destructive);
    if (!destructive) return true;
    const choice = await vscode.window.showWarningMessage(
      'This plan includes destructive SQL (for example DROP COLUMN). Copy anyway?',
      { modal: true },
      'Copy',
    );
    return choice === 'Copy';
  }

  private _planSqlSuffix(id: string): string {
    const plan = this._getOrBuildPlan(id);
    if (!plan) return '';
    return plan.steps.map((s) => `-- ${s.title}\n${s.sql}`).join('\n\n');
  }

  private async _openMigrationPreviewWithPlan(id: string): Promise<void> {
    const plan = this._getOrBuildPlan(id);
    if (!plan) {
      void vscode.window.showErrorMessage('No plan available for this suggestion.');
      return;
    }
    if (!(await this._maybeConfirmDestructive(plan))) return;
    const suffix = this._planSqlSuffix(id);
    await vscode.commands.executeCommand('driftViewer.migrationPreview', {
      advisorySqlSuffix: suffix,
    });
  }

  private async _openErDiagramFocused(id: string): Promise<void> {
    const s = this._suggestionsById.get(id);
    const focus = s?.tables[0];
    if (!focus) {
      void vscode.window.showErrorMessage('No table context for this suggestion.');
      return;
    }
    await vscode.commands.executeCommand('driftViewer.showErDiagram', { focusTable: focus });
  }

  private async _openNlSqlPrefilled(id: string): Promise<void> {
    const s = this._suggestionsById.get(id);
    if (!s) {
      void vscode.window.showErrorMessage('Suggestion not found; run Analyze again.');
      return;
    }
    const initialQuestion = buildNlSqlSeedFromSuggestion(s);
    await vscode.commands.executeCommand('driftViewer.askNaturalLanguage', {
      initialQuestion,
    });
  }

  private async _copySql(id: string): Promise<void> {
    const plan = this._getOrBuildPlan(id);
    if (!plan) {
      void vscode.window.showErrorMessage('No plan available; open a migration plan first.');
      return;
    }
    if (!(await this._maybeConfirmDestructive(plan))) return;
    const sql = plan.steps.map((s) => `-- ${s.title}\n${s.sql}`).join('\n\n');
    await vscode.env.clipboard.writeText(sql);
    void vscode.window.showInformationMessage('SQL copied to clipboard.');
  }

  private async _copyDart(id: string): Promise<void> {
    const plan = this._getOrBuildPlan(id);
    if (!plan) {
      void vscode.window.showErrorMessage('No plan available.');
      return;
    }
    await vscode.env.clipboard.writeText(plan.dartCode);
    void vscode.window.showInformationMessage('Dart migration snippet copied.');
  }

  private async _copyDrift(id: string): Promise<void> {
    const plan = this._getOrBuildPlan(id);
    if (!plan) {
      void vscode.window.showErrorMessage('No plan available.');
      return;
    }
    await vscode.env.clipboard.writeText(plan.driftTableClass);
    void vscode.window.showInformationMessage('Drift table snippet copied.');
  }
}
