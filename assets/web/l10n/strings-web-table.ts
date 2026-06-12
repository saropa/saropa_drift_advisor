/**
 * Web-viewer English source strings — table surface (System B, browser) — plan 75 §3.1.
 *
 * Covers the standalone web viewer's table modules: the data grid, the sidebar
 * table list / browse cards, the table-definition panel (profiling meta + JSON/
 * Flutter export tools), the collapsible toggle, and inline cell editing
 * (`assets/web/table-view.ts`, `table-list.ts`, `table-def-meta.ts`,
 * `table-def-toggle.ts`, `cell-edit.ts`). Each entry maps a SYMBOLIC KEY → its
 * ENGLISH text; render code passes the key to `vt()` ([../l10n.ts](../l10n.ts)),
 * which returns the translated overlay value when installed and this English
 * fallback otherwise.
 *
 * Use `{0}`, `{1}`, … placeholders for runtime values (counts, table/column
 * names, error text) — never English string concatenation, which a translator
 * cannot reorder. Singular/plural and if/else variants each get their own key
 * (`.rowOne` / `.rowMany`) rather than a hardcoded English branch in code.
 *
 * Registered in `WEB_STRING_REGISTRIES` ([../l10n.ts](../l10n.ts)); the merge
 * list is explicit because esbuild bundles at build time (no runtime glob).
 */

/** Symbolic key → English source text for the web viewer table surface. */
export const stringsWebTable: Record<string, string> = {
  // --- Data grid (assets/web/table-view.ts: buildDataTableHtml) ---
  'viewer.table.grid.empty': 'No rows.',
  // {0} = referenced table, {1} = referenced column.
  'viewer.table.grid.fkHeaderTitle': 'FK to {0}.{1}',
  'viewer.table.grid.maskTip':
    'Sensitive column: values are redacted while PII masking is on. Use the mask control in the toolbar to show raw data.',
  'viewer.table.grid.headerDragTitle': 'Drag to reorder; right-click for menu',
  'viewer.table.grid.actionsHeader': 'Actions',
  // {0} = raw (unformatted) cell value shown on hover over a formatted cell.
  'viewer.table.grid.rawTitle': 'Raw: {0}',
  'viewer.table.grid.copyValueTitle': 'Copy value',
  'viewer.table.grid.expandValueTitle': 'Open full value',
  'viewer.table.grid.rowDeleteTitle': 'Delete this row',
  'viewer.table.grid.rowDeleteLabel': 'Delete',
  // Formatted boolean cell values (INTEGER columns with a boolean-style name).
  'viewer.table.grid.boolTrue': 'true',
  'viewer.table.grid.boolFalse': 'false',

  // --- Copy toast (assets/web/table-view.ts: showCopyToast) ---
  'viewer.table.toast.copied': 'Copied!',

  // --- Status bar (assets/web/table-view.ts: buildTableStatusBar) ---
  // {0} = wrapped row-range markup, {1} = total row count.
  'viewer.table.status.showing': 'Showing {0} of {1} rows',
  'viewer.table.status.pastEnd': '(past end of results)',
  // Column count chip — singular vs plural. {0} = count.
  'viewer.table.status.columnOne': '{0} column',
  'viewer.table.status.columnMany': '{0} columns',

  // --- Results heading label (assets/web/table-view.ts: buildResultsLabel) ---
  // Rows: {0} = page count, {1} = total. "of" form when total differs from page.
  'viewer.table.results.rowsOf': '{0} of {1} rows',
  'viewer.table.results.rowOne': '{0} row',
  'viewer.table.results.rowMany': '{0} rows',
  // Columns: {0} = visible count, {1} = total.
  'viewer.table.results.colsOf': '{0} of {1} columns',
  'viewer.table.results.colOne': '{0} column',
  'viewer.table.results.colMany': '{0} columns',
  // {0} = the composed rows/columns label above.
  'viewer.table.results.heading': 'Results — {0}',
  'viewer.table.results.regionLabel': 'Results',
  'viewer.table.results.loading': 'Loading…',
  // "both" view data-section header. {0} = table name.
  'viewer.table.results.dataHeader': 'Table data: {0}',

  // --- Table-definition panel (assets/web/table-view.ts: buildTableDefinitionHtml) ---
  'viewer.table.def.regionLabel': 'Table definition',
  'viewer.table.def.headingLabel': 'Table definition',
  // Shown as the type-icon hover when a column declares no SQL type.
  'viewer.table.def.typeUnspecified': 'unspecified',
  // Type cell body when the column declares no SQL type.
  'viewer.table.def.typeEmpty': '(unspecified)',
  'viewer.table.def.visTitle': 'Show this column in the results table',
  // {0} = column name.
  'viewer.table.def.visLabel': 'Show {0} in results',
  'viewer.table.def.badgePk': 'Primary key',
  // {0} = referenced table, {1} = referenced column.
  'viewer.table.def.badgeFk': 'FK → {0}.{1}',
  // NOT NULL is a SQL keyword shown as the column constraint flag.
  'viewer.table.def.flagNotNull': 'NOT NULL',
  // Base column-table headers.
  'viewer.table.def.colShow': 'Show',
  'viewer.table.def.colShowTitle': 'Show column in the results table',
  'viewer.table.def.colColumn': 'Column',
  'viewer.table.def.colType': 'Type',
  'viewer.table.def.colConstraints': 'Constraints',

  // --- Table-definition profiling meta columns (assets/web/table-view.ts) ---
  'viewer.table.def.metaFill': 'Fill',
  'viewer.table.def.metaFillTitle': 'Share of rows with a non-null value',
  'viewer.table.def.metaNulls': 'Nulls',
  'viewer.table.def.metaNullsTitle': 'Number of NULL values',
  'viewer.table.def.metaDistinct': 'Distinct',
  'viewer.table.def.metaDistinctTitle': 'Number of distinct values',
  'viewer.table.def.metaUnique': 'Unique',
  'viewer.table.def.metaUniqueTitle': 'Uniqueness; key flag when every value is unique',
  'viewer.table.def.metaMin': 'Min',
  'viewer.table.def.metaMinTitle': 'Smallest value',
  'viewer.table.def.metaMax': 'Max',
  'viewer.table.def.metaMaxTitle': 'Largest value',
  'viewer.table.def.metaSize': 'Size',
  'viewer.table.def.metaSizeTitle': 'Total stored bytes',
  // Per-column meta cell hovers. {0}=non-null, {1}=total, {2}=null count.
  'viewer.table.def.fillCellTitle': '{0} of {1} rows filled ({2} null)',
  'viewer.table.def.uniqueKeyTitle': 'Candidate key: every value is unique',
  // {0} = distinct count, {1} = total rows.
  'viewer.table.def.uniqueRatioTitle': '{0} distinct of {1} rows',
  'viewer.table.def.sizeCellTitle': 'Total bytes across all rows (SUM of LENGTH)',

  // --- Table-definition export/meta tool buttons (assets/web/table-view.ts) ---
  'viewer.table.def.toolMetaTitle':
    'Show column profiling stats (fill, nulls, distinct, min/max, size)',
  'viewer.table.def.toolMetaLabel': 'Toggle column profiling stats',
  'viewer.table.def.toolJsonTitle': 'Copy table definition as JSON',
  'viewer.table.def.toolJsonLabel': 'Copy table definition as JSON',
  'viewer.table.def.toolFlutterTitle': 'Copy table definition as Flutter (Drift) class',
  'viewer.table.def.toolFlutterLabel': 'Copy table definition as Flutter code',

  // --- Table-definition export tool toasts/errors (assets/web/table-def-meta.ts) ---
  'viewer.table.def.copiedJson': 'Definition copied as JSON',
  'viewer.table.def.copiedFlutter': 'Definition copied as Flutter',
  // {0} = error message.
  'viewer.table.def.statsFailed': 'Stats failed: {0}',
  // Fallback when the failed stats query returns no error detail.
  'viewer.table.def.statsQueryFailed': 'Stats query failed',
  // Generic fallback substituted for {0} in statsFailed when no message exists.
  'viewer.table.def.errorGeneric': 'error',

  // --- Sidebar table list / loading (assets/web/table-list.ts) ---
  // rowCountText: {0} = table name, {1} = page-size limit.
  'viewer.table.list.upToRows': '{0} (up to {1} rows)',
  'viewer.table.list.noRowsInRange': 'no rows in this range',
  // {0} = first row index, {1} = last row index.
  'viewer.table.list.showingRange': 'showing {0}–{1}',
  // {0}=table name, {1}=total, {2}=range text (one of the two above).
  'viewer.table.list.countRowOne': '{0} ({1} row; {2})',
  'viewer.table.list.countRowMany': '{0} ({1} rows; {2})',
  'viewer.table.list.pinTitle': 'Pin to top',
  'viewer.table.list.unpinTitle': 'Unpin',
  // {0} = table name.
  'viewer.table.list.loadingNamed': 'Loading {0}…',
  'viewer.table.list.loading': 'Loading…',
  'viewer.table.list.loadError': 'Error',
  'viewer.table.list.browseEmpty': 'No tables found.',
  // {0} = table name.
  'viewer.table.list.browseOpenTitle': 'Open {0} in a tab',

  // --- Cell-value popup (assets/web/cell-edit.ts: showCellValuePopup) ---
  'viewer.table.popup.title': 'Cell value',
  // {0} = column name.
  'viewer.table.popup.titleNamed': 'Cell value: {0}',

  // --- Inline cell edit alerts (assets/web/cell-edit.ts) ---
  'viewer.table.edit.busy': 'Finish or cancel the current edit before editing another cell.',
  'viewer.table.edit.noPk': 'This table has no primary key column; inline edit is disabled.',
  'viewer.table.edit.pkLocked': 'Primary key columns cannot be edited inline.',
  'viewer.table.edit.blobLocked': 'BLOB columns cannot be edited inline.',
  // {0} = error message.
  'viewer.table.edit.schemaFailed': 'Could not load schema: {0}',

  // --- Inline cell edit validation messages (assets/web/cell-edit.ts) ---
  'viewer.table.edit.notNull': 'This column is NOT NULL — a value is required.',
  'viewer.table.edit.expectBool': 'Expected 0 or 1 (or true/false).',
  'viewer.table.edit.expectInt': 'Expected an integer (e.g. 42, -7).',
  'viewer.table.edit.expectNumber': 'Expected a number (e.g. 3.14, -0.5).',

  // --- Inline cell edit context / controls (assets/web/cell-edit.ts) ---
  // SQL type shown in the edit context bar when the column declares no type.
  'viewer.table.edit.typeUnspecified': 'unspecified',
  // Nullability label in the edit context bar (paired with flagNotNull style).
  'viewer.table.edit.nullable': 'nullable',
  'viewer.table.edit.constraintNotNull': 'NOT NULL',
  // {0}=PK name, {1}=PK value, {2}=column name, {3}=type, {4}=nullability label.
  'viewer.table.edit.context': '{0}={1} • {2} ({3}, {4})',
  // {0} = original value (or the NULL label).
  'viewer.table.edit.was': 'was: {0}',
  // Standalone NULL marker shown for the original value when it is null.
  'viewer.table.edit.nullValue': 'NULL',
  // {0} = column name.
  'viewer.table.edit.inputLabel': 'Edit {0}',
  'viewer.table.edit.save': 'Save',
  'viewer.table.edit.cancel': 'Cancel',
  'viewer.table.edit.retry': 'Retry save',
  'viewer.table.edit.reload': 'Reload table',
  // {0} = server/network error message.
  'viewer.table.edit.saveFailed': 'Save failed: {0}',
  'viewer.table.edit.requestFailed': 'Request failed',
};
