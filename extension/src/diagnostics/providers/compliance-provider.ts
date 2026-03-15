/**
 * Compliance diagnostic provider.
 * Evaluates user-defined schema rules from `.drift-rules.json`
 * and reports violations as VS Code diagnostics on Dart table files.
 */

import * as vscode from 'vscode';
import { ComplianceChecker } from '../../compliance/compliance-checker';
import { ComplianceConfigLoader } from '../../compliance/compliance-config';
import type {
  ComplianceSeverity,
  IComplianceViolation,
} from '../../compliance/compliance-types';
import type {
  DiagnosticCategory,
  IDiagnosticContext,
  IDiagnosticIssue,
  IDiagnosticProvider,
} from '../diagnostic-types';
import { findDartFileForTable } from '../utils/dart-file-utils';

export class ComplianceProvider implements IDiagnosticProvider {
  readonly id = 'compliance';
  readonly category: DiagnosticCategory = 'compliance';

  private readonly _checker = new ComplianceChecker();
  private readonly _configLoader: ComplianceConfigLoader;

  constructor(onConfigChange?: () => void) {
    this._configLoader = new ComplianceConfigLoader();

    if (onConfigChange) {
      this._configLoader.onDidChangeConfig(() => onConfigChange());
    }
  }

  async collectDiagnostics(
    ctx: IDiagnosticContext,
  ): Promise<IDiagnosticIssue[]> {
    const config = await this._configLoader.load();
    if (!config) {
      return [];
    }

    try {
      const [dbSchema, diagram] = await Promise.all([
        ctx.client.schemaMetadata(),
        ctx.client.schemaDiagram(),
      ]);

      const dartTables = ctx.dartFiles.flatMap((f) => f.tables);

      const violations = this._checker.check(
        config,
        dbSchema,
        diagram.foreignKeys,
        dartTables.length > 0 ? dartTables : undefined,
      );

      return this._mapViolationsToIssues(violations, ctx);
    } catch {
      return [];
    }
  }

  provideCodeActions(
    diag: vscode.Diagnostic,
    _doc: vscode.TextDocument,
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];
    const code = diag.code as string;

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

    const openConfigAction = new vscode.CodeAction(
      'Edit .drift-rules.json',
      vscode.CodeActionKind.QuickFix,
    );
    openConfigAction.command = {
      command: 'driftViewer.openComplianceConfig',
      title: 'Edit Config',
    };
    actions.push(openConfigAction);

    return actions;
  }

  dispose(): void {
    this._configLoader.dispose();
  }

  private _mapViolationsToIssues(
    violations: IComplianceViolation[],
    ctx: IDiagnosticContext,
  ): IDiagnosticIssue[] {
    const issues: IDiagnosticIssue[] = [];

    for (const v of violations) {
      const dartFile = findDartFileForTable(ctx.dartFiles, v.table);
      if (!dartFile) continue;

      const dartTable = dartFile.tables.find(
        (t) => t.sqlTableName.toLowerCase() === v.table.toLowerCase(),
      );
      if (!dartTable) continue;

      let line = dartTable.line;
      if (v.column) {
        const dartCol = dartTable.columns.find(
          (c) => c.sqlName.toLowerCase() === v.column!.toLowerCase(),
        );
        if (dartCol && dartCol.line >= 0) {
          line = dartCol.line;
        }
      }

      issues.push({
        code: v.rule,
        message: v.message,
        fileUri: dartFile.uri,
        range: new vscode.Range(line, 0, line, 999),
        severity: mapSeverity(v.severity),
      });
    }

    return issues;
  }
}

function mapSeverity(sev: ComplianceSeverity): vscode.DiagnosticSeverity {
  switch (sev) {
    case 'error':
      return vscode.DiagnosticSeverity.Error;
    case 'warning':
      return vscode.DiagnosticSeverity.Warning;
    case 'info':
      return vscode.DiagnosticSeverity.Information;
  }
}
