import * as vscode from 'vscode';
import type {
  DiagnosticCategory,
  IDiagnosticContext,
  IDiagnosticIssue,
  IDiagnosticProvider,
} from '../diagnostic-types';
import { checkDataSkew, checkHighNullRates } from './data-quality-checks';

/**
 * Data quality diagnostic provider.
 * Reports data quality issues including:
 * - High null rates in columns
 * - Data skew (one table dominates row count)
 * - Statistical outliers
 *
 * The check logic (SQL probing, false-positive suppression) lives in
 * data-quality-checks.ts; this class is the VS Code provider wiring.
 */
export class DataQualityProvider implements IDiagnosticProvider {
  readonly id = 'dataQuality';
  readonly category: DiagnosticCategory = 'dataQuality';

  async collectDiagnostics(ctx: IDiagnosticContext): Promise<IDiagnosticIssue[]> {
    const issues: IDiagnosticIssue[] = [];

    try {
      const [tables, sizeAnalytics] = await Promise.all([
        ctx.client.schemaMetadata(),
        ctx.client.sizeAnalytics(),
      ]);

      const userTables = tables.filter((t) => !t.name.startsWith('sqlite_'));

      checkDataSkew(issues, sizeAnalytics, ctx.dartFiles);
      await checkHighNullRates(issues, userTables, ctx);
    } catch {
      // Server unreachable or other error - return empty
    }

    return issues;
  }

  provideCodeActions(
    diag: vscode.Diagnostic,
    _doc: vscode.TextDocument,
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];
    const code = diag.code as string;

    // Let users disable any data-quality rule straight from the lightbulb,
    // matching naming/best-practice/runtime/compliance providers. Previously
    // these codes had no "Disable rule" action, forcing a manual settings edit.
    const disableAction = new vscode.CodeAction(
      `Disable "${code}" rule`,
      vscode.CodeActionKind.QuickFix,
    );
    disableAction.command = {
      command: 'driftViewer.disableDiagnosticRule',
      title: 'Disable Rule',
      arguments: [code],
    };
    actions.push(disableAction);

    if (code === 'high-null-rate' || code === 'unused-column') {
      const data = (diag as any).data;
      if (data?.table && data?.column) {
        const profileAction = new vscode.CodeAction(
          'Profile Column',
          vscode.CodeActionKind.QuickFix,
        );
        profileAction.command = {
          command: 'driftViewer.profileColumn',
          title: 'Profile Column',
          arguments: [{ table: data.table, column: data.column }],
        };
        actions.push(profileAction);
      }
    }

    if (code === 'data-skew') {
      const sizeAction = new vscode.CodeAction(
        'View Size Analytics',
        vscode.CodeActionKind.QuickFix,
      );
      sizeAction.command = {
        command: 'driftViewer.sizeAnalytics',
        title: 'Size Analytics',
      };
      actions.push(sizeAction);
    }

    return actions;
  }

  dispose(): void {}
}
