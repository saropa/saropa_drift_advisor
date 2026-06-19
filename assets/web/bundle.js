(() => {
  // assets/web/l10n/strings-web.ts
  var webStrings = {
    // --- Toolbar (assets/web/toolbar.ts) ---
    "viewer.toolbar.sidebar.toggle": "Toggle sidebar",
    "viewer.toolbar.history.toggle": "Toggle query history",
    "viewer.toolbar.mask.toggle": "Mask PII",
    "viewer.toolbar.theme.label": "Theme",
    "viewer.toolbar.share.label": "Share session",
    // --- Natural-language modal (assets/web/nl-modal.ts) ---
    "nl.modal.title": "Ask in English",
    "nl.modal.placeholder": "Describe the rows you want, in plain English\u2026",
    "nl.modal.use": "Use",
    "nl.modal.cancel": "Cancel",
    "nl.modal.dictate": "Dictate",
    "nl.modal.copySql": "Copy SQL",
    "nl.modal.preview": "Preview results",
    // --- Masthead connection-status pill (assets/web/masthead.ts) ---
    // The decorative status dot (●) is prepended in code, NOT part of these values —
    // it is a symbol that must never vary per locale. Status words and the full
    // tooltip sentences ARE translatable; the em-dash/ellipsis stay inside the value
    // because they belong to the sentence's punctuation.
    "masthead.status.online": "Online",
    "masthead.status.paused": "Paused",
    "masthead.status.offline": "Offline",
    "masthead.status.reconnecting": "Reconnecting\u2026",
    "masthead.title.online": "Online \u2014 click to pause change detection.",
    "masthead.title.paused": "Paused \u2014 click to resume live updates.",
    "masthead.title.offline": "Offline \u2014 connection lost. Reconnect to resume live updates.",
    "masthead.title.reconnecting": "Offline \u2014 reconnecting\u2026",
    // --- Generic status / feedback messages (assets/web/utils.ts consumers) ---
    // {0} is the concrete value (e.g. a SQL snippet, a count) — keep it a token,
    // never concatenated English, so word order can change per locale.
    "msg.copied": "Copied to clipboard",
    "msg.sqlCopied": "SQL copied to clipboard",
    "msg.errorCopied": "Error copied to clipboard",
    "msg.rowsAffected": "{0} rows affected"
  };

  // assets/web/l10n/strings-web-table.ts
  var stringsWebTable = {
    // --- Data grid (assets/web/table-view.ts: buildDataTableHtml) ---
    "viewer.table.grid.empty": "No rows.",
    // {0} = referenced table, {1} = referenced column.
    "viewer.table.grid.fkHeaderTitle": "FK to {0}.{1}",
    "viewer.table.grid.maskTip": "Sensitive column: values are redacted while PII masking is on. Use the mask control in the toolbar to show raw data.",
    "viewer.table.grid.headerDragTitle": "Drag to reorder; right-click for menu",
    "viewer.table.grid.actionsHeader": "Actions",
    // {0} = raw (unformatted) cell value shown on hover over a formatted cell.
    "viewer.table.grid.rawTitle": "Raw: {0}",
    "viewer.table.grid.copyValueTitle": "Copy value",
    "viewer.table.grid.expandValueTitle": "Open full value",
    "viewer.table.grid.rowDeleteTitle": "Delete this row",
    "viewer.table.grid.rowDeleteLabel": "Delete",
    // Formatted boolean cell values (INTEGER columns with a boolean-style name).
    "viewer.table.grid.boolTrue": "true",
    "viewer.table.grid.boolFalse": "false",
    // --- Copy toast (assets/web/table-view.ts: showCopyToast) ---
    "viewer.table.toast.copied": "Copied!",
    // --- Status bar (assets/web/table-view.ts: buildTableStatusBar) ---
    // {0} = wrapped row-range markup, {1} = total row count.
    "viewer.table.status.showing": "Showing {0} of {1} rows",
    "viewer.table.status.pastEnd": "(past end of results)",
    // Column count chip — singular vs plural. {0} = count.
    "viewer.table.status.columnOne": "{0} column",
    "viewer.table.status.columnMany": "{0} columns",
    // --- Results heading label (assets/web/table-view.ts: buildResultsLabel) ---
    // Rows: {0} = page count, {1} = total. "of" form when total differs from page.
    "viewer.table.results.rowsOf": "{0} of {1} rows",
    "viewer.table.results.rowOne": "{0} row",
    "viewer.table.results.rowMany": "{0} rows",
    // Columns: {0} = visible count, {1} = total.
    "viewer.table.results.colsOf": "{0} of {1} columns",
    "viewer.table.results.colOne": "{0} column",
    "viewer.table.results.colMany": "{0} columns",
    // {0} = the composed rows/columns label above.
    "viewer.table.results.heading": "Results \u2014 {0}",
    "viewer.table.results.regionLabel": "Results",
    "viewer.table.results.loading": "Loading\u2026",
    // "both" view data-section header. {0} = table name.
    "viewer.table.results.dataHeader": "Table data: {0}",
    // --- Table-definition panel (assets/web/table-view.ts: buildTableDefinitionHtml) ---
    "viewer.table.def.regionLabel": "Table definition",
    "viewer.table.def.headingLabel": "Table definition",
    // Shown as the type-icon hover when a column declares no SQL type.
    "viewer.table.def.typeUnspecified": "unspecified",
    // Type cell body when the column declares no SQL type.
    "viewer.table.def.typeEmpty": "(unspecified)",
    "viewer.table.def.visTitle": "Show this column in the results table",
    // {0} = column name.
    "viewer.table.def.visLabel": "Show {0} in results",
    "viewer.table.def.badgePk": "Primary key",
    // {0} = referenced table, {1} = referenced column.
    "viewer.table.def.badgeFk": "FK \u2192 {0}.{1}",
    // NOT NULL is a SQL keyword shown as the column constraint flag.
    "viewer.table.def.flagNotNull": "NOT NULL",
    // Base column-table headers.
    "viewer.table.def.colShow": "Show",
    "viewer.table.def.colShowTitle": "Show column in the results table",
    "viewer.table.def.colColumn": "Column",
    "viewer.table.def.colType": "Type",
    "viewer.table.def.colConstraints": "Constraints",
    // --- Table-definition profiling meta columns (assets/web/table-view.ts) ---
    "viewer.table.def.metaFill": "Fill",
    "viewer.table.def.metaFillTitle": "Share of rows with a non-null value",
    "viewer.table.def.metaNulls": "Nulls",
    "viewer.table.def.metaNullsTitle": "Number of NULL values",
    "viewer.table.def.metaDistinct": "Distinct",
    "viewer.table.def.metaDistinctTitle": "Number of distinct values",
    "viewer.table.def.metaUnique": "Unique",
    "viewer.table.def.metaUniqueTitle": "Uniqueness; key flag when every value is unique",
    "viewer.table.def.metaMin": "Min",
    "viewer.table.def.metaMinTitle": "Smallest value",
    "viewer.table.def.metaMax": "Max",
    "viewer.table.def.metaMaxTitle": "Largest value",
    "viewer.table.def.metaSize": "Size",
    "viewer.table.def.metaSizeTitle": "Total stored bytes",
    // Per-column meta cell hovers. {0}=non-null, {1}=total, {2}=null count.
    "viewer.table.def.fillCellTitle": "{0} of {1} rows filled ({2} null)",
    "viewer.table.def.uniqueKeyTitle": "Candidate key: every value is unique",
    // {0} = distinct count, {1} = total rows.
    "viewer.table.def.uniqueRatioTitle": "{0} distinct of {1} rows",
    "viewer.table.def.sizeCellTitle": "Total bytes across all rows (SUM of LENGTH)",
    // --- Table-definition export/meta tool buttons (assets/web/table-view.ts) ---
    "viewer.table.def.toolMetaTitle": "Show column profiling stats (fill, nulls, distinct, min/max, size)",
    "viewer.table.def.toolMetaLabel": "Toggle column profiling stats",
    "viewer.table.def.toolJsonTitle": "Copy table definition as JSON",
    "viewer.table.def.toolJsonLabel": "Copy table definition as JSON",
    "viewer.table.def.toolFlutterTitle": "Copy table definition as Flutter (Drift) class",
    "viewer.table.def.toolFlutterLabel": "Copy table definition as Flutter code",
    // --- Table-definition export tool toasts/errors (assets/web/table-def-meta.ts) ---
    "viewer.table.def.copiedJson": "Definition copied as JSON",
    "viewer.table.def.copiedFlutter": "Definition copied as Flutter",
    // {0} = error message.
    "viewer.table.def.statsFailed": "Stats failed: {0}",
    // Fallback when the failed stats query returns no error detail.
    "viewer.table.def.statsQueryFailed": "Stats query failed",
    // Generic fallback substituted for {0} in statsFailed when no message exists.
    "viewer.table.def.errorGeneric": "error",
    // --- Sidebar table list / loading (assets/web/table-list.ts) ---
    // rowCountText: {0} = table name, {1} = page-size limit.
    "viewer.table.list.upToRows": "{0} (up to {1} rows)",
    "viewer.table.list.noRowsInRange": "no rows in this range",
    // {0} = first row index, {1} = last row index.
    "viewer.table.list.showingRange": "showing {0}\u2013{1}",
    // {0}=table name, {1}=total, {2}=range text (one of the two above).
    "viewer.table.list.countRowOne": "{0} ({1} row; {2})",
    "viewer.table.list.countRowMany": "{0} ({1} rows; {2})",
    "viewer.table.list.pinTitle": "Pin to top",
    "viewer.table.list.unpinTitle": "Unpin",
    // {0} = table name.
    "viewer.table.list.loadingNamed": "Loading {0}\u2026",
    "viewer.table.list.loading": "Loading\u2026",
    "viewer.table.list.loadError": "Error",
    "viewer.table.list.browseEmpty": "No tables found.",
    // {0} = table name.
    "viewer.table.list.browseOpenTitle": "Open {0} in a tab",
    // --- Cell-value popup (assets/web/cell-edit.ts: showCellValuePopup) ---
    "viewer.table.popup.title": "Cell value",
    // {0} = column name.
    "viewer.table.popup.titleNamed": "Cell value: {0}",
    // --- Inline cell edit alerts (assets/web/cell-edit.ts) ---
    "viewer.table.edit.busy": "Finish or cancel the current edit before editing another cell.",
    "viewer.table.edit.noPk": "This table has no primary key column; inline edit is disabled.",
    "viewer.table.edit.pkLocked": "Primary key columns cannot be edited inline.",
    "viewer.table.edit.blobLocked": "BLOB columns cannot be edited inline.",
    // {0} = error message.
    "viewer.table.edit.schemaFailed": "Could not load schema: {0}",
    // --- Inline cell edit validation messages (assets/web/cell-edit.ts) ---
    "viewer.table.edit.notNull": "This column is NOT NULL \u2014 a value is required.",
    "viewer.table.edit.expectBool": "Expected 0 or 1 (or true/false).",
    "viewer.table.edit.expectInt": "Expected an integer (e.g. 42, -7).",
    "viewer.table.edit.expectNumber": "Expected a number (e.g. 3.14, -0.5).",
    // --- Inline cell edit context / controls (assets/web/cell-edit.ts) ---
    // SQL type shown in the edit context bar when the column declares no type.
    "viewer.table.edit.typeUnspecified": "unspecified",
    // Nullability label in the edit context bar (paired with flagNotNull style).
    "viewer.table.edit.nullable": "nullable",
    "viewer.table.edit.constraintNotNull": "NOT NULL",
    // {0}=PK name, {1}=PK value, {2}=column name, {3}=type, {4}=nullability label.
    "viewer.table.edit.context": "{0}={1} \u2022 {2} ({3}, {4})",
    // {0} = original value (or the NULL label).
    "viewer.table.edit.was": "was: {0}",
    // Standalone NULL marker shown for the original value when it is null.
    "viewer.table.edit.nullValue": "NULL",
    // {0} = column name.
    "viewer.table.edit.inputLabel": "Edit {0}",
    "viewer.table.edit.save": "Save",
    "viewer.table.edit.cancel": "Cancel",
    "viewer.table.edit.retry": "Retry save",
    "viewer.table.edit.reload": "Reload table",
    // {0} = server/network error message.
    "viewer.table.edit.saveFailed": "Save failed: {0}",
    "viewer.table.edit.requestFailed": "Request failed"
  };

  // assets/web/l10n/strings-web-query-builder.ts
  var stringsWebQueryBuilder = {
    // --- Builder shell + mode/scope toggles (query-builder.ts) ---
    "viewer.qb.header": "Query builder",
    "viewer.qb.mode.visual.title": "Visual query builder",
    "viewer.qb.mode.visual.label": "Visual",
    "viewer.qb.mode.raw.title": "Edit SQL directly",
    "viewer.qb.mode.raw.label": "Raw SQL",
    "viewer.qb.scope.toggle.title": "Single-table keeps the classic form; multi-table adds JOINs, GROUP BY, and multi ORDER BY",
    "viewer.qb.scope.single.label": "Single table",
    "viewer.qb.scope.multi.label": "Multi-table",
    // --- Single-table form labels + controls (query-builder.ts) ---
    // SELECT/WHERE/ORDER BY/LIMIT label the form rows; kept as user-facing words
    // so a locale may translate the form even though the same tokens are SQL.
    "viewer.qb.label.select": "SELECT",
    "viewer.qb.label.where": "WHERE",
    "viewer.qb.label.orderBy": "ORDER BY",
    "viewer.qb.label.limit": "LIMIT",
    "viewer.qb.order.none": "None",
    "viewer.qb.where.add.title": "Add another WHERE condition",
    "viewer.qb.where.add.label": "+ Add condition",
    "viewer.qb.where.connector.title": "Combine with previous condition",
    "viewer.qb.where.value.placeholder": "value",
    "viewer.qb.where.remove.title": "Remove condition",
    // --- WHERE operator labels (query-builder.ts getWhereOps) ---
    // The operator VALUES (LIKE, =, IS NULL, …) are SQL and stay literal; only
    // these readable labels are translatable. Symbol labels (=, !=, >, <) are not
    // here because they are pure symbols, not prose.
    "viewer.qb.op.contains": "contains",
    "viewer.qb.op.equals": "equals",
    "viewer.qb.op.notContains": "not contains",
    "viewer.qb.op.startsWith": "starts with",
    "viewer.qb.op.isNull": "is null",
    "viewer.qb.op.isNotNull": "is not null",
    // --- Multi-table panel intro + raw-import (query-builder.ts) ---
    "viewer.qb.multi.intro": "Build JOINs from the root table. Preview shows validation errors until the graph is valid.",
    "viewer.qb.raw.import.title": "Parse the SQL above into the multi-table visual builder",
    "viewer.qb.raw.import.label": "Import to visual builder",
    // --- Shared run/reset actions (query-builder.ts) ---
    "viewer.qb.run.title": "Execute the built query",
    "viewer.qb.run.label": "Run query",
    "viewer.qb.run.busy": "Running\u2026",
    "viewer.qb.reset.title": "Return to table view",
    "viewer.qb.reset.label": "Reset to table view",
    // --- Results header + status (query-builder.ts) ---
    // {0} is a pluralized row count; {0} in results.heading is the pre-built
    // results label (markup/count assembled at the call site).
    "viewer.qb.result.rowCount": "Query builder result: {0} row(s)",
    "viewer.qb.results.heading": "Results \u2014 {0}",
    "viewer.qb.results.ariaLabel": "Results",
    // --- Alerts / errors (query-builder.ts) ---
    "viewer.qb.alert.fixValidation": "Fix validation errors shown in the preview, or switch to Raw SQL.",
    // {0} is the server-returned error text (or the unknown fallback below).
    "viewer.qb.alert.queryError": "Query error: {0}",
    "viewer.qb.alert.unknownError": "Unknown error",
    // {0} is the thrown error message.
    "viewer.qb.alert.error": "Error: {0}",
    "viewer.qb.alert.pasteSelect": "Paste a SELECT statement to import.",
    // {0} is the newline-joined importer error list.
    "viewer.qb.alert.importFailed": "Could not import SQL:\n{0}",
    // {0} is the thrown error message from schema loading.
    "viewer.qb.alert.schemaLoadFailed": "Schema load failed: {0}",
    // --- Multi-table section headings (query-builder-multi.ts) ---
    "viewer.qb.section.tables": "Tables",
    "viewer.qb.section.joins": "JOINs",
    "viewer.qb.section.selectColumns": "SELECT columns",
    "viewer.qb.section.where": "WHERE",
    "viewer.qb.section.groupBy": "GROUP BY",
    "viewer.qb.section.orderBy": "ORDER BY",
    // --- Multi-table tables/joins controls (query-builder-multi.ts) ---
    "viewer.qb.multi.table.remove.title": "Remove this table instance",
    "viewer.qb.multi.table.remove.label": "Remove",
    "viewer.qb.multi.joins.empty": "No JOINs yet. Add one before selecting columns from a second table.",
    "viewer.qb.multi.join.left.label": "Left",
    "viewer.qb.multi.join.rightTable.label": "Right table",
    "viewer.qb.multi.join.add.label": "Add JOIN",
    "viewer.qb.multi.join.rightBase.pick": "\u2014 pick \u2014",
    "viewer.qb.multi.join.rightBase.loadSchema": "(load schema)",
    // <em>/<code> markup is applied at the call site around the {0}/{1} tokens so
    // the emphasized "right" and the tN code span can be reordered per locale.
    "viewer.qb.multi.join.help": "Connects the {0} base table as a new instance ({1}) or joins two existing instances when the right table already exists and you pick matching columns.",
    // Emphasized word and code token wrapped at the call site.
    "viewer.qb.multi.join.help.right": "right",
    "viewer.qb.multi.join.help.tn": "tN",
    // --- Multi-table SELECT columns (query-builder-multi.ts) ---
    "viewer.qb.multi.sel.empty": "No columns selected.",
    "viewer.qb.multi.sel.add.label": "+ Add column",
    "viewer.qb.multi.sel.agg.none": "(none)",
    "viewer.qb.multi.sel.agg.title": "Aggregate (required when GROUP BY is non-empty)",
    "viewer.qb.multi.sel.remove.title": "Remove column",
    // --- Multi-table WHERE filters (query-builder-multi.ts) ---
    "viewer.qb.multi.flt.empty": "No filters.",
    "viewer.qb.multi.flt.add.label": "+ Add condition",
    "viewer.qb.multi.flt.value.placeholder": "value or comma-separated (IN)",
    // --- Multi-table GROUP BY / ORDER BY (query-builder-multi.ts) ---
    // Shared "None" empty state for both GROUP BY and ORDER BY sections.
    "viewer.qb.multi.empty.none": "None",
    "viewer.qb.multi.gb.add.label": "+ Add GROUP BY",
    "viewer.qb.multi.ob.add.label": "+ Add ORDER BY",
    // --- Multi-table alerts (query-builder-multi.ts) ---
    "viewer.qb.multi.alert.pickJoin": "Pick left column, right table, and right column for the JOIN."
  };

  // assets/web/l10n/strings-web-schema.ts
  var stringsWebSchema = {
    // --- Schema view (assets/web/schema.ts) ---
    "viewer.schema.load.failed": "Failed to load.",
    "viewer.schema.loading": "Loading schema\u2026",
    "viewer.schema.loadingShort": "Loading\u2026",
    "viewer.schema.error": "Error",
    "viewer.schema.heading": "Schema",
    "viewer.schema.tableData.heading": "Table data",
    // {0} is the selected table name.
    "viewer.schema.tableData.headingNamed": "Table data: {0}",
    "viewer.schema.selectTablePrompt": "Select a table above to load data.",
    // --- Schema metadata loader (assets/web/schema-meta.ts) ---
    // {0} is the HTTP status code from the failed metadata request.
    "viewer.schema.meta.loadFailed": "Failed to load schema metadata (HTTP {0})",
    // --- Divergence findings (assets/web/schema-divergence.ts detail strings,
    //     rendered by declared-schema.ts) ---
    "viewer.schema.divergence.missingTable": "declared in code but not found in the live database",
    "viewer.schema.divergence.extraTable": "present in the live database but not declared in code",
    "viewer.schema.divergence.missingColumn": "declared in code but missing from the live table",
    "viewer.schema.divergence.extraColumn": "present in the live table but not declared in code",
    // {0} is the code-side type affinity, {1} the database-side affinity.
    "viewer.schema.divergence.typeMismatch": "code {0} vs database {1}",
    // {0}/{1} are nullability words from the nullable/notNull keys below.
    "viewer.schema.divergence.nullableMismatch": "code {0} vs database {1}",
    "viewer.schema.divergence.nullable": "nullable",
    "viewer.schema.divergence.notNull": "not null",
    // {0}/{1} are primary-key words from the primaryKey/notAKey keys below.
    "viewer.schema.divergence.pkMismatch": "code {0} vs database {1}",
    "viewer.schema.divergence.primaryKey": "primary key",
    "viewer.schema.divergence.notAKey": "not a key",
    // --- Code-vs-database view (assets/web/declared-schema.ts) ---
    // Divergence-kind tags shown on each finding.
    "viewer.schema.divergence.label.missingTable": "Missing table",
    "viewer.schema.divergence.label.extraTable": "Extra table",
    "viewer.schema.divergence.label.missingColumn": "Missing column",
    "viewer.schema.divergence.label.extraColumn": "Extra column",
    "viewer.schema.divergence.label.typeMismatch": "Type",
    "viewer.schema.divergence.label.nullableMismatch": "Nullability",
    "viewer.schema.divergence.label.pkMismatch": "Primary key",
    "viewer.schema.declared.runtimeUnavailable": "Live database schema is unavailable (change detection may be off), so code-vs-database divergence was not computed.",
    "viewer.schema.declared.match": "\u2713 Code and database schemas match \u2014 no divergence found.",
    // {0} is the divergence count.
    "viewer.schema.declared.divergenceCount": "{0} divergence(s) between code and the live database:",
    "viewer.schema.declared.noCodeSchema": "No code-declared schema available. Start the viewer with a Drift database (the <code>startDriftViewer</code> extension supplies this automatically) or pass a <code>declaredSchema</code> callback to <code>DriftDebugServer.start</code>.",
    "viewer.schema.declared.empty": "The code-declared schema is empty.",
    // {0} is the declared-table count.
    "viewer.schema.declared.tableCount": "{0} declared table(s):",
    // {0} is the column count for a declared table.
    "viewer.schema.declared.columnCount": "({0} columns)",
    "viewer.schema.declared.col.column": "Column",
    "viewer.schema.declared.col.type": "Type",
    "viewer.schema.declared.col.null": "Null",
    "viewer.schema.declared.col.pk": "PK",
    "viewer.schema.declared.null.yes": "yes",
    "viewer.schema.declared.null.no": "no",
    "viewer.schema.declared.pk.flag": "PK",
    // {0} is a comma-joined list of index names.
    "viewer.schema.declared.indexes": "Indexes: {0}",
    "viewer.schema.declared.codeVsDatabase": "Code vs database",
    "viewer.schema.declared.load": "Load code schema",
    "viewer.schema.declared.loading": "Loading\u2026",
    // {0} is the error message text.
    "viewer.schema.declared.error": "Error: {0}",
    "viewer.schema.declared.requestFailed": "Request failed",
    // --- Search filter meta (assets/web/search.ts) ---
    // {0} filtered row count, {1} total row count.
    "viewer.schema.search.filteredOf": " (filtered: {0} of {1})",
    // {0} is the count of rows matching the filter.
    "viewer.schema.search.showingAll": " (showing all rows; filter: {0} match)",
    "viewer.schema.search.noMatches": "No matches",
    // {0} current match (1-based), {1} total matches.
    "viewer.schema.search.matchCounter": "{0} of {1}",
    // --- Search tab (assets/web/search-tab.ts) ---
    "viewer.schema.searchTab.optionSelect": "-- select --",
    "viewer.schema.searchTab.selectPrompt": "Select a table and type a search term.",
    "viewer.schema.searchTab.selectTableAbove": "Select a table above.",
    // {0} is the table name being loaded.
    "viewer.schema.searchTab.loadingTable": "Loading {0}\u2026",
    "viewer.schema.searchTab.loadingSchemaError": "Error loading schema",
    // {0} table name, {1} total row count, {2} row/rows word (rowsSingular/rowsPlural), {3} range text.
    "viewer.schema.searchTab.metaCount": "{0} ({1} {2}; {3})",
    // {0} table name, {1} row limit when total is unknown.
    "viewer.schema.searchTab.metaUpTo": "{0} (up to {1} rows)",
    "viewer.schema.searchTab.rowsSingular": "row",
    "viewer.schema.searchTab.rowsPlural": "rows",
    // {0} first row number, {1} last row number.
    "viewer.schema.searchTab.rangeShowing": "showing {0}\u2013{1}",
    "viewer.schema.searchTab.rangeNone": "no rows in this range"
  };

  // assets/web/l10n/strings-web-sql.ts
  var stringsWebSql = {
    // --- Run SQL panel: template lock toggle (sql-runner.ts) ---
    "viewer.sql.template.lock.locked": "Lock: auto-apply template when table or fields change",
    "viewer.sql.template.lock.unlocked": "Unlocked: table/field changes won\u2019t auto-apply template",
    // --- Run SQL panel: column dropdown placeholders (sql-runner.ts) ---
    // The em-dash option is the "no field selected" placeholder; "Loading…" shows
    // while columns are fetched for the chosen table.
    "viewer.sql.fields.loading": "Loading\u2026",
    // --- Run SQL panel: result table + pagination (sql-runner.ts) ---
    "viewer.sql.result.prev": "Prev",
    "viewer.sql.result.next": "Next",
    // {0} is the row count; "row(s)" stays inside the value so plural handling is
    // the translator's, not English concatenation's.
    "viewer.sql.result.rowCount": "{0} row(s)",
    // --- Run SQL panel: run button + errors (sql-runner.ts) ---
    "viewer.sql.run.busy": "Running\u2026",
    "viewer.sql.run.emptyQuery": "Enter a SELECT query.",
    "viewer.sql.run.requestFailed": "Request failed",
    // --- Run SQL panel: auto-explain (sql-runner.ts) ---
    "viewer.sql.explain.analyzing": "Analyzing query\u2026",
    "viewer.sql.explain.failed": "Explain failed",
    "viewer.sql.explain.estimatedCost": "Estimated cost:",
    // Cost rating words shown next to the estimate.
    "viewer.sql.explain.cost.low": "Low",
    "viewer.sql.explain.cost.medium": "Medium",
    "viewer.sql.explain.cost.high": "High",
    // Cost-summary parts; {0} is the count. Singular / plural are separate keys.
    "viewer.sql.explain.part.scan.one": "{0} full scan",
    "viewer.sql.explain.part.scan.many": "{0} full scans",
    "viewer.sql.explain.part.lookup.one": "{0} index lookup",
    "viewer.sql.explain.part.lookup.many": "{0} index lookups",
    "viewer.sql.explain.part.subquery.one": "{0} subquery",
    "viewer.sql.explain.part.subquery.many": "{0} subqueries",
    "viewer.sql.explain.part.sort": "sort",
    "viewer.sql.explain.part.tempStorage": "temp storage",
    // Index-report badges per table.
    "viewer.sql.explain.badge.fullScan": "full scan",
    "viewer.sql.explain.badge.noIndexes": "no indexes",
    "viewer.sql.explain.badge.used": "used",
    "viewer.sql.explain.badge.available": "available",
    // Collapsible plan-detail summary; {0} is the step count (singular / plural).
    "viewer.sql.explain.steps.one": "Query plan detail ({0} step)",
    "viewer.sql.explain.steps.many": "Query plan detail ({0} steps)",
    // --- SQL history + bookmarks dropdowns (sql-history.ts) ---
    "viewer.sql.history.recent": "\u2014 Recent \u2014",
    // {0} is the number of saved queries.
    "viewer.sql.bookmarks.saved": "\u2014 Saved queries ({0}) \u2014",
    // Prompt shown when naming a query to bookmark.
    "viewer.sql.bookmarks.namePrompt": "Name for this query:",
    // {0} is the saved-query name being deleted.
    "viewer.sql.bookmarks.deleteConfirm": "Delete saved query \u201C{0}\u201D?",
    "viewer.sql.bookmarks.exportEmpty": "No saved queries to export.",
    "viewer.sql.bookmarks.importExpectedArray": "Expected JSON array",
    // {0} = newly imported count, {1} = skipped duplicate count.
    "viewer.sql.bookmarks.importResult": "Imported {0} new saved query(s). {1} duplicate(s) skipped.",
    // {0} is the underlying error message.
    "viewer.sql.bookmarks.importInvalid": "Invalid file: {0}",
    // --- Ask panel: refinement chip tooltips (nl-modal.ts) ---
    // {0} is the chip's NL phrase. The phrase stays English: it is appended to the
    // question and re-parsed by the English-only converter (a functional token,
    // like a SQL keyword), so only the action verb here is localized.
    "viewer.sql.nl.chip.add": "Add: {0}",
    "viewer.sql.nl.chip.remove": "Remove: {0}",
    // --- Ask panel: refine-in-English hint (nl-modal.ts) ---
    // {0} is the combined refined question text.
    "viewer.sql.nl.refineHint": "Refining last query: {0}",
    // --- Ask panel: dictation errors (nl-modal.ts) ---
    "viewer.sql.nl.mic.blocked": "Microphone access was blocked. Allow it in your browser to dictate.",
    "viewer.sql.nl.mic.noSpeech": "No speech detected. Tap the mic and try again.",
    // {0} is the speech-recognition error code.
    "viewer.sql.nl.mic.error": "Speech recognition error: {0}",
    // --- Ask panel: clarifier hint (nl-modal.ts) ---
    // {0} is the guessed table name.
    "viewer.sql.nl.clarify.guessed": "Guessed \u201C{0}\u201D \u2014 pick a table if that\u2019s wrong",
    // --- Ask panel: status / error messages (nl-modal.ts) ---
    "viewer.sql.nl.convertFailed": "Could not convert to SQL.",
    "viewer.sql.nl.noQuestion": "I heard you, but I didn\u2019t catch a question \u2014 try \u201Chow many contacts were added last week?\u201D",
    "viewer.sql.nl.enterQuestion": "Enter a question first.",
    // {0} is the underlying error message.
    "viewer.sql.nl.error": "Error: {0}",
    "viewer.sql.nl.copyEmpty": "Nothing to copy yet \u2014 enter a question first.",
    "viewer.sql.nl.copyFailed": "Could not copy to the clipboard.",
    "viewer.sql.nl.previewNeedsSql": "Enter a question to generate SQL first.",
    "viewer.sql.nl.previewFailed": "Preview failed.",
    // {0} is the underlying error message.
    "viewer.sql.nl.previewError": "Preview error: {0}",
    "viewer.sql.nl.preview.busy": "Running\u2026",
    // --- Ask panel: preview-result rows (nl-modal.ts) ---
    "viewer.sql.nl.results.empty": "Query ran \u2014 0 rows.",
    // {0} is the number of rows shown.
    "viewer.sql.nl.results.firstRows": "First {0} row(s)",
    // --- NL narration: generic fallback nouns (nl-to-sql.ts) ---
    // Substituted into the narration sentences when the table / aggregate column
    // name is unknown, so the sentence stays grammatical instead of blank.
    "viewer.sql.narrate.fallback.rows": "rows",
    "viewer.sql.narrate.fallback.value": "value",
    // --- NL narration: spoken-style answers (nl-to-sql.ts) ---
    // Verb-keyed count sentences: {0} = number, {1} = table, {2} = temporal
    // qualifier (verbatim user phrase, may be empty). Three verbs → three keys so
    // each reads naturally and is independently translatable.
    "viewer.sql.narrate.count.has": "Your database has {0} {1}{2}.",
    "viewer.sql.narrate.count.added": "Your database added {0} {1}{2}.",
    "viewer.sql.narrate.count.changed": "Your database changed {0} {1}{2}.",
    // Aggregate sentences: {0} = column, {1} = table, {2} = qualifier, {3} = value.
    "viewer.sql.narrate.sum": "The total {0} across {1}{2} is {3}.",
    "viewer.sql.narrate.avg": "The average {0} for {1}{2} is {3}.",
    "viewer.sql.narrate.max": "The highest {0} for {1}{2} is {3}.",
    "viewer.sql.narrate.min": "The lowest {0} for {1}{2} is {3}.",
    // Distinct / duplicate: {0} = count, {1} = column. Singular / plural separate.
    "viewer.sql.narrate.distinct.one": "Found {0} distinct {1} value.",
    "viewer.sql.narrate.distinct.many": "Found {0} distinct {1} values.",
    "viewer.sql.narrate.duplicate.one": "Found {0} {1} value that repeat.",
    "viewer.sql.narrate.duplicate.many": "Found {0} {1} values that repeat.",
    // Group: {0} = count, {1} = table, {2} = qualifier. Singular / plural separate.
    "viewer.sql.narrate.group.one": "{0} group of {1}{2}.",
    "viewer.sql.narrate.group.many": "{0} groups of {1}{2}.",
    // Rows / latest / oldest fallback: {0} = count, {1} = table, {2} = qualifier.
    "viewer.sql.narrate.found": "Found {0} {1}{2}.",
    // --- NL converter errors (nl-to-sql.ts) ---
    "viewer.sql.nl.noTables": "No tables in the schema to query."
  };

  // assets/web/l10n/strings-web-tools.ts
  var stringsWebTools = {
    // --- Import (assets/web/tools-import.ts) ---
    // {0} = error count; singular/plural split because word order and the
    // (N error(s)) wrapper differ per locale.
    "viewer.tools.import.history.errors.one": "({0} error)",
    "viewer.tools.import.history.errors.many": "({0} errors)",
    // {0} = imported row count.
    "viewer.tools.import.history.rows": "{0} row(s)",
    "viewer.tools.import.mapping.loading": "Loading columns\u2026",
    "viewer.tools.import.mapping.skip": "(skip)",
    "viewer.tools.import.mapping.loadFailed": "Failed to load table columns.",
    "viewer.tools.import.clipboard.unavailable": "Clipboard API not available (requires HTTPS or localhost).",
    "viewer.tools.import.clipboard.empty": "Clipboard is empty.",
    // {0} = underlying error message.
    "viewer.tools.import.clipboard.readFailed": "Failed to read clipboard: {0}",
    "viewer.tools.import.clipboard.permissionDenied": "Permission denied",
    // {0} = target table name (escaped at call site).
    "viewer.tools.import.confirm": 'Import data into table "{0}"? This cannot be undone.',
    "viewer.tools.import.busy": "Importing\u2026",
    "viewer.tools.import.button": "Import",
    // {0} = error detail.
    "viewer.tools.import.error": "Error: {0}",
    "viewer.tools.import.requestFailed": "Request failed",
    "viewer.tools.import.failed": "Import failed",
    // {0} = imported row count.
    "viewer.tools.import.result": "Imported {0} row(s).",
    // {0} = error count, {1} = first errors joined with "; ".
    "viewer.tools.import.resultErrors": "{0} error(s): {1}",
    // --- Index suggestions (assets/web/tools-analytics.ts) ---
    "viewer.tools.index.empty": "No current result. Run Analyze first.",
    "viewer.tools.index.none": "No index suggestions \u2014 schema looks good!",
    // {0} = suggestion count, {1} = tables analyzed count.
    "viewer.tools.index.summary": "{0} suggestion(s) across {1} tables:",
    "viewer.tools.index.selectAll": "Select all suggestions",
    "viewer.tools.index.col.priority": "Priority",
    "viewer.tools.index.col.tableColumn": "Table.Column",
    "viewer.tools.index.col.reason": "Reason",
    "viewer.tools.index.col.sql": "SQL",
    "viewer.tools.index.copyHint": "Click to copy",
    // {0} = count of currently-selected suggestion rows.
    "viewer.tools.index.selected": "{0} selected",
    "viewer.tools.index.previewSql": "Preview SQL",
    "viewer.tools.index.applySelected": "Apply selected",
    "viewer.tools.index.applyDisabledHint": "Start the server with writeQuery configured to enable applying indexes.",
    "viewer.tools.index.applyDisabled": "Apply disabled \u2014 server is read-only",
    // {0} = valid count, {1} = rejected count.
    "viewer.tools.index.preview.summary": "{0} valid, {1} rejected:",
    // {0} = SQL (escaped), {1} = rejection reason.
    "viewer.tools.index.preview.rejected": "Rejected: {0} \u2014 {1}",
    // {0} = applied count, {1} = total attempted.
    "viewer.tools.index.apply.summary": "{0} of {1} index(es) created:",
    "viewer.tools.index.apply.ok": "OK",
    "viewer.tools.index.apply.fail": "FAIL",
    // {0} = per-statement error detail, appended after the SQL on a failed row.
    "viewer.tools.index.apply.errorSuffix": " \u2014 {0}",
    // {0} = applied count.
    "viewer.tools.index.apply.toast": "{0} index(es) created \u2014 re-run Analyze to refresh the list.",
    // {0} = number of indexes to create.
    "viewer.tools.index.apply.confirm": "Create {0} index(es) on the live database?",
    "viewer.tools.index.busy.preview": "Previewing\u2026",
    "viewer.tools.index.busy.apply": "Applying\u2026",
    "viewer.tools.index.busy.analyze": "Analyzing\u2026",
    "viewer.tools.index.analyze": "Analyze",
    "viewer.tools.index.requestFailed": "Request failed",
    // {0} = error detail.
    "viewer.tools.index.error": "Error: {0}",
    "viewer.tools.index.compareTitle": "Index suggestions",
    // {0} = before suggestion count, {1} = after suggestion count.
    "viewer.tools.index.compareSummary": "Before: {0} suggestion(s) \xB7 After: {1} suggestion(s)",
    // --- Size analytics (assets/web/tools-analytics.ts) ---
    "viewer.tools.size.empty": "No data.",
    "viewer.tools.size.card.total": "Total Size",
    "viewer.tools.size.card.used": "Used",
    "viewer.tools.size.card.free": "Free",
    "viewer.tools.size.card.journal": "Journal",
    "viewer.tools.size.card.pages": "Pages",
    "viewer.tools.size.col.table": "Table",
    "viewer.tools.size.col.rows": "Rows",
    "viewer.tools.size.col.columns": "Columns",
    "viewer.tools.size.col.indexes": "Indexes",
    "viewer.tools.size.busy.analyze": "Analyzing\u2026",
    "viewer.tools.size.analyze": "Analyze",
    "viewer.tools.size.requestFailed": "Request failed",
    // {0} = error detail.
    "viewer.tools.size.error": "Error: {0}",
    "viewer.tools.size.compareTitle": "Database size analytics",
    // {0} = before total size (formatted), {1} = after total size (formatted).
    "viewer.tools.size.compareSummary": "Before: {0} total \xB7 After: {1} total",
    // Native title tooltips for the size cards/headers/cells.
    "viewer.tools.size.tt.totalCard": "Total size of the SQLite database file: PRAGMA page_count \xD7 PRAGMA page_size. Matches the main .db file size on disk.",
    "viewer.tools.size.tt.usedCard": "Bytes in pages that store data: total file size minus bytes in freelist pages (see Free). Same as totalSizeBytes \u2212 freeSpaceBytes from the server.",
    "viewer.tools.size.tt.freeCard": "Bytes in pages on SQLite\u2019s freelist (PRAGMA freelist_count \xD7 page_size). Unused pages inside the file that SQLite can reuse for new data without growing the file.",
    "viewer.tools.size.tt.journalCard": "SQLite PRAGMA journal_mode. wal means WAL (write-ahead logging): new writes go to a separate .wal file and are merged into the main database at checkpoint; readers can run at the same time as one writer. Other modes include delete, truncate, persist, memory, and off.",
    "viewer.tools.size.tt.pagesTotal": "Total bytes in all pages: page_count \xD7 page_size. Same number as Total Size.",
    "viewer.tools.size.tt.pagesFormula": "PRAGMA page_count (number of pages) \xD7 PRAGMA page_size (bytes per page, often 4096).",
    "viewer.tools.size.tt.thTable": "Name of this table in SQLite.",
    "viewer.tools.size.tt.thRows": "Row count for each table (SELECT COUNT(*) FROM table). Bar length is relative to the largest table in this list.",
    "viewer.tools.size.tt.thColumns": "Number of columns defined on the table (rows from PRAGMA table_info).",
    "viewer.tools.size.tt.thIndexes": "Number of indexes on the table (PRAGMA index_list), plus each index name.",
    "viewer.tools.size.tt.tdTableLink": "SQLite table name. Click to open this table in its own tab.",
    "viewer.tools.size.tt.tdRows": "Approximate number of rows in this table.",
    "viewer.tools.size.tt.tdColumns": "How many columns this table has.",
    "viewer.tools.size.tt.tdIndexes": "Index count and names from PRAGMA index_list for this table.",
    // --- Anomaly detection (assets/web/tools-analytics.ts) ---
    "viewer.tools.anomaly.empty": "No current result. Run Scan first.",
    // {0} = number of tables scanned.
    "viewer.tools.anomaly.across": "across {0} tables",
    "viewer.tools.anomaly.clean": "No anomalies detected. Data looks clean!",
    // {0} = error count.
    "viewer.tools.anomaly.errors.one": "{0} error",
    "viewer.tools.anomaly.errors.many": "{0} errors",
    // {0} = warning count.
    "viewer.tools.anomaly.warnings.one": "{0} warning",
    "viewer.tools.anomaly.warnings.many": "{0} warnings",
    // {0} = info count.
    "viewer.tools.anomaly.info": "{0} info",
    // {0} = total finding count, {1} = pre-wrapped severity breakdown markup.
    "viewer.tools.anomaly.findings": "{0} finding(s): {1}",
    "viewer.tools.anomaly.busy.scan": "Scanning\u2026",
    "viewer.tools.anomaly.scan": "Scan for anomalies",
    "viewer.tools.anomaly.requestFailed": "Request failed",
    // {0} = error detail.
    "viewer.tools.anomaly.error": "Error: {0}",
    "viewer.tools.anomaly.compareTitle": "Data health",
    // {0} = before finding count, {1} = after finding count.
    "viewer.tools.anomaly.compareSummary": "Before: {0} finding(s) \xB7 After: {1} finding(s)",
    // --- Snapshot / compare / migration (assets/web/tools-compare.ts) ---
    // {0} = optional label prefix; the em-dash separator stays in the value.
    "viewer.tools.snapshot.labelPrefix": "{0} \u2014 ",
    "viewer.tools.snapshot.empty": "No snapshots yet. Capture one to start comparing.",
    "viewer.tools.snapshot.from": "From",
    "viewer.tools.snapshot.to": "To",
    "viewer.tools.snapshot.now": "now (live DB)",
    "viewer.tools.snapshot.col.snapshot": "Snapshot",
    "viewer.tools.snapshot.col.tables": "Tables",
    "viewer.tools.snapshot.col.actions": "Actions",
    "viewer.tools.snapshot.rename": "Rename",
    "viewer.tools.snapshot.delete": "Delete",
    "viewer.tools.snapshot.takePrompt": "Optional label for this snapshot (leave blank for none):",
    "viewer.tools.snapshot.capturing": "Capturing\u2026",
    // {0} = createdAt timestamp.
    "viewer.tools.snapshot.saved": "Snapshot saved at {0}",
    "viewer.tools.snapshot.failed": "Failed",
    // {0} = error message.
    "viewer.tools.snapshot.error": "Error: {0}",
    "viewer.tools.snapshot.comparing": "Comparing\u2026",
    "viewer.tools.snapshot.compareFailed": "Compare failed",
    "viewer.tools.snapshot.clearConfirm": "Delete ALL snapshots?",
    "viewer.tools.snapshot.clearing": "Clearing\u2026",
    "viewer.tools.snapshot.cleared": "All snapshots cleared.",
    "viewer.tools.snapshot.deleteConfirm": "Delete this snapshot?",
    "viewer.tools.snapshot.renamePrompt": "New label (leave blank to clear):",
    "viewer.tools.compare.loading": "Loading\u2026",
    "viewer.tools.compare.notConfigured": "Not configured. A comparison database is needed \u2014 see the setup guide above.",
    "viewer.tools.compare.requestFailed": "Request failed",
    // {0} = error message.
    "viewer.tools.compare.error": "Error: {0}",
    "viewer.tools.migration.busy": "Generating\u2026",
    "viewer.tools.migration.noChanges": "-- No changes detected.",
    // {0} = statement count.
    "viewer.tools.migration.summary": "{0} statement(s) generated",
    "viewer.tools.migration.withWarnings": " (includes warnings)",
    "viewer.tools.migration.copySql": "Copy SQL",
    "viewer.tools.migration.copySqlTitle": "Copy migration SQL to clipboard",
    "viewer.tools.migration.copied": "Copied!",
    "viewer.tools.migration.button": "Migration Preview",
    // --- Analysis history / compare modal (assets/web/analysis.ts) ---
    "viewer.tools.analysis.pastRuns": "\u2014 Past runs \u2014",
    "viewer.tools.analysis.compareAria": "Compare analysis results",
    // {0} = analysis title.
    "viewer.tools.analysis.compareHeading": "Compare: {0}",
    "viewer.tools.analysis.prompt": "Select Before and After to compare.",
    "viewer.tools.analysis.before": "Before:",
    "viewer.tools.analysis.after": "After:",
    "viewer.tools.analysis.selectPlaceholder": "\u2014 select \u2014",
    "viewer.tools.analysis.currentResult": "Current result",
    "viewer.tools.analysis.close": "Close",
    "viewer.tools.analysis.closeTitle": "Close compare panel",
    "viewer.tools.analysis.selectBefore": "Select Before.",
    "viewer.tools.analysis.selectAfter": "Select After.",
    "viewer.tools.analysis.saved": "Saved",
    "viewer.tools.analysis.saveFailed": "Save failed (storage may be full)",
    // --- Snapshot row-diff render (assets/web/analysis.ts) ---
    "viewer.tools.diff.col.table": "Table",
    "viewer.tools.diff.col.then": "Then",
    "viewer.tools.diff.col.now": "Now",
    "viewer.tools.diff.col.status": "Status",
    "viewer.tools.diff.noPk": "No primary key \u2014 counts only",
    "viewer.tools.diff.noChanges": "No changes detected",
    // {0} = added row count.
    "viewer.tools.diff.added": "+{0} added",
    // {0} = removed row count.
    "viewer.tools.diff.removed": "-{0} removed",
    // {0} = changed row count.
    "viewer.tools.diff.changed": "~{0} changed",
    // {0} = added row count (detail header).
    "viewer.tools.diff.addedDetail": "+ {0} added:",
    // {0} = removed row count (detail header).
    "viewer.tools.diff.removedDetail": "- {0} removed:",
    // {0} = changed row count (detail header).
    "viewer.tools.diff.changedDetail": "~ {0} changed:",
    // --- Charts (assets/web/charts.ts) ---
    "viewer.tools.chart.scatterNumeric": "Scatter requires numeric X and Y columns.",
    "viewer.tools.chart.noNumeric": "No numeric data.",
    "viewer.tools.chart.histogram.bin": "Bin",
    "viewer.tools.chart.histogram.count": "Count",
    "viewer.tools.chart.pie.other": "Other",
    // Stacked-bar segment hover tooltip: {0} = group label, {1} = segment index, {2} = value.
    "viewer.tools.chart.stacked.segment": "{0} segment {1}: {2}",
    "viewer.tools.chart.copyImage": "Copy image",
    "viewer.tools.chart.copied": "Copied!"
  };

  // assets/web/l10n/strings-web-nav.ts
  var stringsWebNav = {
    // --- Tabs (assets/web/tabs.ts) ---
    "viewer.nav.tab.close": "Close tab",
    // {0} is the tab's label — keep it a token so word order can vary per locale.
    "viewer.nav.tab.closeNamed": "Close {0}",
    // Default Home tab label, used when the TOOL_LABELS lookup has no entry.
    "viewer.nav.tab.home": "Home",
    // Bulk-close confirmation — singular vs plural are separate keys; {0} is the count.
    "viewer.nav.tab.closeOthers.one": "Close {0} other tab?",
    "viewer.nav.tab.closeOthers.many": "Close {0} other tabs?",
    // --- Query history sidebar (assets/web/history-sidebar.ts) ---
    "viewer.nav.history.empty": "No queries yet.",
    // Row-count suffix in a history entry's meta line; {0} is the count.
    "viewer.nav.history.rows": "{0} row(s)",
    // Error marker shown in a history row / occurrences table when a run failed.
    "viewer.nav.history.errorMark": "ERR",
    // (n) count badge tooltip; {0} is how many times the identical SQL ran.
    "viewer.nav.history.runsTooltip": "Show all {0} runs of this query",
    // Occurrences dialog accessible name and title; {0} is the run count.
    "viewer.nav.history.dialog.ariaLabel": "Query run history",
    "viewer.nav.history.dialog.title": "Query runs ({0})",
    "viewer.nav.history.dialog.close": "Close",
    // Occurrences table column headers.
    "viewer.nav.history.col.source": "Source",
    "viewer.nav.history.col.time": "Time",
    "viewer.nav.history.col.duration": "Duration",
    "viewer.nav.history.dialog.copy": "Copy",
    // Copy-success toast; {0} is the number of runs copied.
    "viewer.nav.history.copied": "Copied {0} runs",
    // Clear-history confirmation.
    "viewer.nav.history.clearConfirm": "Clear all query history?",
    // Relative-time phrases for a history entry's timestamp. Separate keys per unit
    // so each can be translated independently; {0} is the elapsed count.
    "viewer.nav.history.time.justNow": "just now",
    "viewer.nav.history.time.seconds": "{0} s ago",
    "viewer.nav.history.time.minutes": "{0} m ago",
    "viewer.nav.history.time.hours": "{0} h ago",
    "viewer.nav.history.time.days": "{0} d ago",
    // --- Home launcher (assets/web/home-screen.ts) ---
    // Tool-card hover tooltip: "{0}" is the tool label, "{1}" its blurb. The em-dash
    // separator is fixed punctuation; both surrounding values are tokens so a
    // translator can reorder them.
    "viewer.nav.home.cardTooltip": "{0} \u2014 {1}",
    // Home page heading.
    "viewer.nav.home.title": "Saropa Drift Advisor",
    // Narrative feature overview shown under the heading. Rolls every launcher/extra
    // blurb into prose without dropping a capability: browse/pagination/export, schema
    // + data search with filters and jump-to-match, the SQL editor (templates,
    // bookmarks, charts, natural-language ask), snapshot/time-travel, database diff for
    // migrations, suggested indexes + query hints, DDL/columns/PRAGMA, the relationship
    // diagram, table sizes + growth, slow-statement timings, health checks for drift,
    // CSV import/export, settings (prefs, masking, confirm-navigate), PII masking,
    // theme switching, and the read-only share link. Kept as one key (one paragraph)
    // so a translator handles the whole overview as a unit.
    "viewer.nav.home.lead": "A read-only console for your SQLite database. Browse and open tables with pagination and export, or run schema and data search with filters that jump straight to matches. Write queries in the SQL editor with templates, bookmarks, charts, and natural-language ask. Capture schema snapshots to time-travel through changes, diff two databases to plan migrations, and review suggested indexes and query hints. Inspect DDL, columns, and PRAGMA, map relationships in the diagram, and track table sizes and growth. Watch slow statements and their timings, run health checks for drift signals, import a CSV into a table, and export to CSV or schema. Tune preferences, masking, and confirm-on-navigate in settings, redact sensitive columns with PII masking, switch between light, dark, showcase, and midnight themes, and share a read-only session link.",
    // Feature-search box (filters the launcher cards, not table data).
    "viewer.nav.home.search.placeholder": "Search features\u2026 (e.g. theme, diff, redact)",
    "viewer.nav.home.search.aria": "Search Home features",
    // Empty-result message; {0} is the user's raw query.
    "viewer.nav.home.search.noResults": "No features match \u201C{0}\u201D."
  };

  // assets/web/l10n/strings-web-session.ts
  var stringsWebSession = {
    // --- Connection banner (assets/web/connection.ts) ---
    // The decorative bullet/em-dash/ellipsis punctuation stays inside each value
    // because it belongs to the sentence, not to code. {0} is the dynamic count
    // (seconds, interval, attempt number) kept as a token so it can be reordered.
    "viewer.session.banner.reconnecting": "Reconnecting\u2026",
    "viewer.session.banner.restoring": "Restoring connection\u2026",
    "viewer.session.banner.lost.checking": "Connection lost \u2014 checking\u2026",
    "viewer.session.banner.lost.nextRetry": "Connection lost \u2014 next retry in {0}s",
    "viewer.session.banner.lost.reconnecting": "Connection lost \u2014 reconnecting\u2026",
    "viewer.session.banner.attempt": "Attempt {0}",
    "viewer.session.banner.retryingEvery": "Retrying every {0}s",
    "viewer.session.banner.maxInterval": "(max interval)",
    // --- Session share / restore (assets/web/session.ts) ---
    // {0} is the share URL or the localized expiry timestamp; {1} keeps a second
    // dynamic value where two appear in one prompt/alert.
    "viewer.session.share.copied": "Share URL copied to clipboard!\n\n{0}\n\nExpires: {1}",
    "viewer.session.share.promptCopy": "Copy this share URL:",
    "viewer.session.share.promptNote": "Add a note for your team (optional):\n\nSession will expire in 1 hour.",
    "viewer.session.share.busy": "Sharing\u2026",
    "viewer.session.share.menuLabel": "Share",
    "viewer.session.share.failed": "Failed to create share: {0}",
    // {0} = HTTP status code; surfaced to the user inside the share-failed alert.
    "viewer.session.share.serverError": "Server error {0}",
    // --- Session expired / restore banners (assets/web/session.ts) ---
    "viewer.session.expired.title": "Session Expired",
    "viewer.session.expired.body": "The shared session you are trying to access has expired or was not found.",
    "viewer.session.expired.hint": "Sessions expire after 1 hour. Ask the person who shared the link to create a new one.",
    // --- Session countdown / extend (assets/web/session.ts) ---
    // {0} = minutes, {1} = seconds where both appear.
    "viewer.session.countdown.expired": "EXPIRED",
    "viewer.session.countdown.expiresInMinSec": "Expires in {0}m {1}s",
    "viewer.session.countdown.expiresInMin": "Expires in {0} min",
    "viewer.session.countdown.warning": 'Warning: This session expires in less than 10 minutes. Click "Extend" to add more time.',
    "viewer.session.extend.label": "Extend",
    "viewer.session.extend.title": "Extend session by 1 hour",
    "viewer.session.extend.busy": "Extending\u2026",
    "viewer.session.extend.done": "Session extended!",
    "viewer.session.extend.failed": "Failed to extend session: {0}",
    // Surfaced as the {0} inside extend.failed when the server rejects the request.
    "viewer.session.extend.serverError": "Failed to extend session",
    // --- Session info bar (assets/web/session.ts) ---
    // info bar text: "Shared session" with optional note then created timestamp.
    // {0} = escaped note, {1} = localized created timestamp.
    "viewer.session.info.shared": "Shared session",
    "viewer.session.info.sharedWithNote": 'Shared session: "{0}"',
    "viewer.session.info.created": " (created {0})",
    "viewer.session.annotations.heading": "Annotations:",
    // --- Performance tab (assets/web/performance.ts) ---
    // {0} carries an escaped error message or SQL snippet; numeric stats are
    // pre-escaped at the call site and injected via {0}.
    "viewer.session.perf.loading": "Loading\u2026",
    "viewer.session.perf.update": "Update",
    "viewer.session.perf.empty": "No queries recorded yet. Browse some tables, then update.",
    "viewer.session.perf.emptySaved": "No queries recorded (saved run).",
    "viewer.session.perf.noData": "No data.",
    "viewer.session.perf.noQueriesInRun": "No queries in this run.",
    "viewer.session.perf.error": "Error: {0}",
    "viewer.session.perf.cleared": "Performance history cleared.",
    "viewer.session.perf.clearing": "Clearing\u2026",
    "viewer.session.perf.clear": "Clear",
    "viewer.session.perf.saved": "Saved",
    "viewer.session.perf.saveFailed": "Save failed (storage may be full)",
    "viewer.session.perf.requestFailed": "Request failed",
    "viewer.session.perf.clearFailed": "Clear failed",
    "viewer.session.perf.compareLabel": "Query performance",
    // Summary line stats: {0} = total queries, total ms, avg ms.
    "viewer.session.perf.summary.total": "Total: {0} queries",
    "viewer.session.perf.summary.totalTime": "Total time: {0} ms",
    "viewer.session.perf.summary.avg": "Avg: {0} ms",
    // Slow-query section. {0} = threshold ms.
    "viewer.session.perf.slow.heading": "Slow queries (&gt;{0}ms):",
    "viewer.session.perf.patterns.heading": "Most time-consuming patterns:",
    "viewer.session.perf.recent.heading": "Recent queries (newest first):",
    // Compare summary: {0} = before count, {1} = after count.
    "viewer.session.perf.compareSummary": "Before: {0} queries \xB7 After: {1} queries",
    // Table column headers.
    "viewer.session.perf.col.duration": "Duration",
    "viewer.session.perf.col.rows": "Rows",
    "viewer.session.perf.col.time": "Time",
    "viewer.session.perf.col.sql": "SQL",
    "viewer.session.perf.col.totalMs": "Total ms",
    "viewer.session.perf.col.count": "Count",
    "viewer.session.perf.col.avgMs": "Avg ms",
    "viewer.session.perf.col.maxMs": "Max ms",
    "viewer.session.perf.col.pattern": "Pattern",
    "viewer.session.perf.col.ms": "ms",
    // --- Pagination bar (assets/web/pagination.ts) ---
    // {0}=from, {1}=to, {2}=total in the range readout; {0}=page elsewhere.
    "viewer.session.pagination.zeroRows": "0 rows",
    "viewer.session.pagination.showingRange": "Showing {0}\u2013{1} of {2} rows",
    "viewer.session.pagination.pageUnknownTotal": "Page {0} (total unknown)",
    "viewer.session.pagination.pageLabel": "Page ",
    "viewer.session.pagination.currentPageAria": "Current page",
    "viewer.session.pagination.of": " of {0}",
    "viewer.session.column.unpin": "Unpin",
    "viewer.session.column.pin": "Pin",
    "viewer.session.column.unpin.title": "Unpin this column",
    "viewer.session.column.pin.title": "Pin this column to the left"
  };

  // assets/web/l10n/strings-web-settings.ts
  var stringsWebSettings = {
    // --- Settings panel: group titles (assets/web/settings.ts) ---
    "viewer.settings.group.storage": "Storage & History",
    "viewer.settings.group.tableDefaults": "Table Defaults",
    "viewer.settings.group.performance": "Performance",
    "viewer.settings.group.dataFormatting": "Data Formatting",
    "viewer.settings.group.ask": "Ask in English",
    // --- Settings panel: storage & history ---
    "viewer.settings.storage.sqlHistoryMax": "SQL history max entries",
    "viewer.settings.storage.maxAnalyses": "Max saved analyses",
    "viewer.settings.storage.clearAll": "Clear all stored data",
    "viewer.settings.storage.clearAllHint": "Removes pinned tables, table states, navigation history, SQL history, bookmarks, and saved analyses. Theme and sidebar preferences are kept.",
    // Transient confirmation shown on the Clear button after the data is cleared.
    "viewer.settings.storage.cleared": "Cleared!",
    // --- Settings panel: table defaults ---
    "viewer.settings.table.defaultPageSize": "Default page size",
    "viewer.settings.table.defaultDisplayFormat": "Default display format",
    "viewer.settings.table.displayFormat.raw": "Raw",
    "viewer.settings.table.displayFormat.formatted": "Formatted",
    "viewer.settings.table.nullDisplay": "NULL display",
    "viewer.settings.table.nullDisplaySub": "How SQL NULLs render in table cells (always shown dimmed)",
    // The dash option label keeps the literal dash glyph plus a clarifying word.
    "viewer.settings.table.nullDisplay.dash": "- (dash)",
    "viewer.settings.table.onlyMatching": "Show only matching rows",
    "viewer.settings.table.onlyMatchingSub": "When a row filter is active, hide non-matching rows instead of highlighting them",
    // --- Settings panel: performance ---
    "viewer.settings.perf.slowQueryThreshold": "Slow query threshold",
    "viewer.settings.perf.slowQueryThresholdSub": "Queries exceeding this duration (ms) are flagged in the Perf tab",
    "viewer.settings.perf.autoRefresh": "Auto-refresh polling",
    "viewer.settings.perf.autoRefreshSub": "Automatically detect and reload when database data changes",
    // --- Settings panel: data formatting ---
    "viewer.settings.format.epochDetection": "Auto-detect epoch timestamps",
    "viewer.settings.format.epochDetectionSub": "Automatically format large integers as dates when column names suggest timestamps",
    "viewer.settings.format.confirmNavigate": "Confirm before leaving page",
    "viewer.settings.format.confirmNavigateSub": "Show a browser confirmation dialog when navigating away or closing the tab",
    // --- Settings panel: Ask in English (voice / keyword commands) ---
    "viewer.settings.ask.keywords": "Voice command keywords",
    "viewer.settings.ask.keywordsSub": 'Treat spoken phrases like "clear", "run again", and "what about last year" as commands instead of typing them into the question',
    // --- Settings panel: footer + confirm dialogs ---
    "viewer.settings.footer.resetAll": "Reset all to defaults",
    "viewer.settings.confirm.clearAll": "Clear all stored project data? Theme and sidebar preferences will be kept.",
    "viewer.settings.confirm.resetAll": "Reset all settings to their default values?",
    // --- FK navigation breadcrumb (assets/web/fk-nav.ts) ---
    // The arrow glyph (←) is a symbol prepended in code; only the word is here.
    "viewer.settings.fknav.back": "Back",
    "viewer.settings.fknav.backTitle": "Go back to previous table",
    "viewer.settings.fknav.clearPath": "Clear path",
    "viewer.settings.fknav.clearPathTitle": "Clear navigation trail",
    // {0} is the target table name — a token so word order can change per locale.
    "viewer.settings.fknav.jumpTitle": "Jump to {0}",
    // --- ER diagram (assets/web/diagram.ts) ---
    "viewer.settings.diagram.noTables": "No tables.",
    "viewer.settings.diagram.loading": "Loading\u2026",
    // {0} is the error text — kept a token so the prefix can be reordered.
    "viewer.settings.diagram.loadFailed": "Failed to load diagram: {0}",
    // Soft-relationship "how it was inferred" descriptions (s.rule branch).
    "viewer.settings.diagram.rule.nounId": "id-name convention",
    "viewer.settings.diagram.rule.sharedUuid": "shared UUID column",
    // Column primary-key badge shown inside each table box.
    "viewer.settings.diagram.pk": "PK",
    // Screen-reader text-alternative section headings.
    "viewer.settings.diagram.alt.tableList": "Schema table list",
    "viewer.settings.diagram.alt.fkHeading": "Foreign key relationships",
    "viewer.settings.diagram.alt.softHeading": "Inferred (undeclared) relationships",
    // Soft-relationship suffix appended to an A.b → C.d edge line. {0} is the
    // "how" phrase (rule.nounId / rule.sharedUuid). The full edge string is
    // assembled at the call site with the arrow glyph as static markup.
    "viewer.settings.diagram.alt.softInferred": "(inferred from {0}, not declared)",
    // --- ER diagram: SVG aria-labels (singular/plural are separate keys) ---
    // {0} = table count. Singular vs plural picked by code, not an inline if.
    "viewer.settings.diagram.aria.tablesOne": "{0} table",
    "viewer.settings.diagram.aria.tablesMany": "{0} tables",
    // {0} = foreign-key relationship count.
    "viewer.settings.diagram.aria.fksOne": "{0} foreign key relationship",
    "viewer.settings.diagram.aria.fksMany": "{0} foreign key relationships",
    // {0} = inferred-relationship count. Leading conjunction included because it
    // joins onto the FK clause in the same aria sentence.
    "viewer.settings.diagram.aria.softOne": " and {0} inferred (undeclared) relationship",
    "viewer.settings.diagram.aria.softMany": " and {0} inferred (undeclared) relationships",
    // Full schema-diagram aria-label. {0} = tables clause, {1} = FK clause,
    // {2} = soft clause (may be empty). Joined with "and" inside the value so a
    // translator controls the phrasing around the three counts.
    "viewer.settings.diagram.aria.summary": "Schema diagram showing {0} and {1}{2}",
    // --- ER diagram: per-table aria-label (singular/plural columns) ---
    // {0} = table name, {1} = column count. Two count variants; the optional
    // primary-key clause ({2}) is appended by code only when a PK exists.
    "viewer.settings.diagram.aria.tableOne": "{0} table, {1} column{2}",
    "viewer.settings.diagram.aria.tableMany": "{0} table, {1} columns{2}",
    // Appended to the per-table aria-label. {0} = comma-joined PK column names.
    "viewer.settings.diagram.aria.pkClause": ", primary key: {0}",
    // --- ER diagram: text-alternative per-table line (singular/plural) ---
    // {0} = table name (pre-wrapped <strong>), {1} = column count, {2} = column list.
    "viewer.settings.diagram.alt.tableOne": "{0} ({1} column): {2}",
    "viewer.settings.diagram.alt.tableMany": "{0} ({1} columns): {2}",
    // Primary-key marker appended to a column name in the text alternative.
    "viewer.settings.diagram.alt.pkMark": " (PK)"
  };

  // assets/web/l10n/strings-web-misc.ts
  var stringsWebMisc = {};

  // assets/web/l10n.ts
  var WEB_STRING_REGISTRIES = [
    webStrings,
    stringsWebTable,
    stringsWebQueryBuilder,
    stringsWebSchema,
    stringsWebSql,
    stringsWebTools,
    stringsWebNav,
    stringsWebSession,
    stringsWebSettings,
    stringsWebMisc
  ];
  var englishStrings = Object.assign({}, ...WEB_STRING_REGISTRIES);
  var KNOWN_LOCALES = ["pt-br", "zh-cn", "zh-tw", "de", "es", "fr", "it", "ja", "ko", "ru", "en"];
  var activeOverlay = {};
  var activeLocale = "en";
  function normalizeLocale(raw) {
    if (!raw) {
      return "en";
    }
    const lower = raw.toLowerCase().replace(/_/g, "-");
    if (KNOWN_LOCALES.indexOf(lower) !== -1) {
      return lower;
    }
    if (lower.indexOf("zh") === 0) {
      if (lower.indexOf("hant") !== -1 || lower.indexOf("-tw") !== -1 || lower.indexOf("-hk") !== -1) {
        return "zh-tw";
      }
      return "zh-cn";
    }
    if (lower.indexOf("pt") === 0 && lower.indexOf("-br") !== -1) {
      return "pt-br";
    }
    const primary = lower.split("-")[0];
    return KNOWN_LOCALES.indexOf(primary) !== -1 ? primary : "en";
  }
  function detectLocale(override) {
    if (override) {
      return normalizeLocale(override);
    }
    const navLang = typeof navigator !== "undefined" ? navigator.language : null;
    return normalizeLocale(navLang);
  }
  function installCatalog(locale, catalog) {
    activeLocale = normalizeLocale(locale);
    activeOverlay = activeLocale === "en" || !catalog ? {} : catalog;
  }
  function getActiveLocale() {
    return activeLocale;
  }
  function substitute(template, args) {
    if (args.length === 0) {
      return template;
    }
    return template.replace(/\{(\d+)\}/g, (match, index) => {
      const i = Number(index);
      return i < args.length ? String(args[i]) : match;
    });
  }
  function vt(key, ...args) {
    const template = activeOverlay[key] ?? englishStrings[key] ?? key;
    return substitute(template, args);
  }
  function initWebL10n() {
    const injected = typeof window !== "undefined" ? window.__SDA_L10N : void 0;
    if (injected && injected.locale) {
      installCatalog(injected.locale, injected.catalog);
      return;
    }
    activeLocale = detectLocale();
    activeOverlay = {};
  }

  // assets/web/sql-highlight.ts
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  var KEYWORDS = /* @__PURE__ */ new Set([
    "ADD",
    "ALL",
    "ALTER",
    "AND",
    "AS",
    "ASC",
    "AUTOINCREMENT",
    "BETWEEN",
    "BY",
    "CASE",
    "CHECK",
    "COLLATE",
    "COLUMN",
    "COMMIT",
    "CONSTRAINT",
    "CREATE",
    "CROSS",
    "CURRENT_DATE",
    "CURRENT_TIME",
    "CURRENT_TIMESTAMP",
    "DEFAULT",
    "DEFERRABLE",
    "DELETE",
    "DESC",
    "DISTINCT",
    "DROP",
    "ELSE",
    "END",
    "ESCAPE",
    "EXCEPT",
    "EXISTS",
    "FOREIGN",
    "FROM",
    "FULL",
    "GLOB",
    "GROUP",
    "HAVING",
    "IF",
    "IN",
    "INDEX",
    "INNER",
    "INSERT",
    "INTERSECT",
    "INTO",
    "IS",
    "JOIN",
    "KEY",
    "LEFT",
    "LIKE",
    "LIMIT",
    "NOT",
    "NULL",
    "OFFSET",
    "ON",
    "OR",
    "ORDER",
    "OUTER",
    "PRIMARY",
    "REFERENCES",
    "RIGHT",
    "ROLLBACK",
    "ROWID",
    "SELECT",
    "SET",
    "TABLE",
    "THEN",
    "TO",
    "TRANSACTION",
    "UNION",
    "UNIQUE",
    "UPDATE",
    "USING",
    "VALUES",
    "WHEN",
    "WHERE",
    "WITH",
    "INTEGER",
    "TEXT",
    "REAL",
    "BLOB",
    "NUMERIC",
    "BOOLEAN",
    "DATETIME"
  ]);
  function highlightSql(sql) {
    if (typeof sql !== "string" || sql.length === 0) return "";
    const out = [];
    let i = 0;
    const n = sql.length;
    while (i < n) {
      if (sql.slice(i, i + 2) === "/*") {
        const end = sql.indexOf("*/", i + 2);
        const endIdx = end === -1 ? n : end + 2;
        out.push('<span class="sql-cmt">', esc(sql.slice(i, endIdx)), "</span>");
        i = endIdx;
        continue;
      }
      if (sql.slice(i, i + 2) === "--") {
        let j = i + 2;
        while (j < n && sql[j] !== "\n") j++;
        out.push('<span class="sql-cmt">', esc(sql.slice(i, j)), "</span>");
        i = j;
        continue;
      }
      if (sql[i] === "'") {
        let j = i + 1;
        while (j < n) {
          if (sql[j] === "'") {
            if (sql[j + 1] === "'") j += 2;
            else {
              j += 1;
              break;
            }
          } else j++;
        }
        out.push('<span class="sql-str">', esc(sql.slice(i, j)), "</span>");
        i = j;
        continue;
      }
      if (sql[i] === '"') {
        let j = i + 1;
        while (j < n && sql[j] !== '"') {
          if (sql[j] === "\\" && j + 1 < n) j += 2;
          else j++;
        }
        if (j < n) j++;
        out.push('<span class="sql-id">', esc(sql.slice(i, j)), "</span>");
        i = j;
        continue;
      }
      if (/[A-Za-z_][A-Za-z0-9_]*/.test(sql[i])) {
        const match = sql.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*/);
        if (match) {
          const word = match[0];
          const upper = word.toUpperCase();
          const cls = KEYWORDS.has(upper) ? "sql-kw" : "sql-plain";
          out.push('<span class="', cls, '">', esc(word), "</span>");
          i += word.length;
          continue;
        }
      }
      if (/[0-9]/.test(sql[i])) {
        const match = sql.slice(i).match(/^\d+(\.\d+)?([eE][+-]?\d+)?/);
        if (match) {
          out.push('<span class="sql-num">', esc(match[0]), "</span>");
          i += match[0].length;
          continue;
        }
      }
      out.push(esc(sql[i]));
      i++;
    }
    return out.join("");
  }

  // assets/web/masthead.ts
  var STATUS_DOT = "\u25CF ";
  function initMasthead() {
    const indicator = document.getElementById("live-indicator");
    if (!indicator) {
      console.log("[SDA] initMasthead: #live-indicator NOT found");
      return null;
    }
    console.log("[SDA] initMasthead: #live-indicator found, creating API");
    const api2 = {
      /**
       * Update the pill to reflect the current connection state.
       *
       * @param state - 'connected', 'disconnected', or 'reconnecting'
       * @param pollingEnabled - only meaningful when state === 'connected'
       */
      setConnection(state, pollingEnabled2) {
        console.log("[SDA] masthead.setConnection: state=" + state + ", polling=" + pollingEnabled2);
        if (state === "connected") {
          indicator.classList.remove("disconnected", "reconnecting");
          indicator.disabled = false;
          indicator.textContent = STATUS_DOT + vt(pollingEnabled2 ? "masthead.status.online" : "masthead.status.paused");
          indicator.classList.toggle("paused", !pollingEnabled2);
          indicator.title = vt(pollingEnabled2 ? "masthead.title.online" : "masthead.title.paused");
        } else if (state === "disconnected") {
          indicator.textContent = STATUS_DOT + vt("masthead.status.offline");
          indicator.classList.add("disconnected");
          indicator.classList.remove("paused", "reconnecting");
          indicator.disabled = true;
          indicator.title = vt("masthead.title.offline");
        } else {
          indicator.textContent = STATUS_DOT + vt("masthead.status.reconnecting");
          indicator.classList.add("disconnected", "reconnecting");
          indicator.classList.remove("paused");
          indicator.disabled = true;
          indicator.title = vt("masthead.title.reconnecting");
        }
      },
      /** Show a transient ellipsis while a toggle request is in-flight. */
      setBusy() {
        indicator.disabled = true;
        indicator.textContent = "\u2026";
      },
      /**
       * Callback invoked when the user clicks the pill to toggle polling.
       * Set by app.js during initialisation. If null, clicks are ignored.
       */
      onToggle: null
    };
    indicator.addEventListener("click", () => {
      console.log("[SDA] masthead click: disabled=" + indicator.disabled + ", hasOnToggle=" + (typeof api2.onToggle === "function"));
      if (indicator.disabled) return;
      if (typeof api2.onToggle === "function") {
        api2.onToggle();
      }
    });
    return api2;
  }

  // assets/web/utils.ts
  function esc2(s) {
    if (s == null) return "";
    const d = document.createElement("div");
    d.textContent = String(s);
    return d.innerHTML;
  }
  function setButtonBusy(btn, loading, label) {
    if (!btn) return;
    if (loading) {
      if (btn.getAttribute("data-busy-restore") == null) {
        btn.setAttribute("data-busy-restore", btn.innerHTML);
      }
      btn.classList.add("btn-busy");
      btn.innerHTML = '<span class="btn-busy-spinner" aria-hidden="true"></span><span class="btn-busy-label">' + esc2(label) + "</span>";
    } else {
      btn.classList.remove("btn-busy");
      const stashed = btn.getAttribute("data-busy-restore");
      if (stashed != null) {
        btn.innerHTML = stashed;
        btn.removeAttribute("data-busy-restore");
      } else {
        btn.textContent = label;
      }
    }
  }
  function highlightSqlSafe(sql) {
    if (sql == null) return "";
    return typeof window.sqlHighlight === "function" && window.sqlHighlight(sql) || esc2(sql);
  }
  function formatTableRowCountDisplay(n) {
    const num = Number(n);
    if (!isFinite(num)) return String(n);
    return num.toLocaleString("en-US");
  }
  function syncFeatureCardExpanded(collapsible) {
    const card = collapsible && collapsible.closest && collapsible.closest(".feature-card");
    if (card) card.classList.toggle("expanded", !collapsible.classList.contains("collapsed"));
  }

  // assets/web/pii.ts
  function isPiiMaskEnabled() {
    const cb = document.getElementById("tb-mask-checkbox");
    return cb ? cb.checked : false;
  }
  function isPiiColumn(colName) {
    if (!colName || typeof colName !== "string") return false;
    const lower = colName.toLowerCase();
    const substringPatterns = [
      "email",
      "password",
      "phone",
      "ssn",
      "token",
      "secret",
      "api_key",
      "apikey",
      "address",
      "salary",
      "wage",
      "income",
      "credit_card",
      "creditcard",
      "card_num",
      "ip_addr",
      "ipaddr",
      "dob",
      "birth",
      "passport",
      "license",
      "licence",
      "iban",
      "account_num",
      "acct_num",
      "sort_code",
      "national_id",
      "tax_id",
      "sin_num",
      "medicare",
      "beneficiary",
      "ethnicity",
      "religion",
      "biometric",
      "fingerprint",
      "retina",
      "face_id",
      "social_sec"
    ];
    if (substringPatterns.some(function(p) {
      return lower.indexOf(p) >= 0;
    })) {
      return true;
    }
    const segments = lower.split(/[_\-.\s]+/);
    const wordPatterns = /* @__PURE__ */ new Set([
      "name",
      "first",
      "last",
      "full",
      "surname",
      "username",
      "login",
      "nick",
      "alias",
      "avatar",
      "photo",
      "tel",
      "ip",
      "sin",
      "tin",
      "zip",
      "postal",
      "city",
      "country",
      "street",
      "lat",
      "lng",
      "latitude",
      "longitude",
      "geo",
      "coords",
      "routing"
    ]);
    return segments.some(function(seg) {
      return wordPatterns.has(seg);
    });
  }
  function maskPiiValue(colName, value) {
    if (value == null) return "";
    const s = String(value).trim();
    if (s.length === 0) return "";
    const lower = colName.toLowerCase();
    if (lower.indexOf("email") >= 0 && s.indexOf("@") >= 0) {
      const at = s.indexOf("@");
      const local = s.slice(0, at);
      const domain = s.slice(at);
      const first = local.charAt(0);
      return (first ? first + "***" : "***") + domain;
    }
    const segments = lower.split(/[_\-.\s]+/);
    if (lower.indexOf("phone") >= 0 || segments.indexOf("tel") >= 0) {
      const digits = s.replace(/\D/g, "");
      const last4 = digits.length >= 4 ? digits.slice(-4) : "****";
      return "***-***-" + last4;
    }
    if (lower.indexOf("ssn") >= 0 || lower.indexOf("social_sec") >= 0) {
      const d = s.replace(/\D/g, "");
      const l4 = d.length >= 4 ? d.slice(-4) : "****";
      return "***-**-" + l4;
    }
    const secretPatterns = [
      "password",
      "token",
      "secret",
      "api_key",
      "apikey",
      "biometric",
      "fingerprint",
      "retina",
      "face_id"
    ];
    if (secretPatterns.some(function(p) {
      return lower.indexOf(p) >= 0;
    })) {
      return "****";
    }
    const nameWords = /* @__PURE__ */ new Set([
      "name",
      "first",
      "last",
      "full",
      "surname",
      "username",
      "login",
      "nick",
      "alias"
    ]);
    if (segments.some(function(seg) {
      return nameWords.has(seg);
    })) {
      return s.charAt(0) + "***";
    }
    const numericSubstrings = [
      "salary",
      "wage",
      "income",
      "credit_card",
      "creditcard",
      "card_num",
      "account_num",
      "acct_num",
      "sort_code",
      "iban",
      "sin_num",
      "tax_id",
      "national_id",
      "medicare"
    ];
    const numericSegments = /* @__PURE__ */ new Set(["routing", "tin", "sin"]);
    if (numericSubstrings.some(function(p) {
      return lower.indexOf(p) >= 0;
    }) || segments.some(function(seg) {
      return numericSegments.has(seg);
    })) {
      return "***";
    }
    const locationWords = /* @__PURE__ */ new Set([
      "address",
      "street",
      "city",
      "country",
      "zip",
      "postal",
      "lat",
      "lng",
      "latitude",
      "longitude",
      "geo",
      "coords"
    ]);
    if (segments.some(function(seg) {
      return locationWords.has(seg);
    }) || lower.indexOf("ip_addr") >= 0 || lower.indexOf("ipaddr") >= 0) {
      return s.length <= 2 ? "***" : s.slice(0, 2) + "***";
    }
    return s.length <= 2 ? "***" : s.slice(0, 2) + "***";
  }
  function getDisplayValue(colName, rawValue, _optMaskOn, _optIsPii) {
    const maskOn = _optMaskOn !== void 0 ? _optMaskOn : isPiiMaskEnabled();
    const isPii = _optIsPii !== void 0 ? _optIsPii : isPiiColumn(colName);
    if (!maskOn || !isPii) return rawValue != null ? String(rawValue) : "";
    return maskPiiValue(colName, rawValue);
  }

  // assets/web/state.ts
  var DRIFT_VIEWER_AUTH_TOKEN = "";
  var driftWriteEnabled = false;
  var driftCompareEnabled = false;
  function setDriftWriteEnabled(v) {
    driftWriteEnabled = v;
  }
  function setDriftCompareEnabled(v) {
    driftCompareEnabled = v;
  }
  var schemaMeta = null;
  function setSchemaMeta(m) {
    schemaMeta = m;
  }
  var activeTabId = "home";
  var openTableTabs = [];
  function setActiveTabId(id) {
    activeTabId = id;
  }
  var cachedSchema = null;
  var currentTableName = null;
  var currentTableJson = null;
  var lastRenderedSchema = null;
  var lastRenderedData = null;
  var limit = 200;
  var offset = 0;
  var tableCounts = {};
  var lastKnownTables = [];
  var lastGeneration = 0;
  var refreshInFlight = false;
  function setCachedSchema(s) {
    cachedSchema = s;
  }
  function setCurrentTableName(n) {
    currentTableName = n;
  }
  function setCurrentTableJson(j) {
    currentTableJson = j;
  }
  function setLastRenderedSchema(s) {
    lastRenderedSchema = s;
  }
  function setLastRenderedData(d) {
    lastRenderedData = d;
  }
  function setLimit(l) {
    limit = l;
  }
  function setOffset(o) {
    offset = o;
  }
  function setLastKnownTables(t) {
    lastKnownTables = t;
  }
  function setLastGeneration(g) {
    lastGeneration = g;
  }
  function setRefreshInFlight(f) {
    refreshInFlight = f;
  }
  var searchMatches = [];
  var searchCurrentIndex = -1;
  function setSearchMatches(m) {
    searchMatches = m;
  }
  function setSearchCurrentIndex(i) {
    searchCurrentIndex = i;
  }
  var connectionState = "connected";
  var consecutivePollFailures = 0;
  var currentBackoffMs = 1e3;
  var heartbeatTimerId = null;
  var keepAliveTimerId = null;
  var bannerDismissed = false;
  var nextHeartbeatAt = null;
  var heartbeatInFlight = false;
  var heartbeatAttemptCount = 0;
  var bannerUpdateIntervalId = null;
  function setConnectionState(s) {
    connectionState = s;
  }
  function setConsecutivePollFailures(n) {
    consecutivePollFailures = n;
  }
  function setCurrentBackoffMs(ms) {
    currentBackoffMs = ms;
  }
  function setHeartbeatTimerId(id) {
    heartbeatTimerId = id;
  }
  function setKeepAliveTimerId(id) {
    keepAliveTimerId = id;
  }
  function setBannerDismissed(d) {
    bannerDismissed = d;
  }
  function setNextHeartbeatAt(t) {
    nextHeartbeatAt = t;
  }
  function setHeartbeatInFlight(f) {
    heartbeatInFlight = f;
  }
  function setHeartbeatAttemptCount(n) {
    heartbeatAttemptCount = n;
  }
  function setBannerUpdateIntervalId(id) {
    bannerUpdateIntervalId = id;
  }
  var BACKOFF_INITIAL_MS = 1e3;
  var BACKOFF_MAX_MS = 3e4;
  var BACKOFF_MULTIPLIER = 2;
  var HEALTH_CHECK_THRESHOLD = 3;
  var KEEP_ALIVE_INTERVAL_MS = 15e3;
  var SQL_HISTORY_KEY = "drift-viewer-sql-history";
  var BOOKMARKS_KEY = "drift-viewer-sql-bookmarks";
  var sqlHistory = [];
  var sqlBookmarks = [];
  function setSqlHistory(h) {
    sqlHistory = h;
  }
  function setSqlBookmarks(b) {
    sqlBookmarks = b;
  }
  var THEME_KEY = "drift-viewer-theme";
  var TABLE_STATE_KEY_PREFIX = "drift-viewer-table-state-";
  var NAV_HISTORY_KEY = "drift-viewer-nav-history";
  var PINNED_TABLES_KEY = "drift-viewer-pinned-tables";
  var TOOLBAR_LABELS_KEY = "drift-viewer-toolbar-labels";
  var SERVER_ORIGIN_KEY = "drift-viewer-server-origin";
  var LIMIT_OPTIONS = [50, 200, 500, 1e3];
  var displayFormat = "raw";
  var nullDisplay = "NULL";
  var tableColumnTypes = {};
  var queryBuilderActive = false;
  var queryBuilderState = null;
  var tableColumnConfig = {};
  var showOnlyMatchingRows = true;
  var columnContextMenuTargetKey = null;
  var columnDragKey = null;
  var tableDefMetaOn = false;
  var tableDefStats = {};
  function setTableDefMetaOn(v) {
    tableDefMetaOn = v;
  }
  function setDisplayFormat(f) {
    displayFormat = f;
  }
  function setNullDisplay(s) {
    nullDisplay = s;
  }
  function setQueryBuilderActive(a) {
    queryBuilderActive = a;
  }
  function setQueryBuilderState(s) {
    queryBuilderState = s;
  }
  function setShowOnlyMatchingRows(v) {
    showOnlyMatchingRows = v;
  }
  function setColumnContextMenuTargetKey(k) {
    columnContextMenuTargetKey = k;
  }
  function setColumnDragKey(k) {
    columnDragKey = k;
  }
  var ANALYSIS_STORAGE_PREFIX = "saropa_analysis_";
  var lastSizeAnalyticsData = null;
  function setLastSizeAnalyticsData(d) {
    lastSizeAnalyticsData = d;
  }
  var CHART_COLORS = [
    "#4e79a7",
    "#f28e2b",
    "#e15759",
    "#76b7b2",
    "#59a14f",
    "#edc948",
    "#b07aa1",
    "#ff9da7",
    "#9c755f",
    "#bab0ac"
  ];
  var lastChartState = null;
  var chartResizeObserver = null;
  function setLastChartState(s) {
    lastChartState = s;
  }
  function setChartResizeObserver(o) {
    chartResizeObserver = o;
  }
  var pollingEnabled = true;
  function setPollingEnabled(p) {
    pollingEnabled = p;
  }
  var nlLiveDebounce = null;
  function setNlLiveDebounce(d) {
    nlLiveDebounce = d;
  }
  var fkMetaCache = {};
  var navHistory = [];
  var currentSessionId = null;
  var currentSessionExpiresAt = null;
  var sessionCountdownInterval = null;
  var sessionWarningShown = false;
  var sessionFastMode = false;
  function setCurrentSessionId(id) {
    currentSessionId = id;
  }
  function setCurrentSessionExpiresAt(at) {
    currentSessionExpiresAt = at;
  }
  function setSessionCountdownInterval(id) {
    sessionCountdownInterval = id;
  }
  function setSessionWarningShown(s) {
    sessionWarningShown = s;
  }
  function setSessionFastMode(f) {
    sessionFastMode = f;
  }
  var APP_SIDEBAR_WIDTH_KEY = "saropa_app_sidebar_width";
  var TOOL_ICONS = {
    home: "home",
    tables: "table_chart",
    sql: "terminal",
    search: "search",
    snapshot: "photo_camera",
    compare: "compare_arrows",
    index: "format_list_bulleted",
    size: "bar_chart",
    perf: "speed",
    anomaly: "favorite",
    import: "upload",
    schema: "grid_on",
    declared: "code",
    diagram: "account_tree",
    export: "download",
    settings: "settings"
  };
  var TOOL_LABELS = {
    home: "Home",
    tables: "Tables",
    sql: "Run SQL",
    search: "Search",
    snapshot: "Snapshot",
    compare: "DB diff",
    index: "Index",
    size: "Size",
    perf: "Perf",
    anomaly: "Health",
    import: "Import",
    schema: "Schema",
    declared: "Code schema",
    diagram: "Diagram",
    export: "Export",
    settings: "Settings"
  };
  var HOME_LAUNCHERS = [
    { id: "tables", blurb: "browse, open tables, pagination, export", color: "#3b82f6" },
    { id: "search", blurb: "schema + data search, filters, jump matches", color: "#06b6d4" },
    { id: "sql", blurb: "editor, templates, bookmarks, charts, NL ask", color: "#8b5cf6" },
    { id: "snapshot", blurb: "capture schema, time travel", color: "#ec4899" },
    { id: "compare", blurb: "diff databases, migrations", color: "#f59e0b" },
    { id: "index", blurb: "suggested indexes, query hints", color: "#10b981" },
    { id: "schema", blurb: "DDL, columns, PRAGMA", color: "#6366f1" },
    { id: "diagram", blurb: "relationship graph", color: "#14b8a6" },
    { id: "size", blurb: "table sizes, growth", color: "#84cc16" },
    { id: "perf", blurb: "slow statements, timings", color: "#ef4444" },
    { id: "anomaly", blurb: "health checks, drift signals", color: "#f43f5e" },
    { id: "import", blurb: "CSV \u2192 table", color: "#22c55e" },
    { id: "export", blurb: "CSV, schema", color: "#0ea5e9" },
    { id: "settings", blurb: "prefs, masking, confirm navigate", color: "#64748b" }
  ];
  var HOME_EXTRAS = [
    { action: "mask", icon: "visibility_off", label: "Mask PII", blurb: "redact sensitive columns", color: "#a855f7" },
    { action: "theme", icon: "palette", label: "Theme", blurb: "light, dark, showcase, midnight", color: "#f97316" },
    { action: "share", icon: "share", label: "Share", blurb: "read-only session link", color: "#0d9488" }
  ];
  var HOME_SEARCH_KEYWORDS = {
    tables: ["browse", "open", "list", "rows", "records", "columns", "pagination", "paginate", "page", "view", "grid", "data", "datasheet"],
    search: ["find", "lookup", "query", "filter", "filters", "jump", "matches", "locate", "grep", "seek", "full text", "schema search", "data search"],
    sql: ["query", "editor", "run sql", "statement", "terminal", "console", "template", "templates", "bookmark", "bookmarks", "chart", "charts", "graph", "natural language", "nl", "ask", "ai", "execute", "select"],
    snapshot: ["capture", "schema", "time travel", "history", "version", "backup", "restore", "point in time", "photo", "save state"],
    compare: ["diff", "difference", "databases", "migration", "migrations", "merge", "delta", "changes", "two databases", "drift"],
    index: ["indexes", "indices", "suggested", "query hints", "optimize", "optimization", "performance", "speed up", "btree", "key", "covering"],
    schema: ["ddl", "columns", "pragma", "structure", "definition", "create table", "fields", "types", "metadata", "constraints"],
    diagram: ["relationship", "relationships", "graph", "erd", "entity", "map", "visual", "tree", "connections", "foreign key", "fk", "links"],
    size: ["table sizes", "growth", "storage", "bytes", "disk", "space", "row count", "big tables", "usage"],
    perf: ["performance", "slow", "statements", "timings", "latency", "profiling", "speed", "bottleneck", "query time", "duration"],
    anomaly: ["health", "checks", "drift", "signals", "issues", "problems", "integrity", "warnings", "monitor", "diagnostics"],
    import: ["csv", "upload", "load", "ingest", "file", "data in", "insert"],
    export: ["csv", "download", "schema", "save", "dump", "backup", "data out", "extract"],
    settings: ["preferences", "prefs", "options", "config", "configuration", "masking", "confirm navigate", "pii", "defaults"],
    mask: ["redact", "pii", "sensitive", "hide", "privacy", "obscure", "columns", "censor", "anonymize"],
    theme: ["appearance", "color", "colors", "light", "dark", "showcase", "midnight", "style", "look", "palette", "skin", "mode"],
    share: ["link", "session", "read-only", "url", "collaborate", "send", "invite"]
  };
  var OFFLINE_DISABLE_IDS = [
    "sql-run",
    "sql-apply-template",
    "pagination-first",
    "pagination-prev",
    "pagination-next",
    "pagination-last",
    "pagination-apply",
    "sample-rows-btn",
    "clear-table-state",
    "clear-table-data",
    "clear-all-data"
  ];
  function authOpts(o) {
    o = o || {};
    o.headers = o.headers || {};
    if (DRIFT_VIEWER_AUTH_TOKEN) o.headers["Authorization"] = "Bearer " + DRIFT_VIEWER_AUTH_TOKEN;
    return o;
  }

  // assets/web/search.ts
  function escapeRe(s) {
    return s.replace(/[\\\\^\$*+?.()|[\]{}]/g, "\\\\$&");
  }
  function highlightText(text, term) {
    if (!term || term.length === 0) return esc2(text);
    const re = new RegExp("(" + escapeRe(term) + ")", "gi");
    var result = "";
    var lastEnd = 0;
    var match;
    while ((match = re.exec(text)) !== null) {
      result += esc2(text.slice(lastEnd, match.index)) + '<span class="highlight">' + esc2(match[1]) + "</span>";
      lastEnd = re.lastIndex;
    }
    result += esc2(text.slice(lastEnd));
    return result;
  }
  function getScope() {
    return document.getElementById("search-scope").value || "";
  }
  function getSearchTerm() {
    return String(document.getElementById("search-input").value || "").trim();
  }
  function getRowFilter() {
    return String(document.getElementById("row-filter").value || "").trim();
  }
  function filterRows(data) {
    const term = getRowFilter();
    if (!term || !data || data.length === 0) return data || [];
    const lower = term.toLowerCase();
    return data.filter((row) => Object.values(row).some((v) => v != null && String(v).toLowerCase().includes(lower)));
  }
  function getTableDisplayData(data) {
    if (!data || data.length === 0) return data || [];
    if (showOnlyMatchingRows && getRowFilter()) return filterRows(data);
    return data;
  }
  function buildTableFilterMetaSuffix(filteredLen, totalLen) {
    if (!getRowFilter()) return "";
    if (showOnlyMatchingRows) return vt("viewer.schema.search.filteredOf", filteredLen, totalLen);
    return vt("viewer.schema.search.showingAll", filteredLen);
  }
  function expandSectionContaining(el) {
    var node = el;
    while (node && node !== document.body) {
      if (node.classList && node.classList.contains("collapsible-body") && node.classList.contains("collapsed")) {
        var prev = node.previousElementSibling;
        if (prev && prev.classList.contains("collapsible-header")) {
          prev.click();
        }
      }
      node = node.parentElement;
    }
  }
  function applySearch() {
    const term = getSearchTerm();
    const scope = getScope();
    const navEl = document.getElementById("search-nav");
    const countEl2 = document.getElementById("search-count");
    const isSearchPanel = activeTabId === "search";
    const root = isSearchPanel ? document.getElementById("search-results-content") : null;
    function getEl(mainId, panelId) {
      if (isSearchPanel && root) {
        var el = root.querySelector("#" + panelId);
        return el || null;
      }
      return document.getElementById(mainId);
    }
    const schemaPre = getEl("schema-pre", "search-panel-schema-pre");
    const contentPre = getEl("content-pre", "search-panel-content-pre");
    var dataTable = getEl("data-table", "search-panel-data-table");
    if (schemaPre && lastRenderedSchema !== null && (scope === "schema" || scope === "both")) {
      schemaPre.innerHTML = term ? highlightText(lastRenderedSchema, term) : esc2(lastRenderedSchema);
    }
    if (contentPre && lastRenderedSchema !== null && scope === "schema") {
      contentPre.innerHTML = term ? highlightText(lastRenderedSchema, term) : esc2(lastRenderedSchema);
    }
    if (dataTable && (scope === "data" || scope === "both")) {
      dataTable.querySelectorAll("td").forEach(function(td) {
        if (!td.querySelector(".fk-link")) {
          var copyBtn = td.querySelector(".cell-copy-btn");
          var textNodes = [];
          td.childNodes.forEach(function(n) {
            if (n !== copyBtn) textNodes.push(n.textContent || "");
          });
          var text = textNodes.join("");
          var highlighted = term ? highlightText(text, term) : esc2(text);
          if (copyBtn) {
            var btnHtml = copyBtn.outerHTML;
            td.innerHTML = highlighted + btnHtml;
          } else {
            td.innerHTML = highlighted;
          }
        }
      });
    }
    setSearchMatches([]);
    setSearchCurrentIndex(-1);
    if (term) {
      var searchRoot = isSearchPanel && root ? root : document;
      setSearchMatches(Array.from(searchRoot.querySelectorAll ? searchRoot.querySelectorAll(".highlight") : []));
    }
    if (searchMatches.length > 0) {
      navEl.style.display = "flex";
      navigateToMatch(0);
    } else {
      navEl.style.display = term ? "flex" : "none";
      countEl2.textContent = term ? vt("viewer.schema.search.noMatches") : "";
      document.getElementById("search-prev").disabled = true;
      document.getElementById("search-next").disabled = true;
    }
  }
  function navigateToMatch(index) {
    var countEl2 = document.getElementById("search-count");
    var prevBtn = document.getElementById("search-prev");
    var nextBtn = document.getElementById("search-next");
    if (searchMatches.length === 0) return;
    if (index < 0) index = searchMatches.length - 1;
    if (index >= searchMatches.length) index = 0;
    if (searchCurrentIndex >= 0 && searchCurrentIndex < searchMatches.length) {
      searchMatches[searchCurrentIndex].classList.remove("highlight-active");
    }
    setSearchCurrentIndex(index);
    var current = searchMatches[searchCurrentIndex];
    current.classList.add("highlight-active");
    expandSectionContaining(current);
    current.scrollIntoView({ behavior: "auto", block: "center", inline: "nearest" });
    countEl2.textContent = vt("viewer.schema.search.matchCounter", searchCurrentIndex + 1, searchMatches.length);
    prevBtn.disabled = false;
    nextBtn.disabled = false;
  }
  function nextMatch() {
    if (searchMatches.length === 0) return;
    navigateToMatch(searchCurrentIndex + 1);
  }
  function prevMatch() {
    if (searchMatches.length === 0) return;
    navigateToMatch(searchCurrentIndex - 1);
  }

  // assets/web/nl-to-sql.ts
  var EDIT_VERB = /\b(?:chang|chnag|chagn|chaneg|chnge|chg|modif|modfi|mdoif|\bmod\b|updat|udpat|upadt|updt|\bupd\b|upd8|edit|eddit|edt|alter|altr|amend|ammend|revis|rivis|touch|tweak|twaek|adjust|ajust|adust|refresh|refesh|re-?sav|overwrit|overwrot|rewr|rewrot|rework|reword|mutat|patch|bump|sync|synch|migrat|recalc|reprocess|reindex|restamp|dirtied|flipp|toggl|reset|log(?:ged)?[ -]?in|sign(?:ed)?[ -]?in|seen|used|access|visit)/i;
  var BORN_VERB = /\bcreat|\bcraet|\bcreaet|\bkreat|\bcrt\b|\bcre\b|\badd(?:ed|ing|s)?\b|\bnew\b|\binsert|\binser|\bins\b|\bregist|\breg\b|\bsign(?:ed)?[ -]?up|\bsignup|\bjoin|\bmade\b|\bimport|\bimpor|\benter(?:ed|ing|s)?\b|\bborn\b|\bestablish|\bgenerat|\bspawn|\boriginat|\bonboard|\bseed|\bprovision|\benrol|\bsubscrib|\bactivat|\bcaptur|\brecord|\bposted|\bfirst (?:seen|added|created)/i;
  function resolveDateColumn(q, target) {
    const dateCols = target.columns.filter(function(c) {
      return isDateColumn(c) || /\bwhen\b|\bts\b|expiry|\bdue\b|logged|synced|seen|visited|login|logout|access|effective|valid|start|end|registered|inserted|added/i.test(c.name);
    });
    if (dateCols.length === 0) return void 0;
    const editCol = function(c) {
      return /updat|modif|chang|edit|alter|revis|touch|mtime|last.?mod|lastmod|sync|version|\brev\b|dirty|login|logged|seen|used|access|visit|active/i.test(c.name);
    };
    const bornCol = function(c) {
      return /creat|add|insert|regist|made|born|origin|ctime|first|since|seed|provision|enrol|subscrib|activat|signup|join|captur|logged|record|posted|import/i.test(c.name);
    };
    let col;
    if (EDIT_VERB.test(q)) col = dateCols.find(editCol);
    else if (BORN_VERB.test(q)) col = dateCols.find(bornCol);
    if (!col) col = dateCols[0];
    return col;
  }
  function dayExpr(col, alias) {
    const ref = (alias ? alias + "." : "") + '"' + col.name + '"';
    return /int/i.test(col.type) ? `date(${ref}, 'unixepoch', 'localtime')` : `date(${ref})`;
  }
  function temporalWhere(q, target, forceCol) {
    const col = forceCol || resolveDateColumn(q, target);
    if (!col) return { sql: "", phrase: "" };
    const isEpoch = /int/i.test(col.type);
    const d = isEpoch ? `date("${col.name}", 'unixepoch', 'localtime')` : `date("${col.name}")`;
    const dt = isEpoch ? `datetime("${col.name}", 'unixepoch', 'localtime')` : `datetime("${col.name}")`;
    const NUM = "(\\d+|an?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|couple(?: of)?|few|several|dozen)";
    function count(tok) {
      if (!tok) return 1;
      const t = tok.toLowerCase().replace(/\s+of$/, "").trim();
      if (/^\d+$/.test(t)) return parseInt(t, 10);
      const w = {
        a: 1,
        an: 1,
        one: 1,
        two: 2,
        three: 3,
        four: 4,
        five: 5,
        six: 6,
        seven: 7,
        eight: 8,
        nine: 9,
        ten: 10,
        eleven: 11,
        twelve: 12,
        couple: 2,
        few: 3,
        several: 5,
        dozen: 12
      };
      return w[t] != null ? w[t] : 1;
    }
    const W = function(frag) {
      return new RegExp(frag, "i");
    };
    const monthExpr = "(CAST(strftime('%m','now','localtime') AS INTEGER)-1)/3*3";
    const qStart = `date('now', 'start of year', (${monthExpr}) || ' months', 'localtime')`;
    const qPrevLo = `date('now', 'start of year', ((${monthExpr}) - 3) || ' months', 'localtime')`;
    const matchers = [
      // ---- sub-day granularity (needs datetime, not a day-truncated date) ----
      { re: W("\\bthis hour\\b"), f: () => `${dt} >= strftime('%Y-%m-%d %H:00:00', 'now', 'localtime')` },
      { re: W("(?:in the |over the |during the )?(?:last|past|previous|prior) " + NUM + " hours?\\b"), f: (m) => `${dt} >= datetime('now', '-${count(m[1])} hours', 'localtime')` },
      { re: W("(?:in the )?(?:last|past|previous|prior) hour\\b"), f: () => `${dt} >= datetime('now', '-1 hour', 'localtime')` },
      { re: W("(?:last|past|previous|prior) " + NUM + " min(?:ute)?s?\\b"), f: (m) => `${dt} >= datetime('now', '-${count(m[1])} minutes', 'localtime')` },
      { re: W("(?:last|past|previous|prior) min(?:ute)?\\b"), f: () => `${dt} >= datetime('now', '-1 minute', 'localtime')` },
      { re: W("\\b(?:just now|right now|moments? ago|a moment ago|seconds? ago|any (?:second|minute) now)\\b"), f: () => `${dt} >= datetime('now', '-5 minutes', 'localtime')` },
      // ---- time-of-day windows on the current (or last) day ----
      { re: W("\\b(?:this morning|earlier this morning)\\b"), f: () => `${dt} >= strftime('%Y-%m-%d 00:00:00', 'now', 'localtime') AND ${dt} < strftime('%Y-%m-%d 12:00:00', 'now', 'localtime')` },
      { re: W("\\bthis afternoon\\b"), f: () => `${dt} >= strftime('%Y-%m-%d 12:00:00', 'now', 'localtime') AND ${dt} < strftime('%Y-%m-%d 17:00:00', 'now', 'localtime')` },
      { re: W("\\b(?:this evening|tonight)\\b"), f: () => `${dt} >= strftime('%Y-%m-%d 17:00:00', 'now', 'localtime')` },
      { re: W("\\b(?:last night|overnight|over ?night)\\b"), f: () => `${dt} >= strftime('%Y-%m-%d 18:00:00', 'now', '-1 day', 'localtime') AND ${dt} < strftime('%Y-%m-%d 06:00:00', 'now', 'localtime')` },
      { re: W("\\b(?:earlier today|so far today|today so far|thus far today)\\b"), f: () => `${d} = date('now', 'localtime')` },
      // ---- exact single day ----
      { re: W("\\b(?:the )?day before yesterday\\b"), f: () => `${d} = date('now', '-2 days', 'localtime')` },
      { re: W("\\b" + NUM + " days? ago\\b"), f: (m) => `${d} = date('now', '-${count(m[1])} days', 'localtime')` },
      { re: W("\\b(?:to-?day|todya|tody|tdoay|toddate|2day)\\b"), f: () => `${d} = date('now', 'localtime')` },
      { re: W("\\b(?:yesterday|yestrday|yesteday|yesterdya|ystrday|yest)\\b"), f: () => `${d} = date('now', '-1 day', 'localtime')` },
      { re: W("\\b(?:to-?morrow|tommorow|tomorow|tomorrw|2morrow)\\b"), f: () => `${d} = date('now', '+1 day', 'localtime')` },
      // ---- rolling windows (a count of units back from now) ----
      { re: W("(?:in the |over the |within the |during the )?(?:last|past|previous|prior|recent) " + NUM + " days?\\b"), f: (m) => `${d} >= date('now', '-${count(m[1])} days', 'localtime')` },
      { re: W("(?:last|past|previous|prior) " + NUM + " weeks?\\b"), f: (m) => `${d} >= date('now', '-${count(m[1]) * 7} days', 'localtime')` },
      { re: W("(?:last|past|previous|prior) " + NUM + " months?\\b"), f: (m) => `${d} >= date('now', '-${count(m[1])} months', 'localtime')` },
      { re: W("(?:last|past|previous|prior) " + NUM + " years?\\b"), f: (m) => `${d} >= date('now', '-${count(m[1])} years', 'localtime')` },
      // ---- "since <anchor>" — must precede the calendar matchers below ----
      { re: W("\\bsince yesterday\\b"), f: () => `${d} >= date('now', '-1 day', 'localtime')` },
      { re: W("\\bsince last week\\b"), f: () => `${d} >= date('now', '-7 days', 'localtime')` },
      { re: W("\\bsince last month\\b"), f: () => `${d} >= date('now', 'start of month', '-1 month', 'localtime')` },
      // ---- rolling "past <unit>" (a trailing window, distinct from a calendar period) ----
      { re: W("\\b(?:in the |over the )?past week\\b"), f: () => `${d} >= date('now', '-7 days', 'localtime')` },
      { re: W("\\b(?:in the |over the )?past month\\b"), f: () => `${d} >= date('now', '-1 month', 'localtime')` },
      { re: W("\\b(?:in the |over the )?past year\\b"), f: () => `${d} >= date('now', '-1 year', 'localtime')` },
      { re: W("\\brecently\\b|\\blately\\b|\\bof late\\b|\\brecent\\b"), f: () => `${d} >= date('now', '-7 days', 'localtime')` },
      // ---- folksy / less-common spans (fortnight, decade, "the other day") ----
      { re: W("\\b(?:a |one )?fortnight ago\\b"), f: () => `${d} = date('now', '-14 days', 'localtime')` },
      { re: W("\\b(?:last|past|this|in the last) fortnight\\b"), f: () => `${d} >= date('now', '-14 days', 'localtime')` },
      { re: W("\\b(?:last|past|this|in the last) decade\\b"), f: () => `${d} >= date('now', '-10 years', 'localtime')` },
      { re: W("\\bthe other day\\b"), f: () => `${d} >= date('now', '-3 days', 'localtime')` },
      { re: W("\\ba (?:while|bit) (?:ago|back)\\b|\\bsome time ago\\b"), f: () => `${d} >= date('now', '-30 days', 'localtime')` },
      { re: W("\\bsince today\\b|\\bsince this morning\\b"), f: () => `${d} = date('now', 'localtime')` },
      // ---- the weekend (the most recent Saturday–Sunday) ----
      { re: W("\\b(?:over |on |during )?(?:the|this|last) weekend\\b|\\bthe weekend\\b"), f: () => `${d} >= date('now', 'weekday 6', '-7 days', 'localtime') AND ${d} < date('now', 'weekday 6', '-5 days', 'localtime')` },
      // ---- calendar previous period (closed at the current period's start) ----
      { re: W("\\b(?:last|previous|prior) week\\b"), f: () => `${d} >= date('now', 'weekday 0', '-13 days', 'localtime') AND ${d} < date('now', 'weekday 0', '-6 days', 'localtime')` },
      { re: W("\\b(?:last|previous|prior) month\\b"), f: () => `${d} >= date('now', 'start of month', '-1 month', 'localtime') AND ${d} < date('now', 'start of month', 'localtime')` },
      { re: W("\\b(?:last|previous|prior) (?:quarter|qtr)\\b"), f: () => `${d} >= ${qPrevLo} AND ${d} < ${qStart}` },
      { re: W("\\b(?:last|previous|prior) year\\b"), f: () => `${d} >= date('now', 'start of year', '-1 year', 'localtime') AND ${d} < date('now', 'start of year', 'localtime')` },
      // ---- current calendar period, including *-to-date aliases ----
      { re: W("\\bthis week\\b|\\bthus week\\b|\\bweek to date\\b|\\bwtd\\b|\\bso far this week\\b"), f: () => `${d} >= date('now', 'weekday 0', '-6 days', 'localtime')` },
      { re: W("\\bthis month\\b|\\bmonth to date\\b|\\bmtd\\b|\\bso far this month\\b"), f: () => `${d} >= date('now', 'start of month', 'localtime')` },
      { re: W("\\bthis (?:quarter|qtr)\\b|\\bquarter to date\\b|\\bqtd\\b"), f: () => `${d} >= ${qStart}` },
      { re: W("\\bthis year\\b|\\byear to date\\b|\\bytd\\b|\\bso far this year\\b"), f: () => `${d} >= date('now', 'start of year', 'localtime')` },
      // ---- bare single day ("today") — last, so phrases above win first ----
      { re: W("\\btoday\\b"), f: () => `${d} = date('now', 'localtime')` }
    ];
    const weekdayEq = function(n) {
      const back = `((CAST(strftime('%w','now','localtime') AS INTEGER) - ${n} + 7) % 7)`;
      return `${d} = date('now', '-' || ${back} || ' days', 'localtime')`;
    };
    const WEEKDAYS = [
      [0, "sun(?:day)?"],
      [1, "mon(?:day)?"],
      [2, "tue(?:s|sday)?"],
      [3, "wed(?:nesday|s)?"],
      [4, "thu(?:r|rs|rsday)?"],
      [5, "fri(?:day)?"],
      [6, "sat(?:urday)?"]
    ];
    const weekdayMatchers = WEEKDAYS.map(function(wd) {
      return { re: W("\\b(?:on |last |this |past )?(?:" + wd[1] + ")\\b"), f: function() {
        return weekdayEq(wd[0]);
      } };
    });
    const monthRange = function(n) {
      const back = `((CAST(strftime('%m','now','localtime') AS INTEGER) - ${n} + 12) % 12)`;
      const lo = `date('now', 'start of month', '-' || ${back} || ' months', 'localtime')`;
      const hi = `date('now', 'start of month', '-' || ${back} || ' months', '+1 month', 'localtime')`;
      return `${d} >= ${lo} AND ${d} < ${hi}`;
    };
    const MONTHS = [
      [1, "jan(?:uary)?"],
      [2, "feb(?:ruary)?"],
      [3, "mar(?:ch)?"],
      [4, "apr(?:il)?"],
      [5, "may"],
      [6, "jun(?:e)?"],
      [7, "jul(?:y)?"],
      [8, "aug(?:ust)?"],
      [9, "sep(?:t|tember)?"],
      [10, "oct(?:ober)?"],
      [11, "nov(?:ember)?"],
      [12, "dec(?:ember)?"]
    ];
    const monthMatchers = MONTHS.map(function(mo) {
      return { re: W("\\b(?:in|during|throughout|this|last|month of|back in|since|over|for)\\s+(?:" + mo[1] + ")\\b"), f: function() {
        return monthRange(mo[0]);
      } };
    });
    const yearMatchers = [
      { re: W("\\b(?:in|during|throughout)\\s+((?:19|20)\\d{2})\\b"), f: (m) => `${d} >= '${m[1]}-01-01' AND ${d} < '${+m[1] + 1}-01-01'` },
      { re: W("\\bsince\\s+((?:19|20)\\d{2})\\b"), f: (m) => `${d} >= '${m[1]}-01-01'` },
      { re: W("\\b(?:before|prior to|earlier than)\\s+((?:19|20)\\d{2})\\b"), f: (m) => `${d} < '${m[1]}-01-01'` },
      { re: W("\\b(?:after|since the end of)\\s+((?:19|20)\\d{2})\\b"), f: (m) => `${d} >= '${+m[1] + 1}-01-01'` },
      { re: W("\\bq([1-4])\\b"), f: (m) => `${d} >= date('now', 'start of year', '${(+m[1] - 1) * 3} months', 'localtime') AND ${d} < date('now', 'start of year', '${+m[1] * 3} months', 'localtime')` }
    ];
    const compactWindow = function(n, unit) {
      const u = unit.toLowerCase();
      if (/^(?:h|hr|hrs|hour)/.test(u)) return `${dt} >= datetime('now', '-${n} hours', 'localtime')`;
      if (/^min/.test(u)) return `${dt} >= datetime('now', '-${n} minutes', 'localtime')`;
      if (/^(?:w|wk|week)/.test(u)) return `${d} >= date('now', '-${n * 7} days', 'localtime')`;
      if (/^(?:mo|mth|month)/.test(u)) return `${d} >= date('now', '-${n} months', 'localtime')`;
      if (/^(?:y|yr|year)/.test(u)) return `${d} >= date('now', '-${n} years', 'localtime')`;
      return `${d} >= date('now', '-${n} days', 'localtime')`;
    };
    const compactMatchers = [
      // Digits required (not spelled-out numbers): otherwise "and" reads as
      // "an"+"d" → a bogus 1-day window. Compact tokens are always numeric anyway.
      { re: W("\\b(\\d+)\\s*(hours?|hrs?|h|minutes?|mins?|weeks?|wks?|w|months?|mths?|mos?|mo|years?|yrs?|y|days?|dys?|d)\\b(?:\\s*ago)?"), f: (m) => compactWindow(count(m[1]), m[2]) },
      { re: W("\\bt-?(\\d+)\\b"), f: (m) => `${d} >= date('now', '-${m[1]} days', 'localtime')` }
    ];
    matchers.splice(
      matchers.length - 1,
      0,
      ...weekdayMatchers,
      ...monthMatchers,
      ...yearMatchers,
      ...compactMatchers
    );
    const olderUnit = function(n, unit) {
      const u = unit.toLowerCase();
      if (/^h/.test(u)) return `${dt} < datetime('now', '-${n} hours', 'localtime')`;
      if (/^w/.test(u)) return `${d} < date('now', '-${n * 7} days', 'localtime')`;
      if (/^mo|^month/.test(u)) return `${d} < date('now', '-${n} months', 'localtime')`;
      if (/^y/.test(u)) return `${d} < date('now', '-${n} years', 'localtime')`;
      return `${d} < date('now', '-${n} days', 'localtime')`;
    };
    const UNIT = "(hours?|days?|weeks?|months?|years?)";
    const staleMatchers = [
      { re: W("\\b(?:not|never|hasn'?t|haven'?t|isn'?t|aren'?t|no)\\s+(?:been\\s+)?(?:updated|changed|modified|touched|edited|logged[ -]?in|signed[ -]?in|seen|used|accessed|visited)\\s+(?:in|for|within|since)\\s+(?:the\\s+(?:last|past)\\s+)?" + NUM + "\\s*" + UNIT), f: (m) => olderUnit(count(m[1]), m[2]) },
      { re: W("\\b(?:older than|more than|over)\\s+" + NUM + "\\s*" + UNIT + "(?:\\s+(?:old|ago))?"), f: (m) => olderUnit(count(m[1]), m[2]) },
      { re: W("\\b(?:stale|dormant|abandoned|untouched|idle|neglected|dead)\\s+(?:for\\s+)?" + NUM + "\\s*" + UNIT), f: (m) => olderUnit(count(m[1]), m[2]) },
      { re: W("\\b(?:stale|dormant|abandoned|untouched|idle|neglected)\\b"), f: () => `${d} < date('now', '-30 days', 'localtime')` },
      { re: W("\\b(?:not|never|hasn'?t|haven'?t)\\s+(?:been\\s+)?(?:updated|changed|touched|logged[ -]?in|seen|used)\\s+(?:in|for)\\s+(?:a\\s+)?(?:while|long time|ages)"), f: () => `${d} < date('now', '-90 days', 'localtime')` }
    ];
    matchers.unshift(...staleMatchers);
    for (let i = 0; i < matchers.length; i++) {
      const m = q.match(matchers[i].re);
      if (m) return { sql: matchers[i].f(m), phrase: m[0].trim() };
    }
    return { sql: "", phrase: "" };
  }
  function matchColumn(word, target) {
    const w = word.toLowerCase().trim();
    const wUnderscored = w.replace(/\s+/g, "_");
    return target.columns.find(function(c) {
      return c.name.toLowerCase() === wUnderscored;
    }) || target.columns.find(function(c) {
      return c.name.toLowerCase().replace(/_/g, " ") === w;
    }) || target.columns.find(function(c) {
      return c.name.toLowerCase().indexOf(wUnderscored) >= 0 || wUnderscored.indexOf(c.name.toLowerCase()) >= 0;
    }) || null;
  }
  function valueWhere(question, target) {
    const q = question;
    const conds = [];
    const NUMV = "(-?\\d+(?:\\.\\d+)?)";
    const VAL = `('[^']*'|"[^"]*"|[\\w@.+\\-]+)`;
    const lit = function(v) {
      return "'" + v.replace(/'/g, "''") + "'";
    };
    const unq = function(t) {
      if (!t) return "";
      const a = t.charAt(0), b = t.charAt(t.length - 1);
      if (a === "'" && b === "'" || a === '"' && b === '"') return t.slice(1, -1);
      return t;
    };
    const isNum = function(v) {
      return /^-?\d+(?:\.\d+)?$/.test(v);
    };
    const escRe = function(s) {
      return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    };
    const frag = function(name) {
      return "\\b" + escRe(name).replace(/_/g, "[_ ]?") + "\\b";
    };
    const likeVal = function(v, pre, post) {
      return "'" + pre + v.replace(/'/g, "''").replace(/([%_\\])/g, "\\$1") + post + "' ESCAPE '\\'";
    };
    const cols = target.columns.slice().sort(function(a, b) {
      return b.name.length - a.name.length;
    });
    for (let ci = 0; ci < cols.length; ci++) {
      const c = cols[ci];
      const cn = '"' + c.name + '"';
      const F = frag(c.name.toLowerCase());
      const after = function(body) {
        return new RegExp(F + body, "i");
      };
      let m;
      if (new RegExp("\\b(?:no|without|missing|lacking|lacks|has no|have no|with no|blank|empty)\\s+(?:an?\\s+)?" + F, "i").test(q) || after("\\s+(?:is|are)\\s+(?:null|empty|blank|missing|unset|not set|absent)").test(q)) {
        conds.push("(" + cn + " IS NULL OR " + cn + " = '')");
        continue;
      }
      if (m = q.match(after("\\s*(?:between|from)\\s*" + NUMV + "\\s*(?:and|to|[-\u2013])\\s*" + NUMV))) {
        conds.push(cn + " BETWEEN " + m[1] + " AND " + m[2]);
        continue;
      }
      const numericType = /int|real|num|float|double|dec/i.test(c.type || "");
      if (numericType && (new RegExp("\\bnegative\\s+" + F, "i").test(q) || after("\\s+(?:is|are)\\s+negative").test(q))) {
        conds.push(cn + " < 0");
        continue;
      }
      if (numericType && (new RegExp("\\bpositive\\s+" + F, "i").test(q) || after("\\s+(?:is|are)\\s+positive").test(q))) {
        conds.push(cn + " > 0");
        continue;
      }
      if (numericType && (new RegExp("\\bzero\\s+" + F, "i").test(q) || after("\\s+(?:is|are)\\s+zero").test(q))) {
        conds.push(cn + " = 0");
        continue;
      }
      if (m = q.match(after("\\s*(?:>=|=>|at least|no less than|minimum of|min of)\\s*" + NUMV))) {
        conds.push(cn + " >= " + m[1]);
        continue;
      }
      if (m = q.match(after("\\s*(?:<=|=<|at most|no more than|maximum of|max of|up to)\\s*" + NUMV))) {
        conds.push(cn + " <= " + m[1]);
        continue;
      }
      if (m = q.match(after("\\s*(?:>|greater than|more than|over|above|exceeds?|bigger than|larger than)\\s*" + NUMV))) {
        conds.push(cn + " > " + m[1]);
        continue;
      }
      if (m = q.match(after("\\s*(?:<|less than|fewer than|under|below|smaller than)\\s*" + NUMV))) {
        conds.push(cn + " < " + m[1]);
        continue;
      }
      if (m = q.match(after("\\s*(?:contains?|containing|like|matching|includes?)\\s*" + VAL))) {
        conds.push(cn + " LIKE " + likeVal(unq(m[1]), "%", "%"));
        continue;
      }
      if (m = q.match(after("\\s*(?:starts? with|begins? with|beginning with|prefixed with)\\s*" + VAL))) {
        conds.push(cn + " LIKE " + likeVal(unq(m[1]), "", "%"));
        continue;
      }
      if (m = q.match(after("\\s*(?:ends? with|ending with|suffixed with)\\s*" + VAL))) {
        conds.push(cn + " LIKE " + likeVal(unq(m[1]), "%", ""));
        continue;
      }
      if (m = q.match(after("\\s*(?:is not|isn'?t|are not|aren'?t|!=|<>|not equal to|not)\\s*" + VAL))) {
        const v = unq(m[1]);
        if (/^null$/i.test(v)) conds.push(cn + " IS NOT NULL");
        else if (/^(true|false)$/i.test(v)) conds.push(cn + " != " + (/true/i.test(v) ? "1" : "0"));
        else if (isNum(v)) conds.push(cn + " != " + v);
        else conds.push(cn + " != " + lit(v) + " COLLATE NOCASE");
        continue;
      }
      if (m = q.match(after("\\s*(?:==|=|is|are|equals?|equal to)\\s*" + VAL))) {
        const v = unq(m[1]);
        if (/^null$/i.test(v)) conds.push(cn + " IS NULL");
        else if (/^(true|false)$/i.test(v)) conds.push(cn + " = " + (/true/i.test(v) ? "1" : "0"));
        else if (isNum(v)) conds.push(cn + " = " + v);
        else conds.push(cn + " = " + lit(v) + " COLLATE NOCASE");
        continue;
      }
      if (new RegExp("\\b(?:has|have|having|with|non-?empty)\\s+(?:an?\\s+)?" + F, "i").test(q) || after("\\s+(?:is|are)\\s+(?:set|present|provided|not null|not empty)").test(q)) {
        conds.push("(" + cn + " IS NOT NULL AND " + cn + " != '')");
        continue;
      }
    }
    const boolish = function(c) {
      if (c.driftType === "bool") return true;
      if (c.driftType && c.driftType !== "int") return false;
      return /bool|int|tinyint/i.test(c.type || "") && /^is_|^has_|^can_|active|enabled?|disabled?|verified|visible|hidden|archived|deleted|locked|starred|pinned|favou?rite|public|private|completed?|done|paid|unread|read|sent|approved|rejected|blocked|banned/i.test(c.name);
    };
    for (let bi = 0; bi < target.columns.length; bi++) {
      const c = target.columns[bi];
      if (!boolish(c)) continue;
      const cn = '"' + c.name + '"';
      if (conds.some(function(x) {
        return x.indexOf(cn) >= 0;
      })) continue;
      const spaced = c.name.toLowerCase().replace(/_/g, " ");
      const stripped = c.name.toLowerCase().replace(/^(?:is|has|can)_/, "").replace(/_/g, " ");
      const lowerConds = conds.join(" ").toLowerCase();
      if (lowerConds.indexOf("'" + spaced + "'") >= 0 || lowerConds.indexOf("'" + stripped + "'") >= 0) continue;
      const vAlt = (stripped !== spaced ? [spaced, stripped] : [spaced]).map(escRe).join("|");
      const neg = new RegExp("\\b(?:not|non-?|isn'?t|aren'?t)\\s+(?:" + vAlt + ")\\b|\\b(?:in|un|non)(?:" + vAlt + ")\\b", "i");
      const pos = new RegExp("\\b(?:" + vAlt + ")\\b", "i");
      if (neg.test(q)) conds.push(cn + " = 0");
      else if (pos.test(q)) conds.push(cn + " = 1");
    }
    const nameCol = target.columns.find(function(c) {
      return /name|title|label/i.test(c.name) && /char|text|clob|string|varchar/i.test(c.type || "text");
    });
    let nm;
    if (nameCol && (nm = q.match(new RegExp("\\b(?:named|called|search(?:ing)? for|look(?:ing)? up|lookup)\\s+" + VAL, "i")))) {
      const nv = unq(nm[1]);
      const tnLower = target.name.toLowerCase();
      if (nv && !isNum(nv) && nv.toLowerCase() !== tnLower && nv.toLowerCase() !== tnLower.replace(/s$/, "")) {
        conds.push('"' + nameCol.name + '" LIKE ' + likeVal(nv, "%", "%"));
      }
    }
    if (/\btest\s+(?:account|accounts|data|user|users|record|records|entr|email|emails|row|rows)\b/i.test(q)) {
      const tcols = target.columns.filter(function(c) {
        return /name|email|title|label|user|login|handle/i.test(c.name) && /char|text|clob|string|varchar/i.test(c.type || "text");
      });
      if (tcols.length) conds.push("(" + tcols.map(function(c) {
        return '"' + c.name + `" LIKE '%test%'`;
      }).join(" OR ") + ")");
    }
    const optCol = target.columns.find(function(c) {
      return /bool|int/i.test(c.type || "") && /subscrib|opt[_-]?in|optin|consent|newsletter|marketing/i.test(c.name);
    });
    if (optCol && !conds.some(function(x) {
      return x.indexOf('"' + optCol.name + '"') >= 0;
    })) {
      if (/\b(?:unsubscribed|opted[ -]?out|opt[ -]?out|not subscribed|no consent|without consent)\b/i.test(q)) conds.push('"' + optCol.name + '" = 0');
      else if (/\b(?:subscribed|opted[ -]?in|opt[ -]?in|consented|on the (?:mailing|email) list|newsletter signups?)\b/i.test(q)) conds.push('"' + optCol.name + '" = 1');
    }
    return conds;
  }
  function orderClause(q, target) {
    const dateCol = recencyColumn(target);
    const textCol = target.columns.find(function(c) {
      return /name|title|label|email/i.test(c.name);
    }) || target.columns.find(function(c) {
      return /char|text|clob/i.test(c.type || "");
    });
    let m;
    if ((m = q.match(/\b(?:order|sort)(?:ed)?\s+by\s+([a-z0-9_ ]+?)(?:\s+(asc|ascending|desc|descending|high to low|low to high))?\s*$/i)) || (m = q.match(/\b(?:order|sort)(?:ed)?\s+by\s+([a-z0-9_]+)(?:\s+(asc|ascending|desc|descending))?/i))) {
      const col = matchColumn(m[1], target);
      if (col) {
        const desc = /desc|high to low/i.test(m[2] || "");
        return ' ORDER BY "' + col.name + '"' + (desc ? " DESC" : " ASC");
      }
    }
    if (dateCol && /\b(?:newest|most recent|latest|recent)\s+first\b/i.test(q)) return ' ORDER BY "' + dateCol.name + '" DESC';
    if (dateCol && /\b(?:oldest|earliest)\s+first\b/i.test(q)) return ' ORDER BY "' + dateCol.name + '" ASC';
    if (textCol && /\breverse alphabetical\b|\bz\s*(?:-|to)\s*a\b/i.test(q)) return ' ORDER BY "' + textCol.name + '" DESC';
    if (textCol && /\balphabetical\b|\ba\s*(?:-|to)\s*z\b/i.test(q)) return ' ORDER BY "' + textCol.name + '" ASC';
    if (m = q.match(/\blongest\s+([a-z0-9_]+)/i)) {
      const col = matchColumn(m[1], target);
      if (col) return ' ORDER BY LENGTH("' + col.name + '") DESC';
    }
    if (m = q.match(/\bshortest\s+([a-z0-9_]+)/i)) {
      const col = matchColumn(m[1], target);
      if (col) return ' ORDER BY LENGTH("' + col.name + '") ASC';
    }
    if (/\b(?:top|first|bottom)\b/i.test(q) && (m = q.match(/\bby\s+([a-z0-9_]+)/i))) {
      const col = matchColumn(m[1], target);
      if (col) return ' ORDER BY "' + col.name + '"' + (/\bbottom\b/i.test(q) ? " ASC" : " DESC");
    }
    return "";
  }
  function limitFrom(q) {
    let m;
    if (m = q.match(/\b(?:top|first|limit|show|give me|return|fetch|head)\s+(\d+)\b/i)) return parseInt(m[1], 10);
    if (m = q.match(/\b(\d+)\s+(?:rows?|records?|results?|entries|items)\b/i)) return parseInt(m[1], 10);
    if (/\ba dozen\b/i.test(q)) return 12;
    if (/\ba handful\b/i.test(q)) return 5;
    if (/\ba few\b/i.test(q)) return 3;
    if (/\ba couple\b/i.test(q)) return 2;
    if (/\b(?:top|first|head)\b/i.test(q)) return 10;
    return null;
  }
  function isDateColumn(col) {
    if (col.driftType === "dateTime") return true;
    if (/date|time|timestamp/i.test(col.type || "")) return true;
    const name = col.name;
    if (/date|time|timestamp|stamp|datetime|mtime|ctime|created|updated|modified|changed|edited|published|posted|expir|birth|\bdob\b|_at\b|_on\b/i.test(name)) return true;
    return /[a-z](At|Date|Time|Timestamp)$/.test(name);
  }
  function recencyColumn(target) {
    return target.columns.find(function(c) {
      return /creat|updat|modif|edit|chang|_at\b/i.test(c.name);
    }) || target.columns.find(isDateColumn);
  }
  function singularize(n) {
    if (/ies$/.test(n)) return n.replace(/ies$/, "y");
    if (/(ses|xes|zes|ches|shes)$/.test(n)) return n.replace(/es$/, "");
    if (/s$/.test(n) && !/ss$/.test(n)) return n.replace(/s$/, "");
    return n;
  }
  var REL_COUNT_WORDS = {
    a: 1,
    an: 1,
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    couple: 2,
    few: 3,
    several: 5
  };
  function numFromToken(tok) {
    if (!tok) return 1;
    const t = tok.toLowerCase().replace(/\s+of$/, "").trim();
    if (/^\d+$/.test(t)) return parseInt(t, 10);
    return REL_COUNT_WORDS[t] != null ? REL_COUNT_WORDS[t] : 1;
  }
  function relationshipWhere(q, target, meta) {
    const edges = meta.foreignKeys || [];
    if (edges.length === 0) return [];
    const tn = '"' + target.name + '"';
    const conds = [];
    const seen = {};
    const escRe = function(s) {
      return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    };
    const NUM = "(\\d+|an?|one|two|three|four|five|six|seven|eight|nine|ten|couple(?: of)?|few|several)";
    const nameAlt = function(table) {
      const n = table.toLowerCase();
      const singular = singularize(n);
      return singular !== n ? escRe(n) + "|" + escRe(singular) : escRe(n);
    };
    const children = edges.filter(function(e) {
      return e.toTable === target.name;
    }).map(function(e) {
      return { table: e.fromTable, fkCol: e.fromColumn, pkCol: e.toColumn };
    });
    const parents = edges.filter(function(e) {
      return e.fromTable === target.name;
    }).map(function(e) {
      return { table: e.toTable, fkCol: e.fromColumn, pkCol: e.toColumn };
    });
    for (let i = 0; i < children.length; i++) {
      const c = children[i];
      if (seen[c.table]) continue;
      const alt = nameAlt(c.table);
      if (!new RegExp("\\b(?:" + alt + ")\\b", "i").test(q)) continue;
      const selfRef = c.table === target.name;
      const from = selfRef ? '"' + c.table + '" AS rel' : '"' + c.table + '"';
      const al = selfRef ? "rel" : '"' + c.table + '"';
      const corr = al + '."' + c.fkCol + '" = ' + tn + '."' + c.pkCol + '"';
      const countSub = "(SELECT COUNT(*) FROM " + from + " WHERE " + corr + ")";
      const existsSub = "EXISTS (SELECT 1 FROM " + from + " WHERE " + corr + ")";
      const notExists = "NOT EXISTS (SELECT 1 FROM " + from + " WHERE " + corr + ")";
      const W = function(body) {
        return new RegExp(body, "i");
      };
      let m;
      if (m = q.match(W("\\b(?:with|having)\\s+(?:more than|over)\\s+" + NUM + "\\s+(?:" + alt + ")\\b"))) {
        conds.push(countSub + " > " + numFromToken(m[1]));
      } else if (m = q.match(W("\\b(?:with|having)\\s+at least\\s+" + NUM + "\\s+(?:" + alt + ")\\b"))) {
        conds.push(countSub + " >= " + numFromToken(m[1]));
      } else if (W("\\bwithout\\s+(?:any\\s+)?(?:" + alt + ")\\b").test(q) || W("\\b(?:with|having)\\s+no\\s+(?:" + alt + ")\\b").test(q)) {
        conds.push(notExists);
      } else if (W("\\b(?:with|having)\\s+(?:a|an|any|some|one|at least one|one or more)\\s+(?:" + alt + ")\\b").test(q)) {
        conds.push(existsSub);
      } else if (m = q.match(W("\\b(?:with|having)\\s+(?:exactly\\s+)?(\\d+)\\s+(?:" + alt + ")\\b"))) {
        conds.push(countSub + " = " + m[1]);
      } else {
        continue;
      }
      seen[c.table] = true;
    }
    for (let i = 0; i < parents.length; i++) {
      const p = parents[i];
      if (seen[p.table]) continue;
      const alt = nameAlt(p.table);
      if (!new RegExp("\\b(?:" + alt + ")\\b", "i").test(q)) continue;
      const fk = tn + '."' + p.fkCol + '"';
      const W = function(body) {
        return new RegExp(body, "i");
      };
      if (W("\\b(?:without|with no|having no|missing|no)\\s+(?:a |an )?(?:" + alt + ")\\b").test(q) || W("\\borphan(?:ed)?\\b").test(q)) {
        conds.push(fk + " IS NULL");
        seen[p.table] = true;
      } else if (W("\\b(?:with|has|having|linked to|belongs? to|attached to|in)\\s+(?:a |an |its )?(?:" + alt + ")\\b").test(q)) {
        conds.push(fk + " IS NOT NULL");
        seen[p.table] = true;
      }
    }
    if (children.length > 0 && conds.length === 0 && /\brelationship/i.test(q)) {
      const counts = children.map(function(c) {
        const corr = '"' + c.table + '"."' + c.fkCol + '" = ' + tn + '."' + c.pkCol + '"';
        return '(SELECT COUNT(*) FROM "' + c.table + '" WHERE ' + corr + ")";
      });
      const sum = counts.join(" + ");
      const anyExists = children.map(function(c) {
        const corr = '"' + c.table + '"."' + c.fkCol + '" = ' + tn + '."' + c.pkCol + '"';
        return 'EXISTS (SELECT 1 FROM "' + c.table + '" WHERE ' + corr + ")";
      }).join(" OR ");
      let m;
      if (m = q.match(new RegExp("\\b(?:more than|over)\\s+" + NUM + "\\s+relationship", "i"))) conds.push("(" + sum + ") > " + numFromToken(m[1]));
      else if (m = q.match(new RegExp("\\bat least\\s+" + NUM + "\\s+relationship", "i"))) conds.push("(" + sum + ") >= " + numFromToken(m[1]));
      else if (/\b(?:no|without|zero)\s+relationship/i.test(q)) conds.push("NOT (" + anyExists + ")");
      else if (/\b(?:a|any|some|with)\s+relationship/i.test(q)) conds.push("(" + anyExists + ")");
    }
    return conds;
  }
  function idTargetNoun(colName) {
    if (/^id$/i.test(colName)) return null;
    const m = colName.match(/^(.+?)_?id$/i);
    return m && m[1] ? m[1].replace(/_+$/, "") : null;
  }
  function inferForeignKeys(meta) {
    const tables = meta.tables || [];
    const edges = (meta.foreignKeys || []).slice();
    const keyOf = function(e) {
      return e.fromTable + "." + e.fromColumn + "->" + e.toTable + "." + e.toColumn;
    };
    const seen = {};
    edges.forEach(function(e) {
      seen[keyOf(e)] = true;
    });
    const add = function(fromTable, fromColumn, toTable, toColumn) {
      if (fromTable === toTable && fromColumn === toColumn) return;
      const e = { fromTable, fromColumn, toTable, toColumn };
      if (!seen[keyOf(e)]) {
        seen[keyOf(e)] = true;
        edges.push(e);
      }
    };
    const pkOf = function(t) {
      const pk = t.columns.find(function(c) {
        return c.pk;
      });
      return pk ? pk.name : "id";
    };
    for (let bi = 0; bi < tables.length; bi++) {
      const b = tables[bi];
      for (let ci = 0; ci < b.columns.length; ci++) {
        const noun = idTargetNoun(b.columns[ci].name);
        if (!noun) continue;
        const nl = noun.toLowerCase();
        const parent = tables.find(function(t) {
          const tn = t.name.toLowerCase();
          return tn === nl || singularize(tn) === nl || tn === nl + "s";
        });
        if (parent && parent.name !== b.name) add(b.name, b.columns[ci].name, parent.name, pkOf(parent));
      }
    }
    const idCols = {};
    for (let bi = 0; bi < tables.length; bi++) {
      const b = tables[bi];
      for (let ci = 0; ci < b.columns.length; ci++) {
        const cn = b.columns[ci].name;
        if (!/uuid/i.test(cn)) continue;
        (idCols[cn] = idCols[cn] || []).push(b.name);
      }
    }
    for (const col in idCols) {
      const carriers = idCols[col];
      if (carriers.length < 2) continue;
      const colLower = col.toLowerCase();
      let owner = null;
      let ownerLen = 0;
      for (let i = 0; i < carriers.length; i++) {
        const s = singularize(carriers[i].toLowerCase());
        if (colLower.indexOf(s) >= 0 && s.length > ownerLen) {
          owner = carriers[i];
          ownerLen = s.length;
        }
      }
      if (!owner) continue;
      for (let i = 0; i < carriers.length; i++) {
        if (carriers[i] !== owner) add(carriers[i], col, owner, col);
      }
    }
    return edges;
  }
  function pickHubTable(cands, meta) {
    const fks = meta.foreignKeys || [];
    const inbound = function(t) {
      let n = 0;
      for (let i = 0; i < fks.length; i++) if (fks[i].toTable === t.name) n++;
      return n;
    };
    return cands.slice().sort(function(a, b) {
      const fa = inbound(a), fb = inbound(b);
      if (fb !== fa) return fb - fa;
      const ra = a.rowCount || 0, rb = b.rowCount || 0;
      if (rb !== ra) return rb - ra;
      return a.name.localeCompare(b.name);
    })[0];
  }
  function resolveTable(q, meta) {
    const tables = meta.tables || [];
    const all = tables.map(function(t) {
      return t.name;
    });
    const esc3 = function(s) {
      return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    };
    const named = tables.filter(function(t) {
      const n = t.name.toLowerCase();
      const singular = singularize(n);
      return new RegExp("\\b" + esc3(n) + "\\b", "i").test(q) || singular !== n && new RegExp("\\b" + esc3(singular) + "\\b", "i").test(q);
    });
    if (named.length === 1) return { table: named[0], confidence: "named", candidates: all };
    if (named.length > 1) {
      const firstIndex = function(t) {
        const n = t.name.toLowerCase();
        const s = singularize(n);
        const i1 = q.search(new RegExp("\\b" + esc3(n) + "\\b", "i"));
        const i2 = s !== n ? q.search(new RegExp("\\b" + esc3(s) + "\\b", "i")) : -1;
        const found = [i1, i2].filter(function(x) {
          return x >= 0;
        });
        return found.length ? Math.min.apply(null, found) : 1e9;
      };
      const earliest = named.slice().sort(function(a, b) {
        return firstIndex(a) - firstIndex(b);
      })[0];
      return { table: earliest, confidence: "ambiguous", candidates: named.map(function(t) {
        return t.name;
      }) };
    }
    if (tables.length === 1) return { table: tables[0], confidence: "only", candidates: all };
    return { table: pickHubTable(tables, meta), confidence: "guess", candidates: all };
  }
  var WAKE_NAME = "(?:sa?ropa|saropah|saroppa|saroper|sarope|sarropa|seropa|siropa|soropa|zaropa|saraopa|sropa|sarppa|sa\\s?ropa|sar\\s?opa|sara\\s?opa|say\\s?ropa)";
  var WAKE_RE = new RegExp(
    "^\\s*(?:(?:ok(?:ay)?|hey|hi|hello|yo|hey there|um+|uh+|please)[\\s,]*)*" + WAKE_NAME + "(?:[\\s,.:!?-]+|$)",
    "i"
  );
  function stripWakePhrase(question) {
    const m = question.match(WAKE_RE);
    if (!m) return { question, wake: false };
    return { question: question.slice(m[0].length).trim(), wake: true };
  }
  var REFINE_LEAD_RE = /^\s*(?:and\s+)?(?:now|also|plus|additionally|moreover|furthermore|then|just|only|narrow(?:\s+(?:it|down))?(?:\s+to)?|filter(?:\s+to)?|restrict(?:\s+to)?|refine(?:\s+to)?)\b[,:]?\s+/i;
  var REFINE_AND_RE = /^\s*and\s+/i;
  function detectRefinement(input) {
    const lead = input.match(REFINE_LEAD_RE);
    if (lead) {
      const fragment = input.slice(lead[0].length).trim();
      if (fragment.length > 0) return { isRefinement: true, fragment };
    }
    const and = input.match(REFINE_AND_RE);
    if (and) {
      const fragment = input.slice(and[0].length).trim();
      if (fragment.length > 0) return { isRefinement: true, fragment };
    }
    return { isRefinement: false, fragment: input.trim() };
  }
  function combineRefinement(base, fragment) {
    return (base.trim() + " " + fragment.trim()).replace(/\s+/g, " ").trim();
  }
  var NL_CMD_CLEAR_RE = /^\s*(?:clear(?:\s+it|\s+that)?|start\s+(?:again|over)|begin\s+again|reset|wipe\s+it|scratch\s+that|never\s*mind)\s*[.!?]?\s*$/i;
  var NL_CMD_RUN_RE = /^\s*(?:run(?:\s+it|\s+that)?\s+again|run\s+again|do\s+it\s+again|try\s+again|once\s+more|again)\s*[.!?]?\s*$/i;
  var TEMPORAL_SWAP_PHRASES = [
    "the day before yesterday",
    "year to date",
    "month to date",
    "week to date",
    "this morning",
    "this afternoon",
    "this evening",
    "tonight",
    "last night",
    "the weekend",
    "this week",
    "last week",
    "previous week",
    "this month",
    "last month",
    "previous month",
    "this quarter",
    "last quarter",
    "previous quarter",
    "this year",
    "last year",
    "previous year",
    "today",
    "yesterday",
    "tomorrow"
  ];
  var TEMPORAL_SWAP_RE = new RegExp(
    "\\b(" + TEMPORAL_SWAP_PHRASES.map(function(p) {
      return p.replace(/ /g, "\\s+");
    }).join("|") + ")\\b",
    "i"
  );
  function detectNlKeyword(input) {
    const raw = String(input || "").trim();
    if (!raw) return null;
    if (NL_CMD_CLEAR_RE.test(raw)) return { kind: "clear" };
    if (NL_CMD_RUN_RE.test(raw)) return { kind: "run" };
    const cleaned = raw.toLowerCase().replace(/^(?:and\s+|so\s+|ok(?:ay)?\s+)?(?:what|how)\s+about\s+/, "").replace(/^(?:and|also|then|now|show\s+me)\s+/, "").replace(/[?.!,]+$/, "").trim();
    const m = cleaned.match(TEMPORAL_SWAP_RE);
    if (!m) return null;
    const residue = cleaned.replace(TEMPORAL_SWAP_RE, "").replace(/\s+/g, " ").trim();
    return residue === "" ? { kind: "temporalSwap", phrase: m[1].toLowerCase() } : null;
  }
  function applyTemporalSwap(base, newPhrase) {
    if (!TEMPORAL_SWAP_RE.test(base)) return null;
    return base.replace(TEMPORAL_SWAP_RE, newPhrase).replace(/\s+/g, " ").trim();
  }
  function narrateAnswer(r, value, totalCount) {
    const table = r.table || vt("viewer.sql.narrate.fallback.rows");
    const qual = r.qualifier ? " " + r.qualifier : "";
    const col = r.aggColumn ? r.aggColumn.replace(/_/g, " ") : vt("viewer.sql.narrate.fallback.value");
    const n = function(x) {
      return x == null ? "0" : x.toLocaleString("en-US");
    };
    switch (r.answerKind) {
      case "count": {
        const verb = qual && r.answerVerb && r.answerVerb !== "has" ? r.answerVerb : "has";
        const verbKey = verb === "added" ? "viewer.sql.narrate.count.added" : verb === "changed" ? "viewer.sql.narrate.count.changed" : "viewer.sql.narrate.count.has";
        return vt(verbKey, n(value), table, qual);
      }
      case "sum":
        return vt("viewer.sql.narrate.sum", col, table, qual, n(value));
      case "avg":
        return vt("viewer.sql.narrate.avg", col, table, qual, n(value));
      case "max":
        return vt("viewer.sql.narrate.max", col, table, qual, n(value));
      case "min":
        return vt("viewer.sql.narrate.min", col, table, qual, n(value));
      case "distinct":
        return vt(totalCount === 1 ? "viewer.sql.narrate.distinct.one" : "viewer.sql.narrate.distinct.many", n(totalCount), col);
      case "duplicate":
        return vt(totalCount === 1 ? "viewer.sql.narrate.duplicate.one" : "viewer.sql.narrate.duplicate.many", n(totalCount), col);
      case "group":
        return vt(totalCount === 1 ? "viewer.sql.narrate.group.one" : "viewer.sql.narrate.group.many", n(totalCount), table, qual);
      case "rows":
      case "latest":
      case "oldest":
      default:
        return vt("viewer.sql.narrate.found", n(totalCount), table, qual);
    }
  }
  function sqlSlug(text) {
    return String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  }
  var COUNT_INTENT_RE = /how many|\bcount\b|total number|number of/i;
  var WINDOW_SPLIT_RE = /\s+and\s+|\s*,\s*|\s+vs\.?\s+|\s+versus\s+|\s+compared\s+(?:to|with)\s+/i;
  function multiWindowCount(q, target, baseConds) {
    if (!COUNT_INTENT_RE.test(q)) return null;
    if (!WINDOW_SPLIT_RE.test(q)) return null;
    const col = resolveDateColumn(q, target);
    if (!col) return null;
    const segments = q.split(WINDOW_SPLIT_RE);
    const windows = [];
    const seenSql = {};
    for (let i = 0; i < segments.length; i++) {
      const tw = temporalWhere(segments[i], target, col);
      if (tw.sql && !seenSql[tw.sql]) {
        seenSql[tw.sql] = true;
        windows.push(tw);
      }
    }
    if (windows.length < 2) return null;
    const where = baseConds.length ? " WHERE " + baseConds.join(" AND ") : "";
    const usedAlias = {};
    const cols = windows.map(function(w) {
      let alias = sqlSlug(w.phrase) || "window";
      if (usedAlias[alias]) alias = alias + "_" + ++usedAlias[alias];
      else usedAlias[alias] = 1;
      return "SUM(CASE WHEN " + w.sql + " THEN 1 ELSE 0 END) AS " + alias;
    });
    const sql = "SELECT " + cols.join(", ") + ' FROM "' + target.name + '"' + where;
    return { sql, windows };
  }
  function detectTimeBucket(q) {
    if (/\b(?:daily|by day|per day|each day|every day|day[- ]by[- ]day|day[- ]over[- ]day)\b/i.test(q)) return "day";
    if (/\b(?:weekly|by week|per week|each week|every week|week[- ]by[- ]week|week[- ]over[- ]week)\b/i.test(q)) return "week";
    if (/\b(?:monthly|by month|per month|each month|every month|month[- ]by[- ]month|month[- ]over[- ]month)\b/i.test(q)) return "month";
    if (/\b(?:yearly|annually|annual|by year|per year|each year|every year|year[- ]by[- ]year|year[- ]over[- ]year)\b/i.test(q)) return "year";
    return null;
  }
  function timeBucketSeries(q, target, bucket, baseConds) {
    const col = resolveDateColumn(q, target);
    if (!col) return null;
    const rowDay = dayExpr(col, "m");
    const cfg = {
      day: {
        seed: "date('now', 'localtime')",
        step: "'-1 day'",
        n: 30,
        map: rowDay
      },
      week: {
        // SQLite 'weekday 0' is the next Sunday; '-6 days' backs it up to Monday,
        // so each bucket is the Monday that opens an ISO-style week.
        seed: "date('now', 'weekday 0', '-6 days', 'localtime')",
        step: "'-7 days'",
        n: 12,
        map: `date(${rowDay}, 'weekday 0', '-6 days')`
      },
      month: {
        seed: "date('now', 'start of month', 'localtime')",
        step: "'-1 month'",
        n: 12,
        map: `date(${rowDay}, 'start of month')`
      },
      year: {
        seed: "date('now', 'start of year', 'localtime')",
        step: "'-1 year'",
        n: 5,
        map: `date(${rowDay}, 'start of year')`
      }
    };
    const c = cfg[bucket];
    const verb = BORN_VERB.test(q) ? "added" : EDIT_VERB.test(q) ? "changed" : null;
    const countAlias = verb ? (sqlSlug(target.name) || "rows") + "_" + verb : "count";
    const onExtra = baseConds.length ? " AND " + baseConds.join(" AND ") : "";
    const sql = "WITH RECURSIVE calendar(bucket) AS (\n  SELECT " + c.seed + "\n  UNION ALL\n  SELECT date(bucket, " + c.step + ") FROM calendar LIMIT " + c.n + "\n)\nSELECT c.bucket AS " + bucket + '_start, COUNT(m."' + col.name + '") AS ' + countAlias + '\nFROM calendar c\nLEFT JOIN "' + target.name + '" m ON ' + c.map + " = c.bucket" + onExtra + "\nGROUP BY c.bucket\nORDER BY c.bucket DESC";
    return { sql, col };
  }
  function nlToSql(question, meta, opts) {
    const wakeStrip = stripWakePhrase(question);
    question = wakeStrip.question;
    const wake = wakeStrip.wake;
    const q = question.toLowerCase().trim();
    const tables = meta.tables || [];
    if (tables.length === 0) return { sql: null, error: vt("viewer.sql.nl.noTables"), wake };
    if (wake && !q) return { sql: null, wake: true };
    let answerVerb = "has";
    if (BORN_VERB.test(q)) answerVerb = "added";
    else if (EDIT_VERB.test(q)) answerVerb = "changed";
    meta = { tables, foreignKeys: inferForeignKeys(meta) };
    let resolved = resolveTable(q, meta);
    if (opts && opts.table) {
      const forced = tables.find(function(t) {
        return t.name === opts.table;
      });
      if (forced) resolved = { table: forced, confidence: "named", candidates: resolved.candidates };
    }
    const target = resolved.table;
    const wb = function(s) {
      return new RegExp("\\b" + s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i");
    };
    const mentioned = target.columns.filter(function(c) {
      const n = c.name.toLowerCase();
      return wb(n.replace(/_/g, " ")).test(q) || wb(n).test(q);
    });
    const selectCols = mentioned.length > 0 ? mentioned.map(function(c) {
      return '"' + c.name + '"';
    }).join(", ") : "*";
    let sql = "";
    const tn = '"' + target.name + '"';
    const conds = [];
    const tw = temporalWhere(q, target);
    if (tw.sql) conds.push(tw.sql);
    const nonTemporalConds = [];
    const vw = valueWhere(question, target);
    for (let i = 0; i < vw.length; i++) nonTemporalConds.push(vw[i]);
    const rw = relationshipWhere(q, target, meta);
    for (let i = 0; i < rw.length; i++) nonTemporalConds.push(rw[i]);
    for (let i = 0; i < nonTemporalConds.length; i++) conds.push(nonTemporalConds[i]);
    const where = conds.length ? " WHERE " + conds.join(" AND ") : "";
    const order = orderClause(q, target);
    const lim = limitFrom(q);
    const limClause = lim != null ? " LIMIT " + lim : "";
    const isGrouping = /group(?:ed)?\s+by|grouped by|\bper\s+\w+|broken down by|broken out by|segment(?:ed)?\s+by|split by|bucketed by|categori[sz]ed by|\bcount(?:s|ed)?\s+by|tally|distribution|histogram|frequency|breakdown|\bby\s+\w+/i.test(q) && !/(?:order|sort)(?:ed)?\s+by/i.test(q) && !/\b(?:top|first|bottom|longest|shortest)\b/i.test(q);
    const numericCol = function() {
      return mentioned.find(function(c) {
        return /int|real|num|float|double|dec/i.test(c.type);
      }) || target.columns.find(function(c) {
        return /int|real|num|float|double|dec/i.test(c.type);
      });
    };
    let answerKind = "rows";
    let aggColumn;
    const bucket = detectTimeBucket(q);
    if (bucket) {
      const series = timeBucketSeries(q, target, bucket, nonTemporalConds);
      if (series) {
        sql = series.sql;
        answerKind = "group";
      }
    }
    if (!sql) {
      const multi = multiWindowCount(q, target, nonTemporalConds);
      if (multi) {
        sql = multi.sql;
        answerKind = "rows";
      }
    }
    if (sql) {
    } else if (/how many|\bcount\b|total number|number of/i.test(q) && !isGrouping) {
      sql = "SELECT COUNT(*) FROM " + tn + where;
      answerKind = "count";
    } else if (/duplicate|repeated|dupe/i.test(q)) {
      const dupWord = q.match(/(?:duplicate|repeated|dupe)d?\s+([a-z0-9_]+)/i);
      const col = dupWord && matchColumn(dupWord[1], target) || mentioned[0] || target.columns.find(function(c) {
        return /name|email|title|slug|code/i.test(c.name);
      }) || target.columns[1] || target.columns[0];
      sql = 'SELECT "' + col.name + '", COUNT(*) AS count FROM ' + tn + where + ' GROUP BY "' + col.name + '" HAVING count > 1 ORDER BY count DESC' + limClause;
      answerKind = "duplicate";
      aggColumn = col.name;
    } else if (/average|avg|\bmean\b|typical|on average/i.test(q)) {
      const numCol = numericCol();
      if (numCol) {
        sql = 'SELECT AVG("' + numCol.name + '") FROM ' + tn + where;
        answerKind = "avg";
        aggColumn = numCol.name;
      } else {
        sql = "SELECT * FROM " + tn + where + " LIMIT 50";
      }
    } else if (/sum|total\b|altogether|combined|grand total|aggregate/i.test(q) && !/total number/i.test(q)) {
      const numCol = numericCol();
      if (numCol) {
        sql = 'SELECT SUM("' + numCol.name + '") FROM ' + tn + where;
        answerKind = "sum";
        aggColumn = numCol.name;
      } else {
        sql = "SELECT * FROM " + tn + where + " LIMIT 50";
      }
    } else if (/max|maximum|highest|largest|biggest|peak|topmost/i.test(q)) {
      const numCol = numericCol();
      if (numCol) {
        sql = 'SELECT MAX("' + numCol.name + '") FROM ' + tn + where;
        answerKind = "max";
        aggColumn = numCol.name;
      } else {
        sql = "SELECT * FROM " + tn + where + " ORDER BY 1 DESC LIMIT 1";
      }
    } else if (/\bmin\b|minimum|lowest|smallest/i.test(q)) {
      const numCol = numericCol();
      if (numCol) {
        sql = 'SELECT MIN("' + numCol.name + '") FROM ' + tn + where;
        answerKind = "min";
        aggColumn = numCol.name;
      } else {
        sql = "SELECT * FROM " + tn + where + " ORDER BY 1 ASC LIMIT 1";
      }
    } else if (/distinct|unique/i.test(q)) {
      const col = mentioned[0] || target.columns[1] || target.columns[0];
      sql = 'SELECT DISTINCT "' + col.name + '" FROM ' + tn + where + limClause;
      answerKind = "distinct";
      aggColumn = col.name;
    } else if (/latest|newest|most recent|last (\d+)/i.test(q)) {
      const dateCol = recencyColumn(target);
      const match = q.match(/last (\d+)/i);
      const rowLim = lim != null ? lim : match ? parseInt(match[1], 10) : 10;
      sql = "SELECT " + selectCols + " FROM " + tn + where + (dateCol ? ' ORDER BY "' + dateCol.name + '" DESC' : "") + " LIMIT " + rowLim;
      answerKind = "latest";
    } else if (/oldest|earliest|first (\d+)/i.test(q)) {
      const dateCol = recencyColumn(target);
      const match2 = q.match(/first (\d+)/i);
      const rowLim = lim != null ? lim : match2 ? parseInt(match2[1], 10) : 10;
      sql = "SELECT " + selectCols + " FROM " + tn + where + (dateCol ? ' ORDER BY "' + dateCol.name + '" ASC' : "") + " LIMIT " + rowLim;
      answerKind = "oldest";
    } else if (isGrouping) {
      const byMatch = q.match(/\b(?:by|per)\s+([a-z0-9_]+)/i);
      const groupCol = byMatch && matchColumn(byMatch[1], target) || mentioned[0] || target.columns[1] || target.columns[0];
      sql = 'SELECT "' + groupCol.name + '", COUNT(*) AS count FROM ' + tn + where + ' GROUP BY "' + groupCol.name + '" ORDER BY count DESC' + limClause;
      answerKind = "group";
      aggColumn = groupCol.name;
    } else {
      sql = "SELECT " + selectCols + " FROM " + tn + where + order + " LIMIT " + (lim != null ? lim : 50);
    }
    return {
      sql,
      table: target.name,
      confidence: resolved.confidence,
      candidates: resolved.candidates,
      wake,
      answerKind,
      answerVerb,
      qualifier: tw.phrase,
      aggColumn
    };
  }

  // assets/web/schema-meta.ts
  async function loadSchemaMeta() {
    if (schemaMeta) return schemaMeta;
    var r = await fetch("/api/schema/metadata?includeForeignKeys=1", authOpts());
    if (!r.ok) throw new Error(vt("viewer.schema.meta.loadFailed", r.status));
    var meta = await r.json();
    if (meta && Array.isArray(meta.tables) && !Array.isArray(meta.foreignKeys)) {
      var edges = [];
      for (var i = 0; i < meta.tables.length; i++) {
        var t = meta.tables[i];
        var fks = t && t.foreignKeys;
        if (Array.isArray(fks)) {
          for (var j = 0; j < fks.length; j++) {
            var fk = fks[j];
            if (fk && fk.toTable && fk.fromColumn && fk.toColumn) {
              edges.push({ fromTable: t.name, fromColumn: fk.fromColumn, toTable: fk.toTable, toColumn: fk.toColumn });
            }
          }
        }
      }
      meta.foreignKeys = edges;
    }
    if (meta && Array.isArray(meta.tables)) {
      meta.foreignKeys = inferForeignKeys(meta);
    }
    setSchemaMeta(meta);
    return schemaMeta;
  }

  // extension/src/query-builder/query-builder-core.ts
  function sqlLiteral(v) {
    if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
    if (typeof v === "boolean") return v ? "1" : "0";
    return `'${String(v).replace(/'/g, "''")}'`;
  }
  function canonicalJoinKey(join) {
    const a = `${join.leftTableId}.${join.leftColumn}`;
    const b = `${join.rightTableId}.${join.rightColumn}`;
    return [a, b].sort().join("=");
  }
  function renderSelectedColumn(sel, tableById2) {
    const table = tableById2.get(sel.tableId);
    if (!table) throw new Error("missing table for select");
    const ref = `"${table.alias}"."${sel.column}"`;
    if (!sel.aggregation) return ref;
    const fn = String(sel.aggregation).toUpperCase();
    const alias = sel.alias ?? `${fn.toLowerCase()}_${sel.column}`;
    return `${fn}(${ref}) AS "${alias}"`;
  }
  function renderJoin(join, tableById2) {
    const left = tableById2.get(join.leftTableId);
    const right = tableById2.get(join.rightTableId);
    if (!left || !right) throw new Error("join references unknown table");
    const jt = join.type === "LEFT" || join.type === "RIGHT" || join.type === "INNER" ? join.type : "INNER";
    return `${jt} JOIN "${right.baseTable}" AS "${right.alias}" ON "${right.alias}"."${join.rightColumn}" = "${left.alias}"."${join.leftColumn}"`;
  }
  function validateQueryModel(model) {
    const errors = [];
    const tableById2 = new Map(model.tables.map((t) => [t.id, t]));
    if (model.tables.length === 0) {
      errors.push("at least one table is required");
      return errors;
    }
    const aliases = model.tables.map((t) => t.alias);
    if (new Set(aliases).size !== aliases.length) {
      errors.push("table aliases must be unique");
    }
    if (model.limit !== null && (!Number.isInteger(model.limit) || model.limit <= 0)) {
      errors.push("limit must be a positive integer");
    }
    const missingTable = (id) => !tableById2.has(id);
    for (const join of model.joins) {
      if (missingTable(join.leftTableId) || missingTable(join.rightTableId)) {
        errors.push(`join ${join.id} references unknown table`);
      }
    }
    for (const sel of model.selectedColumns) {
      if (missingTable(sel.tableId)) errors.push(`selected column ${sel.column} references unknown table`);
    }
    for (const filter of model.filters) {
      if (missingTable(filter.tableId)) errors.push(`filter ${filter.id} references unknown table`);
      if (filter.operator === "IN" && (!filter.values || filter.values.length === 0)) {
        errors.push(`filter ${filter.id} IN list cannot be empty`);
      }
    }
    const seenJoinKeys = /* @__PURE__ */ new Set();
    for (const join of model.joins) {
      const key = canonicalJoinKey(join);
      if (seenJoinKeys.has(key)) {
        errors.push(`duplicate join detected (${join.id})`);
      }
      seenJoinKeys.add(key);
    }
    if (model.tables.length > 1) {
      const rootId = model.tables[0].id;
      const reachable = /* @__PURE__ */ new Set([rootId]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const j of model.joins) {
          if (reachable.has(j.leftTableId) && !reachable.has(j.rightTableId)) {
            reachable.add(j.rightTableId);
            grew = true;
          }
          if (reachable.has(j.rightTableId) && !reachable.has(j.leftTableId)) {
            reachable.add(j.leftTableId);
            grew = true;
          }
        }
      }
      for (const t of model.tables) {
        if (!reachable.has(t.id)) {
          errors.push(`table "${t.alias}" is not connected to the query root via JOINs`);
        }
      }
    }
    if (model.groupBy.length > 0) {
      const grouped = new Set(model.groupBy.map((g) => `${g.tableId}.${g.column}`));
      for (const sel of model.selectedColumns) {
        if (!sel.aggregation && !grouped.has(`${sel.tableId}.${sel.column}`)) {
          errors.push(`non-aggregated select "${sel.column}" must be in GROUP BY`);
        }
      }
    }
    return errors;
  }
  function renderQuerySql(model) {
    const errors = validateQueryModel(model);
    if (errors.length > 0) {
      throw new Error(`Invalid query model: ${errors.join("; ")}`);
    }
    const tableById2 = new Map(model.tables.map((t) => [t.id, t]));
    const parts = [];
    const selectCols = model.selectedColumns.map((c) => renderSelectedColumn(c, tableById2));
    parts.push(`SELECT ${selectCols.length > 0 ? selectCols.join(", ") : "*"}`);
    const root = model.tables[0];
    parts.push(`FROM "${root.baseTable}" AS "${root.alias}"`);
    for (const join of model.joins) {
      parts.push(renderJoin(join, tableById2));
    }
    if (model.filters.length > 0) {
      const where = model.filters.map((f, i) => {
        const table = tableById2.get(f.tableId);
        const ref = `"${table.alias}"."${f.column}"`;
        const prefix = i === 0 ? "WHERE" : f.conjunction || "AND";
        if (f.operator === "IS NULL" || f.operator === "IS NOT NULL") {
          return `${prefix} ${ref} ${f.operator}`;
        }
        if (f.operator === "IN") {
          const vals = f.values || [];
          return `${prefix} ${ref} IN (${vals.map(sqlLiteral).join(", ")})`;
        }
        if ("value" in f && f.value !== void 0) {
          return `${prefix} ${ref} ${f.operator} ${sqlLiteral(f.value)}`;
        }
        throw new Error(`Unexpected filter shape for operator: ${String(f.operator)}`);
      });
      parts.push(where.join("\n"));
    }
    if (model.groupBy.length > 0) {
      const clauses = model.groupBy.map((g) => {
        const table = tableById2.get(g.tableId);
        return `"${table.alias}"."${g.column}"`;
      });
      parts.push(`GROUP BY ${clauses.join(", ")}`);
    }
    if (model.orderBy.length > 0) {
      const clauses = model.orderBy.map((o) => {
        const table = tableById2.get(o.tableId);
        const dir = String(o.direction || "ASC").toUpperCase() === "DESC" ? "DESC" : "ASC";
        return `"${table.alias}"."${o.column}" ${dir}`;
      });
      parts.push(`ORDER BY ${clauses.join(", ")}`);
    }
    if (model.limit !== null) {
      parts.push(`LIMIT ${model.limit}`);
    }
    return parts.join("\n");
  }

  // extension/src/query-builder/query-builder-core-ops.ts
  function getWhereOpsForType(columnType) {
    const type = (columnType || "").toUpperCase();
    if (type === "TEXT" || type.indexOf("VARCHAR") >= 0 || type.indexOf("CHAR") >= 0) {
      return [
        { val: "LIKE", label: "contains" },
        { val: "=", label: "equals" },
        { val: "!=", label: "!=" },
        { val: "IS NULL", label: "is null" },
        { val: "IS NOT NULL", label: "is not null" },
        { val: "IN", label: "IN (comma list)" }
      ];
    }
    if (type === "INTEGER" || type === "REAL" || type.indexOf("INT") >= 0 || type.indexOf("FLOAT") >= 0 || type.indexOf("DOUBLE") >= 0 || type.indexOf("NUM") >= 0 || type.indexOf("DECIMAL") >= 0) {
      return [
        { val: "=", label: "=" },
        { val: "!=", label: "!=" },
        { val: ">", label: ">" },
        { val: "<", label: "<" },
        { val: ">=", label: ">=" },
        { val: "<=", label: "<=" },
        { val: "IS NULL", label: "is null" },
        { val: "IS NOT NULL", label: "is not null" },
        { val: "IN", label: "IN (comma list)" }
      ];
    }
    if (type === "BLOB") {
      return [
        { val: "IS NULL", label: "is null" },
        { val: "IS NOT NULL", label: "is not null" }
      ];
    }
    return [
      { val: "=", label: "=" },
      { val: "!=", label: "!=" },
      { val: "LIKE", label: "contains" },
      { val: "IS NULL", label: "is null" },
      { val: "IS NOT NULL", label: "is not null" },
      { val: "IN", label: "IN (comma list)" }
    ];
  }

  // assets/web/query-builder-multi.ts
  var _scope = "single";
  var _multiModel = null;
  var _multiRootTable = null;
  var _onChange = () => {
  };
  function makeId(prefix) {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
  }
  function schemaTableByName(name) {
    const meta = schemaMeta;
    if (!meta || !meta.tables || !name) return null;
    const tables = meta.tables;
    for (let i = 0; i < tables.length; i++) {
      if (tables[i].name === name) return tables[i];
    }
    return null;
  }
  function tableColumnsFromSchema(baseTable) {
    const t = schemaTableByName(baseTable);
    if (!t || !t.columns) return [];
    return t.columns.map((c) => ({ name: c.name, type: c.type, pk: c.pk }));
  }
  function buildFreshModel(rootTable, colTypes) {
    const tid = makeId("tb");
    const keys = Object.keys(colTypes || {});
    const columns = keys.map((name) => ({ name, type: colTypes[name] || "", pk: false }));
    return {
      modelVersion: 1,
      tables: [{ id: tid, baseTable: rootTable, alias: "t0", columns }],
      joins: [],
      selectedColumns: keys.map((name) => ({ tableId: tid, column: name })),
      filters: [],
      groupBy: [],
      orderBy: [],
      limit: 200
    };
  }
  function setMultiChangeHandler(fn) {
    _onChange = fn;
  }
  function notify() {
    _onChange();
  }
  function getQbScope() {
    return _scope;
  }
  function initMultiForTable(rootTable, colTypes) {
    if (_multiRootTable !== rootTable || !_multiModel) {
      _multiRootTable = rootTable;
      _multiModel = buildFreshModel(rootTable, colTypes);
    }
  }
  function setQbScope(next) {
    _scope = next;
    const simple = document.getElementById("qb-simple-visual");
    const multi = document.getElementById("qb-multi-panel");
    const btnS = document.getElementById("qb-scope-single");
    const btnM = document.getElementById("qb-scope-multi");
    if (simple) simple.style.display = next === "single" ? "" : "none";
    if (multi) multi.style.display = next === "multi" ? "" : "none";
    if (btnS) btnS.classList.toggle("active", next === "single");
    if (btnM) btnM.classList.toggle("active", next === "multi");
    if (next === "multi") renderMultiRoot();
    notify();
  }
  function getMultiPreviewText() {
    if (!_multiModel) return "";
    const errs = validateQueryModel(_multiModel);
    if (errs.length > 0) return "-- " + errs.join("; ");
    try {
      return renderQuerySql(_multiModel);
    } catch (e) {
      return "-- " + (e instanceof Error ? e.message : String(e));
    }
  }
  function tryGetMultiSql() {
    if (!_multiModel) return null;
    const errs = validateQueryModel(_multiModel);
    if (errs.length > 0) return null;
    try {
      return renderQuerySql(_multiModel).trim();
    } catch {
      return null;
    }
  }
  function tableById(id) {
    return _multiModel?.tables.find((t) => t.id === id);
  }
  function nextAlias() {
    const n = _multiModel?.tables.length ?? 0;
    return `t${n}`;
  }
  function syncSelectedColumnsAfterTableRemoved(removedId) {
    if (!_multiModel) return;
    _multiModel.selectedColumns = _multiModel.selectedColumns.filter((s) => s.tableId !== removedId);
    _multiModel.groupBy = _multiModel.groupBy.filter((g) => g.tableId !== removedId);
    _multiModel.orderBy = _multiModel.orderBy.filter((o) => o.tableId !== removedId);
    _multiModel.filters = _multiModel.filters.filter((f) => f.tableId !== removedId);
  }
  function renderMultiRoot() {
    const host = document.getElementById("qb-multi-root");
    if (!host || !_multiModel) return;
    const m = _multiModel;
    const instOpts = m.tables.map((t) => `<option value="${esc2(t.id)}">${esc2(t.alias)} (${esc2(t.baseTable)})</option>`).join("");
    const schemaTables = (schemaMeta?.tables || []).map((x) => x.name).sort();
    const schemaOpts = schemaTables.map((n) => `<option value="${esc2(n)}">${esc2(n)}</option>`).join("");
    const tablesHtml = m.tables.map((t) => {
      const isRoot = m.tables[0]?.id === t.id;
      const rm = isRoot ? "" : ` <button type="button" class="qb-m-remove-table" data-table-id="${esc2(t.id)}" title="${esc2(vt("viewer.qb.multi.table.remove.title"))}">${esc2(vt("viewer.qb.multi.table.remove.label"))}</button>`;
      return `<li><strong>${esc2(t.alias)}</strong> \u2014 ${esc2(t.baseTable)}${rm}</li>`;
    }).join("");
    const joinsHtml = m.joins.length === 0 ? `<p class="meta">${esc2(vt("viewer.qb.multi.joins.empty"))}</p>` : m.joins.map((j) => {
      const lt = tableById(j.leftTableId);
      const rt = tableById(j.rightTableId);
      const label = `${lt?.alias ?? "?"}.${j.leftColumn} ${j.type} JOIN ${rt?.alias ?? "?"}.${j.rightColumn}`;
      return `<div class="qb-m-join-row">${esc2(label)} <button type="button" class="qb-m-remove-join" data-join-id="${esc2(j.id)}">\xD7</button></div>`;
    }).join("");
    const selColsHtml = m.selectedColumns.map((sc, idx) => {
      const t = tableById(sc.tableId);
      const instOptsRow = m.tables.map((tb) => `<option value="${esc2(tb.id)}"${tb.id === sc.tableId ? " selected" : ""}>${esc2(tb.alias)} (${esc2(tb.baseTable)})</option>`).join("");
      const colOpts = (t?.columns || []).map((c) => `<option value="${esc2(c.name)}"${c.name === sc.column ? " selected" : ""}>${esc2(c.name)}</option>`).join("");
      const aggOpts = ["", "COUNT", "SUM", "AVG", "MIN", "MAX"].map((a) => `<option value="${esc2(a)}"${(sc.aggregation || "") === a ? " selected" : ""}>${a ? esc2(a) : esc2(vt("viewer.qb.multi.sel.agg.none"))}</option>`).join("");
      const showAgg = m.groupBy.length > 0;
      const aggHtml = showAgg ? `<select class="qb-m-sel-agg" data-sel-idx="${idx}" title="${esc2(vt("viewer.qb.multi.sel.agg.title"))}">${aggOpts}</select>` : "";
      return `<div class="qb-row qb-m-sel-row">
        <select class="qb-m-sel-table" data-sel-idx="${idx}">${instOptsRow}</select>
        <select class="qb-m-sel-col" data-sel-idx="${idx}">${colOpts}</select>
        ${aggHtml}
        <button type="button" class="qb-m-remove-sel" data-sel-idx="${idx}" title="${esc2(vt("viewer.qb.multi.sel.remove.title"))}">\xD7</button>
      </div>`;
    }).join("");
    const filtersHtml = m.filters.map((f, fi) => {
      const t = tableById(f.tableId);
      const type = t?.columns.find((c) => c.name === f.column)?.type || "";
      const ops = getWhereOpsForType(type);
      const opOpts = ops.map((o) => `<option value="${esc2(o.val)}"${f.operator === o.val ? " selected" : ""}>${esc2(o.label)}</option>`).join("");
      const conn = fi === 0 ? "" : `<select class="qb-m-flt-conn" data-flt-id="${esc2(f.id)}"><option value="AND"${(f.conjunction || "AND") === "AND" ? " selected" : ""}>AND</option><option value="OR"${f.conjunction === "OR" ? " selected" : ""}>OR</option></select>`;
      const valDisplay = f.operator === "IN" ? (f.values || []).join(", ") : f.value != null ? String(f.value) : "";
      const valHidden = f.operator === "IS NULL" || f.operator === "IS NOT NULL" ? ' style="display:none"' : "";
      return `<div class="qb-m-filter-row">${conn}
        <select class="qb-m-flt-table" data-flt-id="${esc2(f.id)}">${m.tables.map((tb) => `<option value="${esc2(tb.id)}"${tb.id === f.tableId ? " selected" : ""}>${esc2(tb.alias)}</option>`).join("")}</select>
        <select class="qb-m-flt-col" data-flt-id="${esc2(f.id)}">${(t?.columns || []).map((c) => `<option value="${esc2(c.name)}"${c.name === f.column ? " selected" : ""}>${esc2(c.name)}</option>`).join("")}</select>
        <select class="qb-m-flt-op" data-flt-id="${esc2(f.id)}">${opOpts}</select>
        <input type="text" class="qb-m-flt-val" data-flt-id="${esc2(f.id)}" value="${esc2(valDisplay)}" placeholder="${esc2(vt("viewer.qb.multi.flt.value.placeholder"))}"${valHidden}/>
        <button type="button" class="qb-m-remove-flt" data-flt-id="${esc2(f.id)}">\xD7</button>
      </div>`;
    }).join("");
    const gbHtml = m.groupBy.map((g, gi) => {
      const t = tableById(g.tableId);
      const colOpts = (t?.columns || []).map((c) => `<option value="${esc2(c.name)}"${c.name === g.column ? " selected" : ""}>${esc2(c.name)}</option>`).join("");
      return `<div class="qb-row"><select class="qb-m-gb-table" data-gb-idx="${gi}">${m.tables.map((tb) => `<option value="${esc2(tb.id)}"${tb.id === g.tableId ? " selected" : ""}>${esc2(tb.alias)}</option>`).join("")}</select><select class="qb-m-gb-col" data-gb-idx="${gi}">${colOpts}</select><button type="button" class="qb-m-remove-gb" data-gb-idx="${gi}">\xD7</button></div>`;
    }).join("");
    const obHtml = m.orderBy.map((o, oi) => {
      const t = tableById(o.tableId);
      const colOpts = (t?.columns || []).map((c) => `<option value="${esc2(c.name)}"${c.name === o.column ? " selected" : ""}>${esc2(c.name)}</option>`).join("");
      return `<div class="qb-row"><select class="qb-m-ob-table" data-ob-idx="${oi}">${m.tables.map((tb) => `<option value="${esc2(tb.id)}"${tb.id === o.tableId ? " selected" : ""}>${esc2(tb.alias)}</option>`).join("")}</select><select class="qb-m-ob-col" data-ob-idx="${oi}">${colOpts}</select><select class="qb-m-ob-dir" data-ob-idx="${oi}"><option value="ASC"${o.direction === "ASC" ? " selected" : ""}>ASC</option><option value="DESC"${o.direction === "DESC" ? " selected" : ""}>DESC</option></select><button type="button" class="qb-m-remove-ob" data-ob-idx="${oi}">\xD7</button></div>`;
    }).join("");
    const joinHelp = vt(
      "viewer.qb.multi.join.help",
      `<em>${esc2(vt("viewer.qb.multi.join.help.right"))}</em>`,
      `<code>${esc2(vt("viewer.qb.multi.join.help.tn"))}</code>`
    );
    host.innerHTML = `
<div class="qb-multi-section qb-section">
  <div class="qb-header qb-header-static">${esc2(vt("viewer.qb.section.tables"))}</div>
  <div class="qb-body">
    <ul class="qb-m-table-list">${tablesHtml}</ul>
  </div>
</div>
<div class="qb-multi-section qb-section">
  <div class="qb-header qb-header-static">${esc2(vt("viewer.qb.section.joins"))}</div>
  <div class="qb-body">
    ${joinsHtml}
    <div class="qb-row" style="margin-top:0.5rem;flex-wrap:wrap;align-items:flex-end;">
      <label>${esc2(vt("viewer.qb.multi.join.left.label"))}</label>
      <select id="qb-m-join-left-t">${instOpts}</select>
      <select id="qb-m-join-left-c"></select>
      <select id="qb-m-join-type"><option value="INNER">INNER</option><option value="LEFT">LEFT</option><option value="RIGHT">RIGHT</option></select>
      <label>${esc2(vt("viewer.qb.multi.join.rightTable.label"))}</label>
      <select id="qb-m-join-right-base">${schemaOpts ? `<option value="">${esc2(vt("viewer.qb.multi.join.rightBase.pick"))}</option>${schemaOpts}` : `<option value="">${esc2(vt("viewer.qb.multi.join.rightBase.loadSchema"))}</option>`}</select>
      <select id="qb-m-join-right-c"></select>
      <button type="button" id="qb-m-join-add">${esc2(vt("viewer.qb.multi.join.add.label"))}</button>
    </div>
    <p class="meta" style="margin-top:0.35rem;">${joinHelp}</p>
  </div>
</div>
<div class="qb-multi-section qb-section">
  <div class="qb-header qb-header-static">${esc2(vt("viewer.qb.section.selectColumns"))}</div>
  <div class="qb-body">
    ${selColsHtml || `<p class="meta">${esc2(vt("viewer.qb.multi.sel.empty"))}</p>`}
    <button type="button" id="qb-m-add-sel">${esc2(vt("viewer.qb.multi.sel.add.label"))}</button>
  </div>
</div>
<div class="qb-multi-section qb-section">
  <div class="qb-header qb-header-static">${esc2(vt("viewer.qb.section.where"))}</div>
  <div class="qb-body">
    ${filtersHtml || `<p class="meta">${esc2(vt("viewer.qb.multi.flt.empty"))}</p>`}
    <button type="button" id="qb-m-add-flt">${esc2(vt("viewer.qb.multi.flt.add.label"))}</button>
  </div>
</div>
<div class="qb-multi-section qb-section">
  <div class="qb-header qb-header-static">${esc2(vt("viewer.qb.section.groupBy"))}</div>
  <div class="qb-body">
    ${gbHtml || `<p class="meta">${esc2(vt("viewer.qb.multi.empty.none"))}</p>`}
    <button type="button" id="qb-m-add-gb">${esc2(vt("viewer.qb.multi.gb.add.label"))}</button>
  </div>
</div>
<div class="qb-multi-section qb-section">
  <div class="qb-header qb-header-static">${esc2(vt("viewer.qb.section.orderBy"))}</div>
  <div class="qb-body">
    ${obHtml || `<p class="meta">${esc2(vt("viewer.qb.multi.empty.none"))}</p>`}
    <button type="button" id="qb-m-add-ob">${esc2(vt("viewer.qb.multi.ob.add.label"))}</button>
  </div>
</div>
<div class="qb-row" style="margin-top:0.5rem;"><label>${esc2(vt("viewer.qb.label.limit"))}</label><input type="number" id="qb-m-limit" min="1" max="1000" value="${m.limit ?? 200}"/></div>
`;
    fillJoinColumnSelects();
    wireMultiRoot(host);
  }
  function fillJoinColumnSelects() {
    if (!_multiModel) return;
    const leftT = document.getElementById("qb-m-join-left-t");
    const leftC = document.getElementById("qb-m-join-left-c");
    const rightB = document.getElementById("qb-m-join-right-base");
    const rightC = document.getElementById("qb-m-join-right-c");
    if (!leftT || !leftC) return;
    const tid = leftT.value;
    const t = tableById(tid);
    const prevL = leftC.value;
    leftC.innerHTML = (t?.columns || []).map((c) => `<option value="${esc2(c.name)}">${esc2(c.name)}</option>`).join("");
    if (prevL && (t?.columns || []).some((c) => c.name === prevL)) leftC.value = prevL;
    if (rightB && rightC) {
      const base = rightB.value;
      if (base) {
        const cols = tableColumnsFromSchema(base);
        const prevR = rightC.value;
        rightC.innerHTML = cols.map((c) => `<option value="${esc2(c.name)}">${esc2(c.name)}</option>`).join("");
        if (prevR && cols.some((c) => c.name === prevR)) rightC.value = prevR;
      } else {
        rightC.innerHTML = "";
      }
    }
  }
  async function suggestFkForJoin() {
    const leftT = document.getElementById("qb-m-join-left-t");
    const leftC = document.getElementById("qb-m-join-left-c");
    const rightB = document.getElementById("qb-m-join-right-base");
    const rightC = document.getElementById("qb-m-join-right-c");
    if (!leftT || !leftC || !rightB || !rightC || !_multiModel) return;
    const tbl = tableById(leftT.value);
    if (!tbl) return;
    const fks = await loadFkMeta(tbl.baseTable);
    const fk = (fks || []).find((x) => x.fromColumn === leftC.value);
    if (fk && fk.toTable) {
      rightB.value = fk.toTable;
      fillJoinColumnSelects();
      if (fk.toColumn) rightC.value = fk.toColumn;
    }
  }
  function wireMultiRoot(host) {
    const leftT = document.getElementById("qb-m-join-left-t");
    const leftC = document.getElementById("qb-m-join-left-c");
    const rightB = document.getElementById("qb-m-join-right-base");
    if (leftT) leftT.addEventListener("change", () => {
      fillJoinColumnSelects();
      void suggestFkForJoin();
    });
    if (leftC) leftC.addEventListener("change", () => {
      void suggestFkForJoin();
    });
    if (rightB) rightB.addEventListener("change", () => fillJoinColumnSelects());
    host.querySelector("#qb-m-join-add")?.addEventListener("click", () => {
      if (!_multiModel) return;
      const ltid = document.getElementById("qb-m-join-left-t").value;
      const lc = document.getElementById("qb-m-join-left-c").value;
      const jt = document.getElementById("qb-m-join-type").value;
      const rb = document.getElementById("qb-m-join-right-base").value;
      const rc = document.getElementById("qb-m-join-right-c").value;
      if (!ltid || !lc || !rb || !rc) {
        alert(vt("viewer.qb.multi.alert.pickJoin"));
        return;
      }
      const leftInst = tableById(ltid);
      if (!leftInst) return;
      let rightInst = _multiModel.tables.find((t) => t.baseTable === rb && t.id !== ltid);
      if (!rightInst) {
        const alias = nextAlias();
        const cols = tableColumnsFromSchema(rb);
        rightInst = { id: makeId("tb"), baseTable: rb, alias, columns: cols };
        _multiModel.tables.push(rightInst);
        for (const c of cols) {
          _multiModel.selectedColumns.push({ tableId: rightInst.id, column: c.name });
        }
      }
      _multiModel.joins.push({
        id: makeId("jn"),
        leftTableId: ltid,
        leftColumn: lc,
        rightTableId: rightInst.id,
        rightColumn: rc,
        type: jt === "LEFT" || jt === "RIGHT" || jt === "INNER" ? jt : "INNER"
      });
      renderMultiRoot();
      notify();
    });
    host.querySelectorAll(".qb-m-remove-join").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-join-id");
        if (!_multiModel || !id) return;
        _multiModel.joins = _multiModel.joins.filter((j) => j.id !== id);
        renderMultiRoot();
        notify();
      });
    });
    host.querySelectorAll(".qb-m-remove-table").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-table-id");
        if (!_multiModel || !id || _multiModel.tables[0]?.id === id) return;
        _multiModel.joins = _multiModel.joins.filter((j) => j.leftTableId !== id && j.rightTableId !== id);
        _multiModel.tables = _multiModel.tables.filter((t) => t.id !== id);
        syncSelectedColumnsAfterTableRemoved(id);
        renderMultiRoot();
        notify();
      });
    });
    host.querySelector("#qb-m-add-sel")?.addEventListener("click", () => {
      if (!_multiModel || !_multiModel.tables[0]) return;
      const t0 = _multiModel.tables[0];
      const c0 = t0.columns[0]?.name;
      if (!c0) return;
      _multiModel.selectedColumns.push({ tableId: t0.id, column: c0 });
      renderMultiRoot();
      notify();
    });
    host.querySelectorAll(".qb-m-sel-table").forEach((el) => {
      el.addEventListener("change", () => {
        const idx = Number(el.dataset.selIdx);
        const tid = el.value;
        if (!_multiModel || Number.isNaN(idx)) return;
        const t = tableById(tid);
        const col = t?.columns[0]?.name;
        if (!col) return;
        _multiModel.selectedColumns[idx] = { tableId: tid, column: col, aggregation: _multiModel.selectedColumns[idx]?.aggregation };
        renderMultiRoot();
        notify();
      });
    });
    host.querySelectorAll(".qb-m-sel-col").forEach((el) => {
      el.addEventListener("change", () => {
        const idx = Number(el.dataset.selIdx);
        if (!_multiModel || Number.isNaN(idx)) return;
        _multiModel.selectedColumns[idx].column = el.value;
        renderMultiRoot();
        notify();
      });
    });
    host.querySelectorAll(".qb-m-sel-agg").forEach((el) => {
      el.addEventListener("change", () => {
        const idx = Number(el.dataset.selIdx);
        if (!_multiModel || Number.isNaN(idx)) return;
        const v = el.value;
        const cur = _multiModel.selectedColumns[idx];
        _multiModel.selectedColumns[idx] = { ...cur, aggregation: v || void 0 };
        notify();
        renderMultiRoot();
      });
    });
    host.querySelectorAll(".qb-m-remove-sel").forEach((el) => {
      el.addEventListener("click", () => {
        const idx = Number(el.dataset.selIdx);
        if (!_multiModel || Number.isNaN(idx)) return;
        _multiModel.selectedColumns.splice(idx, 1);
        renderMultiRoot();
        notify();
      });
    });
    host.querySelector("#qb-m-add-flt")?.addEventListener("click", () => {
      if (!_multiModel || !_multiModel.tables[0]) return;
      const t0 = _multiModel.tables[0];
      const c0 = t0.columns[0]?.name;
      if (!c0) return;
      _multiModel.filters.push({
        id: makeId("flt"),
        tableId: t0.id,
        column: c0,
        operator: "=",
        value: "",
        conjunction: "AND"
      });
      renderMultiRoot();
      notify();
    });
    host.querySelectorAll(".qb-m-flt-table").forEach((el) => {
      el.addEventListener("change", () => {
        const id = el.dataset.fltId;
        const f = _multiModel?.filters.find((x) => x.id === id);
        if (!f) return;
        f.tableId = el.value;
        const t = tableById(f.tableId);
        f.column = t?.columns[0]?.name || f.column;
        renderMultiRoot();
        notify();
      });
    });
    host.querySelectorAll(".qb-m-flt-col").forEach((el) => {
      el.addEventListener("change", () => {
        const id = el.dataset.fltId;
        const f = _multiModel?.filters.find((x) => x.id === id);
        if (!f) return;
        f.column = el.value;
        renderMultiRoot();
        notify();
      });
    });
    host.querySelectorAll(".qb-m-flt-op").forEach((el) => {
      el.addEventListener("change", () => {
        const id = el.dataset.fltId;
        const f = _multiModel?.filters.find((x) => x.id === id);
        if (!f) return;
        f.operator = el.value;
        if (f.operator === "IS NULL" || f.operator === "IS NOT NULL") {
          delete f.value;
          delete f.values;
        } else if (f.operator === "IN") {
          delete f.value;
          f.values = [];
        } else {
          delete f.values;
          if (f.value === void 0) f.value = "";
        }
        renderMultiRoot();
        notify();
      });
    });
    host.querySelectorAll(".qb-m-flt-val").forEach((el) => {
      el.addEventListener("input", () => {
        const id = el.dataset.fltId;
        const f = _multiModel?.filters.find((x) => x.id === id);
        if (!f) return;
        const raw = el.value;
        if (f.operator === "IN") {
          const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
          f.values = parts.map((p) => {
            const n = Number(p);
            return !Number.isNaN(n) && p !== "" && String(n) === p ? n : p;
          });
        } else {
          const n = Number(raw);
          f.value = !Number.isNaN(n) && raw.trim() !== "" && String(n) === raw.trim() ? n : raw;
        }
        notify();
      });
    });
    host.querySelectorAll(".qb-m-flt-conn").forEach((el) => {
      el.addEventListener("change", () => {
        const id = el.dataset.fltId;
        const f = _multiModel?.filters.find((x) => x.id === id);
        if (!f) return;
        f.conjunction = el.value;
        notify();
      });
    });
    host.querySelectorAll(".qb-m-remove-flt").forEach((el) => {
      el.addEventListener("click", () => {
        const id = el.dataset.fltId;
        if (!_multiModel || !id) return;
        _multiModel.filters = _multiModel.filters.filter((x) => x.id !== id);
        renderMultiRoot();
        notify();
      });
    });
    host.querySelector("#qb-m-add-gb")?.addEventListener("click", () => {
      if (!_multiModel || !_multiModel.tables[0]) return;
      const t0 = _multiModel.tables[0];
      const c0 = t0.columns[0]?.name;
      if (!c0) return;
      _multiModel.groupBy.push({ tableId: t0.id, column: c0 });
      renderMultiRoot();
      notify();
    });
    host.querySelectorAll(".qb-m-gb-table").forEach((el) => {
      el.addEventListener("change", () => {
        const idx = Number(el.dataset.gbIdx);
        if (!_multiModel || Number.isNaN(idx)) return;
        _multiModel.groupBy[idx].tableId = el.value;
        const t = tableById(_multiModel.groupBy[idx].tableId);
        _multiModel.groupBy[idx].column = t?.columns[0]?.name || "";
        renderMultiRoot();
        notify();
      });
    });
    host.querySelectorAll(".qb-m-gb-col").forEach((el) => {
      el.addEventListener("change", () => {
        const idx = Number(el.dataset.gbIdx);
        if (!_multiModel || Number.isNaN(idx)) return;
        _multiModel.groupBy[idx].column = el.value;
        notify();
      });
    });
    host.querySelectorAll(".qb-m-remove-gb").forEach((el) => {
      el.addEventListener("click", () => {
        const idx = Number(el.dataset.gbIdx);
        if (!_multiModel || Number.isNaN(idx)) return;
        _multiModel.groupBy.splice(idx, 1);
        renderMultiRoot();
        notify();
      });
    });
    host.querySelector("#qb-m-add-ob")?.addEventListener("click", () => {
      if (!_multiModel || !_multiModel.tables[0]) return;
      const t0 = _multiModel.tables[0];
      const c0 = t0.columns[0]?.name;
      if (!c0) return;
      _multiModel.orderBy.push({ tableId: t0.id, column: c0, direction: "ASC" });
      renderMultiRoot();
      notify();
    });
    host.querySelectorAll(".qb-m-ob-table").forEach((el) => {
      el.addEventListener("change", () => {
        const idx = Number(el.dataset.obIdx);
        if (!_multiModel || Number.isNaN(idx)) return;
        _multiModel.orderBy[idx].tableId = el.value;
        const t = tableById(_multiModel.orderBy[idx].tableId);
        _multiModel.orderBy[idx].column = t?.columns[0]?.name || "";
        renderMultiRoot();
        notify();
      });
    });
    host.querySelectorAll(".qb-m-ob-col").forEach((el) => {
      el.addEventListener("change", () => {
        const idx = Number(el.dataset.obIdx);
        if (!_multiModel || Number.isNaN(idx)) return;
        _multiModel.orderBy[idx].column = el.value;
        notify();
      });
    });
    host.querySelectorAll(".qb-m-ob-dir").forEach((el) => {
      el.addEventListener("change", () => {
        const idx = Number(el.dataset.obIdx);
        if (!_multiModel || Number.isNaN(idx)) return;
        _multiModel.orderBy[idx].direction = el.value;
        notify();
      });
    });
    host.querySelectorAll(".qb-m-remove-ob").forEach((el) => {
      el.addEventListener("click", () => {
        const idx = Number(el.dataset.obIdx);
        if (!_multiModel || Number.isNaN(idx)) return;
        _multiModel.orderBy.splice(idx, 1);
        renderMultiRoot();
        notify();
      });
    });
    const lim = document.getElementById("qb-m-limit");
    if (lim) {
      lim.addEventListener("input", () => {
        if (!_multiModel) return;
        const n = parseInt(lim.value, 10);
        _multiModel.limit = Number.isFinite(n) && n > 0 ? n : null;
        notify();
      });
    }
  }
  function loadImportedMultiModel(model) {
    _multiModel = model;
    _multiRootTable = model.tables[0]?.baseTable ?? null;
    renderMultiRoot();
    notify();
  }
  function captureMultiPersistable() {
    if (!_multiModel) return null;
    return {
      modelVersion: 1,
      tables: _multiModel.tables.map((t) => ({ id: t.id, baseTable: t.baseTable, alias: t.alias })),
      joins: _multiModel.joins,
      selectedColumns: _multiModel.selectedColumns,
      filters: _multiModel.filters,
      groupBy: _multiModel.groupBy,
      orderBy: _multiModel.orderBy,
      limit: _multiModel.limit
    };
  }
  async function restoreMultiFromPersistable(blob) {
    if (!blob || blob.modelVersion !== 1 || !Array.isArray(blob.tables)) return;
    await loadSchemaMeta();
    const tables = blob.tables.map((row) => ({
      id: row.id,
      baseTable: row.baseTable,
      alias: row.alias,
      columns: tableColumnsFromSchema(row.baseTable)
    }));
    _multiModel = {
      modelVersion: 1,
      tables,
      joins: blob.joins || [],
      selectedColumns: blob.selectedColumns || [],
      filters: blob.filters || [],
      groupBy: blob.groupBy || [],
      orderBy: blob.orderBy || [],
      limit: typeof blob.limit === "number" ? blob.limit : 200
    };
    _multiRootTable = tables[0]?.baseTable ?? null;
    renderMultiRoot();
    notify();
  }

  // extension/src/query-builder/query-builder-core-parse.ts
  function makeImportId(prefix) {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
  }
  function stripSqlComments(input) {
    let s = input.replace(/\/\*[\s\S]*?\*\//g, " ");
    s = s.split("\n").map((line) => {
      const idx = line.indexOf("--");
      return idx >= 0 ? line.slice(0, idx) : line;
    }).join("\n");
    return s.trim();
  }
  function indexOfKeyword(haystack, keyword) {
    const re = keyword === "GROUP BY" ? /\bGROUP\s+BY\b/i : keyword === "ORDER BY" ? /\bORDER\s+BY\b/i : new RegExp(`\\b${keyword}\\b`, "i");
    const m = re.exec(haystack);
    return m ? m.index : -1;
  }
  function clausePositions(afterFrom) {
    const len = afterFrom.length;
    const w = indexOfKeyword(afterFrom, "WHERE");
    const g = indexOfKeyword(afterFrom, "GROUP BY");
    const o = indexOfKeyword(afterFrom, "ORDER BY");
    const l = indexOfKeyword(afterFrom, "LIMIT");
    const starts = [w, g, o, l].filter((x) => x >= 0);
    const firstClauseStart = starts.length ? Math.min(...starts) : len;
    return { where: w, groupBy: g, orderBy: o, limit: l, firstClauseStart };
  }
  function nextClauseEnd(afterFrom, start, c) {
    const len = afterFrom.length;
    const next = [c.groupBy, c.orderBy, c.limit].filter((x) => x >= 0 && x > start);
    return next.length ? Math.min(...next) : len;
  }
  function unquoteIdent(tok) {
    if (tok.startsWith('"')) {
      return tok.replace(/^"|"$/g, "").replace(/""/g, '"');
    }
    return tok;
  }
  function parseQualified(expr) {
    const m = expr.replace(/\s+/g, " ").trim().match(/^("(?:[^"]|"")+"|(\w+))\.("(?:[^"]|"")+"|(\w+))$/);
    if (!m) return null;
    const alias = m[1].startsWith('"') ? unquoteIdent(m[1]) : m[2];
    const col = m[3].startsWith('"') ? unquoteIdent(m[3]) : m[4];
    return { alias, col };
  }
  function qualFromQMatch(m) {
    const alias = m[1].startsWith('"') ? unquoteIdent(m[1]) : m[2];
    const col = m[3].startsWith('"') ? unquoteIdent(m[3]) : m[4];
    return { alias, col };
  }
  function parseScalarLiteral(rhs) {
    const t = rhs.trim();
    if (/^'/.test(t)) return t.slice(1, -1).replace(/''/g, "'");
    if (/^"/.test(t)) return t.slice(1, -1).replace(/""/g, '"');
    if (/^(true|false)$/i.test(t)) return t.toLowerCase() === "true";
    const n = Number(t);
    if (Number.isFinite(n) && t !== "") return n;
    return t;
  }
  function splitCsvRespectingParensAndStrings(s) {
    const out = [];
    let depth = 0;
    let start = 0;
    let inStr = null;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (inStr) {
        if (ch === inStr) inStr = null;
        continue;
      }
      if (ch === '"' || ch === "'") {
        inStr = ch;
        continue;
      }
      if (ch === "(") depth++;
      if (ch === ")") depth = Math.max(0, depth - 1);
      if (ch === "," && depth === 0) {
        out.push(s.slice(start, i));
        start = i + 1;
      }
    }
    out.push(s.slice(start));
    return out;
  }

  // extension/src/query-builder/query-builder-core-import-clauses.ts
  function parseSelectList(selectList, model, aliasToInstanceId, warnings, errors) {
    if (/^\*\s*$/i.test(selectList) || selectList === "*") return;
    const parts = splitCsvRespectingParensAndStrings(selectList);
    const aggRe = /^(SUM|COUNT|AVG|MIN|MAX)\s*\(\s*("(?:[^"]|"")+"|(\w+))\s*\.\s*("(?:[^"]|"")+"|(\w+))\s*\)(?:\s+AS\s+("(?:[^"]|"")+"|(\w+)))?/i;
    for (const part of parts) {
      const p = part.trim();
      if (!p) continue;
      const am = p.match(aggRe);
      if (am) {
        const fn = am[1].toUpperCase();
        const aAlias = am[2].startsWith('"') ? am[2].replace(/^"|"$/g, "").replace(/""/g, '"') : am[3];
        const aCol = am[4].startsWith('"') ? am[4].replace(/^"|"$/g, "").replace(/""/g, '"') : am[5];
        const outAlias = am[6] ? am[6].startsWith('"') ? am[6].replace(/^"|"$/g, "").replace(/""/g, '"') : am[7] : void 0;
        const tid = aliasToInstanceId.get(aAlias);
        if (!tid) {
          errors.push(`Unknown alias in aggregate: ${aAlias}`);
          return;
        }
        model.selectedColumns.push({ tableId: tid, column: aCol, aggregation: fn, alias: outAlias });
        continue;
      }
      const qc = parseQualified(p);
      if (qc) {
        const tid = aliasToInstanceId.get(qc.alias);
        if (!tid) {
          errors.push(`Unknown alias in SELECT: ${qc.alias}`);
          return;
        }
        model.selectedColumns.push({ tableId: tid, column: qc.col });
        continue;
      }
      warnings.push(`Skipped SELECT expression: ${p.slice(0, 80)}`);
    }
  }
  function splitWhereManual(s) {
    const result = [];
    let depth = 0;
    let inStr = null;
    let buf = "";
    let pendingJoin = "AND";
    const flush = () => {
      const t = buf.trim();
      if (!t) {
        buf = "";
        return;
      }
      if (result.length === 0) result.push({ expr: t });
      else result.push({ expr: t, join: pendingJoin });
      buf = "";
    };
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (inStr) {
        buf += ch;
        if (ch === inStr) inStr = null;
        continue;
      }
      if (ch === '"' || ch === "'") {
        inStr = ch;
        buf += ch;
        continue;
      }
      if (ch === "(") {
        depth++;
        buf += ch;
        continue;
      }
      if (ch === ")") {
        depth = Math.max(0, depth - 1);
        buf += ch;
        continue;
      }
      if (depth === 0) {
        const tail = s.slice(i);
        const mAnd = tail.match(/^\s+AND\s+/i);
        if (mAnd) {
          flush();
          pendingJoin = "AND";
          i += mAnd[0].length - 1;
          continue;
        }
        const mOr = tail.match(/^\s+OR\s+/i);
        if (mOr) {
          flush();
          pendingJoin = "OR";
          i += mOr[0].length - 1;
          continue;
        }
      }
      buf += ch;
    }
    flush();
    return result;
  }
  function parseWherePredicate(expr, aliasToInstanceId, errors) {
    const e = expr.replace(/\s+/g, " ").trim();
    const q = `("(?:[^"]|"")+"|(\\w+))\\.("(?:[^"]|"")+"|(\\w+))`;
    const isNull = new RegExp(`^${q}\\s+IS\\s+NULL\\s*$`, "i");
    const isNotNull = new RegExp(`^${q}\\s+IS\\s+NOT\\s+NULL\\s*$`, "i");
    const like = new RegExp(`^${q}\\s+LIKE\\s+('(?:[^']|'')*')\\s*$`, "i");
    const inn = new RegExp(`^${q}\\s+IN\\s*\\(([^)]+)\\)\\s*$`, "i");
    const cmp = new RegExp(`^${q}\\s*(=|!=|<>|<=|>=|<|>)\\s*(.+)$`, "i");
    const bind = (m2) => {
      const ac = qualFromQMatch(m2);
      const tid = aliasToInstanceId.get(ac.alias);
      if (!tid) {
        errors.push(`Unknown alias in WHERE: ${ac.alias}`);
        return null;
      }
      return { tid, col: ac.col };
    };
    let m = e.match(isNull);
    if (m) {
      const b = bind(m);
      if (!b) return null;
      return { id: makeImportId("flt"), tableId: b.tid, column: b.col, operator: "IS NULL", conjunction: "AND" };
    }
    m = e.match(isNotNull);
    if (m) {
      const b = bind(m);
      if (!b) return null;
      return { id: makeImportId("flt"), tableId: b.tid, column: b.col, operator: "IS NOT NULL", conjunction: "AND" };
    }
    m = e.match(like);
    if (m) {
      const b = bind(m);
      if (!b) return null;
      const lit = m[5];
      const val = lit.slice(1, -1).replace(/''/g, "'");
      return { id: makeImportId("flt"), tableId: b.tid, column: b.col, operator: "LIKE", value: val, conjunction: "AND" };
    }
    m = e.match(inn);
    if (m) {
      const b = bind(m);
      if (!b) return null;
      const inner = m[5];
      const values = splitCsvRespectingParensAndStrings(inner).map((x) => parseScalarLiteral(x.trim()));
      return { id: makeImportId("flt"), tableId: b.tid, column: b.col, operator: "IN", values, conjunction: "AND" };
    }
    m = e.match(cmp);
    if (m) {
      const b = bind(m);
      if (!b) return null;
      let op = m[5];
      if (op === "<>") op = "!=";
      if (!["=", "!=", "<", ">", "<=", ">="].includes(op)) return null;
      const val = parseScalarLiteral(m[6].trim());
      return { id: makeImportId("flt"), tableId: b.tid, column: b.col, operator: op, value: val, conjunction: "AND" };
    }
    return null;
  }
  function parseWhere(whereSql, model, aliasToInstanceId, warnings, errors) {
    const chunks = splitWhereManual(whereSql);
    if (chunks.some((c) => c.join === "OR")) {
      warnings.push("WHERE used OR \u2014 verify intent; filters are a flat AND/OR chain in the builder");
    }
    for (const chunk of chunks) {
      const filter = parseWherePredicate(chunk.expr, aliasToInstanceId, errors);
      if (!filter) {
        errors.push(`Unsupported WHERE predicate: ${chunk.expr}`);
        return;
      }
      filter.conjunction = chunk.join ?? "AND";
      model.filters.push(filter);
    }
  }
  function parseGroupBy(groupSql, model, aliasToInstanceId, errors) {
    for (const part of splitCsvRespectingParensAndStrings(groupSql)) {
      const qc = parseQualified(part.trim());
      if (!qc) {
        errors.push(`GROUP BY column not understood: ${part}`);
        return;
      }
      const tid = aliasToInstanceId.get(qc.alias);
      if (!tid) {
        errors.push(`Unknown alias in GROUP BY: ${qc.alias}`);
        return;
      }
      model.groupBy.push({ tableId: tid, column: qc.col });
    }
  }
  function parseOrderBy(orderSql, model, aliasToInstanceId, errors) {
    for (const part of splitCsvRespectingParensAndStrings(orderSql)) {
      const p = part.trim().replace(/\s+/g, " ");
      const m = p.match(/^("(?:[^"]|"")+"|(\w+))\.("(?:[^"]|"")+"|(\w+))(?:\s+(ASC|DESC))?$/i);
      if (!m) {
        errors.push(`ORDER BY column not understood: ${p}`);
        return;
      }
      const alias = m[1].startsWith('"') ? m[1].replace(/^"|"$/g, "").replace(/""/g, '"') : m[2];
      const col = m[3].startsWith('"') ? m[3].replace(/^"|"$/g, "").replace(/""/g, '"') : m[4];
      const dir = (m[5]?.toUpperCase() ?? "ASC") === "DESC" ? "DESC" : "ASC";
      const tid = aliasToInstanceId.get(alias);
      if (!tid) {
        errors.push(`Unknown alias in ORDER BY: ${alias}`);
        return;
      }
      model.orderBy.push({ tableId: tid, column: col, direction: dir });
    }
  }

  // extension/src/query-builder/query-builder-core-import.ts
  function parseJoinOnEquality(on) {
    const t = on.replace(/\s+/g, " ").trim();
    const eq = t.indexOf("=");
    if (eq < 0) return null;
    const left = parseQualified(t.slice(0, eq).trim());
    const right = parseQualified(t.slice(eq + 1).trim());
    if (!left || !right) return null;
    return { leftAlias: left.alias, leftCol: left.col, rightAlias: right.alias, rightCol: right.col };
  }
  function parseFromAndJoins(segment, model, tableByName, aliasToInstanceId, makeTable, warnings, errors) {
    let rest = segment.trim();
    const first = /^("(?:[^"]|"")+"|(\w+))(?:\s+(?:AS\s+)?("(?:[^"]|"")+"|(\w+)))?\s*/i.exec(rest);
    if (!first) {
      errors.push("Could not parse first table in FROM");
      return;
    }
    const tableName = first[1].startsWith('"') ? unquoteIdent(first[1]) : first[2] ?? first[1];
    const aliasToken = first[3] || first[4];
    const alias = aliasToken ? first[3]?.startsWith('"') ? unquoteIdent(first[3]) : first[4] : tableName;
    const meta = tableByName.get(tableName);
    if (!meta) {
      errors.push(`Unknown table in schema: ${tableName}`);
      return;
    }
    const root = makeTable(model, meta.name, meta.columns ?? [], alias);
    aliasToInstanceId.set(root.alias, root.id);
    rest = rest.slice(first[0].length).trim();
    while (rest.length > 0) {
      const jm = /^(INNER|LEFT|RIGHT)?\s*JOIN\s+("(?:[^"]|"")+"|(\w+))(?:\s+(?:AS\s+)?("(?:[^"]|"")+"|(\w+)))?\s+ON\s+/i.exec(
        rest
      );
      if (!jm) {
        if (/\S/.test(rest)) {
          warnings.push(`Trailing FROM/JOIN text not parsed: ${rest.slice(0, 80)}\u2026`);
        }
        break;
      }
      const joinType = (jm[1] || "INNER").toUpperCase();
      const rtName = jm[2].startsWith('"') ? unquoteIdent(jm[2]) : jm[3] ?? jm[2];
      const rtAliasTok = jm[4] || jm[5];
      const rtAlias = rtAliasTok ? jm[4]?.startsWith('"') ? unquoteIdent(jm[4]) : jm[5] : rtName;
      const afterOn = rest.slice(jm[0].length);
      const nextJoinIdx = afterOn.search(/\b(?:INNER|LEFT|RIGHT)?\s+JOIN\b/i);
      const onClause = (nextJoinIdx >= 0 ? afterOn.slice(0, nextJoinIdx) : afterOn).trim();
      rest = nextJoinIdx >= 0 ? afterOn.slice(nextJoinIdx).trim() : "";
      const metaR = tableByName.get(rtName);
      if (!metaR) {
        errors.push(`Unknown join table: ${rtName}`);
        return;
      }
      const rightInst = makeTable(model, metaR.name, metaR.columns ?? [], rtAlias);
      aliasToInstanceId.set(rightInst.alias, rightInst.id);
      const eq = parseJoinOnEquality(onClause);
      if (!eq) {
        errors.push(`Could not parse JOIN ON as column equality: ${onClause}`);
        return;
      }
      let leftId;
      let leftCol;
      let rightId;
      let rightCol;
      const newAlias = rightInst.alias;
      if (eq.leftAlias === newAlias) {
        rightId = rightInst.id;
        rightCol = eq.leftCol;
        const other = aliasToInstanceId.get(eq.rightAlias);
        if (!other) {
          errors.push(`Unknown alias in JOIN ON: ${eq.rightAlias}`);
          return;
        }
        leftId = other;
        leftCol = eq.rightCol;
      } else if (eq.rightAlias === newAlias) {
        rightId = rightInst.id;
        rightCol = eq.rightCol;
        const other = aliasToInstanceId.get(eq.leftAlias);
        if (!other) {
          errors.push(`Unknown alias in JOIN ON: ${eq.leftAlias}`);
          return;
        }
        leftId = other;
        leftCol = eq.leftCol;
      } else {
        errors.push("JOIN ON does not reference the newly joined table alias");
        return;
      }
      model.joins.push({
        id: makeImportId("join"),
        leftTableId: leftId,
        leftColumn: leftCol,
        rightTableId: rightId,
        rightColumn: rightCol,
        type: joinType === "LEFT" || joinType === "RIGHT" || joinType === "INNER" ? joinType : "INNER"
      });
    }
  }
  function importSelectSqlToCoreModel(rawSql, schemaTables, deps) {
    const warnings = [];
    const errors = [];
    const sql = stripSqlComments(rawSql).replace(/;\s*$/, "").trim();
    if (!sql) return { model: null, errors: ["Empty SQL"], warnings };
    if (/^\s*with\b/i.test(sql)) {
      return { model: null, errors: ["WITH / CTE queries cannot be imported into the visual builder yet"], warnings };
    }
    if (!/^\s*select\b/i.test(sql)) {
      return { model: null, errors: ["Only SELECT statements can be imported"], warnings };
    }
    if (/\bunion\b/i.test(sql)) {
      return { model: null, errors: ["UNION queries cannot be imported"], warnings };
    }
    const fromKw = /\bFROM\b/i.exec(sql);
    if (!fromKw || fromKw.index === void 0) {
      return { model: null, errors: ["Missing FROM clause"], warnings };
    }
    const selectList = sql.slice(6, fromKw.index).replace(/\s+/g, " ").trim();
    const afterFrom = sql.slice(fromKw.index + fromKw[0].length).trim();
    const clauses = clausePositions(afterFrom);
    const fromJoinEnd = clauses.firstClauseStart < afterFrom.length ? clauses.firstClauseStart : afterFrom.length;
    const fromJoinSegment = afterFrom.slice(0, fromJoinEnd).trim();
    const whereSql = clauses.where >= 0 ? afterFrom.slice(clauses.where, nextClauseEnd(afterFrom, clauses.where, clauses)).replace(/^\s*WHERE\s+/i, "").trim() : "";
    const groupSql = clauses.groupBy >= 0 ? afterFrom.slice(clauses.groupBy, nextClauseEnd(afterFrom, clauses.groupBy, clauses)).replace(/^\s*GROUP\s+BY\s+/i, "").trim() : "";
    const orderSql = clauses.orderBy >= 0 ? afterFrom.slice(clauses.orderBy, nextClauseEnd(afterFrom, clauses.orderBy, clauses)).replace(/^\s*ORDER\s+BY\s+/i, "").trim() : "";
    const limitSql = clauses.limit >= 0 ? afterFrom.slice(clauses.limit).replace(/^\s*LIMIT\s+/i, "").trim() : "";
    const tableByName = new Map((schemaTables || []).map((t) => [t.name, t]));
    const model = deps.createEmpty();
    const aliasToInstanceId = /* @__PURE__ */ new Map();
    parseFromAndJoins(fromJoinSegment, model, tableByName, aliasToInstanceId, deps.makeTable, warnings, errors);
    if (errors.length > 0) return { model: null, errors, warnings };
    if (model.tables.length === 0) {
      return { model: null, errors: ["No tables parsed from FROM clause"], warnings };
    }
    parseSelectList(selectList, model, aliasToInstanceId, warnings, errors);
    if (errors.length > 0) return { model: null, errors, warnings };
    if (whereSql) parseWhere(whereSql, model, aliasToInstanceId, warnings, errors);
    if (errors.length > 0) return { model: null, errors, warnings };
    if (groupSql) parseGroupBy(groupSql, model, aliasToInstanceId, errors);
    if (errors.length > 0) return { model: null, errors, warnings };
    if (orderSql) parseOrderBy(orderSql, model, aliasToInstanceId, errors);
    if (errors.length > 0) return { model: null, errors, warnings };
    if (limitSql) {
      const lim = Number.parseInt(limitSql.split(/\s+/)[0] ?? "", 10);
      if (Number.isFinite(lim) && lim > 0) model.limit = lim;
      else warnings.push(`LIMIT value not parsed: ${limitSql}`);
    }
    return { model, errors, warnings };
  }

  // assets/web/query-builder-import.ts
  function makeId2(prefix) {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
  }
  function pickAlias(used, forced, count) {
    if (forced && !used.has(forced)) return forced;
    let idx = count;
    let alias = `t${idx}`;
    while (used.has(alias)) {
      idx++;
      alias = `t${idx}`;
    }
    return alias;
  }
  function importSelectSqlToWebModel(rawSql, schemaTables) {
    const result = importSelectSqlToCoreModel(rawSql, schemaTables, {
      createEmpty: () => ({
        modelVersion: 1,
        tables: [],
        joins: [],
        selectedColumns: [],
        filters: [],
        groupBy: [],
        orderBy: [],
        limit: 200
      }),
      makeTable: (model, baseTable, columns, forcedAlias) => {
        const used = new Set(model.tables.map((t) => t.alias));
        const inst = {
          id: makeId2("tb"),
          baseTable,
          alias: pickAlias(used, forcedAlias, model.tables.length),
          columns: columns.map((c) => ({ name: c.name, type: c.type, pk: c.pk }))
        };
        model.tables.push(inst);
        return inst;
      }
    });
    return {
      model: result.model ?? null,
      errors: result.errors,
      warnings: result.warnings
    };
  }

  // assets/web/pagination.ts
  function goToOffset(newOffset) {
    setOffset(Math.max(0, newOffset));
    const offsetInput = document.getElementById("pagination-offset");
    if (offsetInput) offsetInput.value = String(offset);
    saveTableState(currentTableName);
    loadTable(currentTableName);
  }
  function updatePaginationBar(total) {
    const statusEl = document.getElementById("pagination-status");
    const firstBtn = (
      /** @type {HTMLButtonElement|null} */
      document.getElementById("pagination-first")
    );
    const prevBtn = (
      /** @type {HTMLButtonElement|null} */
      document.getElementById("pagination-prev")
    );
    const nextBtn = (
      /** @type {HTMLButtonElement|null} */
      document.getElementById("pagination-next")
    );
    const lastBtn = (
      /** @type {HTMLButtonElement|null} */
      document.getElementById("pagination-last")
    );
    const pagesEl = document.getElementById("pagination-pages");
    const offsetInput = (
      /** @type {HTMLInputElement|null} */
      document.getElementById("pagination-offset")
    );
    if (!pagesEl || !offsetInput) return;
    const currentPage = limit > 0 ? Math.floor(offset / limit) + 1 : 1;
    const totalPages = total != null && total > 0 && limit > 0 ? Math.max(1, Math.ceil(total / limit)) : null;
    const selectedPage = totalPages != null && currentPage > totalPages ? totalPages : currentPage;
    if (statusEl) {
      if (total != null) {
        const from = offset + 1;
        const to = Math.min(offset + limit, total);
        statusEl.textContent = total === 0 ? vt("viewer.session.pagination.zeroRows") : vt("viewer.session.pagination.showingRange", from, to, total.toLocaleString());
      } else {
        statusEl.textContent = vt("viewer.session.pagination.pageUnknownTotal", currentPage);
      }
    }
    const onFirstPage = offset <= 0;
    if (firstBtn) firstBtn.disabled = onFirstPage;
    if (prevBtn) prevBtn.disabled = onFirstPage;
    const onLastPage = totalPages != null && currentPage >= totalPages;
    if (nextBtn) nextBtn.disabled = onLastPage;
    if (lastBtn) lastBtn.disabled = onLastPage;
    pagesEl.innerHTML = "";
    const pageLabel = document.createElement("label");
    pageLabel.setAttribute("for", "pagination-page");
    pageLabel.textContent = vt("viewer.session.pagination.pageLabel");
    pageLabel.className = "pagination-page-label";
    pagesEl.appendChild(pageLabel);
    const pageSel = document.createElement("select");
    pageSel.id = "pagination-page";
    pageSel.setAttribute("aria-label", vt("viewer.session.pagination.currentPageAria"));
    if (totalPages != null) {
      for (let p = 1; p <= totalPages; p++) {
        const opt = document.createElement("option");
        opt.value = String(p);
        opt.textContent = String(p);
        if (p === selectedPage) opt.selected = true;
        pageSel.appendChild(opt);
      }
    } else {
      const opt = document.createElement("option");
      opt.value = "1";
      opt.textContent = "1";
      opt.selected = true;
      pageSel.appendChild(opt);
    }
    pagesEl.appendChild(pageSel);
    const ofSpan = document.createElement("span");
    ofSpan.id = "pagination-of";
    ofSpan.className = "pagination-of";
    ofSpan.textContent = totalPages != null ? vt("viewer.session.pagination.of", totalPages) : "";
    pagesEl.appendChild(ofSpan);
    pageSel.addEventListener("change", function() {
      const p = parseInt(this.value, 10) || 1;
      goToOffset((p - 1) * limit);
    });
    offsetInput.value = String(offset);
  }
  function setupPagination() {
    const bar = document.getElementById("pagination-bar");
    if (!bar) return;
    const limitSel = (
      /** @type {HTMLSelectElement} */
      document.getElementById("pagination-limit")
    );
    limitSel.innerHTML = LIMIT_OPTIONS.map((n) => '<option value="' + n + '"' + (n === limit ? " selected" : "") + ">" + n + "</option>").join("");
    const total = currentTableName ? tableCounts[currentTableName] ?? null : null;
    updatePaginationBar(total);
    bar.style.display = getScope() === "schema" ? "none" : "flex";
  }
  function bindColumnTableEvents() {
  }
  function ensureColumnConfig(tableName, dataKeys) {
    var config = getColumnConfig(tableName);
    if (!config || !config.order) {
      config = { order: dataKeys.slice(), hidden: [], pinned: [] };
      setColumnConfig(tableName, config);
      return config;
    }
    var order = config.order.filter(function(k) {
      return dataKeys.indexOf(k) >= 0;
    });
    dataKeys.forEach(function(k) {
      if (order.indexOf(k) < 0) order.push(k);
    });
    config.order = order;
    if (!config.hidden) config.hidden = [];
    if (!config.pinned) config.pinned = [];
    setColumnConfig(tableName, config);
    return config;
  }
  function applyColumnConfigAndRender() {
    if (!currentTableName || !currentTableJson) return;
    saveTableState(currentTableName);
    renderTableView(currentTableName, currentTableJson);
  }
  function populateColumnChooserList() {
    var listEl2 = document.getElementById("column-chooser-list");
    listEl2.innerHTML = "";
    if (!currentTableName || !currentTableJson || !currentTableJson.length) return;
    var dataKeys = Object.keys(currentTableJson[0]);
    var config = ensureColumnConfig(currentTableName, dataKeys);
    config.order.forEach(function(key) {
      var li = document.createElement("li");
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.id = "col-chooser-" + key.replace(/[^a-zA-Z0-9_]/g, "_");
      cb.checked = config.hidden.indexOf(key) < 0;
      cb.addEventListener("change", function() {
        if (this.checked) {
          config.hidden = config.hidden.filter(function(k) {
            return k !== key;
          });
        } else {
          config.hidden.push(key);
        }
        setColumnConfig(currentTableName, config);
        applyColumnConfigAndRender();
        populateColumnChooserList();
      });
      var label = document.createElement("label");
      label.htmlFor = cb.id;
      label.textContent = key;
      var pinBtn = document.createElement("button");
      pinBtn.type = "button";
      pinBtn.textContent = config.pinned.indexOf(key) >= 0 ? vt("viewer.session.column.unpin") : vt("viewer.session.column.pin");
      pinBtn.title = config.pinned.indexOf(key) >= 0 ? vt("viewer.session.column.unpin.title") : vt("viewer.session.column.pin.title");
      pinBtn.style.fontSize = "11px";
      pinBtn.addEventListener("click", function() {
        var idx = config.pinned.indexOf(key);
        if (idx >= 0) config.pinned.splice(idx, 1);
        else config.pinned.push(key);
        setColumnConfig(currentTableName, config);
        applyColumnConfigAndRender();
        populateColumnChooserList();
      });
      li.appendChild(cb);
      li.appendChild(label);
      li.appendChild(pinBtn);
      listEl2.appendChild(li);
    });
  }

  // assets/web/query-builder.ts
  var _qbColTypes = {};
  function buildQueryBuilderHtml(tableName, colTypes) {
    var cols = Object.keys(colTypes || {});
    if (cols.length === 0) return "";
    _qbColTypes = colTypes;
    var html = '<div class="qb-section">';
    html += '<div class="qb-header is-collapsed" id="qb-toggle">' + esc2(vt("viewer.qb.header")) + "</div>";
    html += '<div id="qb-body" class="qb-body collapsed">';
    html += '<div class="qb-mode-toggle">';
    html += '<button type="button" id="qb-mode-visual" class="qb-mode-btn active" title="' + esc2(vt("viewer.qb.mode.visual.title")) + '">' + esc2(vt("viewer.qb.mode.visual.label")) + "</button>";
    html += '<button type="button" id="qb-mode-raw" class="qb-mode-btn" title="' + esc2(vt("viewer.qb.mode.raw.title")) + '">' + esc2(vt("viewer.qb.mode.raw.label")) + "</button>";
    html += "</div>";
    html += '<div class="qb-mode-toggle qb-scope-toggle" title="' + esc2(vt("viewer.qb.scope.toggle.title")) + '">';
    html += '<button type="button" id="qb-scope-single" class="qb-mode-btn active">' + esc2(vt("viewer.qb.scope.single.label")) + "</button>";
    html += '<button type="button" id="qb-scope-multi" class="qb-mode-btn">' + esc2(vt("viewer.qb.scope.multi.label")) + "</button>";
    html += "</div>";
    html += '<div id="qb-visual-panel">';
    html += '<div id="qb-simple-visual">';
    html += '<div class="qb-row"><label>' + esc2(vt("viewer.qb.label.select")) + '</label><div class="qb-columns" id="qb-columns">';
    cols.forEach(function(c) {
      html += '<label><input type="checkbox" value="' + esc2(c) + '" checked> ' + esc2(c) + "</label>";
    });
    html += "</div></div>";
    html += '<div class="qb-row"><label>' + esc2(vt("viewer.qb.label.where")) + '</label><div style="flex:1;">';
    html += '<div id="qb-where-list"></div>';
    html += '<button type="button" id="qb-add-where" style="font-size:11px;" title="' + esc2(vt("viewer.qb.where.add.title")) + '">' + esc2(vt("viewer.qb.where.add.label")) + "</button>";
    html += "</div></div>";
    html += '<div class="qb-row"><label>' + esc2(vt("viewer.qb.label.orderBy")) + "</label>";
    html += '<select id="qb-order-col"><option value="">' + esc2(vt("viewer.qb.order.none")) + "</option>";
    cols.forEach(function(c) {
      html += '<option value="' + esc2(c) + '">' + esc2(c) + "</option>";
    });
    html += "</select>";
    html += '<select id="qb-order-dir"><option value="ASC">ASC</option><option value="DESC">DESC</option></select>';
    html += "</div>";
    html += '<div class="qb-row"><label>' + esc2(vt("viewer.qb.label.limit")) + "</label>";
    html += '<input type="number" id="qb-limit" value="200" min="1" max="1000" style="width:5rem;">';
    html += "</div>";
    html += "</div>";
    html += '<div id="qb-multi-panel" style="display:none;">';
    html += '<p class="meta" style="margin:0 0 0.5rem 0;">' + esc2(vt("viewer.qb.multi.intro")) + "</p>";
    html += '<div id="qb-multi-root"></div>';
    html += "</div>";
    html += '<div class="qb-preview" id="qb-preview"></div>';
    html += "</div>";
    html += '<div id="qb-raw-panel" style="display:none;">';
    html += '<textarea id="qb-raw-input" class="qb-raw-textarea" rows="4" spellcheck="false" placeholder="SELECT * FROM &quot;' + esc2(tableName) + '&quot; LIMIT 200"></textarea>';
    html += '<div class="qb-row" style="margin-top:0.35rem;">';
    html += '<button type="button" id="qb-raw-import" title="' + esc2(vt("viewer.qb.raw.import.title")) + '">' + esc2(vt("viewer.qb.raw.import.label")) + "</button>";
    html += "</div>";
    html += "</div>";
    html += '<div class="qb-row" style="margin-top:0.35rem;">';
    html += '<button type="button" id="qb-run" title="' + esc2(vt("viewer.qb.run.title")) + '">' + esc2(vt("viewer.qb.run.label")) + "</button>";
    html += '<button type="button" id="qb-reset" title="' + esc2(vt("viewer.qb.reset.title")) + '">' + esc2(vt("viewer.qb.reset.label")) + "</button>";
    html += "</div>";
    html += "</div></div>";
    return html;
  }
  function getWhereOps(columnType) {
    var type = (columnType || "").toUpperCase();
    if (type === "TEXT" || type.indexOf("VARCHAR") >= 0 || type.indexOf("CHAR") >= 0) {
      return [
        { val: "LIKE", label: vt("viewer.qb.op.contains") },
        { val: "=", label: vt("viewer.qb.op.equals") },
        { val: "NOT_LIKE", label: vt("viewer.qb.op.notContains") },
        { val: "LIKE_START", label: vt("viewer.qb.op.startsWith") },
        { val: "IS NULL", label: vt("viewer.qb.op.isNull") },
        { val: "IS NOT NULL", label: vt("viewer.qb.op.isNotNull") }
      ];
    } else if (type === "INTEGER" || type === "REAL" || type.indexOf("INT") >= 0 || type.indexOf("FLOAT") >= 0 || type.indexOf("DOUBLE") >= 0 || type.indexOf("NUM") >= 0 || type.indexOf("DECIMAL") >= 0) {
      return [
        { val: "=", label: "=" },
        { val: "!=", label: "!=" },
        { val: ">", label: ">" },
        { val: "<", label: "<" },
        { val: ">=", label: ">=" },
        { val: "<=", label: "<=" },
        { val: "IS NULL", label: vt("viewer.qb.op.isNull") },
        { val: "IS NOT NULL", label: vt("viewer.qb.op.isNotNull") }
      ];
    } else if (type === "BLOB") {
      return [
        { val: "IS NULL", label: vt("viewer.qb.op.isNull") },
        { val: "IS NOT NULL", label: vt("viewer.qb.op.isNotNull") }
      ];
    }
    return [
      { val: "=", label: "=" },
      { val: "!=", label: "!=" },
      { val: "LIKE", label: vt("viewer.qb.op.contains") },
      { val: "IS NULL", label: vt("viewer.qb.op.isNull") },
      { val: "IS NOT NULL", label: vt("viewer.qb.op.isNotNull") }
    ];
  }
  function addWhereClause(colTypes, preset) {
    var list = document.getElementById("qb-where-list");
    if (!list) return;
    var cols = Object.keys(colTypes || {});
    if (cols.length === 0) return;
    var isFirst = list.children.length === 0;
    var div = document.createElement("div");
    div.className = "qb-where-item";
    if (!isFirst) {
      var connSel = document.createElement("select");
      connSel.className = "qb-where-connector";
      connSel.title = vt("viewer.qb.where.connector.title");
      var optAnd = document.createElement("option");
      optAnd.value = "AND";
      optAnd.textContent = "AND";
      var optOr = document.createElement("option");
      optOr.value = "OR";
      optOr.textContent = "OR";
      connSel.appendChild(optAnd);
      connSel.appendChild(optOr);
      if (preset && preset.connector === "OR") connSel.value = "OR";
      connSel.addEventListener("change", updateQbPreview);
      div.appendChild(connSel);
    }
    var colSel = document.createElement("select");
    colSel.className = "qb-where-col";
    cols.forEach(function(c) {
      var opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      colSel.appendChild(opt);
    });
    if (preset && preset.column) colSel.value = preset.column;
    var opSel = document.createElement("select");
    opSel.className = "qb-where-op";
    var valInput = document.createElement("input");
    valInput.type = "text";
    valInput.className = "qb-where-val";
    valInput.placeholder = vt("viewer.qb.where.value.placeholder");
    valInput.style.width = "8rem";
    var removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.textContent = "\xD7";
    removeBtn.title = vt("viewer.qb.where.remove.title");
    removeBtn.addEventListener("click", function() {
      div.remove();
      updateQbPreview();
    });
    var presetValue = preset ? preset.value : null;
    function updateOps() {
      var type = colTypes[colSel.value] || "";
      var ops = getWhereOps(type);
      opSel.innerHTML = "";
      ops.forEach(function(o) {
        var opt = document.createElement("option");
        opt.value = o.val;
        opt.textContent = o.label;
        opSel.appendChild(opt);
      });
      if (preset && preset.op) {
        opSel.value = preset.op;
        preset = null;
      }
      var op = opSel.value;
      valInput.style.display = op === "IS NULL" || op === "IS NOT NULL" ? "none" : "";
    }
    colSel.addEventListener("change", function() {
      updateOps();
      updateQbPreview();
    });
    opSel.addEventListener("change", function() {
      var op = this.value;
      valInput.style.display = op === "IS NULL" || op === "IS NOT NULL" ? "none" : "";
      updateQbPreview();
    });
    valInput.addEventListener("input", updateQbPreview);
    div.appendChild(colSel);
    div.appendChild(opSel);
    div.appendChild(valInput);
    div.appendChild(removeBtn);
    list.appendChild(div);
    updateOps();
    if (presetValue) valInput.value = presetValue;
    updateQbPreview();
  }
  function buildQueryFromBuilder(tableName) {
    var checkboxes = document.querySelectorAll('#qb-columns input[type="checkbox"]');
    var selectedCols = [];
    checkboxes.forEach(function(cb) {
      if (cb.checked) selectedCols.push(cb.value);
    });
    var selectPart = selectedCols.length > 0 ? selectedCols.map(function(c) {
      return '"' + c + '"';
    }).join(", ") : "*";
    var whereParts = [];
    var whereConnectors = [];
    var whereItems = document.querySelectorAll("#qb-where-list .qb-where-item");
    whereItems.forEach(function(item) {
      var connSel = item.querySelector(".qb-where-connector");
      if (connSel) whereConnectors.push(connSel.value);
      var col = item.querySelector(".qb-where-col").value;
      var op = item.querySelector(".qb-where-op").value;
      var val = item.querySelector(".qb-where-val").value;
      var part;
      if (op === "IS NULL") {
        part = '"' + col + '" IS NULL';
      } else if (op === "IS NOT NULL") {
        part = '"' + col + '" IS NOT NULL';
      } else if (op === "LIKE") {
        part = '"' + col + `" LIKE '%` + val.replace(/'/g, "''") + "%'";
      } else if (op === "NOT_LIKE") {
        part = '"' + col + `" NOT LIKE '%` + val.replace(/'/g, "''") + "%'";
      } else if (op === "LIKE_START") {
        part = '"' + col + `" LIKE '` + val.replace(/'/g, "''") + "%'";
      } else {
        var isNum = !isNaN(Number(val)) && val.trim() !== "";
        var sqlVal = isNum ? val : "'" + val.replace(/'/g, "''") + "'";
        part = '"' + col + '" ' + op + " " + sqlVal;
      }
      whereParts.push(part);
    });
    var orderCol = document.getElementById("qb-order-col").value;
    var orderDir = document.getElementById("qb-order-dir").value;
    var qbLimit = parseInt(document.getElementById("qb-limit").value || "200", 10) || 200;
    var sql = "SELECT " + selectPart + ' FROM "' + tableName + '"';
    if (whereParts.length > 0) {
      var whereClause = whereParts[0];
      for (var i = 1; i < whereParts.length; i++) {
        whereClause += " " + (whereConnectors[i - 1] || "AND") + " " + whereParts[i];
      }
      sql += " WHERE " + whereClause;
    }
    if (orderCol) sql += ' ORDER BY "' + orderCol + '" ' + orderDir;
    sql += " LIMIT " + qbLimit;
    return sql;
  }
  function updateQbPreview() {
    var preview = document.getElementById("qb-preview");
    if (!preview || !currentTableName) return;
    if (getQbScope() === "multi") {
      preview.textContent = getMultiPreviewText();
      return;
    }
    preview.textContent = buildQueryFromBuilder(currentTableName);
  }
  function runQueryBuilder() {
    var rawPanel = document.getElementById("qb-raw-panel");
    var rawInput = document.getElementById("qb-raw-input");
    var isRawMode = rawPanel && rawPanel.style.display !== "none";
    var sql;
    if (isRawMode && rawInput) {
      sql = rawInput.value.trim();
    } else if (getQbScope() === "multi") {
      var multiSql = tryGetMultiSql();
      if (!multiSql) {
        alert(vt("viewer.qb.alert.fixValidation"));
        return;
      }
      sql = multiSql;
    } else {
      sql = buildQueryFromBuilder(currentTableName);
    }
    if (!sql) return;
    var runBtn = document.getElementById("qb-run");
    if (runBtn) {
      runBtn.disabled = true;
      setButtonBusy(runBtn, true, vt("viewer.qb.run.busy"));
    }
    var savedState = captureQueryBuilderState();
    fetch("/api/sql", authOpts({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql })
    })).then(function(r) {
      return r.json().then(function(d) {
        return { ok: r.ok, data: d };
      });
    }).then(function(result) {
      if (!result.ok) {
        alert(vt("viewer.qb.alert.queryError", result.data.error || vt("viewer.qb.alert.unknownError")));
        return;
      }
      setQueryBuilderActive(true);
      setQueryBuilderState(savedState);
      var rows = result.data.rows || [];
      var content = document.getElementById("content");
      var fkMap = {};
      var cachedFks = fkMetaCache[currentTableName] || [];
      (cachedFks || []).forEach(function(fk) {
        fkMap[fk.fromColumn] = fk;
      });
      var colTypes = tableColumnTypes[currentTableName] || {};
      var html = '<p class="meta">' + esc2(vt("viewer.qb.result.rowCount", rows.length)) + "</p>";
      html += '<p class="meta" style="font-family:monospace;font-size:11px;color:var(--muted);">' + esc2(sql) + "</p>";
      html += buildQueryBuilderHtml(currentTableName, colTypes);
      var qbDataKeys = Object.keys(rows[0] || {});
      var qbColConfig = getColumnConfig(currentTableName);
      var rawTableHtml = wrapDataTableInScroll(buildDataTableHtml(rows, fkMap, colTypes, qbColConfig));
      rawTableHtml += buildTableStatusBar(tableCounts[currentTableName] || null, 0, rows.length, rows.length, getVisibleColumnCount(qbDataKeys, qbColConfig));
      var resultsLabel = buildResultsLabel(rows.length, null, getVisibleColumnCount(qbDataKeys, qbColConfig), qbDataKeys.length);
      html += '<div class="results-table-wrap" role="region" aria-label="' + esc2(vt("viewer.qb.results.ariaLabel")) + '"><div class="results-table-heading">' + vt("viewer.qb.results.heading", resultsLabel) + '</div><div class="results-table-body">' + rawTableHtml + "</div></div>";
      content.innerHTML = html;
      bindQueryBuilderEvents(colTypes);
      restoreQueryBuilderUIState(savedState);
      bindColumnTableEvents();
      bindResultsToggle();
      var body = document.getElementById("qb-body");
      var toggle = document.getElementById("qb-toggle");
      if (body) body.classList.remove("collapsed");
      if (toggle) toggle.classList.remove("is-collapsed");
      saveTableState(currentTableName);
    }).catch(function(e) {
      alert(vt("viewer.qb.alert.error", e.message));
    }).finally(function() {
      if (runBtn) {
        runBtn.disabled = false;
        setButtonBusy(runBtn, false, vt("viewer.qb.run.label"));
      }
    });
  }
  function resetQueryBuilder() {
    setQueryBuilderActive(false);
    setQueryBuilderState(null);
    saveTableState(currentTableName);
    if (currentTableName && currentTableJson) {
      renderTableView(currentTableName, currentTableJson);
    }
  }
  function bindQueryBuilderEvents(colTypes) {
    var toggle = document.getElementById("qb-toggle");
    var body = document.getElementById("qb-body");
    if (toggle && body) {
      toggle.addEventListener("click", function() {
        var collapsed = body.classList.contains("collapsed");
        body.classList.toggle("collapsed", !collapsed);
        toggle.classList.toggle("is-collapsed", !collapsed);
      });
    }
    var addBtn = document.getElementById("qb-add-where");
    if (addBtn) addBtn.addEventListener("click", function() {
      addWhereClause(colTypes);
    });
    var runBtn = document.getElementById("qb-run");
    if (runBtn) runBtn.addEventListener("click", runQueryBuilder);
    var resetBtn = document.getElementById("qb-reset");
    if (resetBtn) resetBtn.addEventListener("click", resetQueryBuilder);
    var checkboxes = document.querySelectorAll('#qb-columns input[type="checkbox"]');
    checkboxes.forEach(function(cb) {
      cb.addEventListener("change", updateQbPreview);
    });
    var orderCol = document.getElementById("qb-order-col");
    var orderDir = document.getElementById("qb-order-dir");
    var qbLimit = document.getElementById("qb-limit");
    if (orderCol) orderCol.addEventListener("change", updateQbPreview);
    if (orderDir) orderDir.addEventListener("change", updateQbPreview);
    if (qbLimit) qbLimit.addEventListener("input", updateQbPreview);
    updateQbPreview();
    var visualBtn = document.getElementById("qb-mode-visual");
    var rawBtn = document.getElementById("qb-mode-raw");
    var visualPanel = document.getElementById("qb-visual-panel");
    var rawPanel = document.getElementById("qb-raw-panel");
    var rawInput = document.getElementById("qb-raw-input");
    var scopeSingle = document.getElementById("qb-scope-single");
    var scopeMulti = document.getElementById("qb-scope-multi");
    if (scopeSingle && scopeMulti) {
      setMultiChangeHandler(updateQbPreview);
      initMultiForTable(currentTableName, colTypes);
      void loadSchemaMeta().then(function() {
        if (getQbScope() === "multi") renderMultiRoot();
      });
      scopeSingle.addEventListener("click", function() {
        setQbScope("single");
        updateQbPreview();
      });
      scopeMulti.addEventListener("click", function() {
        initMultiForTable(currentTableName, colTypes);
        void loadSchemaMeta().then(function() {
          setQbScope("multi");
          updateQbPreview();
        });
      });
    }
    if (visualBtn && rawBtn && visualPanel && rawPanel) {
      visualBtn.addEventListener("click", function() {
        visualBtn.classList.add("active");
        rawBtn.classList.remove("active");
        visualPanel.style.display = "";
        rawPanel.style.display = "none";
      });
      rawBtn.addEventListener("click", function() {
        rawBtn.classList.add("active");
        visualBtn.classList.remove("active");
        visualPanel.style.display = "none";
        rawPanel.style.display = "";
        if (rawInput && currentTableName) {
          if (getQbScope() === "multi") {
            var ms = tryGetMultiSql();
            rawInput.value = ms || getMultiPreviewText();
          } else {
            rawInput.value = buildQueryFromBuilder(currentTableName);
          }
          rawInput.focus();
        }
      });
    }
    var importBtn = document.getElementById("qb-raw-import");
    if (importBtn) {
      importBtn.addEventListener("click", function() {
        var input = document.getElementById("qb-raw-input");
        if (!input) return;
        var sqlText = input.value.trim();
        if (!sqlText) {
          alert(vt("viewer.qb.alert.pasteSelect"));
          return;
        }
        void loadSchemaMeta().then(function() {
          var schemaTables = schemaMeta && schemaMeta.tables || [];
          var result = importSelectSqlToWebModel(sqlText, schemaTables);
          if (!result.model || result.errors.length > 0) {
            alert(vt("viewer.qb.alert.importFailed", result.errors.join("\n")));
            return;
          }
          loadImportedMultiModel(result.model);
          setQbScope("multi");
          var vBtn = document.getElementById("qb-mode-visual");
          var rBtn = document.getElementById("qb-mode-raw");
          var vPanel = document.getElementById("qb-visual-panel");
          var rPanel = document.getElementById("qb-raw-panel");
          if (vBtn && rBtn && vPanel && rPanel) {
            vBtn.classList.add("active");
            rBtn.classList.remove("active");
            vPanel.style.display = "";
            rPanel.style.display = "none";
          }
          updateQbPreview();
          if (result.warnings.length > 0) console.warn("SQL import warnings:", result.warnings);
        }).catch(function(e) {
          alert(vt("viewer.qb.alert.schemaLoadFailed", e.message));
        });
      });
    }
  }
  function captureQueryBuilderState() {
    var state = {
      active: queryBuilderActive,
      qbScope: getQbScope(),
      multi: captureMultiPersistable(),
      selectedColumns: [],
      whereClauses: [],
      orderBy: "",
      orderDir: "ASC",
      limit: 200
    };
    var checkboxes = document.querySelectorAll('#qb-columns input[type="checkbox"]');
    checkboxes.forEach(function(cb) {
      if (cb.checked) state.selectedColumns.push(cb.value);
    });
    var whereItems = document.querySelectorAll("#qb-where-list .qb-where-item");
    whereItems.forEach(function(item) {
      var connSel = item.querySelector(".qb-where-connector");
      state.whereClauses.push({
        column: item.querySelector(".qb-where-col").value,
        op: item.querySelector(".qb-where-op").value,
        value: item.querySelector(".qb-where-val").value,
        connector: connSel ? connSel.value : "AND"
      });
    });
    var orderCol = document.getElementById("qb-order-col");
    var orderDir = document.getElementById("qb-order-dir");
    var qbLimit = document.getElementById("qb-limit");
    if (orderCol) state.orderBy = orderCol.value;
    if (orderDir) state.orderDir = orderDir.value;
    if (qbLimit) state.limit = parseInt(qbLimit.value || "200", 10) || 200;
    return state;
  }
  function restoreQueryBuilderUIState(state) {
    if (!state) return;
    if (state.qbScope === "multi" && state.multi) {
      void loadSchemaMeta().then(function() {
        return restoreMultiFromPersistable(state.multi);
      }).then(function() {
        setQbScope("multi");
        updateQbPreview();
      });
      return;
    }
    initMultiForTable(currentTableName, _qbColTypes);
    setQbScope("single");
    var checkboxes = document.querySelectorAll('#qb-columns input[type="checkbox"]');
    if (state.selectedColumns && state.selectedColumns.length > 0) {
      checkboxes.forEach(function(cb) {
        cb.checked = state.selectedColumns.indexOf(cb.value) >= 0;
      });
    }
    if (state.whereClauses && state.whereClauses.length > 0) {
      state.whereClauses.forEach(function(wc) {
        addWhereClause(_qbColTypes, {
          column: wc.column,
          op: wc.op,
          value: wc.value,
          connector: wc.connector || "AND"
        });
      });
    }
    var orderCol = document.getElementById("qb-order-col");
    var orderDir = document.getElementById("qb-order-dir");
    var qbLimit = document.getElementById("qb-limit");
    if (orderCol && state.orderBy) orderCol.value = state.orderBy;
    if (orderDir && state.orderDir) orderDir.value = state.orderDir;
    if (qbLimit && state.limit) qbLimit.value = String(state.limit);
    updateQbPreview();
  }

  // assets/web/persistence.ts
  function collectProjectStorageKeys() {
    var keys = [];
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (!key) continue;
      if (key === PINNED_TABLES_KEY || key === NAV_HISTORY_KEY || key === SQL_HISTORY_KEY || key === BOOKMARKS_KEY || key.startsWith(TABLE_STATE_KEY_PREFIX) || key.startsWith(ANALYSIS_STORAGE_PREFIX)) {
        keys.push(key);
      }
    }
    return keys;
  }
  function clearStaleProjectStorage() {
    try {
      var baseEl = document.querySelector("base");
      var origin = baseEl ? baseEl.href.replace(/\/+$/, "") : location.origin;
      var prev = localStorage.getItem(SERVER_ORIGIN_KEY);
      if (prev === origin) return;
      console.log("[SDA] server origin changed: " + prev + " \u2192 " + origin + " \u2014 clearing stale project storage");
      collectProjectStorageKeys().forEach(function(k) {
        localStorage.removeItem(k);
      });
      localStorage.setItem(SERVER_ORIGIN_KEY, origin);
    } catch (e) {
    }
  }
  function getPinnedTables() {
    try {
      var raw = localStorage.getItem(PINNED_TABLES_KEY);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }
  function setPinnedTables(arr) {
    try {
      localStorage.setItem(PINNED_TABLES_KEY, JSON.stringify(arr));
    } catch (e) {
    }
  }
  function togglePinTable(name) {
    var pinned = getPinnedTables();
    var idx = pinned.indexOf(name);
    if (idx >= 0) {
      pinned.splice(idx, 1);
    } else {
      pinned.push(name);
    }
    setPinnedTables(pinned);
    renderTableList(lastKnownTables || []);
  }
  function getColumnConfig(tableName) {
    if (!tableName) return null;
    return tableColumnConfig[tableName] || null;
  }
  function setColumnConfig(tableName, config) {
    if (!tableName) return;
    tableColumnConfig[tableName] = config;
  }
  function saveTableState(tableName) {
    if (!tableName) return;
    var state = {
      rowFilter: document.getElementById("row-filter").value || "",
      limit,
      offset,
      displayFormat: typeof displayFormat !== "undefined" ? displayFormat : "raw",
      queryBuilder: typeof captureQueryBuilderState === "function" ? captureQueryBuilderState() : null,
      columnConfig: getColumnConfig(tableName) || null
    };
    try {
      localStorage.setItem(TABLE_STATE_KEY_PREFIX + tableName, JSON.stringify(state));
    } catch (e) {
    }
  }
  function restoreTableState(tableName) {
    try {
      var raw = localStorage.getItem(TABLE_STATE_KEY_PREFIX + tableName);
      if (!raw) return;
      var state = JSON.parse(raw);
      if (state.rowFilter != null) document.getElementById("row-filter").value = state.rowFilter;
      if (typeof state.limit === "number" && state.limit > 0) setLimit(state.limit);
      if (typeof state.offset === "number" && state.offset >= 0) setOffset(state.offset);
      if (state.displayFormat && typeof displayFormat !== "undefined") {
        setDisplayFormat(state.displayFormat);
        var sel = document.getElementById("display-format-toggle");
        if (sel) sel.value = displayFormat;
      }
      if (state.queryBuilder) setQueryBuilderState(state.queryBuilder);
      if (state.columnConfig && state.columnConfig.order) setColumnConfig(tableName, state.columnConfig);
    } catch (e) {
    }
  }
  function clearTableState2(tableName) {
    if (!tableName) return;
    setColumnConfig(tableName, null);
    delete tableColumnConfig[tableName];
    try {
      localStorage.removeItem(TABLE_STATE_KEY_PREFIX + tableName);
    } catch (e) {
    }
  }
  function saveNavHistory() {
    try {
      localStorage.setItem(NAV_HISTORY_KEY, JSON.stringify({
        history: navHistory,
        currentTable: currentTableName
      }));
    } catch (e) {
    }
  }
  function loadNavHistory() {
    try {
      var raw = localStorage.getItem(NAV_HISTORY_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || !Array.isArray(data.history)) return null;
      navHistory.length = 0;
      data.history.forEach(function(h) {
        if (h && typeof h.table === "string" && h.table.trim() !== "") {
          navHistory.push({
            table: h.table,
            offset: typeof h.offset === "number" && h.offset >= 0 ? h.offset : 0,
            filter: typeof h.filter === "string" ? h.filter : ""
          });
        }
      });
      return typeof data.currentTable === "string" ? data.currentTable : null;
    } catch (e) {
      return null;
    }
  }
  function clearNavHistory() {
    navHistory.length = 0;
    try {
      localStorage.removeItem(NAV_HISTORY_KEY);
    } catch (e) {
    }
  }

  // assets/web/connection.ts
  var _applyHealthWriteFlag = () => {
  };
  var _pollGeneration = () => {
  };
  function initConnectionDeps(deps) {
    _applyHealthWriteFlag = deps.applyHealthWriteFlag;
    _pollGeneration = deps.pollGeneration;
  }
  function setDisconnected() {
    if (connectionState === "disconnected") return;
    console.log("[SDA] setDisconnected (was: " + connectionState + ")");
    setConnectionState("disconnected");
    setBannerDismissed(false);
    showConnectionBanner();
    updateConnectionBannerText();
    updateLiveIndicatorForConnection();
    setOfflineControlsDisabled(true);
  }
  function setReconnecting() {
    if (connectionState === "reconnecting") return;
    console.log("[SDA] setReconnecting (was: " + connectionState + ")");
    setConnectionState("reconnecting");
    setNextHeartbeatAt(null);
    showConnectionBanner();
    updateConnectionBannerText();
    updateLiveIndicatorForConnection();
  }
  function setConnected() {
    if (connectionState === "connected") return;
    console.log("[SDA] setConnected (was: " + connectionState + ")");
    setConnectionState("connected");
    setConsecutivePollFailures(0);
    setCurrentBackoffMs(BACKOFF_INITIAL_MS);
    setNextHeartbeatAt(null);
    setHeartbeatInFlight(false);
    setHeartbeatAttemptCount(0);
    hideConnectionBanner();
    updateLiveIndicatorForConnection();
    setOfflineControlsDisabled(false);
    stopHeartbeat();
  }
  function updateConnectionBannerText() {
    if (connectionState === "connected" || bannerDismissed) return;
    const msgEl = document.getElementById("banner-message");
    const diagEl = document.getElementById("banner-diagnostics");
    if (!msgEl || !diagEl) return;
    const parts = [];
    if (connectionState === "reconnecting") {
      msgEl.textContent = vt("viewer.session.banner.reconnecting");
      diagEl.textContent = vt("viewer.session.banner.restoring");
      return;
    }
    if (heartbeatInFlight) {
      msgEl.textContent = vt("viewer.session.banner.lost.checking");
      parts.push(vt("viewer.session.banner.attempt", heartbeatAttemptCount));
    } else if (nextHeartbeatAt != null) {
      const secs = Math.max(0, Math.ceil((nextHeartbeatAt - Date.now()) / 1e3));
      msgEl.textContent = vt("viewer.session.banner.lost.nextRetry", secs);
      const intervalSec = currentBackoffMs / 1e3;
      parts.push(vt("viewer.session.banner.retryingEvery", intervalSec));
      if (currentBackoffMs >= BACKOFF_MAX_MS) parts.push(vt("viewer.session.banner.maxInterval"));
      parts.push(vt("viewer.session.banner.attempt", heartbeatAttemptCount));
    } else {
      msgEl.textContent = vt("viewer.session.banner.lost.reconnecting");
      parts.push(vt("viewer.session.banner.attempt", heartbeatAttemptCount));
    }
    diagEl.textContent = parts.join(" \u2022 ");
  }
  function showConnectionBanner() {
    if (bannerDismissed) return;
    const banner = document.getElementById("connection-banner");
    if (!banner) return;
    banner.classList.add("show");
    document.body.classList.add("has-connection-banner");
    if (!bannerUpdateIntervalId) {
      setBannerUpdateIntervalId(setInterval(updateConnectionBannerText, 1e3));
    }
  }
  function hideConnectionBanner() {
    if (bannerUpdateIntervalId) {
      clearInterval(bannerUpdateIntervalId);
      setBannerUpdateIntervalId(null);
    }
    const banner = document.getElementById("connection-banner");
    if (banner) {
      banner.classList.remove("show");
      document.body.classList.remove("has-connection-banner");
    }
  }
  function updateLiveIndicatorForConnection() {
    if (!window.mastheadStatus) return;
    window.mastheadStatus.setConnection(connectionState, pollingEnabled);
  }
  function setOfflineControlsDisabled(disabled) {
    OFFLINE_DISABLE_IDS.forEach(function(id) {
      const el = document.getElementById(id);
      if (el) {
        if (disabled) el.classList.add("offline-disabled");
        else el.classList.remove("offline-disabled");
      }
    });
  }
  function startHeartbeat() {
    if (heartbeatTimerId) {
      console.log("[SDA] startHeartbeat: skipped (timer already active)");
      return;
    }
    console.log("[SDA] startHeartbeat: initiating heartbeat cycle");
    doHeartbeat();
  }
  function doHeartbeat() {
    if (heartbeatInFlight) {
      console.log("[SDA] doHeartbeat: skipped (already in flight)");
      return;
    }
    if (connectionState === "disconnected" || connectionState === "reconnecting") {
      setHeartbeatAttemptCount(heartbeatAttemptCount + 1);
    }
    console.log("[SDA] doHeartbeat: attempt #" + heartbeatAttemptCount + ", state=" + connectionState);
    setHeartbeatInFlight(true);
    updateConnectionBannerText();
    fetch("/api/health", authOpts()).then(function(r) {
      return r.json();
    }).then(function(data) {
      setHeartbeatInFlight(false);
      if (data && data.ok) {
        console.log("[SDA] doHeartbeat: health OK \u2014 resuming poll");
        _applyHealthWriteFlag(data);
        setReconnecting();
        setConsecutivePollFailures(0);
        setCurrentBackoffMs(BACKOFF_INITIAL_MS);
        setNextHeartbeatAt(null);
        setHeartbeatTimerId(null);
        _pollGeneration();
        return;
      }
      console.log("[SDA] doHeartbeat: health response not ok", data);
      updateConnectionBannerText();
      scheduleHeartbeat();
    }).catch(function(err) {
      console.log("[SDA] doHeartbeat: fetch failed", err);
      setHeartbeatInFlight(false);
      updateConnectionBannerText();
      scheduleHeartbeat();
    });
  }
  function scheduleHeartbeat() {
    setCurrentBackoffMs(Math.min(
      currentBackoffMs * BACKOFF_MULTIPLIER,
      BACKOFF_MAX_MS
    ));
    console.log("[SDA] scheduleHeartbeat: next in " + currentBackoffMs + "ms");
    setNextHeartbeatAt(Date.now() + currentBackoffMs);
    setHeartbeatTimerId(setTimeout(doHeartbeat, currentBackoffMs));
  }
  function stopHeartbeat() {
    if (heartbeatTimerId) {
      console.log("[SDA] stopHeartbeat: clearing timer");
      clearTimeout(heartbeatTimerId);
      setHeartbeatTimerId(null);
    }
    setNextHeartbeatAt(null);
  }
  function startKeepAlive() {
    console.log("[SDA] startKeepAlive: interval=" + KEEP_ALIVE_INTERVAL_MS + "ms");
    stopKeepAlive();
    setKeepAliveTimerId(setInterval(function() {
      console.log("[SDA] keepAlive tick: fetching /api/health");
      fetch("/api/health", authOpts()).then(function(r) {
        return r.json();
      }).then(function(data) {
        if (data && data.ok) {
          _applyHealthWriteFlag(data);
          if (connectionState !== "connected") {
            console.log("[SDA] keepAlive: health OK, restoring connected");
            setConnected();
          }
        } else {
          console.log("[SDA] keepAlive: health response not ok", data);
          setDisconnected();
        }
      }).catch(function(err) {
        console.log("[SDA] keepAlive: fetch failed, switching to heartbeat", err);
        setDisconnected();
        stopKeepAlive();
        startHeartbeat();
      });
    }, KEEP_ALIVE_INTERVAL_MS));
  }
  function stopKeepAlive() {
    if (keepAliveTimerId) {
      console.log("[SDA] stopKeepAlive: clearing interval");
      clearInterval(keepAliveTimerId);
      setKeepAliveTimerId(null);
    }
  }

  // assets/web/tabs.ts
  function switchTab(tabId) {
    var tabBar = document.getElementById("tab-bar");
    var panels = document.getElementById("tab-panels");
    if (!tabBar || !panels) return;
    var prevIsTable = activeTabId.indexOf("tbl:") === 0;
    if (prevIsTable && currentTableName) {
      saveTableState(currentTableName);
    }
    setActiveTabId(tabId);
    var isTableTab = tabId.indexOf("tbl:") === 0;
    var showTablesPanel = tabId === "tables" || isTableTab;
    tabBar.querySelectorAll(".tab-btn").forEach(function(btn) {
      var id = btn.getAttribute("data-tab");
      var isActive = id === tabId;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-selected", isActive ? "true" : "false");
    });
    panels.querySelectorAll(".tab-panel").forEach(function(panel) {
      var id = panel.id && panel.id.replace(/^panel-/, "");
      var isActive = id === tabId || showTablesPanel && id === "tables";
      panel.classList.toggle("active", isActive);
      panel.hidden = !isActive;
    });
    var browseEl = document.getElementById("tables-browse");
    var contentEl = document.getElementById("content");
    var paginationEl = document.getElementById("pagination-bar");
    var formatEl = document.getElementById("display-format-bar");
    if (tabId === "tables") {
      if (browseEl) browseEl.style.display = "";
      if (contentEl) contentEl.style.display = "none";
      if (paginationEl) paginationEl.style.display = "none";
      if (formatEl) formatEl.style.display = "none";
    } else if (isTableTab) {
      if (browseEl) browseEl.style.display = "none";
      if (contentEl) contentEl.style.display = "";
      var tableName = tabId.slice(4);
      loadTable(tableName);
    }
    if (typeof window.onTabSwitch === "function") window.onTabSwitch(tabId);
  }
  function findTabBtn(tabId) {
    var tabBar = document.getElementById("tab-bar");
    if (!tabBar) return null;
    var btns = tabBar.querySelectorAll(".tab-btn");
    for (var i = 0; i < btns.length; i++) {
      if (btns[i].getAttribute("data-tab") === tabId) return btns[i];
    }
    return null;
  }
  function createClosableTab(tabId, label, ariaControls, opts) {
    var tabBar = document.getElementById("tab-bar");
    if (!tabBar) return null;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tab-btn";
    btn.setAttribute("data-tab", tabId);
    btn.setAttribute("role", "tab");
    btn.setAttribute("aria-controls", ariaControls);
    btn.id = "tab-" + tabId.replace(/:/g, "-");
    var tabType = tabId.indexOf("tbl:") === 0 ? "tables" : tabId;
    btn.setAttribute("data-tab-type", tabType);
    var iconName = TOOL_ICONS[tabType];
    if (iconName) {
      var iconSpan = document.createElement("span");
      iconSpan.className = "material-symbols-outlined tab-icon";
      iconSpan.setAttribute("aria-hidden", "true");
      iconSpan.textContent = iconName;
      btn.appendChild(iconSpan);
    }
    if (opts && opts.truncateLabel) {
      var nameSpan = document.createElement("span");
      nameSpan.className = "tab-btn-label";
      nameSpan.textContent = label;
      nameSpan.title = label;
      btn.appendChild(nameSpan);
    } else {
      btn.appendChild(document.createTextNode(label));
    }
    var closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "tab-btn-close";
    closeBtn.title = vt("viewer.nav.tab.close");
    closeBtn.setAttribute("aria-label", vt("viewer.nav.tab.closeNamed", label));
    closeBtn.textContent = "\xD7";
    closeBtn.addEventListener("click", function(e) {
      e.stopPropagation();
      closeToolTab(tabId);
    });
    btn.appendChild(closeBtn);
    btn.addEventListener("click", function(e) {
      if (e.target !== closeBtn && !closeBtn.contains(e.target)) switchTab(tabId);
    });
    btn.addEventListener("dblclick", function() {
      closeOtherTabs(tabId);
    });
    if (opts && opts.prepend) {
      tabBar.insertBefore(btn, tabBar.firstChild);
    } else {
      tabBar.appendChild(btn);
    }
    return btn;
  }
  function openTool(toolId) {
    var existing = findTabBtn(toolId);
    if (!existing) {
      createClosableTab(toolId, TOOL_LABELS[toolId] || toolId, "panel-" + toolId);
    }
    switchTab(toolId);
  }
  function closeOtherTabs(keepTabId) {
    var tabBar = document.getElementById("tab-bar");
    if (!tabBar) return;
    var toClose = [];
    tabBar.querySelectorAll(".tab-btn").forEach(function(btn) {
      var id = btn.getAttribute("data-tab");
      if (id && id !== keepTabId && btn.querySelector(".tab-btn-close")) {
        toClose.push(id);
      }
    });
    if (toClose.length === 0) return;
    const confirmMsg = toClose.length > 1 ? vt("viewer.nav.tab.closeOthers.many", toClose.length) : vt("viewer.nav.tab.closeOthers.one", toClose.length);
    if (!window.confirm(confirmMsg)) return;
    toClose.forEach(function(id) {
      closeToolTab(id);
    });
    if (activeTabId !== keepTabId) switchTab(keepTabId);
  }
  function closeToolTab(toolId) {
    var btn = findTabBtn(toolId);
    if (!btn) return;
    var wasActive = activeTabId === toolId;
    btn.remove();
    if (toolId.indexOf("tbl:") === 0) {
      var tableName = toolId.slice(4);
      var idx = openTableTabs.indexOf(tableName);
      if (idx >= 0) openTableTabs.splice(idx, 1);
    }
    var tabBar = document.getElementById("tab-bar");
    var remaining = tabBar ? tabBar.querySelectorAll(".tab-btn") : [];
    if (remaining.length === 0) {
      createClosableTab("home", TOOL_LABELS.home || vt("viewer.nav.tab.home"), "panel-home", { prepend: true });
      switchTab("home");
      return;
    }
    if (wasActive) {
      var last = remaining[remaining.length - 1];
      var nextId = last.getAttribute("data-tab");
      if (nextId) switchTab(nextId);
    }
  }
  function initTabsAndToolbar() {
    document.querySelectorAll("#tab-bar .tab-btn").forEach(function(btn) {
      var tabId = btn.getAttribute("data-tab");
      if (tabId && !btn.querySelector(".tab-btn-close")) {
        btn.addEventListener("click", function() {
          switchTab(tabId);
        });
      }
      if (tabId) {
        btn.addEventListener("dblclick", function() {
          closeOtherTabs(tabId);
        });
      }
    });
  }
  function openTableTab(name) {
    var tabId = "tbl:" + name;
    var existing = findTabBtn(tabId);
    if (!existing) {
      createClosableTab(tabId, name, "panel-tables", { truncateLabel: true });
      openTableTabs.push(name);
    }
    switchTab(tabId);
  }

  // assets/web/table-list.ts
  function rowCountText(name) {
    const total = tableCounts[name];
    const len = currentTableJson && currentTableJson.length || 0;
    if (total == null) return vt("viewer.table.list.upToRows", esc2(name), limit);
    const rangeText = len > 0 ? vt("viewer.table.list.showingRange", offset + 1, offset + len) : vt("viewer.table.list.noRowsInRange");
    return vt(total !== 1 ? "viewer.table.list.countRowMany" : "viewer.table.list.countRowOne", esc2(name), total, rangeText);
  }
  function updateTableListActive() {
    var name = currentTableName;
    var ul = document.getElementById("tables");
    if (!ul) return;
    var targetHash = name ? "#" + encodeURIComponent(name) : "";
    ul.querySelectorAll("a.table-link").forEach(function(a) {
      a.classList.toggle("active", a.getAttribute("href") === targetHash);
    });
  }
  function loadTable(name) {
    if (currentTableName && currentTableName !== name) {
      saveTableState(currentTableName);
    }
    var isNewTable = currentTableName !== name;
    setCurrentTableName(name);
    updateTableListActive();
    if (typeof window._stSyncTable === "function") window._stSyncTable(name);
    if (isNewTable) restoreTableState(name);
    const content = document.getElementById("content");
    const scope = getScope();
    if (scope === "both" && cachedSchema !== null) {
      content.innerHTML = '<p class="meta">' + vt("viewer.table.list.loadingNamed", esc2(name)) + "</p>";
    } else if (scope !== "both") {
      content.innerHTML = '<p class="meta">' + esc2(name) + '</p><p class="meta">' + vt("viewer.table.list.loading") + "</p>";
    }
    fetch("/api/table/" + encodeURIComponent(name) + "?S.limit=" + limit + "&S.offset=" + offset, authOpts()).then((r) => r.json()).then((data) => {
      if (currentTableName !== name) return;
      setCurrentTableJson(data);
      setupPagination();
      renderTableView(name, data);
      fetch("/api/table/" + encodeURIComponent(name) + "/count", authOpts()).then((r) => r.json()).then((o) => {
        if (currentTableName !== name) return;
        tableCounts[name] = o.count;
        updatePaginationBar(o.count);
        renderTableView(name, data);
      }).catch(() => {
      });
    }).catch((e) => {
      if (currentTableName !== name) return;
      content.innerHTML = '<p class="meta">' + vt("viewer.table.list.loadError") + "</p><pre>" + esc2(String(e)) + "</pre>";
    });
  }
  function renderTableList(tables) {
    setLastKnownTables(tables);
    const ul = document.getElementById("tables");
    if (!ul) return;
    ul.innerHTML = "";
    var pinnedArr = getPinnedTables();
    var tableSet = new Set(tables);
    var cleaned = pinnedArr.filter(function(t) {
      return tableSet.has(t);
    });
    if (cleaned.length !== pinnedArr.length) setPinnedTables(cleaned);
    var pinnedSet = new Set(cleaned);
    var sorted = tables.slice().sort(function(a, b) {
      return (pinnedSet.has(a) ? 0 : 1) - (pinnedSet.has(b) ? 0 : 1);
    });
    var countEl2 = document.getElementById("tables-count");
    if (countEl2) {
      countEl2.replaceChildren(document.createTextNode("(" + sorted.length + ")"));
    }
    sorted.forEach(function(t) {
      var isPinned = pinnedSet.has(t);
      var li = document.createElement("li");
      var a = document.createElement("a");
      a.href = "#" + encodeURIComponent(t);
      a.className = "table-link" + (t === currentTableName ? " active" : "");
      a.setAttribute("data-table", t);
      var nameSpan = document.createElement("span");
      nameSpan.className = "table-link-name";
      nameSpan.textContent = t;
      a.appendChild(nameSpan);
      if (tableCounts[t] != null) {
        var countSpan = document.createElement("span");
        var isZero = Number(tableCounts[t]) === 0;
        countSpan.className = "table-link-count" + (isZero ? " table-link-count-zero" : "");
        countSpan.textContent = "(" + formatTableRowCountDisplay(tableCounts[t]) + ")";
        a.appendChild(countSpan);
      }
      var pinBtn = document.createElement("button");
      pinBtn.type = "button";
      pinBtn.className = "table-pin-btn" + (isPinned ? " pinned" : "");
      pinBtn.title = isPinned ? vt("viewer.table.list.unpinTitle") : vt("viewer.table.list.pinTitle");
      pinBtn.setAttribute("aria-pressed", isPinned ? "true" : "false");
      var pinIcon = document.createElement("span");
      pinIcon.className = "material-symbols-outlined";
      pinIcon.setAttribute("aria-hidden", "true");
      pinIcon.textContent = "push_pin";
      pinBtn.appendChild(pinIcon);
      pinBtn.addEventListener("click", function(e) {
        e.preventDefault();
        e.stopPropagation();
        togglePinTable(t);
      });
      a.appendChild(pinBtn);
      a.addEventListener("click", function(e) {
        e.preventDefault();
        openTableTab(t);
      });
      li.appendChild(a);
      ul.appendChild(li);
    });
    const sqlTableSel = document.getElementById("sql-table");
    if (sqlTableSel) {
      sqlTableSel.innerHTML = '<option value="">\u2014</option>' + tables.map((t) => '<option value="' + esc2(t) + '">' + esc2(t) + "</option>").join("");
    }
    const importTableSel = document.getElementById("import-table");
    if (importTableSel) {
      importTableSel.innerHTML = tables.map((t) => '<option value="' + esc2(t) + '">' + esc2(t) + (tableCounts[t] != null ? " (" + esc2(formatTableRowCountDisplay(tableCounts[t])) + ")" : "") + "</option>").join("");
    }
    if (typeof window._stPopulateTables === "function") window._stPopulateTables(tables);
    renderTablesBrowse(tables);
  }
  function renderTablesBrowse(tables) {
    var browseEl = document.getElementById("tables-browse");
    if (!browseEl) return;
    if (!tables || tables.length === 0) {
      browseEl.innerHTML = '<p class="meta">' + vt("viewer.table.list.browseEmpty") + "</p>";
      return;
    }
    var html = '<div class="tables-browse-grid">';
    tables.forEach(function(t) {
      var countHtml = "";
      if (tableCounts[t] != null) {
        countHtml = '<span class="browse-card-count">(' + esc2(formatTableRowCountDisplay(tableCounts[t])) + ")</span>";
      }
      html += '<button type="button" class="tables-browse-card" data-table="' + esc2(t) + '" title="' + esc2(vt("viewer.table.list.browseOpenTitle", t)) + '">';
      html += '<span class="browse-card-name">' + esc2(t) + "</span>";
      html += countHtml;
      html += "</button>";
    });
    html += "</div>";
    browseEl.innerHTML = html;
    browseEl.querySelectorAll(".tables-browse-card").forEach(function(card) {
      card.addEventListener("click", function() {
        var tableName = card.getAttribute("data-table");
        if (tableName) openTableTab(tableName);
      });
    });
  }
  function applyTableListAndCounts(data) {
    var tables = Array.isArray(data) ? data : data && data.tables || [];
    var counts = data && data.counts ? data.counts : {};
    Object.keys(counts).forEach(function(t) {
      tableCounts[t] = counts[t];
      if (typeof window._stUpdateCount === "function") window._stUpdateCount(t, counts[t]);
    });
    renderTableList(tables);
    return tables;
  }
  function refreshOnGenerationChange() {
    if (refreshInFlight) {
      console.log("[SDA] refreshOnGenerationChange: skipped (already in flight)");
      return;
    }
    console.log("[SDA] refreshOnGenerationChange: refreshing tables + current table");
    setRefreshInFlight(true);
    if (window.mastheadStatus && connectionState === "connected") window.mastheadStatus.setBusy();
    fetch("/api/tables", authOpts()).then(function(r) {
      return r.json();
    }).then(function(data) {
      var tables = applyTableListAndCounts(data);
      openTableTabs.slice().forEach(function(name) {
        if (tables.indexOf(name) < 0) closeToolTab("tbl:" + name);
      });
      if (currentTableName && tables.indexOf(currentTableName) >= 0) {
        loadTable(currentTableName);
      }
    }).catch(function() {
    }).finally(function() {
      setRefreshInFlight(false);
      updateLiveIndicatorForConnection();
    });
  }
  function pollGeneration() {
    console.log("[SDA] pollGeneration: since=" + lastGeneration);
    fetch("/api/generation?since=" + lastGeneration, authOpts()).then(function(r) {
      return r.json();
    }).then(function(data) {
      var g = data.generation;
      var changed = typeof g === "number" && g !== lastGeneration;
      console.log("[SDA] pollGeneration: received generation=" + g + ", changed=" + changed);
      setConnected();
      if (changed) {
        if (g < lastGeneration) {
          console.log("[SDA] pollGeneration: generation went backwards (" + lastGeneration + " -> " + g + "). Server may have restarted.");
        }
        setLastGeneration(g);
        refreshOnGenerationChange();
      }
      pollGeneration();
    }).catch(function(err) {
      setConsecutivePollFailures(consecutivePollFailures + 1);
      console.log("[SDA] pollGeneration: FAILED, failures=" + consecutivePollFailures + ", backoff=" + currentBackoffMs + "ms", err);
      if (consecutivePollFailures >= 1 && connectionState === "connected") {
        setDisconnected();
      }
      if (consecutivePollFailures >= HEALTH_CHECK_THRESHOLD) {
        console.log("[SDA] pollGeneration: switching to heartbeat after " + consecutivePollFailures + " failures");
        startHeartbeat();
        return;
      }
      setCurrentBackoffMs(Math.min(
        currentBackoffMs * BACKOFF_MULTIPLIER,
        BACKOFF_MAX_MS
      ));
      setTimeout(pollGeneration, currentBackoffMs);
    });
  }

  // assets/web/fk-nav.ts
  function loadFkMeta(tableName) {
    if (fkMetaCache[tableName]) return Promise.resolve(fkMetaCache[tableName]);
    return fetch("/api/table/" + encodeURIComponent(tableName) + "/fk-meta", authOpts()).then(function(r) {
      return r.json();
    }).then(function(fks) {
      fkMetaCache[tableName] = fks;
      return fks;
    }).catch(function() {
      return [];
    });
  }
  function buildFkSqlValue(value) {
    var isNumeric = !isNaN(value) && value.trim() !== "";
    return isNumeric ? value : "'" + value.replace(/'/g, "''") + "'";
  }
  function navigateToFk(table, column, value) {
    navHistory.push({
      table: currentTableName,
      offset,
      filter: document.getElementById("row-filter").value
    });
    var sqlInput = document.getElementById("sql-input");
    sqlInput.value = 'SELECT * FROM "' + table + '" WHERE "' + column + '" = ' + buildFkSqlValue(value);
    switchTab("sql");
    document.getElementById("sql-run").click();
    setCurrentTableName(table);
    updateTableListActive();
    saveNavHistory();
    renderBreadcrumb();
  }
  function renderBreadcrumb() {
    var el = document.getElementById("nav-breadcrumb");
    if (!el) {
      el = document.createElement("div");
      el.id = "nav-breadcrumb";
      el.style.cssText = "font-size:11px;margin:0.3rem 0;color:var(--muted);";
      document.getElementById("content").prepend(el);
    }
    if (navHistory.length === 0) {
      el.style.display = "none";
      return;
    }
    var html = '<a href="#" id="nav-back" style="color:var(--link);" title="' + esc2(vt("viewer.settings.fknav.backTitle")) + '">&#8592; ' + esc2(vt("viewer.settings.fknav.back")) + "</a>";
    html += ' | <a href="#" id="nav-clear" class="nav-clear-link" title="' + esc2(vt("viewer.settings.fknav.clearPathTitle")) + '">' + esc2(vt("viewer.settings.fknav.clearPath")) + "</a>";
    html += " | ";
    html += navHistory.map(function(h, idx) {
      return '<a href="#" class="nav-crumb" data-idx="' + idx + '" data-longpress-copy="' + esc2(h.table) + '" style="color:var(--link);" title="' + esc2(vt("viewer.settings.fknav.jumpTitle", h.table)) + '">' + esc2(h.table) + "</a>";
    }).join(" &#8594; ");
    var curName = currentTableName || "";
    html += ' &#8594; <strong data-longpress-copy="' + esc2(curName) + '">' + esc2(curName) + "</strong>";
    el.innerHTML = html;
    el.style.display = "block";
    var backBtn = document.getElementById("nav-back");
    if (backBtn) {
      backBtn.onclick = function(e) {
        e.preventDefault();
        var prev = navHistory.pop();
        if (prev) {
          setOffset(prev.offset || 0);
          loadTable(prev.table);
          if (prev.filter) document.getElementById("row-filter").value = prev.filter;
          saveNavHistory();
          renderBreadcrumb();
        }
      };
    }
    var clearBtn = document.getElementById("nav-clear");
    if (clearBtn) {
      clearBtn.onclick = function(e) {
        e.preventDefault();
        clearNavHistory();
        renderBreadcrumb();
      };
    }
    el.querySelectorAll(".nav-crumb").forEach(function(crumb) {
      crumb.onclick = function(e) {
        e.preventDefault();
        var idx = parseInt(crumb.getAttribute("data-idx"), 10);
        if (isNaN(idx) || idx < 0 || idx >= navHistory.length) return;
        var target = navHistory[idx];
        navHistory.length = idx;
        setOffset(target.offset || 0);
        loadTable(target.table);
        if (target.filter) document.getElementById("row-filter").value = target.filter;
        saveNavHistory();
        renderBreadcrumb();
      };
    });
  }

  // assets/web/settings.ts
  function fmtNum(n) {
    try {
      return new Intl.NumberFormat(getActiveLocale()).format(n);
    } catch {
      return String(n);
    }
  }
  function parseNum(raw) {
    const digits = raw.replace(/\D/g, "");
    return digits === "" ? NaN : parseInt(digits, 10);
  }
  function clampNum(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }
  var PREF_PREFIX = "drift-viewer-pref-";
  function getPref(key, defaultValue) {
    try {
      const raw = localStorage.getItem(PREF_PREFIX + key);
      if (raw === null) return defaultValue;
      if (typeof defaultValue === "number") {
        const n = Number(raw);
        return isFinite(n) ? n : defaultValue;
      }
      if (typeof defaultValue === "boolean") {
        return raw === "true";
      }
      return raw;
    } catch {
      return defaultValue;
    }
  }
  function setPref(key, value) {
    try {
      localStorage.setItem(PREF_PREFIX + key, String(value));
    } catch {
    }
  }
  var PREF_SQL_HISTORY_MAX = "sqlHistoryMax";
  var PREF_ANALYSIS_MAX = "analysisMax";
  var PREF_DEFAULT_PAGE_SIZE = "defaultPageSize";
  var PREF_DEFAULT_DISPLAY_FORMAT = "defaultDisplayFormat";
  var PREF_NULL_DISPLAY = "nullDisplay";
  var PREF_DEFAULT_ONLY_MATCHING = "defaultOnlyMatching";
  var PREF_SLOW_QUERY_THRESHOLD = "slowQueryThreshold";
  var PREF_AUTO_REFRESH = "autoRefresh";
  var PREF_EPOCH_DETECTION = "epochDetection";
  var PREF_CONFIRM_NAVIGATE_AWAY = "confirmNavigateAway";
  var PREF_NL_KEYWORDS = "nlKeywords";
  var DEFAULTS = {
    [PREF_SQL_HISTORY_MAX]: 200,
    [PREF_ANALYSIS_MAX]: 50,
    [PREF_DEFAULT_PAGE_SIZE]: 200,
    [PREF_DEFAULT_DISPLAY_FORMAT]: "raw",
    [PREF_NULL_DISPLAY]: "NULL",
    [PREF_DEFAULT_ONLY_MATCHING]: true,
    [PREF_SLOW_QUERY_THRESHOLD]: 100,
    [PREF_AUTO_REFRESH]: true,
    [PREF_EPOCH_DETECTION]: true,
    [PREF_CONFIRM_NAVIGATE_AWAY]: true,
    [PREF_NL_KEYWORDS]: true
  };
  function numberField(id, min, max, step) {
    return `<span class="settings-stepper">
        <input type="text" inputmode="numeric" id="${id}" class="settings-input settings-input-number"
          data-min="${min}" data-max="${max}" data-step="${step}" autocomplete="off" spellcheck="false" />
        <span class="settings-stepper-btns" aria-hidden="true">
          <button type="button" class="settings-stepper-btn" data-step-dir="1" tabindex="-1"><span class="material-symbols-outlined">keyboard_arrow_up</span></button>
          <button type="button" class="settings-stepper-btn" data-step-dir="-1" tabindex="-1"><span class="material-symbols-outlined">keyboard_arrow_down</span></button>
        </span>
      </span>`;
  }
  function buildSettingsHtml() {
    return `
<div class="settings-panel">

  <section class="settings-group">
    <h3 class="settings-group-title">
      <span class="material-symbols-outlined" aria-hidden="true">database</span>
      ${vt("viewer.settings.group.storage")}
    </h3>
    <label class="settings-row">
      <span class="settings-label">${vt("viewer.settings.storage.sqlHistoryMax")}</span>
      ${numberField("pref-sqlHistoryMax", 10, 2e3, 10)}
    </label>
    <label class="settings-row">
      <span class="settings-label">${vt("viewer.settings.storage.maxAnalyses")}</span>
      ${numberField("pref-analysisMax", 5, 500, 5)}
    </label>
    <div class="settings-row settings-row-actions">
      <button type="button" id="settings-clear-all" class="btn btn-danger-outline settings-btn">
        <span class="material-symbols-outlined" aria-hidden="true">delete_sweep</span>
        ${vt("viewer.settings.storage.clearAll")}
      </button>
      <span class="settings-hint">${vt("viewer.settings.storage.clearAllHint")}</span>
    </div>
  </section>

  <section class="settings-group">
    <h3 class="settings-group-title">
      <span class="material-symbols-outlined" aria-hidden="true">table_chart</span>
      ${vt("viewer.settings.group.tableDefaults")}
    </h3>
    <label class="settings-row">
      <span class="settings-label">${vt("viewer.settings.table.defaultPageSize")}</span>
      <select id="pref-defaultPageSize" class="settings-input settings-input-select">
        <option value="50">${fmtNum(50)}</option>
        <option value="200">${fmtNum(200)}</option>
        <option value="500">${fmtNum(500)}</option>
        <option value="1000">${fmtNum(1e3)}</option>
      </select>
    </label>
    <label class="settings-row">
      <span class="settings-label">${vt("viewer.settings.table.defaultDisplayFormat")}</span>
      <select id="pref-defaultDisplayFormat" class="settings-input settings-input-select">
        <option value="raw">${vt("viewer.settings.table.displayFormat.raw")}</option>
        <option value="formatted">${vt("viewer.settings.table.displayFormat.formatted")}</option>
      </select>
    </label>
    <label class="settings-row">
      <span class="settings-label">${vt("viewer.settings.table.nullDisplay")}</span>
      <span class="settings-sublabel">${vt("viewer.settings.table.nullDisplaySub")}</span>
      <select id="pref-nullDisplay" class="settings-input settings-input-select">
        <option value="NULL">NULL</option>
        <option value="-">${vt("viewer.settings.table.nullDisplay.dash")}</option>
      </select>
    </label>
    <label class="settings-row settings-toggle-row">
      <span class="settings-label">${vt("viewer.settings.table.onlyMatching")}</span>
      <span class="settings-sublabel">${vt("viewer.settings.table.onlyMatchingSub")}</span>
      <input type="checkbox" id="pref-defaultOnlyMatching" class="settings-checkbox" />
      <span class="settings-switch" role="switch" aria-checked="false"></span>
    </label>
  </section>

  <section class="settings-group">
    <h3 class="settings-group-title">
      <span class="material-symbols-outlined" aria-hidden="true">speed</span>
      ${vt("viewer.settings.group.performance")}
    </h3>
    <label class="settings-row">
      <span class="settings-label">${vt("viewer.settings.perf.slowQueryThreshold")}</span>
      <span class="settings-sublabel">${vt("viewer.settings.perf.slowQueryThresholdSub")}</span>
      ${numberField("pref-slowQueryThreshold", 10, 6e4, 10)}
    </label>
    <label class="settings-row settings-toggle-row">
      <span class="settings-label">${vt("viewer.settings.perf.autoRefresh")}</span>
      <span class="settings-sublabel">${vt("viewer.settings.perf.autoRefreshSub")}</span>
      <input type="checkbox" id="pref-autoRefresh" class="settings-checkbox" />
      <span class="settings-switch" role="switch" aria-checked="false"></span>
    </label>
  </section>

  <section class="settings-group">
    <h3 class="settings-group-title">
      <span class="material-symbols-outlined" aria-hidden="true">format_paint</span>
      ${vt("viewer.settings.group.dataFormatting")}
    </h3>
    <label class="settings-row settings-toggle-row">
      <span class="settings-label">${vt("viewer.settings.format.epochDetection")}</span>
      <span class="settings-sublabel">${vt("viewer.settings.format.epochDetectionSub")}</span>
      <input type="checkbox" id="pref-epochDetection" class="settings-checkbox" />
      <span class="settings-switch" role="switch" aria-checked="false"></span>
    </label>
    <label class="settings-row settings-toggle-row">
      <span class="settings-label">${vt("viewer.settings.format.confirmNavigate")}</span>
      <span class="settings-sublabel">${vt("viewer.settings.format.confirmNavigateSub")}</span>
      <input type="checkbox" id="pref-confirmNavigateAway" class="settings-checkbox" />
      <span class="settings-switch" role="switch" aria-checked="false"></span>
    </label>
  </section>

  <section class="settings-group">
    <h3 class="settings-group-title">
      <span class="material-symbols-outlined" aria-hidden="true">record_voice_over</span>
      ${vt("viewer.settings.group.ask")}
    </h3>
    <label class="settings-row settings-toggle-row">
      <span class="settings-label">${vt("viewer.settings.ask.keywords")}</span>
      <span class="settings-sublabel">${vt("viewer.settings.ask.keywordsSub")}</span>
      <input type="checkbox" id="pref-nlKeywords" class="settings-checkbox" />
      <span class="settings-switch" role="switch" aria-checked="false"></span>
    </label>
  </section>

  <div class="settings-footer">
    <button type="button" id="settings-reset-all" class="btn btn-outline settings-btn">
      <span class="material-symbols-outlined" aria-hidden="true">restart_alt</span>
      ${vt("viewer.settings.footer.resetAll")}
    </button>
  </div>

</div>`;
  }
  function populateForm() {
    setNumberInput("pref-sqlHistoryMax", getPref(PREF_SQL_HISTORY_MAX, DEFAULTS[PREF_SQL_HISTORY_MAX]));
    setNumberInput("pref-analysisMax", getPref(PREF_ANALYSIS_MAX, DEFAULTS[PREF_ANALYSIS_MAX]));
    setNumberInput("pref-slowQueryThreshold", getPref(PREF_SLOW_QUERY_THRESHOLD, DEFAULTS[PREF_SLOW_QUERY_THRESHOLD]));
    setSelectValue("pref-defaultPageSize", String(getPref(PREF_DEFAULT_PAGE_SIZE, DEFAULTS[PREF_DEFAULT_PAGE_SIZE])));
    setSelectValue("pref-defaultDisplayFormat", getPref(PREF_DEFAULT_DISPLAY_FORMAT, DEFAULTS[PREF_DEFAULT_DISPLAY_FORMAT]));
    setSelectValue("pref-nullDisplay", getPref(PREF_NULL_DISPLAY, DEFAULTS[PREF_NULL_DISPLAY]));
    setToggle("pref-defaultOnlyMatching", getPref(PREF_DEFAULT_ONLY_MATCHING, DEFAULTS[PREF_DEFAULT_ONLY_MATCHING]));
    setToggle("pref-autoRefresh", getPref(PREF_AUTO_REFRESH, DEFAULTS[PREF_AUTO_REFRESH]));
    setToggle("pref-epochDetection", getPref(PREF_EPOCH_DETECTION, DEFAULTS[PREF_EPOCH_DETECTION]));
    setToggle("pref-confirmNavigateAway", getPref(PREF_CONFIRM_NAVIGATE_AWAY, DEFAULTS[PREF_CONFIRM_NAVIGATE_AWAY]));
    setToggle("pref-nlKeywords", getPref(PREF_NL_KEYWORDS, DEFAULTS[PREF_NL_KEYWORDS]));
  }
  function setNumberInput(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = fmtNum(value);
  }
  function setSelectValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value;
  }
  function setToggle(id, checked) {
    const cb = document.getElementById(id);
    if (!cb) return;
    cb.checked = checked;
    const sw = cb.nextElementSibling;
    if (sw && sw.classList.contains("settings-switch")) {
      sw.setAttribute("aria-checked", checked ? "true" : "false");
    }
  }
  function bindEvents() {
    bindNumberInput("pref-sqlHistoryMax", PREF_SQL_HISTORY_MAX);
    bindNumberInput("pref-analysisMax", PREF_ANALYSIS_MAX);
    bindNumberInput("pref-slowQueryThreshold", PREF_SLOW_QUERY_THRESHOLD);
    bindSelectInput("pref-defaultPageSize", PREF_DEFAULT_PAGE_SIZE);
    bindSelectInput("pref-defaultDisplayFormat", PREF_DEFAULT_DISPLAY_FORMAT);
    bindSelectInput("pref-nullDisplay", PREF_NULL_DISPLAY);
    bindToggleInput("pref-defaultOnlyMatching", PREF_DEFAULT_ONLY_MATCHING);
    bindToggleInput("pref-autoRefresh", PREF_AUTO_REFRESH);
    bindToggleInput("pref-epochDetection", PREF_EPOCH_DETECTION);
    bindToggleInput("pref-confirmNavigateAway", PREF_CONFIRM_NAVIGATE_AWAY);
    bindToggleInput("pref-nlKeywords", PREF_NL_KEYWORDS);
    const clearBtn = document.getElementById("settings-clear-all");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        if (!confirm(vt("viewer.settings.confirm.clearAll"))) return;
        clearAllProjectData();
        clearBtn.textContent = vt("viewer.settings.storage.cleared");
        setTimeout(() => {
          clearBtn.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">delete_sweep</span> ' + vt("viewer.settings.storage.clearAll");
        }, 1500);
      });
    }
    const resetBtn = document.getElementById("settings-reset-all");
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        if (!confirm(vt("viewer.settings.confirm.resetAll"))) return;
        resetAllPrefs();
        populateForm();
        applyRuntimeState();
      });
    }
  }
  function bindNumberInput(id, prefKey) {
    const el = document.getElementById(id);
    if (!el) return;
    const min = Number(el.dataset.min);
    const max = Number(el.dataset.max);
    const step = Number(el.dataset.step) || 1;
    const commit = (n) => {
      const clamped = clampNum(n, min, max);
      el.value = fmtNum(clamped);
      setPref(prefKey, clamped);
      applyRuntimeState();
    };
    const current = () => {
      const v = parseNum(el.value);
      return isFinite(v) ? v : min;
    };
    el.addEventListener("change", () => commit(current()));
    el.addEventListener("keydown", (e) => {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        commit(current() + step);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        commit(current() - step);
      }
    });
    const stepper = el.closest(".settings-stepper");
    if (stepper) {
      stepper.querySelectorAll(".settings-stepper-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          const dir = Number(btn.dataset.stepDir) || 0;
          commit(current() + dir * step);
        });
      });
    }
  }
  function bindSelectInput(id, prefKey) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("change", () => {
      const n = Number(el.value);
      setPref(prefKey, isFinite(n) ? n : el.value);
      applyRuntimeState();
    });
  }
  function bindToggleInput(id, prefKey) {
    const cb = document.getElementById(id);
    if (!cb) return;
    const row = cb.closest(".settings-toggle-row");
    if (row) {
      row.addEventListener("click", (e) => {
        if (e.target === cb) return;
        cb.checked = !cb.checked;
        cb.dispatchEvent(new Event("change"));
      });
    }
    cb.addEventListener("change", () => {
      setPref(prefKey, cb.checked);
      const sw = cb.nextElementSibling;
      if (sw && sw.classList.contains("settings-switch")) {
        sw.setAttribute("aria-checked", cb.checked ? "true" : "false");
      }
      applyRuntimeState();
    });
  }
  function applyRuntimeState() {
    setShowOnlyMatchingRows(getPref(PREF_DEFAULT_ONLY_MATCHING, DEFAULTS[PREF_DEFAULT_ONLY_MATCHING]));
    setPollingEnabled(getPref(PREF_AUTO_REFRESH, DEFAULTS[PREF_AUTO_REFRESH]));
    setNullDisplay(getPref(PREF_NULL_DISPLAY, DEFAULTS[PREF_NULL_DISPLAY]));
  }
  function clearAllProjectData() {
    collectProjectStorageKeys().forEach((k) => localStorage.removeItem(k));
    setPinnedTables([]);
    clearNavHistory();
    setSqlHistory([]);
    setSqlBookmarks([]);
  }
  function resetAllPrefs() {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(PREF_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  }
  function initSettings() {
    const panel = document.getElementById("settings-body");
    if (!panel) return;
    panel.innerHTML = buildSettingsHtml();
    populateForm();
    bindEvents();
  }
  function applyStoredPrefs() {
    setLimit(getPref(PREF_DEFAULT_PAGE_SIZE, DEFAULTS[PREF_DEFAULT_PAGE_SIZE]));
    setDisplayFormat(getPref(PREF_DEFAULT_DISPLAY_FORMAT, DEFAULTS[PREF_DEFAULT_DISPLAY_FORMAT]));
    setNullDisplay(getPref(PREF_NULL_DISPLAY, DEFAULTS[PREF_NULL_DISPLAY]));
    setShowOnlyMatchingRows(getPref(PREF_DEFAULT_ONLY_MATCHING, DEFAULTS[PREF_DEFAULT_ONLY_MATCHING]));
    setPollingEnabled(getPref(PREF_AUTO_REFRESH, DEFAULTS[PREF_AUTO_REFRESH]));
  }

  // assets/web/schema.ts
  function loadSchemaIntoPre() {
    var pre = document.getElementById("schema-inline-pre");
    if (!pre) return;
    if (cachedSchema !== null) {
      pre.innerHTML = highlightSqlSafe(cachedSchema);
      return;
    }
    fetch("/api/schema", authOpts()).then((r) => r.text()).then(function(schema) {
      setCachedSchema(schema);
      pre.innerHTML = highlightSqlSafe(schema);
    }).catch(function() {
      pre.textContent = vt("viewer.schema.load.failed");
    });
  }
  function loadSchemaView() {
    const content = document.getElementById("content");
    content.innerHTML = '<p class="meta">' + vt("viewer.schema.loading") + "</p>";
    if (cachedSchema !== null) {
      renderSchemaContent(content, cachedSchema);
      applySearch();
      return;
    }
    fetch("/api/schema", authOpts()).then((r) => r.text()).then((schema) => {
      setCachedSchema(schema);
      renderSchemaContent(content, schema);
      applySearch();
    }).catch((e) => {
      content.innerHTML = '<p class="meta">' + vt("viewer.schema.error") + "</p><pre>" + esc2(String(e)) + "</pre>";
    });
  }
  function renderSchemaContent(container, schema) {
    setLastRenderedData(null);
    setLastRenderedSchema(schema);
    const scope = getScope();
    if (scope === "both") {
      container.innerHTML = '<div class="search-section-collapsible expanded"><div class="collapsible-header" data-collapsible>' + vt("viewer.schema.heading") + '</div><div class="collapsible-body"><pre id="schema-pre">' + highlightSqlSafe(schema) + '</pre></div></div><div class="search-section-collapsible expanded" id="both-data-section"><div class="collapsible-header" data-collapsible>' + vt("viewer.schema.tableData.heading") + '</div><div class="collapsible-body"><p class="meta">' + vt("viewer.schema.selectTablePrompt") + "</p></div></div>";
      const dataSection = document.getElementById("both-data-section");
      if (dataSection && currentTableName && currentTableJson !== null) {
        const displayData = getTableDisplayData(currentTableJson);
        const filtered2 = filterRows(currentTableJson);
        const metaText = rowCountText(currentTableName) + buildTableFilterMetaSuffix(filtered2.length, currentTableJson.length);
        var fkMap = {};
        var cachedFks = fkMetaCache[currentTableName] || [];
        cachedFks.forEach(function(fk) {
          fkMap[fk.fromColumn] = fk;
        });
        var colTypes = tableColumnTypes[currentTableName] || {};
        var dataBody = dataSection.querySelector(".collapsible-body");
        var headerEl = dataSection.querySelector(".collapsible-header");
        if (headerEl) headerEl.textContent = vt("viewer.schema.tableData.headingNamed", currentTableName);
        if (dataBody) dataBody.innerHTML = '<p class="meta">' + metaText + "</p>" + buildTableDefinitionHtml(currentTableName) + wrapDataTableInScroll(buildDataTableHtml(displayData, fkMap, colTypes, getColumnConfig(currentTableName))) + buildTableStatusBar(tableCounts[currentTableName], offset, limit, displayData.length, getVisibleColumnCount(Object.keys(displayData[0] || {}), getColumnConfig(currentTableName)));
      }
    } else {
      container.innerHTML = '<p class="meta">' + vt("viewer.schema.heading") + '</p><pre id="content-pre">' + highlightSqlSafe(schema) + "</pre>";
    }
  }
  function buildBothViewSectionsHtml(tableName, metaText, qbHtml, tableHtml, schema, defHtml) {
    defHtml = defHtml || "";
    return '<div class="search-section-collapsible expanded"><div class="collapsible-header" data-collapsible>' + vt("viewer.schema.heading") + '</div><div class="collapsible-body"><pre id="schema-pre">' + highlightSqlSafe(schema) + '</pre></div></div><div class="search-section-collapsible expanded" id="both-data-section"><div class="collapsible-header" data-collapsible>' + vt("viewer.schema.tableData.headingNamed", esc2(tableName)) + '</div><div class="collapsible-body"><p class="meta">' + metaText + "</p>" + defHtml + qbHtml + tableHtml + "</div></div>";
  }
  function loadBothView() {
    const content = document.getElementById("content");
    content.innerHTML = '<p class="meta">' + vt("viewer.schema.loadingShort") + "</p>";
    (cachedSchema !== null ? Promise.resolve(cachedSchema) : fetch("/api/schema", authOpts()).then((r) => r.text())).then((schema) => {
      if (cachedSchema === null) setCachedSchema(schema);
      setLastRenderedSchema(schema);
      let dataHtml = "";
      if (currentTableName && currentTableJson !== null) {
        const displayData = getTableDisplayData(currentTableJson);
        const filtered2 = filterRows(currentTableJson);
        const metaText = rowCountText(currentTableName) + buildTableFilterMetaSuffix(filtered2.length, currentTableJson.length);
        var fkMap = {};
        var cachedFks = fkMetaCache[currentTableName] || [];
        cachedFks.forEach(function(fk) {
          fkMap[fk.fromColumn] = fk;
        });
        var colTypes = tableColumnTypes[currentTableName] || {};
        dataHtml = '<p class="meta">' + metaText + "</p>" + buildTableDefinitionHtml(currentTableName) + wrapDataTableInScroll(buildDataTableHtml(displayData, fkMap, colTypes, getColumnConfig(currentTableName))) + buildTableStatusBar(tableCounts[currentTableName], offset, limit, displayData.length, getVisibleColumnCount(Object.keys(displayData[0] || {}), getColumnConfig(currentTableName)));
      } else {
        setLastRenderedData(null);
        dataHtml = '<p class="meta">' + vt("viewer.schema.selectTablePrompt") + "</p>";
      }
      content.innerHTML = '<div class="search-section-collapsible expanded"><div class="collapsible-header" data-collapsible>' + vt("viewer.schema.heading") + '</div><div class="collapsible-body"><pre id="schema-pre">' + highlightSqlSafe(schema) + '</pre></div></div><div class="search-section-collapsible expanded" id="both-data-section"><div class="collapsible-header" data-collapsible>' + vt("viewer.schema.tableData.heading") + '</div><div class="collapsible-body">' + dataHtml + "</div></div>";
      applySearch();
    }).catch((e) => {
      content.innerHTML = '<p class="meta">' + vt("viewer.schema.error") + "</p><pre>" + esc2(String(e)) + "</pre>";
    });
  }

  // assets/web/table-view.ts
  async function loadColumnTypes(tableName) {
    if (tableColumnTypes[tableName]) return tableColumnTypes[tableName];
    var meta = await loadSchemaMeta();
    var tables = meta.tables || [];
    tables.forEach(function(t) {
      var types = {};
      (t.columns || []).forEach(function(c) {
        types[c.name] = (c.type || "").toUpperCase();
      });
      tableColumnTypes[t.name] = types;
    });
    return tableColumnTypes[tableName] || {};
  }
  function isEpochTimestamp(value) {
    if (!getPref(PREF_EPOCH_DETECTION, DEFAULTS[PREF_EPOCH_DETECTION])) return false;
    var n = Number(value);
    if (!isFinite(n) || n <= 0) return false;
    if (n > 9466848e5 && n < 3250368e7) return "ms";
    if (n > 946684800 && n < 3250368e4) return "s";
    return false;
  }
  function isBooleanColumn(name) {
    var lower = name.toLowerCase();
    return /^(is_|has_|can_|should_|allow_|enable)/.test(lower) || /_(enabled|active|visible|deleted|archived|verified|confirmed|locked|published)\$/.test(lower) || lower === "active" || lower === "enabled" || lower === "deleted" || lower === "verified";
  }
  function isDateColumn2(name) {
    var lower = name.toLowerCase();
    return /date|time|created|updated|deleted|_at\$|_on\$/.test(lower);
  }
  var BLOB_PREVIEW_CHARS = 48;
  function isBlobType(colType) {
    return /BLOB|BINARY/.test((colType || "").toUpperCase());
  }
  function formatCellValue(value, columnName, columnType) {
    var raw = value != null ? String(value) : "";
    if (value == null || value === "") return { formatted: raw, raw, wasFormatted: false };
    var type = (columnType || "").toUpperCase();
    if ((type === "INTEGER" || type === "") && isBooleanColumn(columnName)) {
      if (value === 0 || value === "0") return { formatted: vt("viewer.table.grid.boolFalse"), raw, wasFormatted: true };
      if (value === 1 || value === "1") return { formatted: vt("viewer.table.grid.boolTrue"), raw, wasFormatted: true };
    }
    if ((type === "INTEGER" || type === "REAL" || type === "") && (isDateColumn2(columnName) || isEpochTimestamp(value))) {
      var epoch = isEpochTimestamp(value);
      if (epoch) {
        var ms = epoch === "ms" ? Number(value) : Number(value) * 1e3;
        var date = new Date(ms);
        if (!isNaN(date.getTime())) {
          return { formatted: date.toISOString(), raw, wasFormatted: true };
        }
      }
    }
    return { formatted: raw, raw, wasFormatted: false };
  }
  function showCopyToast(message) {
    var toast = document.getElementById("copy-toast");
    if (message) toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(function() {
      toast.classList.remove("show");
      toast.textContent = vt("viewer.table.toast.copied");
    }, 1200);
  }
  function copyCellValue(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(showCopyToast).catch(function() {
      });
    }
  }
  function buildDataTableHtml(filtered2, fkMap, colTypes, columnConfig) {
    if (!filtered2 || filtered2.length === 0) return '<p class="meta">' + vt("viewer.table.grid.empty") + "</p>";
    var dataKeys = Object.keys(filtered2[0]);
    var order = dataKeys.slice();
    var hidden = [];
    var pinned = [];
    if (columnConfig && columnConfig.order && columnConfig.order.length) {
      order = columnConfig.order.filter(function(k) {
        return dataKeys.indexOf(k) >= 0;
      });
      dataKeys.forEach(function(k) {
        if (order.indexOf(k) < 0) order.push(k);
      });
    }
    if (columnConfig && columnConfig.hidden) hidden = columnConfig.hidden;
    if (columnConfig && columnConfig.pinned) pinned = columnConfig.pinned;
    var visible = order.filter(function(k) {
      return hidden.indexOf(k) < 0;
    });
    var maskOn = isPiiMaskEnabled();
    var singlePkName = getSinglePkColumnName(currentTableName);
    var showRowDelete = !!driftWriteEnabled && !!singlePkName;
    var html = '<table id="data-table" class="drift-table"><thead><tr>';
    visible.forEach(function(k) {
      var fk = fkMap[k];
      var fkLabel = fk ? ' <span class="table-header-fk" title="' + esc2(vt("viewer.table.grid.fkHeaderTitle", fk.toTable, fk.toColumn)) + '">&#8599;</span>' : "";
      var colType = colTypes ? colTypes[k] || "" : "";
      var typeBadge = colType ? ' <span class="col-type-badge" title="' + esc2(colType) + '">' + esc2(colType.substring(0, 4)) + "</span>" : "";
      var maskBadge = "";
      if (maskOn && isPiiColumn(k)) {
        var maskTip = vt("viewer.table.grid.maskTip");
        maskBadge = ' <span class="col-mask-badge" title="' + esc2(maskTip) + '" aria-label="' + esc2(maskTip) + '"><span class="material-symbols-outlined" aria-hidden="true">visibility_off</span></span>';
      }
      var thClass = pinned.indexOf(k) >= 0 ? ' class="col-pinned"' : "";
      html += '<th data-column-key="' + esc2(k) + '" draggable="true"' + thClass + ' title="' + esc2(vt("viewer.table.grid.headerDragTitle")) + '">' + esc2(k) + maskBadge + typeBadge + fkLabel + "</th>";
    });
    if (showRowDelete) {
      html += '<th class="row-action-col">' + esc2(vt("viewer.table.grid.actionsHeader")) + "</th>";
    }
    html += "</tr></thead><tbody>";
    var piiCols = {};
    visible.forEach(function(k) {
      piiCols[k] = isPiiColumn(k);
    });
    filtered2.forEach(function(row) {
      html += "<tr>";
      visible.forEach(function(k) {
        var val = row[k];
        var fk = fkMap[k];
        var isNull = val == null;
        var rawStr = isNull ? "" : String(val);
        var displayStr = getDisplayValue(k, val, maskOn, piiCols[k]);
        var isBlob = colTypes ? isBlobType(colTypes[k]) : false;
        var blobTruncated = false;
        var cellContent;
        if (isNull) {
          cellContent = '<span class="cell-null">' + esc2(nullDisplay) + "</span>";
        } else if (isBlob) {
          if (displayStr.length > BLOB_PREVIEW_CHARS) {
            cellContent = esc2(displayStr.substring(0, BLOB_PREVIEW_CHARS)) + '<span class="cell-blob-ellipsis" aria-hidden="true">\u2026</span>';
            blobTruncated = true;
          } else {
            cellContent = esc2(displayStr);
          }
        } else if (displayFormat === "formatted" && colTypes && !(maskOn && piiCols[k])) {
          var fmt = formatCellValue(val, k, colTypes[k]);
          if (fmt.wasFormatted) {
            cellContent = '<span title="' + esc2(vt("viewer.table.grid.rawTitle", fmt.raw)) + '">' + esc2(fmt.formatted) + '</span><span class="cell-raw">' + esc2(fmt.raw) + "</span>";
          } else {
            cellContent = esc2(displayStr);
          }
        } else {
          cellContent = esc2(displayStr);
        }
        var copyBtn = '<button type="button" class="cell-copy-btn" data-raw="' + esc2(displayStr) + '" title="' + esc2(vt("viewer.table.grid.copyValueTitle")) + '">&#x2398;</button>';
        var expandBtn = blobTruncated ? '<button type="button" class="cell-expand-btn" title="' + esc2(vt("viewer.table.grid.expandValueTitle")) + '">&#x26F6;</button>' : "";
        var tdClass = pinned.indexOf(k) >= 0 ? ' class="col-pinned"' : "";
        var tdAttrs = ' data-column-key="' + esc2(k) + '"' + tdClass;
        if (fk && !isNull) {
          html += "<td" + tdAttrs + '><span class="cell-text"><a href="#" class="fk-link" style="color:var(--link);text-decoration:underline;" ';
          html += 'data-table="' + esc2(fk.toTable) + '" ';
          html += 'data-column="' + esc2(fk.toColumn) + '" ';
          html += 'data-value="' + esc2(rawStr) + '">';
          html += cellContent + " &#8594;</a></span>" + expandBtn + copyBtn + "</td>";
        } else {
          html += "<td" + tdAttrs + '><span class="cell-text">' + cellContent + "</span>" + expandBtn + copyBtn + "</td>";
        }
      });
      if (showRowDelete && singlePkName) {
        var pkRaw = row[singlePkName] == null ? "" : String(row[singlePkName]);
        html += '<td class="row-action-col"><button type="button" class="row-delete-btn" data-pk-col="' + esc2(singlePkName) + '" data-pk-raw="' + esc2(pkRaw) + '" title="' + esc2(vt("viewer.table.grid.rowDeleteTitle")) + '">' + esc2(vt("viewer.table.grid.rowDeleteLabel")) + "</button></td>";
      }
      html += "</tr>";
    });
    html += "</tbody></table>";
    return html;
  }
  function wrapDataTableInScroll(tableHtml) {
    if (!tableHtml || tableHtml.indexOf("<table") < 0) return tableHtml;
    return '<div id="data-table-scroll-wrap" class="data-table-scroll-wrap">' + tableHtml + "</div>";
  }
  function getVisibleColumnCount(dataKeys, columnConfig) {
    if (!dataKeys || dataKeys.length === 0) return 0;
    var order = dataKeys.slice();
    var hidden = [];
    if (columnConfig && columnConfig.order && columnConfig.order.length) {
      order = columnConfig.order.filter(function(k) {
        return dataKeys.indexOf(k) >= 0;
      });
      dataKeys.forEach(function(k) {
        if (order.indexOf(k) < 0) order.push(k);
      });
    }
    if (columnConfig && columnConfig.hidden) hidden = columnConfig.hidden;
    return order.filter(function(k) {
      return hidden.indexOf(k) < 0;
    }).length;
  }
  function buildTableStatusBar(total, offset2, limit2, displayedLen, columnCount) {
    var rangeText = displayedLen > 0 ? offset2 + 1 + "\u2013" + (offset2 + displayedLen) : "0";
    var totalText = total != null ? total.toLocaleString() : "?";
    var colText = columnCount != null && columnCount > 0 ? vt(columnCount !== 1 ? "viewer.table.status.columnMany" : "viewer.table.status.columnOne", columnCount) : "";
    var rangeMarkup = '<span class="table-status-range">' + rangeText + "</span>";
    var parts = [vt("viewer.table.status.showing", rangeMarkup, totalText)];
    if (displayedLen === 0 && total != null && total > 0 && offset2 >= total) {
      parts.push(vt("viewer.table.status.pastEnd"));
    }
    if (colText) parts.push(colText);
    return '<div class="table-status-bar" role="status">' + parts.join(" \u2022 ") + "</div>";
  }
  function buildResultsLabel(rowCount, totalRows, visibleCols, totalCols) {
    var rowsText = totalRows != null && totalRows !== rowCount ? vt("viewer.table.results.rowsOf", rowCount.toLocaleString(), totalRows.toLocaleString()) : vt(rowCount !== 1 ? "viewer.table.results.rowMany" : "viewer.table.results.rowOne", rowCount.toLocaleString());
    var colsText = "";
    if (totalCols != null && totalCols > 0) {
      colsText = visibleCols != null && visibleCols !== totalCols ? vt("viewer.table.results.colsOf", visibleCols, totalCols) : vt(totalCols !== 1 ? "viewer.table.results.colMany" : "viewer.table.results.colOne", totalCols);
    }
    return colsText ? rowsText + " / " + colsText : rowsText;
  }
  function columnTypeIcon(rawType) {
    if (!rawType) return "\u25CB";
    var t = rawType.toUpperCase();
    if (/INT/.test(t)) return "#";
    if (/CHAR|TEXT|CLOB|STRING/.test(t)) return "T";
    if (/REAL|FLOAT|DOUBLE|NUMERIC|DECIMAL/.test(t)) return ".#";
    if (/BLOB|BINARY/.test(t)) return "\u2B21";
    if (/BOOL/.test(t)) return "\u2713";
    if (/DATE|TIME|TIMESTAMP/.test(t)) return "\u25F7";
    return "\u25CB";
  }
  function formatTableDefBytes(n) {
    if (n == null || !isFinite(n)) return "\u2014";
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    if (n < 1024 * 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + " MB";
    return (n / (1024 * 1024 * 1024)).toFixed(1) + " GB";
  }
  function formatMetaScalar(value) {
    if (value == null) return '<span class="tdm-dim">\u2014</span>';
    var s = String(value);
    var TRUNC = 22;
    if (s.length > TRUNC) {
      return '<span title="' + esc2(s) + '">' + esc2(s.substring(0, TRUNC)) + "\u2026</span>";
    }
    return esc2(s);
  }
  function buildColumnMetaCells(stat) {
    if (!stat) {
      var dash = '<td class="tdm-col"><span class="tdm-dim">\u2014</span></td>';
      return dash + dash + dash + dash + dash + dash + dash;
    }
    var total = stat.total || 0;
    var nonnull = stat.nonnull || 0;
    var fillPct = total > 0 ? Math.round(nonnull / total * 100) : 0;
    var fillTitle = vt("viewer.table.def.fillCellTitle", nonnull, total, stat.nulls);
    var fillCell = '<td class="tdm-col tdm-fill-cell"><span class="tdm-bar" title="' + esc2(fillTitle) + '"><span class="tdm-bar-fill" style="width:' + fillPct + '%"></span></span><span class="tdm-pct">' + fillPct + "%</span></td>";
    var nullsCell = '<td class="tdm-col tdm-num">' + (stat.nulls > 0 ? stat.nulls.toLocaleString() : '<span class="tdm-dim">0</span>') + "</td>";
    var distinctCell = '<td class="tdm-col tdm-num">' + (stat.distinct || 0).toLocaleString() + "</td>";
    var uniqueCell;
    if (total > 0 && stat.distinct === total && stat.nulls === 0) {
      uniqueCell = '<td class="tdm-col tdm-unique" title="' + esc2(vt("viewer.table.def.uniqueKeyTitle")) + '"><span class="tdm-key">\u{1F511}</span> 100%</td>';
    } else if (total > 0) {
      var uPct = Math.round(stat.distinct / total * 100);
      uniqueCell = '<td class="tdm-col tdm-num" title="' + esc2(vt("viewer.table.def.uniqueRatioTitle", stat.distinct, total)) + '">' + uPct + "%</td>";
    } else {
      uniqueCell = '<td class="tdm-col tdm-num"><span class="tdm-dim">\u2014</span></td>';
    }
    var minCell = '<td class="tdm-col tdm-val">' + formatMetaScalar(stat.min) + "</td>";
    var maxCell = '<td class="tdm-col tdm-val">' + formatMetaScalar(stat.max) + "</td>";
    var sizeCell = '<td class="tdm-col tdm-num" title="' + esc2(vt("viewer.table.def.sizeCellTitle")) + '">' + esc2(formatTableDefBytes(stat.bytes)) + "</td>";
    return fillCell + nullsCell + distinctCell + uniqueCell + minCell + maxCell + sizeCell;
  }
  function buildTableDefinitionHtml(tableName) {
    var t = schemaTableByName2(tableName);
    if (!t || !t.columns || t.columns.length === 0) return "";
    var fkSet = {};
    var cachedFks = fkMetaCache[tableName] || [];
    cachedFks.forEach(function(fk) {
      fkSet[fk.fromColumn] = fk;
    });
    var cfg = getColumnConfig(tableName);
    var hiddenCols = cfg && cfg.hidden || [];
    var metaOn = !!tableDefMetaOn;
    var stats = tableDefStats[tableName];
    var showMeta = metaOn && !!stats;
    var rows = t.columns.map(function(c) {
      var rawType = c.type != null ? String(c.type).trim() : "";
      var icon = columnTypeIcon(rawType);
      var iconHtml = '<span class="table-def-icon" title="' + esc2(rawType || vt("viewer.table.def.typeUnspecified")) + '">' + esc2(icon) + "</span>";
      var isHidden = hiddenCols.indexOf(c.name) >= 0;
      var visCell = '<td class="table-def-vis"><input type="checkbox" class="table-def-colvis" data-col-key="' + esc2(c.name) + '"' + (isHidden ? "" : " checked") + ' title="' + esc2(vt("viewer.table.def.visTitle")) + '" aria-label="' + esc2(vt("viewer.table.def.visLabel", c.name)) + '"></td>';
      var badges = "";
      if (c.pk) badges += '<span class="table-def-badge table-def-badge-pk" title="' + esc2(vt("viewer.table.def.badgePk")) + '">\u{1F511}</span>';
      if (fkSet[c.name]) badges += '<span class="table-def-badge table-def-badge-fk" title="' + esc2(vt("viewer.table.def.badgeFk", fkSet[c.name].toTable, fkSet[c.name].toColumn)) + '">\u{1F517}</span>';
      var flags = [];
      if (c.notnull) flags.push(vt("viewer.table.def.flagNotNull"));
      var flagStr = flags.length ? flags.join(", ") : "\u2014";
      var typCell = rawType ? esc2(rawType) : '<span class="table-def-type-empty">' + esc2(vt("viewer.table.def.typeEmpty")) + "</span>";
      var metaCells = showMeta ? buildColumnMetaCells(stats[c.name]) : "";
      return "<tr>" + visCell + '<td class="table-def-icons">' + iconHtml + badges + '</td><td class="table-def-name" data-longpress-copy="' + esc2(c.name) + '">' + esc2(c.name) + '</td><td class="table-def-type">' + typCell + '</td><td class="table-def-flags">' + esc2(flagStr) + "</td>" + metaCells + "</tr>";
    }).join("");
    var metaHeads = showMeta ? '<th class="tdm-col" scope="col" title="' + esc2(vt("viewer.table.def.metaFillTitle")) + '">' + esc2(vt("viewer.table.def.metaFill")) + '</th><th class="tdm-col" scope="col" title="' + esc2(vt("viewer.table.def.metaNullsTitle")) + '">' + esc2(vt("viewer.table.def.metaNulls")) + '</th><th class="tdm-col" scope="col" title="' + esc2(vt("viewer.table.def.metaDistinctTitle")) + '">' + esc2(vt("viewer.table.def.metaDistinct")) + '</th><th class="tdm-col" scope="col" title="' + esc2(vt("viewer.table.def.metaUniqueTitle")) + '">' + esc2(vt("viewer.table.def.metaUnique")) + '</th><th class="tdm-col" scope="col" title="' + esc2(vt("viewer.table.def.metaMinTitle")) + '">' + esc2(vt("viewer.table.def.metaMin")) + '</th><th class="tdm-col" scope="col" title="' + esc2(vt("viewer.table.def.metaMaxTitle")) + '">' + esc2(vt("viewer.table.def.metaMax")) + '</th><th class="tdm-col" scope="col" title="' + esc2(vt("viewer.table.def.metaSizeTitle")) + '">' + esc2(vt("viewer.table.def.metaSize")) + "</th>" : "";
    var metaActive = metaOn ? " is-active" : "";
    var tools = '<span class="table-def-tools"><button type="button" class="table-def-tool' + metaActive + '" data-tdm-action="toggle-meta" title="' + esc2(vt("viewer.table.def.toolMetaTitle")) + '" aria-label="' + esc2(vt("viewer.table.def.toolMetaLabel")) + '" aria-pressed="' + (metaOn ? "true" : "false") + '"><span class="material-symbols-outlined" aria-hidden="true">insights</span></button><button type="button" class="table-def-tool" data-tdm-action="copy-json" title="' + esc2(vt("viewer.table.def.toolJsonTitle")) + '" aria-label="' + esc2(vt("viewer.table.def.toolJsonLabel")) + '"><span class="material-symbols-outlined" aria-hidden="true">data_object</span></button><button type="button" class="table-def-tool" data-tdm-action="copy-flutter" title="' + esc2(vt("viewer.table.def.toolFlutterTitle")) + '" aria-label="' + esc2(vt("viewer.table.def.toolFlutterLabel")) + '"><span class="material-symbols-outlined" aria-hidden="true">flutter_dash</span></button></span>';
    return '<div class="table-definition-wrap td-collapsed" role="region" aria-label="' + esc2(vt("viewer.table.def.regionLabel")) + '" data-table-name="' + esc2(tableName) + '"><div class="table-definition-heading"><span class="table-definition-heading-label">' + esc2(vt("viewer.table.def.headingLabel")) + "</span>" + tools + '</div><div class="table-definition-scroll"><table class="table-definition"><thead><tr><th class="table-def-vis" scope="col" title="' + esc2(vt("viewer.table.def.colShowTitle")) + '">' + esc2(vt("viewer.table.def.colShow")) + '</th><th class="table-def-icons" scope="col"></th><th scope="col">' + esc2(vt("viewer.table.def.colColumn")) + '</th><th scope="col">' + esc2(vt("viewer.table.def.colType")) + '</th><th scope="col">' + esc2(vt("viewer.table.def.colConstraints")) + "</th>" + metaHeads + "</tr></thead><tbody>" + rows + "</tbody></table></div></div>";
  }
  function bindResultsToggle() {
    var headings = document.querySelectorAll(".results-table-heading");
    for (var i = 0; i < headings.length; i++) {
      var heading = headings[i];
      if (heading.hasAttribute("data-toggle-bound")) continue;
      heading.setAttribute("data-toggle-bound", "1");
      heading.addEventListener("click", function() {
        var wrap = this.closest(".results-table-wrap");
        if (!wrap) return;
        wrap.classList.toggle("results-collapsed");
      });
    }
  }
  function renderTableView(name, data) {
    const content = document.getElementById("content");
    const scope = getScope();
    const filtered2 = filterRows(data);
    const displayData = getTableDisplayData(data);
    const jsonStr = JSON.stringify(displayData, null, 2);
    setLastRenderedData(jsonStr);
    const metaText = rowCountText(name) + buildTableFilterMetaSuffix(filtered2.length, data.length);
    var formatBar = document.getElementById("display-format-bar");
    if (formatBar) formatBar.style.display = scope !== "schema" ? "flex" : "none";
    var rowDisplayWrap = document.getElementById("row-display-toggle-wrap");
    if (rowDisplayWrap) {
      rowDisplayWrap.style.display = scope === "data" || scope === "both" ? "flex" : "none";
      var allBtn = document.getElementById("row-display-all");
      var matchBtn = document.getElementById("row-display-matching");
      if (allBtn) allBtn.classList.toggle("active", !showOnlyMatchingRows);
      if (matchBtn) matchBtn.classList.toggle("active", showOnlyMatchingRows);
    }
    if (!fkMetaCache[name] && scope !== "both") {
      content.innerHTML = '<p class="meta">' + metaText + '</p><p class="meta">' + vt("viewer.table.results.loading") + "</p>";
    }
    function renderDataHtml(fkMap, colTypes) {
      var defHtml = buildTableDefinitionHtml(name);
      var rawTableHtml = wrapDataTableInScroll(buildDataTableHtml(displayData, fkMap, colTypes, getColumnConfig(name))) + buildTableStatusBar(tableCounts[name], offset, limit, displayData.length, getVisibleColumnCount(Object.keys(displayData[0] || {}), getColumnConfig(name)));
      var rowCount = displayData.length;
      var totalCount = tableCounts[name];
      var resultDataKeys = Object.keys(displayData[0] || {});
      var resultsLabel = buildResultsLabel(
        rowCount,
        totalCount != null ? totalCount : null,
        getVisibleColumnCount(resultDataKeys, getColumnConfig(name)),
        resultDataKeys.length
      );
      var tableHtml = '<div class="results-table-wrap" role="region" aria-label="' + esc2(vt("viewer.table.results.regionLabel")) + '"><div class="results-table-heading">' + vt("viewer.table.results.heading", resultsLabel) + '</div><div class="results-table-body">' + rawTableHtml + "</div></div>";
      var qbHtml = buildQueryBuilderHtml(name, colTypes);
      if (scope === "both") {
        setLastRenderedSchema(cachedSchema);
        if (cachedSchema === null) {
          fetch("/api/schema", authOpts()).then(function(r) {
            return r.text();
          }).then(function(schema) {
            setCachedSchema(schema);
            setLastRenderedSchema(schema);
            content.innerHTML = buildBothViewSectionsHtml(name, metaText, qbHtml, tableHtml, schema, defHtml);
            bindQueryBuilderEvents(colTypes);
            if (queryBuilderState) restoreQueryBuilderUIState(queryBuilderState);
            applySearch();
            renderBreadcrumb();
            bindColumnTableEvents();
            bindResultsToggle();
          });
        } else {
          var dataSection = document.getElementById("both-data-section");
          if (dataSection) {
            var dataBody = dataSection.querySelector(".collapsible-body");
            var headerEl = dataSection.querySelector(".collapsible-header");
            if (dataBody) dataBody.innerHTML = '<p class="meta">' + metaText + "</p>" + defHtml + qbHtml + tableHtml;
            if (headerEl) headerEl.textContent = vt("viewer.table.results.dataHeader", name);
            bindColumnTableEvents();
            bindQueryBuilderEvents(colTypes);
            if (queryBuilderState) restoreQueryBuilderUIState(queryBuilderState);
          }
          applySearch();
          renderBreadcrumb();
          bindResultsToggle();
        }
      } else {
        setLastRenderedSchema(null);
        content.innerHTML = '<p class="meta">' + metaText + "</p>" + defHtml + qbHtml + tableHtml;
        bindQueryBuilderEvents(colTypes);
        if (queryBuilderState) restoreQueryBuilderUIState(queryBuilderState);
        applySearch();
        renderBreadcrumb();
        bindColumnTableEvents();
        bindResultsToggle();
      }
    }
    Promise.all([
      loadFkMeta(name),
      loadColumnTypes(name).catch(function() {
        return {};
      })
    ]).then(function(results) {
      var fks = results[0];
      var colTypes = results[1];
      var fkMap = {};
      (fks || []).forEach(function(fk) {
        fkMap[fk.fromColumn] = fk;
      });
      renderDataHtml(fkMap, colTypes);
    });
  }
  function getVisibleDataColumnKeys(childElement) {
    var root = childElement ? childElement.closest(".drift-table") : null;
    if (!root) root = document.querySelector(".drift-table");
    if (!root) return [];
    var ths = root.querySelectorAll("thead th[data-column-key]");
    return Array.prototype.slice.call(ths).map(function(th) {
      return th.getAttribute("data-column-key") || "";
    });
  }
  function schemaTableByName2(name) {
    var meta = schemaMeta;
    if (!meta || !meta.tables || !name) return null;
    for (var i = 0; i < meta.tables.length; i++) {
      if (meta.tables[i].name === name) return meta.tables[i];
    }
    return null;
  }
  function getPkColumnNameForDataTable() {
    var t = schemaTableByName2(currentTableName);
    if (!t || !t.columns) return null;
    for (var i = 0; i < t.columns.length; i++) {
      if (t.columns[i].pk) return t.columns[i].name;
    }
    return null;
  }
  function getSinglePkColumnName(tableName) {
    var t = schemaTableByName2(tableName);
    if (!t || !t.columns) return null;
    var pkCols = t.columns.filter(function(c) {
      return !!c.pk;
    });
    if (pkCols.length !== 1) return null;
    return pkCols[0].name;
  }
  function syncMastheadMaskBadge(checked) {
    var badge = document.getElementById("masthead-mask-badge");
    if (badge) badge.style.display = checked ? "" : "none";
  }
  function initPiiMaskToggle() {
    var cb = document.getElementById("tb-mask-checkbox");
    var sw = document.getElementById("tb-mask-toggle");
    if (!cb) return;
    function syncSwitch() {
      if (sw) sw.setAttribute("aria-pressed", cb.checked ? "true" : "false");
    }
    syncMastheadMaskBadge(cb.checked);
    syncSwitch();
    cb.addEventListener("change", function() {
      syncMastheadMaskBadge(cb.checked);
      syncSwitch();
      if (currentTableName && currentTableJson) {
        renderTableView(currentTableName, currentTableJson);
      }
      var searchResults = document.getElementById("search-results");
      if (searchResults && searchResults.innerHTML.indexOf("<table") >= 0) {
        applySearch();
      }
    });
  }

  // assets/web/session.ts
  function captureViewerState() {
    var state = {
      currentTable: currentTableName,
      sqlInput: document.getElementById("sql-input").value,
      searchTerm: document.getElementById("search-input") ? document.getElementById("search-input").value : "",
      theme: localStorage.getItem(THEME_KEY),
      limit,
      offset,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
    return state;
  }
  function copyShareUrl(shareUrl, expiresAt) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(shareUrl).then(function() {
        alert(vt("viewer.session.share.copied", shareUrl, new Date(expiresAt).toLocaleString()));
      }).catch(function() {
        prompt(vt("viewer.session.share.promptCopy"), shareUrl);
      });
    } else {
      prompt(vt("viewer.session.share.promptCopy"), shareUrl);
    }
  }
  function createShareSession() {
    var note = prompt(vt("viewer.session.share.promptNote"));
    if (note === null) return;
    var btn = document.getElementById("tb-share-btn");
    btn.disabled = true;
    setButtonBusy(btn, true, vt("viewer.session.share.busy"));
    var state = captureViewerState();
    if (note) state.note = note;
    fetch("/api/session/share", authOpts({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state)
    })).then(function(r) {
      if (!r.ok) throw new Error(vt("viewer.session.share.serverError", r.status));
      return r.json();
    }).then(function(data) {
      copyShareUrl(location.origin + location.pathname + data.url, data.expiresAt);
    }).catch(function(e) {
      alert(vt("viewer.session.share.failed", e.message));
    }).finally(function() {
      btn.disabled = false;
      btn.classList.remove("btn-busy");
      btn.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">share</span>' + vt("viewer.session.share.menuLabel");
    });
  }
  function applySessionState(state) {
    if (state.currentTable) {
      setTimeout(function() {
        openTableTab(state.currentTable);
      }, 500);
    }
    if (state.sqlInput) {
      document.getElementById("sql-input").value = state.sqlInput;
    }
    if (state.searchTerm && document.getElementById("search-input")) {
      document.getElementById("search-input").value = state.searchTerm;
    }
    if (state.limit) setLimit(state.limit);
    if (state.offset) setOffset(state.offset);
  }
  function showSessionExpiredBanner() {
    var banner = document.createElement("div");
    banner.style.cssText = "background:#f8d7da;color:#721c24;padding:0.75rem;font-size:13px;text-align:center;border-bottom:2px solid #f5c6cb;";
    banner.innerHTML = "<strong>" + vt("viewer.session.expired.title") + "</strong><br>" + vt("viewer.session.expired.body") + '<br><span style="font-size:11px;color:#856404;">' + vt("viewer.session.expired.hint") + "</span>";
    document.body.prepend(banner);
  }
  function updateSessionCountdown(countdownEl) {
    var target = currentSessionExpiresAt;
    if (!target) return;
    var now = /* @__PURE__ */ new Date();
    var exp = new Date(target);
    var diffMs = exp.getTime() - now.getTime();
    if (diffMs <= 0) {
      countdownEl.textContent = vt("viewer.session.countdown.expired");
      countdownEl.style.color = "#ff4444";
      var bar = document.getElementById("session-info-bar");
      if (bar) bar.style.background = "#cc3333";
      if (sessionCountdownInterval) {
        clearInterval(sessionCountdownInterval);
        setSessionCountdownInterval(null);
      }
      var extBtn = document.getElementById("session-extend-btn");
      if (extBtn) extBtn.style.display = "none";
      return;
    }
    var mins = Math.floor(diffMs / 6e4);
    var secs = Math.floor(diffMs % 6e4 / 1e3);
    if (mins < 10) {
      countdownEl.style.color = "#ffcc00";
      countdownEl.textContent = vt("viewer.session.countdown.expiresInMinSec", mins, secs);
      if (!sessionFastMode && sessionCountdownInterval) {
        setSessionFastMode(true);
        clearInterval(sessionCountdownInterval);
        setSessionCountdownInterval(setInterval(function() {
          updateSessionCountdown(countdownEl);
        }, 1e4));
      }
      if (!sessionWarningShown) {
        setSessionWarningShown(true);
        var warningBanner = document.createElement("div");
        warningBanner.id = "session-expiry-warning";
        warningBanner.style.cssText = "background:#fff3cd;color:#856404;padding:0.3rem 0.5rem;font-size:12px;text-align:center;border-bottom:1px solid #ffc107;";
        warningBanner.textContent = vt("viewer.session.countdown.warning");
        var bar = document.getElementById("session-info-bar");
        if (bar && bar.nextSibling) {
          bar.parentNode.insertBefore(warningBanner, bar.nextSibling);
        } else if (bar) {
          bar.parentNode.appendChild(warningBanner);
        }
      }
    } else {
      countdownEl.textContent = vt("viewer.session.countdown.expiresInMin", mins);
    }
  }
  function extendSession() {
    if (!currentSessionId) return;
    var extBtn = document.getElementById("session-extend-btn");
    if (extBtn) {
      extBtn.disabled = true;
      extBtn.textContent = vt("viewer.session.extend.busy");
    }
    fetch(
      "/api/session/" + encodeURIComponent(currentSessionId) + "/extend",
      authOpts({ method: "POST" })
    ).then(function(r) {
      if (!r.ok) throw new Error(vt("viewer.session.extend.serverError"));
      return r.json();
    }).then(function(data) {
      setCurrentSessionExpiresAt(data.expiresAt);
      setSessionWarningShown(false);
      setSessionFastMode(false);
      var warning = document.getElementById("session-expiry-warning");
      if (warning) warning.remove();
      var bar = document.getElementById("session-info-bar");
      if (bar) bar.style.background = "var(--link)";
      var countdownEl = document.getElementById("session-countdown");
      if (countdownEl) {
        countdownEl.style.color = "";
        if (sessionCountdownInterval) clearInterval(sessionCountdownInterval);
        updateSessionCountdown(countdownEl);
        setSessionCountdownInterval(setInterval(function() {
          updateSessionCountdown(countdownEl);
        }, 3e4));
      }
      showCopyToast(vt("viewer.session.extend.done"));
    }).catch(function(e) {
      alert(vt("viewer.session.extend.failed", e.message));
    }).finally(function() {
      if (extBtn) {
        extBtn.disabled = false;
        extBtn.textContent = vt("viewer.session.extend.label");
      }
    });
  }
  function renderSessionInfoBar(state, createdAt, expiresAt) {
    var infoBar = document.createElement("div");
    infoBar.id = "session-info-bar";
    infoBar.style.cssText = "background:var(--link);color:var(--bg);padding:0.3rem 0.5rem;font-size:12px;text-align:center;";
    var info = state.note ? vt("viewer.session.info.sharedWithNote", esc2(state.note)) : vt("viewer.session.info.shared");
    info += vt("viewer.session.info.created", new Date(createdAt).toLocaleString());
    var infoSpan = document.createElement("span");
    infoSpan.textContent = info;
    var countdownSpan = document.createElement("span");
    countdownSpan.id = "session-countdown";
    countdownSpan.style.cssText = "margin-left:1rem;font-weight:bold;";
    var extendBtn = document.createElement("button");
    extendBtn.id = "session-extend-btn";
    extendBtn.textContent = vt("viewer.session.extend.label");
    extendBtn.title = vt("viewer.session.extend.title");
    extendBtn.style.cssText = "margin-left:0.5rem;font-size:11px;padding:0.1rem 0.4rem;cursor:pointer;background:var(--bg);color:var(--link);border:1px solid var(--bg);border-radius:3px;";
    extendBtn.addEventListener("click", function() {
      extendSession();
    });
    infoBar.appendChild(infoSpan);
    infoBar.appendChild(countdownSpan);
    infoBar.appendChild(extendBtn);
    document.body.prepend(infoBar);
    setCurrentSessionExpiresAt(expiresAt);
    updateSessionCountdown(countdownSpan);
    setSessionCountdownInterval(setInterval(function() {
      updateSessionCountdown(countdownSpan);
    }, 3e4));
  }
  function renderSessionAnnotations(annotations) {
    if (!annotations || annotations.length === 0) return;
    var annoEl = document.createElement("div");
    annoEl.style.cssText = "background:var(--bg-pre);padding:0.3rem 0.5rem;font-size:11px;border-left:3px solid var(--link);margin:0.3rem 0;";
    var annoHtml = "<strong>" + vt("viewer.session.annotations.heading") + "</strong><br>";
    annotations.forEach(function(a) {
      annoHtml += '<span class="meta">[' + esc2(a.author) + " at " + new Date(a.at).toLocaleTimeString() + "]</span> " + esc2(a.text) + "<br>";
    });
    annoEl.innerHTML = annoHtml;
    document.body.children[1] ? document.body.insertBefore(annoEl, document.body.children[1]) : document.body.appendChild(annoEl);
  }
  function restoreSession() {
    var params = new URLSearchParams(location.search);
    var sessionId = params.get("session");
    if (!sessionId) return;
    fetch("/api/session/" + encodeURIComponent(sessionId), authOpts()).then(function(r) {
      if (!r.ok) {
        showSessionExpiredBanner();
        throw new Error("Session expired or not found");
      }
      return r.json();
    }).then(function(data) {
      var state = data.state || {};
      setCurrentSessionId(sessionId);
      setCurrentSessionExpiresAt(data.expiresAt);
      applySessionState(state);
      renderSessionInfoBar(state, data.createdAt, data.expiresAt);
      renderSessionAnnotations(data.annotations);
    }).catch(function(e) {
      console.warn("Session restore failed:", e.message);
    });
  }

  // assets/web/sidebar-panels.ts
  var PANEL_KEY = "saropa_sidebar_panel";
  var COLLAPSED_CLASS = "app-sidebar-panel-collapsed";
  var sidebar = null;
  var layout = null;
  function persist(panel, collapsed) {
    try {
      localStorage.setItem(PANEL_KEY, JSON.stringify({ panel, collapsed }));
    } catch (e) {
    }
  }
  function syncIcons() {
    if (!sidebar || !layout) return;
    const active = sidebar.getAttribute("data-active-panel");
    const collapsed = layout.classList.contains(COLLAPSED_CLASS);
    document.querySelectorAll("[data-panel-btn]").forEach(function(btn) {
      const on = btn.getAttribute("data-panel-btn") === active && !collapsed;
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      btn.classList.toggle("active", on);
    });
  }
  function selectPanel(name) {
    if (!sidebar || !layout) return;
    sidebar.setAttribute("data-active-panel", name);
    layout.classList.remove(COLLAPSED_CLASS);
    sidebar.setAttribute("aria-hidden", "false");
    persist(name, false);
    syncIcons();
  }
  function setSidebarCollapsed(collapsed) {
    if (!sidebar || !layout) return;
    layout.classList.toggle(COLLAPSED_CLASS, collapsed);
    sidebar.setAttribute("aria-hidden", collapsed ? "true" : "false");
    persist(sidebar.getAttribute("data-active-panel") || "tables", collapsed);
    syncIcons();
  }
  function isSidebarCollapsed() {
    return !!layout && layout.classList.contains(COLLAPSED_CLASS);
  }
  function togglePanel(name) {
    if (!sidebar || !layout) return;
    const isActive = sidebar.getAttribute("data-active-panel") === name;
    const collapsed = layout.classList.contains(COLLAPSED_CLASS);
    if (isActive && !collapsed) {
      setSidebarCollapsed(true);
      return;
    }
    selectPanel(name);
  }
  function initSidebarPanels() {
    sidebar = document.getElementById("app-sidebar");
    layout = document.getElementById("app-layout");
    if (!sidebar || !layout) return;
    const ask = document.getElementById("sidebar-ask");
    if (ask && ask.parentElement !== sidebar) sidebar.appendChild(ask);
    let panel = "tables";
    let collapsed = false;
    try {
      const raw = localStorage.getItem(PANEL_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.panel === "string") panel = parsed.panel;
        collapsed = !!(parsed && parsed.collapsed);
      }
    } catch (e) {
    }
    sidebar.setAttribute("data-active-panel", panel);
    layout.classList.toggle(COLLAPSED_CLASS, collapsed);
    sidebar.setAttribute("aria-hidden", collapsed ? "true" : "false");
    document.querySelectorAll("[data-panel-btn]").forEach(function(btn) {
      const name = btn.getAttribute("data-panel-btn");
      if (name) btn.addEventListener("click", function() {
        togglePanel(name);
      });
    });
    syncIcons();
  }

  // assets/web/nl-modal.ts
  var nlRecognition = null;
  var nlMicActive = false;
  var lastNlResult = null;
  var nlBaseQuestion = "";
  function effectiveNlQuestion(raw) {
    var ref = detectRefinement(raw);
    if (ref.isRefinement && nlBaseQuestion) {
      return combineRefinement(nlBaseQuestion, ref.fragment);
    }
    return raw;
  }
  function setNlRefineHint(combined) {
    var hint = document.getElementById("nl-refine-hint");
    if (!hint) return;
    if (combined) {
      hint.textContent = vt("viewer.sql.nl.refineHint", combined);
      hint.hidden = false;
    } else {
      hint.textContent = "";
      hint.hidden = true;
    }
  }
  function nlSpeechApi() {
    var w = window;
    return w.SpeechRecognition || w.webkitSpeechRecognition || null;
  }
  function setNlMicRecording(on) {
    nlMicActive = on;
    var btn = document.getElementById("nl-mic");
    if (!btn) return;
    btn.classList.toggle("recording", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    var icon = btn.querySelector(".material-symbols-outlined");
    if (icon) icon.textContent = on ? "mic_off" : "mic";
  }
  function ensureNlRecognition() {
    if (nlRecognition) return nlRecognition;
    var Api = nlSpeechApi();
    if (!Api) return null;
    var rec = new Api();
    rec.lang = navigator.language || "en-US";
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = function(event) {
      var ta = document.getElementById("nl-modal-input");
      if (!ta) return;
      var transcript = "";
      for (var i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) transcript += event.results[i][0].transcript;
      }
      transcript = transcript.trim();
      if (!transcript) return;
      if (interpretNlKeyword(transcript)) return;
      var existing = String(ta.value || "");
      ta.value = existing ? existing.replace(/\s*$/, "") + " " + transcript : transcript;
      scheduleNlLivePreview();
    };
    rec.onerror = function(event) {
      var code = event && event.error;
      if (code === "not-allowed" || code === "service-not-allowed") {
        setNlModalError(vt("viewer.sql.nl.mic.blocked"), true);
      } else if (code === "no-speech") {
        setNlModalError(vt("viewer.sql.nl.mic.noSpeech"), true);
      } else if (code !== "aborted") {
        setNlModalError(vt("viewer.sql.nl.mic.error", code), true);
      }
    };
    rec.onend = function() {
      setNlMicRecording(false);
    };
    nlRecognition = rec;
    return rec;
  }
  function toggleNlMic() {
    var rec = ensureNlRecognition();
    if (!rec) return;
    if (nlMicActive) {
      rec.stop();
      return;
    }
    setNlModalError("", false);
    try {
      rec.start();
      setNlMicRecording(true);
    } catch (err) {
      setNlMicRecording(false);
    }
  }
  function clearNlQuestion() {
    var ta = document.getElementById("nl-modal-input");
    if (!ta) return;
    ta.value = "";
    nlBaseQuestion = "";
    setNlModalError("", false);
    ta.focus();
    scheduleNlLivePreview();
  }
  function interpretNlKeyword(text) {
    if (!getPref(PREF_NL_KEYWORDS, DEFAULTS[PREF_NL_KEYWORDS])) return false;
    var cmd = detectNlKeyword(text);
    if (!cmd) return false;
    if (cmd.kind === "clear") {
      clearNlQuestion();
      return true;
    }
    if (cmd.kind === "run") {
      previewNlResults();
      return true;
    }
    if (cmd.kind === "temporalSwap") {
      var swapped = applyTemporalSwap(nlBaseQuestion, cmd.phrase);
      if (!swapped) return false;
      var ta = document.getElementById("nl-modal-input");
      if (ta) ta.value = swapped;
      nlBaseQuestion = swapped;
      scheduleNlLivePreview();
      return true;
    }
    return false;
  }
  function stopNlMic() {
    if (nlRecognition && nlMicActive) {
      nlRecognition.abort();
    }
    setNlMicRecording(false);
  }
  function resetNlHelpSections() {
    var panel = document.getElementById("nl-help-panel");
    if (!panel) return;
    var secs = panel.querySelectorAll(".nl-help-sec");
    for (var i = 0; i < secs.length; i++) {
      var sec = secs[i];
      sec.open = i === 0;
      sec.hidden = false;
      var items = sec.querySelectorAll("li");
      for (var j = 0; j < items.length; j++) items[j].hidden = false;
    }
    var empty = panel.querySelector(".nl-help-empty");
    if (empty) empty.hidden = true;
  }
  function filterNlHelp() {
    var input = document.getElementById("nl-help-search");
    var panel = document.getElementById("nl-help-panel");
    if (!input || !panel) return;
    var term = String(input.value || "").trim().toLowerCase();
    if (!term) {
      resetNlHelpSections();
      return;
    }
    var secs = panel.querySelectorAll(".nl-help-sec");
    var anyVisible = false;
    for (var i = 0; i < secs.length; i++) {
      var sec = secs[i];
      var items = sec.querySelectorAll("li");
      var secHas = false;
      for (var j = 0; j < items.length; j++) {
        var el = items[j];
        var match = (el.textContent || "").toLowerCase().indexOf(term) >= 0;
        el.hidden = !match;
        if (match) secHas = true;
      }
      sec.hidden = !secHas;
      sec.open = secHas;
      if (secHas) anyVisible = true;
    }
    var empty = panel.querySelector(".nl-help-empty");
    if (empty) empty.hidden = anyVisible;
  }
  function toggleNlHelp() {
    var panel = document.getElementById("nl-help-panel");
    var btn = document.getElementById("nl-help");
    if (!panel) return;
    var show = panel.hidden;
    panel.hidden = !show;
    if (btn) btn.setAttribute("aria-expanded", show ? "true" : "false");
    if (show) {
      var input = document.getElementById("nl-help-search");
      if (input) input.value = "";
      resetNlHelpSections();
    }
  }
  function hideNlHelp() {
    var panel = document.getElementById("nl-help-panel");
    var btn = document.getElementById("nl-help");
    if (panel) panel.hidden = true;
    if (btn) btn.setAttribute("aria-expanded", "false");
  }
  function setNlModalError(msg, visible) {
    var modalErr = document.getElementById("nl-modal-error");
    if (visible && msg) {
      if (modalErr) {
        modalErr.textContent = msg;
        modalErr.style.display = "block";
      }
    } else if (modalErr) {
      modalErr.style.display = "none";
    }
  }
  function nlSingular(n) {
    if (/ies$/.test(n)) return n.replace(/ies$/, "y");
    if (/(ses|xes|zes|ches|shes)$/.test(n)) return n.replace(/es$/, "");
    if (/s$/.test(n) && !/ss$/.test(n)) return n.replace(/s$/, "");
    return n;
  }
  function nlTableOverride() {
    var sel = document.getElementById("nl-table-select");
    return sel && sel.value ? sel.value : void 0;
  }
  function populateNlTableSelect(meta) {
    var sel = document.getElementById("nl-table-select");
    if (!sel || sel.options.length > 1) return;
    var tables = meta && meta.tables || [];
    for (var i = 0; i < tables.length; i++) {
      var o = document.createElement("option");
      o.value = tables[i].name;
      o.textContent = tables[i].name;
      sel.appendChild(o);
    }
  }
  function updateNlClarifier(result) {
    var hint = document.getElementById("nl-clarify-hint");
    var clarify = document.getElementById("nl-clarify");
    if (!hint || !clarify) return;
    var guessed = result && result.table && !nlTableOverride() && (result.confidence === "guess" || result.confidence === "ambiguous");
    if (guessed) {
      hint.textContent = vt("viewer.sql.nl.clarify.guessed", result.table);
      clarify.classList.add("nl-clarify-guess");
    } else {
      hint.textContent = "";
      clarify.classList.remove("nl-clarify-guess");
    }
  }
  function nlRefinements(tableName, meta) {
    var tables = meta && meta.tables || [];
    var t = null;
    for (var i = 0; i < tables.length; i++) if (tables[i].name === tableName) {
      t = tables[i];
      break;
    }
    if (!t) return [];
    var cols = t.columns || [];
    var fks = meta && meta.foreignKeys || [];
    var chips = [];
    var children = fks.filter(function(e) {
      return e.toTable === tableName;
    });
    for (var i = 0; i < children.length && i < 2; i++) {
      var ct = children[i].fromTable;
      chips.push({ label: ">1 " + ct, phrase: "with more than one " + nlSingular(ct) });
      chips.push({ label: "no " + ct, phrase: "without any " + ct });
    }
    var parents = fks.filter(function(e) {
      return e.fromTable === tableName;
    });
    for (var i = 0; i < parents.length && i < 1; i++) {
      var pt = parents[i].toTable;
      chips.push({ label: "has " + nlSingular(pt), phrase: "with a " + nlSingular(pt) });
    }
    var dateCol = cols.filter(isDateColumn)[0];
    if (dateCol) {
      chips.push({ label: "this week", phrase: "created this week" });
      chips.push({ label: "today", phrase: "changed today" });
      chips.push({ label: "stale 90d", phrase: "not updated in 90 days" });
    }
    var boolCols = cols.filter(function(c) {
      return c.driftType === "bool" || /bool|int/i.test(c.type || "") && /^is_|^has_|active|enabled|verified|archived|deleted|subscribed/i.test(c.name);
    });
    for (var i = 0; i < boolCols.length && i < 2; i++) {
      var nm = boolCols[i].name.toLowerCase().replace(/^(is|has)_/, "").replace(/_/g, " ");
      chips.push({ label: "only " + nm, phrase: nm });
    }
    var numCol = cols.filter(function(c) {
      return /int|real|num|float|double|dec/i.test(c.type || "") && !/^id$|_id$|date|time|_at\b|_on\b|created|updated|changed|timestamp|^is_|^has_|active|enabled|disabled|verified|visible|hidden|archived|deleted|locked|subscribed|public|private/i.test(c.name);
    })[0];
    if (numCol) chips.push({ label: "highest " + numCol.name, phrase: "highest " + numCol.name });
    chips.push({ label: "count", phrase: "as a total" });
    chips.push({ label: "newest", phrase: "newest first" });
    chips.push({ label: "top 10", phrase: "top 10" });
    return chips.slice(0, 10);
  }
  function toggleNlRefinement(phrase) {
    var ta = document.getElementById("nl-modal-input");
    if (!ta) return;
    var cur = String(ta.value || "");
    var idx = cur.toLowerCase().indexOf(phrase.toLowerCase());
    if (idx >= 0) {
      ta.value = (cur.slice(0, idx) + cur.slice(idx + phrase.length)).replace(/\s{2,}/g, " ").trim();
    } else {
      ta.value = (cur.trim() + " " + phrase).trim();
    }
    ta.focus();
    scheduleNlLivePreview();
  }
  function renderNlRefinements(tableName, meta) {
    var wrap = document.getElementById("nl-refine");
    if (!wrap) return;
    var ta = document.getElementById("nl-modal-input");
    var q = (ta ? String(ta.value || "") : "").toLowerCase();
    var chips = nlRefinements(tableName, meta);
    wrap.innerHTML = "";
    chips.forEach(function(chip) {
      var applied = q.indexOf(chip.phrase.toLowerCase()) >= 0;
      var b = document.createElement("button");
      b.type = "button";
      b.className = "nl-chip" + (applied ? " nl-chip-on" : "");
      b.textContent = chip.label;
      b.title = vt(applied ? "viewer.sql.nl.chip.remove" : "viewer.sql.nl.chip.add", chip.phrase);
      b.addEventListener("click", function() {
        toggleNlRefinement(chip.phrase);
      });
      wrap.appendChild(b);
    });
  }
  async function applyNlLivePreview() {
    var ta = document.getElementById("nl-modal-input");
    var preview = document.getElementById("nl-modal-sql-preview");
    if (!ta || !preview) return;
    var question = String(ta.value || "").trim();
    clearNlPreviewResults();
    try {
      var meta = await loadSchemaMeta();
      populateNlTableSelect(meta);
      var override = nlTableOverride();
      if (!question) {
        preview.value = "";
        setNlModalError("", false);
        setNlRefineHint("");
        nlBaseQuestion = "";
        updateNlClarifier(null);
        var first = override || meta.tables && meta.tables[0] && meta.tables[0].name;
        renderNlRefinements(first, meta);
        return;
      }
      var effective = effectiveNlQuestion(question);
      var refining = effective !== question;
      setNlRefineHint(refining ? effective : "");
      var result = nlToSql(effective, meta, { table: override });
      lastNlResult = result;
      if (result.sql) {
        preview.value = result.sql;
        setNlModalError("", false);
        if (!refining) nlBaseQuestion = question;
        if (result.wake) previewNlResults();
      } else if (result.wake) {
        preview.value = "";
        setNlModalError("", false);
        renderNlNarrativeMessage(vt("viewer.sql.nl.noQuestion"));
      } else {
        preview.value = "";
        setNlModalError(result.error || vt("viewer.sql.nl.convertFailed"), true);
      }
      updateNlClarifier(result);
      renderNlRefinements(result && result.table || override, meta);
    } catch (err) {
      preview.value = "";
      setNlModalError(vt("viewer.sql.nl.error", err.message || err), true);
    }
  }
  function scheduleNlLivePreview() {
    if (nlLiveDebounce) clearTimeout(nlLiveDebounce);
    setNlLiveDebounce(setTimeout(function() {
      setNlLiveDebounce(null);
      applyNlLivePreview();
    }, 120));
  }
  function closeNlModal() {
    stopNlMic();
    hideNlHelp();
    clearNlPreviewResults();
  }
  async function useNlModal() {
    var ta = document.getElementById("nl-modal-input");
    var sqlEl = document.getElementById("sql-input");
    if (!ta || !sqlEl) return;
    var question = String(ta.value || "").trim();
    if (!question) {
      setNlModalError(vt("viewer.sql.nl.enterQuestion"), true);
      return;
    }
    try {
      var meta = await loadSchemaMeta();
      var effective = effectiveNlQuestion(question);
      var result = nlToSql(effective, meta);
      if (result.sql) {
        nlBaseQuestion = effective;
        setNlRefineHint("");
        sqlEl.value = result.sql;
        var mainErr = document.getElementById("sql-error");
        if (mainErr) {
          mainErr.textContent = "";
          mainErr.style.display = "none";
        }
        openTool("sql");
        setNlModalError("", false);
        closeNlModal();
      } else {
        setNlModalError(result.error || vt("viewer.sql.nl.convertFailed"), true);
      }
    } catch (err) {
      setNlModalError(vt("viewer.sql.nl.error", err.message || err), true);
    }
  }
  async function copyNlSql() {
    var preview = document.getElementById("nl-modal-sql-preview");
    var btn = document.getElementById("nl-copy");
    var sql = preview ? String(preview.value || "").trim() : "";
    if (!sql) {
      setNlModalError(vt("viewer.sql.nl.copyEmpty"), true);
      return;
    }
    try {
      await navigator.clipboard.writeText(sql);
    } catch (err) {
      try {
        preview.focus();
        preview.select();
        document.execCommand("copy");
      } catch (err2) {
        setNlModalError(vt("viewer.sql.nl.copyFailed"), true);
        return;
      }
    }
    if (btn) {
      var icon = btn.querySelector(".material-symbols-outlined");
      if (icon) {
        var prev = icon.textContent;
        icon.textContent = "check";
        btn.classList.add("copied");
        setTimeout(function() {
          icon.textContent = prev;
          btn.classList.remove("copied");
        }, 1100);
      }
    }
  }
  async function previewNlResults() {
    var preview = document.getElementById("nl-modal-sql-preview");
    var resultsEl = document.getElementById("nl-modal-results");
    var btn = document.getElementById("nl-preview-run");
    var sql = preview ? String(preview.value || "").trim() : "";
    if (!sql) {
      setNlModalError(vt("viewer.sql.nl.previewNeedsSql"), true);
      return;
    }
    if (!resultsEl) return;
    setNlModalError("", false);
    var inner = sql.replace(/;\s*$/, "");
    var limited = "SELECT * FROM (\n" + inner + "\n) LIMIT 10";
    var origLabel = btn ? btn.textContent : "";
    if (btn) {
      btn.disabled = true;
      setButtonBusy(btn, true, vt("viewer.sql.nl.preview.busy"));
    }
    try {
      var resp = await fetch("/api/sql", authOpts({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: limited })
      }));
      var data = await resp.json();
      if (!resp.ok) {
        setNlModalError(data.error || vt("viewer.sql.nl.previewFailed"), true);
        resultsEl.hidden = true;
        resultsEl.innerHTML = "";
        return;
      }
      renderNlPreviewRows(resultsEl, data.rows || []);
      var nlInput = document.getElementById("nl-modal-input");
      var ranQuestion = nlInput ? String(nlInput.value || "").trim() : "";
      if (ranQuestion) {
        nlBaseQuestion = effectiveNlQuestion(ranQuestion);
        setNlRefineHint("");
      }
      if (lastNlResult && lastNlResult.wake) {
        await renderNlNarrative(resultsEl, lastNlResult, data.rows || []);
      }
    } catch (err) {
      setNlModalError(vt("viewer.sql.nl.previewError", err.message || err), true);
      resultsEl.hidden = true;
      resultsEl.innerHTML = "";
    } finally {
      if (btn) {
        btn.disabled = false;
        setButtonBusy(btn, false, origLabel || vt("nl.modal.preview"));
      }
    }
  }
  function renderNlPreviewRows(container, rows) {
    container.hidden = false;
    if (!rows || rows.length === 0) {
      container.innerHTML = '<p class="meta nl-modal-results-empty">' + esc2(vt("viewer.sql.nl.results.empty")) + "</p>";
      return;
    }
    var keys = Object.keys(rows[0]);
    var html = '<p class="meta">' + esc2(vt("viewer.sql.nl.results.firstRows", rows.length)) + "</p>";
    html += '<div class="data-table-scroll-wrap"><table><thead><tr>';
    html += keys.map(function(k) {
      return "<th>" + esc2(k) + "</th>";
    }).join("");
    html += "</tr></thead><tbody>";
    rows.forEach(function(row) {
      html += "<tr>" + keys.map(function(k) {
        return "<td>" + esc2(row[k] != null ? String(row[k]) : "") + "</td>";
      }).join("") + "</tr>";
    });
    html += "</tbody></table></div>";
    container.innerHTML = html;
  }
  var NL_SCALAR_KINDS = { count: 1, sum: 1, avg: 1, max: 1, min: 1 };
  async function renderNlNarrative(resultsEl, result, rows) {
    var sentence;
    if (NL_SCALAR_KINDS[result.answerKind]) {
      var value = rows && rows.length ? firstCell(rows[0]) : null;
      sentence = narrateAnswer(result, value, null);
    } else {
      var total = await nlExactCount(result.sql);
      sentence = narrateAnswer(result, null, total);
    }
    if (!sentence) return;
    prependNlNarrative(resultsEl, sentence, result.sql);
  }
  function firstCell(row) {
    var keys = Object.keys(row || {});
    if (!keys.length) return null;
    var v = row[keys[0]];
    return v == null ? null : Number(v);
  }
  async function nlExactCount(sql) {
    var inner = String(sql || "").replace(/;\s*$/, "").replace(/\s+limit\s+\d+\s*$/i, "");
    try {
      var resp = await fetch("/api/sql", authOpts({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: "SELECT COUNT(*) AS n FROM (\n" + inner + "\n)" })
      }));
      var data = await resp.json();
      if (!resp.ok || !data.rows || !data.rows.length) return null;
      return firstCell(data.rows[0]);
    } catch (err) {
      return null;
    }
  }
  function prependNlNarrative(resultsEl, sentence, sql) {
    resultsEl.hidden = false;
    var html = '<div class="nl-narrative"><p class="nl-narrative-say">' + esc2(sentence) + '</p><hr class="nl-narrative-rule"><pre class="nl-narrative-sql">' + esc2(String(sql || "")) + "</pre></div>";
    resultsEl.insertAdjacentHTML("afterbegin", html);
  }
  function renderNlNarrativeMessage(msg) {
    var resultsEl = document.getElementById("nl-modal-results");
    if (!resultsEl) return;
    resultsEl.hidden = false;
    resultsEl.innerHTML = '<div class="nl-narrative"><p class="nl-narrative-say">' + esc2(msg) + "</p></div>";
  }
  function clearNlPreviewResults() {
    var resultsEl = document.getElementById("nl-modal-results");
    if (resultsEl) {
      resultsEl.hidden = true;
      resultsEl.innerHTML = "";
    }
  }
  function initNlModalListeners() {
    document.querySelectorAll("[data-panel-btn]").forEach(function(btn) {
      btn.addEventListener("click", function() {
        setTimeout(function() {
          var sb = document.getElementById("app-sidebar");
          var layout3 = document.getElementById("app-layout");
          var askShowing = !!sb && !!layout3 && sb.getAttribute("data-active-panel") === "ask" && !layout3.classList.contains("app-sidebar-panel-collapsed");
          if (askShowing) {
            var ta = document.getElementById("nl-modal-input");
            if (ta) ta.focus();
            scheduleNlLivePreview();
          } else {
            closeNlModal();
          }
        }, 0);
      });
    });
    var nlUse = document.getElementById("nl-use");
    if (nlUse) nlUse.addEventListener("click", function() {
      useNlModal();
    });
    var nlMic = document.getElementById("nl-mic");
    if (nlMic && nlSpeechApi()) {
      nlMic.hidden = false;
      nlMic.addEventListener("click", toggleNlMic);
    }
    var nlClear = document.getElementById("nl-clear");
    if (nlClear) nlClear.addEventListener("click", clearNlQuestion);
    var nlHelp = document.getElementById("nl-help");
    if (nlHelp) nlHelp.addEventListener("click", toggleNlHelp);
    var nlHelpSearch = document.getElementById("nl-help-search");
    if (nlHelpSearch) nlHelpSearch.addEventListener("input", filterNlHelp);
    var nlCopy = document.getElementById("nl-copy");
    if (nlCopy) nlCopy.addEventListener("click", function() {
      copyNlSql();
    });
    var nlTableSel = document.getElementById("nl-table-select");
    if (nlTableSel) nlTableSel.addEventListener("change", scheduleNlLivePreview);
    var nlPreviewRun = document.getElementById("nl-preview-run");
    if (nlPreviewRun) nlPreviewRun.addEventListener("click", function() {
      previewNlResults();
    });
    var nlModalInput = document.getElementById("nl-modal-input");
    if (nlModalInput) {
      nlModalInput.addEventListener("input", scheduleNlLivePreview);
      nlModalInput.addEventListener("paste", function() {
        setTimeout(scheduleNlLivePreview, 0);
      });
    }
  }

  // assets/web/cell-edit.ts
  var activeEditToken = 0;
  function hasUnsavedWebEdit() {
    return activeEditToken > 0;
  }
  function clearUnsavedWebEdit() {
    activeEditToken = 0;
  }
  function tryBeginUnsavedWebEdit() {
    if (activeEditToken > 0) return false;
    activeEditToken = 1;
    return true;
  }
  function readCellRawFromTd(td) {
    if (!td) return "";
    var btn = td.querySelector(".cell-copy-btn");
    if (btn && btn.hasAttribute("data-raw")) return btn.getAttribute("data-raw") || "";
    if (td.querySelector(".cell-null")) return "";
    return (td.textContent || "").trim();
  }
  function jsonPkValueForCellUpdate(rawStr, pkColName) {
    var t = schemaTableByName2(currentTableName);
    var col = null;
    if (t && t.columns) {
      for (var i = 0; i < t.columns.length; i++) {
        if (t.columns[i].name === pkColName) {
          col = t.columns[i];
          break;
        }
      }
    }
    var typ = (col && col.type || "").toUpperCase();
    if ((typ === "INTEGER" || typ === "INT") && /^-?\d+$/.test(String(rawStr))) {
      return parseInt(String(rawStr), 10);
    }
    if ((typ === "REAL" || typ === "FLOAT" || typ === "DOUBLE") && /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(String(rawStr))) {
      return parseFloat(String(rawStr));
    }
    return rawStr === "" ? null : rawStr;
  }
  function cellUpdateValueJson(inputValue, colMeta) {
    var typ = (colMeta.type || "").toUpperCase();
    var notNull = !!colMeta.notnull;
    var trimmed = (inputValue || "").trim();
    var textLike = typ === "" || typ.indexOf("CHAR") >= 0 || typ.indexOf("CLOB") >= 0 || typ.indexOf("TEXT") >= 0;
    if (trimmed === "") {
      if (!notNull) return null;
      if (textLike) return "";
      return "__INVALID__";
    }
    return inputValue;
  }
  function validateCellFormat(value, colMeta) {
    var trimmed = value.trim();
    var typ = (colMeta.type || "").toUpperCase();
    if (trimmed === "") {
      if (colMeta.notnull) {
        var textLike = typ === "" || /CHAR|CLOB|TEXT/.test(typ);
        if (!textLike) return vt("viewer.table.edit.notNull");
      }
      return null;
    }
    var isIntLike = typ === "INTEGER" || typ === "INT" || typ === "BIGINT" || typ === "SMALLINT" || typ === "TINYINT";
    if ((isIntLike || typ === "") && isBooleanColumn(colMeta.name)) {
      var lower = trimmed.toLowerCase();
      if (lower !== "0" && lower !== "1" && lower !== "true" && lower !== "false") {
        return vt("viewer.table.edit.expectBool");
      }
      return null;
    }
    if (isIntLike) {
      if (!/^-?\d+$/.test(trimmed)) return vt("viewer.table.edit.expectInt");
    }
    if (typ === "REAL" || typ === "FLOAT" || typ === "DOUBLE" || /NUMERIC|DECIMAL/.test(typ)) {
      if (isNaN(Number(trimmed)) || trimmed === "") return vt("viewer.table.edit.expectNumber");
    }
    return null;
  }
  function tryStartBrowserCellEdit(td) {
    if (!currentTableName) return;
    if (!tryBeginUnsavedWebEdit()) {
      window.alert(vt("viewer.table.edit.busy"));
      return;
    }
    loadSchemaMeta().then(function() {
      var pkName = getPkColumnNameForDataTable();
      if (!pkName) {
        clearUnsavedWebEdit();
        window.alert(vt("viewer.table.edit.noPk"));
        return;
      }
      var columnKey = td.getAttribute("data-column-key") || "";
      if (!columnKey || columnKey === pkName) {
        clearUnsavedWebEdit();
        window.alert(vt("viewer.table.edit.pkLocked"));
        return;
      }
      var t = schemaTableByName2(currentTableName);
      var colMeta = null;
      if (t && t.columns) {
        for (var j = 0; j < t.columns.length; j++) {
          if (t.columns[j].name === columnKey) {
            colMeta = t.columns[j];
            break;
          }
        }
      }
      if (!colMeta) {
        clearUnsavedWebEdit();
        return;
      }
      if ((colMeta.type || "").toUpperCase() === "BLOB") {
        clearUnsavedWebEdit();
        window.alert(vt("viewer.table.edit.blobLocked"));
        return;
      }
      var keys = getVisibleDataColumnKeys(td);
      var colIdx = keys.indexOf(columnKey);
      var pkIdx = keys.indexOf(pkName);
      if (colIdx < 0 || pkIdx < 0) {
        clearUnsavedWebEdit();
        return;
      }
      var tr = td.closest("tr");
      if (!tr || !tr.children[pkIdx]) {
        clearUnsavedWebEdit();
        return;
      }
      var pkRaw = readCellRawFromTd(tr.children[pkIdx]);
      var pkJson = jsonPkValueForCellUpdate(pkRaw, pkName);
      var originalHtml = td.innerHTML;
      var startVal = readCellRawFromTd(td);
      var isNull = td.querySelector(".cell-null") != null;
      var initialEditText = isNull ? "" : String(startVal);
      var colType = (colMeta.type || "").toUpperCase() || vt("viewer.table.edit.typeUnspecified");
      var nullableLabel = colMeta.notnull ? vt("viewer.table.edit.constraintNotNull") : vt("viewer.table.edit.nullable");
      var container = document.createElement("div");
      container.className = "cell-edit-container";
      var contextEl = document.createElement("div");
      contextEl.className = "cell-edit-context";
      contextEl.textContent = vt("viewer.table.edit.context", pkName, pkRaw, columnKey, colType, nullableLabel);
      container.appendChild(contextEl);
      var currentEl = document.createElement("div");
      currentEl.className = "cell-edit-current";
      currentEl.textContent = vt("viewer.table.edit.was", isNull ? vt("viewer.table.edit.nullValue") : startVal);
      container.appendChild(currentEl);
      var input = document.createElement("input");
      input.type = "text";
      input.className = "cell-inline-editor";
      input.setAttribute("aria-label", vt("viewer.table.edit.inputLabel", columnKey));
      input.value = startVal;
      container.appendChild(input);
      var errorEl = document.createElement("div");
      errorEl.className = "cell-edit-error";
      container.appendChild(errorEl);
      var actions = document.createElement("div");
      actions.className = "cell-edit-actions";
      var saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.className = "btn-primary";
      saveBtn.textContent = vt("viewer.table.edit.save");
      var cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.textContent = vt("viewer.table.edit.cancel");
      actions.appendChild(saveBtn);
      actions.appendChild(cancelBtn);
      container.appendChild(actions);
      var failureActions = document.createElement("div");
      failureActions.className = "cell-edit-failure-actions";
      failureActions.style.display = "none";
      var retrySaveBtn = document.createElement("button");
      retrySaveBtn.type = "button";
      retrySaveBtn.className = "cell-edit-retry-btn";
      retrySaveBtn.textContent = vt("viewer.table.edit.retry");
      var reloadTableBtn = document.createElement("button");
      reloadTableBtn.type = "button";
      reloadTableBtn.className = "cell-edit-reload-btn";
      reloadTableBtn.textContent = vt("viewer.table.edit.reload");
      failureActions.appendChild(retrySaveBtn);
      failureActions.appendChild(reloadTableBtn);
      container.appendChild(failureActions);
      td.innerHTML = "";
      td.appendChild(container);
      input.focus();
      input.select();
      function updateDirtyHighlight() {
        var dirty = input.value !== initialEditText;
        td.classList.toggle("cell-edit-td-dirty", dirty);
        tr.classList.toggle("cell-edit-row-dirty", dirty);
      }
      input.addEventListener("input", function() {
        var err = validateCellFormat(input.value, colMeta);
        errorEl.textContent = err || "";
        errorEl.style.display = err ? "block" : "none";
        input.classList.toggle("cell-edit-invalid", !!err);
        updateDirtyHighlight();
      });
      updateDirtyHighlight();
      function restore() {
        td.classList.remove("cell-edit-td-dirty");
        tr.classList.remove("cell-edit-row-dirty");
        td.innerHTML = originalHtml;
        clearUnsavedWebEdit();
      }
      function commit() {
        failureActions.style.display = "none";
        var formatErr = validateCellFormat(input.value, colMeta);
        if (formatErr) {
          errorEl.textContent = formatErr;
          errorEl.style.display = "block";
          input.classList.add("cell-edit-invalid");
          input.focus();
          return;
        }
        var valJson = cellUpdateValueJson(input.value, colMeta);
        if (valJson === "__INVALID__") {
          errorEl.textContent = vt("viewer.table.edit.notNull");
          errorEl.style.display = "block";
          input.classList.add("cell-edit-invalid");
          input.focus();
          return;
        }
        saveBtn.disabled = true;
        cancelBtn.disabled = true;
        fetch("/api/cell/update", authOpts({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            table: currentTableName,
            pkColumn: pkName,
            pkValue: pkJson,
            column: columnKey,
            value: valJson
          })
        })).then(function(r) {
          return r.json().then(function(data) {
            return { ok: r.ok, data };
          });
        }).then(function(res) {
          if (!res.ok || !res.data || res.data.error) {
            var msg = res.data && res.data.error ? res.data.error : vt("viewer.table.edit.requestFailed");
            errorEl.textContent = vt("viewer.table.edit.saveFailed", msg);
            errorEl.style.display = "block";
            input.classList.add("cell-edit-invalid");
            failureActions.style.display = "flex";
            saveBtn.disabled = false;
            cancelBtn.disabled = false;
            input.focus();
            return;
          }
          clearUnsavedWebEdit();
          loadTable(currentTableName);
        }).catch(function(err) {
          errorEl.textContent = vt("viewer.table.edit.saveFailed", err && err.message ? err.message : String(err));
          errorEl.style.display = "block";
          input.classList.add("cell-edit-invalid");
          failureActions.style.display = "flex";
          saveBtn.disabled = false;
          cancelBtn.disabled = false;
          input.focus();
        });
      }
      retrySaveBtn.addEventListener("click", function() {
        failureActions.style.display = "none";
        commit();
      });
      reloadTableBtn.addEventListener("click", function() {
        clearUnsavedWebEdit();
        loadTable(currentTableName);
      });
      saveBtn.addEventListener("click", function() {
        commit();
      });
      cancelBtn.addEventListener("click", function() {
        restore();
      });
      input.addEventListener("keydown", function(ev) {
        if (ev.key === "Enter") {
          ev.preventDefault();
          commit();
        }
        if (ev.key === "Escape") {
          ev.preventDefault();
          restore();
        }
      });
    }).catch(function(err) {
      clearUnsavedWebEdit();
      window.alert(vt("viewer.table.edit.schemaFailed", err && err.message ? err.message : String(err)));
    });
  }
  function showCellValuePopup(rawValue, columnKey) {
    var popup = document.getElementById("cell-value-popup");
    var textEl = document.getElementById("cell-value-popup-text");
    var titleEl = document.getElementById("cell-value-popup-title");
    if (!popup || !textEl || !titleEl) return;
    titleEl.textContent = columnKey ? vt("viewer.table.popup.titleNamed", columnKey) : vt("viewer.table.popup.title");
    textEl.textContent = rawValue !== void 0 && rawValue !== null ? String(rawValue) : "";
    popup.classList.add("show");
    popup.setAttribute("aria-hidden", "false");
  }
  function hideCellValuePopup() {
    var popup = document.getElementById("cell-value-popup");
    if (!popup) return;
    popup.classList.remove("show");
    popup.setAttribute("aria-hidden", "true");
  }
  function setupCellValuePopupButtons() {
    var popup = document.getElementById("cell-value-popup");
    var copyBtn = document.getElementById("cell-value-popup-copy");
    var closeBtn = document.getElementById("cell-value-popup-close");
    var textEl = document.getElementById("cell-value-popup-text");
    if (!popup || !copyBtn || !closeBtn || !textEl) return;
    copyBtn.addEventListener("click", function() {
      copyCellValue(textEl.textContent || "");
    });
    closeBtn.addEventListener("click", hideCellValuePopup);
    popup.addEventListener("click", function(e) {
      if (e.target === popup) hideCellValuePopup();
    });
    document.addEventListener("keydown", function(e) {
      if (e.key === "Escape" && popup.classList.contains("show")) hideCellValuePopup();
    });
  }

  // assets/web/charts.ts
  function getChartSize() {
    var wrap = document.getElementById("chart-wrapper");
    if (!wrap) return { w: 600, h: 320 };
    var w = wrap.clientWidth || 600;
    var h = Math.max(320, wrap.clientHeight || 320);
    return { w, h };
  }
  function applyChartUI(title, description) {
    var container = document.getElementById("chart-container");
    if (!container) return;
    var titleEl = document.getElementById("chart-title");
    var descEl = document.getElementById("chart-description");
    var exportBar = document.getElementById("chart-export-toolbar");
    container.style.display = "block";
    if (titleEl) {
      if (title && title.trim()) {
        titleEl.textContent = title.trim();
        titleEl.style.display = "block";
      } else {
        titleEl.style.display = "none";
      }
    }
    if (descEl) {
      if (description && description.trim()) {
        descEl.textContent = description.trim();
        descEl.style.display = "block";
      } else {
        descEl.style.display = "none";
      }
    }
    if (exportBar) exportBar.style.display = "flex";
  }
  function renderBarChart(container, data, xKey, yKey, opts) {
    opts = opts || {};
    var size = getChartSize();
    var W = size.w, H = size.h, PAD = 56;
    var xLabel = opts.xLabel != null ? opts.xLabel : xKey;
    var yLabel = opts.yLabel != null ? opts.yLabel : yKey;
    var vals = data.map(function(d) {
      return Number(d[yKey]) || 0;
    });
    var maxVal = Math.max.apply(null, vals.concat([1]));
    var barW = Math.max(4, (W - PAD * 2) / data.length - 2);
    var plotH = H - PAD * 2;
    var svg = '<svg class="chart-svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">';
    svg += '<line class="chart-axis" x1="' + PAD + '" y1="' + (H - PAD) + '" x2="' + (W - PAD) + '" y2="' + (H - PAD) + '"/>';
    svg += '<line class="chart-axis" x1="' + PAD + '" y1="' + PAD + '" x2="' + PAD + '" y2="' + (H - PAD) + '"/>';
    for (var i = 0; i <= 4; i++) {
      var v = (maxVal / 4 * i).toFixed(maxVal > 100 ? 0 : 1);
      var y = H - PAD - i / 4 * plotH;
      svg += '<text class="chart-axis-label" x="' + (PAD - 6) + '" y="' + (y + 4) + '" text-anchor="end">' + esc2(v) + "</text>";
    }
    data.forEach(function(d, i2) {
      var val = Number(d[yKey]) || 0;
      var bh = val / maxVal * plotH;
      var x = PAD + i2 * (barW + 2);
      var by = H - PAD - bh;
      svg += '<rect class="chart-bar" x="' + x + '" y="' + by + '" width="' + barW + '" height="' + bh + '">';
      svg += "<title>" + esc2(String(d[xKey])) + ": " + val + "</title></rect>";
      if (data.length <= 20) {
        svg += '<text class="chart-label" x="' + (x + barW / 2) + '" y="' + (H - PAD + 16) + '" text-anchor="middle" transform="rotate(-45,' + (x + barW / 2) + "," + (H - PAD + 16) + ')">' + esc2(String(d[xKey]).slice(0, 12)) + "</text>";
      }
    });
    svg += '<text class="chart-axis-title chart-axis-y" x="12" y="' + H / 2 + '" text-anchor="middle" transform="rotate(-90, 12, ' + H / 2 + ')">' + esc2(yLabel) + "</text>";
    svg += '<text class="chart-axis-title chart-axis-x" x="' + W / 2 + '" y="' + (H - 8) + '" text-anchor="middle">' + esc2(xLabel) + "</text>";
    svg += "</svg>";
    container.innerHTML = svg;
    applyChartUI(opts.title, opts.description);
  }
  function renderStackedBarChart(container, data, xKey, yKey, opts) {
    opts = opts || {};
    var size = getChartSize();
    var W = size.w, H = size.h, PAD = 56;
    var xLabel = opts.xLabel != null ? opts.xLabel : xKey;
    var yLabel = opts.yLabel != null ? opts.yLabel : yKey;
    var groups2 = {};
    data.forEach(function(d) {
      var k = String(d[xKey]);
      if (!groups2[k]) groups2[k] = [];
      groups2[k].push(Number(d[yKey]) || 0);
    });
    var labels = Object.keys(groups2);
    var sums = labels.map(function(k) {
      return groups2[k].reduce(function(a, b) {
        return a + b;
      }, 0);
    });
    var maxVal = Math.max.apply(null, sums.concat([1]));
    var barW = Math.max(8, (W - PAD * 2) / labels.length - 4);
    var plotH = H - PAD * 2;
    var svg = '<svg class="chart-svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">';
    svg += '<line class="chart-axis" x1="' + PAD + '" y1="' + (H - PAD) + '" x2="' + (W - PAD) + '" y2="' + (H - PAD) + '"/>';
    svg += '<line class="chart-axis" x1="' + PAD + '" y1="' + PAD + '" x2="' + PAD + '" y2="' + (H - PAD) + '"/>';
    for (var i = 0; i <= 4; i++) {
      var v = (maxVal / 4 * i).toFixed(maxVal > 100 ? 0 : 1);
      var y = H - PAD - i / 4 * plotH;
      svg += '<text class="chart-axis-label" x="' + (PAD - 6) + '" y="' + (y + 4) + '" text-anchor="end">' + esc2(v) + "</text>";
    }
    labels.forEach(function(label, gi) {
      var segs = groups2[label];
      var x = PAD + gi * (barW + 4) + 2;
      var accY = H - PAD;
      segs.forEach(function(val, si) {
        var bh = val / maxVal * plotH;
        var by = accY - bh;
        var color = CHART_COLORS[si % CHART_COLORS.length];
        svg += '<rect class="chart-bar chart-stacked-segment" x="' + x + '" y="' + by + '" width="' + barW + '" height="' + bh + '" fill="' + color + '">';
        svg += "<title>" + vt("viewer.tools.chart.stacked.segment", esc2(label), si + 1, val) + "</title></rect>";
        accY = by;
      });
      if (labels.length <= 20) {
        svg += '<text class="chart-label" x="' + (x + barW / 2) + '" y="' + (H - PAD + 16) + '" text-anchor="middle" transform="rotate(-45,' + (x + barW / 2) + "," + (H - PAD + 16) + ')">' + esc2(String(label).slice(0, 10)) + "</text>";
      }
    });
    svg += '<text class="chart-axis-title chart-axis-y" x="12" y="' + H / 2 + '" text-anchor="middle" transform="rotate(-90, 12, ' + H / 2 + ')">' + esc2(yLabel) + "</text>";
    svg += '<text class="chart-axis-title chart-axis-x" x="' + W / 2 + '" y="' + (H - 8) + '" text-anchor="middle">' + esc2(xLabel) + "</text>";
    svg += "</svg>";
    container.innerHTML = svg;
    applyChartUI(opts.title, opts.description);
  }
  function renderPieChart(container, data, labelKey, valueKey, opts) {
    opts = opts || {};
    var size = getChartSize();
    var W = size.w, H = size.h, R = Math.min(130, Math.min(W, H) / 2 - 60), CX = Math.min(200, W / 2 - 40), CY = H / 2;
    var vals = data.map(function(d) {
      return Math.max(0, Number(d[valueKey]) || 0);
    });
    var total = vals.reduce(function(a, b) {
      return a + b;
    }, 0) || 1;
    var threshold = total * 0.02;
    var significant = [];
    var otherVal = 0;
    data.forEach(function(d, i) {
      if (vals[i] >= threshold) significant.push({ label: d[labelKey], value: vals[i] });
      else otherVal += vals[i];
    });
    if (otherVal > 0) significant.push({ label: vt("viewer.tools.chart.pie.other"), value: otherVal });
    var svg = '<svg class="chart-svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">';
    var angle = 0;
    significant.forEach(function(d, i) {
      var sweep = d.value / total * 2 * Math.PI;
      var color = CHART_COLORS[i % CHART_COLORS.length];
      var pct = (d.value / total * 100).toFixed(1);
      var tip = "<title>" + esc2(String(d.label)) + ": " + d.value + " (" + pct + "%)</title>";
      if (sweep >= 2 * Math.PI - 1e-3) {
        svg += '<circle class="chart-slice" cx="' + CX + '" cy="' + CY + '" r="' + R + '" fill="' + color + '">' + tip + "</circle>";
      } else {
        var x1 = CX + R * Math.cos(angle);
        var y1 = CY + R * Math.sin(angle);
        var x2 = CX + R * Math.cos(angle + sweep);
        var y2 = CY + R * Math.sin(angle + sweep);
        var large = sweep > Math.PI ? 1 : 0;
        svg += '<path class="chart-slice" d="M' + CX + "," + CY + " L" + x1 + "," + y1 + " A" + R + "," + R + " 0 " + large + " 1 " + x2 + "," + y2 + ' Z" fill="' + color + '">' + tip + "</path>";
      }
      angle += sweep;
    });
    var lx = CX + R + 24;
    significant.forEach(function(d, i) {
      var ly = 24 + i * 20;
      var color = CHART_COLORS[i % CHART_COLORS.length];
      svg += '<rect x="' + lx + '" y="' + (ly - 10) + '" width="12" height="12" fill="' + color + '"/>';
      svg += '<text class="chart-legend" x="' + (lx + 18) + '" y="' + ly + '">' + esc2(String(d.label).slice(0, 24)) + " (" + d.value + ")</text>";
    });
    svg += "</svg>";
    container.innerHTML = svg;
    applyChartUI(opts.title, opts.description);
  }
  function renderLineChart(container, data, xKey, yKey, opts) {
    opts = opts || {};
    var size = getChartSize();
    var W = size.w, H = size.h, PAD = 56;
    var xLabel = opts.xLabel != null ? opts.xLabel : xKey;
    var yLabel = opts.yLabel != null ? opts.yLabel : yKey;
    var vals = data.map(function(d) {
      return Number(d[yKey]) || 0;
    });
    var maxVal = Math.max.apply(null, vals.concat([1]));
    var minVal = Math.min.apply(null, vals.concat([0]));
    var range = maxVal - minVal || 1;
    var stepX = (W - PAD * 2) / Math.max(data.length - 1, 1);
    var plotH = H - PAD * 2;
    var svg = '<svg class="chart-svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">';
    svg += '<line class="chart-axis" x1="' + PAD + '" y1="' + (H - PAD) + '" x2="' + (W - PAD) + '" y2="' + (H - PAD) + '"/>';
    svg += '<line class="chart-axis" x1="' + PAD + '" y1="' + PAD + '" x2="' + PAD + '" y2="' + (H - PAD) + '"/>';
    for (var i = 0; i <= 4; i++) {
      var v = (minVal + range * i / 4).toFixed(range > 100 ? 0 : 1);
      var y = H - PAD - i / 4 * plotH;
      svg += '<text class="chart-axis-label" x="' + (PAD - 6) + '" y="' + (y + 4) + '" text-anchor="end">' + esc2(v) + "</text>";
    }
    var points = data.map(function(d, i2) {
      var x = PAD + i2 * stepX;
      var y2 = H - PAD - ((Number(d[yKey]) || 0) - minVal) / range * plotH;
      return x + "," + y2;
    });
    svg += '<polyline class="chart-line" points="' + points.join(" ") + '"/>';
    data.forEach(function(d, i2) {
      var x = PAD + i2 * stepX;
      var y2 = H - PAD - ((Number(d[yKey]) || 0) - minVal) / range * plotH;
      svg += '<circle class="chart-dot" cx="' + x + '" cy="' + y2 + '" r="4"><title>' + esc2(String(d[xKey])) + ": " + d[yKey] + "</title></circle>";
    });
    svg += '<text class="chart-axis-title chart-axis-y" x="12" y="' + H / 2 + '" text-anchor="middle" transform="rotate(-90, 12, ' + H / 2 + ')">' + esc2(yLabel) + "</text>";
    svg += '<text class="chart-axis-title chart-axis-x" x="' + W / 2 + '" y="' + (H - 8) + '" text-anchor="middle">' + esc2(xLabel) + "</text>";
    svg += "</svg>";
    container.innerHTML = svg;
    applyChartUI(opts.title, opts.description);
  }
  function renderAreaChart(container, data, xKey, yKey, opts) {
    opts = opts || {};
    var size = getChartSize();
    var W = size.w, H = size.h, PAD = 56;
    var xLabel = opts.xLabel != null ? opts.xLabel : xKey;
    var yLabel = opts.yLabel != null ? opts.yLabel : yKey;
    var vals = data.map(function(d) {
      return Number(d[yKey]) || 0;
    });
    var maxVal = Math.max.apply(null, vals.concat([1]));
    var minVal = Math.min.apply(null, vals.concat([0]));
    var range = maxVal - minVal || 1;
    var stepX = (W - PAD * 2) / Math.max(data.length - 1, 1);
    var plotH = H - PAD * 2;
    var points = data.map(function(d, i2) {
      var x = PAD + i2 * stepX;
      var y2 = H - PAD - ((Number(d[yKey]) || 0) - minVal) / range * plotH;
      return x + "," + y2;
    });
    var areaPoints = PAD + "," + (H - PAD) + " " + points.join(" ") + " " + (PAD + (data.length - 1) * stepX) + "," + (H - PAD);
    var svg = '<svg class="chart-svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">';
    svg += '<line class="chart-axis" x1="' + PAD + '" y1="' + (H - PAD) + '" x2="' + (W - PAD) + '" y2="' + (H - PAD) + '"/>';
    svg += '<line class="chart-axis" x1="' + PAD + '" y1="' + PAD + '" x2="' + PAD + '" y2="' + (H - PAD) + '"/>';
    for (var i = 0; i <= 4; i++) {
      var v = (minVal + range * i / 4).toFixed(range > 100 ? 0 : 1);
      var y = H - PAD - i / 4 * plotH;
      svg += '<text class="chart-axis-label" x="' + (PAD - 6) + '" y="' + (y + 4) + '" text-anchor="end">' + esc2(v) + "</text>";
    }
    svg += '<polygon class="chart-area" points="' + areaPoints + '"/>';
    svg += '<polyline class="chart-line" points="' + points.join(" ") + '"/>';
    data.forEach(function(d, i2) {
      var x = PAD + i2 * stepX;
      var y2 = H - PAD - ((Number(d[yKey]) || 0) - minVal) / range * plotH;
      svg += '<circle class="chart-dot" cx="' + x + '" cy="' + y2 + '" r="3"><title>' + esc2(String(d[xKey])) + ": " + d[yKey] + "</title></circle>";
    });
    svg += '<text class="chart-axis-title chart-axis-y" x="12" y="' + H / 2 + '" text-anchor="middle" transform="rotate(-90, 12, ' + H / 2 + ')">' + esc2(yLabel) + "</text>";
    svg += '<text class="chart-axis-title chart-axis-x" x="' + W / 2 + '" y="' + (H - 8) + '" text-anchor="middle">' + esc2(xLabel) + "</text>";
    svg += "</svg>";
    container.innerHTML = svg;
    applyChartUI(opts.title, opts.description);
  }
  function renderScatterChart(container, data, xKey, yKey, opts) {
    opts = opts || {};
    var size = getChartSize();
    var W = size.w, H = size.h, PAD = 56;
    var xLabel = opts.xLabel != null ? opts.xLabel : xKey;
    var yLabel = opts.yLabel != null ? opts.yLabel : yKey;
    var xs = data.map(function(d) {
      return Number(d[xKey]);
    }).filter(function(v) {
      return isFinite(v);
    });
    var ys = data.map(function(d) {
      return Number(d[yKey]);
    }).filter(function(v) {
      return isFinite(v);
    });
    if (xs.length === 0 || ys.length === 0) {
      container.innerHTML = '<p class="meta">' + vt("viewer.tools.chart.scatterNumeric") + "</p>";
      document.getElementById("chart-container").style.display = "block";
      var exportBar = document.getElementById("chart-export-toolbar");
      if (exportBar) exportBar.style.display = "none";
      return;
    }
    var minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs), rangeX = maxX - minX || 1;
    var minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys), rangeY = maxY - minY || 1;
    var plotW = W - PAD * 2, plotH = H - PAD * 2;
    var svg = '<svg class="chart-svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">';
    svg += '<line class="chart-axis" x1="' + PAD + '" y1="' + (H - PAD) + '" x2="' + (W - PAD) + '" y2="' + (H - PAD) + '"/>';
    svg += '<line class="chart-axis" x1="' + PAD + '" y1="' + PAD + '" x2="' + PAD + '" y2="' + (H - PAD) + '"/>';
    for (var i = 0; i <= 4; i++) {
      var vx = (minX + rangeX * i / 4).toFixed(rangeX > 100 ? 0 : 1);
      var vy = (minY + rangeY * i / 4).toFixed(rangeY > 100 ? 0 : 1);
      var x = PAD + i / 4 * plotW;
      var y = H - PAD - i / 4 * plotH;
      svg += '<text class="chart-axis-label" x="' + (x + (i === 0 ? -6 : 0)) + '" y="' + (H - PAD + 16) + '" text-anchor="' + (i === 0 ? "end" : "middle") + '">' + esc2(vx) + "</text>";
      svg += '<text class="chart-axis-label" x="' + (PAD - 6) + '" y="' + (y + 4) + '" text-anchor="end">' + esc2(vy) + "</text>";
    }
    data.forEach(function(d, i2) {
      var nx = (Number(d[xKey]) - minX) / rangeX;
      var ny = (Number(d[yKey]) - minY) / rangeY;
      if (!isFinite(nx) || !isFinite(ny)) return;
      var x2 = PAD + nx * plotW;
      var y2 = H - PAD - ny * plotH;
      var color = CHART_COLORS[i2 % CHART_COLORS.length];
      svg += '<circle class="chart-dot chart-scatter-dot" cx="' + x2 + '" cy="' + y2 + '" r="5" fill="' + color + '"><title>' + esc2(String(d[xKey])) + ", " + d[yKey] + "</title></circle>";
    });
    svg += '<text class="chart-axis-title chart-axis-y" x="12" y="' + H / 2 + '" text-anchor="middle" transform="rotate(-90, 12, ' + H / 2 + ')">' + esc2(yLabel) + "</text>";
    svg += '<text class="chart-axis-title chart-axis-x" x="' + W / 2 + '" y="' + (H - 8) + '" text-anchor="middle">' + esc2(xLabel) + "</text>";
    svg += "</svg>";
    container.innerHTML = svg;
    applyChartUI(opts.title, opts.description);
  }
  function renderHistogram(container, data, valueKey, bins, opts) {
    opts = opts || {};
    bins = bins || 10;
    var vals = data.map(function(d) {
      return Number(d[valueKey]);
    }).filter(function(v) {
      return isFinite(v);
    });
    if (vals.length === 0) {
      container.innerHTML = '<p class="meta">' + vt("viewer.tools.chart.noNumeric") + "</p>";
      document.getElementById("chart-container").style.display = "block";
      var exportBar = document.getElementById("chart-export-toolbar");
      if (exportBar) exportBar.style.display = "none";
      return;
    }
    var min = Math.min.apply(null, vals);
    var max = Math.max.apply(null, vals);
    var binWidth = (max - min) / bins || 1;
    var counts = new Array(bins).fill(0);
    vals.forEach(function(v) {
      var idx = Math.min(Math.floor((v - min) / binWidth), bins - 1);
      counts[idx]++;
    });
    var histData = counts.map(function(c, i) {
      return { label: (min + i * binWidth).toFixed(1) + "-" + (min + (i + 1) * binWidth).toFixed(1), value: c };
    });
    renderBarChart(container, histData, "label", "value", { title: opts.title, description: opts.description, xLabel: vt("viewer.tools.chart.histogram.bin"), yLabel: vt("viewer.tools.chart.histogram.count") });
  }
  function exportChartPng() {
    var wrap = document.getElementById("chart-svg-wrap");
    var svgEl = wrap ? wrap.querySelector("svg") : null;
    var btn = document.getElementById("chart-export-png");
    if (!svgEl) return;
    if (btn) btn.disabled = true;
    var svgStr = new XMLSerializer().serializeToString(svgEl);
    var blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var img = new Image();
    function done() {
      if (btn) btn.disabled = false;
    }
    img.onload = function() {
      var c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      var ctx = c.getContext("2d");
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--bg") || "#fff";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0);
      c.toBlob(function(blob2) {
        URL.revokeObjectURL(url);
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob2);
        a.download = "chart.png";
        a.click();
        URL.revokeObjectURL(a.href);
        done();
      }, "image/png");
    };
    img.onerror = function() {
      URL.revokeObjectURL(url);
      done();
    };
    img.src = url;
  }
  function exportChartSvg() {
    var wrap = document.getElementById("chart-svg-wrap");
    var svgEl = wrap ? wrap.querySelector("svg") : null;
    if (!svgEl) return;
    var svgStr = new XMLSerializer().serializeToString(svgEl);
    var blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "chart.svg";
    a.click();
    URL.revokeObjectURL(a.href);
  }
  function exportChartCopy() {
    var wrap = document.getElementById("chart-svg-wrap");
    var svgEl = wrap ? wrap.querySelector("svg") : null;
    var btn = document.getElementById("chart-export-copy");
    if (!svgEl) return;
    if (btn) btn.disabled = true;
    var svgStr = new XMLSerializer().serializeToString(svgEl);
    var blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var img = new Image();
    function done() {
      if (btn) btn.disabled = false;
    }
    img.onload = function() {
      var c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      var ctx = c.getContext("2d");
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--bg") || "#fff";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0);
      c.toBlob(function(blob2) {
        URL.revokeObjectURL(url);
        if (navigator.clipboard && navigator.clipboard.write) {
          var copyBtn = btn;
          navigator.clipboard.write([new ClipboardItem({ "image/png": blob2 })]).then(function() {
            if (copyBtn) {
              copyBtn.textContent = vt("viewer.tools.chart.copied");
              setTimeout(function() {
                copyBtn.textContent = vt("viewer.tools.chart.copyImage");
              }, 1500);
            }
          }).catch(function() {
          }).finally(done);
        } else {
          done();
        }
      }, "image/png");
    };
    img.onerror = function() {
      URL.revokeObjectURL(url);
      done();
    };
    img.src = url;
  }
  function setupChartResize() {
    var wrap = document.getElementById("chart-wrapper");
    if (!wrap) return;
    var resizeTimer = null;
    var THROTTLE_MS = 150;
    function redrawChart() {
      if (!lastChartState) return;
      var container = document.getElementById("chart-svg-wrap");
      if (!container || !container.querySelector("svg")) return;
      var s = lastChartState;
      if (s.type === "bar") renderBarChart(container, s.data, s.xKey, s.yKey, s.opts);
      else if (s.type === "stacked-bar") renderStackedBarChart(container, s.data, s.xKey, s.yKey, s.opts);
      else if (s.type === "pie") renderPieChart(container, s.data, s.xKey, s.yKey, s.opts);
      else if (s.type === "line") renderLineChart(container, s.data, s.xKey, s.yKey, s.opts);
      else if (s.type === "area") renderAreaChart(container, s.data, s.xKey, s.yKey, s.opts);
      else if (s.type === "scatter") renderScatterChart(container, s.data, s.xKey, s.yKey, s.opts);
      else if (s.type === "histogram") renderHistogram(container, s.data, s.yKey, 10, s.opts);
    }
    setChartResizeObserver(new ResizeObserver(function() {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function() {
        resizeTimer = null;
        redrawChart();
      }, THROTTLE_MS);
    }));
    chartResizeObserver.observe(wrap);
  }

  // assets/web/theme.ts
  function applyTheme(theme) {
    if (theme === true) theme = "dark";
    if (theme === false) theme = "light";
    document.body.classList.remove("theme-dark", "theme-light", "theme-showcase", "theme-midnight");
    document.body.classList.add("theme-" + theme);
    var themeOptions = document.querySelectorAll(".tb-theme-option");
    for (var i = 0; i < themeOptions.length; i++) {
      var opt = themeOptions[i];
      var isActive = opt.getAttribute("data-theme") === theme;
      opt.classList.toggle("active", isActive);
      opt.setAttribute("aria-pressed", isActive ? "true" : "false");
    }
  }
  function detectVscodeTheme() {
    if (document.body.classList.contains("vscode-dark")) return "dark";
    if (document.body.classList.contains("vscode-light")) return "light";
    var kind = document.documentElement.getAttribute("data-vscode-theme-kind");
    if (kind === "vscode-dark" || kind === "vscode-high-contrast") return "dark";
    if (kind === "vscode-light" || kind === "vscode-high-contrast-light") return "light";
    return null;
  }
  function initTheme() {
    var saved = localStorage.getItem(THEME_KEY);
    if (saved) {
      applyTheme(saved);
      return;
    }
    var vscodeTheme = detectVscodeTheme();
    if (vscodeTheme) {
      applyTheme(vscodeTheme);
      return;
    }
    var prefersDark = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)").matches : false;
    applyTheme(prefersDark ? "dark" : "light");
  }
  function initThemeListeners() {
    if (window.matchMedia) {
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function(e) {
        if (!localStorage.getItem(THEME_KEY)) {
          applyTheme(e.matches ? "dark" : "light");
        }
      });
    }
  }

  // assets/web/long-press-copy.ts
  var HOLD_MS = 520;
  var MOVE_MAX_PX = 14;
  var listenersInstalled = false;
  var holdTimer = null;
  var startX = 0;
  var startY = 0;
  var touchStartEl = null;
  var activeTouchId = null;
  function clearHold() {
    if (holdTimer != null) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
  }
  function inBlockingFormField(el) {
    if (!el) return true;
    if (el.closest("textarea, select")) return true;
    var inp = el.closest("input");
    if (inp instanceof HTMLInputElement) {
      var t = (inp.type || "text").toLowerCase();
      if (t !== "checkbox" && t !== "radio") return true;
    }
    return false;
  }
  function resolveLongPressCopyText(target) {
    if (!target) return null;
    var explicit = target.closest("[data-longpress-copy]");
    if (explicit) {
      var v = explicit.getAttribute("data-longpress-copy");
      return v != null && v !== "" ? v : null;
    }
    if (target.closest(".table-pin-btn, .tab-btn-close, .cell-inline-editor")) return null;
    var fk = target.closest(".fk-link[data-table][data-column]");
    if (fk) {
      var dt = fk.getAttribute("data-table");
      var dc = fk.getAttribute("data-column");
      if (dt && dc) return dt + "." + dc;
    }
    var th = target.closest(".drift-table th[data-column-key]");
    if (th) {
      var key = th.getAttribute("data-column-key");
      return key != null && key !== "" ? key : null;
    }
    var td = target.closest(".drift-table td[data-column-key]");
    if (td) {
      var btn = td.querySelector(".cell-copy-btn");
      var raw = btn && btn.getAttribute("data-raw");
      if (raw != null) return raw;
      var txt = (td.textContent || "").trim();
      return txt || td.getAttribute("data-column-key");
    }
    var defName = target.closest(".table-def-name");
    if (defName) {
      var n = (defName.textContent || "").trim();
      return n || null;
    }
    var tableLink = target.closest("a.table-link[data-table]");
    if (tableLink && !target.closest(".table-pin-btn")) {
      var tn = tableLink.getAttribute("data-table");
      return tn != null && tn !== "" ? tn : null;
    }
    var browse = target.closest(".tables-browse-card[data-table]");
    if (browse) {
      var b = browse.getAttribute("data-table");
      return b != null && b !== "" ? b : null;
    }
    var diagram = target.closest(".diagram-table[data-table]");
    if (diagram) {
      var d = diagram.getAttribute("data-table");
      return d != null && d !== "" ? d : null;
    }
    var sizeLink = target.closest("a.size-table-link[data-table]");
    if (sizeLink) {
      var s = sizeLink.getAttribute("data-table");
      return s != null && s !== "" ? s : null;
    }
    var sqlTh = target.closest("th[data-column-key]");
    if (sqlTh) {
      var sk = sqlTh.getAttribute("data-column-key");
      return sk != null && sk !== "" ? sk : null;
    }
    var tabBtn = target.closest(".tab-btn[data-tab]");
    if (tabBtn) {
      var tid = tabBtn.getAttribute("data-tab") || "";
      if (tid.indexOf("tbl:") === 0) return tid.slice(4);
    }
    var qbLabel = target.closest("#qb-columns label");
    if (qbLabel) {
      var cbin = qbLabel.querySelector('input[type="checkbox"][value]');
      if (cbin) {
        var val = cbin.getAttribute("value");
        return val != null && val !== "" ? val : null;
      }
    }
    return null;
  }
  function armClickSuppression() {
    function onClickCap(e) {
      document.removeEventListener("click", onClickCap, true);
      e.preventDefault();
      e.stopPropagation();
    }
    setTimeout(function() {
      document.addEventListener("click", onClickCap, true);
    }, 0);
    setTimeout(function() {
      document.removeEventListener("click", onClickCap, true);
    }, 500);
  }
  function initLongPressCopy() {
    if (listenersInstalled) return;
    listenersInstalled = true;
    document.addEventListener(
      "touchstart",
      function(e) {
        if (e.touches.length > 1) {
          clearHold();
          activeTouchId = null;
          touchStartEl = null;
          return;
        }
        if (e.touches.length !== 1) return;
        var t = e.touches[0];
        var rawTarget = e.target;
        var el = rawTarget instanceof Element ? rawTarget : document.elementFromPoint(t.clientX, t.clientY);
        if (!el || inBlockingFormField(el)) return;
        var preview = resolveLongPressCopyText(el);
        if (!preview) return;
        clearHold();
        activeTouchId = t.identifier;
        startX = t.clientX;
        startY = t.clientY;
        touchStartEl = el;
        holdTimer = setTimeout(function() {
          holdTimer = null;
          var toCopy = touchStartEl ? resolveLongPressCopyText(touchStartEl) : null;
          if (!toCopy) return;
          copyCellValue(toCopy);
          if (navigator.vibrate) {
            try {
              navigator.vibrate(12);
            } catch {
            }
          }
          armClickSuppression();
        }, HOLD_MS);
      },
      { passive: true, capture: true }
    );
    document.addEventListener(
      "touchmove",
      function(e) {
        if (holdTimer == null || activeTouchId == null) return;
        if (e.touches.length > 1) {
          clearHold();
          activeTouchId = null;
          touchStartEl = null;
          return;
        }
        for (var i = 0; i < e.touches.length; i++) {
          if (e.touches[i].identifier === activeTouchId) {
            var t = e.touches[i];
            var dx = t.clientX - startX;
            var dy = t.clientY - startY;
            if (dx * dx + dy * dy > MOVE_MAX_PX * MOVE_MAX_PX) {
              clearHold();
              activeTouchId = null;
              touchStartEl = null;
            }
            return;
          }
        }
      },
      { passive: true, capture: true }
    );
    function endTouch(e) {
      if (activeTouchId == null) return;
      for (var i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === activeTouchId) {
          clearHold();
          activeTouchId = null;
          touchStartEl = null;
          return;
        }
      }
    }
    document.addEventListener("touchend", endTouch, { passive: true, capture: true });
    document.addEventListener("touchcancel", endTouch, { passive: true, capture: true });
  }

  // assets/web/home-screen.ts
  var cardSearchIndex = [];
  function buildTokens(label, blurb, keywords) {
    var words = (label + " " + blurb).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    var all = words.concat(keywords.map(function(k) {
      return k.toLowerCase();
    }));
    return Array.from(new Set(all));
  }
  function fuzzySubsequence(query, token) {
    var q = 0;
    for (var i = 0; i < token.length && q < query.length; i++) {
      if (token[i] === query[q]) q++;
    }
    return q === query.length;
  }
  function cardMatches(query, tokens) {
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      if (t.indexOf(query) !== -1 || fuzzySubsequence(query, t)) return true;
    }
    return false;
  }
  function applyFeatureFilter(query) {
    var q = query.trim().toLowerCase();
    var empty = document.getElementById("home-feature-search-empty");
    if (!q) {
      cardSearchIndex.forEach(function(entry) {
        entry.el.hidden = false;
      });
      if (empty) empty.hidden = true;
      return;
    }
    var shown = 0;
    cardSearchIndex.forEach(function(entry) {
      var match = cardMatches(q, entry.tokens);
      entry.el.hidden = !match;
      if (match) shown++;
    });
    if (empty) {
      if (shown === 0) {
        empty.textContent = vt("viewer.nav.home.search.noResults", query.trim());
        empty.hidden = false;
      } else {
        empty.hidden = true;
      }
    }
  }
  function addCard(grid, id, label, iconName, blurb, color, keywords, onClick, extra) {
    var card = document.createElement("button");
    card.type = "button";
    card.className = extra ? "home-tool-card home-tool-card-extra" : "home-tool-card";
    card.setAttribute(extra ? "data-home-extra" : "data-tool", id);
    card.style.setProperty("--tool-accent", color);
    card.title = vt("viewer.nav.home.cardTooltip", label, blurb);
    if (iconName) {
      var icon = document.createElement("span");
      icon.className = "material-symbols-outlined home-tool-card-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = iconName;
      card.appendChild(icon);
    }
    var name = document.createElement("span");
    name.className = "home-tool-card-name";
    name.textContent = label;
    card.appendChild(name);
    var blurbEl = document.createElement("span");
    blurbEl.className = "home-tool-card-blurb";
    blurbEl.textContent = blurb;
    card.appendChild(blurbEl);
    card.addEventListener("click", onClick);
    grid.appendChild(card);
    cardSearchIndex.push({ el: card, tokens: buildTokens(label, blurb, keywords) });
  }
  function buildToolGrid() {
    var grid = document.getElementById("home-tool-grid");
    if (!grid) return;
    grid.replaceChildren();
    cardSearchIndex = [];
    HOME_LAUNCHERS.forEach(function(item) {
      var label = TOOL_LABELS[item.id] || item.id;
      addCard(
        grid,
        item.id,
        label,
        TOOL_ICONS[item.id],
        item.blurb,
        item.color,
        HOME_SEARCH_KEYWORDS[item.id] || [],
        function() {
          openTool(item.id);
        },
        false
      );
    });
    HOME_EXTRAS.forEach(function(item) {
      addCard(
        grid,
        item.action,
        item.label,
        item.icon,
        item.blurb,
        item.color,
        HOME_SEARCH_KEYWORDS[item.action] || [],
        function() {
          if (item.action === "mask") {
            document.getElementById("tb-mask-toggle")?.click();
            return;
          }
          if (item.action === "theme") {
            document.getElementById("tb-theme-trigger")?.click();
            return;
          }
          if (item.action === "share") document.getElementById("tb-share-btn")?.click();
        },
        true
      );
    });
  }
  function initHomeIntro() {
    var title = document.getElementById("home-title");
    if (title) title.textContent = vt("viewer.nav.home.title");
    var lead = document.getElementById("home-lead");
    if (lead) lead.textContent = vt("viewer.nav.home.lead");
    var search = document.getElementById("home-feature-search");
    if (search) {
      search.placeholder = vt("viewer.nav.home.search.placeholder");
      search.setAttribute("aria-label", vt("viewer.nav.home.search.aria"));
      search.addEventListener("input", function() {
        applyFeatureFilter(search.value);
      });
      search.addEventListener("keydown", function(e) {
        if (e.key === "Escape" && search.value) {
          search.value = "";
          applyFeatureFilter("");
        }
      });
    }
  }
  function initHomeScreen() {
    buildToolGrid();
    initHomeIntro();
  }

  // assets/web/sidebar-resize.ts
  var DEFAULT_WIDTH = 300;
  var MIN_WIDTH = 180;
  var COLLAPSE_SNAP = 120;
  var KEY_STEP = 24;
  var layout2 = null;
  var resizer = null;
  var expandedWidth = DEFAULT_WIDTH;
  var dragging = false;
  var startX2 = 0;
  var startWidth = 0;
  function maxWidth() {
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
    return Math.min(640, Math.round(vw * 0.6));
  }
  function applyVar(px) {
    if (layout2) layout2.style.setProperty("--app-sidebar-width", px + "px");
  }
  function persist2(px) {
    try {
      localStorage.setItem(APP_SIDEBAR_WIDTH_KEY, String(px));
    } catch (e) {
    }
  }
  function setExpandedWidth(px) {
    expandedWidth = Math.max(MIN_WIDTH, Math.min(maxWidth(), Math.round(px)));
    applyVar(expandedWidth);
    persist2(expandedWidth);
    setSidebarCollapsed(false);
  }
  function onPointerMove(e) {
    if (!dragging) return;
    let w = startWidth + (e.clientX - startX2);
    w = Math.max(0, Math.min(maxWidth(), w));
    applyVar(w);
    e.preventDefault();
  }
  function onPointerUp(e) {
    if (!dragging) return;
    dragging = false;
    if (layout2) layout2.classList.remove("app-sidebar-resizing");
    try {
      resizer?.releasePointerCapture(e.pointerId);
    } catch (err) {
    }
    const w = startWidth + (e.clientX - startX2);
    if (w < COLLAPSE_SNAP) {
      applyVar(expandedWidth);
      setSidebarCollapsed(true);
      return;
    }
    setExpandedWidth(w);
  }
  function onPointerDown(e) {
    if (!layout2 || !resizer) return;
    if (e.button !== 0) return;
    dragging = true;
    startX2 = e.clientX;
    startWidth = isSidebarCollapsed() ? 0 : expandedWidth;
    applyVar(startWidth);
    if (isSidebarCollapsed()) setSidebarCollapsed(false);
    layout2.classList.add("app-sidebar-resizing");
    try {
      resizer.setPointerCapture(e.pointerId);
    } catch (err) {
    }
    e.preventDefault();
  }
  function onKeyDown(e) {
    const collapsed = isSidebarCollapsed();
    switch (e.key) {
      case "ArrowLeft": {
        const next = (collapsed ? 0 : expandedWidth) - KEY_STEP;
        if (next < COLLAPSE_SNAP) {
          applyVar(expandedWidth);
          setSidebarCollapsed(true);
        } else {
          setExpandedWidth(next);
        }
        e.preventDefault();
        break;
      }
      case "ArrowRight": {
        setExpandedWidth((collapsed ? 0 : expandedWidth) + KEY_STEP);
        e.preventDefault();
        break;
      }
      case "Enter":
      case " ": {
        if (collapsed) {
          applyVar(expandedWidth);
          setSidebarCollapsed(false);
        } else {
          setSidebarCollapsed(true);
        }
        e.preventDefault();
        break;
      }
      default:
        break;
    }
  }
  function initSidebarResize() {
    layout2 = document.getElementById("app-layout");
    resizer = document.getElementById("app-sidebar-resizer");
    if (!layout2 || !resizer) return;
    let stored = NaN;
    try {
      const raw = localStorage.getItem(APP_SIDEBAR_WIDTH_KEY);
      if (raw) stored = parseInt(raw, 10);
    } catch (e) {
    }
    expandedWidth = Number.isFinite(stored) ? Math.max(MIN_WIDTH, Math.min(maxWidth(), stored)) : DEFAULT_WIDTH;
    applyVar(expandedWidth);
    resizer.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    resizer.addEventListener("keydown", onKeyDown);
  }

  // assets/web/history-sidebar.ts
  var entries = [];
  var groups = [];
  var activeFilter = "all";
  var listEl = null;
  var countEl = null;
  var sidebarEl = null;
  function filtered() {
    if (activeFilter === "all") return entries;
    return entries.filter((e) => e.source === activeFilter);
  }
  function groupEntries(list) {
    const bySql = /* @__PURE__ */ new Map();
    const result = [];
    for (const e of list) {
      let g = bySql.get(e.sql);
      if (!g) {
        g = { sql: e.sql, latest: e, occurrences: [] };
        bySql.set(e.sql, g);
        result.push(g);
      }
      g.occurrences.push(e);
      if (e.at && (!g.latest.at || new Date(e.at).getTime() > new Date(g.latest.at).getTime())) {
        g.latest = e;
      }
    }
    return result;
  }
  function render() {
    if (!listEl) return;
    groups = groupEntries(filtered());
    countEl?.replaceChildren(document.createTextNode("(" + groups.length + ")"));
    if (groups.length === 0) {
      listEl.innerHTML = '<li class="history-empty">' + esc2(vt("viewer.nav.history.empty")) + "</li>";
      return;
    }
    listEl.innerHTML = groups.map((g, i) => {
      const e = g.latest;
      const preview = e.sql.length > 60 ? e.sql.slice(0, 57) + "\u2026" : e.sql;
      const sources = [];
      for (const o of g.occurrences) {
        if (sources.indexOf(o.source) < 0) sources.push(o.source);
      }
      const badge = '<span class="history-badges">' + sources.map(
        (s) => '<span class="history-badge history-badge--' + esc2(s) + '">' + esc2(s) + "</span>"
      ).join("") + "</span>";
      const meta = [];
      meta.push(e.durationMs + " ms");
      if (e.rowCount != null) meta.push(vt("viewer.nav.history.rows", e.rowCount));
      if (e.error) meta.push(vt("viewer.nav.history.errorMark"));
      const at = e.at ? formatRelativeTime(e.at) : "";
      const metaStr = meta.join(" \xB7 ");
      const count = g.occurrences.length;
      const countBadge = count > 1 ? '<button type="button" class="history-count-badge" data-idx="' + i + '" title="' + esc2(vt("viewer.nav.history.runsTooltip", count)) + '">(' + count + ")</button>" : "";
      return '<li class="history-item' + (e.error ? " history-item--error" : "") + '" data-idx="' + i + '" title="' + esc2(e.sql) + '">' + badge + '<span class="history-item-line"><span class="history-sql">' + esc2(preview) + "</span>" + countBadge + '</span><span class="history-meta">' + esc2(metaStr) + (at ? " \xB7 " + esc2(at) : "") + "</span></li>";
    }).join("");
  }
  function formatRelativeTime(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 0) return vt("viewer.nav.history.time.justNow");
    const sec = Math.floor(diff / 1e3);
    if (sec < 60) return vt("viewer.nav.history.time.seconds", sec);
    const min = Math.floor(sec / 60);
    if (min < 60) return vt("viewer.nav.history.time.minutes", min);
    const hr = Math.floor(min / 60);
    if (hr < 24) return vt("viewer.nav.history.time.hours", hr);
    return vt("viewer.nav.history.time.days", Math.floor(hr / 24));
  }
  function formatAbsoluteTime(iso) {
    if (!iso) return "\u2014";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString();
  }
  var dialogOverlay = null;
  function closeOccurrencesDialog() {
    if (dialogOverlay) dialogOverlay.style.display = "none";
    document.removeEventListener("keydown", onOccurrencesKey);
  }
  function onOccurrencesKey(ev) {
    if (ev.key === "Escape") closeOccurrencesDialog();
  }
  function occurrencesToTsv(group, rows) {
    const header = "Time	Duration (ms)";
    const body = rows.map((e) => formatAbsoluteTime(e.at) + "	" + e.durationMs).join("\n");
    return group.sql + "\n\n" + header + "\n" + body;
  }
  function showOccurrencesDialog(group) {
    const rows = group.occurrences.slice().sort((a, b) => {
      const ta = a.at ? new Date(a.at).getTime() : 0;
      const tb = b.at ? new Date(b.at).getTime() : 0;
      return tb - ta;
    });
    if (!dialogOverlay) {
      dialogOverlay = document.createElement("div");
      dialogOverlay.className = "history-dialog-overlay";
      dialogOverlay.setAttribute("role", "dialog");
      dialogOverlay.setAttribute("aria-modal", "true");
      dialogOverlay.setAttribute("aria-label", vt("viewer.nav.history.dialog.ariaLabel"));
      dialogOverlay.addEventListener("click", function(ev) {
        if (ev.target === dialogOverlay) closeOccurrencesDialog();
      });
      document.body.appendChild(dialogOverlay);
    }
    const overlay = dialogOverlay;
    const preview = group.sql.length > 200 ? group.sql.slice(0, 197) + "\u2026" : group.sql;
    const tableRows = rows.map((e) => {
      const badge = '<span class="history-badge history-badge--' + esc2(e.source) + '">' + esc2(e.source) + "</span>";
      return "<tr" + (e.error ? ' class="history-dialog-row--error"' : "") + "><td>" + badge + "</td><td>" + esc2(formatAbsoluteTime(e.at)) + '</td><td class="history-dialog-num">' + esc2(e.durationMs + " ms") + "</td><td>" + (e.error ? '<span title="' + esc2(e.error) + '">' + esc2(vt("viewer.nav.history.errorMark")) + "</span>" : "") + "</td></tr>";
    }).join("");
    overlay.innerHTML = '<div class="history-dialog"><div class="history-dialog-header"><h3 class="history-dialog-title">' + esc2(vt("viewer.nav.history.dialog.title", rows.length)) + '</h3><button type="button" class="history-dialog-close" title="' + esc2(vt("viewer.nav.history.dialog.close")) + '">\u2715</button></div><pre class="history-dialog-sql">' + esc2(preview) + '</pre><div class="history-dialog-table-wrap"><table class="history-dialog-table"><thead><tr><th>' + esc2(vt("viewer.nav.history.col.source")) + "</th><th>" + esc2(vt("viewer.nav.history.col.time")) + "</th><th>" + esc2(vt("viewer.nav.history.col.duration")) + "</th><th></th></tr></thead><tbody>" + tableRows + '</tbody></table></div><div class="history-dialog-actions"><button type="button" class="history-dialog-copy">' + esc2(vt("viewer.nav.history.dialog.copy")) + "</button></div></div>";
    const copyBtn = overlay.querySelector(".history-dialog-copy");
    if (copyBtn) {
      copyBtn.addEventListener("click", function() {
        const text = occurrencesToTsv(group, rows);
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function() {
            showCopyToast(vt("viewer.nav.history.copied", rows.length));
          }).catch(function() {
          });
        }
      });
    }
    const closeBtn = overlay.querySelector(".history-dialog-close");
    if (closeBtn) closeBtn.addEventListener("click", closeOccurrencesDialog);
    document.addEventListener("keydown", onOccurrencesKey);
    overlay.style.display = "flex";
  }
  function fetchHistory() {
    fetch("/api/history", authOpts()).then(function(r) {
      return r.json();
    }).then(function(data) {
      entries = Array.isArray(data.entries) ? data.entries : [];
      render();
    }).catch(function() {
    });
  }
  function clearHistory() {
    if (!confirm(vt("viewer.nav.history.clearConfirm"))) return;
    fetch("/api/history", Object.assign({ method: "DELETE" }, authOpts())).then(function() {
      entries = [];
      render();
    }).catch(function() {
    });
  }
  function initHistorySidebar() {
    sidebarEl = document.getElementById("history-sidebar");
    listEl = document.getElementById(
      "query-history-list"
    );
    countEl = document.getElementById("history-count");
    if (!sidebarEl || !listEl) return;
    const filterBar = sidebarEl.querySelector(".history-filter-bar");
    if (filterBar) {
      filterBar.addEventListener("click", function(e) {
        const btn = e.target.closest(
          ".history-filter"
        );
        if (!btn) return;
        const filter = btn.getAttribute("data-filter");
        if (!filter) return;
        activeFilter = filter;
        filterBar.querySelectorAll(".history-filter").forEach(function(b) {
          const isActive = b.getAttribute("data-filter") === filter;
          b.classList.toggle("active", isActive);
          b.setAttribute("aria-pressed", isActive ? "true" : "false");
        });
        render();
      });
    }
    listEl.addEventListener("click", function(e) {
      const countBtn = e.target.closest(
        ".history-count-badge"
      );
      if (countBtn) {
        const gi = parseInt(countBtn.getAttribute("data-idx") || "", 10);
        if (!isNaN(gi) && groups[gi]) showOccurrencesDialog(groups[gi]);
        return;
      }
      const li = e.target.closest(".history-item");
      if (!li) return;
      const idx = parseInt(li.getAttribute("data-idx") || "", 10);
      if (isNaN(idx) || !groups[idx]) return;
      const sqlInput = document.getElementById("sql-input");
      if (sqlInput) {
        sqlInput.value = groups[idx].sql;
        openTool("sql");
        sqlInput.focus();
      }
    });
    const refreshBtn = document.getElementById("history-refresh");
    if (refreshBtn) refreshBtn.addEventListener("click", fetchHistory);
    const clearBtn = document.getElementById("history-clear");
    if (clearBtn) clearBtn.addEventListener("click", clearHistory);
    fetchHistory();
  }

  // assets/web/diagram.ts
  function initDiagram() {
    const container = document.getElementById("diagram-container");
    if (!container) return;
    const toggle = document.getElementById("diagram-toggle");
    const collapsible = document.getElementById("diagram-collapsible");
    const BOX_W = 200;
    const BOX_H = 160;
    const PAD = 12;
    const COLS = 4;
    let diagramData = null;
    function tablePos(index) {
      const row = Math.floor(index / COLS);
      const col = index % COLS;
      return { x: col * (BOX_W + PAD) + PAD, y: row * (BOX_H + PAD) + PAD };
    }
    function renderDiagram(data) {
      const tables = data.tables || [];
      const fks = data.foreignKeys || [];
      const softs = data.softRelationships || [];
      if (tables.length === 0) {
        container.innerHTML = '<p class="meta">' + esc2(vt("viewer.settings.diagram.noTables")) + "</p>";
        return;
      }
      const rows = Math.ceil(tables.length / COLS);
      const width = COLS * (BOX_W + PAD) + PAD;
      const height = rows * (BOX_H + PAD) + PAD;
      const nameToIndex = {};
      tables.forEach((t, i) => {
        nameToIndex[t.name] = i;
      });
      const getCenter = (index, side) => {
        const p = tablePos(index);
        const cx = p.x + BOX_W / 2;
        const cy = p.y + BOX_H / 2;
        if (side === "right") return { x: p.x + BOX_W, y: cy };
        if (side === "left") return { x: p.x, y: cy };
        return { x: cx, y: cy };
      };
      const tablesClause = vt(tables.length !== 1 ? "viewer.settings.diagram.aria.tablesMany" : "viewer.settings.diagram.aria.tablesOne", tables.length);
      const fksClause = vt(fks.length !== 1 ? "viewer.settings.diagram.aria.fksMany" : "viewer.settings.diagram.aria.fksOne", fks.length);
      const softLabel = softs.length ? vt(softs.length !== 1 ? "viewer.settings.diagram.aria.softMany" : "viewer.settings.diagram.aria.softOne", softs.length) : "";
      const ariaSummary = vt("viewer.settings.diagram.aria.summary", tablesClause, fksClause, softLabel);
      let svg = '<svg role="group" aria-label="' + esc2(ariaSummary) + '" width="' + width + '" height="' + height + '" xmlns="http://www.w3.org/2000/svg">';
      svg += '<g class="diagram-links">';
      fks.forEach(function(fk) {
        const iFrom = nameToIndex[fk.fromTable];
        const iTo = nameToIndex[fk.toTable];
        if (iFrom == null || iTo == null) return;
        const from = getCenter(iFrom, "right");
        const to = getCenter(iTo, "left");
        const mid = (from.x + to.x) / 2;
        svg += '<path class="diagram-link" d="M' + from.x + "," + from.y + " C" + mid + "," + from.y + " " + mid + "," + to.y + " " + to.x + "," + to.y + '"><title>' + esc2(fk.fromTable) + "." + esc2(fk.fromColumn) + " \u2192 " + esc2(fk.toTable) + "." + esc2(fk.toColumn) + "</title></path>";
      });
      softs.forEach(function(s) {
        const iFrom = nameToIndex[s.fromTable];
        const iTo = nameToIndex[s.toTable];
        if (iFrom == null || iTo == null) return;
        const from = getCenter(iFrom, "right");
        const to = getCenter(iTo, "left");
        const mid = (from.x + to.x) / 2;
        const how = vt(s.rule === "noun_id" ? "viewer.settings.diagram.rule.nounId" : "viewer.settings.diagram.rule.sharedUuid");
        svg += '<path class="diagram-link diagram-link-soft" d="M' + from.x + "," + from.y + " C" + mid + "," + from.y + " " + mid + "," + to.y + " " + to.x + "," + to.y + '"><title>' + esc2(s.fromTable) + "." + esc2(s.fromColumn) + " \u2192 " + esc2(s.toTable) + "." + esc2(s.toColumn) + " " + esc2(vt("viewer.settings.diagram.alt.softInferred", how)) + "</title></path>";
      });
      svg += '</g><g class="diagram-tables">';
      tables.forEach(function(t, i) {
        const p = tablePos(i);
        const allCols = t.columns || [];
        const cols = allCols.slice(0, 6);
        const name = esc2(t.name);
        const pkCols = allCols.filter(function(c) {
          return c.pk;
        }).map(function(c) {
          return c.name;
        });
        const pkClause = pkCols.length ? vt("viewer.settings.diagram.aria.pkClause", pkCols.join(", ")) : "";
        const ariaLabel = vt(allCols.length !== 1 ? "viewer.settings.diagram.aria.tableMany" : "viewer.settings.diagram.aria.tableOne", t.name, allCols.length, pkClause);
        let body = cols.map(function(c) {
          const pk = c.pk ? ' <tspan class="diagram-pk">' + esc2(vt("viewer.settings.diagram.pk")) + "</tspan>" : "";
          return '<tspan class="diagram-col" x="8" dy="16">' + esc2(c.name) + (c.type ? " " + esc2(c.type) : "") + pk + "</tspan>";
        }).join("");
        if (allCols.length > 6) body += '<tspan class="diagram-col" x="8" dy="16">\u2026</tspan>';
        svg += '<g class="diagram-table" data-table="' + name + '" tabindex="0" role="button" aria-label="' + esc2(ariaLabel) + '" transform="translate(' + p.x + "," + p.y + ')">';
        svg += '<rect width="' + BOX_W + '" height="' + BOX_H + '" rx="4"/>';
        svg += '<text class="diagram-name" x="8" y="22" style="fill: var(--link);">' + name + "</text>";
        svg += '<text x="8" y="38">' + body + "</text>";
        svg += "</g>";
      });
      svg += "</g></svg>";
      container.innerHTML = svg;
      const tableEls = container.querySelectorAll(".diagram-table");
      tableEls.forEach(function(g, i) {
        g.addEventListener("click", function() {
          const name = this.getAttribute("data-table");
          if (name) openTableTab(name);
        });
        g.addEventListener("keydown", function(e) {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            const name = this.getAttribute("data-table");
            if (name) openTableTab(name);
            return;
          }
          var target = -1;
          if (e.key === "ArrowRight") target = i + 1;
          else if (e.key === "ArrowLeft") target = i - 1;
          else if (e.key === "ArrowDown") target = i + COLS;
          else if (e.key === "ArrowUp") target = i - COLS;
          if (target >= 0 && target < tableEls.length) {
            e.preventDefault();
            tableEls[target].focus();
          }
        });
      });
      var altEl = document.getElementById("diagram-text-alt");
      if (altEl) {
        var altHtml = "<h4>" + esc2(vt("viewer.settings.diagram.alt.tableList")) + "</h4><ul>";
        tables.forEach(function(t) {
          var cols = t.columns || [];
          var nameMarkup = "<strong>" + esc2(t.name) + "</strong>";
          var colList = cols.map(function(c) {
            return esc2(c.name) + (c.pk ? vt("viewer.settings.diagram.alt.pkMark") : "");
          }).join(", ");
          altHtml += "<li>" + vt(cols.length !== 1 ? "viewer.settings.diagram.alt.tableMany" : "viewer.settings.diagram.alt.tableOne", nameMarkup, cols.length, colList) + "</li>";
        });
        altHtml += "</ul>";
        if (fks.length > 0) {
          altHtml += "<h4>" + esc2(vt("viewer.settings.diagram.alt.fkHeading")) + "</h4><ul>";
          fks.forEach(function(fk) {
            altHtml += "<li>" + esc2(fk.fromTable) + "." + esc2(fk.fromColumn) + " \u2192 " + esc2(fk.toTable) + "." + esc2(fk.toColumn) + "</li>";
          });
          altHtml += "</ul>";
        }
        if (softs.length > 0) {
          altHtml += "<h4>" + esc2(vt("viewer.settings.diagram.alt.softHeading")) + "</h4><ul>";
          softs.forEach(function(s) {
            const how = vt(s.rule === "noun_id" ? "viewer.settings.diagram.rule.nounId" : "viewer.settings.diagram.rule.sharedUuid");
            altHtml += "<li>" + esc2(s.fromTable) + "." + esc2(s.fromColumn) + " \u2192 " + esc2(s.toTable) + "." + esc2(s.toColumn) + " " + esc2(vt("viewer.settings.diagram.alt.softInferred", how)) + "</li>";
          });
          altHtml += "</ul>";
        }
        altEl.innerHTML = altHtml;
      }
    }
    function loadAndRenderDiagram() {
      if (diagramData === null) {
        container.innerHTML = '<p class="meta">' + esc2(vt("viewer.settings.diagram.loading")) + "</p>";
        fetch("/api/schema/diagram", authOpts()).then((r) => r.json()).then(function(data) {
          diagramData = data;
          renderDiagram(data);
        }).catch(function(e) {
          container.innerHTML = '<p class="meta">' + esc2(vt("viewer.settings.diagram.loadFailed", String(e))) + "</p>";
        });
      } else {
        renderDiagram(diagramData);
      }
    }
    window.ensureDiagramInited = loadAndRenderDiagram;
    if (toggle && collapsible) {
      toggle.addEventListener("click", function() {
        const isCollapsed = collapsible.classList.contains("collapsed");
        collapsible.classList.toggle("collapsed", !isCollapsed);
        syncFeatureCardExpanded(collapsible);
        if (isCollapsed) loadAndRenderDiagram();
      });
    }
  }

  // assets/web/analysis.ts
  function analysisStorageKey(type) {
    return ANALYSIS_STORAGE_PREFIX + type;
  }
  function getSavedAnalyses(type) {
    try {
      var raw = localStorage.getItem(analysisStorageKey(type));
      if (!raw) return [];
      var list = JSON.parse(raw);
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }
  function saveAnalysis(type, data) {
    if (!data) return null;
    var list = getSavedAnalyses(type);
    var id = "id_" + Date.now();
    var label = (/* @__PURE__ */ new Date()).toLocaleString();
    list.unshift({ id, savedAt: label, data });
    var maxSaved = getPref(PREF_ANALYSIS_MAX, DEFAULTS[PREF_ANALYSIS_MAX]);
    if (list.length > maxSaved) list.length = maxSaved;
    try {
      localStorage.setItem(analysisStorageKey(type), JSON.stringify(list));
      return id;
    } catch (e) {
      return null;
    }
  }
  function getSavedAnalysisById(type, id) {
    var list = getSavedAnalyses(type);
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }
  function downloadJSON(data, filename) {
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename || "analysis.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }
  function populateHistorySelect(selectEl, type) {
    if (!selectEl) return;
    var list = getSavedAnalyses(type);
    var value = selectEl.value;
    selectEl.innerHTML = '<option value="">' + vt("viewer.tools.analysis.pastRuns") + "</option>";
    list.forEach(function(item) {
      var opt = document.createElement("option");
      opt.value = item.id;
      opt.textContent = item.savedAt;
      selectEl.appendChild(opt);
    });
    if (value) selectEl.value = value;
  }
  function showAnalysisCompare(type, title, savedList, currentData, renderFn, summaryFn) {
    var overlay = document.getElementById("analysis-compare-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "analysis-compare-overlay";
      overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;";
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-label", vt("viewer.tools.analysis.compareAria"));
      document.body.appendChild(overlay);
    }
    var beforeId = "";
    var afterId = "";
    var beforeData = null;
    var afterData = null;
    function getData(optionValue) {
      if (optionValue === "_current") return currentData;
      if (!optionValue) return null;
      for (var i = 0; i < savedList.length; i++) {
        if (savedList[i].id === optionValue) return savedList[i].data;
      }
      return null;
    }
    function updateSummary() {
      beforeData = getData(beforeId);
      afterData = getData(afterId);
      summaryEl.textContent = summaryFn ? summaryFn(beforeData, afterData) : vt("viewer.tools.analysis.prompt");
      if (beforeData && afterData && renderFn) {
        leftPanel.innerHTML = renderFn(beforeData);
        rightPanel.innerHTML = renderFn(afterData);
      } else {
        leftPanel.innerHTML = beforeData ? renderFn(beforeData) : '<p class="meta">' + vt("viewer.tools.analysis.selectBefore") + "</p>";
        rightPanel.innerHTML = afterData ? renderFn(afterData) : '<p class="meta">' + vt("viewer.tools.analysis.selectAfter") + "</p>";
      }
    }
    var panel = document.createElement("div");
    panel.style.cssText = "background:var(--bg, #fff);color:var(--fg, #111);padding:1rem;border-radius:8px;max-width:95vw;max-height:90vh;overflow:auto;box-shadow:0 4px 20px rgba(0,0,0,0.3);";
    panel.innerHTML = '<h3 style="margin:0 0 0.75rem;">' + vt("viewer.tools.analysis.compareHeading", esc2(title)) + "</h3>";
    var toolbar = document.createElement("div");
    toolbar.className = "toolbar";
    toolbar.style.marginBottom = "0.5rem";
    var beforeLabel = document.createElement("label");
    beforeLabel.textContent = vt("viewer.tools.analysis.before");
    var beforeSel = document.createElement("select");
    beforeSel.id = "compare-before";
    beforeSel.innerHTML = '<option value="">' + vt("viewer.tools.analysis.selectPlaceholder") + '</option><option value="_current">' + vt("viewer.tools.analysis.currentResult") + "</option>";
    (savedList || []).forEach(function(item) {
      var opt = document.createElement("option");
      opt.value = item.id;
      opt.textContent = item.savedAt;
      beforeSel.appendChild(opt);
    });
    var afterLabel = document.createElement("label");
    afterLabel.textContent = vt("viewer.tools.analysis.after");
    var afterSel = document.createElement("select");
    afterSel.id = "compare-after";
    afterSel.innerHTML = '<option value="">' + vt("viewer.tools.analysis.selectPlaceholder") + '</option><option value="_current">' + vt("viewer.tools.analysis.currentResult") + "</option>";
    (savedList || []).forEach(function(item) {
      var opt = document.createElement("option");
      opt.value = item.id;
      opt.textContent = item.savedAt;
      afterSel.appendChild(opt);
    });
    var closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.textContent = vt("viewer.tools.analysis.close");
    closeBtn.title = vt("viewer.tools.analysis.closeTitle");
    toolbar.appendChild(beforeLabel);
    toolbar.appendChild(beforeSel);
    toolbar.appendChild(afterLabel);
    toolbar.appendChild(afterSel);
    toolbar.appendChild(closeBtn);
    panel.appendChild(toolbar);
    var summaryEl = document.createElement("p");
    summaryEl.className = "meta";
    summaryEl.style.marginBottom = "0.5rem";
    summaryEl.textContent = vt("viewer.tools.analysis.prompt");
    panel.appendChild(summaryEl);
    var columns = document.createElement("div");
    columns.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:1rem;";
    var leftPanel = document.createElement("div");
    leftPanel.style.cssText = "border:1px solid var(--border);padding:0.5rem;border-radius:4px;max-height:50vh;overflow:auto;";
    leftPanel.innerHTML = '<p class="meta">' + vt("viewer.tools.analysis.selectBefore") + "</p>";
    var rightPanel = document.createElement("div");
    rightPanel.style.cssText = "border:1px solid var(--border);padding:0.5rem;border-radius:4px;max-height:50vh;overflow:auto;";
    rightPanel.innerHTML = '<p class="meta">' + vt("viewer.tools.analysis.selectAfter") + "</p>";
    columns.appendChild(leftPanel);
    columns.appendChild(rightPanel);
    panel.appendChild(columns);
    overlay.innerHTML = "";
    overlay.appendChild(panel);
    beforeSel.addEventListener("change", function() {
      beforeId = this.value;
      updateSummary();
    });
    afterSel.addEventListener("change", function() {
      afterId = this.value;
      updateSummary();
    });
    function closeOverlay() {
      overlay.style.display = "none";
      document.removeEventListener("keydown", escapeHandler);
    }
    function escapeHandler(e) {
      if (e.key === "Escape") closeOverlay();
    }
    closeBtn.addEventListener("click", closeOverlay);
    overlay.addEventListener("click", function(e) {
      if (e.target === overlay) closeOverlay();
    });
    document.addEventListener("keydown", escapeHandler);
    overlay.style.display = "flex";
  }
  function renderDiffRows(rows, type) {
    if (rows.length === 0) return "";
    var keys = Object.keys(rows[0]);
    var bgColor = type === "added" ? "rgba(124,179,66,0.15)" : "rgba(229,115,115,0.15)";
    var html = '<table style="border-collapse:collapse;width:100%;font-size:11px;margin-bottom:0.3rem;">';
    html += "<tr>" + keys.map(function(k) {
      return '<th style="border:1px solid var(--border);padding:2px 4px;">' + esc2(k) + "</th>";
    }).join("") + "</tr>";
    rows.forEach(function(r) {
      html += '<tr style="background:' + bgColor + ';">' + keys.map(function(k) {
        return '<td style="border:1px solid var(--border);padding:2px 4px;">' + esc2(String(r[k] != null ? r[k] : "")) + "</td>";
      }).join("") + "</tr>";
    });
    html += "</table>";
    return html;
  }
  function renderRowDiff(container, tables) {
    var html = "";
    html += '<table class="snapshot-summary-table"><thead><tr><th>' + vt("viewer.tools.diff.col.table") + "</th><th>" + vt("viewer.tools.diff.col.then") + "</th><th>" + vt("viewer.tools.diff.col.now") + "</th><th>" + vt("viewer.tools.diff.col.status") + "</th></tr></thead><tbody>";
    tables.forEach(function(t) {
      var status = "";
      if (!t.hasPk) {
        status = vt("viewer.tools.diff.noPk");
      } else if (t.addedRows && t.addedRows.length > 0 || t.removedRows && t.removedRows.length > 0 || t.changedRows && t.changedRows.length > 0) {
        var parts = [];
        if (t.addedRows && t.addedRows.length > 0) parts.push(vt("viewer.tools.diff.added", t.addedRows.length));
        if (t.removedRows && t.removedRows.length > 0) parts.push(vt("viewer.tools.diff.removed", t.removedRows.length));
        if (t.changedRows && t.changedRows.length > 0) parts.push(vt("viewer.tools.diff.changed", t.changedRows.length));
        status = parts.join(", ");
      } else {
        status = vt("viewer.tools.diff.noChanges");
      }
      html += "<tr><td>" + esc2(t.table) + "</td><td>" + t.countThen + "</td><td>" + t.countNow + "</td><td>" + esc2(status) + "</td></tr>";
    });
    html += "</tbody></table>";
    tables.forEach(function(t) {
      if (!t.hasPk) return;
      var hasDetail = t.addedRows && t.addedRows.length > 0 || t.removedRows && t.removedRows.length > 0 || t.changedRows && t.changedRows.length > 0;
      if (!hasDetail) return;
      html += '<h4 style="margin:0.5rem 0 0.25rem;">' + esc2(t.table) + "</h4>";
      if (t.addedRows && t.addedRows.length > 0) {
        html += '<p class="meta" style="color:#7cb342;">' + vt("viewer.tools.diff.addedDetail", t.addedRows.length) + "</p>";
        html += renderDiffRows(t.addedRows, "added");
      }
      if (t.removedRows && t.removedRows.length > 0) {
        html += '<p class="meta" style="color:#e57373;">' + vt("viewer.tools.diff.removedDetail", t.removedRows.length) + "</p>";
        html += renderDiffRows(t.removedRows, "removed");
      }
      if (t.changedRows && t.changedRows.length > 0) {
        html += '<p class="meta" style="color:#ffb74d;">' + vt("viewer.tools.diff.changedDetail", t.changedRows.length) + "</p>";
        t.changedRows.forEach(function(cr) {
          var keys = Object.keys(cr.now);
          var changed = new Set(cr.changedColumns || []);
          html += '<table style="border-collapse:collapse;width:100%;font-size:11px;margin-bottom:0.4rem;">';
          html += "<tr>" + keys.map(function(k) {
            return '<th style="border:1px solid var(--border);padding:2px 4px;' + (changed.has(k) ? "background:rgba(255,183,77,0.2);" : "") + '">' + esc2(k) + "</th>";
          }).join("") + "</tr>";
          html += "<tr>" + keys.map(function(k) {
            var isChanged = changed.has(k);
            return '<td style="border:1px solid var(--border);padding:2px 4px;' + (isChanged ? "background:rgba(229,115,115,0.2);text-decoration:line-through;" : "") + '">' + esc2(String(cr.then[k] != null ? cr.then[k] : "")) + "</td>";
          }).join("") + "</tr>";
          html += "<tr>" + keys.map(function(k) {
            var isChanged = changed.has(k);
            return '<td style="border:1px solid var(--border);padding:2px 4px;' + (isChanged ? "background:rgba(124,179,66,0.2);font-weight:bold;" : "") + '">' + esc2(String(cr.now[k] != null ? cr.now[k] : "")) + "</td>";
          }).join("") + "</tr>";
          html += "</table>";
        });
      }
    });
    container.innerHTML = html;
  }

  // assets/web/tools-compare.ts
  function initSnapshot() {
    const toggle = document.getElementById("snapshot-toggle");
    const collapsible = document.getElementById("snapshot-collapsible");
    const takeBtn = document.getElementById("snapshot-take");
    const compareBtn = document.getElementById("snapshot-compare");
    const exportLink = document.getElementById("snapshot-export-diff");
    const clearBtn = document.getElementById("snapshot-clear");
    const statusEl = document.getElementById("snapshot-status");
    const resultPre = document.getElementById("snapshot-compare-result");
    var snapshotItems = [];
    function listHost() {
      var host2 = document.getElementById("snapshot-list");
      if (!host2 && statusEl && statusEl.parentNode) {
        host2 = document.createElement("div");
        host2.id = "snapshot-list";
        host2.style.margin = "0.5rem 0";
        statusEl.parentNode.insertBefore(host2, resultPre || null);
      }
      return host2;
    }
    function fmtSnapshotLabel(s) {
      var when = s.createdAt || s.id || "";
      return (s.label ? vt("viewer.tools.snapshot.labelPrefix", s.label) : "") + when;
    }
    function buildExportHref() {
      var from = document.getElementById("snapshot-from");
      var to = document.getElementById("snapshot-to");
      var qs = "detail=rows&format=download";
      if (from && from.value) qs += "&from=" + encodeURIComponent(from.value);
      if (to && to.value) qs += "&to=" + encodeURIComponent(to.value);
      return "/api/snapshot/compare?" + qs;
    }
    function renderSnapshotList() {
      var host2 = listHost();
      if (!host2) return;
      var has = snapshotItems.length > 0;
      compareBtn.disabled = !has;
      exportLink.style.display = has ? "" : "none";
      clearBtn.style.display = has ? "" : "none";
      if (has) exportLink.href = buildExportHref();
      if (!has) {
        host2.innerHTML = '<p class="meta">' + vt("viewer.tools.snapshot.empty") + "</p>";
        return;
      }
      var html = '<div style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap;margin-bottom:0.4rem;">';
      html += '<label class="meta">' + vt("viewer.tools.snapshot.from") + ' <select id="snapshot-from">';
      snapshotItems.forEach(function(s) {
        html += '<option value="' + esc2(s.id) + '">' + esc2(fmtSnapshotLabel(s)) + "</option>";
      });
      html += "</select></label>";
      html += '<label class="meta">' + vt("viewer.tools.snapshot.to") + ' <select id="snapshot-to"><option value="">' + vt("viewer.tools.snapshot.now") + "</option>";
      snapshotItems.forEach(function(s) {
        html += '<option value="' + esc2(s.id) + '">' + esc2(fmtSnapshotLabel(s)) + "</option>";
      });
      html += "</select></label>";
      html += "</div>";
      html += '<table style="border-collapse:collapse;width:100%;font-size:12px;">';
      html += '<tr><th style="border:1px solid var(--border);padding:4px;text-align:left;">' + vt("viewer.tools.snapshot.col.snapshot") + '</th><th style="border:1px solid var(--border);padding:4px;">' + vt("viewer.tools.snapshot.col.tables") + '</th><th style="border:1px solid var(--border);padding:4px;">' + vt("viewer.tools.snapshot.col.actions") + "</th></tr>";
      snapshotItems.forEach(function(s) {
        html += "<tr>";
        html += '<td style="border:1px solid var(--border);padding:4px;">' + esc2(fmtSnapshotLabel(s)) + "</td>";
        html += '<td style="border:1px solid var(--border);padding:4px;text-align:right;">' + (s.tableCount != null ? s.tableCount : "") + "</td>";
        html += '<td style="border:1px solid var(--border);padding:4px;">';
        html += '<button class="btn snapshot-rename" data-id="' + esc2(s.id) + '">' + vt("viewer.tools.snapshot.rename") + "</button> ";
        html += '<button class="btn snapshot-del" data-id="' + esc2(s.id) + '">' + vt("viewer.tools.snapshot.delete") + "</button>";
        html += "</td></tr>";
      });
      html += "</table>";
      host2.innerHTML = html;
      var fromSel = document.getElementById("snapshot-from");
      if (fromSel && snapshotItems.length) fromSel.value = snapshotItems[snapshotItems.length - 1].id;
      var toSel = document.getElementById("snapshot-to");
      if (toSel) toSel.addEventListener("change", function() {
        exportLink.href = buildExportHref();
      });
      if (fromSel) fromSel.addEventListener("change", function() {
        exportLink.href = buildExportHref();
      });
    }
    function refreshSnapshotList() {
      fetch("/api/snapshots", authOpts()).then((r) => r.json()).then(function(data) {
        snapshotItems = data && data.snapshots || [];
        renderSnapshotList();
      }).catch(function() {
        snapshotItems = [];
        renderSnapshotList();
      });
    }
    if (toggle && collapsible) {
      toggle.addEventListener("click", function() {
        const isCollapsed = collapsible.classList.contains("collapsed");
        collapsible.classList.toggle("collapsed", !isCollapsed);
        syncFeatureCardExpanded(collapsible);
        if (isCollapsed) refreshSnapshotList();
      });
    }
    if (takeBtn) takeBtn.addEventListener("click", function() {
      var label = window.prompt(vt("viewer.tools.snapshot.takePrompt")) || "";
      takeBtn.disabled = true;
      statusEl.textContent = vt("viewer.tools.snapshot.capturing");
      fetch("/api/snapshot", authOpts({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim() })
      })).then((r) => r.json().then(function(d) {
        return { ok: r.ok, data: d };
      })).then(function(o) {
        if (o.ok) {
          statusEl.textContent = vt("viewer.tools.snapshot.saved", o.data.createdAt);
          refreshSnapshotList();
        } else statusEl.textContent = o.data.error || vt("viewer.tools.snapshot.failed");
      }).catch(function(e) {
        statusEl.textContent = vt("viewer.tools.snapshot.error", e.message);
      }).finally(function() {
        takeBtn.disabled = false;
      });
    });
    if (compareBtn) compareBtn.addEventListener("click", function() {
      var from = document.getElementById("snapshot-from");
      var to = document.getElementById("snapshot-to");
      var qs = "detail=rows";
      if (from && from.value) qs += "&from=" + encodeURIComponent(from.value);
      if (to && to.value) qs += "&to=" + encodeURIComponent(to.value);
      compareBtn.disabled = true;
      resultPre.style.display = "none";
      resultPre.innerHTML = "";
      statusEl.textContent = vt("viewer.tools.snapshot.comparing");
      statusEl.setAttribute("aria-busy", "true");
      fetch("/api/snapshot/compare?" + qs, authOpts()).then((r) => r.json().then(function(d) {
        return { ok: r.ok, data: d };
      })).then(function(o) {
        if (o.ok) {
          if (o.data.tables) {
            renderRowDiff(resultPre, o.data.tables);
          } else {
            resultPre.textContent = JSON.stringify(o.data, null, 2);
          }
          resultPre.style.display = "block";
          statusEl.textContent = "";
        } else {
          statusEl.textContent = o.data.error || vt("viewer.tools.snapshot.compareFailed");
        }
      }).catch(function(e) {
        statusEl.textContent = vt("viewer.tools.snapshot.error", e.message);
      }).finally(function() {
        compareBtn.disabled = false;
        statusEl.removeAttribute("aria-busy");
      });
    });
    if (clearBtn) clearBtn.addEventListener("click", function() {
      if (!window.confirm(vt("viewer.tools.snapshot.clearConfirm"))) return;
      clearBtn.disabled = true;
      statusEl.textContent = vt("viewer.tools.snapshot.clearing");
      fetch("/api/snapshot", authOpts({ method: "DELETE" })).then(function() {
        resultPre.style.display = "none";
        resultPre.innerHTML = "";
        statusEl.textContent = vt("viewer.tools.snapshot.cleared");
        refreshSnapshotList();
      }).catch(function(e) {
        statusEl.textContent = vt("viewer.tools.snapshot.error", e.message);
      }).finally(function() {
        clearBtn.disabled = false;
      });
    });
    var host = listHost();
    if (host) {
      host.addEventListener("click", function(e) {
        var t = e.target;
        if (!t || !t.getAttribute) return;
        var id = t.getAttribute("data-id");
        if (!id) return;
        if (t.classList.contains("snapshot-del")) {
          if (!window.confirm(vt("viewer.tools.snapshot.deleteConfirm"))) return;
          fetch("/api/snapshot/" + encodeURIComponent(id), authOpts({ method: "DELETE" })).then(function() {
            refreshSnapshotList();
          }).catch(function(err) {
            statusEl.textContent = vt("viewer.tools.snapshot.error", err.message);
          });
        } else if (t.classList.contains("snapshot-rename")) {
          var label = window.prompt(vt("viewer.tools.snapshot.renamePrompt")) || "";
          fetch("/api/snapshot/" + encodeURIComponent(id), authOpts({
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ label: label.trim() })
          })).then(function() {
            refreshSnapshotList();
          }).catch(function(err) {
            statusEl.textContent = vt("viewer.tools.snapshot.error", err.message);
          });
        }
      });
    }
    refreshSnapshotList();
  }
  function initCompare() {
    const toggle = document.getElementById("compare-toggle");
    const collapsible = document.getElementById("compare-collapsible");
    const viewBtn = document.getElementById("compare-view");
    const exportLink = document.getElementById("compare-export");
    const statusEl = document.getElementById("compare-status");
    const resultPre = document.getElementById("compare-result");
    if (DRIFT_VIEWER_AUTH_TOKEN && exportLink) {
      exportLink.href = "/api/compare/report?format=download";
    }
    if (toggle && collapsible) {
      toggle.addEventListener("click", function() {
        const isCollapsed = collapsible.classList.contains("collapsed");
        collapsible.classList.toggle("collapsed", !isCollapsed);
        syncFeatureCardExpanded(collapsible);
      });
    }
    if (viewBtn) viewBtn.addEventListener("click", function() {
      viewBtn.disabled = true;
      resultPre.style.display = "none";
      statusEl.textContent = vt("viewer.tools.compare.loading");
      fetch("/api/compare/report", authOpts()).then((r) => r.json().then(function(d) {
        return { status: r.status, data: d };
      })).then(function(o) {
        if (o.status === 501) {
          statusEl.textContent = vt("viewer.tools.compare.notConfigured");
        } else if (o.status >= 400) {
          statusEl.textContent = o.data.error || vt("viewer.tools.compare.requestFailed");
        } else {
          resultPre.textContent = JSON.stringify(o.data, null, 2);
          resultPre.style.display = "block";
          statusEl.textContent = "";
        }
      }).catch(function(e) {
        statusEl.textContent = vt("viewer.tools.compare.error", e.message);
      }).finally(function() {
        viewBtn.disabled = false;
      });
    });
  }
  function initMigrationPreview() {
    var btn = document.getElementById("migration-preview");
    var statusEl = document.getElementById("compare-status");
    var resultPre = document.getElementById("compare-result");
    if (!btn) return;
    btn.addEventListener("click", function() {
      btn.disabled = true;
      setButtonBusy(btn, true, vt("viewer.tools.migration.busy"));
      resultPre.style.display = "none";
      statusEl.textContent = "";
      fetch("/api/migration/preview", authOpts()).then(function(r) {
        return r.json().then(function(d) {
          return { status: r.status, data: d };
        });
      }).then(function(o) {
        if (o.status === 501) {
          statusEl.textContent = vt("viewer.tools.compare.notConfigured");
          return;
        }
        if (o.status >= 400) {
          statusEl.textContent = o.data.error || vt("viewer.tools.compare.requestFailed");
          return;
        }
        var sql = o.data.migrationSql || vt("viewer.tools.migration.noChanges");
        var html = '<p class="meta">' + vt("viewer.tools.migration.summary", o.data.changeCount);
        if (o.data.hasWarnings) html += vt("viewer.tools.migration.withWarnings");
        html += "</p>";
        html += '<pre style="font-size:11px;max-height:30vh;overflow:auto;background:var(--bg-pre);padding:0.5rem;border-radius:4px;">' + highlightSqlSafe(sql) + "</pre>";
        html += '<button type="button" id="migration-copy-sql" title="' + vt("viewer.tools.migration.copySqlTitle") + '">' + vt("viewer.tools.migration.copySql") + "</button>";
        resultPre.innerHTML = html;
        resultPre.style.display = "block";
        statusEl.textContent = "";
        var copyBtn = document.getElementById("migration-copy-sql");
        if (copyBtn) copyBtn.addEventListener("click", function() {
          navigator.clipboard.writeText(sql);
          this.textContent = vt("viewer.tools.migration.copied");
        });
      }).catch(function(e) {
        statusEl.textContent = vt("viewer.tools.compare.error", e.message);
      }).finally(function() {
        btn.disabled = false;
        setButtonBusy(btn, false, vt("viewer.tools.migration.button"));
      });
    });
  }

  // assets/web/tools-analytics.ts
  function initIndexSuggestions() {
    const toggle = document.getElementById("index-toggle");
    const collapsible = document.getElementById("index-collapsible");
    const btn = document.getElementById("index-analyze");
    const container = document.getElementById("index-results");
    const saveBtn = document.getElementById("index-save");
    const exportBtn = document.getElementById("index-export");
    const historySel = document.getElementById("index-history");
    const compareBtn = document.getElementById("index-compare");
    var lastIndexData = null;
    function renderIndexData(data, interactive) {
      if (!data) return '<p class="meta">' + vt("viewer.tools.index.empty") + "</p>";
      var suggestions = data.suggestions || [];
      if (suggestions.length === 0) {
        return '<p class="meta" style="color:#7cb342;">' + vt("viewer.tools.index.none") + "</p>";
      }
      var priorityColors = { high: "#e57373", medium: "#ffb74d", low: "#7cb342" };
      var priorityIcons = { high: "!!", medium: "!", low: "\u2713" };
      var html = '<p class="meta">' + vt("viewer.tools.index.summary", suggestions.length, data.tablesAnalyzed || 0) + "</p>";
      html += '<table style="border-collapse:collapse;width:100%;font-size:12px;">';
      html += "<tr>";
      if (interactive) html += '<th style="border:1px solid var(--border);padding:4px;"><input type="checkbox" id="index-select-all" title="' + vt("viewer.tools.index.selectAll") + '"></th>';
      html += '<th style="border:1px solid var(--border);padding:4px;">' + vt("viewer.tools.index.col.priority") + '</th><th style="border:1px solid var(--border);padding:4px;">' + vt("viewer.tools.index.col.tableColumn") + '</th><th style="border:1px solid var(--border);padding:4px;">' + vt("viewer.tools.index.col.reason") + '</th><th style="border:1px solid var(--border);padding:4px;">' + vt("viewer.tools.index.col.sql") + "</th></tr>";
      suggestions.forEach(function(s, i) {
        var color = priorityColors[s.priority] || "var(--fg)";
        var icon = priorityIcons[s.priority] || "";
        html += "<tr>";
        if (interactive) html += '<td style="border:1px solid var(--border);padding:4px;text-align:center;"><input type="checkbox" class="idx-cb" data-idx="' + i + '"></td>';
        html += '<td style="border:1px solid var(--border);padding:4px;color:' + color + ';font-weight:bold;">[' + esc2(icon) + "] " + esc2(s.priority).toUpperCase() + "</td>";
        html += '<td style="border:1px solid var(--border);padding:4px;">' + esc2(s.table) + "." + esc2(s.column) + "</td>";
        html += '<td style="border:1px solid var(--border);padding:4px;">' + esc2(s.reason) + "</td>";
        html += '<td style="border:1px solid var(--border);padding:4px;"><code style="font-size:11px;cursor:pointer;" title="' + vt("viewer.tools.index.copyHint") + '" onclick="navigator.clipboard.writeText(this.textContent)">' + esc2(s.sql) + "</code></td>";
        html += "</tr>";
      });
      html += "</table>";
      if (interactive) {
        html += '<div class="index-bulk-bar" style="margin-top:0.5rem;display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap;">';
        html += '<span id="index-sel-count" class="meta">' + vt("viewer.tools.index.selected", 0) + "</span>";
        html += '<button id="index-preview-sel" class="btn" disabled>' + vt("viewer.tools.index.previewSql") + "</button>";
        if (driftWriteEnabled) {
          html += '<button id="index-apply-sel" class="btn" disabled>' + vt("viewer.tools.index.applySelected") + "</button>";
        } else {
          html += '<span class="meta" title="' + vt("viewer.tools.index.applyDisabledHint") + '">' + vt("viewer.tools.index.applyDisabled") + "</span>";
        }
        html += "</div>";
        html += '<div id="index-preview-out" style="display:none;margin-top:0.5rem;"></div>';
        html += '<div id="index-apply-out" style="display:none;margin-top:0.5rem;"></div>';
      }
      return html;
    }
    function showIndexResult(html, isError) {
      container.innerHTML = html;
      container.style.display = "block";
    }
    function getSelectedIndexSqls() {
      var out = [];
      if (!container || !lastIndexData) return out;
      var boxes = container.querySelectorAll("input.idx-cb");
      Array.prototype.forEach.call(boxes, function(cb) {
        if (!cb.checked) return;
        var idx = parseInt(cb.getAttribute("data-idx"), 10);
        var s = (lastIndexData.suggestions || [])[idx];
        if (s && s.sql) out.push(s.sql);
      });
      return out;
    }
    function refreshIndexSelection() {
      if (!container) return;
      var count = getSelectedIndexSqls().length;
      var countEl2 = document.getElementById("index-sel-count");
      if (countEl2) countEl2.textContent = vt("viewer.tools.index.selected", count);
      var previewBtn = document.getElementById("index-preview-sel");
      if (previewBtn) previewBtn.disabled = count === 0;
      var applyBtn = document.getElementById("index-apply-sel");
      if (applyBtn) applyBtn.disabled = count === 0;
    }
    function renderPreviewOutput(data) {
      var valid = data && data.valid || [];
      var rejected = data && data.rejected || [];
      var html = '<p class="meta">' + vt("viewer.tools.index.preview.summary", valid.length, rejected.length) + "</p>";
      if (valid.length) {
        html += '<pre style="white-space:pre-wrap;font-size:11px;background:rgba(0,0,0,0.12);padding:0.4rem;border-radius:4px;">' + valid.map(esc2).join("\n") + "</pre>";
      }
      rejected.forEach(function(r) {
        html += '<div style="color:#e57373;font-size:11px;margin:0.2rem 0;">' + vt("viewer.tools.index.preview.rejected", "<code>" + esc2(r.sql) + "</code>", esc2(r.reason)) + "</div>";
      });
      return html;
    }
    function renderApplyOutput(data) {
      var results = data && data.results || [];
      var html = '<p class="meta">' + vt("viewer.tools.index.apply.summary", data.applied || 0, results.length) + "</p>";
      results.forEach(function(r) {
        var ok = r.ok === true;
        var color = ok ? "#7cb342" : "#e57373";
        var mark = ok ? vt("viewer.tools.index.apply.ok") : vt("viewer.tools.index.apply.fail");
        html += '<div style="color:' + color + ';font-size:11px;margin:0.2rem 0;">[' + mark + "] <code>" + esc2(r.sql) + "</code>";
        if (!ok && r.error) html += vt("viewer.tools.index.apply.errorSuffix", esc2(r.error));
        html += "</div>";
      });
      return html;
    }
    if (toggle && collapsible) {
      toggle.addEventListener("click", function() {
        const isCollapsed = collapsible.classList.contains("collapsed");
        collapsible.classList.toggle("collapsed", !isCollapsed);
        syncFeatureCardExpanded(collapsible);
      });
    }
    if (historySel) {
      populateHistorySelect(historySel, "index");
      historySel.addEventListener("change", function() {
        var id = this.value;
        if (!id) return;
        var saved = getSavedAnalysisById("index", id);
        if (saved && saved.data) {
          lastIndexData = saved.data;
          showIndexResult(renderIndexData(saved.data));
        }
      });
    }
    if (container) {
      container.addEventListener("change", function(e) {
        var t = e.target;
        if (!t) return;
        if (t.id === "index-select-all") {
          var boxes = container.querySelectorAll("input.idx-cb");
          Array.prototype.forEach.call(boxes, function(cb) {
            cb.checked = t.checked;
          });
          refreshIndexSelection();
        } else if (t.classList && t.classList.contains("idx-cb")) {
          refreshIndexSelection();
        }
      });
      container.addEventListener("click", function(e) {
        var t = e.target;
        if (!t) return;
        if (t.id === "index-preview-sel") {
          var sqls = getSelectedIndexSqls();
          if (sqls.length === 0) return;
          var out = document.getElementById("index-preview-out");
          setButtonBusy(t, true, vt("viewer.tools.index.busy.preview"));
          t.disabled = true;
          fetch("/api/indexes/preview", authOpts({
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ indexSqls: sqls })
          })).then(function(r) {
            if (!r.ok) return r.json().then(function(d) {
              throw new Error(d.error || vt("viewer.tools.index.requestFailed"));
            });
            return r.json();
          }).then(function(data) {
            if (out) {
              out.innerHTML = renderPreviewOutput(data);
              out.style.display = "block";
            }
          }).catch(function(err) {
            if (out) {
              out.innerHTML = '<p class="meta" style="color:#e57373;">' + vt("viewer.tools.index.error", esc2(err.message)) + "</p>";
              out.style.display = "block";
            }
          }).finally(function() {
            setButtonBusy(t, false, vt("viewer.tools.index.previewSql"));
            refreshIndexSelection();
          });
        } else if (t.id === "index-apply-sel") {
          var applySqls = getSelectedIndexSqls();
          if (applySqls.length === 0) return;
          if (!window.confirm(vt("viewer.tools.index.apply.confirm", applySqls.length))) return;
          var applyOut = document.getElementById("index-apply-out");
          setButtonBusy(t, true, vt("viewer.tools.index.busy.apply"));
          t.disabled = true;
          fetch("/api/indexes/apply", authOpts({
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ indexSqls: applySqls })
          })).then(function(r) {
            if (!r.ok) return r.json().then(function(d) {
              throw new Error(d.error || vt("viewer.tools.index.requestFailed"));
            });
            return r.json();
          }).then(function(data) {
            if (applyOut) {
              applyOut.innerHTML = renderApplyOutput(data);
              applyOut.style.display = "block";
            }
            showCopyToast(vt("viewer.tools.index.apply.toast", data.applied || 0));
          }).catch(function(err) {
            if (applyOut) {
              applyOut.innerHTML = '<p class="meta" style="color:#e57373;">' + vt("viewer.tools.index.error", esc2(err.message)) + "</p>";
              applyOut.style.display = "block";
            }
          }).finally(function() {
            setButtonBusy(t, false, vt("viewer.tools.index.applySelected"));
            refreshIndexSelection();
          });
        }
      });
    }
    if (btn) btn.addEventListener("click", function() {
      btn.disabled = true;
      setButtonBusy(btn, true, vt("viewer.tools.index.busy.analyze"));
      container.style.display = "none";
      fetch("/api/index-suggestions", authOpts()).then(function(r) {
        if (!r.ok) return r.json().then(function(d) {
          throw new Error(d.error || vt("viewer.tools.index.requestFailed"));
        });
        return r.json();
      }).then(function(data) {
        lastIndexData = data;
        showIndexResult(renderIndexData(data, true));
        refreshIndexSelection();
        populateHistorySelect(historySel, "index");
      }).catch(function(e) {
        showIndexResult('<p class="meta" style="color:#e57373;">' + vt("viewer.tools.index.error", esc2(e.message)) + "</p>");
      }).finally(function() {
        btn.disabled = false;
        setButtonBusy(btn, false, vt("viewer.tools.index.analyze"));
      });
    });
    if (saveBtn) saveBtn.addEventListener("click", function() {
      if (!lastIndexData) return;
      var id = saveAnalysis("index", lastIndexData);
      showCopyToast(id != null ? vt("viewer.tools.analysis.saved") : vt("viewer.tools.analysis.saveFailed"));
      populateHistorySelect(historySel, "index");
    });
    if (exportBtn) exportBtn.addEventListener("click", function() {
      if (!lastIndexData) return;
      downloadJSON(lastIndexData, "index-suggestions-" + (/* @__PURE__ */ new Date()).toISOString().slice(0, 10) + ".json");
    });
    if (compareBtn) compareBtn.addEventListener("click", function() {
      showAnalysisCompare("index", vt("viewer.tools.index.compareTitle"), getSavedAnalyses("index"), lastIndexData, renderIndexData, function(a, b) {
        var sa = a && a.suggestions ? a.suggestions.length : 0;
        var sb = b && b.suggestions ? b.suggestions.length : 0;
        return vt("viewer.tools.index.compareSummary", sa, sb);
      });
    });
  }
  function initSizeAnalytics() {
    const toggle = document.getElementById("size-toggle");
    const collapsible = document.getElementById("size-collapsible");
    const btn = document.getElementById("size-analyze");
    const container = document.getElementById("size-results");
    const saveBtn = document.getElementById("size-save");
    const exportBtn = document.getElementById("size-export");
    const historySel = document.getElementById("size-history");
    const compareBtn = document.getElementById("size-compare");
    function formatBytes(bytes) {
      if (bytes < 1024) return bytes + " B";
      if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
      return (bytes / 1048576).toFixed(2) + " MB";
    }
    var SIZE_TT = {
      totalCard: vt("viewer.tools.size.tt.totalCard"),
      usedCard: vt("viewer.tools.size.tt.usedCard"),
      freeCard: vt("viewer.tools.size.tt.freeCard"),
      journalCard: vt("viewer.tools.size.tt.journalCard"),
      pagesTotal: vt("viewer.tools.size.tt.pagesTotal"),
      pagesFormula: vt("viewer.tools.size.tt.pagesFormula"),
      thTable: vt("viewer.tools.size.tt.thTable"),
      thRows: vt("viewer.tools.size.tt.thRows"),
      thColumns: vt("viewer.tools.size.tt.thColumns"),
      thIndexes: vt("viewer.tools.size.tt.thIndexes"),
      tdTableLink: vt("viewer.tools.size.tt.tdTableLink"),
      tdRows: vt("viewer.tools.size.tt.tdRows"),
      tdColumns: vt("viewer.tools.size.tt.tdColumns"),
      tdIndexes: vt("viewer.tools.size.tt.tdIndexes")
    };
    function renderSizeData(data) {
      if (!data) return '<p class="meta">' + vt("viewer.tools.size.empty") + "</p>";
      var html = '<div style="margin:0.5rem 0;">';
      html += '<div style="display:flex;gap:1rem;flex-wrap:wrap;margin-bottom:0.5rem;">';
      html += '<div style="padding:0.5rem;border:1px solid var(--border);border-radius:4px;" title="' + esc2(SIZE_TT.totalCard) + '">';
      html += '<div class="meta">' + vt("viewer.tools.size.card.total") + "</div>";
      html += '<div style="font-size:1.2rem;font-weight:bold;">' + formatBytes(data.totalSizeBytes) + "</div></div>";
      html += '<div style="padding:0.5rem;border:1px solid var(--border);border-radius:4px;" title="' + esc2(SIZE_TT.usedCard) + '">';
      html += '<div class="meta">' + vt("viewer.tools.size.card.used") + "</div>";
      html += '<div style="font-size:1.2rem;font-weight:bold;">' + formatBytes(data.usedSizeBytes) + "</div></div>";
      html += '<div style="padding:0.5rem;border:1px solid var(--border);border-radius:4px;" title="' + esc2(SIZE_TT.freeCard) + '">';
      html += '<div class="meta">' + vt("viewer.tools.size.card.free") + "</div>";
      html += '<div style="font-size:1.2rem;font-weight:bold;">' + formatBytes(data.freeSpaceBytes) + "</div></div>";
      html += '<div style="padding:0.5rem;border:1px solid var(--border);border-radius:4px;" title="' + esc2(SIZE_TT.journalCard) + '">';
      html += '<div class="meta">' + vt("viewer.tools.size.card.journal") + "</div>";
      html += '<div style="font-size:1.2rem;font-weight:bold;">' + esc2(data.journalMode || "") + "</div></div>";
      html += '<div style="padding:0.5rem;border:1px solid var(--border);border-radius:4px;" title="' + esc2(SIZE_TT.pagesTotal) + '">';
      html += '<div class="meta">' + vt("viewer.tools.size.card.pages") + "</div>";
      var pc = data.pageCount || 0;
      var ps = data.pageSize || 0;
      var pageBytes = pc * ps;
      html += '<div style="font-size:1.2rem;font-weight:bold;line-height:1.2;" title="' + esc2(SIZE_TT.pagesTotal) + '">' + pageBytes.toLocaleString() + "</div>";
      html += '<div class="meta size-pages-formula" title="' + esc2(SIZE_TT.pagesFormula) + '">(' + pc.toLocaleString() + " \xD7 " + ps.toLocaleString() + ")</div></div>";
      html += "</div>";
      html += '<table style="border-collapse:collapse;width:100%;font-size:12px;">';
      html += '<tr><th style="border:1px solid var(--border);padding:4px;" title="' + esc2(SIZE_TT.thTable) + '">' + vt("viewer.tools.size.col.table") + "</th>";
      html += '<th style="border:1px solid var(--border);padding:4px;min-width:8rem;" title="' + esc2(SIZE_TT.thRows) + '">' + vt("viewer.tools.size.col.rows") + "</th>";
      html += '<th style="border:1px solid var(--border);padding:4px;text-align:right;" title="' + esc2(SIZE_TT.thColumns) + '">' + vt("viewer.tools.size.col.columns") + "</th>";
      html += '<th style="border:1px solid var(--border);padding:4px;" title="' + esc2(SIZE_TT.thIndexes) + '">' + vt("viewer.tools.size.col.indexes") + "</th></tr>";
      var tables = data.tables || [];
      var maxRows = Math.max.apply(null, tables.map(function(t) {
        return t.rowCount;
      }).concat([1]));
      tables.forEach(function(t) {
        var barWidth = Math.max(1, t.rowCount / maxRows * 100);
        html += "<tr>";
        html += '<td style="border:1px solid var(--border);padding:4px;"><a href="#" class="table-link size-table-link" data-table="' + esc2(t.table) + '" title="' + esc2(SIZE_TT.tdTableLink) + '">' + esc2(t.table) + "</a></td>";
        html += '<td style="border:1px solid var(--border);padding:4px;white-space:nowrap;" title="' + esc2(SIZE_TT.tdRows) + '">';
        html += '<div style="background:var(--link);height:12px;width:' + barWidth + '%;opacity:0.3;display:inline-block;vertical-align:middle;margin-right:4px;"></div>';
        html += t.rowCount.toLocaleString() + "</td>";
        html += '<td style="border:1px solid var(--border);padding:4px;text-align:right;font-variant-numeric:tabular-nums;" title="' + esc2(SIZE_TT.tdColumns) + '">' + t.columnCount + "</td>";
        html += '<td style="border:1px solid var(--border);padding:4px;" title="' + esc2(SIZE_TT.tdIndexes) + '">' + t.indexCount;
        if (t.indexes && t.indexes.length > 0) html += ' <span class="size-index-names">(' + t.indexes.map(esc2).join(", ") + ")</span>";
        html += "</td></tr>";
      });
      html += "</table></div>";
      return html;
    }
    if (container) {
      container.addEventListener("click", function(e) {
        var a = e.target.closest("a.size-table-link");
        if (!a || !container.contains(a)) return;
        e.preventDefault();
        var name = a.getAttribute("data-table");
        if (name) openTableTab(name);
      });
    }
    if (toggle && collapsible) {
      toggle.addEventListener("click", function() {
        const isCollapsed = collapsible.classList.contains("collapsed");
        collapsible.classList.toggle("collapsed", !isCollapsed);
        syncFeatureCardExpanded(collapsible);
      });
    }
    if (historySel) {
      populateHistorySelect(historySel, "size");
      historySel.addEventListener("change", function() {
        var id = this.value;
        if (!id) return;
        var saved = getSavedAnalysisById("size", id);
        if (saved && saved.data) {
          setLastSizeAnalyticsData(saved.data);
          container.innerHTML = renderSizeData(saved.data);
          container.style.display = "block";
        }
      });
    }
    if (btn) btn.addEventListener("click", function() {
      btn.disabled = true;
      setButtonBusy(btn, true, vt("viewer.tools.size.busy.analyze"));
      container.style.display = "none";
      fetch("/api/analytics/size", authOpts()).then(function(r) {
        if (!r.ok) return r.json().then(function(d) {
          throw new Error(d.error || vt("viewer.tools.size.requestFailed"));
        });
        return r.json();
      }).then(function(data) {
        setLastSizeAnalyticsData(data);
        container.innerHTML = renderSizeData(data);
        container.style.display = "block";
        populateHistorySelect(historySel, "size");
      }).catch(function(e) {
        container.innerHTML = '<p class="meta" style="color:#e57373;">' + vt("viewer.tools.size.error", esc2(e.message)) + "</p>";
        container.style.display = "block";
      }).finally(function() {
        btn.disabled = false;
        setButtonBusy(btn, false, vt("viewer.tools.size.analyze"));
      });
    });
    if (saveBtn) saveBtn.addEventListener("click", function() {
      if (!lastSizeAnalyticsData) return;
      var id = saveAnalysis("size", lastSizeAnalyticsData);
      showCopyToast(id != null ? vt("viewer.tools.analysis.saved") : vt("viewer.tools.analysis.saveFailed"));
      populateHistorySelect(historySel, "size");
    });
    if (exportBtn) exportBtn.addEventListener("click", function() {
      if (!lastSizeAnalyticsData) return;
      downloadJSON(lastSizeAnalyticsData, "size-analytics-" + (/* @__PURE__ */ new Date()).toISOString().slice(0, 10) + ".json");
    });
    if (compareBtn) compareBtn.addEventListener("click", function() {
      showAnalysisCompare("size", vt("viewer.tools.size.compareTitle"), getSavedAnalyses("size"), lastSizeAnalyticsData, renderSizeData, function(a, b) {
        var ta = (a && a.totalSizeBytes) != null ? formatBytes(a.totalSizeBytes) : "\u2014";
        var tb = (b && b.totalSizeBytes) != null ? formatBytes(b.totalSizeBytes) : "\u2014";
        return vt("viewer.tools.size.compareSummary", ta, tb);
      });
    });
  }
  function initAnomalyDetection() {
    const toggle = document.getElementById("anomaly-toggle");
    const collapsible = document.getElementById("anomaly-collapsible");
    const btn = document.getElementById("anomaly-analyze");
    const container = document.getElementById("anomaly-results");
    const saveBtn = document.getElementById("anomaly-save");
    const exportBtn = document.getElementById("anomaly-export");
    const historySel = document.getElementById("anomaly-history");
    const compareBtn = document.getElementById("anomaly-compare");
    var lastAnomalyData = null;
    function computeHealthScore(anomalies) {
      var score = 100;
      (anomalies || []).forEach(function(a) {
        if (a.severity === "error") score -= 15;
        else if (a.severity === "warning") score -= 5;
        else score -= 1;
      });
      if (score < 0) score = 0;
      var grade;
      if (score >= 90) grade = "A";
      else if (score >= 80) grade = "B";
      else if (score >= 70) grade = "C";
      else if (score >= 60) grade = "D";
      else grade = "F";
      var color;
      if (score >= 80) color = "#81c784";
      else if (score >= 60) color = "#ffb74d";
      else color = "#e57373";
      return { score, grade, color };
    }
    function renderAnomalyData(data) {
      if (!data) return '<p class="meta">' + vt("viewer.tools.anomaly.empty") + "</p>";
      var anomalies = data.anomalies || [];
      var health = computeHealthScore(anomalies);
      var html = '<div class="health-score-pill" style="display:inline-flex;align-items:center;gap:0.5rem;padding:0.4rem 0.8rem;margin:0.4rem 0;border-radius:6px;background:rgba(0,0,0,0.15);font-size:14px;">';
      html += '<span style="font-size:1.6em;font-weight:700;color:' + health.color + ';">' + health.grade + "</span>";
      html += '<span style="color:' + health.color + ';font-weight:600;">' + health.score + "/100</span>";
      html += '<span class="meta" style="margin-left:0.3rem;">' + vt("viewer.tools.anomaly.across", data.tablesScanned || 0) + "</span>";
      html += "</div>";
      if (anomalies.length === 0) {
        html += '<p class="meta" style="color:#7cb342;">' + vt("viewer.tools.anomaly.clean") + "</p>";
        return html;
      }
      var errCount = 0, warnCount = 0, infoCount = 0;
      anomalies.forEach(function(a) {
        if (a.severity === "error") errCount++;
        else if (a.severity === "warning") warnCount++;
        else infoCount++;
      });
      var breakdown = [];
      if (errCount) breakdown.push('<span style="color:#e57373;">' + vt(errCount === 1 ? "viewer.tools.anomaly.errors.one" : "viewer.tools.anomaly.errors.many", errCount) + "</span>");
      if (warnCount) breakdown.push('<span style="color:#ffb74d;">' + vt(warnCount === 1 ? "viewer.tools.anomaly.warnings.one" : "viewer.tools.anomaly.warnings.many", warnCount) + "</span>");
      if (infoCount) breakdown.push('<span style="color:#7cb342;">' + vt("viewer.tools.anomaly.info", infoCount) + "</span>");
      html += '<p class="meta">' + vt("viewer.tools.anomaly.findings", anomalies.length, breakdown.join(", ")) + "</p>";
      var icons = { error: "!!", warning: "!", info: "i" };
      var colors = { error: "#e57373", warning: "#ffb74d", info: "#7cb342" };
      anomalies.forEach(function(a) {
        var color = colors[a.severity] || "var(--fg)";
        var icon = icons[a.severity] || "";
        html += '<div style="padding:0.3rem 0.5rem;margin:0.2rem 0;border-left:3px solid ' + color + ';background:rgba(0,0,0,0.1);">';
        html += '<span style="color:' + color + ';font-weight:bold;">[' + icon + "] " + esc2(a.severity).toUpperCase() + "</span> ";
        html += esc2(a.message);
        if (a.count) html += ' <span class="meta">(' + a.count + ")</span>";
        html += "</div>";
      });
      return html;
    }
    if (toggle && collapsible) {
      toggle.addEventListener("click", function() {
        const isCollapsed = collapsible.classList.contains("collapsed");
        collapsible.classList.toggle("collapsed", !isCollapsed);
        syncFeatureCardExpanded(collapsible);
      });
    }
    if (historySel) {
      populateHistorySelect(historySel, "anomaly");
      historySel.addEventListener("change", function() {
        var id = this.value;
        if (!id) return;
        var saved = getSavedAnalysisById("anomaly", id);
        if (saved && saved.data) {
          lastAnomalyData = saved.data;
          container.innerHTML = renderAnomalyData(saved.data);
          container.style.display = "block";
        }
      });
    }
    if (btn) btn.addEventListener("click", function() {
      btn.disabled = true;
      setButtonBusy(btn, true, vt("viewer.tools.anomaly.busy.scan"));
      container.style.display = "none";
      fetch("/api/analytics/anomalies", authOpts()).then(function(r) {
        if (!r.ok) return r.json().then(function(d) {
          throw new Error(d.error || vt("viewer.tools.anomaly.requestFailed"));
        });
        return r.json();
      }).then(function(data) {
        lastAnomalyData = data;
        container.innerHTML = renderAnomalyData(data);
        container.style.display = "block";
        populateHistorySelect(historySel, "anomaly");
      }).catch(function(e) {
        container.innerHTML = '<p class="meta" style="color:#e57373;">' + vt("viewer.tools.anomaly.error", esc2(e.message)) + "</p>";
        container.style.display = "block";
      }).finally(function() {
        btn.disabled = false;
        setButtonBusy(btn, false, vt("viewer.tools.anomaly.scan"));
      });
    });
    if (saveBtn) saveBtn.addEventListener("click", function() {
      if (!lastAnomalyData) return;
      var id = saveAnalysis("anomaly", lastAnomalyData);
      showCopyToast(id != null ? vt("viewer.tools.analysis.saved") : vt("viewer.tools.analysis.saveFailed"));
      populateHistorySelect(historySel, "anomaly");
    });
    if (exportBtn) exportBtn.addEventListener("click", function() {
      if (!lastAnomalyData) return;
      downloadJSON(lastAnomalyData, "anomaly-scan-" + (/* @__PURE__ */ new Date()).toISOString().slice(0, 10) + ".json");
    });
    if (compareBtn) compareBtn.addEventListener("click", function() {
      showAnalysisCompare("anomaly", vt("viewer.tools.anomaly.compareTitle"), getSavedAnalyses("anomaly"), lastAnomalyData, renderAnomalyData, function(a, b) {
        var na = a && a.anomalies ? a.anomalies.length : 0;
        var nb = b && b.anomalies ? b.anomalies.length : 0;
        return vt("viewer.tools.anomaly.compareSummary", na, nb);
      });
    });
  }

  // assets/web/schema-divergence.ts
  function typeAffinity(raw) {
    const t = (raw || "").toUpperCase();
    if (t.length === 0) return "BLOB";
    if (t.includes("INT")) return "INTEGER";
    if (t.includes("CHAR") || t.includes("CLOB") || t.includes("TEXT")) {
      return "TEXT";
    }
    if (t.includes("BLOB")) return "BLOB";
    if (t.includes("REAL") || t.includes("FLOA") || t.includes("DOUB")) {
      return "REAL";
    }
    return "NUMERIC";
  }
  function isInternalTable(name) {
    return name.toLowerCase().startsWith("sqlite_");
  }
  function indexColumns(cols) {
    const m = /* @__PURE__ */ new Map();
    for (const c of cols || []) {
      if (c && typeof c.name === "string") m.set(c.name, c);
    }
    return m;
  }
  function computeSchemaDivergence(declared, runtime) {
    const findings = [];
    const declaredByName = /* @__PURE__ */ new Map();
    for (const t of declared || []) {
      if (t && typeof t.name === "string") declaredByName.set(t.name, t);
    }
    const runtimeByName = /* @__PURE__ */ new Map();
    for (const t of runtime || []) {
      if (t && typeof t.name === "string") runtimeByName.set(t.name, t);
    }
    const declaredNames = [...declaredByName.keys()].sort();
    const runtimeOnly = [...runtimeByName.keys()].filter((n) => !declaredByName.has(n) && !isInternalTable(n)).sort();
    for (const name of declaredNames) {
      const d = declaredByName.get(name);
      const r = runtimeByName.get(name);
      if (!r) {
        findings.push({
          table: name,
          kind: "missing-table",
          detail: vt("viewer.schema.divergence.missingTable")
        });
        continue;
      }
      compareColumns(name, d, r, findings);
    }
    for (const name of runtimeOnly) {
      findings.push({
        table: name,
        kind: "extra-table",
        detail: vt("viewer.schema.divergence.extraTable")
      });
    }
    return findings;
  }
  function compareColumns(table, declared, runtime, out) {
    const dCols = declared.columns || [];
    const rCols = indexColumns(runtime.columns);
    const dColNames = indexColumns(dCols);
    for (const dc of dCols) {
      if (!dc || typeof dc.name !== "string") continue;
      const rc = rCols.get(dc.name);
      if (!rc) {
        out.push({
          table,
          column: dc.name,
          kind: "missing-column",
          detail: vt("viewer.schema.divergence.missingColumn")
        });
        continue;
      }
      const dAff = typeAffinity(dc.sqlType);
      const rAff = typeAffinity(rc.type);
      if (dAff !== rAff) {
        out.push({
          table,
          column: dc.name,
          kind: "type-mismatch",
          detail: vt("viewer.schema.divergence.typeMismatch", dAff, rAff)
        });
      }
      const dNullable = dc.nullable !== false;
      const rNullable = rc.notnull !== true;
      if (dNullable !== rNullable) {
        out.push({
          table,
          column: dc.name,
          kind: "nullable-mismatch",
          detail: vt(
            "viewer.schema.divergence.nullableMismatch",
            vt(dNullable ? "viewer.schema.divergence.nullable" : "viewer.schema.divergence.notNull"),
            vt(rNullable ? "viewer.schema.divergence.nullable" : "viewer.schema.divergence.notNull")
          )
        });
      }
      const dPk = dc.isPk === true;
      const rPk = rc.pk === true;
      if (dPk !== rPk) {
        out.push({
          table,
          column: dc.name,
          kind: "pk-mismatch",
          detail: vt(
            "viewer.schema.divergence.pkMismatch",
            vt(dPk ? "viewer.schema.divergence.primaryKey" : "viewer.schema.divergence.notAKey"),
            vt(rPk ? "viewer.schema.divergence.primaryKey" : "viewer.schema.divergence.notAKey")
          )
        });
      }
    }
    for (const rc of runtime.columns || []) {
      if (!rc || typeof rc.name !== "string") continue;
      if (!dColNames.has(rc.name)) {
        out.push({
          table,
          column: rc.name,
          kind: "extra-column",
          detail: vt("viewer.schema.divergence.extraColumn")
        });
      }
    }
  }

  // assets/web/declared-schema.ts
  var DIVERGENCE_LABEL_KEYS = {
    "missing-table": "viewer.schema.divergence.label.missingTable",
    "extra-table": "viewer.schema.divergence.label.extraTable",
    "missing-column": "viewer.schema.divergence.label.missingColumn",
    "extra-column": "viewer.schema.divergence.label.extraColumn",
    "type-mismatch": "viewer.schema.divergence.label.typeMismatch",
    "nullable-mismatch": "viewer.schema.divergence.label.nullableMismatch",
    "pk-mismatch": "viewer.schema.divergence.label.pkMismatch"
  };
  function renderDivergence(findings, runtimeAvailable) {
    if (!runtimeAvailable) {
      return '<p class="meta">' + esc2(vt("viewer.schema.declared.runtimeUnavailable")) + "</p>";
    }
    if (findings.length === 0) {
      return '<p class="meta" style="color:#66bb6a;">' + esc2(vt("viewer.schema.declared.match")) + "</p>";
    }
    const byTable = /* @__PURE__ */ new Map();
    for (const f of findings) {
      const list = byTable.get(f.table) || [];
      list.push(f);
      byTable.set(f.table, list);
    }
    let html = '<p class="meta" style="color:#e57373;">' + esc2(vt("viewer.schema.declared.divergenceCount", findings.length)) + "</p>";
    byTable.forEach(function(list, table) {
      html += '<div style="margin:0.3rem 0;"><strong>' + esc2(table) + '</strong><ul style="margin:0.2rem 0 0.4rem 1rem;padding:0;">';
      list.forEach(function(f) {
        const where = f.column ? esc2(table) + "." + esc2(f.column) : esc2(table);
        html += '<li><span class="meta">[' + esc2(vt(DIVERGENCE_LABEL_KEYS[f.kind])) + "]</span> " + where + " \u2014 " + esc2(f.detail) + "</li>";
      });
      html += "</ul></div>";
    });
    return html;
  }
  function initDeclaredSchema() {
    const btn = document.getElementById("declared-load");
    const container = document.getElementById("declared-results");
    if (!container) return;
    function renderDeclared(data) {
      if (!data || data.available === false) {
        return '<p class="meta">' + vt("viewer.schema.declared.noCodeSchema") + "</p>";
      }
      var tables = data && data.tables || [];
      if (tables.length === 0) {
        return '<p class="meta">' + esc2(vt("viewer.schema.declared.empty")) + "</p>";
      }
      var html = '<p class="meta">' + esc2(vt("viewer.schema.declared.tableCount", tables.length)) + "</p>";
      tables.forEach(function(t) {
        var cols = t.columns || [];
        html += '<details style="margin:0.3rem 0;"><summary style="cursor:pointer;font-weight:600;">' + esc2(t.name) + ' <span class="meta">' + esc2(vt("viewer.schema.declared.columnCount", cols.length)) + "</span></summary>";
        html += '<table style="border-collapse:collapse;width:100%;font-size:12px;margin:0.3rem 0;">';
        html += '<tr><th style="border:1px solid var(--border);padding:4px;text-align:left;">' + esc2(vt("viewer.schema.declared.col.column")) + '</th><th style="border:1px solid var(--border);padding:4px;">' + esc2(vt("viewer.schema.declared.col.type")) + '</th><th style="border:1px solid var(--border);padding:4px;">' + esc2(vt("viewer.schema.declared.col.null")) + '</th><th style="border:1px solid var(--border);padding:4px;">' + esc2(vt("viewer.schema.declared.col.pk")) + "</th></tr>";
        cols.forEach(function(c) {
          html += "<tr>";
          html += '<td style="border:1px solid var(--border);padding:4px;">' + esc2(c.name) + "</td>";
          html += '<td style="border:1px solid var(--border);padding:4px;">' + esc2(c.sqlType) + "</td>";
          html += '<td style="border:1px solid var(--border);padding:4px;text-align:center;">' + esc2(vt(c.nullable ? "viewer.schema.declared.null.yes" : "viewer.schema.declared.null.no")) + "</td>";
          html += '<td style="border:1px solid var(--border);padding:4px;text-align:center;">' + (c.isPk ? esc2(vt("viewer.schema.declared.pk.flag")) : "") + "</td>";
          html += "</tr>";
        });
        html += "</table>";
        if (t.indexes && t.indexes.length) {
          html += '<p class="meta">' + esc2(vt("viewer.schema.declared.indexes", t.indexes.join(", "))) + "</p>";
        }
        html += "</details>";
      });
      return html;
    }
    function load() {
      if (btn) {
        btn.disabled = true;
        setButtonBusy(btn, true, vt("viewer.schema.declared.loading"));
      }
      container.style.display = "none";
      fetch("/api/schema/declared", authOpts()).then(function(r) {
        if (!r.ok) return r.json().then(function(d) {
          throw new Error(d.error || vt("viewer.schema.declared.requestFailed"));
        });
        return r.json();
      }).then(function(data) {
        if (!data || data.available === false) {
          container.innerHTML = renderDeclared(data);
          return;
        }
        return loadSchemaMeta().then(function(meta) {
          const runtimeTables = meta && meta.tables || [];
          const runtimeAvailable = runtimeTables.length > 0;
          const findings = computeSchemaDivergence(data.tables, runtimeTables);
          container.innerHTML = '<section style="margin-bottom:0.6rem;"><h4 style="margin:0 0 0.2rem;">' + esc2(vt("viewer.schema.declared.codeVsDatabase")) + "</h4>" + renderDivergence(findings, runtimeAvailable) + "</section>" + renderDeclared(data);
        }).catch(function() {
          container.innerHTML = '<section style="margin-bottom:0.6rem;"><h4 style="margin:0 0 0.2rem;">' + esc2(vt("viewer.schema.declared.codeVsDatabase")) + "</h4>" + renderDivergence([], false) + "</section>" + renderDeclared(data);
        });
      }).then(function() {
        container.style.display = "block";
      }).catch(function(e) {
        container.innerHTML = '<p class="meta" style="color:#e57373;">' + esc2(vt("viewer.schema.declared.error", e.message)) + "</p>";
        container.style.display = "block";
      }).finally(function() {
        if (btn) {
          btn.disabled = false;
          setButtonBusy(btn, false, vt("viewer.schema.declared.load"));
        }
      });
    }
    if (btn) btn.addEventListener("click", load);
  }

  // assets/web/tools-import.ts
  function initImport() {
    const toggle = document.getElementById("import-toggle");
    const collapsible = document.getElementById("import-collapsible");
    const tableSel = document.getElementById("import-table");
    const formatSel = document.getElementById("import-format");
    const fileInput = document.getElementById("import-file");
    const runBtn = document.getElementById("import-run");
    const previewEl = document.getElementById("import-preview");
    const statusEl = document.getElementById("import-status");
    const mappingContainer = document.getElementById("import-column-mapping");
    const mappingTbody = document.getElementById("import-mapping-tbody");
    let importFileData = null;
    let importCsvHeaders = [];
    var importHistory = [];
    var historyDetailsEl = document.getElementById("import-history-details");
    var historyListEl = document.getElementById("import-history-list");
    function addImportHistory(table, format, imported, errors) {
      var now = /* @__PURE__ */ new Date();
      var timeStr = now.toLocaleTimeString();
      var entry = { time: timeStr, table, format, imported, errors: errors || [] };
      importHistory.unshift(entry);
      renderImportHistory();
    }
    function renderImportHistory() {
      if (!historyListEl || !historyDetailsEl) return;
      if (importHistory.length === 0) {
        historyDetailsEl.style.display = "none";
        return;
      }
      historyDetailsEl.style.display = "block";
      var html = "";
      for (var i = 0; i < importHistory.length; i++) {
        var h = importHistory[i];
        var errText = h.errors.length > 0 ? ' <span style="color:#e57373;">' + vt(h.errors.length === 1 ? "viewer.tools.import.history.errors.one" : "viewer.tools.import.history.errors.many", h.errors.length) + "</span>" : "";
        html += '<div style="padding:2px 0;border-bottom:1px solid var(--border,#333);"><span style="opacity:0.6;">' + esc2(h.time) + "</span> <strong>" + esc2(h.table) + "</strong> (" + esc2(h.format) + ") &mdash; " + vt("viewer.tools.import.history.rows", h.imported) + errText + "</div>";
      }
      historyListEl.innerHTML = html;
    }
    function parseCsvHeaderLine(line) {
      var fields = [];
      var cur = "";
      var inQuotes = false;
      for (var i = 0; i < line.length; i++) {
        var c = line[i];
        if (c === '"') {
          if (inQuotes && line[i + 1] === '"') {
            cur += '"';
            i++;
          } else inQuotes = !inQuotes;
        } else if (c === "," && !inQuotes) {
          fields.push(cur.trim());
          cur = "";
        } else cur += c;
      }
      fields.push(cur.trim());
      return fields;
    }
    function renderMappingTable() {
      if (!mappingTbody || importCsvHeaders.length === 0) return;
      var tableName = tableSel && tableSel.value;
      if (!tableName) {
        mappingContainer.style.display = "none";
        return;
      }
      var requestedTable = tableName;
      mappingTbody.innerHTML = '<tr><td colspan="2" class="meta">' + vt("viewer.tools.import.mapping.loading") + "</td></tr>";
      mappingContainer.style.display = "block";
      fetch("/api/table/" + encodeURIComponent(tableName) + "/columns", authOpts()).then(function(r) {
        return r.json();
      }).then(function(tableColumns) {
        if (tableSel.value !== requestedTable) return;
        if (!Array.isArray(tableColumns)) {
          mappingContainer.style.display = "none";
          return;
        }
        var html = "";
        importCsvHeaders.forEach(function(csvCol) {
          var optHtml = '<option value="">' + vt("viewer.tools.import.mapping.skip") + "</option>" + tableColumns.map(function(tc) {
            return '<option value="' + esc2(tc) + '">' + esc2(tc) + "</option>";
          }).join("");
          html += '<tr><td style="border:1px solid var(--border);padding:4px;">' + esc2(csvCol) + "</td>";
          html += '<td style="border:1px solid var(--border);padding:4px;"><select class="import-map-select" data-csv-header="' + esc2(csvCol) + '">' + optHtml + "</select></td></tr>";
        });
        mappingTbody.innerHTML = html;
      }).catch(function() {
        if (tableSel.value !== requestedTable) return;
        mappingTbody.innerHTML = '<tr><td colspan="2" class="meta" style="color:#e57373;">' + vt("viewer.tools.import.mapping.loadFailed") + "</td></tr>";
      });
    }
    function updateImportState() {
      var hasFile = importFileData !== null && importFileData !== "";
      var table = tableSel && tableSel.value;
      runBtn.disabled = !hasFile || !table;
      if (hasFile && previewEl) {
        previewEl.style.display = "block";
        previewEl.textContent = importFileData.length > 2e3 ? importFileData.slice(0, 2e3) + "\n\u2026" : importFileData;
      }
      var fmt = formatSel && formatSel.value;
      if (fmt === "csv" && hasFile && importCsvHeaders.length > 0) {
        renderMappingTable();
      } else {
        if (mappingContainer) mappingContainer.style.display = "none";
      }
    }
    if (toggle && collapsible) {
      toggle.addEventListener("click", function() {
        var isCollapsed = collapsible.classList.contains("collapsed");
        collapsible.classList.toggle("collapsed", !isCollapsed);
        syncFeatureCardExpanded(collapsible);
      });
    }
    if (fileInput) {
      fileInput.addEventListener("change", function() {
        var f = this.files && this.files[0];
        if (!f) {
          importFileData = null;
          importCsvHeaders = [];
          updateImportState();
          return;
        }
        var reader = new FileReader();
        reader.onload = function() {
          importFileData = reader.result;
          if (typeof importFileData !== "string") importFileData = null;
          importCsvHeaders = [];
          if (importFileData && (formatSel && formatSel.value) === "csv") {
            var firstLine = importFileData.split(/\r?\n/)[0] || "";
            importCsvHeaders = parseCsvHeaderLine(firstLine);
          }
          updateImportState();
        };
        reader.readAsText(f);
      });
    }
    var pasteBtn = document.getElementById("import-paste");
    if (pasteBtn) {
      pasteBtn.addEventListener("click", function() {
        if (!navigator.clipboard || !navigator.clipboard.readText) {
          alert(vt("viewer.tools.import.clipboard.unavailable"));
          return;
        }
        navigator.clipboard.readText().then(function(text) {
          if (!text || !text.trim()) {
            alert(vt("viewer.tools.import.clipboard.empty"));
            return;
          }
          importFileData = text;
          var trimmed = text.trim();
          var detectedFormat = "csv";
          if (trimmed.charAt(0) === "[" || trimmed.charAt(0) === "{") {
            detectedFormat = "json";
          } else if (trimmed.indexOf("	") >= 0) {
            detectedFormat = "csv";
            importFileData = text.split(/\r?\n/).map(function(line) {
              return line.split("	").map(function(field) {
                if (field.indexOf(",") >= 0 || field.indexOf('"') >= 0) {
                  return '"' + field.replace(/"/g, '""') + '"';
                }
                return field;
              }).join(",");
            }).join("\n");
          }
          if (formatSel) formatSel.value = detectedFormat;
          importCsvHeaders = [];
          if (detectedFormat === "csv") {
            var firstLine = importFileData.split(/\r?\n/)[0] || "";
            importCsvHeaders = parseCsvHeaderLine(firstLine);
          }
          if (fileInput) fileInput.value = "";
          updateImportState();
        }).catch(function(e) {
          alert(vt("viewer.tools.import.clipboard.readFailed", e.message || vt("viewer.tools.import.clipboard.permissionDenied")));
        });
      });
    }
    if (formatSel) formatSel.addEventListener("change", function() {
      if (this.value === "csv" && importFileData) {
        var firstLine = importFileData.split(/\r?\n/)[0] || "";
        importCsvHeaders = parseCsvHeaderLine(firstLine);
      } else importCsvHeaders = [];
      updateImportState();
    });
    if (tableSel) tableSel.addEventListener("change", updateImportState);
    if (runBtn) {
      runBtn.addEventListener("click", function() {
        var table = tableSel && tableSel.value;
        var format = formatSel && formatSel.value;
        if (!table || !importFileData) return;
        if (!confirm(vt("viewer.tools.import.confirm", esc2(table)))) return;
        runBtn.disabled = true;
        var runBtnOrigText = runBtn.textContent;
        setButtonBusy(runBtn, true, vt("viewer.tools.import.busy"));
        statusEl.textContent = vt("viewer.tools.import.busy");
        var body = { format, data: importFileData, table };
        if (format === "csv" && mappingContainer && mappingContainer.style.display !== "none") {
          var mapping = {};
          mappingContainer.querySelectorAll(".import-map-select").forEach(function(sel) {
            var csvHeader = sel.getAttribute("data-csv-header");
            var tableCol = sel.value;
            if (csvHeader && tableCol) mapping[csvHeader] = tableCol;
          });
          if (Object.keys(mapping).length > 0) body.columnMapping = mapping;
        }
        fetch("/api/import", authOpts({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        })).then(function(r) {
          return r.json().then(function(d) {
            return { ok: r.ok, data: d };
          });
        }).then(function(o) {
          if (!o.ok) {
            statusEl.textContent = vt("viewer.tools.import.error", o.data.error || vt("viewer.tools.import.requestFailed"));
            statusEl.style.color = "#e57373";
            addImportHistory(table, format, 0, [o.data.error || vt("viewer.tools.import.requestFailed")]);
            return;
          }
          var d = o.data;
          var msg = vt("viewer.tools.import.result", d.imported);
          if (d.errors && d.errors.length > 0) msg += " " + vt("viewer.tools.import.resultErrors", d.errors.length, d.errors.slice(0, 3).join("; "));
          statusEl.textContent = msg;
          statusEl.style.color = "";
          addImportHistory(table, format, d.imported, d.errors || []);
          if (d.imported > 0 && currentTableName === table) loadTable(table);
        }).catch(function(e) {
          statusEl.textContent = vt("viewer.tools.import.error", e.message || vt("viewer.tools.import.failed"));
          statusEl.style.color = "#e57373";
          addImportHistory(table, format, 0, [e.message || vt("viewer.tools.import.failed")]);
        }).finally(function() {
          runBtn.disabled = !importFileData || !tableSel || !tableSel.value;
          setButtonBusy(runBtn, false, runBtnOrigText || vt("viewer.tools.import.button"));
        });
      });
    }
  }

  // assets/web/search-tab.ts
  function initSearchTab() {
    var stTableSel = document.getElementById("st-table");
    var stInput = document.getElementById("st-input");
    var stScopeSel = document.getElementById("st-scope");
    var stFilterEl = document.getElementById("st-filter");
    var stNavEl = document.getElementById("st-nav");
    var stCountEl = document.getElementById("st-count");
    var stPrevBtn = document.getElementById("st-prev");
    var stNextBtn = document.getElementById("st-next");
    var stRowToggle = document.getElementById("st-row-toggle-wrap");
    var stRowAll = document.getElementById("st-row-all");
    var stRowMatch = document.getElementById("st-row-matching");
    var stPanel = document.getElementById("search-results-content");
    if (!stTableSel || !stInput || !stPanel) return;
    var stTableName = null;
    var stTableJson = null;
    var stSchemaText = null;
    var stCachedFks = null;
    var stCachedColTypes = null;
    var stMatches = [];
    var stMatchIdx = -1;
    var stOnlyMatching = true;
    var stLimit = 500;
    var stOffset = 0;
    function stScope() {
      return stScopeSel.value || "";
    }
    function stTerm() {
      return String(stInput.value || "").trim();
    }
    function stFilter() {
      return String(stFilterEl.value || "").trim();
    }
    window._stPopulateTables = function(tables) {
      var prev = stTableSel.value;
      stTableSel.innerHTML = '<option value="">' + esc2(vt("viewer.schema.searchTab.optionSelect")) + "</option>";
      (tables || []).forEach(function(t) {
        var opt = document.createElement("option");
        opt.value = t;
        opt.textContent = tableCounts[t] != null ? t + " (" + formatTableRowCountDisplay(tableCounts[t]) + ")" : t;
        stTableSel.appendChild(opt);
      });
      if (prev) stTableSel.value = prev;
    };
    window._stSyncTable = function(name) {
      if (name && stTableSel.querySelector('option[value="' + CSS.escape(name) + '"]')) {
        stTableSel.value = name;
      }
    };
    window._stUpdateCount = function(table, count) {
      var opts = stTableSel.options;
      for (var i = 0; i < opts.length; i++) {
        if (opts[i].value === table) {
          opts[i].textContent = table + " (" + formatTableRowCountDisplay(count) + ")";
          break;
        }
      }
    };
    function stFilterRows(data) {
      var term = stFilter();
      if (!term || !data || data.length === 0) return data || [];
      var lower = term.toLowerCase();
      return data.filter(function(row) {
        return Object.values(row).some(function(v) {
          return v != null && String(v).toLowerCase().includes(lower);
        });
      });
    }
    function stBuildContent(data, schema, fks, colTypes, tableName) {
      stTableJson = data;
      stCachedFks = fks;
      stCachedColTypes = colTypes;
      if (schema && cachedSchema === null) setCachedSchema(schema);
      var scope = stScope();
      var filtered2 = stFilterRows(data);
      var display = stOnlyMatching && stFilter() ? filtered2 : data;
      if (!display || display.length === 0) display = data;
      var fkMap = {};
      (fks || []).forEach(function(fk) {
        fkMap[fk.fromColumn] = fk;
      });
      var total = tableCounts[tableName];
      var len = data.length;
      var metaText = esc2(tableName);
      if (total != null) {
        var rangeText = len > 0 ? vt("viewer.schema.searchTab.rangeShowing", stOffset + 1, stOffset + len) : vt("viewer.schema.searchTab.rangeNone");
        var rowWord = vt(total !== 1 ? "viewer.schema.searchTab.rowsPlural" : "viewer.schema.searchTab.rowsSingular");
        metaText = vt("viewer.schema.searchTab.metaCount", esc2(tableName), total, rowWord, rangeText);
      } else {
        metaText = vt("viewer.schema.searchTab.metaUpTo", esc2(tableName), stLimit);
      }
      var filterSuffix = "";
      if (stFilter()) {
        filterSuffix = stOnlyMatching ? vt("viewer.schema.search.filteredOf", filtered2.length, data.length) : vt("viewer.schema.search.showingAll", filtered2.length);
      }
      metaText += filterSuffix;
      var rawTableHtml = buildDataTableHtml(display, fkMap, colTypes, getColumnConfig(tableName));
      var tableHtml = wrapDataTableInScroll(rawTableHtml.replace('id="data-table"', 'id="st-data-table"')) + buildTableStatusBar(
        total,
        stOffset,
        stLimit,
        display.length,
        getVisibleColumnCount(Object.keys(display[0] || {}), getColumnConfig(tableName))
      );
      if (scope === "both" && schema) {
        stSchemaText = schema;
        stPanel.innerHTML = '<div class="search-section-collapsible expanded"><div class="collapsible-header" data-collapsible>' + vt("viewer.schema.heading") + '</div><div class="collapsible-body"><pre id="st-schema-pre">' + highlightSqlSafe(schema) + '</pre></div></div><div class="search-section-collapsible expanded"><div class="collapsible-header" data-collapsible>' + vt("viewer.schema.tableData.headingNamed", esc2(tableName)) + '</div><div class="collapsible-body"><p class="meta st-meta">' + metaText + "</p>" + tableHtml + "</div></div>";
      } else {
        stSchemaText = null;
        stPanel.innerHTML = '<p class="meta st-meta">' + metaText + "</p>" + tableHtml;
      }
      if (stRowToggle) {
        stRowToggle.style.display = scope === "data" || scope === "both" ? "flex" : "none";
      }
      stHighlight();
    }
    function stRender() {
      if (!stPanel) return;
      var scope = stScope();
      var tableName = stTableName;
      if (!tableName && scope !== "schema") {
        stPanel.innerHTML = '<p class="meta">' + vt("viewer.schema.searchTab.selectPrompt") + "</p>";
        return;
      }
      if (scope === "schema") {
        stPanel.innerHTML = '<p class="meta">' + vt("viewer.schema.loading") + "</p>";
        var schemaPromise = cachedSchema !== null ? Promise.resolve(cachedSchema) : fetch("/api/schema", authOpts()).then(function(r) {
          return r.text();
        });
        schemaPromise.then(function(schema) {
          if (cachedSchema === null) setCachedSchema(schema);
          stSchemaText = schema;
          stTableJson = null;
          stPanel.innerHTML = '<p class="meta">' + vt("viewer.schema.heading") + '</p><pre id="st-schema-pre">' + highlightSqlSafe(schema) + "</pre>";
          stHighlight();
        }).catch(function(e) {
          stPanel.innerHTML = '<p class="meta">' + vt("viewer.schema.error") + "</p><pre>" + esc2(String(e)) + "</pre>";
        });
        return;
      }
      if (!tableName) {
        stPanel.innerHTML = '<p class="meta">' + vt("viewer.schema.searchTab.selectTableAbove") + "</p>";
        return;
      }
      if (stTableJson && stCachedFks !== null && stCachedColTypes !== null) {
        if (scope === "both" && !cachedSchema) {
          stPanel.innerHTML = '<p class="meta">' + vt("viewer.schema.loading") + "</p>";
          fetch("/api/schema", authOpts()).then(function(r) {
            return r.text();
          }).then(function(schema) {
            setCachedSchema(schema);
            if (stTableName === tableName) stBuildContent(stTableJson, schema, stCachedFks, stCachedColTypes, tableName);
          }).catch(function(e) {
            stPanel.innerHTML = '<p class="meta">' + vt("viewer.schema.searchTab.loadingSchemaError") + "</p><pre>" + esc2(String(e)) + "</pre>";
          });
          return;
        }
        stBuildContent(stTableJson, scope === "both" ? cachedSchema : null, stCachedFks, stCachedColTypes, tableName);
        return;
      }
      stPanel.innerHTML = '<p class="meta">' + vt("viewer.schema.searchTab.loadingTable", esc2(tableName)) + "</p>";
      var dataFetch = fetch("/api/table/" + encodeURIComponent(tableName) + "?limit=" + stLimit + "&offset=" + stOffset, authOpts()).then(function(r) {
        return r.json();
      });
      var schemaFetch = scope === "both" ? cachedSchema !== null ? Promise.resolve(cachedSchema) : fetch("/api/schema", authOpts()).then(function(r) {
        return r.text();
      }) : Promise.resolve(null);
      Promise.all([dataFetch, schemaFetch, loadFkMeta(tableName), loadColumnTypes(tableName).catch(function() {
        return {};
      })]).then(function(results) {
        var data = results[0];
        var schema = results[1];
        var fks = results[2];
        var colTypes = results[3];
        if (stTableName !== tableName) return;
        stBuildContent(data, schema, fks, colTypes, tableName);
        var total = tableCounts[tableName];
        if (total == null) {
          fetch("/api/table/" + encodeURIComponent(tableName) + "/count", authOpts()).then(function(r) {
            return r.json();
          }).then(function(o) {
            tableCounts[tableName] = o.count;
            if (stTableName === tableName) {
              var metaEl = stPanel.querySelector(".st-meta");
              if (metaEl) {
                var len = stTableJson ? stTableJson.length : 0;
                var rangeText = len > 0 ? vt("viewer.schema.searchTab.rangeShowing", stOffset + 1, stOffset + len) : vt("viewer.schema.searchTab.rangeNone");
                var rowWord = vt(o.count !== 1 ? "viewer.schema.searchTab.rowsPlural" : "viewer.schema.searchTab.rowsSingular");
                metaEl.textContent = vt("viewer.schema.searchTab.metaCount", tableName, o.count, rowWord, rangeText);
              }
            }
          }).catch(function() {
          });
        }
      }).catch(function(e) {
        stPanel.innerHTML = '<p class="meta">' + vt("viewer.schema.error") + "</p><pre>" + esc2(String(e)) + "</pre>";
      });
    }
    function stHighlight() {
      var term = stTerm();
      var scope = stScope();
      var schemaPre = stPanel.querySelector("#st-schema-pre");
      if (schemaPre && stSchemaText && (scope === "schema" || scope === "both")) {
        schemaPre.innerHTML = term ? highlightText(stSchemaText, term) : highlightSqlSafe(stSchemaText);
      }
      var dataTable = stPanel.querySelector("#st-data-table");
      if (dataTable && (scope === "data" || scope === "both")) {
        dataTable.querySelectorAll("td").forEach(function(td) {
          if (!td.querySelector(".fk-link")) {
            var copyBtn = td.querySelector(".cell-copy-btn");
            var textNodes = [];
            td.childNodes.forEach(function(n) {
              if (n !== copyBtn) textNodes.push(n.textContent || "");
            });
            var text = textNodes.join("");
            var highlighted = term ? highlightText(text, term) : esc2(text);
            if (copyBtn) {
              td.innerHTML = highlighted + copyBtn.outerHTML;
            } else {
              td.innerHTML = highlighted;
            }
          }
        });
      }
      stMatches = term ? Array.from(stPanel.querySelectorAll(".highlight")) : [];
      stMatchIdx = -1;
      if (stMatches.length > 0) {
        stNavEl.style.display = "flex";
        stNavigate(0);
      } else {
        stNavEl.style.display = term ? "flex" : "none";
        stCountEl.textContent = term ? vt("viewer.schema.search.noMatches") : "";
        stPrevBtn.disabled = true;
        stNextBtn.disabled = true;
      }
    }
    function stNavigate(index) {
      if (stMatches.length === 0) return;
      if (index < 0) index = stMatches.length - 1;
      if (index >= stMatches.length) index = 0;
      if (stMatchIdx >= 0 && stMatchIdx < stMatches.length) {
        stMatches[stMatchIdx].classList.remove("highlight-active");
      }
      stMatchIdx = index;
      var el = stMatches[stMatchIdx];
      el.classList.add("highlight-active");
      expandSectionContaining(el);
      el.scrollIntoView({ behavior: "auto", block: "center", inline: "nearest" });
      stCountEl.textContent = vt("viewer.schema.search.matchCounter", stMatchIdx + 1, stMatches.length);
      stPrevBtn.disabled = false;
      stNextBtn.disabled = false;
    }
    function stNext() {
      if (stMatches.length) stNavigate(stMatchIdx + 1);
    }
    function stPrev() {
      if (stMatches.length) stNavigate(stMatchIdx - 1);
    }
    stTableSel.addEventListener("change", function() {
      stTableName = stTableSel.value || null;
      stTableJson = null;
      stCachedFks = null;
      stCachedColTypes = null;
      stRender();
    });
    var stInputTimer = null;
    var stFilterTimer = null;
    stInput.addEventListener("input", function() {
      clearTimeout(stInputTimer);
      stInputTimer = setTimeout(function() {
        if (stPanel.querySelector("#st-data-table, #st-schema-pre")) {
          stHighlight();
        } else {
          if (stTableName || stScope() === "schema") stRender();
        }
      }, 150);
    });
    stInput.addEventListener("keydown", function(e) {
      if (e.key === "Enter") {
        e.preventDefault();
        if (e.shiftKey) {
          stPrev();
        } else {
          stNext();
        }
      }
      if (e.key === "Escape") {
        stInput.value = "";
        clearTimeout(stInputTimer);
        stHighlight();
        stInput.blur();
      }
    });
    stScopeSel.addEventListener("change", function() {
      stRender();
    });
    stFilterEl.addEventListener("input", function() {
      clearTimeout(stFilterTimer);
      stFilterTimer = setTimeout(function() {
        if (stTableName && stTableJson) stRender();
      }, 200);
    });
    stPrevBtn.addEventListener("click", stPrev);
    stNextBtn.addEventListener("click", stNext);
    if (stRowAll) stRowAll.addEventListener("click", function() {
      stOnlyMatching = false;
      stRowAll.classList.add("active");
      if (stRowMatch) stRowMatch.classList.remove("active");
      if (stTableName && stTableJson) stRender();
    });
    if (stRowMatch) stRowMatch.addEventListener("click", function() {
      stOnlyMatching = true;
      stRowMatch.classList.add("active");
      if (stRowAll) stRowAll.classList.remove("active");
      if (stTableName && stTableJson) stRender();
    });
    window._stOnActivate = function() {
      if (!stTableName && currentTableName) {
        stTableSel.value = currentTableName;
        stTableName = currentTableName;
        stRender();
      }
      stInput.focus();
    };
    window._stFocusInput = function() {
      stInput.focus();
      stInput.select();
    };
  }

  // assets/web/sql-history.ts
  function loadSqlHistory() {
    setSqlHistory([]);
    try {
      const raw = localStorage.getItem(SQL_HISTORY_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return;
      setSqlHistory(parsed.map((h) => {
        const sql = h && typeof h.sql === "string" ? h.sql.trim() : "";
        if (!sql) return null;
        const rowCount = h && typeof h.rowCount === "number" ? h.rowCount : null;
        const at = h && typeof h.at === "string" ? h.at : null;
        return { sql, rowCount, at };
      }).filter(Boolean).slice(0, getPref(PREF_SQL_HISTORY_MAX, DEFAULTS[PREF_SQL_HISTORY_MAX])));
    } catch (e) {
      setSqlHistory([]);
    }
  }
  function saveSqlHistory() {
    try {
      localStorage.setItem(SQL_HISTORY_KEY, JSON.stringify(sqlHistory));
    } catch (e) {
    }
  }
  function pushSqlHistory(sql, rowCount) {
    sql = (sql || "").trim();
    if (!sql) return;
    const at = (/* @__PURE__ */ new Date()).toISOString();
    setSqlHistory([{ sql, rowCount, at }].concat(sqlHistory.filter((h) => h.sql !== sql)));
    setSqlHistory(sqlHistory.slice(0, getPref(PREF_SQL_HISTORY_MAX, DEFAULTS[PREF_SQL_HISTORY_MAX])));
    saveSqlHistory();
  }
  function bindDropdownToInput(sel, items, inputEl) {
    if (!sel || !inputEl) return;
    sel.addEventListener("change", function() {
      const idx = parseInt(this.value, 10);
      if (!isNaN(idx) && items[idx]) inputEl.value = items[idx].sql;
    });
  }
  function loadBookmarks() {
    setSqlBookmarks([]);
    try {
      const raw = localStorage.getItem(BOOKMARKS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return;
      setSqlBookmarks(parsed.map(function(b) {
        const name = b && typeof b.name === "string" ? b.name.trim() : "";
        const sql = b && typeof b.sql === "string" ? b.sql.trim() : "";
        if (!name || !sql) return null;
        const createdAt = b && typeof b.createdAt === "string" ? b.createdAt : null;
        return { name, sql, createdAt };
      }).filter(Boolean));
    } catch (e) {
      setSqlBookmarks([]);
    }
  }
  function saveBookmarks() {
    try {
      localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(sqlBookmarks));
    } catch (e) {
    }
  }
  function refreshBookmarksDropdown(sel) {
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = '<option value="">' + esc2(vt("viewer.sql.bookmarks.saved", sqlBookmarks.length)) + "</option>" + sqlBookmarks.map(function(b, i) {
      return '<option value="' + i + '" title="' + esc2(b.sql) + '">' + esc2(b.name) + "</option>";
    }).join("");
    if (cur !== "" && parseInt(cur, 10) < sqlBookmarks.length) sel.value = cur;
  }
  function addBookmark(inputEl, bookmarksSel) {
    const sql = inputEl.value.trim();
    if (!sql) return;
    const name = prompt(vt("viewer.sql.bookmarks.namePrompt"), sql.slice(0, 40));
    if (name == null || String(name).trim() === "") return;
    sqlBookmarks.unshift({ name, sql, createdAt: (/* @__PURE__ */ new Date()).toISOString() });
    saveBookmarks();
    refreshBookmarksDropdown(bookmarksSel);
  }
  function deleteBookmark(bookmarksSel) {
    const idx = parseInt(bookmarksSel.value, 10);
    if (isNaN(idx) || !sqlBookmarks[idx]) return;
    if (!confirm(vt("viewer.sql.bookmarks.deleteConfirm", sqlBookmarks[idx].name))) return;
    sqlBookmarks.splice(idx, 1);
    saveBookmarks();
    refreshBookmarksDropdown(bookmarksSel);
  }
  function exportBookmarks() {
    if (sqlBookmarks.length === 0) {
      alert(vt("viewer.sql.bookmarks.exportEmpty"));
      return;
    }
    const blob = new Blob([JSON.stringify(sqlBookmarks, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "drift-viewer-saved-queries.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  function importBookmarks(bookmarksSel) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = function() {
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function() {
        try {
          const raw = typeof reader.result === "string" ? reader.result : "";
          const imported = JSON.parse(raw);
          if (!Array.isArray(imported)) throw new Error(vt("viewer.sql.bookmarks.importExpectedArray"));
          let newCount = 0;
          imported.forEach(function(b) {
            if (b.name && b.sql && !sqlBookmarks.some(function(e) {
              return e.sql === b.sql;
            })) {
              sqlBookmarks.push({ name: b.name, sql: b.sql, createdAt: b.createdAt || (/* @__PURE__ */ new Date()).toISOString() });
              newCount++;
            }
          });
          saveBookmarks();
          refreshBookmarksDropdown(bookmarksSel);
          alert(vt("viewer.sql.bookmarks.importResult", newCount, imported.length - newCount));
        } catch (e) {
          alert(vt("viewer.sql.bookmarks.importInvalid", e.message));
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  // assets/web/sql-runner.ts
  function initSqlRunner() {
    const templateSel = document.getElementById("sql-template");
    const tableSel = document.getElementById("sql-table");
    const fieldsSel = document.getElementById("sql-fields");
    const lockBtn = document.getElementById("sql-template-lock");
    const applyBtn = document.getElementById("sql-apply-template");
    const runBtn = document.getElementById("sql-run");
    const historyToggleBtn = document.getElementById("sql-history-toggle");
    const formatSel = document.getElementById("sql-result-format");
    const inputEl = document.getElementById("sql-input");
    const errorEl = document.getElementById("sql-error");
    const resultEl = document.getElementById("sql-result");
    const explainEl = document.getElementById("sql-explain-info");
    const bookmarksSel = document.getElementById("sql-bookmarks");
    let sqlResultAllRows = [];
    let sqlResultPage = 0;
    const SQL_RESULT_PAGE_SIZE = 100;
    const bookmarkSaveBtn = document.getElementById("sql-bookmark-save");
    const bookmarkDeleteBtn = document.getElementById("sql-bookmark-delete");
    const bookmarkExportBtn = document.getElementById("sql-bookmark-export");
    const bookmarkImportBtn = document.getElementById("sql-bookmark-import");
    loadSqlHistory();
    loadBookmarks();
    refreshBookmarksDropdown(bookmarksSel);
    bindDropdownToInput(bookmarksSel, sqlBookmarks, inputEl);
    if (historyToggleBtn) historyToggleBtn.addEventListener("click", function() {
      selectPanel("history");
    });
    if (bookmarkSaveBtn) bookmarkSaveBtn.addEventListener("click", function() {
      addBookmark(inputEl, bookmarksSel);
    });
    if (bookmarkDeleteBtn) bookmarkDeleteBtn.addEventListener("click", function() {
      deleteBookmark(bookmarksSel);
    });
    if (bookmarkExportBtn) bookmarkExportBtn.addEventListener("click", exportBookmarks);
    if (bookmarkImportBtn) bookmarkImportBtn.addEventListener("click", function() {
      importBookmarks(bookmarksSel);
    });
    const TEMPLATES = {
      "select-star-limit": function(t, cols) {
        const list = cols && cols.length ? cols.map((c) => '"' + c + '"').join(", ") : "*";
        return "SELECT " + list + ' FROM "' + t + '" LIMIT 10';
      },
      "select-star": function(t, cols) {
        const list = cols && cols.length ? cols.map((c) => '"' + c + '"').join(", ") : "*";
        return "SELECT " + list + ' FROM "' + t + '"';
      },
      "count": function(t, _cols) {
        return 'SELECT COUNT(*) FROM "' + t + '"';
      },
      "select-fields": function(t, cols) {
        const list = cols && cols.length ? cols.map((c) => '"' + c + '"').join(", ") : "*";
        return "SELECT " + list + ' FROM "' + t + '" LIMIT 10';
      }
    };
    function getSelectedFields() {
      const opts = fieldsSel ? Array.from(fieldsSel.selectedOptions || []) : [];
      return opts.map((o) => o.value).filter(Boolean);
    }
    function applyTemplate() {
      const table = tableSel && tableSel.value || "";
      const templateId = templateSel && templateSel.value || "custom";
      if (templateId === "custom") return;
      const fn = TEMPLATES[templateId];
      if (!fn) return;
      const cols = getSelectedFields();
      const sql = table ? fn(table, cols) : 'SELECT * FROM "' + (table || "table_name") + '" LIMIT 10';
      if (inputEl) {
        inputEl.value = sql;
        scheduleAutoExplain();
      }
    }
    let templateLocked = true;
    if (lockBtn) {
      lockBtn.addEventListener("click", function() {
        templateLocked = !templateLocked;
        lockBtn.classList.toggle("locked", templateLocked);
        const icon = lockBtn.querySelector(".material-symbols-outlined");
        if (icon) icon.textContent = templateLocked ? "lock" : "lock_open";
        lockBtn.title = templateLocked ? vt("viewer.sql.template.lock.locked") : vt("viewer.sql.template.lock.unlocked");
      });
    }
    if (applyBtn) applyBtn.addEventListener("click", applyTemplate);
    if (templateSel) templateSel.addEventListener("change", applyTemplate);
    if (tableSel) {
      tableSel.addEventListener("change", function() {
        const name = this.value;
        if (fieldsSel) fieldsSel.innerHTML = '<option value="">\u2014</option>';
        if (!name) return;
        if (fieldsSel) fieldsSel.innerHTML = '<option value="">' + esc2(vt("viewer.sql.fields.loading")) + "</option>";
        const requestedTable = name;
        fetch("/api/table/" + encodeURIComponent(name) + "/columns", authOpts()).then((r) => r.json()).then((cols) => {
          if (tableSel.value !== requestedTable) return;
          if (Array.isArray(cols) && fieldsSel) {
            fieldsSel.innerHTML = '<option value="">\u2014</option>' + cols.map((c) => '<option value="' + esc2(c) + '">' + esc2(c) + "</option>").join("");
          } else if (fieldsSel) {
            fieldsSel.innerHTML = '<option value="">\u2014</option>';
          }
          if (templateLocked) applyTemplate();
        }).catch(() => {
          if (tableSel.value !== requestedTable) return;
          if (fieldsSel) fieldsSel.innerHTML = '<option value="">\u2014</option>';
        });
      });
    }
    if (fieldsSel) {
      fieldsSel.addEventListener("change", function() {
        if (templateLocked) applyTemplate();
      });
    }
    function renderSqlResultPage() {
      if (!resultEl) return;
      const rows = sqlResultAllRows;
      const pageSize = SQL_RESULT_PAGE_SIZE;
      const start = sqlResultPage * pageSize;
      const pageRows = rows.slice(start, start + pageSize);
      const keys = rows.length > 0 ? Object.keys(rows[0]) : [];
      const total = rows.length;
      let tableHtml = '<div class="data-table-scroll-wrap"><table class="drift-table"><thead><tr>' + keys.map(function(k) {
        return '<th data-column-key="' + esc2(k) + '">' + esc2(k) + "</th>";
      }).join("") + "</tr></thead><tbody>";
      pageRows.forEach(function(row) {
        tableHtml += "<tr>" + keys.map(function(k) {
          return "<td>" + esc2(row[k] != null ? String(row[k]) : "") + "</td>";
        }).join("") + "</tr>";
      });
      tableHtml += "</tbody></table></div>";
      const statusHtml = buildTableStatusBar(total, start, pageSize, pageRows.length, keys.length);
      let paginationHtml = "";
      if (total > pageSize) {
        const prevDisabled = sqlResultPage <= 0;
        const nextDisabled = start + pageSize >= total;
        paginationHtml = '<div class="sql-result-pagination toolbar" style="margin-top:0.35rem;"><button type="button" id="sql-result-prev"' + (prevDisabled ? " disabled" : "") + ">" + esc2(vt("viewer.sql.result.prev")) + '</button><button type="button" id="sql-result-next"' + (nextDisabled ? " disabled" : "") + ">" + esc2(vt("viewer.sql.result.next")) + "</button></div>";
      }
      const copyHtml = rows.length > 0 ? '<div class="sql-result-copy toolbar" style="margin-top:0.35rem;"><span class="sql-result-copy-label">' + esc2(vt("viewer.sql.result.copy.label")) + '</span><button type="button" id="sql-copy-md"><span class="material-symbols-outlined" aria-hidden="true">content_copy</span> ' + esc2(vt("viewer.sql.result.copy.markdown")) + '</button><button type="button" id="sql-copy-csv"><span class="material-symbols-outlined" aria-hidden="true">content_copy</span> ' + esc2(vt("viewer.sql.result.copy.csv")) + '</button><button type="button" id="sql-copy-json"><span class="material-symbols-outlined" aria-hidden="true">content_copy</span> ' + esc2(vt("viewer.sql.result.copy.json")) + "</button></div>" : "";
      const rowCountMeta = '<p class="meta">' + esc2(vt("viewer.sql.result.rowCount", total)) + "</p>";
      const headingKey = total === 1 ? "viewer.sql.result.heading.one" : "viewer.sql.result.heading.many";
      resultEl.innerHTML = '<div class="results-table-wrap" role="region" aria-label="' + esc2(vt("viewer.sql.result.regionLabel")) + '"><div class="results-table-heading">' + esc2(vt(headingKey, total)) + '</div><div class="results-table-body">' + rowCountMeta + copyHtml + tableHtml + statusHtml + paginationHtml + "</div></div>";
      bindResultsToggle();
      const prevBtn = resultEl.querySelector("#sql-result-prev");
      const nextBtn = resultEl.querySelector("#sql-result-next");
      if (prevBtn) prevBtn.addEventListener("click", function() {
        sqlResultPage--;
        renderSqlResultPage();
      });
      if (nextBtn) nextBtn.addEventListener("click", function() {
        sqlResultPage++;
        renderSqlResultPage();
      });
      const copyMd = resultEl.querySelector("#sql-copy-md");
      const copyCsv = resultEl.querySelector("#sql-copy-csv");
      const copyJson = resultEl.querySelector("#sql-copy-json");
      if (copyMd) copyMd.addEventListener("click", function() {
        copyResult("markdown");
      });
      if (copyCsv) copyCsv.addEventListener("click", function() {
        copyResult("csv");
      });
      if (copyJson) copyJson.addEventListener("click", function() {
        copyResult("json");
      });
    }
    function copyResult(kind) {
      const rows = sqlResultAllRows;
      if (!rows || rows.length === 0) {
        showCopyToast(vt("viewer.sql.result.copy.empty"));
        return;
      }
      let text;
      let doneKey;
      if (kind === "json") {
        text = rowsToJson(rows);
        doneKey = "viewer.sql.result.copy.done.json";
      } else if (kind === "csv") {
        text = rowsToCsv(rows);
        doneKey = "viewer.sql.result.copy.done.csv";
      } else {
        text = rowsToMarkdown(rows);
        doneKey = "viewer.sql.result.copy.done.markdown";
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function() {
          showCopyToast(vt(doneKey));
        }).catch(function() {
          showCopyToast(vt("viewer.sql.result.copy.failed"));
        });
      } else {
        showCopyToast(vt("viewer.sql.result.copy.failed"));
      }
    }
    function clearSqlResults() {
      if (errorEl) {
        errorEl.style.display = "none";
      }
      if (resultEl) {
        resultEl.style.display = "none";
        resultEl.innerHTML = "";
      }
      sqlResultAllRows = [];
      sqlResultPage = 0;
      const chartControls = document.getElementById("chart-controls");
      const chartContainer = document.getElementById("chart-container");
      if (chartControls) chartControls.style.display = "none";
      if (chartContainer) chartContainer.style.display = "none";
    }
    let explainTimer = null;
    let lastExplainedSql = "";
    let explainAbort = null;
    const EXPLAIN_DEBOUNCE_MS = 1200;
    function scheduleAutoExplain() {
      if (explainTimer) clearTimeout(explainTimer);
      explainTimer = setTimeout(runAutoExplain, EXPLAIN_DEBOUNCE_MS);
    }
    function runAutoExplain() {
      if (!inputEl || !explainEl) return;
      const sql = String(inputEl.value || "").trim();
      if (!sql) {
        explainEl.style.display = "none";
        lastExplainedSql = "";
        return;
      }
      if (sql === lastExplainedSql) return;
      lastExplainedSql = sql;
      if (explainAbort) explainAbort.abort();
      explainAbort = new AbortController();
      explainEl.style.display = "block";
      explainEl.innerHTML = '<p class="meta explain-loading">' + esc2(vt("viewer.sql.explain.analyzing")) + "</p>";
      fetch("/api/sql/explain", Object.assign({}, authOpts({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql })
      }), { signal: explainAbort.signal })).then((r) => r.json().then((d) => ({ ok: r.ok, data: d }))).then(({ ok, data }) => {
        if (!ok) {
          explainEl.innerHTML = '<p class="meta" style="color:#e57373;">' + esc2(data.error || vt("viewer.sql.explain.failed")) + "</p>";
          return;
        }
        renderExplainInfo(data);
      }).catch((e) => {
        if (e.name === "AbortError") return;
        explainEl.innerHTML = '<p class="meta" style="color:#e57373;">' + esc2(e.message || String(e)) + "</p>";
      });
    }
    function renderExplainInfo(data) {
      if (!explainEl) return;
      const rows = data.rows || [];
      const indexes = data.indexes || {};
      let scanCount = 0;
      let searchCount = 0;
      let subqueryCount = 0;
      let sortPresent = false;
      let tempPresent = false;
      const usedIndexNames = /* @__PURE__ */ new Set();
      const tableAccess = {};
      rows.forEach(function(r) {
        const d = String(r.detail || "").trim();
        const scanMatch = d.match(/\bSCAN\s+(?:TABLE\s+)?(\S+)/i);
        if (scanMatch) {
          scanCount++;
          if (scanMatch[1]) tableAccess[scanMatch[1]] = "scan";
        }
        const searchMatch = d.match(/\bSEARCH\s+(?:TABLE\s+)?(\S+)\s+USING\s+(?:COVERING\s+)?INDEX\s+(\S+)/i);
        if (searchMatch) {
          searchCount++;
          if (searchMatch[1] && tableAccess[searchMatch[1]] !== "scan") tableAccess[searchMatch[1]] = "index";
          if (searchMatch[2]) usedIndexNames.add(searchMatch[2]);
        } else if (/\bSEARCH\b/i.test(d) && /\bINDEX\b/i.test(d)) {
          searchCount++;
          const tblMatch = d.match(/\bSEARCH\s+(?:TABLE\s+)?(\S+)/i);
          if (tblMatch && tblMatch[1] && tableAccess[tblMatch[1]] !== "scan") tableAccess[tblMatch[1]] = "index";
          const idxMatch = d.match(/INDEX\s+(\S+)/i);
          if (idxMatch && idxMatch[1]) usedIndexNames.add(idxMatch[1]);
        } else if (/\bSEARCH\b/i.test(d)) {
          searchCount++;
          const tblMatch = d.match(/\bSEARCH\s+(?:TABLE\s+)?(\S+)/i);
          if (tblMatch && tblMatch[1] && tableAccess[tblMatch[1]] !== "scan") tableAccess[tblMatch[1]] = "index";
        }
        if (/\bSUBQUERY\b/i.test(d) || /\bCORRELATED\b/i.test(d)) subqueryCount++;
        if (/USE TEMP B-TREE.*ORDER/i.test(d)) sortPresent = true;
        if (/TEMP B-TREE|TEMP TABLE/i.test(d)) tempPresent = true;
      });
      const costScore = scanCount * 3 + subqueryCount * 2 + (sortPresent ? 1 : 0) + (tempPresent ? 1 : 0);
      let costLabel, costColor;
      if (costScore === 0) {
        costLabel = vt("viewer.sql.explain.cost.low");
        costColor = "#81c784";
      } else if (costScore <= 3) {
        costLabel = vt("viewer.sql.explain.cost.medium");
        costColor = "#ffb74d";
      } else {
        costLabel = vt("viewer.sql.explain.cost.high");
        costColor = "#e57373";
      }
      let html = '<div class="explain-cost-bar">';
      html += "<strong>" + esc2(vt("viewer.sql.explain.estimatedCost")) + '</strong> <span style="color:' + costColor + ';font-weight:600;">' + esc2(costLabel) + "</span>";
      const parts = [];
      if (scanCount > 0) parts.push(vt(scanCount > 1 ? "viewer.sql.explain.part.scan.many" : "viewer.sql.explain.part.scan.one", scanCount));
      if (searchCount > 0) parts.push(vt(searchCount > 1 ? "viewer.sql.explain.part.lookup.many" : "viewer.sql.explain.part.lookup.one", searchCount));
      if (subqueryCount > 0) parts.push(vt(subqueryCount > 1 ? "viewer.sql.explain.part.subquery.many" : "viewer.sql.explain.part.subquery.one", subqueryCount));
      if (sortPresent) parts.push(vt("viewer.sql.explain.part.sort"));
      if (tempPresent) parts.push(vt("viewer.sql.explain.part.tempStorage"));
      if (parts.length > 0) html += " &mdash; " + esc2(parts.join(", "));
      html += "</div>";
      const tableNames = Object.keys(tableAccess);
      if (tableNames.length > 0) {
        html += '<div class="explain-index-report">';
        for (const tbl of tableNames) {
          const access = tableAccess[tbl];
          const tblIndexes = indexes[tbl] || [];
          html += '<div class="explain-table-row">';
          html += '<span class="explain-table-name">' + esc2(tbl) + "</span>";
          if (access === "scan") {
            html += ' <span class="explain-badge badge-scan">' + esc2(vt("viewer.sql.explain.badge.fullScan")) + "</span>";
          }
          if (tblIndexes.length === 0) {
            html += ' <span class="explain-badge badge-missing">' + esc2(vt("viewer.sql.explain.badge.noIndexes")) + "</span>";
          } else {
            for (const idx of tblIndexes) {
              const isUsed = usedIndexNames.has(idx.name);
              const badge = isUsed ? "badge-used" : "badge-unused";
              const label = isUsed ? vt("viewer.sql.explain.badge.used") : vt("viewer.sql.explain.badge.available");
              html += ' <span class="explain-badge ' + badge + '" title="' + esc2(idx.name) + " (" + esc2(idx.columns.join(", ")) + ")" + (idx.unique ? " UNIQUE" : "") + '">';
              html += esc2(idx.name) + " <small>(" + esc2(label) + ")</small></span>";
            }
          }
          html += "</div>";
        }
        html += "</div>";
      }
      if (rows.length > 0) {
        html += '<details class="explain-details"><summary>' + esc2(vt(rows.length > 1 ? "viewer.sql.explain.steps.many" : "viewer.sql.explain.steps.one", rows.length)) + "</summary><pre>";
        rows.forEach(function(r) {
          html += esc2(String(r.detail || "").trim()) + "\n";
        });
        html += "</pre></details>";
      }
      explainEl.innerHTML = html;
      explainEl.style.display = "block";
    }
    if (inputEl) {
      inputEl.addEventListener("input", scheduleAutoExplain);
    }
    if (runBtn && inputEl && errorEl && resultEl) {
      runBtn.addEventListener("click", function() {
        const sql = String(inputEl.value || "").trim();
        clearSqlResults();
        if (!sql) {
          errorEl.textContent = vt("viewer.sql.run.emptyQuery");
          errorEl.style.display = "block";
          return;
        }
        const runBtnOrigText = runBtn.textContent;
        setButtonBusy(runBtn, true, vt("viewer.sql.run.busy"));
        runBtn.disabled = true;
        fetch("/api/sql", authOpts({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sql })
        })).then((r) => r.json().then((data) => ({ ok: r.ok, data }))).then(({ ok, data }) => {
          if (!ok) {
            errorEl.textContent = data.error || vt("viewer.sql.run.requestFailed");
            errorEl.style.display = "block";
            return;
          }
          const rows = data.rows || [];
          const asTable = formatSel && formatSel.value === "table";
          if (asTable && rows.length > 0) {
            sqlResultAllRows = rows;
            sqlResultPage = 0;
            renderSqlResultPage();
          } else {
            resultEl.innerHTML = '<p class="meta">' + esc2(vt("viewer.sql.result.rowCount", rows.length)) + "</p><pre>" + esc2(JSON.stringify(rows, null, 2)) + "</pre>";
          }
          resultEl.style.display = "block";
          var chartControls = document.getElementById("chart-controls");
          if (rows.length > 0) {
            var keys2 = Object.keys(rows[0]);
            var xSel = document.getElementById("chart-x");
            var ySel = document.getElementById("chart-y");
            if (xSel) xSel.innerHTML = keys2.map(function(k) {
              return "<option>" + esc2(k) + "</option>";
            }).join("");
            if (ySel) ySel.innerHTML = keys2.map(function(k) {
              return "<option>" + esc2(k) + "</option>";
            }).join("");
            if (chartControls) chartControls.style.display = "flex";
            window._chartRows = rows;
          } else {
            if (chartControls) chartControls.style.display = "none";
            var cc = document.getElementById("chart-container");
            if (cc) cc.style.display = "none";
          }
          pushSqlHistory(sql, rows.length);
          fetchHistory();
        }).catch((e) => {
          errorEl.textContent = e.message || String(e);
          errorEl.style.display = "block";
        }).finally(() => {
          runBtn.disabled = false;
          setButtonBusy(runBtn, false, runBtnOrigText);
        });
      });
    }
    (function applySqlFromQueryString() {
      try {
        var params = new URLSearchParams(location.search);
        var sqlParam = params.get("sql");
        if (!sqlParam || !inputEl) return;
        var decoded = sqlParam;
        try {
          decoded = decodeURIComponent(sqlParam);
        } catch (e2) {
        }
        inputEl.value = decoded;
        switchTab("sql");
        scheduleAutoExplain();
        try {
          var u = new URL(location.href);
          u.searchParams.delete("sql");
          history.replaceState(null, "", u.pathname + u.search + u.hash);
        } catch (e3) {
        }
      } catch (e) {
      }
    })();
  }

  // assets/web/performance.ts
  function initPerformance() {
    const toggle = document.getElementById("perf-toggle");
    const collapsible = document.getElementById("perf-collapsible");
    const refreshBtn = document.getElementById("perf-refresh");
    const clearBtn = document.getElementById("perf-clear");
    const container = document.getElementById("perf-results");
    const saveBtn = document.getElementById("perf-save");
    const exportBtn = document.getElementById("perf-export");
    const historySel = document.getElementById("perf-history");
    const compareBtn = document.getElementById("perf-compare");
    const slowThresholdInput = document.getElementById("perf-slow-threshold");
    let perfLoaded = false;
    var lastPerfData = null;
    function getSlowThreshold() {
      var fallback = getPref(PREF_SLOW_QUERY_THRESHOLD, DEFAULTS[PREF_SLOW_QUERY_THRESHOLD]);
      if (!slowThresholdInput) return fallback;
      var v = parseInt(slowThresholdInput.value, 10);
      return v > 0 ? v : fallback;
    }
    function fetchPerformance() {
      if (!refreshBtn || !container) return;
      refreshBtn.disabled = true;
      setButtonBusy(refreshBtn, true, vt("viewer.session.perf.loading"));
      container.style.display = "none";
      var threshold = getSlowThreshold();
      fetch("/api/analytics/performance?slowThresholdMs=" + threshold, authOpts()).then(function(r) {
        if (!r.ok) return r.json().then(function(d) {
          throw new Error(d.error || vt("viewer.session.perf.requestFailed"));
        });
        return r.json();
      }).then(function(data) {
        perfLoaded = true;
        lastPerfData = data;
        if (data.totalQueries === 0) {
          container.innerHTML = '<p class="meta">' + vt("viewer.session.perf.empty") + "</p>";
        } else {
          container.innerHTML = renderPerformance(data);
        }
        container.style.display = "block";
        populateHistorySelect(historySel, "perf");
      }).catch(function(e) {
        container.innerHTML = '<p class="meta" style="color:#e57373;">' + vt("viewer.session.perf.error", esc2(e.message)) + "</p>";
        container.style.display = "block";
      }).finally(function() {
        if (refreshBtn) {
          refreshBtn.disabled = false;
          setButtonBusy(refreshBtn, false, vt("viewer.session.perf.update"));
        }
      });
    }
    function renderPerformance(data) {
      if (!data) return '<p class="meta">' + vt("viewer.session.perf.noData") + "</p>";
      var html = '<div style="display:flex;gap:1rem;flex-wrap:wrap;margin:0.3rem 0;">';
      html += '<div class="meta">' + vt("viewer.session.perf.summary.total", esc2(String(data.totalQueries || 0))) + "</div>";
      html += '<div class="meta">' + vt("viewer.session.perf.summary.totalTime", esc2(String(data.totalDurationMs || 0))) + "</div>";
      html += '<div class="meta">' + vt("viewer.session.perf.summary.avg", esc2(String(data.avgDurationMs || 0))) + "</div>";
      html += "</div>";
      if (data.slowQueries && data.slowQueries.length > 0) {
        var thresh = data.slowThresholdMs || 100;
        html += '<p class="meta" style="color:#e57373;font-weight:bold;">' + vt("viewer.session.perf.slow.heading", esc2(String(thresh))) + "</p>";
        html += '<table style="border-collapse:collapse;width:100%;font-size:12px;">';
        html += '<tr><th style="border:1px solid var(--border);padding:4px;">' + vt("viewer.session.perf.col.duration") + "</th>";
        html += '<th style="border:1px solid var(--border);padding:4px;">' + vt("viewer.session.perf.col.rows") + "</th>";
        html += '<th style="border:1px solid var(--border);padding:4px;">' + vt("viewer.session.perf.col.time") + "</th>";
        html += '<th style="border:1px solid var(--border);padding:4px;">' + vt("viewer.session.perf.col.sql") + "</th></tr>";
        data.slowQueries.forEach(function(q) {
          var sql = q.sql || "";
          html += "<tr>";
          html += '<td style="border:1px solid var(--border);padding:4px;color:#e57373;font-weight:bold;">[!!] ' + esc2(String(q.durationMs)) + " " + vt("viewer.session.perf.col.ms") + "</td>";
          html += '<td style="border:1px solid var(--border);padding:4px;">' + esc2(String(q.rowCount)) + "</td>";
          html += '<td style="border:1px solid var(--border);padding:4px;font-size:11px;">' + esc2(q.at) + "</td>";
          html += '<td style="border:1px solid var(--border);padding:4px;max-width:400px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + esc2(sql) + '">' + esc2(sql.length > 80 ? sql.slice(0, 80) + "\u2026" : sql) + "</td>";
          html += "</tr>";
        });
        html += "</table>";
      }
      if (data.queryPatterns && data.queryPatterns.length > 0) {
        html += '<p class="meta" style="margin-top:0.5rem;">' + vt("viewer.session.perf.patterns.heading") + "</p>";
        html += '<table style="border-collapse:collapse;width:100%;font-size:12px;">';
        html += '<tr><th style="border:1px solid var(--border);padding:4px;">' + vt("viewer.session.perf.col.totalMs") + "</th>";
        html += '<th style="border:1px solid var(--border);padding:4px;">' + vt("viewer.session.perf.col.count") + "</th>";
        html += '<th style="border:1px solid var(--border);padding:4px;">' + vt("viewer.session.perf.col.avgMs") + "</th>";
        html += '<th style="border:1px solid var(--border);padding:4px;">' + vt("viewer.session.perf.col.maxMs") + "</th>";
        html += '<th style="border:1px solid var(--border);padding:4px;">' + vt("viewer.session.perf.col.pattern") + "</th></tr>";
        data.queryPatterns.forEach(function(p) {
          var pattern = p.pattern || "";
          html += "<tr>";
          html += '<td style="border:1px solid var(--border);padding:4px;">' + esc2(String(p.totalMs)) + "</td>";
          html += '<td style="border:1px solid var(--border);padding:4px;">' + esc2(String(p.count)) + "</td>";
          html += '<td style="border:1px solid var(--border);padding:4px;">' + esc2(String(p.avgMs)) + "</td>";
          html += '<td style="border:1px solid var(--border);padding:4px;">' + esc2(String(p.maxMs)) + "</td>";
          html += '<td style="border:1px solid var(--border);padding:4px;" title="' + esc2(pattern) + '">' + esc2(pattern.length > 60 ? pattern.slice(0, 60) + "\u2026" : pattern) + "</td>";
          html += "</tr>";
        });
        html += "</table>";
      }
      if (data.recentQueries && data.recentQueries.length > 0) {
        html += '<p class="meta" style="margin-top:0.5rem;">' + vt("viewer.session.perf.recent.heading") + "</p>";
        html += '<table style="border-collapse:collapse;width:100%;font-size:12px;">';
        html += '<tr><th style="border:1px solid var(--border);padding:4px;">' + vt("viewer.session.perf.col.ms") + "</th>";
        html += '<th style="border:1px solid var(--border);padding:4px;">' + vt("viewer.session.perf.col.rows") + "</th>";
        html += '<th style="border:1px solid var(--border);padding:4px;">' + vt("viewer.session.perf.col.sql") + "</th></tr>";
        var recentThresh = data.slowThresholdMs || 100;
        var warnThresh = Math.round(recentThresh / 2);
        data.recentQueries.forEach(function(q) {
          var sql = q.sql || "";
          var color = q.durationMs > recentThresh ? "#e57373" : q.durationMs > warnThresh ? "#ffb74d" : "var(--fg)";
          var speedIcon = q.durationMs > recentThresh ? "[!!] " : q.durationMs > warnThresh ? "[!] " : "";
          var speedWeight = speedIcon ? "font-weight:bold;" : "";
          html += "<tr>";
          html += '<td style="border:1px solid var(--border);padding:4px;color:' + color + ";" + speedWeight + '">' + esc2(speedIcon) + esc2(String(q.durationMs)) + "</td>";
          html += '<td style="border:1px solid var(--border);padding:4px;">' + esc2(String(q.rowCount)) + "</td>";
          html += '<td style="border:1px solid var(--border);padding:4px;max-width:400px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + esc2(sql) + '">' + esc2(sql.length > 80 ? sql.slice(0, 80) + "\u2026" : sql) + "</td>";
          html += "</tr>";
        });
        html += "</table>";
      }
      return html;
    }
    if (historySel) {
      populateHistorySelect(historySel, "perf");
      historySel.addEventListener("change", function() {
        var id = this.value;
        if (!id) return;
        var saved = getSavedAnalysisById("perf", id);
        if (saved && saved.data) {
          lastPerfData = saved.data;
          container.innerHTML = saved.data.totalQueries === 0 ? '<p class="meta">' + vt("viewer.session.perf.emptySaved") + "</p>" : renderPerformance(saved.data);
          container.style.display = "block";
        }
      });
    }
    if (saveBtn) saveBtn.addEventListener("click", function() {
      if (!lastPerfData) return;
      var id = saveAnalysis("perf", lastPerfData);
      showCopyToast(id != null ? vt("viewer.session.perf.saved") : vt("viewer.session.perf.saveFailed"));
      populateHistorySelect(historySel, "perf");
    });
    if (exportBtn) exportBtn.addEventListener("click", function() {
      if (!lastPerfData) return;
      downloadJSON(lastPerfData, "performance-" + (/* @__PURE__ */ new Date()).toISOString().slice(0, 10) + ".json");
    });
    if (compareBtn) compareBtn.addEventListener("click", function() {
      showAnalysisCompare("perf", vt("viewer.session.perf.compareLabel"), getSavedAnalyses("perf"), lastPerfData, function(d) {
        return d && d.totalQueries !== 0 ? renderPerformance(d) : '<p class="meta">' + vt("viewer.session.perf.noQueriesInRun") + "</p>";
      }, function(a, b) {
        var qa = (a && a.totalQueries) != null ? a.totalQueries : 0;
        var qb = (b && b.totalQueries) != null ? b.totalQueries : 0;
        return vt("viewer.session.perf.compareSummary", qa, qb);
      });
    });
    if (toggle && collapsible) {
      toggle.addEventListener("click", function() {
        const isCollapsed = collapsible.classList.contains("collapsed");
        collapsible.classList.toggle("collapsed", !isCollapsed);
        syncFeatureCardExpanded(collapsible);
        if (isCollapsed && !perfLoaded) fetchPerformance();
      });
    }
    if (refreshBtn) refreshBtn.addEventListener("click", fetchPerformance);
    if (clearBtn) clearBtn.addEventListener("click", function() {
      clearBtn.disabled = true;
      clearBtn.textContent = vt("viewer.session.perf.clearing");
      fetch("/api/analytics/performance", authOpts({ method: "DELETE" })).then(function(r) {
        if (!r.ok) return r.json().then(function(d) {
          throw new Error(d.error || vt("viewer.session.perf.clearFailed"));
        });
        lastPerfData = null;
        container.innerHTML = '<p class="meta">' + vt("viewer.session.perf.cleared") + "</p>";
        container.style.display = "block";
        perfLoaded = false;
      }).catch(function(e) {
        container.innerHTML = '<p class="meta" style="color:#e57373;">' + vt("viewer.session.perf.error", esc2(e.message)) + "</p>";
        container.style.display = "block";
      }).finally(function() {
        clearBtn.disabled = false;
        clearBtn.textContent = vt("viewer.session.perf.clear");
      });
    });
  }

  // assets/web/app.js
  console.log("[SDA] app.js: executing, window.mastheadStatus=" + (window.mastheadStatus ? "set" : "NOT SET"));
  (function() {
    var el = document.getElementById("sda-loading");
    if (el) el.style.display = "none";
  })();
  clearStaleProjectStorage();
  applyStoredPrefs();
  function applyHealthWriteFlag(data) {
    if (data && typeof data.writeEnabled === "boolean") setDriftWriteEnabled(data.writeEnabled);
    var clearTableBtn = document.getElementById("clear-table-data");
    var clearAllBtn = document.getElementById("clear-all-data");
    var show = driftWriteEnabled ? "" : "none";
    if (clearTableBtn) clearTableBtn.style.display = show;
    if (clearAllBtn) clearAllBtn.style.display = show;
    if (data && typeof data.compareEnabled === "boolean") setDriftCompareEnabled(data.compareEnabled);
    var setupGuide = document.getElementById("compare-setup-guide");
    var activePanel = document.getElementById("compare-active");
    if (setupGuide) setupGuide.style.display = driftCompareEnabled ? "none" : "";
    if (activePanel) activePanel.style.display = driftCompareEnabled ? "" : "none";
  }
  initNlModalListeners();
  function setupNavigateAwayConfirmation() {
    window.addEventListener("beforeunload", function(e) {
      if (!hasUnsavedWebEdit()) return;
      e.preventDefault();
      e.returnValue = "";
      return "";
    });
  }
  setupNavigateAwayConfirmation();
  (function() {
    var dismissBtn = document.getElementById("banner-dismiss");
    if (dismissBtn) {
      dismissBtn.addEventListener("click", function() {
        setBannerDismissed(true);
        hideConnectionBanner();
      });
    }
  })();
  (function() {
    var retryBtn = document.getElementById("banner-retry");
    if (retryBtn) {
      retryBtn.addEventListener("click", function() {
        if (connectionState !== "disconnected" && connectionState !== "reconnecting") return;
        if (heartbeatInFlight) return;
        stopHeartbeat();
        setNextHeartbeatAt(null);
        setCurrentBackoffMs(BACKOFF_INITIAL_MS);
        doHeartbeat();
      });
    }
  })();
  initTheme();
  initThemeListeners();
  initPiiMaskToggle();
  initLongPressCopy();
  if (DRIFT_VIEWER_AUTH_TOKEN) {
    schemaLink = document.getElementById("export-schema");
    if (schemaLink) schemaLink.href = "/api/schema";
  }
  var schemaLink;
  var schemaToggle = document.getElementById("schema-toggle");
  if (schemaToggle) {
    schemaToggle.addEventListener("click", function() {
      const el = document.getElementById("schema-collapsible");
      const isCollapsed = el && el.classList.contains("collapsed");
      if (el) el.classList.toggle("collapsed", !isCollapsed);
      syncFeatureCardExpanded(el);
      if (isCollapsed) loadSchemaIntoPre();
    });
  }
  function refreshSearchResultsPanel() {
    if (typeof window._stOnActivate === "function") window._stOnActivate();
  }
  function triggerToolButtonIfReady(buttonId, opts) {
    var btn = document.getElementById(buttonId);
    if (!btn || btn.classList.contains("offline-disabled")) return;
    if (opts && opts.checkDisabled && btn.disabled) return;
    btn.click();
  }
  window.onTabSwitch = function(tabId) {
    if (tabId === "schema") loadSchemaIntoPre();
    if (tabId === "diagram" && typeof window.ensureDiagramInited === "function") window.ensureDiagramInited();
    if (tabId === "search") refreshSearchResultsPanel();
    if (tabId === "index") triggerToolButtonIfReady("index-analyze", { checkDisabled: true });
    if (tabId === "size" && lastSizeAnalyticsData == null) triggerToolButtonIfReady("size-analyze", { checkDisabled: true });
    if (tabId === "perf") triggerToolButtonIfReady("perf-refresh", { checkDisabled: true });
    if (tabId === "anomaly") triggerToolButtonIfReady("anomaly-analyze", { checkDisabled: true });
    if (typeof window._toolbarSyncActiveTab === "function") window._toolbarSyncActiveTab(tabId);
  };
  initTabsAndToolbar();
  initSidebarPanels();
  initSidebarResize();
  initHistorySidebar();
  initHomeScreen();
  openTool("home");
  initDiagram();
  initSnapshot();
  initCompare();
  initMigrationPreview();
  initIndexSuggestions();
  initSizeAnalytics();
  initAnomalyDetection();
  initDeclaredSchema();
  initImport();
  initSearchTab();
  initSqlRunner();
  initPerformance();
  document.addEventListener("click", function(e) {
    var header = e.target.closest(".collapsible-header[data-collapsible]");
    if (!header) return;
    var wrap = header.closest(".search-section-collapsible");
    var body = wrap && wrap.querySelector(".collapsible-body");
    if (body) {
      body.classList.toggle("collapsed");
      wrap.classList.toggle("expanded", !body.classList.contains("collapsed"));
    }
  });
  document.getElementById("export-csv").addEventListener("click", function(e) {
    e.preventDefault();
    if (!currentTableName || !currentTableJson || currentTableJson.length === 0) {
      document.getElementById("export-csv-status").textContent = " Select a table with data first.";
      return;
    }
    const statusEl = document.getElementById("export-csv-status");
    statusEl.textContent = " Preparing\u2026";
    try {
      const keys = Object.keys(currentTableJson[0]);
      const rowToCsv = (row) => keys.map((k) => {
        const v = row[k];
        const s = getDisplayValue(k, v);
        if (s === "") return "";
        return s.includes(",") || s.includes('"') || s.includes("\n") ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(",");
      const csv = [keys.join(","), ...currentTableJson.map(rowToCsv)].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = currentTableName + ".csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      statusEl.textContent = " Failed: " + err.message;
      return;
    }
    statusEl.textContent = "";
  });
  document.getElementById("export-json").addEventListener("click", function(e) {
    e.preventDefault();
    if (!currentTableName || !currentTableJson || currentTableJson.length === 0) {
      document.getElementById("export-json-status").textContent = " Select a table with data first.";
      return;
    }
    var statusEl = document.getElementById("export-json-status");
    statusEl.textContent = " Preparing\u2026";
    try {
      var json = JSON.stringify(currentTableJson, null, 2);
      var blob = new Blob([json], { type: "application/json;charset=utf-8" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = currentTableName + ".json";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      statusEl.textContent = " Failed: " + err.message;
      return;
    }
    statusEl.textContent = "";
  });
  document.getElementById("search-input").addEventListener("input", applySearch);
  document.getElementById("search-input").addEventListener("keydown", function(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) {
        prevMatch();
      } else {
        nextMatch();
      }
    }
    if (e.key === "Escape") {
      this.value = "";
      applySearch();
      this.blur();
    }
  });
  document.getElementById("search-prev").addEventListener("click", prevMatch);
  document.getElementById("search-next").addEventListener("click", nextMatch);
  document.addEventListener("keydown", function(e) {
    if (e.ctrlKey && e.key === "g") {
      e.preventDefault();
      if (e.shiftKey) {
        prevMatch();
      } else {
        nextMatch();
      }
    }
    if (e.ctrlKey && e.key === "f") {
      e.preventDefault();
      if (activeTabId === "search" && typeof window._stFocusInput === "function") {
        window._stFocusInput();
      } else {
        var wrap = document.getElementById("sidebar-search-wrap");
        if (wrap && wrap.classList.contains("collapsed")) {
          wrap.classList.remove("collapsed");
          wrap.setAttribute("aria-hidden", "false");
        }
        var searchInput = document.getElementById("search-input");
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
      }
    }
  });
  document.getElementById("row-filter").addEventListener("input", function() {
    if (currentTableName && currentTableJson) {
      renderTableView(currentTableName, currentTableJson);
      saveTableState(currentTableName);
    }
  });
  document.getElementById("row-filter").addEventListener("keyup", function() {
    if (currentTableName && currentTableJson) renderTableView(currentTableName, currentTableJson);
  });
  var rowDisplayAll = document.getElementById("row-display-all");
  var rowDisplayMatching = document.getElementById("row-display-matching");
  if (rowDisplayAll) rowDisplayAll.addEventListener("click", function() {
    setShowOnlyMatchingRows(false);
    rowDisplayAll.classList.add("active");
    if (rowDisplayMatching) rowDisplayMatching.classList.remove("active");
    if (currentTableName && currentTableJson) {
      renderTableView(currentTableName, currentTableJson);
      saveTableState(currentTableName);
    }
  });
  if (rowDisplayMatching) rowDisplayMatching.addEventListener("click", function() {
    setShowOnlyMatchingRows(true);
    rowDisplayMatching.classList.add("active");
    if (rowDisplayAll) rowDisplayAll.classList.remove("active");
    if (currentTableName && currentTableJson) {
      renderTableView(currentTableName, currentTableJson);
      saveTableState(currentTableName);
    }
  });
  document.getElementById("search-scope").addEventListener("change", function() {
    const scope = getScope();
    const content = document.getElementById("content");
    const paginationBar = document.getElementById("pagination-bar");
    if (scope === "both") {
      loadBothView();
      paginationBar.style.display = currentTableName ? "flex" : "none";
    } else if (scope === "schema") {
      loadSchemaView();
      paginationBar.style.display = "none";
    } else if (currentTableName) {
      renderTableView(currentTableName, currentTableJson);
      paginationBar.style.display = "flex";
    } else {
      content.innerHTML = "";
      setLastRenderedSchema(null);
      setLastRenderedData(null);
      paginationBar.style.display = "none";
    }
    applySearch();
  });
  document.getElementById("export-dump").addEventListener("click", function(e) {
    e.preventDefault();
    const link = this;
    const statusEl = document.getElementById("export-dump-status");
    const origText = link.textContent;
    link.textContent = "Preparing dump\u2026";
    statusEl.textContent = "";
    fetch("/api/dump", authOpts()).then((r) => {
      if (!r.ok) throw new Error(r.statusText);
      return r.blob();
    }).then((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "dump.sql";
      a.click();
      URL.revokeObjectURL(url);
    }).catch((err) => {
      statusEl.textContent = " Failed: " + err.message;
    }).finally(() => {
      link.textContent = origText;
    });
  });
  document.getElementById("export-database").addEventListener("click", function(e) {
    e.preventDefault();
    const link = this;
    const statusEl = document.getElementById("export-database-status");
    const origText = link.textContent;
    link.textContent = "Preparing\u2026";
    statusEl.textContent = "";
    fetch("/api/database", authOpts()).then((r) => {
      if (r.status === 501) return r.json().then((j) => {
        throw new Error(j.error || "Not configured");
      });
      if (!r.ok) throw new Error(r.statusText);
      return r.blob();
    }).then((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "database.sqlite";
      a.click();
      URL.revokeObjectURL(url);
    }).catch((err) => {
      statusEl.textContent = " " + err.message;
    }).finally(() => {
      link.textContent = origText;
    });
  });
  document.getElementById("pagination-limit").addEventListener("change", function() {
    setLimit(parseInt(this.value, 10));
    saveTableState(currentTableName);
    loadTable(currentTableName);
  });
  document.getElementById("pagination-offset").addEventListener("change", function() {
    setOffset(parseInt(this.value || "0", 10) || 0);
  });
  document.getElementById("pagination-prev").addEventListener("click", function() {
    goToOffset(Math.max(0, offset - limit));
  });
  document.getElementById("pagination-next").addEventListener("click", function() {
    goToOffset(offset + limit);
  });
  document.getElementById("pagination-first").addEventListener("click", function() {
    goToOffset(0);
  });
  document.getElementById("pagination-last").addEventListener("click", function() {
    const total = currentTableName ? tableCounts[currentTableName] ?? null : null;
    if (total == null || total <= 0) return;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    goToOffset((totalPages - 1) * limit);
  });
  document.getElementById("pagination-apply").addEventListener("click", function() {
    goToOffset(parseInt(document.getElementById("pagination-offset").value || "0", 10) || 0);
  });
  (function() {
    const toggle = document.getElementById("pagination-advanced-toggle");
    const advanced = document.getElementById("pagination-advanced");
    if (toggle && advanced) {
      toggle.addEventListener("click", function() {
        const collapsed = advanced.classList.toggle("collapsed");
        advanced.style.display = collapsed ? "none" : "flex";
        advanced.setAttribute("aria-hidden", collapsed ? "true" : "false");
      });
      advanced.style.display = "none";
    }
  })();
  document.getElementById("sample-rows-btn").addEventListener("click", function() {
    if (!currentTableName) return;
    var btn = this;
    var origHtml = btn.innerHTML;
    var sampleSize = limit || 50;
    var sql = 'SELECT * FROM "' + currentTableName.replace(/"/g, '""') + '" ORDER BY RANDOM() LIMIT ' + sampleSize;
    btn.disabled = true;
    btn.textContent = "Sampling\u2026";
    fetch("/api/sql", authOpts({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql })
    })).then(function(r) {
      return r.json().then(function(d) {
        return { ok: r.ok, data: d };
      });
    }).then(function(o) {
      if (!o.ok) throw new Error(o.data.error || "Sample query failed");
      var rows = o.data.rows || [];
      setCurrentTableJson(rows);
      renderTableView(currentTableName, rows);
    }).catch(function(err) {
      document.getElementById("content").innerHTML = '<p class="meta">Sample failed: ' + esc2(String(err.message || err)) + "</p>";
    }).finally(function() {
      btn.disabled = false;
      btn.innerHTML = origHtml;
    });
  });
  document.getElementById("clear-table-state").addEventListener("click", function() {
    clearTableState2(currentTableName);
    document.getElementById("row-filter").value = "";
    setLimit(200);
    setOffset(0);
    setDisplayFormat("raw");
    var fmtSel = document.getElementById("display-format-toggle");
    if (fmtSel) fmtSel.value = "raw";
    setQueryBuilderActive(false);
    setQueryBuilderState(null);
    if (currentTableName) loadTable(currentTableName);
  });
  document.getElementById("clear-table-data").addEventListener("click", function() {
    if (!driftWriteEnabled || !currentTableName) return;
    if (!confirm('Delete ALL rows from "' + currentTableName + '"? This cannot be undone.')) return;
    var btn = this;
    btn.disabled = true;
    fetch("/api/edits/apply", authOpts({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ statements: ['DELETE FROM "' + currentTableName.replace(/"/g, '""') + '"'] })
    })).then(function(r) {
      return r.json().then(function(d) {
        return { ok: r.ok, data: d };
      });
    }).then(function(o) {
      if (!o.ok) {
        alert("Clear failed: " + (o.data.error || "Unknown error"));
        return;
      }
      loadTable(currentTableName);
    }).catch(function(e) {
      alert("Clear failed: " + (e.message || "Network error"));
    }).finally(function() {
      btn.disabled = false;
    });
  });
  document.getElementById("clear-all-data").addEventListener("click", function() {
    if (!driftWriteEnabled) return;
    var tables = lastKnownTables || [];
    if (tables.length === 0) {
      alert("No tables loaded.");
      return;
    }
    if (!confirm("Delete ALL rows from ALL " + tables.length + " table(s)? This cannot be undone.")) return;
    var btn = this;
    btn.disabled = true;
    var stmts = tables.map(function(t) {
      return 'DELETE FROM "' + t.replace(/"/g, '""') + '"';
    });
    fetch("/api/edits/apply", authOpts({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ statements: stmts })
    })).then(function(r) {
      return r.json().then(function(d) {
        return { ok: r.ok, data: d };
      });
    }).then(function(o) {
      if (!o.ok) {
        alert("Clear all failed: " + (o.data.error || "Unknown error"));
        return;
      }
      if (currentTableName) loadTable(currentTableName);
    }).catch(function(e) {
      alert("Clear all failed: " + (e.message || "Network error"));
    }).finally(function() {
      btn.disabled = false;
    });
  });
  document.getElementById("display-format-toggle").addEventListener("change", function() {
    setDisplayFormat(String(this.value || "raw"));
    if (currentTableName) {
      saveTableState(currentTableName);
      if (currentTableJson) renderTableView(currentTableName, currentTableJson);
    }
  });
  document.getElementById("column-chooser-btn").addEventListener("click", function() {
    var panel = document.getElementById("column-chooser");
    if (!currentTableName || !currentTableJson || !currentTableJson.length) {
      panel.style.display = "none";
      return;
    }
    populateColumnChooserList();
    panel.style.display = "block";
    panel.setAttribute("aria-hidden", "false");
  });
  document.getElementById("column-chooser-close").addEventListener("click", function() {
    document.getElementById("column-chooser").style.display = "none";
    document.getElementById("column-chooser").setAttribute("aria-hidden", "true");
  });
  document.getElementById("column-chooser-reset").addEventListener("click", function() {
    if (!currentTableName) return;
    setColumnConfig(currentTableName, null);
    delete tableColumnConfig[currentTableName];
    document.getElementById("column-chooser").style.display = "none";
    document.getElementById("column-chooser").setAttribute("aria-hidden", "true");
    applyColumnConfigAndRender();
  });
  document.getElementById("column-context-menu").querySelectorAll("button").forEach(function(btn) {
    btn.addEventListener("click", function() {
      var action = this.getAttribute("data-action");
      var key = columnContextMenuTargetKey;
      document.getElementById("column-context-menu").style.display = "none";
      document.getElementById("column-context-menu").setAttribute("aria-hidden", "true");
      if (!key || !currentTableName || !currentTableJson) return;
      var dataKeys = Object.keys(currentTableJson[0]);
      var config = ensureColumnConfig(currentTableName, dataKeys);
      if (action === "hide") {
        if (config.hidden.indexOf(key) < 0) config.hidden.push(key);
        setColumnConfig(currentTableName, config);
        applyColumnConfigAndRender();
      } else if (action === "pin") {
        if (config.pinned.indexOf(key) < 0) config.pinned.push(key);
        setColumnConfig(currentTableName, config);
        applyColumnConfigAndRender();
      } else if (action === "unpin") {
        config.pinned = config.pinned.filter(function(k) {
          return k !== key;
        });
        setColumnConfig(currentTableName, config);
        applyColumnConfigAndRender();
      }
    });
  });
  document.addEventListener("contextmenu", function(e) {
    var th = e.target.closest(".drift-table th");
    if (!th) {
      document.getElementById("column-context-menu").style.display = "none";
      return;
    }
    e.preventDefault();
    setColumnContextMenuTargetKey(th.getAttribute("data-column-key"));
    var menu = document.getElementById("column-context-menu");
    var config = getColumnConfig(currentTableName);
    var pinned = config && config.pinned && config.pinned.indexOf(columnContextMenuTargetKey) >= 0;
    menu.querySelector('[data-action="hide"]').style.display = "block";
    menu.querySelector('[data-action="pin"]').style.display = pinned ? "none" : "block";
    menu.querySelector('[data-action="unpin"]').style.display = pinned ? "block" : "none";
    menu.style.left = e.clientX + 2 + "px";
    menu.style.top = e.clientY + 2 + "px";
    menu.style.display = "block";
    menu.setAttribute("aria-hidden", "false");
  });
  document.addEventListener("click", function(e) {
    document.getElementById("column-context-menu").style.display = "none";
    document.getElementById("column-context-menu").setAttribute("aria-hidden", "true");
    var chooser = document.getElementById("column-chooser");
    if (chooser && chooser.style.display === "block" && !chooser.contains(
      /** @type {Node} */
      e.target
    ) && e.target.id !== "column-chooser-btn") {
      chooser.style.display = "none";
      chooser.setAttribute("aria-hidden", "true");
    }
  });
  document.addEventListener("dragstart", function(e) {
    var th = e.target.closest(".drift-table th");
    if (!th) return;
    setColumnDragKey(th.getAttribute("data-column-key"));
    if (!columnDragKey) return;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", columnDragKey);
    e.dataTransfer.setData("application/x-column-key", columnDragKey);
  });
  document.addEventListener("dragover", function(e) {
    var th = e.target.closest(".drift-table th");
    if (!th) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    document.querySelectorAll(".drift-table th.drag-over").forEach(function(el) {
      el.classList.remove("drag-over");
    });
    th.classList.add("drag-over");
  });
  document.addEventListener("dragleave", function(e) {
    if (e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest(".drift-table")) return;
    document.querySelectorAll(".drift-table th.drag-over").forEach(function(el) {
      el.classList.remove("drag-over");
    });
  });
  document.addEventListener("drop", function(e) {
    var th = e.target.closest(".drift-table th");
    if (!th) return;
    e.preventDefault();
    th.classList.remove("drag-over");
    var dropKey = th.getAttribute("data-column-key");
    var dragKey = e.dataTransfer.getData("application/x-column-key") || columnDragKey;
    if (!dragKey || !dropKey || dragKey === dropKey || !currentTableName || !currentTableJson) return;
    var dataKeys = Object.keys(currentTableJson[0]);
    var config = ensureColumnConfig(currentTableName, dataKeys);
    var visibleOrder = config.order.filter(function(k) {
      return config.hidden.indexOf(k) < 0;
    });
    var dragIdx = visibleOrder.indexOf(dragKey);
    var dropIdx = visibleOrder.indexOf(dropKey);
    if (dragIdx < 0 || dropIdx < 0) return;
    visibleOrder.splice(dragIdx, 1);
    visibleOrder.splice(dropIdx, 0, dragKey);
    config.order = visibleOrder.concat(config.order.filter(function(k) {
      return config.hidden.indexOf(k) >= 0;
    }));
    setColumnConfig(currentTableName, config);
    applyColumnConfigAndRender();
  });
  document.addEventListener("dragend", function(e) {
    if (e.target.closest(".drift-table th")) {
      document.querySelectorAll(".drift-table th.drag-over").forEach(function(el) {
        el.classList.remove("drag-over");
      });
    }
  });
  document.addEventListener("change", function(e) {
    var visCb = e.target.closest(".table-def-colvis");
    if (!visCb) return;
    var key = visCb.getAttribute("data-col-key");
    if (!key || !currentTableName || !currentTableJson || !currentTableJson.length) return;
    var dataKeys = Object.keys(currentTableJson[0]);
    var config = ensureColumnConfig(currentTableName, dataKeys);
    if (visCb.checked) {
      config.hidden = config.hidden.filter(function(k) {
        return k !== key;
      });
    } else if (config.hidden.indexOf(key) < 0) {
      config.hidden.push(key);
    }
    setColumnConfig(currentTableName, config);
    applyColumnConfigAndRender();
  });
  document.addEventListener("click", function(e) {
    var copyBtn = e.target.closest(".cell-copy-btn");
    if (copyBtn) {
      e.preventDefault();
      e.stopPropagation();
      copyCellValue(copyBtn.getAttribute("data-raw") || "");
      return;
    }
    var expandBtn = e.target.closest(".cell-expand-btn");
    if (expandBtn) {
      e.preventDefault();
      e.stopPropagation();
      var expandTd = expandBtn.closest(".drift-table td");
      var srcCopy = expandTd ? expandTd.querySelector(".cell-copy-btn") : null;
      var fullValue = srcCopy ? srcCopy.getAttribute("data-raw") || "" : "";
      var expandKey = expandTd ? expandTd.getAttribute("data-column-key") || "" : "";
      showCellValuePopup(fullValue, expandKey);
      return;
    }
    var link = e.target.closest(".fk-link");
    if (!link) return;
    e.preventDefault();
    navigateToFk(link.dataset.table, link.dataset.column, link.dataset.value);
  });
  document.addEventListener("dblclick", function(e) {
    var td = e.target.closest(".drift-table td");
    if (!td) return;
    if (driftWriteEnabled && !e.shiftKey && !td.querySelector("input.cell-inline-editor")) {
      e.preventDefault();
      e.stopPropagation();
      tryStartBrowserCellEdit(td);
      return;
    }
    var copyBtn = td.querySelector(".cell-copy-btn");
    var rawValue = copyBtn ? copyBtn.getAttribute("data-raw") || "" : (td.textContent || "").trim();
    var columnKey = td.getAttribute("data-column-key") || "";
    showCellValuePopup(rawValue, columnKey);
  });
  document.addEventListener("click", function(e) {
    var delBtn = (
      /** @type {HTMLButtonElement | null} */
      e.target.closest(".row-delete-btn")
    );
    if (!delBtn) return;
    if (!driftWriteEnabled || !currentTableName) return;
    var pkCol = delBtn.getAttribute("data-pk-col") || "";
    var pkRaw = delBtn.getAttribute("data-pk-raw") || "";
    if (!pkCol) return;
    var confirmed = window.confirm("Delete row where " + pkCol + " = " + pkRaw + "?");
    if (!confirmed) return;
    delBtn.disabled = true;
    var safeTable = currentTableName.replace(/"/g, '""');
    var safePkCol = pkCol.replace(/"/g, '""');
    var pkJson = JSON.stringify(jsonPkValueForCellUpdate(pkRaw, pkCol));
    var stmt = 'DELETE FROM "' + safeTable + '" WHERE "' + safePkCol + '" = ' + pkJson;
    fetch("/api/edits/apply", authOpts({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ statements: [stmt] })
    })).then(function(r) {
      return r.json().then(function(d) {
        return { ok: r.ok, data: d };
      });
    }).then(function(res) {
      if (!res.ok || !res.data || res.data.error) {
        var msg = res.data && res.data.error ? res.data.error : "Request failed";
        if (window.confirm("Delete failed: " + msg + "\n\nReload table data now? (Cancel keeps the current grid.)")) {
          loadTable(currentTableName);
        }
        delBtn.disabled = false;
        return;
      }
      loadTable(currentTableName);
    }).catch(function(err) {
      var em = err && err.message ? err.message : String(err);
      if (window.confirm("Delete failed: " + em + "\n\nReload table data now? (Cancel keeps the current grid.)")) {
        loadTable(currentTableName);
      }
      delBtn.disabled = false;
    });
  });
  setupCellValuePopupButtons();
  document.getElementById("chart-render").addEventListener("click", function() {
    var type = document.getElementById("chart-type").value;
    var xKey = document.getElementById("chart-x").value;
    var yKey = document.getElementById("chart-y").value;
    var titleInput = document.getElementById("chart-title-input");
    var title = titleInput ? titleInput.value : "";
    var container = document.getElementById("chart-svg-wrap");
    var rows = window._chartRows || [];
    if (type === "none" || rows.length === 0) {
      document.getElementById("chart-container").style.display = "none";
      setLastChartState(null);
      return;
    }
    var chartData = rows;
    if (rows.length > 500) {
      var nth = Math.ceil(rows.length / 500);
      chartData = rows.filter(function(_, i) {
        return i % nth === 0;
      });
    }
    var opts = { title, description: "", xLabel: xKey, yLabel: yKey };
    setLastChartState({ type, xKey, yKey, data: chartData, opts });
    if (type === "bar") renderBarChart(container, chartData, xKey, yKey, opts);
    else if (type === "stacked-bar") renderStackedBarChart(container, chartData, xKey, yKey, opts);
    else if (type === "pie") renderPieChart(container, chartData, xKey, yKey, opts);
    else if (type === "line") renderLineChart(container, chartData, xKey, yKey, opts);
    else if (type === "area") renderAreaChart(container, chartData, xKey, yKey, opts);
    else if (type === "scatter") renderScatterChart(container, chartData, xKey, yKey, opts);
    else if (type === "histogram") renderHistogram(container, chartData, yKey, 10, opts);
  });
  document.getElementById("chart-export-png").addEventListener("click", exportChartPng);
  document.getElementById("chart-export-svg").addEventListener("click", exportChartSvg);
  document.getElementById("chart-export-copy").addEventListener("click", exportChartCopy);
  setupChartResize();
  initConnectionDeps({
    applyHealthWriteFlag,
    pollGeneration
  });
  console.log("[SDA] app.js: initConnectionDeps wired");
  console.log("[SDA] app.js: fetching /api/change-detection");
  fetch("/api/change-detection", authOpts()).then(function(r) {
    return r.json();
  }).then(function(data) {
    setPollingEnabled(data.changeDetection !== false);
    console.log("[SDA] app.js: change-detection initial state: polling=" + pollingEnabled);
    updateLiveIndicatorForConnection();
  }).catch(function() {
  });
  setTimeout(function() {
    if (window.mastheadStatus) {
      window.mastheadStatus.onToggle = function() {
        if (connectionState !== "connected") return;
        window.mastheadStatus.setBusy();
        var newState = !pollingEnabled;
        console.log("[SDA] onToggle: requesting polling=" + newState);
        var opts = authOpts();
        fetch("/api/change-detection", Object.assign({}, opts, {
          method: "POST",
          headers: Object.assign(
            { "Content-Type": "application/json" },
            opts.headers || {}
          ),
          body: JSON.stringify({ enabled: newState })
        })).then(function(r) {
          return r.json();
        }).then(function(data) {
          setPollingEnabled(data.changeDetection !== false);
          console.log("[SDA] onToggle: server confirmed polling=" + pollingEnabled);
        }).catch(function(e) {
          console.error("[SDA] onToggle: failed to toggle polling:", e);
        }).finally(function() {
          updateLiveIndicatorForConnection();
          if (!pollingEnabled && connectionState === "connected") {
            startKeepAlive();
          } else {
            stopKeepAlive();
          }
        });
      };
      console.log("[SDA] app.js: onToggle wired to mastheadStatus");
    } else {
      console.warn("[SDA] app.js: window.mastheadStatus not available for onToggle wiring");
    }
  }, 0);
  console.log("[SDA] app.js: fetching /api/tables");
  fetch("/api/tables", authOpts()).then((r) => r.json()).then((data) => {
    const loadingEl = document.getElementById("tables-loading");
    if (loadingEl) {
      loadingEl.style.display = "none";
      loadingEl.setAttribute("aria-busy", "false");
    }
    var tables = applyTableListAndCounts(data);
    console.log("[SDA] app.js: /api/tables OK, " + tables.length + " tables \u2014 starting pollGeneration");
    pollGeneration();
    var restoredTable = loadNavHistory();
    if (navHistory.length > 0) {
      var originalLength = navHistory.length;
      for (var i = 0; i < navHistory.length; i++) {
        if (tables.indexOf(navHistory[i].table) < 0) {
          navHistory.length = i;
          break;
        }
      }
      if (navHistory.length !== originalLength) {
        saveNavHistory();
      }
    }
    var hash = "";
    if (location.hash && location.hash.length > 1) {
      try {
        hash = decodeURIComponent(location.hash.slice(1));
      } catch (e) {
      }
    }
    if (hash && tables.indexOf(hash) >= 0) {
      openTableTab(hash);
    } else if (restoredTable && tables.indexOf(restoredTable) >= 0 && navHistory.length > 0) {
      openTableTab(restoredTable);
    }
    if (navHistory.length > 0) {
      renderBreadcrumb();
    }
  }).catch((e) => {
    console.log("[SDA] app.js: /api/tables FAILED", e);
    var wrap = document.getElementById("tables-loading");
    if (!wrap) return;
    var sk = wrap.querySelector(".tables-skeleton");
    var errEl = document.getElementById("tables-loading-error");
    if (sk) sk.style.display = "none";
    wrap.setAttribute("aria-busy", "false");
    if (errEl) {
      errEl.hidden = false;
      errEl.textContent = "Failed to load tables: " + e;
    }
  });
  console.log("[SDA] app.js: fetching /api/health for version");
  fetch("/api/health", authOpts()).then(function(r) {
    return r.json();
  }).then(function(d) {
    console.log("[SDA] app.js: /api/health OK, version=" + (d.version || "?"));
    applyHealthWriteFlag(d);
    if (d.version) {
      var badge = document.getElementById("version-badge");
      badge.textContent = "v" + d.version;
      badge.title = "v" + d.version + " \u2014 View changelog";
      badge.style.opacity = "1";
    }
  }).catch(function() {
  });
  var shareBtn = document.getElementById("tb-share-btn");
  if (shareBtn) shareBtn.addEventListener("click", createShareSession);
  restoreSession();

  // assets/web/toolbar.ts
  function initToolbar() {
    var toolbar = document.getElementById("toolbar-bar");
    if (toolbar) {
      try {
        if (localStorage.getItem(TOOLBAR_LABELS_KEY) === "1") {
          toolbar.classList.add("tb-labeled");
        }
      } catch (e) {
      }
      toolbar.addEventListener("click", function(e) {
        var hitButton = e.target.closest(".tb-icon-btn, .tb-flyout");
        if (hitButton) return;
        var labeled = toolbar.classList.toggle("tb-labeled");
        try {
          localStorage.setItem(TOOLBAR_LABELS_KEY, labeled ? "1" : "0");
        } catch (e2) {
        }
      });
    }
    document.querySelectorAll(".tb-icon-btn[data-tool]").forEach(function(btn) {
      var toolId = btn.getAttribute("data-tool");
      if (toolId) {
        btn.addEventListener("click", function() {
          openTool(toolId);
        });
      }
    });
    window._toolbarSyncActiveTab = function(tabId) {
      document.querySelectorAll(".tb-icon-btn[data-tool]").forEach(function(btn) {
        var isActive = btn.getAttribute("data-tool") === tabId;
        btn.classList.toggle("active", isActive);
      });
    };
    var maskBtn = document.getElementById("tb-mask-toggle");
    var maskCb = document.getElementById("tb-mask-checkbox");
    if (maskBtn && maskCb) {
      maskBtn.addEventListener("click", function() {
        maskCb.checked = !maskCb.checked;
        maskCb.dispatchEvent(new Event("change"));
        maskBtn.setAttribute("aria-pressed", maskCb.checked ? "true" : "false");
      });
    }
    var themeTrigger = document.getElementById("tb-theme-trigger");
    var themeFlyout = document.getElementById("tb-theme-flyout");
    if (themeTrigger && themeFlyout) {
      themeTrigger.addEventListener("click", function(e) {
        e.stopPropagation();
        var isOpen = themeTrigger.getAttribute("aria-expanded") === "true";
        themeTrigger.setAttribute("aria-expanded", isOpen ? "false" : "true");
      });
      themeFlyout.querySelectorAll(".tb-theme-option").forEach(function(btn) {
        btn.addEventListener("click", function() {
          var chosen = btn.getAttribute("data-theme");
          if (chosen) {
            localStorage.setItem(THEME_KEY, chosen);
            applyTheme(chosen);
            themeTrigger.setAttribute("aria-expanded", "false");
          }
        });
      });
      document.addEventListener("click", function(e) {
        if (themeTrigger.getAttribute("aria-expanded") === "true") {
          var wrap = document.getElementById("tb-theme-wrap");
          if (wrap && !wrap.contains(e.target)) {
            themeTrigger.setAttribute("aria-expanded", "false");
          }
        }
      });
      document.addEventListener("keydown", function(e) {
        if (e.key === "Escape" && themeTrigger.getAttribute("aria-expanded") === "true") {
          themeTrigger.setAttribute("aria-expanded", "false");
          themeTrigger.focus();
        }
      });
    }
    var activeTab = document.querySelector(".tab-btn.active");
    if (activeTab) {
      var activeToolId = activeTab.getAttribute("data-tab");
      document.querySelectorAll(".tb-icon-btn[data-tool]").forEach(function(btn) {
        btn.classList.toggle("active", btn.getAttribute("data-tool") === activeToolId);
      });
    }
  }

  // assets/web/table-def-toggle.ts
  function initTableDefToggle() {
    const style = document.createElement("style");
    style.textContent = "/* table-def-toggle \u2014 collapsible table definition styles */\n.table-definition-heading {\n  cursor: pointer;\n  user-select: none;\n  color: var(--link);\n  font-size: 0.875rem;\n  padding: 0.25rem 0;\n}\n.table-definition-heading:hover .table-definition-heading-label { text-decoration: underline; }\n.td-collapsed .table-definition-scroll { display: none; }\n";
    document.head.appendChild(style);
    document.addEventListener("click", (e) => {
      const target = e.target;
      const heading = target.closest && target.closest(".table-definition-heading");
      if (!heading) return;
      if (target.closest && target.closest(".table-def-tool")) return;
      const wrap = heading.closest(".table-definition-wrap");
      if (!wrap) return;
      wrap.classList.toggle("td-collapsed");
    });
    const existing = document.querySelectorAll(".table-definition-wrap");
    for (let i = 0; i < existing.length; i++) {
      existing[i].classList.add("td-collapsed");
    }
  }

  // assets/web/table-def-meta.ts
  function quoteIdent(name) {
    return '"' + String(name).replace(/"/g, '""') + '"';
  }
  function isBlobLikeType(rawType) {
    return /BLOB|BINARY/.test((rawType || "").toUpperCase());
  }
  function isTextLikeType(rawType) {
    return /CHAR|TEXT|CLOB|STRING/.test((rawType || "").toUpperCase());
  }
  async function buildStatsForTable(tableName) {
    const t = schemaTableByName2(tableName);
    if (!t || !t.columns || t.columns.length === 0) return {};
    const selects = ['COUNT(*) AS "__total__"'];
    t.columns.forEach(function(c, i) {
      const col = quoteIdent(c.name);
      const rawType = c.type != null ? String(c.type) : "";
      selects.push("COUNT(" + col + ') AS "c' + i + '__nn"');
      selects.push("COUNT(DISTINCT " + col + ') AS "c' + i + '__d"');
      selects.push("SUM(LENGTH(" + col + ')) AS "c' + i + '__bytes"');
      if (!isBlobLikeType(rawType)) {
        selects.push("MIN(" + col + ') AS "c' + i + '__min"');
        selects.push("MAX(" + col + ') AS "c' + i + '__max"');
      }
      if (isTextLikeType(rawType)) {
        selects.push("SUM(CASE WHEN " + col + ` = '' THEN 1 ELSE 0 END) AS "c` + i + '__blank"');
      }
    });
    const sql = "SELECT " + selects.join(", ") + " FROM " + quoteIdent(tableName);
    const resp = await fetch("/api/sql", authOpts({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql })
    }));
    const data = await resp.json();
    if (!resp.ok) throw new Error(data && data.error ? data.error : vt("viewer.table.def.statsQueryFailed"));
    const row = data.rows && data.rows[0] || {};
    const total = Number(row["__total__"]) || 0;
    const out = { __total__: total };
    t.columns.forEach(function(c, i) {
      const nn = Number(row["c" + i + "__nn"]) || 0;
      out[c.name] = {
        total,
        nonnull: nn,
        nulls: total - nn,
        distinct: Number(row["c" + i + "__d"]) || 0,
        bytes: row["c" + i + "__bytes"] != null ? Number(row["c" + i + "__bytes"]) : null,
        min: row["c" + i + "__min"] != null ? row["c" + i + "__min"] : null,
        max: row["c" + i + "__max"] != null ? row["c" + i + "__max"] : null,
        blank: row["c" + i + "__blank"] != null ? Number(row["c" + i + "__blank"]) : null
      };
    });
    return out;
  }
  function driftColumnFor(rawType) {
    const t = (rawType || "").toUpperCase();
    if (/INT/.test(t)) return { columnType: "IntColumn", builder: "integer" };
    if (/BOOL/.test(t)) return { columnType: "BoolColumn", builder: "boolean" };
    if (/REAL|FLOA|DOUB|NUMERIC|DECIMAL/.test(t)) return { columnType: "RealColumn", builder: "real" };
    if (/BLOB|BINARY/.test(t)) return { columnType: "BlobColumn", builder: "blob" };
    if (/DATE|TIME/.test(t)) return { columnType: "DateTimeColumn", builder: "dateTime" };
    return { columnType: "TextColumn", builder: "text" };
  }
  function pascalCase(name) {
    return String(name).split(/[^a-zA-Z0-9]+/).filter(Boolean).map(function(p) {
      return p.charAt(0).toUpperCase() + p.slice(1);
    }).join("") || "Table";
  }
  function camelCase(name) {
    const pascal = pascalCase(name);
    const camel = pascal.charAt(0).toLowerCase() + pascal.slice(1);
    return /^[0-9]/.test(camel) ? "c" + camel : camel;
  }
  function fkForColumn(tableName, colName) {
    const cachedFks = fkMetaCache[tableName] || [];
    for (let i = 0; i < cachedFks.length; i++) {
      if (cachedFks[i].fromColumn === colName) return cachedFks[i];
    }
    return null;
  }
  function buildDefinitionJson(tableName) {
    const t = schemaTableByName2(tableName);
    if (!t || !t.columns) return "{}";
    const stats = tableDefStats[tableName];
    const columns = t.columns.map(function(c) {
      const fk = fkForColumn(tableName, c.name);
      const entry = {
        name: c.name,
        type: c.type != null ? String(c.type) : "",
        primaryKey: !!c.pk,
        notNull: !!c.notnull,
        foreignKey: fk ? { table: fk.toTable, column: fk.toColumn } : null
      };
      if (stats && stats[c.name]) entry.stats = stats[c.name];
      return entry;
    });
    const doc = { table: tableName, columns };
    if (stats && stats.__total__ != null) doc.rowCount = stats.__total__;
    return JSON.stringify(doc, null, 2);
  }
  function buildFlutterDrift(tableName) {
    const t = schemaTableByName2(tableName);
    if (!t || !t.columns) return "// No columns for " + tableName;
    const className = pascalCase(tableName);
    const pkCols = t.columns.filter(function(c) {
      return !!c.pk;
    });
    const singleIntAutoInc = pkCols.length === 1 && /INT/.test(String(pkCols[0].type || "").toUpperCase());
    const lines = [];
    lines.push("class " + className + " extends Table {");
    t.columns.forEach(function(c) {
      const drift = driftColumnFor(c.type != null ? String(c.type) : "");
      let chain = drift.builder + "()";
      if (c.pk && singleIntAutoInc) {
        chain = drift.builder + "().autoIncrement()";
      } else if (!c.notnull && !c.pk) {
        chain = drift.builder + "().nullable()";
      }
      lines.push("  " + drift.columnType + " get " + camelCase(c.name) + " => " + chain + "();");
    });
    if (pkCols.length > 0 && !singleIntAutoInc) {
      const set = pkCols.map(function(c) {
        return camelCase(c.name);
      }).join(", ");
      lines.push("");
      lines.push("  @override");
      lines.push("  Set<Column> get primaryKey => {" + set + "};");
    }
    lines.push("}");
    return lines.join("\n");
  }
  function copyToClipboard(text, toastMessage) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function() {
        showCopyToast(toastMessage);
      }).catch(function() {
      });
    }
  }
  function rerenderPanel(wrap, tableName, expand) {
    const tmp = document.createElement("div");
    tmp.innerHTML = buildTableDefinitionHtml(tableName);
    const fresh = tmp.firstElementChild;
    if (!fresh) return;
    if (expand) fresh.classList.remove("td-collapsed");
    wrap.replaceWith(fresh);
  }
  function initTableDefMeta() {
    document.addEventListener("click", function(e) {
      const target = e.target;
      const btn = target && target.closest && target.closest(".table-def-tool");
      if (!btn) return;
      e.stopPropagation();
      e.preventDefault();
      const wrap = btn.closest(".table-definition-wrap");
      if (!wrap) return;
      const tableName = wrap.getAttribute("data-table-name") || currentTableName || "";
      if (!tableName) return;
      const action = btn.getAttribute("data-tdm-action");
      if (action === "copy-json") {
        copyToClipboard(buildDefinitionJson(tableName), vt("viewer.table.def.copiedJson"));
        return;
      }
      if (action === "copy-flutter") {
        copyToClipboard(buildFlutterDrift(tableName), vt("viewer.table.def.copiedFlutter"));
        return;
      }
      if (action === "toggle-meta") {
        const turningOn = !tableDefMetaOn;
        if (!turningOn) {
          setTableDefMetaOn(false);
          rerenderPanel(wrap, tableName, false);
          return;
        }
        setTableDefMetaOn(true);
        if (tableDefStats[tableName]) {
          rerenderPanel(wrap, tableName, true);
          return;
        }
        btn.classList.add("is-busy");
        buildStatsForTable(tableName).then(function(stats) {
          tableDefStats[tableName] = stats;
          const live = document.querySelector(
            '.table-definition-wrap[data-table-name="' + cssAttrEscape(tableName) + '"]'
          ) || wrap;
          rerenderPanel(live, tableName, true);
        }).catch(function(err) {
          setTableDefMetaOn(false);
          btn.classList.remove("is-busy");
          showCopyToast(vt("viewer.table.def.statsFailed", err && err.message ? err.message : vt("viewer.table.def.errorGeneric")));
        });
      }
    });
  }
  function cssAttrEscape(v) {
    return String(v).replace(/["\\]/g, "\\$&");
  }

  // assets/web/index.js
  console.log("[SDA] index.js bridge: initWebL10n()");
  initWebL10n();
  console.log("[SDA] index.js bridge: setting window.sqlHighlight");
  window.sqlHighlight = highlightSql;
  console.log("[SDA] index.js bridge: calling initMasthead()");
  var api = initMasthead();
  console.log("[SDA] index.js bridge: initMasthead returned " + (api ? "API object" : "null"));
  if (api) window.mastheadStatus = api;
  console.log("[SDA] index.js bridge: calling initToolbar()");
  initToolbar();
  console.log("[SDA] index.js bridge: calling initTableDefToggle()");
  initTableDefToggle();
  console.log("[SDA] index.js bridge: calling initTableDefMeta()");
  initTableDefMeta();
  console.log("[SDA] index.js bridge: calling initSettings()");
  initSettings();
  console.log("[SDA] index.js bridge: init complete");
})();
