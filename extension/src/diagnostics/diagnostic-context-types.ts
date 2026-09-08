import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import type { SchemaIntelligence } from '../engines/schema-intelligence';
import type { QueryIntelligence } from '../engines/query-intelligence';
import type { IDartTable } from '../schema-diff/dart-schema';
import type { IInlineSuppressions } from './suppression';
import type { DiagnosticCategory } from './diagnostic-code-types';
import type { IColumnNameExclusionSet, IDiagnosticIssue } from './diagnostic-issue-types';

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
   * Column-name-only rule exclusions (no table qualifier). Keys are diagnostic
   * codes, values hold the bare column names and `*`-glob patterns (e.g.
   * `lastModified`, `*_at`) matched across every table. For nullable-by-design
   * columns that recur across many tables, this avoids repeating
   * `table.column` in `columnExclusions` — or an inline
   * `// drift-advisor:ignore` — on every table that carries the column.
   * Matching is case-insensitive. Optional so existing config constructors
   * (tests, callers) need not be updated; absence means "no column-name
   * exclusions".
   */
  columnNameExclusions?: Map<string, IColumnNameExclusionSet>;
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
  /**
   * Whether `store_date_time_values_as_text: true` is set in build.yaml.
   * - `true`: DateTimeColumn maps to TEXT (ISO-8601 strings).
   * - `false`: DateTimeColumn maps to INTEGER (Unix epoch, Drift default).
   * - `undefined`: build.yaml absent or unparseable — both types accepted
   *   for DateTimeColumn to avoid false positives (see BUG_COLUMN_TYPE_DRIFT_
   *   FALSE_POSITIVE_DATETIME_AS_TEXT).
   */
  dateTimeAsText?: boolean;
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
