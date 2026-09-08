import * as vscode from 'vscode';
import type { ISizeAnalytics } from '../../api-types';
import type { IDiagnosticContext } from '../diagnostic-context-types';
import type { IDiagnosticIssue } from '../diagnostic-issue-types';
import { findDartFileForTable } from '../utils/dart-file-utils';
import { isEngineOwnedTable } from '../checkers/table-checker';

/** Threshold for data skew warning (percentage of total rows). */
const DATA_SKEW_THRESHOLD = 50;

/**
 * How many multiples of the expected even share a table must exceed before the
 * skew rule fires. With n tables the even share is 100/n, so the adaptive
 * threshold is `expectedShare * SKEW_MULTIPLE`. For small table counts this
 * pushes the threshold above 100% (unreachable), silencing the rule where a
 * fixed 50% fires on any uneven split.
 * See BUG_DATA_SKEW_FALSE_POSITIVE_SMALL_TABLE_COUNT.
 */
const SKEW_MULTIPLE = 3;

/**
 * Absolute floor on total database rows before skew percentages carry meaning.
 * A 10-row debug database can trivially show 80% in one table without any
 * architectural concern. Mirrors the reasoning behind MIN_ROWS_FOR_ANALYSIS
 * for null rates.
 */
const MIN_ROWS_FOR_SKEW = 1000;

/**
 * Flag a table that holds a disproportionate share of all database rows.
 *
 * The threshold adapts to table count: with few tables the even share is
 * already large, so a fixed 50% fires on nearly every uneven split (the
 * false positive this fixes). The adaptive threshold requires a table to
 * exceed `SKEW_MULTIPLE` times the expected even share, which makes the
 * rule unreachable for 2-3 table schemas and progressively more sensitive
 * as the schema grows. See BUG_DATA_SKEW_FALSE_POSITIVE_SMALL_TABLE_COUNT.
 */
export function checkDataSkew(
  issues: IDiagnosticIssue[],
  sizeAnalytics: ISizeAnalytics,
  ctx: IDiagnosticContext,
): void {
  const tableSizes = sizeAnalytics.tables ?? [];

  // Fast exit: fewer than 2 raw tables means skew is meaningless even
  // before any exclusion filtering.
  if (tableSizes.length < 2) return;

  // Tables whose live debug rows are unrepresentative (user/demo data, or
  // static reference tables loaded lazily/partially). Their row counts
  // should not drive a share statistic. Mirrors checkHighNullRates.
  const userDataTables = ctx.config.userDataTables ?? new Set<string>();

  // All DB table names for FTS shadow detection — isFtsShadowTable needs
  // the full set to find parent virtual tables and count siblings.
  const allDbTableNames = new Set(tableSizes.map((t) => t.table));

  // Filter excluded tables from the denominator so their rows don't
  // dilute the percentages of the remaining tables. Excludes:
  // - user-configured data tables (unrepresentative debug data)
  // - sqlite_* internal tables (sqlite_sequence, sqlite_stat1, etc.)
  // - engine-owned tables (android_metadata, FTS shadow tables)
  const includedTables = tableSizes.filter(
    (t) =>
      !userDataTables.has(t.table) &&
      !t.table.startsWith('sqlite_') &&
      !isEngineOwnedTable(t.table, allDbTableNames),
  );

  // A single table is 100% by definition — not skew.
  if (includedTables.length < 2) return;

  const totalRows = includedTables.reduce((sum, t) => sum + t.rowCount, 0);
  if (totalRows === 0) return;

  // Percentages of a tiny database carry no information — a 10-row debug
  // database can show 80% in one table without any architectural concern.
  if (totalRows < MIN_ROWS_FOR_SKEW) return;

  // With n tables the expected even share is 100/n. A fixed 50% threshold
  // fires at 1x expected for n=2 (any uneven split) and 10x expected for
  // n=20. Instead, require SKEW_MULTIPLE times the expected share, floored
  // at the original DATA_SKEW_THRESHOLD so large schemas keep the 50% bar.
  const expectedShare = 100 / includedTables.length;
  const adaptiveThreshold = Math.max(
    DATA_SKEW_THRESHOLD,
    expectedShare * SKEW_MULTIPLE,
  );

  for (const table of includedTables) {
    const percentage = (table.rowCount / totalRows) * 100;

    if (percentage > adaptiveThreshold) {
      const dartFile = findDartFileForTable(ctx.dartFiles, table.table);
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
