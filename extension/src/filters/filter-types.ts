/** A persisted filter/sort/column-visibility configuration for a table. */
export interface ISavedFilter {
  id: string;
  name: string;
  table: string;
  /** SQL WHERE clause body (without the WHERE keyword). */
  where?: string;
  /** e.g. "created_at DESC" */
  orderBy?: string;
  /** Visible columns (undefined = all). */
  columns?: string[];
  createdAt: number;
  updatedAt: number;
}

// --- Webview → Extension messages ---

interface IGetFiltersMsg {
  command: 'getFilters';
  table: string;
}

interface ISaveFilterMsg {
  command: 'saveFilter';
  filter: ISavedFilter;
}

interface IApplyFilterMsg {
  command: 'applyFilter';
  filterId: string;
}

interface IDeleteFilterMsg {
  command: 'deleteFilter';
  filterId: string;
}

interface IClearFilterMsg {
  command: 'clearFilter';
}

/** Discriminated union of all filter-related webview messages. */
export type FilterMessage =
  | IGetFiltersMsg | ISaveFilterMsg | IApplyFilterMsg
  | IDeleteFilterMsg | IClearFilterMsg;
