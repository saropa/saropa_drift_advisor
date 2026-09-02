import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import type { SchemaIntelligence } from '../engines/schema-intelligence';
import type { QueryIntelligence } from '../engines/query-intelligence';
import type { IDartTable } from '../schema-diff/dart-schema';
import type { IInlineSuppressions } from './suppression';

/** Diagnostic category for grouping and filtering. */
export type DiagnosticCategory =
  | 'schema'
  | 'performance'
  | 'dataQuality'
  | 'bestPractices'
  | 'naming'
  | 'runtime'
  | 'compliance';

/** Metadata for a diagnostic code. */
export interface IDiagnosticCode {
  /** Unique code identifier (e.g., 'missing-fk-index'). */
  code: string;
  /** Category for filtering and settings. */
  category: DiagnosticCategory;
  /** Default severity if not overridden by settings. */
  defaultSeverity: vscode.DiagnosticSeverity;
  /** Message template with {placeholders}. */
  messageTemplate: string;
  /** Optional link to documentation. */
  documentation?: string;
  /** Whether a quick fix is available for this diagnostic. */
  hasFix?: boolean;
}

/**
 * Extra data attached when a diagnostic pins to a caller site instead of the
 * table definition file. Carries the table file's URI and class line so the
 * suppression layer can check ignore directives there (the caller file is
 * not in dartFiles and would otherwise be missed).
 */
export interface ICallerPinnedData extends Record<string, unknown> {
  /** Stringified URI of the Drift table definition file. */
  tableFileUri: string;
  /** 0-based line of the table class declaration in the table file. */
  tableFileLine: number;
}

/** Type guard: true when issue.data carries caller-pinned table file info. */
export function hasCallerPinnedData(
  data: Record<string, unknown> | undefined,
): data is ICallerPinnedData {
  return (
    data !== undefined &&
    typeof data.tableFileUri === 'string' &&
    typeof data.tableFileLine === 'number'
  );
}

/**
 * Known data shapes per diagnostic code. Checkers that use `createTypedIssue`
 * get compile-time enforcement of these fields. Checkers not yet migrated
 * still push plain `IDiagnosticIssue` with `data?: Record<string, unknown>`.
 *
 * To add a new code: define its data shape here, then use `createTypedIssue`
 * in the checker. The consumer side (`diagnostic-apply.ts`) reads fields via
 * `issue.data?.fieldName` — no casting needed since the runtime shape is the
 * same `Record<string, unknown>`.
 */
export interface DiagnosticDataMap {
  'n-plus-one': { tableName: string } & Partial<ICallerPinnedData>;
  'slow-query-pattern': { sql: string; durationMs: number } & Partial<ICallerPinnedData>;
  'unindexed-where-clause': { sql: string };
  'unindexed-join': { sql: string };
  'high-null-rate': { table: string; column: string; nullPct: number };
  'unused-column': { table: string; column: string; nullPct: number };
  'empty-table': { table: string; percentage: number };
  'raw-sql-column-type-mismatch': { tableName: string; column: string };
  'missing-pk': { tableName: string };
  'composite-pk-no-index': { tableName: string };
  'naming-table': { current: string; suggested: string };
  'naming-column': { current: string; suggested: string };
}

/**
 * Create a diagnostic issue with compile-time typed data for a known code.
 * Returns a plain `IDiagnosticIssue` so it slots into existing arrays
 * without casting. Checkers not yet migrated can still push raw issues.
 */
export function createTypedIssue<C extends keyof DiagnosticDataMap>(
  issue: Omit<IDiagnosticIssue, 'code' | 'data'> & {
    code: C;
    data: DiagnosticDataMap[C];
  },
): IDiagnosticIssue {
  return issue as IDiagnosticIssue;
}

/** A single diagnostic issue reported by a provider. */
export interface IDiagnosticIssue {
  /** References a registered diagnostic code. */
  code: string;
  /** Formatted message (placeholders already substituted). */
  message: string;
  /** File where the issue was found. */
  fileUri: vscode.Uri;
  /** Location within the file. */
  range: vscode.Range;
  /** Override default severity for this instance. */
  severity?: vscode.DiagnosticSeverity;
  /** Related information (e.g., suggested SQL). */
  relatedInfo?: vscode.DiagnosticRelatedInformation[];
  /** Arbitrary data for quick fix actions and suppression fallback. */
  data?: Record<string, unknown>;
}

/** Parsed Dart file with pre-extracted table definitions. */
export interface IDartFileInfo {
  uri: vscode.Uri;
  text: string;
  tables: IDartTable[];
  /** Inline `// drift-advisor:ignore[-file]` directives parsed from the source. */
  suppressions: IInlineSuppressions;
}

/** Configuration for diagnostic collection. */
export interface IDiagnosticConfig {
  /** Master enable/disable switch. */
  enabled: boolean;
  /** Refresh diagnostics when a Dart file is saved. */
  refreshOnSave: boolean;
  /** Minimum interval between refreshes (ms). */
  refreshIntervalMs: number;
  /** Enable/disable per category. */
  categories: Record<DiagnosticCategory, boolean>;
  /** Override severity for specific codes. */
  severityOverrides: Record<string, vscode.DiagnosticSeverity>;
  /** Explicitly disabled diagnostic codes. */
  disabledRules: Set<string>;
  /**
   * Per-table rule exclusions. Keys are diagnostic codes, values are sets of
   * SQL table names to skip. Lets users suppress a rule on specific tables
   * while keeping it active elsewhere (e.g., suppress `no-foreign-keys` on
   * tables that deliberately use UUID soft references).
   */
  tableExclusions: Map<string, Set<string>>;
  /**
   * Per-column rule exclusions. Keys are diagnostic codes, values are sets of
   * `table.column` identifiers to skip. Finer-grained than `tableExclusions`:
   * silences a rule on one column while keeping it active on the rest of the
   * table (e.g., a column expected to be mostly NULL by design).
   */
  columnExclusions: Map<string, Set<string>>;
  /**
   * SQL table names whose live debug rows are NOT a representative sample of
   * the production data — user/demo tables and static reference tables that
   * load lazily or partially in a debug session. Null-rate / unused-column
   * analysis is skipped entirely for these, because a null rate computed on a
   * partially-loaded or demo-only table says nothing about the source data
   * (see BUG_data_quality_null_checker_false_positives). Optional so existing
   * config constructors need not be updated; absence means "no tables excluded".
   */
  userDataTables?: Set<string>;
}

/** Context passed to providers during diagnostic collection. */
export interface IDiagnosticContext {
  /** API client for server communication. */
  client: DriftApiClient;
  /** Cached schema insights. */
  schemaIntel: SchemaIntelligence;
  /** Query pattern analysis. */
  queryIntel: QueryIntelligence;
  /** Pre-parsed Dart files with table definitions. */
  dartFiles: IDartFileInfo[];
  /** Current configuration. */
  config: IDiagnosticConfig;
}

/**
 * Provider interface for the plug-in architecture.
 * Each provider is responsible for collecting diagnostics of a specific category.
 */
export interface IDiagnosticProvider {
  /** Unique provider identifier. */
  readonly id: string;
  /** Category this provider reports. */
  readonly category: DiagnosticCategory;

  /**
   * Collect diagnostics from this provider.
   * Called by DiagnosticManager during refresh cycles.
   */
  collectDiagnostics(context: IDiagnosticContext): Promise<IDiagnosticIssue[]>;

  /**
   * Optional: provide quick fix code actions for a diagnostic.
   * Called when user clicks lightbulb or presses Cmd+.
   */
  provideCodeActions?(
    diagnostic: vscode.Diagnostic,
    document: vscode.TextDocument,
  ): vscode.CodeAction[];

  /** Dispose any resources held by this provider. */
  dispose(): void;
}

/** Default configuration values. */
export const DEFAULT_DIAGNOSTIC_CONFIG: IDiagnosticConfig = {
  enabled: true,
  refreshOnSave: true,
  refreshIntervalMs: 30000,
  categories: {
    schema: true,
    performance: true,
    dataQuality: true,
    bestPractices: true,
    naming: false,
    runtime: true,
    compliance: true,
  },
  severityOverrides: {},
  disabledRules: new Set(),
  tableExclusions: new Map(),
  columnExclusions: new Map(),
  userDataTables: new Set(),
};

/** Prefix added to all diagnostic messages for filtering. */
export const DIAGNOSTIC_PREFIX = '[drift_advisor]';

/** Value used for `diag.source` on every diagnostic we emit. */
export const DIAGNOSTIC_SOURCE = 'Drift Advisor';

/** Name of the diagnostic collection in VS Code. */
export const DIAGNOSTIC_COLLECTION_NAME = 'drift-advisor';
