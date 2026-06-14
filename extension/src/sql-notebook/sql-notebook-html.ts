import { getAutocompleteJs } from './sql-notebook-autocomplete';
import { getChartsJs } from './sql-notebook-charts';
import { getExplainJs } from './sql-notebook-explain';
import { getResultsJs } from './sql-notebook-results';
import { getNotebookShellJs } from './sql-notebook-shell-js';
import { getNotebookCss } from './sql-notebook-styles';
import { t } from '../l10n';

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
    <button id="add-tab" title="${t('panel.query.notebook.tab.new')}">+</button>
  </div>
  <div id="main-area">
    <div id="editor-area">
      <div class="sql-input-wrap">
        <textarea id="sql-input" placeholder="${t('panel.query.notebook.sql.placeholder')}"
          spellcheck="false"></textarea>
        <div id="autocomplete-dropdown" class="autocomplete-dropdown"
          style="display:none;"></div>
      </div>
      <div class="toolbar">
        <button id="btn-execute" title="${t('panel.query.notebook.btn.run.title')}">${t('panel.query.notebook.btn.run')}</button>
        <button id="btn-explain" title="${t('panel.query.notebook.btn.explain.title')}">${t('panel.query.notebook.btn.explain')}</button>
        <button type="button" id="btn-nl-sql" title="${t('panel.query.notebook.btn.ask.title')}">${t('panel.query.notebook.btn.ask')}</button>
        <button id="btn-chart" title="${t('panel.query.notebook.btn.chart.title')}" disabled>${t('panel.query.notebook.btn.chart')}</button>
        <button id="btn-copy-json" title="${t('panel.query.notebook.btn.copyJson.title')}" disabled>${t('panel.query.notebook.btn.copyJson')}</button>
        <button id="btn-copy-csv" title="${t('panel.query.notebook.btn.copyCsv.title')}" disabled>${t('panel.query.notebook.btn.copyCsv')}</button>
      </div>
      <div id="status-bar" class="status-bar">${t('panel.query.notebook.status.ready')}</div>
      <div id="result-area"></div>
    </div>
    <div id="history-sidebar">
      <div class="history-header">
        <h3>${t('panel.query.notebook.history.title')}</h3>
        <button id="btn-clear-history" title="${t('panel.query.notebook.history.clear.title')}">${t('panel.query.notebook.history.clear')}</button>
      </div>
      <input type="text" id="history-search" placeholder="${t('panel.query.notebook.history.searchPlaceholder')}" />
      <div id="history-counter" class="history-counter"></div>
      <div id="history-list"></div>
    </div>
  </div>
</div>
<script nonce="__CSP_NONCE__">
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
