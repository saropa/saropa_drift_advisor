/**
 * Schema diagnostic provider.
 * Reports schema quality: FK indexes, orphaned FKs, Dart/DB drift, PK issues.
 * Checker logic lives in diagnostics/checkers/.
 */

import * as vscode from 'vscode';
import type { TableMetadata } from '../../api-types';
import type {
  DiagnosticCategory,
  IDartFileInfo,
  IDiagnosticContext,
  IDiagnosticIssue,
  IDiagnosticProvider,
} from '../diagnostic-types';
import { checkAnomalies } from '../checkers/anomaly-checker';
import { checkColumnDrift } from '../checkers/column-checker';
import { checkMissingIndexes } from '../checkers/index-checker';
import { checkMissingPrimaryKey, checkTextPrimaryKey } from '../checkers/pk-checker';
import { checkExtraTablesInDb, checkMissingTableInDb } from '../checkers/table-checker';

export class SchemaProvider implements IDiagnosticProvider {
  readonly id = 'schema';
  readonly category: DiagnosticCategory = 'schema';

  async collectDiagnostics(ctx: IDiagnosticContext): Promise<IDiagnosticIssue[]> {
    const issues: IDiagnosticIssue[] = [];

    try {
      const [insights, dbSchema] = await Promise.all([
        ctx.schemaIntel.getInsights(),
        ctx.client.schemaMetadata(),
      ]);

      const dbTableMap = new Map<string, TableMetadata>();
      for (const t of dbSchema) {
        if (!t.name.startsWith('sqlite_')) {
          dbTableMap.set(t.name, t);
        }
      }

      for (const file of ctx.dartFiles) {
        for (const dartTable of file.tables) {
          const dbTable = dbTableMap.get(dartTable.sqlTableName);

          checkMissingTableInDb(issues, file, dartTable, dbTable);
          checkMissingPrimaryKey(issues, file, dartTable, dbTable);
          checkColumnDrift(issues, file, dartTable, dbTable);
          checkTextPrimaryKey(issues, file, dartTable, dbTable);
        }
      }

      checkMissingIndexes(issues, insights.missingIndexes, ctx.dartFiles);
      checkAnomalies(issues, insights.anomalies, ctx.dartFiles);
      checkExtraTablesInDb(issues, dbTableMap, ctx.dartFiles);
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

    // All three index-suggestion codes share a Copy quick-fix action
    if (
      (code === 'missing-fk-index' ||
        code === 'missing-id-index' ||
        code === 'missing-datetime-index') &&
      diag.relatedInformation?.[0]
    ) {
      const sql = diag.relatedInformation[0].message.replace(/^Suggested: /, '');

      const copyAction = new vscode.CodeAction(
        'Copy CREATE INDEX SQL',
        vscode.CodeActionKind.QuickFix,
      );
      copyAction.command = {
        command: 'driftViewer.copySuggestedSql',
        title: 'Copy SQL',
        arguments: [sql],
      };
      copyAction.isPreferred = true;
      actions.push(copyAction);
    }

    if (
      code === 'missing-table-in-db' ||
      code === 'missing-column-in-db' ||
      code === 'column-type-drift'
    ) {
      const migrationAction = new vscode.CodeAction(
        'Generate Migration',
        vscode.CodeActionKind.QuickFix,
      );
      migrationAction.command = {
        command: 'driftViewer.generateMigration',
        title: 'Generate Migration',
      };
      actions.push(migrationAction);

      const diffAction = new vscode.CodeAction(
        'View Schema Diff',
        vscode.CodeActionKind.QuickFix,
      );
      diffAction.command = {
        command: 'driftViewer.schemaDiff',
        title: 'Schema Diff',
      };
      actions.push(diffAction);
    }

    if (code === 'orphaned-fk') {
      const viewAction = new vscode.CodeAction(
        'View in Anomaly Panel',
        vscode.CodeActionKind.QuickFix,
      );
      viewAction.command = {
        command: 'driftViewer.showAnomalies',
        title: 'Show Anomalies',
      };
      actions.push(viewAction);
    }

    return actions;
  }

  dispose(): void {}
}
