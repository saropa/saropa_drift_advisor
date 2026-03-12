import * as vscode from 'vscode';
import { isSqlReservedWord, isSnakeCase } from '../diagnostic-codes';
import type {
  DiagnosticCategory,
  IDartFileInfo,
  IDiagnosticContext,
  IDiagnosticIssue,
  IDiagnosticProvider,
} from '../diagnostic-types';

/**
 * Naming convention diagnostic provider.
 * Reports naming issues including:
 * - Table names not following snake_case
 * - Column names not following snake_case
 * - SQL reserved words used as identifiers
 * - Dart getter/SQL name mismatches
 */
export class NamingProvider implements IDiagnosticProvider {
  readonly id = 'naming';
  readonly category: DiagnosticCategory = 'naming';

  async collectDiagnostics(ctx: IDiagnosticContext): Promise<IDiagnosticIssue[]> {
    const issues: IDiagnosticIssue[] = [];

    for (const file of ctx.dartFiles) {
      for (const dartTable of file.tables) {
        this._checkTableNaming(issues, file, dartTable);

        for (const dartCol of dartTable.columns) {
          this._checkColumnNaming(issues, file, dartTable, dartCol);
        }
      }
    }

    return issues;
  }

  provideCodeActions(
    diag: vscode.Diagnostic,
    _doc: vscode.TextDocument,
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];
    const code = diag.code as string;

    // Add "Disable this rule" action
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

    if (code === 'table-name-case' || code === 'column-name-case') {
      const data = (diag as any).data;
      if (data?.suggested) {
        const renameAction = new vscode.CodeAction(
          `Copy suggested name: "${data.suggested}"`,
          vscode.CodeActionKind.QuickFix,
        );
        renameAction.command = {
          command: 'driftViewer.copySuggestedName',
          title: 'Copy suggested name',
          arguments: [data.suggested],
        };
        renameAction.isPreferred = true;
        actions.push(renameAction);
      }
    }

    if (code === 'reserved-word') {
      const docsAction = new vscode.CodeAction(
        'View SQLite Reserved Words',
        vscode.CodeActionKind.QuickFix,
      );
      docsAction.command = {
        command: 'vscode.open',
        title: 'Open Documentation',
        arguments: [vscode.Uri.parse('https://www.sqlite.org/lang_keywords.html')],
      };
      actions.push(docsAction);
    }

    return actions;
  }

  dispose(): void {}

  private _checkTableNaming(
    issues: IDiagnosticIssue[],
    file: IDartFileInfo,
    dartTable: { sqlTableName: string; line: number },
  ): void {
    const tableName = dartTable.sqlTableName;

    if (!isSnakeCase(tableName)) {
      const suggested = this._toSnakeCase(tableName);
      issues.push({
        code: 'table-name-case',
        message: `Table "${tableName}" doesn't follow snake_case convention`,
        fileUri: file.uri,
        range: new vscode.Range(dartTable.line, 0, dartTable.line, 999),
        severity: vscode.DiagnosticSeverity.Hint,
        data: { current: tableName, suggested },
      });
    }

    if (isSqlReservedWord(tableName)) {
      issues.push({
        code: 'reserved-word',
        message: `Table "${tableName}" uses SQL reserved word`,
        fileUri: file.uri,
        range: new vscode.Range(dartTable.line, 0, dartTable.line, 999),
        severity: vscode.DiagnosticSeverity.Warning,
      });
    }
  }

  private _checkColumnNaming(
    issues: IDiagnosticIssue[],
    file: IDartFileInfo,
    dartTable: { sqlTableName: string; line: number },
    dartCol: { sqlName: string; dartName: string; line: number },
  ): void {
    const colName = dartCol.sqlName;
    const line = dartCol.line >= 0 ? dartCol.line : dartTable.line;

    if (!isSnakeCase(colName)) {
      const suggested = this._toSnakeCase(colName);
      issues.push({
        code: 'column-name-case',
        message: `Column "${dartTable.sqlTableName}.${colName}" doesn't follow snake_case convention`,
        fileUri: file.uri,
        range: new vscode.Range(line, 0, line, 999),
        severity: vscode.DiagnosticSeverity.Hint,
        data: { current: colName, suggested },
      });
    }

    if (isSqlReservedWord(colName)) {
      issues.push({
        code: 'reserved-word',
        message: `Column "${dartTable.sqlTableName}.${colName}" uses SQL reserved word`,
        fileUri: file.uri,
        range: new vscode.Range(line, 0, line, 999),
        severity: vscode.DiagnosticSeverity.Warning,
      });
    }

    const expectedSqlName = this._toSnakeCase(dartCol.dartName);
    if (colName !== expectedSqlName && colName !== dartCol.dartName) {
      issues.push({
        code: 'getter-table-mismatch',
        message: `Dart getter "${dartCol.dartName}" maps to unexpected SQL name "${colName}"`,
        fileUri: file.uri,
        range: new vscode.Range(line, 0, line, 999),
        severity: vscode.DiagnosticSeverity.Information,
      });
    }
  }

  private _toSnakeCase(name: string): string {
    return name
      .replace(/([A-Z])/g, '_$1')
      .toLowerCase()
      .replace(/^_/, '')
      .replace(/__+/g, '_');
  }
}
