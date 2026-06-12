/**
 * HTML template for the Query Cost Analysis webview panel.
 * Uses VS Code theme CSS variables for light/dark support.
 */

import type {
  IParsedPlan,
  IPlanNode,
  IPlanWarning,
  IIndexSuggestion,
  IPerformanceSummary,
} from './query-cost-types';
import { getQueryCostCss } from './query-cost-styles';
import { t } from '../l10n';

function esc(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function nodeClass(node: IPlanNode): string {
  if (node.isFullScan) return 'node-scan';
  switch (node.operation) {
    case 'search': return 'node-search';
    case 'scan': return 'node-scan';
    case 'use_temp_btree': return 'node-temp';
    default: return 'node-other';
  }
}

function nodeBadge(node: IPlanNode): string {
  if (node.isFullScan) return t('panel.query.cost.badge.fullScan');
  switch (node.operation) {
    case 'search': return t('panel.query.cost.badge.index');
    case 'use_temp_btree': return t('panel.query.cost.badge.temp');
    default: return '';
  }
}

function renderNode(node: IPlanNode): string {
  const cls = nodeClass(node);
  const badge = nodeBadge(node);
  const badgeHtml = badge
    ? ` <span class="badge ${cls}">${badge}</span>`
    : '';
  const tableInfo = node.table ? ` <span class="table-name">${esc(node.table)}</span>` : '';
  const indexInfo = node.index ? ` <span class="index-name">${t('panel.query.cost.node.via', esc(node.index))}</span>` : '';
  const children = node.children.map((c) => renderNode(c)).join('\n');
  return `<div class="node ${cls}">
  <div class="node-detail">${esc(node.detail)}${badgeHtml}${tableInfo}${indexInfo}</div>
  ${children}
</div>`;
}

function renderWarnings(warnings: IPlanWarning[]): string {
  if (warnings.length === 0) return '';
  const items = warnings
    .map((w) => {
      const icon = w.severity === 'warning' ? '&#9888;' : '&#8505;';
      const cls = w.severity === 'warning' ? 'warn-warning' : 'warn-info';
      return `<div class="warning ${cls}">
  <span class="warn-icon">${icon}</span>
  <span class="warn-msg">${esc(w.message)}</span>
  ${w.suggestion ? `<span class="warn-suggestion">${esc(w.suggestion)}</span>` : ''}
</div>`;
    })
    .join('\n');
  return `<h3>${t('panel.query.cost.section.warnings')}</h3>\n${items}`;
}

function renderSummary(summary: IPerformanceSummary): string {
  // Count-driven labels: pick the singular key when the count is exactly 1, else plural;
  // the count is passed as {0} so a translator controls word order, not concatenation.
  const scanText = summary.scanCount === 1
    ? t('panel.query.cost.summary.scans.one', summary.scanCount)
    : t('panel.query.cost.summary.scans.many', summary.scanCount);
  const indexText = summary.indexCount === 1
    ? t('panel.query.cost.summary.indexes.one', summary.indexCount)
    : t('panel.query.cost.summary.indexes.many', summary.indexCount);
  const tempText = summary.tempBTreeCount === 1
    ? t('panel.query.cost.summary.temp.one', summary.tempBTreeCount)
    : t('panel.query.cost.summary.temp.many', summary.tempBTreeCount);
  const opsText = summary.totalNodes === 1
    ? t('panel.query.cost.summary.ops.one', summary.totalNodes)
    : t('panel.query.cost.summary.ops.many', summary.totalNodes);
  return `<h3>${t('panel.query.cost.section.summary')}</h3>
<div class="summary">
  <div class="summary-item ${summary.scanCount > 0 ? 'summary-bad' : 'summary-good'}">
    ${summary.scanCount > 0 ? '&#9888;' : '&#10003;'}
    ${scanText}
  </div>
  <div class="summary-item summary-good">
    &#10003; ${indexText}
  </div>
  ${summary.tempBTreeCount > 0
    ? `<div class="summary-item summary-info">
    &#8505; ${tempText}
  </div>`
    : ''}
  <div class="summary-item summary-neutral">
    ${opsText}
  </div>
</div>`;
}

function renderSuggestions(suggestions: IIndexSuggestion[]): string {
  if (suggestions.length === 0) return '';
  const items = suggestions
    .map(
      (s, i) => `<div class="suggestion">
  <div class="suggestion-header">
    <span class="suggestion-impact impact-${s.impact}">${esc(s.impact.toUpperCase())}</span>
    <span class="suggestion-reason">${esc(s.reason)}</span>
  </div>
  <code class="suggestion-sql">${esc(s.sql)}</code>
  <div class="suggestion-actions">
    <button class="copy-btn" data-action="copySuggestion" data-index="${i}">${t('panel.query.cost.suggestion.copy')}</button>
    <button class="run-btn" data-action="runSuggestion" data-index="${i}">${t('panel.query.cost.suggestion.run')}</button>
  </div>
</div>`,
    )
    .join('\n');
  return `<h3>${t('panel.query.cost.section.suggestions')}</h3>\n${items}`;
}

/** Build self-contained HTML for the query cost analysis panel. */
export function buildQueryCostHtml(
  sql: string,
  plan: IParsedPlan,
  suggestions: IIndexSuggestion[],
): string {
  const tree = plan.nodes.map((n) => renderNode(n)).join('\n');
  const warningsHtml = renderWarnings(plan.warnings);
  const summaryHtml = renderSummary(plan.summary);
  const suggestionsHtml = renderSuggestions(suggestions);

  const body = `
<h2>${t('panel.query.cost.title')}</h2>
<div class="toolbar">
  <button class="copy-btn" data-action="copySql">${t('panel.query.cost.btn.copySql')}</button>
  <button class="copy-btn" data-action="copyPlan">${t('panel.query.cost.btn.copyPlan')}</button>
  <button class="copy-btn" data-action="reanalyze">${t('panel.query.cost.btn.reanalyze')}</button>
</div>
<div class="sql-block"><code>${esc(sql)}</code></div>
<h3>${t('panel.query.cost.section.executionPlan')}</h3>
<div class="tree">${tree}</div>
${warningsHtml}
${summaryHtml}
${suggestionsHtml}`;

  return wrapHtml(body);
}

/** Build a text representation of the plan tree for clipboard. */
export function buildPlanText(
  nodes: IPlanNode[],
  indent: string = '',
): string {
  return nodes
    .map((n) => {
      const line = `${indent}${n.detail}`;
      const childText = buildPlanText(n.children, indent + '  ');
      return childText ? `${line}\n${childText}` : line;
    })
    .join('\n');
}

function wrapHtml(body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
${getQueryCostCss()}
</style>
</head>
<body>
${body}
<script>
  var vscode = acquireVsCodeApi();
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var action = btn.dataset.action;
    var index = btn.dataset.index;
    vscode.postMessage({
      command: action,
      index: index !== undefined ? Number(index) : undefined,
    });
  });
</script>
</body>
</html>`;
}
