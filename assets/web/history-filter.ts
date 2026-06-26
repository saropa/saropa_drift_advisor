/**
 * Pure matching logic for the History sidebar's filters, split out of the
 * DOM-coupled history-sidebar.ts so it can be unit-tested in isolation (the
 * sidebar module's transitive imports touch the DOM at load and cannot run
 * under `node --test`). Mirrors the schema-explorer-logic.ts / home-search.ts
 * convention of isolating testable predicates from rendering.
 */

/** Minimal shape the filter needs from a history entry. */
export interface HistoryFilterEntry {
  sql: string;
  source: string;
}

/**
 * True when an entry passes both the active source filter and the free-text
 * SQL search. `sourceFilter` is 'all' (matches every source) or an exact
 * source name. `query` is matched as a case-insensitive substring of the SQL;
 * an empty/blank query imposes no text constraint.
 *
 * Source is tested before the substring so the common all-sources path skips
 * straight to the text check, and an empty query short-circuits to a pure
 * source filter.
 */
export function entryMatchesHistoryFilter(
  entry: HistoryFilterEntry,
  sourceFilter: string,
  query: string,
): boolean {
  if (sourceFilter !== 'all' && entry.source !== sourceFilter) return false;
  const needle = query.trim().toLowerCase();
  if (needle && entry.sql.toLowerCase().indexOf(needle) < 0) return false;
  return true;
}
