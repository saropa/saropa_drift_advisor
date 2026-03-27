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
  .disconnected.show { max-height: 220px; opacity: 1; padding: 8px; margin-bottom: 6px; }
  .disc-title { font-weight: 600; }
  .disc-hint { font-size: 10px; opacity: 0.95; margin-top: 4px; line-height: 1.35; }
  .disc-actions { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .linkish { background: transparent; border: none; color: var(--vscode-textLink-foreground);
    cursor: pointer; font-size: 10px; padding: 2px 0; text-decoration: underline; }
  .linkish:hover { opacity: 0.9; }
  .conn-status { font-size: 10px; opacity: 0.72; margin-bottom: 4px; line-height: 1.3; }
  .disc-live {
    font-size: 10px; line-height: 1.35; margin-bottom: 8px; padding: 6px 8px;
    border-radius: 3px;
    background: var(--vscode-editor-inactiveSelectionBackground, rgba(128,128,128,0.15));
    border: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.28));
  }
  .disc-live-title { font-weight: 600; font-size: 10px; margin-bottom: 4px; opacity: 0.88; }
  .disc-live-line { margin-bottom: 4px; }
  .disc-live-outcome { opacity: 0.85; margin-bottom: 4px; }
  .disc-live-meta { opacity: 0.68; font-size: 10px; margin-bottom: 6px; }
  .disc-live-actions { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
  .disc-faq {
    margin-top: 8px; padding-top: 6px;
    border-top: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.2));
    font-size: 10px; opacity: 0.82;
  }
</style>
</head>
<body>
<div id="connStatus" class="conn-status" style="display: none;" aria-live="polite"></div>
<div id="discLive" class="disc-live" style="display: none;" aria-live="polite">
  <div class="disc-live-title">Server discovery</div>
  <div id="discActivity" class="disc-live-line"></div>
  <div id="discOutcome" class="disc-live-outcome"></div>
  <div id="discSchedule" class="disc-live-meta"></div>
  <div class="disc-live-actions">
    <button type="button" class="linkish" id="btnPauseDisc">Pause scanning</button>
    <button type="button" class="linkish" id="btnResumeDisc">Resume scanning</button>
    <button type="button" class="linkish" id="btnScanNow">Scan now</button>
  </div>
  <div id="discFaq" class="disc-faq"></div>
</div>
<div id="disconnected" class="disconnected show" aria-live="polite">
  <div id="discTitle" class="disc-title">Not connected</div>
  <div id="discHint" class="disc-hint"></div>
  <div class="disc-actions">
    <button type="button" class="linkish" id="btnOpenLog" title="Open Saropa Drift Advisor output">Output log</button>
    <button type="button" class="linkish" id="btnRetry" title="Re-scan for Drift debug servers">Retry discovery</button>
    <button type="button" class="linkish" id="btnDiagnose" title="Run health check and log details">Diagnose</button>
    <button type="button" class="linkish" id="btnRefreshUi" title="Re-sync sidebar connection state">Refresh UI</button>
    <button type="button" class="linkish" id="btnConnHelp" title="Open connection troubleshooting in your browser">Connection help (web)</button>
  </div>
</div>
<div class="search-box">
  <input id="query" type="text" placeholder="Search schema..." disabled />
</div>
<div id="filters" class="filters disabled">
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
<div id="browseWrap" class="browse-link disabled"><a id="browseAll" href="#">Browse all tables</a></div>
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
  const discTitleEl = document.getElementById('discTitle');
  const discHintEl = document.getElementById('discHint');
  const connStatusEl = document.getElementById('connStatus');
  const discLiveEl = document.getElementById('discLive');
  const discActivityEl = document.getElementById('discActivity');
  const discOutcomeEl = document.getElementById('discOutcome');
  const discScheduleEl = document.getElementById('discSchedule');
  const discFaqEl = document.getElementById('discFaq');
  const btnPauseDisc = document.getElementById('btnPauseDisc');
  const btnResumeDisc = document.getElementById('btnResumeDisc');
  const btnScanNow = document.getElementById('btnScanNow');
  let scope = 'all';
  let typeFilter = '';
  let debounceTimer;
  // Default to disconnected so the banner shows immediately when the panel
  // opens. The extension confirms connection via the 'ready' handshake
  // within milliseconds, hiding the banner if a server is available.
  let connected = false;

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

  document.getElementById('btnOpenLog').addEventListener('click', () => {
    vscode.postMessage({ command: 'openConnectionLog' });
  });
  document.getElementById('btnRetry').addEventListener('click', () => {
    vscode.postMessage({ command: 'retryDiscovery' });
  });
  document.getElementById('btnDiagnose').addEventListener('click', () => {
    vscode.postMessage({ command: 'diagnoseConnection' });
  });
  document.getElementById('btnRefreshUi').addEventListener('click', () => {
    vscode.postMessage({ command: 'refreshConnectionUi' });
  });
  document.getElementById('btnConnHelp').addEventListener('click', () => {
    vscode.postMessage({ command: 'openConnectionHelp' });
  });
  btnPauseDisc.addEventListener('click', () => {
    vscode.postMessage({ command: 'pauseDiscovery' });
  });
  btnResumeDisc.addEventListener('click', () => {
    vscode.postMessage({ command: 'resumeDiscovery' });
  });
  btnScanNow.addEventListener('click', () => {
    vscode.postMessage({ command: 'retryDiscovery' });
  });

  /** Disconnected help: symptom checks without guessing a single root cause. */
  var FAQ_TROUBLE =
    'HTTP features need a selected server (status bar / Select Server) or an active Dart debug session (VM). '
    + 'Bearer auth: set driftViewer.authToken to match the app. Remote/WSL: set driftViewer.host to the machine '
    + 'where the debug server runs. Use Server discovery above for live scan status.';

  function applyDiscoveryBlock(d) {
    if (!d) {
      discLiveEl.style.display = 'none';
      return;
    }
    discLiveEl.style.display = 'block';
    discActivityEl.textContent = d.activity || '';
    discOutcomeEl.textContent = d.lastOutcome || '';
    if (d.scanInFlight) {
      discScheduleEl.textContent = 'Scan in progress\u2026';
    } else if (d.paused) {
      discScheduleEl.textContent = 'Automatic scans paused.';
    } else {
      discScheduleEl.textContent =
        'Next automatic scan in ' + d.nextScanInSec + 's (discovery: ' + d.state + ').';
    }
    btnPauseDisc.style.display = d.paused ? 'none' : 'inline';
    btnResumeDisc.style.display = d.paused ? 'inline' : 'none';
  }

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

  /** Updates the UI to reflect server connection state and troubleshooting hints. */
  function applyConnectionState(msg) {
    connected = msg.connected;
    disconnectedEl.classList.toggle('show', !connected);
    if (!connected) {
      discTitleEl.textContent = msg.label || 'Not connected';
      discHintEl.textContent = msg.hint || '';
      connStatusEl.style.display = 'none';
      connStatusEl.textContent = '';
    } else {
      connStatusEl.style.display = 'block';
      connStatusEl.textContent = msg.label ? ('Connected: ' + msg.label) : 'Connected';
      discTitleEl.textContent = '';
      discHintEl.textContent = '';
    }
    queryEl.disabled = !connected;
    filtersEl.classList.toggle('disabled', !connected);
    browseWrap.classList.toggle('disabled', !connected);
    if (Object.prototype.hasOwnProperty.call(msg, 'discovery')) {
      applyDiscoveryBlock(msg.discovery);
    }
    discFaqEl.textContent = connected ? '' : FAQ_TROUBLE;
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
        errorEl.innerHTML = esc(msg.message || 'Search failed')
          + '<div style="font-size:10px;opacity:0.8;margin-top:6px">Tip: open <b>Output \u2192 Saropa Drift Advisor</b> or use <b>Diagnose</b> in the disconnected banner.</div>';
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
      applyConnectionState(msg);
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

  // Signal the extension host that the webview script is ready to receive
  // messages. Without this handshake, postMessage calls from
  // resolveWebviewView arrive before addEventListener('message', ...)
  // is wired up and the connectionState message is silently dropped.
  vscode.postMessage({ command: 'ready' });
})();
</script>
</body>
</html>`;
}
