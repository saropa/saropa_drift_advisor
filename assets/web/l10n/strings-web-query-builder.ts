/**
 * Web-viewer query-builder source strings (System B, browser surface) — plan 75.
 *
 * Single source of truth for the user-facing strings rendered by the standalone
 * web viewer's visual SQL query builder: assets/web/query-builder.ts,
 * query-builder-multi.ts (the single-table form, the multi-table JOIN/GROUP BY
 * builder, mode/scope toggles, operator labels, empty states, and alerts).
 * Each entry maps a SYMBOLIC KEY → its ENGLISH fallback; render code passes the
 * key to `vt()` (../l10n.ts) and the English value here ships until a locale
 * overlay is installed.
 *
 * Conventions match strings-web.ts: keys are dot.case under the `viewer.qb.`
 * namespace, `{0}`/`{1}` placeholders carry runtime values (never English
 * concatenation, which a translator cannot reorder), and SQL keywords/operators
 * (SELECT, WHERE, JOIN, ASC, =, >, IN, COUNT, …) stay literal in code because
 * they are machine tokens, not prose. This slice is registered in ../l10n.ts.
 */

/** Symbolic key → English source text for the web query builder. */
export const stringsWebQueryBuilder: Record<string, string> = {
  // --- Builder shell + mode/scope toggles (query-builder.ts) ---
  'viewer.qb.header': 'Query builder',
  'viewer.qb.mode.visual.title': 'Visual query builder',
  'viewer.qb.mode.visual.label': 'Visual',
  'viewer.qb.mode.raw.title': 'Edit SQL directly',
  'viewer.qb.mode.raw.label': 'Raw SQL',
  'viewer.qb.scope.toggle.title':
    'Single-table keeps the classic form; multi-table adds JOINs, GROUP BY, and multi ORDER BY',
  'viewer.qb.scope.single.label': 'Single table',
  'viewer.qb.scope.multi.label': 'Multi-table',

  // --- Single-table form labels + controls (query-builder.ts) ---
  // SELECT/WHERE/ORDER BY/LIMIT label the form rows; kept as user-facing words
  // so a locale may translate the form even though the same tokens are SQL.
  'viewer.qb.label.select': 'SELECT',
  'viewer.qb.label.where': 'WHERE',
  'viewer.qb.label.orderBy': 'ORDER BY',
  'viewer.qb.label.limit': 'LIMIT',
  'viewer.qb.order.none': 'None',
  'viewer.qb.where.add.title': 'Add another WHERE condition',
  'viewer.qb.where.add.label': '+ Add condition',
  'viewer.qb.where.connector.title': 'Combine with previous condition',
  'viewer.qb.where.value.placeholder': 'value',
  'viewer.qb.where.remove.title': 'Remove condition',

  // --- WHERE operator labels (query-builder.ts getWhereOps) ---
  // The operator VALUES (LIKE, =, IS NULL, …) are SQL and stay literal; only
  // these readable labels are translatable. Symbol labels (=, !=, >, <) are not
  // here because they are pure symbols, not prose.
  'viewer.qb.op.contains': 'contains',
  'viewer.qb.op.equals': 'equals',
  'viewer.qb.op.notContains': 'not contains',
  'viewer.qb.op.startsWith': 'starts with',
  'viewer.qb.op.isNull': 'is null',
  'viewer.qb.op.isNotNull': 'is not null',

  // --- Multi-table panel intro + raw-import (query-builder.ts) ---
  'viewer.qb.multi.intro':
    'Build JOINs from the root table. Preview shows validation errors until the graph is valid.',
  'viewer.qb.raw.import.title': 'Parse the SQL above into the multi-table visual builder',
  'viewer.qb.raw.import.label': 'Import to visual builder',

  // --- Shared run/reset actions (query-builder.ts) ---
  'viewer.qb.run.title': 'Execute the built query',
  'viewer.qb.run.label': 'Run query',
  'viewer.qb.run.busy': 'Running…',
  'viewer.qb.reset.title': 'Return to table view',
  'viewer.qb.reset.label': 'Reset to table view',

  // --- Results header + status (query-builder.ts) ---
  // {0} is a pluralized row count; {0} in results.heading is the pre-built
  // results label (markup/count assembled at the call site).
  'viewer.qb.result.rowCount': 'Query builder result: {0} row(s)',
  'viewer.qb.results.heading': 'Results — {0}',
  'viewer.qb.results.ariaLabel': 'Results',

  // --- Alerts / errors (query-builder.ts) ---
  'viewer.qb.alert.fixValidation':
    'Fix validation errors shown in the preview, or switch to Raw SQL.',
  // {0} is the server-returned error text (or the unknown fallback below).
  'viewer.qb.alert.queryError': 'Query error: {0}',
  'viewer.qb.alert.unknownError': 'Unknown error',
  // {0} is the thrown error message.
  'viewer.qb.alert.error': 'Error: {0}',
  'viewer.qb.alert.pasteSelect': 'Paste a SELECT statement to import.',
  // {0} is the newline-joined importer error list.
  'viewer.qb.alert.importFailed': 'Could not import SQL:\n{0}',
  // {0} is the thrown error message from schema loading.
  'viewer.qb.alert.schemaLoadFailed': 'Schema load failed: {0}',

  // --- Multi-table section headings (query-builder-multi.ts) ---
  'viewer.qb.section.tables': 'Tables',
  'viewer.qb.section.joins': 'JOINs',
  'viewer.qb.section.selectColumns': 'SELECT columns',
  'viewer.qb.section.where': 'WHERE',
  'viewer.qb.section.groupBy': 'GROUP BY',
  'viewer.qb.section.orderBy': 'ORDER BY',

  // --- Multi-table tables/joins controls (query-builder-multi.ts) ---
  'viewer.qb.multi.table.remove.title': 'Remove this table instance',
  'viewer.qb.multi.table.remove.label': 'Remove',
  'viewer.qb.multi.joins.empty':
    'No JOINs yet. Add one before selecting columns from a second table.',
  'viewer.qb.multi.join.left.label': 'Left',
  'viewer.qb.multi.join.rightTable.label': 'Right table',
  'viewer.qb.multi.join.add.label': 'Add JOIN',
  'viewer.qb.multi.join.rightBase.pick': '— pick —',
  'viewer.qb.multi.join.rightBase.loadSchema': '(load schema)',
  // <em>/<code> markup is applied at the call site around the {0}/{1} tokens so
  // the emphasized "right" and the tN code span can be reordered per locale.
  'viewer.qb.multi.join.help':
    'Connects the {0} base table as a new instance ({1}) or joins two existing instances when the right table already exists and you pick matching columns.',
  // Emphasized word and code token wrapped at the call site.
  'viewer.qb.multi.join.help.right': 'right',
  'viewer.qb.multi.join.help.tn': 'tN',

  // --- Multi-table SELECT columns (query-builder-multi.ts) ---
  'viewer.qb.multi.sel.empty': 'No columns selected.',
  'viewer.qb.multi.sel.add.label': '+ Add column',
  'viewer.qb.multi.sel.agg.none': '(none)',
  'viewer.qb.multi.sel.agg.title': 'Aggregate (required when GROUP BY is non-empty)',
  'viewer.qb.multi.sel.remove.title': 'Remove column',

  // --- Multi-table WHERE filters (query-builder-multi.ts) ---
  'viewer.qb.multi.flt.empty': 'No filters.',
  'viewer.qb.multi.flt.add.label': '+ Add condition',
  'viewer.qb.multi.flt.value.placeholder': 'value or comma-separated (IN)',

  // --- Multi-table GROUP BY / ORDER BY (query-builder-multi.ts) ---
  // Shared "None" empty state for both GROUP BY and ORDER BY sections.
  'viewer.qb.multi.empty.none': 'None',
  'viewer.qb.multi.gb.add.label': '+ Add GROUP BY',
  'viewer.qb.multi.ob.add.label': '+ Add ORDER BY',

  // --- Multi-table alerts (query-builder-multi.ts) ---
  'viewer.qb.multi.alert.pickJoin': 'Pick left column, right table, and right column for the JOIN.',
};
