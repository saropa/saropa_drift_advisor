/** Shared types for the cross-table global search feature. */

export type SearchMode = 'exact' | 'contains' | 'regex';
export type SearchScope = 'all' | 'text_only';

export interface ISearchMatch {
  table: string;
  column: string;
  rowPk: unknown;
  pkColumn: string;
  matchedValue: string;
  row: Record<string, unknown>;
}

export interface ISearchResult {
  query: string;
  mode: SearchMode;
  matches: ISearchMatch[];
  tablesSearched: number;
  durationMs: number;
}
