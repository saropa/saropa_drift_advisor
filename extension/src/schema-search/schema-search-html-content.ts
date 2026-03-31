/**
 * Client-side JavaScript for the Schema Search webview.
 * CSS styles live in schema-search-html-styles.ts to keep both under the line cap.
 */
export const SCHEMA_SEARCH_SCRIPT = `
(function() {
  // Reuse the API instance from the early handshake script — acquireVsCodeApi()
  // can only be called ONCE per webview. Calling it a second time throws.
  const vscode = window.__vscodeApi || acquireVsCodeApi();
  try {
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
  const schemaHardFallbackEl = document.getElementById('schemaHardFallback');
  let scope = 'all';
  let typeFilter = '';
  let debounceTimer;
  let connected = false;
  /** True while a browse-all request is in-flight or its results are displayed.
   *  Prevents connectionState updates from wiping the results via doSearch(). */
  let browseActive = false;
  /** True when search/browse is allowed (live session or offline cached schema). */
  let schemaOps = false;
  document.querySelectorAll('.scope-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.scope-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      scope = btn.dataset.scope;
      // Switching scope exits browse-all mode — the filters apply to typed searches
      browseActive = false;
      doSearch();
    });
  });
  document.querySelectorAll('.type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      typeFilter = btn.dataset.type;
      // Switching type filter exits browse-all mode — the filters apply to typed searches
      browseActive = false;
      doSearch();
    });
  });
  queryEl.addEventListener('input', () => {
    // User started typing — exit browse-all mode so doSearch() resumes normally
    browseActive = false;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(doSearch, 200);
  });
  document.getElementById('browseAll').addEventListener('click', (e) => {
    e.preventDefault();
    browseActive = true;
    vscode.postMessage({ command: 'searchAll' });
  });
  document.getElementById('btnOpenBrowser').addEventListener('click', () => vscode.postMessage({ command: 'openInBrowser' }));
  document.getElementById('btnTroubleshoot').addEventListener('click', () => vscode.postMessage({ command: 'showTroubleshooting' }));
  document.getElementById('btnOpenLog').addEventListener('click', () => vscode.postMessage({ command: 'openConnectionLog' }));
  document.getElementById('btnRetry').addEventListener('click', () => vscode.postMessage({ command: 'retryDiscovery' }));
  document.getElementById('btnScanDartSchema').addEventListener('click', () => vscode.postMessage({ command: 'scanDartSchema' }));
  document.getElementById('btnDiagnose').addEventListener('click', () => vscode.postMessage({ command: 'diagnoseConnection' }));
  document.getElementById('btnRefreshUi').addEventListener('click', () => vscode.postMessage({ command: 'refreshConnectionUi' }));
  document.getElementById('btnForwardPort').addEventListener('click', () => vscode.postMessage({ command: 'forwardPortAndroid' }));
  document.getElementById('btnSelectServer').addEventListener('click', () => vscode.postMessage({ command: 'selectServer' }));
  document.getElementById('btnConnHelp').addEventListener('click', () => vscode.postMessage({ command: 'openConnectionHelp' }));
  document.getElementById('btnGettingStarted').addEventListener('click', () => vscode.postMessage({ command: 'openGettingStarted' }));
  document.getElementById('btnReportIssue').addEventListener('click', () => vscode.postMessage({ command: 'openReportIssue' }));
  btnPauseDisc.addEventListener('click', () => vscode.postMessage({ command: 'pauseDiscovery' }));
  btnResumeDisc.addEventListener('click', () => vscode.postMessage({ command: 'resumeDiscovery' }));
  btnScanNow.addEventListener('click', () => vscode.postMessage({ command: 'retryDiscovery' }));
  var FAQ_TROUBLE =
    'HTTP features need a selected server (status bar / Select Server) or an active Dart debug session (VM). '
    + 'Bearer auth: set driftViewer.authToken to match the app. Remote/WSL: set driftViewer.host to the machine '
    + 'where the debug server runs. Use Server discovery above for live scan status.';
  function applyDiscoveryBlock(d) {
    if (!d) { discLiveEl.style.display = 'none'; return; }
    discLiveEl.style.display = 'block';
    discActivityEl.textContent = d.activity || '';
    discOutcomeEl.textContent = d.lastOutcome || '';
    if (d.scanInFlight) discScheduleEl.textContent = 'Scan in progress…';
    else if (d.paused) discScheduleEl.textContent = 'Automatic scans paused.';
    else discScheduleEl.textContent = 'Next automatic scan in ' + d.nextScanInSec + 's (discovery: ' + d.state + ').';
    btnPauseDisc.style.display = d.paused ? 'none' : 'inline';
    btnResumeDisc.style.display = d.paused ? 'inline' : 'none';
  }
  function doSearch() {
    const q = queryEl.value.trim();
    if (!q) {
      statusEl.textContent = '';
      errorEl.style.display = 'none';
      errorEl.textContent = '';
      resultsEl.innerHTML = schemaOps ? '<li class="idle">Type to search tables and columns.</li>' : '<li class="idle">Waiting for connection or cached schema…</li>';
      return;
    }
    vscode.postMessage({ command: 'search', query: q, scope, typeFilter: typeFilter || undefined });
  }
  function applyConnectionState(msg) {
    connected = msg.connected;
    schemaOps = !!msg.schemaOperationsEnabled;
    // If schema operations are no longer available, browse results are stale
    if (!schemaOps) browseActive = false;
    var persisted = msg.persistedSchemaAvailable === true;
    var showHelpBanner = !connected || !schemaOps;
    disconnectedEl.classList.toggle('show', showHelpBanner);
    if (!connected && schemaOps) {
      discTitleEl.textContent = msg.label || 'Not connected';
      discHintEl.textContent = msg.hint || '';
      connStatusEl.style.display = 'block';
      connStatusEl.textContent = 'Offline — Schema Search uses last-known schema.';
    } else if (connected && !schemaOps) {
      discTitleEl.textContent = 'Connected — schema not loaded';
      discHintEl.textContent =
        'HTTP/VM reports a connection but table metadata is not available yet (REST may have failed). '
        + 'Use Refresh tree or Diagnose in the Database section, or Scan Dart sources below (works offline).'
        + (msg.hint ? '\\n\\n' + msg.hint : '');
      connStatusEl.style.display = 'none';
      connStatusEl.textContent = '';
    } else if (!connected && !schemaOps) {
      discTitleEl.textContent = persisted
        ? 'Not connected — saved schema in this workspace'
        : 'No Drift debug server connected';
      var p1 = persisted
        ? 'This workspace has a schema snapshot from an earlier session. Use Refresh sidebar UI or the Database tree Refresh button to load it and search offline (when enabled in settings).'
        : 'Run your app with the Drift debug server. There is no saved schema in this workspace yet — connect once so Schema Search and the offline cache can work.';
      discHintEl.textContent = p1 + (msg.hint ? '\\n\\n' + msg.hint : '');
      connStatusEl.style.display = 'none';
      connStatusEl.textContent = '';
    } else {
      connStatusEl.style.display = 'block';
      connStatusEl.textContent = msg.label ? ('Connected: ' + msg.label) : 'Connected';
      discTitleEl.textContent = '';
      discHintEl.textContent = '';
    }
    queryEl.disabled = !schemaOps;
    filtersEl.classList.toggle('disabled', !schemaOps);
    browseWrap.classList.toggle('disabled', !schemaOps);
    if (Object.prototype.hasOwnProperty.call(msg, 'discovery')) applyDiscoveryBlock(msg.discovery);
    discFaqEl.textContent = schemaOps ? '' : FAQ_TROUBLE;
    // Only reset the idle placeholder when the user hasn't triggered browse-all;
    // otherwise a periodic connectionState update would wipe the browse results.
    if (!queryEl.value.trim() && !browseActive) doSearch();
    if (schemaHardFallbackEl) {
      schemaHardFallbackEl.style.display = 'none';
    }
  }
  window.addEventListener('message', e => {
    const msg = e.data;
    if (msg.command === 'loading') {
      if (errorEl) { errorEl.style.display = 'none'; errorEl.textContent = ''; }
      statusEl.textContent = '';
      resultsEl.innerHTML = '<li class="loading">Searching…</li>';
    } else if (msg.command === 'error') {
      // A failed browse should allow the idle placeholder to return on the next
      // connectionState update, so clear the browse-active flag.
      browseActive = false;
      statusEl.textContent = '';
      resultsEl.innerHTML = '';
      if (errorEl) {
        errorEl.innerHTML = esc(msg.message || 'Search failed')
          + '<div style="font-size:10px;opacity:0.8;margin-top:6px">Tip: open <b>Output → Saropa Drift Advisor</b> or use <b>Diagnose</b> in the disconnected banner.</div>';
        errorEl.style.display = 'block';
      }
      const retryBtn = document.createElement('button');
      retryBtn.className = 'retry-btn';
      retryBtn.textContent = 'Retry';
      retryBtn.title = 'Retry the last search or browse request';
      retryBtn.addEventListener('click', () => vscode.postMessage({ command: 'retry' }));
      resultsEl.appendChild(retryBtn);
    } else if (msg.command === 'results') {
      if (errorEl) { errorEl.style.display = 'none'; errorEl.textContent = ''; }
      renderResults(msg.result, msg.crossRefs);
    } else if (msg.command === 'connectionState') {
      applyConnectionState(msg);
    }
  });
  function renderResults(result, crossRefs) {
    statusEl.textContent = result.matches.length ? result.matches.length + ' match' + (result.matches.length !== 1 ? 'es' : '') : '';
    resultsEl.innerHTML = '';
    if (result.matches.length === 0) { resultsEl.innerHTML = '<li class="empty">No matches</li>'; return; }
    const refMap = {};
    for (const ref of (crossRefs || [])) refMap[ref.columnName] = ref;
    let lastTable = '';
    for (const m of result.matches) {
      if (m.type === 'table') {
        lastTable = m.table;
        const li = document.createElement('li');
        li.className = 'result-item result-table';
        li.innerHTML = esc(m.table) + ' <span class="result-meta">' + m.columnCount + ' cols, ' + m.rowCount + ' rows</span>';
        li.addEventListener('click', () => vscode.postMessage({ command: 'navigate', table: m.table, openSource: true }));
        resultsEl.appendChild(li);
      } else {
        if (m.table !== lastTable) {
          lastTable = m.table;
          const hdr = document.createElement('li');
          hdr.className = 'result-item result-table';
          hdr.textContent = m.table;
          hdr.addEventListener('click', () => vscode.postMessage({ command: 'navigate', table: m.table, openSource: true }));
          resultsEl.appendChild(hdr);
        }
        const li = document.createElement('li');
        li.className = 'result-item result-col';
        li.innerHTML = (m.isPk ? '&#x1f511; ' : '') + esc(m.column) + '<span class="result-type">' + esc(m.columnType) + '</span>';
        const colName = m.column || '';
        li.addEventListener('click', () => vscode.postMessage({ command: 'navigate', table: m.table, column: colName, openSource: true }));
        resultsEl.appendChild(li);
        if (m.alsoIn && m.alsoIn.length > 0) {
          const ref = refMap[m.column];
          const xli = document.createElement('li');
          xli.className = 'cross-ref';
          let html = 'also in: ' + m.alsoIn.map(esc).join(', ');
          if (ref && ref.missingFks.length > 0) {
            const missing = ref.missingFks.filter(fk => fk.from === m.table || fk.to === m.table).length;
            if (missing > 0) html += ' <span class="warn">⚠ no FK</span>';
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
  doSearch();
  } catch (e) {
    try {
      const st = document.getElementById('status');
      if (st) st.textContent = 'Schema Search UI failed to initialize. Check Output / Diagnose.';
      const er = document.getElementById('error');
      if (er) {
        er.style.display = 'block';
        er.textContent = (e && e.message) ? e.message : String(e);
      }
    } catch (_) { /* ignore secondary failures */ }
  } finally {
    try { vscode.postMessage({ command: 'ready' }); } catch (_) { /* host still enables delivery */ }
  }
})();
`;
