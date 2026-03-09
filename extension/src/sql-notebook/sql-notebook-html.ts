import { getAutocompleteJs } from './sql-notebook-autocomplete';
import { getChartsJs } from './sql-notebook-charts';
import { getExplainJs } from './sql-notebook-explain';
import { getResultsJs } from './sql-notebook-results';
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
        <button id="btn-chart" title="Chart results" disabled>Chart</button>
        <button id="btn-copy-json" title="Copy as JSON" disabled>Copy JSON</button>
        <button id="btn-copy-csv" title="Copy as CSV" disabled>Copy CSV</button>
      </div>
      <div id="status-bar" class="status-bar">Ready</div>
      <div id="result-area"></div>
    </div>
    <div id="history-sidebar">
      <h3>History</h3>
      <div id="history-list"></div>
    </div>
  </div>
</div>
<script>
  var vscode = acquireVsCodeApi();

  // --- Tab State ---
  var tabs = [{ id: 't1', title: 'Query 1', sql: '', results: null, columns: null, error: null, explain: null }];
  var activeTabId = 't1';
  var tabCounter = 1;
  var schema = null;
  var history = [];

  // --- Message Listener ---
  window.addEventListener('message', function (event) {
    var msg = event.data;
    switch (msg.command) {
      case 'queryResult': handleQueryResult(msg); break;
      case 'queryError': handleQueryError(msg); break;
      case 'explainResult': handleExplainResult(msg); break;
      case 'schema': schema = msg.tables; break;
      case 'history':
        history = msg.entries || [];
        renderHistory();
        break;
    }
  });

  // --- Tab Management ---
  function addTab() {
    tabCounter++;
    var tab = { id: 't' + tabCounter, title: 'Query ' + tabCounter, sql: '', results: null, columns: null, error: null, explain: null };
    tabs.push(tab);
    switchTab(tab.id);
  }

  function switchTab(tabId) {
    var current = getActiveTab();
    if (current) current.sql = document.getElementById('sql-input').value;
    activeTabId = tabId;
    renderTabs();
    var tab = getActiveTab();
    document.getElementById('sql-input').value = tab.sql;
    if (tab.error) { renderError(tab.error); setStatus('Error'); enableExportButtons(false); }
    else if (tab.explain) { renderExplain(tab.explain.rows, tab.explain.sql); setStatus('Explain complete'); enableExportButtons(false); }
    else if (tab.results) { renderResults(tab); setStatus(tab.results.length + ' rows'); enableExportButtons(true); }
    else { resultArea().innerHTML = ''; setStatus('Ready'); enableExportButtons(false); }
  }

  function closeTab(tabId) {
    if (tabs.length <= 1) return;
    var idx = tabs.findIndex(function (t) { return t.id === tabId; });
    if (idx < 0) return;
    tabs.splice(idx, 1);
    if (activeTabId === tabId) {
      activeTabId = tabs[Math.min(idx, tabs.length - 1)].id;
    }
    switchTab(activeTabId);
  }

  function getActiveTab() { return tabs.find(function (t) { return t.id === activeTabId; }); }

  function renderTabs() {
    var container = document.getElementById('tabs');
    var html = '';
    for (var i = 0; i < tabs.length; i++) {
      var t = tabs[i];
      var cls = t.id === activeTabId ? 'tab active' : 'tab';
      var closeBtn = tabs.length > 1
        ? '<span class="close-tab" data-close="' + t.id + '">&times;</span>' : '';
      html += '<div class="' + cls + '" data-tab="' + t.id + '">'
        + esc(t.title) + closeBtn + '</div>';
    }
    container.innerHTML = html;
    container.querySelectorAll('.tab[data-tab]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        if (e.target.classList.contains('close-tab')) return;
        switchTab(el.dataset.tab);
      });
    });
    container.querySelectorAll('.close-tab[data-close]').forEach(function (el) {
      el.addEventListener('click', function () { closeTab(el.dataset.close); });
    });
  }

  // --- Execute / Explain ---
  function setQueryBusy(busy) {
    document.getElementById('btn-execute').disabled = busy;
    document.getElementById('btn-explain').disabled = busy;
  }

  function executeQuery() {
    var tab = getActiveTab();
    tab.sql = document.getElementById('sql-input').value;
    if (!tab.sql.trim()) return;
    setStatus('Executing...');
    setQueryBusy(true);
    removeChart();
    vscode.postMessage({ command: 'execute', sql: tab.sql, tabId: tab.id });
  }

  function explainQuery() {
    var tab = getActiveTab();
    tab.sql = document.getElementById('sql-input').value;
    if (!tab.sql.trim()) return;
    setStatus('Explaining...');
    setQueryBusy(true);
    removeChart();
    vscode.postMessage({ command: 'explain', sql: tab.sql, tabId: tab.id });
  }

  document.getElementById('btn-execute').addEventListener('click', executeQuery);
  document.getElementById('btn-explain').addEventListener('click', explainQuery);
  document.getElementById('add-tab').addEventListener('click', addTab);

  document.getElementById('sql-input').addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      executeQuery();
    }
  });

  // --- History ---
  function addToHistory(sql, rowCount, durationMs, error) {
    history.unshift({ sql: sql, timestamp: Date.now(), rowCount: rowCount, durationMs: durationMs, error: error });
    if (history.length > 50) history.length = 50;
    renderHistory();
    vscode.postMessage({ command: 'saveHistory', history: history });
  }

  function renderHistory() {
    var list = document.getElementById('history-list');
    var html = '';
    for (var i = 0; i < history.length; i++) {
      var h = history[i];
      var preview = h.sql.length > 40 ? h.sql.substring(0, 40) + '...' : h.sql;
      var meta = h.error
        ? '<div class="history-meta history-error">Error</div>'
        : '<div class="history-meta">' + h.rowCount + ' rows, ' + h.durationMs + 'ms</div>';
      html += '<div class="history-entry" data-hist="' + i + '" title="' + esc(h.sql) + '">'
        + esc(preview) + meta + '</div>';
    }
    list.innerHTML = html;
    list.querySelectorAll('.history-entry').forEach(function (el) {
      el.addEventListener('click', function () {
        var idx = Number(el.dataset.hist);
        document.getElementById('sql-input').value = history[idx].sql;
        var tab = getActiveTab();
        tab.sql = history[idx].sql;
      });
    });
  }

  // --- Init ---
  vscode.postMessage({ command: 'getSchema' });
  vscode.postMessage({ command: 'loadHistory' });
  renderTabs();

  // --- Inline JS modules ---
  ${getResultsJs()}
  ${getAutocompleteJs()}
  ${getChartsJs()}
  ${getExplainJs()}
</script>
</body>
</html>`;
}
