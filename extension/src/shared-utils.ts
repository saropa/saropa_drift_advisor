/** Shared utility functions used across multiple extension features. */

/** Quote a SQL identifier (table or column name). */
export function q(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** Zip column names with a row array into a keyed object. */
export function zipRow(
  columns: string[], row: unknown[],
): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (let i = 0; i < columns.length; i++) {
    obj[columns[i]] = row[i];
  }
  return obj;
}

/** Escape a value for CSV output (RFC 4180 quoting). */
export function escapeCsvCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}
