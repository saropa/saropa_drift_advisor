/**
 * Table-level schema checks: missing table in DB, extra table in DB.
 */

import * as vscode from 'vscode';
import type { TableMetadata } from '../../api-types';
import type { IDartTable } from '../../schema-diff/dart-schema';
import type { IDartFileInfo, IDiagnosticIssue } from '../diagnostic-types';
import { TableNameMapper } from '../../codelens/table-name-mapper';

/**
 * Report when a Dart table has no matching database table.
 */
export function checkMissingTableInDb(
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

/**
 * Report when the database has tables not defined in any Dart file.
 *
 * The diagnostic is attached to the Dart file with the most table definitions
 * (the likely "primary schema" file) rather than an arbitrary first file,
 * so the warning appears in a contextually relevant location.
 */
export function checkExtraTablesInDb(
  issues: IDiagnosticIssue[],
  dbTableMap: Map<string, TableMetadata>,
  dartFiles: IDartFileInfo[],
): void {
  if (dartFiles.length === 0) return;

  // Build both exact and normalized (underscore-stripped) sets of Dart table names
  // so we can match DB tables even when acronym casing differs
  // (e.g. Drift's "superhero_d_c_characters" vs DB's "superhero_dc_characters")
  const dartTableNames = new Set<string>();
  const dartNormalizedNames = new Set<string>();
  for (const file of dartFiles) {
    for (const table of file.tables) {
      dartTableNames.add(table.sqlTableName);
      dartNormalizedNames.add(
        TableNameMapper.normalizeForComparison(table.sqlTableName),
      );
    }
  }

  // Pick the file with the most table definitions as the report target —
  // it's the most likely "primary schema" file and gives the developer
  // better context than an arbitrary dartFiles[0].
  const targetFile = dartFiles.reduce((best, file) =>
    file.tables.length > best.tables.length ? file : best,
  );

  dbTableMap.forEach((_, tableName) => {
    // Check exact match first, then fall back to normalized comparison
    const normalized = TableNameMapper.normalizeForComparison(tableName);
    if (!dartTableNames.has(tableName) && !dartNormalizedNames.has(normalized)) {
      issues.push({
        code: 'extra-table-in-db',
        message: `Table "${tableName}" exists in database but not in Dart`,
        fileUri: targetFile.uri,
        range: new vscode.Range(0, 0, 0, 999),
        severity: vscode.DiagnosticSeverity.Information,
      });
    }
  });
}
