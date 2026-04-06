/**
 * Slow query diagnostics: map slow queries to the call site that
 * issued them (when available), falling back to the table definition.
 */

import * as vscode from 'vscode';
import type { PerformanceData } from '../../api-types';
import type { IDartFileInfo, IDiagnosticIssue } from '../diagnostic-types';
import { findDartFileForTable } from '../utils/dart-file-utils';
import { extractTableFromSql, truncateSql } from '../utils/sql-utils';
import { resolveCallerLocation } from '../utils/caller-location-utils';

const SLOW_QUERY_THRESHOLD_MS = 100;
const MAX_SLOW_QUERY_DIAGNOSTICS = 10;

/**
 * Append slow-query-pattern issues for queries over the threshold.
 *
 * When the server provides caller location (callerFile / callerLine),
 * the diagnostic is pinned to the call site that issued the query.
 * Otherwise it falls back to the table definition file.
 */
export function checkSlowQueries(
  issues: IDiagnosticIssue[],
  perfData: PerformanceData,
  dartFiles: IDartFileInfo[],
): void {
  const slowQueries = perfData.slowQueries ?? [];
  let count = 0;

  for (const query of slowQueries) {
    if (count >= MAX_SLOW_QUERY_DIAGNOSTICS) break;
    if (query.durationMs < SLOW_QUERY_THRESHOLD_MS) continue;

    // Prefer caller location from the server when available.
    const callerLoc = resolveCallerLocation(query);

    // Fall back to table definition when no caller location is present.
    let fileUri: vscode.Uri;
    let line: number;

    if (callerLoc) {
      fileUri = callerLoc.uri;
      line = callerLoc.line;
    } else {
      const tableMatch = extractTableFromSql(query.sql);
      if (!tableMatch) continue;

      const dartFile = findDartFileForTable(dartFiles, tableMatch);
      if (!dartFile) continue;

      const dartTable = dartFile.tables.find(
        (t) => t.sqlTableName === tableMatch,
      );
      fileUri = dartFile.uri;
      line = dartTable?.line ?? 0;
    }

    const truncatedSql = truncateSql(query.sql, 60);

    // Include row count when available — a 3.6s COUNT(*) on 500K
    // rows is expected, but on 500 rows it's a real problem.
    const rowInfo = query.rowCount > 0 ? `, ${query.rowCount} rows` : '';

    // When caller location is known, this is a user-code query →
    // full Warning. Without caller location the query was issued by
    // the server itself and pinned to the table definition as a
    // fallback → downgrade to Information to avoid false-positive
    // noise on schema files.
    const severity = callerLoc
      ? vscode.DiagnosticSeverity.Warning
      : vscode.DiagnosticSeverity.Information;

    issues.push({
      code: 'slow-query-pattern',
      message: `Slow query (${query.durationMs.toFixed(0)}ms${rowInfo}): ${truncatedSql}`,
      fileUri,
      range: new vscode.Range(line, 0, line, 999),
      severity,
      data: { sql: query.sql, durationMs: query.durationMs },
    });

    count++;
  }
}
