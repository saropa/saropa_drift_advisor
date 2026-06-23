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
<style>
  body {
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    margin: 0;
    padding: 16px 20px 32px;
  }
  .header { margin-bottom: 16px; }
  .header h1 { margin: 0 0 4px; font-size: 18px; }
  .subtitle { margin: 0 0 8px; font-size: 12px; opacity: 0.75; max-width: 70ch; }
  .summary { font-size: 12px; opacity: 0.85; }
  .toolbar {
    display: flex;
    gap: 8px;
    align-items: center;
    margin: 14px 0 18px;
    flex-wrap: wrap;
  }
  .search {
    flex: 1 1 240px;
    min-width: 180px;
    padding: 5px 10px;
    font-size: 12px;
    color: var(--vscode-input-foreground);
    background: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border, var(--vscode-widget-border));
    border-radius: 3px;
  }
  .btn {
    padding: 5px 12px;
    border: 1px solid var(--vscode-button-border, var(--vscode-widget-border));
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border-radius: 3px;
    cursor: pointer;
    font-size: 12px;
    white-space: nowrap;
  }
  .btn:hover { opacity: 0.9; }
  .btn-secondary {
    background: var(--vscode-button-secondaryBackground, transparent);
    color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
  }
  .category { margin-bottom: 22px; }
  .category-header {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    opacity: 0.8;
    margin: 0 0 6px;
    border-bottom: 1px solid var(--vscode-widget-border);
    padding-bottom: 4px;
  }
  .category-count {
    font-size: 11px;
    font-weight: 600;
    padding: 0 6px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--accent-warning) 20%, transparent);
    color: var(--accent-warning);
  }
  .rules-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .rules-table th {
    text-align: left;
    font-weight: 600;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    opacity: 0.6;
    padding: 4px 10px;
  }
  .rules-table td {
    padding: 7px 10px;
    border-bottom: 1px solid var(--vscode-widget-border);
    vertical-align: top;
  }
  .th-enabled, .enabled-cell { width: 56px; text-align: center; }
  .enabled-cell { text-align: center; }
  .th-count, .count-cell { width: 70px; }
  .th-sev, .sev-cell { width: 180px; }
  .rule-code { font-family: var(--vscode-editor-font-family, monospace); font-weight: 600; }
  .rule-desc { opacity: 0.7; margin-top: 2px; line-height: 1.4; }
  .rule-disabled .rule-code,
  .rule-disabled .rule-desc { opacity: 0.4; }
  .count { display: inline-block; min-width: 18px; text-align: center; font-weight: 600; }
  .count-warn { color: var(--accent-warning); }
  .count-zero { opacity: 0.4; }
  .sev-select {
    width: 100%;
    padding: 3px 6px;
    font-size: 12px;
    color: var(--vscode-dropdown-foreground);
    background: var(--vscode-dropdown-background);
    border: 1px solid var(--vscode-dropdown-border, var(--vscode-widget-border));
    border-radius: 3px;
  }
  .rule-disabled .sev-select { opacity: 0.5; }
  .empty { padding: 32px; text-align: center; opacity: 0.6; }
  .hidden { display: none; }
</style>
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

<script nonce="__CSP_NONCE__">
  const vscode = acquireVsCodeApi();

  // Enable/disable checkbox → toggleRule. The host writes disabledRules and
  // re-renders, so the checked state always reflects persisted config.
  document.addEventListener('change', (e) => {
    const toggle = e.target.closest('.rule-toggle');
    if (toggle) {
      vscode.postMessage({
        command: 'toggleRule',
        code: toggle.dataset.code,
        disabled: !toggle.checked,
      });
      return;
    }
    const sev = e.target.closest('.sev-select');
    if (sev) {
      vscode.postMessage({
        command: 'setSeverity',
        code: sev.dataset.code,
        severity: sev.value,
      });
    }
  });

  // Toolbar buttons.
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (btn) {
      vscode.postMessage({ command: btn.dataset.action });
    }
  });

  // Client-side filter: hide non-matching rows and any category left with no
  // visible rows, then toggle the empty-state notice.
  const search = document.getElementById('search');
  const emptyState = document.getElementById('emptyState');
  search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    let anyVisible = false;
    document.querySelectorAll('.category').forEach((cat) => {
      let catVisible = false;
      cat.querySelectorAll('.rule-row').forEach((row) => {
        const match = !q || row.dataset.text.indexOf(q) !== -1;
        row.classList.toggle('hidden', !match);
        if (match) catVisible = true;
      });
      cat.classList.toggle('hidden', !catVisible);
      if (catVisible) anyVisible = true;
    });
    emptyState.classList.toggle('hidden', anyVisible);
  });
</script>
</body>
</html>`;
}
