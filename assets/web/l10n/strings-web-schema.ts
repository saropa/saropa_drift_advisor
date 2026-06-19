/**
 * Web-viewer English source strings — schema surface slice (System B, browser).
 *
 * Symbolic key → English text for the schema-related modules of the standalone
 * web viewer: schema.ts, schema-meta.ts, schema-divergence.ts, declared-schema.ts,
 * search.ts, and search-tab.ts. Render code passes these keys to `vt()`
 * ([../l10n.ts](../l10n.ts)); the English value here is the in-bundle fallback
 * until a per-locale overlay is installed.
 *
 * WHY a registry instead of inline literals: a hardcoded display string never
 * reaches the translation pipeline, so it ships English in every locale. Declaring
 * it here (and rendering via `vt('key')`) is what lets the toolchain extract,
 * translate, and overlay it.
 *
 * Keys are namespaced `viewer.schema.*` and grouped by source area. Runtime values
 * use `{0}`/`{1}` placeholders — never English string concatenation, which cannot
 * be reordered by a translator. Registered in `WEB_STRING_REGISTRIES` in
 * [../l10n.ts](../l10n.ts) (central registration handled separately).
 *
 * Keep this file under the 300-line limit; overflow extracts a `…-schema-b.ts`
 * slice.
 */

/** Symbolic key → English source text for the schema web surface. */
export const stringsWebSchema: Record<string, string> = {
  // --- Schema view (assets/web/schema.ts) ---
  'viewer.schema.load.failed': 'Failed to load.',
  'viewer.schema.loading': 'Loading schema…',
  'viewer.schema.loadingShort': 'Loading…',
  'viewer.schema.error': 'Error',
  'viewer.schema.heading': 'Schema',
  'viewer.schema.tableData.heading': 'Table data',
  // {0} is the selected table name.
  'viewer.schema.tableData.headingNamed': 'Table data: {0}',
  'viewer.schema.selectTablePrompt': 'Select a table above to load data.',

  // --- Schema metadata loader (assets/web/schema-meta.ts) ---
  // {0} is the HTTP status code from the failed metadata request.
  'viewer.schema.meta.loadFailed': 'Failed to load schema metadata (HTTP {0})',

  // --- Structured schema explorer (assets/web/schema-explorer.ts) ---
  'viewer.schema.explorer.loading': 'Loading schema…',
  'viewer.schema.explorer.error': 'Could not load the schema.',
  'viewer.schema.explorer.empty': 'No tables in this database.',
  'viewer.schema.explorer.searchPlaceholder': 'Filter tables and columns…',
  'viewer.schema.explorer.searchLabel': 'Filter schema',
  'viewer.schema.explorer.typeAll': 'All types',
  'viewer.schema.explorer.typeLabel': 'Column type',
  'viewer.schema.explorer.noMatches': 'No tables or columns match the filter.',
  'viewer.schema.explorer.rawHeading': 'Raw DDL',
  // Summary header. {0} tables shown, {1} total tables, {2} total rows, {3} DB size.
  'viewer.schema.explorer.summary': '{0} of {1} tables · {2} rows · {3}',
  // Summary header without a size figure. {0} shown, {1} total, {2} rows.
  'viewer.schema.explorer.summaryNoSize': '{0} of {1} tables · {2} rows',

  // Per-table card stat chips. Each takes one numeric/text value.
  // {0} is the row count.
  'viewer.schema.explorer.stat.rows': '{0} rows',
  // {0} is the column count.
  'viewer.schema.explorer.stat.cols': '{0} cols',
  // {0} is the index count.
  'viewer.schema.explorer.stat.indexes': '{0} indexes',
  // {0} is the count of foreign keys out of this table.
  'viewer.schema.explorer.stat.fkOut': '{0} FK out',
  // {0} is the count of tables referencing this table.
  'viewer.schema.explorer.stat.fkIn': '{0} FK in',
  // {0} writes seen this session, {1} the relative/absolute time of the last write.
  'viewer.schema.explorer.stat.writes': '{0} writes',

  // Detector badges (table header). Titles explain the finding on hover.
  'viewer.schema.explorer.badge.orphan': 'Orphan',
  'viewer.schema.explorer.badge.orphanTitle':
    'Physical table not declared in the Drift code schema.',
  // {0} is the count of anomalies on this table.
  'viewer.schema.explorer.badge.anomaly': '{0} issues',
  'viewer.schema.explorer.badge.anomalyTitle': 'Data-quality anomalies detected on this table.',
  // {0} is the count of FK columns missing an index.
  'viewer.schema.explorer.badge.missingIndex': '{0} missing index',
  'viewer.schema.explorer.badge.missingIndexTitle':
    'Foreign-key columns with no supporting index (a common performance trap).',
  'viewer.schema.explorer.badge.active': 'Active',
  'viewer.schema.explorer.badge.activeTitle': 'This table received writes during this session.',

  // Column table headers and constraint words.
  'viewer.schema.explorer.col.column': 'Column',
  'viewer.schema.explorer.col.type': 'Type',
  'viewer.schema.explorer.col.constraints': 'Constraints',
  'viewer.schema.explorer.flag.notNull': 'NOT NULL',
  'viewer.schema.explorer.flag.none': '—',
  'viewer.schema.explorer.badgePk': 'PK',
  'viewer.schema.explorer.badgePkTitle': 'Primary key',
  // {0} target table, {1} target column.
  'viewer.schema.explorer.badgeFkTitle': 'Foreign key → {0}.{1}',
  // {0} target table, {1} target column (FK relationship line).
  'viewer.schema.explorer.fkRefersTo': 'references {0}.{1}',
  // {0} source table, {1} source column (incoming FK line).
  'viewer.schema.explorer.fkReferencedBy': 'referenced by {0}.{1}',
  'viewer.schema.explorer.relationships': 'Relationships',
  'viewer.schema.explorer.indexes': 'Indexes',
  'viewer.schema.explorer.noIndexes': 'No indexes',
  'viewer.schema.explorer.anomalyHeading': 'Data-quality issues',

  // Copy/export buttons.
  'viewer.schema.explorer.copySql': 'Copy SQL',
  'viewer.schema.explorer.copyMarkdown': 'Copy Markdown',
  'viewer.schema.explorer.copyJson': 'Copy JSON',
  'viewer.schema.explorer.copied': 'Copied to clipboard',
  'viewer.schema.explorer.copyFailed': 'Copy failed',

  // --- Divergence findings (assets/web/schema-divergence.ts detail strings,
  //     rendered by declared-schema.ts) ---
  'viewer.schema.divergence.missingTable': 'declared in code but not found in the live database',
  'viewer.schema.divergence.extraTable': 'present in the live database but not declared in code',
  'viewer.schema.divergence.missingColumn': 'declared in code but missing from the live table',
  'viewer.schema.divergence.extraColumn': 'present in the live table but not declared in code',
  // {0} is the code-side type affinity, {1} the database-side affinity.
  'viewer.schema.divergence.typeMismatch': 'code {0} vs database {1}',
  // {0}/{1} are nullability words from the nullable/notNull keys below.
  'viewer.schema.divergence.nullableMismatch': 'code {0} vs database {1}',
  'viewer.schema.divergence.nullable': 'nullable',
  'viewer.schema.divergence.notNull': 'not null',
  // {0}/{1} are primary-key words from the primaryKey/notAKey keys below.
  'viewer.schema.divergence.pkMismatch': 'code {0} vs database {1}',
  'viewer.schema.divergence.primaryKey': 'primary key',
  'viewer.schema.divergence.notAKey': 'not a key',

  // --- Code-vs-database view (assets/web/declared-schema.ts) ---
  // Divergence-kind tags shown on each finding.
  'viewer.schema.divergence.label.missingTable': 'Missing table',
  'viewer.schema.divergence.label.extraTable': 'Extra table',
  'viewer.schema.divergence.label.missingColumn': 'Missing column',
  'viewer.schema.divergence.label.extraColumn': 'Extra column',
  'viewer.schema.divergence.label.typeMismatch': 'Type',
  'viewer.schema.divergence.label.nullableMismatch': 'Nullability',
  'viewer.schema.divergence.label.pkMismatch': 'Primary key',
  'viewer.schema.declared.runtimeUnavailable':
    'Live database schema is unavailable (change detection may be off), so code-vs-database divergence was not computed.',
  'viewer.schema.declared.match': '✓ Code and database schemas match — no divergence found.',
  // {0} is the divergence count.
  'viewer.schema.declared.divergenceCount': '{0} divergence(s) between code and the live database:',
  'viewer.schema.declared.noCodeSchema':
    'No code-declared schema available. Start the viewer with a Drift database (the <code>startDriftViewer</code> extension supplies this automatically) or pass a <code>declaredSchema</code> callback to <code>DriftDebugServer.start</code>.',
  'viewer.schema.declared.empty': 'The code-declared schema is empty.',
  // {0} is the declared-table count.
  'viewer.schema.declared.tableCount': '{0} declared table(s):',
  // {0} is the column count for a declared table.
  'viewer.schema.declared.columnCount': '({0} columns)',
  'viewer.schema.declared.col.column': 'Column',
  'viewer.schema.declared.col.type': 'Type',
  'viewer.schema.declared.col.null': 'Null',
  'viewer.schema.declared.col.pk': 'PK',
  'viewer.schema.declared.null.yes': 'yes',
  'viewer.schema.declared.null.no': 'no',
  'viewer.schema.declared.pk.flag': 'PK',
  // {0} is a comma-joined list of index names.
  'viewer.schema.declared.indexes': 'Indexes: {0}',
  'viewer.schema.declared.codeVsDatabase': 'Code vs database',
  'viewer.schema.declared.load': 'Load code schema',
  'viewer.schema.declared.loading': 'Loading…',
  // {0} is the error message text.
  'viewer.schema.declared.error': 'Error: {0}',
  'viewer.schema.declared.requestFailed': 'Request failed',

  // --- Search filter meta (assets/web/search.ts) ---
  // {0} filtered row count, {1} total row count.
  'viewer.schema.search.filteredOf': ' (filtered: {0} of {1})',
  // {0} is the count of rows matching the filter.
  'viewer.schema.search.showingAll': ' (showing all rows; filter: {0} match)',
  'viewer.schema.search.noMatches': 'No matches',
  // {0} current match (1-based), {1} total matches.
  'viewer.schema.search.matchCounter': '{0} of {1}',

  // --- Search tab (assets/web/search-tab.ts) ---
  'viewer.schema.searchTab.optionSelect': '-- select --',
  'viewer.schema.searchTab.selectPrompt': 'Select a table and type a search term.',
  'viewer.schema.searchTab.selectTableAbove': 'Select a table above.',
  // {0} is the table name being loaded.
  'viewer.schema.searchTab.loadingTable': 'Loading {0}…',
  'viewer.schema.searchTab.loadingSchemaError': 'Error loading schema',
  // {0} table name, {1} total row count, {2} row/rows word (rowsSingular/rowsPlural), {3} range text.
  'viewer.schema.searchTab.metaCount': '{0} ({1} {2}; {3})',
  // {0} table name, {1} row limit when total is unknown.
  'viewer.schema.searchTab.metaUpTo': '{0} (up to {1} rows)',
  'viewer.schema.searchTab.rowsSingular': 'row',
  'viewer.schema.searchTab.rowsPlural': 'rows',
  // {0} first row number, {1} last row number.
  'viewer.schema.searchTab.rangeShowing': 'showing {0}–{1}',
  'viewer.schema.searchTab.rangeNone': 'no rows in this range',
};
