/**
 * N+1 query pattern detection from recent query streams.
 */

import * as vscode from 'vscode';
import type { PerformanceData, QueryEntry } from '../../api-types';
import type { IDartFileInfo, IDiagnosticIssue } from '../diagnostic-types';
import { findDartFileForTable } from '../utils/dart-file-utils';
import { areSimilarQueries, extractTableFromSql, isReadQuery } from '../utils/sql-utils';

const MIN_RECENT_QUERIES = 5;
const N_PLUS_ONE_QUERY_THRESHOLD = 10;

/**
 * Append n-plus-one issues when a table is queried many times with similar SQL.
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
      const dartFile = findDartFileForTable(dartFiles, tableName);
      if (!dartFile) return;

      const dartTable = dartFile.tables.find(
        (t) => t.sqlTableName === tableName,
      );
      const line = dartTable?.line ?? 0;

      const similarQueries = areSimilarQueries(data.queries);
      if (similarQueries) {
        issues.push({
          code: 'n-plus-one',
          message: `Potential N+1 query pattern: "${tableName}" queried ${data.count} times in recent window`,
          fileUri: dartFile.uri,
          range: new vscode.Range(line, 0, line, 999),
          severity: vscode.DiagnosticSeverity.Warning,
        });
      }
    }
  });
}
