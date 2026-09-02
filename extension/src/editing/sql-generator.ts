import { PendingChange, groupByTable } from './change-tracker';

/**
 * Marker for a SQLite INTEGER value that cannot round-trip through a JS
 * `number` (magnitude above `Number.MAX_SAFE_INTEGER`, e.g. a snowflake ID or
 * microsecond timestamp). `sqlite-cell-value.ts` produces this instead of a
 * `number` so the exact digit string reaches SQL untouched by float rounding.
 * A plain object (not `bigint`) so it survives `JSON.stringify` in
 * `pending-changes-persistence.ts` without a custom (de)serializer.
 */
export interface RawIntegerLiteral {
  readonly rawInteger: string;
}

/** True when [value] is a [RawIntegerLiteral] produced for a 64-bit-only edit. */
export function isRawIntegerLiteral(value: unknown): value is RawIntegerLiteral {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { rawInteger?: unknown }).rawInteger === 'string'
  );
}

/** Escape a JS value as a SQL literal (NULL, number, or single-quoted string). */
export function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  // Large INTEGER edits are pre-validated digit strings wrapped so they are
  // emitted unquoted (as SQL number syntax) rather than falling through to the
  // quoted-string branch below, which would corrupt the column to TEXT.
  if (isRawIntegerLiteral(value)) return value.rawInteger;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? '1' : '0';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function statementForChange(table: string, change: PendingChange): string {
  switch (change.kind) {
    case 'cell':
      return (
        `UPDATE "${table}" SET "${change.column}" = ${sqlLiteral(change.newValue)} ` +
        `WHERE "${change.pkColumn}" = ${sqlLiteral(change.pkValue)}`
      );
    case 'insert': {
      const cols = Object.keys(change.values);
      const vals = cols.map((c) => sqlLiteral(change.values[c]));
      return (
        `INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(', ')}) ` +
        `VALUES (${vals.join(', ')})`
      );
    }
    case 'delete':
      return (
        `DELETE FROM "${table}" WHERE "${change.pkColumn}" = ${sqlLiteral(change.pkValue)}`
      );
  }
}

/**
 * Executable single statements in **pending list order** (no comments). For POST /api/edits/apply.
 * Cross-table FK ordering is the caller's responsibility until dependency sorting lands.
 */
export function generateSqlStatements(changes: readonly PendingChange[]): string[] {
  return changes.map((c) => statementForChange(c.table, c));
}

/** Generate reviewed SQL from pending changes, grouped by table. */
export function generateSql(changes: readonly PendingChange[]): string {
  if (changes.length === 0) {
    return '-- Saropa Drift Advisor: No pending changes.\n';
  }

  const lines: string[] = [
    `-- Saropa Drift Advisor: Generated SQL (${changes.length} change(s))`,
    '-- Review carefully before executing!',
    '',
  ];

  for (const [table, tableChanges] of groupByTable(changes)) {
    lines.push(`-- ${table}: ${tableChanges.length} change(s)`);

    for (const change of tableChanges) {
      lines.push(`${statementForChange(table, change)};`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
