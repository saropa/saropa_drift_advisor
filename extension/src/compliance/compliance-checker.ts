/**
 * Schema compliance rule evaluation engine.
 * Checks database schema against user-defined rules from `.drift-rules.json`.
 */

import type { IDiagramForeignKey, TableMetadata } from '../api-types';
import type { IDartTable } from '../schema-diff/dart-schema';
import { BUILTIN_RULES } from './compliance-rules';
import type {
  ComplianceSeverity,
  IComplianceConfig,
  IComplianceRule,
  IComplianceViolation,
  IRequiredColumnConfig,
} from './compliance-types';
import {
  conventionLabel,
  matchesConvention,
  matchesFkPattern,
} from './naming-matcher';

export class ComplianceChecker {
  private readonly _rules = new Map<string, IComplianceRule>();

  constructor() {
    for (const rule of BUILTIN_RULES) {
      this._rules.set(rule.id, rule);
    }
  }

  /**
   * Evaluate all compliance rules against the given schema data.
   * Returns an empty array if config is null or empty.
   */
  check(
    config: IComplianceConfig,
    tables: TableMetadata[],
    fks: IDiagramForeignKey[],
    dartTables?: IDartTable[],
  ): IComplianceViolation[] {
    const violations: IComplianceViolation[] = [];
    const excludeSet = new Set(config.exclude ?? []);

    // Filter out internal and excluded tables
    const userTables = tables.filter(
      (t) => !t.name.startsWith('sqlite_') && !excludeSet.has(t.name),
    );

    // Build FK lookup: tableName → ForeignKey[]
    const fkMap = new Map<string, IDiagramForeignKey[]>();
    for (const fk of fks) {
      if (excludeSet.has(fk.fromTable)) continue;
      const list = fkMap.get(fk.fromTable) ?? [];
      list.push(fk);
      fkMap.set(fk.fromTable, list);
    }

    if (config.naming) {
      violations.push(...this._checkNaming(config.naming, userTables, fkMap));
    }

    if (config.requiredColumns) {
      violations.push(
        ...this._checkRequiredColumns(config.requiredColumns, userTables),
      );
    }

    for (const ruleConfig of config.rules ?? []) {
      const rule = this._rules.get(ruleConfig.rule);
      if (rule) {
        violations.push(
          ...rule.check({ tables: userTables, fkMap, dartTables, ruleConfig }),
        );
      }
    }

    return violations;
  }

  private _checkNaming(
    naming: NonNullable<IComplianceConfig['naming']>,
    tables: TableMetadata[],
    fkMap: Map<string, IDiagramForeignKey[]>,
  ): IComplianceViolation[] {
    const violations: IComplianceViolation[] = [];
    const severity: ComplianceSeverity = naming.severity ?? 'warning';

    for (const table of tables) {
      // Table naming
      if (naming.tables && !matchesConvention(table.name, naming.tables)) {
        violations.push({
          rule: 'compliance-table-naming',
          severity,
          table: table.name,
          message: `Table "${table.name}" violates ${conventionLabel(naming.tables)} naming convention`,
        });
      }

      // Column naming
      if (naming.columns) {
        for (const col of table.columns) {
          if (!matchesConvention(col.name, naming.columns)) {
            violations.push({
              rule: 'compliance-column-naming',
              severity,
              table: table.name,
              column: col.name,
              message: `Column "${table.name}.${col.name}" violates ${conventionLabel(naming.columns)} naming convention`,
            });
          }
        }
      }

      // FK column naming pattern
      if (naming.fkColumns) {
        const tableFks = fkMap.get(table.name) ?? [];
        for (const fk of tableFks) {
          if (!matchesFkPattern(fk.fromColumn, naming.fkColumns, fk.toTable)) {
            const expected = naming.fkColumns.replace(
              /\{table\}/g,
              fk.toTable,
            );
            violations.push({
              rule: 'compliance-fk-naming',
              severity,
              table: table.name,
              column: fk.fromColumn,
              message: `FK column "${table.name}.${fk.fromColumn}" should be "${expected}" (pattern: ${naming.fkColumns})`,
            });
          }
        }
      }
    }

    return violations;
  }

  private _checkRequiredColumns(
    required: IRequiredColumnConfig[],
    tables: TableMetadata[],
  ): IComplianceViolation[] {
    const violations: IComplianceViolation[] = [];

    for (const req of required) {
      const severity: ComplianceSeverity = req.severity ?? 'warning';
      const excludeSet = new Set(req.excludeTables ?? []);

      for (const table of tables) {
        if (excludeSet.has(table.name)) continue;

        const col = table.columns.find((c) => c.name === req.name);
        if (!col) {
          const typeHint = req.type ? ` (${req.type})` : '';
          violations.push({
            rule: 'compliance-required-column',
            severity,
            table: table.name,
            message: `Table "${table.name}" missing required column "${req.name}"${typeHint}`,
          });
        } else if (req.type && col.type !== req.type) {
          violations.push({
            rule: 'compliance-required-column-type',
            severity,
            table: table.name,
            column: col.name,
            message: `Table "${table.name}" column "${col.name}" has type ${col.type}, expected ${req.type}`,
          });
        }
      }
    }

    return violations;
  }
}
