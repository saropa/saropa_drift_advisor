import { getAutocompleteJs } from './sql-notebook-autocomplete';
import { getChartsJs } from './sql-notebook-charts';
import { getExplainJs } from './sql-notebook-explain';
import { getResultsJs } from './sql-notebook-results';
import { getNotebookShellJs } from './sql-notebook-shell-js';
import { getNotebookCss } from './sql-notebook-styles';

/** Build the full HTML scaffold for the SQL Notebook webview. */
export function getNotebookHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>${getNotebookCss()}</style>
</head>
<body>
<div id="app">
  <div id="tab-bar">
    <div id="tabs"></div>
    <button id="add-tab" title="New query tab">+</button>
  </div>
  <div id="main-area">
    <div id="editor-area">
      <div class="sql-input-wrap">
        <textarea id="sql-input" placeholder="Enter SQL... (Ctrl+Enter to execute)"
          spellcheck="false"></textarea>
        <div id="autocomplete-dropdown" class="autocomplete-dropdown"
          style="display:none;"></div>
      </div>
      <div class="toolbar">
        <button id="btn-execute" title="Execute (Ctrl+Enter)">Run</button>
        <button id="btn-explain" title="Explain query plan">Explain</button>
        <button type="button" id="btn-nl-sql" title="Generate SQL from plain English (LLM; requires API key)">Ask in English…</button>
        <button id="btn-chart" title="Chart results" disabled>Chart</button>
        <button id="btn-copy-json" title="Copy as JSON" disabled>Copy JSON</button>
        <button id="btn-copy-csv" title="Copy as CSV" disabled>Copy CSV</button>
      </div>
      <div id="status-bar" class="status-bar">Ready</div>
      <div id="result-area"></div>
    </div>
    <div id="history-sidebar">
      <div class="history-header">
        <h3>History</h3>
        <button id="btn-clear-history" title="Clear all history">Clear</button>
      </div>
      <input type="text" id="history-search" placeholder="Search history..." />
      <div id="history-counter" class="history-counter"></div>
      <div id="history-list"></div>
    </div>
  </div>
</div>
<script>
  // --- Shell: tabs, message routing, execute/explain, history ---
  ${getNotebookShellJs()}

  // --- Inline JS modules ---
  ${getResultsJs()}
  ${getAutocompleteJs()}
  ${getChartsJs()}
  ${getExplainJs()}
</script>
</body>
</html>`;
}
