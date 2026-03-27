/**
 * SQLite-oriented parsing and validation for inline cell edits.
 *
 * Aligns with clipboard import rules: INTEGER/REAL/BOOLEAN patterns, NOT NULL
 * handling, and TEXT empty-string vs NULL semantics (clearing a nullable field
 * yields SQL NULL; NOT NULL TEXT may still store an empty string).
 */

import type { ColumnMetadata, TableMetadata } from '../api-types';

/** True when the column has a NOT NULL constraint (PRAGMA notnull = 1). */
export function columnIsNotNull(col: ColumnMetadata): boolean {
  const n = col.notnull as boolean | number | undefined;
  return n === true || n === 1;
}

/**
 * Returns an error message if [value] is not a plausible literal for [sqlType],
 * or null if the string is acceptable for that affinity.
 *
 * Shared with import validation so clipboard and inline edits stay consistent.
 */
export function sqliteTypeCompatibilityError(
  value: string,
  sqlType: string,
): string | null {
  const upperType = (sqlType || '').toUpperCase();

  // BLOB: import may supply hex/text; inline cell editor rejects non-empty edits separately.
  if (upperType === 'INTEGER' || upperType === 'INT') {
    if (!/^-?\d+$/.test(value)) {
      return `Expected integer, got "${value}"`;
    }
  } else if (
    upperType === 'REAL' ||
    upperType === 'FLOAT' ||
    upperType === 'DOUBLE' ||
    upperType === 'NUMERIC'
  ) {
    if (!/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(value)) {
      return `Expected number, got "${value}"`;
    }
  } else if (upperType === 'BOOLEAN' || upperType === 'BOOL') {
    const lower = value.toLowerCase();
    if (!['0', '1', 'true', 'false', 'yes', 'no'].includes(lower)) {
      return `Expected boolean, got "${value}"`;
    }
  }

  return null;
}

function isTextAffinity(sqlType: string): boolean {
  const u = sqlType.toUpperCase();
  if (u === '' || u.includes('CHAR') || u.includes('CLOB') || u.includes('TEXT')) {
    return true;
  }
  if (
    u === 'INTEGER' ||
    u === 'INT' ||
    u === 'REAL' ||
    u === 'FLOAT' ||
    u === 'DOUBLE' ||
    u === 'NUMERIC' ||
    u === 'BOOLEAN' ||
    u === 'BOOL' ||
    u.includes('BLOB')
  ) {
    return false;
  }
  // Unknown affinity → treat as TEXT (SQLite rules).
  return true;
}

function coerceNonTextValue(trimmed: string, sqlType: string): unknown {
  const u = (sqlType || '').toUpperCase();
  if (u === 'INTEGER' || u === 'INT') {
    return Number.parseInt(trimmed, 10);
  }
  if (
    u === 'REAL' ||
    u === 'FLOAT' ||
    u === 'DOUBLE' ||
    u === 'NUMERIC'
  ) {
    return Number.parseFloat(trimmed);
  }
  if (u === 'BOOLEAN' || u === 'BOOL') {
    const lower = trimmed.toLowerCase();
    return lower === '1' || lower === 'true' || lower === 'yes';
  }
  return trimmed;
}

/**
 * Validates a proposed cell value against [ColumnMetadata] and returns a typed
 * value suitable for [generateSql] (null, number, boolean, or string).
 */
export function parseCellEditForColumn(
  col: ColumnMetadata,
  newValue: unknown,
): { ok: true; value: unknown } | { ok: false; message: string } {
  if (col.pk) {
    return { ok: false, message: 'Primary key cannot be edited inline.' };
  }

  let raw: string;
  if (newValue === null || newValue === undefined) {
    raw = '';
  } else if (typeof newValue === 'string') {
    raw = newValue;
  } else if (typeof newValue === 'number' || typeof newValue === 'boolean') {
    raw = String(newValue);
  } else {
    return { ok: false, message: 'Unsupported value type for this cell.' };
  }

  const trimmed = raw.trim();
  const typeUpper = (col.type || '').toUpperCase();
  const notNull = columnIsNotNull(col);

  if (typeUpper.includes('BLOB') && trimmed !== '') {
    return {
      ok: false,
      message: 'BLOB columns cannot be edited in the inline grid.',
    };
  }

  if (trimmed === '') {
    if (!notNull) {
      return { ok: true, value: null };
    }
    if (isTextAffinity(col.type || '')) {
      return { ok: true, value: '' };
    }
    return {
      ok: false,
      message: `Column "${col.name}" is NOT NULL. Enter a value (or clear only if the column is nullable).`,
    };
  }

  const err = sqliteTypeCompatibilityError(trimmed, col.type);
  if (err) {
    return { ok: false, message: `${col.name}: ${err}` };
  }

  if (isTextAffinity(col.type || '')) {
    return { ok: true, value: raw };
  }

  return { ok: true, value: coerceNonTextValue(trimmed, col.type) };
}

/**
 * Looks up the table and column from schema metadata and validates the edit.
 */
export function validateCellEdit(
  tables: readonly TableMetadata[],
  tableName: string,
  columnName: string,
  newValue: unknown,
): { ok: true; value: unknown } | { ok: false; message: string } {
  const table = tables.find((t) => t.name === tableName);
  if (!table) {
    return { ok: false, message: `Unknown table "${tableName}".` };
  }
  const col = table.columns.find((c) => c.name === columnName);
  if (!col) {
    return {
      ok: false,
      message: `Unknown column "${columnName}" on "${tableName}".`,
    };
  }
  return parseCellEditForColumn(col, newValue);
}

/**
 * Validates a new-row insert map against schema (non-PK columns only; PK omitted for autoincrement).
 */
export function validateRowInsert(
  tables: readonly TableMetadata[],
  tableName: string,
  values: Record<string, unknown>,
): { ok: true; values: Record<string, unknown> } | { ok: false; message: string } {
  const table = tables.find((t) => t.name === tableName);
  if (!table) {
    return { ok: false, message: `Unknown table "${tableName}".` };
  }
  const coerced: Record<string, unknown> = {};
  for (const col of table.columns) {
    if (col.pk) {
      continue;
    }
    const raw = Object.prototype.hasOwnProperty.call(values, col.name)
      ? values[col.name]
      : null;
    const r = parseCellEditForColumn(col, raw);
    if (!r.ok) {
      return { ok: false, message: r.message };
    }
    coerced[col.name] = r.value;
  }
  return { ok: true, values: coerced };
}
