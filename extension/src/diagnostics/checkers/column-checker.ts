/**
 * Column-level schema drift: missing/extra columns, type mismatch,
 * and acronym-based name mismatches (e.g. UUID → u_u_i_d).
 */

import * as vscode from 'vscode';
import type { ColumnMetadata, TableMetadata } from '../../api-types';
import { DART_TO_SQL_TYPE } from '../../schema-diff/dart-schema';
import type { IDartTable } from '../../schema-diff/dart-schema';
import type { IDartFileInfo, IDiagnosticIssue } from '../diagnostic-types';
import { TableNameMapper } from '../../codelens/table-name-mapper';

/**
 * Report missing column in DB, type drift, acronym name mismatches,
 * and extra column in DB.
 */
export function checkColumnDrift(
  issues: IDiagnosticIssue[],
  file: IDartFileInfo,
  dartTable: IDartTable,
  dbTable: TableMetadata | undefined,
): void {
  if (!dbTable) return;

  // Exact-match map keyed by column name
  const dbColMap = new Map<string, ColumnMetadata>();
  // Normalized map (underscores stripped, lowered) to catch acronym
  // splitting differences — e.g. "contact_saropa_u_u_i_d" vs
  // "contact_saropa_uuid" both normalize to "contactsaropauuid"
  const dbNormalizedMap = new Map<string, ColumnMetadata>();
  for (const col of dbTable.columns) {
    dbColMap.set(col.name, col);
    dbNormalizedMap.set(
      TableNameMapper.normalizeForComparison(col.name),
      col,
    );
  }

  // Track DB columns matched via normalization so we suppress
  // extra-column-in-db for them later
  const normalizedMatches = new Set<string>();

  for (const dartCol of dartTable.columns) {
    const dbCol = dbColMap.get(dartCol.sqlName);
    const line = dartCol.line >= 0 ? dartCol.line : dartTable.line;

    if (!dbCol) {
      // No exact match — try normalized comparison to detect acronym
      // name mismatches (e.g. Drift's "u_u_i_d" vs DB's "uuid")
      const normalizedDart = TableNameMapper.normalizeForComparison(
        dartCol.sqlName,
      );
      const normalizedDbCol = dbNormalizedMap.get(normalizedDart);

      if (normalizedDbCol) {
        // The column exists under a different spelling — acronym mismatch
        normalizedMatches.add(normalizedDbCol.name);
        issues.push({
          code: 'column-name-acronym-mismatch',
          message:
            `Column "${dartTable.sqlTableName}.${dartCol.sqlName}" name mismatch: ` +
            `Drift generates "${dartCol.sqlName}" but database has "${normalizedDbCol.name}". ` +
            `Rename the Dart getter so Drift produces "${normalizedDbCol.name}", ` +
            `or add .named('${normalizedDbCol.name}') to override`,
          fileUri: file.uri,
          range: new vscode.Range(line, 0, line, 999),
          severity: vscode.DiagnosticSeverity.Error,
        });
      } else {
        issues.push({
          code: 'missing-column-in-db',
          message: `Column "${dartTable.sqlTableName}.${dartCol.sqlName}" defined in Dart but missing from database`,
          fileUri: file.uri,
          range: new vscode.Range(line, 0, line, 999),
          severity: vscode.DiagnosticSeverity.Error,
        });
      }
      continue;
    }

    const expectedType = DART_TO_SQL_TYPE[dartCol.dartType];
    if (expectedType && dbCol.type !== expectedType) {
      // When a DateTimeColumn mismatches on INTEGER vs TEXT, the most
      // common cause is the build.yaml `store_date_time_values_as_text`
      // setting not matching the actual database schema.
      const dateTimeHint =
        dartCol.dartType === 'DateTimeColumn' &&
        ((expectedType === 'INTEGER' && dbCol.type === 'TEXT') ||
          (expectedType === 'TEXT' && dbCol.type === 'INTEGER'))
          ? '. Check store_date_time_values_as_text in build.yaml'
          : '';

      issues.push({
        code: 'column-type-drift',
        message:
          `Column "${dartTable.sqlTableName}.${dartCol.sqlName}" type mismatch: ` +
          `Dart schema expects ${expectedType} but database has ${dbCol.type}. ` +
          `Either update the database column or change the Dart definition` +
          dateTimeHint,
        fileUri: file.uri,
        range: new vscode.Range(line, 0, line, 999),
        severity: vscode.DiagnosticSeverity.Warning,
      });
    }
  }

  for (const dbCol of dbTable.columns) {
    // Skip DB columns that were matched via normalized comparison —
    // they already have an acronym-mismatch diagnostic
    if (normalizedMatches.has(dbCol.name)) continue;

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
