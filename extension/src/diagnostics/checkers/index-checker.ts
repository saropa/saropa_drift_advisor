/**
 * Index suggestion checks: missing indexes on FK, _id, and date/time columns.
 *
 * The server generates three tiers of index suggestions:
 *   - high priority: true FK columns (from PRAGMA foreign_key_list)
 *   - medium priority: columns ending in _id (likely join columns)
 *   - low priority: date/time columns (often used in ORDER BY / WHERE)
 *
 * Each tier gets its own diagnostic code so the Problems panel message
 * accurately describes why the index was suggested.
 */

import * as vscode from 'vscode';
import type { IndexSuggestion } from '../../api-types';
import type { IDartFileInfo, IDiagnosticIssue } from '../diagnostic-types';
import { findDartFileForTable } from '../utils/dart-file-utils';

/**
 * Resolve the diagnostic code and message for an index suggestion
 * based on its priority tier.
 */
function resolveCodeAndMessage(suggestion: IndexSuggestion): {
  code: string;
  message: string;
  severity: vscode.DiagnosticSeverity;
} {
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
        message: `Column "${suggestion.table}.${suggestion.column}" ends in _id and may benefit from an index`,
        severity: vscode.DiagnosticSeverity.Information,
      };

    case 'low':
      // Heuristic 3: date/time column suffix
      return {
        code: 'missing-datetime-index',
        message: `Date/time column "${suggestion.table}.${suggestion.column}" may benefit from an index if used in ORDER BY or WHERE`,
        severity: vscode.DiagnosticSeverity.Information,
      };
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
    const line = dartCol?.line ?? dartTable?.line ?? 0;

    const { code, message, severity } = resolveCodeAndMessage(suggestion);

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
