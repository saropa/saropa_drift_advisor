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
