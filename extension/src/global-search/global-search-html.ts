/**
 * HTML template for the Cross-Table Global Search webview panel.
 * Uses VS Code theme CSS variables for light/dark support.
 */

import type { ISearchResult } from './global-search-types';
import { groupByTable } from './global-search-engine';

function esc(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderResults(result: ISearchResult): string {
  const groups = groupByTable(result.matches);
  const tableCount = groups.size;
  const matchCount = result.matches.length;

  let summary = `<div class="summary">Found ${matchCount} match${matchCount !== 1 ? 'es' : ''}`;
  summary += ` across ${tableCount} table${tableCount !== 1 ? 's' : ''}`;
  summary += ` (${result.durationMs}ms, ${result.tablesSearched} tables searched)</div>`;

  if (matchCount === 0) {
    return `${summary}<div class="empty">No matches found.</div>`;
  }

  const sections: string[] = [];
  for (const [table, matches] of groups) {
    const rows = matches.map((m) => `
      <div class="match-row">
        <span class="match-loc">${esc(m.pkColumn)}=${esc(String(m.rowPk))}</span>
        <span class="match-col">${esc(m.column)}</span> =
        <span class="match-val">"${esc(m.matchedValue)}"</span>
        <button class="btn" data-action="copyValue"
          data-value="${esc(m.matchedValue)}">Copy</button>
      </div>`).join('\n');

    sections.push(`
      <div class="table-group">
        <div class="table-header">${esc(table)}
          <span class="badge">${matches.length}</span></div>
        ${rows}
      </div>`);
  }

  return summary + sections.join('\n');
}

/** Build the complete HTML for the global search panel. */
export function buildGlobalSearchHtml(
  result?: ISearchResult,
  searching?: boolean,
): string {
  const resultsHtml = searching
    ? '<div class="searching">Searching\u2026</div>'
    : result ? renderResults(result) : '';

  const body = `
<h2>Global Search</h2>
<div class="search-form">
  <div class="input-row">
    <input id="query" type="text" placeholder="Search value\u2026"
      value="${result ? esc(result.query) : ''}" />
    <button class="btn primary" data-action="search">Search</button>
  </div>
  <div class="options-row">
    <label>Mode:</label>
    <label><input type="radio" name="mode" value="exact"
      ${!result || result.mode === 'exact' ? 'checked' : ''} /> Exact</label>
    <label><input type="radio" name="mode" value="contains"
      ${result?.mode === 'contains' ? 'checked' : ''} /> Contains</label>
    <label><input type="radio" name="mode" value="regex"
      ${result?.mode === 'regex' ? 'checked' : ''} /> Regex</label>
  </div>
  <div class="options-row">
    <label>Scope:</label>
    <label><input type="radio" name="scope" value="all"
      checked /> All columns</label>
    <label><input type="radio" name="scope" value="text_only"
      /> Text columns only</label>
  </div>
</div>
<div id="results">${resultsHtml}</div>`;

  return wrapHtml(body);
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
  .search-form { margin-bottom: 16px; }
  .input-row {
    display: flex;
    gap: 8px;
    margin-bottom: 8px;
  }
  #query {
    flex: 1;
    padding: 6px 10px;
    font-size: 14px;
    background: var(--vscode-input-background, #333);
    color: var(--vscode-input-foreground, #ccc);
    border: 1px solid var(--vscode-input-border, #555);
    border-radius: 3px;
    outline: none;
  }
  #query:focus {
    border-color: var(--vscode-focusBorder, #007fd4);
  }
  .options-row {
    display: flex;
    gap: 12px;
    align-items: center;
    margin-bottom: 4px;
    font-size: 13px;
  }
  .options-row label:first-child {
    font-weight: 600;
    min-width: 48px;
  }
  .btn {
    background: var(--vscode-button-secondaryBackground, #3a3d41);
    color: var(--vscode-button-secondaryForeground, #ccc);
    border: none;
    padding: 4px 10px;
    border-radius: 3px;
    cursor: pointer;
    font-size: 12px;
  }
  .btn:hover {
    background: var(--vscode-button-secondaryHoverBackground, #505357);
  }
  .btn.primary {
    background: var(--vscode-button-background, #0e639c);
    color: var(--vscode-button-foreground, #fff);
  }
  .btn.primary:hover {
    background: var(--vscode-button-hoverBackground, #1177bb);
  }
  .summary {
    margin-bottom: 12px;
    font-size: 13px;
    opacity: 0.8;
  }
  .empty {
    padding: 20px;
    text-align: center;
    opacity: 0.6;
  }
  .searching {
    padding: 20px;
    text-align: center;
    opacity: 0.7;
    font-style: italic;
  }
  .table-group {
    margin-bottom: 12px;
    border: 1px solid var(--vscode-panel-border, #444);
    border-radius: 4px;
  }
  .table-header {
    padding: 8px 12px;
    font-weight: 600;
    font-size: 14px;
    background: var(--vscode-editor-inactiveSelectionBackground, #333);
    border-bottom: 1px solid var(--vscode-panel-border, #444);
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .badge {
    display: inline-block;
    padding: 1px 7px;
    border-radius: 10px;
    font-size: 11px;
    font-weight: 600;
    background: var(--vscode-badge-background, #4d4d4d);
    color: var(--vscode-badge-foreground, #fff);
  }
  .match-row {
    padding: 6px 12px;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 13px;
    border-bottom: 1px solid var(--vscode-panel-border, #333);
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
  .match-row:last-child { border-bottom: none; }
  .match-loc { opacity: 0.5; }
  .match-col { color: var(--vscode-textLink-foreground, #3794ff); }
  .match-val {
    color: var(--vscode-debugTokenExpression-string, #ce9178);
  }
  .match-row .btn { margin-left: auto; }
</style>
</head>
<body>
${body}
<script>
  const vscode = acquireVsCodeApi();

  function doSearch() {
    const query = document.getElementById('query').value;
    if (!query) return;
    const mode = document.querySelector('input[name="mode"]:checked').value;
    const scope = document.querySelector('input[name="scope"]:checked').value;
    vscode.postMessage({ command: 'search', query, mode, scope });
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'search') { doSearch(); return; }
    if (action === 'copyValue') {
      vscode.postMessage({ command: 'copyValue', value: btn.dataset.value });
    }
  });

  document.getElementById('query').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSearch();
  });
</script>
</body>
</html>`;
}
