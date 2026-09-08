import * as vscode from 'vscode';
import type { ForeignKey, TableMetadata } from '../../api-types';
import type { IDartTable } from '../../schema-diff/dart-schema';
import type {
  DiagnosticCategory,
  IDartFileInfo,
  IDiagnosticContext,
  IDiagnosticIssue,
  IDiagnosticProvider,
} from '../diagnostic-types';
import { checkCircularFks, checkNoForeignKeys } from './best-practice-fk-checks';

/**
 * Best practice diagnostic provider.
 * Reports Drift/SQLite best practice issues including:
 * - autoIncrement on non-PK columns
 * - Suspected missing FK constraints (columns ending in `_id` that match known
 *   table names but have no declared foreign key — skips intentionally isolated
 *   tables and tables already participating in the FK graph via inbound refs)
 * - Circular FK relationships
 * - Missing schema version snapshots (drift_schemas/ directory absent)
 */
export class BestPracticeProvider implements IDiagnosticProvider {
  readonly id = 'bestPractices';
  readonly category: DiagnosticCategory = 'bestPractices';

  async collectDiagnostics(ctx: IDiagnosticContext): Promise<IDiagnosticIssue[]> {
    const issues: IDiagnosticIssue[] = [];

    // Workspace-level check — runs even without a server connection
    if (ctx.dartFiles.length > 0) {
      await this._checkSchemaSnapshots(issues);
    }

    // Source-only check — no server/table data needed, so run unconditionally.
    for (const file of ctx.dartFiles) {
      this._checkUnreachableIgnoreDirectives(issues, file);
    }

    try {
      const tables = await ctx.client.schemaMetadata();
      const userTables = tables.filter((t) => !t.name.startsWith('sqlite_'));

      const fkMap = new Map<string, ForeignKey[]>();
      await Promise.all(
        userTables.map(async (t) => {
          const fks = await ctx.client.tableFkMeta(t.name);
          fkMap.set(t.name, fks);
        }),
      );

      // Pre-compute sets used by _checkNoForeignKeys to avoid redundant
      // Map spreads and Set constructions on every per-table call
      const allTableNames = new Set(fkMap.keys());
      const referencedTables = new Set<string>();
      for (const tableFks of fkMap.values()) {
        for (const fk of tableFks) {
          referencedTables.add(fk.toTable);
        }
      }

      for (const file of ctx.dartFiles) {
        for (const dartTable of file.tables) {
          const dbTable = userTables.find(
            (t) => t.name === dartTable.sqlTableName,
          );
          const fks = fkMap.get(dartTable.sqlTableName) ?? [];

          this._checkAutoIncrementNotPk(issues, file, dartTable, dbTable);
          checkNoForeignKeys(
            issues, file, dartTable, fks, allTableNames, referencedTables,
          );
        }
      }

      checkCircularFks(issues, fkMap, ctx.dartFiles);
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

    // Add "Disable this rule" action for all best practice diagnostics
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

    if (code === 'no-foreign-keys') {
      const diagramAction = new vscode.CodeAction(
        'View ER Diagram',
        vscode.CodeActionKind.QuickFix,
      );
      diagramAction.command = {
        command: 'driftViewer.showDiagram',
        title: 'ER Diagram',
      };
      actions.push(diagramAction);
    }

    if (code === 'circular-fk') {
      const impactAction = new vscode.CodeAction(
        'Analyze Impact',
        vscode.CodeActionKind.QuickFix,
      );
      impactAction.command = {
        command: 'driftViewer.analyzeImpact',
        title: 'Impact Analysis',
      };
      actions.push(impactAction);
    }

    if (code === 'no-schema-snapshots') {
      const genAction = new vscode.CodeAction(
        'Generate SchemaVerifier Test',
        vscode.CodeActionKind.QuickFix,
      );
      genAction.command = {
        command: 'driftViewer.generateSchemaVerifierTest',
        title: 'Generate SchemaVerifier Test',
      };
      genAction.isPreferred = true;
      actions.push(genAction);
    }

    return actions;
  }

  dispose(): void {}

  /**
   * Warns when the workspace has Drift tables but no schema version snapshots
   * for migration path testing. Anchored to pubspec.yaml line 0.
   */
  private async _checkSchemaSnapshots(
    issues: IDiagnosticIssue[],
  ): Promise<void> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders?.length) return;

    // ** globs cover monorepo sub-packages (e.g. packages/app/drift_schemas/)
    const [driftSchemas, generatedMigrations] = await Promise.all([
      vscode.workspace.findFiles('**/drift_schemas/**', null, 1),
      vscode.workspace.findFiles('**/test/generated_migrations/**', null, 1),
    ]);

    if (driftSchemas.length > 0 || generatedMigrations.length > 0) return;

    const pubspecUri = vscode.Uri.joinPath(folders[0].uri, 'pubspec.yaml');
    issues.push({
      code: 'no-schema-snapshots',
      message:
        'No Drift schema snapshots found — run "dart run drift_dev schema dump" to enable migration path testing with SchemaVerifier',
      fileUri: pubspecUri,
      range: new vscode.Range(0, 0, 0, 999),
    });
  }

  /**
   * Warns on `drift-advisor:ignore` directives that resolved to no target
   * line (nothing but blank/comment lines follow them in the file). Such a
   * directive silently suppresses nothing, which looks identical to a
   * working suppression until the diagnostic it was meant to silence
   * reappears — a trap this check surfaces immediately instead.
   */
  private _checkUnreachableIgnoreDirectives(
    issues: IDiagnosticIssue[],
    file: IDartFileInfo,
  ): void {
    for (const line of file.suppressions.unreachableDirectiveLines) {
      issues.push({
        code: 'unreachable-ignore-directive',
        message:
          'This "drift-advisor:ignore" directive has no code line to target and suppresses nothing',
        fileUri: file.uri,
        range: new vscode.Range(line, 0, line, 999),
      });
    }
  }

  private _checkAutoIncrementNotPk(
    issues: IDiagnosticIssue[],
    file: IDartFileInfo,
    dartTable: IDartTable,
    dbTable: TableMetadata | undefined,
  ): void {
    if (!dbTable) return;

    for (const dartCol of dartTable.columns) {
      if (dartCol.autoIncrement) {
        const dbCol = dbTable.columns.find((c) => c.name === dartCol.sqlName);
        if (dbCol && !dbCol.pk) {
          issues.push({
            code: 'autoincrement-not-pk',
            message: `Column "${dartTable.sqlTableName}.${dartCol.sqlName}" uses autoIncrement but is not primary key`,
            fileUri: file.uri,
            range: new vscode.Range(dartCol.line, 0, dartCol.line, 999),
            severity: vscode.DiagnosticSeverity.Error,
          });
        }
      }
    }
  }

}
