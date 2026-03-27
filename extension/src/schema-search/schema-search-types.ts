/** Shared types for the schema search + cross-reference feature. */

import type { DiscoveryUiState } from '../server-discovery';

export type SchemaSearchScope = 'all' | 'tables' | 'columns';

export interface ISchemaMatch {
  type: 'table' | 'column';
  table: string;
  column?: string;
  columnType?: string;
  isPk?: boolean;
  /** Row count for table-type matches. */
  rowCount?: number;
  /** Column count for table-type matches. */
  columnCount?: number;
  /** Other tables containing a column with the same name. */
  alsoIn?: string[];
}

export interface ICrossReference {
  columnName: string;
  tables: string[];
  missingFks: Array<{ from: string; to: string }>;
}

export interface ISchemaSearchResult {
  query: string;
  matches: ISchemaMatch[];
  crossReferences: ICrossReference[];
}

/** Messages sent from the webview to the extension host. */
export type SchemaSearchMessage =
  | { command: 'search'; query: string; scope: SchemaSearchScope; typeFilter?: string }
  | { command: 'searchAll' }
  | { command: 'navigate'; table: string; column?: string; openSource?: boolean }
  | { command: 'retry' }
  | { command: 'openConnectionLog' }
  | { command: 'retryDiscovery' }
  | { command: 'diagnoseConnection' }
  | { command: 'refreshConnectionUi' }
  | { command: 'pauseDiscovery' }
  | { command: 'resumeDiscovery' }
  | { command: 'openConnectionHelp' }
  | { command: 'openInBrowser' }
  | { command: 'showTroubleshooting' }
  | { command: 'forwardPortAndroid' }
  | { command: 'selectServer' }
  | { command: 'openGettingStarted' }
  | { command: 'openReportIssue' }
  | { command: 'ready' };

/** Messages sent from the extension host to the webview. */
export type SchemaSearchHostMessage =
  | { command: 'loading' }
  | { command: 'results'; result: ISchemaSearchResult; crossRefs: ICrossReference[] }
  | { command: 'error'; message: string }
  | {
      command: 'connectionState';
      connected: boolean;
      schemaOperationsEnabled: boolean;
      persistedSchemaAvailable: boolean;
      label: string;
      hint: string;
      /** Live discovery status; omitted when not yet wired. */
      discovery?: DiscoveryUiState | null;
    };
