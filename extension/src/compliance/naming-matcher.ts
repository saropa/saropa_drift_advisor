/**
 * Pure functions for naming convention validation.
 * Used by the compliance checker to enforce configurable naming rules.
 */

import type { NamingConvention } from './compliance-types';

const CONVENTION_PATTERNS: Record<NamingConvention, RegExp> = {
  snake_case: /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/,
  camelCase: /^[a-z][a-zA-Z0-9]*$/,
  PascalCase: /^[A-Z][a-zA-Z0-9]*$/,
  UPPER_SNAKE: /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/,
};

/** Check whether `name` matches the given naming convention.
 *
 * Fails CLOSED on an unknown convention (returns false). A typo'd convention in
 * `.drift-rules.json` (e.g. `"snakecase"`) previously returned true, silently
 * marking every name compliant and disabling the rule without any signal.
 * See plans/history/2026.06/2026.06.12/full-codebase-audit-2026.06.12.md M13.
 */
export function matchesConvention(
  name: string,
  convention: NamingConvention,
): boolean {
  const pattern = CONVENTION_PATTERNS[convention];
  return pattern ? pattern.test(name) : false;
}

/** True when `convention` is one of the known naming conventions. Used to
 *  validate config so an unknown value can be reported rather than silently
 *  disabling the check. */
export function isKnownConvention(convention: string): convention is NamingConvention {
  return Object.prototype.hasOwnProperty.call(CONVENTION_PATTERNS, convention);
}

/** Human-readable label for a convention (used in diagnostic messages). */
export function conventionLabel(convention: NamingConvention): string {
  return convention;
}

/**
 * Check whether a FK column name matches a pattern like `"{table}_id"`.
 * The `{table}` placeholder is replaced with the literal target table name.
 */
export function matchesFkPattern(
  columnName: string,
  pattern: string,
  targetTable: string,
): boolean {
  const expected = pattern.replace(/\{table\}/g, targetTable);
  return columnName === expected;
}
