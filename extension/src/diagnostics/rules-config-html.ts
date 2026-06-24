/**
 * HTML for the Drift Advisor Rules configuration webview.
 *
 * Replaces the old sidebar tree list with a single screen where each diagnostic
 * rule can be enabled/disabled and given a severity override. The builder is
 * pure (no `vscode` import) so it stays unit-testable and matches the other
 * `*-html.ts` panel builders; the host panel collects the live data model and
 * passes it in, then handles the `toggleRule` / `setSeverity` / `rerun` /
 * `enableAll` / `resetSeverities` messages posted back.
 *
 * Severity values are the four string tokens the `driftViewer.diagnostics.severityOverrides`
 * setting accepts (`error` / `warning` / `info` / `hint`); the empty string means
 * "no override — use the rule's built-in default".
 */

import { t } from '../l10n';
import { escapeHtml } from '../shared-utils';
import type { DiagnosticCategory } from './diagnostic-types';
import { RULES_CONFIG_CLIENT_SCRIPT } from './rules-config-client';
import { RULES_CONFIG_STYLES } from './rules-config-styles';

/** The override tokens a rule's severity dropdown can emit; '' = use default. */
export type RuleSeverityValue = '' | 'error' | 'warning' | 'info' | 'hint';

/** One rule row in the panel's data model. */
export interface RuleRowModel {
  /** Rule code identifier, e.g. 'no-primary-key'. */
  code: string;
  /** Human description (the rule's message template) for the row + search. */
  description: string;
  /** Live finding count from the last analysis cycle. */
  count: number;
  /** Whether the rule is currently muted (`disabledRules` contains it). */
  disabled: boolean;
  /** Current severity override token, or '' when the default applies. */
  severity: RuleSeverityValue;
  /** Translated label for the rule's built-in default severity (dropdown hint). */
  defaultSeverityLabel: string;
}

/** A category group of rule rows. */
export interface RuleCategoryModel {
  category: DiagnosticCategory;
  label: string;
  rules: RuleRowModel[];
}

const esc = escapeHtml;

/** The selectable severity options, in display order. */
const SEVERITY_OPTIONS: Array<{ value: RuleSeverityValue; key: string }> = [
  { value: 'error', key: 'panel.rules.severity.error' },
  { value: 'warning', key: 'panel.rules.severity.warning' },
  { value: 'info', key: 'panel.rules.severity.info' },
  { value: 'hint', key: 'panel.rules.severity.hint' },
];

/** Build the per-rule severity `<select>` with the current override selected. */
function severitySelect(row: RuleRowModel): string {
  // First option is "Default (<built-in severity>)" — selecting it clears the
  // override. The remaining options force a specific severity.
  const defaultLabel = t('panel.rules.severity.default', row.defaultSeverityLabel);
  const options = [
    `<option value=""${row.severity === '' ? ' selected' : ''}>${esc(defaultLabel)}</option>`,
    ...SEVERITY_OPTIONS.map(
      (o) =>
        `<option value="${o.value}"${row.severity === o.value ? ' selected' : ''}>${esc(t(o.key))}</option>`,
    ),
  ].join('');
  return `<select class="sev-select" data-code="${esc(row.code)}" aria-label="${esc(t('panel.rules.col.severity'))}">${options}</select>`;
}

/** Build one rule row. */
function ruleRow(row: RuleRowModel): string {
  const countCell =
    row.count > 0
      ? `<span class="count count-warn">${row.count}</span>`
      : `<span class="count count-zero">0</span>`;

  // `data-text` carries lowercased code + description so the client-side filter
  // can match either without re-reading the DOM cells.
  const searchText = `${row.code} ${row.description}`.toLowerCase();

  return `<tr class="rule-row${row.disabled ? ' rule-disabled' : ''}" data-text="${esc(searchText)}">
    <td class="enabled-cell">
      <input type="checkbox" class="rule-toggle" data-code="${esc(row.code)}"${row.disabled ? '' : ' checked'} aria-label="${esc(t('panel.rules.col.enabled'))}">
    </td>
    <td class="rule-cell">
      <div class="rule-code">${esc(row.code)}</div>
      <div class="rule-desc">${esc(row.description)}</div>
    </td>
    <td class="count-cell">${countCell}</td>
    <td class="sev-cell">${severitySelect(row)}</td>
  </tr>`;
}

/** Build one category section with its header and rule table. */
function categorySection(group: RuleCategoryModel): string {
  const total = group.rules.reduce((sum, r) => sum + r.count, 0);
  const rows = group.rules.map(ruleRow).join('\n');
  return `<section class="category" data-category="${esc(group.category)}">
    <h2 class="category-header">
      <span>${esc(group.label)}</span>
      ${total > 0 ? `<span class="category-count">${total}</span>` : ''}
    </h2>
    <table class="rules-table">
      <thead>
        <tr>
          <th class="th-enabled">${esc(t('panel.rules.col.enabled'))}</th>
          <th>${esc(t('panel.rules.col.rule'))}</th>
          <th class="th-count">${esc(t('panel.rules.col.findings'))}</th>
          <th class="th-sev">${esc(t('panel.rules.col.severity'))}</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  </section>`;
}

/**
 * Build the full Drift Advisor Rules panel document. [categories] are the
 * grouped rule rows (already sorted by the host); [enabledCount]/[disabledCount]
 * drive the summary line so the header stays accurate after a toggle re-render.
 */
export function buildRulesConfigHtml(
  categories: RuleCategoryModel[],
  enabledCount: number,
  disabledCount: number,
): string {
  const totalRules = enabledCount + disabledCount;
  const sections = categories.map(categorySection).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>${RULES_CONFIG_STYLES}</style>
</head>
<body>
<div class="header">
  <h1>${esc(t('panel.rules.title'))}</h1>
  <p class="subtitle">${esc(t('panel.rules.subtitle'))}</p>
  <div class="summary" id="summary">${esc(t('panel.rules.summary', totalRules, enabledCount, disabledCount))}</div>
</div>

<div class="toolbar">
  <input type="text" class="search" id="search" placeholder="${esc(t('panel.rules.search.placeholder'))}">
  <button class="btn btn-secondary" data-action="enableAll">${esc(t('panel.rules.btn.enableAll'))}</button>
  <button class="btn btn-secondary" data-action="resetSeverities">${esc(t('panel.rules.btn.resetSeverities'))}</button>
  <button class="btn" data-action="rerun">${esc(t('panel.rules.btn.rerun'))}</button>
</div>

<div id="rules">
  ${sections}
</div>
<div class="empty hidden" id="emptyState">${esc(t('panel.rules.empty'))}</div>

<script nonce="__CSP_NONCE__">${RULES_CONFIG_CLIENT_SCRIPT}</script>
</body>
</html>`;
}
