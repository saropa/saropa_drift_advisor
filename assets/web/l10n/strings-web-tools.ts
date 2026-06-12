/**
 * Web-viewer English source strings — tools slice (System B, browser surface).
 *
 * Cohesive slice of the web-viewer string registry covering the standalone
 * tool panels (`assets/web/tools-import.ts`, `tools-analytics.ts`,
 * `tools-compare.ts`), the analysis persistence/compare module
 * (`analysis.ts`), and the chart renderers (`charts.ts`). Each entry maps a
 * SYMBOLIC KEY → its ENGLISH text; render code passes the key to `vt()`
 * ([../l10n.ts](../l10n.ts)) and the English value here is the in-bundle
 * fallback until a translation overlay is installed.
 *
 * WHY a registry instead of inline literals: a hardcoded display string never
 * reaches the translation pipeline, so it ships English in every locale.
 * Declaring it here (and rendering via `vt('key')`) is what lets the toolchain
 * extract, translate, and overlay it. See the seed file `strings-web.ts` and
 * plan 75 §5.1 for the add-a-string workflow.
 *
 * Keys are namespaced under `viewer.tools.*` and grouped by area. Use `{0}`,
 * `{1}` placeholders for runtime values — never English string concatenation,
 * which cannot be reordered by a translator.
 *
 * Keep this file under the 300-line limit; overflow extracts into
 * `strings-web-tools-b.ts`. The registry is added to `WEB_STRING_REGISTRIES`
 * in [../l10n.ts](../l10n.ts) centrally (the merge list is explicit because
 * esbuild bundles — there is no runtime glob).
 */

/** Symbolic key → English source text for the web-viewer tool panels. */
export const stringsWebTools: Record<string, string> = {
  // --- Import (assets/web/tools-import.ts) ---
  // {0} = error count; singular/plural split because word order and the
  // (N error(s)) wrapper differ per locale.
  'viewer.tools.import.history.errors.one': '({0} error)',
  'viewer.tools.import.history.errors.many': '({0} errors)',
  // {0} = imported row count.
  'viewer.tools.import.history.rows': '{0} row(s)',
  'viewer.tools.import.mapping.loading': 'Loading columns…',
  'viewer.tools.import.mapping.skip': '(skip)',
  'viewer.tools.import.mapping.loadFailed': 'Failed to load table columns.',
  'viewer.tools.import.clipboard.unavailable': 'Clipboard API not available (requires HTTPS or localhost).',
  'viewer.tools.import.clipboard.empty': 'Clipboard is empty.',
  // {0} = underlying error message.
  'viewer.tools.import.clipboard.readFailed': 'Failed to read clipboard: {0}',
  'viewer.tools.import.clipboard.permissionDenied': 'Permission denied',
  // {0} = target table name (escaped at call site).
  'viewer.tools.import.confirm': 'Import data into table "{0}"? This cannot be undone.',
  'viewer.tools.import.busy': 'Importing…',
  'viewer.tools.import.button': 'Import',
  // {0} = error detail.
  'viewer.tools.import.error': 'Error: {0}',
  'viewer.tools.import.requestFailed': 'Request failed',
  'viewer.tools.import.failed': 'Import failed',
  // {0} = imported row count.
  'viewer.tools.import.result': 'Imported {0} row(s).',
  // {0} = error count, {1} = first errors joined with "; ".
  'viewer.tools.import.resultErrors': '{0} error(s): {1}',

  // --- Index suggestions (assets/web/tools-analytics.ts) ---
  'viewer.tools.index.empty': 'No current result. Run Analyze first.',
  'viewer.tools.index.none': 'No index suggestions — schema looks good!',
  // {0} = suggestion count, {1} = tables analyzed count.
  'viewer.tools.index.summary': '{0} suggestion(s) across {1} tables:',
  'viewer.tools.index.selectAll': 'Select all suggestions',
  'viewer.tools.index.col.priority': 'Priority',
  'viewer.tools.index.col.tableColumn': 'Table.Column',
  'viewer.tools.index.col.reason': 'Reason',
  'viewer.tools.index.col.sql': 'SQL',
  'viewer.tools.index.copyHint': 'Click to copy',
  // {0} = count of currently-selected suggestion rows.
  'viewer.tools.index.selected': '{0} selected',
  'viewer.tools.index.previewSql': 'Preview SQL',
  'viewer.tools.index.applySelected': 'Apply selected',
  'viewer.tools.index.applyDisabledHint': 'Start the server with writeQuery configured to enable applying indexes.',
  'viewer.tools.index.applyDisabled': 'Apply disabled — server is read-only',
  // {0} = valid count, {1} = rejected count.
  'viewer.tools.index.preview.summary': '{0} valid, {1} rejected:',
  // {0} = SQL (escaped), {1} = rejection reason.
  'viewer.tools.index.preview.rejected': 'Rejected: {0} — {1}',
  // {0} = applied count, {1} = total attempted.
  'viewer.tools.index.apply.summary': '{0} of {1} index(es) created:',
  'viewer.tools.index.apply.ok': 'OK',
  'viewer.tools.index.apply.fail': 'FAIL',
  // {0} = per-statement error detail, appended after the SQL on a failed row.
  'viewer.tools.index.apply.errorSuffix': ' — {0}',
  // {0} = applied count.
  'viewer.tools.index.apply.toast': '{0} index(es) created — re-run Analyze to refresh the list.',
  // {0} = number of indexes to create.
  'viewer.tools.index.apply.confirm': 'Create {0} index(es) on the live database?',
  'viewer.tools.index.busy.preview': 'Previewing…',
  'viewer.tools.index.busy.apply': 'Applying…',
  'viewer.tools.index.busy.analyze': 'Analyzing…',
  'viewer.tools.index.analyze': 'Analyze',
  'viewer.tools.index.requestFailed': 'Request failed',
  // {0} = error detail.
  'viewer.tools.index.error': 'Error: {0}',
  'viewer.tools.index.compareTitle': 'Index suggestions',
  // {0} = before suggestion count, {1} = after suggestion count.
  'viewer.tools.index.compareSummary': 'Before: {0} suggestion(s) · After: {1} suggestion(s)',

  // --- Size analytics (assets/web/tools-analytics.ts) ---
  'viewer.tools.size.empty': 'No data.',
  'viewer.tools.size.card.total': 'Total Size',
  'viewer.tools.size.card.used': 'Used',
  'viewer.tools.size.card.free': 'Free',
  'viewer.tools.size.card.journal': 'Journal',
  'viewer.tools.size.card.pages': 'Pages',
  'viewer.tools.size.col.table': 'Table',
  'viewer.tools.size.col.rows': 'Rows',
  'viewer.tools.size.col.columns': 'Columns',
  'viewer.tools.size.col.indexes': 'Indexes',
  'viewer.tools.size.busy.analyze': 'Analyzing…',
  'viewer.tools.size.analyze': 'Analyze',
  'viewer.tools.size.requestFailed': 'Request failed',
  // {0} = error detail.
  'viewer.tools.size.error': 'Error: {0}',
  'viewer.tools.size.compareTitle': 'Database size analytics',
  // {0} = before total size (formatted), {1} = after total size (formatted).
  'viewer.tools.size.compareSummary': 'Before: {0} total · After: {1} total',
  // Native title tooltips for the size cards/headers/cells.
  'viewer.tools.size.tt.totalCard': 'Total size of the SQLite database file: PRAGMA page_count × PRAGMA page_size. Matches the main .db file size on disk.',
  'viewer.tools.size.tt.usedCard': 'Bytes in pages that store data: total file size minus bytes in freelist pages (see Free). Same as totalSizeBytes − freeSpaceBytes from the server.',
  'viewer.tools.size.tt.freeCard': 'Bytes in pages on SQLite’s freelist (PRAGMA freelist_count × page_size). Unused pages inside the file that SQLite can reuse for new data without growing the file.',
  'viewer.tools.size.tt.journalCard': 'SQLite PRAGMA journal_mode. wal means WAL (write-ahead logging): new writes go to a separate .wal file and are merged into the main database at checkpoint; readers can run at the same time as one writer. Other modes include delete, truncate, persist, memory, and off.',
  'viewer.tools.size.tt.pagesTotal': 'Total bytes in all pages: page_count × page_size. Same number as Total Size.',
  'viewer.tools.size.tt.pagesFormula': 'PRAGMA page_count (number of pages) × PRAGMA page_size (bytes per page, often 4096).',
  'viewer.tools.size.tt.thTable': 'Name of this table in SQLite.',
  'viewer.tools.size.tt.thRows': 'Row count for each table (SELECT COUNT(*) FROM table). Bar length is relative to the largest table in this list.',
  'viewer.tools.size.tt.thColumns': 'Number of columns defined on the table (rows from PRAGMA table_info).',
  'viewer.tools.size.tt.thIndexes': 'Number of indexes on the table (PRAGMA index_list), plus each index name.',
  'viewer.tools.size.tt.tdTableLink': 'SQLite table name. Click to open this table in its own tab.',
  'viewer.tools.size.tt.tdRows': 'Approximate number of rows in this table.',
  'viewer.tools.size.tt.tdColumns': 'How many columns this table has.',
  'viewer.tools.size.tt.tdIndexes': 'Index count and names from PRAGMA index_list for this table.',

  // --- Anomaly detection (assets/web/tools-analytics.ts) ---
  'viewer.tools.anomaly.empty': 'No current result. Run Scan first.',
  // {0} = number of tables scanned.
  'viewer.tools.anomaly.across': 'across {0} tables',
  'viewer.tools.anomaly.clean': 'No anomalies detected. Data looks clean!',
  // {0} = error count.
  'viewer.tools.anomaly.errors.one': '{0} error',
  'viewer.tools.anomaly.errors.many': '{0} errors',
  // {0} = warning count.
  'viewer.tools.anomaly.warnings.one': '{0} warning',
  'viewer.tools.anomaly.warnings.many': '{0} warnings',
  // {0} = info count.
  'viewer.tools.anomaly.info': '{0} info',
  // {0} = total finding count, {1} = pre-wrapped severity breakdown markup.
  'viewer.tools.anomaly.findings': '{0} finding(s): {1}',
  'viewer.tools.anomaly.busy.scan': 'Scanning…',
  'viewer.tools.anomaly.scan': 'Scan for anomalies',
  'viewer.tools.anomaly.requestFailed': 'Request failed',
  // {0} = error detail.
  'viewer.tools.anomaly.error': 'Error: {0}',
  'viewer.tools.anomaly.compareTitle': 'Data health',
  // {0} = before finding count, {1} = after finding count.
  'viewer.tools.anomaly.compareSummary': 'Before: {0} finding(s) · After: {1} finding(s)',

  // --- Snapshot / compare / migration (assets/web/tools-compare.ts) ---
  // {0} = optional label prefix; the em-dash separator stays in the value.
  'viewer.tools.snapshot.labelPrefix': '{0} — ',
  'viewer.tools.snapshot.empty': 'No snapshots yet. Capture one to start comparing.',
  'viewer.tools.snapshot.from': 'From',
  'viewer.tools.snapshot.to': 'To',
  'viewer.tools.snapshot.now': 'now (live DB)',
  'viewer.tools.snapshot.col.snapshot': 'Snapshot',
  'viewer.tools.snapshot.col.tables': 'Tables',
  'viewer.tools.snapshot.col.actions': 'Actions',
  'viewer.tools.snapshot.rename': 'Rename',
  'viewer.tools.snapshot.delete': 'Delete',
  'viewer.tools.snapshot.takePrompt': 'Optional label for this snapshot (leave blank for none):',
  'viewer.tools.snapshot.capturing': 'Capturing…',
  // {0} = createdAt timestamp.
  'viewer.tools.snapshot.saved': 'Snapshot saved at {0}',
  'viewer.tools.snapshot.failed': 'Failed',
  // {0} = error message.
  'viewer.tools.snapshot.error': 'Error: {0}',
  'viewer.tools.snapshot.comparing': 'Comparing…',
  'viewer.tools.snapshot.compareFailed': 'Compare failed',
  'viewer.tools.snapshot.clearConfirm': 'Delete ALL snapshots?',
  'viewer.tools.snapshot.clearing': 'Clearing…',
  'viewer.tools.snapshot.cleared': 'All snapshots cleared.',
  'viewer.tools.snapshot.deleteConfirm': 'Delete this snapshot?',
  'viewer.tools.snapshot.renamePrompt': 'New label (leave blank to clear):',
  'viewer.tools.compare.loading': 'Loading…',
  'viewer.tools.compare.notConfigured': 'Not configured. A comparison database is needed — see the setup guide above.',
  'viewer.tools.compare.requestFailed': 'Request failed',
  // {0} = error message.
  'viewer.tools.compare.error': 'Error: {0}',
  'viewer.tools.migration.busy': 'Generating…',
  'viewer.tools.migration.noChanges': '-- No changes detected.',
  // {0} = statement count.
  'viewer.tools.migration.summary': '{0} statement(s) generated',
  'viewer.tools.migration.withWarnings': ' (includes warnings)',
  'viewer.tools.migration.copySql': 'Copy SQL',
  'viewer.tools.migration.copySqlTitle': 'Copy migration SQL to clipboard',
  'viewer.tools.migration.copied': 'Copied!',
  'viewer.tools.migration.button': 'Migration Preview',

  // --- Analysis history / compare modal (assets/web/analysis.ts) ---
  'viewer.tools.analysis.pastRuns': '— Past runs —',
  'viewer.tools.analysis.compareAria': 'Compare analysis results',
  // {0} = analysis title.
  'viewer.tools.analysis.compareHeading': 'Compare: {0}',
  'viewer.tools.analysis.prompt': 'Select Before and After to compare.',
  'viewer.tools.analysis.before': 'Before:',
  'viewer.tools.analysis.after': 'After:',
  'viewer.tools.analysis.selectPlaceholder': '— select —',
  'viewer.tools.analysis.currentResult': 'Current result',
  'viewer.tools.analysis.close': 'Close',
  'viewer.tools.analysis.closeTitle': 'Close compare panel',
  'viewer.tools.analysis.selectBefore': 'Select Before.',
  'viewer.tools.analysis.selectAfter': 'Select After.',
  'viewer.tools.analysis.saved': 'Saved',
  'viewer.tools.analysis.saveFailed': 'Save failed (storage may be full)',

  // --- Snapshot row-diff render (assets/web/analysis.ts) ---
  'viewer.tools.diff.col.table': 'Table',
  'viewer.tools.diff.col.then': 'Then',
  'viewer.tools.diff.col.now': 'Now',
  'viewer.tools.diff.col.status': 'Status',
  'viewer.tools.diff.noPk': 'No primary key — counts only',
  'viewer.tools.diff.noChanges': 'No changes detected',
  // {0} = added row count.
  'viewer.tools.diff.added': '+{0} added',
  // {0} = removed row count.
  'viewer.tools.diff.removed': '-{0} removed',
  // {0} = changed row count.
  'viewer.tools.diff.changed': '~{0} changed',
  // {0} = added row count (detail header).
  'viewer.tools.diff.addedDetail': '+ {0} added:',
  // {0} = removed row count (detail header).
  'viewer.tools.diff.removedDetail': '- {0} removed:',
  // {0} = changed row count (detail header).
  'viewer.tools.diff.changedDetail': '~ {0} changed:',

  // --- Charts (assets/web/charts.ts) ---
  'viewer.tools.chart.scatterNumeric': 'Scatter requires numeric X and Y columns.',
  'viewer.tools.chart.noNumeric': 'No numeric data.',
  'viewer.tools.chart.histogram.bin': 'Bin',
  'viewer.tools.chart.histogram.count': 'Count',
  'viewer.tools.chart.pie.other': 'Other',
  // Stacked-bar segment hover tooltip: {0} = group label, {1} = segment index, {2} = value.
  'viewer.tools.chart.stacked.segment': '{0} segment {1}: {2}',
  'viewer.tools.chart.copyImage': 'Copy image',
  'viewer.tools.chart.copied': 'Copied!',
};
