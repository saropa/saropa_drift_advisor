    /* Web viewer script. Type-checked with tsconfig.web.json (npm run typecheck:web). Do not edit compiled outputs when a TS source exists. */
    var DRIFT_VIEWER_AUTH_TOKEN = "";
    function authOpts(o) {
      o = o || {}; o.headers = o.headers || {};
      if (DRIFT_VIEWER_AUTH_TOKEN) o.headers['Authorization'] = 'Bearer ' + DRIFT_VIEWER_AUTH_TOKEN;
      return o;
    }
    // --- Natural language to SQL ---
    var schemaMeta = null;
    async function loadSchemaMeta() {
      if (schemaMeta) return schemaMeta;
      var r = await fetch('/api/schema/metadata', authOpts());
      if (!r.ok) throw new Error('Failed to load schema metadata (HTTP ' + r.status + ')');
      schemaMeta = await r.json();
      return schemaMeta;
    }
    function nlToSql(question, meta) {
      var q = question.toLowerCase().trim();
      var tables = meta.tables || [];
      var target = null;
      for (var i = 0; i < tables.length; i++) {
        var t = tables[i];
        var name = t.name.toLowerCase();
        var singular = name.endsWith('s') ? name.slice(0, -1) : name;
        if (q.includes(name) || q.includes(singular)) { target = t; break; }
      }

      if (!target && tables.length === 1) target = tables[0];
      if (!target) return { sql: null, error: 'Could not identify a table from your question.' };
      var mentioned = target.columns.filter(function (c) {
        return q.includes(c.name.toLowerCase().replace(/_/g, ' ')) || q.includes(c.name.toLowerCase());
      });
      var selectCols = mentioned.length > 0
        ? mentioned.map(function (c) { return '"' + c.name + '"'; }).join(', ')
        : '*';
      var sql = '';
      var tn = '"' + target.name + '"';
      if (/how many|count|total number/i.test(q)) {
        sql = 'SELECT COUNT(*) FROM ' + tn;
      } else if (/average|avg|mean/i.test(q)) {
        var numCol = (mentioned.find(function (c) { return /int|real|num|float/i.test(c.type); })) ||
          target.columns.find(function (c) { return /int|real|num|float/i.test(c.type); });
        sql = numCol ? 'SELECT AVG("' + numCol.name + '") FROM ' + tn : 'SELECT * FROM ' + tn + ' LIMIT 50';
      } else if (/sum|total\b/i.test(q) && !/total number/i.test(q)) {
        var numCol = (mentioned.find(function (c) { return /int|real|num|float/i.test(c.type); })) ||
          target.columns.find(function (c) { return /int|real|num|float/i.test(c.type); });
        sql = numCol ? 'SELECT SUM("' + numCol.name + '") FROM ' + tn : 'SELECT * FROM ' + tn + ' LIMIT 50';
      } else if (/max|maximum|highest|largest|biggest/i.test(q)) {
        var numCol = (mentioned.find(function (c) { return /int|real|num|float/i.test(c.type); })) ||
          target.columns.find(function (c) { return /int|real|num|float/i.test(c.type); });
        sql = numCol ? 'SELECT MAX("' + numCol.name + '") FROM ' + tn : 'SELECT * FROM ' + tn + ' ORDER BY 1 DESC LIMIT 1';
      } else if (/min|minimum|lowest|smallest/i.test(q)) {
        var numCol = (mentioned.find(function (c) { return /int|real|num|float/i.test(c.type); })) ||
          target.columns.find(function (c) { return /int|real|num|float/i.test(c.type); });
        sql = numCol ? 'SELECT MIN("' + numCol.name + '") FROM ' + tn : 'SELECT * FROM ' + tn + ' ORDER BY 1 ASC LIMIT 1';
      } else if (/distinct|unique/i.test(q)) {
        var col = mentioned[0] || target.columns[1] || target.columns[0];
        sql = 'SELECT DISTINCT "' + col.name + '" FROM ' + tn;
      } else if (/latest|newest|most recent|last (\d+)/i.test(q)) {
        var dateCol = target.columns.find(function (c) { return /date|time|created|updated/i.test(c.name); });
        var match = q.match(/last (\d+)/i);
        var limit = match ? parseInt(match[1]) : 10;
        sql = 'SELECT ' + selectCols + ' FROM ' + tn + (dateCol ? ' ORDER BY "' + dateCol.name + '" DESC' : '') + ' LIMIT ' + limit;
      } else if (/oldest|earliest|first (\d+)/i.test(q)) {
        var dateCol = target.columns.find(function (c) { return /date|time|created|updated/i.test(c.name); });
        var match2 = q.match(/first (\d+)/i);
        var limit = match2 ? parseInt(match2[1]) : 10;
        sql = 'SELECT ' + selectCols + ' FROM ' + tn + (dateCol ? ' ORDER BY "' + dateCol.name + '" ASC' : '') + ' LIMIT ' + limit;
      } else if (/group by|per\s+\w+|by\s+\w+/i.test(q)) {
        var groupCol = mentioned[0] || target.columns[1] || target.columns[0];
        sql = 'SELECT "' + groupCol.name + '", COUNT(*) AS count FROM ' + tn + ' GROUP BY "' + groupCol.name + '" ORDER BY count DESC';
      } else {
        sql = 'SELECT ' + selectCols + ' FROM ' + tn + ' LIMIT 50';
      }
      return { sql: sql, table: target.name };
    }

    function esc(s) {
      if (s == null) return '';
      const d = document.createElement('div');
      d.textContent = s;
      return d.innerHTML;
    }

    // --- Saved analysis results (localStorage). BUG-014: persist index/size/perf/anomaly
    // results so users can save, export, recall from History, and compare before/after.
    var ANALYSIS_STORAGE_PREFIX = 'saropa_analysis_';
    var ANALYSIS_MAX_SAVED = 50;

    function analysisStorageKey(type) {
      return ANALYSIS_STORAGE_PREFIX + type;
    }

    function getSavedAnalyses(type) {
      try {
        var raw = localStorage.getItem(analysisStorageKey(type));
        if (!raw) return [];
        var list = JSON.parse(raw);
        return Array.isArray(list) ? list : [];
      } catch (e) {
        return [];
      }
    }

    function saveAnalysis(type, data) {
      if (!data) return null;
      var list = getSavedAnalyses(type);
      var id = 'id_' + Date.now();
      var label = new Date().toLocaleString();
      list.unshift({ id: id, savedAt: label, data: data });
      if (list.length > ANALYSIS_MAX_SAVED) list.length = ANALYSIS_MAX_SAVED;
      try {
        localStorage.setItem(analysisStorageKey(type), JSON.stringify(list));
        return id;
      } catch (e) {
        return null;
      }
    }

    function getSavedAnalysisById(type, id) {
      var list = getSavedAnalyses(type);
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === id) return list[i];
      }
      return null;
    }

    function downloadJSON(data, filename) {
      var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename || 'analysis.json';
      a.click();
      URL.revokeObjectURL(a.href);
    }

    function populateHistorySelect(selectEl, type) {
      if (!selectEl) return;
      var list = getSavedAnalyses(type);
      var value = selectEl.value;
      selectEl.innerHTML = '<option value="">— Past runs —</option>';
      list.forEach(function (item) {
        var opt = document.createElement('option');
        opt.value = item.id;
        opt.textContent = item.savedAt;
        selectEl.appendChild(opt);
      });
      if (value) selectEl.value = value;
    }

    /** Before/after comparison modal for analysis results. */
    function showAnalysisCompare(type, title, savedList, currentData, renderFn, summaryFn) {
      var overlay = document.getElementById('analysis-compare-overlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'analysis-compare-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;';
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', 'Compare analysis results');
        document.body.appendChild(overlay);
      }
      var beforeId = '';
      var afterId = '';
      var beforeData = null;
      var afterData = null;
      function getData(optionValue) {
        if (optionValue === '_current') return currentData;
        if (!optionValue) return null;
        for (var i = 0; i < savedList.length; i++) {
          if (savedList[i].id === optionValue) return savedList[i].data;
        }
        return null;
      }
      function updateSummary() {
        beforeData = getData(beforeId);
        afterData = getData(afterId);
        summaryEl.textContent = summaryFn ? summaryFn(beforeData, afterData) : 'Select Before and After to compare.';
        if (beforeData && afterData && renderFn) {
          leftPanel.innerHTML = renderFn(beforeData);
          rightPanel.innerHTML = renderFn(afterData);
        } else {
          leftPanel.innerHTML = beforeData ? renderFn(beforeData) : '<p class="meta">Select Before.</p>';
          rightPanel.innerHTML = afterData ? renderFn(afterData) : '<p class="meta">Select After.</p>';
        }
      }
      var panel = document.createElement('div');
      panel.style.cssText = 'background:var(--bg, #fff);color:var(--fg, #111);padding:1rem;border-radius:8px;max-width:95vw;max-height:90vh;overflow:auto;box-shadow:0 4px 20px rgba(0,0,0,0.3);';
      panel.innerHTML = '<h3 style="margin:0 0 0.75rem;">Compare: ' + esc(title) + '</h3>';
      var toolbar = document.createElement('div');
      toolbar.className = 'toolbar';
      toolbar.style.marginBottom = '0.5rem';
      var beforeLabel = document.createElement('label');
      beforeLabel.textContent = 'Before:';
      var beforeSel = document.createElement('select');
      beforeSel.id = 'compare-before';
      beforeSel.innerHTML = '<option value="">— select —</option><option value="_current">Current result</option>';
      (savedList || []).forEach(function (item) {
        var opt = document.createElement('option');
        opt.value = item.id;
        opt.textContent = item.savedAt;
        beforeSel.appendChild(opt);
      });
      var afterLabel = document.createElement('label');
      afterLabel.textContent = 'After:';
      var afterSel = document.createElement('select');
      afterSel.id = 'compare-after';
      afterSel.innerHTML = '<option value="">— select —</option><option value="_current">Current result</option>';
      (savedList || []).forEach(function (item) {
        var opt = document.createElement('option');
        opt.value = item.id;
        opt.textContent = item.savedAt;
        afterSel.appendChild(opt);
      });
      var closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.textContent = 'Close';
      toolbar.appendChild(beforeLabel);
      toolbar.appendChild(beforeSel);
      toolbar.appendChild(afterLabel);
      toolbar.appendChild(afterSel);
      toolbar.appendChild(closeBtn);
      panel.appendChild(toolbar);
      var summaryEl = document.createElement('p');
      summaryEl.className = 'meta';
      summaryEl.style.marginBottom = '0.5rem';
      summaryEl.textContent = 'Select Before and After to compare.';
      panel.appendChild(summaryEl);
      var columns = document.createElement('div');
      columns.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:1rem;';
      var leftPanel = document.createElement('div');
      leftPanel.style.cssText = 'border:1px solid var(--border);padding:0.5rem;border-radius:4px;max-height:50vh;overflow:auto;';
      leftPanel.innerHTML = '<p class="meta">Select Before.</p>';
      var rightPanel = document.createElement('div');
      rightPanel.style.cssText = 'border:1px solid var(--border);padding:0.5rem;border-radius:4px;max-height:50vh;overflow:auto;';
      rightPanel.innerHTML = '<p class="meta">Select After.</p>';
      columns.appendChild(leftPanel);
      columns.appendChild(rightPanel);
      panel.appendChild(columns);
      overlay.innerHTML = '';
      overlay.appendChild(panel);
      beforeSel.addEventListener('change', function() { beforeId = this.value; updateSummary(); });
      afterSel.addEventListener('change', function() { afterId = this.value; updateSummary(); });
      function closeOverlay() {
        overlay.style.display = 'none';
        document.removeEventListener('keydown', escapeHandler);
      }
      function escapeHandler(e) { if (e.key === 'Escape') closeOverlay(); }
      closeBtn.addEventListener('click', closeOverlay);
      overlay.addEventListener('click', function(e) { if (e.target === overlay) closeOverlay(); });
      document.addEventListener('keydown', escapeHandler);
      overlay.style.display = 'flex';
    }

    function escapeRe(s) {
      return s.replace(/[\\\\^\$*+?.()|[\\]{}]/g, '\\\\\$&');
    }
    function highlightText(text, term) {
      if (!term || term.length === 0) return esc(text);
      const re = new RegExp('(' + escapeRe(term) + ')', 'gi');
      var result = '';
      var lastEnd = 0;
      var match;
      while ((match = re.exec(text)) !== null) {
        result += esc(text.slice(lastEnd, match.index)) + '<span class="highlight">' + esc(match[1]) + '</span>';
        lastEnd = re.lastIndex;
      }
      result += esc(text.slice(lastEnd));
      return result;
    }
    function renderDiffRows(rows, type) {
      if (rows.length === 0) return '';
      var keys = Object.keys(rows[0]);
      var bgColor = type === 'added' ? 'rgba(124,179,66,0.15)' : 'rgba(229,115,115,0.15)';
      var html = '<table style="border-collapse:collapse;width:100%;font-size:11px;margin-bottom:0.3rem;">';
      html += '<tr>' + keys.map(function(k) {
        return '<th style="border:1px solid var(--border);padding:2px 4px;">' + esc(k) + '</th>';
      }).join('') + '</tr>';
      rows.forEach(function(r) {
        html += '<tr style="background:' + bgColor + ';">' + keys.map(function(k) {
          return '<td style="border:1px solid var(--border);padding:2px 4px;">' + esc(String(r[k] != null ? r[k] : '')) + '</td>';
        }).join('') + '</tr>';
      });
      html += '</table>';
      return html;
    }
    function renderRowDiff(container, tables) {
      var html = '';
      tables.forEach(function(t) {
        html += '<h4 style="margin:0.5rem 0 0.25rem;">' + esc(t.table) + '</h4>';
        html += '<p class="meta">Then: ' + t.countThen + ' rows | Now: ' + t.countNow + ' rows</p>';
        if (!t.hasPk) {
          html += '<p class="meta" style="color:var(--muted);">No primary key \u2014 showing counts only.</p>';
          html += '<p class="meta">Added: ' + t.added + ' | Removed: ' + t.removed + ' | Unchanged: ' + t.unchanged + '</p>';
       
   return;
        }
        if (t.addedRows && t.addedRows.length > 0) {
          html += '<p class="meta" style="color:#7cb342;">+ ' + t.addedRows.length + ' added:</p>';
          html += renderDiffRows(t.addedRows, 'added');
        }
        if (t.removedRows && t.removedRows.length > 0) {
          html += '<p class="meta" style="color:#e57373;">- ' + t.removedRows.length + ' removed:</p>';
          html += renderDiffRows(t.removedRows, 'removed');
        }
        if (t.changedRows && t.changedRows.length > 0) {
          html += '<p class="meta" style="color:#ffb74d;">~ ' + t.changedRows.length + ' changed:</p>';
          t.changedRows.forEach(function(cr) {
            var keys = Object.keys(cr.now);
            var changed = new Set(cr.changedColumns || []);
            html += '<table style="border-collapse:collapse;width:100%;font-size:11px;margin-bottom:0.4rem;">';
            html += '<tr>' + keys.map(function(k) {
              return '<th style="border:1px solid var(--border);padding:2px 4px;' + (changed.has(k) ? 'background:rgba(255,183,77,0.2);' : '') + '">' + esc(k) + '</th>';
            }).join('') + '</tr>';
            html += '<tr>' + keys.map(function(k) {
              var isChanged = changed.has(k);
              return '<td style="border:1px solid var(--border);padding:2px 4px;' + (isChanged ? 'background:rgba(229,115,115,0.2);text-decoration:line-through;' : '') + '">' + esc(String(cr.then[k] != null ? cr.then[k] : '')) + '</td>';
            }).join('') + '</tr>';
            html += '<tr>' + keys.map(function(k) {
              var isChanged = changed.has(k);
              return '<td style="border:1px solid var(--border);padding:2px 4px;' + (isChanged ? 'background:rgba(124,179,66,0.2);font-weight:bold;' : '') + '">' + esc(String(cr.now[k] != null ? cr.now[k] : '')) + '</td>';
            }).join('') + '</tr>';
            html += '</table>';
          });
        }
        if ((!t.addedRows || t.addedRows.length === 0) && (!t.removedRows || t.removedRows.length === 0) && (!t.changedRows || t.changedRows.length === 0)) {
          html += '<p class="meta" style="color:#7cb342;">No changes detected.</p>';
        }
      });
      container.innerHTML = html;
    }
    const THEME_KEY = 'drift-viewer-theme';
    // SQL runner query history: persist the last N successful SQL statements (not results)
    // so repeat checks are quick while keeping localStorage small.
    const SQL_HISTORY_KEY = 'drift-viewer-sql-history';
    const SQL_HISTORY_MAX = 20;
    const LIMIT_OPTIONS = [50, 200, 500, 1000];
    let cachedSchema = null;
    let currentTableName = null;
    let currentTableJson = null;
    let lastRenderedSchema = null;
    let lastRenderedData = null;
    let limit = 200;
    let offset = 0;
    let tableCounts = {};
    let rowFilter = '';
    let lastGeneration = 0;
    let refreshInFlight = false;

    // --- Search navigation state ---
    // Array of all DOM elements with class 'highlight' from the most recent search.
    // Built by applySearch() each time the search term or scope changes.
    let searchMatches = [];
    // Zero-based index of the currently active (focused) match, or -1 if none.
    let searchCurrentIndex = -1;

    // --- Connection health state ---
    // Connection state machine: 'connected' | 'disconnected' | 'reconnecting'.
    // This is orthogonal to pollingEnabled — pollingEnabled controls whether
    // the client WANTS data, connectionState tracks whether it CAN reach
    // the server.
    var connectionState = 'connected';
    // Consecutive long-poll failure counter. After HEALTH_CHECK_THRESHOLD
    // failures the system switches from retrying the long-poll to
    // lightweight /api/health pings, reducing server load and speeding
    // up reconnection detection.
    var consecutivePollFailures = 0;
    // Exponential backoff: current delay in ms, capped at BACKOFF_MAX_MS.
    // Resets to BACKOFF_INITIAL_MS on any successful server response.
    var currentBackoffMs = 1000;
    // Backoff tuning constants. Initial=1 s, doubles each failure, max=30 s.
    var BACKOFF_INITIAL_MS = 1000;
    var BACKOFF_MAX_MS = 30000;
    var BACKOFF_MULTIPLIER = 2;
    // Switch to /api/health heartbeat after this many consecutive poll failures.
    var HEALTH_CHECK_THRESHOLD = 3;
    // Timer IDs for heartbeat (reconnection) and keep-alive (polling OFF).
    var heartbeatTimerId = null;
    var keepAliveTimerId = null;
    var KEEP_ALIVE_INTERVAL_MS = 15000;
    // Whether the user dismissed the connection banner. If dismissed, we
    // won't re-show until the state cycles through connected -> disconnected.
    var bannerDismissed = false;

    // --- Connection state transitions ---

    // Transition to 'disconnected'. Shows the banner, disables
    // server-dependent controls, updates the live indicator to red.
    function setDisconnected() {
      if (connectionState === 'disconnected') return;
      connectionState = 'disconnected';
      bannerDismissed = false;
      showConnectionBanner('Connection lost \u2014 reconnecting\u2026');
      updateLiveIndicatorForConnection();
      setOfflineControlsDisabled(true);
    }

    // Transition to 'reconnecting'. Used when /api/health succeeds
    // after being disconnected — server is back but generation
    // endpoint not yet confirmed.
    function setReconnecting() {
      if (connectionState === 'reconnecting') return;
      connectionState = 'reconnecting';
      showConnectionBanner('Reconnecting\u2026');
      updateLiveIndicatorForConnection();
    }

    // Transition to 'connected'. Hides banner, re-enables controls,
    // resets backoff, stops heartbeat/keep-alive timers.
    function setConnected() {
      if (connectionState === 'connected') return;
      connectionState = 'connected';
      consecutivePollFailures = 0;
      currentBackoffMs = BACKOFF_INITIAL_MS;
      hideConnectionBanner();
      updateLiveIndicatorForConnection();
      setOfflineControlsDisabled(false);
      stopHeartbeat();
    }

    // --- Banner show / hide ---

    // Show the connection banner. Respects bannerDismissed flag.
    function showConnectionBanner(message) {
      if (bannerDismissed) return;
      var banner = document.getElementById('connection-banner');
      var msgEl = document.getElementById('banner-message');
      if (banner && msgEl) {
        msgEl.textContent = message;
        banner.classList.add('show');
        document.body.classList.add('has-connection-banner');
      }
    }

    // Hide the connection banner and remove body padding offset.
    function hideConnectionBanner() {
      var banner = document.getElementById('connection-banner');
      if (banner) {
        banner.classList.remove('show');
        document.body.classList.remove('has-connection-banner');
      }
    }

    // Dismiss handler — remember dismissal so we don't re-show
    // until the next full disconnect cycle.
    (function() {
      var dismissBtn = document.getElementById('banner-dismiss');
      if (dismissBtn) {
        dismissBtn.addEventListener('click', function() {
          bannerDismissed = true;
          hideConnectionBanner();
        });
      }
    })();

    // --- Live indicator integration ---
    // When connected, defers to updatePollingUI(). When disconnected
    // or reconnecting, overrides with connection status in red.
    function updateLiveIndicatorForConnection() {
      var li = document.getElementById('live-indicator');
      if (!li) return;
      if (connectionState === 'connected') {
        li.classList.remove('disconnected', 'reconnecting');
        updatePollingUI();
      } else if (connectionState === 'disconnected') {
        li.textContent = '\u25cf Disconnected';
        li.classList.add('disconnected');
        li.classList.remove('paused', 'reconnecting');
      } else {
        // 'reconnecting' class triggers a CSS pulse animation.
        li.textContent = '\u25cf Reconnecting\u2026';
        li.classList.add('disconnected', 'reconnecting');
        li.classList.remove('paused');
      }
    }

    // --- Disable / enable server-dependent controls ---
    // IDs of buttons that call server endpoints.
    var OFFLINE_DISABLE_IDS = [
      'sql-run', 'sql-explain', 'nl-convert',
      'snapshot-take', 'snapshot-compare',
      'compare-view', 'migration-preview',
      'index-analyze', 'size-analyze', 'anomaly-analyze',
      'index-save', 'index-export', 'index-compare',
      'size-save', 'size-export', 'size-compare',
      'anomaly-save', 'anomaly-export', 'anomaly-compare',
      'perf-refresh', 'perf-clear', 'perf-save', 'perf-export', 'perf-compare',
      'import-run', 'share-btn',
      'export-schema', 'export-dump', 'export-database', 'export-csv'
    ];

    // Toggle 'offline-disabled' class (opacity:0.4, pointer-events:none)
    // on server-dependent controls.
    function setOfflineControlsDisabled(disabled) {
      OFFLINE_DISABLE_IDS.forEach(function(id) {
        var el = document.getElementById(id);
        if (el) {
          if (disabled) el.classList.add('offline-disabled');
          else el.classList.remove('offline-disabled');
        }
      });
    }

    // --- Heartbeat: lightweight /api/health checks for reconnection ---
    // Used after HEALTH_CHECK_THRESHOLD consecutive poll failures.
    // Health endpoint is fast (no DB query).

    function startHeartbeat() {
      if (heartbeatTimerId) return;
      doHeartbeat();
    }

    // Ping /api/health. On success restart normal polling.
    // On failure schedule another heartbeat with backoff.
    function doHeartbeat() {
      fetch('/api/health', authOpts())
        .then(function(r) { return r.json(); })
        .then(function(data) {
          if (data && data.ok) {
            setReconnecting();
            consecutivePollFailures = 0;
            currentBackoffMs = BACKOFF_INITIAL_MS;
            heartbeatTimerId = null;
            pollGeneration();
            return;
          }
          scheduleHeartbeat();
        })
        .catch(function() { scheduleHeartbeat(); });
    }

    // Schedule next heartbeat with exponential backoff (1s,2s,4s,...,30s).
    function scheduleHeartbeat() {
      currentBackoffMs = Math.min(
        currentBackoffMs * BACKOFF_MULTIPLIER, BACKOFF_MAX_MS
      );
      heartbeatTimerId = setTimeout(doHeartbeat, currentBackoffMs);
    }

    // Cancel any pending heartbeat timer.
    function stopHeartbeat() {
      if (heartbeatTimerId) {
        clearTimeout(heartbeatTimerId);
        heartbeatTimerId = null;
      }
    }

    // --- Keep-alive: periodic health check when polling is OFF ---
    // When polling is disabled the long-poll stops, so this slow
    // keep-alive (every 15s) detects disconnection instead.
    function startKeepAlive() {
      stopKeepAlive();
      keepAliveTimerId = setInterval(function() {
        fetch('/api/health', authOpts())
          .then(function(r) { return r.json(); })
          .then(function(data) {
            if (data && data.ok) {
              if (connectionState !== 'connected') setConnected();
            } else {
              setDisconnected();
            }
          })
          .catch(function() {
            setDisconnected();
            stopKeepAlive();
            startHeartbeat();
          });
      }, KEEP_ALIVE_INTERVAL_MS);
    }

    function stopKeepAlive() {
      if (keepAliveTimerId) {
        clearInterval(keepAliveTimerId);
        keepAliveTimerId = null;
      }
    }

    let sqlHistory = [];
    const BOOKMARKS_KEY = 'drift-viewer-sql-bookmarks';
    let sqlBookmarks = [];
    const TABLE_STATE_KEY_PREFIX = 'drift-viewer-table-state-';
    // FK breadcrumb navigation history: persists the trail of tables the
    // user followed via FK links so a page refresh doesn't lose the
    // exploration context.
    const NAV_HISTORY_KEY = 'drift-viewer-nav-history';

    // Per-table column config: order, hidden, pinned. Persisted in saveTableState.
    var tableColumnConfig = {};

    /** Returns column config for a table, or null to use default (all columns, natural order). */
    function getColumnConfig(tableName) {
      if (!tableName) return null;
      return tableColumnConfig[tableName] || null;
    }

    /** Updates in-memory column config for a table and optionally persists. */
    function setColumnConfig(tableName, config) {
      if (!tableName) return;
      tableColumnConfig[tableName] = config;
    }

    function saveTableState(tableName) {
      if (!tableName) return;
      var state = {
        rowFilter: (document.getElementById('row-filter').value || ''),
        limit: limit,
        offset: offset,
        displayFormat: (typeof displayFormat !== 'undefined') ? displayFormat : 'raw',
        queryBuilder: (typeof captureQueryBuilderState === 'function') ? captureQueryBuilderState() : null,
        columnConfig: getColumnConfig(tableName) || null
      };
      try { localStorage.setItem(TABLE_STATE_KEY_PREFIX + tableName, JSON.stringify(state)); } catch (e) {}
    }
    function restoreTableState(tableName) {
      try {
        var raw = localStorage.getItem(TABLE_STATE_KEY_PREFIX + tableName);
        if (!raw) return;
        var state = JSON.parse(raw);
        if (state.rowFilter != null) document.getElementById('row-filter').value = state.rowFilter;
        if (typeof state.limit === 'number' && state.limit > 0) limit = state.limit;
        if (typeof state.offset === 'number' && state.offset >= 0) offset = state.offset;
        if (state.displayFormat && typeof displayFormat !== 'undefined') {
          displayFormat = state.displayFormat;
          var sel = document.getElementById('display-format-toggle');
          if (sel) sel.value = displayFormat;
        }
        if (state.queryBuilder) queryBuilderState = state.queryBuilder;
        if (state.columnConfig && state.columnConfig.order) setColumnConfig(tableName, state.columnConfig);
      } catch (e) {}
    }
    function clearTableState(tableName) {
      if (!tableName) return;
      setColumnConfig(tableName, null);
      delete tableColumnConfig[tableName];
      try { localStorage.removeItem(TABLE_STATE_KEY_PREFIX + tableName); } catch (e) {}
    }

    // --- FK navigation history: localStorage persistence ---

    // Persist the FK breadcrumb trail to localStorage so it survives page
    // refreshes.  We store the navHistory array plus the current table
    // name so the breadcrumb can be fully reconstructed.  Writing is
    // wrapped in try/catch because localStorage can throw when storage is
    // full or disabled by browser policy.
    function saveNavHistory() {
      try {
        localStorage.setItem(NAV_HISTORY_KEY, JSON.stringify({
          history: navHistory,
          currentTable: currentTableName
        }));
      } catch (e) { /* localStorage full or disabled -- degrade silently */ }
    }

    // Restore the FK breadcrumb trail from localStorage.  Returns the
    // saved currentTable name (or null) so the caller can decide whether
    // to load that table.  Validates every entry in the array to guard
    // against corrupt or hand-edited storage values.
    function loadNavHistory() {
      try {
        var raw = localStorage.getItem(NAV_HISTORY_KEY);
        if (!raw) return null;
        var data = JSON.parse(raw);
        if (!data || !Array.isArray(data.history)) return null;

        // Rebuild navHistory from validated entries only.  Each entry
        // must have a non-empty table name; offset and filter are
        // optional and default to safe values.
        navHistory.length = 0;
        data.history.forEach(function(h) {
          if (h && typeof h.table === 'string' && h.table.trim() !== '') {
            navHistory.push({
              table: h.table,
              offset: (typeof h.offset === 'number' && h.offset >= 0) ? h.offset : 0,
              filter: (typeof h.filter === 'string') ? h.filter : ''
            });
          }
        });
        return (typeof data.currentTable === 'string') ? data.currentTable : null;
      } catch (e) {
        // Corrupt JSON or any other error -- start with a clean slate.
        return null;
      }
    }

    // Remove the persisted FK breadcrumb trail.  Called when the user
    // explicitly clears the navigation path via the "Clear path" button.
    function clearNavHistory() {
      navHistory.length = 0;
      try { localStorage.removeItem(NAV_HISTORY_KEY); } catch (e) {}
    }

    let displayFormat = 'raw';
    let tableColumnTypes = {};
    let queryBuilderActive = false;
    let queryBuilderState = null;

    async function loadColumnTypes(tableName) {
      if (tableColumnTypes[tableName]) return tableColumnTypes[tableName];
      var meta = await loadSchemaMeta();
      var tables = meta.tables || [];
      tables.forEach(function(t) {
        var types = {};
        (t.columns || []).forEach(function(c) { types[c.name] = (c.type || '').toUpperCase(); });
        tableColumnTypes[t.name] = types;
      });
      return tableColumnTypes[tableName] || {};
    }
    function isEpochTimestamp(value) {
      var n = Number(value);
      if (!isFinite(n) || n <= 0) return false;
      if (n > 946684800000 && n < 32503680000000) return 'ms';
      if (n > 946684800 && n < 32503680000) return 's';
      return false;
    }
    function isBooleanColumn(name) {
      var lower = name.toLowerCase();
      return /^(is_|has_|can_|should_|allow_|enable)/.test(lower) ||
        /_(enabled|active|visible|deleted|archived|verified|confirmed|locked|published)\$/.test(lower) ||
        lower === 'active' || lower === 'enabled' || lower === 'deleted' || lower === 'verified';
    }
    function isDateColumn(name) {
      var lower = name.toLowerCase();
      return /date|time|created|updated|deleted|_at\$|_on\$/.test(lower);
    }
    function formatCellValue(value, columnName, columnType) {
      var raw = value != null ? String(value) : '';
      if (value == null || value === '') return { formatted: raw, raw: raw, wasFormatted: false };
      var type = (columnType || '').toUpperCase();
      if ((type === 'INTEGER' || type === '') && isBooleanColumn(columnName)) {
        if (value === 0 || value === '0') return { formatted: 'false', raw: raw, wasFormatted: true };
        if (value === 1 || value === '1') return { formatted: 'true', raw: raw, wasFormatted: true };
      }
      if ((type === 'INTEGER' || type === 'REAL' || type === '') && (isDateColumn(columnName) || isEpochTimestamp(value))) {
        var epoch = isEpochTimestamp(value);
        if (epoch) {
          var ms = epoch === 'ms' ? Number(value) : Number(value) * 1000;
          var date = new Date(ms);
          if (!isNaN(date.getTime())) {
            return { formatted: date.toISOString(), raw: raw, wasFormatted: true };
          }
        }
      }
      return { formatted: raw, raw: raw, wasFormatted: false };
    }

    function showCopyToast(message) {
      var toast = document.getElementById('copy-toast');
      // Allow custom message (e.g. "Session extended!") or default "Copied!".
      if (message) toast.textContent = message;
      toast.classList.add('show');
      clearTimeout(toast._hideTimer);
      toast._hideTimer = setTimeout(function() {
        toast.classList.remove('show');
        // Always reset to default text after fade to avoid race
        // conditions when overlapping toasts capture stale text.
        toast.textContent = 'Copied!';
      }, 1200);
    }
    function copyCellValue(text) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(showCopyToast).catch(function() {});
      }
    }

    // --- Query Builder ---
    var _qbColTypes = {};

    function buildQueryBuilderHtml(tableName, colTypes) {
      var cols = Object.keys(colTypes || {});
      if (cols.length === 0) return '';
      _qbColTypes = colTypes;
      var html = '<div class="qb-section">';
      html += '<div class="qb-header" id="qb-toggle">\u25BC Query builder</div>';
      html += '<div id="qb-body" class="qb-body collapsed">';
      html += '<div class="qb-row"><label>SELECT</label><div class="qb-columns" id="qb-columns">';
      cols.forEach(function(c) {
        html += '<label><input type="checkbox" value="' + esc(c) + '" checked> ' + esc(c) + '</label>';
      });
      html += '</div></div>';
      html += '<div class="qb-row"><label>WHERE</label><div style="flex:1;">';
      html += '<div id="qb-where-list"></div>';
      html += '<button type="button" id="qb-add-where" style="font-size:11px;">+ Add condition</button>';
      html += '</div></div>';
      html += '<div class="qb-row"><label>ORDER BY</label>';
      html += '<select id="qb-order-col"><option value="">None</option>';
      cols.forEach(function(c) { html += '<option value="' + esc(c) + '">' + esc(c) + '</option>'; });
      html += '</select>';
      html += '<select id="qb-order-dir"><option value="ASC">ASC</option><option value="DESC">DESC</option></select>';
      html += '</div>';
      html += '<div class="qb-row"><label>LIMIT</label>';
      html += '<input type="number" id="qb-limit" value="200" min="1" max="1000" style="width:5rem;">';
      html += '</div>';
      html += '<div class="qb-preview" id="qb-preview"></div>';
      html += '<div class="qb-row" style="margin-top:0.35rem;">';
      html += '<button type="button" id="qb-run">Run query</button>';
      html += '<button type="button" id="qb-reset">Reset to table view</button>';
      html += '</div>';
      html += '</div></div>';
      return html;
    }

    function getWhereOps(columnType) {
      var type = (columnType || '').toUpperCase();
      if (type === 'TEXT' || type.indexOf('VARCHAR') >= 0 || type.indexOf('CHAR') >= 0) {
        return [
          { val: 'LIKE', label: 'contains' }, { val: '=', label: 'equals' },
          { val: 'NOT_LIKE', label: 'not contains' }, { val: 'LIKE_START', label: 'starts with' },
          { val: 'IS NULL', label: 'is null' }, { val: 'IS NOT NULL', label: 'is not null' }
        ];
      } else if (type === 'INTEGER' || type === 'REAL' || type.indexOf('INT') >= 0 || type.indexOf('FLOAT') >= 0 || type.indexOf('DOUBLE') >= 0 || type.indexOf('NUM') >= 0 || type.indexOf('DECIMAL') >= 0) {
        return [
          { val: '=', label: '=' }, { val: '!=', label: '!=' },
          { val: '>', label: '>' }, { val: '<', label: '<' },
          { val: '>=', label: '>=' }, { val: '<=', label: '<=' },
          { val: 'IS NULL', label: 'is null' }, { val: 'IS NOT NULL', label: 'is not null' }
        ];
      } else if (type === 'BLOB') {
        return [
          { val: 'IS NULL', label: 'is null' }, { val: 'IS NOT NULL', label: 'is not null' }
        ];
      }
      return [
        { val: '=', label: '=' }, { val: '!=', label: '!=' },
        { val: 'LIKE', label: 'contains' },
        { val: 'IS NULL', label: 'is null' }, { val: 'IS NOT NULL', label: 'is not null' }
      ];
    }

    function addWhereClause(colTypes, preset) {
      var list = document.getElementById('qb-where-list');
      if (!list) return;
      var cols = Object.keys(colTypes || {});
      if (cols.length === 0) return;
      var div = document.createElement('div');
      div.className = 'qb-where-item';
      var colSel = document.createElement('select');
      colSel.className = 'qb-where-col';
      cols.forEach(function(c) {
        var opt = document.createElement('option');
        opt.value = c; opt.textContent = c;
        colSel.appendChild(opt);
      });
      if (preset && preset.column) colSel.value = preset.column;
      var opSel = document.createElement('select');
      opSel.className = 'qb-where-op';
      var valInput = document.createElement('input');
      valInput.type = 'text';
      valInput.className = 'qb-where-val';
      valInput.placeholder = 'value';
      valInput.style.width = '8rem';
      var removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.textContent = '\u00D7';
      removeBtn.title = 'Remove condition';
      removeBtn.addEventListener('click', function() { div.remove(); updateQbPreview(); });
      var presetValue = preset ? preset.value : null;
      function updateOps() {
        var type = colTypes[colSel.value] || '';
        var ops = getWhereOps(type);
        opSel.innerHTML = '';
        ops.forEach(function(o) {
          var opt = document.createElement('option');
          opt.value = o.val; opt.textContent = o.label;
          opSel.appendChild(opt);
        });
        if (preset && preset.op) { opSel.value = preset.op; preset = null; }
        var op = opSel.value;
        valInput.style.display = (op === 'IS NULL' || op === 'IS NOT NULL') ? 'none' : '';
      }
      colSel.addEventListener('change', function() { updateOps(); updateQbPreview(); });
      opSel.addEventListener('change', function() {
        var op = this.value;
        valInput.style.display = (op === 'IS NULL' || op === 'IS NOT NULL') ? 'none' : '';
        updateQbPreview();
      });
      valInput.addEventListener('input', updateQbPreview);
      div.appendChild(colSel);
      div.appendChild(opSel);
      div.appendChild(valInput);
      div.appendChild(removeBtn);
      list.appendChild(div);
      updateOps();
      if (presetValue) valInput.value = presetValue;
      updateQbPreview();
    }

    function buildQueryFromBuilder(tableName) {
      var checkboxes = document.querySelectorAll('#qb-columns input[type="checkbox"]');
      var selectedCols = [];
      checkboxes.forEach(function(cb) { if (cb.checked) selectedCols.push(cb.value); });
      var selectPart = selectedCols.length > 0
        ? selectedCols.map(function(c) { return '"' + c + '"'; }).join(', ')
        : '*';
      var whereParts = [];
      var whereItems = document.querySelectorAll('#qb-where-list .qb-where-item');
      whereItems.forEach(function(item) {
        var col = item.querySelector('.qb-where-col').value;
        var op = item.querySelector('.qb-where-op').value;
        var val = item.querySelector('.qb-where-val').value;
        if (op === 'IS NULL') { whereParts.push('"' + col + '" IS NULL'); }
        else if (op === 'IS NOT NULL') { whereParts.push('"' + col + '" IS NOT NULL'); }
        else if (op === 'LIKE') { whereParts.push('"' + col + '" LIKE \'%' + val.replace(/'/g, "''") + '%\''); }
        else if (op === 'NOT_LIKE') { whereParts.push('"' + col + '" NOT LIKE \'%' + val.replace(/'/g, "''") + '%\''); }
        else if (op === 'LIKE_START') { whereParts.push('"' + col + '" LIKE \'' + val.replace(/'/g, "''") + '%\''); }
        else {
          var isNum = !isNaN(Number(val)) && val.trim() !== '';
          var sqlVal = isNum ? val : "'" + val.replace(/'/g, "''") + "'";
          whereParts.push('"' + col + '" ' + op + ' ' + sqlVal);
        }
      });
      var orderCol = document.getElementById('qb-order-col').value;
      var orderDir = document.getElementById('qb-order-dir').value;
      var qbLimit = parseInt(document.getElementById('qb-limit').value || '200', 10) || 200;
      var sql = 'SELECT ' + selectPart + ' FROM "' + tableName + '"';
      if (whereParts.length > 0) sql += ' WHERE ' + whereParts.join(' AND ');
      if (orderCol) sql += ' ORDER BY "' + orderCol + '" ' + orderDir;
      sql += ' LIMIT ' + qbLimit;
      return sql;
    }

    function updateQbPreview() {
      var preview = document.getElementById('qb-preview');
      if (!preview || !currentTableName) return;
      preview.textContent = buildQueryFromBuilder(currentTableName);
    }

    function runQueryBuilder() {
      var sql = buildQueryFromBuilder(currentTableName);
      if (!sql) return;
      var runBtn = document.getElementById('qb-run');
      if (runBtn) { runBtn.disabled = true; runBtn.textContent = 'Running\u2026'; }
      var savedState = captureQueryBuilderState();
      fetch('/api/sql', authOpts({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: sql })
      }))
        .then(function(r) { return r.json().then(function(d) { return { ok: r.ok, data: d }; }); })
        .then(function(result) {
          if (!result.ok) {
            alert('Query error: ' + (result.data.error || 'Unknown error'));
            return;
          }
          queryBuilderActive = true;
          queryBuilderState = savedState;
          var rows = result.data.rows || [];
          var content = document.getElementById('content');
          var fkMap = {};
          var cachedFks = fkMetaCache[currentTableName] || [];
          (cachedFks || []).forEach(function(fk) { fkMap[fk.fromColumn] = fk; });
          var colTypes = tableColumnTypes[currentTableName] || {};
          var html = '<p class="meta">Query builder result: ' + rows.length + ' row(s)</p>';
          html += '<p class="meta" style="font-family:monospace;font-size:11px;color:var(--muted);">' + esc(sql) + '</p>';
          html += buildQueryBuilderHtml(currentTableName, colTypes);
          html += wrapDataTableInScroll(buildDataTableHtml(rows, fkMap, colTypes, getColumnConfig(currentTableName)));
          content.innerHTML = html;
          bindQueryBuilderEvents(colTypes);
          restoreQueryBuilderUIState(savedState);
          bindColumnTableEvents();
          // Expand the QB body since user is actively using it
          var body = document.getElementById('qb-body');
          var toggle = document.getElementById('qb-toggle');
          if (body) body.classList.remove('collapsed');
          if (toggle) toggle.textContent = '\u25B2 Query builder';
          saveTableState(currentTableName);
        })
        .catch(function(e) { alert('Error: ' + e.message); })
        .finally(function() {
          if (runBtn) { runBtn.disabled = false; runBtn.textContent = 'Run query'; }
        });
    }

    function resetQueryBuilder() {
      queryBuilderActive = false;
      queryBuilderState = null;
      saveTableState(currentTableName);
      if (currentTableName && currentTableJson) {
        renderTableView(currentTableName, currentTableJson);
      }
    }

    function bindQueryBuilderEvents(colTypes) {
      var toggle = document.getElementById('qb-toggle');
      var body = document.getElementById('qb-body');
      if (toggle && body) {
        toggle.addEventListener('click', function() {
          var collapsed = body.classList.contains('collapsed');
          body.classList.toggle('collapsed', !collapsed);
          toggle.textContent = collapsed ? '\u25B2 Query builder' : '\u25BC Query builder';
        });
      }
      var addBtn = document.getElementById('qb-add-where');
      if (addBtn) addBtn.addEventListener('click', function() { addWhereClause(colTypes); });
      var runBtn = document.getElementById('qb-run');
      if (runBtn) runBtn.addEventListener('click', runQueryBuilder);
      var resetBtn = document.getElementById('qb-reset');
      if (resetBtn) resetBtn.addEventListener('click', resetQueryBuilder);
      var checkboxes = document.querySelectorAll('#qb-columns input[type="checkbox"]');
      checkboxes.forEach(function(cb) { cb.addEventListener('change', updateQbPreview); });
      var orderCol = document.getElementById('qb-order-col');
      var orderDir = document.getElementById('qb-order-dir');
      var qbLimit = document.getElementById('qb-limit');
      if (orderCol) orderCol.addEventListener('change', updateQbPreview);
      if (orderDir) orderDir.addEventListener('change', updateQbPreview);
      if (qbLimit) qbLimit.addEventListener('input', updateQbPreview);
      updateQbPreview();
    }

    function captureQueryBuilderState() {
      var state = { active: queryBuilderActive, selectedColumns: [], whereClauses: [], orderBy: '', orderDir: 'ASC', limit: 200 };
      var checkboxes = document.querySelectorAll('#qb-columns input[type="checkbox"]');
      checkboxes.forEach(function(cb) { if (cb.checked) state.selectedColumns.push(cb.value); });
      var whereItems = document.querySelectorAll('#qb-where-list .qb-where-item');
      whereItems.forEach(function(item) {
        state.whereClauses.push({
          column: item.querySelector('.qb-where-col').value,
          op: item.querySelector('.qb-where-op').value,
          value: item.querySelector('.qb-where-val').value
        });
      });
      var orderCol = document.getElementById('qb-order-col');
      var orderDir = document.getElementById('qb-order-dir');
      var qbLimit = document.getElementById('qb-limit');
      if (orderCol) state.orderBy = orderCol.value;
      if (orderDir) state.orderDir = orderDir.value;
      if (qbLimit) state.limit = parseInt(qbLimit.value || '200', 10) || 200;
      return state;
    }

    function restoreQueryBuilderUIState(state) {
      if (!state) return;
      var checkboxes = document.querySelectorAll('#qb-columns input[type="checkbox"]');
      if (state.selectedColumns && state.selectedColumns.length > 0) {
        checkboxes.forEach(function(cb) {
          cb.checked = state.selectedColumns.indexOf(cb.value) >= 0;
        });
      }
      if (state.whereClauses && state.whereClauses.length > 0) {
        state.whereClauses.forEach(function(wc) {
          addWhereClause(_qbColTypes, { column: wc.column, op: wc.op, value: wc.value });
        });
      }
      var orderCol = document.getElementById('qb-order-col');
      var orderDir = document.getElementById('qb-order-dir');
      var qbLimit = document.getElementById('qb-limit');
      if (orderCol && state.orderBy) orderCol.value = state.orderBy;
      if (orderDir && state.orderDir) orderDir.value = state.orderDir;
      if (qbLimit && state.limit) qbLimit.value = String(state.limit);
      updateQbPreview();
    }

    function loadSqlHistory() {
      sqlHistory = [];
      try {
        const raw = localStorage.getItem(SQL_HISTORY_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(parsed)) return;
        sqlHistory = parsed
          .map((h) => {
            const sql = h && typeof h.sql === 'string' ? h.sql.trim() : '';
            if (!sql) return null;
            const rowCount = h && typeof h.rowCount === 'number' ? h.rowCount : null;
            const at = h && typeof h.at === 'string' ? h.at : null;
            return { sql: sql, rowCount: rowCount, at: at };
          })
          .filter(Boolean)
          .slice(0, SQL_HISTORY_MAX);
      } catch (e) { sqlHistory = []; }
    }
    function saveSqlHistory() {
      try {
        localStorage.setItem(SQL_HISTORY_KEY, JSON.stringify(sqlHistory));
      } catch (e) {}
    }
    function refreshHistoryDropdown(sel) {
      if (!sel) return;
      const cur = sel.value;
      sel.innerHTML = '<option value="">— Recent —</option>' + sqlHistory.map((h, i) => {
        const preview = h.sql.length > 50 ? h.sql.slice(0, 47) + '…' : h.sql;
        const rows = h.rowCount != null ? (h.rowCount + ' row(s)') : '';
        const at = h.at ? new Date(h.at).toLocaleString() : '';
        const label = [rows, at, preview].filter(Boolean).join(' · ');
        return '<option value="' + i + '" title="' + esc(h.sql) + '">' + esc(label) + '</option>';
      }).join('');
      if (cur !== '' && parseInt(cur, 10) < sqlHistory.length) sel.value = cur;
    }
    function pushSqlHistory(sql, rowCount) {
      sql = (sql || '').trim();
      if (!sql) return;
      const at = new Date().toISOString();
      sqlHistory = [{ sql: sql, rowCount: rowCount, at: at }].concat(sqlHistory.filter(h => h.sql !== sql));
      sqlHistory = sqlHistory.slice(0, SQL_HISTORY_MAX);
      saveSqlHistory();
    }

    // --- Shared: bind a dropdown so selecting an item loads its .sql into the input ---
    function bindDropdownToInput(sel, items, inputEl) {
      if (!sel || !inputEl) return;
      sel.addEventListener('change', function() {
        const idx = parseInt(this.value, 10);
        if (!isNaN(idx) && items[idx]) inputEl.value = items[idx].sql;
      });
    }

    // --- Bookmarks: localStorage CRUD ---
    function loadBookmarks() {
      sqlBookmarks = [];
      try {
        const raw = localStorage.getItem(BOOKMARKS_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(parsed)) return;
        sqlBookmarks = parsed
          .map(function(b) {
            const name = b && typeof b.name === 'string' ? b.name.trim() : '';
            const sql = b && typeof b.sql === 'string' ? b.sql.trim() : '';
            if (!name || !sql) return null;
            const createdAt = b && typeof b.createdAt === 'string' ? b.createdAt : null;
            return { name: name, sql: sql, createdAt: createdAt };
          })
          .filter(Boolean);
      } catch (e) { sqlBookmarks = []; }
    }
    function saveBookmarks() {
      try {
        localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(sqlBookmarks));
      } catch (e) {}
    }
    function refreshBookmarksDropdown(sel) {
      if (!sel) return;
      const cur = sel.value;
      sel.innerHTML = '<option value="">— Bookmarks (' + sqlBookmarks.length + ') —</option>' +
        sqlBookmarks.map(function(b, i) {
          return '<option value="' + i + '" title="' + esc(b.sql) + '">' + esc(b.name) + '</option>';
        }).join('');
      if (cur !== '' && parseInt(cur, 10) < sqlBookmarks.length) sel.value = cur;
    }
    function addBookmark(inputEl, bookmarksSel) {
      const sql = inputEl.value.trim();
      if (!sql) return;
      const name = prompt('Bookmark name:', sql.slice(0, 40));
      if (!name) return;
      sqlBookmarks.unshift({ name: name, sql: sql, createdAt: new Date().toISOString() });
      saveBookmarks();
      refreshBookmarksDropdown(bookmarksSel);
    }
    function deleteBookmark(bookmarksSel) {
      const idx = parseInt(bookmarksSel.value, 10);
      if (isNaN(idx) || !sqlBookmarks[idx]) return;
      if (!confirm('Delete bookmark "' + sqlBookmarks[idx].name + '"?')) return;
      sqlBookmarks.splice(idx, 1);
      saveBookmarks();
      refreshBookmarksDropdown(bookmarksSel);
    }
    function exportBookmarks() {
      if (sqlBookmarks.length === 0) { alert('No bookmarks to export.'); return; }
      const blob = new Blob([JSON.stringify(sqlBookmarks, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'drift-viewer-bookmarks.json';
      a.click();
      URL.revokeObjectURL(url);
    }
    function importBookmarks(bookmarksSel) {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = function() {
        const file = input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function() {
          try {
            const raw = typeof reader.result === 'string' ? reader.result : '';
            const imported = JSON.parse(raw);
            if (!Array.isArray(imported)) throw new Error('Expected JSON array');
            let newCount = 0;
            imported.forEach(function(b) {
              if (b.name && b.sql && !sqlBookmarks.some(function(e) { return e.sql === b.sql; })) {
                sqlBookmarks.push({ name: b.name, sql: b.sql, createdAt: b.createdAt || new Date().toISOString() });
                newCount++;
              }
            });
            saveBookmarks();
            refreshBookmarksDropdown(bookmarksSel);
            alert('Imported ' + newCount + ' new bookmark(s). ' + (imported.length - newCount) + ' duplicate(s) skipped.');
          } catch (e) {
            alert('Invalid bookmark file: ' + e.message);
          }
        };
        reader.readAsText(file);
      };
      input.click();
    }

    // Apply the given theme ('dark' or 'light') to the document body and
    // update the toggle button label so users see the current mode.
    function applyTheme(dark) {
      document.body.classList.toggle('theme-light', !dark);
      document.body.classList.toggle('theme-dark', dark);
      document.getElementById('theme-toggle').textContent = dark ? 'Dark' : 'Light';
    }

    // Detect whether we are running inside a VS Code webview by checking
    // for the vscode-dark / vscode-light body classes that VS Code injects,
    // or the data-vscode-theme-kind attribute on <html>.
    function detectVscodeTheme() {
      // VS Code adds 'vscode-dark' or 'vscode-light' to <body>
      if (document.body.classList.contains('vscode-dark')) return 'dark';
      if (document.body.classList.contains('vscode-light')) return 'light';
      // Newer VS Code versions set a data attribute on <html>
      var kind = document.documentElement.getAttribute('data-vscode-theme-kind');
      if (kind === 'vscode-dark' || kind === 'vscode-high-contrast') return 'dark';
      if (kind === 'vscode-light' || kind === 'vscode-high-contrast-light') return 'light';
      return null;
    }

    function initTheme() {
      var saved = localStorage.getItem(THEME_KEY);
      if (saved) {
        // User has an explicit override — honour it.
        applyTheme(saved === 'dark');
        return;
      }
      // No saved preference: try VS Code webview context first, then
      // fall back to the OS-level prefers-color-scheme media query.
      var vscodeTheme = detectVscodeTheme();
      if (vscodeTheme) {
        applyTheme(vscodeTheme === 'dark');
        return;
      }
      // Respect operating-system dark-mode preference (defaults to dark
      // when the browser doesn't support matchMedia).
      var prefersDark = window.matchMedia
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
        : true;
      applyTheme(prefersDark);
    }

    // Toggle button: explicitly saves the user's choice so it takes
    // priority over OS / VS Code detection on future visits.
    document.getElementById('theme-toggle').addEventListener('click', function() {
      var isCurrentlyLight = document.body.classList.contains('theme-light');
      var nowDark = isCurrentlyLight;
      localStorage.setItem(THEME_KEY, nowDark ? 'dark' : 'light');
      applyTheme(nowDark);
    });

    initTheme();

    // Listen for real-time OS theme changes (e.g. the user toggles system
    // dark mode while the page is open). Only react if the user hasn't
    // set an explicit override in localStorage.
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(e) {
        if (!localStorage.getItem(THEME_KEY)) {
          applyTheme(e.matches);
        }
      });
    }

    if (DRIFT_VIEWER_AUTH_TOKEN) {
      var schemaLink = document.getElementById('export-schema');
      if (schemaLink) schemaLink.href = '/api/schema';
    }

    document.getElementById('schema-toggle').addEventListener('click', function() {
      const el = document.getElementById('schema-collapsible');
      const isCollapsed = el.classList.contains('collapsed');
      el.classList.toggle('collapsed', !isCollapsed);
      this.textContent = isCollapsed ? '▲ Schema' : '▼ Schema';
      if (isCollapsed && cachedSchema === null) {
        fetch('/api/schema', authOpts()).then(r => r.text()).then(schema => {
          cachedSchema = schema;
          document.getElementById('schema-inline-pre').textContent = schema;
        }).catch(() => { document.getElementById('schema-inline-pre').textContent = 'Failed to load.'; });
      }
    });

    (function initDiagram() {
      const toggle = document.getElementById('diagram-toggle');
      const collapsible = document.getElementById('diagram-collapsible');
      const container = document.getElementById('diagram-container');
      if (!toggle || !collapsible || !container) return;
      const BOX_W = 200;
      const BOX_H = 160;
      const PAD = 12;
      const COLS = 4;
      let diagramData = null;

      function tablePos(index) {
        const row = Math.floor(index / COLS);
        const col = index % COLS;
        return { x: col * (BOX_W + PAD) + PAD, y: row * (BOX_H + PAD) + PAD };
      }

      function renderDiagram(data) {
        const tables = data.tables || [];
        const fks = data.foreignKeys || [];
        if (tables.length === 0) {
          container.innerHTML = '<p class="meta">No tables.</p>';
       
   return;
        }
        const rows = Math.ceil(tables.length / COLS);
        const width = COLS * (BOX_W + PAD) + PAD;
        const height = rows * (BOX_H + PAD) + PAD;
        const nameToIndex = {};
        tables.forEach((t, i) => { nameToIndex[t.name] = i; });
        const getCenter = (index, side) => {
          const p = tablePos(index);
          const cx = p.x + BOX_W / 2;
          const cy = p.y + BOX_H / 2;
          if (side === 'right') return { x: p.x + BOX_W, y: cy };
          if (side === 'left') return { x: p.x, y: cy };
          return { x: cx, y: cy };
        };

        // Use role="group" (not "img") so screen readers announce the summary
        // label but still allow navigation into the focusable table children.
        let svg = '<svg role="group" aria-label="Schema diagram showing ' + tables.length + ' table' + (tables.length !== 1 ? 's' : '') + ' and ' + fks.length + ' foreign key relationship' + (fks.length !== 1 ? 's' : '') + '" width="' + width + '" height="' + height + '" xmlns="http://www.w3.org/2000/svg">';
        svg += '<g class="diagram-links">';
        fks.forEach(function(fk) {
          const iFrom = nameToIndex[fk.fromTable];
          const iTo = nameToIndex[fk.toTable];
          if (iFrom == null || iTo == null) return;
          const from = getCenter(iFrom, 'right');
          const to = getCenter(iTo, 'left');
          const mid = (from.x + to.x) / 2;
          // Each FK path gets a <title> so screen readers and hover-tooltips
          // describe the relationship (matches chart tooltip pattern).
          svg += '<path class="diagram-link" d="M' + from.x + ',' + from.y + ' C' + mid + ',' + from.y + ' ' + mid + ',' + to.y + ' ' + to.x + ',' + to.y + '">'
            + '<title>' + esc(fk.fromTable) + '.' + esc(fk.fromColumn) + ' \u2192 ' + esc(fk.toTable) + '.' + esc(fk.toColumn) + '</title></path>';
        });
        svg += '</g><g class="diagram-tables">';
        tables.forEach(function(t, i) {
          const p = tablePos(i);
          const allCols = t.columns || [];
          const cols = allCols.slice(0, 6);
          const name = esc(t.name);
          // Build an ARIA label summarising the table for screen readers:
          // e.g. "users table, 5 columns, primary key: id"
          const pkCols = allCols.filter(function(c) { return c.pk; }).map(function(c) { return c.name; });
          const ariaLabel = t.name + ' table, ' + allCols.length + ' column' + (allCols.length !== 1 ? 's' : '')
            + (pkCols.length ? ', primary key: ' + pkCols.join(', ') : '');
          let body = cols.map(function(c) {
            const pk = c.pk ? ' <tspan class="diagram-pk">PK</tspan>' : '';
            return '<tspan class="diagram-col" x="' + (p.x + 8) + '" dy="16">' + esc(c.name) + (c.type ? ' ' + esc(c.type) : '') + pk + '</tspan>';
          }).join('');
          if (allCols.length > 6) body += '<tspan class="diagram-col" x="' + (p.x + 8) + '" dy="16">…</tspan>';
          // tabindex="0" makes the box keyboard-focusable; role="button" tells
          // screen readers it is activatable (clicking loads the table view).
          svg += '<g class="diagram-table" data-table="' + name + '" tabindex="0" role="button" aria-label="' + esc(ariaLabel) + '" transform="translate(' + p.x + ',' + p.y + ')">';
          svg += '<rect width="' + BOX_W + '" height="' + BOX_H + '" rx="4"/>';
          svg += '<text class="diagram-name" x="8" y="22" style="fill: var(--link);">' + name + '</text>';
          svg += '<text x="8" y="38">' + body + '</text>';
          svg += '</g>';
        });
        svg += '</g></svg>';
        container.innerHTML = svg;

        // Attach click + keyboard handlers to each table box.
        // Enter/Space activates (same as click); arrow keys navigate the grid.
        const tableEls = container.querySelectorAll('.diagram-table');
        tableEls.forEach(function(g, i) {
          g.addEventListener('click', function() {
            const name = this.getAttribute('data-table');
            if (name) loadTable(name);
          });
          g.addEventListener('keydown', function(e) {
            // Enter or Space activates the table (loads its data view).
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              const name = this.getAttribute('data-table');
              if (name) loadTable(name);
              return;
            }
            // Arrow keys navigate between table boxes in grid layout.
            var target = -1;
            if (e.key === 'ArrowRight') target = i + 1;
            else if (e.key === 'ArrowLeft') target = i - 1;
            else if (e.key === 'ArrowDown') target = i + COLS;
            else if (e.key === 'ArrowUp') target = i - COLS;
            if (target >= 0 && target < tableEls.length) {
              e.preventDefault();
              tableEls[target].focus();
            }
          });
        });

        // Build a text-based alternative for screen readers (sr-only div).
        // Lists every table with its columns plus FK relationships.
        var altEl = document.getElementById('diagram-text-alt');
        if (altEl) {
          var altHtml = '<h4>Schema table list</h4><ul>';
          tables.forEach(function(t) {
            var cols = t.columns || [];
            altHtml += '<li><strong>' + esc(t.name) + '</strong> (' + cols.length + ' column' + (cols.length !== 1 ? 's' : '') + '): ';
            altHtml += cols.map(function(c) { return esc(c.name) + (c.pk ? ' (PK)' : ''); }).join(', ');
            altHtml += '</li>';
          });
          altHtml += '</ul>';
          if (fks.length > 0) {
            altHtml += '<h4>Foreign key relationships</h4><ul>';
            fks.forEach(function(fk) {
              altHtml += '<li>' + esc(fk.fromTable) + '.' + esc(fk.fromColumn) + ' \u2192 ' + esc(fk.toTable) + '.' + esc(fk.toColumn) + '</li>';
            });
            altHtml += '</ul>';
          }
          altEl.innerHTML = altHtml;
        }
      }

      toggle.addEventListener('click', function() {
        const isCollapsed = collapsible.classList.contains('collapsed');
        collapsible.classList.toggle('collapsed', !isCollapsed);
        this.textContent = isCollapsed ? '▲ Schema diagram' : '▼ Schema diagram';
        if (isCollapsed && diagramData === null) {
          container.innerHTML = '<p class="meta">Loading…</p>';
          fetch('/api/schema/diagram', authOpts())
            .then(r => r.json())
            .then(function(data) {
              diagramData = data;
              renderDiagram(data);
            })
            .catch(function(e) {
              container.innerHTML = '<p class="meta">Failed to load diagram: ' + esc(String(e)) + '</p>';
            });
        } else if (isCollapsed && diagramData) {
          renderDiagram(diagramData);
        }
      });
    })();

    (function initSnapshot() {
      const toggle = document.getElementById('snapshot-toggle');
      const collapsible = document.getElementById('snapshot-collapsible');
      const takeBtn = document.getElementById('snapshot-take');
      const compareBtn = document.getElementById('snapshot-compare');
      const exportLink = document.getElementById('snapshot-export-diff');
      const clearBtn = document.getElementById('snapshot-clear');
      const statusEl = document.getElementById('snapshot-status');
      const resultPre = document.getElementById('snapshot-compare-result');
      function updateSnapshotUI(hasSnapshot, createdAt) {
        compareBtn.disabled = !hasSnapshot;
        exportLink.style.display = hasSnapshot ? '' : 'none';
        clearBtn.style.display = hasSnapshot ? '' : 'none';
        if (exportLink.style.display !== 'none' && DRIFT_VIEWER_AUTH_TOKEN) {
          exportLink.href = '/api/snapshot/compare?detail=rows&format=download';
        } else if (hasSnapshot) exportLink.href = '/api/snapshot/compare?detail=rows&format=download';
        statusEl.textContent = hasSnapshot ? ('Snapshot: ' + (createdAt || '')) : 'No snapshot.';
      }
      function refreshSnapshotStatus() {
        fetch('/api/snapshot', authOpts()).then(r => r.json()).then(function(data) {
          const snap = data.snapshot;
          updateSnapshotUI(!!snap, snap ? snap.createdAt : null);
        }).catch(function() { updateSnapshotUI(false); });
      }

      if (toggle && collapsible) {
        toggle.addEventListener('click', function() {
          const isCollapsed = collapsible.classList.contains('collapsed');
          collapsible.classList.toggle('collapsed', !isCollapsed);
          this.textContent = isCollapsed ? '▲ Snapshot / time travel' : '▼ Snapshot / time travel';
          if (isCollapsed) refreshSnapshotStatus();
        });
      }

      if (takeBtn) takeBtn.addEventListener('click', function() {
        takeBtn.disabled = true;
        statusEl.textContent = 'Capturing…';
        fetch('/api/snapshot', authOpts({ method: 'POST' }))
          .then(r => r.json().then(function(d) { return { ok: r.ok, data: d }; }))
          .then(function(o) {
            if (o.ok) {
              updateSnapshotUI(true, o.data.createdAt);
              statusEl.textContent = 'Snapshot saved at ' + o.data.createdAt;
            } else statusEl.textContent = o.data.error || 'Failed';
          })
          .catch(function(e) { statusEl.textContent = 'Error: ' + e.message; })
          .finally(function() { takeBtn.disabled = false; });
      });
      if (compareBtn) compareBtn.addEventListener('click', function() {
        compareBtn.disabled = true;
        resultPre.style.display = 'none';
        statusEl.textContent = 'Comparing…';
        fetch('/api/snapshot/compare?detail=rows', authOpts())
          .then(r => r.json().then(function(d) { return { ok: r.ok, data: d }; }))
          .then(function(o) {
            if (o.ok) {
              if (o.data.tables) {
                renderRowDiff(resultPre, o.data.tables);
              } else {
                resultPre.textContent = JSON.stringify(o.data, null, 2);
              }
              resultPre.style.display = 'block';
              statusEl.textContent = '';
            } else {
              statusEl.textContent = o.data.error || 'Compare failed';
            }
          })
          .catch(function(e) { statusEl.textContent = 'Error: ' + e.message; })
          .finally(function() { compareBtn.disabled = false; });
      });
      if (clearBtn) clearBtn.addEventListener('click', function() {
        clearBtn.disabled = true;
        statusEl.textContent = 'Clearing…';
        fetch('/api/snapshot', authOpts({ method: 'DELETE' }))
          .then(function() { updateSnapshotUI(false); resultPre.style.display = 'none'; refreshSnapshotStatus(); })
          .catch(function(e) { statusEl.textContent = 'Error: ' + e.message; })
          .finally(function() { clearBtn.disabled = false; });
      });
      refreshSnapshotStatus();
    })();

    (function initCompare() {
      const toggle = document.getElementById('compare-toggle');
      const collapsible = document.getElementById('compare-collapsible');
      const viewBtn = document.getElementById('compare-view');
      const exportLink = document.getElementById('compare-export');
      const statusEl = document.getElementById('compare-status');
      const resultPre = document.getElementById('compare-result');
      if (DRIFT_VIEWER_AUTH_TOKEN && exportLink) {
        exportLink.href = '/api/compare/report?format=download';
      }

      if (toggle && collapsible) {
        toggle.addEventListener('click', function() {
          const isCollapsed = collapsible.classList.contains('collapsed');
          collapsible.classList.toggle('collapsed', !isCollapsed);
          this.textContent = isCollapsed ? '▲ Database diff' : '▼ Database diff';
        });
      }

      if (viewBtn) viewBtn.addEventListener('click', function() {
        viewBtn.disabled = true;
        resultPre.style.display = 'none';
        statusEl.textContent = 'Loading…';
        fetch('/api/compare/report', authOpts())
          .then(r => r.json().then(function(d) { return { status: r.status, data: d }; }))
          .then(function(o) {
            if (o.status === 501) {
              statusEl.textContent = 'Database compare not configured. Pass queryCompare to DriftDebugServer.start to compare with another DB (e.g. staging).';
            } else if (o.status >= 400) {
              statusEl.textContent = o.data.error || 'Request failed';
            } else {
              resultPre.textContent = JSON.stringify(o.data, null, 2);
              resultPre.style.display = 'block';
              statusEl.textContent = '';
            }
          })
          .catch(function(e) { statusEl.textContent = 'Error: ' + e.message; })
          .finally(function() { viewBtn.disabled = false; });
      });
    })();

    (function initMigrationPreview() {
      var btn = document.getElementById('migration-preview');
      var statusEl = document.getElementById('compare-status');
      var resultPre = document.getElementById('compare-result');
      if (!btn) return;
      btn.addEventListener('click', function() {
        btn.disabled = true;
        btn.textContent = 'Generating…';
        resultPre.style.display = 'none';
        statusEl.textContent = '';
        fetch('/api/migration/preview', authOpts())
          .then(function(r) { return r.json().then(function(d) { return { status: r.status, data: d }; }); })
          .then(function(o) {
            if (o.status === 501) {
              statusEl.textContent = 'Migration preview requires queryCompare. Pass queryCompare to DriftDebugServer.start().';
           
   return;
            }
            if (o.status >= 400) {
              statusEl.textContent = o.data.error || 'Request failed';
           
   return;
            }
            var sql = o.data.migrationSql || '-- No changes detected.';
            var html = '<p class="meta">' + o.data.changeCount + ' statement(s) generated';
            if (o.data.hasWarnings) html += ' (includes warnings)';
            html += '</p>';
            html += '<pre style="font-size:11px;max-height:30vh;overflow:auto;background:var(--bg-pre);padding:0.5rem;border-radius:4px;">' + esc(sql) + '</pre>';
            html += '<button type="button" id="migration-copy-sql">Copy SQL</button>';
            resultPre.innerHTML = html;
            resultPre.style.display = 'block';
            statusEl.textContent = '';
            var copyBtn = document.getElementById('migration-copy-sql');
            if (copyBtn) copyBtn.addEventListener('click', function() {
              navigator.clipboard.writeText(sql);
              this.textContent = 'Copied!';
            });
          })
          .catch(function(e) { statusEl.textContent = 'Error: ' + e.message; })
          .finally(function() {
            btn.disabled = false;
            btn.textContent = 'Migration Preview';
          });
      });
    })();

    (function initIndexSuggestions() {
      const toggle = document.getElementById('index-toggle');
      const collapsible = document.getElementById('index-collapsible');
      const btn = document.getElementById('index-analyze');
      const container = document.getElementById('index-results');
      const saveBtn = document.getElementById('index-save');
      const exportBtn = document.getElementById('index-export');
      const historySel = document.getElementById('index-history');
      const compareBtn = document.getElementById('index-compare');
      var lastIndexData = null;

      function renderIndexData(data) {
        if (!data) return '<p class="meta">No current result. Run Analyze first.</p>';
        var suggestions = data.suggestions || [];
        if (suggestions.length === 0) {
          return '<p class="meta" style="color:#7cb342;">No index suggestions — schema looks good!</p>';
        }
        var priorityColors = { high: '#e57373', medium: '#ffb74d', low: '#7cb342' };
        var priorityIcons = { high: '!!', medium: '!', low: '\u2713' };
        var html = '<p class="meta">' + suggestions.length + ' suggestion(s) across ' + (data.tablesAnalyzed || 0) + ' tables:</p>';
        html += '<table style="border-collapse:collapse;width:100%;font-size:12px;">';
        html += '<tr><th style="border:1px solid var(--border);padding:4px;">Priority</th><th style="border:1px solid var(--border);padding:4px;">Table.Column</th><th style="border:1px solid var(--border);padding:4px;">Reason</th><th style="border:1px solid var(--border);padding:4px;">SQL</th></tr>';
        suggestions.forEach(function(s) {
          var color = priorityColors[s.priority] || 'var(--fg)';
          var icon = priorityIcons[s.priority] || '';
          html += '<tr>';
          html += '<td style="border:1px solid var(--border);padding:4px;color:' + color + ';font-weight:bold;">[' + esc(icon) + '] ' + esc(s.priority).toUpperCase() + '</td>';
          html += '<td style="border:1px solid var(--border);padding:4px;">' + esc(s.table) + '.' + esc(s.column) + '</td>';
          html += '<td style="border:1px solid var(--border);padding:4px;">' + esc(s.reason) + '</td>';
          html += '<td style="border:1px solid var(--border);padding:4px;"><code style="font-size:11px;cursor:pointer;" title="Click to copy" onclick="navigator.clipboard.writeText(this.textContent)">' + esc(s.sql) + '</code></td>';
          html += '</tr>';
        });
        html += '</table>';
        return html;
      }

      function showIndexResult(html, isError) {
        container.innerHTML = html;
        container.style.display = 'block';
      }

      if (toggle && collapsible) {
        toggle.addEventListener('click', function() {
          const isCollapsed = collapsible.classList.contains('collapsed');
          collapsible.classList.toggle('collapsed', !isCollapsed);
          this.textContent = isCollapsed ? '▲ Index suggestions' : '▼ Index suggestions';
        });
      }

      if (historySel) {
        populateHistorySelect(historySel, 'index');
        historySel.addEventListener('change', function() {
          var id = this.value;
          if (!id) return;
          var saved = getSavedAnalysisById('index', id);
          if (saved && saved.data) {
            lastIndexData = saved.data;
            showIndexResult(renderIndexData(saved.data));
          }
        });
      }

      if (btn) btn.addEventListener('click', function() {
        btn.disabled = true;
        btn.textContent = 'Analyzing…';
        container.style.display = 'none';
        fetch('/api/index-suggestions', authOpts())
          .then(function(r) {
            if (!r.ok) return r.json().then(function(d) { throw new Error(d.error || 'Request failed'); });
            return r.json();
          })
          .then(function(data) {
            lastIndexData = data;
            showIndexResult(renderIndexData(data));
            populateHistorySelect(historySel, 'index');
          })
          .catch(function(e) {
            showIndexResult('<p class="meta" style="color:#e57373;">Error: ' + esc(e.message) + '</p>');
          })
          .finally(function() {
            btn.disabled = false;
            btn.textContent = 'Analyze';
          });
      });

      if (saveBtn) saveBtn.addEventListener('click', function() {
        if (!lastIndexData) return;
        var id = saveAnalysis('index', lastIndexData);
        showCopyToast(id != null ? 'Saved' : 'Save failed (storage may be full)');
        populateHistorySelect(historySel, 'index');
      });

      if (exportBtn) exportBtn.addEventListener('click', function() {
        if (!lastIndexData) return;
        downloadJSON(lastIndexData, 'index-suggestions-' + (new Date().toISOString().slice(0, 10)) + '.json');
      });

      if (compareBtn) compareBtn.addEventListener('click', function() {
        showAnalysisCompare('index', 'Index suggestions', getSavedAnalyses('index'), lastIndexData, renderIndexData, function(a, b) {
          var sa = (a && a.suggestions) ? a.suggestions.length : 0;
          var sb = (b && b.suggestions) ? b.suggestions.length : 0;
          return 'Before: ' + sa + ' suggestion(s) · After: ' + sb + ' suggestion(s)';
        });
      });
    })();

    (function initSizeAnalytics() {
      const toggle = document.getElementById('size-toggle');
      const collapsible = document.getElementById('size-collapsible');
      const btn = document.getElementById('size-analyze');
      const container = document.getElementById('size-results');
      const saveBtn = document.getElementById('size-save');
      const exportBtn = document.getElementById('size-export');
      const historySel = document.getElementById('size-history');
      const compareBtn = document.getElementById('size-compare');
      var lastSizeData = null;

      function formatBytes(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1048576).toFixed(2) + ' MB';
      }

      function renderSizeData(data) {
        if (!data) return '<p class="meta">No data.</p>';
        var html = '<div style="margin:0.5rem 0;">';
        html += '<div style="display:flex;gap:1rem;flex-wrap:wrap;margin-bottom:0.5rem;">';
        html += '<div style="padding:0.5rem;border:1px solid var(--border);border-radius:4px;">';
        html += '<div class="meta">Total Size</div>';
        html += '<div style="font-size:1.2rem;font-weight:bold;">' + formatBytes(data.totalSizeBytes) + '</div></div>';
        html += '<div style="padding:0.5rem;border:1px solid var(--border);border-radius:4px;">';
        html += '<div class="meta">Used</div>';
        html += '<div style="font-size:1.2rem;font-weight:bold;">' + formatBytes(data.usedSizeBytes) + '</div></div>';
        html += '<div style="padding:0.5rem;border:1px solid var(--border);border-radius:4px;">';
        html += '<div class="meta">Free</div>';
        html += '<div style="font-size:1.2rem;font-weight:bold;">' + formatBytes(data.freeSpaceBytes) + '</div></div>';
        html += '<div style="padding:0.5rem;border:1px solid var(--border);border-radius:4px;">';
        html += '<div class="meta">Journal</div>';
        html += '<div style="font-size:1.2rem;font-weight:bold;">' + esc(data.journalMode || '') + '</div></div>';
        html += '<div style="padding:0.5rem;border:1px solid var(--border);border-radius:4px;">';
        html += '<div class="meta">Pages</div>';
        html += '<div style="font-size:1.2rem;font-weight:bold;">' + (data.pageCount || 0) + ' × ' + (data.pageSize || 0) + '</div></div>';
        html += '</div>';
        html += '<table style="border-collapse:collapse;width:100%;font-size:12px;">';
        html += '<tr><th style="border:1px solid var(--border);padding:4px;">Table</th>';
        html += '<th style="border:1px solid var(--border);padding:4px;">Rows</th>';
        html += '<th style="border:1px solid var(--border);padding:4px;">Columns</th>';
        html += '<th style="border:1px solid var(--border);padding:4px;">Indexes</th></tr>';
        var tables = data.tables || [];
        var maxRows = Math.max.apply(null, tables.map(function(t) { return t.rowCount; }).concat([1]));
        tables.forEach(function(t) {
          var barWidth = Math.max(1, (t.rowCount / maxRows) * 100);
          html += '<tr>';
          html += '<td style="border:1px solid var(--border);padding:4px;">' + esc(t.table) + '</td>';
          html += '<td style="border:1px solid var(--border);padding:4px;">';
          html += '<div style="background:var(--link);height:12px;width:' + barWidth + '%;opacity:0.3;display:inline-block;vertical-align:middle;margin-right:4px;"></div>';
          html += t.rowCount.toLocaleString() + '</td>';
          html += '<td style="border:1px solid var(--border);padding:4px;">' + t.columnCount + '</td>';
          html += '<td style="border:1px solid var(--border);padding:4px;">' + t.indexCount;
          if (t.indexes && t.indexes.length > 0) html += ' <span class="meta">(' + t.indexes.map(esc).join(', ') + ')</span>';
          html += '</td></tr>';
        });
        html += '</table></div>';
        return html;
      }

      if (toggle && collapsible) {
        toggle.addEventListener('click', function() {
          const isCollapsed = collapsible.classList.contains('collapsed');
          collapsible.classList.toggle('collapsed', !isCollapsed);
          this.textContent = isCollapsed ? '▲ Database size analytics' : '▼ Database size analytics';
        });
      }

      if (historySel) {
        populateHistorySelect(historySel, 'size');
        historySel.addEventListener('change', function() {
          var id = this.value;
          if (!id) return;
          var saved = getSavedAnalysisById('size', id);
          if (saved && saved.data) {
            lastSizeData = saved.data;
            container.innerHTML = renderSizeData(saved.data);
            container.style.display = 'block';
          }
        });
      }

      if (btn) btn.addEventListener('click', function() {
        btn.disabled = true;
        btn.textContent = 'Analyzing…';
        container.style.display = 'none';
        fetch('/api/analytics/size', authOpts())
          .then(function(r) {
            if (!r.ok) return r.json().then(function(d) { throw new Error(d.error || 'Request failed'); });
            return r.json();
          })
          .then(function(data) {
            lastSizeData = data;
            container.innerHTML = renderSizeData(data);
            container.style.display = 'block';
            populateHistorySelect(historySel, 'size');
          })
          .catch(function(e) {
            container.innerHTML = '<p class="meta" style="color:#e57373;">Error: ' + esc(e.message) + '</p>';
            container.style.display = 'block';
          })
          .finally(function() {
            btn.disabled = false;
            btn.textContent = 'Analyze';
          });
      });

      if (saveBtn) saveBtn.addEventListener('click', function() {
        if (!lastSizeData) return;
        var id = saveAnalysis('size', lastSizeData);
        showCopyToast(id != null ? 'Saved' : 'Save failed (storage may be full)');
        populateHistorySelect(historySel, 'size');
      });

      if (exportBtn) exportBtn.addEventListener('click', function() {
        if (!lastSizeData) return;
        downloadJSON(lastSizeData, 'size-analytics-' + (new Date().toISOString().slice(0, 10)) + '.json');
      });

      if (compareBtn) compareBtn.addEventListener('click', function() {
        showAnalysisCompare('size', 'Database size analytics', getSavedAnalyses('size'), lastSizeData, renderSizeData, function(a, b) {
          var ta = (a && a.totalSizeBytes) != null ? formatBytes(a.totalSizeBytes) : '—';
          var tb = (b && b.totalSizeBytes) != null ? formatBytes(b.totalSizeBytes) : '—';
          return 'Before: ' + ta + ' total · After: ' + tb + ' total';
        });
      });
    })();

    (function initAnomalyDetection() {
      const toggle = document.getElementById('anomaly-toggle');
      const collapsible = document.getElementById('anomaly-collapsible');
      const btn = document.getElementById('anomaly-analyze');
      const container = document.getElementById('anomaly-results');
      const saveBtn = document.getElementById('anomaly-save');
      const exportBtn = document.getElementById('anomaly-export');
      const historySel = document.getElementById('anomaly-history');
      const compareBtn = document.getElementById('anomaly-compare');
      var lastAnomalyData = null;

      function renderAnomalyData(data) {
        if (!data) return '<p class="meta">No current result. Run Scan first.</p>';
        var anomalies = data.anomalies || [];
        if (anomalies.length === 0) {
          return '<p class="meta" style="color:#7cb342;">No anomalies detected across ' + (data.tablesScanned || 0) + ' tables. Data looks clean!</p>';
        }
        var icons = { error: '!!', warning: '!', info: 'i' };
        var colors = { error: '#e57373', warning: '#ffb74d', info: '#7cb342' };
        var html = '<p class="meta">' + anomalies.length + ' finding(s) across ' + (data.tablesScanned || 0) + ' tables:</p>';
        anomalies.forEach(function(a) {
          var color = colors[a.severity] || 'var(--fg)';
          var icon = icons[a.severity] || '';
          html += '<div style="padding:0.3rem 0.5rem;margin:0.2rem 0;border-left:3px solid ' + color + ';background:rgba(0,0,0,0.1);">';
          html += '<span style="color:' + color + ';font-weight:bold;">[' + icon + '] ' + esc(a.severity).toUpperCase() + '</span> ';
          html += esc(a.message);
          if (a.count) html += ' <span class="meta">(' + a.count + ')</span>';
          html += '</div>';
        });
        return html;
      }

      if (toggle && collapsible) {
        toggle.addEventListener('click', function() {
          const isCollapsed = collapsible.classList.contains('collapsed');
          collapsible.classList.toggle('collapsed', !isCollapsed);
          this.textContent = isCollapsed ? '▲ Data health' : '▼ Data health';
        });
      }

      if (historySel) {
        populateHistorySelect(historySel, 'anomaly');
        historySel.addEventListener('change', function() {
          var id = this.value;
          if (!id) return;
          var saved = getSavedAnalysisById('anomaly', id);
          if (saved && saved.data) {
            lastAnomalyData = saved.data;
            container.innerHTML = renderAnomalyData(saved.data);
            container.style.display = 'block';
          }
        });
      }

      if (btn) btn.addEventListener('click', function() {
        btn.disabled = true;
        btn.textContent = 'Scanning\u2026';
        container.style.display = 'none';
        fetch('/api/analytics/anomalies', authOpts())
          .then(function(r) {
            if (!r.ok) return r.json().then(function(d) { throw new Error(d.error || 'Request failed'); });
            return r.json();
          })
          .then(function(data) {
            lastAnomalyData = data;
            container.innerHTML = renderAnomalyData(data);
            container.style.display = 'block';
            populateHistorySelect(historySel, 'anomaly');
          })
          .catch(function(e) {
            container.innerHTML = '<p class="meta" style="color:#e57373;">Error: ' + esc(e.message) + '</p>';
            container.style.display = 'block';
          })
          .finally(function() {
            btn.disabled = false;
            btn.textContent = 'Scan for anomalies';
          });
      });

      if (saveBtn) saveBtn.addEventListener('click', function() {
        if (!lastAnomalyData) return;
        var id = saveAnalysis('anomaly', lastAnomalyData);
        showCopyToast(id != null ? 'Saved' : 'Save failed (storage may be full)');
        populateHistorySelect(historySel, 'anomaly');
      });

      if (exportBtn) exportBtn.addEventListener('click', function() {
        if (!lastAnomalyData) return;
        downloadJSON(lastAnomalyData, 'anomaly-scan-' + (new Date().toISOString().slice(0, 10)) + '.json');
      });

      if (compareBtn) compareBtn.addEventListener('click', function() {
        showAnalysisCompare('anomaly', 'Data health', getSavedAnalyses('anomaly'), lastAnomalyData, renderAnomalyData, function(a, b) {
          var na = (a && a.anomalies) ? a.anomalies.length : 0;
          var nb = (b && b.anomalies) ? b.anomalies.length : 0;
          return 'Before: ' + na + ' finding(s) · After: ' + nb + ' finding(s)';
        });
      });
    })();

    // Import data: file picker, CSV column mapping (source → table column), and POST /api/import.
    (function initImport() {
      const toggle = document.getElementById('import-toggle');
      const collapsible = document.getElementById('import-collapsible');
      const tableSel = document.getElementById('import-table');
      const formatSel = document.getElementById('import-format');
      const fileInput = document.getElementById('import-file');
      const runBtn = document.getElementById('import-run');
      const previewEl = document.getElementById('import-preview');
      const statusEl = document.getElementById('import-status');
      const mappingContainer = document.getElementById('import-column-mapping');
      const mappingTbody = document.getElementById('import-mapping-tbody');

      let importFileData = null;
      let importCsvHeaders = [];

      function parseCsvHeaderLine(line) {
        var fields = [];
        var cur = '';
        var inQuotes = false;
        for (var i = 0; i < line.length; i++) {
          var c = line[i];
          if (c === '"') {
            if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
            else inQuotes = !inQuotes;
          } else if (c === ',' && !inQuotes) {
            fields.push(cur.trim());
            cur = '';
          } else cur += c;
        }
        fields.push(cur.trim());
        return fields;
      }

      function renderMappingTable() {
        if (!mappingTbody || importCsvHeaders.length === 0) return;
        var tableName = tableSel && tableSel.value;
        if (!tableName) {
          mappingContainer.style.display = 'none';
          return;
        }
        var requestedTable = tableName;
        mappingTbody.innerHTML = '<tr><td colspan="2" class="meta">Loading columns…</td></tr>';
        mappingContainer.style.display = 'block';
        fetch('/api/table/' + encodeURIComponent(tableName) + '/columns', authOpts())
          .then(function(r) { return r.json(); })
          .then(function(tableColumns) {
            if (tableSel.value !== requestedTable) return;
            if (!Array.isArray(tableColumns)) { mappingContainer.style.display = 'none'; return; }
            var html = '';
            importCsvHeaders.forEach(function(csvCol) {
              var optHtml = '<option value="">(skip)</option>' + tableColumns.map(function(tc) {
                return '<option value="' + esc(tc) + '">' + esc(tc) + '</option>';
              }).join('');
              html += '<tr><td style="border:1px solid var(--border);padding:4px;">' + esc(csvCol) + '</td>';
              html += '<td style="border:1px solid var(--border);padding:4px;"><select class="import-map-select" data-csv-header="' + esc(csvCol) + '">' + optHtml + '</select></td></tr>';
            });
            mappingTbody.innerHTML = html;
          })
          .catch(function() {
            if (tableSel.value !== requestedTable) return;
            mappingTbody.innerHTML = '<tr><td colspan="2" class="meta" style="color:#e57373;">Failed to load table columns.</td></tr>';
          });
      }

      function updateImportState() {
        var hasFile = importFileData !== null && importFileData !== '';
        var table = tableSel && tableSel.value;
        runBtn.disabled = !hasFile || !table;
        if (hasFile && previewEl) {
          previewEl.style.display = 'block';
          previewEl.textContent = importFileData.length > 2000 ? importFileData.slice(0, 2000) + '\\n…' : importFileData;
        }
        var fmt = formatSel && formatSel.value;
        if (fmt === 'csv' && hasFile && importCsvHeaders.length > 0) {
          renderMappingTable();
        } else {
          if (mappingContainer) mappingContainer.style.display = 'none';
        }
      }

      if (toggle && collapsible) {
        toggle.addEventListener('click', function() {
          var isCollapsed = collapsible.classList.contains('collapsed');
          collapsible.classList.toggle('collapsed', !isCollapsed);
          this.textContent = isCollapsed ? '▲ Import data (debug only)' : '▼ Import data (debug only)';
        });
      }

      if (fileInput) {
        fileInput.addEventListener('change', function() {
          var f = this.files && this.files[0];
          if (!f) { importFileData = null; importCsvHeaders = []; updateImportState(); return; }
          var reader = new FileReader();
          reader.onload = function() {
            importFileData = reader.result;
            if (typeof importFileData !== 'string') importFileData = null;
            importCsvHeaders = [];
            if (importFileData && (formatSel && formatSel.value) === 'csv') {
              var firstLine = importFileData.split(/\\r?\\n/)[0] || '';
              importCsvHeaders = parseCsvHeaderLine(firstLine);
            }
            updateImportState();
          };
          reader.readAsText(f);
        });
      }

      if (formatSel) formatSel.addEventListener('change', function() {
        if (this.value === 'csv' && importFileData) {
          var firstLine = importFileData.split(/\\r?\\n/)[0] || '';
          importCsvHeaders = parseCsvHeaderLine(firstLine);
        } else importCsvHeaders = [];
        updateImportState();
      });

      if (tableSel) tableSel.addEventListener('change', updateImportState);

      if (runBtn) {
        runBtn.addEventListener('click', function() {
          var table = tableSel && tableSel.value;
          var format = formatSel && formatSel.value;
          if (!table || !importFileData) return;
          if (!confirm('Import data into table "' + esc(table) + '"? This cannot be undone.')) return;
          runBtn.disabled = true;
          var runBtnOrigText = runBtn.textContent;
          runBtn.textContent = 'Importing…';
          statusEl.textContent = 'Importing…';
          var body = { format: format, data: importFileData, table: table };
          if (format === 'csv' && mappingContainer && mappingContainer.style.display !== 'none') {
            var mapping = {};
            mappingContainer.querySelectorAll('.import-map-select').forEach(function(sel) {
              var csvHeader = sel.getAttribute('data-csv-header');
              var tableCol = sel.value;
              if (csvHeader && tableCol) mapping[csvHeader] = tableCol;
            });
            if (Object.keys(mapping).length > 0) body.columnMapping = mapping;
          }
          fetch('/api/import', authOpts({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          }))
            .then(function(r) { return r.json().then(function(d) { return { ok: r.ok, data: d }; }); })
            .then(function(o) {
              if (!o.ok) {
                statusEl.textContent = 'Error: ' + (o.data.error || 'Request failed');
                statusEl.style.color = '#e57373';
                return;
              }
              var d = o.data;
              var msg = 'Imported ' + d.imported + ' row(s).';
              if (d.errors && d.errors.length > 0) msg += ' ' + d.errors.length + ' error(s): ' + d.errors.slice(0, 3).join('; ');
              statusEl.textContent = msg;
              statusEl.style.color = '';
              if (d.imported > 0 && currentTableName === table) loadTable(table);
            })
            .catch(function(e) {
              statusEl.textContent = 'Error: ' + (e.message || 'Import failed');
              statusEl.style.color = '#e57373';
            })
            .finally(function() {
              runBtn.disabled = !importFileData || !tableSel || !tableSel.value;
              runBtn.textContent = runBtnOrigText || 'Import';
            });
        });
      }
    })();

    document.getElementById('export-csv').addEventListener('click', function(e) {
      e.preventDefault();
      if (!currentTableName || !currentTableJson || currentTableJson.length === 0) {
        document.getElementById('export-csv-status').textContent = ' Select a table with data first.';
     
   return;
      }
      const statusEl = document.getElementById('export-csv-status');
      statusEl.textContent = ' Preparing…';
      try {
        const keys = Object.keys(currentTableJson[0]);
        const rowToCsv = (row) => keys.map(k => {
          const v = row[k];
          if (v == null) return '';
          const s = String(v);
          return s.includes(',') || s.includes('"') || s.includes('\\n') ? '"' + s.replace(/"/g, '""') + '"' : s;
        }).join(',');
        const csv = [keys.join(','), ...currentTableJson.map(rowToCsv)].join('\\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = currentTableName + '.csv';
        a.click();
        URL.revokeObjectURL(url);
      } catch (err) {
        statusEl.textContent = ' Failed: ' + err.message;
     
   return;
      }
      statusEl.textContent = '';
    });

    function getScope() { return document.getElementById('search-scope').value || ''; }
    function getSearchTerm() { return String(document.getElementById('search-input').value || '').trim(); }
    function getRowFilter() { return String(document.getElementById('row-filter').value || '').trim(); }
    function filterRows(data) {
      const term = getRowFilter();
      if (!term || !data || data.length === 0) return data || [];
      const lower = term.toLowerCase();
      return data.filter(row => Object.values(row).some(v => v != null && String(v).toLowerCase().includes(lower)));
    }

    // Expand any collapsed section that contains the given DOM element.
    // Walks up the DOM tree looking for a .collapsible-body.collapsed parent,
    // then clicks its preceding .collapsible-header sibling to trigger the
    // existing expand logic (which may lazy-load content and update the arrow).
    function expandSectionContaining(el) {
      var node = el;
      while (node && node !== document.body) {
        if (node.classList && node.classList.contains('collapsible-body') && node.classList.contains('collapsed')) {
          var prev = node.previousElementSibling;
          if (prev && prev.classList.contains('collapsible-header')) {
            prev.click();
          }
        }
        node = node.parentElement;
      }
    }

    function applySearch() {
      const term = getSearchTerm();
      const scope = getScope();
      const navEl = document.getElementById('search-nav');
      const countEl = document.getElementById('search-count');

      // --- Phase 1: Apply highlight markup to matching text ---
      const schemaPre = document.getElementById('schema-pre');
      if (schemaPre && lastRenderedSchema !== null && (scope === 'schema' || scope === 'both')) {
        schemaPre.innerHTML = term ? highlightText(lastRenderedSchema, term) : esc(lastRenderedSchema);
      }
      var contentPre = document.getElementById('content-pre');
      if (contentPre && lastRenderedSchema !== null && scope === 'schema') {
        contentPre.innerHTML = term ? highlightText(lastRenderedSchema, term) : esc(lastRenderedSchema);
      }
      var dataTable = document.getElementById('data-table');
      if (dataTable && (scope === 'data' || scope === 'both')) {
        dataTable.querySelectorAll('td').forEach(function(td) {
          if (!td.querySelector('.fk-link')) {
            // Preserve copy button while highlighting (or clearing) text
            var copyBtn = td.querySelector('.cell-copy-btn');
            var textNodes = [];
            td.childNodes.forEach(function(n) { if (n !== copyBtn) textNodes.push(n.textContent || ''); });
            var text = textNodes.join('');
            // When term is empty, this restores plain escaped text (removes stale highlights)
            var highlighted = term ? highlightText(text, term) : esc(text);
            if (copyBtn) {
              var btnHtml = copyBtn.outerHTML;
              td.innerHTML = highlighted + btnHtml;
            } else {
              td.innerHTML = highlighted;
            }
          }
        });
      }

      // --- Phase 2: Build navigable match list from all highlight spans ---
      searchMatches = [];
      searchCurrentIndex = -1;

      if (term) {
        // Collect all highlighted spans in document order (top to bottom)
        searchMatches = Array.from(document.querySelectorAll('.highlight'));
      }

      // --- Phase 3: Update navigation UI visibility and state ---
      if (searchMatches.length > 0) {
        navEl.style.display = 'flex';
        navigateToMatch(0);
      } else {
        // Show "No matches" when user typed something, hide entirely when empty
        navEl.style.display = term ? 'flex' : 'none';
        countEl.textContent = term ? 'No matches' : '';
        document.getElementById('search-prev').disabled = true;
        document.getElementById('search-next').disabled = true;
      }
    }

    // Navigate to a specific match by zero-based index in searchMatches.
    // Removes highlight-active from old match, applies to new, scrolls into view.
    function navigateToMatch(index) {
      var countEl = document.getElementById('search-count');
      var prevBtn = document.getElementById('search-prev');
      var nextBtn = document.getElementById('search-next');

      if (searchMatches.length === 0) return;

      // Wrap around: past last loops to first, before first loops to last
      if (index < 0) index = searchMatches.length - 1;
      if (index >= searchMatches.length) index = 0;

      // Remove active class from previously focused match
      if (searchCurrentIndex >= 0 && searchCurrentIndex < searchMatches.length) {
        searchMatches[searchCurrentIndex].classList.remove('highlight-active');
      }

      searchCurrentIndex = index;

      // Apply active class to the newly focused match
      var current = searchMatches[searchCurrentIndex];
      current.classList.add('highlight-active');

      // Expand any collapsed section containing this match
      expandSectionContaining(current);

      // Scroll match into viewport, centered vertically.
      // Uses 'auto' (instant) to avoid competing smooth-scroll animations
      // when applySearch fires rapidly on each keystroke.
      current.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' });

      // Update "X of Y" counter (1-based for display)
      countEl.textContent = (searchCurrentIndex + 1) + ' of ' + searchMatches.length;

      // Both buttons always enabled (wrap-around navigation)
      prevBtn.disabled = false;
      nextBtn.disabled = false;
    }

    // Move to the next match (wraps to first after last)
    function nextMatch() {
      if (searchMatches.length === 0) return;
      navigateToMatch(searchCurrentIndex + 1);
    }

    // Move to the previous match (wraps to last before first)
    function prevMatch() {
      if (searchMatches.length === 0) return;
      navigateToMatch(searchCurrentIndex - 1);
    }

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
        document.getElementById('search-input').focus();
        document.getElementById('search-input').select();
      }
    });

    document.getElementById('row-filter').addEventListener('input', function() { if (currentTableName && currentTableJson) { renderTableView(currentTableName, currentTableJson); saveTableState(currentTableName); } });
    document.getElementById('row-filter').addEventListener('keyup', function() { if (currentTableName && currentTableJson) renderTableView(currentTableName, currentTableJson); });
    document.getElementById('search-scope').addEventListener('change', function() {
      const scope = getScope();
      const content = document.getElementById('content');
      const paginationBar = document.getElementById('pagination-bar');
      if (scope === 'both') {
        loadBothView();
        paginationBar.style.display = (currentTableName ? 'flex' : 'none');
      } else if (scope === 'schema') {
        loadSchemaView();
        paginationBar.style.display = 'none';
      } else if (currentTableName) {
        renderTableView(currentTableName, currentTableJson);
        paginationBar.style.display = 'flex';
      } else {
        content.innerHTML = '';
        lastRenderedSchema = null;
        lastRenderedData = null;
        paginationBar.style.display = 'none';
      }
      applySearch();
    });

    document.getElementById('export-dump').addEventListener('click', function(e) {
      e.preventDefault();
      const link = this;
      const statusEl = document.getElementById('export-dump-status');
      const origText = link.textContent;
      link.textContent = 'Preparing dump…';
      statusEl.textContent = '';
      fetch('/api/dump', authOpts())
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
      fetch('/api/database', authOpts())
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

    function setupPagination() {
      const bar = document.getElementById('pagination-bar');
      const limitSel = document.getElementById('pagination-limit');
      limitSel.innerHTML = LIMIT_OPTIONS.map(n => '<option value="' + n + '"' + (n === limit ? ' selected' : '') + '>' + n + '</option>').join('');
      document.getElementById('pagination-offset').value = String(offset);
      bar.style.display = getScope() === 'schema' ? 'none' : 'flex';
    }
    document.getElementById('pagination-limit').addEventListener('change', function() { limit = parseInt(this.value, 10); saveTableState(currentTableName); loadTable(currentTableName); });
    document.getElementById('pagination-offset').addEventListener('change', function() { offset = parseInt(this.value || '0', 10) || 0; });
    document.getElementById('pagination-prev').addEventListener('click', function() { offset = Math.max(0, offset - limit); document.getElementById('pagination-offset').value = String(offset); saveTableState(currentTableName); loadTable(currentTableName); });
    document.getElementById('pagination-next').addEventListener('click', function() { offset = offset + limit; document.getElementById('pagination-offset').value = String(offset); saveTableState(currentTableName); loadTable(currentTableName); });
    document.getElementById('pagination-apply').addEventListener('click', function() { offset = parseInt(document.getElementById('pagination-offset').value || '0', 10) || 0; saveTableState(currentTableName); loadTable(currentTableName); });
    document.getElementById('clear-table-state').addEventListener('click', function() {
      clearTableState(currentTableName);
      document.getElementById('row-filter').value = '';
      limit = 200;
      offset = 0;
      displayFormat = 'raw';
      var fmtSel = document.getElementById('display-format-toggle');
      if (fmtSel) fmtSel.value = 'raw';
      queryBuilderActive = false;
      queryBuilderState = null;
      if (currentTableName) loadTable(currentTableName);
    });
    document.getElementById('display-format-toggle').addEventListener('change', function() {
      displayFormat = String(this.value || 'raw');
      if (currentTableName) {
        saveTableState(currentTableName);
        if (currentTableJson) renderTableView(currentTableName, currentTableJson);
      }
    });

    // --- Column chooser, context menu, drag-and-drop (BUG-011 sticky, BUG-016 reorder/hide/pin) ---

    /** No-op: column table events are bound via document-level delegation below. */
    function bindColumnTableEvents() {}

    /** Ensures the current table has a column config with order; merges in any new keys from data. */
    function ensureColumnConfig(tableName, dataKeys) {
      var config = getColumnConfig(tableName);
      if (!config || !config.order) {
        config = { order: dataKeys.slice(), hidden: [], pinned: [] };
        setColumnConfig(tableName, config);
        return config;
      }
      var order = config.order.filter(function(k) { return dataKeys.indexOf(k) >= 0; });
      dataKeys.forEach(function(k) { if (order.indexOf(k) < 0) order.push(k); });
      config.order = order;
      if (!config.hidden) config.hidden = [];
      if (!config.pinned) config.pinned = [];
      setColumnConfig(tableName, config);
      return config;
    }

    /** Applies column config change and re-renders the current table view. */
    function applyColumnConfigAndRender() {
      if (!currentTableName || !currentTableJson) return;
      saveTableState(currentTableName);
      renderTableView(currentTableName, currentTableJson);
    }

    function populateColumnChooserList() {
      var listEl = document.getElementById('column-chooser-list');
      listEl.innerHTML = '';
      if (!currentTableName || !currentTableJson || !currentTableJson.length) return;
      var dataKeys = Object.keys(currentTableJson[0]);
      var config = ensureColumnConfig(currentTableName, dataKeys);
      config.order.forEach(function(key) {
        var li = document.createElement('li');
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.id = 'col-chooser-' + key.replace(/[^a-zA-Z0-9_]/g, '_');
        cb.checked = config.hidden.indexOf(key) < 0;
        cb.addEventListener('change', function() {
          if (this.checked) {
            config.hidden = config.hidden.filter(function(k) { return k !== key; });
          } else {
            config.hidden.push(key);
          }
          setColumnConfig(currentTableName, config);
          applyColumnConfigAndRender();
          populateColumnChooserList();
        });
        var label = document.createElement('label');
        label.htmlFor = cb.id;
        label.textContent = key;
        var pinBtn = document.createElement('button');
        pinBtn.type = 'button';
        pinBtn.textContent = config.pinned.indexOf(key) >= 0 ? 'Unpin' : 'Pin';
        pinBtn.style.fontSize = '11px';
        pinBtn.addEventListener('click', function() {
          var idx = config.pinned.indexOf(key);
          if (idx >= 0) config.pinned.splice(idx, 1);
          else config.pinned.push(key);
          setColumnConfig(currentTableName, config);
          applyColumnConfigAndRender();
          populateColumnChooserList();
        });
        li.appendChild(cb);
        li.appendChild(label);
        li.appendChild(pinBtn);
        listEl.appendChild(li);
      });
    }

    document.getElementById('column-chooser-btn').addEventListener('click', function() {
      var panel = document.getElementById('column-chooser');
      if (!currentTableName || !currentTableJson || !currentTableJson.length) {
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
      if (!currentTableName) return;
      setColumnConfig(currentTableName, null);
      delete tableColumnConfig[currentTableName];
      document.getElementById('column-chooser').style.display = 'none';
      document.getElementById('column-chooser').setAttribute('aria-hidden', 'true');
      applyColumnConfigAndRender();
    });

    // Context menu: right-click on column header
    var columnContextMenuTargetKey = null;
    document.getElementById('column-context-menu').querySelectorAll('button').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var action = this.getAttribute('data-action');
        var key = columnContextMenuTargetKey;
        document.getElementById('column-context-menu').style.display = 'none';
        document.getElementById('column-context-menu').setAttribute('aria-hidden', 'true');
        if (!key || !currentTableName || !currentTableJson) return;
        var dataKeys = Object.keys(currentTableJson[0]);
        var config = ensureColumnConfig(currentTableName, dataKeys);
        if (action === 'hide') {
          if (config.hidden.indexOf(key) < 0) config.hidden.push(key);
          setColumnConfig(currentTableName, config);
          applyColumnConfigAndRender();
        } else if (action === 'pin') {
          if (config.pinned.indexOf(key) < 0) config.pinned.push(key);
          setColumnConfig(currentTableName, config);
          applyColumnConfigAndRender();
        } else if (action === 'unpin') {
          config.pinned = config.pinned.filter(function(k) { return k !== key; });
          setColumnConfig(currentTableName, config);
          applyColumnConfigAndRender();
        }
      });
    });

    document.addEventListener('contextmenu', function(e) {
      var th = e.target.closest('#data-table th');
      if (!th) {
        document.getElementById('column-context-menu').style.display = 'none';
        return;
      }
      e.preventDefault();
      columnContextMenuTargetKey = th.getAttribute('data-column-key');
      var menu = document.getElementById('column-context-menu');
      var config = getColumnConfig(currentTableName);
      var pinned = config && config.pinned && config.pinned.indexOf(columnContextMenuTargetKey) >= 0;
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
    var columnDragKey = null;
    document.addEventListener('dragstart', function(e) {
      var th = e.target.closest('#data-table th');
      if (!th) return;
      columnDragKey = th.getAttribute('data-column-key');
      if (!columnDragKey) return;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', columnDragKey);
      e.dataTransfer.setData('application/x-column-key', columnDragKey);
    });

    document.addEventListener('dragover', function(e) {
      var th = e.target.closest('#data-table th');
      if (!th) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      document.querySelectorAll('#data-table th.drag-over').forEach(function(el) { el.classList.remove('drag-over'); });
      th.classList.add('drag-over');
    });

    document.addEventListener('dragleave', function(e) {
      if (e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('#data-table')) return;
      document.querySelectorAll('#data-table th.drag-over').forEach(function(el) { el.classList.remove('drag-over'); });
    });

    document.addEventListener('drop', function(e) {
      var th = e.target.closest('#data-table th');
      if (!th) return;
      e.preventDefault();
      th.classList.remove('drag-over');
      var dropKey = th.getAttribute('data-column-key');
      var dragKey = e.dataTransfer.getData('application/x-column-key') || columnDragKey;
      if (!dragKey || !dropKey || dragKey === dropKey || !currentTableName || !currentTableJson) return;
      var dataKeys = Object.keys(currentTableJson[0]);
      var config = ensureColumnConfig(currentTableName, dataKeys);
      var visibleOrder = config.order.filter(function(k) { return config.hidden.indexOf(k) < 0; });
      var dragIdx = visibleOrder.indexOf(dragKey);
      var dropIdx = visibleOrder.indexOf(dropKey);
      if (dragIdx < 0 || dropIdx < 0) return;
      visibleOrder.splice(dragIdx, 1);
      visibleOrder.splice(dropIdx, 0, dragKey);
      config.order = visibleOrder.concat(config.order.filter(function(k) { return config.hidden.indexOf(k) >= 0; }));
      setColumnConfig(currentTableName, config);
      applyColumnConfigAndRender();
    });

    document.addEventListener('dragend', function(e) {
      if (e.target.closest('#data-table th')) {
        document.querySelectorAll('#data-table th.drag-over').forEach(function(el) { el.classList.remove('drag-over'); });
      }
    });

    function loadSchemaView() {
      const content = document.getElementById('content');
      content.innerHTML = '<p class="meta">Loading schema…</p>';
      if (cachedSchema !== null) {
        renderSchemaContent(content, cachedSchema);
        applySearch();
     
   return;
      }
      fetch('/api/schema', authOpts())
        .then(r => r.text())
        .then(schema => {
          cachedSchema = schema;
          renderSchemaContent(content, schema);
          applySearch();
        })
        .catch(e => { content.innerHTML = '<p class="meta">Error</p><pre>' + esc(String(e)) + '</pre>'; });
    }

    function renderSchemaContent(container, schema) {
      lastRenderedData = null;
      lastRenderedSchema = schema;
      const scope = getScope();
      if (scope === 'both') {
        container.innerHTML = '<div class="search-section"><h2>Schema</h2><pre id="schema-pre">' + esc(schema) + '</pre></div><div class="search-section" id="both-data-section"><h2>Table data</h2><p class="meta">Select a table above to load data.</p></div>';
        const dataSection = document.getElementById('both-data-section');
        if (currentTableName && currentTableJson !== null) {
          const filtered = filterRows(currentTableJson);
          const jsonStr = JSON.stringify(filtered, null, 2);
          lastRenderedData = jsonStr;
          const metaText = rowCountText(currentTableName) + (getRowFilter() ? ' (filtered: ' + filtered.length + ' of ' + currentTableJson.length + ')' : '');
          var fkMap = {};
          var cachedFks = fkMetaCache[currentTableName] || [];
          cachedFks.forEach(function(fk) { fkMap[fk.fromColumn] = fk; });
          var colTypes = tableColumnTypes[currentTableName] || {};
          dataSection.innerHTML = '<h2>Table data: ' + esc(currentTableName) + '</h2><p class="meta">' + metaText + '</p>' + wrapDataTableInScroll(buildDataTableHtml(filtered, fkMap, colTypes, getColumnConfig(currentTableName)));
        }
      } else {
        container.innerHTML = '<p class="meta">Schema</p><pre id="content-pre">' + esc(schema) + '</pre>';
      }
    }

    function loadBothView() {
      const content = document.getElementById('content');
      content.innerHTML = '<p class="meta">Loading…</p>';
      (cachedSchema !== null ? Promise.resolve(cachedSchema) : fetch('/api/schema', authOpts()).then(r => r.text()))
      .then(schema => {
        if (cachedSchema === null) cachedSchema = schema;
        lastRenderedSchema = schema;
        let dataHtml = '';
        if (currentTableName && currentTableJson !== null) {
          const filtered = filterRows(currentTableJson);
          const jsonStr = JSON.stringify(filtered, null, 2);
          lastRenderedData = jsonStr;
          const metaText = rowCountText(currentTableName) + (getRowFilter() ? ' (filtered: ' + filtered.length + ' of ' + currentTableJson.length + ')' : '');
          var fkMap = {};
          var cachedFks = fkMetaCache[currentTableName] || [];
          cachedFks.forEach(function(fk) { fkMap[fk.fromColumn] = fk; });
          var colTypes = tableColumnTypes[currentTableName] || {};
          dataHtml = '<p class="meta">' + metaText + '</p>' + wrapDataTableInScroll(buildDataTableHtml(filtered, fkMap, colTypes, getColumnConfig(currentTableName)));
        } else {
          lastRenderedData = null;
          dataHtml = '<p class="meta">Select a table above to load data.</p>';
        }
        content.innerHTML = '<div class="search-section"><h2>Schema</h2><pre id="schema-pre">' + esc(schema) + '</pre></div><div class="search-section" id="both-data-section"><h2>Table data</h2>' + dataHtml + '</div>';
        applySearch();
      }).catch(e => { content.innerHTML = '<p class="meta">Error</p><pre>' + esc(String(e)) + '</pre>'; });
    }

    // --- FK relationship explorer: data, navigation, breadcrumb ---
    const fkMetaCache = {};
    const navHistory = [];

    function loadFkMeta(tableName) {
      if (fkMetaCache[tableName]) return Promise.resolve(fkMetaCache[tableName]);
      return fetch('/api/table/' + encodeURIComponent(tableName) + '/fk-meta', authOpts())
        .then(function(r) { return r.json(); })
        .then(function(fks) { fkMetaCache[tableName] = fks; return fks; })
        .catch(function() { return []; });
    }

    function buildFkSqlValue(value) {
      var isNumeric = !isNaN(value) && value.trim() !== '';
      return isNumeric ? value : "'" + value.replace(/'/g, "''") + "'";
    }

    function navigateToFk(table, column, value) {
      // Push the current table onto the breadcrumb trail before
      // navigating away, so the user can return to it later.  We
      // capture the row-filter value and pagination offset so the
      // exact view is restored on Back.
      navHistory.push({
        table: currentTableName,
        offset: offset,
        filter: document.getElementById('row-filter').value
      });
      var sqlInput = document.getElementById('sql-input');
      sqlInput.value = 'SELECT * FROM "' + table + '" WHERE "' + column + '" = ' + buildFkSqlValue(value);
      var toggle = document.getElementById('sql-runner-toggle');
      var collapsible = document.getElementById('sql-runner-collapsible');
      if (collapsible && collapsible.classList.contains('collapsed')) { toggle.click(); }
      document.getElementById('sql-run').click();
      currentTableName = table;
      // Persist the updated trail to localStorage so it survives refresh.
      saveNavHistory();
      renderBreadcrumb();
    }

    // Render the FK breadcrumb trail.  Each historical step is a clickable
    // link that truncates the trail to that point and loads the target
    // table.  The current table is shown as bold (non-clickable) at the
    // end.  A "Clear path" link lets the user discard the entire trail.
    function renderBreadcrumb() {
      var el = document.getElementById('nav-breadcrumb');
      if (!el) {
        // Create the breadcrumb container on first use and prepend it to
        // the content area so it appears above the table data.
        el = document.createElement('div');
        el.id = 'nav-breadcrumb';
        el.style.cssText = 'font-size:11px;margin:0.3rem 0;color:var(--muted);';
        document.getElementById('content').prepend(el);
      }

      // Nothing to show when there is no navigation history.
      if (navHistory.length === 0) { el.style.display = 'none'; return; }

      // --- Build the breadcrumb HTML ---

      // "Back" link: pops the most recent entry (same as browser back)
      var html = '<a href="#" id="nav-back" style="color:var(--link);">&#8592; Back</a>';

      // "Clear path" link: discards the entire trail and hides the breadcrumb
      html += ' | <a href="#" id="nav-clear" style="color:var(--muted);font-size:10px;">Clear path</a>';

      // Separator before the breadcrumb trail
      html += ' | ';

      // Each history entry becomes a clickable link.  Clicking it
      // truncates the trail to that index and loads the table, letting
      // the user jump directly to any ancestor in a deep FK chain
      // (e.g. users > orders > order_items > products -- clicking
      // "orders" jumps straight there).
      html += navHistory.map(function(h, idx) {
        return '<a href="#" class="nav-crumb" data-idx="' + idx + '" '
          + 'style="color:var(--link);" '
          + 'title="Jump to ' + esc(h.table) + '">'
          + esc(h.table) + '</a>';
      }).join(' &#8594; ');

      // The current table is the final segment -- shown as bold, not
      // clickable, because it is already the active view.
      html += ' &#8594; <strong>' + esc(currentTableName || '') + '</strong>';

      el.innerHTML = html;
      el.style.display = 'block';

      // --- Bind event handlers ---

      // Back button: pop the last entry and navigate to it
      var backBtn = document.getElementById('nav-back');
      if (backBtn) {
        backBtn.onclick = function(e) {
          e.preventDefault();
          var prev = navHistory.pop();
          if (prev) {
            offset = prev.offset || 0;
            loadTable(prev.table);
            if (prev.filter) document.getElementById('row-filter').value = prev.filter;
            // Persist after popping so refresh reflects the shorter trail
            saveNavHistory();
            renderBreadcrumb();
          }
        };
      }

      // Clear path button: discard everything and hide the breadcrumb
      var clearBtn = document.getElementById('nav-clear');
      if (clearBtn) {
        clearBtn.onclick = function(e) {
          e.preventDefault();
          clearNavHistory();
          renderBreadcrumb();
        };
      }

      // Clickable breadcrumb steps: truncate the history to the clicked
      // index and load that table.  For example, if the trail is
      // [A, B, C] and the user clicks B (index 1), we keep [A] in
      // history and load B.
      el.querySelectorAll('.nav-crumb').forEach(function(crumb) {
        crumb.onclick = function(e) {
          e.preventDefault();
          var idx = parseInt(/** @type {Element} */ (/** @type {unknown} */ (this)).getAttribute('data-idx'), 10);
          if (isNaN(idx) || idx < 0 || idx >= navHistory.length) return;

          // The clicked entry becomes the new current table.  Everything
          // after it in the trail is discarded (truncated).
          var target = navHistory[idx];

          // Keep only entries *before* the clicked index -- those are
          // the ancestors of the table we are about to navigate to.
          navHistory.length = idx;

          // Restore the pagination offset and filter from the target
          // entry so the user returns to the exact view they had before.
          offset = target.offset || 0;
          loadTable(target.table);
          if (target.filter) document.getElementById('row-filter').value = target.filter;

          // Persist the truncated trail
          saveNavHistory();
          renderBreadcrumb();
        };
      });
    }

    /**
     * Builds the data table HTML with optional column order, visibility, and pinning.
     * @param filtered - Array of row objects
     * @param fkMap - Map of column name to FK metadata
     * @param colTypes - Map of column name to type for formatting
     * @param columnConfig - Optional { order: string[], hidden: string[], pinned: string[] }
     * @returns HTML string for <table id="data-table"> with data-column-key and col-pinned where applicable
     */
    function buildDataTableHtml(filtered, fkMap, colTypes, columnConfig) {
      if (!filtered || filtered.length === 0) return '<p class="meta">No rows.</p>';
      var dataKeys = Object.keys(filtered[0]);
      var order = dataKeys.slice();
      var hidden = [];
      var pinned = [];
      if (columnConfig && columnConfig.order && columnConfig.order.length) {
        order = columnConfig.order.filter(function(k) { return dataKeys.indexOf(k) >= 0; });
        dataKeys.forEach(function(k) { if (order.indexOf(k) < 0) order.push(k); });
      }
      if (columnConfig && columnConfig.hidden) hidden = columnConfig.hidden;
      if (columnConfig && columnConfig.pinned) pinned = columnConfig.pinned;
      var visible = order.filter(function(k) { return hidden.indexOf(k) < 0; });

      var html = '<table id="data-table"><thead><tr>';
      visible.forEach(function(k) {
        var fk = fkMap[k];
        var fkLabel = fk ? ' <span style="color:var(--muted);font-size:10px;" title="FK to ' + esc(fk.toTable) + '.' + esc(fk.toColumn) + '">&#8599;</span>' : '';
        var thClass = pinned.indexOf(k) >= 0 ? ' class="col-pinned"' : '';
        html += '<th data-column-key="' + esc(k) + '" draggable="true"' + thClass + ' title="Drag to reorder; right-click for menu">' + esc(k) + fkLabel + '</th>';
      });
      html += '</tr></thead><tbody>';
      filtered.forEach(function(row) {
        html += '<tr>';
        visible.forEach(function(k) {
          var val = row[k];
          var fk = fkMap[k];
          var rawStr = val != null ? String(val) : '';
          var cellContent;
          if (displayFormat === 'formatted' && colTypes) {
            var fmt = formatCellValue(val, k, colTypes[k]);
            if (fmt.wasFormatted) {
              cellContent = '<span title="Raw: ' + esc(fmt.raw) + '">' + esc(fmt.formatted) + '</span>'
                + '<span class="cell-raw">' + esc(fmt.raw) + '</span>';
            } else {
              cellContent = esc(rawStr);
            }
          } else {
            cellContent = esc(rawStr);
          }
          var copyBtn = '<button type="button" class="cell-copy-btn" data-raw="' + esc(rawStr) + '" title="Copy value">&#x2398;</button>';
          var tdClass = pinned.indexOf(k) >= 0 ? ' class="col-pinned"' : '';
          var tdAttrs = ' data-column-key="' + esc(k) + '"' + tdClass;
          if (fk && val != null) {
            html += '<td' + tdAttrs + '><a href="#" class="fk-link" style="color:var(--link);text-decoration:underline;" ';
            html += 'data-table="' + esc(fk.toTable) + '" ';
            html += 'data-column="' + esc(fk.toColumn) + '" ';
            html += 'data-value="' + esc(rawStr) + '">' ;
            html += cellContent + ' &#8594;</a>' + copyBtn + '</td>';
          } else {
            html += '<td' + tdAttrs + '>' + cellContent + copyBtn + '</td>';
          }
        });
        html += '</tr>';
      });
      html += '</tbody></table>';
      return html;
    }

    /** Wraps table HTML in the scroll container so sticky headers and horizontal scroll work. */
    function wrapDataTableInScroll(tableHtml) {
      if (!tableHtml || tableHtml.indexOf('<table') < 0) return tableHtml;
      return '<div id="data-table-scroll-wrap" class="data-table-scroll-wrap">' + tableHtml + '</div>';
    }

    function renderTableView(name, data) {
      const content = document.getElementById('content');
      const scope = getScope();
      const filtered = filterRows(data);
      const jsonStr = JSON.stringify(filtered, null, 2);
      lastRenderedData = jsonStr;
      const metaText = rowCountText(name) + (getRowFilter() ? ' (filtered: ' + filtered.length + ' of ' + data.length + ')' : '');
      // Show/hide display format bar when viewing table data
      var formatBar = document.getElementById('display-format-bar');
      if (formatBar) formatBar.style.display = (scope !== 'schema') ? 'flex' : 'none';
      // Show loading hint while FK metadata is being fetched for the first time
      if (!fkMetaCache[name] && scope !== 'both') {
        content.innerHTML = '<p class="meta">' + metaText + '</p><p class="meta">Loading\u2026</p>';
      }
      function renderDataHtml(fkMap, colTypes) {
        var tableHtml = wrapDataTableInScroll(buildDataTableHtml(filtered, fkMap, colTypes, getColumnConfig(name)));
        var qbHtml = buildQueryBuilderHtml(name, colTypes);
        if (scope === 'both') {
          lastRenderedSchema = cachedSchema;
          if (cachedSchema === null) {
            fetch('/api/schema', authOpts()).then(function(r) { return r.text(); }).then(function(schema) {
              cachedSchema = schema;
              lastRenderedSchema = schema;
              content.innerHTML = '<div class="search-section"><h2>Schema</h2><pre id="schema-pre">' + esc(schema) + '</pre></div><div class="search-section" id="both-data-section"><h2>Table data: ' + esc(name) + '</h2><p class="meta">' + metaText + '</p>' + qbHtml + tableHtml + '</div>';
              bindQueryBuilderEvents(colTypes);
              if (queryBuilderState) restoreQueryBuilderUIState(queryBuilderState);
              applySearch();
              renderBreadcrumb();
              bindColumnTableEvents();
            });
          } else {
            var dataSection = document.getElementById('both-data-section');
            if (dataSection) {
              dataSection.innerHTML = '<h2>Table data: ' + esc(name) + '</h2><p class="meta">' + metaText + '</p>' + qbHtml + tableHtml;
              bindColumnTableEvents();
              bindQueryBuilderEvents(colTypes);
              if (queryBuilderState) restoreQueryBuilderUIState(queryBuilderState);
            }
            applySearch();
            renderBreadcrumb();
          }
        } else {
          lastRenderedSchema = null;
          content.innerHTML = '<p class="meta">' + metaText + '</p>' + qbHtml + tableHtml;
          bindQueryBuilderEvents(colTypes);
          if (queryBuilderState) restoreQueryBuilderUIState(queryBuilderState);
          applySearch();
          renderBreadcrumb();
          bindColumnTableEvents();
        }
      }
      // Load FK metadata and column types in parallel, then render
      Promise.all([
        loadFkMeta(name),
        loadColumnTypes(name).catch(function() { return {}; })
      ]).then(function(results) {
        var fks = results[0];
        var colTypes = results[1];
        var fkMap = {};
        (fks || []).forEach(function(fk) { fkMap[fk.fromColumn] = fk; });
        renderDataHtml(fkMap, colTypes);
      });
    }

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

    function rowCountText(name) {
      const total = tableCounts[name];
      const len = (currentTableJson && currentTableJson.length) || 0;
      if (total == null) return esc(name) + ' (up to ' + limit + ' rows)';
      const rangeText = len > 0 ? ('showing ' + (offset + 1) + '–' + (offset + len)) : 'no rows in this range';
      return esc(name) + ' (' + total + ' row' + (total !== 1 ? 's' : '') + '; ' + rangeText + ')';
    }

    function loadTable(name) {
      if (currentTableName && currentTableName !== name) {
        saveTableState(currentTableName);
      }
      var isNewTable = (currentTableName !== name);
      currentTableName = name;
      if (isNewTable) restoreTableState(name);
      const content = document.getElementById('content');
      const scope = getScope();
      if (scope === 'both' && cachedSchema !== null) {
        content.innerHTML = '<p class="meta">Loading ' + esc(name) + '…</p>';
      } else if (scope !== 'both') {
        content.innerHTML = '<p class="meta">' + esc(name) + '</p><p class="meta">Loading…</p>';
      }
      fetch('/api/table/' + encodeURIComponent(name) + '?limit=' + limit + '&offset=' + offset, authOpts())
        .then(r => r.json())
        .then(data => {
          if (currentTableName !== name) return;
          currentTableJson = data;
          setupPagination();
          renderTableView(name, data);
          fetch('/api/table/' + encodeURIComponent(name) + '/count', authOpts())
            .then(r => r.json())
            .then(o => {
              if (currentTableName !== name) return;
              tableCounts[name] = o.count;
              renderTableView(name, data);
            })
            .catch(() => {});
        })
        .catch(e => {
          if (currentTableName !== name) return;
          content.innerHTML = '<p class="meta">Error</p><pre>' + esc(String(e)) + '</pre>';
        });
    }

    function renderTableList(tables) {
      const ul = document.getElementById('tables');
      ul.innerHTML = '';
      tables.forEach(t => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = '#' + encodeURIComponent(t);
        a.textContent = (tableCounts[t] != null) ? (t + ' (' + tableCounts[t] + ' rows)') : t;
        a.onclick = e => { e.preventDefault(); loadTable(t); };
        li.appendChild(a);
        ul.appendChild(li);
      });
      const sqlTableSel = document.getElementById('sql-table');
      if (sqlTableSel) {
        sqlTableSel.innerHTML = '<option value="">—</option>' + tables.map(t => '<option value="' + esc(t) + '">' + esc(t) + '</option>').join('');
      }
      const importTableSel = document.getElementById('import-table');
      if (importTableSel) {
        importTableSel.innerHTML = tables.map(t => '<option value="' + esc(t) + '">' + esc(t) + (tableCounts[t] != null ? ' (' + tableCounts[t] + ' rows)' : '') + '</option>').join('');
      }
    }

    // --- Chart rendering (pure SVG, no dependencies) ---
    var CHART_COLORS = [
      '#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f',
      '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac'
    ];

    function renderBarChart(container, data, xKey, yKey) {
      var W = 600, H = 300, PAD = 50;
      var vals = data.map(function(d) { return Number(d[yKey]) || 0; });
      var maxVal = Math.max.apply(null, vals.concat([1]));
      var barW = Math.max(4, (W - PAD * 2) / data.length - 2);
      var svg = '<svg width="' + W + '" height="' + H + '" xmlns="http://www.w3.org/2000/svg">';
      svg += '<line class="chart-axis" x1="' + PAD + '" y1="' + (H - PAD) + '" x2="' + (W - PAD) + '" y2="' + (H - PAD) + '"/>';
      svg += '<line class="chart-axis" x1="' + PAD + '" y1="' + PAD + '" x2="' + PAD + '" y2="' + (H - PAD) + '"/>';
      for (var i = 0; i <= 4; i++) {
        var v = (maxVal / 4 * i).toFixed(maxVal > 100 ? 0 : 1);
        var y = H - PAD - (i / 4) * (H - PAD * 2);
        svg += '<text class="chart-axis-label" x="' + (PAD - 4) + '" y="' + (y + 3) + '" text-anchor="end">' + v + '</text>';
      }
      data.forEach(function(d, i) {
        var val = Number(d[yKey]) || 0;
        var bh = (val / maxVal) * (H - PAD * 2);
        var x = PAD + i * (barW + 2);
        var by = H - PAD - bh;
        svg += '<rect class="chart-bar" x="' + x + '" y="' + by + '" width="' + barW + '" height="' + bh + '">';
        svg += '<title>' + esc(String(d[xKey])) + ': ' + val + '</title></rect>';
        if (data.length <= 20) {
          svg += '<text class="chart-label" x="' + (x + barW / 2) + '" y="' + (H - PAD + 14) + '" text-anchor="middle" transform="rotate(-45,' + (x + barW / 2) + ',' + (H - PAD + 14) + ')">' + esc(String(d[xKey]).slice(0, 12)) + '</text>';
        }
      });
      svg += '</svg>';
      container.innerHTML = svg;
      container.style.display = 'block';
    }

    function renderPieChart(container, data, labelKey, valueKey) {
      var W = 500, H = 350, R = 130, CX = 200, CY = H / 2;
      var vals = data.map(function(d) { return Math.max(0, Number(d[valueKey]) || 0); });
      var total = vals.reduce(function(a, b) { return a + b; }, 0) || 1;
      var threshold = total * 0.02;
      var significant = [];
      var otherVal = 0;
      data.forEach(function(d, i) {
        if (vals[i] >= threshold) significant.push({ label: d[labelKey], value: vals[i] });
        else otherVal += vals[i];
      });
      if (otherVal > 0) significant.push({ label: 'Other', value: otherVal });
      var svg = '<svg width="' + W + '" height="' + H + '" xmlns="http://www.w3.org/2000/svg">';
      var angle = 0;
      significant.forEach(function(d, i) {
        var sweep = (d.value / total) * 2 * Math.PI;
        var color = CHART_COLORS[i % CHART_COLORS.length];
        var pct = (d.value / total * 100).toFixed(1);
        var tip = '<title>' + esc(String(d.label)) + ': ' + d.value + ' (' + pct + '%)</title>';
        if (sweep >= 2 * Math.PI - 0.001) {
          // Full circle — SVG arc degenerates when start ≈ end; use <circle> instead
          svg += '<circle class="chart-slice" cx="' + CX + '" cy="' + CY + '" r="' + R + '" fill="' + color + '">' + tip + '</circle>';
        } else {
          var x1 = CX + R * Math.cos(angle);
          var y1 = CY + R * Math.sin(angle);
          var x2 = CX + R * Math.cos(angle + sweep);
          var y2 = CY + R * Math.sin(angle + sweep);
          var large = sweep > Math.PI ? 1 : 0;
          svg += '<path class="chart-slice" d="M' + CX + ',' + CY + ' L' + x1 + ',' + y1 + ' A' + R + ',' + R + ' 0 ' + large + ' 1 ' + x2 + ',' + y2 + ' Z" fill="' + color + '">' + tip + '</path>';
        }
        angle += sweep;
      });
      significant.forEach(function(d, i) {
        var ly = 20 + i * 18;
        var lx = CX + R + 30;
        var color = CHART_COLORS[i % CHART_COLORS.length];
        svg += '<rect x="' + lx + '" y="' + (ly - 8) + '" width="10" height="10" fill="' + color + '"/>';
        svg += '<text class="chart-legend" x="' + (lx + 14) + '" y="' + ly + '">' + esc(String(d.label).slice(0, 20)) + ' (' + d.value + ')</text>';
      });
      svg += '</svg>';
      container.innerHTML = svg;
      container.style.display = 'block';
    }

    function renderLineChart(container, data, xKey, yKey) {
      var W = 600, H = 300, PAD = 50;
      var vals = data.map(function(d) { return Number(d[yKey]) || 0; });
      var maxVal = Math.max.apply(null, vals.concat([1]));
      var minVal = Math.min.apply(null, vals.concat([0]));
      var range = maxVal - minVal || 1;
      var stepX = (W - PAD * 2) / Math.max(data.length - 1, 1);
      var svg = '<svg width="' + W + '" height="' + H + '" xmlns="http://www.w3.org/2000/svg">';
      svg += '<line class="chart-axis" x1="' + PAD + '" y1="' + (H - PAD) + '" x2="' + (W - PAD) + '" y2="' + (H - PAD) + '"/>';
      svg += '<line class="chart-axis" x1="' + PAD + '" y1="' + PAD + '" x2="' + PAD + '" y2="' + (H - PAD) + '"/>';
      var points = data.map(function(d, i) {
        var x = PAD + i * stepX;
        var y = H - PAD - ((Number(d[yKey]) || 0) - minVal) / range * (H - PAD * 2);
        return x + ',' + y;
      });
      svg += '<polygon points="' + PAD + ',' + (H - PAD) + ' ' + points.join(' ') + ' ' + (PAD + (data.length - 1) * stepX) + ',' + (H - PAD) + '" fill="var(--link)" opacity="0.1"/>';
      svg += '<polyline class="chart-line" points="' + points.join(' ') + '"/>';
      data.forEach(function(d, i) {
        var x = PAD + i * stepX;
        var y = H - PAD - ((Number(d[yKey]) || 0) - minVal) / range * (H - PAD * 2);
        svg += '<circle class="chart-dot" cx="' + x + '" cy="' + y + '" r="3"><title>' + esc(String(d[xKey])) + ': ' + d[yKey] + '</title></circle>';
      });
      svg += '</svg>';
      container.innerHTML = svg;
      container.style.display = 'block';
    }

    function renderHistogram(container, data, valueKey, bins) {
      bins = bins || 10;
      var vals = data.map(function(d) { return Number(d[valueKey]); }).filter(function(v) { return isFinite(v); });
      if (vals.length === 0) { container.innerHTML = '<p class="meta">No numeric data.</p>'; container.style.display = 'block'; return; }
      var min = Math.min.apply(null, vals);
      var max = Math.max.apply(null, vals);
      var binWidth = (max - min) / bins || 1;
      var counts = new Array(bins).fill(0);
      vals.forEach(function(v) {
        var idx = Math.min(Math.floor((v - min) / binWidth), bins - 1);
        counts[idx]++;
      });
      var histData = counts.map(function(c, i) {
        return { label: (min + i * binWidth).toFixed(1) + '-' + (min + (i + 1) * binWidth).toFixed(1), value: c };
      });
      renderBarChart(container, histData, 'label', 'value');
    }

    document.getElementById('chart-render').addEventListener('click', function() {
      var type = document.getElementById('chart-type').value;
      var xKey = document.getElementById('chart-x').value;
      var yKey = document.getElementById('chart-y').value;
      var container = document.getElementById('chart-container');
      var rows = window._chartRows || [];
      if (type === 'none' || rows.length === 0) { container.style.display = 'none'; return; }
      var chartData = rows;
      if (rows.length > 500) {
        var nth = Math.ceil(rows.length / 500);
        chartData = rows.filter(function(_, i) { return i % nth === 0; });
      }

      if (type === 'bar') renderBarChart(container, chartData, xKey, yKey);
      else if (type === 'pie') renderPieChart(container, chartData, xKey, yKey);
      else if (type === 'line') renderLineChart(container, chartData, xKey, yKey);
      else if (type === 'histogram') renderHistogram(container, chartData, yKey);
    });

    (function initSqlRunner() {
      const toggle = document.getElementById('sql-runner-toggle');
      const collapsible = document.getElementById('sql-runner-collapsible');
      const templateSel = document.getElementById('sql-template');
      const tableSel = document.getElementById('sql-table');
      const fieldsSel = document.getElementById('sql-fields');
      const applyBtn = document.getElementById('sql-apply-template');
      const runBtn = document.getElementById('sql-run');
      const explainBtn = document.getElementById('sql-explain');
      const historySel = document.getElementById('sql-history');
      const formatSel = document.getElementById('sql-result-format');
      const inputEl = document.getElementById('sql-input');
      const errorEl = document.getElementById('sql-error');
      const resultEl = document.getElementById('sql-result');
      const bookmarksSel = document.getElementById('sql-bookmarks');
      const bookmarkSaveBtn = document.getElementById('sql-bookmark-save');
      const bookmarkDeleteBtn = document.getElementById('sql-bookmark-delete');
      const bookmarkExportBtn = document.getElementById('sql-bookmark-export');
      const bookmarkImportBtn = document.getElementById('sql-bookmark-import');
      loadSqlHistory();
      refreshHistoryDropdown(historySel);
      loadBookmarks();
      refreshBookmarksDropdown(bookmarksSel);
      bindDropdownToInput(historySel, sqlHistory, inputEl);
      bindDropdownToInput(bookmarksSel, sqlBookmarks, inputEl);
      if (bookmarkSaveBtn) bookmarkSaveBtn.addEventListener('click', function() { addBookmark(inputEl, bookmarksSel); });
      if (bookmarkDeleteBtn) bookmarkDeleteBtn.addEventListener('click', function() { deleteBookmark(bookmarksSel); });
      if (bookmarkExportBtn) bookmarkExportBtn.addEventListener('click', exportBookmarks);
      if (bookmarkImportBtn) bookmarkImportBtn.addEventListener('click', function() { importBookmarks(bookmarksSel); });

      if (!toggle || !collapsible) return;

      toggle.addEventListener('click', function() {
        const isCollapsed = collapsible.classList.contains('collapsed');
        collapsible.classList.toggle('collapsed', !isCollapsed);
        this.textContent = isCollapsed ? '▲ Run SQL (read-only)' : '▼ Run SQL (read-only)';
      });

      const TEMPLATES = {
        'select-star-limit': function(t, cols) { return 'SELECT * FROM "' + t + '" LIMIT 10'; },
        'select-star': function(t, cols) { return 'SELECT * FROM "' + t + '"'; },
        'count': function(t, cols) { return 'SELECT COUNT(*) FROM "' + t + '"'; },
        'select-fields': function(t, cols) {
          const list = (cols && cols.length) ? cols.map(c => '"' + c + '"').join(', ') : '*';
          return 'SELECT ' + list + ' FROM "' + t + '" LIMIT 10';
        }
      };

      function getSelectedFields() {
        const opts = fieldsSel ? Array.from(fieldsSel.selectedOptions || []) : [];
        return opts.map(o => o.value).filter(Boolean);
      }

      function applyTemplate() {
        const table = (tableSel && tableSel.value) || '';
        const templateId = (templateSel && templateSel.value) || 'custom';
        if (templateId === 'custom') return;
        const fn = TEMPLATES[templateId];
        if (!fn) return;
        const cols = getSelectedFields();
        const sql = table ? fn(table, cols) : ('SELECT * FROM "' + (table || 'table_name') + '" LIMIT 10');
        if (inputEl) inputEl.value = sql;
      }

      if (applyBtn) applyBtn.addEventListener('click', applyTemplate);
      if (templateSel) templateSel.addEventListener('change', applyTemplate);

      if (tableSel) {
        tableSel.addEventListener('change', function() {
          const name = this.value;
          fieldsSel.innerHTML = '<option value="">—</option>';
          if (!name) return;
          fieldsSel.innerHTML = '<option value="">Loading…</option>';
          const requestedTable = name;
          fetch('/api/table/' + encodeURIComponent(name) + '/columns', authOpts())
            .then(r => r.json())
            .then(cols => {
              if (tableSel.value !== requestedTable) return;
              if (Array.isArray(cols)) {
                fieldsSel.innerHTML = '<option value="">—</option>' + cols.map(c => '<option value="' + esc(c) + '">' + esc(c) + '</option>').join('');
              } else {
                fieldsSel.innerHTML = '<option value="">—</option>';
              }
            })
            .catch(() => {
              if (tableSel.value !== requestedTable) return;
              fieldsSel.innerHTML = '<option value="">—</option>';
            });
        });
      }

      // Shared: clear previous results and hide chart controls before any SQL operation.
      function clearSqlResults() {
        errorEl.style.display = 'none';
        resultEl.style.display = 'none';
        resultEl.innerHTML = '';
        document.getElementById('chart-controls').style.display = 'none';
        document.getElementById('chart-container').style.display = 'none';
      }
      // Shared: disable both Run and Explain buttons to prevent concurrent requests.
      function setSqlButtonsDisabled(disabled) {
        if (runBtn) runBtn.disabled = disabled;
        if (explainBtn) explainBtn.disabled = disabled;
      }

      if (runBtn && inputEl && errorEl && resultEl) {
        runBtn.addEventListener('click', function() {
          const sql = String(inputEl.value || '').trim();
          clearSqlResults();
          if (!sql) {
            errorEl.textContent = 'Enter a SELECT query.';
            errorEl.style.display = 'block';
         
   return;
          }
          const runBtnOrigText = runBtn.textContent;
          runBtn.textContent = 'Running\u2026';
          setSqlButtonsDisabled(true);
          fetch('/api/sql', authOpts({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sql: sql })
          }))
            .then(r => r.json().then(data => ({ ok: r.ok, data: data })))
            .then(({ ok, data }) => {
              if (!ok) {
                errorEl.textContent = data.error || 'Request failed';
                errorEl.style.display = 'block';
             
   return;
              }
              const rows = data.rows || [];
              const asTable = formatSel && formatSel.value === 'table';
              if (asTable && rows.length > 0) {
                const keys = Object.keys(rows[0]);
                let html = '<p class="meta">' + rows.length + ' row(s)</p><table><thead><tr>' + keys.map(k => '<th>' + esc(k) + '</th>').join('') + '</tr></thead><tbody>';
                rows.forEach(row => {
                  html += '<tr>' + keys.map(k => '<td>' + esc(row[k] != null ? String(row[k]) : '') + '</td>').join('') + '</tr>';
                });
                html += '</tbody></table>';
                resultEl.innerHTML = html;
              } else {
                resultEl.innerHTML = '<p class="meta">' + rows.length + ' row(s)</p><pre>' + esc(JSON.stringify(rows, null, 2)) + '</pre>';
              }
              resultEl.style.display = 'block';
              // Show chart controls when results available
              var chartControls = document.getElementById('chart-controls');
              if (rows.length > 0) {
                var keys2 = Object.keys(rows[0]);
                var xSel = document.getElementById('chart-x');
                var ySel = document.getElementById('chart-y');
                xSel.innerHTML = keys2.map(function(k) { return '<option>' + esc(k) + '</option>'; }).join('');
                ySel.innerHTML = keys2.map(function(k) { return '<option>' + esc(k) + '</option>'; }).join('');
                chartControls.style.display = 'flex';
                window._chartRows = rows;
              } else {
                chartControls.style.display = 'none';
                document.getElementById('chart-container').style.display = 'none';
              }
              pushSqlHistory(sql, rows.length);
              refreshHistoryDropdown(historySel);
            })
            .catch(e => {
              errorEl.textContent = e.message || String(e);
              errorEl.style.display = 'block';
            })
            .finally(() => {
              setSqlButtonsDisabled(false);
              runBtn.textContent = runBtnOrigText;
            });
        });
      }

      if (explainBtn && inputEl && errorEl && resultEl) {
        explainBtn.addEventListener('click', function() {
          const sql = String(inputEl.value || '').trim();
          clearSqlResults();
          if (!sql) {
            errorEl.textContent = 'Enter a SELECT query.';
            errorEl.style.display = 'block';
         
   return;
          }
          const explainOrigText = explainBtn.textContent;
          explainBtn.textContent = 'Explaining\u2026';
          setSqlButtonsDisabled(true);
          fetch('/api/sql/explain', authOpts({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sql: sql })
          }))
            .then(r => r.json().then(d => ({ ok: r.ok, data: d })))
            .then(({ ok, data }) => {
              if (!ok) {
                errorEl.textContent = data.error || 'Request failed';
                errorEl.style.display = 'block';
             
   return;
              }
              const rows = data.rows || [];
              // Build parent-to-depth map for tree indentation
              var depthMap = {};
              rows.forEach(function(r) {
                var pid = r.parent || 0;
                depthMap[r.id] = (depthMap[pid] != null ? depthMap[pid] + 1 : 0);
              });
              let html = '<p class="meta" style="font-weight:bold;">EXPLAIN QUERY PLAN</p>';
              html += '<pre style="font-family:monospace;font-size:12px;line-height:1.6;">';
              let hasScan = false;
              let hasIndex = false;
              rows.forEach(function(r) {
                const detail = r.detail || JSON.stringify(r);
                const depth = depthMap[r.id] || 0;
                const indent = '  '.repeat(depth);
                let icon = '   ';
                let style = '';
                if (/\\bSCAN\\b/.test(detail)) {
                  icon = '!! ';
                  style = ' style="color:#e57373;"';
                  hasScan = true;
                } else if (/\\bSEARCH\\b.*\\bINDEX\\b/.test(detail)) {
                  icon = 'OK ';
                  style = ' style="color:#7cb342;"';
                  hasIndex = true;
                } else if (/\\bUSING\\b.*\\bINDEX\\b/.test(detail)) {
                  icon = 'OK ';
                  style = ' style="color:#7cb342;"';
                  hasIndex = true;
                }
                html += '<span' + style + '>' + icon + indent + esc(detail) + '</span>\\n';
              });
              html += '</pre>';
              if (hasScan) {
                html += '<p class="meta" style="color:#e57373;margin-top:0.3rem;">';
                html += 'Warning: Full table scan detected. Consider adding an index on the filtered/sorted column.</p>';
              }
              if (hasIndex && !hasScan) {
                html += '<p class="meta" style="color:#7cb342;margin-top:0.3rem;">';
                html += 'Good: Query uses index(es) for efficient lookup.</p>';
              }
              resultEl.innerHTML = html;
              resultEl.style.display = 'block';
            })
            .catch(e => {
              errorEl.textContent = e.message || String(e);
              errorEl.style.display = 'block';
            })
            .finally(() => {
              setSqlButtonsDisabled(false);
              explainBtn.textContent = explainOrigText;
            });
        });
      }
    })();

    // Shared: render table list and kick off count fetches (used by initial load and live refresh).
    function applyTableListAndCounts(tables) {
      renderTableList(tables);
      tables.forEach(t => {
        fetch('/api/table/' + encodeURIComponent(t) + '/count', authOpts())
          .then(r => r.json())
          .then(o => { tableCounts[t] = o.count; renderTableList(tables); })
          .catch(() => {});
      });
    }
    function refreshOnGenerationChange() {
      if (refreshInFlight) return;
      refreshInFlight = true;
      var liveEl = document.getElementById('live-indicator');
      // Only show "Updating..." if we're actually connected — avoids
      // overwriting the "Disconnected" indicator during a stale refresh.
      if (liveEl && connectionState === 'connected') liveEl.textContent = 'Updating…';
      fetch('/api/tables', authOpts())
        .then(function(r) { return r.json(); })
        .then(function(tables) {
          applyTableListAndCounts(tables);
          if (currentTableName) loadTable(currentTableName);
        })
        .catch(function() {})
        .finally(function() {
          refreshInFlight = false;
          // Restore indicator based on current connection + polling state.
          updateLiveIndicatorForConnection();
        });
    }
    // Long-poll /api/generation?since=N; when generation changes,
    // refresh table list and current table. Enhanced with exponential
    // backoff and connection state tracking for offline resilience.
    function pollGeneration() {
      fetch('/api/generation?since=' + lastGeneration, authOpts())
        .then(function(r) { return r.json(); })
        .then(function(data) {
          var g = data.generation;
          // Successful response: mark connected, reset backoff.
          setConnected();

          if (typeof g === 'number' && g !== lastGeneration) {
            // Server restart detection: if generation went backwards
            // the server restarted and data may have changed.
            if (g < lastGeneration) {
              console.log('Server generation reset detected ('
                + lastGeneration + ' -> ' + g
                + '). Server may have restarted.');
            }
            lastGeneration = g;
            refreshOnGenerationChange();
          }
          // Continue polling immediately on success.
          pollGeneration();
        })
        .catch(function() {
          // Poll failed. Increment failure count and apply backoff.
          consecutivePollFailures++;

          // After first failure, mark disconnected to show banner.
          if (consecutivePollFailures >= 1 && connectionState === 'connected') {
            setDisconnected();
          }

          // After HEALTH_CHECK_THRESHOLD consecutive failures, switch
          // to lightweight /api/health heartbeat checks (the generation
          // endpoint has a 30 s server-side timeout, making it slow to
          // detect recovery).
          if (consecutivePollFailures >= HEALTH_CHECK_THRESHOLD) {
            startHeartbeat();
            return;
          }

          // Exponential backoff for early failures (before switching
          // to heartbeat). Doubles each time: 1 s, 2 s, 4 s.
          currentBackoffMs = Math.min(
            currentBackoffMs * BACKOFF_MULTIPLIER, BACKOFF_MAX_MS
          );
          setTimeout(pollGeneration, currentBackoffMs);
        });
    }
    // --- Polling toggle ---
    var pollingEnabled = true;
    var pollingBtn = document.getElementById('polling-toggle');
    var liveIndicator = document.getElementById('live-indicator');
    // Read initial state from server on page load.
    fetch('/api/change-detection', authOpts())
      .then(function(r) { return r.json(); })
      .then(function(data) {
        pollingEnabled = data.changeDetection !== false;
        updatePollingUI();
      })
      .catch(function() { /* keep default ON */ });
    function updatePollingUI() {
      if (pollingBtn) {
        pollingBtn.textContent = pollingEnabled ? 'Polling: ON' : 'Polling: OFF';
        pollingBtn.classList.toggle('polling-off', !pollingEnabled);
      }
      // Only update the live indicator text when connected. When
      // disconnected, updateLiveIndicatorForConnection() manages it.
      if (liveIndicator && connectionState === 'connected') {
        liveIndicator.textContent = pollingEnabled ? '● Live' : '● Paused';
        liveIndicator.classList.toggle('paused', !pollingEnabled);
      }
    }
    if (pollingBtn) {
      pollingBtn.addEventListener('click', function() {
        // Prevent double-clicks while the request is in flight.
        pollingBtn.disabled = true;
        pollingBtn.textContent = 'Polling...';
        var newState = !pollingEnabled;
        fetch('/api/change-detection', Object.assign({}, authOpts(), {
          method: 'POST',
          headers: Object.assign({ 'Content-Type': 'application/json' },
            (authOpts().headers || {})),
          body: JSON.stringify({ enabled: newState })
        }))
          .then(function(r) { return r.json(); })
          .then(function(data) {
            pollingEnabled = data.changeDetection !== false;
          })
          .catch(function(e) {
            console.error('Failed to toggle polling:', e);
          })
          .finally(function() {
            // Re-enable the button and restore its label
            // regardless of success or failure.
            pollingBtn.disabled = false;
            updatePollingUI();
            // Reflect connection state on the live indicator
            // (updatePollingUI defers when disconnected).
            updateLiveIndicatorForConnection();
            // When polling is turned OFF, start a slow keep-alive
            // so we still detect disconnection. When turned ON,
            // the normal pollGeneration loop handles monitoring.
            if (!pollingEnabled && connectionState === 'connected') {
              startKeepAlive();
            } else {
              stopKeepAlive();
            }
          });
      });
    }
    // --- NL-to-SQL event handlers ---
    document.getElementById('nl-convert').addEventListener('click', async function () {
      var question = String(document.getElementById('nl-input').value || '').trim();
      if (!question) return;
      var btn = this;
      btn.disabled = true;
      btn.textContent = 'Converting...';
      try {
        var meta = await loadSchemaMeta();
        var result = nlToSql(question, meta);
        if (result.sql) {
          document.getElementById('sql-input').value = result.sql;
          document.getElementById('sql-error').style.display = 'none';
        } else {
          document.getElementById('sql-error').textContent = result.error || 'Could not convert to SQL.';
          document.getElementById('sql-error').style.display = 'block';
        }
      } catch (err) {
        document.getElementById('sql-error').textContent = 'Error: ' + (err.message || err);
        document.getElementById('sql-error').style.display = 'block';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Convert to SQL';
      }
    });
    document.getElementById('nl-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') document.getElementById('nl-convert').click();
    });

    fetch('/api/tables', authOpts())
      .then(r => r.json())
      .then(tables => {
        const loadingEl = document.getElementById('tables-loading');
        loadingEl.style.display = 'none';
        applyTableListAndCounts(tables);
        pollGeneration();

        // Restore FK breadcrumb trail from localStorage.  We do this
        // after the table list is loaded so we can validate that every
        // table in the restored trail still exists in the database.
        var restoredTable = loadNavHistory();
        if (navHistory.length > 0) {
          // Validate that every table in the restored trail still exists.
          // If a table was dropped since the trail was saved, truncate
          // the trail at that point to avoid broken breadcrumb links.
          var originalLength = navHistory.length;
          for (var i = 0; i < navHistory.length; i++) {
            if (tables.indexOf(navHistory[i].table) < 0) {
              navHistory.length = i;
              break;
            }
          }
          // Persist the truncated trail so next refresh doesn't
          // re-load stale entries that reference dropped tables.
          if (navHistory.length !== originalLength) {
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
          loadTable(hash);
        } else if (restoredTable && tables.indexOf(restoredTable) >= 0 && navHistory.length > 0) {
          // No hash deep-link, but we have a restored breadcrumb trail --
          // load the table the user was viewing when they last refreshed.
          loadTable(restoredTable);
        }

        // Render the breadcrumb bar if the trail is non-empty, so the
        // user sees their restored navigation path.
        if (navHistory.length > 0) {
          renderBreadcrumb();
        }
      })
      .catch(e => { document.getElementById('tables-loading').textContent = 'Failed to load tables: ' + e; });

    // Fetch server version from health endpoint and display in header badge.
    // Also loads enhanced CSS from jsDelivr CDN, version-pinned to this
    // release tag. Falls back gracefully to inline styles if the CDN is
    // unreachable, the tag doesn't exist yet, or the user is offline.
    fetch('/api/health', authOpts())
      .then(function(r) { return r.json(); })
      .then(function(d) {
        if (d.version) {
          // Show version badge in the page header.
          var badge = document.getElementById('version-badge');
          badge.textContent = 'v' + d.version;
          badge.style.opacity = '1';

          // Load enhanced CSS from jsDelivr CDN. The URL is pinned to the
          // exact git tag matching this package version, so the styles are
          // immutably cached per release. If the CDN is down, blocked by a
          // firewall, or the tag hasn't been pushed yet, the onerror handler
          // fires silently and the inline CSS provides the full baseline.
          // A 3-second timeout prevents indefinite hanging on slow networks.
          var link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = 'https://cdn.jsdelivr.net/gh/saropa/saropa_drift_advisor@v'
            + d.version + '/web/drift-enhanced.css';
          var cssTimer = setTimeout(function() {
            link.onerror = null;
            link.onload = null;
          }, 3000);
          link.onload = function() { clearTimeout(cssTimer); };
          link.onerror = function() { clearTimeout(cssTimer); };
          document.head.appendChild(link);
        }
      })
      .catch(function() { /* version badge stays hidden on failure */ });

    // --- Collaborative session: capture, share, restore ---
    function captureViewerState() {
      return {
        currentTable: currentTableName,
        sqlInput: document.getElementById('sql-input').value,
        searchTerm: document.getElementById('search-input')
          ? document.getElementById('search-input').value
          : '',
        theme: localStorage.getItem(THEME_KEY),
        limit: limit,
        offset: offset,
        timestamp: new Date().toISOString(),
      };
    }

    function copyShareUrl(shareUrl, expiresAt) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(shareUrl)
          .then(function () {
            alert('Share URL copied to clipboard!\\n\\n' + shareUrl +
              '\\n\\nExpires: ' + new Date(expiresAt).toLocaleString());
          })
          .catch(function () {
            prompt('Copy this share URL:', shareUrl);
          });
      } else {
        prompt('Copy this share URL:', shareUrl);
      }
    }

    function createShareSession() {
      var note = prompt('Add a note for your team (optional):\\n\\nSession will expire in 1 hour.');
      if (note === null) return;
      var btn = document.getElementById('share-btn');
      btn.disabled = true;
      btn.textContent = 'Sharing\\u2026';
      var state = captureViewerState();
      if (note) state.note = note;

      fetch('/api/session/share', authOpts({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state),
      }))
        .then(function (r) {
          if (!r.ok) throw new Error('Server error ' + r.status);
          return r.json();
        })
        .then(function (data) {
          copyShareUrl(location.origin + location.pathname + data.url, data.expiresAt);
        })
        .catch(function (e) {
          alert('Failed to create share: ' + e.message);
        })
        .finally(function () {
          btn.disabled = false;
          btn.textContent = 'Share';
        });
    }

    document.getElementById('share-btn').addEventListener('click', createShareSession);

    function applySessionState(state) {
      if (state.currentTable) {
        setTimeout(function () { loadTable(state.currentTable); }, 500);
      }

      if (state.sqlInput) {
        document.getElementById('sql-input').value = state.sqlInput;
      }

      if (state.searchTerm && document.getElementById('search-input')) {
        document.getElementById('search-input').value = state.searchTerm;
      }

      if (state.limit) limit = state.limit;
      if (state.offset) offset = state.offset;
    }

    // --- Session expiry state ---
    // Tracks the current session ID for extend requests.
    var currentSessionId = null;
    // Tracks the current expiresAt ISO string for countdown display.
    var currentSessionExpiresAt = null;
    // Interval ID for the countdown timer (cleared on expiry or extend).
    var sessionCountdownInterval = null;
    // Whether the 10-minute warning banner has been shown.
    var sessionWarningShown = false;
    // Whether the countdown has already switched to fast (10s) mode.
    // Prevents clearing and re-creating the interval on every tick.
    var sessionFastMode = false;

    // Renders a visible "Session Expired" banner when accessing
    // an expired or unknown shared session URL.
    function showSessionExpiredBanner() {
      var banner = document.createElement('div');
      banner.style.cssText =
        'background:#f8d7da;color:#721c24;padding:0.75rem;' +
        'font-size:13px;text-align:center;border-bottom:2px solid #f5c6cb;';
      banner.innerHTML =
        '<strong>Session Expired</strong><br>' +
        'The shared session you are trying to access has expired or was not found.<br>' +
        '<span style="font-size:11px;color:#856404;">' +
        'Sessions expire after 1 hour. Ask the person who shared the link to create a new one.</span>';
      document.body.prepend(banner);
    }

    // Updates the countdown span text and style based on remaining time.
    // Switches to yellow warning styling under 10 minutes and shows
    // a one-time warning banner. Marks the session as EXPIRED when
    // time runs out.
    function updateSessionCountdown(countdownEl) {
      var target = currentSessionExpiresAt;
      if (!target) return;
      var now = new Date();
      var exp = new Date(target);
      var diffMs = exp.getTime() - now.getTime();

      if (diffMs <= 0) {
        // Session has expired: show expired state in the info bar.
        countdownEl.textContent = 'EXPIRED';
        countdownEl.style.color = '#ff4444';
        var bar = document.getElementById('session-info-bar');
        if (bar) bar.style.background = '#cc3333';
        if (sessionCountdownInterval) {
          clearInterval(sessionCountdownInterval);
          sessionCountdownInterval = null;
        }
        var extBtn = document.getElementById('session-extend-btn');
        if (extBtn) extBtn.style.display = 'none';
        return;
      }

      var mins = Math.floor(diffMs / 60000);
      var secs = Math.floor((diffMs % 60000) / 1000);

      // Under 10 minutes: yellow warning styling + faster updates.
      if (mins < 10) {
        countdownEl.style.color = '#ffcc00';
        countdownEl.textContent = 'Expires in ' + mins + 'm ' + secs + 's';
        // Switch to 10-second update cadence for urgency (once only).
        if (!sessionFastMode && sessionCountdownInterval) {
          sessionFastMode = true;
          clearInterval(sessionCountdownInterval);
          sessionCountdownInterval = setInterval(function() {
            updateSessionCountdown(countdownEl);
          }, 10000);
        }
        // Show a one-time warning banner below the info bar.
        if (!sessionWarningShown) {
          sessionWarningShown = true;
          var warningBanner = document.createElement('div');
          warningBanner.id = 'session-expiry-warning';
          warningBanner.style.cssText =
            'background:#fff3cd;color:#856404;padding:0.3rem 0.5rem;' +
            'font-size:12px;text-align:center;border-bottom:1px solid #ffc107;';
          warningBanner.textContent =
            'Warning: This session expires in less than 10 minutes. ' +
            'Click "Extend" to add more time.';
          var bar = document.getElementById('session-info-bar');
          if (bar && bar.nextSibling) {
            bar.parentNode.insertBefore(warningBanner, bar.nextSibling);
          } else if (bar) {
            bar.parentNode.appendChild(warningBanner);
          }
        }
      } else {
        countdownEl.textContent = 'Expires in ' + mins + ' min';
      }
    }

    // POSTs to the extend endpoint to reset the session expiry
    // to now + sessionExpiry. Updates the countdown and removes
    // any active warning banner on success.
    function extendSession() {
      if (!currentSessionId) return;

      var extBtn = document.getElementById('session-extend-btn');
      if (extBtn) {
        extBtn.disabled = true;
        extBtn.textContent = 'Extending\\u2026';
      }

      fetch('/api/session/' + encodeURIComponent(currentSessionId) + '/extend',
        authOpts({ method: 'POST' })
      )
        .then(function(r) {
          if (!r.ok) throw new Error('Failed to extend session');
          return r.json();
        })
        .then(function(data) {
          // Update the tracked expiry time and reset warning/fast-mode flags.
          currentSessionExpiresAt = data.expiresAt;
          sessionWarningShown = false;
          sessionFastMode = false;

          // Remove the warning banner if present.
          var warning = document.getElementById('session-expiry-warning');
          if (warning) warning.remove();

          // Reset the info bar color back to normal.
          var bar = document.getElementById('session-info-bar');
          if (bar) bar.style.background = 'var(--link)';

          // Restart the countdown with normal 30-second interval.
          var countdownEl = document.getElementById('session-countdown');
          if (countdownEl) {
            countdownEl.style.color = '';
            if (sessionCountdownInterval) clearInterval(sessionCountdownInterval);
            updateSessionCountdown(countdownEl);
            sessionCountdownInterval = setInterval(function() {
              updateSessionCountdown(countdownEl);
            }, 30000);
          }

          // Show confirmation via the existing copy-toast element.
          showCopyToast('Session extended!');
        })
        .catch(function(e) {
          alert('Failed to extend session: ' + e.message);
        })
        .finally(function() {
          if (extBtn) {
            extBtn.disabled = false;
            extBtn.textContent = 'Extend';
          }
        });
    }

    function renderSessionInfoBar(state, createdAt, expiresAt) {
      var infoBar = document.createElement('div');
      infoBar.id = 'session-info-bar';
      infoBar.style.cssText =
        'background:var(--link);color:var(--bg);padding:0.3rem 0.5rem;font-size:12px;text-align:center;';

      // Left side: session info text with optional note.
      var info = 'Shared session';
      if (state.note) info += ': "' + esc(state.note) + '"';
      info += ' (created ' + new Date(createdAt).toLocaleString() + ')';
      var infoSpan = document.createElement('span');
      infoSpan.textContent = info;

      // Right side: live countdown and Extend button.
      var countdownSpan = document.createElement('span');
      countdownSpan.id = 'session-countdown';
      countdownSpan.style.cssText = 'margin-left:1rem;font-weight:bold;';

      var extendBtn = document.createElement('button');
      extendBtn.id = 'session-extend-btn';
      extendBtn.textContent = 'Extend';
      extendBtn.title = 'Extend session by 1 hour';
      extendBtn.style.cssText =
        'margin-left:0.5rem;font-size:11px;padding:0.1rem 0.4rem;cursor:pointer;' +
        'background:var(--bg);color:var(--link);border:1px solid var(--bg);border-radius:3px;';
      extendBtn.addEventListener('click', function() { extendSession(); });

      infoBar.appendChild(infoSpan);
      infoBar.appendChild(countdownSpan);
      infoBar.appendChild(extendBtn);
      document.body.prepend(infoBar);

      // Store expiry and start the live countdown timer.
      currentSessionExpiresAt = expiresAt;
      updateSessionCountdown(countdownSpan);
      sessionCountdownInterval = setInterval(function() {
        updateSessionCountdown(countdownSpan);
      }, 30000);
    }

    function renderSessionAnnotations(annotations) {
      if (!annotations || annotations.length === 0) return;
      var annoEl = document.createElement('div');
      annoEl.style.cssText =
        'background:var(--bg-pre);padding:0.3rem 0.5rem;font-size:11px;border-left:3px solid var(--link);margin:0.3rem 0;';
      var annoHtml = '<strong>Annotations:</strong><br>';
      annotations.forEach(function (a) {
        annoHtml += '<span class="meta">[' + esc(a.author) + ' at ' +
          new Date(a.at).toLocaleTimeString() + ']</span> ' +
          esc(a.text) + '<br>';
      });
      annoEl.innerHTML = annoHtml;
      document.body.children[1]
        ? document.body.insertBefore(annoEl, document.body.children[1])
        : document.body.appendChild(annoEl);
    }

    function restoreSession() {
      var params = new URLSearchParams(location.search);
      var sessionId = params.get('session');
      if (!sessionId) return;

      fetch('/api/session/' + encodeURIComponent(sessionId), authOpts())
        .then(function (r) {
          if (!r.ok) {
            // Show a visible error banner instead of silent console.warn.
            showSessionExpiredBanner();
            throw new Error('Session expired or not found');
          }
          return r.json();
        })
        .then(function (data) {
          var state = data.state || {};
          // Store session ID and expiry for countdown and extend.
          currentSessionId = sessionId;
          currentSessionExpiresAt = data.expiresAt;
          applySessionState(state);
          renderSessionInfoBar(state, data.createdAt, data.expiresAt);
          renderSessionAnnotations(data.annotations);
        })
        .catch(function (e) {
          console.warn('Session restore failed:', e.message);
        });
    }

    restoreSession();

    (function initPerformance() {
      const toggle = document.getElementById('perf-toggle');
      const collapsible = document.getElementById('perf-collapsible');
      const refreshBtn = document.getElementById('perf-refresh');
      const clearBtn = document.getElementById('perf-clear');
      const container = document.getElementById('perf-results');
      const saveBtn = document.getElementById('perf-save');
      const exportBtn = document.getElementById('perf-export');
      const historySel = document.getElementById('perf-history');
      const compareBtn = document.getElementById('perf-compare');
      let perfLoaded = false;
      var lastPerfData = null;

      function fetchPerformance() {
        refreshBtn.disabled = true;
        refreshBtn.textContent = 'Loading\u2026';
        container.style.display = 'none';
        fetch('/api/analytics/performance', authOpts())
          .then(function(r) {
            if (!r.ok) return r.json().then(function(d) { throw new Error(d.error || 'Request failed'); });
            return r.json();
          })
          .then(function(data) {
            perfLoaded = true;
            lastPerfData = data;
            if (data.totalQueries === 0) {
              container.innerHTML = '<p class="meta">No queries recorded yet. Browse some tables, then refresh.</p>';
            } else {
              container.innerHTML = renderPerformance(data);
            }
            container.style.display = 'block';
            populateHistorySelect(historySel, 'perf');
          })
          .catch(function(e) {
            container.innerHTML = '<p class="meta" style="color:#e57373;">Error: ' + esc(e.message) + '</p>';
            container.style.display = 'block';
          })
          .finally(function() {
            refreshBtn.disabled = false;
            refreshBtn.textContent = 'Refresh';
          });
      }

      function renderPerformance(data) {
        if (!data) return '<p class="meta">No data.</p>';
        var html = '<div style="display:flex;gap:1rem;flex-wrap:wrap;margin:0.3rem 0;">';
        html += '<div class="meta">Total: ' + esc(String(data.totalQueries || 0)) + ' queries</div>';
        html += '<div class="meta">Total time: ' + esc(String(data.totalDurationMs || 0)) + ' ms</div>';
        html += '<div class="meta">Avg: ' + esc(String(data.avgDurationMs || 0)) + ' ms</div>';
        html += '</div>';

        if (data.slowQueries && data.slowQueries.length > 0) {
          html += '<p class="meta" style="color:#e57373;font-weight:bold;">Slow queries (&gt;100ms):</p>';
          html += '<table style="border-collapse:collapse;width:100%;font-size:12px;">';
          html += '<tr><th style="border:1px solid var(--border);padding:4px;">Duration</th>';
          html += '<th style="border:1px solid var(--border);padding:4px;">Rows</th>';
          html += '<th style="border:1px solid var(--border);padding:4px;">Time</th>';
          html += '<th style="border:1px solid var(--border);padding:4px;">SQL</th></tr>';
          data.slowQueries.forEach(function(q) {
            var sql = q.sql || '';
            html += '<tr>';
            // Prefix with [!!] icon so slow status is conveyed without color alone
            html += '<td style="border:1px solid var(--border);padding:4px;color:#e57373;font-weight:bold;">[!!] ' + esc(String(q.durationMs)) + ' ms</td>';
            html += '<td style="border:1px solid var(--border);padding:4px;">' + esc(String(q.rowCount)) + '</td>';
            html += '<td style="border:1px solid var(--border);padding:4px;font-size:11px;">' + esc(q.at) + '</td>';
            html += '<td style="border:1px solid var(--border);padding:4px;max-width:400px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + esc(sql) + '">' + esc(sql.length > 80 ? sql.slice(0, 80) + '\u2026' : sql) + '</td>';
            html += '</tr>';
          });
          html += '</table>';
        }

        if (data.queryPatterns && data.queryPatterns.length > 0) {
          html += '<p class="meta" style="margin-top:0.5rem;">Most time-consuming patterns:</p>';
          html += '<table style="border-collapse:collapse;width:100%;font-size:12px;">';
          html += '<tr><th style="border:1px solid var(--border);padding:4px;">Total ms</th>';
          html += '<th style="border:1px solid var(--border);padding:4px;">Count</th>';
          html += '<th style="border:1px solid var(--border);padding:4px;">Avg ms</th>';
          html += '<th style="border:1px solid var(--border);padding:4px;">Max ms</th>';
          html += '<th style="border:1px solid var(--border);padding:4px;">Pattern</th></tr>';
          data.queryPatterns.forEach(function(p) {
            var pattern = p.pattern || '';
            html += '<tr>';
            html += '<td style="border:1px solid var(--border);padding:4px;">' + esc(String(p.totalMs)) + '</td>';
            html += '<td style="border:1px solid var(--border);padding:4px;">' + esc(String(p.count)) + '</td>';
            html += '<td style="border:1px solid var(--border);padding:4px;">' + esc(String(p.avgMs)) + '</td>';
            html += '<td style="border:1px solid var(--border);padding:4px;">' + esc(String(p.maxMs)) + '</td>';
            html += '<td style="border:1px solid var(--border);padding:4px;" title="' + esc(pattern) + '">' + esc(pattern.length > 60 ? pattern.slice(0, 60) + '\u2026' : pattern) + '</td>';
            html += '</tr>';
          });
          html += '</table>';
        }

        if (data.recentQueries && data.recentQueries.length > 0) {
          html += '<p class="meta" style="margin-top:0.5rem;">Recent queries (newest first):</p>';
          html += '<table style="border-collapse:collapse;width:100%;font-size:12px;">';
          html += '<tr><th style="border:1px solid var(--border);padding:4px;">ms</th>';
          html += '<th style="border:1px solid var(--border);padding:4px;">Rows</th>';
          html += '<th style="border:1px solid var(--border);padding:4px;">SQL</th></tr>';
          data.recentQueries.forEach(function(q) {
            var sql = q.sql || '';
            // Use icon + color so speed is distinguishable without color alone
            // (WCAG 2.1 1.4.1 — Use of Color)
            var color = q.durationMs > 100 ? '#e57373' : (q.durationMs > 50 ? '#ffb74d' : 'var(--fg)');
            var speedIcon = q.durationMs > 100 ? '[!!] ' : (q.durationMs > 50 ? '[!] ' : '');
            // Bold slow/warning durations to match the slow queries table style
            var speedWeight = speedIcon ? 'font-weight:bold;' : '';
            html += '<tr>';
            html += '<td style="border:1px solid var(--border);padding:4px;color:' + color + ';' + speedWeight + '">' + esc(speedIcon) + esc(String(q.durationMs)) + '</td>';
            html += '<td style="border:1px solid var(--border);padding:4px;">' + esc(String(q.rowCount)) + '</td>';
            html += '<td style="border:1px solid var(--border);padding:4px;max-width:400px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + esc(sql) + '">' + esc(sql.length > 80 ? sql.slice(0, 80) + '\u2026' : sql) + '</td>';
            html += '</tr>';
          });
          html += '</table>';
        }

        return html;
      }

      if (historySel) {
        populateHistorySelect(historySel, 'perf');
        historySel.addEventListener('change', function() {
          var id = this.value;
          if (!id) return;
          var saved = getSavedAnalysisById('perf', id);
          if (saved && saved.data) {
            lastPerfData = saved.data;
            container.innerHTML = (saved.data.totalQueries === 0)
              ? '<p class="meta">No queries recorded (saved run).</p>'
              : renderPerformance(saved.data);
            container.style.display = 'block';
          }
        });
      }

      if (saveBtn) saveBtn.addEventListener('click', function() {
        if (!lastPerfData) return;
        var id = saveAnalysis('perf', lastPerfData);
        showCopyToast(id != null ? 'Saved' : 'Save failed (storage may be full)');
        populateHistorySelect(historySel, 'perf');
      });

      if (exportBtn) exportBtn.addEventListener('click', function() {
        if (!lastPerfData) return;
        downloadJSON(lastPerfData, 'performance-' + (new Date().toISOString().slice(0, 10)) + '.json');
      });

      if (compareBtn) compareBtn.addEventListener('click', function() {
        showAnalysisCompare('perf', 'Query performance', getSavedAnalyses('perf'), lastPerfData, function(d) {
          return d && d.totalQueries !== 0 ? renderPerformance(d) : '<p class="meta">No queries in this run.</p>';
        }, function(a, b) {
          var qa = (a && a.totalQueries) != null ? a.totalQueries : 0;
          var qb = (b && b.totalQueries) != null ? b.totalQueries : 0;
          return 'Before: ' + qa + ' queries · After: ' + qb + ' queries';
        });
      });

      if (toggle && collapsible) {
        toggle.addEventListener('click', function() {
          const isCollapsed = collapsible.classList.contains('collapsed');
          collapsible.classList.toggle('collapsed', !isCollapsed);
          this.textContent = isCollapsed ? '\u25B2 Query performance' : '\u25BC Query performance';
          if (isCollapsed && !perfLoaded) fetchPerformance();
        });
      }

      if (refreshBtn) refreshBtn.addEventListener('click', fetchPerformance);

      if (clearBtn) clearBtn.addEventListener('click', function() {
        clearBtn.disabled = true;
        clearBtn.textContent = 'Clearing\u2026';
        fetch('/api/analytics/performance', authOpts({ method: 'DELETE' }))
          .then(function(r) {
            if (!r.ok) return r.json().then(function(d) { throw new Error(d.error || 'Clear failed'); });
            lastPerfData = null;
            container.innerHTML = '<p class="meta">Performance history cleared.</p>';
            container.style.display = 'block';
            perfLoaded = false;
          })
          .catch(function(e) {
            container.innerHTML = '<p class="meta" style="color:#e57373;">Error: ' + esc(e.message) + '</p>';
            container.style.display = 'block';
          })
          .finally(function() {
            clearBtn.disabled = false;
            clearBtn.textContent = 'Clear';
          });
      });
    })();

