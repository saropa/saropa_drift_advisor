/**
 * Picks a single column that identifies a row for keyed operations — lineage
 * tracing, impact analysis, global-search result anchoring, mutation tracking,
 * constraint validation, and the data narrator.
 *
 * These sites previously fell straight back to `rowid` when a table declared no
 * primary key. But `rowid` does not exist on views or `WITHOUT ROWID` tables
 * (e.g. PowerSync exposes its user tables as views over an `id` + `json` store,
 * and its system tables are `WITHOUT ROWID`), so a rowid-keyed query throws
 * `no such column: rowid` on them. See GitHub issue #32.
 *
 * Preference order:
 *   1. the first declared primary-key column (the real key when one exists,
 *      including every `WITHOUT ROWID` table, which SQLite requires to declare
 *      a PRIMARY KEY);
 *   2. a column literally named `id` (case-insensitive) — covers views and
 *      other relations whose logical key is not reported as a PK by
 *      `PRAGMA table_info`, which is exactly the PowerSync table-view case;
 *   3. `rowid` as a last resort, valid only on ordinary rowid tables that have
 *      neither a declared PK nor an `id` column.
 *
 * This only changes behavior when no PK is declared, so PK-bearing tables are
 * unaffected; the `id`-before-`rowid` step is what makes rowid-less relations
 * work instead of erroring.
 */
export function rowKeyColumn(
  columns: readonly { name: string; pk: boolean }[],
): string {
  const pk = columns.find((c) => c.pk);
  if (pk) return pk.name;
  const id = columns.find((c) => c.name.toLowerCase() === 'id');
  if (id) return id.name;
  return 'rowid';
}
