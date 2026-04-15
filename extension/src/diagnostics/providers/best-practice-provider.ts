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
import { findDartFileForTable } from '../utils/dart-file-utils';

/**
 * Best practice diagnostic provider.
 * Reports Drift/SQLite best practice issues including:
 * - autoIncrement on non-PK columns
 * - Suspected missing FK constraints (columns ending in `_id` that match known
 *   table names but have no declared foreign key — skips intentionally isolated
 *   tables and tables already participating in the FK graph via inbound refs)
 * - Circular FK relationships
 */
export class BestPracticeProvider implements IDiagnosticProvider {
  readonly id = 'bestPractices';
  readonly category: DiagnosticCategory = 'bestPractices';

  async collectDiagnostics(ctx: IDiagnosticContext): Promise<IDiagnosticIssue[]> {
    const issues: IDiagnosticIssue[] = [];

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
          this._checkNoForeignKeys(
            issues, file, dartTable, fks, allTableNames, referencedTables,
          );
        }
      }

      this._checkCircularFks(issues, fkMap, ctx.dartFiles);
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

    return actions;
  }

  dispose(): void {}

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

  /**
   * Flags tables that have columns appearing to reference other tables
   * (e.g. `user_id` when a `users` table exists) but lack FK constraints.
   *
   * Skips tables that:
   * - Already have outbound FKs
   * - Are referenced by other tables (inbound FKs — they participate in the FK graph)
   * - Have no columns whose names match known table names (intentionally isolated)
   *
   * @param allTableNames - Pre-computed set of all DB table names (from fkMap keys)
   * @param referencedTables - Pre-computed set of table names that appear as FK targets
   */
  private _checkNoForeignKeys(
    issues: IDiagnosticIssue[],
    file: IDartFileInfo,
    dartTable: IDartTable,
    fks: ForeignKey[],
    allTableNames: Set<string>,
    referencedTables: Set<string>,
  ): void {
    // Table already has outbound FKs — nothing to report
    if (fks.length > 0) return;

    // Table is referenced by other tables (inbound FKs) — it participates
    // in the relational graph even though it declares no outbound FKs
    if (referencedTables.has(dartTable.sqlTableName)) return;

    // Find columns that look like FK references: end in `_id`, and the prefix
    // matches a known table name (exact match, simple plural, or reverse singular)
    const suspectedFkColumns = dartTable.columns.filter((c) => {
      // Skip the table's own id / autoIncrement column
      if (c.sqlName === 'id' || c.autoIncrement) return false;
      if (!c.sqlName.endsWith('_id')) return false;

      // Strip the `_id` suffix and check against known tables
      const prefix = c.sqlName.slice(0, -3);
      if (prefix.length === 0) return false;

      // Match column prefix against known table names:
      // - Exact: "user_id" → table "user"
      // - Append 's': "user_id" → table "users"
      // - Reverse singular: "category_id" → table "categories" (strip trailing 's')
      if (allTableNames.has(prefix)) return true;
      if (allTableNames.has(prefix + 's')) return true;

      // Check if any table name becomes the prefix when de-pluralized:
      // handles "categories" → "categorie" won't match, but "users" → "user" will,
      // and also handles tables like "companies" via the ies→y transform
      for (const tableName of allTableNames) {
        // Simple 's' suffix: "users" → "user"
        if (tableName.endsWith('s') && tableName.slice(0, -1) === prefix) {
          return true;
        }
        // "ies" suffix: "categories" → "category", "companies" → "company"
        if (
          tableName.endsWith('ies') &&
          tableName.slice(0, -3) + 'y' === prefix
        ) {
          return true;
        }
      }

      return false;
    });

    // Only flag when there are columns that look like they should be FK references
    // but no constraints exist — this catches genuine "forgot to add references()"
    // while ignoring intentionally isolated tables (import caches, config, logs, etc.)
    if (suspectedFkColumns.length > 0) {
      const colNames = suspectedFkColumns.map((c) => c.sqlName).join(', ');
      issues.push({
        code: 'no-foreign-keys',
        message: `Table "${dartTable.sqlTableName}" has columns that appear to reference other tables but no foreign key constraints: ${colNames}`,
        fileUri: file.uri,
        range: new vscode.Range(dartTable.line, 0, dartTable.line, 999),
        severity: vscode.DiagnosticSeverity.Information,
        // Expose table name for per-table exclusion filtering in DiagnosticManager
        data: { tableName: dartTable.sqlTableName },
      });
    }
  }

  private _checkCircularFks(
    issues: IDiagnosticIssue[],
    fkMap: Map<string, ForeignKey[]>,
    dartFiles: IDartFileInfo[],
  ): void {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const detectCycle = (
      table: string,
      path: string[],
    ): string[] | null => {
      if (recursionStack.has(table)) {
        const cycleStart = path.indexOf(table);
        return path.slice(cycleStart);
      }

      if (visited.has(table)) {
        return null;
      }

      visited.add(table);
      recursionStack.add(table);

      const fks = fkMap.get(table) ?? [];
      for (const fk of fks) {
        const cycle = detectCycle(fk.toTable, [...path, table]);
        if (cycle) {
          return cycle;
        }
      }

      recursionStack.delete(table);
      return null;
    };

    const reportedCycles = new Set<string>();

    fkMap.forEach((_, tableName) => {
      visited.clear();
      recursionStack.clear();

      const cycle = detectCycle(tableName, []);
      if (cycle && cycle.length > 0) {
        const cycleKey = [...cycle].sort().join(',');
        if (!reportedCycles.has(cycleKey)) {
          reportedCycles.add(cycleKey);

          const firstTable = cycle[0];
          const dartFile = findDartFileForTable(dartFiles, firstTable);
          if (dartFile) {
            const dartTable = dartFile.tables.find(
              (t) => t.sqlTableName === firstTable,
            );
            const line = dartTable?.line ?? 0;

            const cyclePath = [...cycle, cycle[0]].join(' → ');

            issues.push({
              code: 'circular-fk',
              message: `Circular foreign key relationship detected: ${cyclePath}`,
              fileUri: dartFile.uri,
              range: new vscode.Range(line, 0, line, 999),
              severity: vscode.DiagnosticSeverity.Warning,
            });
          }
        }
      }
    });
  }
}
