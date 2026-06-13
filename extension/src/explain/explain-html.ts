/**
 * HTML template for the Explain Query Plan webview panel.
 * Uses VS Code theme CSS variables for light/dark support.
 */

import type { IExplainNode } from './explain-panel';
import type { IndexSuggestion } from '../api-client';
import type { SuiteDiagnostic } from '../suite/suite-diagnostics';
import { t } from '../l10n';

/** Human label for a sibling tool's machine source token (brand names, kept as-is). */
function suiteSourceLabel(source: string | undefined): string {
  switch (source) {
    case 'lints': return 'Saropa Lints';
    case 'log-capture': return 'Saropa Log Capture';
    case 'advisor': return 'Saropa Drift Advisor';
    default: return source ?? 'Saropa Suite';
  }
}

function esc(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function scanClass(node: IExplainNode): string {
  switch (node.scanType) {
    case 'search': return 'node-search';
    case 'scan': return 'node-scan';
    case 'temp': return 'node-temp';
    default: return 'node-other';
  }
}

function scanLabel(node: IExplainNode): string {
  switch (node.scanType) {
    case 'search': return t('panel.query.explain.badge.index');
    case 'scan': return t('panel.query.explain.badge.fullScan');
    case 'temp': return t('panel.query.explain.badge.temp');
    default: return '';
  }
}

function renderNode(node: IExplainNode): string {
  const cls = scanClass(node);
  const badge = scanLabel(node);
  const badgeHtml = badge
    ? ` <span class="badge ${cls}">${badge}</span>`
    : '';
  const children = node.children
    .map((c) => renderNode(c))
    .join('\n');
  return `<div class="node ${cls}">
  <div class="node-detail">${esc(node.detail)}${badgeHtml}</div>
  ${children}
</div>`;
}

function renderSuggestions(suggestions: IndexSuggestion[]): string {
  if (suggestions.length === 0) return '';
  const items = suggestions
    .map(
      (s, i) =>
        `<div class="suggestion">
  <span class="suggestion-reason">${esc(s.reason)}</span>
  <code>${esc(s.sql)}</code>
  <button class="copy-btn" data-action="copySuggestion" data-index="${i}">${t('panel.query.explain.suggestion.copy')}</button>
</div>`,
    )
    .join('\n');
  return `<h3>${t('panel.query.explain.section.suggestions')}</h3>\n${items}`;
}

/**
 * Render the cross-tool "Related Saropa Suite Findings" section (plan 67 R3).
 * Each row shows the producing tool, the finding's own already-localized title
 * (and optional detail), and its rule id when present. The title/detail are
 * passthrough data from the sibling — never re-translated here.
 */
function renderSuiteNotes(notes: SuiteDiagnostic[]): string {
  if (notes.length === 0) return '';
  const items = notes
    .map((n) => {
      const src = esc(suiteSourceLabel(n.source));
      const title = esc(n.title ?? n.detail ?? n.ruleId ?? '');
      const detail = n.detail && n.detail !== n.title
        ? `<span class="suite-detail">${esc(n.detail)}</span>`
        : '';
      const rule = n.ruleId
        ? `<code class="suite-rule">${esc(n.ruleId)}</code>`
        : '';
      const sev = esc(n.severity ?? 'info');
      return `<div class="suite-note suite-${sev}">
  <span class="suite-src">${src}</span>
  <span class="suite-title">${title}</span>
  ${detail}
  ${rule}
</div>`;
    })
    .join('\n');
  return `<h3>${t('panel.query.explain.section.suiteRelated')}</h3>\n${items}`;
}

/** Build self-contained HTML for the explain query plan panel. */
export function buildExplainHtml(
  sql: string,
  nodes: IExplainNode[],
  suggestions: IndexSuggestion[],
  suiteNotes: SuiteDiagnostic[] = [],
): string {
  const tree = nodes.map((n) => renderNode(n)).join('\n');
  const suggestionsHtml = renderSuggestions(suggestions);
  const suiteHtml = renderSuiteNotes(suiteNotes);

  const body = `
<h2>${t('panel.query.explain.title')}</h2>
<div class="toolbar">
  <button class="copy-btn" data-action="copySql">${t('panel.query.explain.btn.copySql')}</button>
  <button class="copy-btn" data-action="copyPlan">${t('panel.query.explain.btn.copyPlan')}</button>
</div>
<div class="sql-block"><code>${esc(sql)}</code></div>
<div class="tree">${tree}</div>
${suggestionsHtml}
${suiteHtml}`;

  return wrapHtml(body);
}

/** Build a text representation of the plan tree for clipboard. */
export function buildPlanText(
  nodes: IExplainNode[],
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
  body {
    font-family: var(--vscode-font-family, sans-serif);
    color: var(--vscode-editor-foreground, #ccc);
    background: var(--vscode-editor-background, #1e1e1e);
    padding: 16px;
    line-height: 1.4;
  }
  h2 { margin-top: 0; }
  h3 { margin-top: 20px; }
  .toolbar { margin-bottom: 12px; }
  .copy-btn {
    background: var(--vscode-button-background, #0e639c);
    color: var(--vscode-button-foreground, #fff);
    border: none;
    padding: 4px 10px;
    border-radius: 3px;
    cursor: pointer;
    margin-right: 6px;
    font-size: 12px;
  }
  .copy-btn:hover {
    background: var(--vscode-button-hoverBackground, #1177bb);
  }
  .sql-block {
    background: var(--vscode-editor-inactiveSelectionBackground, #333);
    padding: 8px 12px;
    border-radius: 4px;
    margin-bottom: 16px;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 13px;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .tree { margin-bottom: 16px; }
  .node {
    margin: 4px 0 4px 16px;
    padding: 6px 10px;
    border-radius: 4px;
  }
  .node:first-child { margin-left: 0; }
  .node-detail { font-family: var(--vscode-editor-font-family, monospace); font-size: 13px; }
  .node-search { border-left: 4px solid #28a745; background: rgba(40,167,69,0.08); }
  .node-scan   { border-left: 4px solid #dc3545; background: rgba(220,53,69,0.08); }
  .node-temp   { border-left: 4px solid #e0a800; background: rgba(224,168,0,0.08); }
  .node-other  { border-left: 4px solid var(--vscode-panel-border, #444); }
  .badge {
    display: inline-block;
    padding: 1px 6px;
    border-radius: 8px;
    font-size: 11px;
    margin-left: 8px;
    font-weight: 600;
  }
  .badge.node-search { color: #28a745; }
  .badge.node-scan   { color: #dc3545; }
  .badge.node-temp   { color: #e0a800; }
  .suggestion {
    margin: 8px 0;
    padding: 8px 12px;
    background: var(--vscode-editor-inactiveSelectionBackground, #333);
    border-radius: 4px;
  }
  .suggestion-reason {
    display: block;
    font-size: 12px;
    opacity: 0.7;
    margin-bottom: 4px;
  }
  .suggestion code {
    font-size: 13px;
    display: block;
    margin-bottom: 6px;
  }
  .suite-note {
    margin: 8px 0;
    padding: 8px 12px;
    border-radius: 4px;
    background: var(--vscode-editor-inactiveSelectionBackground, #333);
    border-left: 4px solid var(--vscode-panel-border, #444);
  }
  .suite-note.suite-error { border-left-color: #dc3545; }
  .suite-note.suite-warning { border-left-color: #e0a800; }
  .suite-note.suite-info { border-left-color: #0e639c; }
  .suite-src {
    display: inline-block;
    font-size: 11px;
    font-weight: 600;
    opacity: 0.8;
    margin-right: 8px;
  }
  .suite-title { font-size: 13px; }
  .suite-detail {
    display: block;
    font-size: 12px;
    opacity: 0.7;
    margin-top: 4px;
  }
  .suite-rule {
    display: inline-block;
    font-size: 11px;
    opacity: 0.6;
    margin-top: 4px;
  }
</style>
</head>
<body>
${body}
<script>
  const vscode = acquireVsCodeApi();
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const index = btn.dataset.index;
    vscode.postMessage({ command: action, index: index ? Number(index) : undefined });
  });
</script>
</body>
</html>`;
}
