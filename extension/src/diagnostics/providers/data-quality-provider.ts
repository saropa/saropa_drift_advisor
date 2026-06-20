import * as vscode from 'vscode';
import type { ISizeAnalytics, TableMetadata } from '../../api-types';
import type {
  DiagnosticCategory,
  IDartFileInfo,
  IDiagnosticContext,
  IDiagnosticIssue,
  IDiagnosticProvider,
} from '../diagnostic-types';
import { findDartFileForTable } from '../utils/dart-file-utils';
import type { IDartColumn } from '../../schema-diff/dart-schema';

/** Threshold for high null rate warning (percentage). */
const HIGH_NULL_RATE_THRESHOLD = 50;

/**
 * Column-name suffixes whose NULLs are intentional by convention, so a high
 * null rate on them is signal-free noise rather than a data-quality finding:
 *
 * - `_at`: nullable event timestamps (`deleted_at`, `blocked_at`, `favorite_at`)
 *   where NULL means "the event has not happened" — the common state.
 * - `_phonetic`: search-helper columns populated only when a phonetic variant
 *   exists, so mostly NULL by design.
 *
 * Gated on the column being nullable (a non-nullable column can never be NULL,
 * so the suffix is irrelevant), which also keeps a non-nullable `created_at`
 * from being matched. See BUG_data_quality_null_checker_false_positives.
 */
const NULL_BY_DESIGN_NAME_SUFFIXES = ['_at', '_phonetic'];

/** Threshold for data skew warning (percentage of total rows). */
const DATA_SKEW_THRESHOLD = 50;

/** Minimum rows to consider for null rate analysis. */
const MIN_ROWS_FOR_ANALYSIS = 10;

/**
 * Upper row bound for the inline null-rate scan. The scan is a full-table
 * aggregate — SUM(CASE WHEN col IS NULL ...) over every column reads every row
 * — so on a large table it is a multi-hundred-ms scan. Run automatically across
 * all tables over the app's single live debug connection, those scans were a
 * primary contributor to the startup freeze (BUG_STARTUP_HANG). Past this size
 * the scan costs more than the passive diagnostic is worth; the same per-column
 * null stats remain available on demand via the "Profile Column" action.
 */
const MAX_ROWS_FOR_NULL_SCAN = 100_000;

/**
 * Data quality diagnostic provider.
 * Reports data quality issues including:
 * - High null rates in columns
 * - Data skew (one table dominates row count)
 * - Statistical outliers
 */
export class DataQualityProvider implements IDiagnosticProvider {
  readonly id = 'dataQuality';
  readonly category: DiagnosticCategory = 'dataQuality';

  async collectDiagnostics(ctx: IDiagnosticContext): Promise<IDiagnosticIssue[]> {
    const issues: IDiagnosticIssue[] = [];

    try {
      const [tables, sizeAnalytics] = await Promise.all([
        ctx.client.schemaMetadata(),
        ctx.client.sizeAnalytics(),
      ]);

      const userTables = tables.filter((t) => !t.name.startsWith('sqlite_'));

      this._checkDataSkew(issues, sizeAnalytics, ctx.dartFiles);
      await this._checkHighNullRates(issues, userTables, ctx);
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

    // Let users disable any data-quality rule straight from the lightbulb,
    // matching naming/best-practice/runtime/compliance providers. Previously
    // these codes had no "Disable rule" action, forcing a manual settings edit.
    const disableAction = new vscode.CodeAction(
      `Disable "${code}" rule`,
      vscode.CodeActionKind.QuickFix,
    );
    disableAction.command = {
      command: 'driftViewer.disableDiagnosticRule',
      title: 'Disable Rule',
      arguments: [code],
    };
    actions.push(disableAction);

    if (code === 'high-null-rate' || code === 'unused-column') {
      const data = (diag as any).data;
      if (data?.table && data?.column) {
        const profileAction = new vscode.CodeAction(
          'Profile Column',
          vscode.CodeActionKind.QuickFix,
        );
        profileAction.command = {
          command: 'driftViewer.profileColumn',
          title: 'Profile Column',
          arguments: [{ table: data.table, column: data.column }],
        };
        actions.push(profileAction);
      }
    }

    if (code === 'data-skew') {
      const sizeAction = new vscode.CodeAction(
        'View Size Analytics',
        vscode.CodeActionKind.QuickFix,
      );
      sizeAction.command = {
        command: 'driftViewer.sizeAnalytics',
        title: 'Size Analytics',
      };
      actions.push(sizeAction);
    }

    return actions;
  }

  dispose(): void {}

  private _checkDataSkew(
    issues: IDiagnosticIssue[],
    sizeAnalytics: ISizeAnalytics,
    dartFiles: IDartFileInfo[],
  ): void {
    const tableSizes = sizeAnalytics.tables ?? [];
    if (tableSizes.length < 2) return;

    const totalRows = tableSizes.reduce((sum, t) => sum + t.rowCount, 0);
    if (totalRows === 0) return;

    for (const table of tableSizes) {
      const percentage = (table.rowCount / totalRows) * 100;

      if (percentage > DATA_SKEW_THRESHOLD) {
        const dartFile = findDartFileForTable(dartFiles, table.table);
        if (!dartFile) continue;

        const dartTable = dartFile.tables.find(
          (t) => t.sqlTableName === table.table,
        );
        const line = dartTable?.line ?? 0;

        issues.push({
          code: 'data-skew',
          message: `Table "${table.table}" has ${percentage.toFixed(0)}% of all database rows (data skew)`,
          fileUri: dartFile.uri,
          range: new vscode.Range(line, 0, line, 999),
          severity: vscode.DiagnosticSeverity.Information,
          data: { table: table.table, percentage },
        });
      }
    }
  }

  private async _checkHighNullRates(
    issues: IDiagnosticIssue[],
    tables: TableMetadata[],
    ctx: IDiagnosticContext,
  ): Promise<void> {
    // Tables whose live debug rows are unrepresentative — user/demo data, or
    // static reference tables loaded lazily/partially in a debug session. A
    // null rate computed on a partial table says nothing about the source data,
    // so the rule must not run there at all (FP-1 in the bug report).
    const userDataTables = ctx.config.userDataTables ?? new Set<string>();

    for (const table of tables) {
      if (userDataTables.has(table.name)) continue;
      if (table.rowCount < MIN_ROWS_FOR_ANALYSIS) continue;
      // Skip the full-table null scan on very large tables — its cost on the
      // live debug connection outweighs the passive diagnostic. See
      // MAX_ROWS_FOR_NULL_SCAN and
      // plans/history/2026.06/2026.06.17/BUG_STARTUP_HANG.md.
      if (table.rowCount > MAX_ROWS_FOR_NULL_SCAN) continue;

      const dartFile = findDartFileForTable(ctx.dartFiles, table.name);
      if (!dartFile) continue;

      const dartTable = dartFile.tables.find(
        (t) => t.sqlTableName === table.name,
      );
      if (!dartTable) continue;

      try {
        const nullCounts = await this._queryNullCounts(ctx, table);

        for (const col of table.columns) {
          const nullCount = nullCounts.get(col.name) ?? 0;
          const nullPct = (nullCount / table.rowCount) * 100;

          if (nullPct >= HIGH_NULL_RATE_THRESHOLD) {
            const dartCol = dartTable.columns.find(
              (c) => c.sqlName === col.name,
            );

            // Skip columns whose NULLs are intentional by declaration or naming
            // convention (defaulted / autoincrement / event-timestamp /
            // phonetic-helper columns). These are correct to be mostly or
            // entirely NULL, so flagging them is pure noise (FP-2 in the bug
            // report). Only suppress when the Dart declaration is known; an
            // unmatched column still reports so genuine gaps are not hidden.
            if (dartCol && this._isNullByDesign(dartCol)) continue;

            const line = dartCol?.line ?? dartTable.line;

            // A column that is entirely NULL (no row sets a value) is an
            // "unused column" — a different finding from a merely high null
            // rate. Emit a distinct code so users can act on / suppress it
            // separately. Compare on the raw count, not the rounded percent,
            // so 99.6% rounding up to "100%" is NOT misclassified as unused.
            const isEntirelyNull = nullCount >= table.rowCount;

            issues.push(
              isEntirelyNull
                ? {
                    code: 'unused-column',
                    message: `Column "${table.name}.${col.name}" is 100% NULL — no row sets a value (unused column)`,
                    fileUri: dartFile.uri,
                    range: new vscode.Range(line, 0, line, 999),
                    severity: vscode.DiagnosticSeverity.Information,
                    data: { table: table.name, column: col.name, nullPct },
                  }
                : {
                    code: 'high-null-rate',
                    message: `Column "${table.name}.${col.name}" has ${nullPct.toFixed(0)}% NULL values`,
                    fileUri: dartFile.uri,
                    range: new vscode.Range(line, 0, line, 999),
                    severity: vscode.DiagnosticSeverity.Information,
                    data: { table: table.name, column: col.name, nullPct },
                  },
            );
          }
        }
      } catch {
        // Skip table if null count query fails
      }
    }
  }

  /**
   * True when a column's NULLs are intentional, so a high null rate on it is
   * not a data-quality finding. Three independent signals:
   *
   * - `.withDefault(...)` / `.clientDefault(...)`: the value comes from the
   *   default, not from every insert, so unset rows are correctly NULL.
   * - `.autoIncrement()`: the column is engine-populated; a NULL/default is
   *   intentional rather than missing content.
   * - a null-by-design name suffix on a nullable column (`*_at`, `*_phonetic`).
   *
   * See BUG_data_quality_null_checker_false_positives (FP-2).
   */
  private _isNullByDesign(col: IDartColumn): boolean {
    if (col.hasDefault === true) return true;
    if (col.autoIncrement) return true;

    if (col.nullable) {
      const name = col.sqlName.toLowerCase();
      if (NULL_BY_DESIGN_NAME_SUFFIXES.some((suffix) => name.endsWith(suffix))) {
        return true;
      }
    }

    return false;
  }

  private async _queryNullCounts(
    ctx: IDiagnosticContext,
    table: TableMetadata,
  ): Promise<Map<string, number>> {
    const nullCounts = new Map<string, number>();

    const nullExprs = table.columns.map(
      (c) => `SUM(CASE WHEN "${this._escapeSql(c.name)}" IS NULL THEN 1 ELSE 0 END) AS "${this._escapeSql(c.name)}_nulls"`,
    );

    const sql = `SELECT ${nullExprs.join(', ')} FROM "${this._escapeSql(table.name)}"`;

    try {
      // Mark as internal: this is an extension-owned diagnostic probe, not
      // an app query. Without the flag the server records it in the normal
      // perf pool, and `detectRegressions` then compares the probe's
      // current-session duration against a baseline captured from a prior
      // run of the probe itself — a feedback loop that produces one false
      // regression warning per probed table, every debug session. See
      // BUG_perf_regression_false_positives_from_data_quality_probes.md.
      const result = await ctx.client.sql(sql, { internal: true });
      if (result.rows.length > 0) {
        const row = result.rows[0];
        for (let i = 0; i < table.columns.length; i++) {
          const count = Number(row[i]) || 0;
          nullCounts.set(table.columns[i].name, count);
        }
      }
    } catch {
      // Query failed, return empty map
    }

    return nullCounts;
  }

  private _escapeSql(name: string): string {
    return name.replace(/"/g, '""');
  }
}
