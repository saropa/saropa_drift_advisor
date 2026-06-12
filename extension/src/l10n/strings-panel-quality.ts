/**
 * Host-panel English source strings — schema-quality panel family: Anomalies
 * ([../health/anomalies-html.ts](../health/anomalies-html.ts)), Index Suggestions
 * ([../health/index-suggestions-html.ts](../health/index-suggestions-html.ts)),
 * Schema Refactoring ([../refactoring/refactoring-html.ts](../refactoring/refactoring-html.ts)),
 * Data Invariants ([../invariants/invariant-html.ts](../invariants/invariant-html.ts)),
 * and Row Impact Analysis ([../impact/impact-html.ts](../impact/impact-html.ts)). Plan 75 §3.1.
 *
 * One registry slice per panel family (see `HOST_STRING_REGISTRIES` in
 * [../l10n.ts](../l10n.ts)). Each entry maps a SYMBOLIC KEY → its ENGLISH text;
 * the panel's HTML builder resolves the key via `t()` so the string reaches the
 * translation pipeline instead of shipping English in every locale.
 *
 * Runtime values (counts, table/column names, SQL, timestamps) are passed as
 * `{0}`/`{1}` tokens, never concatenated English — `vscode.l10n.t()` substitutes
 * them so a translator can reorder the sentence. Singular/plural row and table
 * variants get their own keys (Rule 6) rather than branching on hardcoded English.
 * Codicon glyphs (`$(shield)` etc.), severity/priority data values, SQL, and
 * grades stay rendered from the data directly.
 *
 * Strings inside a panel's client `<script>` block are NOT here — those run in the
 * webview without host `t()` and are left in place with a `TODO(l10n)` marker for
 * the `__VT` bridge pass (plan 75 §3.3).
 */

/** Symbolic key → English source text for the schema-quality panel family. */
export const stringsPanelQuality: Record<string, string> = {
  // --- Anomalies panel ---
  'panel.quality.anomalies.empty': 'No anomalies found.',
  'panel.quality.anomalies.title': 'Anomalies',
  'panel.quality.anomalies.btn.refresh': 'Refresh',
  'panel.quality.anomalies.btn.saveSnapshot': 'Save Snapshot',
  'panel.quality.anomalies.btn.compare': 'Compare',
  // {0} = history snapshot count, shown only when > 0 (e.g. "Compare (3)").
  'panel.quality.anomalies.btn.compareCount': 'Compare ({0})',
  'panel.quality.anomalies.btn.generateFixes': 'Generate Fix SQL',
  'panel.quality.anomalies.btn.bulkEdit': 'Bulk edit table…',
  // title= tooltip on the bulk-edit button.
  'panel.quality.anomalies.btn.bulkEdit.title':
    'Pick a single-PK table and open the bulk edit dashboard',
  // {0} = total anomaly count (e.g. "All (12)").
  'panel.quality.anomalies.filter.all': 'All ({0})',
  // Leading icon is static markup kept at the call site; {0} = matching count.
  'panel.quality.anomalies.filter.errors': 'Errors ({0})',
  'panel.quality.anomalies.filter.warnings': 'Warnings ({0})',
  'panel.quality.anomalies.filter.info': 'Info ({0})',
  'panel.quality.anomalies.th.severity': 'Severity',
  'panel.quality.anomalies.th.message': 'Message',

  // --- Index Suggestions panel ---
  'panel.quality.index.empty': 'No missing indexes detected.',
  'panel.quality.index.title': 'Index Suggestions',
  'panel.quality.index.btn.copySelected': 'Copy Selected SQL',
  'panel.quality.index.btn.copyAll': 'Copy All SQL',
  'panel.quality.index.btn.exportAnalysis': 'Export Analysis',
  'panel.quality.index.btn.saveSnapshot': 'Save Snapshot',
  'panel.quality.index.btn.compare': 'Compare',
  // {0} = history snapshot count, shown only when > 0.
  'panel.quality.index.btn.compareCount': 'Compare ({0})',
  'panel.quality.index.btn.createAll': 'Create All Indexes',
  // {0} = count of suggestions.
  'panel.quality.index.summary': '{0} missing index(es) detected',
  'panel.quality.index.th.table': 'Table',
  'panel.quality.index.th.column': 'Column',
  'panel.quality.index.th.priority': 'Priority',
  'panel.quality.index.th.reason': 'Reason',
  'panel.quality.index.th.sql': 'SQL',
  // title= tooltip on the select-all header checkbox.
  'panel.quality.index.selectAll.title': 'Select all',
  // Per-row copy-SQL button label + its title= tooltip.
  'panel.quality.index.row.copy': 'Copy',
  'panel.quality.index.row.copy.title': 'Copy SQL',

  // --- Refactoring panel (rendered HTML shell only; client-script strings stay in <script>) ---
  'panel.quality.refactor.title': 'Schema refactoring suggestions',
  'panel.quality.refactor.subtitle':
    'Advisory analysis only — generated SQL is not executed automatically. Review and adapt before applying.',
  'panel.quality.refactor.btn.analyze': 'Analyze schema',
  'panel.quality.refactor.riskOnly': 'High migration risk only',
  'panel.quality.refactor.btn.migration': 'Open migration preview',
  'panel.quality.refactor.btn.genMigration': 'Generate migration (Dart)',
  'panel.quality.refactor.btn.schemaDiff': 'Schema diff',
  'panel.quality.refactor.btn.diagram': 'Open schema diagram',

  // --- Invariants panel ---
  'panel.quality.invariants.title': 'Data Invariants',
  'panel.quality.invariants.btn.addRule': '+ Add Rule',
  'panel.quality.invariants.btn.runAll': 'Run All',
  'panel.quality.invariants.summary.passing': 'Passing',
  'panel.quality.invariants.summary.failing': 'Failing',
  'panel.quality.invariants.summary.total': 'Total',
  'panel.quality.invariants.summary.lastCheck': 'Last Check',
  // Empty state. The codicon glyph $(shield) is static markup at the call site.
  'panel.quality.invariants.empty.title': 'No invariants defined',
  'panel.quality.invariants.empty.body':
    'Data invariants help ensure your database maintains consistency.',
  // "Add Rule" is the button's own label; quoting it here keeps the hint a single
  // reorderable sentence rather than concatenating around the label.
  'panel.quality.invariants.empty.cta':
    'Click "Add Rule" to create your first invariant check.',
  // {0} = caught error message (already escaped at the call site).
  'panel.quality.invariants.result.error': 'Error: {0}',
  // {0} = check time, {1} = duration in ms. PASS branch of a checked invariant.
  'panel.quality.invariants.result.pass': 'PASS — checked {0} ({1}ms)',
  // {0} = pre-wrapped row count phrase, {1} = check time. FAIL branch.
  'panel.quality.invariants.result.fail': 'FAIL ({0}) — checked {1}',
  // Singular/plural row-count phrase embedded into the FAIL line above.
  'panel.quality.invariants.result.rowOne': '1 row',
  // {0} = violation count (> 1).
  'panel.quality.invariants.result.rowMany': '{0} rows',
  'panel.quality.invariants.result.pending': 'Not yet checked',
  'panel.quality.invariants.result.disabled': 'Disabled',
  // toggle button title= tooltip variants (enabled → "Disable", disabled → "Enable").
  'panel.quality.invariants.action.disable': 'Disable',
  'panel.quality.invariants.action.enable': 'Enable',
  // icon-button title= tooltips.
  'panel.quality.invariants.action.run': 'Run Check',
  'panel.quality.invariants.action.edit': 'Edit',
  'panel.quality.invariants.action.remove': 'Remove',
  // Expectation line variants (zero_rows vs at-least-one).
  'panel.quality.invariants.expect.label': 'Expect: {0}',
  'panel.quality.invariants.expect.zeroRows': '0 rows (no violations)',
  'panel.quality.invariants.expect.atLeastOne': 'At least 1 row',

  // --- Row Impact Analysis panel ---
  // {0} = "table.pkColumn = pkValue" root identifier built (escaped) at call site.
  'panel.quality.impact.title': 'Row Impact Analysis — {0}',
  'panel.quality.impact.outbound.heading': 'This row depends on (outbound FKs)',
  'panel.quality.impact.outbound.empty':
    'No outbound dependencies (this row has no FK columns pointing elsewhere).',
  'panel.quality.impact.inbound.heading': 'Rows that depend on this (inbound FKs)',
  'panel.quality.impact.inbound.empty':
    'No inbound dependents (no other rows reference this row).',
  // {0} = FK column name, prefixed by static "via " markup at the call site.
  'panel.quality.impact.via': 'via {0}',
  // {0} = count of rows actually shown when a branch is truncated.
  'panel.quality.impact.truncated': '[showing {0}]',
  'panel.quality.impact.summary.heading': 'Cascade Delete Impact',
  // Singular/plural row-count cells in the cascade summary table.
  'panel.quality.impact.summary.rowOne': '{0} row',
  'panel.quality.impact.summary.rowMany': '{0} rows',
  'panel.quality.impact.summary.total': 'TOTAL',
  // {0} = total rows, {1} = total tables (already singular/plural-wrapped). Grand
  // total line of the cascade table.
  'panel.quality.impact.summary.totalLine': '{0} rows across {1}',
  // table-count singular/plural fragment for {1} above.
  'panel.quality.impact.summary.tableOne': '{0} table',
  'panel.quality.impact.summary.tableMany': '{0} tables',
  // branch summary "(N row[s])" count fragment.
  'panel.quality.impact.branch.countOne': '{0} row',
  'panel.quality.impact.branch.countMany': '{0} rows',
  'panel.quality.impact.btn.generateDelete': 'Generate DELETE SQL',
  'panel.quality.impact.btn.exportJson': 'Export JSON',
  'panel.quality.impact.btn.refresh': 'Refresh',

  // --- impact: client-script strings (resolved in-browser via the __VT bridge,
  //     since the panel's message handler renders these client-side). {0} carries
  //     the caught error message — never English concatenation. ---
  'panel.quality.impact.client.analyzing': 'Analyzing impact…',
  // {0} = error message text received from the host.
  'panel.quality.impact.client.error': 'Error: {0}',

  // --- refactor: client-script strings (resolved in-browser via the __VT bridge,
  //     since the suggestion list / plan render client-side). {0}/{1} carry counts,
  //     names and error text — never English concatenation, so a translator can
  //     reorder the sentence. Singular/plural and step variants get their own keys. ---
  'panel.quality.refactor.client.filter.empty':
    'No suggestions match the current filter. Try Analyze or clear filters.',
  // {0} = confidence value formatted to 2 decimals (data, passed as a token).
  'panel.quality.refactor.client.badge.confidence': 'confidence {0}',
  // {0} = migration-risk level (data value: low/medium/high).
  'panel.quality.refactor.client.badge.risk': 'risk {0}',
  // {0} = severity level (data value).
  'panel.quality.refactor.client.badge.severity': 'severity {0}',
  'panel.quality.refactor.client.topValues': 'Top values',
  'panel.quality.refactor.client.btn.viewPlan': 'View plan',
  'panel.quality.refactor.client.btn.migAppend': 'Migration preview + plan',
  'panel.quality.refactor.client.btn.erFocus': 'ER: focus table',
  'panel.quality.refactor.client.btn.nlPrefill': 'Ask in English…',
  'panel.quality.refactor.client.btn.dismiss': 'Dismiss',
  // {0} = analyzed table count, {1} = suggestion count.
  'panel.quality.refactor.client.status.analyzing': 'Analyzing…',
  'panel.quality.refactor.client.status.analyzed': 'Analyzed {0} tables — {1} suggestions.',
  'panel.quality.refactor.client.empty.fallback': 'No suggestions.',
  'panel.quality.refactor.client.error.unknown': 'Unknown error',
  // Plan step badges (reversible flag + destructive marker).
  'panel.quality.refactor.client.step.reversible': 'reversible',
  'panel.quality.refactor.client.step.notReversible': 'not reversible',
  'panel.quality.refactor.client.step.destructive': 'destructive',
  // {0} = 1-based step number, {1} = step title. Step heading prefix.
  'panel.quality.refactor.client.step.heading': 'Step {0}: {1}',
  // {0} = suggestion title. Migration-plan section heading.
  'panel.quality.refactor.client.plan.heading': 'Migration plan — {0}',
  'panel.quality.refactor.client.btn.copySql': 'Copy all SQL',
  'panel.quality.refactor.client.btn.copyDart': 'Copy Dart snippet',
  'panel.quality.refactor.client.btn.copyDrift': 'Copy Drift table class',
  // External-hint banner. {0} = table name, {1} = optional ".column" suffix.
  'panel.quality.refactor.client.hint.table': 'Table: {0}{1}',
  'panel.quality.refactor.client.hint.titleFallback': 'External hint',
  'panel.quality.refactor.client.hint.dismiss': 'Dismiss hint',
  'panel.quality.refactor.client.hint.runAnalyze': 'Run full analyze',
};
