/**
 * HTML template for the Explain Query Plan webview panel.
 * Uses VS Code theme CSS variables for light/dark support.
 */

import { IExplainNode } from './explain-panel';
import { IndexSuggestion } from '../api-client';

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
    case 'search': return 'INDEX';
    case 'scan': return 'FULL SCAN';
    case 'temp': return 'TEMP';
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
  <button class="copy-btn" data-action="copySuggestion" data-index="${i}">Copy</button>
</div>`,
    )
    .join('\n');
  return `<h3>Index Suggestions</h3>\n${items}`;
}

/** Build self-contained HTML for the explain query plan panel. */
export function buildExplainHtml(
  sql: string,
  nodes: IExplainNode[],
  suggestions: IndexSuggestion[],
): string {
  const tree = nodes.map((n) => renderNode(n)).join('\n');
  const suggestionsHtml = renderSuggestions(suggestions);

  const body = `
<h2>Query Plan</h2>
<div class="toolbar">
  <button class="copy-btn" data-action="copySql">Copy SQL</button>
  <button class="copy-btn" data-action="copyPlan">Copy Plan</button>
</div>
<div class="sql-block"><code>${esc(sql)}</code></div>
<div class="tree">${tree}</div>
${suggestionsHtml}`;

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
