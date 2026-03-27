import { PendingChange, groupByTable } from './change-tracker';

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
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
