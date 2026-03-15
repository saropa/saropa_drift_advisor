/**
 * Built-in compliance rule implementations.
 * Each rule implements IComplianceRule and is registered by the checker.
 */

import type {
  ComplianceSeverity,
  IComplianceRule,
  IComplianceRuleContext,
  IComplianceViolation,
} from './compliance-types';

/** Flags tables that use a TEXT column as primary key. */
export class NoTextPrimaryKeyRule implements IComplianceRule {
  readonly id = 'no-text-primary-key';

  check(ctx: IComplianceRuleContext): IComplianceViolation[] {
    const severity = (ctx.ruleConfig.severity as ComplianceSeverity) ?? 'warning';
    const violations: IComplianceViolation[] = [];

    for (const table of ctx.tables) {
      for (const col of table.columns) {
        if (col.pk && col.type === 'TEXT') {
          violations.push({
            rule: 'compliance-no-text-pk',
            severity,
            table: table.name,
            column: col.name,
            message: `Table "${table.name}" uses TEXT primary key "${col.name}" — consider INTEGER instead`,
          });
        }
      }
    }

    return violations;
  }
}

/** Flags tables that have no primary key column. */
export class RequirePkRule implements IComplianceRule {
  readonly id = 'require-pk';

  check(ctx: IComplianceRuleContext): IComplianceViolation[] {
    const severity = (ctx.ruleConfig.severity as ComplianceSeverity) ?? 'warning';
    const violations: IComplianceViolation[] = [];

    for (const table of ctx.tables) {
      const hasPk = table.columns.some((c) => c.pk);
      if (!hasPk) {
        violations.push({
          rule: 'compliance-require-pk',
          severity,
          table: table.name,
          message: `Table "${table.name}" has no primary key`,
        });
      }
    }

    return violations;
  }
}

/** Flags tables with more columns than the configured maximum. */
export class MaxColumnsRule implements IComplianceRule {
  readonly id = 'max-columns';

  check(ctx: IComplianceRuleContext): IComplianceViolation[] {
    const severity = (ctx.ruleConfig.severity as ComplianceSeverity) ?? 'warning';
    const max = typeof ctx.ruleConfig.max === 'number' ? ctx.ruleConfig.max : 20;
    const violations: IComplianceViolation[] = [];

    for (const table of ctx.tables) {
      if (table.columns.length > max) {
        violations.push({
          rule: 'compliance-max-columns',
          severity,
          table: table.name,
          message: `Table "${table.name}" has ${table.columns.length} columns (max ${max})`,
        });
      }
    }

    return violations;
  }
}

/** Flags FK columns that are declared nullable in Dart source. */
export class NoNullableFkRule implements IComplianceRule {
  readonly id = 'no-nullable-fk';

  check(ctx: IComplianceRuleContext): IComplianceViolation[] {
    if (!ctx.dartTables) return [];

    const severity = (ctx.ruleConfig.severity as ComplianceSeverity) ?? 'warning';
    const violations: IComplianceViolation[] = [];

    // Build lookup: sqlTableName → IDartColumn[]
    const dartLookup = new Map<string, { sqlName: string; nullable: boolean }[]>();
    for (const dt of ctx.dartTables) {
      dartLookup.set(dt.sqlTableName, dt.columns);
    }

    for (const [tableName, fks] of ctx.fkMap) {
      const dartCols = dartLookup.get(tableName);
      if (!dartCols) continue;

      for (const fk of fks) {
        const dartCol = dartCols.find((c) => c.sqlName === fk.fromColumn);
        if (dartCol?.nullable) {
          violations.push({
            rule: 'compliance-no-nullable-fk',
            severity,
            table: tableName,
            column: fk.fromColumn,
            message: `FK column "${tableName}.${fk.fromColumn}" is nullable — consider making it required`,
          });
        }
      }
    }

    return violations;
  }
}

/** All built-in rules. */
export const BUILTIN_RULES: IComplianceRule[] = [
  new NoTextPrimaryKeyRule(),
  new RequirePkRule(),
  new MaxColumnsRule(),
  new NoNullableFkRule(),
];
