/**
 * Host-panel English source strings — Compare / diff panel family. Plan 75 §3.1.
 *
 * Covers the row comparator ([../comparator/comparator-html.ts](../comparator/comparator-html.ts)),
 * the compare-rows form ([../comparator/compare-form-html.ts](../comparator/compare-form-html.ts)),
 * the database comparison report ([../compare/compare-html.ts](../compare/compare-html.ts)),
 * the analysis-history compare view ([../analysis-history/analysis-compare-html.ts](../analysis-history/analysis-compare-html.ts)),
 * and the branch manager ([../branching/branch-html.ts](../branching/branch-html.ts)).
 *
 * One registry slice per panel family (see `HOST_STRING_REGISTRIES` in
 * [../l10n.ts](../l10n.ts)). Each entry maps a SYMBOLIC KEY → its ENGLISH text;
 * the panel's HTML builder resolves the key via `t()` so the string reaches the
 * translation pipeline instead of shipping English in every locale.
 *
 * Runtime values (row counts, table names, timestamps, diffs) are passed as
 * `{0}`/`{1}` tokens, never concatenated English — `vscode.l10n.t()` substitutes
 * them so a translator can reorder the sentence. Table/column names, numeric
 * fractions, and signed diff numbers are data rendered from the report objects
 * directly, not catalog strings.
 */

/** Symbolic key → English source text for the compare/diff panel family. */
export const stringsPanelCompare: Record<string, string> = {
  // --- Row comparator (comparator-html.ts) ---
  // {0} = label of dataset A, {1} = label of dataset B (e.g. "Row 12 vs Row 7").
  'panel.compare.comparator.heading': '{0} vs {1}',
  'panel.compare.comparator.th.column': 'Column',
  // {0} = count of matching columns.
  'panel.compare.comparator.summary.same': '{0} same',
  // {0} = count of differing columns.
  'panel.compare.comparator.summary.different': '{0} different',
  // {0} = count of columns present only in dataset A.
  'panel.compare.comparator.summary.onlyA': '{0} only in A',
  // {0} = count of columns present only in dataset B.
  'panel.compare.comparator.summary.onlyB': '{0} only in B',
  'panel.compare.comparator.btn.swap': 'Swap A/B',
  'panel.compare.comparator.btn.copyJson': 'Copy as JSON',
  // Rendered for a SQL NULL cell value; <em> emphasis is static markup kept inline.
  'panel.compare.comparator.value.null': 'NULL',

  // --- Compare-rows form (compare-form-html.ts) ---
  'panel.compare.form.title': 'Compare Rows',
  'panel.compare.form.rowA': 'Row A',
  'panel.compare.form.rowB': 'Row B',
  'panel.compare.form.field.table': 'Table',
  'panel.compare.form.field.pk': 'Primary Key Value',
  'panel.compare.form.pk.placeholder': 'Enter primary key value',
  'panel.compare.form.pk.required': 'Primary key is required',
  'panel.compare.form.compareWith': 'Compare with',
  'panel.compare.form.scope.same': 'Same table',
  'panel.compare.form.scope.different': 'Different table',
  'panel.compare.form.btn.compare': 'Compare',
  'panel.compare.form.btn.cancel': 'Cancel',

  // --- Database comparison report (compare-html.ts) ---
  'panel.compare.db.title': 'Database Comparison',
  'panel.compare.db.badge.match': 'Schema Match',
  'panel.compare.db.badge.differs': 'Schema Differs',
  'panel.compare.db.schemaDiff': 'Schema Diff',
  'panel.compare.db.databaseA': 'Database A',
  'panel.compare.db.databaseB': 'Database B',
  // {0} = count of tables present only in database A.
  'panel.compare.db.onlyInA': 'Only in A ({0})',
  // {0} = count of tables present only in database B.
  'panel.compare.db.onlyInB': 'Only in B ({0})',
  'panel.compare.db.rowCounts': 'Row Counts',
  'panel.compare.db.empty': 'No shared tables to compare.',
  'panel.compare.db.th.table': 'Table',
  'panel.compare.db.th.a': 'A',
  'panel.compare.db.th.b': 'B',
  'panel.compare.db.th.diff': 'Diff',
  // {0} = generation timestamp.
  'panel.compare.db.generated': 'Generated {0}',
  'panel.compare.db.btn.copyReport': 'Copy as JSON',
  'panel.compare.db.btn.copyMigrationSql': 'Copy Migration SQL',

  // --- Analysis-history compare view (analysis-compare-html.ts) ---
  // {0} = analysis title being compared (e.g. "Compare: Query results").
  'panel.compare.history.title': 'Compare: {0}',
  'panel.compare.history.before': 'Before:',
  'panel.compare.history.after': 'After:',
  // Dropdown placeholder option; em dashes are static decoration kept inline.
  'panel.compare.history.select': '— select —',
  'panel.compare.history.current': 'Current result',
  'panel.compare.history.summary': 'Select Before and After to compare.',
  'panel.compare.history.col.before': 'Before',
  'panel.compare.history.col.after': 'After',
  'panel.compare.history.placeholder': 'Select a snapshot above.',

  // --- Analysis-history compare view: client-script strings (resolved in-browser
  //     via the __VT bridge, since the panel's compareResult handler rebuilds the
  //     column labels and placeholders client-side after the host posts back). ---
  'panel.compare.history.client.before': 'Before',
  'panel.compare.history.client.after': 'After',
  'panel.compare.history.client.selectSnapshot': 'Select a snapshot above.',
  'panel.compare.history.client.selectToCompare': 'Select Before and After to compare.',

  // --- Branch manager (branch-html.ts) ---
  'panel.compare.branch.title': 'Data Branches',
  'panel.compare.branch.btn.new': '+ New Branch',
  'panel.compare.branch.empty':
    'No branches yet. Capture the current database state as a branch to experiment safely.',
  // Tooltip on the truncation marker shown when a branch hit the per-table row cap.
  'panel.compare.branch.truncated.title': 'At least one table hit the row cap',
  // Standalone "(truncated)" marker appended after a branch's row stats.
  'panel.compare.branch.truncated.label': '(truncated)',
  // {0} = capture timestamp, {1} = table count, {2} = formatted total row count.
  'panel.compare.branch.meta': 'Captured {0} — {1} tables, {2} rows',
  'panel.compare.branch.btn.diff': 'Diff vs Now',
  'panel.compare.branch.btn.merge': 'Generate Merge SQL',
  'panel.compare.branch.btn.restore': 'Restore',
  'panel.compare.branch.btn.delete': 'Delete',
  // The back-arrow (&larr;) is static markup kept at the call site; only the label is translated.
  'panel.compare.branch.btn.back': 'Back to branches',
  // {0} = source branch label, {1} = target branch label. The → arrow is a symbol
  // (not English markup) and is safe to keep in the value for translators.
  'panel.compare.branch.diff.heading': 'Diff: {0} → {1}',
  // {0} = inserted-row count.
  'panel.compare.branch.summary.inserted': '{0} inserted',
  // {0} = changed-row count.
  'panel.compare.branch.summary.changed': '{0} changed',
  // {0} = deleted-row count.
  'panel.compare.branch.summary.deleted': '{0} deleted',
  'panel.compare.branch.diff.empty':
    'No differences between this branch and the current database.',
  // {0} = inserted-row count for one table (e.g. "+3 inserted").
  'panel.compare.branch.table.inserted': '+{0} inserted',
  // {0} = changed-row count for one table (e.g. "~2 changed").
  'panel.compare.branch.table.changed': '~{0} changed',
  // {0} = deleted-row count for one table (e.g. "-1 deleted").
  'panel.compare.branch.table.deleted': '-{0} deleted',
};
