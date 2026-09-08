import * as vscode from 'vscode';

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
