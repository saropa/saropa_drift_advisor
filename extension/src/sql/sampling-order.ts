/**
 * Safe `ORDER BY` construction for full-table sampling sweeps.
 *
 * Why this exists: the snapshot, branch, and snapshot-diff sweeps hardcoded
 * `ORDER BY rowid` to make a capture deterministic. But `rowid` is not present
 * on every relation. A `WITHOUT ROWID` table (e.g. PowerSync's
 * `ps_updated_rows`) and a view (PowerSync exposes its user tables as views
 * over an `id` + `json` store) both have no `rowid` column, so the query failed
 * with `SqliteException(1): no such column: rowid` and the sweep aborted on
 * those relations. See GitHub issue #32.
 *
 * Rule: order by the declared primary key when one exists. That is both
 * deterministic and always valid — including for `WITHOUT ROWID` tables, which
 * SQLite *requires* to declare a PRIMARY KEY. When no PK is declared, omit the
 * clause entirely rather than fall back to `rowid`: a relation with no declared
 * PK is either an ordinary rowid table (a plain `SELECT *` still returns rows in
 * rowid order in practice) or a view (no rowid at all), and omitting the clause
 * is the only form valid for both. Determinism is preserved wherever a PK
 * exists, which covers every relation where row identity actually matters.
 */

/** Quotes a SQL identifier, escaping embedded double quotes. */
export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Returns a rowid-free `ORDER BY` clause for a sampling sweep, prefixed with a
 * single leading space when non-empty so it can be concatenated directly:
 * `` `SELECT * FROM "t"${samplingOrderBy(pk)} LIMIT 100` ``.
 *
 * @param pkColumns declared primary-key column names, in key order (empty when
 *   the relation has no declared PK — including views).
 * @param descending order by the PK descending (used by previews that want the
 *   most-recent rows first); ignored when there is no PK.
 */
export function samplingOrderBy(
  pkColumns: readonly string[],
  descending = false,
): string {
  if (pkColumns.length === 0) return '';
  const dir = descending ? ' DESC' : '';
  const cols = pkColumns.map((c) => `${quoteIdent(c)}${dir}`).join(', ');
  return ` ORDER BY ${cols}`;
}
