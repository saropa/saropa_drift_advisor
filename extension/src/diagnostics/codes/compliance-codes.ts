/**
 * Diagnostic codes for schema compliance rules.
 * All codes are prefixed with `compliance-` to avoid collision with
 * existing schema/naming codes.
 */

import * as vscode from 'vscode';
import type { IDiagnosticCode } from '../diagnostic-types';

export const COMPLIANCE_CODES: Record<string, IDiagnosticCode> = {
  'compliance-table-naming': {
    code: 'compliance-table-naming',
    category: 'compliance',
    defaultSeverity: vscode.DiagnosticSeverity.Warning,
    messageTemplate:
      'Table "{table}" violates {convention} naming convention',
    hasFix: false,
  },
  'compliance-column-naming': {
    code: 'compliance-column-naming',
    category: 'compliance',
    defaultSeverity: vscode.DiagnosticSeverity.Warning,
    messageTemplate:
      'Column "{table}.{column}" violates {convention} naming convention',
    hasFix: false,
  },
  'compliance-fk-naming': {
    code: 'compliance-fk-naming',
    category: 'compliance',
    defaultSeverity: vscode.DiagnosticSeverity.Warning,
    messageTemplate:
      'FK column "{table}.{column}" should follow pattern "{pattern}"',
    hasFix: false,
  },
  'compliance-required-column': {
    code: 'compliance-required-column',
    category: 'compliance',
    defaultSeverity: vscode.DiagnosticSeverity.Warning,
    messageTemplate: 'Table "{table}" missing required column "{column}"',
    hasFix: false,
  },
  'compliance-required-column-type': {
    code: 'compliance-required-column-type',
    category: 'compliance',
    defaultSeverity: vscode.DiagnosticSeverity.Warning,
    messageTemplate:
      'Table "{table}" column "{column}" has type {actualType}, expected {expectedType}',
    hasFix: false,
  },
  'compliance-no-text-pk': {
    code: 'compliance-no-text-pk',
    category: 'compliance',
    defaultSeverity: vscode.DiagnosticSeverity.Warning,
    messageTemplate: 'Table "{table}" uses TEXT primary key',
    hasFix: false,
  },
  'compliance-require-pk': {
    code: 'compliance-require-pk',
    category: 'compliance',
    defaultSeverity: vscode.DiagnosticSeverity.Warning,
    messageTemplate: 'Table "{table}" has no primary key',
    hasFix: false,
  },
  'compliance-max-columns': {
    code: 'compliance-max-columns',
    category: 'compliance',
    defaultSeverity: vscode.DiagnosticSeverity.Warning,
    messageTemplate: 'Table "{table}" has {count} columns (max {max})',
    hasFix: false,
  },
  'compliance-no-nullable-fk': {
    code: 'compliance-no-nullable-fk',
    category: 'compliance',
    defaultSeverity: vscode.DiagnosticSeverity.Warning,
    messageTemplate: 'FK column "{table}.{column}" is nullable',
    hasFix: false,
  },
};
