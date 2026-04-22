/**
 * Convert schema anomalies (e.g. orphaned FK) to diagnostic issues.
 */

import * as vscode from 'vscode';
import type { Anomaly } from '../../api-types';
import type { IDartFileInfo, IDiagnosticIssue } from '../diagnostic-types';
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
    // Anomaly messages from the Dart server are shaped as
    // `<table>.<column>: …` (e.g. "contact_points.last_modified:
    // Potential outlier …"). We need both halves — the table to
    // find the right Dart file, and the column to land on the
    // getter line rather than the class header.
    const match = anomaly.message.match(/(\w+)\.(\w+)/);
    if (!match) continue;

    const [, tableName, columnName] = match;
    const dartFile = findDartFileForTable(dartFiles, tableName);
    if (!dartFile) continue;

    const dartTable = dartFile.tables.find(
      (t) => t.sqlTableName.toLowerCase() === tableName.toLowerCase(),
    );

    // Prefer the column-declaration line when the anomaly names
    // a specific column (every anomaly type currently emitted —
    // potential_outlier, null_values, empty_strings,
    // orphaned_fk — is column-scoped). Falls back to the class
    // declaration line when the column can't be resolved
    // (synthetic column names, `.named()` overrides we haven't
    // parsed, or camelCase vs snake_case edge cases).
    //
    // This also half-owns the de-duplication with the legacy
    // linter/ pipeline: that path used to emit anomalies at the
    // column line under its own `drift-linter` collection while
    // this path emitted them at the class line under
    // `drift-advisor`, producing the two-owners / two-lines
    // duplicate reported in
    // bugs/anomaly_false_positive_tight_timestamp_range.md. The
    // legacy path has since stopped emitting anomalies, so the
    // single remaining diagnostic lives here and at the
    // column-getter span the user expects.
    const dartColumn = dartTable?.columns.find(
      (c) => c.sqlName.toLowerCase() === columnName.toLowerCase(),
    );
    const line = dartColumn?.line ?? dartTable?.line ?? 0;

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
