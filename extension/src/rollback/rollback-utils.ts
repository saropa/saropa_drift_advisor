/**
 * Utility functions for rollback generation.
 */

/**
 * Extract the column name from a schema change detail string.
 * Detail formats: '"colName" (TYPE)' or '"colName"'.
 */
export function extractColumnName(detail: string): string | null {
  const match = detail.match(/"([^"]+)"/);
  return match ? match[1] : null;
}
