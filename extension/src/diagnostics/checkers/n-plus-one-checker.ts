/**
 * N+1 query pattern detection from recent query streams.
 *
 * When caller location is available from the server, the diagnostic
 * is pinned to the call site instead of the table definition file.
 */

import * as vscode from 'vscode';
import type { PerformanceData, QueryEntry } from '../../api-types';
import type { IDartFileInfo, IDiagnosticIssue } from '../diagnostic-types';
import { findDartFileForTable } from '../utils/dart-file-utils';
import { areSimilarQueries, extractTableFromSql, isReadQuery } from '../utils/sql-utils';
import { resolveCallerLocation } from '../utils/caller-location-utils';

const MIN_RECENT_QUERIES = 5;
const N_PLUS_ONE_QUERY_THRESHOLD = 10;

/**
 * Append n-plus-one issues when a table is queried many times with similar SQL.
 *
 * Prefers caller location from the first query in the group when
 * available, otherwise falls back to the table definition file.
 */
export function checkNPlusOnePatterns(
  issues: IDiagnosticIssue[],
  perfData: PerformanceData,
  dartFiles: IDartFileInfo[],
): void {
  const recentQueries = perfData.recentQueries ?? [];
  if (recentQueries.length < MIN_RECENT_QUERIES) return;

  const tableQueryCounts = new Map<string, { count: number; queries: QueryEntry[] }>();

  for (const query of recentQueries) {
    // N+1 is a read-path concern: repeated SELECTs that could be a single
    // JOIN or IN query. Write operations (INSERT/UPDATE/DELETE) are inherently
    // per-record and should not be counted (e.g. activity log inserts).
    if (!isReadQuery(query.sql)) continue;

    const table = extractTableFromSql(query.sql);
    if (!table) continue;

    const existing = tableQueryCounts.get(table) ?? { count: 0, queries: [] };
    existing.count++;
    if (existing.queries.length < 5) {
      existing.queries.push(query);
    }
    tableQueryCounts.set(table, existing);
  }

  tableQueryCounts.forEach((data, tableName) => {
    if (data.count >= N_PLUS_ONE_QUERY_THRESHOLD) {
      const similarQueries = areSimilarQueries(data.queries);
      if (!similarQueries) return;

      // Try caller location from the first query in the group.
      const callerLoc = resolveCallerLocation(data.queries[0]);

      let fileUri: vscode.Uri;
      let line: number;

      if (callerLoc) {
        fileUri = callerLoc.uri;
        line = callerLoc.line;
      } else {
        // Fall back to table definition file.
        const dartFile = findDartFileForTable(dartFiles, tableName);
        if (!dartFile) return;

        const dartTable = dartFile.tables.find(
          (t) => t.sqlTableName === tableName,
        );
        fileUri = dartFile.uri;
        line = dartTable?.line ?? 0;
      }

      // Hint whether the repeated queries look like a loop
      // (fixable via JOIN/IN) or independent call sites (expected).
      const patternHint = data.count >= 20
        ? ' — likely a loop; consider batching with JOIN or IN clause'
        : '';

      issues.push({
        code: 'n-plus-one',
        message: `Potential N+1 query pattern: "${tableName}" queried ${data.count} times in recent window${patternHint}`,
        fileUri,
        range: new vscode.Range(line, 0, line, 999),
        severity: vscode.DiagnosticSeverity.Warning,
      });
    }
  });
}
