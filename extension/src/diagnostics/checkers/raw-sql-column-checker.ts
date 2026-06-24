/**
 * Validate column references inside raw SQL strings (`customSelect` /
 * `customStatement`) against the profiled database schema.
 *
 * Drift's typed query builder is schema-checked, but raw SQL is an opaque
 * string the compiler never validates — a column typo, or a name that does not
 * match Drift's snake_case acronym splitting (e.g. `UUID` -> `u_u_i_d`), only
 * surfaces as a runtime `SqliteException(1): no such column`. This checker joins
 * the raw-SQL extractor to the schema the other column checks already consume
 * and flags any referenced column absent from its table.
 *
 * Comparison is EXACT (case-insensitive, underscores preserved) — unlike the
 * acronym check in column-checker.ts which deliberately normalizes underscores.
 * SQLite matches column names exactly, so `contact_saropa_uuid` and the real
 * `contact_saropa_u_u_i_d` are different columns here even though they normalize
 * the same; that difference IS the bug this check catches.
 */

import * as vscode from 'vscode';
import type { TableMetadata } from '../../api-types';
import { TableNameMapper } from '../../codelens/table-name-mapper';
import { findClosestMatches } from '../../terminal/fuzzy-match';
import type { IDartFileInfo, IDiagnosticIssue } from '../diagnostic-types';
import { extractRawSqlColumnRefs } from './raw-sql-parser';

/** Convert an absolute character offset into a zero-based line/character. */
function offsetToPosition(
  text: string,
  offset: number,
): { line: number; character: number } {
  let line = 0;
  let lineStart = 0;
  const end = Math.min(offset, text.length);
  for (let i = 0; i < end; i++) {
    if (text[i] === '\n') {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, character: offset - lineStart };
}

/**
 * Emit `raw-sql-unknown-column` for every raw-SQL column reference that does not
 * exist in its (single, resolved) table's profiled column set.
 *
 * @param dbTableMap        Exact-name -> table metadata.
 * @param dbNormalizedMap   Underscore-stripped/lowered name -> table metadata,
 *                          so a Drift acronym-split table name still resolves to
 *                          the manually-created DB table (mirrors schema-provider).
 */
export function checkRawSqlColumns(
  issues: IDiagnosticIssue[],
  file: IDartFileInfo,
  dbTableMap: Map<string, TableMetadata>,
  dbNormalizedMap: Map<string, TableMetadata>,
): void {
  const refs = extractRawSqlColumnRefs(file.text);
  if (refs.length === 0) return;

  // Resolve a table name once per distinct table, then validate each column.
  const columnSetCache = new Map<string, Set<string> | null>();
  const columnNamesCache = new Map<string, string[]>();

  for (const ref of refs) {
    let columnSet = columnSetCache.get(ref.table);
    if (columnSet === undefined) {
      const dbTable =
        dbTableMap.get(ref.table) ??
        dbNormalizedMap.get(TableNameMapper.normalizeForComparison(ref.table));
      // Unknown table (CTE, temp table, sqlite_*, or not profiled) -> skip
      // silently; no schema to validate against.
      if (!dbTable || dbTable.columns.length === 0) {
        columnSetCache.set(ref.table, null);
        columnSet = null;
      } else {
        const names = dbTable.columns.map((c) => c.name);
        columnNamesCache.set(ref.table, names);
        columnSet = new Set(names.map((n) => n.toLowerCase()));
        columnSetCache.set(ref.table, columnSet);
      }
    }
    if (!columnSet) continue;

    if (columnSet.has(ref.column.toLowerCase())) continue;

    const pos = offsetToPosition(file.text, ref.offset);
    const range = new vscode.Range(
      pos.line,
      pos.character,
      pos.line,
      pos.character + ref.length,
    );

    // Suggest the closest real column when it is plausibly a typo / acronym
    // mistake rather than a wholly different word.
    const names = columnNamesCache.get(ref.table) ?? [];
    const closest = findClosestMatches(ref.column, names, 1)[0];
    const suggestThreshold = Math.max(3, Math.ceil(ref.column.length / 2));
    const didYouMean =
      closest && closest.distance <= suggestThreshold
        ? ` Did you mean "${closest.name}"?`
        : '';

    issues.push({
      code: 'raw-sql-unknown-column',
      message:
        `Column "${ref.column}" not found in table "${ref.table}".${didYouMean} ` +
        `Raw SQL column names must match the database exactly — reference the ` +
        `Drift getter's .name instead of hardcoding`,
      fileUri: file.uri,
      range,
      severity: vscode.DiagnosticSeverity.Warning,
      data: { tableName: ref.table, column: ref.column },
    });
  }
}
