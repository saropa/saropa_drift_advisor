/**
 * Webview-side shell script for the SQL Notebook: tab state/management, the
 * message listener, execute/explain dispatch, and the history sidebar (render,
 * search, context menu). Runs in the webview alongside the results/autocomplete/
 * charts/explain modules, which provide the render* / handle* helpers it calls.
 * Split out of sql-notebook-html.ts so the scaffold file stays small.
 */
export function getNotebookShellJs(): string {
  return `
  var vscode = acquireVsCodeApi();

  // --- Tab State ---
  var tabs = [{ id: 't1', title: 'Query 1', sql: '', results: null, columns: null, error: null, explain: null }];
  var activeTabId = 't1';
  var tabCounter = 1;
  var schema = null;
  var historyEntries = [];
  var historyTotal = 0;
  var historyQuery = '';
  var historyDebounce = null;

  // --- Message Listener ---
  window.addEventListener('message', function (event) {
    var msg = event.data;
    switch (msg.command) {
      case 'queryResult': handleQueryResult(msg); break;
      case 'queryError': handleQueryError(msg); break;
      case 'explainResult': handleExplainResult(msg); break;
      case 'schema': schema = msg.tables; break;
      case 'historyResults':
        historyEntries = msg.entries || [];
        historyTotal = msg.total || 0;
        historyQuery = msg.query || '';
        renderHistory();
        break;
      case 'loadEntry':
        document.getElementById('sql-input').value = msg.sql;
        getActiveTab().sql = msg.sql;
        break;
      case 'insertQueryCell':
        insertQueryCell(msg.sql || '', msg.title || 'Generated SQL');
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

  /**
   * Inserts a new tab pre-filled with generated SQL so users can review/edit
   * before execution.
   */
  function insertQueryCell(sql, title) {
    tabCounter++;
    var tab = {
      id: 't' + tabCounter,
      title: title || ('Query ' + tabCounter),
      sql: sql,
      results: null,
      columns: null,
      error: null,
      explain: null
    };
    tabs.push(tab);
    switchTab(tab.id);
  }

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
  document.getElementById('btn-nl-sql').addEventListener('click', function () {
    vscode.postMessage({ command: 'requestNlSql' });
  });
  document.getElementById('add-tab').addEventListener('click', addTab);

  document.getElementById('sql-input').addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      executeQuery();
    }
  });

  // --- History ---
  function addToHistory(sql, rowCount, durationMs, error) {
    vscode.postMessage({
      command: 'addHistoryEntry',
      entry: { sql: sql, timestamp: Date.now(), rowCount: rowCount, durationMs: durationMs, error: error || undefined }
    });
  }

  function relativeTime(ts) {
    var diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return diff + 's ago';
    var mins = Math.floor(diff / 60);
    if (mins < 60) return mins + 'm ago';
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    var days = Math.floor(hrs / 24);
    if (days === 1) return 'yesterday';
    return days + 'd ago';
  }

  function renderHistory() {
    var counter = document.getElementById('history-counter');
    if (historyQuery) {
      counter.textContent = historyEntries.length + ' of ' + historyTotal;
    } else {
      counter.textContent = historyTotal ? historyTotal + ' entries' : '';
    }

    var list = document.getElementById('history-list');
    var html = '';
    for (var i = 0; i < historyEntries.length; i++) {
      var h = historyEntries[i];
      var preview = h.sql.length > 80 ? h.sql.substring(0, 80) + '...' : h.sql;
      var metaLeft = h.error
        ? '<span class="history-error">Error</span>'
        : '<span>' + h.rowCount + ' rows, ' + h.durationMs + 'ms</span>';
      html += '<div class="history-entry" data-ts="' + h.timestamp + '" title="' + esc(h.sql) + '">'
        + '<div class="history-sql">' + esc(preview) + '</div>'
        + '<div class="history-meta">' + metaLeft
        + '<span class="history-time">' + relativeTime(h.timestamp) + '</span>'
        + '</div></div>';
    }
    list.innerHTML = html;

    list.querySelectorAll('.history-entry').forEach(function (el) {
      el.addEventListener('click', function () {
        vscode.postMessage({ command: 'loadHistoryEntry', timestamp: Number(el.dataset.ts) });
      });
      el.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        showHistoryMenu(e.clientX, e.clientY, Number(el.dataset.ts));
      });
    });
  }

  function showHistoryMenu(x, y, ts) {
    closeHistoryMenu();
    var menu = document.createElement('div');
    menu.className = 'history-ctx-menu';
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    menu.innerHTML = '<div data-action="copy">Copy SQL</div>'
      + '<div data-action="run">Run Again</div>'
      + '<div data-action="delete">Delete</div>';

    menu.querySelectorAll('[data-action]').forEach(function (item) {
      item.addEventListener('click', function () {
        var action = item.dataset.action;
        var entry = historyEntries.find(function (e) { return e.timestamp === ts; });
        if (action === 'copy' && entry) {
          vscode.postMessage({ command: 'copyToClipboard', text: entry.sql });
        } else if (action === 'run' && entry) {
          document.getElementById('sql-input').value = entry.sql;
          getActiveTab().sql = entry.sql;
          executeQuery();
        } else if (action === 'delete') {
          vscode.postMessage({ command: 'deleteHistoryEntry', timestamp: ts, query: historyQuery });
        }
        closeHistoryMenu();
      });
    });

    document.body.appendChild(menu);
    document.addEventListener('click', closeHistoryMenu, { once: true });
  }

  function closeHistoryMenu() {
    var existing = document.querySelector('.history-ctx-menu');
    if (existing) existing.remove();
  }

  // --- History search (debounced) ---
  document.getElementById('history-search').addEventListener('input', function (e) {
    clearTimeout(historyDebounce);
    var q = e.target.value;
    historyDebounce = setTimeout(function () {
      historyQuery = q;
      vscode.postMessage({ command: 'searchHistory', query: q });
    }, 200);
  });

  document.getElementById('btn-clear-history').addEventListener('click', function () {
    vscode.postMessage({ command: 'clearHistory' });
    document.getElementById('history-search').value = '';
  });

  // --- Init ---
  vscode.postMessage({ command: 'getSchema' });
  vscode.postMessage({ command: 'loadHistory' });
  vscode.postMessage({ command: 'notebookReady' });
  renderTabs();
`;
}
