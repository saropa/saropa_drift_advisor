/**
 * Host-panel English source strings — the Drift Advisor Rules configuration
 * panel ([../diagnostics/rules-config-html.ts](../diagnostics/rules-config-html.ts)).
 * This webview replaces the old "Drift Advisor Rules" sidebar tree list: it lets
 * a user enable/disable each diagnostic rule and override its severity in one
 * screen, writing `driftViewer.diagnostics.disabledRules` and
 * `driftViewer.diagnostics.severityOverrides`.
 *
 * One registry slice per panel family (see `HOST_STRING_REGISTRIES` in
 * [../l10n.ts](../l10n.ts)). Each entry maps a SYMBOLIC KEY → its ENGLISH text;
 * the panel's HTML builder resolves the key via `t()` so the string reaches the
 * translation pipeline instead of shipping English in every locale.
 *
 * Runtime values (rule counts, the default-severity name) are passed as `{0}`
 * tokens, never concatenated English, so a translator can reorder the sentence.
 * Rule codes (`no-primary-key`), severity data values, and codicon glyphs are
 * rendered from the data directly and are not translated.
 */

/** Symbolic key → English source text for the Drift Advisor Rules panel. */
export const stringsPanelRules: Record<string, string> = {
  'panel.rules.title': 'Drift Advisor Rules',
  // Sub-heading under the title explaining where the changes are persisted.
  'panel.rules.subtitle':
    'Enable or disable each diagnostic rule and override its severity. Changes are saved to your workspace settings and applied on the next analysis.',
  // {0} = total rule count, {1} = enabled count, {2} = disabled count.
  'panel.rules.summary': '{0} rules — {1} enabled, {2} disabled',
  'panel.rules.search.placeholder': 'Filter rules by code or description…',
  'panel.rules.btn.rerun': 'Re-run Analysis',
  'panel.rules.btn.enableAll': 'Enable All',
  'panel.rules.btn.resetSeverities': 'Reset Severities',
  'panel.rules.col.enabled': 'Enabled',
  'panel.rules.col.rule': 'Rule',
  'panel.rules.col.findings': 'Findings',
  'panel.rules.col.severity': 'Severity',
  'panel.rules.empty': 'No rules match your filter.',
  // {0} = the rule's built-in default severity name (e.g. "Warning"), shown as
  // the first option in the per-rule severity dropdown.
  'panel.rules.severity.default': 'Default ({0})',
  'panel.rules.severity.error': 'Error',
  'panel.rules.severity.warning': 'Warning',
  'panel.rules.severity.info': 'Info',
  'panel.rules.severity.hint': 'Hint',
  // Category group headers.
  'panel.rules.category.schema': 'Schema',
  'panel.rules.category.performance': 'Performance',
  'panel.rules.category.dataQuality': 'Data Quality',
  'panel.rules.category.bestPractices': 'Best Practices',
  'panel.rules.category.naming': 'Naming',
  'panel.rules.category.runtime': 'Runtime',
  'panel.rules.category.compliance': 'Compliance',
};
