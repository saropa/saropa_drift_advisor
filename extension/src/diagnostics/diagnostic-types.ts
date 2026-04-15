import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import type { SchemaIntelligence } from '../engines/schema-intelligence';
import type { QueryIntelligence } from '../engines/query-intelligence';
import type { IDartTable } from '../schema-diff/dart-schema';

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
  /** Arbitrary data for quick fix actions. */
  data?: Record<string, unknown>;
}

/** Parsed Dart file with pre-extracted table definitions. */
export interface IDartFileInfo {
  uri: vscode.Uri;
  text: string;
  tables: IDartTable[];
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
};

/** Prefix added to all diagnostic messages for filtering. */
export const DIAGNOSTIC_PREFIX = '[drift_advisor]';

/** Value used for `diag.source` on every diagnostic we emit. */
export const DIAGNOSTIC_SOURCE = 'Drift Advisor';

/** Name of the diagnostic collection in VS Code. */
export const DIAGNOSTIC_COLLECTION_NAME = 'drift-advisor';
