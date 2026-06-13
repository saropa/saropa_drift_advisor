/**
 * Host-panel English source strings — query / SQL tooling panel family:
 * Visual Query Builder ([../query-builder/query-builder-html.ts](../query-builder/query-builder-html.ts)),
 * Query Cost Analysis ([../query-cost/query-cost-html.ts](../query-cost/query-cost-html.ts)),
 * Explain Query Plan ([../explain/explain-html.ts](../explain/explain-html.ts)),
 * SQL Notebook ([../sql-notebook/sql-notebook-html.ts](../sql-notebook/sql-notebook-html.ts)),
 * Constraint Wizard ([../constraint-wizard/constraint-wizard-html.ts](../constraint-wizard/constraint-wizard-html.ts)).
 * Plan 75 §3.1.
 *
 * One registry slice per panel family (see `HOST_STRING_REGISTRIES` in
 * [../l10n.ts](../l10n.ts)). Each entry maps a SYMBOLIC KEY → its ENGLISH text;
 * the panel's HTML builder resolves the key via `t()` so the string reaches the
 * translation pipeline instead of shipping English in every locale.
 *
 * Runtime values (counts, table names, column lists, violation rows) are passed
 * as `{0}`/`{1}` tokens, never concatenated English — `vscode.l10n.t()` substitutes
 * them so a translator can reorder the sentence. SQL keywords/operators rendered as
 * `<option>` values (INNER, LEFT, LIKE, `=`, IS NULL …) are SQL syntax/data, not
 * prose, and stay literal at the call site. Strings inside the panels' embedded
 * `<script>` client blocks are deferred (System B client pass) and marked with
 * `// TODO(l10n): client-script string` in place.
 */

/** Symbolic key → English source text for the query / SQL tooling panels. */
export const stringsPanelQuery: Record<string, string> = {
  // --- Query Builder: left column (build controls) ---
  'panel.query.builder.addTable.title': 'Add Table',
  'panel.query.builder.addTable.btn': 'Add Table Instance',
  'panel.query.builder.addTable.hint':
    'Add the same base table multiple times for self-joins.',
  'panel.query.builder.joins.title': 'Joins',
  'panel.query.builder.joins.add': '+ Join',
  'panel.query.builder.filter.title': 'Filter',
  'panel.query.builder.filter.add': '+ Filter',
  // Placeholder shown in the filter value input; "a,b,c" illustrates IN-list syntax.
  'panel.query.builder.filter.valuePlaceholder': 'value or a,b,c for IN',
  'panel.query.builder.groupBy.title': 'GROUP BY',
  'panel.query.builder.groupBy.add': '+ GROUP BY',
  'panel.query.builder.orderBy.title': 'ORDER BY',
  'panel.query.builder.orderBy.add': '+ ORDER BY',

  // --- Query Builder: right column (preview / run) ---
  'panel.query.builder.instances.title': 'Table Instances / Selected Columns',
  'panel.query.builder.sqlPreview.title': 'SQL Preview',
  'panel.query.builder.limit.label': 'Limit',
  'panel.query.builder.btn.run': 'Run Query',
  'panel.query.builder.btn.copySql': 'Copy SQL',
  'panel.query.builder.btn.openNotebook': 'Open in Notebook',
  'panel.query.builder.btn.saveSnippet': 'Save as Snippet',
  'panel.query.builder.btn.analyzeCost': 'Analyze Cost',
  'panel.query.builder.btn.addDashboard': 'Add to Dashboard',

  // --- Query Cost: chrome / toolbar ---
  'panel.query.cost.title': 'Query Cost Analysis',
  'panel.query.cost.btn.copySql': 'Copy SQL',
  'panel.query.cost.btn.copyPlan': 'Copy Plan',
  'panel.query.cost.btn.reanalyze': 'Re-analyze',
  'panel.query.cost.section.executionPlan': 'Execution Plan',
  'panel.query.cost.section.warnings': 'Warnings',
  'panel.query.cost.section.summary': 'Performance Summary',
  'panel.query.cost.section.suggestions': 'Suggestions',
  // Plan-node status badges describing how a table is accessed (data category labels).
  'panel.query.cost.badge.fullScan': 'FULL SCAN',
  'panel.query.cost.badge.index': 'INDEX',
  'panel.query.cost.badge.temp': 'TEMP',
  // {0} = index name a plan node uses; rendered inline after the node detail.
  'panel.query.cost.node.via': 'via {0}',
  'panel.query.cost.suggestion.copy': 'Copy',
  'panel.query.cost.suggestion.run': 'Run',

  // --- Query Cost: performance summary (count-driven, singular/plural variants) ---
  // {0} = number of full table scans (singular form, count === 1).
  'panel.query.cost.summary.scans.one': '{0} full table scan',
  // {0} = number of full table scans (plural form, count !== 1).
  'panel.query.cost.summary.scans.many': '{0} full table scans',
  // {0} = number of indexes used (singular form).
  'panel.query.cost.summary.indexes.one': '{0} index used',
  // {0} = number of indexes used (plural form).
  'panel.query.cost.summary.indexes.many': '{0} indexes used',
  // {0} = number of temporary sorts (singular form).
  'panel.query.cost.summary.temp.one': '{0} temporary sort',
  // {0} = number of temporary sorts (plural form).
  'panel.query.cost.summary.temp.many': '{0} temporary sorts',
  // {0} = total operation count (singular form).
  'panel.query.cost.summary.ops.one': '{0} total operation',
  // {0} = total operation count (plural form).
  'panel.query.cost.summary.ops.many': '{0} total operations',

  // --- Explain Query Plan ---
  'panel.query.explain.title': 'Query Plan',
  // Plan-node status badges describing how a table is accessed (data category labels).
  'panel.query.explain.badge.index': 'INDEX',
  'panel.query.explain.badge.fullScan': 'FULL SCAN',
  'panel.query.explain.badge.temp': 'TEMP',
  'panel.query.explain.btn.copySql': 'Copy SQL',
  'panel.query.explain.btn.copyPlan': 'Copy Plan',
  'panel.query.explain.section.suggestions': 'Index Suggestions',
  'panel.query.explain.suggestion.copy': 'Copy',
  // Cross-tool section: findings from sibling Saropa tools (Lints, Log Capture)
  // that relate to the tables/SQL in this plan (plan 67 R3). The per-finding
  // text is the sibling's own already-localized title/detail, so only this
  // heading needs translating here.
  'panel.query.explain.section.suiteRelated': 'Related Saropa Suite Findings',

  // --- SQL Notebook ---
  'panel.query.notebook.tab.new': 'New query tab',
  // Placeholder inside the SQL editor textarea; the parenthetical names the run shortcut.
  'panel.query.notebook.sql.placeholder': 'Enter SQL... (Ctrl+Enter to execute)',
  'panel.query.notebook.btn.run': 'Run',
  'panel.query.notebook.btn.run.title': 'Execute (Ctrl+Enter)',
  'panel.query.notebook.btn.explain': 'Explain',
  'panel.query.notebook.btn.explain.title': 'Explain query plan',
  'panel.query.notebook.btn.ask': 'Ask in English…',
  // Tooltip warns the natural-language-to-SQL feature uses an LLM and needs an API key.
  'panel.query.notebook.btn.ask.title':
    'Generate SQL from plain English (LLM; requires API key)',
  'panel.query.notebook.btn.chart': 'Chart',
  'panel.query.notebook.btn.chart.title': 'Chart results',
  'panel.query.notebook.btn.copyJson': 'Copy JSON',
  'panel.query.notebook.btn.copyJson.title': 'Copy as JSON',
  'panel.query.notebook.btn.copyCsv': 'Copy CSV',
  'panel.query.notebook.btn.copyCsv.title': 'Copy as CSV',
  // Initial status-bar text before any query has run.
  'panel.query.notebook.status.ready': 'Ready',
  'panel.query.notebook.history.title': 'History',
  'panel.query.notebook.history.clear': 'Clear',
  'panel.query.notebook.history.clear.title': 'Clear all history',
  'panel.query.notebook.history.searchPlaceholder': 'Search history...',

  // --- Constraint Wizard: chrome / sections ---
  // {0} = the table name the wizard is editing; em dash separates title from table.
  'panel.query.constraint.title': 'Constraint Wizard — {0}',
  'panel.query.constraint.existing.title': 'Existing Constraints',
  // Shown when a table has no primary key or foreign keys to list.
  'panel.query.constraint.existing.none': 'None',
  // {0} = comma-separated primary-key column list (pre-escaped at the call site).
  'panel.query.constraint.existing.pk': '✓ PRIMARY KEY ({0})',
  // {0} = FK source column; {1} = referenced table.column (both pre-escaped).
  'panel.query.constraint.existing.fk': '✓ FK {0} → {1}',
  'panel.query.constraint.design.title': 'Design New Constraints',
  'panel.query.constraint.design.add': '+ Add',
  // Empty state when the user has not drafted any constraints yet.
  'panel.query.constraint.drafts.none': 'No constraints designed yet.',

  // --- Constraint Wizard: add menu / card kinds ---
  'panel.query.constraint.kind.unique': 'UNIQUE',
  'panel.query.constraint.kind.check': 'CHECK',
  'panel.query.constraint.kind.notNull': 'NOT NULL',
  'panel.query.constraint.card.remove': 'Remove',
  'panel.query.constraint.card.test': 'Test',

  // --- Constraint Wizard: draft inputs ---
  'panel.query.constraint.input.columns': 'Column(s):',
  'panel.query.constraint.input.column': 'Column:',
  'panel.query.constraint.input.expression': 'Expression:',
  // Placeholder showing an example CHECK expression.
  'panel.query.constraint.input.expressionPlaceholder': 'age >= 0 AND age <= 150',

  // --- Constraint Wizard: test status ---
  'panel.query.constraint.status.notTested': 'Not tested',
  'panel.query.constraint.status.ok': '✓ 0 violations found',
  // {0} = violation count when the constraint test fails.
  'panel.query.constraint.status.violations': '⚠ {0} violation(s) found',
  // {0} = primary-key value of the offending row; {1} = its column=value pairs.
  'panel.query.constraint.violation.row': 'PK {0}: {1}',

  // --- Constraint Wizard: footer actions ---
  'panel.query.constraint.btn.testAll': 'Test All',
  'panel.query.constraint.btn.generateDart': 'Generate Dart',
  'panel.query.constraint.btn.generateSql': 'Generate SQL',
};
