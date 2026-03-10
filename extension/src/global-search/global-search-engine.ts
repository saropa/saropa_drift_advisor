/**
 * Builds per-table SQL queries and aggregates search results
 * across all tables in the database.
 */

import { DriftApiClient } from '../api-client';
import { zipRow } from '../shared-utils';
import type {
  ISearchMatch, ISearchResult, SearchMode, SearchScope,
} from './global-search-types';

/** Maximum rows returned per table to prevent memory issues. */
const PER_TABLE_LIMIT = 100;

export class GlobalSearchEngine {
  constructor(private readonly _client: DriftApiClient) {}

  async search(
    query: string,
    mode: SearchMode,
    scope: SearchScope,
  ): Promise<ISearchResult> {
    const meta = await this._client.schemaMetadata();
    const start = Date.now();
    const matches: ISearchMatch[] = [];

    const tables = meta.filter((t) => !t.name.startsWith('sqlite_'));

    await Promise.all(tables.map(async (table) => {
      const cols = scope === 'text_only'
        ? table.columns.filter((c) => isTextType(c.type))
        : table.columns;

      if (cols.length === 0) return;

      const pkCol = table.columns.find((c) => c.pk)?.name ?? 'rowid';
      const conditions = cols.map(
        (c) => buildCondition(c.name, query, mode),
      );
      const where = conditions.join(' OR ');
      const sql =
        `SELECT * FROM "${table.name}" WHERE ${where} LIMIT ${PER_TABLE_LIMIT}`;

      try {
        const result = await this._client.sql(sql);
        const colNames = result.columns;

        for (const row of result.rows) {
          const obj = zipRow(colNames, row);
          for (const col of cols) {
            const val = String(obj[col.name] ?? '');
            if (matchesValue(val, query, mode)) {
              matches.push({
                table: table.name,
                column: col.name,
                rowPk: obj[pkCol],
                pkColumn: pkCol,
                matchedValue: val,
                row: obj,
              });
            }
          }
        }
      } catch {
        // Table may have been dropped between metadata fetch and query
      }
    }));

    return {
      query,
      mode,
      matches,
      tablesSearched: tables.length,
      durationMs: Date.now() - start,
    };
  }
}


/** Build a SQL WHERE condition for a single column. */
export function buildCondition(
  column: string, query: string, mode: SearchMode,
): string {
  const escaped = query.replace(/'/g, "''");
  switch (mode) {
    case 'exact':
      return `CAST("${column}" AS TEXT) = '${escaped}'`;
    case 'contains':
      return `CAST("${column}" AS TEXT) LIKE '%${escapeLike(escaped)}%' ESCAPE '\\'`;
    case 'regex':
      // SQLite has no REGEXP by default; use LIKE then post-filter with JS
      return `CAST("${column}" AS TEXT) LIKE '%${escapeLike(escaped)}%' ESCAPE '\\'`;
    default:
      return `CAST("${column}" AS TEXT) = '${escaped}'`;
  }
}

/** Escape LIKE wildcards so they are matched literally. */
function escapeLike(value: string): string {
  return value.replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/** Check if a string value matches the search query on the JS side. */
export function matchesValue(
  value: string, query: string, mode: SearchMode,
): boolean {
  switch (mode) {
    case 'exact': return value === query;
    case 'contains': return value.includes(query);
    case 'regex':
      try { return new RegExp(query).test(value); }
      catch { return false; }
    default: return false;
  }
}

/** Check if a column type is text-like. */
export function isTextType(type: string): boolean {
  const upper = type.toUpperCase();
  return upper.includes('TEXT')
    || upper.includes('VARCHAR')
    || upper.includes('CHAR');
}

/** Group search matches by table name for display. */
export function groupByTable(
  matches: ISearchMatch[],
): Map<string, ISearchMatch[]> {
  const groups = new Map<string, ISearchMatch[]>();
  for (const match of matches) {
    const group = groups.get(match.table) ?? [];
    group.push(match);
    groups.set(match.table, group);
  }
  return groups;
}
