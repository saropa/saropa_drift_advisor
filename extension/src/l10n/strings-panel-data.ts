/**
 * Host-panel English source strings — Data-management panel family: Clipboard
 * Import ([../import/clipboard-import-html.ts](../import/clipboard-import-html.ts)),
 * Import Dataset form ([../data-management/import-form-html.ts](../data-management/import-form-html.ts)),
 * Export Dataset form ([../data-management/export-form-html.ts](../data-management/export-form-html.ts)),
 * Test Data Seeder ([../seeder/seeder-html.ts](../seeder/seeder-html.ts)), and the
 * Bulk-edit dashboard ([../bulk-edit/bulk-edit-html.ts](../bulk-edit/bulk-edit-html.ts)).
 * Plan 75 §3.1.
 *
 * One registry slice per panel family (see `HOST_STRING_REGISTRIES` in
 * [../l10n.ts](../l10n.ts)). Each entry maps a SYMBOLIC KEY → its ENGLISH text;
 * the panel's HTML builder resolves the key via `t()` so the string reaches the
 * translation pipeline instead of shipping English in every locale.
 *
 * Runtime values (table names, row counts, formats) are passed as `{0}`/`{1}`
 * tokens, never concatenated English — `vscode.l10n.t()` substitutes them so a
 * translator can reorder the sentence. Machine values (column names, SQL types,
 * generator ids, grades) are data, not catalog strings, and stay rendered from
 * the objects directly. Strings inside a panel's client `<script>` are NOT here;
 * they are tagged `// TODO(l10n): client-script string` at their call site and
 * will move to the `__VT` webview map separately.
 */

/** Symbolic key → English source text for the data-management panel family. */
export const stringsPanelData: Record<string, string> = {
  // --- Clipboard import: mapping / preview tables ---
  'panel.data.clip.option.skip': '(skip)',
  // Appended after a column name to mark it the primary key, e.g. "id (PK)".
  'panel.data.clip.option.pk': ' (PK)',
  'panel.data.clip.map.col.clipboard': 'Clipboard Column',
  'panel.data.clip.map.col.table': '→ Table Column',
  'panel.data.clip.map.col.sample': 'Sample',
  'panel.data.clip.preview.empty': 'No columns mapped. Select target columns above.',
  // {0} = total parsed row count; only the first 5 are shown.
  'panel.data.clip.preview.truncated': 'Showing 5 of {0} rows',

  // --- Clipboard import: validation results ---
  // {0} = count of rows that have validation errors (pre-wrapped value).
  'panel.data.clip.valid.errorsHeader': '✗ {0} rows with errors:',
  // {0} = 1-based row number, {1} = the per-row error message.
  'panel.data.clip.valid.errorRow': 'Row {0}: {1}',
  // {0} = number of further error rows not individually listed.
  'panel.data.clip.valid.errorsMore': '...and {0} more rows with errors',
  // {0} = count of rows that have warnings (pre-wrapped value).
  'panel.data.clip.valid.warningsHeader': '⚠ {0} rows with warnings:',
  // {0} = 1-based row number, {1} = the per-row warning message.
  'panel.data.clip.valid.warningRow': 'Row {0}: {1}',
  // {0} = number of further warning rows not individually listed.
  'panel.data.clip.valid.warningsMore': '...and {0} more rows with warnings',

  // --- Clipboard import: dry-run results ---
  'panel.data.clip.dry.header': 'Dry Run Preview:',
  // {0} = count of rows that would be inserted.
  'panel.data.clip.dry.insert': 'INSERT {0} new rows',
  // {0} = count of existing rows that would be updated.
  'panel.data.clip.dry.update': 'UPDATE {0} existing rows',
  // {0} = count of rows that would be skipped.
  'panel.data.clip.dry.skip': 'SKIP {0} rows',
  'panel.data.clip.dry.updatesHeader': 'Updates Preview:',
  'panel.data.clip.dry.col.row': 'Row',
  'panel.data.clip.dry.col.column': 'Column',
  'panel.data.clip.dry.col.current': 'Current',
  'panel.data.clip.dry.col.new': 'New',
  // {0} = number of further updates not shown in the table.
  'panel.data.clip.dry.updatesMore': '...and {0} more updates',

  // --- Clipboard import: status / results ---
  'panel.data.clip.status.processing': 'Processing…',
  // {0} = count of rows imported.
  'panel.data.clip.status.imported': '✓ Imported {0} rows',
  // {0} = count of rows skipped; appended after the imported count when > 0.
  'panel.data.clip.status.skipped': '({0} skipped)',

  // --- Clipboard import: header / strategy / actions ---
  // {0} = target table name.
  'panel.data.clip.header.pasteInto': 'Paste into: {0}',
  // {0} = count of rows detected in the pasted clipboard content.
  'panel.data.clip.header.rowsDetected': '{0} rows detected',
  'panel.data.clip.strategy.title': 'Import Strategy',
  'panel.data.clip.strategy.insert': 'Insert only',
  'panel.data.clip.strategy.skipConflicts': 'Skip conflicts',
  'panel.data.clip.strategy.upsert': 'Upsert',
  'panel.data.clip.strategy.dryRun': 'Dry run',
  'panel.data.clip.matchBy.label': 'Match by:',
  // {0} = primary-key column name; "(Primary Key)" labels it.
  'panel.data.clip.matchBy.pkOption': '{0} (Primary Key)',
  'panel.data.clip.continueOnError': 'Continue on error',
  'panel.data.clip.section.mapping': 'Column Mapping',
  // {0} = count of mapped columns, {1} = total clipboard columns.
  'panel.data.clip.mapping.summary': '{0} of {1} columns mapped',
  'panel.data.clip.section.preview': 'Preview',
  'panel.data.clip.btn.cancel': 'Cancel',
  'panel.data.clip.btn.validate': 'Validate',
  'panel.data.clip.btn.runDryRun': 'Run Dry Run',
  // {0} = count of valid rows that would be imported.
  'panel.data.clip.btn.import': 'Import {0} rows',

  // --- Import Dataset form ---
  'panel.data.import.title': 'Import Dataset',
  'panel.data.import.field.source': 'Dataset Source',
  'panel.data.import.browse.name': 'Browse for file…',
  'panel.data.import.browse.desc': 'Select a .json dataset from disk',
  'panel.data.import.field.mode': 'Import Mode',
  'panel.data.import.mode.append.name': 'Append',
  'panel.data.import.mode.append.desc': 'Add rows to existing data',
  'panel.data.import.mode.replace.name': 'Replace',
  'panel.data.import.mode.replace.desc': 'Clear target tables first',
  'panel.data.import.mode.sql.name': 'SQL Only',
  'panel.data.import.mode.sql.desc': 'Generate SQL without executing',
  'panel.data.import.btn.import': 'Import',
  'panel.data.import.btn.cancel': 'Cancel',

  // --- Export Dataset form ---
  'panel.data.export.title': 'Export Dataset',
  // {0} = row count for the table; shown beside the table checkbox.
  'panel.data.export.table.rows': '{0} rows',
  'panel.data.export.field.name': 'Dataset Name',
  'panel.data.export.name.placeholder': 'my-dataset',
  'panel.data.export.name.error': 'Dataset name is required',
  'panel.data.export.field.tables': 'Tables to Export',
  'panel.data.export.selectAll': 'Select all',
  'panel.data.export.selectNone': 'Select none',
  'panel.data.export.tables.error': 'Select at least one table',
  'panel.data.export.btn.export': 'Export',
  'panel.data.export.btn.cancel': 'Cancel',

  // --- Test Data Seeder ---
  'panel.data.seeder.title': 'Test Data Seeder',
  // {0} = comma-joined list of table names (each pre-wrapped in <strong>).
  'panel.data.seeder.warning':
    'Circular FK dependencies detected in: {0}. FK columns in these tables will use NULL.',
  'panel.data.seeder.rowsPerTable': 'Rows per table:',
  // {0} = column count for the table group, e.g. "5 cols".
  'panel.data.seeder.cols': '{0} cols',
  // {0} = table name; tooltip on the per-table row-count input.
  'panel.data.seeder.rowsFor': 'Rows for {0}',
  'panel.data.seeder.output.label': 'Output:',
  // Output-mode radio labels; "SQL"/"JSON" are format acronyms, "Execute" is the
  // run-now action — all three translate together as one mode set.
  'panel.data.seeder.output.sql': 'SQL',
  'panel.data.seeder.output.json': 'JSON',
  'panel.data.seeder.output.execute': 'Execute',
  'panel.data.seeder.btn.preview': 'Preview (5 rows)',
  'panel.data.seeder.btn.generate': 'Generate',
  'panel.data.seeder.btn.exportDataset': 'Export as Dataset',
  'panel.data.seeder.preview.title': 'Preview',
  // {0} = table name; shown when a previewed table generated no rows.
  'panel.data.seeder.preview.noRows': '{0}: no rows',

  // --- Bulk-edit dashboard ---
  'panel.data.bulk.docTitle': 'Bulk edit data',
  'panel.data.bulk.title': 'Saropa Drift Advisor — Edit table data',
  // {0} = pending-operation count (pre-wrapped in <span class="count">).
  'panel.data.bulk.pending': 'Pending operations in this workspace: {0}',
  // "table viewer panel" and "writeQuery" carry static markup at the call site;
  // the sentence stays one reorderable unit.
  'panel.data.bulk.instructions':
    'Edit cells in the {0} (double-click a cell). When the debug server has {1} configured, you can apply the batch below.',
  'panel.data.bulk.instructions.viewer': 'table viewer panel',
  'panel.data.bulk.btn.openViewer': 'Open table viewer',
  'panel.data.bulk.btn.preview': 'Preview SQL',
  'panel.data.bulk.btn.commit': 'Apply to database',
  'panel.data.bulk.btn.undo': 'Undo',
  'panel.data.bulk.btn.redo': 'Redo',
  'panel.data.bulk.btn.discard': 'Discard all',
  'panel.data.bulk.btn.invariants': 'Data invariants…',
  'panel.data.bulk.btn.clipboardImport': 'Paste from clipboard…',
  'panel.data.bulk.btn.openDvr': 'Query DVR',
  'panel.data.bulk.btn.captureSnapshot': 'Capture DB snapshot…',
  'panel.data.bulk.captureSnapshot.title':
    'Capture row-level snapshot for Timeline / diff (safety net before destructive edits)',
  'panel.data.bulk.gridHint':
    'Grid: Tab to focus, Arrow Up/Down to move the row selection, Enter opens the table viewer, Escape clears selection. Ctrl+Enter applies (same as toolbar).',
  'panel.data.bulk.col.kind': 'Kind',
  'panel.data.bulk.col.table': 'Table',
  'panel.data.bulk.col.details': 'Details',
  'panel.data.bulk.col.when': 'When',
  'panel.data.bulk.grid.empty': 'No pending edits.',
  'panel.data.bulk.pager.prev': 'Prev',
  // {0} = current page number, {1} = total page count, e.g. "Page 1 / 1".
  'panel.data.bulk.pager.pageInfo': 'Page {0} / {1}',
  'panel.data.bulk.pager.next': 'Next',

  // --- Bulk-edit dashboard: client-script strings (resolved in-browser via the
  //     __VT bridge, since the grid's render runs client-side). The pager
  //     position reuses `panel.data.bulk.pager.pageInfo` and the empty-grid text
  //     reuses `panel.data.bulk.grid.empty`; only the range meta line is new. ---
  // {0} = 1-based first row shown, {1} = last row shown, {2} = total pending
  //   edits, e.g. "Showing 1-20 of 53 pending edits".
  'panel.data.bulk.pageMeta.showing': 'Showing {0}-{1} of {2} pending edits',
};
