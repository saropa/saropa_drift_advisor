/**
 * Shared test helpers for format-export test suites.
 *
 * Both `format-export.test.ts` and `format-export-literals.test.ts` need
 * the same default options builder, so it lives here to avoid duplication.
 */

import type { IExportOptions } from '../export/format-export-types';

/**
 * Builds an {@link IExportOptions} object pre-filled with sensible defaults
 * (table "users", columns [id, name], two sample rows, format "json").
 *
 * Callers can override any property via the `overrides` parameter — the
 * spread at the end ensures overrides win over defaults.
 */
export function opts(
  overrides: Partial<IExportOptions> = {},
): IExportOptions {
  return {
    table: 'users',
    columns: ['id', 'name'],
    rows: [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ],
    format: 'json',
    ...overrides,
  };
}
