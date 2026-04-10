/**
 * Index suggestion checks: missing indexes on FK and _id columns.
 *
 * The server generates three tiers of index suggestions:
 *   - high priority: true FK columns (from PRAGMA foreign_key_list)
 *   - medium priority: columns ending in _id (likely join columns)
 *   - low priority: date/time columns — suppressed here (see bug 002),
 *     legitimate cases are caught by query-pattern-checker's
 *     'unindexed-where-clause' diagnostic instead.
 *
 * High and medium tiers get their own diagnostic code so the Problems
 * panel message accurately describes why the index was suggested.
 */

import * as vscode from 'vscode';
import type { IndexSuggestion } from '../../api-types';
import type { IDartFileInfo, IDiagnosticIssue } from '../diagnostic-types';
import { findDartFileForTable } from '../utils/dart-file-utils';

/**
 * Resolve the diagnostic code and message for an index suggestion
 * based on its priority tier.
 *
 * Returns undefined for 'low' priority (datetime) suggestions — those
 * are blanket heuristics that produce mass false positives (see bug 002).
 * Datetime columns that are actually queried are caught by the
 * 'unindexed-where-clause' diagnostic from query-pattern-checker instead.
 */
function resolveCodeAndMessage(suggestion: IndexSuggestion): {
  code: string;
  message: string;
  severity: vscode.DiagnosticSeverity;
} | undefined {
  switch (suggestion.priority) {
    case 'high':
      // Heuristic 1: true FK from PRAGMA foreign_key_list
      return {
        code: 'missing-fk-index',
        message: `FK column "${suggestion.table}.${suggestion.column}" lacks an index`,
        severity: vscode.DiagnosticSeverity.Warning,
      };

    case 'medium':
      // Heuristic 2: column name ends in _id (likely join column)
      return {
        code: 'missing-id-index',
        message: `Column "${suggestion.table}.${suggestion.column}" ends in _id — consider an index if used in JOINs or WHERE`,
        severity: vscode.DiagnosticSeverity.Hint,
      };

    case 'low':
      // Suppressed: blanket datetime heuristic produces 40+ false positives.
      // Legitimate cases are covered by 'unindexed-where-clause' instead.
      return undefined;
  }
}

/**
 * Report index suggestions with the correct diagnostic code per heuristic tier.
 * Maps each suggestion to its Dart file/column location.
 */
export function checkMissingIndexes(
  issues: IDiagnosticIssue[],
  suggestions: IndexSuggestion[],
  dartFiles: IDartFileInfo[],
): void {
  for (const suggestion of suggestions) {
    const dartFile = findDartFileForTable(dartFiles, suggestion.table);
    if (!dartFile) continue;

    const dartTable = dartFile.tables.find(
      (t) => t.sqlTableName.toLowerCase() === suggestion.table.toLowerCase(),
    );
    const dartCol = dartTable?.columns.find(
      (c) => c.sqlName.toLowerCase() === suggestion.column.toLowerCase(),
    );

    const resolved = resolveCodeAndMessage(suggestion);
    if (!resolved) continue;

    const line = dartCol?.line ?? dartTable?.line ?? 0;

    const { code, message, severity } = resolved;

    issues.push({
      code,
      message,
      fileUri: dartFile.uri,
      range: new vscode.Range(line, 0, line, 999),
      severity,
      relatedInfo: [
        new vscode.DiagnosticRelatedInformation(
          new vscode.Location(
            dartFile.uri,
            new vscode.Range(line, 0, line, 999),
          ),
          `Suggested: ${suggestion.sql}`,
        ),
      ],
    });
  }
}
