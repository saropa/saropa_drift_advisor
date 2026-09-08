/**
 * Table-level schema checks: missing table in DB, extra table in DB,
 * and FTS/platform shadow-table filtering.
 */

import * as vscode from 'vscode';
import type { TableMetadata } from '../../api-types';
import type { IDartTable } from '../../schema-diff/dart-schema';
import type { IDartFileInfo } from '../diagnostic-context-types';
import type { IDiagnosticIssue } from '../diagnostic-issue-types';
import { TableNameMapper } from '../../codelens/table-name-mapper';

/**
 * Suffixes that SQLite FTS3/FTS4/FTS5 virtual tables create as shadow tables.
 * FTS5 uses: _data, _idx, _content, _docsize, _config.
 * FTS3/FTS4 use: _content, _segments, _segdir, _stat, _docsize.
 * We include all variants so the filter covers every FTS generation.
 */
const FTS_SHADOW_SUFFIXES = [
  '_data',
  '_idx',
  '_content',
  '_docsize',
  '_config',
  '_segments',
  '_segdir',
  '_stat',
] as const;

/**
 * Tables created by the Android platform SQLite wrapper, not by user code.
 * These are engine-owned and should never trigger extra-table-in-db.
 */
const PLATFORM_OWNED_TABLES = new Set([
  'android_metadata',
]);

/**
 * Minimum number of FTS shadow siblings that must exist alongside the parent
 * table before we classify a table as a shadow. A single suffix match (e.g.
 * `user_data` where `user` exists) is ambiguous — `_data` is a common naming
 * convention for regular tables. Real FTS virtual tables always create ALL
 * their shadow tables together (5 for FTS5, 4 for FTS3/4), so requiring 3+
 * siblings eliminates virtually all false positives while keeping detection
 * reliable. See review finding on BUG_EXTRA_TABLE_IN_DB_FALSE_POSITIVE.
 */
const MIN_FTS_SHADOW_SIBLINGS = 3;

/**
 * Checks whether `tableName` is an FTS shadow table — i.e. it ends with a
 * known FTS suffix, the prefix before that suffix is itself a table in the
 * database, AND at least MIN_FTS_SHADOW_SIBLINGS other shadow tables with
 * the same prefix exist. The sibling requirement prevents false positives
 * where a legitimate user table like `user_data` happens to share a suffix
 * with an FTS shadow while `user` also exists.
 */
export function isFtsShadowTable(
  tableName: string,
  allDbTableNames: ReadonlySet<string>,
): boolean {
  for (const suffix of FTS_SHADOW_SUFFIXES) {
    if (tableName.endsWith(suffix)) {
      // Extract the prefix — must itself be a known DB table (the parent
      // virtual table) to confirm this is a shadow, not a coincidence.
      const prefix = tableName.slice(0, -suffix.length);
      if (prefix.length > 0 && allDbTableNames.has(prefix)) {
        // Count how many other FTS shadow suffixes also exist for this prefix.
        // Real FTS tables create all shadows together; a lone `_data` without
        // `_idx`, `_content`, etc. is almost certainly a regular user table.
        const siblingCount = FTS_SHADOW_SUFFIXES.filter(
          (s) => s !== suffix && allDbTableNames.has(prefix + s),
        ).length;
        if (siblingCount >= MIN_FTS_SHADOW_SIBLINGS) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Returns true when `tableName` is engine-owned and should be excluded
 * from extra-table-in-db checks. Covers:
 *  - `sqlite_*` internal tables (filtered upstream by SchemaProvider)
 *  - FTS3/FTS4/FTS5 shadow tables (detected by parent-table presence)
 *  - Platform-injected tables like `android_metadata`
 */
export function isEngineOwnedTable(
  tableName: string,
  allDbTableNames: ReadonlySet<string>,
): boolean {
  // Platform-injected tables (android_metadata, etc.)
  if (PLATFORM_OWNED_TABLES.has(tableName)) {
    return true;
  }

  // FTS virtual-table shadow tables
  if (isFtsShadowTable(tableName, allDbTableNames)) {
    return true;
  }

  return false;
}

/**
 * Report when a Dart table has no matching database table.
 */
export function checkMissingTableInDb(
  issues: IDiagnosticIssue[],
  file: IDartFileInfo,
  dartTable: IDartTable,
  dbTable: TableMetadata | undefined,
): void {
  if (!dbTable) {
    issues.push({
      code: 'missing-table-in-db',
      message: `Table "${dartTable.sqlTableName}" defined in Dart but missing from database`,
      fileUri: file.uri,
      range: new vscode.Range(dartTable.line, 0, dartTable.line, 999),
      severity: vscode.DiagnosticSeverity.Error,
    });
  }
}

/**
 * Report when the database has tables not defined in any Dart file.
 *
 * The diagnostic is attached to the Dart file with the most table definitions
 * (the likely "primary schema" file) rather than an arbitrary first file,
 * so the warning appears in a contextually relevant location.
 */
export function checkExtraTablesInDb(
  issues: IDiagnosticIssue[],
  dbTableMap: Map<string, TableMetadata>,
  dartFiles: IDartFileInfo[],
): void {
  if (dartFiles.length === 0) return;

  // Build both exact and normalized (underscore-stripped) sets of Dart table names
  // so we can match DB tables even when acronym casing differs
  // (e.g. Drift's "superhero_d_c_characters" vs DB's "superhero_dc_characters")
  const dartTableNames = new Set<string>();
  const dartNormalizedNames = new Set<string>();
  for (const file of dartFiles) {
    for (const table of file.tables) {
      dartTableNames.add(table.sqlTableName);
      dartNormalizedNames.add(
        TableNameMapper.normalizeForComparison(table.sqlTableName),
      );
    }
  }

  // Pick the file with the most table definitions as the report target —
  // it's the most likely "primary schema" file and gives the developer
  // better context than an arbitrary dartFiles[0].
  const targetFile = dartFiles.reduce((best, file) =>
    file.tables.length > best.tables.length ? file : best,
  );

  dbTableMap.forEach((_, tableName) => {
    // Check exact match first, then fall back to normalized comparison
    const normalized = TableNameMapper.normalizeForComparison(tableName);
    if (!dartTableNames.has(tableName) && !dartNormalizedNames.has(normalized)) {
      issues.push({
        code: 'extra-table-in-db',
        message: `Table "${tableName}" exists in database but not in Dart`,
        fileUri: targetFile.uri,
        range: new vscode.Range(0, 0, 0, 999),
        severity: vscode.DiagnosticSeverity.Information,
      });
    }
  });
}
