    /**
     * Web viewer script for the Drift debug server UI (tables, SQL, tools).
     * Type-checked tsconfig.web.json (`npm run typecheck:web`).
     * Do not edit compiled outputs when a TS source exists.
     *
     * Utility functions (esc, setButtonBusy, formatTableRowCountDisplay, etc.)
     * live in utils.ts. PII masking lives in pii.ts. These are imported below.
     *
     * Table definition panel: `buildTableDefinitionHtml` shows PRAGMA-backed column
     * names, types, and PK/NOT NULL flags (from cached `/api/schema/metadata`)
     * above the grid on table tabs and wherever Search "both" mode shows row data.
     *
     * Natural language → SQL (`nlToSql`): **Ask in English…** opens a modal. Typing
     * debounces into `applyNlLivePreview`, which fills `#nl-modal-sql-preview` only;
     * the main `#sql-input` is updated when the user clicks **Use** (`useNlModal`).
     * Conversion errors use `setNlModalError` so run/query errors under the main
     * editor are not cleared by NL failures.
     */
    // --- Module imports (bundled by esbuild) ---
    import { esc, syncFeatureCardExpanded } from './utils.ts';
    import { getDisplayValue } from './pii.ts';
    import * as S from './state.ts';
    import { createShareSession, restoreSession } from './session.ts';
    import { initNlModalListeners } from './nl-modal.ts';
    import { navigateToFk, renderBreadcrumb } from './fk-nav.ts';
    import { tryStartBrowserCellEdit, showCellValuePopup, setupCellValuePopupButtons } from './cell-edit.ts';
    import { renderBarChart, renderStackedBarChart, renderPieChart, renderLineChart, renderAreaChart, renderScatterChart, renderHistogram, exportChartPng, exportChartSvg, exportChartCopy, setupChartResize } from './charts.ts';
    import { initConnectionDeps, hideConnectionBanner, updateLiveIndicatorForConnection, doHeartbeat, stopHeartbeat, startKeepAlive, stopKeepAlive } from './connection.ts';
    import { initTheme, initThemeListeners } from './theme.ts';
    import { clearStaleProjectStorage, getColumnConfig, setColumnConfig, saveTableState, clearTableState, saveNavHistory, loadNavHistory } from './persistence.ts';
    import { getScope, applySearch, nextMatch, prevMatch } from './search.ts';
    import { copyCellValue, renderTableView, initPiiMaskToggle } from './table-view.ts';
    import { loadTable, applyTableListAndCounts, pollGeneration } from './table-list.ts';
    import { initTabsAndToolbar, openTableTab, openTool } from './tabs.ts';
    import { goToOffset, ensureColumnConfig, applyColumnConfigAndRender, populateColumnChooserList } from './pagination.ts';
    import { loadSchemaIntoPre, loadSchemaView, loadBothView } from './schema.ts';
    import { initSidebarCollapse } from './sidebar.ts';
    import { initHistorySidebar } from './history-sidebar.ts';
    import { initDiagram } from './diagram.ts';
    import { initSnapshot, initCompare, initMigrationPreview } from './tools-compare.ts';
    import { initIndexSuggestions, initSizeAnalytics, initAnomalyDetection } from './tools-analytics.ts';
    import { initImport } from './tools-import.ts';
    import { initSearchTab } from './search-tab.ts';
    import { initSqlRunner } from './sql-runner.ts';
    import { initPerformance } from './performance.ts';
    import { applyStoredPrefs, getPref, PREF_CONFIRM_NAVIGATE_AWAY, DEFAULTS } from './settings.ts';
    // Hide the loading overlay injected by html_content.dart.
    // If app.js never loads (all sources fail), the overlay stays visible
    // as a natural error indicator — no JS needed for the error state.
    console.log('[SDA] app.js: executing, window.mastheadStatus=' + (window.mastheadStatus ? 'set' : 'NOT SET'));
    (function(){var el=document.getElementById('sda-loading');if(el)el.style.display='none'})();
    // Purge stale localStorage when the debug server origin changes
    // (i.e. the user switched to a different Flutter project). Must run
    // before any other code reads localStorage.
    clearStaleProjectStorage();
    // Apply user preferences from localStorage before first render so
    // modules pick up custom page sizes, display formats, etc.
    applyStoredPrefs();
    /** Applies capability flags from /api/health: write-enabled, compare-enabled. */
    function applyHealthWriteFlag(data) {
      if (data && typeof data.writeEnabled === 'boolean') S.setDriftWriteEnabled(data.writeEnabled);
      // Show/hide destructive data buttons based on write capability
      var clearTableBtn = document.getElementById('clear-table-data');
      var clearAllBtn = document.getElementById('clear-all-data');
      var show = S.driftWriteEnabled ? '' : 'none';
      if (clearTableBtn) clearTableBtn.style.display = show;
      if (clearAllBtn) clearAllBtn.style.display = show;

      // Toggle compare panel between setup guide and active toolbar
      if (data && typeof data.compareEnabled === 'boolean') S.setDriftCompareEnabled(data.compareEnabled);
      var setupGuide = document.getElementById('compare-setup-guide');
      var activePanel = document.getElementById('compare-active');
      if (setupGuide) setupGuide.style.display = S.driftCompareEnabled ? 'none' : '';
      if (activePanel) activePanel.style.display = S.driftCompareEnabled ? '' : 'none';
    }
    // NL modal event listeners — moved to nl-modal.ts (initNlModalListeners)
    initNlModalListeners();

    /**
     * Registers a beforeunload handler so the browser shows a confirmation dialog
     * when the user closes the tab, refreshes, or navigates away (e.g. back button).
     * preventDefault() and returnValue are required for cross-browser support.
     */
    function setupNavigateAwayConfirmation() {
      window.addEventListener('beforeunload', function (e) {
        // Skip the confirmation dialog when the user has disabled it in Settings
        if (!getPref(PREF_CONFIRM_NAVIGATE_AWAY, DEFAULTS[PREF_CONFIRM_NAVIGATE_AWAY])) return;
        e.preventDefault();
        e.returnValue = '';
        return '';
      });
    }
    setupNavigateAwayConfirmation();
    // Connection state machine: 'connected' | 'disconnected' | 'reconnecting'.
    // This is orthogonal to S.pollingEnabled — S.pollingEnabled controls whether
    // the client WANTS data, S.connectionState tracks whether it CAN reach
    // the server.
    // Consecutive long-poll failure counter. After S.HEALTH_CHECK_THRESHOLD
    // failures the system switches from retrying the long-poll to
    // lightweight /api/health pings, reducing server load and speeding
    // up reconnection detection.
    // Exponential backoff: current delay in ms, capped at S.BACKOFF_MAX_MS.
    // Resets to S.BACKOFF_INITIAL_MS on any successful server response.
    // Backoff tuning constants. Initial=1 s, doubles each failure, max=30 s.
    // Switch to /api/health heartbeat after this many consecutive poll failures.
    // Timer IDs for heartbeat (reconnection) and keep-alive (polling OFF).
    // Whether the user dismissed the connection banner. If dismissed, we
    // won't re-show until the state cycles through connected -> disconnected.
    // When the next heartbeat is scheduled (timestamp). Used for "Next retry in Xs" countdown.
    // True while a health check request is in flight (show "Checking…").
    // Number of reconnection attempts since last connected; shown in diagnostics.
    // Interval ID for updating banner countdown every second; cleared when banner hides.

    // --- Connection management — moved to connection.ts ---

    // Dismiss handler — remember dismissal so we don't re-show
    // until the next full disconnect cycle.
    (function() {
      var dismissBtn = document.getElementById('banner-dismiss');
      if (dismissBtn) {
        dismissBtn.addEventListener('click', function() {
          S.setBannerDismissed(true);
          hideConnectionBanner();
        });
      }
    })();

    // Retry now: trigger an immediate health check and reset backoff for next failure.
    // No-op if already connected or if a check is in flight (avoids duplicate requests).
    (function() {
      var retryBtn = document.getElementById('banner-retry');
      if (retryBtn) {
        retryBtn.addEventListener('click', function() {
          if (S.connectionState !== 'disconnected' && S.connectionState !== 'reconnecting') return;
          if (S.heartbeatInFlight) return;
          stopHeartbeat();
          S.setNextHeartbeatAt(null);
          S.setCurrentBackoffMs(S.BACKOFF_INITIAL_MS);
          doHeartbeat();
        });
      }
    })();
    // --- Query Builder --- moved to query-builder.ts


    // fabThemeBtn click handler, OS theme listener — moved to theme.ts (initThemeListeners)
    initTheme();
    initThemeListeners();

    // PII mask toggle (BUG-015): re-render table and search results when
    // toggled so display matches.  Lives in the toolbar.
    initPiiMaskToggle();

    if (S.DRIFT_VIEWER_AUTH_TOKEN) {
      var schemaLink = document.getElementById('export-schema');
      if (schemaLink) schemaLink.href = '/api/schema';
    }

    var schemaToggle = document.getElementById('schema-toggle');
    if (schemaToggle) {
      schemaToggle.addEventListener('click', function() {
        const el = document.getElementById('schema-collapsible');
        const isCollapsed = el && el.classList.contains('collapsed');
        if (el) el.classList.toggle('collapsed', !isCollapsed);
        syncFeatureCardExpanded(el);
        if (isCollapsed) loadSchemaIntoPre();
      });
    }
    /**
     * Activates the Search tab's self-contained UI.  The Search tab now has
     * its own inline controls (table picker, search input, scope, filter)
     * and loads data independently — no longer copies from the Tables tab.
     */
    function refreshSearchResultsPanel() {
      if (typeof window._stOnActivate === 'function') window._stOnActivate();
    }

    /**
     * Triggers a tool's primary button on tab open when safe: not offline and not already running.
     * @param {string} buttonId - DOM id of the button (e.g. 'size-analyze')
     * @param {{ checkDisabled?: boolean }} opts - checkDisabled: do not click if button.disabled (avoids duplicate in-flight requests)
     */
    function triggerToolButtonIfReady(buttonId, opts) {
      var btn = document.getElementById(buttonId);
      if (!btn || btn.classList.contains('offline-disabled')) return;
      if (opts && opts.checkDisabled && btn.disabled) return;
      btn.click();
    }

    /**
     * Last successful Size analytics JSON (same payload as save/export). When non-null,
     * revisiting the Size tab skips auto-analyze so switching tabs does not re-fetch.
     */

    window.onTabSwitch = function(tabId) {
      if (tabId === 'schema') loadSchemaIntoPre();
      if (tabId === 'diagram' && typeof window.ensureDiagramInited === 'function') window.ensureDiagramInited();
      if (tabId === 'search') refreshSearchResultsPanel();
      // Auto-run when tool tab opens (no manual button click). checkDisabled avoids duplicate runs if analysis already in progress.
      if (tabId === 'index') triggerToolButtonIfReady('index-analyze', { checkDisabled: true });
      // Size: only auto-run once per page session until the user explicitly clicks Analyze again (success updates cache).
      if (tabId === 'size' && S.lastSizeAnalyticsData == null) triggerToolButtonIfReady('size-analyze', { checkDisabled: true });
      if (tabId === 'perf') triggerToolButtonIfReady('perf-refresh', { checkDisabled: true });
      if (tabId === 'anomaly') triggerToolButtonIfReady('anomaly-analyze', { checkDisabled: true });
      // Sync toolbar icon active state with the current tab.
      if (typeof window._toolbarSyncActiveTab === 'function') window._toolbarSyncActiveTab(tabId);
    };

    initTabsAndToolbar();
    initSidebarCollapse();
    initHistorySidebar();

    // Tables / Search / Run SQL are no longer fixed tabs pinned to the tab
    // bar — they're toolbar icons now. Auto-open the Tables tab at startup
    // so the user lands on the familiar browse view instead of an empty
    // tab row. `openTool` is idempotent on repeat calls and also routes
    // through switchTab, so panel visibility and `_toolbarSyncActiveTab`
    // stay in sync.
    openTool('tables');
    initDiagram();
    initSnapshot();
    initCompare();
    initMigrationPreview();
    initIndexSuggestions();
    initSizeAnalytics();
    initAnomalyDetection();
    initImport();
    initSearchTab();
    initSqlRunner();
    initPerformance();

    // Search is now a permanent tab — no toolbar toggle button needed.
    // The sidebar search panel is toggled separately via Ctrl+F when on the Tables tab.

    // Collapsible sections in search/both view: click header to toggle body
    document.addEventListener('click', function(e) {
      var header = e.target.closest('.collapsible-header[data-collapsible]');
      if (!header) return;
      var wrap = header.closest('.search-section-collapsible');
      var body = wrap && wrap.querySelector('.collapsible-body');
      if (body) {
        body.classList.toggle('collapsed');
        wrap.classList.toggle('expanded', !body.classList.contains('collapsed'));
      }
    });








    // Import data: file picker, CSV column mapping (source → table column), and POST /api/import.

    document.getElementById('export-csv').addEventListener('click', function(e) {
      e.preventDefault();
      if (!S.currentTableName || !S.currentTableJson || S.currentTableJson.length === 0) {
        document.getElementById('export-csv-status').textContent = ' Select a table with data first.';
     
   return;
      }
      const statusEl = document.getElementById('export-csv-status');
      statusEl.textContent = ' Preparing…';
      try {
        const keys = Object.keys(S.currentTableJson[0]);
        const rowToCsv = (row) => keys.map(k => {
          const v = row[k];
          const s = getDisplayValue(k, v);
          if (s === '') return '';
          return s.includes(',') || s.includes('"') || s.includes('\n') ? '"' + s.replace(/"/g, '""') + '"' : s;
        }).join(',');
        const csv = [keys.join(','), ...S.currentTableJson.map(rowToCsv)].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = S.currentTableName + '.csv';
        a.click();
        URL.revokeObjectURL(url);
      } catch (err) {
        statusEl.textContent = ' Failed: ' + err.message;
     
   return;
      }
      statusEl.textContent = '';
    });

    // --- JSON export: download current table data as a JSON file ---
    document.getElementById('export-json').addEventListener('click', function(e) {
      e.preventDefault();
      if (!S.currentTableName || !S.currentTableJson || S.currentTableJson.length === 0) {
        document.getElementById('export-json-status').textContent = ' Select a table with data first.';
        return;
      }
      var statusEl = document.getElementById('export-json-status');
      statusEl.textContent = ' Preparing…';
      try {
        var json = JSON.stringify(S.currentTableJson, null, 2);
        var blob = new Blob([json], { type: 'application/json;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = S.currentTableName + '.json';
        a.click();
        URL.revokeObjectURL(url);
      } catch (err) {
        statusEl.textContent = ' Failed: ' + err.message;
        return;
      }
      statusEl.textContent = '';
    });


    // Live highlighting on every character typed
    document.getElementById('search-input').addEventListener('input', applySearch);

    // Keyboard navigation in search input:
    // Enter = next match, Shift+Enter = previous, Escape = clear.
    // Replaces the old keyup→applySearch (input event already handles that).
    document.getElementById('search-input').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) { prevMatch(); } else { nextMatch(); }
      }
      if (e.key === 'Escape') {
        this.value = '';
        applySearch();
        this.blur();
      }
    });

    // Wire prev/next button clicks
    document.getElementById('search-prev').addEventListener('click', prevMatch);
    document.getElementById('search-next').addEventListener('click', nextMatch);

    // Global keyboard shortcuts for search navigation.
    // Ctrl+G / Shift+Ctrl+G = next/prev match (mirrors browser find-next).
    // Ctrl+F = focus our custom search input instead of browser's native find.
    document.addEventListener('keydown', function(e) {
      if (e.ctrlKey && e.key === 'g') {
        e.preventDefault();
        if (e.shiftKey) { prevMatch(); } else { nextMatch(); }
      }
      if (e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        if (S.activeTabId === 'search' && typeof window._stFocusInput === 'function') {
          // On Search tab: focus the inline search input
          window._stFocusInput();
        } else {
          // On other tabs: open sidebar search panel and focus it
          var wrap = document.getElementById('sidebar-search-wrap');
          if (wrap && wrap.classList.contains('collapsed')) {
            wrap.classList.remove('collapsed');
            wrap.setAttribute('aria-hidden', 'false');
          }
          var searchInput = document.getElementById('search-input');
          if (searchInput) { searchInput.focus(); searchInput.select(); }
        }
      }
    });

    document.getElementById('row-filter').addEventListener('input', function() { if (S.currentTableName && S.currentTableJson) { renderTableView(S.currentTableName, S.currentTableJson); saveTableState(S.currentTableName); } });
    document.getElementById('row-filter').addEventListener('keyup', function() { if (S.currentTableName && S.currentTableJson) renderTableView(S.currentTableName, S.currentTableJson); });
    var rowDisplayAll = document.getElementById('row-display-all');
    var rowDisplayMatching = document.getElementById('row-display-matching');
    if (rowDisplayAll) rowDisplayAll.addEventListener('click', function() {
      S.setShowOnlyMatchingRows(false);
      rowDisplayAll.classList.add('active');
      if (rowDisplayMatching) rowDisplayMatching.classList.remove('active');
      if (S.currentTableName && S.currentTableJson) { renderTableView(S.currentTableName, S.currentTableJson); saveTableState(S.currentTableName); }
    });
    if (rowDisplayMatching) rowDisplayMatching.addEventListener('click', function() {
      S.setShowOnlyMatchingRows(true);
      rowDisplayMatching.classList.add('active');
      if (rowDisplayAll) rowDisplayAll.classList.remove('active');
      if (S.currentTableName && S.currentTableJson) { renderTableView(S.currentTableName, S.currentTableJson); saveTableState(S.currentTableName); }
    });
    document.getElementById('search-scope').addEventListener('change', function() {
      const scope = getScope();
      const content = document.getElementById('content');
      const paginationBar = document.getElementById('pagination-bar');
      if (scope === 'both') {
        loadBothView();
        paginationBar.style.display = (S.currentTableName ? 'flex' : 'none');
      } else if (scope === 'schema') {
        loadSchemaView();
        paginationBar.style.display = 'none';
      } else if (S.currentTableName) {
        renderTableView(S.currentTableName, S.currentTableJson);
        paginationBar.style.display = 'flex';
      } else {
        content.innerHTML = '';
        S.setLastRenderedSchema(null);
        S.setLastRenderedData(null);
        paginationBar.style.display = 'none';
      }
      applySearch();
    });

    // =========================================================================
    // Search Tab: self-contained search with inline table picker, scope,
    // filter, and match navigation.  Completely independent of the sidebar
    // search controls (which continue to serve the Tables tab).
    // =========================================================================

    document.getElementById('export-dump').addEventListener('click', function(e) {
      e.preventDefault();
      const link = this;
      const statusEl = document.getElementById('export-dump-status');
      const origText = link.textContent;
      link.textContent = 'Preparing dump…';
      statusEl.textContent = '';
      fetch('/api/dump', S.authOpts())
        .then(r => { if (!r.ok) throw new Error(r.statusText); return r.blob(); })
        .then(blob => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'dump.sql';
          a.click();
          URL.revokeObjectURL(url);
        })
        .catch(err => { statusEl.textContent = ' Failed: ' + err.message; })
        .finally(() => { link.textContent = origText; });
    });

    // Download raw SQLite file (GET /api/database). Requires getDatabaseBytes at server start; 501 → show "Not configured".
    document.getElementById('export-database').addEventListener('click', function(e) {
      e.preventDefault();
      const link = this;
      const statusEl = document.getElementById('export-database-status');
      const origText = link.textContent;
      link.textContent = 'Preparing…';
      statusEl.textContent = '';
      fetch('/api/database', S.authOpts())
        .then(r => {
          if (r.status === 501) return r.json().then(j => { throw new Error(j.error || 'Not configured'); });
          if (!r.ok) throw new Error(r.statusText);
          return r.blob();
        })
        .then(blob => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'database.sqlite';
          a.click();
          URL.revokeObjectURL(url);
        })
        .catch(err => { statusEl.textContent = ' ' + err.message; })
        .finally(() => { link.textContent = origText; });
    });

    document.getElementById('pagination-limit').addEventListener('change', function() { S.setLimit(parseInt(this.value, 10)); saveTableState(S.currentTableName); loadTable(S.currentTableName); });
    document.getElementById('pagination-offset').addEventListener('change', function() { S.setOffset(parseInt(this.value || '0', 10) || 0); });
    document.getElementById('pagination-prev').addEventListener('click', function() { goToOffset(Math.max(0, S.offset - S.limit)); });
    document.getElementById('pagination-next').addEventListener('click', function() { goToOffset(S.offset + S.limit); });
    document.getElementById('pagination-first').addEventListener('click', function() { goToOffset(0); });
    document.getElementById('pagination-last').addEventListener('click', function() {
      const total = S.currentTableName ? (S.tableCounts[S.currentTableName] ?? null) : null;
      if (total == null || total <= 0) return;
      const totalPages = Math.max(1, Math.ceil(total / S.limit));
      goToOffset((totalPages - 1) * S.limit);
    });
    document.getElementById('pagination-apply').addEventListener('click', function() { goToOffset(parseInt(document.getElementById('pagination-offset').value || '0', 10) || 0); });
    // Advanced toggle: show/hide raw offset row
    (function() {
      const toggle = document.getElementById('pagination-advanced-toggle');
      const advanced = document.getElementById('pagination-advanced');
      if (toggle && advanced) {
        toggle.addEventListener('click', function() {
          const collapsed = advanced.classList.toggle('collapsed');
          advanced.style.display = collapsed ? 'none' : 'flex';
          advanced.setAttribute('aria-hidden', collapsed ? 'true' : 'false');
        });
        advanced.style.display = 'none';
      }
    })();
    // Sample button: fetch a random sample of rows from the current table via
    // SELECT * FROM "table" ORDER BY RANDOM() LIMIT N and display in the data view.
    document.getElementById('sample-rows-btn').addEventListener('click', function() {
      if (!S.currentTableName) return;
      var btn = this;
      var origHtml = btn.innerHTML;
      var sampleSize = S.limit || 50;
      var sql = 'SELECT * FROM "' + S.currentTableName.replace(/"/g, '""') + '" ORDER BY RANDOM() LIMIT ' + sampleSize;
      btn.disabled = true;
      btn.textContent = 'Sampling\u2026';
      fetch('/api/sql', S.authOpts({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: sql })
      }))
        .then(function(r) { return r.json().then(function(d) { return { ok: r.ok, data: d }; }); })
        .then(function(o) {
          if (!o.ok) throw new Error(o.data.error || 'Sample query failed');
          var rows = o.data.rows || [];
          S.setCurrentTableJson(rows);
          renderTableView(S.currentTableName, rows);
        })
        .catch(function(err) {
          document.getElementById('content').innerHTML = '<p class="meta">Sample failed: ' + esc(String(err.message || err)) + '</p>';
        })
        .finally(function() { btn.disabled = false; btn.innerHTML = origHtml; });
    });

    document.getElementById('clear-table-state').addEventListener('click', function() {
      clearTableState(S.currentTableName);
      document.getElementById('row-filter').value = '';
      S.setLimit(200);
      S.setOffset(0);
      S.setDisplayFormat('raw');
      var fmtSel = document.getElementById('display-format-toggle');
      if (fmtSel) fmtSel.value = 'raw';
      S.setQueryBuilderActive(false);
      S.setQueryBuilderState(null);
      if (S.currentTableName) loadTable(S.currentTableName);
    });
    // Clear rows: delete all data from the current table (write-enabled only).
    document.getElementById('clear-table-data').addEventListener('click', function() {
      if (!S.driftWriteEnabled || !S.currentTableName) return;
      if (!confirm('Delete ALL rows from "' + S.currentTableName + '"? This cannot be undone.')) return;
      var btn = this;
      btn.disabled = true;
      fetch('/api/edits/apply', S.authOpts({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statements: ['DELETE FROM "' + S.currentTableName.replace(/"/g, '""') + '"'] })
      }))
        .then(function(r) { return r.json().then(function(d) { return { ok: r.ok, data: d }; }); })
        .then(function(o) {
          if (!o.ok) { alert('Clear failed: ' + (o.data.error || 'Unknown error')); return; }
          loadTable(S.currentTableName);
        })
        .catch(function(e) { alert('Clear failed: ' + (e.message || 'Network error')); })
        .finally(function() { btn.disabled = false; });
    });

    // Clear all tables: delete all rows from every known table (write-enabled only).
    document.getElementById('clear-all-data').addEventListener('click', function() {
      if (!S.driftWriteEnabled) return;
      var tables = S.lastKnownTables || [];
      if (tables.length === 0) { alert('No tables loaded.'); return; }
      if (!confirm('Delete ALL rows from ALL ' + tables.length + ' table(s)? This cannot be undone.')) return;
      var btn = this;
      btn.disabled = true;
      // Build one DELETE statement per table; the server runs them in a single transaction.
      var stmts = tables.map(function(t) { return 'DELETE FROM "' + t.replace(/"/g, '""') + '"'; });
      fetch('/api/edits/apply', S.authOpts({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statements: stmts })
      }))
        .then(function(r) { return r.json().then(function(d) { return { ok: r.ok, data: d }; }); })
        .then(function(o) {
          if (!o.ok) { alert('Clear all failed: ' + (o.data.error || 'Unknown error')); return; }
          if (S.currentTableName) loadTable(S.currentTableName);
        })
        .catch(function(e) { alert('Clear all failed: ' + (e.message || 'Network error')); })
        .finally(function() { btn.disabled = false; });
    });

    document.getElementById('display-format-toggle').addEventListener('change', function() {
      S.setDisplayFormat(String(this.value || 'raw'));
      if (S.currentTableName) {
        saveTableState(S.currentTableName);
        if (S.currentTableJson) renderTableView(S.currentTableName, S.currentTableJson);
      }
    });

    // --- Column chooser, context menu, drag-and-drop (BUG-011 sticky, BUG-016 reorder/hide/pin) ---

    document.getElementById('column-chooser-btn').addEventListener('click', function() {
      var panel = document.getElementById('column-chooser');
      if (!S.currentTableName || !S.currentTableJson || !S.currentTableJson.length) {
        panel.style.display = 'none';
        return;
      }
      populateColumnChooserList();
      panel.style.display = 'block';
      panel.setAttribute('aria-hidden', 'false');
    });

    document.getElementById('column-chooser-close').addEventListener('click', function() {
      document.getElementById('column-chooser').style.display = 'none';
      document.getElementById('column-chooser').setAttribute('aria-hidden', 'true');
    });

    document.getElementById('column-chooser-reset').addEventListener('click', function() {
      if (!S.currentTableName) return;
      setColumnConfig(S.currentTableName, null);
      delete S.tableColumnConfig[S.currentTableName];
      document.getElementById('column-chooser').style.display = 'none';
      document.getElementById('column-chooser').setAttribute('aria-hidden', 'true');
      applyColumnConfigAndRender();
    });

    // Context menu: right-click on column header
    document.getElementById('column-context-menu').querySelectorAll('button').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var action = this.getAttribute('data-action');
        var key = S.columnContextMenuTargetKey;
        document.getElementById('column-context-menu').style.display = 'none';
        document.getElementById('column-context-menu').setAttribute('aria-hidden', 'true');
        if (!key || !S.currentTableName || !S.currentTableJson) return;
        var dataKeys = Object.keys(S.currentTableJson[0]);
        var config = ensureColumnConfig(S.currentTableName, dataKeys);
        if (action === 'hide') {
          if (config.hidden.indexOf(key) < 0) config.hidden.push(key);
          setColumnConfig(S.currentTableName, config);
          applyColumnConfigAndRender();
        } else if (action === 'pin') {
          if (config.pinned.indexOf(key) < 0) config.pinned.push(key);
          setColumnConfig(S.currentTableName, config);
          applyColumnConfigAndRender();
        } else if (action === 'unpin') {
          config.pinned = config.pinned.filter(function(k) { return k !== key; });
          setColumnConfig(S.currentTableName, config);
          applyColumnConfigAndRender();
        }
      });
    });

    document.addEventListener('contextmenu', function(e) {
      var th = e.target.closest('.drift-table th');
      if (!th) {
        document.getElementById('column-context-menu').style.display = 'none';
        return;
      }
      e.preventDefault();
      S.setColumnContextMenuTargetKey(th.getAttribute('data-column-key'));
      var menu = document.getElementById('column-context-menu');
      var config = getColumnConfig(S.currentTableName);
      var pinned = config && config.pinned && config.pinned.indexOf(S.columnContextMenuTargetKey) >= 0;
      menu.querySelector('[data-action="hide"]').style.display = 'block';
      menu.querySelector('[data-action="pin"]').style.display = pinned ? 'none' : 'block';
      menu.querySelector('[data-action="unpin"]').style.display = pinned ? 'block' : 'none';
      menu.style.left = (e.clientX + 2) + 'px';
      menu.style.top = (e.clientY + 2) + 'px';
      menu.style.display = 'block';
      menu.setAttribute('aria-hidden', 'false');
    });

    document.addEventListener('click', function(e) {
      document.getElementById('column-context-menu').style.display = 'none';
      document.getElementById('column-context-menu').setAttribute('aria-hidden', 'true');
      var chooser = document.getElementById('column-chooser');
      if (chooser && chooser.style.display === 'block' && !chooser.contains(/** @type {Node} */ (e.target)) && e.target.id !== 'column-chooser-btn') {
        chooser.style.display = 'none';
        chooser.setAttribute('aria-hidden', 'true');
      }
    });

    // Drag-and-drop column reordering
    document.addEventListener('dragstart', function(e) {
      var th = e.target.closest('.drift-table th');
      if (!th) return;
      S.setColumnDragKey(th.getAttribute('data-column-key'));
      if (!S.columnDragKey) return;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', S.columnDragKey);
      e.dataTransfer.setData('application/x-column-key', S.columnDragKey);
    });

    document.addEventListener('dragover', function(e) {
      var th = e.target.closest('.drift-table th');
      if (!th) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      document.querySelectorAll('.drift-table th.drag-over').forEach(function(el) { el.classList.remove('drag-over'); });
      th.classList.add('drag-over');
    });

    document.addEventListener('dragleave', function(e) {
      if (e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.drift-table')) return;
      document.querySelectorAll('.drift-table th.drag-over').forEach(function(el) { el.classList.remove('drag-over'); });
    });

    document.addEventListener('drop', function(e) {
      var th = e.target.closest('.drift-table th');
      if (!th) return;
      e.preventDefault();
      th.classList.remove('drag-over');
      var dropKey = th.getAttribute('data-column-key');
      var dragKey = e.dataTransfer.getData('application/x-column-key') || S.columnDragKey;
      if (!dragKey || !dropKey || dragKey === dropKey || !S.currentTableName || !S.currentTableJson) return;
      var dataKeys = Object.keys(S.currentTableJson[0]);
      var config = ensureColumnConfig(S.currentTableName, dataKeys);
      var visibleOrder = config.order.filter(function(k) { return config.hidden.indexOf(k) < 0; });
      var dragIdx = visibleOrder.indexOf(dragKey);
      var dropIdx = visibleOrder.indexOf(dropKey);
      if (dragIdx < 0 || dropIdx < 0) return;
      visibleOrder.splice(dragIdx, 1);
      visibleOrder.splice(dropIdx, 0, dragKey);
      config.order = visibleOrder.concat(config.order.filter(function(k) { return config.hidden.indexOf(k) >= 0; }));
      setColumnConfig(S.currentTableName, config);
      applyColumnConfigAndRender();
    });

    document.addEventListener('dragend', function(e) {
      if (e.target.closest('.drift-table th')) {
        document.querySelectorAll('.drift-table th.drag-over').forEach(function(el) { el.classList.remove('drag-over'); });
      }
    });


    document.addEventListener('click', function(e) {
      var copyBtn = e.target.closest('.cell-copy-btn');
      if (copyBtn) {
        e.preventDefault();
        e.stopPropagation();
        copyCellValue(copyBtn.getAttribute('data-raw') || '');
        return;
      }
      var link = e.target.closest('.fk-link');
      if (!link) return;
      e.preventDefault();
      navigateToFk(link.dataset.table, link.dataset.column, link.dataset.value);
    });
    document.addEventListener('dblclick', function(e) {
      var td = e.target.closest('.drift-table td');
      if (!td) return;
      if (S.driftWriteEnabled && !e.shiftKey && !td.querySelector('input.cell-inline-editor')) {
        e.preventDefault();
        e.stopPropagation();
        tryStartBrowserCellEdit(td);
        return;
      }
      var copyBtn = td.querySelector('.cell-copy-btn');
      var rawValue = copyBtn ? (copyBtn.getAttribute('data-raw') || '') : (td.textContent || '').trim();
      var columnKey = td.getAttribute('data-column-key') || '';
      showCellValuePopup(rawValue, columnKey);
    });

    setupCellValuePopupButtons();


    // --- Chart rendering (pure SVG, no dependencies). BUG-008: responsive, axis labels, export, title. ---

    /** Last render state for resize re-run and export. */

    document.getElementById('chart-render').addEventListener('click', function() {
      var type = document.getElementById('chart-type').value;
      var xKey = document.getElementById('chart-x').value;
      var yKey = document.getElementById('chart-y').value;
      var titleInput = document.getElementById('chart-title-input');
      var title = titleInput ? titleInput.value : '';
      var container = document.getElementById('chart-svg-wrap');
      var rows = window._chartRows || [];
      if (type === 'none' || rows.length === 0) {
        document.getElementById('chart-container').style.display = 'none';
        S.setLastChartState(null);
        return;
      }
      var chartData = rows;
      if (rows.length > 500) {
        var nth = Math.ceil(rows.length / 500);
        chartData = rows.filter(function(_, i) { return i % nth === 0; });
      }
      var opts = { title: title, description: '', xLabel: xKey, yLabel: yKey };
      S.setLastChartState({ type: type, xKey: xKey, yKey: yKey, data: chartData, opts: opts });

      if (type === 'bar') renderBarChart(container, chartData, xKey, yKey, opts);
      else if (type === 'stacked-bar') renderStackedBarChart(container, chartData, xKey, yKey, opts);
      else if (type === 'pie') renderPieChart(container, chartData, xKey, yKey, opts);
      else if (type === 'line') renderLineChart(container, chartData, xKey, yKey, opts);
      else if (type === 'area') renderAreaChart(container, chartData, xKey, yKey, opts);
      else if (type === 'scatter') renderScatterChart(container, chartData, xKey, yKey, opts);
      else if (type === 'histogram') renderHistogram(container, chartData, yKey, 10, opts);
    });

    document.getElementById('chart-export-png').addEventListener('click', exportChartPng);
    document.getElementById('chart-export-svg').addEventListener('click', exportChartSvg);
    document.getElementById('chart-export-copy').addEventListener('click', exportChartCopy);

    /** Responsive: re-render chart when wrapper is resized. Throttled to avoid excessive redraws. */
    setupChartResize();


    // --- Wire connection.ts dependencies ---
    // connection.ts needs callbacks that live in app.js / table-list.ts.
    // Without this call, heartbeat reconnection silently no-ops.
    initConnectionDeps({
      applyHealthWriteFlag: applyHealthWriteFlag,
      pollGeneration: pollGeneration,
    });
    console.log('[SDA] app.js: initConnectionDeps wired');

    // --- Polling toggle: read initial state + wire masthead pill click ---
    // Read server-side change-detection state on page load.
    console.log('[SDA] app.js: fetching /api/change-detection');
    fetch('/api/change-detection', S.authOpts())
      .then(function(r) { return r.json(); })
      .then(function(data) {
        S.setPollingEnabled(data.changeDetection !== false);
        console.log('[SDA] app.js: change-detection initial state: polling=' + S.pollingEnabled);
        updateLiveIndicatorForConnection();
      })
      .catch(function() { /* keep default ON */ });

    // Wire the masthead pill click to toggle change-detection polling.
    // mastheadStatus is set by index.js bridge AFTER app.js runs
    // synchronously, but this setTimeout(0) defers until the bridge
    // has executed.
    setTimeout(function() {
      if (window.mastheadStatus) {
        window.mastheadStatus.onToggle = function() {
          // Only toggle when connected (masthead.ts disables the button when offline).
          if (S.connectionState !== 'connected') return;
          window.mastheadStatus.setBusy();
          var newState = !S.pollingEnabled;
          console.log('[SDA] onToggle: requesting polling=' + newState);
          var opts = S.authOpts();
          fetch('/api/change-detection', Object.assign({}, opts, {
            method: 'POST',
            headers: Object.assign({ 'Content-Type': 'application/json' },
              (opts.headers || {})),
            body: JSON.stringify({ enabled: newState })
          }))
            .then(function(r) { return r.json(); })
            .then(function(data) {
              S.setPollingEnabled(data.changeDetection !== false);
              console.log('[SDA] onToggle: server confirmed polling=' + S.pollingEnabled);
            })
            .catch(function(e) {
              console.error('[SDA] onToggle: failed to toggle polling:', e);
            })
            .finally(function() {
              updateLiveIndicatorForConnection();
              if (!S.pollingEnabled && S.connectionState === 'connected') {
                startKeepAlive();
              } else {
                stopKeepAlive();
              }
            });
        };
        console.log('[SDA] app.js: onToggle wired to mastheadStatus');
      } else {
        console.warn('[SDA] app.js: window.mastheadStatus not available for onToggle wiring');
      }
    }, 0);

    console.log('[SDA] app.js: fetching /api/tables');
    fetch('/api/tables', S.authOpts())
      .then(r => r.json())
      .then(data => {
        const loadingEl = document.getElementById('tables-loading');
        if (loadingEl) {
          loadingEl.style.display = 'none';
          loadingEl.setAttribute('aria-busy', 'false');
        }

        // applyTableListAndCounts returns the extracted
        // tables array for nav history and deep-link use.
        var tables = applyTableListAndCounts(data);
        console.log('[SDA] app.js: /api/tables OK, ' + tables.length + ' tables — starting pollGeneration');
        pollGeneration();

        // Restore FK breadcrumb trail from localStorage.  We do this
        // after the table list is loaded so we can validate that every
        // table in the restored trail still exists in the database.
        var restoredTable = loadNavHistory();
        if (S.navHistory.length > 0) {
          // Validate that every table in the restored trail still exists.
          // If a table was dropped since the trail was saved, truncate
          // the trail at that point to avoid broken breadcrumb links.
          var originalLength = S.navHistory.length;
          for (var i = 0; i < S.navHistory.length; i++) {
            if (tables.indexOf(S.navHistory[i].table) < 0) {
              S.navHistory.length = i;
              break;
            }
          }
          // Persist the truncated trail so next refresh doesn't
          // re-load stale entries that reference dropped tables.
          if (S.navHistory.length !== originalLength) {
            saveNavHistory();
          }
        }

        // Deep link: URL hash #TableName (e.g. from IDE extension) auto-loads that table.
        var hash = '';
        if (location.hash && location.hash.length > 1) {
          try { hash = decodeURIComponent(location.hash.slice(1)); } catch (e) { }
        }
        if (hash && tables.indexOf(hash) >= 0) {
          // Hash deep-link takes priority over the restored breadcrumb.
          // Open in its own tab so it appears in the tab bar.
          openTableTab(hash);
        } else if (restoredTable && tables.indexOf(restoredTable) >= 0 && S.navHistory.length > 0) {
          // No hash deep-link, but we have a restored breadcrumb trail --
          // load the table the user was viewing when they last refreshed.
          openTableTab(restoredTable);
        }

        // Render the breadcrumb bar if the trail is non-empty, so the
        // user sees their restored navigation path.
        if (S.navHistory.length > 0) {
          renderBreadcrumb();
        }
      })
      .catch(e => {
        console.log('[SDA] app.js: /api/tables FAILED', e);
        // Keep the sidebar block visible: hide skeleton rows and show role=alert text.
        var wrap = document.getElementById('tables-loading');
        if (!wrap) return;
        var sk = wrap.querySelector('.tables-skeleton');
        var errEl = document.getElementById('tables-loading-error');
        if (sk) sk.style.display = 'none';
        wrap.setAttribute('aria-busy', 'false');
        if (errEl) {
          errEl.hidden = false;
          errEl.textContent = 'Failed to load tables: ' + e;
        }
      });

    // Fetch server version from health endpoint and display in header badge.
    // Also loads enhanced CSS from jsDelivr CDN, version-pinned to this
    // release tag. Falls back gracefully to inline styles if the CDN is
    // unreachable, the tag doesn't exist yet, or the user is offline.
    console.log('[SDA] app.js: fetching /api/health for version');
    fetch('/api/health', S.authOpts())
      .then(function(r) { return r.json(); })
      .then(function(d) {
        console.log('[SDA] app.js: /api/health OK, version=' + (d.version || '?'));
        applyHealthWriteFlag(d);
        if (d.version) {
          // Show version badge in the page header (links to Marketplace changelog).
          var badge = document.getElementById('version-badge');
          badge.textContent = 'v' + d.version;
          badge.title = 'v' + d.version + ' — View changelog';
          badge.style.opacity = '1';

          // Premium theme effects (glassmorphism, aurora gradients, animations)
          // are built into style.css -- no external CDN stylesheet needed.
        }
      })
      .catch(function() { /* version badge stays hidden on failure */ });
    var shareBtn = document.getElementById('tb-share-btn');
    if (shareBtn) shareBtn.addEventListener('click', createShareSession);
    restoreSession();

