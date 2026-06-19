/**
 * Diagnostic codes for data quality (nulls, constraints, skew).
 */

import * as vscode from 'vscode';
import type { IDiagnosticCode } from '../diagnostic-types';

export const DATA_QUALITY_CODES: Record<string, IDiagnosticCode> = {
  'high-null-rate': {
    code: 'high-null-rate',
    category: 'dataQuality',
    defaultSeverity: vscode.DiagnosticSeverity.Information,
    messageTemplate: 'Column "{table}.{column}" has {pct}% NULL values',
    hasFix: false,
  },
  // Split out from high-null-rate: a column that is 100% NULL is never
  // populated by any row, which is a distinct finding (dead/unused column, or a
  // write path that never fires) from "mostly but not entirely null." Separate
  // code so it can be tuned, disabled, and suppressed independently.
  'unused-column': {
    code: 'unused-column',
    category: 'dataQuality',
    defaultSeverity: vscode.DiagnosticSeverity.Information,
    messageTemplate:
      'Column "{table}.{column}" is 100% NULL — no row sets a value (unused column)',
    hasFix: false,
  },
  'unique-violation': {
    code: 'unique-violation',
    category: 'dataQuality',
    defaultSeverity: vscode.DiagnosticSeverity.Error,
    messageTemplate:
      'UNIQUE constraint on "{table}.{columns}" has {count} violations',
    hasFix: false,
  },
  'check-violation': {
    code: 'check-violation',
    category: 'dataQuality',
    defaultSeverity: vscode.DiagnosticSeverity.Error,
    messageTemplate:
      'CHECK constraint on "{table}" has {count} violations: {expr}',
    hasFix: false,
  },
  'not-null-violation': {
    code: 'not-null-violation',
    category: 'dataQuality',
    defaultSeverity: vscode.DiagnosticSeverity.Error,
    messageTemplate:
      'NOT NULL on "{table}.{column}" has {count} NULL values',
    hasFix: false,
  },
  'outlier-detected': {
    code: 'outlier-detected',
    category: 'dataQuality',
    defaultSeverity: vscode.DiagnosticSeverity.Information,
    messageTemplate:
      'Column "{table}.{column}" has {count} statistical outliers',
    hasFix: false,
  },
  'data-skew': {
    code: 'data-skew',
    category: 'dataQuality',
    defaultSeverity: vscode.DiagnosticSeverity.Information,
    messageTemplate:
      'Table "{table}" has {pct}% of all database rows (data skew)',
    hasFix: false,
  },
};
