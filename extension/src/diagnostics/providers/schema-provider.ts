import * as vscode from 'vscode';
import type { Anomaly, ColumnMetadata, IndexSuggestion, TableMetadata } from '../../api-types';
import type { IDartTable } from '../../schema-diff/dart-schema';
import { DART_TO_SQL_TYPE } from '../../schema-diff/dart-schema';
import { isSqlReservedWord, isSnakeCase } from '../diagnostic-codes';
import type {
  DiagnosticCategory,
  IDartFileInfo,
  IDiagnosticContext,
  IDiagnosticIssue,
  IDiagnosticProvider,
} from '../diagnostic-types';

/**
 * Schema diagnostic provider.
 * Reports schema quality issues including:
 * - Missing indexes on FK columns
 * - Orphaned foreign key values
 * - Schema drift (Dart vs database)
 * - Missing primary keys
 * - Type mismatches
 */
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

          this._checkMissingTableInDb(issues, file, dartTable, dbTable);
          this._checkMissingPrimaryKey(issues, file, dartTable, dbTable);
          this._checkColumnDrift(issues, file, dartTable, dbTable);
          this._checkTextPrimaryKey(issues, file, dartTable, dbTable);
        }
      }

      this._checkMissingFkIndexes(issues, insights.missingIndexes, ctx.dartFiles);
      this._checkAnomalies(issues, insights.anomalies, ctx.dartFiles);
      this._checkExtraTablesInDb(issues, dbTableMap, ctx.dartFiles);
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

    if (code === 'missing-fk-index' && diag.relatedInformation?.[0]) {
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
      actions.push(copyAction);

      const runAction = new vscode.CodeAction(
        'Run CREATE INDEX Now',
        vscode.CodeActionKind.QuickFix,
      );
      runAction.command = {
        command: 'driftViewer.runIndexSql',
        title: 'Run SQL',
        arguments: [sql],
      };
      runAction.isPreferred = true;
      actions.push(runAction);
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

  private _checkMissingTableInDb(
    issues: IDiagnosticIssue[],
    file: IDartFileInfo,
    dartTable: IDartTable,
    dbTable: TableMetadata | undefined,
  ): void {
    if (!dbTable) {
      issues.push({
        code: 'missing-table-in-db',
        message: `Table "${dartTable.sqlTableName}" defined in Dart but missing from database`,
        fileUri: file.uri,
        range: new vscode.Range(dartTable.line, 0, dartTable.line, 999),
        severity: vscode.DiagnosticSeverity.Error,
      });
    }
  }

  private _checkMissingPrimaryKey(
    issues: IDiagnosticIssue[],
    file: IDartFileInfo,
    dartTable: IDartTable,
    dbTable: TableMetadata | undefined,
  ): void {
    if (!dbTable) return;

    const hasPkInDart = dartTable.columns.some((c) => c.autoIncrement);
    const hasPkInDb = dbTable.columns.some((c) => c.pk);

    if (!hasPkInDart && !hasPkInDb) {
      issues.push({
        code: 'no-primary-key',
        message: `Table "${dartTable.sqlTableName}" has no primary key`,
        fileUri: file.uri,
        range: new vscode.Range(dartTable.line, 0, dartTable.line, 999),
        severity: vscode.DiagnosticSeverity.Warning,
      });
    }
  }

  private _checkColumnDrift(
    issues: IDiagnosticIssue[],
    file: IDartFileInfo,
    dartTable: IDartTable,
    dbTable: TableMetadata | undefined,
  ): void {
    if (!dbTable) return;

    const dbColMap = new Map<string, ColumnMetadata>();
    for (const col of dbTable.columns) {
      dbColMap.set(col.name, col);
    }

    for (const dartCol of dartTable.columns) {
      const dbCol = dbColMap.get(dartCol.sqlName);
      const line = dartCol.line >= 0 ? dartCol.line : dartTable.line;

      if (!dbCol) {
        issues.push({
          code: 'missing-column-in-db',
          message: `Column "${dartTable.sqlTableName}.${dartCol.sqlName}" defined in Dart but missing from database`,
          fileUri: file.uri,
          range: new vscode.Range(line, 0, line, 999),
          severity: vscode.DiagnosticSeverity.Error,
        });
        continue;
      }

      const expectedType = DART_TO_SQL_TYPE[dartCol.dartType];
      if (expectedType && dbCol.type !== expectedType) {
        issues.push({
          code: 'column-type-drift',
          message: `Column "${dartTable.sqlTableName}.${dartCol.sqlName}" type mismatch: Dart=${expectedType}, DB=${dbCol.type}`,
          fileUri: file.uri,
          range: new vscode.Range(line, 0, line, 999),
          severity: vscode.DiagnosticSeverity.Warning,
        });
      }
    }

    for (const dbCol of dbTable.columns) {
      const dartCol = dartTable.columns.find((c) => c.sqlName === dbCol.name);
      if (!dartCol) {
        issues.push({
          code: 'extra-column-in-db',
          message: `Column "${dartTable.sqlTableName}.${dbCol.name}" exists in database but not in Dart`,
          fileUri: file.uri,
          range: new vscode.Range(dartTable.line, 0, dartTable.line, 999),
          severity: vscode.DiagnosticSeverity.Information,
        });
      }
    }
  }

  private _checkTextPrimaryKey(
    issues: IDiagnosticIssue[],
    file: IDartFileInfo,
    dartTable: IDartTable,
    dbTable: TableMetadata | undefined,
  ): void {
    if (!dbTable) return;

    const pkCol = dbTable.columns.find((c) => c.pk);
    if (pkCol && pkCol.type === 'TEXT') {
      const dartCol = dartTable.columns.find((c) => c.sqlName === pkCol.name);
      const line = dartCol?.line ?? dartTable.line;

      issues.push({
        code: 'text-pk',
        message: `Table "${dartTable.sqlTableName}" uses TEXT primary key (INTEGER recommended for performance)`,
        fileUri: file.uri,
        range: new vscode.Range(line, 0, line, 999),
        severity: vscode.DiagnosticSeverity.Warning,
      });
    }
  }

  private _checkMissingFkIndexes(
    issues: IDiagnosticIssue[],
    suggestions: IndexSuggestion[],
    dartFiles: IDartFileInfo[],
  ): void {
    for (const suggestion of suggestions) {
      const dartFile = this._findDartFile(dartFiles, suggestion.table);
      if (!dartFile) continue;

      const dartTable = dartFile.tables.find(
        (t) => t.sqlTableName === suggestion.table,
      );
      const dartCol = dartTable?.columns.find(
        (c) => c.sqlName === suggestion.column,
      );
      const line = dartCol?.line ?? dartTable?.line ?? 0;

      issues.push({
        code: 'missing-fk-index',
        message: `FK column "${suggestion.table}.${suggestion.column}" lacks an index`,
        fileUri: dartFile.uri,
        range: new vscode.Range(line, 0, line, 999),
        severity:
          suggestion.priority === 'high'
            ? vscode.DiagnosticSeverity.Warning
            : vscode.DiagnosticSeverity.Information,
        relatedInfo: [
          new vscode.DiagnosticRelatedInformation(
            new vscode.Location(
              dartFile.uri,
              new vscode.Range(line, 0, line, 999),
            ),
            `Suggested: ${suggestion.sql}`,
          ),
        ],
      });
    }
  }

  private _checkAnomalies(
    issues: IDiagnosticIssue[],
    anomalies: Anomaly[],
    dartFiles: IDartFileInfo[],
  ): void {
    for (const anomaly of anomalies) {
      const match = anomaly.message.match(/(\w+)\.(\w+)/);
      if (!match) continue;

      const [, tableName] = match;
      const dartFile = this._findDartFile(dartFiles, tableName);
      if (!dartFile) continue;

      const dartTable = dartFile.tables.find(
        (t) => t.sqlTableName === tableName,
      );
      const line = dartTable?.line ?? 0;

      const code = anomaly.severity === 'error' ? 'orphaned-fk' : 'anomaly';
      const severity =
        anomaly.severity === 'error'
          ? vscode.DiagnosticSeverity.Error
          : anomaly.severity === 'warning'
            ? vscode.DiagnosticSeverity.Warning
            : vscode.DiagnosticSeverity.Information;

      issues.push({
        code,
        message: anomaly.message,
        fileUri: dartFile.uri,
        range: new vscode.Range(line, 0, line, 999),
        severity,
      });
    }
  }

  private _checkExtraTablesInDb(
    issues: IDiagnosticIssue[],
    dbTableMap: Map<string, TableMetadata>,
    dartFiles: IDartFileInfo[],
  ): void {
    const dartTableNames = new Set<string>();
    for (const file of dartFiles) {
      for (const table of file.tables) {
        dartTableNames.add(table.sqlTableName);
      }
    }

    dbTableMap.forEach((_, tableName) => {
      if (!dartTableNames.has(tableName)) {
        const firstFile = dartFiles[0];
        if (firstFile) {
          issues.push({
            code: 'extra-table-in-db',
            message: `Table "${tableName}" exists in database but not in Dart`,
            fileUri: firstFile.uri,
            range: new vscode.Range(0, 0, 0, 999),
            severity: vscode.DiagnosticSeverity.Information,
          });
        }
      }
    });
  }

  private _findDartFile(
    files: IDartFileInfo[],
    tableName: string,
  ): IDartFileInfo | undefined {
    return files.find((f) =>
      f.tables.some((t) => t.sqlTableName === tableName),
    );
  }
}
