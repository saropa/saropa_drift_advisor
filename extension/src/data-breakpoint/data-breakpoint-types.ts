/** Type of data breakpoint trigger. */
export type DataBreakpointType =
  | 'rowChanged'
  | 'rowInserted'
  | 'rowDeleted'
  | 'conditionMet';

/** Persistent definition of a single data breakpoint. */
export interface IDataBreakpoint {
  id: string;
  label: string;
  table: string;
  type: DataBreakpointType;
  /** SQL query for conditionMet type. */
  condition?: string;
  enabled: boolean;
  /** Stored row count for insert/delete detection. */
  lastRowCount?: number;
  /** Serialised row snapshot for change detection. */
  lastRowHash?: string;
  hitCount: number;
}

/** Result of a breakpoint evaluation that triggered. */
export interface IBreakpointHit {
  breakpoint: IDataBreakpoint;
  matchCount: number;
  message?: string;
  rows?: unknown[][];
}
