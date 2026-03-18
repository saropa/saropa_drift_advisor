/** Builds the HTML/CSS/JS for the schema search sidebar webview. */

export function getSchemaSearchHtml(nonce: string): string {
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<style nonce="${nonce}">
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size);
    color: var(--vscode-foreground); padding: 8px; }
  .search-box { display: flex; gap: 4px; margin-bottom: 6px; }
  .search-box input { flex: 1; padding: 4px 6px;
    background: var(--vscode-input-background); color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent); border-radius: 2px;
    outline: none; font-size: var(--vscode-font-size);
    transition: opacity 0.2s ease; }
  .search-box input:focus { border-color: var(--vscode-focusBorder); }
  .search-box input:disabled { opacity: 0.5; cursor: not-allowed; }
  .filters { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 8px;
    transition: opacity 0.2s ease; }
  .filters button { padding: 2px 8px; font-size: 11px; cursor: pointer;
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    border: 1px solid transparent; border-radius: 2px; }
  .filters button.active { background: var(--vscode-button-background);
    color: var(--vscode-button-foreground); }
  .filters button:hover { opacity: 0.9; }
  .filters.disabled { opacity: 0.5; pointer-events: none; }
  .sep { width: 1px; background: var(--vscode-widget-border, #555); margin: 0 2px; }
  .results { list-style: none; }
  .result-item { padding: 3px 4px; cursor: pointer; border-radius: 2px; }
  .result-item:hover { background: var(--vscode-list-hoverBackground); }
  .result-table { font-weight: 600; }
  .result-col { padding-left: 14px; }
  .result-type { opacity: 0.7; margin-left: 4px; font-size: 11px; }
  .result-meta { font-size: 11px; opacity: 0.6; }
  .cross-ref { padding-left: 24px; font-size: 11px; opacity: 0.7; }
  .cross-ref .warn { color: var(--vscode-editorWarning-foreground, #cca700); }
  .empty { opacity: 0.6; font-style: italic; padding: 8px 0; }
  .idle { opacity: 0.6; font-size: 12px; padding: 12px 0; }
  .browse-link { font-size: 11px; opacity: 0.8; margin-bottom: 6px;
    transition: opacity 0.2s ease; }
  .browse-link a { color: var(--vscode-textLink-foreground); cursor: pointer; }
  .browse-link a:hover { text-decoration: underline; }
  .browse-link.disabled { opacity: 0.4; pointer-events: none; }
  .error { color: var(--vscode-errorForeground); font-size: 12px; padding: 8px 0; }
  .status { font-size: 11px; opacity: 0.6; margin-bottom: 4px; }
  .loading { opacity: 0.6; font-style: italic; padding: 8px 0;
    animation: pulse 1.2s ease-in-out infinite; }
  @keyframes pulse { 0%,100% { opacity: 0.4; } 50% { opacity: 1; } }

  /* Retry button shown after timeout/error so the user can try again. */
  .retry-btn { margin-top: 6px; padding: 3px 10px; font-size: 11px; cursor: pointer;
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    border: 1px solid var(--vscode-button-border, transparent); border-radius: 3px;
    transition: opacity 0.15s ease; }
  .retry-btn:hover { opacity: 0.85; }

  /* Disconnected banner: slides in/out with a smooth height + opacity transition. */
  .disconnected { overflow: hidden; max-height: 0; opacity: 0; padding: 0 8px;
    margin-bottom: 0; font-size: 11px; border-radius: 3px;
    background: var(--vscode-inputValidation-warningBackground, #5a4300);
    border: 1px solid var(--vscode-inputValidation-warningBorder, #856d00);
    color: var(--vscode-inputValidation-warningForeground, #cca700);
    transition: max-height 0.25s ease, opacity 0.25s ease,
                padding 0.25s ease, margin-bottom 0.25s ease; }
  .disconnected.show { max-height: 40px; opacity: 1; padding: 6px 8px; margin-bottom: 6px; }
</style>
</head>
<body>
<div id="disconnected" class="disconnected" aria-live="polite">Server not connected</div>
<div class="search-box">
  <input id="query" type="text" placeholder="Search schema..." />
</div>
<div id="filters" class="filters">
  <button class="scope-btn active" data-scope="all">All</button>
  <button class="scope-btn" data-scope="tables">Tables</button>
  <button class="scope-btn" data-scope="columns">Columns</button>
  <div class="sep"></div>
  <button class="type-btn active" data-type="">Any</button>
  <button class="type-btn" data-type="TEXT">TEXT</button>
  <button class="type-btn" data-type="INTEGER">INT</button>
  <button class="type-btn" data-type="REAL">REAL</button>
  <button class="type-btn" data-type="BLOB">BLOB</button>
</div>
<div id="browseWrap" class="browse-link"><a id="browseAll" href="#">Browse all tables</a></div>
<div id="status" class="status"></div>
<div id="error" class="error" style="display: none;"></div>
<ul id="results" class="results"></ul>
<script nonce="${nonce}">
(function() {
  const vscode = acquireVsCodeApi();
  const queryEl = document.getElementById('query');
  const filtersEl = document.getElementById('filters');
  const browseWrap = document.getElementById('browseWrap');
  const resultsEl = document.getElementById('results');
  const statusEl = document.getElementById('status');
  const errorEl = document.getElementById('error');
  const disconnectedEl = document.getElementById('disconnected');
  let scope = 'all';
  let typeFilter = '';
  let debounceTimer;
  let connected = true; // Assume connected until told otherwise

  document.querySelectorAll('.scope-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.scope-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      scope = btn.dataset.scope;
      doSearch();
    });
  });

  document.querySelectorAll('.type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      typeFilter = btn.dataset.type;
      doSearch();
    });
  });

  queryEl.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(doSearch, 200);
  });

  document.getElementById('browseAll').addEventListener('click', (e) => {
    e.preventDefault();
    vscode.postMessage({ command: 'searchAll' });
  });

  function doSearch() {
    const q = queryEl.value.trim();
    if (!q) {
      statusEl.textContent = '';
      errorEl.style.display = 'none';
      errorEl.textContent = '';
      resultsEl.innerHTML = connected
        ? '<li class="idle">Type to search tables and columns.</li>'
        : '<li class="idle">Waiting for server connection\u2026</li>';
      return;
    }
    const msg = { command: 'search', query: q, scope, typeFilter: typeFilter || undefined };
    vscode.postMessage(msg);
  }

  /** Updates the UI to reflect server connection state. */
  function applyConnectionState(isConnected) {
    connected = isConnected;
    // Show/hide disconnected banner with CSS transition
    disconnectedEl.classList.toggle('show', !connected);
    // Disable/enable interactive controls when disconnected
    queryEl.disabled = !connected;
    filtersEl.classList.toggle('disabled', !connected);
    browseWrap.classList.toggle('disabled', !connected);
    // Refresh the idle message to match the new state
    if (!queryEl.value.trim()) doSearch();
  }

  window.addEventListener('message', e => {
    const msg = e.data;
    if (msg.command === 'loading') {
      if (errorEl) { errorEl.style.display = 'none'; errorEl.textContent = ''; }
      statusEl.textContent = '';
      resultsEl.innerHTML = '<li class="loading">Searching\u2026</li>';
    } else if (msg.command === 'error') {
      /* Timeout or API failure: show message + Retry button so the panel always resolves. */
      statusEl.textContent = '';
      resultsEl.innerHTML = '';
      if (errorEl) {
        errorEl.textContent = msg.message || 'Search failed';
        errorEl.style.display = 'block';
      }
      // Append a Retry button below the error so the user can try again
      // without retyping their query or re-clicking Browse.
      const retryBtn = document.createElement('button');
      retryBtn.className = 'retry-btn';
      retryBtn.textContent = 'Retry';
      retryBtn.title = 'Retry the last search or browse request';
      retryBtn.addEventListener('click', () => {
        vscode.postMessage({ command: 'retry' });
      });
      resultsEl.appendChild(retryBtn);
    } else if (msg.command === 'results') {
      if (errorEl) { errorEl.style.display = 'none'; errorEl.textContent = ''; }
      renderResults(msg.result, msg.crossRefs);
    } else if (msg.command === 'connectionState') {
      applyConnectionState(msg.connected);
    }
  });

  function renderResults(result, crossRefs) {
    statusEl.textContent = result.matches.length
      ? result.matches.length + ' match' + (result.matches.length !== 1 ? 'es' : '')
      : '';
    resultsEl.innerHTML = '';
    if (result.matches.length === 0) {
      resultsEl.innerHTML = '<li class="empty">No matches</li>';
      return;
    }
    const refMap = {};
    for (const ref of (crossRefs || [])) refMap[ref.columnName] = ref;

    let lastTable = '';
    for (const m of result.matches) {
      if (m.type === 'table') {
        lastTable = m.table;
        const li = document.createElement('li');
        li.className = 'result-item result-table';
        li.innerHTML = esc(m.table) + ' <span class="result-meta">' +
          m.columnCount + ' cols, ' + m.rowCount + ' rows</span>';
        li.addEventListener('click', () =>
          vscode.postMessage({ command: 'navigate', table: m.table }));
        resultsEl.appendChild(li);
      } else {
        if (m.table !== lastTable) {
          lastTable = m.table;
          const hdr = document.createElement('li');
          hdr.className = 'result-item result-table';
          hdr.textContent = m.table;
          hdr.addEventListener('click', () =>
            vscode.postMessage({ command: 'navigate', table: m.table }));
          resultsEl.appendChild(hdr);
        }
        const li = document.createElement('li');
        li.className = 'result-item result-col';
        li.innerHTML = (m.isPk ? '&#x1f511; ' : '') +
          esc(m.column) + '<span class="result-type">' + esc(m.columnType) + '</span>';
        li.addEventListener('click', () =>
          vscode.postMessage({ command: 'navigate', table: m.table }));
        resultsEl.appendChild(li);

        if (m.alsoIn && m.alsoIn.length > 0) {
          const ref = refMap[m.column];
          const xli = document.createElement('li');
          xli.className = 'cross-ref';
          let html = 'also in: ' + m.alsoIn.map(esc).join(', ');
          if (ref && ref.missingFks.length > 0) {
            const missing = ref.missingFks
              .filter(fk => fk.from === m.table || fk.to === m.table)
              .length;
            if (missing > 0) html += ' <span class="warn">\u26a0 no FK</span>';
          }
          xli.innerHTML = html;
          resultsEl.appendChild(xli);
        }
      }
    }
  }

  function esc(s) {
    const d = document.createElement('span');
    d.textContent = s || '';
    return d.innerHTML;
  }

  // Show idle state immediately; search only when user types (avoids slow "browse all" on open).
  doSearch();
})();
</script>
</body>
</html>`;
}
