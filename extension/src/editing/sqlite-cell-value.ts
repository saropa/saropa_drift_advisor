/**
 * SQLite-oriented parsing and validation for inline cell edits.
 *
 * Aligns with clipboard import rules: INTEGER/REAL/BOOLEAN patterns, NOT NULL
 * handling, and TEXT empty-string vs NULL semantics (clearing a nullable field
 * yields SQL NULL; NOT NULL TEXT may still store an empty string).
 */

import type { ColumnMetadata, TableMetadata } from '../api-types';
import { isRawIntegerLiteral, type RawIntegerLiteral } from './sql-generator';

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

// SQLite INTEGER is a 64-bit two's-complement value, but a JS `number` only
// carries 53 bits of exact integer precision. Bound the "safe to convert to
// number" range against Number.MAX/MIN_SAFE_INTEGER using BigInt comparison
// (not float comparison) so the boundary check itself cannot round.
const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE_BIGINT = BigInt(Number.MIN_SAFE_INTEGER);

function coerceNonTextValue(
  trimmed: string,
  sqlType: string,
): unknown | RawIntegerLiteral {
  const u = (sqlType || '').toUpperCase();
  if (u === 'INTEGER' || u === 'INT') {
    // `sqliteTypeCompatibilityError` already confirmed `trimmed` matches
    // `/^-?\d+$/`, so this BigInt parse cannot throw. Values inside the safe
    // range still convert to `number` (existing callers/tests expect a plain
    // number for ordinary IDs); values above it - a snowflake/Discord/Twitter
    // ID, an `Int64Column`, or a microsecond timestamp - are kept as an exact
    // digit string wrapped in `RawIntegerLiteral` so `sqlLiteral` can emit
    // them unquoted without ever routing the value through a lossy double.
    const asBigInt = BigInt(trimmed);
    if (asBigInt >= MIN_SAFE_BIGINT && asBigInt <= MAX_SAFE_BIGINT) {
      return Number.parseInt(trimmed, 10);
    }
    return { rawInteger: asBigInt.toString() };
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
 *
 * [forInsert] distinguishes the two callers: `validateCellEdit` edits an
 * *existing* row keyed on its PK, so the PK itself must stay read-only (there
 * is no safe way to "edit" the key you are using to find the row). A brand
 * new row has no key yet, so `validateRowInsert` sets `forInsert: true` to
 * let a user-supplied PK value (TEXT/UUID/composite key) through the normal
 * type checks instead of being unconditionally rejected here.
 */
export function parseCellEditForColumn(
  col: ColumnMetadata,
  newValue: unknown,
  forInsert = false,
): { ok: true; value: unknown; warning?: string } | { ok: false; message: string } {
  if (col.pk && !forInsert) {
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

  const value = coerceNonTextValue(trimmed, col.type);
  // Surface a warning (rather than rejecting) when the value could not fit a
  // JS number: the RawIntegerLiteral path stores it exactly, so this is
  // informational - it tells the user why the grid may briefly show a plain
  // digit string instead of a formatted number, not that the edit failed.
  if (isRawIntegerLiteral(value)) {
    return {
      ok: true,
      value,
      warning:
        `Column "${col.name}": value ${trimmed} exceeds the safe integer range ` +
        `(±${Number.MAX_SAFE_INTEGER}). Stored exactly as a 64-bit literal.`,
    };
  }
  return { ok: true, value };
}

/**
 * Looks up the table and column from schema metadata and validates the edit.
 */
export function validateCellEdit(
  tables: readonly TableMetadata[],
  tableName: string,
  columnName: string,
  newValue: unknown,
): { ok: true; value: unknown; warning?: string } | { ok: false; message: string } {
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
 * Validates a new-row insert map against schema. PK handling depends on shape:
 *
 * - A lone `INTEGER PRIMARY KEY` column is SQLite's rowid alias: the engine
 *   fills it in on insert, so it is omitted from the generated INSERT unless
 *   the user explicitly supplied a value (an explicit rowid is legal SQL).
 * - Any other PK - TEXT/UUID, or a composite key (PRAGMA table_info numbers
 *   each part `pk = 1, 2, ...`, so more than one truthy `pk` column means
 *   composite) - is NOT auto-populated. SQLite still allows NULL there unless
 *   the column also has an explicit NOT NULL, so silently dropping it (the
 *   old bug) stores a row with a NULL key that can never be edited or deleted
 *   afterward (PK cells are read-only, and DELETE/UPDATE key on `pk = value`,
 *   which never matches NULL). We therefore require these columns be present.
 */
export function validateRowInsert(
  tables: readonly TableMetadata[],
  tableName: string,
  values: Record<string, unknown>,
): { ok: true; values: Record<string, unknown>; warnings: string[] } | { ok: false; message: string } {
  const table = tables.find((t) => t.name === tableName);
  if (!table) {
    return { ok: false, message: `Unknown table "${tableName}".` };
  }
  // Count PK columns up front: more than one means a composite key, where no
  // single column is a rowid alias even if its type is INTEGER.
  const pkColumnCount = table.columns.filter((c) => c.pk).length;
  const coerced: Record<string, unknown> = {};
  // Collects per-column safe-integer-range warnings so the caller can surface
  // them without failing the insert (the RawIntegerLiteral value is stored
  // exactly; this is informational only, same as the single-cell-edit path).
  const warnings: string[] = [];
  for (const col of table.columns) {
    const supplied = Object.prototype.hasOwnProperty.call(values, col.name);
    const isRowidAlias =
      col.pk && pkColumnCount === 1 && (col.type || '').toUpperCase() === 'INTEGER';
    if (isRowidAlias && !supplied) {
      // Rowid alias with nothing supplied: let SQLite auto-populate it, as before.
      continue;
    }
    if (col.pk && !isRowidAlias && !supplied) {
      // Non-autoincrement key (TEXT, composite, or a non-INTEGER type): there
      // is no engine-generated fallback, so a missing value is a user error,
      // not a silent NULL.
      return {
        ok: false,
        message: `Column "${col.name}" is the primary key and must be supplied.`,
      };
    }
    const raw = supplied ? values[col.name] : null;
    // forInsert=true lets a user-supplied PK value through the normal type
    // checks below instead of parseCellEditForColumn's blanket "read-only PK"
    // rejection, which exists only to protect the key of an *existing* row.
    const r = parseCellEditForColumn(col, raw, col.pk);
    if (!r.ok) {
      return { ok: false, message: r.message };
    }
    coerced[col.name] = r.value;
    if (r.warning) {
      warnings.push(r.warning);
    }
  }
  return { ok: true, values: coerced, warnings };
}
