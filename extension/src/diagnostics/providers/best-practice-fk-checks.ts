import * as vscode from 'vscode';
import type { ForeignKey } from '../../api-types';
import type { IDartTable } from '../../schema-diff/dart-schema';
import type { IDartFileInfo } from '../diagnostic-context-types';
import type { IDiagnosticIssue } from '../diagnostic-issue-types';
import { findDartFileForTable } from '../utils/dart-file-utils';

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
export function checkNoForeignKeys(
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

export function checkCircularFks(
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
