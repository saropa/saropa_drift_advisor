# Schema screen — improvements

Status: Fixed

Screen: web viewer **Schema** view (`assets/web/schema.ts`), which renders the
database DDL into a `<pre>` block, plus the combined **Both** (schema + table
data) view.

## 1. Search + type filter

1. Add a search text box that filters the schema by **table name** and
   **column name** (substring, case-insensitive).
2. Add a **type filter** box/dropdown that filters by SQL column type as a
   string (e.g. `INTEGER`, `TEXT`, `REAL`, `BLOB`). Populate the choices from
   the types actually present in the schema.
3. Search + type filter should compose (both active narrows the result).

Note: align behavior with the Diagram screen request (`plans/history/2026.06/2026.06.18/BUG_diagram_screen.md`),
which asks for the same name/type filtering plus highlight-only vs.
hide-non-matching toggles — reuse the same filter UI where practical.

## 2. Richer per-screen information

Beyond the raw DDL, surface table/schema intelligence. Baseline (obvious):

- Row count per table and total rows.
- Approximate on-disk size per table and DB total.
- Column count per table.

Higher-value additions (the "wow"):

- **Keys & relationships at a glance:** primary key, foreign keys (with the
  referenced table/column), unique constraints, and indexes — pulled from the
  existing FK/relationship metadata already cached for the data view
  (`S.fkMetaCache`, soft-relationship detector).
- **Nullability / NOT NULL and default values** per column, rendered as a
  compact column-definition table rather than only inline in the DDL.
- **Orphan / unreferenced tables** callout, reusing the orphan-table detector
  that already exists server-side (`orphan_table_detector.dart`).
- **Anomaly / data-quality badges** per table (reuse `anomaly_detector.dart`
  output) so the schema view flags suspect tables, not just structure.
- **Index coverage hints:** flag foreign-key columns that have no supporting
  index (common performance trap).
- **Last-modified / mutation activity** per table if available from the
  mutation-stream data, so the busiest tables stand out.
- **Copy/export the schema** as SQL, Markdown, JSON (mirror the copy-buttons
  request in `plans/history/2026.06/2026.06.18/BUG_RUN_SQL_Screen.md` item 6 for
  consistency across screens).

## 3. Formatting consistency

- Apply the same SQL auto-formatting requested for the RUN SQL screen
  (`plans/history/2026.06/2026.06.18/BUG_RUN_SQL_Screen.md` item 2,
  `sql-formatter`) to the schema DDL `<pre>` so it is consistently
  pretty-printed everywhere SQL is shown. (Note: the schema-DDL formatting in
  that item already routes through `formatAndHighlightSchema` in `schema.ts`.)

## Finish Report (2026-06-18)

The web viewer's **Schema** tab previously rendered only the raw DDL dump inside
a single `<pre>` element — no per-table structure, no search, and no schema
intelligence. All three improvement areas are now addressed.

### What changed

- **New structured explorer** (`assets/web/schema-explorer.ts`) replaces the
  raw-DDL-only Schema tab. It renders one card per table, each showing the
  column list (type / primary-key / foreign-key / NOT NULL badges, reusing the
  existing `.table-definition` table styling), stat chips (row count, column
  count, index count, outgoing/incoming foreign-key counts, and live write
  count), a relationships block (declared plus incoming foreign keys), the
  per-table index list, and per-table data-quality details. The raw formatted
  DDL remains available in a collapsible at the bottom (still filled by
  `loadSchemaIntoPre`).

- **Search + type filter** (item 1). A filter box matches table or column name
  (case-insensitive substring) and a type dropdown — populated from the base
  types actually present in the schema — restricts to tables containing a column
  of that type. Both compose. Matches are highlighted via the existing
  `highlightText` helper.

- **Richer information + detectors** (item 2). Detector results are merged in
  from endpoints that already exist server-side, so no new server endpoints were
  added: orphan tables (`/api/analytics/orphan-tables`), data-quality anomalies
  (`/api/analytics/anomalies`), foreign-key columns missing an index
  (`/api/index-suggestions`), per-table column/index counts plus database total
  size (`/api/analytics/size`), and live per-table write activity tallied from
  the `/api/mutations` long-poll while the tab is open. Each fetch is
  best-effort: a detector that is unavailable (for example mutations require a
  host `writeQuery`, orphans require a declared Drift schema) degrades to "no
  badge" and never blanks the view. Schema-level Copy buttons export the schema
  as SQL, Markdown, or JSON.

- **Formatting consistency** (item 3) already shipped via the existing
  `sql-format.ts` / `formatAndHighlightSchema` path; the structured view's
  "Copy SQL" routes through the same formatter.

### Design and limitations

- Per-table on-disk **byte** size is not exposed by the size endpoint (SQLite
  has no cheap per-table byte figure without `dbstat`), so size is shown at the
  database-total level in the summary; per-table cards show row / column / index
  counts instead.
- SQLite exposes no per-table last-modified timestamp, so "activity" is a real
  per-table write tally accumulated from the live mutation stream (each event
  carries its table) rather than a fabricated recency metric.

### Structure and tests

Pure, DOM-free logic (`baseType`, `tableFks`, `collectTypes`,
`buildIncomingFkMap`, `tableMatches`, `buildSchemaMarkdown`) was extracted into
`assets/web/schema-explorer-logic.ts` so it is unit-testable without a DOM,
mirroring the `home-search.ts` split. `assets/web/test/schema-explorer-logic.test.mjs`
covers it (14 assertions). All user-facing strings are localized through new
`viewer.schema.explorer.*` keys in `strings-web-schema.ts`; static-shell labels
in `html_content.dart` are localized on first activation.

### Verification

- Web typecheck (`tsc -p tsconfig.web.json --noEmit`): clean.
- Bundle (`esbuild`) and styles (`sass`): rebuilt.
- Full web test suite (`node --test`): 252 pass, 0 fail.
- `dart analyze lib/src/server/html_content.dart`: only pre-existing issues,
  none in the changed markup region.
