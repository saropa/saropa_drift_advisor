    /**
     * Web viewer script for the Drift debug server UI (tables, SQL, tools).
     * Type-checked tsconfig.web.json (`npm run typecheck:web`).
     * Do not edit compiled outputs when a TS source exists.
     *
     * Table list row counts: `formatTableRowCountDisplay` centralizes locale
     * formatting (en-US grouping) for the sidebar, browse grid, and dropdowns.
     *
     * Long-running actions (Analyze, Run SQL, Import, etc.) use `setButtonBusy` to
     * swap the button label for a spinner + progress text (`btn-busy` in style.scss)
     * until the request finishes; callers still rely on `disabled` and `.finally`
     * to restore the idle label and avoid duplicate in-flight clicks.
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
    // Hide the loading overlay injected by html_content.dart.
    // If app.js never loads (all sources fail), the overlay stays visible
    // as a natural error indicator — no JS needed for the error state.
    (function(){var el=document.getElementById('sda-loading');if(el)el.style.display='none'})();
    var DRIFT_VIEWER_AUTH_TOKEN = "";
    /** True when server exposes POST /api/cell/update (writeQuery configured). */
    var driftWriteEnabled = false;
    function applyHealthWriteFlag(data) {
      if (data && typeof data.writeEnabled === 'boolean') driftWriteEnabled = data.writeEnabled;
      // Show/hide destructive data buttons based on write capability
      var clearTableBtn = document.getElementById('clear-table-data');
      var clearAllBtn = document.getElementById('clear-all-data');
      var show = driftWriteEnabled ? '' : 'none';
      if (clearTableBtn) clearTableBtn.style.display = show;
      if (clearAllBtn) clearAllBtn.style.display = show;
    }
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

    /**
     * Shows a small spinning indicator plus label inside a button while a slow request runs.
     * When loading is false, restores plain text (drops spinner markup).
     * @param {HTMLElement|null|undefined} btn
     * @param {boolean} loading
     * @param {string} label - Progress caption while loading, or idle caption when loading is false
     */
    function setButtonBusy(btn, loading, label) {
      if (!btn) return;
      if (loading) {
        btn.classList.add('btn-busy');
        btn.innerHTML =
          '<span class="btn-busy-spinner" aria-hidden="true"></span>' +
          '<span class="btn-busy-label">' + esc(label) + '</span>';
      } else {
        btn.classList.remove('btn-busy');
        btn.textContent = label;
      }
    }

    /** SQL syntax highlighting for schema and SQL blocks; uses sql-highlight.js when loaded. */
    function highlightSqlSafe(sql) {
      if (sql == null) return '';
      return (typeof window.sqlHighlight === 'function' && window.sqlHighlight(sql)) || esc(sql);
    }

    // --- PII masking (BUG-015): user toggle; column heuristics; mask in table view and exports. ---
    /** Whether the "Mask sensitive data" FAB toggle is checked. */
    function isPiiMaskEnabled() {
      var cb = document.getElementById('fab-pii-mask-toggle');
      return cb ? cb.checked : false;
    }

    /** Heuristic: true if column name suggests PII (email, password, phone, ssn, token, secret, api_key). */
    function isPiiColumn(colName) {
      if (!colName || typeof colName !== 'string') return false;
      var lower = colName.toLowerCase();
      var patterns = ['email', 'password', 'phone', 'ssn', 'token', 'secret', 'api_key', 'apikey', 'address'];
      return patterns.some(function (p) { return lower.indexOf(p) >= 0; });
    }

    /**
     * Returns a masked display value for PII when masking is enabled.
     * email -> first char + *** + @ + domain; phone -> ***-***-last4; ssn -> ***-**-last4;
     * password/token/secret/api_key -> ****; other PII -> first 2 chars + ***.
     */
    function maskPiiValue(colName, value) {
      if (value == null) return '';
      var s = String(value).trim();
      if (s.length === 0) return '';
      var lower = colName.toLowerCase();
      if (lower.indexOf('email') >= 0 && s.indexOf('@') >= 0) {
        var at = s.indexOf('@');
        var local = s.slice(0, at);
        var domain = s.slice(at);
        var first = local.charAt(0);
        return (first ? first + '***' : '***') + domain;
      }
      if (lower.indexOf('phone') >= 0 || lower.indexOf('tel') >= 0) {
        var digits = s.replace(/\D/g, '');
        var last4 = digits.length >= 4 ? digits.slice(-4) : '****';
        return '***-***-' + last4;
      }
      if (lower.indexOf('ssn') >= 0) {
        var d = s.replace(/\D/g, '');
        var l4 = d.length >= 4 ? d.slice(-4) : '****';
        return '***-**-' + l4;
      }
      if (lower.indexOf('password') >= 0 || lower.indexOf('token') >= 0 || lower.indexOf('secret') >= 0 || lower.indexOf('api_key') >= 0 || lower.indexOf('apikey') >= 0) {
        return '****';
      }
      if (lower.indexOf('address') >= 0) {
        return s.length <= 2 ? '***' : s.slice(0, 2) + '***';
      }
      return s.length <= 2 ? '***' : s.slice(0, 2) + '***';
    }

    /**
     * Returns the value to display/copy for a cell: masked when PII mask is on and column is PII, else raw.
     * Optional _optMaskOn and _optIsPii avoid repeated DOM/heuristic work when building many cells (e.g. in buildDataTableHtml).
     */
    function getDisplayValue(colName, rawValue, _optMaskOn, _optIsPii) {
      var maskOn = _optMaskOn !== undefined ? _optMaskOn : isPiiMaskEnabled();
      var isPii = _optIsPii !== undefined ? _optIsPii : isPiiColumn(colName);
      if (!maskOn || !isPii) return rawValue != null ? String(rawValue) : '';
      return maskPiiValue(colName, rawValue);
    }

    /** Syncs .feature-card.expanded with collapsible open state (UI redesign: card border/highlight when expanded). */
    function syncFeatureCardExpanded(collapsible) {
      var card = collapsible && collapsible.closest && collapsible.closest('.feature-card');
      if (card) card.classList.toggle('expanded', !collapsible.classList.contains('collapsed'));
    }

    /**
     * Registers a beforeunload handler so the browser shows a confirmation dialog
     * when the user closes the tab, refreshes, or navigates away (e.g. back button).
     * preventDefault() and returnValue are required for cross-browser support.
     */
    function setupNavigateAwayConfirmation() {
      window.addEventListener('beforeunload', function (e) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      });
    }
    setupNavigateAwayConfirmation();

    // --- Tab system: tools toolbar + tabbed content; tools open in full-width tabs. ---
    // Toolbar buttons open/switch to a tab; tool tabs are closeable; Tables and Run SQL are fixed.
    // Lazy load: Schema and Diagram fetch data on first tab switch (onTabSwitch).
    var TOOL_LABELS = {
      tables: 'Tables',
      sql: 'Run SQL',
      search: 'Search',
      snapshot: 'Snapshot',
      compare: 'DB diff',
      index: 'Index',
      size: 'Size',
      perf: 'Perf',
      anomaly: 'Health',
      import: 'Import',
      schema: 'Schema',
      diagram: 'Diagram'
    };

    var activeTabId = 'tables';

    /**
     * Switches the main content area to the given tab.
     * Table-specific tabs use the 'tbl:' prefix (e.g. 'tbl:users') and share
     * the #panel-tables panel. The "tables" tab shows a browse-all list;
     * 'tbl:{name}' tabs show that table's data in the shared content area.
     * @param {string} tabId - One of: tables, tbl:{name}, sql, search, snapshot, compare, index, size, perf, anomaly, import, schema, diagram
     */
    function switchTab(tabId) {
      var tabBar = document.getElementById('tab-bar');
      var panels = document.getElementById('tab-panels');
      if (!tabBar || !panels) return;

      // Save state for the previously active table tab before switching away
      var prevIsTable = activeTabId.indexOf('tbl:') === 0;
      if (prevIsTable && currentTableName) {
        saveTableState(currentTableName);
      }

      activeTabId = tabId;

      // Determine whether this tab should show the shared #panel-tables
      var isTableTab = tabId.indexOf('tbl:') === 0;
      var showTablesPanel = tabId === 'tables' || isTableTab;

      // Update tab button active states
      tabBar.querySelectorAll('.tab-btn').forEach(function(btn) {
        var id = btn.getAttribute('data-tab');
        var isActive = id === tabId;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });

      // Update panel visibility: table tabs (tbl:*) share the #panel-tables panel
      panels.querySelectorAll('.tab-panel').forEach(function(panel) {
        var id = panel.id && panel.id.replace(/^panel-/, '');
        var isActive = (id === tabId) || (showTablesPanel && id === 'tables');
        panel.classList.toggle('active', isActive);
        panel.hidden = !isActive;
      });

      // Toggle between browse-all list and table data content within #panel-tables
      var browseEl = document.getElementById('tables-browse');
      var contentEl = document.getElementById('content');
      var paginationEl = document.getElementById('pagination-bar');
      var formatEl = document.getElementById('display-format-bar');
      if (tabId === 'tables') {
        // Browse mode: show table list, hide data content
        if (browseEl) browseEl.style.display = '';
        if (contentEl) contentEl.style.display = 'none';
        if (paginationEl) paginationEl.style.display = 'none';
        if (formatEl) formatEl.style.display = 'none';
      } else if (isTableTab) {
        // Table data mode: hide browse list, show data content
        if (browseEl) browseEl.style.display = 'none';
        if (contentEl) contentEl.style.display = '';
        // Pagination and format bar visibility are managed by renderTableView

        // Always load the table when switching to its tab. This handles:
        // 1. First open: fetches data for the new table
        // 2. Rapid switching (A->B->A): ensures fresh data even if
        //    a previous fetch was still in-flight (loadTable's internal
        //    guard `if (currentTableName !== name) return` prevents
        //    stale responses from rendering)
        // 3. Returning to an already-open tab: re-fetches for freshness
        var tableName = tabId.slice(4); // strip 'tbl:' prefix
        loadTable(tableName);
      }

      if (typeof window.onTabSwitch === 'function') window.onTabSwitch(tabId);
    }

    /**
     * Finds a tab button by its data-tab value, safe for table names that
     * contain special characters (quotes, brackets, backslashes) which
     * would break querySelector attribute selectors.
     * @param {string} tabId - The data-tab value to match
     * @returns {Element|null}
     */
    function findTabBtn(tabId) {
      var tabBar = document.getElementById('tab-bar');
      if (!tabBar) return null;
      var btns = tabBar.querySelectorAll('.tab-btn');
      for (var i = 0; i < btns.length; i++) {
        if (btns[i].getAttribute('data-tab') === tabId) return btns[i];
      }
      return null;
    }

    /**
     * Creates a closeable tab button and appends it to the tab bar.
     * Shared by openTool (tool tabs) and openTableTab (table tabs)
     * to avoid duplicating the tab button DOM construction logic.
     * @param {string} tabId - The data-tab identifier
     * @param {string} label - Display label for the tab
     * @param {string} ariaControls - The panel id this tab controls
     * @param {Object} [opts] - Optional settings
     * @param {boolean} [opts.truncateLabel] - Wrap label in a span for CSS text truncation
     * @returns {Element} The created tab button
     */
    function createClosableTab(tabId, label, ariaControls, opts) {
      var tabBar = document.getElementById('tab-bar');
      if (!tabBar) return null;

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tab-btn';
      btn.setAttribute('data-tab', tabId);
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-controls', ariaControls);
      // Colons in tabId (e.g. 'tbl:users') would be invalid in HTML id attributes
      btn.id = 'tab-' + tabId.replace(/:/g, '-');

      // Label: optionally wrap in a span for CSS truncation of long names
      if (opts && opts.truncateLabel) {
        var nameSpan = document.createElement('span');
        nameSpan.className = 'tab-btn-label';
        nameSpan.textContent = label;
        nameSpan.title = label; // full name on hover
        btn.appendChild(nameSpan);
      } else {
        btn.textContent = label;
      }

      // Close button (×) to remove the tab
      var closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'tab-btn-close';
      closeBtn.title = 'Close tab';
      closeBtn.setAttribute('aria-label', 'Close ' + label);
      closeBtn.textContent = '\u00d7';
      closeBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        closeToolTab(tabId);
      });
      btn.appendChild(closeBtn);

      // Click anywhere on the tab (except close button) switches to it
      btn.addEventListener('click', function(e) {
        if (e.target !== closeBtn && !closeBtn.contains(e.target)) switchTab(tabId);
      });

      tabBar.appendChild(btn);
      return btn;
    }

    /**
     * Opens a tool in a tab: adds the tab if missing, then switches to it.
     * Reusable for most tools; calling again for the same tool just focuses that tab.
     */
    function openTool(toolId) {
      var existing = findTabBtn(toolId);
      if (!existing) {
        createClosableTab(toolId, TOOL_LABELS[toolId] || toolId, 'panel-' + toolId);
      }
      switchTab(toolId);
    }

    /**
     * Closes a tool or table tab and switches to the Tables browse tab
     * if the closed tab was the active one. For table tabs (tbl:*),
     * also removes from the openTableTabs tracking array.
     */
    function closeToolTab(toolId) {
      var btn = findTabBtn(toolId);
      if (!btn) return;
      btn.remove();

      // Remove from openTableTabs if it's a table tab
      if (toolId.indexOf('tbl:') === 0) {
        var tableName = toolId.slice(4);
        var idx = openTableTabs.indexOf(tableName);
        if (idx >= 0) openTableTabs.splice(idx, 1);
      }

      if (activeTabId === toolId) {
        // Prefer switching to the Tables browse tab when closing the active tab
        switchTab('tables');
      }
    }

    /** Binds tools toolbar and tab bar. Call once when DOM is ready. */
    function initTabsAndToolbar() {
      document.querySelectorAll('#tools-toolbar .toolbar-tool-btn').forEach(function(btn) {
        var toolId = btn.getAttribute('data-tool');
        if (toolId) btn.addEventListener('click', function() { openTool(toolId); });
      });
      document.querySelectorAll('#tab-bar .tab-btn').forEach(function(btn) {
        var tabId = btn.getAttribute('data-tab');
        if (tabId && !btn.querySelector('.tab-btn-close')) {
          btn.addEventListener('click', function() { switchTab(tabId); });
        }
      });
    }

    // --- Table tabs: each table opens in its own closeable tab. ---
    // Tracks which table names currently have open tabs in the tab bar.
    var openTableTabs = [];

    /**
     * Opens a table in its own closeable tab. If a tab for this table
     * already exists, switches to it instead of creating a duplicate.
     * Both sidebar links and browse-panel cards call this function.
     * @param {string} name - The table name to open
     */
    function openTableTab(name) {
      var tabId = 'tbl:' + name;
      var existing = findTabBtn(tabId);

      if (!existing) {
        // Create a closeable tab for this table (shares #panel-tables)
        createClosableTab(tabId, name, 'panel-tables', { truncateLabel: true });
        openTableTabs.push(name);
      }

      // Switch to this table's tab (loads data if needed)
      switchTab(tabId);
    }

    /**
     * Renders the browse-all table list inside the Tables tab panel.
     * Shows clickable cards with table names and row counts. Each card
     * calls openTableTab() to open the table in its own tab.
     * @param {string[]} tables - Array of table names
     */
    function renderTablesBrowse(tables) {
      var browseEl = document.getElementById('tables-browse');
      if (!browseEl) return;

      if (!tables || tables.length === 0) {
        browseEl.innerHTML = '<p class="meta">No tables found.</p>';
        return;
      }

      var html = '<div class="tables-browse-grid">';
      tables.forEach(function(t) {
        var countHtml = '';
        if (tableCounts[t] != null) {
          countHtml = '<span class="browse-card-count">(' + esc(formatTableRowCountDisplay(tableCounts[t])) + ')</span>';
        }
        html += '<button type="button" class="tables-browse-card" data-table="' + esc(t) + '" title="Open ' + esc(t) + ' in a tab">';
        html += '<span class="browse-card-name">' + esc(t) + '</span>';
        html += countHtml;
        html += '</button>';
      });
      html += '</div>';
      browseEl.innerHTML = html;

      // Bind click handlers on each card to open table tabs
      browseEl.querySelectorAll('.tables-browse-card').forEach(function(card) {
        card.addEventListener('click', function() {
          var tableName = card.getAttribute('data-table');
          if (tableName) openTableTab(tableName);
        });
      });
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
      closeBtn.title = 'Close compare panel';
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
    /**
     * Renders snapshot compare result: summary table (Table | Then | Now | Status)
     * plus per-table detail for added/removed/changed rows when present.
     */
    function renderRowDiff(container, tables) {
      var html = '';
      // Summary table: one row per table for quick scanning (styles in .snapshot-summary-table)
      html += '<table class="snapshot-summary-table"><thead><tr><th>Table</th><th>Then</th><th>Now</th><th>Status</th></tr></thead><tbody>';
      tables.forEach(function(t) {
        var status = '';
        if (!t.hasPk) {
          status = 'No primary key \u2014 counts only';
        } else if ((t.addedRows && t.addedRows.length > 0) || (t.removedRows && t.removedRows.length > 0) || (t.changedRows && t.changedRows.length > 0)) {
          var parts = [];
          if (t.addedRows && t.addedRows.length > 0) parts.push('+' + t.addedRows.length + ' added');
          if (t.removedRows && t.removedRows.length > 0) parts.push('-' + t.removedRows.length + ' removed');
          if (t.changedRows && t.changedRows.length > 0) parts.push('~' + t.changedRows.length + ' changed');
          status = parts.join(', ');
        } else {
          status = 'No changes detected';
        }
        html += '<tr><td>' + esc(t.table) + '</td><td>' + t.countThen + '</td><td>' + t.countNow + '</td><td>' + esc(status) + '</td></tr>';
      });
      html += '</tbody></table>';
      // Per-table detail for added/removed/changed rows
      tables.forEach(function(t) {
        if (!t.hasPk) return;
        var hasDetail = (t.addedRows && t.addedRows.length > 0) || (t.removedRows && t.removedRows.length > 0) || (t.changedRows && t.changedRows.length > 0);
        if (!hasDetail) return;
        html += '<h4 style="margin:0.5rem 0 0.25rem;">' + esc(t.table) + '</h4>';
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
    /**
     * Formats a row count for sidebar, browse cards, and dropdowns: thousands
     * separators, no "rows" suffix (callers add parentheses where needed).
     * @param {number|string} n - Raw count from the server
     * @returns {string}
     */
    function formatTableRowCountDisplay(n) {
      var num = Number(n);
      if (!isFinite(num)) return String(n);
      return num.toLocaleString('en-US');
    }
    // Cache of the last table list received from the server, used when
    // re-rendering after pin/unpin without a fresh API call.
    let lastKnownTables = [];
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
    // When the next heartbeat is scheduled (timestamp). Used for "Next retry in Xs" countdown.
    var nextHeartbeatAt = null;
    // True while a health check request is in flight (show "Checking…").
    var heartbeatInFlight = false;
    // Number of reconnection attempts since last connected; shown in diagnostics.
    var heartbeatAttemptCount = 0;
    // Interval ID for updating banner countdown every second; cleared when banner hides.
    var bannerUpdateIntervalId = null;

    // --- Connection state transitions ---

    // Transition to 'disconnected'. Shows the banner, disables
    // server-dependent controls, updates the live indicator to red.
    function setDisconnected() {
      if (connectionState === 'disconnected') return;
      connectionState = 'disconnected';
      bannerDismissed = false;
      showConnectionBanner();
      updateConnectionBannerText();
      updateLiveIndicatorForConnection();
      setOfflineControlsDisabled(true);
    }

    // Transition to 'reconnecting'. Used when /api/health succeeds
    // after being disconnected — server is back but generation
    // endpoint not yet confirmed.
    function setReconnecting() {
      if (connectionState === 'reconnecting') return;
      connectionState = 'reconnecting';
      nextHeartbeatAt = null;
      showConnectionBanner();
      updateConnectionBannerText();
      updateLiveIndicatorForConnection();
    }

    // Transition to 'connected'. Hides banner, re-enables controls,
    // resets backoff, stops heartbeat/keep-alive timers.
    function setConnected() {
      if (connectionState === 'connected') return;
      connectionState = 'connected';
      consecutivePollFailures = 0;
      currentBackoffMs = BACKOFF_INITIAL_MS;
      nextHeartbeatAt = null;
      heartbeatInFlight = false;
      heartbeatAttemptCount = 0;
      hideConnectionBanner();
      updateLiveIndicatorForConnection();
      setOfflineControlsDisabled(false);
      stopHeartbeat();
    }

    // --- Banner show / hide ---

    // Updates banner message and diagnostics from current state (next retry, interval, attempt count).
    // Called on show and every 1s while banner is visible so countdown stays accurate.
    function updateConnectionBannerText() {
      if (connectionState === 'connected' || bannerDismissed) return;
      var msgEl = document.getElementById('banner-message');
      var diagEl = document.getElementById('banner-diagnostics');
      if (!msgEl || !diagEl) return;
      var parts = [];
      if (connectionState === 'reconnecting') {
        msgEl.textContent = 'Reconnecting\u2026';
        diagEl.textContent = 'Restoring connection\u2026';
        return;
      }
      if (heartbeatInFlight) {
        msgEl.textContent = 'Connection lost \u2014 checking\u2026';
        parts.push('Attempt ' + heartbeatAttemptCount);
      } else if (nextHeartbeatAt != null) {
        var secs = Math.max(0, Math.ceil((nextHeartbeatAt - Date.now()) / 1000));
        msgEl.textContent = 'Connection lost \u2014 next retry in ' + secs + 's';
        var intervalSec = currentBackoffMs / 1000;
        parts.push('Retrying every ' + intervalSec + 's');
        if (currentBackoffMs >= BACKOFF_MAX_MS) parts.push('(max interval)');
        parts.push('Attempt ' + heartbeatAttemptCount);
      } else {
        msgEl.textContent = 'Connection lost \u2014 reconnecting\u2026';
        parts.push('Attempt ' + heartbeatAttemptCount);
      }
      diagEl.textContent = parts.join(' \u2022 ');
    }

    // Show the connection banner and start 1s ticker for countdown/diagnostics. Respects bannerDismissed.
    function showConnectionBanner() {
      if (bannerDismissed) return;
      var banner = document.getElementById('connection-banner');
      if (!banner) return;
      banner.classList.add('show');
      document.body.classList.add('has-connection-banner');
      if (!bannerUpdateIntervalId) {
        bannerUpdateIntervalId = setInterval(updateConnectionBannerText, 1000);
      }
    }

    // Hide the connection banner, stop countdown ticker, remove body padding offset.
    function hideConnectionBanner() {
      if (bannerUpdateIntervalId) {
        clearInterval(bannerUpdateIntervalId);
        bannerUpdateIntervalId = null;
      }
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

    // Retry now: trigger an immediate health check and reset backoff for next failure.
    // No-op if already connected or if a check is in flight (avoids duplicate requests).
    (function() {
      var retryBtn = document.getElementById('banner-retry');
      if (retryBtn) {
        retryBtn.addEventListener('click', function() {
          if (connectionState !== 'disconnected' && connectionState !== 'reconnecting') return;
          if (heartbeatInFlight) return;
          stopHeartbeat();
          nextHeartbeatAt = null;
          currentBackoffMs = BACKOFF_INITIAL_MS;
          doHeartbeat();
        });
      }
    })();

    // --- Connection status integration ---
    // Delegates all pill DOM updates to masthead.js via window.mastheadStatus.
    // This function is the single call-site in app.js — all connection-state
    // changes (WebSocket open/close/error, polling toggle) route through here.
    function updateLiveIndicatorForConnection() {
      if (!window.mastheadStatus) return;
      window.mastheadStatus.setConnection(connectionState, pollingEnabled);
    }

    // --- Disable / enable server-dependent controls ---
    // IDs of buttons that call server endpoints.
    var OFFLINE_DISABLE_IDS = [
      'sql-run', 'sql-explain', 'nl-open',
      'snapshot-take', 'snapshot-compare',
      'compare-view', 'migration-preview',
      'index-analyze', 'size-analyze', 'anomaly-analyze',
      'index-save', 'index-export', 'index-compare',
      'size-save', 'size-export', 'size-compare',
      'anomaly-save', 'anomaly-export', 'anomaly-compare',
      'perf-refresh', 'perf-clear', 'perf-save', 'perf-export', 'perf-compare',
      'import-run', 'fab-share-btn',
      'export-schema', 'export-dump', 'export-database', 'export-csv', 'export-json'
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
    // Skip if a check is already in flight to avoid duplicate requests and timer races.
    function doHeartbeat() {
      if (heartbeatInFlight) return;
      if (connectionState === 'disconnected' || connectionState === 'reconnecting') {
        heartbeatAttemptCount++;
      }
      heartbeatInFlight = true;
      updateConnectionBannerText();
      fetch('/api/health', authOpts())
        .then(function(r) { return r.json(); })
        .then(function(data) {
          heartbeatInFlight = false;
          if (data && data.ok) {
            applyHealthWriteFlag(data);
            setReconnecting();
            consecutivePollFailures = 0;
            currentBackoffMs = BACKOFF_INITIAL_MS;
            nextHeartbeatAt = null;
            heartbeatTimerId = null;
            pollGeneration();
            return;
          }
          updateConnectionBannerText();
          scheduleHeartbeat();
        })
        .catch(function() {
          heartbeatInFlight = false;
          updateConnectionBannerText();
          scheduleHeartbeat();
        });
    }

    // Schedule next heartbeat with exponential backoff (1s,2s,4s,...,30s).
    function scheduleHeartbeat() {
      currentBackoffMs = Math.min(
        currentBackoffMs * BACKOFF_MULTIPLIER, BACKOFF_MAX_MS
      );
      nextHeartbeatAt = Date.now() + currentBackoffMs;
      heartbeatTimerId = setTimeout(doHeartbeat, currentBackoffMs);
    }

    // Cancel any pending heartbeat timer.
    function stopHeartbeat() {
      if (heartbeatTimerId) {
        clearTimeout(heartbeatTimerId);
        heartbeatTimerId = null;
      }
      nextHeartbeatAt = null;
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
              applyHealthWriteFlag(data);
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

    // Pinned sidebar tables: tables the user has pinned float to the top
    // of the sidebar list. Stored as a JSON array of table name strings.
    const PINNED_TABLES_KEY = 'drift-viewer-pinned-tables';

    /** Returns the array of pinned table names from localStorage. */
    function getPinnedTables() {
      try {
        var raw = localStorage.getItem(PINNED_TABLES_KEY);
        if (!raw) return [];
        var arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : [];
      } catch (e) { return []; }
    }

    /** Saves the pinned table names array to localStorage. */
    function setPinnedTables(arr) {
      try { localStorage.setItem(PINNED_TABLES_KEY, JSON.stringify(arr)); }
      catch (e) { /* localStorage full or disabled */ }
    }

    /** Toggles a table's pinned state and re-renders the sidebar list. */
    function togglePinTable(name) {
      var pinned = getPinnedTables();
      var idx = pinned.indexOf(name);
      if (idx >= 0) {
        // Unpin: remove from the array
        pinned.splice(idx, 1);
      } else {
        // Pin: add to the end of the pinned set
        pinned.push(name);
      }
      setPinnedTables(pinned);
      // Re-render the sidebar list with updated pin order
      renderTableList(lastKnownTables || []);
    }

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
      html += '<div class="qb-header" id="qb-toggle">\25BC Query builder</div>';
      html += '<div id="qb-body" class="qb-body collapsed">';
      html += '<div class="qb-row"><label>SELECT</label><div class="qb-columns" id="qb-columns">';
      cols.forEach(function(c) {
        html += '<label><input type="checkbox" value="' + esc(c) + '" checked> ' + esc(c) + '</label>';
      });
      html += '</div></div>';
      html += '<div class="qb-row"><label>WHERE</label><div style="flex:1;">';
      html += '<div id="qb-where-list"></div>';
      html += '<button type="button" id="qb-add-where" style="font-size:11px;" title="Add another WHERE condition">+ Add condition</button>';
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
      html += '<button type="button" id="qb-run" title="Execute the built query">Run query</button>';
      html += '<button type="button" id="qb-reset" title="Return to table view">Reset to table view</button>';
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

    /**
     * Adds one WHERE condition row. For the 2nd and subsequent rows, prepends an
     * AND/OR connector dropdown so users can combine conditions.
     * @param {Object} colTypes - Map of column name to type (for operators).
     * @param {Object} [preset] - Optional { column, op, value, connector } to restore state.
     */
    function addWhereClause(colTypes, preset) {
      var list = document.getElementById('qb-where-list');
      if (!list) return;
      var cols = Object.keys(colTypes || {});
      if (cols.length === 0) return;
      var isFirst = list.children.length === 0;
      var div = document.createElement('div');
      div.className = 'qb-where-item';
      if (!isFirst) {
        var connSel = document.createElement('select');
        connSel.className = 'qb-where-connector';
        connSel.title = 'Combine with previous condition';
        var optAnd = document.createElement('option');
        optAnd.value = 'AND';
        optAnd.textContent = 'AND';
        var optOr = document.createElement('option');
        optOr.value = 'OR';
        optOr.textContent = 'OR';
        connSel.appendChild(optAnd);
        connSel.appendChild(optOr);
        if (preset && (preset.connector === 'OR')) connSel.value = 'OR';
        connSel.addEventListener('change', updateQbPreview);
        div.appendChild(connSel);
      }
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
      var whereConnectors = []; // AND/OR for 2nd+ conditions (first has no connector in DOM)
      var whereItems = document.querySelectorAll('#qb-where-list .qb-where-item');
      whereItems.forEach(function(item) {
        var connSel = item.querySelector('.qb-where-connector');
        if (connSel) whereConnectors.push(connSel.value);
        var col = item.querySelector('.qb-where-col').value;
        var op = item.querySelector('.qb-where-op').value;
        var val = item.querySelector('.qb-where-val').value;
        var part;
        if (op === 'IS NULL') { part = '"' + col + '" IS NULL'; }
        else if (op === 'IS NOT NULL') { part = '"' + col + '" IS NOT NULL'; }
        else if (op === 'LIKE') { part = '"' + col + '" LIKE \'%' + val.replace(/'/g, "''") + '%\''; }
        else if (op === 'NOT_LIKE') { part = '"' + col + '" NOT LIKE \'%' + val.replace(/'/g, "''") + '%\''; }
        else if (op === 'LIKE_START') { part = '"' + col + '" LIKE \'' + val.replace(/'/g, "''") + '%\''; }
        else {
          var isNum = !isNaN(Number(val)) && val.trim() !== '';
          var sqlVal = isNum ? val : "'" + val.replace(/'/g, "''") + "'";
          part = '"' + col + '" ' + op + ' ' + sqlVal;
        }
        whereParts.push(part);
      });
      var orderCol = document.getElementById('qb-order-col').value;
      var orderDir = document.getElementById('qb-order-dir').value;
      var qbLimit = parseInt(document.getElementById('qb-limit').value || '200', 10) || 200;
      var sql = 'SELECT ' + selectPart + ' FROM "' + tableName + '"';
      if (whereParts.length > 0) {
        var whereClause = whereParts[0];
        for (var i = 1; i < whereParts.length; i++) {
          whereClause += ' ' + (whereConnectors[i - 1] || 'AND') + ' ' + whereParts[i];
        }
        sql += ' WHERE ' + whereClause;
      }
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
      if (runBtn) { runBtn.disabled = true; setButtonBusy(runBtn, true, 'Running\u2026'); }
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
          html += buildTableStatusBar(tableCounts[currentTableName] || null, 0, rows.length, rows.length, getVisibleColumnCount(Object.keys(rows[0] || {}), getColumnConfig(currentTableName)));
          content.innerHTML = html;
          bindQueryBuilderEvents(colTypes);
          restoreQueryBuilderUIState(savedState);
          bindColumnTableEvents();
          // Expand the QB body since user is actively using it
          var body = document.getElementById('qb-body');
          var toggle = document.getElementById('qb-toggle');
          if (body) body.classList.remove('collapsed');
          if (toggle) toggle.textContent = '\25B2 Query builder';
          saveTableState(currentTableName);
        })
        .catch(function(e) { alert('Error: ' + e.message); })
        .finally(function() {
          if (runBtn) { runBtn.disabled = false; setButtonBusy(runBtn, false, 'Run query'); }
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
          toggle.textContent = collapsed ? '\25B2 Query builder' : '\25BC Query builder';
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
        var connSel = item.querySelector('.qb-where-connector');
        state.whereClauses.push({
          column: item.querySelector('.qb-where-col').value,
          op: item.querySelector('.qb-where-op').value,
          value: item.querySelector('.qb-where-val').value,
          connector: connSel ? connSel.value : 'AND'
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
          addWhereClause(_qbColTypes, {
            column: wc.column,
            op: wc.op,
            value: wc.value,
            connector: wc.connector || 'AND'
          });
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
      sel.innerHTML = '<option value="">— Saved queries (' + sqlBookmarks.length + ') —</option>' +
        sqlBookmarks.map(function(b, i) {
          return '<option value="' + i + '" title="' + esc(b.sql) + '">' + esc(b.name) + '</option>';
        }).join('');
      if (cur !== '' && parseInt(cur, 10) < sqlBookmarks.length) sel.value = cur;
    }
    function addBookmark(inputEl, bookmarksSel) {
      const sql = inputEl.value.trim();
      if (!sql) return;
      const name = prompt('Name for this query:', sql.slice(0, 40));
      if (name == null || String(name).trim() === '') return;
      sqlBookmarks.unshift({ name: name, sql: sql, createdAt: new Date().toISOString() });
      saveBookmarks();
      refreshBookmarksDropdown(bookmarksSel);
    }
    function deleteBookmark(bookmarksSel) {
      const idx = parseInt(bookmarksSel.value, 10);
      if (isNaN(idx) || !sqlBookmarks[idx]) return;
      if (!confirm('Delete saved query "' + sqlBookmarks[idx].name + '"?')) return;
      sqlBookmarks.splice(idx, 1);
      saveBookmarks();
      refreshBookmarksDropdown(bookmarksSel);
    }
    function exportBookmarks() {
      if (sqlBookmarks.length === 0) { alert('No saved queries to export.'); return; }
      const blob = new Blob([JSON.stringify(sqlBookmarks, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'drift-viewer-saved-queries.json';
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
            alert('Imported ' + newCount + ' new saved query(s). ' + (imported.length - newCount) + ' duplicate(s) skipped.');
          } catch (e) {
            alert('Invalid file: ' + e.message);
          }
        };
        reader.readAsText(file);
      };
      input.click();
    }

    // Apply a named theme to the document body and update the toggle
    // button label. Accepts 'dark', 'light', 'showcase', or 'midnight'.
    // For backwards compatibility, boolean true maps to 'dark' and false
    // maps to 'light'.
    function applyTheme(theme) {
      // Normalise legacy boolean calls: true → 'dark', false → 'light'.
      if (theme === true) theme = 'dark';
      if (theme === false) theme = 'light';

      // Remove all theme classes first, then add the active one.
      document.body.classList.remove('theme-dark', 'theme-light', 'theme-showcase', 'theme-midnight');
      document.body.classList.add('theme-' + theme);

      // Human-readable labels and Material icon names for each theme.
      var labels = { dark: 'Dark', light: 'Light', showcase: 'Showcase', midnight: 'Midnight' };
      var icons  = { dark: 'dark_mode', light: 'light_mode', showcase: 'auto_awesome', midnight: 'bedtime' };

      // Update FAB theme label and icon to reflect the active theme.
      var themeLabel = document.getElementById('fab-theme-label');
      if (themeLabel) themeLabel.textContent = labels[theme] || theme;

      // Swap the Material Symbols icon to match the active theme.
      var themeBtn = document.getElementById('fab-theme-toggle');
      if (themeBtn) {
        var icon = themeBtn.querySelector('.material-symbols-outlined');
        if (icon) icon.textContent = icons[theme] || 'dark_mode';
        // Tooltip names the next theme in the cycle.
        var next = nextTheme(theme);
        themeBtn.title = labels[next] + ' theme — click to switch from ' + labels[theme];
      }
    }

    // All four themes are fully supported via inline CSS.
    // Four-way cycle: light -> showcase -> dark -> midnight -> light
    function nextTheme(current) {
      var cycle = ['light', 'showcase', 'dark', 'midnight'];
      var idx = cycle.indexOf(current);
      return cycle[(idx + 1) % cycle.length];
    }

    // Return the current theme name by inspecting body classes.
    function currentTheme() {
      if (document.body.classList.contains('theme-showcase')) return 'showcase';
      if (document.body.classList.contains('theme-midnight')) return 'midnight';
      if (document.body.classList.contains('theme-light')) return 'light';
      return 'dark';
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
        // User has an explicit override. All four themes
        // (dark, light, showcase, midnight) are fully supported inline.
        applyTheme(saved);
        return;
      }
      // No saved preference: try VS Code webview context first, then
      // fall back to the OS-level prefers-color-scheme media query.
      var vscodeTheme = detectVscodeTheme();
      if (vscodeTheme) {
        applyTheme(vscodeTheme);
        return;
      }
      // Respect operating-system dark-mode preference (defaults to light
      // when the browser doesn't support matchMedia).
      var prefersDark = window.matchMedia
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
        : false;
      applyTheme(prefersDark ? 'dark' : 'light');
    }

    // Toggle button: cycle through all four themes.
    // Theme cycle button lives in the super FAB menu.
    var fabThemeBtn = document.getElementById('fab-theme-toggle');
    if (fabThemeBtn) {
      fabThemeBtn.addEventListener('click', function() {
        var next = nextTheme(currentTheme());
        localStorage.setItem(THEME_KEY, next);
        applyTheme(next);
      });
    }

    initTheme();

    // PII mask toggle (BUG-015): re-render table and search results when
    // toggled so display matches.  Now lives in the super FAB menu.
    (function initPiiMaskToggle() {
      var cb = document.getElementById('fab-pii-mask-toggle');
      if (!cb) return;
      cb.addEventListener('change', function() {
        if (currentTableName && currentTableJson) renderTableView(currentTableName, currentTableJson);
      });
    })();

    // Listen for real-time OS theme changes (e.g. the user toggles system
    // dark mode while the page is open). Only react if the user hasn't
    // set an explicit override in localStorage.
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(e) {
        if (!localStorage.getItem(THEME_KEY)) {
          applyTheme(e.matches ? 'dark' : 'light');
        }
      });
    }

    if (DRIFT_VIEWER_AUTH_TOKEN) {
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
        if (isCollapsed && cachedSchema === null) loadSchemaIntoPre();
      });
    }
    function loadSchemaIntoPre() {
      var pre = document.getElementById('schema-inline-pre');
      if (!pre) return;
      fetch('/api/schema', authOpts()).then(r => r.text()).then(function(schema) {
        cachedSchema = schema;
        pre.innerHTML = highlightSqlSafe(schema);
      }).catch(function() { pre.textContent = 'Failed to load.'; });
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
    var lastSizeAnalyticsData = null;

    window.onTabSwitch = function(tabId) {
      if (tabId === 'schema' && cachedSchema === null) loadSchemaIntoPre();
      if (tabId === 'diagram' && typeof window.ensureDiagramInited === 'function') window.ensureDiagramInited();
      if (tabId === 'search') refreshSearchResultsPanel();
      // Auto-run when tool tab opens (no manual button click). checkDisabled avoids duplicate runs if analysis already in progress.
      if (tabId === 'index') triggerToolButtonIfReady('index-analyze', { checkDisabled: true });
      // Size: only auto-run once per page session until the user explicitly clicks Analyze again (success updates cache).
      if (tabId === 'size' && lastSizeAnalyticsData == null) triggerToolButtonIfReady('size-analyze', { checkDisabled: true });
      if (tabId === 'perf') triggerToolButtonIfReady('perf-refresh', { checkDisabled: true });
      if (tabId === 'anomaly') triggerToolButtonIfReady('anomaly-analyze', { checkDisabled: true });
    };

    initTabsAndToolbar();

    // --- Sidebar panel collapse: shared logic + two entry points ---
    // Both the header chevron button and the "Tables" heading inside the
    // sidebar collapse/expand the entire sidebar horizontally.  A single
    // applyAppSidebarCollapsed() drives all DOM + aria + localStorage
    // updates so the two buttons can never drift out of sync.
    var APP_SIDEBAR_PANEL_KEY = 'saropa_app_sidebar_collapsed';
    (function initSidebarPanelCollapse() {
      var layout = document.getElementById('app-layout');
      var aside = document.getElementById('app-sidebar');
      var fabBtn = document.getElementById('fab-sidebar-toggle');
      var fabIcon = document.getElementById('fab-sidebar-icon');
      var fabLabel = document.getElementById('fab-sidebar-label');
      var tablesToggle = document.getElementById('tables-heading-toggle');
      if (!layout || !aside) return;

      /**
       * Single source of truth for sidebar collapsed state.
       * Updates layout class, aria attributes on toggle buttons,
       * FAB icon, and persists to localStorage.
       * @param {boolean} collapsed - true → sidebar hidden (width 0).
       */
      function applyAppSidebarCollapsed(collapsed) {
        layout.classList.toggle('app-sidebar-panel-collapsed', collapsed);
        aside.setAttribute('aria-hidden', collapsed ? 'true' : 'false');
        var label = collapsed ? 'Show tables sidebar' : 'Hide tables sidebar';
        // FAB sidebar button
        if (fabBtn) {
          fabBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
          fabBtn.setAttribute('aria-label', label);
          fabBtn.title = label;
        }
        if (fabIcon) fabIcon.textContent = collapsed ? 'chevron_right' : 'chevron_left';
        if (fabLabel) fabLabel.textContent = collapsed ? 'Show Sidebar' : 'Hide Sidebar';
        // Tables heading button inside the sidebar
        if (tablesToggle) {
          tablesToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        }
      }

      /** Toggle collapsed state and persist to localStorage. */
      function toggleSidebarCollapsed() {
        var collapsed = !layout.classList.contains('app-sidebar-panel-collapsed');
        applyAppSidebarCollapsed(collapsed);
        try { localStorage.setItem(APP_SIDEBAR_PANEL_KEY, collapsed ? '1' : '0'); }
        catch (e) { /* localStorage unavailable */ }
      }

      // Restore persisted state on page load
      var storedCollapsed = false;
      try { storedCollapsed = localStorage.getItem(APP_SIDEBAR_PANEL_KEY) === '1'; }
      catch (e) { /* localStorage unavailable */ }
      applyAppSidebarCollapsed(storedCollapsed);

      // Clean up orphaned key from the old vertical-collapse mechanism
      try { localStorage.removeItem('saropa_sidebar_tables_collapsed'); }
      catch (e) { /* ignore */ }

      // Both entry points share the same toggle function
      if (fabBtn) fabBtn.addEventListener('click', toggleSidebarCollapsed);
      if (tablesToggle) tablesToggle.addEventListener('click', toggleSidebarCollapsed);
    })();

    // Search toolbar button: opens Search tab and focuses its inline search input.
    // The sidebar search panel is toggled separately via Ctrl+F when on the Tables tab.
    (function initSearchToggle() {
      var btn = document.getElementById('search-toggle-btn');
      if (!btn) return;
      btn.addEventListener('click', function() {
        // Switch to the Search tab, then focus its inline input
        openTool('search');
        setTimeout(function() {
          if (typeof window._stFocusInput === 'function') window._stFocusInput();
        }, 0);
      });
    })();

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

    (function initDiagram() {
      const container = document.getElementById('diagram-container');
      if (!container) return;
      const toggle = document.getElementById('diagram-toggle');
      const collapsible = document.getElementById('diagram-collapsible');
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
            // Use local x coordinate (relative to the parent <g> transform),
            // not absolute – the group's translate already positions the box.
            return '<tspan class="diagram-col" x="8" dy="16">' + esc(c.name) + (c.type ? ' ' + esc(c.type) : '') + pk + '</tspan>';
          }).join('');
          if (allCols.length > 6) body += '<tspan class="diagram-col" x="8" dy="16">…</tspan>';
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
            if (name) openTableTab(name);
          });
          g.addEventListener('keydown', function(e) {
            // Enter or Space activates the table (loads its data view).
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              const name = this.getAttribute('data-table');
              if (name) openTableTab(name);
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

      function loadAndRenderDiagram() {
        if (diagramData === null) {
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
        } else {
          renderDiagram(diagramData);
        }
      }

      window.ensureDiagramInited = loadAndRenderDiagram;

      if (toggle && collapsible) {
        toggle.addEventListener('click', function() {
          const isCollapsed = collapsible.classList.contains('collapsed');
          collapsible.classList.toggle('collapsed', !isCollapsed);
          syncFeatureCardExpanded(collapsible);
          if (isCollapsed) loadAndRenderDiagram();
        });
      }
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
      // resultPre is a div: holds HTML table (from renderRowDiff) or plain text (JSON fallback)
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
          syncFeatureCardExpanded(collapsible);
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
        resultPre.innerHTML = '';
        statusEl.textContent = 'Comparing…';
        statusEl.setAttribute('aria-busy', 'true');
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
          .finally(function() {
            compareBtn.disabled = false;
            statusEl.removeAttribute('aria-busy');
          });
      });
      if (clearBtn) clearBtn.addEventListener('click', function() {
        clearBtn.disabled = true;
        statusEl.textContent = 'Clearing…';
        fetch('/api/snapshot', authOpts({ method: 'DELETE' }))
          .then(function() {
            updateSnapshotUI(false);
            resultPre.style.display = 'none';
            resultPre.innerHTML = '';
            refreshSnapshotStatus();
          })
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
          syncFeatureCardExpanded(collapsible);
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
        setButtonBusy(btn, true, 'Generating…');
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
            html += '<pre style="font-size:11px;max-height:30vh;overflow:auto;background:var(--bg-pre);padding:0.5rem;border-radius:4px;">' + highlightSqlSafe(sql) + '</pre>';
            html += '<button type="button" id="migration-copy-sql" title="Copy migration SQL to clipboard">Copy SQL</button>';
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
            setButtonBusy(btn, false, 'Migration Preview');
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
          syncFeatureCardExpanded(collapsible);
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
        setButtonBusy(btn, true, 'Analyzing…');
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
            setButtonBusy(btn, false, 'Analyze');
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

      function formatBytes(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1048576).toFixed(2) + ' MB';
      }

      /**
       * Native `title` tooltips for Size analytics (matches PRAGMA semantics in analytics_handler).
       * Shown on hover for read-only labels, values, headers, and cells.
       */
      var SIZE_TT = {
        totalCard: 'Total size of the SQLite database file: PRAGMA page_count × PRAGMA page_size. Matches the main .db file size on disk.',
        usedCard: 'Bytes in pages that store data: total file size minus bytes in freelist pages (see Free). Same as totalSizeBytes − freeSpaceBytes from the server.',
        freeCard: 'Bytes in pages on SQLite’s freelist (PRAGMA freelist_count × page_size). Unused pages inside the file that SQLite can reuse for new data without growing the file.',
        journalCard: 'SQLite PRAGMA journal_mode. wal means WAL (write-ahead logging): new writes go to a separate .wal file and are merged into the main database at checkpoint; readers can run at the same time as one writer. Other modes include delete, truncate, persist, memory, and off.',
        pagesTotal: 'Total bytes in all pages: page_count × page_size. Same number as Total Size.',
        pagesFormula: 'PRAGMA page_count (number of pages) × PRAGMA page_size (bytes per page, often 4096).',
        thTable: 'Name of this table in SQLite.',
        thRows: 'Row count for each table (SELECT COUNT(*) FROM table). Bar length is relative to the largest table in this list.',
        thColumns: 'Number of columns defined on the table (rows from PRAGMA table_info).',
        thIndexes: 'Number of indexes on the table (PRAGMA index_list), plus each index name.',
        tdTableLink: 'SQLite table name. Click to open this table in its own tab.',
        tdRows: 'Approximate number of rows in this table.',
        tdColumns: 'How many columns this table has.',
        tdIndexes: 'Index count and names from PRAGMA index_list for this table.'
      };

      function renderSizeData(data) {
        if (!data) return '<p class="meta">No data.</p>';
        var html = '<div style="margin:0.5rem 0;">';
        html += '<div style="display:flex;gap:1rem;flex-wrap:wrap;margin-bottom:0.5rem;">';
        html += '<div style="padding:0.5rem;border:1px solid var(--border);border-radius:4px;" title="' + esc(SIZE_TT.totalCard) + '">';
        html += '<div class="meta">Total Size</div>';
        html += '<div style="font-size:1.2rem;font-weight:bold;">' + formatBytes(data.totalSizeBytes) + '</div></div>';
        html += '<div style="padding:0.5rem;border:1px solid var(--border);border-radius:4px;" title="' + esc(SIZE_TT.usedCard) + '">';
        html += '<div class="meta">Used</div>';
        html += '<div style="font-size:1.2rem;font-weight:bold;">' + formatBytes(data.usedSizeBytes) + '</div></div>';
        html += '<div style="padding:0.5rem;border:1px solid var(--border);border-radius:4px;" title="' + esc(SIZE_TT.freeCard) + '">';
        html += '<div class="meta">Free</div>';
        html += '<div style="font-size:1.2rem;font-weight:bold;">' + formatBytes(data.freeSpaceBytes) + '</div></div>';
        html += '<div style="padding:0.5rem;border:1px solid var(--border);border-radius:4px;" title="' + esc(SIZE_TT.journalCard) + '">';
        html += '<div class="meta">Journal</div>';
        html += '<div style="font-size:1.2rem;font-weight:bold;">' + esc(data.journalMode || '') + '</div></div>';
        html += '<div style="padding:0.5rem;border:1px solid var(--border);border-radius:4px;" title="' + esc(SIZE_TT.pagesTotal) + '">';
        html += '<div class="meta">Pages</div>';
        var pc = data.pageCount || 0;
        var ps = data.pageSize || 0;
        var pageBytes = pc * ps;
        html += '<div style="font-size:1.2rem;font-weight:bold;line-height:1.2;" title="' + esc(SIZE_TT.pagesTotal) + '">' + pageBytes.toLocaleString() + '</div>';
        html += '<div class="meta size-pages-formula" title="' + esc(SIZE_TT.pagesFormula) + '">(' + pc.toLocaleString() + ' × ' + ps.toLocaleString() + ')</div></div>';
        html += '</div>';
        html += '<table style="border-collapse:collapse;width:100%;font-size:12px;">';
        html += '<tr><th style="border:1px solid var(--border);padding:4px;" title="' + esc(SIZE_TT.thTable) + '">Table</th>';
        html += '<th style="border:1px solid var(--border);padding:4px;min-width:8rem;" title="' + esc(SIZE_TT.thRows) + '">Rows</th>';
        html += '<th style="border:1px solid var(--border);padding:4px;text-align:right;" title="' + esc(SIZE_TT.thColumns) + '">Columns</th>';
        html += '<th style="border:1px solid var(--border);padding:4px;" title="' + esc(SIZE_TT.thIndexes) + '">Indexes</th></tr>';
        var tables = data.tables || [];
        var maxRows = Math.max.apply(null, tables.map(function(t) { return t.rowCount; }).concat([1]));
        tables.forEach(function(t) {
          var barWidth = Math.max(1, (t.rowCount / maxRows) * 100);
          html += '<tr>';
          html += '<td style="border:1px solid var(--border);padding:4px;"><a href="#" class="table-link size-table-link" data-table="' + esc(t.table) + '" title="' + esc(SIZE_TT.tdTableLink) + '">' + esc(t.table) + '</a></td>';
          html += '<td style="border:1px solid var(--border);padding:4px;white-space:nowrap;" title="' + esc(SIZE_TT.tdRows) + '">';
          html += '<div style="background:var(--link);height:12px;width:' + barWidth + '%;opacity:0.3;display:inline-block;vertical-align:middle;margin-right:4px;"></div>';
          html += t.rowCount.toLocaleString() + '</td>';
          html += '<td style="border:1px solid var(--border);padding:4px;text-align:right;font-variant-numeric:tabular-nums;" title="' + esc(SIZE_TT.tdColumns) + '">' + t.columnCount + '</td>';
          html += '<td style="border:1px solid var(--border);padding:4px;" title="' + esc(SIZE_TT.tdIndexes) + '">' + t.indexCount;
          if (t.indexes && t.indexes.length > 0) html += ' <span class="size-index-names">(' + t.indexes.map(esc).join(', ') + ')</span>';
          html += '</td></tr>';
        });
        html += '</table></div>';
        return html;
      }

      // Table names link to openTableTab (same as sidebar); delegated because rows are innerHTML.
      if (container) {
        container.addEventListener('click', function(e) {
          var a = e.target.closest('a.size-table-link');
          if (!a || !container.contains(a)) return;
          e.preventDefault();
          var name = a.getAttribute('data-table');
          if (name) openTableTab(name);
        });
      }

      if (toggle && collapsible) {
        toggle.addEventListener('click', function() {
          const isCollapsed = collapsible.classList.contains('collapsed');
          collapsible.classList.toggle('collapsed', !isCollapsed);
          syncFeatureCardExpanded(collapsible);
        });
      }

      if (historySel) {
        populateHistorySelect(historySel, 'size');
        historySel.addEventListener('change', function() {
          var id = this.value;
          if (!id) return;
          var saved = getSavedAnalysisById('size', id);
          if (saved && saved.data) {
            lastSizeAnalyticsData = saved.data;
            container.innerHTML = renderSizeData(saved.data);
            container.style.display = 'block';
          }
        });
      }

      if (btn) btn.addEventListener('click', function() {
        btn.disabled = true;
        setButtonBusy(btn, true, 'Analyzing…');
        container.style.display = 'none';
        fetch('/api/analytics/size', authOpts())
          .then(function(r) {
            if (!r.ok) return r.json().then(function(d) { throw new Error(d.error || 'Request failed'); });
            return r.json();
          })
          .then(function(data) {
            lastSizeAnalyticsData = data;
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
            setButtonBusy(btn, false, 'Analyze');
          });
      });

      if (saveBtn) saveBtn.addEventListener('click', function() {
        if (!lastSizeAnalyticsData) return;
        var id = saveAnalysis('size', lastSizeAnalyticsData);
        showCopyToast(id != null ? 'Saved' : 'Save failed (storage may be full)');
        populateHistorySelect(historySel, 'size');
      });

      if (exportBtn) exportBtn.addEventListener('click', function() {
        if (!lastSizeAnalyticsData) return;
        downloadJSON(lastSizeAnalyticsData, 'size-analytics-' + (new Date().toISOString().slice(0, 10)) + '.json');
      });

      if (compareBtn) compareBtn.addEventListener('click', function() {
        showAnalysisCompare('size', 'Database size analytics', getSavedAnalyses('size'), lastSizeAnalyticsData, renderSizeData, function(a, b) {
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
          syncFeatureCardExpanded(collapsible);
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
        setButtonBusy(btn, true, 'Scanning\u2026');
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
            setButtonBusy(btn, false, 'Scan for anomalies');
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

      // --- Import history: track all import operations in this session ---
      var importHistory = [];
      var historyDetailsEl = document.getElementById('import-history-details');
      var historyListEl = document.getElementById('import-history-list');

      /** Record an import attempt and update the history UI. */
      function addImportHistory(table, format, imported, errors) {
        var now = new Date();
        var timeStr = now.toLocaleTimeString();
        var entry = { time: timeStr, table: table, format: format, imported: imported, errors: errors || [] };
        importHistory.unshift(entry);
        renderImportHistory();
      }

      /** Render the import history list. */
      function renderImportHistory() {
        if (!historyListEl || !historyDetailsEl) return;
        if (importHistory.length === 0) { historyDetailsEl.style.display = 'none'; return; }
        historyDetailsEl.style.display = 'block';
        var html = '';
        for (var i = 0; i < importHistory.length; i++) {
          var h = importHistory[i];
          var errText = h.errors.length > 0 ? ' <span style="color:#e57373;">(' + h.errors.length + ' error(s))</span>' : '';
          html += '<div style="padding:2px 0;border-bottom:1px solid var(--border,#333);">'
            + '<span style="opacity:0.6;">' + esc(h.time) + '</span> '
            + '<strong>' + esc(h.table) + '</strong> '
            + '(' + esc(h.format) + ') &mdash; '
            + h.imported + ' row(s)' + errText
            + '</div>';
        }
        historyListEl.innerHTML = html;
      }

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
          previewEl.textContent = importFileData.length > 2000 ? importFileData.slice(0, 2000) + '\n…' : importFileData;
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
          syncFeatureCardExpanded(collapsible);
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
              var firstLine = importFileData.split(/\r?\n/)[0] || '';
              importCsvHeaders = parseCsvHeaderLine(firstLine);
            }
            updateImportState();
          };
          reader.readAsText(f);
        });
      }

      // Paste from clipboard: auto-detect format (TSV, CSV, JSON) and populate import data.
      var pasteBtn = document.getElementById('import-paste');
      if (pasteBtn) {
        pasteBtn.addEventListener('click', function() {
          if (!navigator.clipboard || !navigator.clipboard.readText) {
            alert('Clipboard API not available (requires HTTPS or localhost).');
            return;
          }
          navigator.clipboard.readText().then(function(text) {
            if (!text || !text.trim()) { alert('Clipboard is empty.'); return; }
            importFileData = text;
            // Auto-detect format: JSON starts with [ or {, TSV has tabs, else CSV.
            var trimmed = text.trim();
            var detectedFormat = 'csv';
            if (trimmed.charAt(0) === '[' || trimmed.charAt(0) === '{') {
              detectedFormat = 'json';
            } else if (trimmed.indexOf('\t') >= 0) {
              // TSV: convert each line to CSV by splitting on tabs and
              // quoting any field that contains commas or quotes.
              detectedFormat = 'csv';
              importFileData = text.split(/\r?\n/).map(function(line) {
                return line.split('\t').map(function(field) {
                  if (field.indexOf(',') >= 0 || field.indexOf('"') >= 0) {
                    return '"' + field.replace(/"/g, '""') + '"';
                  }
                  return field;
                }).join(',');
              }).join('\n');
            }
            if (formatSel) formatSel.value = detectedFormat;
            importCsvHeaders = [];
            if (detectedFormat === 'csv') {
              var firstLine = importFileData.split(/\r?\n/)[0] || '';
              importCsvHeaders = parseCsvHeaderLine(firstLine);
            }
            // Clear file input so there's no confusion about the data source
            if (fileInput) fileInput.value = '';
            updateImportState();
          }).catch(function(e) {
            alert('Failed to read clipboard: ' + (e.message || 'Permission denied'));
          });
        });
      }

      if (formatSel) formatSel.addEventListener('change', function() {
        if (this.value === 'csv' && importFileData) {
          var firstLine = importFileData.split(/\r?\n/)[0] || '';
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
          setButtonBusy(runBtn, true, 'Importing…');
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
                addImportHistory(table, format, 0, [o.data.error || 'Request failed']);
                return;
              }
              var d = o.data;
              var msg = 'Imported ' + d.imported + ' row(s).';
              if (d.errors && d.errors.length > 0) msg += ' ' + d.errors.length + ' error(s): ' + d.errors.slice(0, 3).join('; ');
              statusEl.textContent = msg;
              statusEl.style.color = '';
              addImportHistory(table, format, d.imported, d.errors || []);
              if (d.imported > 0 && currentTableName === table) loadTable(table);
            })
            .catch(function(e) {
              statusEl.textContent = 'Error: ' + (e.message || 'Import failed');
              statusEl.style.color = '#e57373';
              addImportHistory(table, format, 0, [e.message || 'Import failed']);
            })
            .finally(function() {
              runBtn.disabled = !importFileData || !tableSel || !tableSel.value;
              setButtonBusy(runBtn, false, runBtnOrigText || 'Import');
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
          const s = getDisplayValue(k, v);
          if (s === '') return '';
          return s.includes(',') || s.includes('"') || s.includes('\n') ? '"' + s.replace(/"/g, '""') + '"' : s;
        }).join(',');
        const csv = [keys.join(','), ...currentTableJson.map(rowToCsv)].join('\n');
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

    // --- JSON export: download current table data as a JSON file ---
    document.getElementById('export-json').addEventListener('click', function(e) {
      e.preventDefault();
      if (!currentTableName || !currentTableJson || currentTableJson.length === 0) {
        document.getElementById('export-json-status').textContent = ' Select a table with data first.';
        return;
      }
      var statusEl = document.getElementById('export-json-status');
      statusEl.textContent = ' Preparing…';
      try {
        var json = JSON.stringify(currentTableJson, null, 2);
        var blob = new Blob([json], { type: 'application/json;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = currentTableName + '.json';
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
    /** When true, table shows only rows matching the row filter; when false, shows all rows. */
    var showOnlyMatchingRows = true;
    function filterRows(data) {
      const term = getRowFilter();
      if (!term || !data || data.length === 0) return data || [];
      const lower = term.toLowerCase();
      return data.filter(row => Object.values(row).some(v => v != null && String(v).toLowerCase().includes(lower)));
    }
    /** Returns the data to display for the table: filtered or all rows depending on showOnlyMatchingRows. */
    function getTableDisplayData(data) {
      if (!data || data.length === 0) return data || [];
      if (showOnlyMatchingRows && getRowFilter()) return filterRows(data);
      return data;
    }

    /**
     * Builds the filter-status suffix for table meta text (row count line).
     * @param {number} filteredLen - Number of rows matching the row filter
     * @param {number} totalLen - Total rows in the table
     * @returns {string} Empty, " (filtered: X of Y)", or " (showing all rows; filter: X match)"
     */
    function buildTableFilterMetaSuffix(filteredLen, totalLen) {
      if (!getRowFilter()) return '';
      if (showOnlyMatchingRows) return ' (filtered: ' + filteredLen + ' of ' + totalLen + ')';
      return ' (showing all rows; filter: ' + filteredLen + ' match)';
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
      const isSearchPanel = activeTabId === 'search';
      const root = isSearchPanel ? document.getElementById('search-results-content') : null;

      function getEl(mainId, panelId) {
        if (isSearchPanel && root) {
          var el = root.querySelector('#' + panelId);
          return el || null;
        }
        return document.getElementById(mainId);
      }
      const schemaPre = getEl('schema-pre', 'search-panel-schema-pre');
      const contentPre = getEl('content-pre', 'search-panel-content-pre');
      var dataTable = getEl('data-table', 'search-panel-data-table');

      // --- Phase 1: Apply highlight markup to matching text ---
      if (schemaPre && lastRenderedSchema !== null && (scope === 'schema' || scope === 'both')) {
        schemaPre.innerHTML = term ? highlightText(lastRenderedSchema, term) : esc(lastRenderedSchema);
      }
      if (contentPre && lastRenderedSchema !== null && scope === 'schema') {
        contentPre.innerHTML = term ? highlightText(lastRenderedSchema, term) : esc(lastRenderedSchema);
      }
      if (dataTable && (scope === 'data' || scope === 'both')) {
        dataTable.querySelectorAll('td').forEach(function(td) {
          if (!td.querySelector('.fk-link')) {
            var copyBtn = td.querySelector('.cell-copy-btn');
            var textNodes = [];
            td.childNodes.forEach(function(n) { if (n !== copyBtn) textNodes.push(n.textContent || ''); });
            var text = textNodes.join('');
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

      // --- Phase 2: Build navigable match list from highlight spans in the active panel ---
      searchMatches = [];
      searchCurrentIndex = -1;

      if (term) {
        var searchRoot = isSearchPanel && root ? root : document;
        searchMatches = Array.from(searchRoot.querySelectorAll ? searchRoot.querySelectorAll('.highlight') : []);
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
        if (activeTabId === 'search' && typeof window._stFocusInput === 'function') {
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

    document.getElementById('row-filter').addEventListener('input', function() { if (currentTableName && currentTableJson) { renderTableView(currentTableName, currentTableJson); saveTableState(currentTableName); } });
    document.getElementById('row-filter').addEventListener('keyup', function() { if (currentTableName && currentTableJson) renderTableView(currentTableName, currentTableJson); });
    var rowDisplayAll = document.getElementById('row-display-all');
    var rowDisplayMatching = document.getElementById('row-display-matching');
    if (rowDisplayAll) rowDisplayAll.addEventListener('click', function() {
      showOnlyMatchingRows = false;
      rowDisplayAll.classList.add('active');
      if (rowDisplayMatching) rowDisplayMatching.classList.remove('active');
      if (currentTableName && currentTableJson) { renderTableView(currentTableName, currentTableJson); saveTableState(currentTableName); }
    });
    if (rowDisplayMatching) rowDisplayMatching.addEventListener('click', function() {
      showOnlyMatchingRows = true;
      rowDisplayMatching.classList.add('active');
      if (rowDisplayAll) rowDisplayAll.classList.remove('active');
      if (currentTableName && currentTableJson) { renderTableView(currentTableName, currentTableJson); saveTableState(currentTableName); }
    });
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

    // =========================================================================
    // Search Tab: self-contained search with inline table picker, scope,
    // filter, and match navigation.  Completely independent of the sidebar
    // search controls (which continue to serve the Tables tab).
    // =========================================================================
    (function initSearchTab() {
      // --- Search-tab DOM handles ---
      var stTableSel  = document.getElementById('st-table');
      var stInput     = document.getElementById('st-input');
      var stScopeSel  = document.getElementById('st-scope');
      var stFilterEl  = document.getElementById('st-filter');
      var stNavEl     = document.getElementById('st-nav');
      var stCountEl   = document.getElementById('st-count');
      var stPrevBtn   = document.getElementById('st-prev');
      var stNextBtn   = document.getElementById('st-next');
      var stRowToggle = document.getElementById('st-row-toggle-wrap');
      var stRowAll    = document.getElementById('st-row-all');
      var stRowMatch  = document.getElementById('st-row-matching');
      var stPanel     = document.getElementById('search-results-content');
      if (!stTableSel || !stInput || !stPanel) return;

      // --- Search-tab–specific state (independent of Tables tab) ---
      var stTableName = null;      // currently selected table
      var stTableJson = null;      // fetched row data for that table
      var stSchemaText = null;     // rendered schema text (for highlighting)
      var stCachedFks = null;      // cached FK metadata for current table
      var stCachedColTypes = null; // cached column types for current table
      var stMatches = [];          // highlighted spans
      var stMatchIdx = -1;         // active match index
      var stOnlyMatching = true;   // row-display toggle
      // FIX #2: Independent pagination so Tables tab pagination doesn't bleed
      var stLimit = 500;
      var stOffset = 0;

      // --- Accessors for search-tab controls ---
      function stScope()  { return stScopeSel.value || ''; }
      function stTerm()   { return String(stInput.value || '').trim(); }
      function stFilter() { return String(stFilterEl.value || '').trim(); }

      // --- Populate table dropdown from master table list ---
      // Called by renderTableList whenever the table list updates.
      window._stPopulateTables = function(tables) {
        var prev = stTableSel.value;
        stTableSel.innerHTML = '<option value="">-- select --</option>';
        (tables || []).forEach(function(t) {
          var opt = document.createElement('option');
          opt.value = t;
          opt.textContent = (tableCounts[t] != null)
            ? (t + ' (' + formatTableRowCountDisplay(tableCounts[t]) + ')')
            : t;
          stTableSel.appendChild(opt);
        });
        // Preserve previous selection if still valid
        if (prev) stTableSel.value = prev;
      };

      // --- Sync: when sidebar table changes, update dropdown selection ---
      window._stSyncTable = function(name) {
        if (name && stTableSel.querySelector('option[value="' + CSS.escape(name) + '"]')) {
          stTableSel.value = name;
        }
      };

      // FIX #13: Update a single dropdown option label when async count arrives
      window._stUpdateCount = function(table, count) {
        var opts = stTableSel.options;
        for (var i = 0; i < opts.length; i++) {
          if (opts[i].value === table) {
            opts[i].textContent = table + ' (' + formatTableRowCountDisplay(count) + ')';
            break;
          }
        }
      };

      // --- Row filtering (mirrors main filterRows but uses search-tab filter) ---
      function stFilterRows(data) {
        var term = stFilter();
        if (!term || !data || data.length === 0) return data || [];
        var lower = term.toLowerCase();
        return data.filter(function(row) {
          return Object.values(row).some(function(v) {
            return v != null && String(v).toLowerCase().includes(lower);
          });
        });
      }

      /**
       * Builds the search-tab content DOM from data/schema already in memory.
       * Extracted from the fetch .then() callback so it can be reused when
       * re-rendering from cache (e.g. filter or row-toggle changes).
       * FIX #1: Avoids the old recursive stRender() call after count fetch.
       * FIX #5: Uses id="st-data-table" to avoid duplicate id with Tables panel.
       * FIX #11: Filters data once and reuses the result (no double stFilterRows).
       */
      function stBuildContent(data, schema, fks, colTypes, tableName) {
        stTableJson = data;
        stCachedFks = fks;
        stCachedColTypes = colTypes;
        if (schema && cachedSchema === null) cachedSchema = schema;

        var scope = stScope();
        // FIX #11: Compute filtered rows once and reuse for display
        var filtered = stFilterRows(data);
        var display = (stOnlyMatching && stFilter()) ? filtered : data;
        if (!display || display.length === 0) display = data;
        var fkMap = {};
        (fks || []).forEach(function(fk) { fkMap[fk.fromColumn] = fk; });

        // Build meta text using search-tab-local pagination (FIX #2)
        var total = tableCounts[tableName];
        var len = data.length;
        var metaText = esc(tableName);
        if (total != null) {
          var rangeText = len > 0 ? ('showing ' + (stOffset + 1) + '\u2013' + (stOffset + len)) : 'no rows in this range';
          metaText = esc(tableName) + ' (' + total + ' row' + (total !== 1 ? 's' : '') + '; ' + rangeText + ')';
        } else {
          metaText = esc(tableName) + ' (up to ' + stLimit + ' rows)';
        }
        var filterSuffix = '';
        if (stFilter()) {
          filterSuffix = stOnlyMatching
            ? ' (filtered: ' + filtered.length + ' of ' + data.length + ')'
            : ' (showing all rows; filter: ' + filtered.length + ' match)';
        }
        metaText += filterSuffix;

        // FIX #5: Replace id="data-table" with id="st-data-table" to avoid
        // duplicate ids when both Tables and Search panels are in the DOM.
        var rawTableHtml = buildDataTableHtml(display, fkMap, colTypes, getColumnConfig(tableName));
        var tableHtml = wrapDataTableInScroll(rawTableHtml.replace('id="data-table"', 'id="st-data-table"'))
          + buildTableStatusBar(total, stOffset, stLimit, display.length,
              getVisibleColumnCount(Object.keys(display[0] || {}), getColumnConfig(tableName)));

        if (scope === 'both' && schema) {
          stSchemaText = schema;
          stPanel.innerHTML =
            '<div class="search-section-collapsible expanded">' +
              '<div class="collapsible-header" data-collapsible>Schema</div>' +
              '<div class="collapsible-body"><pre id="st-schema-pre">' + highlightSqlSafe(schema) + '</pre></div>' +
            '</div>' +
            '<div class="search-section-collapsible expanded">' +
              '<div class="collapsible-header" data-collapsible>Table data: ' + esc(tableName) + '</div>' +
              '<div class="collapsible-body"><p class="meta st-meta">' + metaText + '</p>' + tableHtml + '</div>' +
            '</div>';
        } else {
          stSchemaText = null;
          stPanel.innerHTML = '<p class="meta st-meta">' + metaText + '</p>' + tableHtml;
        }

        // Show/hide row display toggle
        if (stRowToggle) {
          stRowToggle.style.display = (scope === 'data' || scope === 'both') ? 'flex' : 'none';
        }

        stHighlight();
      }

      // --- Render content into #search-results-content ---
      function stRender() {
        if (!stPanel) return;
        var scope = stScope();
        var tableName = stTableName;

        // Nothing selected yet → show prompt
        if (!tableName && scope !== 'schema') {
          stPanel.innerHTML = '<p class="meta">Select a table and type a search term.</p>';
          return;
        }

        // Schema-only view
        if (scope === 'schema') {
          stPanel.innerHTML = '<p class="meta">Loading schema\u2026</p>';
          var schemaPromise = cachedSchema !== null
            ? Promise.resolve(cachedSchema)
            : fetch('/api/schema', authOpts()).then(function(r) { return r.text(); });
          schemaPromise.then(function(schema) {
            if (cachedSchema === null) cachedSchema = schema;
            stSchemaText = schema;
            stTableJson = null; // FIX #3: was stDataJson (undeclared → implicit global)
            stPanel.innerHTML = '<p class="meta">Schema</p><pre id="st-schema-pre">' + highlightSqlSafe(schema) + '</pre>';
            stHighlight();
          }).catch(function(e) {
            stPanel.innerHTML = '<p class="meta">Error</p><pre>' + esc(String(e)) + '</pre>';
          });
          return;
        }

        // Data or Both: need table data
        if (!tableName) {
          stPanel.innerHTML = '<p class="meta">Select a table above.</p>';
          return;
        }

        // FIX #12: Use cached data when available (filter/toggle changes skip the network)
        if (stTableJson && stCachedFks !== null && stCachedColTypes !== null) {
          // Schema might still be needed for 'both' scope
          if (scope === 'both' && !cachedSchema) {
            // Fetch schema only, then render with cached table data
            stPanel.innerHTML = '<p class="meta">Loading schema\u2026</p>';
            fetch('/api/schema', authOpts()).then(function(r) { return r.text(); }).then(function(schema) {
              cachedSchema = schema;
              if (stTableName === tableName) stBuildContent(stTableJson, schema, stCachedFks, stCachedColTypes, tableName);
            }).catch(function(e) {
              stPanel.innerHTML = '<p class="meta">Error loading schema</p><pre>' + esc(String(e)) + '</pre>';
            });
            return;
          }
          stBuildContent(stTableJson, (scope === 'both') ? cachedSchema : null, stCachedFks, stCachedColTypes, tableName);
          return;
        }

        // Fresh fetch: show loading indicator
        stPanel.innerHTML = '<p class="meta">Loading ' + esc(tableName) + '\u2026</p>';

        // FIX #2: Use search-tab-local limit/offset (not global)
        var dataFetch = fetch('/api/table/' + encodeURIComponent(tableName) + '?limit=' + stLimit + '&offset=' + stOffset, authOpts())
          .then(function(r) { return r.json(); });
        var schemaFetch = (scope === 'both')
          ? (cachedSchema !== null ? Promise.resolve(cachedSchema) : fetch('/api/schema', authOpts()).then(function(r) { return r.text(); }))
          : Promise.resolve(null);

        Promise.all([dataFetch, schemaFetch, loadFkMeta(tableName), loadColumnTypes(tableName).catch(function() { return {}; })])
          .then(function(results) {
            var data = results[0];
            var schema = results[1];
            var fks = results[2];
            var colTypes = results[3];
            if (stTableName !== tableName) return; // user switched tables

            stBuildContent(data, schema, fks, colTypes, tableName);

            // FIX #1: Fetch total count and update meta text only (no recursive stRender).
            // The old code called stRender() again which fired 4 duplicate fetches.
            var total = tableCounts[tableName];
            if (total == null) {
              fetch('/api/table/' + encodeURIComponent(tableName) + '/count', authOpts())
                .then(function(r) { return r.json(); })
                .then(function(o) {
                  tableCounts[tableName] = o.count;
                  // Surgically update only the meta text element
                  if (stTableName === tableName) {
                    var metaEl = stPanel.querySelector('.st-meta');
                    if (metaEl) {
                      var len = stTableJson ? stTableJson.length : 0;
                      var rangeText = len > 0 ? ('showing ' + (stOffset + 1) + '\u2013' + (stOffset + len)) : 'no rows in this range';
                      metaEl.textContent = tableName + ' (' + o.count + ' row' + (o.count !== 1 ? 's' : '') + '; ' + rangeText + ')';
                    }
                  }
                }).catch(function() {});
            }
          })
          .catch(function(e) {
            stPanel.innerHTML = '<p class="meta">Error</p><pre>' + esc(String(e)) + '</pre>';
          });
      }

      // --- Apply search highlighting within the search tab panel ---
      function stHighlight() {
        var term = stTerm();
        var scope = stScope();

        // Highlight schema text
        var schemaPre = stPanel.querySelector('#st-schema-pre');
        if (schemaPre && stSchemaText && (scope === 'schema' || scope === 'both')) {
          schemaPre.innerHTML = term ? highlightText(stSchemaText, term) : highlightSqlSafe(stSchemaText);
        }

        // FIX #5: Use st-data-table (not data-table) to target Search panel only
        var dataTable = stPanel.querySelector('#st-data-table');
        if (dataTable && (scope === 'data' || scope === 'both')) {
          dataTable.querySelectorAll('td').forEach(function(td) {
            if (!td.querySelector('.fk-link')) {
              var copyBtn = td.querySelector('.cell-copy-btn');
              var textNodes = [];
              td.childNodes.forEach(function(n) { if (n !== copyBtn) textNodes.push(n.textContent || ''); });
              var text = textNodes.join('');
              var highlighted = term ? highlightText(text, term) : esc(text);
              if (copyBtn) {
                td.innerHTML = highlighted + copyBtn.outerHTML;
              } else {
                td.innerHTML = highlighted;
              }
            }
          });
        }

        // Build match list from highlight spans
        stMatches = term ? Array.from(stPanel.querySelectorAll('.highlight')) : [];
        stMatchIdx = -1;

        if (stMatches.length > 0) {
          stNavEl.style.display = 'flex';
          stNavigate(0);
        } else {
          stNavEl.style.display = term ? 'flex' : 'none';
          stCountEl.textContent = term ? 'No matches' : '';
          stPrevBtn.disabled = true;
          stNextBtn.disabled = true;
        }
      }

      // --- Navigate matches ---
      function stNavigate(index) {
        if (stMatches.length === 0) return;
        if (index < 0) index = stMatches.length - 1;
        if (index >= stMatches.length) index = 0;
        if (stMatchIdx >= 0 && stMatchIdx < stMatches.length) {
          stMatches[stMatchIdx].classList.remove('highlight-active');
        }
        stMatchIdx = index;
        var el = stMatches[stMatchIdx];
        el.classList.add('highlight-active');
        expandSectionContaining(el);
        el.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' });
        stCountEl.textContent = (stMatchIdx + 1) + ' of ' + stMatches.length;
        stPrevBtn.disabled = false;
        stNextBtn.disabled = false;
      }
      function stNext() { if (stMatches.length) stNavigate(stMatchIdx + 1); }
      function stPrev() { if (stMatches.length) stNavigate(stMatchIdx - 1); }

      // --- Event listeners for search-tab controls ---
      // Table selection change → clear cache and fetch fresh data
      stTableSel.addEventListener('change', function() {
        stTableName = stTableSel.value || null;
        stTableJson = null;
        stCachedFks = null;
        stCachedColTypes = null;
        stRender();
      });

      // FIX #14: Debounce timers for keystroke-driven handlers
      var stInputTimer = null;
      var stFilterTimer = null;

      // Live search highlighting with short debounce to avoid jank on large tables
      stInput.addEventListener('input', function() {
        clearTimeout(stInputTimer);
        stInputTimer = setTimeout(function() {
          // If content is already rendered, just re-highlight (no re-fetch)
          if (stPanel.querySelector('#st-data-table, #st-schema-pre')) {
            stHighlight();
          } else {
            // No content yet — trigger full render if table selected
            if (stTableName || stScope() === 'schema') stRender();
          }
        }, 150);
      });

      // Keyboard navigation: Enter = next, Shift+Enter = prev, Escape = clear
      stInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (e.shiftKey) { stPrev(); } else { stNext(); }
        }
        if (e.key === 'Escape') {
          stInput.value = '';
          clearTimeout(stInputTimer);
          stHighlight();
          stInput.blur();
        }
      });

      // Scope change → may need different data; clear cache and re-render
      stScopeSel.addEventListener('change', function() { stRender(); });

      // FIX #12: Row filter re-renders from cached data (no network), debounced
      stFilterEl.addEventListener('input', function() {
        clearTimeout(stFilterTimer);
        stFilterTimer = setTimeout(function() {
          if (stTableName && stTableJson) stRender(); // uses cache path
        }, 200);
      });

      // Match navigation buttons
      stPrevBtn.addEventListener('click', stPrev);
      stNextBtn.addEventListener('click', stNext);

      // Row display toggle (All / Matching) — re-renders from cache
      if (stRowAll) stRowAll.addEventListener('click', function() {
        stOnlyMatching = false;
        stRowAll.classList.add('active');
        if (stRowMatch) stRowMatch.classList.remove('active');
        if (stTableName && stTableJson) stRender(); // uses cache path
      });
      if (stRowMatch) stRowMatch.addEventListener('click', function() {
        stOnlyMatching = true;
        stRowMatch.classList.add('active');
        if (stRowAll) stRowAll.classList.remove('active');
        if (stTableName && stTableJson) stRender(); // uses cache path
      });

      // --- Public: called from onTabSwitch when Search tab becomes active ---
      window._stOnActivate = function() {
        // If no content yet and we have a current table, pre-select it
        if (!stTableName && currentTableName) {
          stTableSel.value = currentTableName;
          stTableName = currentTableName;
          stRender();
        }
        // Focus search input for immediate typing
        stInput.focus();
      };

      // --- Public: focus search input (for Ctrl+F) ---
      window._stFocusInput = function() {
        stInput.focus();
        stInput.select();
      };
    })();

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

    /**
     * Navigates to a given offset: updates state, syncs advanced offset input,
     * saves table state, and reloads the table. Single place for all page/offset navigation.
     */
    function goToOffset(newOffset) {
      offset = Math.max(0, newOffset);
      const offsetInput = document.getElementById('pagination-offset');
      if (offsetInput) offsetInput.value = String(offset);
      saveTableState(currentTableName);
      loadTable(currentTableName);
    }

    /**
     * Updates the pagination bar: status text, First/Prev/Next/Last disabled state,
     * page dropdown, and syncs the advanced offset input. Call after limit/offset/total change.
     * Rebuilds the page dropdown each time so it always reflects current state.
     * @param {number|null} total - Total row count from server, or null if unknown
     */
    function updatePaginationBar(total) {
      const statusEl = document.getElementById('pagination-status');
      const firstBtn = document.getElementById('pagination-first');
      const prevBtn = document.getElementById('pagination-prev');
      const nextBtn = document.getElementById('pagination-next');
      const lastBtn = document.getElementById('pagination-last');
      const pagesEl = document.getElementById('pagination-pages');
      const offsetInput = document.getElementById('pagination-offset');
      if (!pagesEl || !offsetInput) return;

      const currentPage = limit > 0 ? Math.floor(offset / limit) + 1 : 1;
      const totalPages = (total != null && total > 0 && limit > 0) ? Math.max(1, Math.ceil(total / limit)) : null;
      // When offset is past end (e.g. Advanced offset), clamp so dropdown has a valid selection
      const selectedPage = totalPages != null && currentPage > totalPages ? totalPages : currentPage;

      // Status: "Showing 1–50 of 500" or "Page 1" when total unknown
      if (statusEl) {
        if (total != null) {
          const from = offset + 1;
          const to = Math.min(offset + limit, total);
          statusEl.textContent = total === 0 ? '0 rows' : 'Showing ' + from + '\u2013' + to + ' of ' + total.toLocaleString() + ' rows';
        } else {
          statusEl.textContent = 'Page ' + currentPage + ' (total unknown)';
        }
      }

      // First / Prev: disabled on first page
      const onFirstPage = offset <= 0;
      if (firstBtn) firstBtn.disabled = onFirstPage;
      if (prevBtn) prevBtn.disabled = onFirstPage;

      // Next / Last: disabled when we know total and we're on last page
      const onLastPage = totalPages != null && currentPage >= totalPages;
      if (nextBtn) nextBtn.disabled = onLastPage;
      if (lastBtn) lastBtn.disabled = onLastPage;

      // Page selector: dropdown with 1..totalPages, or "Page 1 of ?"
      pagesEl.innerHTML = '';
      const pageLabel = document.createElement('label');
      pageLabel.setAttribute('for', 'pagination-page');
      pageLabel.textContent = 'Page ';
      pageLabel.className = 'pagination-page-label';
      pagesEl.appendChild(pageLabel);
      const pageSel = document.createElement('select');
      pageSel.id = 'pagination-page';
      pageSel.setAttribute('aria-label', 'Current page');
      if (totalPages != null) {
        for (let p = 1; p <= totalPages; p++) {
          const opt = document.createElement('option');
          opt.value = String(p);
          opt.textContent = String(p);
          if (p === selectedPage) opt.selected = true;
          pageSel.appendChild(opt);
        }
      } else {
        const opt = document.createElement('option');
        opt.value = '1';
        opt.textContent = '1';
        opt.selected = true;
        pageSel.appendChild(opt);
      }
      pagesEl.appendChild(pageSel);
      const ofSpan = document.createElement('span');
      ofSpan.id = 'pagination-of';
      ofSpan.className = 'pagination-of';
      ofSpan.textContent = totalPages != null ? ' of ' + totalPages : '';
      pagesEl.appendChild(ofSpan);

      pageSel.addEventListener('change', function() {
        const p = parseInt(this.value, 10) || 1;
        goToOffset((p - 1) * limit);
      });

      // Sync advanced offset input
      offsetInput.value = String(offset);
    }

    function setupPagination() {
      const bar = document.getElementById('pagination-bar');
      if (!bar) return;
      const limitSel = document.getElementById('pagination-limit');
      limitSel.innerHTML = LIMIT_OPTIONS.map(n => '<option value="' + n + '"' + (n === limit ? ' selected' : '') + '>' + n + '</option>').join('');
      const total = currentTableName ? (tableCounts[currentTableName] ?? null) : null;
      updatePaginationBar(total);
      bar.style.display = getScope() === 'schema' ? 'none' : 'flex';
    }
    document.getElementById('pagination-limit').addEventListener('change', function() { limit = parseInt(this.value, 10); saveTableState(currentTableName); loadTable(currentTableName); });
    document.getElementById('pagination-offset').addEventListener('change', function() { offset = parseInt(this.value || '0', 10) || 0; });
    document.getElementById('pagination-prev').addEventListener('click', function() { goToOffset(Math.max(0, offset - limit)); });
    document.getElementById('pagination-next').addEventListener('click', function() { goToOffset(offset + limit); });
    document.getElementById('pagination-first').addEventListener('click', function() { goToOffset(0); });
    document.getElementById('pagination-last').addEventListener('click', function() {
      const total = currentTableName ? (tableCounts[currentTableName] ?? null) : null;
      if (total == null || total <= 0) return;
      const totalPages = Math.max(1, Math.ceil(total / limit));
      goToOffset((totalPages - 1) * limit);
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
    // Clear rows: delete all data from the current table (write-enabled only).
    document.getElementById('clear-table-data').addEventListener('click', function() {
      if (!driftWriteEnabled || !currentTableName) return;
      if (!confirm('Delete ALL rows from "' + currentTableName + '"? This cannot be undone.')) return;
      var btn = this;
      btn.disabled = true;
      fetch('/api/edits/apply', authOpts({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statements: ['DELETE FROM "' + currentTableName.replace(/"/g, '""') + '"'] })
      }))
        .then(function(r) { return r.json().then(function(d) { return { ok: r.ok, data: d }; }); })
        .then(function(o) {
          if (!o.ok) { alert('Clear failed: ' + (o.data.error || 'Unknown error')); return; }
          loadTable(currentTableName);
        })
        .catch(function(e) { alert('Clear failed: ' + (e.message || 'Network error')); })
        .finally(function() { btn.disabled = false; });
    });

    // Clear all tables: delete all rows from every known table (write-enabled only).
    document.getElementById('clear-all-data').addEventListener('click', function() {
      if (!driftWriteEnabled) return;
      var tables = lastKnownTables || [];
      if (tables.length === 0) { alert('No tables loaded.'); return; }
      if (!confirm('Delete ALL rows from ALL ' + tables.length + ' table(s)? This cannot be undone.')) return;
      var btn = this;
      btn.disabled = true;
      // Build one DELETE statement per table; the server runs them in a single transaction.
      var stmts = tables.map(function(t) { return 'DELETE FROM "' + t.replace(/"/g, '""') + '"'; });
      fetch('/api/edits/apply', authOpts({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statements: stmts })
      }))
        .then(function(r) { return r.json().then(function(d) { return { ok: r.ok, data: d }; }); })
        .then(function(o) {
          if (!o.ok) { alert('Clear all failed: ' + (o.data.error || 'Unknown error')); return; }
          if (currentTableName) loadTable(currentTableName);
        })
        .catch(function(e) { alert('Clear all failed: ' + (e.message || 'Network error')); })
        .finally(function() { btn.disabled = false; });
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
        pinBtn.title = config.pinned.indexOf(key) >= 0 ? 'Unpin this column' : 'Pin this column to the left';
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
        container.innerHTML = '<div class="search-section-collapsible expanded">' +
          '<div class="collapsible-header" data-collapsible>Schema</div>' +
          '<div class="collapsible-body"><pre id="schema-pre">' + highlightSqlSafe(schema) + '</pre></div>' +
          '</div>' +
          '<div class="search-section-collapsible expanded" id="both-data-section">' +
          '<div class="collapsible-header" data-collapsible>Table data</div>' +
          '<div class="collapsible-body"><p class="meta">Select a table above to load data.</p></div>' +
          '</div>';
        const dataSection = document.getElementById('both-data-section');
        if (dataSection && currentTableName && currentTableJson !== null) {
          const displayData = getTableDisplayData(currentTableJson);
          const filtered = filterRows(currentTableJson);
          const metaText = rowCountText(currentTableName) + buildTableFilterMetaSuffix(filtered.length, currentTableJson.length);
          var fkMap = {};
          var cachedFks = fkMetaCache[currentTableName] || [];
          cachedFks.forEach(function(fk) { fkMap[fk.fromColumn] = fk; });
          var colTypes = tableColumnTypes[currentTableName] || {};
          var dataBody = dataSection.querySelector('.collapsible-body');
          var headerEl = dataSection.querySelector('.collapsible-header');
          if (headerEl) headerEl.textContent = 'Table data: ' + currentTableName;
          /* Keep column-definition block in sync with renderTableView / table tabs. */
          if (dataBody) dataBody.innerHTML = '<p class="meta">' + metaText + '</p>' + buildTableDefinitionHtml(currentTableName) + wrapDataTableInScroll(buildDataTableHtml(displayData, fkMap, colTypes, getColumnConfig(currentTableName))) + buildTableStatusBar(tableCounts[currentTableName], offset, limit, displayData.length, getVisibleColumnCount(Object.keys(displayData[0] || {}), getColumnConfig(currentTableName)));
        }
      } else {
        container.innerHTML = '<p class="meta">Schema</p><pre id="content-pre">' + highlightSqlSafe(schema) + '</pre>';
      }
    }

    /**
     * Builds HTML for the "both" (schema + table data) view with collapsible sections.
     * @param {string} defHtml - Table definition block from buildTableDefinitionHtml (may be empty).
     */
    function buildBothViewSectionsHtml(tableName, metaText, qbHtml, tableHtml, schema, defHtml) {
      defHtml = defHtml || '';
      return '<div class="search-section-collapsible expanded">' +
        '<div class="collapsible-header" data-collapsible>Schema</div>' +
        '<div class="collapsible-body"><pre id="schema-pre">' + highlightSqlSafe(schema) + '</pre></div>' +
        '</div>' +
        '<div class="search-section-collapsible expanded" id="both-data-section">' +
        '<div class="collapsible-header" data-collapsible>Table data: ' + esc(tableName) + '</div>' +
        '<div class="collapsible-body"><p class="meta">' + metaText + '</p>' + defHtml + qbHtml + tableHtml + '</div>' +
        '</div>';
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
          const displayData = getTableDisplayData(currentTableJson);
          const filtered = filterRows(currentTableJson);
          const metaText = rowCountText(currentTableName) + buildTableFilterMetaSuffix(filtered.length, currentTableJson.length);
          var fkMap = {};
          var cachedFks = fkMetaCache[currentTableName] || [];
          cachedFks.forEach(function(fk) { fkMap[fk.fromColumn] = fk; });
          var colTypes = tableColumnTypes[currentTableName] || {};
          dataHtml = '<p class="meta">' + metaText + '</p>' + buildTableDefinitionHtml(currentTableName) + wrapDataTableInScroll(buildDataTableHtml(displayData, fkMap, colTypes, getColumnConfig(currentTableName))) + buildTableStatusBar(tableCounts[currentTableName], offset, limit, displayData.length, getVisibleColumnCount(Object.keys(displayData[0] || {}), getColumnConfig(currentTableName)));
        } else {
          lastRenderedData = null;
          dataHtml = '<p class="meta">Select a table above to load data.</p>';
        }
        content.innerHTML = '<div class="search-section-collapsible expanded">' +
          '<div class="collapsible-header" data-collapsible>Schema</div>' +
          '<div class="collapsible-body"><pre id="schema-pre">' + highlightSqlSafe(schema) + '</pre></div>' +
          '</div>' +
          '<div class="search-section-collapsible expanded" id="both-data-section">' +
          '<div class="collapsible-header" data-collapsible>Table data</div>' +
          '<div class="collapsible-body">' + dataHtml + '</div>' +
          '</div>';
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
      switchTab('sql');
      var collapsible = document.getElementById('sql-runner-collapsible');
      if (collapsible && collapsible.classList.contains('collapsed')) {
        collapsible.classList.remove('collapsed');
        syncFeatureCardExpanded(collapsible);
      }
      document.getElementById('sql-run').click();
      currentTableName = table;
      updateTableListActive();
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
      var html = '<a href="#" id="nav-back" style="color:var(--link);" title="Go back to previous table">&#8592; Back</a>';

      // "Clear path" link: discards the entire trail and hides the breadcrumb
      html += ' | <a href="#" id="nav-clear" class="nav-clear-link" title="Clear navigation trail">Clear path</a>';

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
        var fkLabel = fk ? ' <span class="table-header-fk" title="FK to ' + esc(fk.toTable) + '.' + esc(fk.toColumn) + '">&#8599;</span>' : '';
        var thClass = pinned.indexOf(k) >= 0 ? ' class="col-pinned"' : '';
        html += '<th data-column-key="' + esc(k) + '" draggable="true"' + thClass + ' title="Drag to reorder; right-click for menu">' + esc(k) + fkLabel + '</th>';
      });
      html += '</tr></thead><tbody>';
      var maskOn = isPiiMaskEnabled();
      var piiCols = {};
      visible.forEach(function(k) { piiCols[k] = isPiiColumn(k); });
      filtered.forEach(function(row) {
        html += '<tr>';
        visible.forEach(function(k) {
          var val = row[k];
          var fk = fkMap[k];
          var isNull = val == null;
          var rawStr = isNull ? '' : String(val);
          var displayStr = getDisplayValue(k, val, maskOn, piiCols[k]);
          var cellContent;
          /* Null values render as a dimmed italic "NULL" indicator (industry-standard DB tool convention) */
          if (isNull) {
            cellContent = '<span class="cell-null">NULL</span>';
          } else if (displayFormat === 'formatted' && colTypes && !(maskOn && piiCols[k])) {
            var fmt = formatCellValue(val, k, colTypes[k]);
            if (fmt.wasFormatted) {
              cellContent = '<span title="Raw: ' + esc(fmt.raw) + '">' + esc(fmt.formatted) + '</span>'
                + '<span class="cell-raw">' + esc(fmt.raw) + '</span>';
            } else {
              cellContent = esc(displayStr);
            }
          } else {
            cellContent = esc(displayStr);
          }
          var copyBtn = '<button type="button" class="cell-copy-btn" data-raw="' + esc(displayStr) + '" title="Copy value">&#x2398;</button>';
          var tdClass = pinned.indexOf(k) >= 0 ? ' class="col-pinned"' : '';
          var tdAttrs = ' data-column-key="' + esc(k) + '"' + tdClass;
          /* cell-text wrapper allows CSS truncation with ellipsis while copy button stays visible on hover */
          /* FK link keeps data-value as rawStr so navigation filter uses real key; displayed text is displayStr (masked when on). */
          if (fk && !isNull) {
            html += '<td' + tdAttrs + '><span class="cell-text"><a href="#" class="fk-link" style="color:var(--link);text-decoration:underline;" ';
            html += 'data-table="' + esc(fk.toTable) + '" ';
            html += 'data-column="' + esc(fk.toColumn) + '" ';
            html += 'data-value="' + esc(rawStr) + '">' ;
            html += cellContent + ' &#8594;</a></span>' + copyBtn + '</td>';
          } else {
            html += '<td' + tdAttrs + '><span class="cell-text">' + cellContent + '</span>' + copyBtn + '</td>';
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

    /**
     * Returns count of visible columns (mirrors visibility logic in buildDataTableHtml:
     * order + hidden from columnConfig). Used for the table status bar.
     */
    function getVisibleColumnCount(dataKeys, columnConfig) {
      if (!dataKeys || dataKeys.length === 0) return 0;
      var order = dataKeys.slice();
      var hidden = [];
      if (columnConfig && columnConfig.order && columnConfig.order.length) {
        order = columnConfig.order.filter(function(k) { return dataKeys.indexOf(k) >= 0; });
        dataKeys.forEach(function(k) { if (order.indexOf(k) < 0) order.push(k); });
      }
      if (columnConfig && columnConfig.hidden) hidden = columnConfig.hidden;
      return order.filter(function(k) { return hidden.indexOf(k) < 0; }).length;
    }

    /**
     * Builds the table status bar HTML (row range, total, column count).
     * @param total - Total row count from server (or null if unknown)
     * @param offset - Current offset
     * @param limit - Page size
     * @param displayedLen - Number of rows on current page
     * @param columnCount - Visible column count
     */
    function buildTableStatusBar(total, offset, limit, displayedLen, columnCount) {
      var rangeText = displayedLen > 0
        ? (offset + 1) + '\u2013' + (offset + displayedLen)
        : '0';
      var totalText = total != null ? total.toLocaleString() : '?';
      var colText = (columnCount != null && columnCount > 0) ? (columnCount + ' column' + (columnCount !== 1 ? 's' : '')) : '';
      var parts = ['Showing <span class="table-status-range">' + rangeText + '</span> of ' + totalText + ' rows'];
      if (displayedLen === 0 && total != null && total > 0 && offset >= total) {
        parts.push('(past end of results)');
      }
      if (colText) parts.push(colText);
      return '<div class="table-status-bar" role="status">' + parts.join(' \u2022 ') + '</div>';
    }

    /**
      // Self-contained collapsible: inline onclick toggles the sibling body
      // and swaps the arrow. Mirrors the query builder toggle pattern but
      // needs no external bind function or render-site wiring.
      var toggleJs = "var b=this.nextElementSibling;var c=b.classList.toggle('collapsed');this.textContent=c?'▼ Table definition':'▲ Table definition'";
      return '<div class="table-definition-wrap" role="region" aria-label="Table definition">' +
        '<div class="table-definition-heading" onclick="' + toggleJs + '">▼ Table definition</div>' +
        '<div class="table-definition-body collapsed">' +
        '<div class="table-definition-scroll">' +
        '<table class="table-definition">' +
        '<thead><tr><th scope="col">Column</th><th scope="col">Type</th><th scope="col">Constraints</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div></div></div>';
      if (!t || !t.columns || t.columns.length === 0) return '';
      var rows = t.columns.map(function(c) {
        var flags = [];
        if (c.pk) flags.push('PK');
        if (c.notnull) flags.push('NOT NULL');
        var flagStr = flags.length ? flags.join(', ') : '\u2014';
        var rawType = c.type != null ? String(c.type).trim() : '';
        var typCell = rawType ? esc(rawType) : '<span class="table-def-type-empty">(unspecified)</span>';
        return '<tr><td class="table-def-name">' + esc(c.name) + '</td><td class="table-def-type">' + typCell + '</td><td class="table-def-flags">' + esc(flagStr) + '</td></tr>';
      }).join('');
      return '<div class="table-definition-wrap" role="region" aria-label="Table definition">' +
        '<div class="table-definition-heading">Table definition</div>' +
        '<div class="table-definition-scroll">' +
        '<table class="table-definition">' +
        '<thead><tr><th scope="col">Column</th><th scope="col">Type</th><th scope="col">Constraints</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div></div>';
    }

    function renderTableView(name, data) {
      const content = document.getElementById('content');
      const scope = getScope();
      const filtered = filterRows(data);
      const displayData = getTableDisplayData(data);
      const jsonStr = JSON.stringify(displayData, null, 2);
      lastRenderedData = jsonStr;
      const metaText = rowCountText(name) + buildTableFilterMetaSuffix(filtered.length, data.length);
      // Show/hide display format bar when viewing table data
      var formatBar = document.getElementById('display-format-bar');
      if (formatBar) formatBar.style.display = (scope !== 'schema') ? 'flex' : 'none';
      // Show row display toggle (All / Matching) when viewing a table
      var rowDisplayWrap = document.getElementById('row-display-toggle-wrap');
      if (rowDisplayWrap) {
        rowDisplayWrap.style.display = (scope === 'data' || scope === 'both') ? 'flex' : 'none';
        var allBtn = document.getElementById('row-display-all');
        var matchBtn = document.getElementById('row-display-matching');
        if (allBtn) allBtn.classList.toggle('active', !showOnlyMatchingRows);
        if (matchBtn) matchBtn.classList.toggle('active', showOnlyMatchingRows);
      }
      // Show loading hint while FK metadata is being fetched for the first time
      if (!fkMetaCache[name] && scope !== 'both') {
        content.innerHTML = '<p class="meta">' + metaText + '</p><p class="meta">Loading\u2026</p>';
      }
      function renderDataHtml(fkMap, colTypes) {
        var defHtml = buildTableDefinitionHtml(name);
        var tableHtml = wrapDataTableInScroll(buildDataTableHtml(displayData, fkMap, colTypes, getColumnConfig(name))) + buildTableStatusBar(tableCounts[name], offset, limit, displayData.length, getVisibleColumnCount(Object.keys(displayData[0] || {}), getColumnConfig(name)));
        var qbHtml = buildQueryBuilderHtml(name, colTypes);
        if (scope === 'both') {
          lastRenderedSchema = cachedSchema;
          if (cachedSchema === null) {
            fetch('/api/schema', authOpts()).then(function(r) { return r.text(); }).then(function(schema) {
              cachedSchema = schema;
              lastRenderedSchema = schema;
              content.innerHTML = buildBothViewSectionsHtml(name, metaText, qbHtml, tableHtml, schema, defHtml);
              bindQueryBuilderEvents(colTypes);
              if (queryBuilderState) restoreQueryBuilderUIState(queryBuilderState);
              applySearch();
              renderBreadcrumb();
              bindColumnTableEvents();
            });
          } else {
            var dataSection = document.getElementById('both-data-section');
            if (dataSection) {
              var dataBody = dataSection.querySelector('.collapsible-body');
              var headerEl = dataSection.querySelector('.collapsible-header');
              if (dataBody) dataBody.innerHTML = '<p class="meta">' + metaText + '</p>' + defHtml + qbHtml + tableHtml;
              if (headerEl) headerEl.textContent = 'Table data: ' + name;
              bindColumnTableEvents();
              bindQueryBuilderEvents(colTypes);
              if (queryBuilderState) restoreQueryBuilderUIState(queryBuilderState);
            }
            applySearch();
            renderBreadcrumb();
          }
        } else {
          lastRenderedSchema = null;
          content.innerHTML = '<p class="meta">' + metaText + '</p>' + defHtml + qbHtml + tableHtml;
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

    function getVisibleDataColumnKeys() {
      var ths = document.querySelectorAll('#data-table thead th[data-column-key]');
      return Array.prototype.slice.call(ths).map(function(th) {
        return th.getAttribute('data-column-key') || '';
      });
    }

    function schemaTableByName(name) {
      var meta = schemaMeta;
      if (!meta || !meta.tables || !name) return null;
      for (var i = 0; i < meta.tables.length; i++) {
        if (meta.tables[i].name === name) return meta.tables[i];
      }
      return null;
    }

    function getPkColumnNameForDataTable() {
      var t = schemaTableByName(currentTableName);
      if (!t || !t.columns) return null;
      for (var i = 0; i < t.columns.length; i++) {
        if (t.columns[i].pk) return t.columns[i].name;
      }
      return null;
    }

    function readCellRawFromTd(td) {
      if (!td) return '';
      var btn = td.querySelector('.cell-copy-btn');
      if (btn && btn.hasAttribute('data-raw')) return btn.getAttribute('data-raw') || '';
      if (td.querySelector('.cell-null')) return '';
      return (td.textContent || '').trim();
    }

    function jsonPkValueForCellUpdate(rawStr, pkColName) {
      var t = schemaTableByName(currentTableName);
      var col = null;
      if (t && t.columns) {
        for (var i = 0; i < t.columns.length; i++) {
          if (t.columns[i].name === pkColName) { col = t.columns[i]; break; }
        }
      }
      var typ = (col && col.type || '').toUpperCase();
      if ((typ === 'INTEGER' || typ === 'INT') && /^-?\d+$/.test(String(rawStr))) {
        return parseInt(String(rawStr), 10);
      }
      if ((typ === 'REAL' || typ === 'FLOAT' || typ === 'DOUBLE') && /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(String(rawStr))) {
        return parseFloat(String(rawStr));
      }
      return rawStr === '' ? null : rawStr;
    }

    /** Builds JSON [value] for /api/cell/update; returns '__INVALID__' when client should block empty NOT NULL non-text. */
    function cellUpdateValueJson(inputValue, colMeta) {
      var typ = (colMeta.type || '').toUpperCase();
      var notNull = !!colMeta.notnull;
      var trimmed = (inputValue || '').trim();
      var textLike = typ === '' || typ.indexOf('CHAR') >= 0 || typ.indexOf('CLOB') >= 0 || typ.indexOf('TEXT') >= 0;
      if (trimmed === '') {
        if (!notNull) return null;
        if (textLike) return '';
        return '__INVALID__';
      }
      return inputValue;
    }

    /**
     * Inline cell edit for the browser when driftWriteEnabled (POST /api/cell/update).
     * Requires a primary key and schema metadata.
     */
    function tryStartBrowserCellEdit(td) {
      if (!currentTableName) return;
      loadSchemaMeta().then(function() {
        var pkName = getPkColumnNameForDataTable();
        if (!pkName) {
          window.alert('This table has no primary key column; inline edit is disabled.');
          return;
        }
        var columnKey = td.getAttribute('data-column-key') || '';
        if (!columnKey || columnKey === pkName) {
          window.alert('Primary key columns cannot be edited inline.');
          return;
        }
        var t = schemaTableByName(currentTableName);
        var colMeta = null;
        if (t && t.columns) {
          for (var j = 0; j < t.columns.length; j++) {
            if (t.columns[j].name === columnKey) { colMeta = t.columns[j]; break; }
          }
        }
        if (!colMeta) return;

        var keys = getVisibleDataColumnKeys();
        var colIdx = keys.indexOf(columnKey);
        var pkIdx = keys.indexOf(pkName);
        if (colIdx < 0 || pkIdx < 0) return;
        var tr = td.closest('tr');
        if (!tr || !tr.children[pkIdx]) return;
        var pkRaw = readCellRawFromTd(tr.children[pkIdx]);
        var pkJson = jsonPkValueForCellUpdate(pkRaw, pkName);

        var originalHtml = td.innerHTML;
        var startVal = readCellRawFromTd(td);
        var input = document.createElement('input');
        input.type = 'text';
        input.className = 'cell-inline-editor';
        input.setAttribute('aria-label', 'Edit ' + columnKey);
        input.value = startVal;
        input.style.cssText = 'width:100%;box-sizing:border-box;font:inherit;padding:2px 4px;';
        td.innerHTML = '';
        td.appendChild(input);
        input.focus();
        input.select();

        function restore() {
          td.innerHTML = originalHtml;
        }
        function commit() {
          input.removeEventListener('blur', onBlur);
          var valJson = cellUpdateValueJson(input.value, colMeta);
          if (valJson === '__INVALID__') {
            window.alert('This column is NOT NULL; enter a value or clear only if the column is nullable.');
            restore();
            return;
          }
          fetch('/api/cell/update', authOpts({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              table: currentTableName,
              pkColumn: pkName,
              pkValue: pkJson,
              column: columnKey,
              value: valJson,
            }),
          }))
            .then(function(r) {
              return r.json().then(function(data) { return { ok: r.ok, data: data }; });
            })
            .then(function(res) {
              if (!res.ok || !res.data || res.data.error) {
                var msg = (res.data && res.data.error) ? res.data.error : 'Request failed';
                window.alert('Save failed: ' + msg);
                restore();
                return;
              }
              loadTable(currentTableName);
            })
            .catch(function(err) {
              window.alert('Save failed: ' + (err && err.message ? err.message : String(err)));
              restore();
            });
        }
        function onBlur() {
          commit();
        }
        input.addEventListener('keydown', function(ev) {
          if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); }
          if (ev.key === 'Escape') {
            ev.preventDefault();
            input.removeEventListener('blur', onBlur);
            restore();
          }
        });
        input.addEventListener('blur', onBlur);
      }).catch(function(err) {
        window.alert('Could not load schema: ' + (err && err.message ? err.message : String(err)));
      });
    }

    /**
     * Opens the cell-value popup with full (untruncated) value and column name.
     * When writes are enabled: Shift+double-click opens this popup; plain double-click edits inline.
     * When writes are disabled: double-click always opens this popup.
     */
    function showCellValuePopup(rawValue, columnKey) {
      var popup = document.getElementById('cell-value-popup');
      var textEl = document.getElementById('cell-value-popup-text');
      var titleEl = document.getElementById('cell-value-popup-title');
      if (!popup || !textEl || !titleEl) return;
      titleEl.textContent = columnKey ? 'Cell value: ' + columnKey : 'Cell value';
      textEl.textContent = rawValue !== undefined && rawValue !== null ? String(rawValue) : '';
      popup.classList.add('show');
      popup.setAttribute('aria-hidden', 'false');
    }

    function hideCellValuePopup() {
      var popup = document.getElementById('cell-value-popup');
      if (!popup) return;
      popup.classList.remove('show');
      popup.setAttribute('aria-hidden', 'true');
    }

    document.addEventListener('dblclick', function(e) {
      var td = e.target.closest('#data-table td');
      if (!td) return;
      if (driftWriteEnabled && !e.shiftKey && !td.querySelector('input.cell-inline-editor')) {
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

    (function setupCellValuePopupButtons() {
      var popup = document.getElementById('cell-value-popup');
      var copyBtn = document.getElementById('cell-value-popup-copy');
      var closeBtn = document.getElementById('cell-value-popup-close');
      var textEl = document.getElementById('cell-value-popup-text');
      if (!popup || !copyBtn || !closeBtn || !textEl) return;
      copyBtn.addEventListener('click', function() {
        copyCellValue(textEl.textContent || '');
      });
      closeBtn.addEventListener('click', hideCellValuePopup);
      popup.addEventListener('click', function(e) {
        if (e.target === popup) hideCellValuePopup();
      });
      document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && popup.classList.contains('show')) hideCellValuePopup();
      });
    })();

    function rowCountText(name) {
      const total = tableCounts[name];
      const len = (currentTableJson && currentTableJson.length) || 0;
      if (total == null) return esc(name) + ' (up to ' + limit + ' rows)';
      const rangeText = len > 0 ? ('showing ' + (offset + 1) + '–' + (offset + len)) : 'no rows in this range';
      return esc(name) + ' (' + total + ' row' + (total !== 1 ? 's' : '') + '; ' + rangeText + ')';
    }

    /** Updates which table link has .active in the sidebar (UI redesign: current table highlight). */
    function updateTableListActive() {
      var name = currentTableName;
      var ul = document.getElementById('tables');
      if (!ul) return;
      var targetHash = name ? '#' + encodeURIComponent(name) : '';
      ul.querySelectorAll('a.table-link').forEach(function(a) {
        a.classList.toggle('active', a.getAttribute('href') === targetHash);
      });
    }

    function loadTable(name) {
      if (currentTableName && currentTableName !== name) {
        saveTableState(currentTableName);
      }
      var isNewTable = (currentTableName !== name);
      currentTableName = name;
      updateTableListActive();
      // Keep Search tab dropdown in sync with the sidebar table selection
      if (typeof window._stSyncTable === 'function') window._stSyncTable(name);
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
              updatePaginationBar(o.count);
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
      // Cache for re-renders triggered by pin/unpin toggle
      lastKnownTables = tables;

      const ul = document.getElementById('tables');
      if (!ul) return;
      ul.innerHTML = '';

      // Prune stale pinned entries for tables that no longer exist in the
      // database (e.g. after a table is dropped or renamed).
      var pinnedArr = getPinnedTables();
      var tableSet = new Set(tables);
      var cleaned = pinnedArr.filter(function(t) { return tableSet.has(t); });
      if (cleaned.length !== pinnedArr.length) setPinnedTables(cleaned);

      // Sort pinned tables to the top, preserving original order within
      // each group (pinned vs unpinned). Uses a Set for O(1) lookups.
      var pinnedSet = new Set(cleaned);
      var sorted = tables.slice().sort(function(a, b) {
        return (pinnedSet.has(a) ? 0 : 1) - (pinnedSet.has(b) ? 0 : 1);
      });

      sorted.forEach(function(t) {
        var isPinned = pinnedSet.has(t);
        var li = document.createElement('li');
        var a = document.createElement('a');
        a.href = '#' + encodeURIComponent(t);
        a.className = 'table-link' + (t === currentTableName ? ' active' : '');
        a.setAttribute('data-table', t);

        // Table name + optional count in a separate span (grey, right-aligned)
        // so the pin button and ellipsis on long names stay correct.
        var nameSpan = document.createElement('span');
        nameSpan.className = 'table-link-name';
        nameSpan.textContent = t;
        a.appendChild(nameSpan);
        if (tableCounts[t] != null) {
          var countSpan = document.createElement('span');
          countSpan.className = 'table-link-count';
          countSpan.textContent = '(' + formatTableRowCountDisplay(tableCounts[t]) + ')';
          a.appendChild(countSpan);
        }

        // Pin/unpin button with Material Symbols push_pin icon
        var pinBtn = document.createElement('button');
        pinBtn.type = 'button';
        pinBtn.className = 'table-pin-btn' + (isPinned ? ' pinned' : '');
        pinBtn.title = isPinned ? 'Unpin' : 'Pin to top';
        pinBtn.setAttribute('aria-pressed', isPinned ? 'true' : 'false');
        var pinIcon = document.createElement('span');
        pinIcon.className = 'material-symbols-outlined';
        pinIcon.setAttribute('aria-hidden', 'true');
        pinIcon.textContent = 'push_pin';
        pinBtn.appendChild(pinIcon);
        // Stop click from propagating to the <a> link
        pinBtn.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          togglePinTable(t);
        });
        a.appendChild(pinBtn);

        // Open the table in its own closeable tab (or switch to it if already open)
        a.addEventListener('click', function(e) { e.preventDefault(); openTableTab(t); });
        li.appendChild(a);
        ul.appendChild(li);
      });
      const sqlTableSel = document.getElementById('sql-table');
      if (sqlTableSel) {
        sqlTableSel.innerHTML = '<option value="">—</option>' + tables.map(t => '<option value="' + esc(t) + '">' + esc(t) + '</option>').join('');
      }
      const importTableSel = document.getElementById('import-table');
      if (importTableSel) {
        importTableSel.innerHTML = tables.map(t => '<option value="' + esc(t) + '">' + esc(t) + (tableCounts[t] != null ? ' (' + esc(formatTableRowCountDisplay(tableCounts[t])) + ')' : '') + '</option>').join('');
      }
      // Populate the Search tab's table dropdown
      if (typeof window._stPopulateTables === 'function') window._stPopulateTables(tables);

      // Update the browse-all grid in the Tables tab panel
      renderTablesBrowse(tables);
    }

    // --- Chart rendering (pure SVG, no dependencies). BUG-008: responsive, axis labels, export, title. ---
    var CHART_COLORS = [
      '#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f',
      '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac'
    ];

    /** Returns { w, h } for the chart wrapper; used for responsive sizing. */
    function getChartSize() {
      var wrap = document.getElementById('chart-wrapper');
      if (!wrap) return { w: 600, h: 320 };
      var w = wrap.clientWidth || 600;
      var h = Math.max(320, wrap.clientHeight || 320);
      return { w: w, h: h };
    }

    /** Shows chart container, sets optional title/description, and shows export toolbar. Call after rendering SVG into #chart-svg-wrap. */
    function applyChartUI(title, description) {
      var container = document.getElementById('chart-container');
      if (!container) return;
      var titleEl = document.getElementById('chart-title');
      var descEl = document.getElementById('chart-description');
      var exportBar = document.getElementById('chart-export-toolbar');
      container.style.display = 'block';
      if (titleEl) {
        if (title && title.trim()) {
          titleEl.textContent = title.trim();
          titleEl.style.display = 'block';
        } else {
          titleEl.style.display = 'none';
        }
      }
      if (descEl) {
        if (description && description.trim()) {
          descEl.textContent = description.trim();
          descEl.style.display = 'block';
        } else {
          descEl.style.display = 'none';
        }
      }
      if (exportBar) exportBar.style.display = 'flex';
    }

    function renderBarChart(container, data, xKey, yKey, opts) {
      opts = opts || {};
      var size = getChartSize();
      var W = size.w, H = size.h, PAD = 56;
      var xLabel = opts.xLabel != null ? opts.xLabel : xKey;
      var yLabel = opts.yLabel != null ? opts.yLabel : yKey;
      var vals = data.map(function(d) { return Number(d[yKey]) || 0; });
      var maxVal = Math.max.apply(null, vals.concat([1]));
      var barW = Math.max(4, (W - PAD * 2) / data.length - 2);
      var plotH = H - PAD * 2;
      var svg = '<svg class="chart-svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">';
      svg += '<line class="chart-axis" x1="' + PAD + '" y1="' + (H - PAD) + '" x2="' + (W - PAD) + '" y2="' + (H - PAD) + '"/>';
      svg += '<line class="chart-axis" x1="' + PAD + '" y1="' + PAD + '" x2="' + PAD + '" y2="' + (H - PAD) + '"/>';
      for (var i = 0; i <= 4; i++) {
        var v = (maxVal / 4 * i).toFixed(maxVal > 100 ? 0 : 1);
        var y = H - PAD - (i / 4) * plotH;
        svg += '<text class="chart-axis-label" x="' + (PAD - 6) + '" y="' + (y + 4) + '" text-anchor="end">' + esc(v) + '</text>';
      }
      data.forEach(function(d, i) {
        var val = Number(d[yKey]) || 0;
        var bh = (val / maxVal) * plotH;
        var x = PAD + i * (barW + 2);
        var by = H - PAD - bh;
        svg += '<rect class="chart-bar" x="' + x + '" y="' + by + '" width="' + barW + '" height="' + bh + '">';
        svg += '<title>' + esc(String(d[xKey])) + ': ' + val + '</title></rect>';
        if (data.length <= 20) {
          svg += '<text class="chart-label" x="' + (x + barW / 2) + '" y="' + (H - PAD + 16) + '" text-anchor="middle" transform="rotate(-45,' + (x + barW / 2) + ',' + (H - PAD + 16) + ')">' + esc(String(d[xKey]).slice(0, 12)) + '</text>';
        }
      });
      svg += '<text class="chart-axis-title chart-axis-y" x="12" y="' + (H / 2) + '" text-anchor="middle" transform="rotate(-90, 12, ' + (H / 2) + ')">' + esc(yLabel) + '</text>';
      svg += '<text class="chart-axis-title chart-axis-x" x="' + (W / 2) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(xLabel) + '</text>';
      svg += '</svg>';
      container.innerHTML = svg;
      applyChartUI(opts.title, opts.description);
    }

    /** Stacked bar: group by xKey, stack segment heights per group. */
    function renderStackedBarChart(container, data, xKey, yKey, opts) {
      opts = opts || {};
      var size = getChartSize();
      var W = size.w, H = size.h, PAD = 56;
      var xLabel = opts.xLabel != null ? opts.xLabel : xKey;
      var yLabel = opts.yLabel != null ? opts.yLabel : yKey;
      var groups = {};
      data.forEach(function(d) {
        var k = String(d[xKey]);
        if (!groups[k]) groups[k] = [];
        groups[k].push(Number(d[yKey]) || 0);
      });
      var labels = Object.keys(groups);
      var sums = labels.map(function(k) {
        return groups[k].reduce(function(a, b) { return a + b; }, 0);
      });
      var maxVal = Math.max.apply(null, sums.concat([1]));
      var barW = Math.max(8, (W - PAD * 2) / labels.length - 4);
      var plotH = H - PAD * 2;
      var svg = '<svg class="chart-svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">';
      svg += '<line class="chart-axis" x1="' + PAD + '" y1="' + (H - PAD) + '" x2="' + (W - PAD) + '" y2="' + (H - PAD) + '"/>';
      svg += '<line class="chart-axis" x1="' + PAD + '" y1="' + PAD + '" x2="' + PAD + '" y2="' + (H - PAD) + '"/>';
      for (var i = 0; i <= 4; i++) {
        var v = (maxVal / 4 * i).toFixed(maxVal > 100 ? 0 : 1);
        var y = H - PAD - (i / 4) * plotH;
        svg += '<text class="chart-axis-label" x="' + (PAD - 6) + '" y="' + (y + 4) + '" text-anchor="end">' + esc(v) + '</text>';
      }
      labels.forEach(function(label, gi) {
        var segs = groups[label];
        var x = PAD + gi * (barW + 4) + 2;
        var accY = H - PAD;
        segs.forEach(function(val, si) {
          var bh = (val / maxVal) * plotH;
          var by = accY - bh;
          var color = CHART_COLORS[si % CHART_COLORS.length];
          svg += '<rect class="chart-bar chart-stacked-segment" x="' + x + '" y="' + by + '" width="' + barW + '" height="' + bh + '" fill="' + color + '">';
          svg += '<title>' + esc(label) + ' segment ' + (si + 1) + ': ' + val + '</title></rect>';
          accY = by;
        });
        if (labels.length <= 20) {
          svg += '<text class="chart-label" x="' + (x + barW / 2) + '" y="' + (H - PAD + 16) + '" text-anchor="middle" transform="rotate(-45,' + (x + barW / 2) + ',' + (H - PAD + 16) + ')">' + esc(String(label).slice(0, 10)) + '</text>';
        }
      });
      svg += '<text class="chart-axis-title chart-axis-y" x="12" y="' + (H / 2) + '" text-anchor="middle" transform="rotate(-90, 12, ' + (H / 2) + ')">' + esc(yLabel) + '</text>';
      svg += '<text class="chart-axis-title chart-axis-x" x="' + (W / 2) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(xLabel) + '</text>';
      svg += '</svg>';
      container.innerHTML = svg;
      applyChartUI(opts.title, opts.description);
    }

    function renderPieChart(container, data, labelKey, valueKey, opts) {
      opts = opts || {};
      var size = getChartSize();
      var W = size.w, H = size.h, R = Math.min(130, (Math.min(W, H) / 2) - 60), CX = Math.min(200, W / 2 - 40), CY = H / 2;
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
      var svg = '<svg class="chart-svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">';
      var angle = 0;
      significant.forEach(function(d, i) {
        var sweep = (d.value / total) * 2 * Math.PI;
        var color = CHART_COLORS[i % CHART_COLORS.length];
        var pct = (d.value / total * 100).toFixed(1);
        var tip = '<title>' + esc(String(d.label)) + ': ' + d.value + ' (' + pct + '%)</title>';
        if (sweep >= 2 * Math.PI - 0.001) {
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
      var lx = CX + R + 24;
      significant.forEach(function(d, i) {
        var ly = 24 + i * 20;
        var color = CHART_COLORS[i % CHART_COLORS.length];
        svg += '<rect x="' + lx + '" y="' + (ly - 10) + '" width="12" height="12" fill="' + color + '"/>';
        svg += '<text class="chart-legend" x="' + (lx + 18) + '" y="' + ly + '">' + esc(String(d.label).slice(0, 24)) + ' (' + d.value + ')</text>';
      });
      svg += '</svg>';
      container.innerHTML = svg;
      applyChartUI(opts.title, opts.description);
    }

    function renderLineChart(container, data, xKey, yKey, opts) {
      opts = opts || {};
      var size = getChartSize();
      var W = size.w, H = size.h, PAD = 56;
      var xLabel = opts.xLabel != null ? opts.xLabel : xKey;
      var yLabel = opts.yLabel != null ? opts.yLabel : yKey;
      var vals = data.map(function(d) { return Number(d[yKey]) || 0; });
      var maxVal = Math.max.apply(null, vals.concat([1]));
      var minVal = Math.min.apply(null, vals.concat([0]));
      var range = maxVal - minVal || 1;
      var stepX = (W - PAD * 2) / Math.max(data.length - 1, 1);
      var plotH = H - PAD * 2;
      var svg = '<svg class="chart-svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">';
      svg += '<line class="chart-axis" x1="' + PAD + '" y1="' + (H - PAD) + '" x2="' + (W - PAD) + '" y2="' + (H - PAD) + '"/>';
      svg += '<line class="chart-axis" x1="' + PAD + '" y1="' + PAD + '" x2="' + PAD + '" y2="' + (H - PAD) + '"/>';
      for (var i = 0; i <= 4; i++) {
        var v = (minVal + range * i / 4).toFixed(range > 100 ? 0 : 1);
        var y = H - PAD - (i / 4) * plotH;
        svg += '<text class="chart-axis-label" x="' + (PAD - 6) + '" y="' + (y + 4) + '" text-anchor="end">' + esc(v) + '</text>';
      }
      var points = data.map(function(d, i) {
        var x = PAD + i * stepX;
        var y = H - PAD - ((Number(d[yKey]) || 0) - minVal) / range * plotH;
        return x + ',' + y;
      });
      svg += '<polyline class="chart-line" points="' + points.join(' ') + '"/>';
      data.forEach(function(d, i) {
        var x = PAD + i * stepX;
        var y = H - PAD - ((Number(d[yKey]) || 0) - minVal) / range * plotH;
        svg += '<circle class="chart-dot" cx="' + x + '" cy="' + y + '" r="4"><title>' + esc(String(d[xKey])) + ': ' + d[yKey] + '</title></circle>';
      });
      svg += '<text class="chart-axis-title chart-axis-y" x="12" y="' + (H / 2) + '" text-anchor="middle" transform="rotate(-90, 12, ' + (H / 2) + ')">' + esc(yLabel) + '</text>';
      svg += '<text class="chart-axis-title chart-axis-x" x="' + (W / 2) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(xLabel) + '</text>';
      svg += '</svg>';
      container.innerHTML = svg;
      applyChartUI(opts.title, opts.description);
    }

    /** Area chart: filled region under the line (no line stroke by default for clarity). */
    function renderAreaChart(container, data, xKey, yKey, opts) {
      opts = opts || {};
      var size = getChartSize();
      var W = size.w, H = size.h, PAD = 56;
      var xLabel = opts.xLabel != null ? opts.xLabel : xKey;
      var yLabel = opts.yLabel != null ? opts.yLabel : yKey;
      var vals = data.map(function(d) { return Number(d[yKey]) || 0; });
      var maxVal = Math.max.apply(null, vals.concat([1]));
      var minVal = Math.min.apply(null, vals.concat([0]));
      var range = maxVal - minVal || 1;
      var stepX = (W - PAD * 2) / Math.max(data.length - 1, 1);
      var plotH = H - PAD * 2;
      var points = data.map(function(d, i) {
        var x = PAD + i * stepX;
        var y = H - PAD - ((Number(d[yKey]) || 0) - minVal) / range * plotH;
        return x + ',' + y;
      });
      var areaPoints = PAD + ',' + (H - PAD) + ' ' + points.join(' ') + ' ' + (PAD + (data.length - 1) * stepX) + ',' + (H - PAD);
      var svg = '<svg class="chart-svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">';
      svg += '<line class="chart-axis" x1="' + PAD + '" y1="' + (H - PAD) + '" x2="' + (W - PAD) + '" y2="' + (H - PAD) + '"/>';
      svg += '<line class="chart-axis" x1="' + PAD + '" y1="' + PAD + '" x2="' + PAD + '" y2="' + (H - PAD) + '"/>';
      for (var i = 0; i <= 4; i++) {
        var v = (minVal + range * i / 4).toFixed(range > 100 ? 0 : 1);
        var y = H - PAD - (i / 4) * plotH;
        svg += '<text class="chart-axis-label" x="' + (PAD - 6) + '" y="' + (y + 4) + '" text-anchor="end">' + esc(v) + '</text>';
      }
      svg += '<polygon class="chart-area" points="' + areaPoints + '"/>';
      svg += '<polyline class="chart-line" points="' + points.join(' ') + '"/>';
      data.forEach(function(d, i) {
        var x = PAD + i * stepX;
        var y = H - PAD - ((Number(d[yKey]) || 0) - minVal) / range * plotH;
        svg += '<circle class="chart-dot" cx="' + x + '" cy="' + y + '" r="3"><title>' + esc(String(d[xKey])) + ': ' + d[yKey] + '</title></circle>';
      });
      svg += '<text class="chart-axis-title chart-axis-y" x="12" y="' + (H / 2) + '" text-anchor="middle" transform="rotate(-90, 12, ' + (H / 2) + ')">' + esc(yLabel) + '</text>';
      svg += '<text class="chart-axis-title chart-axis-x" x="' + (W / 2) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(xLabel) + '</text>';
      svg += '</svg>';
      container.innerHTML = svg;
      applyChartUI(opts.title, opts.description);
    }

    /** Scatter plot: X and Y must be numeric; two numeric axes with labels. */
    function renderScatterChart(container, data, xKey, yKey, opts) {
      opts = opts || {};
      var size = getChartSize();
      var W = size.w, H = size.h, PAD = 56;
      var xLabel = opts.xLabel != null ? opts.xLabel : xKey;
      var yLabel = opts.yLabel != null ? opts.yLabel : yKey;
      var xs = data.map(function(d) { return Number(d[xKey]); }).filter(function(v) { return isFinite(v); });
      var ys = data.map(function(d) { return Number(d[yKey]); }).filter(function(v) { return isFinite(v); });
      if (xs.length === 0 || ys.length === 0) {
        container.innerHTML = '<p class="meta">Scatter requires numeric X and Y columns.</p>';
        document.getElementById('chart-container').style.display = 'block';
        var exportBar = document.getElementById('chart-export-toolbar');
        if (exportBar) exportBar.style.display = 'none';
        return;
      }
      var minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs), rangeX = maxX - minX || 1;
      var minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys), rangeY = maxY - minY || 1;
      var plotW = W - PAD * 2, plotH = H - PAD * 2;
      var svg = '<svg class="chart-svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">';
      svg += '<line class="chart-axis" x1="' + PAD + '" y1="' + (H - PAD) + '" x2="' + (W - PAD) + '" y2="' + (H - PAD) + '"/>';
      svg += '<line class="chart-axis" x1="' + PAD + '" y1="' + PAD + '" x2="' + PAD + '" y2="' + (H - PAD) + '"/>';
      for (var i = 0; i <= 4; i++) {
        var vx = (minX + rangeX * i / 4).toFixed(rangeX > 100 ? 0 : 1);
        var vy = (minY + rangeY * i / 4).toFixed(rangeY > 100 ? 0 : 1);
        var x = PAD + (i / 4) * plotW;
        var y = H - PAD - (i / 4) * plotH;
        svg += '<text class="chart-axis-label" x="' + (x + (i === 0 ? -6 : 0)) + '" y="' + (H - PAD + 16) + '" text-anchor="' + (i === 0 ? 'end' : 'middle') + '">' + esc(vx) + '</text>';
        svg += '<text class="chart-axis-label" x="' + (PAD - 6) + '" y="' + (y + 4) + '" text-anchor="end">' + esc(vy) + '</text>';
      }
      data.forEach(function(d, i) {
        var nx = (Number(d[xKey]) - minX) / rangeX;
        var ny = (Number(d[yKey]) - minY) / rangeY;
        if (!isFinite(nx) || !isFinite(ny)) return;
        var x = PAD + nx * plotW;
        var y = H - PAD - ny * plotH;
        var color = CHART_COLORS[i % CHART_COLORS.length];
        svg += '<circle class="chart-dot chart-scatter-dot" cx="' + x + '" cy="' + y + '" r="5" fill="' + color + '"><title>' + esc(String(d[xKey])) + ', ' + d[yKey] + '</title></circle>';
      });
      svg += '<text class="chart-axis-title chart-axis-y" x="12" y="' + (H / 2) + '" text-anchor="middle" transform="rotate(-90, 12, ' + (H / 2) + ')">' + esc(yLabel) + '</text>';
      svg += '<text class="chart-axis-title chart-axis-x" x="' + (W / 2) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(xLabel) + '</text>';
      svg += '</svg>';
      container.innerHTML = svg;
      applyChartUI(opts.title, opts.description);
    }

    function renderHistogram(container, data, valueKey, bins, opts) {
      opts = opts || {};
      bins = bins || 10;
      var vals = data.map(function(d) { return Number(d[valueKey]); }).filter(function(v) { return isFinite(v); });
      if (vals.length === 0) {
        container.innerHTML = '<p class="meta">No numeric data.</p>';
        document.getElementById('chart-container').style.display = 'block';
        var exportBar = document.getElementById('chart-export-toolbar');
        if (exportBar) exportBar.style.display = 'none';
        return;
      }
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
      renderBarChart(container, histData, 'label', 'value', { title: opts.title, description: opts.description, xLabel: 'Bin', yLabel: 'Count' });
    }

    /** Last render state for resize re-run and export. */
    var lastChartState = null;

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
        lastChartState = null;
        return;
      }
      var chartData = rows;
      if (rows.length > 500) {
        var nth = Math.ceil(rows.length / 500);
        chartData = rows.filter(function(_, i) { return i % nth === 0; });
      }
      var opts = { title: title, description: '', xLabel: xKey, yLabel: yKey };
      lastChartState = { type: type, xKey: xKey, yKey: yKey, data: chartData, opts: opts };

      if (type === 'bar') renderBarChart(container, chartData, xKey, yKey, opts);
      else if (type === 'stacked-bar') renderStackedBarChart(container, chartData, xKey, yKey, opts);
      else if (type === 'pie') renderPieChart(container, chartData, xKey, yKey, opts);
      else if (type === 'line') renderLineChart(container, chartData, xKey, yKey, opts);
      else if (type === 'area') renderAreaChart(container, chartData, xKey, yKey, opts);
      else if (type === 'scatter') renderScatterChart(container, chartData, xKey, yKey, opts);
      else if (type === 'histogram') renderHistogram(container, chartData, yKey, 10, opts);
    });

    /** Export chart as PNG: serialize SVG to image, draw to canvas, download. Disables button during async export. */
    function exportChartPng() {
      var wrap = document.getElementById('chart-svg-wrap');
      var svgEl = wrap ? wrap.querySelector('svg') : null;
      var btn = document.getElementById('chart-export-png');
      if (!svgEl) return;
      if (btn) btn.disabled = true;
      var svgStr = new XMLSerializer().serializeToString(svgEl);
      var blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var img = new Image();
      function done() { if (btn) btn.disabled = false; }
      img.onload = function() {
        var c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        var ctx = c.getContext('2d');
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg') || '#fff';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0);
        c.toBlob(function(blob) {
          URL.revokeObjectURL(url);
          var a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'chart.png';
          a.click();
          URL.revokeObjectURL(a.href);
          done();
        }, 'image/png');
      };
      img.onerror = function() { URL.revokeObjectURL(url); done(); };
      img.src = url;
    }

    /** Export chart as SVG file download. */
    function exportChartSvg() {
      var wrap = document.getElementById('chart-svg-wrap');
      var svgEl = wrap ? wrap.querySelector('svg') : null;
      if (!svgEl) return;
      var svgStr = new XMLSerializer().serializeToString(svgEl);
      var blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'chart.svg';
      a.click();
      URL.revokeObjectURL(a.href);
    }

    /** Copy chart image to clipboard (PNG). Disables button during async copy; shows brief "Copied!" feedback. */
    function exportChartCopy() {
      var wrap = document.getElementById('chart-svg-wrap');
      var svgEl = wrap ? wrap.querySelector('svg') : null;
      var btn = document.getElementById('chart-export-copy');
      if (!svgEl) return;
      if (btn) btn.disabled = true;
      var svgStr = new XMLSerializer().serializeToString(svgEl);
      var blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var img = new Image();
      function done() { if (btn) btn.disabled = false; }
      img.onload = function() {
        var c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        var ctx = c.getContext('2d');
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg') || '#fff';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0);
        c.toBlob(function(blob) {
          URL.revokeObjectURL(url);
          if (navigator.clipboard && navigator.clipboard.write) {
            var copyBtn = btn;
            navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).then(function() {
              if (copyBtn) { copyBtn.textContent = 'Copied!'; setTimeout(function() { copyBtn.textContent = 'Copy image'; }, 1500); }
            }).catch(function() {}).finally(done);
          } else { done(); }
        }, 'image/png');
      };
      img.onerror = function() { URL.revokeObjectURL(url); done(); };
      img.src = url;
    }

    document.getElementById('chart-export-png').addEventListener('click', exportChartPng);
    document.getElementById('chart-export-svg').addEventListener('click', exportChartSvg);
    document.getElementById('chart-export-copy').addEventListener('click', exportChartCopy);

    /** Responsive: re-render chart when wrapper is resized. Throttled to avoid excessive redraws. */
    var chartResizeObserver = null;
    (function setupChartResize() {
      var wrap = document.getElementById('chart-wrapper');
      if (!wrap) return;
      var resizeTimer = null;
      var THROTTLE_MS = 150;
      function redrawChart() {
        if (!lastChartState) return;
        var container = document.getElementById('chart-svg-wrap');
        if (!container || !container.querySelector('svg')) return;
        var s = lastChartState;
        if (s.type === 'bar') renderBarChart(container, s.data, s.xKey, s.yKey, s.opts);
        else if (s.type === 'stacked-bar') renderStackedBarChart(container, s.data, s.xKey, s.yKey, s.opts);
        else if (s.type === 'pie') renderPieChart(container, s.data, s.xKey, s.yKey, s.opts);
        else if (s.type === 'line') renderLineChart(container, s.data, s.xKey, s.yKey, s.opts);
        else if (s.type === 'area') renderAreaChart(container, s.data, s.xKey, s.yKey, s.opts);
        else if (s.type === 'scatter') renderScatterChart(container, s.data, s.xKey, s.yKey, s.opts);
        else if (s.type === 'histogram') renderHistogram(container, s.data, s.yKey, 10, s.opts);
      }
      chartResizeObserver = new ResizeObserver(function() {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function() {
          resizeTimer = null;
          redrawChart();
        }, THROTTLE_MS);
      });
      chartResizeObserver.observe(wrap);
    })();

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
      /** Client-side pagination for SQL result table: full row set and current page index. */
      let sqlResultAllRows = [];
      let sqlResultPage = 0;
      const SQL_RESULT_PAGE_SIZE = 100;
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
        syncFeatureCardExpanded(collapsible);
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

      /** Renders the current page of SQL result table from in-memory sqlResultAllRows. */
      function renderSqlResultPage() {
        const rows = sqlResultAllRows;
        const pageSize = SQL_RESULT_PAGE_SIZE;
        const start = sqlResultPage * pageSize;
        const pageRows = rows.slice(start, start + pageSize);
        const keys = rows.length > 0 ? Object.keys(rows[0]) : [];
        const total = rows.length;
        let tableHtml = '<div class="data-table-scroll-wrap"><table><thead><tr>' + keys.map(function(k) { return '<th>' + esc(k) + '</th>'; }).join('') + '</tr></thead><tbody>';
        pageRows.forEach(function(row) {
          tableHtml += '<tr>' + keys.map(function(k) { return '<td>' + esc(row[k] != null ? String(row[k]) : '') + '</td>'; }).join('') + '</tr>';
        });
        tableHtml += '</tbody></table></div>';
        const statusHtml = buildTableStatusBar(total, start, pageSize, pageRows.length, keys.length);
        const prevDisabled = sqlResultPage <= 0;
        const nextDisabled = (start + pageSize) >= total;
        const paginationHtml = '<div class="sql-result-pagination toolbar" style="margin-top:0.35rem;">' +
          '<button type="button" id="sql-result-prev"' + (prevDisabled ? ' disabled' : '') + '>Prev</button>' +
          '<button type="button" id="sql-result-next"' + (nextDisabled ? ' disabled' : '') + '>Next</button>' +
          '</div>';
        resultEl.innerHTML = '<p class="meta">' + total + ' row(s)</p>' + tableHtml + statusHtml + paginationHtml;
        const prevBtn = resultEl.querySelector('#sql-result-prev');
        const nextBtn = resultEl.querySelector('#sql-result-next');
        if (prevBtn) prevBtn.addEventListener('click', function() { sqlResultPage--; renderSqlResultPage(); });
        if (nextBtn) nextBtn.addEventListener('click', function() { sqlResultPage++; renderSqlResultPage(); });
      }

      // Shared: clear previous results and hide chart controls before any SQL operation.
      function clearSqlResults() {
        errorEl.style.display = 'none';
        resultEl.style.display = 'none';
        resultEl.innerHTML = '';
        sqlResultAllRows = [];
        sqlResultPage = 0;
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
          setButtonBusy(runBtn, true, 'Running\u2026');
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
                sqlResultAllRows = rows;
                sqlResultPage = 0;
                renderSqlResultPage();
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
              setButtonBusy(runBtn, false, runBtnOrigText);
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
          setButtonBusy(explainBtn, true, 'Explaining\u2026');
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
              var hasScan = false;
              var scanTable = null;
              var hasIndex = false;
              // Single plain-English message: interpret SQLite EXPLAIN detail (SCAN = full table scan, SEARCH/USING INDEX = index lookup).
              rows.forEach(function(r) {
                var d = String(r.detail || '').trim();
                if (/\bSCAN\s+(?:TABLE\s+)?([^\s\n]+)/i.test(d)) {
                  hasScan = true;
                  if (scanTable == null) {
                    var m = d.match(/\bSCAN\s+(?:TABLE\s+)?([^\s\n]+)/i);
                    if (m) scanTable = m[1];
                  }
                } else if (/\bSEARCH\b.*\bINDEX\b/.test(d) || /\bUSING\b.*\bINDEX\b/.test(d)) hasIndex = true;
              });
              var msg;
              if (hasScan) {
                msg = 'This query reads every row of ' + (scanTable ? '<strong>' + esc(scanTable) + '</strong>' : 'the table') + '. ';
                msg += 'For large tables, add a WHERE on an indexed column or create an index.';
              } else if (hasIndex) {
                msg = 'This query uses an index for efficient lookup.';
              } else {
                msg = rows.length ? 'Plan: ' + esc(String(rows[0].detail || '').trim() || '—') : 'No plan.';
              }
              let html = '<p class="meta" style="line-height:1.5;">' + (hasScan ? '<span style="color:#e57373;">' + msg + '</span>' : (hasIndex ? '<span style="color:#81c784;">' + msg + '</span>' : msg)) + '</p>';
              resultEl.innerHTML = html;
              resultEl.style.display = 'block';
            })
            .catch(e => {
              errorEl.textContent = e.message || String(e);
              errorEl.style.display = 'block';
            })
            .finally(() => {
              setSqlButtonsDisabled(false);
              setButtonBusy(explainBtn, false, explainOrigText);
            });
        });
      }

      // Deep link: ?sql=... (e.g. from Saropa Log Capture SQL history) opens Run SQL tab and pre-fills the editor.
      (function applySqlFromQueryString() {
        try {
          var params = new URLSearchParams(location.search);
          var sqlParam = params.get('sql');
          if (!sqlParam || !inputEl) return;
          var decoded = sqlParam;
          try { decoded = decodeURIComponent(sqlParam); } catch (e2) { /* use raw */ }
          inputEl.value = decoded;
          switchTab('sql');
          if (collapsible) {
            collapsible.classList.remove('collapsed');
            syncFeatureCardExpanded(collapsible);
          }
          try {
            var u = new URL(location.href);
            u.searchParams.delete('sql');
            history.replaceState(null, '', u.pathname + u.search + u.hash);
          } catch (e3) { /* ignore */ }
        } catch (e) { /* ignore */ }
      })();
    })();

    // Shared: render table list using counts from the /api/tables response.
    // The server includes all counts inline (via the change-detection UNION
    // ALL query), eliminating N individual /api/table/<name>/count fetches
    // that previously caused massive "Drift: Sent" console spam.
    //
    // Returns the extracted tables array so callers can use it directly
    // (e.g., for tab-closing or nav history validation) without
    // re-extracting from the response object.
    //
    // @param {Object|Array} data — { tables: [...], counts: {...} } from the
    //   server, or a plain array for backward compatibility.
    // @returns {Array<string>} the table names array.
    function applyTableListAndCounts(data) {
      // Extract tables array and counts map from the
      // response object. Graceful fallback for plain
      // array format (should not occur in practice).
      var tables = Array.isArray(data) ? data : ((data && data.tables) || []);
      var counts = (data && data.counts) ? data.counts : {};

      // Merge server-provided counts into the local
      // tableCounts cache so renderTableList can display
      // them immediately without additional fetches.
      Object.keys(counts).forEach(function(t) {
        tableCounts[t] = counts[t];

        // Update Search tab dropdown label with count
        if (typeof window._stUpdateCount === 'function') window._stUpdateCount(t, counts[t]);
      });

      // Render the sidebar list, browse cards, and
      // dropdowns. renderTableList reads from tableCounts
      // to display comma-separated counts (no "rows" suffix).
      renderTableList(tables);
      return tables;
    }
    function refreshOnGenerationChange() {
      if (refreshInFlight) return;
      refreshInFlight = true;
      // Show transient busy state while refreshing — only when connected,
      // to avoid overwriting the Offline indicator during a stale refresh.
      if (window.mastheadStatus && connectionState === 'connected') window.mastheadStatus.setBusy();
      fetch('/api/tables', authOpts())
        .then(function(r) { return r.json(); })
        .then(function(data) {
          // applyTableListAndCounts returns the extracted
          // tables array so we can reuse it for tab cleanup
          // and current-table reload below.
          var tables = applyTableListAndCounts(data);

          // Close tabs for tables that no longer exist (e.g. dropped/renamed).
          // Iterate a copy since closeToolTab mutates the openTableTabs array.
          openTableTabs.slice().forEach(function(name) {
            if (tables.indexOf(name) < 0) closeToolTab('tbl:' + name);
          });

          // Reload the current table only if it still exists and we're on a table tab
          if (currentTableName && tables.indexOf(currentTableName) >= 0) {
            loadTable(currentTableName);
          }
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
    // --- Connection status: Online / Paused / Offline ---
    // DOM updates and labels are owned by masthead.js (window.mastheadStatus).
    // app.js owns the polling state and toggle POST; masthead.js owns display.
    var pollingEnabled = true;

    // Read initial state from server on page load.
    fetch('/api/change-detection', authOpts())
      .then(function(r) { return r.json(); })
      .then(function(data) {
        pollingEnabled = data.changeDetection !== false;
        updateLiveIndicatorForConnection();
      })
      .catch(function() { /* keep default ON */ });

    // Wire the masthead pill click to toggle change-detection polling.
    // masthead.js calls this when the user clicks the status pill.
    if (window.mastheadStatus) {
      window.mastheadStatus.onToggle = function() {
        // Only toggle when connected (masthead.js disables the button when offline).
        if (connectionState !== 'connected') return;
        window.mastheadStatus.setBusy();
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
            updateLiveIndicatorForConnection();
            if (!pollingEnabled && connectionState === 'connected') {
              startKeepAlive();
            } else {
              stopKeepAlive();
            }
          });
      };
    }
    // --- NL-to-SQL: modal shows a live preview only; Use copies into #sql-input (debounced preview). ---
    var nlLiveDebounce = null;
    var nlModalEscapeListenerActive = false;
    function nlModalOnEscape(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeNlModal();
      }
    }
    /** NL conversion messages stay in the modal so they do not clear or replace run/query errors under the main editor. */
    function setNlModalError(msg, visible) {
      var modalErr = document.getElementById('nl-modal-error');
      if (visible && msg) {
        if (modalErr) {
          modalErr.textContent = msg;
          modalErr.style.display = 'block';
        }
      } else if (modalErr) {
        modalErr.style.display = 'none';
      }
    }
    async function applyNlLivePreview() {
      var ta = document.getElementById('nl-modal-input');
      var preview = document.getElementById('nl-modal-sql-preview');
      if (!ta || !preview) return;
      var question = String(ta.value || '').trim();
      if (!question) {
        preview.value = '';
        setNlModalError('', false);
        return;
      }
      try {
        var meta = await loadSchemaMeta();
        var result = nlToSql(question, meta);
        if (result.sql) {
          preview.value = result.sql;
          setNlModalError('', false);
        } else {
          preview.value = '';
          setNlModalError(result.error || 'Could not convert to SQL.', true);
        }
      } catch (err) {
        preview.value = '';
        setNlModalError('Error: ' + (err.message || err), true);
      }
    }
    function scheduleNlLivePreview() {
      if (nlLiveDebounce) clearTimeout(nlLiveDebounce);
      nlLiveDebounce = setTimeout(function () {
        nlLiveDebounce = null;
        applyNlLivePreview();
      }, 120);
    }
    function openNlModal() {
      var modal = document.getElementById('nl-modal');
      var ta = document.getElementById('nl-modal-input');
      if (!modal || !ta) return;
      modal.hidden = false;
      modal.setAttribute('aria-hidden', 'false');
      ta.focus();
      if (!nlModalEscapeListenerActive) {
        document.addEventListener('keydown', nlModalOnEscape);
        nlModalEscapeListenerActive = true;
      }
      scheduleNlLivePreview();
    }
    function closeNlModal() {
      var modal = document.getElementById('nl-modal');
      if (!modal) return;
      modal.hidden = true;
      modal.setAttribute('aria-hidden', 'true');
      if (nlModalEscapeListenerActive) {
        document.removeEventListener('keydown', nlModalOnEscape);
        nlModalEscapeListenerActive = false;
      }
      var openBtn = document.getElementById('nl-open');
      if (openBtn) openBtn.focus();
    }
    async function useNlModal() {
      var ta = document.getElementById('nl-modal-input');
      var sqlEl = document.getElementById('sql-input');
      if (!ta || !sqlEl) return;
      var question = String(ta.value || '').trim();
      if (!question) {
        setNlModalError('Enter a question first.', true);
        return;
      }
      try {
        var meta = await loadSchemaMeta();
        var result = nlToSql(question, meta);
        if (result.sql) {
          sqlEl.value = result.sql;
          var mainErr = document.getElementById('sql-error');
          if (mainErr) {
            mainErr.textContent = '';
            mainErr.style.display = 'none';
          }
          closeNlModal();
        } else {
          setNlModalError(result.error || 'Could not convert to SQL.', true);
        }
      } catch (err) {
        setNlModalError('Error: ' + (err.message || err), true);
      }
    }
    var nlOpenEl = document.getElementById('nl-open');
    if (nlOpenEl) nlOpenEl.addEventListener('click', openNlModal);
    var nlBackdrop = document.getElementById('nl-modal-backdrop');
    if (nlBackdrop) nlBackdrop.addEventListener('click', closeNlModal);
    var nlCancel = document.getElementById('nl-cancel');
    if (nlCancel) nlCancel.addEventListener('click', closeNlModal);
    var nlUse = document.getElementById('nl-use');
    if (nlUse) nlUse.addEventListener('click', function () { useNlModal(); });
    var nlModalInput = document.getElementById('nl-modal-input');
    if (nlModalInput) {
      nlModalInput.addEventListener('input', scheduleNlLivePreview);
      nlModalInput.addEventListener('paste', function () {
        setTimeout(scheduleNlLivePreview, 0);
      });
    }

    fetch('/api/tables', authOpts())
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
          // Open in its own tab so it appears in the tab bar.
          openTableTab(hash);
        } else if (restoredTable && tables.indexOf(restoredTable) >= 0 && navHistory.length > 0) {
          // No hash deep-link, but we have a restored breadcrumb trail --
          // load the table the user was viewing when they last refreshed.
          openTableTab(restoredTable);
        }

        // Render the breadcrumb bar if the trail is non-empty, so the
        // user sees their restored navigation path.
        if (navHistory.length > 0) {
          renderBreadcrumb();
        }
      })
      .catch(e => {
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
    fetch('/api/health', authOpts())
      .then(function(r) { return r.json(); })
      .then(function(d) {
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
            alert('Share URL copied to clipboard!\n\n' + shareUrl +
              '\n\nExpires: ' + new Date(expiresAt).toLocaleString());
          })
          .catch(function () {
            prompt('Copy this share URL:', shareUrl);
          });
      } else {
        prompt('Copy this share URL:', shareUrl);
      }
    }

    function createShareSession() {
      // Use literal newlines so the native prompt() shows line breaks in the message.
      var note = prompt('Add a note for your team (optional):\n\nSession will expire in 1 hour.');
      if (note === null) return;
      var btn = document.getElementById('fab-share-btn');
      btn.disabled = true;
      setButtonBusy(btn, true, 'Sharing\u2026');
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
          // Restore the FAB action's icon + label structure after busy state.
          btn.classList.remove('btn-busy');
          btn.innerHTML =
            '<span class="material-symbols-outlined" aria-hidden="true">share</span>' +
            '<span class="fab-action-label">Share</span>';
        });
    }

    // Share button now lives in the FAB menu.
    document.getElementById('fab-share-btn').addEventListener('click', createShareSession);

    function applySessionState(state) {
      if (state.currentTable) {
        // Open the shared table in its own tab
        setTimeout(function () { openTableTab(state.currentTable); }, 500);
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
        extBtn.textContent = 'Extending\u2026';
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
      const slowThresholdInput = document.getElementById('perf-slow-threshold');
      let perfLoaded = false;
      var lastPerfData = null;

      /** Read the slow-query threshold from the input (default 100 ms). */
      function getSlowThreshold() {
        if (!slowThresholdInput) return 100;
        var v = parseInt(slowThresholdInput.value, 10);
        return (v > 0) ? v : 100;
      }

      function fetchPerformance() {
        if (!refreshBtn || !container) return;
        refreshBtn.disabled = true;
        setButtonBusy(refreshBtn, true, 'Loading\u2026');
        container.style.display = 'none';
        var threshold = getSlowThreshold();
        fetch('/api/analytics/performance?slowThresholdMs=' + threshold, authOpts())
          .then(function(r) {
            if (!r.ok) return r.json().then(function(d) { throw new Error(d.error || 'Request failed'); });
            return r.json();
          })
          .then(function(data) {
            perfLoaded = true;
            lastPerfData = data;
            if (data.totalQueries === 0) {
              container.innerHTML = '<p class="meta">No queries recorded yet. Browse some tables, then update.</p>';
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
            // Restore Update button state so user can run again
            if (refreshBtn) {
              refreshBtn.disabled = false;
              setButtonBusy(refreshBtn, false, 'Update');
            }
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
          var thresh = data.slowThresholdMs || 100;
          html += '<p class="meta" style="color:#e57373;font-weight:bold;">Slow queries (&gt;' + esc(String(thresh)) + 'ms):</p>';
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
          var recentThresh = data.slowThresholdMs || 100;
          var warnThresh = Math.round(recentThresh / 2);
          data.recentQueries.forEach(function(q) {
            var sql = q.sql || '';
            // Use icon + color so speed is distinguishable without color alone
            // (WCAG 2.1 1.4.1 — Use of Color)
            var color = q.durationMs > recentThresh ? '#e57373' : (q.durationMs > warnThresh ? '#ffb74d' : 'var(--fg)');
            var speedIcon = q.durationMs > recentThresh ? '[!!] ' : (q.durationMs > warnThresh ? '[!] ' : '');
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
          syncFeatureCardExpanded(collapsible);
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

    // --- Super FAB UI controller moved to fab.js (loaded as separate script). ---

