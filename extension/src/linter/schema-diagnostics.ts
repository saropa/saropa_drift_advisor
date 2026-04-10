import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import { DIAGNOSTIC_SOURCE } from '../diagnostics/diagnostic-types';
import {
  type DartFileInfo,
  mapIssuesToDiagnostics,
  mergeServerIssues,
} from './issue-mapper';

/** Minimum interval between refreshes (ms). */
const DEBOUNCE_MS = 5_000;

/**
 * Fetches schema issues from the debug server and maps them to
 * VS Code diagnostics on Dart table/column definitions.
 */
export class SchemaDiagnostics {
  private _lastRefresh = 0;
  private _pending = false;

  constructor(
    private readonly _client: DriftApiClient,
    private readonly _diagnostics: vscode.DiagnosticCollection,
  ) {}

  /** Trigger a debounced refresh of diagnostics. */
  async refresh(): Promise<void> {
    const now = Date.now();
    if (now - this._lastRefresh < DEBOUNCE_MS) {
      if (!this._pending) {
        this._pending = true;
        const delay = DEBOUNCE_MS - (now - this._lastRefresh);
        setTimeout(() => {
          this._pending = false;
          this.refresh();
        }, delay);
      }
      return;
    }
    this._lastRefresh = now;

    const cfg = vscode.workspace.getConfiguration('driftViewer');
    if (!cfg.get<boolean>('linter.enabled', true)) {
      this._diagnostics.clear();
      return;
    }

    try {
      const [suggestions, anomalies] = await Promise.all([
        this._client.indexSuggestions(),
        this._client.anomalies(),
      ]);

      const issues = mergeServerIssues(suggestions, anomalies);
      if (issues.length === 0) {
        this._diagnostics.clear();
        return;
      }

      const dartUris = await vscode.workspace.findFiles(
        '**/*.dart',
        '**/build/**',
      );
      const dartFiles: DartFileInfo[] = [];
      for (const uri of dartUris) {
        const doc = await vscode.workspace.openTextDocument(uri);
        dartFiles.push({ uri, text: doc.getText() });
      }

      const anomalySeverity = cfg.get<string>(
        'linter.anomalySeverity',
        'warning',
      );
      const mapped = mapIssuesToDiagnostics(
        issues,
        dartFiles,
        anomalySeverity,
      );

      this._diagnostics.clear();
      for (const [uriStr, diags] of mapped) {
        this._diagnostics.set(vscode.Uri.parse(uriStr), diags);
      }
    } catch {
      // Server unreachable — clear stale diagnostics
      this._diagnostics.clear();
    }
  }

  /** Clear all diagnostics (e.g. on server disconnect). */
  clear(): void {
    this._diagnostics.clear();
  }
}

/**
 * Provides quick-fix code actions for Drift diagnostics:
 * - "Copy CREATE INDEX SQL" for index suggestions
 * - "Generate Migration" for schema issues
 */
export class DriftCodeActionProvider implements vscode.CodeActionProvider {
  provideCodeActions(
    _document: vscode.TextDocument,
    _range: vscode.Range,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];
    let hasSchemaIssue = false;

    for (const diag of context.diagnostics) {
      if (diag.source !== DIAGNOSTIC_SOURCE) continue;

      if (diag.code === 'index-suggestion' && diag.relatedInformation?.[0]) {
        const sql = diag.relatedInformation[0].message.replace(
          /^Suggested fix: /,
          '',
        );

        const copyAction = new vscode.CodeAction(
          'Copy CREATE INDEX SQL',
          vscode.CodeActionKind.QuickFix,
        );
        copyAction.command = {
          command: 'driftViewer.copySuggestedSql',
          title: 'Copy SQL',
          arguments: [sql],
        };
        copyAction.diagnostics = [diag];
        copyAction.isPreferred = true;
        actions.push(copyAction);
      }

      if (diag.code === 'anomaly') {
        hasSchemaIssue = true;

        const viewAction = new vscode.CodeAction(
          'View in Anomaly Panel',
          vscode.CodeActionKind.QuickFix,
        );
        viewAction.command = {
          command: 'driftViewer.showAnomalies',
          title: 'Show Anomalies',
        };
        viewAction.diagnostics = [diag];
        actions.push(viewAction);
      }
    }

    if (hasSchemaIssue || actions.length > 0) {
      const migrationAction = new vscode.CodeAction(
        'Generate Migration Code',
        vscode.CodeActionKind.RefactorRewrite,
      );
      migrationAction.command = {
        command: 'driftViewer.generateMigration',
        title: 'Generate Migration',
      };
      actions.push(migrationAction);

      const schemaDiffAction = new vscode.CodeAction(
        'View Schema Diff',
        vscode.CodeActionKind.Empty,
      );
      schemaDiffAction.command = {
        command: 'driftViewer.schemaDiff',
        title: 'Schema Diff',
      };
      actions.push(schemaDiffAction);
    }

    return actions;
  }
}
