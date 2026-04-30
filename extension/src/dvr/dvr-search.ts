/**
 * Client-side filtering and semantic search for DVR timeline rows.
 */

import type { IRecordedQueryV1 } from '../api-types';

export type DvrQueryKindFilter = 'all' | 'reads' | 'writes';

export interface IDvrSearchOptions {
  /** Case-insensitive substring match against SQL. */
  text: string;
  kind: DvrQueryKindFilter;
  /** When set, `table` must match (case-insensitive), or rows with null table are excluded. */
  tableSubstring: string;
}

/** One match from [searchRecordedQueries] (plan Feature 26). */
export interface IDvrSearchResult {
  queryId: number;
  matchType: 'table' | 'column' | 'value' | 'sql';
  highlight: string;
}

const writeTypes = new Set(['insert', 'update', 'delete']);

/**
 * Returns entries from [queries] that satisfy [options].
 */
export function filterRecordedQueries(
  queries: readonly IRecordedQueryV1[],
  options: IDvrSearchOptions,
): IRecordedQueryV1[] {
  const t = options.text.trim().toLowerCase();
  const tbl = options.tableSubstring.trim().toLowerCase();
  return queries.filter((q) => {
    if (t.length > 0 && !q.sql.toLowerCase().includes(t)) {
      return false;
    }
    if (options.kind === 'reads' && writeTypes.has(q.type)) {
      return false;
    }
    if (options.kind === 'writes' && !writeTypes.has(q.type)) {
      return false;
    }
    if (tbl.length > 0) {
      const qt = (q.table ?? '').toLowerCase();
      if (!qt.includes(tbl)) {
        return false;
      }
    }
    return true;
  });
}

function rowValuesContain(row: Record<string, unknown>, lower: string): boolean {
  for (const [col, val] of Object.entries(row)) {
    if (col.toLowerCase().includes(lower)) {
      return true;
    }
    if (String(val).toLowerCase().includes(lower)) {
      return true;
    }
  }
  return false;
}

/**
 * Searches SQL, table name, and before/after row payloads (plan § Extension-Side DVR Search).
 *
 * Deduplicates by `queryId + matchType + highlight`. Empty [term] yields [].
 */
export function searchRecordedQueries(
  queries: readonly IRecordedQueryV1[],
  term: string,
): IDvrSearchResult[] {
  const lower = term.toLowerCase().trim();
  if (!lower) {
    return [];
  }

  const results: IDvrSearchResult[] = [];

  for (const q of queries) {
    if (q.sql.toLowerCase().includes(lower)) {
      results.push({ queryId: q.id, matchType: 'sql', highlight: q.sql });
    }
    if (q.table !== null && q.table.toLowerCase().includes(lower)) {
      results.push({ queryId: q.id, matchType: 'table', highlight: q.table });
    }
    for (const row of [...(q.beforeState ?? []), ...(q.afterState ?? [])]) {
      if (rowValuesContain(row as Record<string, unknown>, lower)) {
        const preview = Object.entries(row)
          .slice(0, 4)
          .map(([k, v]) => `${k}: ${String(v)}`)
          .join(', ');
        results.push({ queryId: q.id, matchType: 'value', highlight: preview || '(row)' });
        break;
      }
    }
  }

  const dedup = new Map<string, IDvrSearchResult>();
  for (const r of results) {
    dedup.set(`${r.queryId}:${r.matchType}:${r.highlight}`, r);
  }
  return [...dedup.values()];
}
