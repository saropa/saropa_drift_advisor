import * as vscode from 'vscode';
import type { PerformanceData, QueryEntry } from '../../api-types';
import type {
  DiagnosticCategory,
  IDartFileInfo,
  IDiagnosticContext,
  IDiagnosticIssue,
  IDiagnosticProvider,
} from '../diagnostic-types';

/** Threshold for slow query detection (ms). */
const SLOW_QUERY_THRESHOLD_MS = 100;

/** Minimum execution count to consider a pattern significant. */
const MIN_PATTERN_COUNT = 3;

/** Maximum number of slow query diagnostics to report. */
const MAX_SLOW_QUERY_DIAGNOSTICS = 10;

/**
 * Performance diagnostic provider.
 * Reports query performance issues including:
 * - Slow query patterns
 * - Full table scans
 * - N+1 query patterns
 * - Unindexed WHERE/JOIN clauses
 */
export class PerformanceProvider implements IDiagnosticProvider {
  readonly id = 'performance';
  readonly category: DiagnosticCategory = 'performance';

  async collectDiagnostics(ctx: IDiagnosticContext): Promise<IDiagnosticIssue[]> {
    const issues: IDiagnosticIssue[] = [];

    try {
      const [perfData, patternSuggestions] = await Promise.all([
        ctx.client.performance(),
        ctx.queryIntel.getSuggestedIndexes(),
      ]);

      this._checkSlowQueries(issues, perfData, ctx.dartFiles);
      this._checkQueryPatterns(issues, patternSuggestions, ctx.dartFiles);
      this._checkNPlusOnePatterns(issues, perfData, ctx.dartFiles);
    } catch {
      // Server unreachable or other error - return empty
    }

    return issues;
  }

  provideCodeActions(
    diag: vscode.Diagnostic,
    _doc: vscode.TextDocument,
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];
    const code = diag.code as string;

    if (code === 'slow-query-pattern') {
      const analyzeAction = new vscode.CodeAction(
        'Analyze Query Cost',
        vscode.CodeActionKind.QuickFix,
      );
      analyzeAction.command = {
        command: 'driftViewer.analyzeQueryCost',
        title: 'Analyze Query',
      };
      actions.push(analyzeAction);

      const perfAction = new vscode.CodeAction(
        'View Performance Panel',
        vscode.CodeActionKind.QuickFix,
      );
      perfAction.command = {
        command: 'driftViewer.refreshPerformance',
        title: 'Performance',
      };
      actions.push(perfAction);
    }

    if (code === 'unindexed-where-clause' || code === 'unindexed-join') {
      const sql = (diag as any).data?.sql;
      if (sql) {
        const copyAction = new vscode.CodeAction(
          'Copy CREATE INDEX SQL',
          vscode.CodeActionKind.QuickFix,
        );
        copyAction.command = {
          command: 'driftViewer.copySuggestedSql',
          title: 'Copy SQL',
          arguments: [sql],
        };
        actions.push(copyAction);

        const runAction = new vscode.CodeAction(
          'Run CREATE INDEX Now',
          vscode.CodeActionKind.QuickFix,
        );
        runAction.command = {
          command: 'driftViewer.runIndexSql',
          title: 'Run SQL',
          arguments: [sql],
        };
        runAction.isPreferred = true;
        actions.push(runAction);
      }
    }

    if (code === 'full-table-scan') {
      const viewAction = new vscode.CodeAction(
        'View Index Suggestions',
        vscode.CodeActionKind.QuickFix,
      );
      viewAction.command = {
        command: 'driftViewer.showIndexSuggestions',
        title: 'Index Suggestions',
      };
      actions.push(viewAction);
    }

    if (code === 'n-plus-one') {
      const docsAction = new vscode.CodeAction(
        'Learn About N+1 Queries',
        vscode.CodeActionKind.QuickFix,
      );
      docsAction.command = {
        command: 'vscode.open',
        title: 'Open Documentation',
        arguments: [vscode.Uri.parse('https://drift.simonbinder.eu/docs/advanced-features/joins/')],
      };
      actions.push(docsAction);
    }

    return actions;
  }

  dispose(): void {}

  private _checkSlowQueries(
    issues: IDiagnosticIssue[],
    perfData: PerformanceData,
    dartFiles: IDartFileInfo[],
  ): void {
    const slowQueries = perfData.slowQueries ?? [];
    let count = 0;

    for (const query of slowQueries) {
      if (count >= MAX_SLOW_QUERY_DIAGNOSTICS) break;
      if (query.durationMs < SLOW_QUERY_THRESHOLD_MS) continue;

      const tableMatch = this._extractTableFromSql(query.sql);
      if (!tableMatch) continue;

      const dartFile = this._findDartFileForTable(dartFiles, tableMatch);
      if (!dartFile) continue;

      const dartTable = dartFile.tables.find(
        (t) => t.sqlTableName === tableMatch,
      );
      const line = dartTable?.line ?? 0;

      const truncatedSql = this._truncateSql(query.sql, 60);

      issues.push({
        code: 'slow-query-pattern',
        message: `Slow query (${query.durationMs.toFixed(0)}ms): ${truncatedSql}`,
        fileUri: dartFile.uri,
        range: new vscode.Range(line, 0, line, 999),
        severity: vscode.DiagnosticSeverity.Warning,
        data: { sql: query.sql, durationMs: query.durationMs },
      });

      count++;
    }
  }

  private _checkQueryPatterns(
    issues: IDiagnosticIssue[],
    suggestions: Array<{
      table: string;
      column: string;
      reason: string;
      usageCount: number;
      potentialSavingsMs: number;
      sql: string;
    }>,
    dartFiles: IDartFileInfo[],
  ): void {
    for (const suggestion of suggestions) {
      if (suggestion.usageCount < MIN_PATTERN_COUNT) continue;

      const dartFile = this._findDartFileForTable(dartFiles, suggestion.table);
      if (!dartFile) continue;

      const dartTable = dartFile.tables.find(
        (t) => t.sqlTableName === suggestion.table,
      );
      const dartCol = dartTable?.columns.find(
        (c) => c.sqlName === suggestion.column,
      );
      const line = dartCol?.line ?? dartTable?.line ?? 0;

      issues.push({
        code: 'unindexed-where-clause',
        message: `Frequent WHERE on "${suggestion.table}.${suggestion.column}" without index (${suggestion.usageCount} queries)`,
        fileUri: dartFile.uri,
        range: new vscode.Range(line, 0, line, 999),
        severity: vscode.DiagnosticSeverity.Warning,
        relatedInfo: [
          new vscode.DiagnosticRelatedInformation(
            new vscode.Location(
              dartFile.uri,
              new vscode.Range(line, 0, line, 999),
            ),
            `Suggested: ${suggestion.sql}`,
          ),
        ],
        data: { sql: suggestion.sql },
      });
    }
  }

  private _checkNPlusOnePatterns(
    issues: IDiagnosticIssue[],
    perfData: PerformanceData,
    dartFiles: IDartFileInfo[],
  ): void {
    const recentQueries = perfData.recentQueries ?? [];
    if (recentQueries.length < 5) return;

    const tableQueryCounts = new Map<string, { count: number; queries: QueryEntry[] }>();

    for (const query of recentQueries) {
      const table = this._extractTableFromSql(query.sql);
      if (!table) continue;

      const existing = tableQueryCounts.get(table) ?? { count: 0, queries: [] };
      existing.count++;
      if (existing.queries.length < 5) {
        existing.queries.push(query);
      }
      tableQueryCounts.set(table, existing);
    }

    tableQueryCounts.forEach((data, tableName) => {
      if (data.count >= 10) {
        const dartFile = this._findDartFileForTable(dartFiles, tableName);
        if (!dartFile) return;

        const dartTable = dartFile.tables.find(
          (t) => t.sqlTableName === tableName,
        );
        const line = dartTable?.line ?? 0;

        const similarQueries = this._areSimilarQueries(data.queries);
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

  private _extractTableFromSql(sql: string): string | null {
    const fromMatch = sql.match(/FROM\s+"?(\w+)"?/i);
    if (fromMatch) return fromMatch[1];

    const insertMatch = sql.match(/INSERT\s+INTO\s+"?(\w+)"?/i);
    if (insertMatch) return insertMatch[1];

    const updateMatch = sql.match(/UPDATE\s+"?(\w+)"?/i);
    if (updateMatch) return updateMatch[1];

    const deleteMatch = sql.match(/DELETE\s+FROM\s+"?(\w+)"?/i);
    if (deleteMatch) return deleteMatch[1];

    return null;
  }

  private _truncateSql(sql: string, maxLen: number): string {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxLen) return normalized;
    return normalized.substring(0, maxLen - 3) + '...';
  }

  private _areSimilarQueries(queries: QueryEntry[]): boolean {
    if (queries.length < 2) return false;

    const normalized = queries.map((q) =>
      q.sql
        .replace(/\s+/g, ' ')
        .replace(/\d+/g, '?')
        .replace(/'[^']*'/g, '?')
        .toLowerCase()
        .trim(),
    );

    const first = normalized[0];
    return normalized.every((n) => n === first);
  }

  private _findDartFileForTable(
    files: IDartFileInfo[],
    tableName: string,
  ): IDartFileInfo | undefined {
    return files.find((f) =>
      f.tables.some((t) => t.sqlTableName.toLowerCase() === tableName.toLowerCase()),
    );
  }
}
