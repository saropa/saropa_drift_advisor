/**
 * FilterSearchBridge: Connects Saved Filters and Global Search.
 *
 * Features:
 * - Apply saved filter WHERE clauses as global search presets
 * - Save global search results as new filters
 * - Suggest saved filters in global search based on query
 */

import type { DriftApiClient } from '../api-client';
import type { FilterStore } from '../filters/filter-store';
import type { ISavedFilter } from '../filters/filter-types';
import type { GlobalSearchEngine } from '../global-search/global-search-engine';
import type { ISearchResult, SearchMode } from '../global-search/global-search-types';

export interface IFilterSearchSuggestion {
  filter: ISavedFilter;
  relevance: 'high' | 'medium' | 'low';
  reason: string;
}

export class FilterSearchBridge {
  constructor(
    private readonly _filterStore: FilterStore,
    private readonly _searchEngine: GlobalSearchEngine,
    private readonly _client: DriftApiClient,
  ) {}

  /**
   * Get relevant saved filters that might help with a search query.
   * Suggests filters whose WHERE clause or table matches the search.
   */
  getSuggestedFilters(query: string): IFilterSearchSuggestion[] {
    const suggestions: IFilterSearchSuggestion[] = [];
    const queryLower = query.toLowerCase();

    for (const filter of this._filterStore.filters) {
      let relevance: 'high' | 'medium' | 'low' = 'low';
      let reason = '';

      if (filter.where?.toLowerCase().includes(queryLower)) {
        relevance = 'high';
        reason = `Filter WHERE clause contains "${query}"`;
      } else if (filter.table.toLowerCase().includes(queryLower)) {
        relevance = 'medium';
        reason = `Filter for table "${filter.table}"`;
      } else if (filter.name.toLowerCase().includes(queryLower)) {
        relevance = 'medium';
        reason = `Filter named "${filter.name}"`;
      }

      if (relevance !== 'low' || filter.where?.includes(query)) {
        suggestions.push({ filter, relevance, reason });
      }
    }

    return suggestions.sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 };
      return order[a.relevance] - order[b.relevance];
    });
  }

  /**
   * Create a saved filter from a global search result.
   * Generates a WHERE clause that would find the same rows.
   */
  createFilterFromSearch(
    result: ISearchResult,
    tableName: string,
    filterName: string,
  ): ISavedFilter {
    const matches = result.matches.filter((m) => m.table === tableName);

    let whereClause: string;
    if (result.mode === 'exact') {
      const conditions = matches.map((m) =>
        `"${m.column}" = '${String(m.matchedValue).replace(/'/g, "''")}'`,
      );
      whereClause = [...new Set(conditions)].join(' OR ');
    } else if (result.mode === 'contains') {
      const conditions = matches.map((m) =>
        `"${m.column}" LIKE '%${String(m.matchedValue).replace(/'/g, "''")}%'`,
      );
      whereClause = [...new Set(conditions)].join(' OR ');
    } else {
      whereClause = `1=1`;
    }

    return {
      id: '',
      name: filterName,
      table: tableName,
      where: whereClause,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  /**
   * Run a saved filter's WHERE clause as a global search.
   * Useful for searching the filter pattern across all tables.
   */
  async searchWithFilterPattern(
    filter: ISavedFilter,
    mode: SearchMode = 'contains',
  ): Promise<ISearchResult> {
    if (!filter.where) {
      return {
        query: '',
        mode,
        matches: [],
        tablesSearched: 0,
        durationMs: 0,
      };
    }

    const valueMatch = filter.where.match(/['"]([^'"]+)['"]/);
    const searchValue = valueMatch?.[1] ?? filter.where;

    return this._searchEngine.search(searchValue, mode, 'all');
  }

  /**
   * Get all filters that could apply to search results.
   * Returns filters for tables that appear in the search results.
   */
  getApplicableFilters(result: ISearchResult): Map<string, ISavedFilter[]> {
    const tableNames = new Set(result.matches.map((m) => m.table));
    const applicable = new Map<string, ISavedFilter[]>();

    for (const table of tableNames) {
      const filters = this._filterStore.forTable(table);
      if (filters.length > 0) {
        applicable.set(table, filters);
      }
    }

    return applicable;
  }

  /**
   * Convert a global search query to a WHERE clause template.
   */
  queryToWhereClause(query: string, mode: SearchMode, column?: string): string {
    const escaped = query.replace(/'/g, "''");
    const target = column ? `"${column}"` : 'column_name';

    switch (mode) {
      case 'exact':
        return `${target} = '${escaped}'`;
      case 'contains':
        return `${target} LIKE '%${escaped}%'`;
      case 'regex':
        return `${target} LIKE '%${escaped}%'`;
      default:
        return `${target} = '${escaped}'`;
    }
  }
}
