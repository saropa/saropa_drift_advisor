/**
 * Convert schema anomalies (e.g. orphaned FK) to diagnostic issues.
 */

import * as vscode from 'vscode';
import type { Anomaly } from '../../api-types';
import type { IDartFileInfo } from '../diagnostic-context-types';
import type { IDiagnosticIssue } from '../diagnostic-issue-types';
import { findDartFileForTable } from '../utils/dart-file-utils';

/**
 * Map each anomaly to an issue (orphaned-fk or anomaly) at the table location.
 */
export function checkAnomalies(
  issues: IDiagnosticIssue[],
  anomalies: Anomaly[],
  dartFiles: IDartFileInfo[],
): void {
  for (const anomaly of anomalies) {
    // Prefer the structured `table` and `column` fields the server
    // sends as first-class payload properties — they're always
    // correct and present on every anomaly kind (including
    // `duplicate_rows`, whose message has no `table.column` dot
    // pair). Fall back to regex extraction from the message only
    // when the structured fields are absent (older servers).
    const match = anomaly.message.match(/(\w+)\.(\w+)/);
    const tableName = anomaly.table ?? match?.[1];
    // columnName is intentionally optional — table-scoped anomalies
    // (e.g. duplicate_rows) have no column, and the downstream
    // fallback chain (`dartColumn?.line ?? dartTable?.line ?? 0`)
    // already handles a missing column by landing on the class line.
    const columnName = anomaly.column ?? match?.[2];
    if (!tableName) continue;
    const dartFile = findDartFileForTable(dartFiles, tableName);
    if (!dartFile) continue;

    const dartTable = dartFile.tables.find(
      (t) => t.sqlTableName.toLowerCase() === tableName.toLowerCase(),
    );

    // Prefer the column-declaration line when the anomaly names
    // a specific column (potential_outlier, null_values,
    // empty_strings, orphaned_fk are column-scoped). Falls back
    // to the class declaration line when the column can't be
    // resolved (synthetic column names, `.named()` overrides we
    // haven't parsed, camelCase vs snake_case edge cases) or when
    // the anomaly is table-scoped (e.g. duplicate_rows) and has
    // no column at all.
    const dartColumn = columnName
      ? dartTable?.columns.find(
          (c) => c.sqlName.toLowerCase() === columnName.toLowerCase(),
        )
      : undefined;
    const line = dartColumn?.line ?? dartTable?.line ?? 0;

    // Server 'error' anomalies are real integrity defects (orphaned FK) and
    // stay Error. Everything else is an advisory statistical observation —
    // report at Information rather than Warning so the 'anomaly' code does not
    // read as a defect.
    const code = anomaly.severity === 'error' ? 'orphaned-fk' : 'anomaly';
    const severity =
      anomaly.severity === 'error'
        ? vscode.DiagnosticSeverity.Error
        : vscode.DiagnosticSeverity.Information;

    // Attach structured table/column so downstream consumers
    // (diagnostic-apply.ts per-table exclusions, log-capture
    // exports) can match without re-parsing the message string.
    issues.push({
      code,
      message: anomaly.message,
      fileUri: dartFile.uri,
      range: new vscode.Range(line, 0, line, 999),
      severity,
      data: { table: tableName, column: columnName },
    });
  }
}
