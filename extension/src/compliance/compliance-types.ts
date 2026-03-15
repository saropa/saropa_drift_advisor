/**
 * Types for the schema compliance rule system.
 * Compliance rules are user-defined in `.drift-rules.json`.
 */

import type { IDiagramForeignKey, TableMetadata } from '../api-types';
import type { IDartTable } from '../schema-diff/dart-schema';

/** Supported naming conventions for tables and columns. */
export type NamingConvention =
  | 'snake_case'
  | 'camelCase'
  | 'PascalCase'
  | 'UPPER_SNAKE';

/** Severity levels for compliance violations. */
export type ComplianceSeverity = 'error' | 'warning' | 'info';

/** Top-level config shape from `.drift-rules.json`. */
export interface IComplianceConfig {
  naming?: {
    tables?: NamingConvention;
    columns?: NamingConvention;
    /** Pattern with `{table}` placeholder, e.g. `"{table}_id"`. */
    fkColumns?: string;
    severity?: ComplianceSeverity;
  };
  requiredColumns?: IRequiredColumnConfig[];
  rules?: IRuleConfig[];
  /** Table names to exclude from all checks. */
  exclude?: string[];
}

/** A required-column entry. */
export interface IRequiredColumnConfig {
  name: string;
  /** Expected SQL type (e.g. `"INTEGER"`). Omit to accept any type. */
  type?: string;
  /** Tables exempt from this requirement. */
  excludeTables?: string[];
  severity?: ComplianceSeverity;
}

/** A built-in rule entry. */
export interface IRuleConfig {
  rule: string;
  severity?: ComplianceSeverity;
  /** Rule-specific config (e.g. `max` for `max-columns`). */
  [key: string]: unknown;
}

/** A single compliance violation produced by the checker. */
export interface IComplianceViolation {
  /** Diagnostic code string (e.g. `'compliance-table-naming'`). */
  rule: string;
  severity: ComplianceSeverity;
  table: string;
  column?: string;
  message: string;
}

/** Context passed to built-in rule implementations. */
export interface IComplianceRuleContext {
  tables: TableMetadata[];
  fkMap: Map<string, IDiagramForeignKey[]>;
  dartTables: IDartTable[] | undefined;
  ruleConfig: IRuleConfig;
}

/** Interface for built-in compliance rules. */
export interface IComplianceRule {
  readonly id: string;
  check(context: IComplianceRuleContext): IComplianceViolation[];
}
