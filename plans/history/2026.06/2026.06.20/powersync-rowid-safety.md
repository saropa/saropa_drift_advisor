# PowerSync rowid-safety (GitHub #32)

The VS Code extension built table queries that ordered or keyed rows by `rowid`,
which does not exist on views or `WITHOUT ROWID` tables. Against a PowerSync
database — whose user tables are exposed as views over an `id` + `json` store
and whose system tables (e.g. `ps_updated_rows`) are `WITHOUT ROWID` — those
queries threw `SqliteException(1): no such column: rowid` and aborted snapshot
and branch capture as well as the lineage and impact tools.

## Defect

Two distinct query patterns relied on `rowid`:

1. **Sampling sweeps** issued `SELECT * FROM "<table>" ORDER BY rowid LIMIT N`
   to capture a deterministic page of every table. On a relation with no
   `rowid` column the statement failed to prepare. The snapshot sweep ran on
   connect, so connecting to a PowerSync database surfaced the error
   immediately (`SELECT * FROM "ps_updated_rows" ORDER BY rowid LIMIT 1000`).
2. **Keyed operations** (lineage, impact, global-search, mutation tracking,
   constraint validation, data narrator) chose a single row-identity column
   with `columns.find((c) => c.pk)?.name ?? 'rowid'`. The `rowid` fallback was
   taken whenever `PRAGMA table_info` reported no primary key — which is exactly
   the case for a view, where the logical key (`id`) is not reported as a PK.

## Fix

Two helpers were added under `extension/src/sql/`:

- `samplingOrderBy(pkColumns, descending?)` returns an `ORDER BY` over the
  declared primary key, or an empty clause when no PK is declared. Omitting the
  clause is the only form valid for both an ordinary rowid table and a view.
  `WITHOUT ROWID` tables are required by SQLite to declare a PRIMARY KEY, so
  they remain deterministically ordered by that key.
- `rowKeyColumn(columns)` selects a row-identity column in preference order:
  declared PK, then a column literally named `id` (case-insensitive — the
  PowerSync view case), then `rowid` as a last resort. Behavior changes only
  when no PK is declared, so PK-bearing tables are unaffected.

Call sites updated:

- Sampling sweeps: `timeline/snapshot-store.ts`, `branching/branch-manager.ts`,
  `timeline/snapshot-commands.ts`, `hover/drift-hover-provider.ts`. The hover
  preview now fetches schema metadata before its data read so the order clause
  can reference the PK; the result is cached, so the extra round trip is paid at
  most once per table per cache TTL.
- Keyed operations: `lineage/lineage-tracer.ts`, `lineage/lineage-commands.ts`,
  `impact/impact-analyzer.ts`, `impact/impact-commands.ts`,
  `global-search/global-search-engine.ts`,
  `mutation-stream/mutation-stream-panel.ts`,
  `constraint-wizard/constraint-validator.ts`, `narrator/narrator-commands.ts`.

Three map-based `?? 'rowid'` fallbacks remain (`impact-analyzer.ts`,
`lineage-tracer.ts`, `mutation-stream-view-row.ts`). Those maps are now
populated through `rowKeyColumn`, so the literal fallback only applies to a
table absent from the map (non-user or dropped) and is intentionally retained as
a defensive default.

The server (`lib/`) was not changed: its table-data endpoint already issued
plain `SELECT * ... LIMIT/OFFSET` with no `ORDER BY rowid`, so browsing table
data was never affected. The reported failure was entirely in the extension's
query construction.

## Tests

- `extension/src/test/sampling-order.test.ts` — unit coverage for the order
  clause, including composite PK, descending order, identifier escaping, and a
  `ps_updated_rows` regression assertion that the emitted SQL contains no
  `rowid`.
- `extension/src/test/row-key.test.ts` — unit coverage for PK / `id` / `rowid`
  selection precedence and case-insensitive `id` matching.
- `extension/src/test/snapshot-store.test.ts` — a rowid-less-sweep regression
  test that stubs a `WITHOUT ROWID` table and a no-PK view, captures, and
  asserts every emitted `/api/sql` sweep omits `rowid`, that the composite-PK
  table orders by its PK columns, and that the no-PK view falls back to no
  `ORDER BY` clause.

The pre-existing `constraint-validator.test.ts` case "should use rowid when
table has no PK column" continues to pass unchanged: its `logs` table declares
neither a PK nor an `id` column, so `rowKeyColumn` correctly reaches the `rowid`
last resort.

Full extension suite: 2897 passing. TypeScript compile (`tsc -p ./`) clean.

## Not covered

No end-to-end run against a live PowerSync database was performed; the
rowid-less schema is reproduced through the mocked server in the regression
test. Pulling a PowerSync example project from `powersync-ja/powersync.dart` for
a full integration test remains open if live verification is later required.
