(() => {
  // assets/web/sql-highlight.ts
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  var KEYWORDS = /* @__PURE__ */ new Set([
    "ADD",
    "ALL",
    "ALTER",
    "AND",
    "AS",
    "ASC",
    "AUTOINCREMENT",
    "BETWEEN",
    "BY",
    "CASE",
    "CHECK",
    "COLLATE",
    "COLUMN",
    "COMMIT",
    "CONSTRAINT",
    "CREATE",
    "CROSS",
    "CURRENT_DATE",
    "CURRENT_TIME",
    "CURRENT_TIMESTAMP",
    "DEFAULT",
    "DEFERRABLE",
    "DELETE",
    "DESC",
    "DISTINCT",
    "DROP",
    "ELSE",
    "END",
    "ESCAPE",
    "EXCEPT",
    "EXISTS",
    "FOREIGN",
    "FROM",
    "FULL",
    "GLOB",
    "GROUP",
    "HAVING",
    "IF",
    "IN",
    "INDEX",
    "INNER",
    "INSERT",
    "INTERSECT",
    "INTO",
    "IS",
    "JOIN",
    "KEY",
    "LEFT",
    "LIKE",
    "LIMIT",
    "NOT",
    "NULL",
    "OFFSET",
    "ON",
    "OR",
    "ORDER",
    "OUTER",
    "PRIMARY",
    "REFERENCES",
    "RIGHT",
    "ROLLBACK",
    "ROWID",
    "SELECT",
    "SET",
    "TABLE",
    "THEN",
    "TO",
    "TRANSACTION",
    "UNION",
    "UNIQUE",
    "UPDATE",
    "USING",
    "VALUES",
    "WHEN",
    "WHERE",
    "WITH",
    "INTEGER",
    "TEXT",
    "REAL",
    "BLOB",
    "NUMERIC",
    "BOOLEAN",
    "DATETIME"
  ]);
  function highlightSql(sql) {
    if (typeof sql !== "string" || sql.length === 0) return "";
    const out = [];
    let i = 0;
    const n = sql.length;
    while (i < n) {
      if (sql.slice(i, i + 2) === "/*") {
        const end = sql.indexOf("*/", i + 2);
        const endIdx = end === -1 ? n : end + 2;
        out.push('<span class="sql-cmt">', esc(sql.slice(i, endIdx)), "</span>");
        i = endIdx;
        continue;
      }
      if (sql.slice(i, i + 2) === "--") {
        let j = i + 2;
        while (j < n && sql[j] !== "\n") j++;
        out.push('<span class="sql-cmt">', esc(sql.slice(i, j)), "</span>");
        i = j;
        continue;
      }
      if (sql[i] === "'") {
        let j = i + 1;
        while (j < n) {
          if (sql[j] === "'") {
            if (sql[j + 1] === "'") j += 2;
            else {
              j += 1;
              break;
            }
          } else j++;
        }
        out.push('<span class="sql-str">', esc(sql.slice(i, j)), "</span>");
        i = j;
        continue;
      }
      if (sql[i] === '"') {
        let j = i + 1;
        while (j < n && sql[j] !== '"') {
          if (sql[j] === "\\" && j + 1 < n) j += 2;
          else j++;
        }
        if (j < n) j++;
        out.push('<span class="sql-id">', esc(sql.slice(i, j)), "</span>");
        i = j;
        continue;
      }
      if (/[A-Za-z_][A-Za-z0-9_]*/.test(sql[i])) {
        const match = sql.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*/);
        if (match) {
          const word = match[0];
          const upper = word.toUpperCase();
          const cls = KEYWORDS.has(upper) ? "sql-kw" : "sql-plain";
          out.push('<span class="', cls, '">', esc(word), "</span>");
          i += word.length;
          continue;
        }
      }
      if (/[0-9]/.test(sql[i])) {
        const match = sql.slice(i).match(/^\d+(\.\d+)?([eE][+-]?\d+)?/);
        if (match) {
          out.push('<span class="sql-num">', esc(match[0]), "</span>");
          i += match[0].length;
          continue;
        }
      }
      out.push(esc(sql[i]));
      i++;
    }
    return out.join("");
  }

  // assets/web/masthead.ts
  var STATUS = {
    online: "\u25CF Online",
    onlineTitle: "Online \u2014 click to pause change detection.",
    paused: "\u25CF Paused",
    pausedTitle: "Paused \u2014 click to resume live updates.",
    offline: "\u25CF Offline",
    offlineTitle: "Offline \u2014 connection lost. Reconnect to resume live updates.",
    reconnecting: "\u25CF Reconnecting\u2026",
    reconnectingTitle: "Offline \u2014 reconnecting\u2026"
  };
  function initMasthead() {
    const indicator = document.getElementById("live-indicator");
    if (!indicator) {
      console.log("[SDA] initMasthead: #live-indicator NOT found");
      return null;
    }
    console.log("[SDA] initMasthead: #live-indicator found, creating API");
    const api2 = {
      /**
       * Update the pill to reflect the current connection state.
       *
       * @param state - 'connected', 'disconnected', or 'reconnecting'
       * @param pollingEnabled - only meaningful when state === 'connected'
       */
      setConnection(state, pollingEnabled2) {
        console.log("[SDA] masthead.setConnection: state=" + state + ", polling=" + pollingEnabled2);
        if (state === "connected") {
          indicator.classList.remove("disconnected", "reconnecting");
          indicator.disabled = false;
          indicator.textContent = pollingEnabled2 ? STATUS.online : STATUS.paused;
          indicator.classList.toggle("paused", !pollingEnabled2);
          indicator.title = pollingEnabled2 ? STATUS.onlineTitle : STATUS.pausedTitle;
        } else if (state === "disconnected") {
          indicator.textContent = STATUS.offline;
          indicator.classList.add("disconnected");
          indicator.classList.remove("paused", "reconnecting");
          indicator.disabled = true;
          indicator.title = STATUS.offlineTitle;
        } else {
          indicator.textContent = STATUS.reconnecting;
          indicator.classList.add("disconnected", "reconnecting");
          indicator.classList.remove("paused");
          indicator.disabled = true;
          indicator.title = STATUS.reconnectingTitle;
        }
      },
      /** Show a transient ellipsis while a toggle request is in-flight. */
      setBusy() {
        indicator.disabled = true;
        indicator.textContent = "\u2026";
      },
      /**
       * Callback invoked when the user clicks the pill to toggle polling.
       * Set by app.js during initialisation. If null, clicks are ignored.
       */
      onToggle: null
    };
    indicator.addEventListener("click", () => {
      console.log("[SDA] masthead click: disabled=" + indicator.disabled + ", hasOnToggle=" + (typeof api2.onToggle === "function"));
      if (indicator.disabled) return;
      if (typeof api2.onToggle === "function") {
        api2.onToggle();
      }
    });
    return api2;
  }

  // assets/web/utils.ts
  function esc2(s) {
    if (s == null) return "";
    const d = document.createElement("div");
    d.textContent = String(s);
    return d.innerHTML;
  }
  function setButtonBusy(btn, loading, label) {
    if (!btn) return;
    if (loading) {
      btn.classList.add("btn-busy");
      btn.innerHTML = '<span class="btn-busy-spinner" aria-hidden="true"></span><span class="btn-busy-label">' + esc2(label) + "</span>";
    } else {
      btn.classList.remove("btn-busy");
      btn.textContent = label;
    }
  }
  function highlightSqlSafe(sql) {
    if (sql == null) return "";
    return typeof window.sqlHighlight === "function" && window.sqlHighlight(sql) || esc2(sql);
  }
  function formatTableRowCountDisplay(n) {
    const num = Number(n);
    if (!isFinite(num)) return String(n);
    return num.toLocaleString("en-US");
  }
  function syncFeatureCardExpanded(collapsible) {
    const card = collapsible && collapsible.closest && collapsible.closest(".feature-card");
    if (card) card.classList.toggle("expanded", !collapsible.classList.contains("collapsed"));
  }

  // assets/web/pii.ts
  function isPiiMaskEnabled() {
    const cb = document.getElementById("tb-mask-checkbox");
    return cb ? cb.checked : false;
  }
  function isPiiColumn(colName) {
    if (!colName || typeof colName !== "string") return false;
    const lower = colName.toLowerCase();
    const substringPatterns = [
      "email",
      "password",
      "phone",
      "ssn",
      "token",
      "secret",
      "api_key",
      "apikey",
      "address",
      "salary",
      "wage",
      "income",
      "credit_card",
      "creditcard",
      "card_num",
      "ip_addr",
      "ipaddr",
      "dob",
      "birth",
      "passport",
      "license",
      "licence",
      "iban",
      "account_num",
      "acct_num",
      "sort_code",
      "national_id",
      "tax_id",
      "sin_num",
      "medicare",
      "beneficiary",
      "ethnicity",
      "religion",
      "biometric",
      "fingerprint",
      "retina",
      "face_id",
      "social_sec"
    ];
    if (substringPatterns.some(function(p) {
      return lower.indexOf(p) >= 0;
    })) {
      return true;
    }
    const segments = lower.split(/[_\-.\s]+/);
    const wordPatterns = /* @__PURE__ */ new Set([
      "name",
      "first",
      "last",
      "full",
      "surname",
      "username",
      "login",
      "nick",
      "alias",
      "avatar",
      "photo",
      "tel",
      "ip",
      "sin",
      "tin",
      "zip",
      "postal",
      "city",
      "country",
      "street",
      "lat",
      "lng",
      "latitude",
      "longitude",
      "geo",
      "coords",
      "routing"
    ]);
    return segments.some(function(seg) {
      return wordPatterns.has(seg);
    });
  }
  function maskPiiValue(colName, value) {
    if (value == null) return "";
    const s = String(value).trim();
    if (s.length === 0) return "";
    const lower = colName.toLowerCase();
    if (lower.indexOf("email") >= 0 && s.indexOf("@") >= 0) {
      const at = s.indexOf("@");
      const local = s.slice(0, at);
      const domain = s.slice(at);
      const first = local.charAt(0);
      return (first ? first + "***" : "***") + domain;
    }
    const segments = lower.split(/[_\-.\s]+/);
    if (lower.indexOf("phone") >= 0 || segments.indexOf("tel") >= 0) {
      const digits = s.replace(/\D/g, "");
      const last4 = digits.length >= 4 ? digits.slice(-4) : "****";
      return "***-***-" + last4;
    }
    if (lower.indexOf("ssn") >= 0 || lower.indexOf("social_sec") >= 0) {
      const d = s.replace(/\D/g, "");
      const l4 = d.length >= 4 ? d.slice(-4) : "****";
      return "***-**-" + l4;
    }
    const secretPatterns = [
      "password",
      "token",
      "secret",
      "api_key",
      "apikey",
      "biometric",
      "fingerprint",
      "retina",
      "face_id"
    ];
    if (secretPatterns.some(function(p) {
      return lower.indexOf(p) >= 0;
    })) {
      return "****";
    }
    const nameWords = /* @__PURE__ */ new Set([
      "name",
      "first",
      "last",
      "full",
      "surname",
      "username",
      "login",
      "nick",
      "alias"
    ]);
    if (segments.some(function(seg) {
      return nameWords.has(seg);
    })) {
      return s.charAt(0) + "***";
    }
    const numericSubstrings = [
      "salary",
      "wage",
      "income",
      "credit_card",
      "creditcard",
      "card_num",
      "account_num",
      "acct_num",
      "sort_code",
      "iban",
      "sin_num",
      "tax_id",
      "national_id",
      "medicare"
    ];
    const numericSegments = /* @__PURE__ */ new Set(["routing", "tin", "sin"]);
    if (numericSubstrings.some(function(p) {
      return lower.indexOf(p) >= 0;
    }) || segments.some(function(seg) {
      return numericSegments.has(seg);
    })) {
      return "***";
    }
    const locationWords = /* @__PURE__ */ new Set([
      "address",
      "street",
      "city",
      "country",
      "zip",
      "postal",
      "lat",
      "lng",
      "latitude",
      "longitude",
      "geo",
      "coords"
    ]);
    if (segments.some(function(seg) {
      return locationWords.has(seg);
    }) || lower.indexOf("ip_addr") >= 0 || lower.indexOf("ipaddr") >= 0) {
      return s.length <= 2 ? "***" : s.slice(0, 2) + "***";
    }
    return s.length <= 2 ? "***" : s.slice(0, 2) + "***";
  }
  function getDisplayValue(colName, rawValue, _optMaskOn, _optIsPii) {
    const maskOn = _optMaskOn !== void 0 ? _optMaskOn : isPiiMaskEnabled();
    const isPii = _optIsPii !== void 0 ? _optIsPii : isPiiColumn(colName);
    if (!maskOn || !isPii) return rawValue != null ? String(rawValue) : "";
    return maskPiiValue(colName, rawValue);
  }

  // assets/web/state.ts
  var DRIFT_VIEWER_AUTH_TOKEN = "";
  var driftWriteEnabled = false;
  var driftCompareEnabled = false;
  function setDriftWriteEnabled(v) {
    driftWriteEnabled = v;
  }
  function setDriftCompareEnabled(v) {
    driftCompareEnabled = v;
  }
  var schemaMeta = null;
  function setSchemaMeta(m) {
    schemaMeta = m;
  }
  var activeTabId = "home";
  var openTableTabs = [];
  function setActiveTabId(id) {
    activeTabId = id;
  }
  var cachedSchema = null;
  var currentTableName = null;
  var currentTableJson = null;
  var lastRenderedSchema = null;
  var lastRenderedData = null;
  var limit = 200;
  var offset = 0;
  var tableCounts = {};
  var lastKnownTables = [];
  var lastGeneration = 0;
  var refreshInFlight = false;
  function setCachedSchema(s) {
    cachedSchema = s;
  }
  function setCurrentTableName(n) {
    currentTableName = n;
  }
  function setCurrentTableJson(j) {
    currentTableJson = j;
  }
  function setLastRenderedSchema(s) {
    lastRenderedSchema = s;
  }
  function setLastRenderedData(d) {
    lastRenderedData = d;
  }
  function setLimit(l) {
    limit = l;
  }
  function setOffset(o) {
    offset = o;
  }
  function setLastKnownTables(t) {
    lastKnownTables = t;
  }
  function setLastGeneration(g) {
    lastGeneration = g;
  }
  function setRefreshInFlight(f) {
    refreshInFlight = f;
  }
  var searchMatches = [];
  var searchCurrentIndex = -1;
  function setSearchMatches(m) {
    searchMatches = m;
  }
  function setSearchCurrentIndex(i) {
    searchCurrentIndex = i;
  }
  var connectionState = "connected";
  var consecutivePollFailures = 0;
  var currentBackoffMs = 1e3;
  var heartbeatTimerId = null;
  var keepAliveTimerId = null;
  var bannerDismissed = false;
  var nextHeartbeatAt = null;
  var heartbeatInFlight = false;
  var heartbeatAttemptCount = 0;
  var bannerUpdateIntervalId = null;
  function setConnectionState(s) {
    connectionState = s;
  }
  function setConsecutivePollFailures(n) {
    consecutivePollFailures = n;
  }
  function setCurrentBackoffMs(ms) {
    currentBackoffMs = ms;
  }
  function setHeartbeatTimerId(id) {
    heartbeatTimerId = id;
  }
  function setKeepAliveTimerId(id) {
    keepAliveTimerId = id;
  }
  function setBannerDismissed(d) {
    bannerDismissed = d;
  }
  function setNextHeartbeatAt(t) {
    nextHeartbeatAt = t;
  }
  function setHeartbeatInFlight(f) {
    heartbeatInFlight = f;
  }
  function setHeartbeatAttemptCount(n) {
    heartbeatAttemptCount = n;
  }
  function setBannerUpdateIntervalId(id) {
    bannerUpdateIntervalId = id;
  }
  var BACKOFF_INITIAL_MS = 1e3;
  var BACKOFF_MAX_MS = 3e4;
  var BACKOFF_MULTIPLIER = 2;
  var HEALTH_CHECK_THRESHOLD = 3;
  var KEEP_ALIVE_INTERVAL_MS = 15e3;
  var SQL_HISTORY_KEY = "drift-viewer-sql-history";
  var BOOKMARKS_KEY = "drift-viewer-sql-bookmarks";
  var sqlHistory = [];
  var sqlBookmarks = [];
  function setSqlHistory(h) {
    sqlHistory = h;
  }
  function setSqlBookmarks(b) {
    sqlBookmarks = b;
  }
  var THEME_KEY = "drift-viewer-theme";
  var TABLE_STATE_KEY_PREFIX = "drift-viewer-table-state-";
  var NAV_HISTORY_KEY = "drift-viewer-nav-history";
  var PINNED_TABLES_KEY = "drift-viewer-pinned-tables";
  var SERVER_ORIGIN_KEY = "drift-viewer-server-origin";
  var LIMIT_OPTIONS = [50, 200, 500, 1e3];
  var displayFormat = "raw";
  var nullDisplay = "NULL";
  var tableColumnTypes = {};
  var queryBuilderActive = false;
  var queryBuilderState = null;
  var tableColumnConfig = {};
  var showOnlyMatchingRows = true;
  var columnContextMenuTargetKey = null;
  var columnDragKey = null;
  function setDisplayFormat(f) {
    displayFormat = f;
  }
  function setNullDisplay(s) {
    nullDisplay = s;
  }
  function setQueryBuilderActive(a) {
    queryBuilderActive = a;
  }
  function setQueryBuilderState(s) {
    queryBuilderState = s;
  }
  function setShowOnlyMatchingRows(v) {
    showOnlyMatchingRows = v;
  }
  function setColumnContextMenuTargetKey(k) {
    columnContextMenuTargetKey = k;
  }
  function setColumnDragKey(k) {
    columnDragKey = k;
  }
  var ANALYSIS_STORAGE_PREFIX = "saropa_analysis_";
  var lastSizeAnalyticsData = null;
  function setLastSizeAnalyticsData(d) {
    lastSizeAnalyticsData = d;
  }
  var CHART_COLORS = [
    "#4e79a7",
    "#f28e2b",
    "#e15759",
    "#76b7b2",
    "#59a14f",
    "#edc948",
    "#b07aa1",
    "#ff9da7",
    "#9c755f",
    "#bab0ac"
  ];
  var lastChartState = null;
  var chartResizeObserver = null;
  function setLastChartState(s) {
    lastChartState = s;
  }
  function setChartResizeObserver(o) {
    chartResizeObserver = o;
  }
  var pollingEnabled = true;
  function setPollingEnabled(p) {
    pollingEnabled = p;
  }
  var nlLiveDebounce = null;
  var nlModalEscapeListenerActive = false;
  function setNlLiveDebounce(d) {
    nlLiveDebounce = d;
  }
  function setNlModalEscapeListenerActive(a) {
    nlModalEscapeListenerActive = a;
  }
  var fkMetaCache = {};
  var navHistory = [];
  var currentSessionId = null;
  var currentSessionExpiresAt = null;
  var sessionCountdownInterval = null;
  var sessionWarningShown = false;
  var sessionFastMode = false;
  function setCurrentSessionId(id) {
    currentSessionId = id;
  }
  function setCurrentSessionExpiresAt(at) {
    currentSessionExpiresAt = at;
  }
  function setSessionCountdownInterval(id) {
    sessionCountdownInterval = id;
  }
  function setSessionWarningShown(s) {
    sessionWarningShown = s;
  }
  function setSessionFastMode(f) {
    sessionFastMode = f;
  }
  var APP_SIDEBAR_PANEL_KEY = "saropa_app_sidebar_collapsed";
  var HISTORY_SIDEBAR_KEY = "saropa_history_sidebar_collapsed";
  var TOOL_ICONS = {
    home: "home",
    tables: "table_chart",
    sql: "terminal",
    search: "search",
    snapshot: "photo_camera",
    compare: "compare_arrows",
    index: "format_list_bulleted",
    size: "bar_chart",
    perf: "speed",
    anomaly: "favorite",
    import: "upload",
    schema: "grid_on",
    diagram: "account_tree",
    export: "download",
    settings: "settings"
  };
  var TOOL_LABELS = {
    home: "Home",
    tables: "Tables",
    sql: "Run SQL",
    search: "Search",
    snapshot: "Snapshot",
    compare: "DB diff",
    index: "Index",
    size: "Size",
    perf: "Perf",
    anomaly: "Health",
    import: "Import",
    schema: "Schema",
    diagram: "Diagram",
    export: "Export",
    settings: "Settings"
  };
  var HOME_LAUNCHERS = [
    { id: "tables", blurb: "browse, open tables, pagination, export" },
    { id: "search", blurb: "schema + data search, filters, jump matches" },
    { id: "sql", blurb: "editor, templates, bookmarks, charts, NL ask" },
    { id: "snapshot", blurb: "capture schema, time travel" },
    { id: "compare", blurb: "diff databases, migrations" },
    { id: "index", blurb: "suggested indexes, query hints" },
    { id: "schema", blurb: "DDL, columns, PRAGMA" },
    { id: "diagram", blurb: "relationship graph" },
    { id: "size", blurb: "table sizes, growth" },
    { id: "perf", blurb: "slow statements, timings" },
    { id: "anomaly", blurb: "health checks, drift signals" },
    { id: "import", blurb: "CSV \u2192 table" },
    { id: "export", blurb: "CSV, schema" },
    { id: "settings", blurb: "prefs, masking, confirm navigate" }
  ];
  var HOME_EXTRAS = [
    { action: "mask", icon: "visibility_off", label: "Mask PII", blurb: "redact sensitive columns" },
    { action: "theme", icon: "palette", label: "Theme", blurb: "light, dark, showcase, midnight" },
    { action: "share", icon: "share", label: "Share", blurb: "read-only session link" }
  ];
  var OFFLINE_DISABLE_IDS = [
    "sql-run",
    "sql-apply-template",
    "pagination-first",
    "pagination-prev",
    "pagination-next",
    "pagination-last",
    "pagination-apply",
    "sample-rows-btn",
    "clear-table-state",
    "clear-table-data",
    "clear-all-data"
  ];
  function authOpts(o) {
    o = o || {};
    o.headers = o.headers || {};
    if (DRIFT_VIEWER_AUTH_TOKEN) o.headers["Authorization"] = "Bearer " + DRIFT_VIEWER_AUTH_TOKEN;
    return o;
  }

  // assets/web/search.ts
  function escapeRe(s) {
    return s.replace(/[\\\\^\$*+?.()|[\]{}]/g, "\\\\$&");
  }
  function highlightText(text, term) {
    if (!term || term.length === 0) return esc2(text);
    const re = new RegExp("(" + escapeRe(term) + ")", "gi");
    var result = "";
    var lastEnd = 0;
    var match;
    while ((match = re.exec(text)) !== null) {
      result += esc2(text.slice(lastEnd, match.index)) + '<span class="highlight">' + esc2(match[1]) + "</span>";
      lastEnd = re.lastIndex;
    }
    result += esc2(text.slice(lastEnd));
    return result;
  }
  function getScope() {
    return document.getElementById("search-scope").value || "";
  }
  function getSearchTerm() {
    return String(document.getElementById("search-input").value || "").trim();
  }
  function getRowFilter() {
    return String(document.getElementById("row-filter").value || "").trim();
  }
  function filterRows(data) {
    const term = getRowFilter();
    if (!term || !data || data.length === 0) return data || [];
    const lower = term.toLowerCase();
    return data.filter((row) => Object.values(row).some((v) => v != null && String(v).toLowerCase().includes(lower)));
  }
  function getTableDisplayData(data) {
    if (!data || data.length === 0) return data || [];
    if (showOnlyMatchingRows && getRowFilter()) return filterRows(data);
    return data;
  }
  function buildTableFilterMetaSuffix(filteredLen, totalLen) {
    if (!getRowFilter()) return "";
    if (showOnlyMatchingRows) return " (filtered: " + filteredLen + " of " + totalLen + ")";
    return " (showing all rows; filter: " + filteredLen + " match)";
  }
  function expandSectionContaining(el) {
    var node = el;
    while (node && node !== document.body) {
      if (node.classList && node.classList.contains("collapsible-body") && node.classList.contains("collapsed")) {
        var prev = node.previousElementSibling;
        if (prev && prev.classList.contains("collapsible-header")) {
          prev.click();
        }
      }
      node = node.parentElement;
    }
  }
  function applySearch() {
    const term = getSearchTerm();
    const scope = getScope();
    const navEl = document.getElementById("search-nav");
    const countEl2 = document.getElementById("search-count");
    const isSearchPanel = activeTabId === "search";
    const root = isSearchPanel ? document.getElementById("search-results-content") : null;
    function getEl(mainId, panelId) {
      if (isSearchPanel && root) {
        var el = root.querySelector("#" + panelId);
        return el || null;
      }
      return document.getElementById(mainId);
    }
    const schemaPre = getEl("schema-pre", "search-panel-schema-pre");
    const contentPre = getEl("content-pre", "search-panel-content-pre");
    var dataTable = getEl("data-table", "search-panel-data-table");
    if (schemaPre && lastRenderedSchema !== null && (scope === "schema" || scope === "both")) {
      schemaPre.innerHTML = term ? highlightText(lastRenderedSchema, term) : esc2(lastRenderedSchema);
    }
    if (contentPre && lastRenderedSchema !== null && scope === "schema") {
      contentPre.innerHTML = term ? highlightText(lastRenderedSchema, term) : esc2(lastRenderedSchema);
    }
    if (dataTable && (scope === "data" || scope === "both")) {
      dataTable.querySelectorAll("td").forEach(function(td) {
        if (!td.querySelector(".fk-link")) {
          var copyBtn = td.querySelector(".cell-copy-btn");
          var textNodes = [];
          td.childNodes.forEach(function(n) {
            if (n !== copyBtn) textNodes.push(n.textContent || "");
          });
          var text = textNodes.join("");
          var highlighted = term ? highlightText(text, term) : esc2(text);
          if (copyBtn) {
            var btnHtml = copyBtn.outerHTML;
            td.innerHTML = highlighted + btnHtml;
          } else {
            td.innerHTML = highlighted;
          }
        }
      });
    }
    setSearchMatches([]);
    setSearchCurrentIndex(-1);
    if (term) {
      var searchRoot = isSearchPanel && root ? root : document;
      setSearchMatches(Array.from(searchRoot.querySelectorAll ? searchRoot.querySelectorAll(".highlight") : []));
    }
    if (searchMatches.length > 0) {
      navEl.style.display = "flex";
      navigateToMatch(0);
    } else {
      navEl.style.display = term ? "flex" : "none";
      countEl2.textContent = term ? "No matches" : "";
      document.getElementById("search-prev").disabled = true;
      document.getElementById("search-next").disabled = true;
    }
  }
  function navigateToMatch(index) {
    var countEl2 = document.getElementById("search-count");
    var prevBtn = document.getElementById("search-prev");
    var nextBtn = document.getElementById("search-next");
    if (searchMatches.length === 0) return;
    if (index < 0) index = searchMatches.length - 1;
    if (index >= searchMatches.length) index = 0;
    if (searchCurrentIndex >= 0 && searchCurrentIndex < searchMatches.length) {
      searchMatches[searchCurrentIndex].classList.remove("highlight-active");
    }
    setSearchCurrentIndex(index);
    var current = searchMatches[searchCurrentIndex];
    current.classList.add("highlight-active");
    expandSectionContaining(current);
    current.scrollIntoView({ behavior: "auto", block: "center", inline: "nearest" });
    countEl2.textContent = searchCurrentIndex + 1 + " of " + searchMatches.length;
    prevBtn.disabled = false;
    nextBtn.disabled = false;
  }
  function nextMatch() {
    if (searchMatches.length === 0) return;
    navigateToMatch(searchCurrentIndex + 1);
  }
  function prevMatch() {
    if (searchMatches.length === 0) return;
    navigateToMatch(searchCurrentIndex - 1);
  }

  // assets/web/schema-meta.ts
  async function loadSchemaMeta() {
    if (schemaMeta) return schemaMeta;
    var r = await fetch("/api/schema/metadata", authOpts());
    if (!r.ok) throw new Error("Failed to load schema metadata (HTTP " + r.status + ")");
    setSchemaMeta(await r.json());
    return schemaMeta;
  }

  // assets/web/query-builder-sql.ts
  function filterHasValue(f) {
    return "value" in f;
  }
  function sqlLiteral(v) {
    if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
    if (typeof v === "boolean") return v ? "1" : "0";
    return `'${String(v).replace(/'/g, "''")}'`;
  }
  function canonicalJoinKey(join) {
    const a = `${join.leftTableId}.${join.leftColumn}`;
    const b = `${join.rightTableId}.${join.rightColumn}`;
    return [a, b].sort().join("=");
  }
  function renderSelectedColumn(sel, tableById2) {
    const table = tableById2.get(sel.tableId);
    if (!table) throw new Error("missing table for select");
    const ref = `"${table.alias}"."${sel.column}"`;
    if (!sel.aggregation) return ref;
    const fn = String(sel.aggregation).toUpperCase();
    const fallbackAlias = `${fn.toLowerCase()}_${sel.column}`;
    const alias = sel.alias ?? fallbackAlias;
    return `${fn}(${ref}) AS "${alias}"`;
  }
  function renderJoin(join, tableById2) {
    const left = tableById2.get(join.leftTableId);
    const right = tableById2.get(join.rightTableId);
    if (!left || !right) throw new Error("join references unknown table");
    const jt = join.type === "LEFT" || join.type === "RIGHT" || join.type === "INNER" ? join.type : "INNER";
    return `${jt} JOIN "${right.baseTable}" AS "${right.alias}" ON "${right.alias}"."${join.rightColumn}" = "${left.alias}"."${join.leftColumn}"`;
  }
  function validateQueryModel(model) {
    const errors = [];
    const tableById2 = new Map(model.tables.map((t) => [t.id, t]));
    if (model.tables.length === 0) {
      errors.push("at least one table is required");
      return errors;
    }
    const aliases = model.tables.map((t) => t.alias);
    if (new Set(aliases).size !== aliases.length) {
      errors.push("table aliases must be unique");
    }
    if (model.limit !== null && (!Number.isInteger(model.limit) || model.limit <= 0)) {
      errors.push("limit must be a positive integer");
    }
    const missingTable = (id) => !tableById2.has(id);
    for (const join of model.joins) {
      if (missingTable(join.leftTableId) || missingTable(join.rightTableId)) {
        errors.push(`join ${join.id} references unknown table`);
      }
    }
    for (const sel of model.selectedColumns) {
      if (missingTable(sel.tableId)) errors.push(`selected column ${sel.column} references unknown table`);
    }
    for (const filter of model.filters) {
      if (missingTable(filter.tableId)) errors.push(`filter ${filter.id} references unknown table`);
      if (filter.operator === "IN" && (!("values" in filter) || !filter.values || filter.values.length === 0)) {
        errors.push(`filter ${filter.id} IN list cannot be empty`);
      }
    }
    const seenJoinKeys = /* @__PURE__ */ new Set();
    for (const join of model.joins) {
      const key = canonicalJoinKey(join);
      if (seenJoinKeys.has(key)) {
        errors.push(`duplicate join detected (${join.id})`);
      }
      seenJoinKeys.add(key);
    }
    if (model.tables.length > 1) {
      const rootId = model.tables[0].id;
      const reachable = /* @__PURE__ */ new Set([rootId]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const j of model.joins) {
          if (reachable.has(j.leftTableId) && !reachable.has(j.rightTableId)) {
            reachable.add(j.rightTableId);
            grew = true;
          }
          if (reachable.has(j.rightTableId) && !reachable.has(j.leftTableId)) {
            reachable.add(j.leftTableId);
            grew = true;
          }
        }
      }
      for (const t of model.tables) {
        if (!reachable.has(t.id)) {
          errors.push(`table "${t.alias}" is not connected to the query root via JOINs`);
        }
      }
    }
    if (model.groupBy.length > 0) {
      const grouped = new Set(model.groupBy.map((g) => `${g.tableId}.${g.column}`));
      for (const sel of model.selectedColumns) {
        if (!sel.aggregation && !grouped.has(`${sel.tableId}.${sel.column}`)) {
          errors.push(`non-aggregated select "${sel.column}" must be in GROUP BY`);
        }
      }
    }
    return errors;
  }
  function renderQuerySql(model) {
    const errors = validateQueryModel(model);
    if (errors.length > 0) {
      throw new Error(`Invalid query model: ${errors.join("; ")}`);
    }
    const tableById2 = new Map(model.tables.map((t) => [t.id, t]));
    const parts = [];
    const selectCols = model.selectedColumns.map((c) => renderSelectedColumn(c, tableById2));
    parts.push(`SELECT ${selectCols.length > 0 ? selectCols.join(", ") : "*"}`);
    const root = model.tables[0];
    parts.push(`FROM "${root.baseTable}" AS "${root.alias}"`);
    for (const join of model.joins) {
      parts.push(renderJoin(join, tableById2));
    }
    if (model.filters.length > 0) {
      const where = model.filters.map((f, i) => {
        const table = tableById2.get(f.tableId);
        const ref = `"${table.alias}"."${f.column}"`;
        const prefix = i === 0 ? "WHERE" : f.conjunction || "AND";
        if (f.operator === "IS NULL" || f.operator === "IS NOT NULL") {
          return `${prefix} ${ref} ${f.operator}`;
        }
        if (f.operator === "IN") {
          const vals = f.values || [];
          return `${prefix} ${ref} IN (${vals.map(sqlLiteral).join(", ")})`;
        }
        if (filterHasValue(f)) {
          if (f.operator === "LIKE") {
            return `${prefix} ${ref} LIKE ${sqlLiteral(f.value)}`;
          }
          return `${prefix} ${ref} ${f.operator} ${sqlLiteral(f.value)}`;
        }
        throw new Error(`Unexpected filter shape for operator: ${String(f.operator)}`);
      });
      parts.push(where.join("\n"));
    }
    if (model.groupBy.length > 0) {
      const clauses = model.groupBy.map((g) => {
        const table = tableById2.get(g.tableId);
        return `"${table.alias}"."${g.column}"`;
      });
      parts.push(`GROUP BY ${clauses.join(", ")}`);
    }
    if (model.orderBy.length > 0) {
      const clauses = model.orderBy.map((o) => {
        const table = tableById2.get(o.tableId);
        const dir = String(o.direction || "ASC").toUpperCase() === "DESC" ? "DESC" : "ASC";
        return `"${table.alias}"."${o.column}" ${dir}`;
      });
      parts.push(`ORDER BY ${clauses.join(", ")}`);
    }
    if (model.limit !== null) {
      parts.push(`LIMIT ${model.limit}`);
    }
    return parts.join("\n");
  }
  function getWhereOpsForType(columnType) {
    const type = (columnType || "").toUpperCase();
    if (type === "TEXT" || type.indexOf("VARCHAR") >= 0 || type.indexOf("CHAR") >= 0) {
      return [
        { val: "LIKE", label: "contains" },
        { val: "=", label: "equals" },
        { val: "!=", label: "!=" },
        { val: "IS NULL", label: "is null" },
        { val: "IS NOT NULL", label: "is not null" },
        { val: "IN", label: "IN (comma list)" }
      ];
    }
    if (type === "INTEGER" || type === "REAL" || type.indexOf("INT") >= 0 || type.indexOf("FLOAT") >= 0 || type.indexOf("DOUBLE") >= 0 || type.indexOf("NUM") >= 0 || type.indexOf("DECIMAL") >= 0) {
      return [
        { val: "=", label: "=" },
        { val: "!=", label: "!=" },
        { val: ">", label: ">" },
        { val: "<", label: "<" },
        { val: ">=", label: ">=" },
        { val: "<=", label: "<=" },
        { val: "IS NULL", label: "is null" },
        { val: "IS NOT NULL", label: "is not null" },
        { val: "IN", label: "IN (comma list)" }
      ];
    }
    if (type === "BLOB") {
      return [
        { val: "IS NULL", label: "is null" },
        { val: "IS NOT NULL", label: "is not null" }
      ];
    }
    return [
      { val: "=", label: "=" },
      { val: "!=", label: "!=" },
      { val: "LIKE", label: "contains" },
      { val: "IS NULL", label: "is null" },
      { val: "IS NOT NULL", label: "is not null" },
      { val: "IN", label: "IN (comma list)" }
    ];
  }

  // assets/web/query-builder-multi.ts
  var _scope = "single";
  var _multiModel = null;
  var _multiRootTable = null;
  var _onChange = () => {
  };
  function makeId(prefix) {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
  }
  function schemaTableByName(name) {
    const meta = schemaMeta;
    if (!meta || !meta.tables || !name) return null;
    const tables = meta.tables;
    for (let i = 0; i < tables.length; i++) {
      if (tables[i].name === name) return tables[i];
    }
    return null;
  }
  function tableColumnsFromSchema(baseTable) {
    const t = schemaTableByName(baseTable);
    if (!t || !t.columns) return [];
    return t.columns.map((c) => ({ name: c.name, type: c.type, pk: c.pk }));
  }
  function buildFreshModel(rootTable, colTypes) {
    const tid = makeId("tb");
    const keys = Object.keys(colTypes || {});
    const columns = keys.map((name) => ({ name, type: colTypes[name] || "", pk: false }));
    return {
      modelVersion: 1,
      tables: [{ id: tid, baseTable: rootTable, alias: "t0", columns }],
      joins: [],
      selectedColumns: keys.map((name) => ({ tableId: tid, column: name })),
      filters: [],
      groupBy: [],
      orderBy: [],
      limit: 200
    };
  }
  function setMultiChangeHandler(fn) {
    _onChange = fn;
  }
  function notify() {
    _onChange();
  }
  function getQbScope() {
    return _scope;
  }
  function initMultiForTable(rootTable, colTypes) {
    if (_multiRootTable !== rootTable || !_multiModel) {
      _multiRootTable = rootTable;
      _multiModel = buildFreshModel(rootTable, colTypes);
    }
  }
  function setQbScope(next) {
    _scope = next;
    const simple = document.getElementById("qb-simple-visual");
    const multi = document.getElementById("qb-multi-panel");
    const btnS = document.getElementById("qb-scope-single");
    const btnM = document.getElementById("qb-scope-multi");
    if (simple) simple.style.display = next === "single" ? "" : "none";
    if (multi) multi.style.display = next === "multi" ? "" : "none";
    if (btnS) btnS.classList.toggle("active", next === "single");
    if (btnM) btnM.classList.toggle("active", next === "multi");
    if (next === "multi") renderMultiRoot();
    notify();
  }
  function getMultiPreviewText() {
    if (!_multiModel) return "";
    const errs = validateQueryModel(_multiModel);
    if (errs.length > 0) return "-- " + errs.join("; ");
    try {
      return renderQuerySql(_multiModel);
    } catch (e) {
      return "-- " + (e instanceof Error ? e.message : String(e));
    }
  }
  function tryGetMultiSql() {
    if (!_multiModel) return null;
    const errs = validateQueryModel(_multiModel);
    if (errs.length > 0) return null;
    try {
      return renderQuerySql(_multiModel).trim();
    } catch {
      return null;
    }
  }
  function tableById(id) {
    return _multiModel?.tables.find((t) => t.id === id);
  }
  function nextAlias() {
    const n = _multiModel?.tables.length ?? 0;
    return `t${n}`;
  }
  function syncSelectedColumnsAfterTableRemoved(removedId) {
    if (!_multiModel) return;
    _multiModel.selectedColumns = _multiModel.selectedColumns.filter((s) => s.tableId !== removedId);
    _multiModel.groupBy = _multiModel.groupBy.filter((g) => g.tableId !== removedId);
    _multiModel.orderBy = _multiModel.orderBy.filter((o) => o.tableId !== removedId);
    _multiModel.filters = _multiModel.filters.filter((f) => f.tableId !== removedId);
  }
  function renderMultiRoot() {
    const host = document.getElementById("qb-multi-root");
    if (!host || !_multiModel) return;
    const m = _multiModel;
    const instOpts = m.tables.map((t) => `<option value="${esc2(t.id)}">${esc2(t.alias)} (${esc2(t.baseTable)})</option>`).join("");
    const schemaTables = (schemaMeta?.tables || []).map((x) => x.name).sort();
    const schemaOpts = schemaTables.map((n) => `<option value="${esc2(n)}">${esc2(n)}</option>`).join("");
    const tablesHtml = m.tables.map((t) => {
      const isRoot = m.tables[0]?.id === t.id;
      const rm = isRoot ? "" : ` <button type="button" class="qb-m-remove-table" data-table-id="${esc2(t.id)}" title="Remove this table instance">Remove</button>`;
      return `<li><strong>${esc2(t.alias)}</strong> \u2014 ${esc2(t.baseTable)}${rm}</li>`;
    }).join("");
    const joinsHtml = m.joins.length === 0 ? '<p class="meta">No JOINs yet. Add one before selecting columns from a second table.</p>' : m.joins.map((j) => {
      const lt = tableById(j.leftTableId);
      const rt = tableById(j.rightTableId);
      const label = `${lt?.alias ?? "?"}.${j.leftColumn} ${j.type} JOIN ${rt?.alias ?? "?"}.${j.rightColumn}`;
      return `<div class="qb-m-join-row">${esc2(label)} <button type="button" class="qb-m-remove-join" data-join-id="${esc2(j.id)}">\xD7</button></div>`;
    }).join("");
    const selColsHtml = m.selectedColumns.map((sc, idx) => {
      const t = tableById(sc.tableId);
      const instOptsRow = m.tables.map((tb) => `<option value="${esc2(tb.id)}"${tb.id === sc.tableId ? " selected" : ""}>${esc2(tb.alias)} (${esc2(tb.baseTable)})</option>`).join("");
      const colOpts = (t?.columns || []).map((c) => `<option value="${esc2(c.name)}"${c.name === sc.column ? " selected" : ""}>${esc2(c.name)}</option>`).join("");
      const aggOpts = ["", "COUNT", "SUM", "AVG", "MIN", "MAX"].map((a) => `<option value="${esc2(a)}"${(sc.aggregation || "") === a ? " selected" : ""}>${a ? esc2(a) : "(none)"}</option>`).join("");
      const showAgg = m.groupBy.length > 0;
      const aggHtml = showAgg ? `<select class="qb-m-sel-agg" data-sel-idx="${idx}" title="Aggregate (required when GROUP BY is non-empty)">${aggOpts}</select>` : "";
      return `<div class="qb-row qb-m-sel-row">
        <select class="qb-m-sel-table" data-sel-idx="${idx}">${instOptsRow}</select>
        <select class="qb-m-sel-col" data-sel-idx="${idx}">${colOpts}</select>
        ${aggHtml}
        <button type="button" class="qb-m-remove-sel" data-sel-idx="${idx}" title="Remove column">\xD7</button>
      </div>`;
    }).join("");
    const filtersHtml = m.filters.map((f, fi) => {
      const t = tableById(f.tableId);
      const type = t?.columns.find((c) => c.name === f.column)?.type || "";
      const ops = getWhereOpsForType(type);
      const opOpts = ops.map((o) => `<option value="${esc2(o.val)}"${f.operator === o.val ? " selected" : ""}>${esc2(o.label)}</option>`).join("");
      const conn = fi === 0 ? "" : `<select class="qb-m-flt-conn" data-flt-id="${esc2(f.id)}"><option value="AND"${(f.conjunction || "AND") === "AND" ? " selected" : ""}>AND</option><option value="OR"${f.conjunction === "OR" ? " selected" : ""}>OR</option></select>`;
      const valDisplay = f.operator === "IN" ? (f.values || []).join(", ") : f.value != null ? String(f.value) : "";
      const valHidden = f.operator === "IS NULL" || f.operator === "IS NOT NULL" ? ' style="display:none"' : "";
      return `<div class="qb-m-filter-row">${conn}
        <select class="qb-m-flt-table" data-flt-id="${esc2(f.id)}">${m.tables.map((tb) => `<option value="${esc2(tb.id)}"${tb.id === f.tableId ? " selected" : ""}>${esc2(tb.alias)}</option>`).join("")}</select>
        <select class="qb-m-flt-col" data-flt-id="${esc2(f.id)}">${(t?.columns || []).map((c) => `<option value="${esc2(c.name)}"${c.name === f.column ? " selected" : ""}>${esc2(c.name)}</option>`).join("")}</select>
        <select class="qb-m-flt-op" data-flt-id="${esc2(f.id)}">${opOpts}</select>
        <input type="text" class="qb-m-flt-val" data-flt-id="${esc2(f.id)}" value="${esc2(valDisplay)}" placeholder="value or comma-separated (IN)"${valHidden}/>
        <button type="button" class="qb-m-remove-flt" data-flt-id="${esc2(f.id)}">\xD7</button>
      </div>`;
    }).join("");
    const gbHtml = m.groupBy.map((g, gi) => {
      const t = tableById(g.tableId);
      const colOpts = (t?.columns || []).map((c) => `<option value="${esc2(c.name)}"${c.name === g.column ? " selected" : ""}>${esc2(c.name)}</option>`).join("");
      return `<div class="qb-row"><select class="qb-m-gb-table" data-gb-idx="${gi}">${m.tables.map((tb) => `<option value="${esc2(tb.id)}"${tb.id === g.tableId ? " selected" : ""}>${esc2(tb.alias)}</option>`).join("")}</select><select class="qb-m-gb-col" data-gb-idx="${gi}">${colOpts}</select><button type="button" class="qb-m-remove-gb" data-gb-idx="${gi}">\xD7</button></div>`;
    }).join("");
    const obHtml = m.orderBy.map((o, oi) => {
      const t = tableById(o.tableId);
      const colOpts = (t?.columns || []).map((c) => `<option value="${esc2(c.name)}"${c.name === o.column ? " selected" : ""}>${esc2(c.name)}</option>`).join("");
      return `<div class="qb-row"><select class="qb-m-ob-table" data-ob-idx="${oi}">${m.tables.map((tb) => `<option value="${esc2(tb.id)}"${tb.id === o.tableId ? " selected" : ""}>${esc2(tb.alias)}</option>`).join("")}</select><select class="qb-m-ob-col" data-ob-idx="${oi}">${colOpts}</select><select class="qb-m-ob-dir" data-ob-idx="${oi}"><option value="ASC"${o.direction === "ASC" ? " selected" : ""}>ASC</option><option value="DESC"${o.direction === "DESC" ? " selected" : ""}>DESC</option></select><button type="button" class="qb-m-remove-ob" data-ob-idx="${oi}">\xD7</button></div>`;
    }).join("");
    host.innerHTML = `
<div class="qb-multi-section qb-section">
  <div class="qb-header">\u25BC Tables</div>
  <div class="qb-body">
    <ul class="qb-m-table-list">${tablesHtml}</ul>
  </div>
</div>
<div class="qb-multi-section qb-section">
  <div class="qb-header">\u25BC JOINs</div>
  <div class="qb-body">
    ${joinsHtml}
    <div class="qb-row" style="margin-top:0.5rem;flex-wrap:wrap;align-items:flex-end;">
      <label>Left</label>
      <select id="qb-m-join-left-t">${instOpts}</select>
      <select id="qb-m-join-left-c"></select>
      <select id="qb-m-join-type"><option value="INNER">INNER</option><option value="LEFT">LEFT</option><option value="RIGHT">RIGHT</option></select>
      <label>Right table</label>
      <select id="qb-m-join-right-base">${schemaOpts ? `<option value="">\u2014 pick \u2014</option>${schemaOpts}` : '<option value="">(load schema)</option>'}</select>
      <select id="qb-m-join-right-c"></select>
      <button type="button" id="qb-m-join-add">Add JOIN</button>
    </div>
    <p class="meta" style="margin-top:0.35rem;">Connects the <em>right</em> base table as a new instance (<code>tN</code>) or joins two existing instances when the right table already exists and you pick matching columns.</p>
  </div>
</div>
<div class="qb-multi-section qb-section">
  <div class="qb-header">\u25BC SELECT columns</div>
  <div class="qb-body">
    ${selColsHtml || '<p class="meta">No columns selected.</p>'}
    <button type="button" id="qb-m-add-sel">+ Add column</button>
  </div>
</div>
<div class="qb-multi-section qb-section">
  <div class="qb-header">\u25BC WHERE</div>
  <div class="qb-body">
    ${filtersHtml || '<p class="meta">No filters.</p>'}
    <button type="button" id="qb-m-add-flt">+ Add condition</button>
  </div>
</div>
<div class="qb-multi-section qb-section">
  <div class="qb-header">\u25BC GROUP BY</div>
  <div class="qb-body">
    ${gbHtml || '<p class="meta">None</p>'}
    <button type="button" id="qb-m-add-gb">+ Add GROUP BY</button>
  </div>
</div>
<div class="qb-multi-section qb-section">
  <div class="qb-header">\u25BC ORDER BY</div>
  <div class="qb-body">
    ${obHtml || '<p class="meta">None</p>'}
    <button type="button" id="qb-m-add-ob">+ Add ORDER BY</button>
  </div>
</div>
<div class="qb-row" style="margin-top:0.5rem;"><label>LIMIT</label><input type="number" id="qb-m-limit" min="1" max="1000" value="${m.limit ?? 200}"/></div>
`;
    fillJoinColumnSelects();
    wireMultiRoot(host);
  }
  function fillJoinColumnSelects() {
    if (!_multiModel) return;
    const leftT = document.getElementById("qb-m-join-left-t");
    const leftC = document.getElementById("qb-m-join-left-c");
    const rightB = document.getElementById("qb-m-join-right-base");
    const rightC = document.getElementById("qb-m-join-right-c");
    if (!leftT || !leftC) return;
    const tid = leftT.value;
    const t = tableById(tid);
    const prevL = leftC.value;
    leftC.innerHTML = (t?.columns || []).map((c) => `<option value="${esc2(c.name)}">${esc2(c.name)}</option>`).join("");
    if (prevL && (t?.columns || []).some((c) => c.name === prevL)) leftC.value = prevL;
    if (rightB && rightC) {
      const base = rightB.value;
      if (base) {
        const cols = tableColumnsFromSchema(base);
        const prevR = rightC.value;
        rightC.innerHTML = cols.map((c) => `<option value="${esc2(c.name)}">${esc2(c.name)}</option>`).join("");
        if (prevR && cols.some((c) => c.name === prevR)) rightC.value = prevR;
      } else {
        rightC.innerHTML = "";
      }
    }
  }
  async function suggestFkForJoin() {
    const leftT = document.getElementById("qb-m-join-left-t");
    const leftC = document.getElementById("qb-m-join-left-c");
    const rightB = document.getElementById("qb-m-join-right-base");
    const rightC = document.getElementById("qb-m-join-right-c");
    if (!leftT || !leftC || !rightB || !rightC || !_multiModel) return;
    const tbl = tableById(leftT.value);
    if (!tbl) return;
    const fks = await loadFkMeta(tbl.baseTable);
    const fk = (fks || []).find((x) => x.fromColumn === leftC.value);
    if (fk && fk.toTable) {
      rightB.value = fk.toTable;
      fillJoinColumnSelects();
      if (fk.toColumn) rightC.value = fk.toColumn;
    }
  }
  function wireMultiRoot(host) {
    const leftT = document.getElementById("qb-m-join-left-t");
    const leftC = document.getElementById("qb-m-join-left-c");
    const rightB = document.getElementById("qb-m-join-right-base");
    if (leftT) leftT.addEventListener("change", () => {
      fillJoinColumnSelects();
      void suggestFkForJoin();
    });
    if (leftC) leftC.addEventListener("change", () => {
      void suggestFkForJoin();
    });
    if (rightB) rightB.addEventListener("change", () => fillJoinColumnSelects());
    host.querySelector("#qb-m-join-add")?.addEventListener("click", () => {
      if (!_multiModel) return;
      const ltid = document.getElementById("qb-m-join-left-t").value;
      const lc = document.getElementById("qb-m-join-left-c").value;
      const jt = document.getElementById("qb-m-join-type").value;
      const rb = document.getElementById("qb-m-join-right-base").value;
      const rc = document.getElementById("qb-m-join-right-c").value;
      if (!ltid || !lc || !rb || !rc) {
        alert("Pick left column, right table, and right column for the JOIN.");
        return;
      }
      const leftInst = tableById(ltid);
      if (!leftInst) return;
      let rightInst = _multiModel.tables.find((t) => t.baseTable === rb && t.id !== ltid);
      if (!rightInst) {
        const alias = nextAlias();
        const cols = tableColumnsFromSchema(rb);
        rightInst = { id: makeId("tb"), baseTable: rb, alias, columns: cols };
        _multiModel.tables.push(rightInst);
        for (const c of cols) {
          _multiModel.selectedColumns.push({ tableId: rightInst.id, column: c.name });
        }
      }
      _multiModel.joins.push({
        id: makeId("jn"),
        leftTableId: ltid,
        leftColumn: lc,
        rightTableId: rightInst.id,
        rightColumn: rc,
        type: jt === "LEFT" || jt === "RIGHT" || jt === "INNER" ? jt : "INNER"
      });
      renderMultiRoot();
      notify();
    });
    host.querySelectorAll(".qb-m-remove-join").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-join-id");
        if (!_multiModel || !id) return;
        _multiModel.joins = _multiModel.joins.filter((j) => j.id !== id);
        renderMultiRoot();
        notify();
      });
    });
    host.querySelectorAll(".qb-m-remove-table").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-table-id");
        if (!_multiModel || !id || _multiModel.tables[0]?.id === id) return;
        _multiModel.joins = _multiModel.joins.filter((j) => j.leftTableId !== id && j.rightTableId !== id);
        _multiModel.tables = _multiModel.tables.filter((t) => t.id !== id);
        syncSelectedColumnsAfterTableRemoved(id);
        renderMultiRoot();
        notify();
      });
    });
    host.querySelector("#qb-m-add-sel")?.addEventListener("click", () => {
      if (!_multiModel || !_multiModel.tables[0]) return;
      const t0 = _multiModel.tables[0];
      const c0 = t0.columns[0]?.name;
      if (!c0) return;
      _multiModel.selectedColumns.push({ tableId: t0.id, column: c0 });
      renderMultiRoot();
      notify();
    });
    host.querySelectorAll(".qb-m-sel-table").forEach((el) => {
      el.addEventListener("change", () => {
        const idx = Number(el.dataset.selIdx);
        const tid = el.value;
        if (!_multiModel || Number.isNaN(idx)) return;
        const t = tableById(tid);
        const col = t?.columns[0]?.name;
        if (!col) return;
        _multiModel.selectedColumns[idx] = { tableId: tid, column: col, aggregation: _multiModel.selectedColumns[idx]?.aggregation };
        renderMultiRoot();
        notify();
      });
    });
    host.querySelectorAll(".qb-m-sel-col").forEach((el) => {
      el.addEventListener("change", () => {
        const idx = Number(el.dataset.selIdx);
        if (!_multiModel || Number.isNaN(idx)) return;
        _multiModel.selectedColumns[idx].column = el.value;
        renderMultiRoot();
        notify();
      });
    });
    host.querySelectorAll(".qb-m-sel-agg").forEach((el) => {
      el.addEventListener("change", () => {
        const idx = Number(el.dataset.selIdx);
        if (!_multiModel || Number.isNaN(idx)) return;
        const v = el.value;
        const cur = _multiModel.selectedColumns[idx];
        _multiModel.selectedColumns[idx] = { ...cur, aggregation: v || void 0 };
        notify();
        renderMultiRoot();
      });
    });
    host.querySelectorAll(".qb-m-remove-sel").forEach((el) => {
      el.addEventListener("click", () => {
        const idx = Number(el.dataset.selIdx);
        if (!_multiModel || Number.isNaN(idx)) return;
        _multiModel.selectedColumns.splice(idx, 1);
        renderMultiRoot();
        notify();
      });
    });
    host.querySelector("#qb-m-add-flt")?.addEventListener("click", () => {
      if (!_multiModel || !_multiModel.tables[0]) return;
      const t0 = _multiModel.tables[0];
      const c0 = t0.columns[0]?.name;
      if (!c0) return;
      _multiModel.filters.push({
        id: makeId("flt"),
        tableId: t0.id,
        column: c0,
        operator: "=",
        value: "",
        conjunction: "AND"
      });
      renderMultiRoot();
      notify();
    });
    host.querySelectorAll(".qb-m-flt-table").forEach((el) => {
      el.addEventListener("change", () => {
        const id = el.dataset.fltId;
        const f = _multiModel?.filters.find((x) => x.id === id);
        if (!f) return;
        f.tableId = el.value;
        const t = tableById(f.tableId);
        f.column = t?.columns[0]?.name || f.column;
        renderMultiRoot();
        notify();
      });
    });
    host.querySelectorAll(".qb-m-flt-col").forEach((el) => {
      el.addEventListener("change", () => {
        const id = el.dataset.fltId;
        const f = _multiModel?.filters.find((x) => x.id === id);
        if (!f) return;
        f.column = el.value;
        renderMultiRoot();
        notify();
      });
    });
    host.querySelectorAll(".qb-m-flt-op").forEach((el) => {
      el.addEventListener("change", () => {
        const id = el.dataset.fltId;
        const f = _multiModel?.filters.find((x) => x.id === id);
        if (!f) return;
        f.operator = el.value;
        if (f.operator === "IS NULL" || f.operator === "IS NOT NULL") {
          delete f.value;
          delete f.values;
        } else if (f.operator === "IN") {
          delete f.value;
          f.values = [];
        } else {
          delete f.values;
          if (f.value === void 0) f.value = "";
        }
        renderMultiRoot();
        notify();
      });
    });
    host.querySelectorAll(".qb-m-flt-val").forEach((el) => {
      el.addEventListener("input", () => {
        const id = el.dataset.fltId;
        const f = _multiModel?.filters.find((x) => x.id === id);
        if (!f) return;
        const raw = el.value;
        if (f.operator === "IN") {
          const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
          f.values = parts.map((p) => {
            const n = Number(p);
            return !Number.isNaN(n) && p !== "" && String(n) === p ? n : p;
          });
        } else {
          const n = Number(raw);
          f.value = !Number.isNaN(n) && raw.trim() !== "" && String(n) === raw.trim() ? n : raw;
        }
        notify();
      });
    });
    host.querySelectorAll(".qb-m-flt-conn").forEach((el) => {
      el.addEventListener("change", () => {
        const id = el.dataset.fltId;
        const f = _multiModel?.filters.find((x) => x.id === id);
        if (!f) return;
        f.conjunction = el.value;
        notify();
      });
    });
    host.querySelectorAll(".qb-m-remove-flt").forEach((el) => {
      el.addEventListener("click", () => {
        const id = el.dataset.fltId;
        if (!_multiModel || !id) return;
        _multiModel.filters = _multiModel.filters.filter((x) => x.id !== id);
        renderMultiRoot();
        notify();
      });
    });
    host.querySelector("#qb-m-add-gb")?.addEventListener("click", () => {
      if (!_multiModel || !_multiModel.tables[0]) return;
      const t0 = _multiModel.tables[0];
      const c0 = t0.columns[0]?.name;
      if (!c0) return;
      _multiModel.groupBy.push({ tableId: t0.id, column: c0 });
      renderMultiRoot();
      notify();
    });
    host.querySelectorAll(".qb-m-gb-table").forEach((el) => {
      el.addEventListener("change", () => {
        const idx = Number(el.dataset.gbIdx);
        if (!_multiModel || Number.isNaN(idx)) return;
        _multiModel.groupBy[idx].tableId = el.value;
        const t = tableById(_multiModel.groupBy[idx].tableId);
        _multiModel.groupBy[idx].column = t?.columns[0]?.name || "";
        renderMultiRoot();
        notify();
      });
    });
    host.querySelectorAll(".qb-m-gb-col").forEach((el) => {
      el.addEventListener("change", () => {
        const idx = Number(el.dataset.gbIdx);
        if (!_multiModel || Number.isNaN(idx)) return;
        _multiModel.groupBy[idx].column = el.value;
        notify();
      });
    });
    host.querySelectorAll(".qb-m-remove-gb").forEach((el) => {
      el.addEventListener("click", () => {
        const idx = Number(el.dataset.gbIdx);
        if (!_multiModel || Number.isNaN(idx)) return;
        _multiModel.groupBy.splice(idx, 1);
        renderMultiRoot();
        notify();
      });
    });
    host.querySelector("#qb-m-add-ob")?.addEventListener("click", () => {
      if (!_multiModel || !_multiModel.tables[0]) return;
      const t0 = _multiModel.tables[0];
      const c0 = t0.columns[0]?.name;
      if (!c0) return;
      _multiModel.orderBy.push({ tableId: t0.id, column: c0, direction: "ASC" });
      renderMultiRoot();
      notify();
    });
    host.querySelectorAll(".qb-m-ob-table").forEach((el) => {
      el.addEventListener("change", () => {
        const idx = Number(el.dataset.obIdx);
        if (!_multiModel || Number.isNaN(idx)) return;
        _multiModel.orderBy[idx].tableId = el.value;
        const t = tableById(_multiModel.orderBy[idx].tableId);
        _multiModel.orderBy[idx].column = t?.columns[0]?.name || "";
        renderMultiRoot();
        notify();
      });
    });
    host.querySelectorAll(".qb-m-ob-col").forEach((el) => {
      el.addEventListener("change", () => {
        const idx = Number(el.dataset.obIdx);
        if (!_multiModel || Number.isNaN(idx)) return;
        _multiModel.orderBy[idx].column = el.value;
        notify();
      });
    });
    host.querySelectorAll(".qb-m-ob-dir").forEach((el) => {
      el.addEventListener("change", () => {
        const idx = Number(el.dataset.obIdx);
        if (!_multiModel || Number.isNaN(idx)) return;
        _multiModel.orderBy[idx].direction = el.value;
        notify();
      });
    });
    host.querySelectorAll(".qb-m-remove-ob").forEach((el) => {
      el.addEventListener("click", () => {
        const idx = Number(el.dataset.obIdx);
        if (!_multiModel || Number.isNaN(idx)) return;
        _multiModel.orderBy.splice(idx, 1);
        renderMultiRoot();
        notify();
      });
    });
    const lim = document.getElementById("qb-m-limit");
    if (lim) {
      lim.addEventListener("input", () => {
        if (!_multiModel) return;
        const n = parseInt(lim.value, 10);
        _multiModel.limit = Number.isFinite(n) && n > 0 ? n : null;
        notify();
      });
    }
  }
  function captureMultiPersistable() {
    if (!_multiModel) return null;
    return {
      modelVersion: 1,
      tables: _multiModel.tables.map((t) => ({ id: t.id, baseTable: t.baseTable, alias: t.alias })),
      joins: _multiModel.joins,
      selectedColumns: _multiModel.selectedColumns,
      filters: _multiModel.filters,
      groupBy: _multiModel.groupBy,
      orderBy: _multiModel.orderBy,
      limit: _multiModel.limit
    };
  }
  async function restoreMultiFromPersistable(blob) {
    if (!blob || blob.modelVersion !== 1 || !Array.isArray(blob.tables)) return;
    await loadSchemaMeta();
    const tables = blob.tables.map((row) => ({
      id: row.id,
      baseTable: row.baseTable,
      alias: row.alias,
      columns: tableColumnsFromSchema(row.baseTable)
    }));
    _multiModel = {
      modelVersion: 1,
      tables,
      joins: blob.joins || [],
      selectedColumns: blob.selectedColumns || [],
      filters: blob.filters || [],
      groupBy: blob.groupBy || [],
      orderBy: blob.orderBy || [],
      limit: typeof blob.limit === "number" ? blob.limit : 200
    };
    _multiRootTable = tables[0]?.baseTable ?? null;
    renderMultiRoot();
    notify();
  }

  // assets/web/pagination.ts
  function goToOffset(newOffset) {
    setOffset(Math.max(0, newOffset));
    const offsetInput = document.getElementById("pagination-offset");
    if (offsetInput) offsetInput.value = String(offset);
    saveTableState(currentTableName);
    loadTable(currentTableName);
  }
  function updatePaginationBar(total) {
    const statusEl = document.getElementById("pagination-status");
    const firstBtn = (
      /** @type {HTMLButtonElement|null} */
      document.getElementById("pagination-first")
    );
    const prevBtn = (
      /** @type {HTMLButtonElement|null} */
      document.getElementById("pagination-prev")
    );
    const nextBtn = (
      /** @type {HTMLButtonElement|null} */
      document.getElementById("pagination-next")
    );
    const lastBtn = (
      /** @type {HTMLButtonElement|null} */
      document.getElementById("pagination-last")
    );
    const pagesEl = document.getElementById("pagination-pages");
    const offsetInput = (
      /** @type {HTMLInputElement|null} */
      document.getElementById("pagination-offset")
    );
    if (!pagesEl || !offsetInput) return;
    const currentPage = limit > 0 ? Math.floor(offset / limit) + 1 : 1;
    const totalPages = total != null && total > 0 && limit > 0 ? Math.max(1, Math.ceil(total / limit)) : null;
    const selectedPage = totalPages != null && currentPage > totalPages ? totalPages : currentPage;
    if (statusEl) {
      if (total != null) {
        const from = offset + 1;
        const to = Math.min(offset + limit, total);
        statusEl.textContent = total === 0 ? "0 rows" : "Showing " + from + "\u2013" + to + " of " + total.toLocaleString() + " rows";
      } else {
        statusEl.textContent = "Page " + currentPage + " (total unknown)";
      }
    }
    const onFirstPage = offset <= 0;
    if (firstBtn) firstBtn.disabled = onFirstPage;
    if (prevBtn) prevBtn.disabled = onFirstPage;
    const onLastPage = totalPages != null && currentPage >= totalPages;
    if (nextBtn) nextBtn.disabled = onLastPage;
    if (lastBtn) lastBtn.disabled = onLastPage;
    pagesEl.innerHTML = "";
    const pageLabel = document.createElement("label");
    pageLabel.setAttribute("for", "pagination-page");
    pageLabel.textContent = "Page ";
    pageLabel.className = "pagination-page-label";
    pagesEl.appendChild(pageLabel);
    const pageSel = document.createElement("select");
    pageSel.id = "pagination-page";
    pageSel.setAttribute("aria-label", "Current page");
    if (totalPages != null) {
      for (let p = 1; p <= totalPages; p++) {
        const opt = document.createElement("option");
        opt.value = String(p);
        opt.textContent = String(p);
        if (p === selectedPage) opt.selected = true;
        pageSel.appendChild(opt);
      }
    } else {
      const opt = document.createElement("option");
      opt.value = "1";
      opt.textContent = "1";
      opt.selected = true;
      pageSel.appendChild(opt);
    }
    pagesEl.appendChild(pageSel);
    const ofSpan = document.createElement("span");
    ofSpan.id = "pagination-of";
    ofSpan.className = "pagination-of";
    ofSpan.textContent = totalPages != null ? " of " + totalPages : "";
    pagesEl.appendChild(ofSpan);
    pageSel.addEventListener("change", function() {
      const p = parseInt(this.value, 10) || 1;
      goToOffset((p - 1) * limit);
    });
    offsetInput.value = String(offset);
  }
  function setupPagination() {
    const bar = document.getElementById("pagination-bar");
    if (!bar) return;
    const limitSel = (
      /** @type {HTMLSelectElement} */
      document.getElementById("pagination-limit")
    );
    limitSel.innerHTML = LIMIT_OPTIONS.map((n) => '<option value="' + n + '"' + (n === limit ? " selected" : "") + ">" + n + "</option>").join("");
    const total = currentTableName ? tableCounts[currentTableName] ?? null : null;
    updatePaginationBar(total);
    bar.style.display = getScope() === "schema" ? "none" : "flex";
  }
  function bindColumnTableEvents() {
  }
  function ensureColumnConfig(tableName, dataKeys) {
    var config = getColumnConfig(tableName);
    if (!config || !config.order) {
      config = { order: dataKeys.slice(), hidden: [], pinned: [] };
      setColumnConfig(tableName, config);
      return config;
    }
    var order = config.order.filter(function(k) {
      return dataKeys.indexOf(k) >= 0;
    });
    dataKeys.forEach(function(k) {
      if (order.indexOf(k) < 0) order.push(k);
    });
    config.order = order;
    if (!config.hidden) config.hidden = [];
    if (!config.pinned) config.pinned = [];
    setColumnConfig(tableName, config);
    return config;
  }
  function applyColumnConfigAndRender() {
    if (!currentTableName || !currentTableJson) return;
    saveTableState(currentTableName);
    renderTableView(currentTableName, currentTableJson);
  }
  function populateColumnChooserList() {
    var listEl2 = document.getElementById("column-chooser-list");
    listEl2.innerHTML = "";
    if (!currentTableName || !currentTableJson || !currentTableJson.length) return;
    var dataKeys = Object.keys(currentTableJson[0]);
    var config = ensureColumnConfig(currentTableName, dataKeys);
    config.order.forEach(function(key) {
      var li = document.createElement("li");
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.id = "col-chooser-" + key.replace(/[^a-zA-Z0-9_]/g, "_");
      cb.checked = config.hidden.indexOf(key) < 0;
      cb.addEventListener("change", function() {
        if (this.checked) {
          config.hidden = config.hidden.filter(function(k) {
            return k !== key;
          });
        } else {
          config.hidden.push(key);
        }
        setColumnConfig(currentTableName, config);
        applyColumnConfigAndRender();
        populateColumnChooserList();
      });
      var label = document.createElement("label");
      label.htmlFor = cb.id;
      label.textContent = key;
      var pinBtn = document.createElement("button");
      pinBtn.type = "button";
      pinBtn.textContent = config.pinned.indexOf(key) >= 0 ? "Unpin" : "Pin";
      pinBtn.title = config.pinned.indexOf(key) >= 0 ? "Unpin this column" : "Pin this column to the left";
      pinBtn.style.fontSize = "11px";
      pinBtn.addEventListener("click", function() {
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
      listEl2.appendChild(li);
    });
  }

  // assets/web/query-builder.ts
  var _qbColTypes = {};
  function buildQueryBuilderHtml(tableName, colTypes) {
    var cols = Object.keys(colTypes || {});
    if (cols.length === 0) return "";
    _qbColTypes = colTypes;
    var html = '<div class="qb-section">';
    html += '<div class="qb-header" id="qb-toggle">\u25BC Query builder</div>';
    html += '<div id="qb-body" class="qb-body collapsed">';
    html += '<div class="qb-mode-toggle">';
    html += '<button type="button" id="qb-mode-visual" class="qb-mode-btn active" title="Visual query builder">Visual</button>';
    html += '<button type="button" id="qb-mode-raw" class="qb-mode-btn" title="Edit SQL directly">Raw SQL</button>';
    html += "</div>";
    html += '<div class="qb-mode-toggle qb-scope-toggle" title="Single-table keeps the classic form; multi-table adds JOINs, GROUP BY, and multi ORDER BY">';
    html += '<button type="button" id="qb-scope-single" class="qb-mode-btn active">Single table</button>';
    html += '<button type="button" id="qb-scope-multi" class="qb-mode-btn">Multi-table</button>';
    html += "</div>";
    html += '<div id="qb-visual-panel">';
    html += '<div id="qb-simple-visual">';
    html += '<div class="qb-row"><label>SELECT</label><div class="qb-columns" id="qb-columns">';
    cols.forEach(function(c) {
      html += '<label><input type="checkbox" value="' + esc2(c) + '" checked> ' + esc2(c) + "</label>";
    });
    html += "</div></div>";
    html += '<div class="qb-row"><label>WHERE</label><div style="flex:1;">';
    html += '<div id="qb-where-list"></div>';
    html += '<button type="button" id="qb-add-where" style="font-size:11px;" title="Add another WHERE condition">+ Add condition</button>';
    html += "</div></div>";
    html += '<div class="qb-row"><label>ORDER BY</label>';
    html += '<select id="qb-order-col"><option value="">None</option>';
    cols.forEach(function(c) {
      html += '<option value="' + esc2(c) + '">' + esc2(c) + "</option>";
    });
    html += "</select>";
    html += '<select id="qb-order-dir"><option value="ASC">ASC</option><option value="DESC">DESC</option></select>';
    html += "</div>";
    html += '<div class="qb-row"><label>LIMIT</label>';
    html += '<input type="number" id="qb-limit" value="200" min="1" max="1000" style="width:5rem;">';
    html += "</div>";
    html += "</div>";
    html += '<div id="qb-multi-panel" style="display:none;">';
    html += '<p class="meta" style="margin:0 0 0.5rem 0;">Build JOINs from the root table. Preview shows validation errors until the graph is valid.</p>';
    html += '<div id="qb-multi-root"></div>';
    html += "</div>";
    html += '<div class="qb-preview" id="qb-preview"></div>';
    html += "</div>";
    html += '<div id="qb-raw-panel" style="display:none;">';
    html += '<textarea id="qb-raw-input" class="qb-raw-textarea" rows="4" spellcheck="false" placeholder="SELECT * FROM &quot;' + esc2(tableName) + '&quot; LIMIT 200"></textarea>';
    html += "</div>";
    html += '<div class="qb-row" style="margin-top:0.35rem;">';
    html += '<button type="button" id="qb-run" title="Execute the built query">Run query</button>';
    html += '<button type="button" id="qb-reset" title="Return to table view">Reset to table view</button>';
    html += "</div>";
    html += "</div></div>";
    return html;
  }
  function getWhereOps(columnType) {
    var type = (columnType || "").toUpperCase();
    if (type === "TEXT" || type.indexOf("VARCHAR") >= 0 || type.indexOf("CHAR") >= 0) {
      return [
        { val: "LIKE", label: "contains" },
        { val: "=", label: "equals" },
        { val: "NOT_LIKE", label: "not contains" },
        { val: "LIKE_START", label: "starts with" },
        { val: "IS NULL", label: "is null" },
        { val: "IS NOT NULL", label: "is not null" }
      ];
    } else if (type === "INTEGER" || type === "REAL" || type.indexOf("INT") >= 0 || type.indexOf("FLOAT") >= 0 || type.indexOf("DOUBLE") >= 0 || type.indexOf("NUM") >= 0 || type.indexOf("DECIMAL") >= 0) {
      return [
        { val: "=", label: "=" },
        { val: "!=", label: "!=" },
        { val: ">", label: ">" },
        { val: "<", label: "<" },
        { val: ">=", label: ">=" },
        { val: "<=", label: "<=" },
        { val: "IS NULL", label: "is null" },
        { val: "IS NOT NULL", label: "is not null" }
      ];
    } else if (type === "BLOB") {
      return [
        { val: "IS NULL", label: "is null" },
        { val: "IS NOT NULL", label: "is not null" }
      ];
    }
    return [
      { val: "=", label: "=" },
      { val: "!=", label: "!=" },
      { val: "LIKE", label: "contains" },
      { val: "IS NULL", label: "is null" },
      { val: "IS NOT NULL", label: "is not null" }
    ];
  }
  function addWhereClause(colTypes, preset) {
    var list = document.getElementById("qb-where-list");
    if (!list) return;
    var cols = Object.keys(colTypes || {});
    if (cols.length === 0) return;
    var isFirst = list.children.length === 0;
    var div = document.createElement("div");
    div.className = "qb-where-item";
    if (!isFirst) {
      var connSel = document.createElement("select");
      connSel.className = "qb-where-connector";
      connSel.title = "Combine with previous condition";
      var optAnd = document.createElement("option");
      optAnd.value = "AND";
      optAnd.textContent = "AND";
      var optOr = document.createElement("option");
      optOr.value = "OR";
      optOr.textContent = "OR";
      connSel.appendChild(optAnd);
      connSel.appendChild(optOr);
      if (preset && preset.connector === "OR") connSel.value = "OR";
      connSel.addEventListener("change", updateQbPreview);
      div.appendChild(connSel);
    }
    var colSel = document.createElement("select");
    colSel.className = "qb-where-col";
    cols.forEach(function(c) {
      var opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      colSel.appendChild(opt);
    });
    if (preset && preset.column) colSel.value = preset.column;
    var opSel = document.createElement("select");
    opSel.className = "qb-where-op";
    var valInput = document.createElement("input");
    valInput.type = "text";
    valInput.className = "qb-where-val";
    valInput.placeholder = "value";
    valInput.style.width = "8rem";
    var removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.textContent = "\xD7";
    removeBtn.title = "Remove condition";
    removeBtn.addEventListener("click", function() {
      div.remove();
      updateQbPreview();
    });
    var presetValue = preset ? preset.value : null;
    function updateOps() {
      var type = colTypes[colSel.value] || "";
      var ops = getWhereOps(type);
      opSel.innerHTML = "";
      ops.forEach(function(o) {
        var opt = document.createElement("option");
        opt.value = o.val;
        opt.textContent = o.label;
        opSel.appendChild(opt);
      });
      if (preset && preset.op) {
        opSel.value = preset.op;
        preset = null;
      }
      var op = opSel.value;
      valInput.style.display = op === "IS NULL" || op === "IS NOT NULL" ? "none" : "";
    }
    colSel.addEventListener("change", function() {
      updateOps();
      updateQbPreview();
    });
    opSel.addEventListener("change", function() {
      var op = this.value;
      valInput.style.display = op === "IS NULL" || op === "IS NOT NULL" ? "none" : "";
      updateQbPreview();
    });
    valInput.addEventListener("input", updateQbPreview);
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
    checkboxes.forEach(function(cb) {
      if (cb.checked) selectedCols.push(cb.value);
    });
    var selectPart = selectedCols.length > 0 ? selectedCols.map(function(c) {
      return '"' + c + '"';
    }).join(", ") : "*";
    var whereParts = [];
    var whereConnectors = [];
    var whereItems = document.querySelectorAll("#qb-where-list .qb-where-item");
    whereItems.forEach(function(item) {
      var connSel = item.querySelector(".qb-where-connector");
      if (connSel) whereConnectors.push(connSel.value);
      var col = item.querySelector(".qb-where-col").value;
      var op = item.querySelector(".qb-where-op").value;
      var val = item.querySelector(".qb-where-val").value;
      var part;
      if (op === "IS NULL") {
        part = '"' + col + '" IS NULL';
      } else if (op === "IS NOT NULL") {
        part = '"' + col + '" IS NOT NULL';
      } else if (op === "LIKE") {
        part = '"' + col + `" LIKE '%` + val.replace(/'/g, "''") + "%'";
      } else if (op === "NOT_LIKE") {
        part = '"' + col + `" NOT LIKE '%` + val.replace(/'/g, "''") + "%'";
      } else if (op === "LIKE_START") {
        part = '"' + col + `" LIKE '` + val.replace(/'/g, "''") + "%'";
      } else {
        var isNum = !isNaN(Number(val)) && val.trim() !== "";
        var sqlVal = isNum ? val : "'" + val.replace(/'/g, "''") + "'";
        part = '"' + col + '" ' + op + " " + sqlVal;
      }
      whereParts.push(part);
    });
    var orderCol = document.getElementById("qb-order-col").value;
    var orderDir = document.getElementById("qb-order-dir").value;
    var qbLimit = parseInt(document.getElementById("qb-limit").value || "200", 10) || 200;
    var sql = "SELECT " + selectPart + ' FROM "' + tableName + '"';
    if (whereParts.length > 0) {
      var whereClause = whereParts[0];
      for (var i = 1; i < whereParts.length; i++) {
        whereClause += " " + (whereConnectors[i - 1] || "AND") + " " + whereParts[i];
      }
      sql += " WHERE " + whereClause;
    }
    if (orderCol) sql += ' ORDER BY "' + orderCol + '" ' + orderDir;
    sql += " LIMIT " + qbLimit;
    return sql;
  }
  function updateQbPreview() {
    var preview = document.getElementById("qb-preview");
    if (!preview || !currentTableName) return;
    if (getQbScope() === "multi") {
      preview.textContent = getMultiPreviewText();
      return;
    }
    preview.textContent = buildQueryFromBuilder(currentTableName);
  }
  function runQueryBuilder() {
    var rawPanel = document.getElementById("qb-raw-panel");
    var rawInput = document.getElementById("qb-raw-input");
    var isRawMode = rawPanel && rawPanel.style.display !== "none";
    var sql;
    if (isRawMode && rawInput) {
      sql = rawInput.value.trim();
    } else if (getQbScope() === "multi") {
      var multiSql = tryGetMultiSql();
      if (!multiSql) {
        alert("Fix validation errors shown in the preview, or switch to Raw SQL.");
        return;
      }
      sql = multiSql;
    } else {
      sql = buildQueryFromBuilder(currentTableName);
    }
    if (!sql) return;
    var runBtn = document.getElementById("qb-run");
    if (runBtn) {
      runBtn.disabled = true;
      setButtonBusy(runBtn, true, "Running\u2026");
    }
    var savedState = captureQueryBuilderState();
    fetch("/api/sql", authOpts({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql })
    })).then(function(r) {
      return r.json().then(function(d) {
        return { ok: r.ok, data: d };
      });
    }).then(function(result) {
      if (!result.ok) {
        alert("Query error: " + (result.data.error || "Unknown error"));
        return;
      }
      setQueryBuilderActive(true);
      setQueryBuilderState(savedState);
      var rows = result.data.rows || [];
      var content = document.getElementById("content");
      var fkMap = {};
      var cachedFks = fkMetaCache[currentTableName] || [];
      (cachedFks || []).forEach(function(fk) {
        fkMap[fk.fromColumn] = fk;
      });
      var colTypes = tableColumnTypes[currentTableName] || {};
      var html = '<p class="meta">Query builder result: ' + rows.length + " row(s)</p>";
      html += '<p class="meta" style="font-family:monospace;font-size:11px;color:var(--muted);">' + esc2(sql) + "</p>";
      html += buildQueryBuilderHtml(currentTableName, colTypes);
      var rawTableHtml = wrapDataTableInScroll(buildDataTableHtml(rows, fkMap, colTypes, getColumnConfig(currentTableName)));
      rawTableHtml += buildTableStatusBar(tableCounts[currentTableName] || null, 0, rows.length, rows.length, getVisibleColumnCount(Object.keys(rows[0] || {}), getColumnConfig(currentTableName)));
      var resultsLabel = rows.length + " row" + (rows.length !== 1 ? "s" : "");
      html += '<div class="results-table-wrap" role="region" aria-label="Results"><div class="results-table-heading">\u25B2 Results \u2014 ' + resultsLabel + '</div><div class="results-table-body">' + rawTableHtml + "</div></div>";
      content.innerHTML = html;
      bindQueryBuilderEvents(colTypes);
      restoreQueryBuilderUIState(savedState);
      bindColumnTableEvents();
      bindResultsToggle();
      var body = document.getElementById("qb-body");
      var toggle = document.getElementById("qb-toggle");
      if (body) body.classList.remove("collapsed");
      if (toggle) toggle.textContent = "\u25B2 Query builder";
      saveTableState(currentTableName);
    }).catch(function(e) {
      alert("Error: " + e.message);
    }).finally(function() {
      if (runBtn) {
        runBtn.disabled = false;
        setButtonBusy(runBtn, false, "Run query");
      }
    });
  }
  function resetQueryBuilder() {
    setQueryBuilderActive(false);
    setQueryBuilderState(null);
    saveTableState(currentTableName);
    if (currentTableName && currentTableJson) {
      renderTableView(currentTableName, currentTableJson);
    }
  }
  function bindQueryBuilderEvents(colTypes) {
    var toggle = document.getElementById("qb-toggle");
    var body = document.getElementById("qb-body");
    if (toggle && body) {
      toggle.addEventListener("click", function() {
        var collapsed = body.classList.contains("collapsed");
        body.classList.toggle("collapsed", !collapsed);
        toggle.textContent = collapsed ? "\u25B2 Query builder" : "\u25BC Query builder";
      });
    }
    var addBtn = document.getElementById("qb-add-where");
    if (addBtn) addBtn.addEventListener("click", function() {
      addWhereClause(colTypes);
    });
    var runBtn = document.getElementById("qb-run");
    if (runBtn) runBtn.addEventListener("click", runQueryBuilder);
    var resetBtn = document.getElementById("qb-reset");
    if (resetBtn) resetBtn.addEventListener("click", resetQueryBuilder);
    var checkboxes = document.querySelectorAll('#qb-columns input[type="checkbox"]');
    checkboxes.forEach(function(cb) {
      cb.addEventListener("change", updateQbPreview);
    });
    var orderCol = document.getElementById("qb-order-col");
    var orderDir = document.getElementById("qb-order-dir");
    var qbLimit = document.getElementById("qb-limit");
    if (orderCol) orderCol.addEventListener("change", updateQbPreview);
    if (orderDir) orderDir.addEventListener("change", updateQbPreview);
    if (qbLimit) qbLimit.addEventListener("input", updateQbPreview);
    updateQbPreview();
    var visualBtn = document.getElementById("qb-mode-visual");
    var rawBtn = document.getElementById("qb-mode-raw");
    var visualPanel = document.getElementById("qb-visual-panel");
    var rawPanel = document.getElementById("qb-raw-panel");
    var rawInput = document.getElementById("qb-raw-input");
    var scopeSingle = document.getElementById("qb-scope-single");
    var scopeMulti = document.getElementById("qb-scope-multi");
    if (scopeSingle && scopeMulti) {
      setMultiChangeHandler(updateQbPreview);
      initMultiForTable(currentTableName, colTypes);
      void loadSchemaMeta().then(function() {
        if (getQbScope() === "multi") renderMultiRoot();
      });
      scopeSingle.addEventListener("click", function() {
        setQbScope("single");
        updateQbPreview();
      });
      scopeMulti.addEventListener("click", function() {
        initMultiForTable(currentTableName, colTypes);
        void loadSchemaMeta().then(function() {
          setQbScope("multi");
          updateQbPreview();
        });
      });
    }
    if (visualBtn && rawBtn && visualPanel && rawPanel) {
      visualBtn.addEventListener("click", function() {
        visualBtn.classList.add("active");
        rawBtn.classList.remove("active");
        visualPanel.style.display = "";
        rawPanel.style.display = "none";
      });
      rawBtn.addEventListener("click", function() {
        rawBtn.classList.add("active");
        visualBtn.classList.remove("active");
        visualPanel.style.display = "none";
        rawPanel.style.display = "";
        if (rawInput && currentTableName) {
          if (getQbScope() === "multi") {
            var ms = tryGetMultiSql();
            rawInput.value = ms || getMultiPreviewText();
          } else {
            rawInput.value = buildQueryFromBuilder(currentTableName);
          }
          rawInput.focus();
        }
      });
    }
  }
  function captureQueryBuilderState() {
    var state = {
      active: queryBuilderActive,
      qbScope: getQbScope(),
      multi: captureMultiPersistable(),
      selectedColumns: [],
      whereClauses: [],
      orderBy: "",
      orderDir: "ASC",
      limit: 200
    };
    var checkboxes = document.querySelectorAll('#qb-columns input[type="checkbox"]');
    checkboxes.forEach(function(cb) {
      if (cb.checked) state.selectedColumns.push(cb.value);
    });
    var whereItems = document.querySelectorAll("#qb-where-list .qb-where-item");
    whereItems.forEach(function(item) {
      var connSel = item.querySelector(".qb-where-connector");
      state.whereClauses.push({
        column: item.querySelector(".qb-where-col").value,
        op: item.querySelector(".qb-where-op").value,
        value: item.querySelector(".qb-where-val").value,
        connector: connSel ? connSel.value : "AND"
      });
    });
    var orderCol = document.getElementById("qb-order-col");
    var orderDir = document.getElementById("qb-order-dir");
    var qbLimit = document.getElementById("qb-limit");
    if (orderCol) state.orderBy = orderCol.value;
    if (orderDir) state.orderDir = orderDir.value;
    if (qbLimit) state.limit = parseInt(qbLimit.value || "200", 10) || 200;
    return state;
  }
  function restoreQueryBuilderUIState(state) {
    if (!state) return;
    if (state.qbScope === "multi" && state.multi) {
      void loadSchemaMeta().then(function() {
        return restoreMultiFromPersistable(state.multi);
      }).then(function() {
        setQbScope("multi");
        updateQbPreview();
      });
      return;
    }
    initMultiForTable(currentTableName, _qbColTypes);
    setQbScope("single");
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
          connector: wc.connector || "AND"
        });
      });
    }
    var orderCol = document.getElementById("qb-order-col");
    var orderDir = document.getElementById("qb-order-dir");
    var qbLimit = document.getElementById("qb-limit");
    if (orderCol && state.orderBy) orderCol.value = state.orderBy;
    if (orderDir && state.orderDir) orderDir.value = state.orderDir;
    if (qbLimit && state.limit) qbLimit.value = String(state.limit);
    updateQbPreview();
  }

  // assets/web/persistence.ts
  function collectProjectStorageKeys() {
    var keys = [];
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (!key) continue;
      if (key === PINNED_TABLES_KEY || key === NAV_HISTORY_KEY || key === SQL_HISTORY_KEY || key === BOOKMARKS_KEY || key.startsWith(TABLE_STATE_KEY_PREFIX) || key.startsWith(ANALYSIS_STORAGE_PREFIX)) {
        keys.push(key);
      }
    }
    return keys;
  }
  function clearStaleProjectStorage() {
    try {
      var baseEl = document.querySelector("base");
      var origin = baseEl ? baseEl.href.replace(/\/+$/, "") : location.origin;
      var prev = localStorage.getItem(SERVER_ORIGIN_KEY);
      if (prev === origin) return;
      console.log("[SDA] server origin changed: " + prev + " \u2192 " + origin + " \u2014 clearing stale project storage");
      collectProjectStorageKeys().forEach(function(k) {
        localStorage.removeItem(k);
      });
      localStorage.setItem(SERVER_ORIGIN_KEY, origin);
    } catch (e) {
    }
  }
  function getPinnedTables() {
    try {
      var raw = localStorage.getItem(PINNED_TABLES_KEY);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }
  function setPinnedTables(arr) {
    try {
      localStorage.setItem(PINNED_TABLES_KEY, JSON.stringify(arr));
    } catch (e) {
    }
  }
  function togglePinTable(name) {
    var pinned = getPinnedTables();
    var idx = pinned.indexOf(name);
    if (idx >= 0) {
      pinned.splice(idx, 1);
    } else {
      pinned.push(name);
    }
    setPinnedTables(pinned);
    renderTableList(lastKnownTables || []);
  }
  function getColumnConfig(tableName) {
    if (!tableName) return null;
    return tableColumnConfig[tableName] || null;
  }
  function setColumnConfig(tableName, config) {
    if (!tableName) return;
    tableColumnConfig[tableName] = config;
  }
  function saveTableState(tableName) {
    if (!tableName) return;
    var state = {
      rowFilter: document.getElementById("row-filter").value || "",
      limit,
      offset,
      displayFormat: typeof displayFormat !== "undefined" ? displayFormat : "raw",
      queryBuilder: typeof captureQueryBuilderState === "function" ? captureQueryBuilderState() : null,
      columnConfig: getColumnConfig(tableName) || null
    };
    try {
      localStorage.setItem(TABLE_STATE_KEY_PREFIX + tableName, JSON.stringify(state));
    } catch (e) {
    }
  }
  function restoreTableState(tableName) {
    try {
      var raw = localStorage.getItem(TABLE_STATE_KEY_PREFIX + tableName);
      if (!raw) return;
      var state = JSON.parse(raw);
      if (state.rowFilter != null) document.getElementById("row-filter").value = state.rowFilter;
      if (typeof state.limit === "number" && state.limit > 0) setLimit(state.limit);
      if (typeof state.offset === "number" && state.offset >= 0) setOffset(state.offset);
      if (state.displayFormat && typeof displayFormat !== "undefined") {
        setDisplayFormat(state.displayFormat);
        var sel = document.getElementById("display-format-toggle");
        if (sel) sel.value = displayFormat;
      }
      if (state.queryBuilder) setQueryBuilderState(state.queryBuilder);
      if (state.columnConfig && state.columnConfig.order) setColumnConfig(tableName, state.columnConfig);
    } catch (e) {
    }
  }
  function clearTableState2(tableName) {
    if (!tableName) return;
    setColumnConfig(tableName, null);
    delete tableColumnConfig[tableName];
    try {
      localStorage.removeItem(TABLE_STATE_KEY_PREFIX + tableName);
    } catch (e) {
    }
  }
  function saveNavHistory() {
    try {
      localStorage.setItem(NAV_HISTORY_KEY, JSON.stringify({
        history: navHistory,
        currentTable: currentTableName
      }));
    } catch (e) {
    }
  }
  function loadNavHistory() {
    try {
      var raw = localStorage.getItem(NAV_HISTORY_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || !Array.isArray(data.history)) return null;
      navHistory.length = 0;
      data.history.forEach(function(h) {
        if (h && typeof h.table === "string" && h.table.trim() !== "") {
          navHistory.push({
            table: h.table,
            offset: typeof h.offset === "number" && h.offset >= 0 ? h.offset : 0,
            filter: typeof h.filter === "string" ? h.filter : ""
          });
        }
      });
      return typeof data.currentTable === "string" ? data.currentTable : null;
    } catch (e) {
      return null;
    }
  }
  function clearNavHistory() {
    navHistory.length = 0;
    try {
      localStorage.removeItem(NAV_HISTORY_KEY);
    } catch (e) {
    }
  }

  // assets/web/connection.ts
  var _applyHealthWriteFlag = () => {
  };
  var _pollGeneration = () => {
  };
  function initConnectionDeps(deps) {
    _applyHealthWriteFlag = deps.applyHealthWriteFlag;
    _pollGeneration = deps.pollGeneration;
  }
  function setDisconnected() {
    if (connectionState === "disconnected") return;
    console.log("[SDA] setDisconnected (was: " + connectionState + ")");
    setConnectionState("disconnected");
    setBannerDismissed(false);
    showConnectionBanner();
    updateConnectionBannerText();
    updateLiveIndicatorForConnection();
    setOfflineControlsDisabled(true);
  }
  function setReconnecting() {
    if (connectionState === "reconnecting") return;
    console.log("[SDA] setReconnecting (was: " + connectionState + ")");
    setConnectionState("reconnecting");
    setNextHeartbeatAt(null);
    showConnectionBanner();
    updateConnectionBannerText();
    updateLiveIndicatorForConnection();
  }
  function setConnected() {
    if (connectionState === "connected") return;
    console.log("[SDA] setConnected (was: " + connectionState + ")");
    setConnectionState("connected");
    setConsecutivePollFailures(0);
    setCurrentBackoffMs(BACKOFF_INITIAL_MS);
    setNextHeartbeatAt(null);
    setHeartbeatInFlight(false);
    setHeartbeatAttemptCount(0);
    hideConnectionBanner();
    updateLiveIndicatorForConnection();
    setOfflineControlsDisabled(false);
    stopHeartbeat();
  }
  function updateConnectionBannerText() {
    if (connectionState === "connected" || bannerDismissed) return;
    const msgEl = document.getElementById("banner-message");
    const diagEl = document.getElementById("banner-diagnostics");
    if (!msgEl || !diagEl) return;
    const parts = [];
    if (connectionState === "reconnecting") {
      msgEl.textContent = "Reconnecting\u2026";
      diagEl.textContent = "Restoring connection\u2026";
      return;
    }
    if (heartbeatInFlight) {
      msgEl.textContent = "Connection lost \u2014 checking\u2026";
      parts.push("Attempt " + heartbeatAttemptCount);
    } else if (nextHeartbeatAt != null) {
      const secs = Math.max(0, Math.ceil((nextHeartbeatAt - Date.now()) / 1e3));
      msgEl.textContent = "Connection lost \u2014 next retry in " + secs + "s";
      const intervalSec = currentBackoffMs / 1e3;
      parts.push("Retrying every " + intervalSec + "s");
      if (currentBackoffMs >= BACKOFF_MAX_MS) parts.push("(max interval)");
      parts.push("Attempt " + heartbeatAttemptCount);
    } else {
      msgEl.textContent = "Connection lost \u2014 reconnecting\u2026";
      parts.push("Attempt " + heartbeatAttemptCount);
    }
    diagEl.textContent = parts.join(" \u2022 ");
  }
  function showConnectionBanner() {
    if (bannerDismissed) return;
    const banner = document.getElementById("connection-banner");
    if (!banner) return;
    banner.classList.add("show");
    document.body.classList.add("has-connection-banner");
    if (!bannerUpdateIntervalId) {
      setBannerUpdateIntervalId(setInterval(updateConnectionBannerText, 1e3));
    }
  }
  function hideConnectionBanner() {
    if (bannerUpdateIntervalId) {
      clearInterval(bannerUpdateIntervalId);
      setBannerUpdateIntervalId(null);
    }
    const banner = document.getElementById("connection-banner");
    if (banner) {
      banner.classList.remove("show");
      document.body.classList.remove("has-connection-banner");
    }
  }
  function updateLiveIndicatorForConnection() {
    if (!window.mastheadStatus) return;
    window.mastheadStatus.setConnection(connectionState, pollingEnabled);
  }
  function setOfflineControlsDisabled(disabled) {
    OFFLINE_DISABLE_IDS.forEach(function(id) {
      const el = document.getElementById(id);
      if (el) {
        if (disabled) el.classList.add("offline-disabled");
        else el.classList.remove("offline-disabled");
      }
    });
  }
  function startHeartbeat() {
    if (heartbeatTimerId) {
      console.log("[SDA] startHeartbeat: skipped (timer already active)");
      return;
    }
    console.log("[SDA] startHeartbeat: initiating heartbeat cycle");
    doHeartbeat();
  }
  function doHeartbeat() {
    if (heartbeatInFlight) {
      console.log("[SDA] doHeartbeat: skipped (already in flight)");
      return;
    }
    if (connectionState === "disconnected" || connectionState === "reconnecting") {
      setHeartbeatAttemptCount(heartbeatAttemptCount + 1);
    }
    console.log("[SDA] doHeartbeat: attempt #" + heartbeatAttemptCount + ", state=" + connectionState);
    setHeartbeatInFlight(true);
    updateConnectionBannerText();
    fetch("/api/health", authOpts()).then(function(r) {
      return r.json();
    }).then(function(data) {
      setHeartbeatInFlight(false);
      if (data && data.ok) {
        console.log("[SDA] doHeartbeat: health OK \u2014 resuming poll");
        _applyHealthWriteFlag(data);
        setReconnecting();
        setConsecutivePollFailures(0);
        setCurrentBackoffMs(BACKOFF_INITIAL_MS);
        setNextHeartbeatAt(null);
        setHeartbeatTimerId(null);
        _pollGeneration();
        return;
      }
      console.log("[SDA] doHeartbeat: health response not ok", data);
      updateConnectionBannerText();
      scheduleHeartbeat();
    }).catch(function(err) {
      console.log("[SDA] doHeartbeat: fetch failed", err);
      setHeartbeatInFlight(false);
      updateConnectionBannerText();
      scheduleHeartbeat();
    });
  }
  function scheduleHeartbeat() {
    setCurrentBackoffMs(Math.min(
      currentBackoffMs * BACKOFF_MULTIPLIER,
      BACKOFF_MAX_MS
    ));
    console.log("[SDA] scheduleHeartbeat: next in " + currentBackoffMs + "ms");
    setNextHeartbeatAt(Date.now() + currentBackoffMs);
    setHeartbeatTimerId(setTimeout(doHeartbeat, currentBackoffMs));
  }
  function stopHeartbeat() {
    if (heartbeatTimerId) {
      console.log("[SDA] stopHeartbeat: clearing timer");
      clearTimeout(heartbeatTimerId);
      setHeartbeatTimerId(null);
    }
    setNextHeartbeatAt(null);
  }
  function startKeepAlive() {
    console.log("[SDA] startKeepAlive: interval=" + KEEP_ALIVE_INTERVAL_MS + "ms");
    stopKeepAlive();
    setKeepAliveTimerId(setInterval(function() {
      console.log("[SDA] keepAlive tick: fetching /api/health");
      fetch("/api/health", authOpts()).then(function(r) {
        return r.json();
      }).then(function(data) {
        if (data && data.ok) {
          _applyHealthWriteFlag(data);
          if (connectionState !== "connected") {
            console.log("[SDA] keepAlive: health OK, restoring connected");
            setConnected();
          }
        } else {
          console.log("[SDA] keepAlive: health response not ok", data);
          setDisconnected();
        }
      }).catch(function(err) {
        console.log("[SDA] keepAlive: fetch failed, switching to heartbeat", err);
        setDisconnected();
        stopKeepAlive();
        startHeartbeat();
      });
    }, KEEP_ALIVE_INTERVAL_MS));
  }
  function stopKeepAlive() {
    if (keepAliveTimerId) {
      console.log("[SDA] stopKeepAlive: clearing interval");
      clearInterval(keepAliveTimerId);
      setKeepAliveTimerId(null);
    }
  }

  // assets/web/tabs.ts
  function switchTab(tabId) {
    var tabBar = document.getElementById("tab-bar");
    var panels = document.getElementById("tab-panels");
    if (!tabBar || !panels) return;
    var prevIsTable = activeTabId.indexOf("tbl:") === 0;
    if (prevIsTable && currentTableName) {
      saveTableState(currentTableName);
    }
    setActiveTabId(tabId);
    var isTableTab = tabId.indexOf("tbl:") === 0;
    var showTablesPanel = tabId === "tables" || isTableTab;
    tabBar.querySelectorAll(".tab-btn").forEach(function(btn) {
      var id = btn.getAttribute("data-tab");
      var isActive = id === tabId;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-selected", isActive ? "true" : "false");
    });
    panels.querySelectorAll(".tab-panel").forEach(function(panel) {
      var id = panel.id && panel.id.replace(/^panel-/, "");
      var isActive = id === tabId || showTablesPanel && id === "tables";
      panel.classList.toggle("active", isActive);
      panel.hidden = !isActive;
    });
    var browseEl = document.getElementById("tables-browse");
    var contentEl = document.getElementById("content");
    var paginationEl = document.getElementById("pagination-bar");
    var formatEl = document.getElementById("display-format-bar");
    if (tabId === "tables") {
      if (browseEl) browseEl.style.display = "";
      if (contentEl) contentEl.style.display = "none";
      if (paginationEl) paginationEl.style.display = "none";
      if (formatEl) formatEl.style.display = "none";
    } else if (isTableTab) {
      if (browseEl) browseEl.style.display = "none";
      if (contentEl) contentEl.style.display = "";
      var tableName = tabId.slice(4);
      loadTable(tableName);
    }
    if (typeof window.onTabSwitch === "function") window.onTabSwitch(tabId);
  }
  function findTabBtn(tabId) {
    var tabBar = document.getElementById("tab-bar");
    if (!tabBar) return null;
    var btns = tabBar.querySelectorAll(".tab-btn");
    for (var i = 0; i < btns.length; i++) {
      if (btns[i].getAttribute("data-tab") === tabId) return btns[i];
    }
    return null;
  }
  function createClosableTab(tabId, label, ariaControls, opts) {
    var tabBar = document.getElementById("tab-bar");
    if (!tabBar) return null;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tab-btn";
    btn.setAttribute("data-tab", tabId);
    btn.setAttribute("role", "tab");
    btn.setAttribute("aria-controls", ariaControls);
    btn.id = "tab-" + tabId.replace(/:/g, "-");
    var tabType = tabId.indexOf("tbl:") === 0 ? "tables" : tabId;
    btn.setAttribute("data-tab-type", tabType);
    var iconName = TOOL_ICONS[tabType];
    if (iconName) {
      var iconSpan = document.createElement("span");
      iconSpan.className = "material-symbols-outlined tab-icon";
      iconSpan.setAttribute("aria-hidden", "true");
      iconSpan.textContent = iconName;
      btn.appendChild(iconSpan);
    }
    if (opts && opts.truncateLabel) {
      var nameSpan = document.createElement("span");
      nameSpan.className = "tab-btn-label";
      nameSpan.textContent = label;
      nameSpan.title = label;
      btn.appendChild(nameSpan);
    } else {
      btn.appendChild(document.createTextNode(label));
    }
    var closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "tab-btn-close";
    closeBtn.title = "Close tab";
    closeBtn.setAttribute("aria-label", "Close " + label);
    closeBtn.textContent = "\xD7";
    closeBtn.addEventListener("click", function(e) {
      e.stopPropagation();
      closeToolTab(tabId);
    });
    btn.appendChild(closeBtn);
    btn.addEventListener("click", function(e) {
      if (e.target !== closeBtn && !closeBtn.contains(e.target)) switchTab(tabId);
    });
    btn.addEventListener("dblclick", function() {
      closeOtherTabs(tabId);
    });
    if (opts && opts.prepend) {
      tabBar.insertBefore(btn, tabBar.firstChild);
    } else {
      tabBar.appendChild(btn);
    }
    return btn;
  }
  function openTool(toolId) {
    var existing = findTabBtn(toolId);
    if (!existing) {
      createClosableTab(toolId, TOOL_LABELS[toolId] || toolId, "panel-" + toolId);
    }
    switchTab(toolId);
  }
  function closeOtherTabs(keepTabId) {
    var tabBar = document.getElementById("tab-bar");
    if (!tabBar) return;
    var toClose = [];
    tabBar.querySelectorAll(".tab-btn").forEach(function(btn) {
      var id = btn.getAttribute("data-tab");
      if (id && id !== keepTabId && btn.querySelector(".tab-btn-close")) {
        toClose.push(id);
      }
    });
    if (toClose.length === 0) return;
    if (!window.confirm("Close " + toClose.length + " other tab" + (toClose.length > 1 ? "s" : "") + "?")) return;
    toClose.forEach(function(id) {
      closeToolTab(id);
    });
    if (activeTabId !== keepTabId) switchTab(keepTabId);
  }
  function closeToolTab(toolId) {
    var btn = findTabBtn(toolId);
    if (!btn) return;
    var wasActive = activeTabId === toolId;
    btn.remove();
    if (toolId.indexOf("tbl:") === 0) {
      var tableName = toolId.slice(4);
      var idx = openTableTabs.indexOf(tableName);
      if (idx >= 0) openTableTabs.splice(idx, 1);
    }
    var tabBar = document.getElementById("tab-bar");
    var remaining = tabBar ? tabBar.querySelectorAll(".tab-btn") : [];
    if (remaining.length === 0) {
      createClosableTab("home", TOOL_LABELS.home || "Home", "panel-home", { prepend: true });
      switchTab("home");
      return;
    }
    if (wasActive) {
      var last = remaining[remaining.length - 1];
      var nextId = last.getAttribute("data-tab");
      if (nextId) switchTab(nextId);
    }
  }
  function initTabsAndToolbar() {
    document.querySelectorAll("#tab-bar .tab-btn").forEach(function(btn) {
      var tabId = btn.getAttribute("data-tab");
      if (tabId && !btn.querySelector(".tab-btn-close")) {
        btn.addEventListener("click", function() {
          switchTab(tabId);
        });
      }
      if (tabId) {
        btn.addEventListener("dblclick", function() {
          closeOtherTabs(tabId);
        });
      }
    });
  }
  function openTableTab(name) {
    var tabId = "tbl:" + name;
    var existing = findTabBtn(tabId);
    if (!existing) {
      createClosableTab(tabId, name, "panel-tables", { truncateLabel: true });
      openTableTabs.push(name);
    }
    switchTab(tabId);
  }

  // assets/web/table-list.ts
  function rowCountText(name) {
    const total = tableCounts[name];
    const len = currentTableJson && currentTableJson.length || 0;
    if (total == null) return esc2(name) + " (up to " + limit + " rows)";
    const rangeText = len > 0 ? "showing " + (offset + 1) + "\u2013" + (offset + len) : "no rows in this range";
    return esc2(name) + " (" + total + " row" + (total !== 1 ? "s" : "") + "; " + rangeText + ")";
  }
  function updateTableListActive() {
    var name = currentTableName;
    var ul = document.getElementById("tables");
    if (!ul) return;
    var targetHash = name ? "#" + encodeURIComponent(name) : "";
    ul.querySelectorAll("a.table-link").forEach(function(a) {
      a.classList.toggle("active", a.getAttribute("href") === targetHash);
    });
  }
  function loadTable(name) {
    if (currentTableName && currentTableName !== name) {
      saveTableState(currentTableName);
    }
    var isNewTable = currentTableName !== name;
    setCurrentTableName(name);
    updateTableListActive();
    if (typeof window._stSyncTable === "function") window._stSyncTable(name);
    if (isNewTable) restoreTableState(name);
    const content = document.getElementById("content");
    const scope = getScope();
    if (scope === "both" && cachedSchema !== null) {
      content.innerHTML = '<p class="meta">Loading ' + esc2(name) + "\u2026</p>";
    } else if (scope !== "both") {
      content.innerHTML = '<p class="meta">' + esc2(name) + '</p><p class="meta">Loading\u2026</p>';
    }
    fetch("/api/table/" + encodeURIComponent(name) + "?S.limit=" + limit + "&S.offset=" + offset, authOpts()).then((r) => r.json()).then((data) => {
      if (currentTableName !== name) return;
      setCurrentTableJson(data);
      setupPagination();
      renderTableView(name, data);
      fetch("/api/table/" + encodeURIComponent(name) + "/count", authOpts()).then((r) => r.json()).then((o) => {
        if (currentTableName !== name) return;
        tableCounts[name] = o.count;
        updatePaginationBar(o.count);
        renderTableView(name, data);
      }).catch(() => {
      });
    }).catch((e) => {
      if (currentTableName !== name) return;
      content.innerHTML = '<p class="meta">Error</p><pre>' + esc2(String(e)) + "</pre>";
    });
  }
  function renderTableList(tables) {
    setLastKnownTables(tables);
    const ul = document.getElementById("tables");
    if (!ul) return;
    ul.innerHTML = "";
    var pinnedArr = getPinnedTables();
    var tableSet = new Set(tables);
    var cleaned = pinnedArr.filter(function(t) {
      return tableSet.has(t);
    });
    if (cleaned.length !== pinnedArr.length) setPinnedTables(cleaned);
    var pinnedSet = new Set(cleaned);
    var sorted = tables.slice().sort(function(a, b) {
      return (pinnedSet.has(a) ? 0 : 1) - (pinnedSet.has(b) ? 0 : 1);
    });
    var countEl2 = document.getElementById("tables-count");
    if (countEl2) {
      countEl2.replaceChildren(document.createTextNode("(" + sorted.length + ")"));
    }
    sorted.forEach(function(t) {
      var isPinned = pinnedSet.has(t);
      var li = document.createElement("li");
      var a = document.createElement("a");
      a.href = "#" + encodeURIComponent(t);
      a.className = "table-link" + (t === currentTableName ? " active" : "");
      a.setAttribute("data-table", t);
      var nameSpan = document.createElement("span");
      nameSpan.className = "table-link-name";
      nameSpan.textContent = t;
      a.appendChild(nameSpan);
      if (tableCounts[t] != null) {
        var countSpan = document.createElement("span");
        var isZero = Number(tableCounts[t]) === 0;
        countSpan.className = "table-link-count" + (isZero ? " table-link-count-zero" : "");
        countSpan.textContent = "(" + formatTableRowCountDisplay(tableCounts[t]) + ")";
        a.appendChild(countSpan);
      }
      var pinBtn = document.createElement("button");
      pinBtn.type = "button";
      pinBtn.className = "table-pin-btn" + (isPinned ? " pinned" : "");
      pinBtn.title = isPinned ? "Unpin" : "Pin to top";
      pinBtn.setAttribute("aria-pressed", isPinned ? "true" : "false");
      var pinIcon = document.createElement("span");
      pinIcon.className = "material-symbols-outlined";
      pinIcon.setAttribute("aria-hidden", "true");
      pinIcon.textContent = "push_pin";
      pinBtn.appendChild(pinIcon);
      pinBtn.addEventListener("click", function(e) {
        e.preventDefault();
        e.stopPropagation();
        togglePinTable(t);
      });
      a.appendChild(pinBtn);
      a.addEventListener("click", function(e) {
        e.preventDefault();
        openTableTab(t);
      });
      li.appendChild(a);
      ul.appendChild(li);
    });
    const sqlTableSel = document.getElementById("sql-table");
    if (sqlTableSel) {
      sqlTableSel.innerHTML = '<option value="">\u2014</option>' + tables.map((t) => '<option value="' + esc2(t) + '">' + esc2(t) + "</option>").join("");
    }
    const importTableSel = document.getElementById("import-table");
    if (importTableSel) {
      importTableSel.innerHTML = tables.map((t) => '<option value="' + esc2(t) + '">' + esc2(t) + (tableCounts[t] != null ? " (" + esc2(formatTableRowCountDisplay(tableCounts[t])) + ")" : "") + "</option>").join("");
    }
    if (typeof window._stPopulateTables === "function") window._stPopulateTables(tables);
    renderTablesBrowse(tables);
  }
  function renderTablesBrowse(tables) {
    var browseEl = document.getElementById("tables-browse");
    if (!browseEl) return;
    if (!tables || tables.length === 0) {
      browseEl.innerHTML = '<p class="meta">No tables found.</p>';
      return;
    }
    var html = '<div class="tables-browse-grid">';
    tables.forEach(function(t) {
      var countHtml = "";
      if (tableCounts[t] != null) {
        countHtml = '<span class="browse-card-count">(' + esc2(formatTableRowCountDisplay(tableCounts[t])) + ")</span>";
      }
      html += '<button type="button" class="tables-browse-card" data-table="' + esc2(t) + '" title="Open ' + esc2(t) + ' in a tab">';
      html += '<span class="browse-card-name">' + esc2(t) + "</span>";
      html += countHtml;
      html += "</button>";
    });
    html += "</div>";
    browseEl.innerHTML = html;
    browseEl.querySelectorAll(".tables-browse-card").forEach(function(card) {
      card.addEventListener("click", function() {
        var tableName = card.getAttribute("data-table");
        if (tableName) openTableTab(tableName);
      });
    });
  }
  function applyTableListAndCounts(data) {
    var tables = Array.isArray(data) ? data : data && data.tables || [];
    var counts = data && data.counts ? data.counts : {};
    Object.keys(counts).forEach(function(t) {
      tableCounts[t] = counts[t];
      if (typeof window._stUpdateCount === "function") window._stUpdateCount(t, counts[t]);
    });
    renderTableList(tables);
    return tables;
  }
  function refreshOnGenerationChange() {
    if (refreshInFlight) {
      console.log("[SDA] refreshOnGenerationChange: skipped (already in flight)");
      return;
    }
    console.log("[SDA] refreshOnGenerationChange: refreshing tables + current table");
    setRefreshInFlight(true);
    if (window.mastheadStatus && connectionState === "connected") window.mastheadStatus.setBusy();
    fetch("/api/tables", authOpts()).then(function(r) {
      return r.json();
    }).then(function(data) {
      var tables = applyTableListAndCounts(data);
      openTableTabs.slice().forEach(function(name) {
        if (tables.indexOf(name) < 0) closeToolTab("tbl:" + name);
      });
      if (currentTableName && tables.indexOf(currentTableName) >= 0) {
        loadTable(currentTableName);
      }
    }).catch(function() {
    }).finally(function() {
      setRefreshInFlight(false);
      updateLiveIndicatorForConnection();
    });
  }
  function pollGeneration() {
    console.log("[SDA] pollGeneration: since=" + lastGeneration);
    fetch("/api/generation?since=" + lastGeneration, authOpts()).then(function(r) {
      return r.json();
    }).then(function(data) {
      var g = data.generation;
      var changed = typeof g === "number" && g !== lastGeneration;
      console.log("[SDA] pollGeneration: received generation=" + g + ", changed=" + changed);
      setConnected();
      if (changed) {
        if (g < lastGeneration) {
          console.log("[SDA] pollGeneration: generation went backwards (" + lastGeneration + " -> " + g + "). Server may have restarted.");
        }
        setLastGeneration(g);
        refreshOnGenerationChange();
      }
      pollGeneration();
    }).catch(function(err) {
      setConsecutivePollFailures(consecutivePollFailures + 1);
      console.log("[SDA] pollGeneration: FAILED, failures=" + consecutivePollFailures + ", backoff=" + currentBackoffMs + "ms", err);
      if (consecutivePollFailures >= 1 && connectionState === "connected") {
        setDisconnected();
      }
      if (consecutivePollFailures >= HEALTH_CHECK_THRESHOLD) {
        console.log("[SDA] pollGeneration: switching to heartbeat after " + consecutivePollFailures + " failures");
        startHeartbeat();
        return;
      }
      setCurrentBackoffMs(Math.min(
        currentBackoffMs * BACKOFF_MULTIPLIER,
        BACKOFF_MAX_MS
      ));
      setTimeout(pollGeneration, currentBackoffMs);
    });
  }

  // assets/web/fk-nav.ts
  function loadFkMeta(tableName) {
    if (fkMetaCache[tableName]) return Promise.resolve(fkMetaCache[tableName]);
    return fetch("/api/table/" + encodeURIComponent(tableName) + "/fk-meta", authOpts()).then(function(r) {
      return r.json();
    }).then(function(fks) {
      fkMetaCache[tableName] = fks;
      return fks;
    }).catch(function() {
      return [];
    });
  }
  function buildFkSqlValue(value) {
    var isNumeric = !isNaN(value) && value.trim() !== "";
    return isNumeric ? value : "'" + value.replace(/'/g, "''") + "'";
  }
  function navigateToFk(table, column, value) {
    navHistory.push({
      table: currentTableName,
      offset,
      filter: document.getElementById("row-filter").value
    });
    var sqlInput = document.getElementById("sql-input");
    sqlInput.value = 'SELECT * FROM "' + table + '" WHERE "' + column + '" = ' + buildFkSqlValue(value);
    switchTab("sql");
    document.getElementById("sql-run").click();
    setCurrentTableName(table);
    updateTableListActive();
    saveNavHistory();
    renderBreadcrumb();
  }
  function renderBreadcrumb() {
    var el = document.getElementById("nav-breadcrumb");
    if (!el) {
      el = document.createElement("div");
      el.id = "nav-breadcrumb";
      el.style.cssText = "font-size:11px;margin:0.3rem 0;color:var(--muted);";
      document.getElementById("content").prepend(el);
    }
    if (navHistory.length === 0) {
      el.style.display = "none";
      return;
    }
    var html = '<a href="#" id="nav-back" style="color:var(--link);" title="Go back to previous table">&#8592; Back</a>';
    html += ' | <a href="#" id="nav-clear" class="nav-clear-link" title="Clear navigation trail">Clear path</a>';
    html += " | ";
    html += navHistory.map(function(h, idx) {
      return '<a href="#" class="nav-crumb" data-idx="' + idx + '" data-longpress-copy="' + esc2(h.table) + '" style="color:var(--link);" title="Jump to ' + esc2(h.table) + '">' + esc2(h.table) + "</a>";
    }).join(" &#8594; ");
    var curName = currentTableName || "";
    html += ' &#8594; <strong data-longpress-copy="' + esc2(curName) + '">' + esc2(curName) + "</strong>";
    el.innerHTML = html;
    el.style.display = "block";
    var backBtn = document.getElementById("nav-back");
    if (backBtn) {
      backBtn.onclick = function(e) {
        e.preventDefault();
        var prev = navHistory.pop();
        if (prev) {
          setOffset(prev.offset || 0);
          loadTable(prev.table);
          if (prev.filter) document.getElementById("row-filter").value = prev.filter;
          saveNavHistory();
          renderBreadcrumb();
        }
      };
    }
    var clearBtn = document.getElementById("nav-clear");
    if (clearBtn) {
      clearBtn.onclick = function(e) {
        e.preventDefault();
        clearNavHistory();
        renderBreadcrumb();
      };
    }
    el.querySelectorAll(".nav-crumb").forEach(function(crumb) {
      crumb.onclick = function(e) {
        e.preventDefault();
        var idx = parseInt(crumb.getAttribute("data-idx"), 10);
        if (isNaN(idx) || idx < 0 || idx >= navHistory.length) return;
        var target = navHistory[idx];
        navHistory.length = idx;
        setOffset(target.offset || 0);
        loadTable(target.table);
        if (target.filter) document.getElementById("row-filter").value = target.filter;
        saveNavHistory();
        renderBreadcrumb();
      };
    });
  }

  // assets/web/settings.ts
  var PREF_PREFIX = "drift-viewer-pref-";
  function getPref(key, defaultValue) {
    try {
      const raw = localStorage.getItem(PREF_PREFIX + key);
      if (raw === null) return defaultValue;
      if (typeof defaultValue === "number") {
        const n = Number(raw);
        return isFinite(n) ? n : defaultValue;
      }
      if (typeof defaultValue === "boolean") {
        return raw === "true";
      }
      return raw;
    } catch {
      return defaultValue;
    }
  }
  function setPref(key, value) {
    try {
      localStorage.setItem(PREF_PREFIX + key, String(value));
    } catch {
    }
  }
  var PREF_SQL_HISTORY_MAX = "sqlHistoryMax";
  var PREF_ANALYSIS_MAX = "analysisMax";
  var PREF_DEFAULT_PAGE_SIZE = "defaultPageSize";
  var PREF_DEFAULT_DISPLAY_FORMAT = "defaultDisplayFormat";
  var PREF_NULL_DISPLAY = "nullDisplay";
  var PREF_DEFAULT_ONLY_MATCHING = "defaultOnlyMatching";
  var PREF_SLOW_QUERY_THRESHOLD = "slowQueryThreshold";
  var PREF_AUTO_REFRESH = "autoRefresh";
  var PREF_EPOCH_DETECTION = "epochDetection";
  var PREF_CONFIRM_NAVIGATE_AWAY = "confirmNavigateAway";
  var DEFAULTS = {
    [PREF_SQL_HISTORY_MAX]: 200,
    [PREF_ANALYSIS_MAX]: 50,
    [PREF_DEFAULT_PAGE_SIZE]: 200,
    [PREF_DEFAULT_DISPLAY_FORMAT]: "raw",
    [PREF_NULL_DISPLAY]: "NULL",
    [PREF_DEFAULT_ONLY_MATCHING]: true,
    [PREF_SLOW_QUERY_THRESHOLD]: 100,
    [PREF_AUTO_REFRESH]: true,
    [PREF_EPOCH_DETECTION]: true,
    [PREF_CONFIRM_NAVIGATE_AWAY]: true
  };
  function buildSettingsHtml() {
    return `
<div class="settings-panel">

  <section class="settings-group">
    <h3 class="settings-group-title">
      <span class="material-symbols-outlined" aria-hidden="true">database</span>
      Storage &amp; History
    </h3>
    <label class="settings-row">
      <span class="settings-label">SQL history max entries</span>
      <input type="number" id="pref-sqlHistoryMax" class="settings-input settings-input-number" min="10" max="2000" step="10" />
    </label>
    <label class="settings-row">
      <span class="settings-label">Max saved analyses</span>
      <input type="number" id="pref-analysisMax" class="settings-input settings-input-number" min="5" max="500" step="5" />
    </label>
    <div class="settings-row settings-row-actions">
      <button type="button" id="settings-clear-all" class="btn btn-danger-outline settings-btn">
        <span class="material-symbols-outlined" aria-hidden="true">delete_sweep</span>
        Clear all stored data
      </button>
      <span class="settings-hint">Removes pinned tables, table states, navigation history, SQL history, bookmarks, and saved analyses. Theme and sidebar preferences are kept.</span>
    </div>
  </section>

  <section class="settings-group">
    <h3 class="settings-group-title">
      <span class="material-symbols-outlined" aria-hidden="true">table_chart</span>
      Table Defaults
    </h3>
    <label class="settings-row">
      <span class="settings-label">Default page size</span>
      <select id="pref-defaultPageSize" class="settings-input settings-input-select">
        <option value="50">50</option>
        <option value="200">200</option>
        <option value="500">500</option>
        <option value="1000">1000</option>
      </select>
    </label>
    <label class="settings-row">
      <span class="settings-label">Default display format</span>
      <select id="pref-defaultDisplayFormat" class="settings-input settings-input-select">
        <option value="raw">Raw</option>
        <option value="formatted">Formatted</option>
      </select>
    </label>
    <label class="settings-row">
      <span class="settings-label">NULL display</span>
      <span class="settings-sublabel">How SQL NULLs render in table cells (always shown dimmed)</span>
      <select id="pref-nullDisplay" class="settings-input settings-input-select">
        <option value="NULL">NULL</option>
        <option value="-">- (dash)</option>
      </select>
    </label>
    <label class="settings-row settings-toggle-row">
      <span class="settings-label">Show only matching rows</span>
      <span class="settings-sublabel">When a row filter is active, hide non-matching rows instead of highlighting them</span>
      <input type="checkbox" id="pref-defaultOnlyMatching" class="settings-checkbox" />
      <span class="settings-switch" role="switch" aria-checked="false"></span>
    </label>
  </section>

  <section class="settings-group">
    <h3 class="settings-group-title">
      <span class="material-symbols-outlined" aria-hidden="true">speed</span>
      Performance
    </h3>
    <label class="settings-row">
      <span class="settings-label">Slow query threshold</span>
      <span class="settings-sublabel">Queries exceeding this duration (ms) are flagged in the Perf tab</span>
      <input type="number" id="pref-slowQueryThreshold" class="settings-input settings-input-number" min="10" max="60000" step="10" />
    </label>
    <label class="settings-row settings-toggle-row">
      <span class="settings-label">Auto-refresh polling</span>
      <span class="settings-sublabel">Automatically detect and reload when database data changes</span>
      <input type="checkbox" id="pref-autoRefresh" class="settings-checkbox" />
      <span class="settings-switch" role="switch" aria-checked="false"></span>
    </label>
  </section>

  <section class="settings-group">
    <h3 class="settings-group-title">
      <span class="material-symbols-outlined" aria-hidden="true">format_paint</span>
      Data Formatting
    </h3>
    <label class="settings-row settings-toggle-row">
      <span class="settings-label">Auto-detect epoch timestamps</span>
      <span class="settings-sublabel">Automatically format large integers as dates when column names suggest timestamps</span>
      <input type="checkbox" id="pref-epochDetection" class="settings-checkbox" />
      <span class="settings-switch" role="switch" aria-checked="false"></span>
    </label>
    <label class="settings-row settings-toggle-row">
      <span class="settings-label">Confirm before leaving page</span>
      <span class="settings-sublabel">Show a browser confirmation dialog when navigating away or closing the tab</span>
      <input type="checkbox" id="pref-confirmNavigateAway" class="settings-checkbox" />
      <span class="settings-switch" role="switch" aria-checked="false"></span>
    </label>
  </section>

  <div class="settings-footer">
    <button type="button" id="settings-reset-all" class="btn btn-outline settings-btn">
      <span class="material-symbols-outlined" aria-hidden="true">restart_alt</span>
      Reset all to defaults
    </button>
  </div>

</div>`;
  }
  function populateForm() {
    setNumberInput("pref-sqlHistoryMax", getPref(PREF_SQL_HISTORY_MAX, DEFAULTS[PREF_SQL_HISTORY_MAX]));
    setNumberInput("pref-analysisMax", getPref(PREF_ANALYSIS_MAX, DEFAULTS[PREF_ANALYSIS_MAX]));
    setNumberInput("pref-slowQueryThreshold", getPref(PREF_SLOW_QUERY_THRESHOLD, DEFAULTS[PREF_SLOW_QUERY_THRESHOLD]));
    setSelectValue("pref-defaultPageSize", String(getPref(PREF_DEFAULT_PAGE_SIZE, DEFAULTS[PREF_DEFAULT_PAGE_SIZE])));
    setSelectValue("pref-defaultDisplayFormat", getPref(PREF_DEFAULT_DISPLAY_FORMAT, DEFAULTS[PREF_DEFAULT_DISPLAY_FORMAT]));
    setSelectValue("pref-nullDisplay", getPref(PREF_NULL_DISPLAY, DEFAULTS[PREF_NULL_DISPLAY]));
    setToggle("pref-defaultOnlyMatching", getPref(PREF_DEFAULT_ONLY_MATCHING, DEFAULTS[PREF_DEFAULT_ONLY_MATCHING]));
    setToggle("pref-autoRefresh", getPref(PREF_AUTO_REFRESH, DEFAULTS[PREF_AUTO_REFRESH]));
    setToggle("pref-epochDetection", getPref(PREF_EPOCH_DETECTION, DEFAULTS[PREF_EPOCH_DETECTION]));
    setToggle("pref-confirmNavigateAway", getPref(PREF_CONFIRM_NAVIGATE_AWAY, DEFAULTS[PREF_CONFIRM_NAVIGATE_AWAY]));
  }
  function setNumberInput(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = String(value);
  }
  function setSelectValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value;
  }
  function setToggle(id, checked) {
    const cb = document.getElementById(id);
    if (!cb) return;
    cb.checked = checked;
    const sw = cb.nextElementSibling;
    if (sw && sw.classList.contains("settings-switch")) {
      sw.setAttribute("aria-checked", checked ? "true" : "false");
    }
  }
  function bindEvents() {
    bindNumberInput("pref-sqlHistoryMax", PREF_SQL_HISTORY_MAX);
    bindNumberInput("pref-analysisMax", PREF_ANALYSIS_MAX);
    bindNumberInput("pref-slowQueryThreshold", PREF_SLOW_QUERY_THRESHOLD);
    bindSelectInput("pref-defaultPageSize", PREF_DEFAULT_PAGE_SIZE);
    bindSelectInput("pref-defaultDisplayFormat", PREF_DEFAULT_DISPLAY_FORMAT);
    bindSelectInput("pref-nullDisplay", PREF_NULL_DISPLAY);
    bindToggleInput("pref-defaultOnlyMatching", PREF_DEFAULT_ONLY_MATCHING);
    bindToggleInput("pref-autoRefresh", PREF_AUTO_REFRESH);
    bindToggleInput("pref-epochDetection", PREF_EPOCH_DETECTION);
    bindToggleInput("pref-confirmNavigateAway", PREF_CONFIRM_NAVIGATE_AWAY);
    const clearBtn = document.getElementById("settings-clear-all");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        if (!confirm("Clear all stored project data? Theme and sidebar preferences will be kept.")) return;
        clearAllProjectData();
        clearBtn.textContent = "Cleared!";
        setTimeout(() => {
          clearBtn.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">delete_sweep</span> Clear all stored data';
        }, 1500);
      });
    }
    const resetBtn = document.getElementById("settings-reset-all");
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        if (!confirm("Reset all settings to their default values?")) return;
        resetAllPrefs();
        populateForm();
        applyRuntimeState();
      });
    }
  }
  function bindNumberInput(id, prefKey) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("change", () => {
      const v = parseInt(el.value, 10);
      if (isFinite(v) && v > 0) {
        setPref(prefKey, v);
        applyRuntimeState();
      }
    });
  }
  function bindSelectInput(id, prefKey) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("change", () => {
      const n = Number(el.value);
      setPref(prefKey, isFinite(n) ? n : el.value);
      applyRuntimeState();
    });
  }
  function bindToggleInput(id, prefKey) {
    const cb = document.getElementById(id);
    if (!cb) return;
    const row = cb.closest(".settings-toggle-row");
    if (row) {
      row.addEventListener("click", (e) => {
        if (e.target === cb) return;
        cb.checked = !cb.checked;
        cb.dispatchEvent(new Event("change"));
      });
    }
    cb.addEventListener("change", () => {
      setPref(prefKey, cb.checked);
      const sw = cb.nextElementSibling;
      if (sw && sw.classList.contains("settings-switch")) {
        sw.setAttribute("aria-checked", cb.checked ? "true" : "false");
      }
      applyRuntimeState();
    });
  }
  function applyRuntimeState() {
    setShowOnlyMatchingRows(getPref(PREF_DEFAULT_ONLY_MATCHING, DEFAULTS[PREF_DEFAULT_ONLY_MATCHING]));
    setPollingEnabled(getPref(PREF_AUTO_REFRESH, DEFAULTS[PREF_AUTO_REFRESH]));
    setNullDisplay(getPref(PREF_NULL_DISPLAY, DEFAULTS[PREF_NULL_DISPLAY]));
  }
  function clearAllProjectData() {
    collectProjectStorageKeys().forEach((k) => localStorage.removeItem(k));
    setPinnedTables([]);
    clearNavHistory();
    setSqlHistory([]);
    setSqlBookmarks([]);
  }
  function resetAllPrefs() {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(PREF_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  }
  function initSettings() {
    const panel = document.getElementById("settings-body");
    if (!panel) return;
    panel.innerHTML = buildSettingsHtml();
    populateForm();
    bindEvents();
  }
  function applyStoredPrefs() {
    setLimit(getPref(PREF_DEFAULT_PAGE_SIZE, DEFAULTS[PREF_DEFAULT_PAGE_SIZE]));
    setDisplayFormat(getPref(PREF_DEFAULT_DISPLAY_FORMAT, DEFAULTS[PREF_DEFAULT_DISPLAY_FORMAT]));
    setNullDisplay(getPref(PREF_NULL_DISPLAY, DEFAULTS[PREF_NULL_DISPLAY]));
    setShowOnlyMatchingRows(getPref(PREF_DEFAULT_ONLY_MATCHING, DEFAULTS[PREF_DEFAULT_ONLY_MATCHING]));
    setPollingEnabled(getPref(PREF_AUTO_REFRESH, DEFAULTS[PREF_AUTO_REFRESH]));
  }

  // assets/web/schema.ts
  function loadSchemaIntoPre() {
    var pre = document.getElementById("schema-inline-pre");
    if (!pre) return;
    if (cachedSchema !== null) {
      pre.innerHTML = highlightSqlSafe(cachedSchema);
      return;
    }
    fetch("/api/schema", authOpts()).then((r) => r.text()).then(function(schema) {
      setCachedSchema(schema);
      pre.innerHTML = highlightSqlSafe(schema);
    }).catch(function() {
      pre.textContent = "Failed to load.";
    });
  }
  function loadSchemaView() {
    const content = document.getElementById("content");
    content.innerHTML = '<p class="meta">Loading schema\u2026</p>';
    if (cachedSchema !== null) {
      renderSchemaContent(content, cachedSchema);
      applySearch();
      return;
    }
    fetch("/api/schema", authOpts()).then((r) => r.text()).then((schema) => {
      setCachedSchema(schema);
      renderSchemaContent(content, schema);
      applySearch();
    }).catch((e) => {
      content.innerHTML = '<p class="meta">Error</p><pre>' + esc2(String(e)) + "</pre>";
    });
  }
  function renderSchemaContent(container, schema) {
    setLastRenderedData(null);
    setLastRenderedSchema(schema);
    const scope = getScope();
    if (scope === "both") {
      container.innerHTML = '<div class="search-section-collapsible expanded"><div class="collapsible-header" data-collapsible>Schema</div><div class="collapsible-body"><pre id="schema-pre">' + highlightSqlSafe(schema) + '</pre></div></div><div class="search-section-collapsible expanded" id="both-data-section"><div class="collapsible-header" data-collapsible>Table data</div><div class="collapsible-body"><p class="meta">Select a table above to load data.</p></div></div>';
      const dataSection = document.getElementById("both-data-section");
      if (dataSection && currentTableName && currentTableJson !== null) {
        const displayData = getTableDisplayData(currentTableJson);
        const filtered2 = filterRows(currentTableJson);
        const metaText = rowCountText(currentTableName) + buildTableFilterMetaSuffix(filtered2.length, currentTableJson.length);
        var fkMap = {};
        var cachedFks = fkMetaCache[currentTableName] || [];
        cachedFks.forEach(function(fk) {
          fkMap[fk.fromColumn] = fk;
        });
        var colTypes = tableColumnTypes[currentTableName] || {};
        var dataBody = dataSection.querySelector(".collapsible-body");
        var headerEl = dataSection.querySelector(".collapsible-header");
        if (headerEl) headerEl.textContent = "Table data: " + currentTableName;
        if (dataBody) dataBody.innerHTML = '<p class="meta">' + metaText + "</p>" + buildTableDefinitionHtml(currentTableName) + wrapDataTableInScroll(buildDataTableHtml(displayData, fkMap, colTypes, getColumnConfig(currentTableName))) + buildTableStatusBar(tableCounts[currentTableName], offset, limit, displayData.length, getVisibleColumnCount(Object.keys(displayData[0] || {}), getColumnConfig(currentTableName)));
      }
    } else {
      container.innerHTML = '<p class="meta">Schema</p><pre id="content-pre">' + highlightSqlSafe(schema) + "</pre>";
    }
  }
  function buildBothViewSectionsHtml(tableName, metaText, qbHtml, tableHtml, schema, defHtml) {
    defHtml = defHtml || "";
    return '<div class="search-section-collapsible expanded"><div class="collapsible-header" data-collapsible>Schema</div><div class="collapsible-body"><pre id="schema-pre">' + highlightSqlSafe(schema) + '</pre></div></div><div class="search-section-collapsible expanded" id="both-data-section"><div class="collapsible-header" data-collapsible>Table data: ' + esc2(tableName) + '</div><div class="collapsible-body"><p class="meta">' + metaText + "</p>" + defHtml + qbHtml + tableHtml + "</div></div>";
  }
  function loadBothView() {
    const content = document.getElementById("content");
    content.innerHTML = '<p class="meta">Loading\u2026</p>';
    (cachedSchema !== null ? Promise.resolve(cachedSchema) : fetch("/api/schema", authOpts()).then((r) => r.text())).then((schema) => {
      if (cachedSchema === null) setCachedSchema(schema);
      setLastRenderedSchema(schema);
      let dataHtml = "";
      if (currentTableName && currentTableJson !== null) {
        const displayData = getTableDisplayData(currentTableJson);
        const filtered2 = filterRows(currentTableJson);
        const metaText = rowCountText(currentTableName) + buildTableFilterMetaSuffix(filtered2.length, currentTableJson.length);
        var fkMap = {};
        var cachedFks = fkMetaCache[currentTableName] || [];
        cachedFks.forEach(function(fk) {
          fkMap[fk.fromColumn] = fk;
        });
        var colTypes = tableColumnTypes[currentTableName] || {};
        dataHtml = '<p class="meta">' + metaText + "</p>" + buildTableDefinitionHtml(currentTableName) + wrapDataTableInScroll(buildDataTableHtml(displayData, fkMap, colTypes, getColumnConfig(currentTableName))) + buildTableStatusBar(tableCounts[currentTableName], offset, limit, displayData.length, getVisibleColumnCount(Object.keys(displayData[0] || {}), getColumnConfig(currentTableName)));
      } else {
        setLastRenderedData(null);
        dataHtml = '<p class="meta">Select a table above to load data.</p>';
      }
      content.innerHTML = '<div class="search-section-collapsible expanded"><div class="collapsible-header" data-collapsible>Schema</div><div class="collapsible-body"><pre id="schema-pre">' + highlightSqlSafe(schema) + '</pre></div></div><div class="search-section-collapsible expanded" id="both-data-section"><div class="collapsible-header" data-collapsible>Table data</div><div class="collapsible-body">' + dataHtml + "</div></div>";
      applySearch();
    }).catch((e) => {
      content.innerHTML = '<p class="meta">Error</p><pre>' + esc2(String(e)) + "</pre>";
    });
  }

  // assets/web/table-view.ts
  async function loadColumnTypes(tableName) {
    if (tableColumnTypes[tableName]) return tableColumnTypes[tableName];
    var meta = await loadSchemaMeta();
    var tables = meta.tables || [];
    tables.forEach(function(t) {
      var types = {};
      (t.columns || []).forEach(function(c) {
        types[c.name] = (c.type || "").toUpperCase();
      });
      tableColumnTypes[t.name] = types;
    });
    return tableColumnTypes[tableName] || {};
  }
  function isEpochTimestamp(value) {
    if (!getPref(PREF_EPOCH_DETECTION, DEFAULTS[PREF_EPOCH_DETECTION])) return false;
    var n = Number(value);
    if (!isFinite(n) || n <= 0) return false;
    if (n > 9466848e5 && n < 3250368e7) return "ms";
    if (n > 946684800 && n < 3250368e4) return "s";
    return false;
  }
  function isBooleanColumn(name) {
    var lower = name.toLowerCase();
    return /^(is_|has_|can_|should_|allow_|enable)/.test(lower) || /_(enabled|active|visible|deleted|archived|verified|confirmed|locked|published)\$/.test(lower) || lower === "active" || lower === "enabled" || lower === "deleted" || lower === "verified";
  }
  function isDateColumn(name) {
    var lower = name.toLowerCase();
    return /date|time|created|updated|deleted|_at\$|_on\$/.test(lower);
  }
  function formatCellValue(value, columnName, columnType) {
    var raw = value != null ? String(value) : "";
    if (value == null || value === "") return { formatted: raw, raw, wasFormatted: false };
    var type = (columnType || "").toUpperCase();
    if ((type === "INTEGER" || type === "") && isBooleanColumn(columnName)) {
      if (value === 0 || value === "0") return { formatted: "false", raw, wasFormatted: true };
      if (value === 1 || value === "1") return { formatted: "true", raw, wasFormatted: true };
    }
    if ((type === "INTEGER" || type === "REAL" || type === "") && (isDateColumn(columnName) || isEpochTimestamp(value))) {
      var epoch = isEpochTimestamp(value);
      if (epoch) {
        var ms = epoch === "ms" ? Number(value) : Number(value) * 1e3;
        var date = new Date(ms);
        if (!isNaN(date.getTime())) {
          return { formatted: date.toISOString(), raw, wasFormatted: true };
        }
      }
    }
    return { formatted: raw, raw, wasFormatted: false };
  }
  function showCopyToast(message) {
    var toast = document.getElementById("copy-toast");
    if (message) toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(function() {
      toast.classList.remove("show");
      toast.textContent = "Copied!";
    }, 1200);
  }
  function copyCellValue(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(showCopyToast).catch(function() {
      });
    }
  }
  function buildDataTableHtml(filtered2, fkMap, colTypes, columnConfig) {
    if (!filtered2 || filtered2.length === 0) return '<p class="meta">No rows.</p>';
    var dataKeys = Object.keys(filtered2[0]);
    var order = dataKeys.slice();
    var hidden = [];
    var pinned = [];
    if (columnConfig && columnConfig.order && columnConfig.order.length) {
      order = columnConfig.order.filter(function(k) {
        return dataKeys.indexOf(k) >= 0;
      });
      dataKeys.forEach(function(k) {
        if (order.indexOf(k) < 0) order.push(k);
      });
    }
    if (columnConfig && columnConfig.hidden) hidden = columnConfig.hidden;
    if (columnConfig && columnConfig.pinned) pinned = columnConfig.pinned;
    var visible = order.filter(function(k) {
      return hidden.indexOf(k) < 0;
    });
    var maskOn = isPiiMaskEnabled();
    var singlePkName = getSinglePkColumnName(currentTableName);
    var showRowDelete = !!driftWriteEnabled && !!singlePkName;
    var html = '<table id="data-table" class="drift-table"><thead><tr>';
    visible.forEach(function(k) {
      var fk = fkMap[k];
      var fkLabel = fk ? ' <span class="table-header-fk" title="FK to ' + esc2(fk.toTable) + "." + esc2(fk.toColumn) + '">&#8599;</span>' : "";
      var colType = colTypes ? colTypes[k] || "" : "";
      var typeBadge = colType ? ' <span class="col-type-badge" title="' + esc2(colType) + '">' + esc2(colType.substring(0, 4)) + "</span>" : "";
      var maskBadge = "";
      if (maskOn && isPiiColumn(k)) {
        var maskTip = "Sensitive column: values are redacted while PII masking is on. Use the mask control in the toolbar to show raw data.";
        maskBadge = ' <span class="col-mask-badge" title="' + esc2(maskTip) + '" aria-label="' + esc2(maskTip) + '"><span class="material-symbols-outlined" aria-hidden="true">visibility_off</span></span>';
      }
      var thClass = pinned.indexOf(k) >= 0 ? ' class="col-pinned"' : "";
      html += '<th data-column-key="' + esc2(k) + '" draggable="true"' + thClass + ' title="Drag to reorder; right-click for menu">' + esc2(k) + maskBadge + typeBadge + fkLabel + "</th>";
    });
    if (showRowDelete) {
      html += '<th class="row-action-col">Actions</th>';
    }
    html += "</tr></thead><tbody>";
    var piiCols = {};
    visible.forEach(function(k) {
      piiCols[k] = isPiiColumn(k);
    });
    filtered2.forEach(function(row) {
      html += "<tr>";
      visible.forEach(function(k) {
        var val = row[k];
        var fk = fkMap[k];
        var isNull = val == null;
        var rawStr = isNull ? "" : String(val);
        var displayStr = getDisplayValue(k, val, maskOn, piiCols[k]);
        var cellContent;
        if (isNull) {
          cellContent = '<span class="cell-null">' + esc2(nullDisplay) + "</span>";
        } else if (displayFormat === "formatted" && colTypes && !(maskOn && piiCols[k])) {
          var fmt = formatCellValue(val, k, colTypes[k]);
          if (fmt.wasFormatted) {
            cellContent = '<span title="Raw: ' + esc2(fmt.raw) + '">' + esc2(fmt.formatted) + '</span><span class="cell-raw">' + esc2(fmt.raw) + "</span>";
          } else {
            cellContent = esc2(displayStr);
          }
        } else {
          cellContent = esc2(displayStr);
        }
        var copyBtn = '<button type="button" class="cell-copy-btn" data-raw="' + esc2(displayStr) + '" title="Copy value">&#x2398;</button>';
        var tdClass = pinned.indexOf(k) >= 0 ? ' class="col-pinned"' : "";
        var tdAttrs = ' data-column-key="' + esc2(k) + '"' + tdClass;
        if (fk && !isNull) {
          html += "<td" + tdAttrs + '><span class="cell-text"><a href="#" class="fk-link" style="color:var(--link);text-decoration:underline;" ';
          html += 'data-table="' + esc2(fk.toTable) + '" ';
          html += 'data-column="' + esc2(fk.toColumn) + '" ';
          html += 'data-value="' + esc2(rawStr) + '">';
          html += cellContent + " &#8594;</a></span>" + copyBtn + "</td>";
        } else {
          html += "<td" + tdAttrs + '><span class="cell-text">' + cellContent + "</span>" + copyBtn + "</td>";
        }
      });
      if (showRowDelete && singlePkName) {
        var pkRaw = row[singlePkName] == null ? "" : String(row[singlePkName]);
        html += '<td class="row-action-col"><button type="button" class="row-delete-btn" data-pk-col="' + esc2(singlePkName) + '" data-pk-raw="' + esc2(pkRaw) + '" title="Delete this row">Delete</button></td>';
      }
      html += "</tr>";
    });
    html += "</tbody></table>";
    return html;
  }
  function wrapDataTableInScroll(tableHtml) {
    if (!tableHtml || tableHtml.indexOf("<table") < 0) return tableHtml;
    return '<div id="data-table-scroll-wrap" class="data-table-scroll-wrap">' + tableHtml + "</div>";
  }
  function getVisibleColumnCount(dataKeys, columnConfig) {
    if (!dataKeys || dataKeys.length === 0) return 0;
    var order = dataKeys.slice();
    var hidden = [];
    if (columnConfig && columnConfig.order && columnConfig.order.length) {
      order = columnConfig.order.filter(function(k) {
        return dataKeys.indexOf(k) >= 0;
      });
      dataKeys.forEach(function(k) {
        if (order.indexOf(k) < 0) order.push(k);
      });
    }
    if (columnConfig && columnConfig.hidden) hidden = columnConfig.hidden;
    return order.filter(function(k) {
      return hidden.indexOf(k) < 0;
    }).length;
  }
  function buildTableStatusBar(total, offset2, limit2, displayedLen, columnCount) {
    var rangeText = displayedLen > 0 ? offset2 + 1 + "\u2013" + (offset2 + displayedLen) : "0";
    var totalText = total != null ? total.toLocaleString() : "?";
    var colText = columnCount != null && columnCount > 0 ? columnCount + " column" + (columnCount !== 1 ? "s" : "") : "";
    var parts = ['Showing <span class="table-status-range">' + rangeText + "</span> of " + totalText + " rows"];
    if (displayedLen === 0 && total != null && total > 0 && offset2 >= total) {
      parts.push("(past end of results)");
    }
    if (colText) parts.push(colText);
    return '<div class="table-status-bar" role="status">' + parts.join(" \u2022 ") + "</div>";
  }
  function columnTypeIcon(rawType) {
    if (!rawType) return "\u25CB";
    var t = rawType.toUpperCase();
    if (/INT/.test(t)) return "#";
    if (/CHAR|TEXT|CLOB|STRING/.test(t)) return "T";
    if (/REAL|FLOAT|DOUBLE|NUMERIC|DECIMAL/.test(t)) return ".#";
    if (/BLOB|BINARY/.test(t)) return "\u2B21";
    if (/BOOL/.test(t)) return "\u2713";
    if (/DATE|TIME|TIMESTAMP/.test(t)) return "\u25F7";
    return "\u25CB";
  }
  function buildTableDefinitionHtml(tableName) {
    var t = schemaTableByName2(tableName);
    if (!t || !t.columns || t.columns.length === 0) return "";
    var fkSet = {};
    var cachedFks = fkMetaCache[tableName] || [];
    cachedFks.forEach(function(fk) {
      fkSet[fk.fromColumn] = fk;
    });
    var rows = t.columns.map(function(c) {
      var rawType = c.type != null ? String(c.type).trim() : "";
      var icon = columnTypeIcon(rawType);
      var iconHtml = '<span class="table-def-icon" title="' + esc2(rawType || "unspecified") + '">' + esc2(icon) + "</span>";
      var badges = "";
      if (c.pk) badges += '<span class="table-def-badge table-def-badge-pk" title="Primary key">\u{1F511}</span>';
      if (fkSet[c.name]) badges += '<span class="table-def-badge table-def-badge-fk" title="FK \u2192 ' + esc2(fkSet[c.name].toTable) + "." + esc2(fkSet[c.name].toColumn) + '">\u{1F517}</span>';
      var flags = [];
      if (c.notnull) flags.push("NOT NULL");
      var flagStr = flags.length ? flags.join(", ") : "\u2014";
      var typCell = rawType ? esc2(rawType) : '<span class="table-def-type-empty">(unspecified)</span>';
      return '<tr><td class="table-def-icons">' + iconHtml + badges + '</td><td class="table-def-name" data-longpress-copy="' + esc2(c.name) + '">' + esc2(c.name) + '</td><td class="table-def-type">' + typCell + '</td><td class="table-def-flags">' + esc2(flagStr) + "</td></tr>";
    }).join("");
    return '<div class="table-definition-wrap td-collapsed" role="region" aria-label="Table definition"><div class="table-definition-heading">\u25BC Table definition</div><div class="table-definition-scroll"><table class="table-definition"><thead><tr><th class="table-def-icons" scope="col"></th><th scope="col">Column</th><th scope="col">Type</th><th scope="col">Constraints</th></tr></thead><tbody>' + rows + "</tbody></table></div></div>";
  }
  function bindResultsToggle() {
    var headings = document.querySelectorAll(".results-table-heading");
    for (var i = 0; i < headings.length; i++) {
      var heading = headings[i];
      if (heading.hasAttribute("data-toggle-bound")) continue;
      heading.setAttribute("data-toggle-bound", "1");
      heading.addEventListener("click", function() {
        var wrap = this.closest(".results-table-wrap");
        if (!wrap) return;
        var isCollapsed = wrap.classList.toggle("results-collapsed");
        var text = this.textContent || "";
        if (isCollapsed) {
          this.textContent = text.replace("\u25B2", "\u25BC");
        } else {
          this.textContent = text.replace("\u25BC", "\u25B2");
        }
      });
    }
  }
  function renderTableView(name, data) {
    const content = document.getElementById("content");
    const scope = getScope();
    const filtered2 = filterRows(data);
    const displayData = getTableDisplayData(data);
    const jsonStr = JSON.stringify(displayData, null, 2);
    setLastRenderedData(jsonStr);
    const metaText = rowCountText(name) + buildTableFilterMetaSuffix(filtered2.length, data.length);
    var formatBar = document.getElementById("display-format-bar");
    if (formatBar) formatBar.style.display = scope !== "schema" ? "flex" : "none";
    var rowDisplayWrap = document.getElementById("row-display-toggle-wrap");
    if (rowDisplayWrap) {
      rowDisplayWrap.style.display = scope === "data" || scope === "both" ? "flex" : "none";
      var allBtn = document.getElementById("row-display-all");
      var matchBtn = document.getElementById("row-display-matching");
      if (allBtn) allBtn.classList.toggle("active", !showOnlyMatchingRows);
      if (matchBtn) matchBtn.classList.toggle("active", showOnlyMatchingRows);
    }
    if (!fkMetaCache[name] && scope !== "both") {
      content.innerHTML = '<p class="meta">' + metaText + '</p><p class="meta">Loading\u2026</p>';
    }
    function renderDataHtml(fkMap, colTypes) {
      var defHtml = buildTableDefinitionHtml(name);
      var rawTableHtml = wrapDataTableInScroll(buildDataTableHtml(displayData, fkMap, colTypes, getColumnConfig(name))) + buildTableStatusBar(tableCounts[name], offset, limit, displayData.length, getVisibleColumnCount(Object.keys(displayData[0] || {}), getColumnConfig(name)));
      var rowCount = displayData.length;
      var totalCount = tableCounts[name];
      var resultsLabel = totalCount != null ? rowCount + " of " + totalCount.toLocaleString() + " rows" : rowCount + " row" + (rowCount !== 1 ? "s" : "");
      var tableHtml = '<div class="results-table-wrap" role="region" aria-label="Results"><div class="results-table-heading">\u25B2 Results \u2014 ' + resultsLabel + '</div><div class="results-table-body">' + rawTableHtml + "</div></div>";
      var qbHtml = buildQueryBuilderHtml(name, colTypes);
      if (scope === "both") {
        setLastRenderedSchema(cachedSchema);
        if (cachedSchema === null) {
          fetch("/api/schema", authOpts()).then(function(r) {
            return r.text();
          }).then(function(schema) {
            setCachedSchema(schema);
            setLastRenderedSchema(schema);
            content.innerHTML = buildBothViewSectionsHtml(name, metaText, qbHtml, tableHtml, schema, defHtml);
            bindQueryBuilderEvents(colTypes);
            if (queryBuilderState) restoreQueryBuilderUIState(queryBuilderState);
            applySearch();
            renderBreadcrumb();
            bindColumnTableEvents();
            bindResultsToggle();
          });
        } else {
          var dataSection = document.getElementById("both-data-section");
          if (dataSection) {
            var dataBody = dataSection.querySelector(".collapsible-body");
            var headerEl = dataSection.querySelector(".collapsible-header");
            if (dataBody) dataBody.innerHTML = '<p class="meta">' + metaText + "</p>" + defHtml + qbHtml + tableHtml;
            if (headerEl) headerEl.textContent = "Table data: " + name;
            bindColumnTableEvents();
            bindQueryBuilderEvents(colTypes);
            if (queryBuilderState) restoreQueryBuilderUIState(queryBuilderState);
          }
          applySearch();
          renderBreadcrumb();
          bindResultsToggle();
        }
      } else {
        setLastRenderedSchema(null);
        content.innerHTML = '<p class="meta">' + metaText + "</p>" + defHtml + qbHtml + tableHtml;
        bindQueryBuilderEvents(colTypes);
        if (queryBuilderState) restoreQueryBuilderUIState(queryBuilderState);
        applySearch();
        renderBreadcrumb();
        bindColumnTableEvents();
        bindResultsToggle();
      }
    }
    Promise.all([
      loadFkMeta(name),
      loadColumnTypes(name).catch(function() {
        return {};
      })
    ]).then(function(results) {
      var fks = results[0];
      var colTypes = results[1];
      var fkMap = {};
      (fks || []).forEach(function(fk) {
        fkMap[fk.fromColumn] = fk;
      });
      renderDataHtml(fkMap, colTypes);
    });
  }
  function getVisibleDataColumnKeys(childElement) {
    var root = childElement ? childElement.closest(".drift-table") : null;
    if (!root) root = document.querySelector(".drift-table");
    if (!root) return [];
    var ths = root.querySelectorAll("thead th[data-column-key]");
    return Array.prototype.slice.call(ths).map(function(th) {
      return th.getAttribute("data-column-key") || "";
    });
  }
  function schemaTableByName2(name) {
    var meta = schemaMeta;
    if (!meta || !meta.tables || !name) return null;
    for (var i = 0; i < meta.tables.length; i++) {
      if (meta.tables[i].name === name) return meta.tables[i];
    }
    return null;
  }
  function getPkColumnNameForDataTable() {
    var t = schemaTableByName2(currentTableName);
    if (!t || !t.columns) return null;
    for (var i = 0; i < t.columns.length; i++) {
      if (t.columns[i].pk) return t.columns[i].name;
    }
    return null;
  }
  function getSinglePkColumnName(tableName) {
    var t = schemaTableByName2(tableName);
    if (!t || !t.columns) return null;
    var pkCols = t.columns.filter(function(c) {
      return !!c.pk;
    });
    if (pkCols.length !== 1) return null;
    return pkCols[0].name;
  }
  function syncMastheadMaskBadge(checked) {
    var badge = document.getElementById("masthead-mask-badge");
    if (badge) badge.style.display = checked ? "" : "none";
  }
  function initPiiMaskToggle() {
    var cb = document.getElementById("tb-mask-checkbox");
    var sw = document.getElementById("tb-mask-toggle");
    if (!cb) return;
    function syncSwitch() {
      if (sw) sw.setAttribute("aria-pressed", cb.checked ? "true" : "false");
    }
    syncMastheadMaskBadge(cb.checked);
    syncSwitch();
    cb.addEventListener("change", function() {
      syncMastheadMaskBadge(cb.checked);
      syncSwitch();
      if (currentTableName && currentTableJson) {
        renderTableView(currentTableName, currentTableJson);
      }
      var searchResults = document.getElementById("search-results");
      if (searchResults && searchResults.innerHTML.indexOf("<table") >= 0) {
        applySearch();
      }
    });
  }

  // assets/web/session.ts
  function captureViewerState() {
    var state = {
      currentTable: currentTableName,
      sqlInput: document.getElementById("sql-input").value,
      searchTerm: document.getElementById("search-input") ? document.getElementById("search-input").value : "",
      theme: localStorage.getItem(THEME_KEY),
      limit,
      offset,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
    return state;
  }
  function copyShareUrl(shareUrl, expiresAt) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(shareUrl).then(function() {
        alert("Share URL copied to clipboard!\n\n" + shareUrl + "\n\nExpires: " + new Date(expiresAt).toLocaleString());
      }).catch(function() {
        prompt("Copy this share URL:", shareUrl);
      });
    } else {
      prompt("Copy this share URL:", shareUrl);
    }
  }
  function createShareSession() {
    var note = prompt("Add a note for your team (optional):\n\nSession will expire in 1 hour.");
    if (note === null) return;
    var btn = document.getElementById("tb-share-btn");
    btn.disabled = true;
    setButtonBusy(btn, true, "Sharing\u2026");
    var state = captureViewerState();
    if (note) state.note = note;
    fetch("/api/session/share", authOpts({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state)
    })).then(function(r) {
      if (!r.ok) throw new Error("Server error " + r.status);
      return r.json();
    }).then(function(data) {
      copyShareUrl(location.origin + location.pathname + data.url, data.expiresAt);
    }).catch(function(e) {
      alert("Failed to create share: " + e.message);
    }).finally(function() {
      btn.disabled = false;
      btn.classList.remove("btn-busy");
      btn.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">share</span>Share';
    });
  }
  function applySessionState(state) {
    if (state.currentTable) {
      setTimeout(function() {
        openTableTab(state.currentTable);
      }, 500);
    }
    if (state.sqlInput) {
      document.getElementById("sql-input").value = state.sqlInput;
    }
    if (state.searchTerm && document.getElementById("search-input")) {
      document.getElementById("search-input").value = state.searchTerm;
    }
    if (state.limit) setLimit(state.limit);
    if (state.offset) setOffset(state.offset);
  }
  function showSessionExpiredBanner() {
    var banner = document.createElement("div");
    banner.style.cssText = "background:#f8d7da;color:#721c24;padding:0.75rem;font-size:13px;text-align:center;border-bottom:2px solid #f5c6cb;";
    banner.innerHTML = '<strong>Session Expired</strong><br>The shared session you are trying to access has expired or was not found.<br><span style="font-size:11px;color:#856404;">Sessions expire after 1 hour. Ask the person who shared the link to create a new one.</span>';
    document.body.prepend(banner);
  }
  function updateSessionCountdown(countdownEl) {
    var target = currentSessionExpiresAt;
    if (!target) return;
    var now = /* @__PURE__ */ new Date();
    var exp = new Date(target);
    var diffMs = exp.getTime() - now.getTime();
    if (diffMs <= 0) {
      countdownEl.textContent = "EXPIRED";
      countdownEl.style.color = "#ff4444";
      var bar = document.getElementById("session-info-bar");
      if (bar) bar.style.background = "#cc3333";
      if (sessionCountdownInterval) {
        clearInterval(sessionCountdownInterval);
        setSessionCountdownInterval(null);
      }
      var extBtn = document.getElementById("session-extend-btn");
      if (extBtn) extBtn.style.display = "none";
      return;
    }
    var mins = Math.floor(diffMs / 6e4);
    var secs = Math.floor(diffMs % 6e4 / 1e3);
    if (mins < 10) {
      countdownEl.style.color = "#ffcc00";
      countdownEl.textContent = "Expires in " + mins + "m " + secs + "s";
      if (!sessionFastMode && sessionCountdownInterval) {
        setSessionFastMode(true);
        clearInterval(sessionCountdownInterval);
        setSessionCountdownInterval(setInterval(function() {
          updateSessionCountdown(countdownEl);
        }, 1e4));
      }
      if (!sessionWarningShown) {
        setSessionWarningShown(true);
        var warningBanner = document.createElement("div");
        warningBanner.id = "session-expiry-warning";
        warningBanner.style.cssText = "background:#fff3cd;color:#856404;padding:0.3rem 0.5rem;font-size:12px;text-align:center;border-bottom:1px solid #ffc107;";
        warningBanner.textContent = 'Warning: This session expires in less than 10 minutes. Click "Extend" to add more time.';
        var bar = document.getElementById("session-info-bar");
        if (bar && bar.nextSibling) {
          bar.parentNode.insertBefore(warningBanner, bar.nextSibling);
        } else if (bar) {
          bar.parentNode.appendChild(warningBanner);
        }
      }
    } else {
      countdownEl.textContent = "Expires in " + mins + " min";
    }
  }
  function extendSession() {
    if (!currentSessionId) return;
    var extBtn = document.getElementById("session-extend-btn");
    if (extBtn) {
      extBtn.disabled = true;
      extBtn.textContent = "Extending\u2026";
    }
    fetch(
      "/api/session/" + encodeURIComponent(currentSessionId) + "/extend",
      authOpts({ method: "POST" })
    ).then(function(r) {
      if (!r.ok) throw new Error("Failed to extend session");
      return r.json();
    }).then(function(data) {
      setCurrentSessionExpiresAt(data.expiresAt);
      setSessionWarningShown(false);
      setSessionFastMode(false);
      var warning = document.getElementById("session-expiry-warning");
      if (warning) warning.remove();
      var bar = document.getElementById("session-info-bar");
      if (bar) bar.style.background = "var(--link)";
      var countdownEl = document.getElementById("session-countdown");
      if (countdownEl) {
        countdownEl.style.color = "";
        if (sessionCountdownInterval) clearInterval(sessionCountdownInterval);
        updateSessionCountdown(countdownEl);
        setSessionCountdownInterval(setInterval(function() {
          updateSessionCountdown(countdownEl);
        }, 3e4));
      }
      showCopyToast("Session extended!");
    }).catch(function(e) {
      alert("Failed to extend session: " + e.message);
    }).finally(function() {
      if (extBtn) {
        extBtn.disabled = false;
        extBtn.textContent = "Extend";
      }
    });
  }
  function renderSessionInfoBar(state, createdAt, expiresAt) {
    var infoBar = document.createElement("div");
    infoBar.id = "session-info-bar";
    infoBar.style.cssText = "background:var(--link);color:var(--bg);padding:0.3rem 0.5rem;font-size:12px;text-align:center;";
    var info = "Shared session";
    if (state.note) info += ': "' + esc2(state.note) + '"';
    info += " (created " + new Date(createdAt).toLocaleString() + ")";
    var infoSpan = document.createElement("span");
    infoSpan.textContent = info;
    var countdownSpan = document.createElement("span");
    countdownSpan.id = "session-countdown";
    countdownSpan.style.cssText = "margin-left:1rem;font-weight:bold;";
    var extendBtn = document.createElement("button");
    extendBtn.id = "session-extend-btn";
    extendBtn.textContent = "Extend";
    extendBtn.title = "Extend session by 1 hour";
    extendBtn.style.cssText = "margin-left:0.5rem;font-size:11px;padding:0.1rem 0.4rem;cursor:pointer;background:var(--bg);color:var(--link);border:1px solid var(--bg);border-radius:3px;";
    extendBtn.addEventListener("click", function() {
      extendSession();
    });
    infoBar.appendChild(infoSpan);
    infoBar.appendChild(countdownSpan);
    infoBar.appendChild(extendBtn);
    document.body.prepend(infoBar);
    setCurrentSessionExpiresAt(expiresAt);
    updateSessionCountdown(countdownSpan);
    setSessionCountdownInterval(setInterval(function() {
      updateSessionCountdown(countdownSpan);
    }, 3e4));
  }
  function renderSessionAnnotations(annotations) {
    if (!annotations || annotations.length === 0) return;
    var annoEl = document.createElement("div");
    annoEl.style.cssText = "background:var(--bg-pre);padding:0.3rem 0.5rem;font-size:11px;border-left:3px solid var(--link);margin:0.3rem 0;";
    var annoHtml = "<strong>Annotations:</strong><br>";
    annotations.forEach(function(a) {
      annoHtml += '<span class="meta">[' + esc2(a.author) + " at " + new Date(a.at).toLocaleTimeString() + "]</span> " + esc2(a.text) + "<br>";
    });
    annoEl.innerHTML = annoHtml;
    document.body.children[1] ? document.body.insertBefore(annoEl, document.body.children[1]) : document.body.appendChild(annoEl);
  }
  function restoreSession() {
    var params = new URLSearchParams(location.search);
    var sessionId = params.get("session");
    if (!sessionId) return;
    fetch("/api/session/" + encodeURIComponent(sessionId), authOpts()).then(function(r) {
      if (!r.ok) {
        showSessionExpiredBanner();
        throw new Error("Session expired or not found");
      }
      return r.json();
    }).then(function(data) {
      var state = data.state || {};
      setCurrentSessionId(sessionId);
      setCurrentSessionExpiresAt(data.expiresAt);
      applySessionState(state);
      renderSessionInfoBar(state, data.createdAt, data.expiresAt);
      renderSessionAnnotations(data.annotations);
    }).catch(function(e) {
      console.warn("Session restore failed:", e.message);
    });
  }

  // assets/web/nl-to-sql.ts
  function nlToSql(question, meta) {
    const q = question.toLowerCase().trim();
    const tables = meta.tables || [];
    let target = null;
    for (let i = 0; i < tables.length; i++) {
      const t = tables[i];
      const name = t.name.toLowerCase();
      const singular = name.endsWith("s") ? name.slice(0, -1) : name;
      if (q.includes(name) || q.includes(singular)) {
        target = t;
        break;
      }
    }
    if (!target && tables.length === 1) target = tables[0];
    if (!target) return { sql: null, error: "Could not identify a table from your question." };
    const mentioned = target.columns.filter(function(c) {
      return q.includes(c.name.toLowerCase().replace(/_/g, " ")) || q.includes(c.name.toLowerCase());
    });
    const selectCols = mentioned.length > 0 ? mentioned.map(function(c) {
      return '"' + c.name + '"';
    }).join(", ") : "*";
    let sql = "";
    const tn = '"' + target.name + '"';
    if (/how many|count|total number/i.test(q)) {
      sql = "SELECT COUNT(*) FROM " + tn;
    } else if (/average|avg|mean/i.test(q)) {
      const numCol = mentioned.find(function(c) {
        return /int|real|num|float/i.test(c.type);
      }) || target.columns.find(function(c) {
        return /int|real|num|float/i.test(c.type);
      });
      sql = numCol ? 'SELECT AVG("' + numCol.name + '") FROM ' + tn : "SELECT * FROM " + tn + " LIMIT 50";
    } else if (/sum|total\b/i.test(q) && !/total number/i.test(q)) {
      const numCol = mentioned.find(function(c) {
        return /int|real|num|float/i.test(c.type);
      }) || target.columns.find(function(c) {
        return /int|real|num|float/i.test(c.type);
      });
      sql = numCol ? 'SELECT SUM("' + numCol.name + '") FROM ' + tn : "SELECT * FROM " + tn + " LIMIT 50";
    } else if (/max|maximum|highest|largest|biggest/i.test(q)) {
      const numCol = mentioned.find(function(c) {
        return /int|real|num|float/i.test(c.type);
      }) || target.columns.find(function(c) {
        return /int|real|num|float/i.test(c.type);
      });
      sql = numCol ? 'SELECT MAX("' + numCol.name + '") FROM ' + tn : "SELECT * FROM " + tn + " ORDER BY 1 DESC LIMIT 1";
    } else if (/min|minimum|lowest|smallest/i.test(q)) {
      const numCol = mentioned.find(function(c) {
        return /int|real|num|float/i.test(c.type);
      }) || target.columns.find(function(c) {
        return /int|real|num|float/i.test(c.type);
      });
      sql = numCol ? 'SELECT MIN("' + numCol.name + '") FROM ' + tn : "SELECT * FROM " + tn + " ORDER BY 1 ASC LIMIT 1";
    } else if (/distinct|unique/i.test(q)) {
      const col = mentioned[0] || target.columns[1] || target.columns[0];
      sql = 'SELECT DISTINCT "' + col.name + '" FROM ' + tn;
    } else if (/latest|newest|most recent|last (\d+)/i.test(q)) {
      const dateCol = target.columns.find(function(c) {
        return /date|time|created|updated/i.test(c.name);
      });
      const match = q.match(/last (\d+)/i);
      const lim = match ? parseInt(match[1]) : 10;
      sql = "SELECT " + selectCols + " FROM " + tn + (dateCol ? ' ORDER BY "' + dateCol.name + '" DESC' : "") + " LIMIT " + lim;
    } else if (/oldest|earliest|first (\d+)/i.test(q)) {
      const dateCol = target.columns.find(function(c) {
        return /date|time|created|updated/i.test(c.name);
      });
      const match2 = q.match(/first (\d+)/i);
      const lim = match2 ? parseInt(match2[1]) : 10;
      sql = "SELECT " + selectCols + " FROM " + tn + (dateCol ? ' ORDER BY "' + dateCol.name + '" ASC' : "") + " LIMIT " + lim;
    } else if (/group by|per\s+\w+|by\s+\w+/i.test(q)) {
      const groupCol = mentioned[0] || target.columns[1] || target.columns[0];
      sql = 'SELECT "' + groupCol.name + '", COUNT(*) AS count FROM ' + tn + ' GROUP BY "' + groupCol.name + '" ORDER BY count DESC';
    } else {
      sql = "SELECT " + selectCols + " FROM " + tn + " LIMIT 50";
    }
    return { sql, table: target.name };
  }

  // assets/web/nl-modal.ts
  function nlModalOnEscape(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      closeNlModal();
    }
  }
  function setNlModalError(msg, visible) {
    var modalErr = document.getElementById("nl-modal-error");
    if (visible && msg) {
      if (modalErr) {
        modalErr.textContent = msg;
        modalErr.style.display = "block";
      }
    } else if (modalErr) {
      modalErr.style.display = "none";
    }
  }
  async function applyNlLivePreview() {
    var ta = document.getElementById("nl-modal-input");
    var preview = document.getElementById("nl-modal-sql-preview");
    if (!ta || !preview) return;
    var question = String(ta.value || "").trim();
    if (!question) {
      preview.value = "";
      setNlModalError("", false);
      return;
    }
    try {
      var meta = await loadSchemaMeta();
      var result = nlToSql(question, meta);
      if (result.sql) {
        preview.value = result.sql;
        setNlModalError("", false);
      } else {
        preview.value = "";
        setNlModalError(result.error || "Could not convert to SQL.", true);
      }
    } catch (err) {
      preview.value = "";
      setNlModalError("Error: " + (err.message || err), true);
    }
  }
  function scheduleNlLivePreview() {
    if (nlLiveDebounce) clearTimeout(nlLiveDebounce);
    setNlLiveDebounce(setTimeout(function() {
      setNlLiveDebounce(null);
      applyNlLivePreview();
    }, 120));
  }
  function openNlModal() {
    var modal = document.getElementById("nl-modal");
    var ta = document.getElementById("nl-modal-input");
    if (!modal || !ta) return;
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    ta.focus();
    if (!nlModalEscapeListenerActive) {
      document.addEventListener("keydown", nlModalOnEscape);
      setNlModalEscapeListenerActive(true);
    }
    scheduleNlLivePreview();
  }
  function closeNlModal() {
    var modal = document.getElementById("nl-modal");
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
    if (nlModalEscapeListenerActive) {
      document.removeEventListener("keydown", nlModalOnEscape);
      setNlModalEscapeListenerActive(false);
    }
    var openBtn = document.getElementById("nl-open");
    if (openBtn) openBtn.focus();
  }
  async function useNlModal() {
    var ta = document.getElementById("nl-modal-input");
    var sqlEl = document.getElementById("sql-input");
    if (!ta || !sqlEl) return;
    var question = String(ta.value || "").trim();
    if (!question) {
      setNlModalError("Enter a question first.", true);
      return;
    }
    try {
      var meta = await loadSchemaMeta();
      var result = nlToSql(question, meta);
      if (result.sql) {
        sqlEl.value = result.sql;
        var mainErr = document.getElementById("sql-error");
        if (mainErr) {
          mainErr.textContent = "";
          mainErr.style.display = "none";
        }
        closeNlModal();
      } else {
        setNlModalError(result.error || "Could not convert to SQL.", true);
      }
    } catch (err) {
      setNlModalError("Error: " + (err.message || err), true);
    }
  }
  function initNlModalListeners() {
    var nlOpenEl = document.getElementById("nl-open");
    if (nlOpenEl) nlOpenEl.addEventListener("click", openNlModal);
    var nlBackdrop = document.getElementById("nl-modal-backdrop");
    if (nlBackdrop) nlBackdrop.addEventListener("click", closeNlModal);
    var nlCancel = document.getElementById("nl-cancel");
    if (nlCancel) nlCancel.addEventListener("click", closeNlModal);
    var nlUse = document.getElementById("nl-use");
    if (nlUse) nlUse.addEventListener("click", function() {
      useNlModal();
    });
    var nlModalInput = document.getElementById("nl-modal-input");
    if (nlModalInput) {
      nlModalInput.addEventListener("input", scheduleNlLivePreview);
      nlModalInput.addEventListener("paste", function() {
        setTimeout(scheduleNlLivePreview, 0);
      });
    }
  }

  // assets/web/cell-edit.ts
  var activeEditToken = 0;
  function hasUnsavedWebEdit() {
    return activeEditToken > 0;
  }
  function clearUnsavedWebEdit() {
    activeEditToken = 0;
  }
  function tryBeginUnsavedWebEdit() {
    if (activeEditToken > 0) return false;
    activeEditToken = 1;
    return true;
  }
  function readCellRawFromTd(td) {
    if (!td) return "";
    var btn = td.querySelector(".cell-copy-btn");
    if (btn && btn.hasAttribute("data-raw")) return btn.getAttribute("data-raw") || "";
    if (td.querySelector(".cell-null")) return "";
    return (td.textContent || "").trim();
  }
  function jsonPkValueForCellUpdate(rawStr, pkColName) {
    var t = schemaTableByName2(currentTableName);
    var col = null;
    if (t && t.columns) {
      for (var i = 0; i < t.columns.length; i++) {
        if (t.columns[i].name === pkColName) {
          col = t.columns[i];
          break;
        }
      }
    }
    var typ = (col && col.type || "").toUpperCase();
    if ((typ === "INTEGER" || typ === "INT") && /^-?\d+$/.test(String(rawStr))) {
      return parseInt(String(rawStr), 10);
    }
    if ((typ === "REAL" || typ === "FLOAT" || typ === "DOUBLE") && /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(String(rawStr))) {
      return parseFloat(String(rawStr));
    }
    return rawStr === "" ? null : rawStr;
  }
  function cellUpdateValueJson(inputValue, colMeta) {
    var typ = (colMeta.type || "").toUpperCase();
    var notNull = !!colMeta.notnull;
    var trimmed = (inputValue || "").trim();
    var textLike = typ === "" || typ.indexOf("CHAR") >= 0 || typ.indexOf("CLOB") >= 0 || typ.indexOf("TEXT") >= 0;
    if (trimmed === "") {
      if (!notNull) return null;
      if (textLike) return "";
      return "__INVALID__";
    }
    return inputValue;
  }
  function validateCellFormat(value, colMeta) {
    var trimmed = value.trim();
    var typ = (colMeta.type || "").toUpperCase();
    if (trimmed === "") {
      if (colMeta.notnull) {
        var textLike = typ === "" || /CHAR|CLOB|TEXT/.test(typ);
        if (!textLike) return "This column is NOT NULL \u2014 a value is required.";
      }
      return null;
    }
    var isIntLike = typ === "INTEGER" || typ === "INT" || typ === "BIGINT" || typ === "SMALLINT" || typ === "TINYINT";
    if ((isIntLike || typ === "") && isBooleanColumn(colMeta.name)) {
      var lower = trimmed.toLowerCase();
      if (lower !== "0" && lower !== "1" && lower !== "true" && lower !== "false") {
        return "Expected 0 or 1 (or true/false).";
      }
      return null;
    }
    if (isIntLike) {
      if (!/^-?\d+$/.test(trimmed)) return "Expected an integer (e.g. 42, -7).";
    }
    if (typ === "REAL" || typ === "FLOAT" || typ === "DOUBLE" || /NUMERIC|DECIMAL/.test(typ)) {
      if (isNaN(Number(trimmed)) || trimmed === "") return "Expected a number (e.g. 3.14, -0.5).";
    }
    return null;
  }
  function tryStartBrowserCellEdit(td) {
    if (!currentTableName) return;
    if (!tryBeginUnsavedWebEdit()) {
      window.alert("Finish or cancel the current edit before editing another cell.");
      return;
    }
    loadSchemaMeta().then(function() {
      var pkName = getPkColumnNameForDataTable();
      if (!pkName) {
        clearUnsavedWebEdit();
        window.alert("This table has no primary key column; inline edit is disabled.");
        return;
      }
      var columnKey = td.getAttribute("data-column-key") || "";
      if (!columnKey || columnKey === pkName) {
        clearUnsavedWebEdit();
        window.alert("Primary key columns cannot be edited inline.");
        return;
      }
      var t = schemaTableByName2(currentTableName);
      var colMeta = null;
      if (t && t.columns) {
        for (var j = 0; j < t.columns.length; j++) {
          if (t.columns[j].name === columnKey) {
            colMeta = t.columns[j];
            break;
          }
        }
      }
      if (!colMeta) {
        clearUnsavedWebEdit();
        return;
      }
      if ((colMeta.type || "").toUpperCase() === "BLOB") {
        clearUnsavedWebEdit();
        window.alert("BLOB columns cannot be edited inline.");
        return;
      }
      var keys = getVisibleDataColumnKeys(td);
      var colIdx = keys.indexOf(columnKey);
      var pkIdx = keys.indexOf(pkName);
      if (colIdx < 0 || pkIdx < 0) {
        clearUnsavedWebEdit();
        return;
      }
      var tr = td.closest("tr");
      if (!tr || !tr.children[pkIdx]) {
        clearUnsavedWebEdit();
        return;
      }
      var pkRaw = readCellRawFromTd(tr.children[pkIdx]);
      var pkJson = jsonPkValueForCellUpdate(pkRaw, pkName);
      var originalHtml = td.innerHTML;
      var startVal = readCellRawFromTd(td);
      var isNull = td.querySelector(".cell-null") != null;
      var initialEditText = isNull ? "" : String(startVal);
      var colType = (colMeta.type || "").toUpperCase() || "unspecified";
      var nullableLabel = colMeta.notnull ? "NOT NULL" : "nullable";
      var container = document.createElement("div");
      container.className = "cell-edit-container";
      var contextEl = document.createElement("div");
      contextEl.className = "cell-edit-context";
      contextEl.textContent = pkName + "=" + pkRaw + " \u2022 " + columnKey + " (" + colType + ", " + nullableLabel + ")";
      container.appendChild(contextEl);
      var currentEl = document.createElement("div");
      currentEl.className = "cell-edit-current";
      currentEl.textContent = "was: " + (isNull ? "NULL" : startVal);
      container.appendChild(currentEl);
      var input = document.createElement("input");
      input.type = "text";
      input.className = "cell-inline-editor";
      input.setAttribute("aria-label", "Edit " + columnKey);
      input.value = startVal;
      container.appendChild(input);
      var errorEl = document.createElement("div");
      errorEl.className = "cell-edit-error";
      container.appendChild(errorEl);
      var actions = document.createElement("div");
      actions.className = "cell-edit-actions";
      var saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.className = "btn-primary";
      saveBtn.textContent = "Save";
      var cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.textContent = "Cancel";
      actions.appendChild(saveBtn);
      actions.appendChild(cancelBtn);
      container.appendChild(actions);
      var failureActions = document.createElement("div");
      failureActions.className = "cell-edit-failure-actions";
      failureActions.style.display = "none";
      var retrySaveBtn = document.createElement("button");
      retrySaveBtn.type = "button";
      retrySaveBtn.className = "cell-edit-retry-btn";
      retrySaveBtn.textContent = "Retry save";
      var reloadTableBtn = document.createElement("button");
      reloadTableBtn.type = "button";
      reloadTableBtn.className = "cell-edit-reload-btn";
      reloadTableBtn.textContent = "Reload table";
      failureActions.appendChild(retrySaveBtn);
      failureActions.appendChild(reloadTableBtn);
      container.appendChild(failureActions);
      td.innerHTML = "";
      td.appendChild(container);
      input.focus();
      input.select();
      function updateDirtyHighlight() {
        var dirty = input.value !== initialEditText;
        td.classList.toggle("cell-edit-td-dirty", dirty);
        tr.classList.toggle("cell-edit-row-dirty", dirty);
      }
      input.addEventListener("input", function() {
        var err = validateCellFormat(input.value, colMeta);
        errorEl.textContent = err || "";
        errorEl.style.display = err ? "block" : "none";
        input.classList.toggle("cell-edit-invalid", !!err);
        updateDirtyHighlight();
      });
      updateDirtyHighlight();
      function restore() {
        td.classList.remove("cell-edit-td-dirty");
        tr.classList.remove("cell-edit-row-dirty");
        td.innerHTML = originalHtml;
        clearUnsavedWebEdit();
      }
      function commit() {
        failureActions.style.display = "none";
        var formatErr = validateCellFormat(input.value, colMeta);
        if (formatErr) {
          errorEl.textContent = formatErr;
          errorEl.style.display = "block";
          input.classList.add("cell-edit-invalid");
          input.focus();
          return;
        }
        var valJson = cellUpdateValueJson(input.value, colMeta);
        if (valJson === "__INVALID__") {
          errorEl.textContent = "This column is NOT NULL \u2014 a value is required.";
          errorEl.style.display = "block";
          input.classList.add("cell-edit-invalid");
          input.focus();
          return;
        }
        saveBtn.disabled = true;
        cancelBtn.disabled = true;
        fetch("/api/cell/update", authOpts({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            table: currentTableName,
            pkColumn: pkName,
            pkValue: pkJson,
            column: columnKey,
            value: valJson
          })
        })).then(function(r) {
          return r.json().then(function(data) {
            return { ok: r.ok, data };
          });
        }).then(function(res) {
          if (!res.ok || !res.data || res.data.error) {
            var msg = res.data && res.data.error ? res.data.error : "Request failed";
            errorEl.textContent = "Save failed: " + msg;
            errorEl.style.display = "block";
            input.classList.add("cell-edit-invalid");
            failureActions.style.display = "flex";
            saveBtn.disabled = false;
            cancelBtn.disabled = false;
            input.focus();
            return;
          }
          clearUnsavedWebEdit();
          loadTable(currentTableName);
        }).catch(function(err) {
          errorEl.textContent = "Save failed: " + (err && err.message ? err.message : String(err));
          errorEl.style.display = "block";
          input.classList.add("cell-edit-invalid");
          failureActions.style.display = "flex";
          saveBtn.disabled = false;
          cancelBtn.disabled = false;
          input.focus();
        });
      }
      retrySaveBtn.addEventListener("click", function() {
        failureActions.style.display = "none";
        commit();
      });
      reloadTableBtn.addEventListener("click", function() {
        clearUnsavedWebEdit();
        loadTable(currentTableName);
      });
      saveBtn.addEventListener("click", function() {
        commit();
      });
      cancelBtn.addEventListener("click", function() {
        restore();
      });
      input.addEventListener("keydown", function(ev) {
        if (ev.key === "Enter") {
          ev.preventDefault();
          commit();
        }
        if (ev.key === "Escape") {
          ev.preventDefault();
          restore();
        }
      });
    }).catch(function(err) {
      clearUnsavedWebEdit();
      window.alert("Could not load schema: " + (err && err.message ? err.message : String(err)));
    });
  }
  function showCellValuePopup(rawValue, columnKey) {
    var popup = document.getElementById("cell-value-popup");
    var textEl = document.getElementById("cell-value-popup-text");
    var titleEl = document.getElementById("cell-value-popup-title");
    if (!popup || !textEl || !titleEl) return;
    titleEl.textContent = columnKey ? "Cell value: " + columnKey : "Cell value";
    textEl.textContent = rawValue !== void 0 && rawValue !== null ? String(rawValue) : "";
    popup.classList.add("show");
    popup.setAttribute("aria-hidden", "false");
  }
  function hideCellValuePopup() {
    var popup = document.getElementById("cell-value-popup");
    if (!popup) return;
    popup.classList.remove("show");
    popup.setAttribute("aria-hidden", "true");
  }
  function setupCellValuePopupButtons() {
    var popup = document.getElementById("cell-value-popup");
    var copyBtn = document.getElementById("cell-value-popup-copy");
    var closeBtn = document.getElementById("cell-value-popup-close");
    var textEl = document.getElementById("cell-value-popup-text");
    if (!popup || !copyBtn || !closeBtn || !textEl) return;
    copyBtn.addEventListener("click", function() {
      copyCellValue(textEl.textContent || "");
    });
    closeBtn.addEventListener("click", hideCellValuePopup);
    popup.addEventListener("click", function(e) {
      if (e.target === popup) hideCellValuePopup();
    });
    document.addEventListener("keydown", function(e) {
      if (e.key === "Escape" && popup.classList.contains("show")) hideCellValuePopup();
    });
  }

  // assets/web/charts.ts
  function getChartSize() {
    var wrap = document.getElementById("chart-wrapper");
    if (!wrap) return { w: 600, h: 320 };
    var w = wrap.clientWidth || 600;
    var h = Math.max(320, wrap.clientHeight || 320);
    return { w, h };
  }
  function applyChartUI(title, description) {
    var container = document.getElementById("chart-container");
    if (!container) return;
    var titleEl = document.getElementById("chart-title");
    var descEl = document.getElementById("chart-description");
    var exportBar = document.getElementById("chart-export-toolbar");
    container.style.display = "block";
    if (titleEl) {
      if (title && title.trim()) {
        titleEl.textContent = title.trim();
        titleEl.style.display = "block";
      } else {
        titleEl.style.display = "none";
      }
    }
    if (descEl) {
      if (description && description.trim()) {
        descEl.textContent = description.trim();
        descEl.style.display = "block";
      } else {
        descEl.style.display = "none";
      }
    }
    if (exportBar) exportBar.style.display = "flex";
  }
  function renderBarChart(container, data, xKey, yKey, opts) {
    opts = opts || {};
    var size = getChartSize();
    var W = size.w, H = size.h, PAD = 56;
    var xLabel = opts.xLabel != null ? opts.xLabel : xKey;
    var yLabel = opts.yLabel != null ? opts.yLabel : yKey;
    var vals = data.map(function(d) {
      return Number(d[yKey]) || 0;
    });
    var maxVal = Math.max.apply(null, vals.concat([1]));
    var barW = Math.max(4, (W - PAD * 2) / data.length - 2);
    var plotH = H - PAD * 2;
    var svg = '<svg class="chart-svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">';
    svg += '<line class="chart-axis" x1="' + PAD + '" y1="' + (H - PAD) + '" x2="' + (W - PAD) + '" y2="' + (H - PAD) + '"/>';
    svg += '<line class="chart-axis" x1="' + PAD + '" y1="' + PAD + '" x2="' + PAD + '" y2="' + (H - PAD) + '"/>';
    for (var i = 0; i <= 4; i++) {
      var v = (maxVal / 4 * i).toFixed(maxVal > 100 ? 0 : 1);
      var y = H - PAD - i / 4 * plotH;
      svg += '<text class="chart-axis-label" x="' + (PAD - 6) + '" y="' + (y + 4) + '" text-anchor="end">' + esc2(v) + "</text>";
    }
    data.forEach(function(d, i2) {
      var val = Number(d[yKey]) || 0;
      var bh = val / maxVal * plotH;
      var x = PAD + i2 * (barW + 2);
      var by = H - PAD - bh;
      svg += '<rect class="chart-bar" x="' + x + '" y="' + by + '" width="' + barW + '" height="' + bh + '">';
      svg += "<title>" + esc2(String(d[xKey])) + ": " + val + "</title></rect>";
      if (data.length <= 20) {
        svg += '<text class="chart-label" x="' + (x + barW / 2) + '" y="' + (H - PAD + 16) + '" text-anchor="middle" transform="rotate(-45,' + (x + barW / 2) + "," + (H - PAD + 16) + ')">' + esc2(String(d[xKey]).slice(0, 12)) + "</text>";
      }
    });
    svg += '<text class="chart-axis-title chart-axis-y" x="12" y="' + H / 2 + '" text-anchor="middle" transform="rotate(-90, 12, ' + H / 2 + ')">' + esc2(yLabel) + "</text>";
    svg += '<text class="chart-axis-title chart-axis-x" x="' + W / 2 + '" y="' + (H - 8) + '" text-anchor="middle">' + esc2(xLabel) + "</text>";
    svg += "</svg>";
    container.innerHTML = svg;
    applyChartUI(opts.title, opts.description);
  }
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
      return groups[k].reduce(function(a, b) {
        return a + b;
      }, 0);
    });
    var maxVal = Math.max.apply(null, sums.concat([1]));
    var barW = Math.max(8, (W - PAD * 2) / labels.length - 4);
    var plotH = H - PAD * 2;
    var svg = '<svg class="chart-svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">';
    svg += '<line class="chart-axis" x1="' + PAD + '" y1="' + (H - PAD) + '" x2="' + (W - PAD) + '" y2="' + (H - PAD) + '"/>';
    svg += '<line class="chart-axis" x1="' + PAD + '" y1="' + PAD + '" x2="' + PAD + '" y2="' + (H - PAD) + '"/>';
    for (var i = 0; i <= 4; i++) {
      var v = (maxVal / 4 * i).toFixed(maxVal > 100 ? 0 : 1);
      var y = H - PAD - i / 4 * plotH;
      svg += '<text class="chart-axis-label" x="' + (PAD - 6) + '" y="' + (y + 4) + '" text-anchor="end">' + esc2(v) + "</text>";
    }
    labels.forEach(function(label, gi) {
      var segs = groups[label];
      var x = PAD + gi * (barW + 4) + 2;
      var accY = H - PAD;
      segs.forEach(function(val, si) {
        var bh = val / maxVal * plotH;
        var by = accY - bh;
        var color = CHART_COLORS[si % CHART_COLORS.length];
        svg += '<rect class="chart-bar chart-stacked-segment" x="' + x + '" y="' + by + '" width="' + barW + '" height="' + bh + '" fill="' + color + '">';
        svg += "<title>" + esc2(label) + " segment " + (si + 1) + ": " + val + "</title></rect>";
        accY = by;
      });
      if (labels.length <= 20) {
        svg += '<text class="chart-label" x="' + (x + barW / 2) + '" y="' + (H - PAD + 16) + '" text-anchor="middle" transform="rotate(-45,' + (x + barW / 2) + "," + (H - PAD + 16) + ')">' + esc2(String(label).slice(0, 10)) + "</text>";
      }
    });
    svg += '<text class="chart-axis-title chart-axis-y" x="12" y="' + H / 2 + '" text-anchor="middle" transform="rotate(-90, 12, ' + H / 2 + ')">' + esc2(yLabel) + "</text>";
    svg += '<text class="chart-axis-title chart-axis-x" x="' + W / 2 + '" y="' + (H - 8) + '" text-anchor="middle">' + esc2(xLabel) + "</text>";
    svg += "</svg>";
    container.innerHTML = svg;
    applyChartUI(opts.title, opts.description);
  }
  function renderPieChart(container, data, labelKey, valueKey, opts) {
    opts = opts || {};
    var size = getChartSize();
    var W = size.w, H = size.h, R = Math.min(130, Math.min(W, H) / 2 - 60), CX = Math.min(200, W / 2 - 40), CY = H / 2;
    var vals = data.map(function(d) {
      return Math.max(0, Number(d[valueKey]) || 0);
    });
    var total = vals.reduce(function(a, b) {
      return a + b;
    }, 0) || 1;
    var threshold = total * 0.02;
    var significant = [];
    var otherVal = 0;
    data.forEach(function(d, i) {
      if (vals[i] >= threshold) significant.push({ label: d[labelKey], value: vals[i] });
      else otherVal += vals[i];
    });
    if (otherVal > 0) significant.push({ label: "Other", value: otherVal });
    var svg = '<svg class="chart-svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">';
    var angle = 0;
    significant.forEach(function(d, i) {
      var sweep = d.value / total * 2 * Math.PI;
      var color = CHART_COLORS[i % CHART_COLORS.length];
      var pct = (d.value / total * 100).toFixed(1);
      var tip = "<title>" + esc2(String(d.label)) + ": " + d.value + " (" + pct + "%)</title>";
      if (sweep >= 2 * Math.PI - 1e-3) {
        svg += '<circle class="chart-slice" cx="' + CX + '" cy="' + CY + '" r="' + R + '" fill="' + color + '">' + tip + "</circle>";
      } else {
        var x1 = CX + R * Math.cos(angle);
        var y1 = CY + R * Math.sin(angle);
        var x2 = CX + R * Math.cos(angle + sweep);
        var y2 = CY + R * Math.sin(angle + sweep);
        var large = sweep > Math.PI ? 1 : 0;
        svg += '<path class="chart-slice" d="M' + CX + "," + CY + " L" + x1 + "," + y1 + " A" + R + "," + R + " 0 " + large + " 1 " + x2 + "," + y2 + ' Z" fill="' + color + '">' + tip + "</path>";
      }
      angle += sweep;
    });
    var lx = CX + R + 24;
    significant.forEach(function(d, i) {
      var ly = 24 + i * 20;
      var color = CHART_COLORS[i % CHART_COLORS.length];
      svg += '<rect x="' + lx + '" y="' + (ly - 10) + '" width="12" height="12" fill="' + color + '"/>';
      svg += '<text class="chart-legend" x="' + (lx + 18) + '" y="' + ly + '">' + esc2(String(d.label).slice(0, 24)) + " (" + d.value + ")</text>";
    });
    svg += "</svg>";
    container.innerHTML = svg;
    applyChartUI(opts.title, opts.description);
  }
  function renderLineChart(container, data, xKey, yKey, opts) {
    opts = opts || {};
    var size = getChartSize();
    var W = size.w, H = size.h, PAD = 56;
    var xLabel = opts.xLabel != null ? opts.xLabel : xKey;
    var yLabel = opts.yLabel != null ? opts.yLabel : yKey;
    var vals = data.map(function(d) {
      return Number(d[yKey]) || 0;
    });
    var maxVal = Math.max.apply(null, vals.concat([1]));
    var minVal = Math.min.apply(null, vals.concat([0]));
    var range = maxVal - minVal || 1;
    var stepX = (W - PAD * 2) / Math.max(data.length - 1, 1);
    var plotH = H - PAD * 2;
    var svg = '<svg class="chart-svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">';
    svg += '<line class="chart-axis" x1="' + PAD + '" y1="' + (H - PAD) + '" x2="' + (W - PAD) + '" y2="' + (H - PAD) + '"/>';
    svg += '<line class="chart-axis" x1="' + PAD + '" y1="' + PAD + '" x2="' + PAD + '" y2="' + (H - PAD) + '"/>';
    for (var i = 0; i <= 4; i++) {
      var v = (minVal + range * i / 4).toFixed(range > 100 ? 0 : 1);
      var y = H - PAD - i / 4 * plotH;
      svg += '<text class="chart-axis-label" x="' + (PAD - 6) + '" y="' + (y + 4) + '" text-anchor="end">' + esc2(v) + "</text>";
    }
    var points = data.map(function(d, i2) {
      var x = PAD + i2 * stepX;
      var y2 = H - PAD - ((Number(d[yKey]) || 0) - minVal) / range * plotH;
      return x + "," + y2;
    });
    svg += '<polyline class="chart-line" points="' + points.join(" ") + '"/>';
    data.forEach(function(d, i2) {
      var x = PAD + i2 * stepX;
      var y2 = H - PAD - ((Number(d[yKey]) || 0) - minVal) / range * plotH;
      svg += '<circle class="chart-dot" cx="' + x + '" cy="' + y2 + '" r="4"><title>' + esc2(String(d[xKey])) + ": " + d[yKey] + "</title></circle>";
    });
    svg += '<text class="chart-axis-title chart-axis-y" x="12" y="' + H / 2 + '" text-anchor="middle" transform="rotate(-90, 12, ' + H / 2 + ')">' + esc2(yLabel) + "</text>";
    svg += '<text class="chart-axis-title chart-axis-x" x="' + W / 2 + '" y="' + (H - 8) + '" text-anchor="middle">' + esc2(xLabel) + "</text>";
    svg += "</svg>";
    container.innerHTML = svg;
    applyChartUI(opts.title, opts.description);
  }
  function renderAreaChart(container, data, xKey, yKey, opts) {
    opts = opts || {};
    var size = getChartSize();
    var W = size.w, H = size.h, PAD = 56;
    var xLabel = opts.xLabel != null ? opts.xLabel : xKey;
    var yLabel = opts.yLabel != null ? opts.yLabel : yKey;
    var vals = data.map(function(d) {
      return Number(d[yKey]) || 0;
    });
    var maxVal = Math.max.apply(null, vals.concat([1]));
    var minVal = Math.min.apply(null, vals.concat([0]));
    var range = maxVal - minVal || 1;
    var stepX = (W - PAD * 2) / Math.max(data.length - 1, 1);
    var plotH = H - PAD * 2;
    var points = data.map(function(d, i2) {
      var x = PAD + i2 * stepX;
      var y2 = H - PAD - ((Number(d[yKey]) || 0) - minVal) / range * plotH;
      return x + "," + y2;
    });
    var areaPoints = PAD + "," + (H - PAD) + " " + points.join(" ") + " " + (PAD + (data.length - 1) * stepX) + "," + (H - PAD);
    var svg = '<svg class="chart-svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">';
    svg += '<line class="chart-axis" x1="' + PAD + '" y1="' + (H - PAD) + '" x2="' + (W - PAD) + '" y2="' + (H - PAD) + '"/>';
    svg += '<line class="chart-axis" x1="' + PAD + '" y1="' + PAD + '" x2="' + PAD + '" y2="' + (H - PAD) + '"/>';
    for (var i = 0; i <= 4; i++) {
      var v = (minVal + range * i / 4).toFixed(range > 100 ? 0 : 1);
      var y = H - PAD - i / 4 * plotH;
      svg += '<text class="chart-axis-label" x="' + (PAD - 6) + '" y="' + (y + 4) + '" text-anchor="end">' + esc2(v) + "</text>";
    }
    svg += '<polygon class="chart-area" points="' + areaPoints + '"/>';
    svg += '<polyline class="chart-line" points="' + points.join(" ") + '"/>';
    data.forEach(function(d, i2) {
      var x = PAD + i2 * stepX;
      var y2 = H - PAD - ((Number(d[yKey]) || 0) - minVal) / range * plotH;
      svg += '<circle class="chart-dot" cx="' + x + '" cy="' + y2 + '" r="3"><title>' + esc2(String(d[xKey])) + ": " + d[yKey] + "</title></circle>";
    });
    svg += '<text class="chart-axis-title chart-axis-y" x="12" y="' + H / 2 + '" text-anchor="middle" transform="rotate(-90, 12, ' + H / 2 + ')">' + esc2(yLabel) + "</text>";
    svg += '<text class="chart-axis-title chart-axis-x" x="' + W / 2 + '" y="' + (H - 8) + '" text-anchor="middle">' + esc2(xLabel) + "</text>";
    svg += "</svg>";
    container.innerHTML = svg;
    applyChartUI(opts.title, opts.description);
  }
  function renderScatterChart(container, data, xKey, yKey, opts) {
    opts = opts || {};
    var size = getChartSize();
    var W = size.w, H = size.h, PAD = 56;
    var xLabel = opts.xLabel != null ? opts.xLabel : xKey;
    var yLabel = opts.yLabel != null ? opts.yLabel : yKey;
    var xs = data.map(function(d) {
      return Number(d[xKey]);
    }).filter(function(v) {
      return isFinite(v);
    });
    var ys = data.map(function(d) {
      return Number(d[yKey]);
    }).filter(function(v) {
      return isFinite(v);
    });
    if (xs.length === 0 || ys.length === 0) {
      container.innerHTML = '<p class="meta">Scatter requires numeric X and Y columns.</p>';
      document.getElementById("chart-container").style.display = "block";
      var exportBar = document.getElementById("chart-export-toolbar");
      if (exportBar) exportBar.style.display = "none";
      return;
    }
    var minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs), rangeX = maxX - minX || 1;
    var minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys), rangeY = maxY - minY || 1;
    var plotW = W - PAD * 2, plotH = H - PAD * 2;
    var svg = '<svg class="chart-svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">';
    svg += '<line class="chart-axis" x1="' + PAD + '" y1="' + (H - PAD) + '" x2="' + (W - PAD) + '" y2="' + (H - PAD) + '"/>';
    svg += '<line class="chart-axis" x1="' + PAD + '" y1="' + PAD + '" x2="' + PAD + '" y2="' + (H - PAD) + '"/>';
    for (var i = 0; i <= 4; i++) {
      var vx = (minX + rangeX * i / 4).toFixed(rangeX > 100 ? 0 : 1);
      var vy = (minY + rangeY * i / 4).toFixed(rangeY > 100 ? 0 : 1);
      var x = PAD + i / 4 * plotW;
      var y = H - PAD - i / 4 * plotH;
      svg += '<text class="chart-axis-label" x="' + (x + (i === 0 ? -6 : 0)) + '" y="' + (H - PAD + 16) + '" text-anchor="' + (i === 0 ? "end" : "middle") + '">' + esc2(vx) + "</text>";
      svg += '<text class="chart-axis-label" x="' + (PAD - 6) + '" y="' + (y + 4) + '" text-anchor="end">' + esc2(vy) + "</text>";
    }
    data.forEach(function(d, i2) {
      var nx = (Number(d[xKey]) - minX) / rangeX;
      var ny = (Number(d[yKey]) - minY) / rangeY;
      if (!isFinite(nx) || !isFinite(ny)) return;
      var x2 = PAD + nx * plotW;
      var y2 = H - PAD - ny * plotH;
      var color = CHART_COLORS[i2 % CHART_COLORS.length];
      svg += '<circle class="chart-dot chart-scatter-dot" cx="' + x2 + '" cy="' + y2 + '" r="5" fill="' + color + '"><title>' + esc2(String(d[xKey])) + ", " + d[yKey] + "</title></circle>";
    });
    svg += '<text class="chart-axis-title chart-axis-y" x="12" y="' + H / 2 + '" text-anchor="middle" transform="rotate(-90, 12, ' + H / 2 + ')">' + esc2(yLabel) + "</text>";
    svg += '<text class="chart-axis-title chart-axis-x" x="' + W / 2 + '" y="' + (H - 8) + '" text-anchor="middle">' + esc2(xLabel) + "</text>";
    svg += "</svg>";
    container.innerHTML = svg;
    applyChartUI(opts.title, opts.description);
  }
  function renderHistogram(container, data, valueKey, bins, opts) {
    opts = opts || {};
    bins = bins || 10;
    var vals = data.map(function(d) {
      return Number(d[valueKey]);
    }).filter(function(v) {
      return isFinite(v);
    });
    if (vals.length === 0) {
      container.innerHTML = '<p class="meta">No numeric data.</p>';
      document.getElementById("chart-container").style.display = "block";
      var exportBar = document.getElementById("chart-export-toolbar");
      if (exportBar) exportBar.style.display = "none";
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
      return { label: (min + i * binWidth).toFixed(1) + "-" + (min + (i + 1) * binWidth).toFixed(1), value: c };
    });
    renderBarChart(container, histData, "label", "value", { title: opts.title, description: opts.description, xLabel: "Bin", yLabel: "Count" });
  }
  function exportChartPng() {
    var wrap = document.getElementById("chart-svg-wrap");
    var svgEl = wrap ? wrap.querySelector("svg") : null;
    var btn = document.getElementById("chart-export-png");
    if (!svgEl) return;
    if (btn) btn.disabled = true;
    var svgStr = new XMLSerializer().serializeToString(svgEl);
    var blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var img = new Image();
    function done() {
      if (btn) btn.disabled = false;
    }
    img.onload = function() {
      var c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      var ctx = c.getContext("2d");
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--bg") || "#fff";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0);
      c.toBlob(function(blob2) {
        URL.revokeObjectURL(url);
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob2);
        a.download = "chart.png";
        a.click();
        URL.revokeObjectURL(a.href);
        done();
      }, "image/png");
    };
    img.onerror = function() {
      URL.revokeObjectURL(url);
      done();
    };
    img.src = url;
  }
  function exportChartSvg() {
    var wrap = document.getElementById("chart-svg-wrap");
    var svgEl = wrap ? wrap.querySelector("svg") : null;
    if (!svgEl) return;
    var svgStr = new XMLSerializer().serializeToString(svgEl);
    var blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "chart.svg";
    a.click();
    URL.revokeObjectURL(a.href);
  }
  function exportChartCopy() {
    var wrap = document.getElementById("chart-svg-wrap");
    var svgEl = wrap ? wrap.querySelector("svg") : null;
    var btn = document.getElementById("chart-export-copy");
    if (!svgEl) return;
    if (btn) btn.disabled = true;
    var svgStr = new XMLSerializer().serializeToString(svgEl);
    var blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var img = new Image();
    function done() {
      if (btn) btn.disabled = false;
    }
    img.onload = function() {
      var c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      var ctx = c.getContext("2d");
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--bg") || "#fff";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0);
      c.toBlob(function(blob2) {
        URL.revokeObjectURL(url);
        if (navigator.clipboard && navigator.clipboard.write) {
          var copyBtn = btn;
          navigator.clipboard.write([new ClipboardItem({ "image/png": blob2 })]).then(function() {
            if (copyBtn) {
              copyBtn.textContent = "Copied!";
              setTimeout(function() {
                copyBtn.textContent = "Copy image";
              }, 1500);
            }
          }).catch(function() {
          }).finally(done);
        } else {
          done();
        }
      }, "image/png");
    };
    img.onerror = function() {
      URL.revokeObjectURL(url);
      done();
    };
    img.src = url;
  }
  function setupChartResize() {
    var wrap = document.getElementById("chart-wrapper");
    if (!wrap) return;
    var resizeTimer = null;
    var THROTTLE_MS = 150;
    function redrawChart() {
      if (!lastChartState) return;
      var container = document.getElementById("chart-svg-wrap");
      if (!container || !container.querySelector("svg")) return;
      var s = lastChartState;
      if (s.type === "bar") renderBarChart(container, s.data, s.xKey, s.yKey, s.opts);
      else if (s.type === "stacked-bar") renderStackedBarChart(container, s.data, s.xKey, s.yKey, s.opts);
      else if (s.type === "pie") renderPieChart(container, s.data, s.xKey, s.yKey, s.opts);
      else if (s.type === "line") renderLineChart(container, s.data, s.xKey, s.yKey, s.opts);
      else if (s.type === "area") renderAreaChart(container, s.data, s.xKey, s.yKey, s.opts);
      else if (s.type === "scatter") renderScatterChart(container, s.data, s.xKey, s.yKey, s.opts);
      else if (s.type === "histogram") renderHistogram(container, s.data, s.yKey, 10, s.opts);
    }
    setChartResizeObserver(new ResizeObserver(function() {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function() {
        resizeTimer = null;
        redrawChart();
      }, THROTTLE_MS);
    }));
    chartResizeObserver.observe(wrap);
  }

  // assets/web/theme.ts
  function applyTheme(theme) {
    if (theme === true) theme = "dark";
    if (theme === false) theme = "light";
    document.body.classList.remove("theme-dark", "theme-light", "theme-showcase", "theme-midnight");
    document.body.classList.add("theme-" + theme);
    var themeOptions = document.querySelectorAll(".tb-theme-option");
    for (var i = 0; i < themeOptions.length; i++) {
      var opt = themeOptions[i];
      var isActive = opt.getAttribute("data-theme") === theme;
      opt.classList.toggle("active", isActive);
      opt.setAttribute("aria-pressed", isActive ? "true" : "false");
    }
  }
  function detectVscodeTheme() {
    if (document.body.classList.contains("vscode-dark")) return "dark";
    if (document.body.classList.contains("vscode-light")) return "light";
    var kind = document.documentElement.getAttribute("data-vscode-theme-kind");
    if (kind === "vscode-dark" || kind === "vscode-high-contrast") return "dark";
    if (kind === "vscode-light" || kind === "vscode-high-contrast-light") return "light";
    return null;
  }
  function initTheme() {
    var saved = localStorage.getItem(THEME_KEY);
    if (saved) {
      applyTheme(saved);
      return;
    }
    var vscodeTheme = detectVscodeTheme();
    if (vscodeTheme) {
      applyTheme(vscodeTheme);
      return;
    }
    var prefersDark = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)").matches : false;
    applyTheme(prefersDark ? "dark" : "light");
  }
  function initThemeListeners() {
    if (window.matchMedia) {
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function(e) {
        if (!localStorage.getItem(THEME_KEY)) {
          applyTheme(e.matches ? "dark" : "light");
        }
      });
    }
  }

  // assets/web/long-press-copy.ts
  var HOLD_MS = 520;
  var MOVE_MAX_PX = 14;
  var listenersInstalled = false;
  var holdTimer = null;
  var startX = 0;
  var startY = 0;
  var touchStartEl = null;
  var activeTouchId = null;
  function clearHold() {
    if (holdTimer != null) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
  }
  function inBlockingFormField(el) {
    if (!el) return true;
    if (el.closest("textarea, select")) return true;
    var inp = el.closest("input");
    if (inp instanceof HTMLInputElement) {
      var t = (inp.type || "text").toLowerCase();
      if (t !== "checkbox" && t !== "radio") return true;
    }
    return false;
  }
  function resolveLongPressCopyText(target) {
    if (!target) return null;
    var explicit = target.closest("[data-longpress-copy]");
    if (explicit) {
      var v = explicit.getAttribute("data-longpress-copy");
      return v != null && v !== "" ? v : null;
    }
    if (target.closest(".table-pin-btn, .tab-btn-close, .cell-inline-editor")) return null;
    var fk = target.closest(".fk-link[data-table][data-column]");
    if (fk) {
      var dt = fk.getAttribute("data-table");
      var dc = fk.getAttribute("data-column");
      if (dt && dc) return dt + "." + dc;
    }
    var th = target.closest(".drift-table th[data-column-key]");
    if (th) {
      var key = th.getAttribute("data-column-key");
      return key != null && key !== "" ? key : null;
    }
    var td = target.closest(".drift-table td[data-column-key]");
    if (td) {
      var btn = td.querySelector(".cell-copy-btn");
      var raw = btn && btn.getAttribute("data-raw");
      if (raw != null) return raw;
      var txt = (td.textContent || "").trim();
      return txt || td.getAttribute("data-column-key");
    }
    var defName = target.closest(".table-def-name");
    if (defName) {
      var n = (defName.textContent || "").trim();
      return n || null;
    }
    var tableLink = target.closest("a.table-link[data-table]");
    if (tableLink && !target.closest(".table-pin-btn")) {
      var tn = tableLink.getAttribute("data-table");
      return tn != null && tn !== "" ? tn : null;
    }
    var browse = target.closest(".tables-browse-card[data-table]");
    if (browse) {
      var b = browse.getAttribute("data-table");
      return b != null && b !== "" ? b : null;
    }
    var diagram = target.closest(".diagram-table[data-table]");
    if (diagram) {
      var d = diagram.getAttribute("data-table");
      return d != null && d !== "" ? d : null;
    }
    var sizeLink = target.closest("a.size-table-link[data-table]");
    if (sizeLink) {
      var s = sizeLink.getAttribute("data-table");
      return s != null && s !== "" ? s : null;
    }
    var sqlTh = target.closest("th[data-column-key]");
    if (sqlTh) {
      var sk = sqlTh.getAttribute("data-column-key");
      return sk != null && sk !== "" ? sk : null;
    }
    var tabBtn = target.closest(".tab-btn[data-tab]");
    if (tabBtn) {
      var tid = tabBtn.getAttribute("data-tab") || "";
      if (tid.indexOf("tbl:") === 0) return tid.slice(4);
    }
    var qbLabel = target.closest("#qb-columns label");
    if (qbLabel) {
      var cbin = qbLabel.querySelector('input[type="checkbox"][value]');
      if (cbin) {
        var val = cbin.getAttribute("value");
        return val != null && val !== "" ? val : null;
      }
    }
    return null;
  }
  function armClickSuppression() {
    function onClickCap(e) {
      document.removeEventListener("click", onClickCap, true);
      e.preventDefault();
      e.stopPropagation();
    }
    setTimeout(function() {
      document.addEventListener("click", onClickCap, true);
    }, 0);
    setTimeout(function() {
      document.removeEventListener("click", onClickCap, true);
    }, 500);
  }
  function initLongPressCopy() {
    if (listenersInstalled) return;
    listenersInstalled = true;
    document.addEventListener(
      "touchstart",
      function(e) {
        if (e.touches.length > 1) {
          clearHold();
          activeTouchId = null;
          touchStartEl = null;
          return;
        }
        if (e.touches.length !== 1) return;
        var t = e.touches[0];
        var rawTarget = e.target;
        var el = rawTarget instanceof Element ? rawTarget : document.elementFromPoint(t.clientX, t.clientY);
        if (!el || inBlockingFormField(el)) return;
        var preview = resolveLongPressCopyText(el);
        if (!preview) return;
        clearHold();
        activeTouchId = t.identifier;
        startX = t.clientX;
        startY = t.clientY;
        touchStartEl = el;
        holdTimer = setTimeout(function() {
          holdTimer = null;
          var toCopy = touchStartEl ? resolveLongPressCopyText(touchStartEl) : null;
          if (!toCopy) return;
          copyCellValue(toCopy);
          if (navigator.vibrate) {
            try {
              navigator.vibrate(12);
            } catch {
            }
          }
          armClickSuppression();
        }, HOLD_MS);
      },
      { passive: true, capture: true }
    );
    document.addEventListener(
      "touchmove",
      function(e) {
        if (holdTimer == null || activeTouchId == null) return;
        if (e.touches.length > 1) {
          clearHold();
          activeTouchId = null;
          touchStartEl = null;
          return;
        }
        for (var i = 0; i < e.touches.length; i++) {
          if (e.touches[i].identifier === activeTouchId) {
            var t = e.touches[i];
            var dx = t.clientX - startX;
            var dy = t.clientY - startY;
            if (dx * dx + dy * dy > MOVE_MAX_PX * MOVE_MAX_PX) {
              clearHold();
              activeTouchId = null;
              touchStartEl = null;
            }
            return;
          }
        }
      },
      { passive: true, capture: true }
    );
    function endTouch(e) {
      if (activeTouchId == null) return;
      for (var i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === activeTouchId) {
          clearHold();
          activeTouchId = null;
          touchStartEl = null;
          return;
        }
      }
    }
    document.addEventListener("touchend", endTouch, { passive: true, capture: true });
    document.addEventListener("touchcancel", endTouch, { passive: true, capture: true });
  }

  // assets/web/sidebar.ts
  var layout = null;
  var aside = null;
  function applyAppSidebarCollapsed(collapsed) {
    if (!layout || !aside) return;
    layout.classList.toggle("app-sidebar-panel-collapsed", collapsed);
    aside.setAttribute("aria-hidden", collapsed ? "true" : "false");
  }
  function toggleSidebarCollapsed() {
    if (!layout) return;
    var collapsed = !layout.classList.contains("app-sidebar-panel-collapsed");
    applyAppSidebarCollapsed(collapsed);
    try {
      localStorage.setItem(APP_SIDEBAR_PANEL_KEY, collapsed ? "1" : "0");
    } catch (e) {
    }
  }
  function initSidebarCollapse() {
    layout = document.getElementById("app-layout");
    aside = document.getElementById("app-sidebar");
    if (!layout || !aside) return;
    var storedCollapsed = false;
    try {
      storedCollapsed = localStorage.getItem(APP_SIDEBAR_PANEL_KEY) === "1";
    } catch (e) {
    }
    applyAppSidebarCollapsed(storedCollapsed);
    try {
      localStorage.removeItem("saropa_sidebar_tables_collapsed");
    } catch (e) {
    }
  }

  // assets/web/history-sidebar.ts
  var entries = [];
  var activeFilter = "all";
  var listEl = null;
  var countEl = null;
  var sidebarEl = null;
  function filtered() {
    if (activeFilter === "all") return entries;
    return entries.filter((e) => e.source === activeFilter);
  }
  function render() {
    if (!listEl) return;
    const items = filtered();
    countEl?.replaceChildren(document.createTextNode("(" + items.length + ")"));
    if (items.length === 0) {
      listEl.innerHTML = '<li class="history-empty">No queries yet.</li>';
      return;
    }
    listEl.innerHTML = items.map((e, i) => {
      const preview = e.sql.length > 60 ? e.sql.slice(0, 57) + "\u2026" : e.sql;
      const badge = '<span class="history-badge history-badge--' + esc2(e.source) + '">' + esc2(e.source) + "</span>";
      const meta = [];
      meta.push(e.durationMs + " ms");
      if (e.rowCount != null) meta.push(e.rowCount + " row(s)");
      if (e.error) meta.push("ERR");
      const at = e.at ? formatRelativeTime(e.at) : "";
      const metaStr = meta.join(" \xB7 ");
      return '<li class="history-item' + (e.error ? " history-item--error" : "") + '" data-idx="' + i + '" title="' + esc2(e.sql) + '">' + badge + '<span class="history-sql">' + esc2(preview) + '</span><span class="history-meta">' + esc2(metaStr) + (at ? " \xB7 " + esc2(at) : "") + "</span></li>";
    }).join("");
  }
  function formatRelativeTime(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 0) return "just now";
    const sec = Math.floor(diff / 1e3);
    if (sec < 60) return sec + " s ago";
    const min = Math.floor(sec / 60);
    if (min < 60) return min + " m ago";
    const hr = Math.floor(min / 60);
    if (hr < 24) return hr + " h ago";
    return Math.floor(hr / 24) + " d ago";
  }
  function applyPanelCollapsed(panelCollapsed) {
    const layout2 = document.getElementById("app-layout");
    if (!layout2) return;
    layout2.classList.toggle("history-sidebar-collapsed", panelCollapsed);
    if (sidebarEl) {
      sidebarEl.setAttribute("aria-hidden", panelCollapsed ? "true" : "false");
    }
  }
  function togglePanelCollapsed() {
    const layout2 = document.getElementById("app-layout");
    if (!layout2) return;
    const panelCollapsed = !layout2.classList.contains("history-sidebar-collapsed");
    applyPanelCollapsed(panelCollapsed);
    try {
      localStorage.setItem(HISTORY_SIDEBAR_KEY, panelCollapsed ? "1" : "0");
    } catch (e) {
    }
  }
  function fetchHistory() {
    fetch("/api/history", authOpts()).then(function(r) {
      return r.json();
    }).then(function(data) {
      entries = Array.isArray(data.entries) ? data.entries : [];
      render();
    }).catch(function() {
    });
  }
  function clearHistory() {
    if (!confirm("Clear all query history?")) return;
    fetch("/api/history", Object.assign({ method: "DELETE" }, authOpts())).then(function() {
      entries = [];
      render();
    }).catch(function() {
    });
  }
  function initHistorySidebar() {
    sidebarEl = document.getElementById("history-sidebar");
    listEl = document.getElementById(
      "query-history-list"
    );
    countEl = document.getElementById("history-count");
    if (!sidebarEl || !listEl) return;
    var storedCollapsed = false;
    try {
      storedCollapsed = localStorage.getItem(HISTORY_SIDEBAR_KEY) === "1";
    } catch (e) {
    }
    applyPanelCollapsed(storedCollapsed);
    const filterBar = sidebarEl.querySelector(".history-filter-bar");
    if (filterBar) {
      filterBar.addEventListener("click", function(e) {
        const btn = e.target.closest(
          ".history-filter"
        );
        if (!btn) return;
        const filter = btn.getAttribute("data-filter");
        if (!filter) return;
        activeFilter = filter;
        filterBar.querySelectorAll(".history-filter").forEach(function(b) {
          const isActive = b.getAttribute("data-filter") === filter;
          b.classList.toggle("active", isActive);
          b.setAttribute("aria-pressed", isActive ? "true" : "false");
        });
        render();
      });
    }
    listEl.addEventListener("click", function(e) {
      const li = e.target.closest(".history-item");
      if (!li) return;
      const idx = parseInt(li.getAttribute("data-idx") || "", 10);
      const items = filtered();
      if (isNaN(idx) || !items[idx]) return;
      const sqlInput = document.getElementById("sql-input");
      if (sqlInput) {
        sqlInput.value = items[idx].sql;
        openTool("sql");
        sqlInput.focus();
      }
    });
    const refreshBtn = document.getElementById("history-refresh");
    if (refreshBtn) refreshBtn.addEventListener("click", fetchHistory);
    const clearBtn = document.getElementById("history-clear");
    if (clearBtn) clearBtn.addEventListener("click", clearHistory);
    fetchHistory();
  }

  // assets/web/home-screen.ts
  function syncSidebarTogglesFromLayout() {
    var layout2 = document.getElementById("app-layout");
    var leftSw = document.getElementById("home-switch-tables");
    var rightSw = document.getElementById("home-switch-history");
    if (!layout2) return;
    var leftCollapsed = layout2.classList.contains("app-sidebar-panel-collapsed");
    var rightCollapsed = layout2.classList.contains("history-sidebar-collapsed");
    var leftOn = !leftCollapsed;
    var rightOn = !rightCollapsed;
    if (leftSw) {
      leftSw.setAttribute("aria-checked", leftOn ? "true" : "false");
      leftSw.classList.toggle("home-switch-on", leftOn);
    }
    if (rightSw) {
      rightSw.setAttribute("aria-checked", rightOn ? "true" : "false");
      rightSw.classList.toggle("home-switch-on", rightOn);
    }
    var sidebarBtn = document.getElementById("tb-sidebar-toggle");
    var historyBtn = document.getElementById("tb-history-toggle");
    if (sidebarBtn) sidebarBtn.setAttribute("aria-pressed", leftOn ? "true" : "false");
    if (historyBtn) historyBtn.setAttribute("aria-pressed", rightOn ? "true" : "false");
  }
  function wireHomeSwitch(id, toggle) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("click", function() {
      toggle();
      syncSidebarTogglesFromLayout();
    });
  }
  function buildToolGrid() {
    var grid = document.getElementById("home-tool-grid");
    if (!grid) return;
    grid.replaceChildren();
    HOME_LAUNCHERS.forEach(function(item) {
      var iconName = TOOL_ICONS[item.id];
      var label = TOOL_LABELS[item.id] || item.id;
      var card = document.createElement("button");
      card.type = "button";
      card.className = "home-tool-card";
      card.setAttribute("data-tool", item.id);
      card.title = label + " \u2014 " + item.blurb;
      if (iconName) {
        var icon = document.createElement("span");
        icon.className = "material-symbols-outlined home-tool-card-icon";
        icon.setAttribute("aria-hidden", "true");
        icon.textContent = iconName;
        card.appendChild(icon);
      }
      var name = document.createElement("span");
      name.className = "home-tool-card-name";
      name.textContent = label;
      card.appendChild(name);
      var blurb = document.createElement("span");
      blurb.className = "home-tool-card-blurb";
      blurb.textContent = item.blurb;
      card.appendChild(blurb);
      card.addEventListener("click", function() {
        openTool(item.id);
      });
      grid.appendChild(card);
    });
    HOME_EXTRAS.forEach(function(item) {
      var card = document.createElement("button");
      card.type = "button";
      card.className = "home-tool-card home-tool-card-extra";
      card.setAttribute("data-home-extra", item.action);
      card.title = item.label + " \u2014 " + item.blurb;
      var icon = document.createElement("span");
      icon.className = "material-symbols-outlined home-tool-card-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = item.icon;
      card.appendChild(icon);
      var name = document.createElement("span");
      name.className = "home-tool-card-name";
      name.textContent = item.label;
      card.appendChild(name);
      var blurb = document.createElement("span");
      blurb.className = "home-tool-card-blurb";
      blurb.textContent = item.blurb;
      card.appendChild(blurb);
      card.addEventListener("click", function() {
        if (item.action === "mask") {
          document.getElementById("tb-mask-toggle")?.click();
          return;
        }
        if (item.action === "theme") {
          document.getElementById("tb-theme-trigger")?.click();
          return;
        }
        if (item.action === "share") document.getElementById("tb-share-btn")?.click();
      });
      grid.appendChild(card);
    });
  }
  function initHomeScreen() {
    buildToolGrid();
    wireHomeSwitch("home-switch-tables", toggleSidebarCollapsed);
    wireHomeSwitch("home-switch-history", togglePanelCollapsed);
    syncSidebarTogglesFromLayout();
    window._syncHomeSidebarToggles = syncSidebarTogglesFromLayout;
  }

  // assets/web/diagram.ts
  function initDiagram() {
    const container = document.getElementById("diagram-container");
    if (!container) return;
    const toggle = document.getElementById("diagram-toggle");
    const collapsible = document.getElementById("diagram-collapsible");
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
      tables.forEach((t, i) => {
        nameToIndex[t.name] = i;
      });
      const getCenter = (index, side) => {
        const p = tablePos(index);
        const cx = p.x + BOX_W / 2;
        const cy = p.y + BOX_H / 2;
        if (side === "right") return { x: p.x + BOX_W, y: cy };
        if (side === "left") return { x: p.x, y: cy };
        return { x: cx, y: cy };
      };
      let svg = '<svg role="group" aria-label="Schema diagram showing ' + tables.length + " table" + (tables.length !== 1 ? "s" : "") + " and " + fks.length + " foreign key relationship" + (fks.length !== 1 ? "s" : "") + '" width="' + width + '" height="' + height + '" xmlns="http://www.w3.org/2000/svg">';
      svg += '<g class="diagram-links">';
      fks.forEach(function(fk) {
        const iFrom = nameToIndex[fk.fromTable];
        const iTo = nameToIndex[fk.toTable];
        if (iFrom == null || iTo == null) return;
        const from = getCenter(iFrom, "right");
        const to = getCenter(iTo, "left");
        const mid = (from.x + to.x) / 2;
        svg += '<path class="diagram-link" d="M' + from.x + "," + from.y + " C" + mid + "," + from.y + " " + mid + "," + to.y + " " + to.x + "," + to.y + '"><title>' + esc2(fk.fromTable) + "." + esc2(fk.fromColumn) + " \u2192 " + esc2(fk.toTable) + "." + esc2(fk.toColumn) + "</title></path>";
      });
      svg += '</g><g class="diagram-tables">';
      tables.forEach(function(t, i) {
        const p = tablePos(i);
        const allCols = t.columns || [];
        const cols = allCols.slice(0, 6);
        const name = esc2(t.name);
        const pkCols = allCols.filter(function(c) {
          return c.pk;
        }).map(function(c) {
          return c.name;
        });
        const ariaLabel = t.name + " table, " + allCols.length + " column" + (allCols.length !== 1 ? "s" : "") + (pkCols.length ? ", primary key: " + pkCols.join(", ") : "");
        let body = cols.map(function(c) {
          const pk = c.pk ? ' <tspan class="diagram-pk">PK</tspan>' : "";
          return '<tspan class="diagram-col" x="8" dy="16">' + esc2(c.name) + (c.type ? " " + esc2(c.type) : "") + pk + "</tspan>";
        }).join("");
        if (allCols.length > 6) body += '<tspan class="diagram-col" x="8" dy="16">\u2026</tspan>';
        svg += '<g class="diagram-table" data-table="' + name + '" tabindex="0" role="button" aria-label="' + esc2(ariaLabel) + '" transform="translate(' + p.x + "," + p.y + ')">';
        svg += '<rect width="' + BOX_W + '" height="' + BOX_H + '" rx="4"/>';
        svg += '<text class="diagram-name" x="8" y="22" style="fill: var(--link);">' + name + "</text>";
        svg += '<text x="8" y="38">' + body + "</text>";
        svg += "</g>";
      });
      svg += "</g></svg>";
      container.innerHTML = svg;
      const tableEls = container.querySelectorAll(".diagram-table");
      tableEls.forEach(function(g, i) {
        g.addEventListener("click", function() {
          const name = this.getAttribute("data-table");
          if (name) openTableTab(name);
        });
        g.addEventListener("keydown", function(e) {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            const name = this.getAttribute("data-table");
            if (name) openTableTab(name);
            return;
          }
          var target = -1;
          if (e.key === "ArrowRight") target = i + 1;
          else if (e.key === "ArrowLeft") target = i - 1;
          else if (e.key === "ArrowDown") target = i + COLS;
          else if (e.key === "ArrowUp") target = i - COLS;
          if (target >= 0 && target < tableEls.length) {
            e.preventDefault();
            tableEls[target].focus();
          }
        });
      });
      var altEl = document.getElementById("diagram-text-alt");
      if (altEl) {
        var altHtml = "<h4>Schema table list</h4><ul>";
        tables.forEach(function(t) {
          var cols = t.columns || [];
          altHtml += "<li><strong>" + esc2(t.name) + "</strong> (" + cols.length + " column" + (cols.length !== 1 ? "s" : "") + "): ";
          altHtml += cols.map(function(c) {
            return esc2(c.name) + (c.pk ? " (PK)" : "");
          }).join(", ");
          altHtml += "</li>";
        });
        altHtml += "</ul>";
        if (fks.length > 0) {
          altHtml += "<h4>Foreign key relationships</h4><ul>";
          fks.forEach(function(fk) {
            altHtml += "<li>" + esc2(fk.fromTable) + "." + esc2(fk.fromColumn) + " \u2192 " + esc2(fk.toTable) + "." + esc2(fk.toColumn) + "</li>";
          });
          altHtml += "</ul>";
        }
        altEl.innerHTML = altHtml;
      }
    }
    function loadAndRenderDiagram() {
      if (diagramData === null) {
        container.innerHTML = '<p class="meta">Loading\u2026</p>';
        fetch("/api/schema/diagram", authOpts()).then((r) => r.json()).then(function(data) {
          diagramData = data;
          renderDiagram(data);
        }).catch(function(e) {
          container.innerHTML = '<p class="meta">Failed to load diagram: ' + esc2(String(e)) + "</p>";
        });
      } else {
        renderDiagram(diagramData);
      }
    }
    window.ensureDiagramInited = loadAndRenderDiagram;
    if (toggle && collapsible) {
      toggle.addEventListener("click", function() {
        const isCollapsed = collapsible.classList.contains("collapsed");
        collapsible.classList.toggle("collapsed", !isCollapsed);
        syncFeatureCardExpanded(collapsible);
        if (isCollapsed) loadAndRenderDiagram();
      });
    }
  }

  // assets/web/analysis.ts
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
    var id = "id_" + Date.now();
    var label = (/* @__PURE__ */ new Date()).toLocaleString();
    list.unshift({ id, savedAt: label, data });
    var maxSaved = getPref(PREF_ANALYSIS_MAX, DEFAULTS[PREF_ANALYSIS_MAX]);
    if (list.length > maxSaved) list.length = maxSaved;
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
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename || "analysis.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }
  function populateHistorySelect(selectEl, type) {
    if (!selectEl) return;
    var list = getSavedAnalyses(type);
    var value = selectEl.value;
    selectEl.innerHTML = '<option value="">\u2014 Past runs \u2014</option>';
    list.forEach(function(item) {
      var opt = document.createElement("option");
      opt.value = item.id;
      opt.textContent = item.savedAt;
      selectEl.appendChild(opt);
    });
    if (value) selectEl.value = value;
  }
  function showAnalysisCompare(type, title, savedList, currentData, renderFn, summaryFn) {
    var overlay = document.getElementById("analysis-compare-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "analysis-compare-overlay";
      overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;";
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-label", "Compare analysis results");
      document.body.appendChild(overlay);
    }
    var beforeId = "";
    var afterId = "";
    var beforeData = null;
    var afterData = null;
    function getData(optionValue) {
      if (optionValue === "_current") return currentData;
      if (!optionValue) return null;
      for (var i = 0; i < savedList.length; i++) {
        if (savedList[i].id === optionValue) return savedList[i].data;
      }
      return null;
    }
    function updateSummary() {
      beforeData = getData(beforeId);
      afterData = getData(afterId);
      summaryEl.textContent = summaryFn ? summaryFn(beforeData, afterData) : "Select Before and After to compare.";
      if (beforeData && afterData && renderFn) {
        leftPanel.innerHTML = renderFn(beforeData);
        rightPanel.innerHTML = renderFn(afterData);
      } else {
        leftPanel.innerHTML = beforeData ? renderFn(beforeData) : '<p class="meta">Select Before.</p>';
        rightPanel.innerHTML = afterData ? renderFn(afterData) : '<p class="meta">Select After.</p>';
      }
    }
    var panel = document.createElement("div");
    panel.style.cssText = "background:var(--bg, #fff);color:var(--fg, #111);padding:1rem;border-radius:8px;max-width:95vw;max-height:90vh;overflow:auto;box-shadow:0 4px 20px rgba(0,0,0,0.3);";
    panel.innerHTML = '<h3 style="margin:0 0 0.75rem;">Compare: ' + esc2(title) + "</h3>";
    var toolbar = document.createElement("div");
    toolbar.className = "toolbar";
    toolbar.style.marginBottom = "0.5rem";
    var beforeLabel = document.createElement("label");
    beforeLabel.textContent = "Before:";
    var beforeSel = document.createElement("select");
    beforeSel.id = "compare-before";
    beforeSel.innerHTML = '<option value="">\u2014 select \u2014</option><option value="_current">Current result</option>';
    (savedList || []).forEach(function(item) {
      var opt = document.createElement("option");
      opt.value = item.id;
      opt.textContent = item.savedAt;
      beforeSel.appendChild(opt);
    });
    var afterLabel = document.createElement("label");
    afterLabel.textContent = "After:";
    var afterSel = document.createElement("select");
    afterSel.id = "compare-after";
    afterSel.innerHTML = '<option value="">\u2014 select \u2014</option><option value="_current">Current result</option>';
    (savedList || []).forEach(function(item) {
      var opt = document.createElement("option");
      opt.value = item.id;
      opt.textContent = item.savedAt;
      afterSel.appendChild(opt);
    });
    var closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.textContent = "Close";
    closeBtn.title = "Close compare panel";
    toolbar.appendChild(beforeLabel);
    toolbar.appendChild(beforeSel);
    toolbar.appendChild(afterLabel);
    toolbar.appendChild(afterSel);
    toolbar.appendChild(closeBtn);
    panel.appendChild(toolbar);
    var summaryEl = document.createElement("p");
    summaryEl.className = "meta";
    summaryEl.style.marginBottom = "0.5rem";
    summaryEl.textContent = "Select Before and After to compare.";
    panel.appendChild(summaryEl);
    var columns = document.createElement("div");
    columns.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:1rem;";
    var leftPanel = document.createElement("div");
    leftPanel.style.cssText = "border:1px solid var(--border);padding:0.5rem;border-radius:4px;max-height:50vh;overflow:auto;";
    leftPanel.innerHTML = '<p class="meta">Select Before.</p>';
    var rightPanel = document.createElement("div");
    rightPanel.style.cssText = "border:1px solid var(--border);padding:0.5rem;border-radius:4px;max-height:50vh;overflow:auto;";
    rightPanel.innerHTML = '<p class="meta">Select After.</p>';
    columns.appendChild(leftPanel);
    columns.appendChild(rightPanel);
    panel.appendChild(columns);
    overlay.innerHTML = "";
    overlay.appendChild(panel);
    beforeSel.addEventListener("change", function() {
      beforeId = this.value;
      updateSummary();
    });
    afterSel.addEventListener("change", function() {
      afterId = this.value;
      updateSummary();
    });
    function closeOverlay() {
      overlay.style.display = "none";
      document.removeEventListener("keydown", escapeHandler);
    }
    function escapeHandler(e) {
      if (e.key === "Escape") closeOverlay();
    }
    closeBtn.addEventListener("click", closeOverlay);
    overlay.addEventListener("click", function(e) {
      if (e.target === overlay) closeOverlay();
    });
    document.addEventListener("keydown", escapeHandler);
    overlay.style.display = "flex";
  }
  function renderDiffRows(rows, type) {
    if (rows.length === 0) return "";
    var keys = Object.keys(rows[0]);
    var bgColor = type === "added" ? "rgba(124,179,66,0.15)" : "rgba(229,115,115,0.15)";
    var html = '<table style="border-collapse:collapse;width:100%;font-size:11px;margin-bottom:0.3rem;">';
    html += "<tr>" + keys.map(function(k) {
      return '<th style="border:1px solid var(--border);padding:2px 4px;">' + esc2(k) + "</th>";
    }).join("") + "</tr>";
    rows.forEach(function(r) {
      html += '<tr style="background:' + bgColor + ';">' + keys.map(function(k) {
        return '<td style="border:1px solid var(--border);padding:2px 4px;">' + esc2(String(r[k] != null ? r[k] : "")) + "</td>";
      }).join("") + "</tr>";
    });
    html += "</table>";
    return html;
  }
  function renderRowDiff(container, tables) {
    var html = "";
    html += '<table class="snapshot-summary-table"><thead><tr><th>Table</th><th>Then</th><th>Now</th><th>Status</th></tr></thead><tbody>';
    tables.forEach(function(t) {
      var status = "";
      if (!t.hasPk) {
        status = "No primary key \u2014 counts only";
      } else if (t.addedRows && t.addedRows.length > 0 || t.removedRows && t.removedRows.length > 0 || t.changedRows && t.changedRows.length > 0) {
        var parts = [];
        if (t.addedRows && t.addedRows.length > 0) parts.push("+" + t.addedRows.length + " added");
        if (t.removedRows && t.removedRows.length > 0) parts.push("-" + t.removedRows.length + " removed");
        if (t.changedRows && t.changedRows.length > 0) parts.push("~" + t.changedRows.length + " changed");
        status = parts.join(", ");
      } else {
        status = "No changes detected";
      }
      html += "<tr><td>" + esc2(t.table) + "</td><td>" + t.countThen + "</td><td>" + t.countNow + "</td><td>" + esc2(status) + "</td></tr>";
    });
    html += "</tbody></table>";
    tables.forEach(function(t) {
      if (!t.hasPk) return;
      var hasDetail = t.addedRows && t.addedRows.length > 0 || t.removedRows && t.removedRows.length > 0 || t.changedRows && t.changedRows.length > 0;
      if (!hasDetail) return;
      html += '<h4 style="margin:0.5rem 0 0.25rem;">' + esc2(t.table) + "</h4>";
      if (t.addedRows && t.addedRows.length > 0) {
        html += '<p class="meta" style="color:#7cb342;">+ ' + t.addedRows.length + " added:</p>";
        html += renderDiffRows(t.addedRows, "added");
      }
      if (t.removedRows && t.removedRows.length > 0) {
        html += '<p class="meta" style="color:#e57373;">- ' + t.removedRows.length + " removed:</p>";
        html += renderDiffRows(t.removedRows, "removed");
      }
      if (t.changedRows && t.changedRows.length > 0) {
        html += '<p class="meta" style="color:#ffb74d;">~ ' + t.changedRows.length + " changed:</p>";
        t.changedRows.forEach(function(cr) {
          var keys = Object.keys(cr.now);
          var changed = new Set(cr.changedColumns || []);
          html += '<table style="border-collapse:collapse;width:100%;font-size:11px;margin-bottom:0.4rem;">';
          html += "<tr>" + keys.map(function(k) {
            return '<th style="border:1px solid var(--border);padding:2px 4px;' + (changed.has(k) ? "background:rgba(255,183,77,0.2);" : "") + '">' + esc2(k) + "</th>";
          }).join("") + "</tr>";
          html += "<tr>" + keys.map(function(k) {
            var isChanged = changed.has(k);
            return '<td style="border:1px solid var(--border);padding:2px 4px;' + (isChanged ? "background:rgba(229,115,115,0.2);text-decoration:line-through;" : "") + '">' + esc2(String(cr.then[k] != null ? cr.then[k] : "")) + "</td>";
          }).join("") + "</tr>";
          html += "<tr>" + keys.map(function(k) {
            var isChanged = changed.has(k);
            return '<td style="border:1px solid var(--border);padding:2px 4px;' + (isChanged ? "background:rgba(124,179,66,0.2);font-weight:bold;" : "") + '">' + esc2(String(cr.now[k] != null ? cr.now[k] : "")) + "</td>";
          }).join("") + "</tr>";
          html += "</table>";
        });
      }
    });
    container.innerHTML = html;
  }

  // assets/web/tools-compare.ts
  function initSnapshot() {
    const toggle = document.getElementById("snapshot-toggle");
    const collapsible = document.getElementById("snapshot-collapsible");
    const takeBtn = document.getElementById("snapshot-take");
    const compareBtn = document.getElementById("snapshot-compare");
    const exportLink = document.getElementById("snapshot-export-diff");
    const clearBtn = document.getElementById("snapshot-clear");
    const statusEl = document.getElementById("snapshot-status");
    const resultPre = document.getElementById("snapshot-compare-result");
    function updateSnapshotUI(hasSnapshot, createdAt) {
      compareBtn.disabled = !hasSnapshot;
      exportLink.style.display = hasSnapshot ? "" : "none";
      clearBtn.style.display = hasSnapshot ? "" : "none";
      if (exportLink.style.display !== "none" && DRIFT_VIEWER_AUTH_TOKEN) {
        exportLink.href = "/api/snapshot/compare?detail=rows&format=download";
      } else if (hasSnapshot) exportLink.href = "/api/snapshot/compare?detail=rows&format=download";
      statusEl.textContent = hasSnapshot ? "Snapshot: " + (createdAt || "") : "No snapshot.";
    }
    function refreshSnapshotStatus() {
      fetch("/api/snapshot", authOpts()).then((r) => r.json()).then(function(data) {
        const snap = data.snapshot;
        updateSnapshotUI(!!snap, snap ? snap.createdAt : null);
      }).catch(function() {
        updateSnapshotUI(false);
      });
    }
    if (toggle && collapsible) {
      toggle.addEventListener("click", function() {
        const isCollapsed = collapsible.classList.contains("collapsed");
        collapsible.classList.toggle("collapsed", !isCollapsed);
        syncFeatureCardExpanded(collapsible);
        if (isCollapsed) refreshSnapshotStatus();
      });
    }
    if (takeBtn) takeBtn.addEventListener("click", function() {
      takeBtn.disabled = true;
      statusEl.textContent = "Capturing\u2026";
      fetch("/api/snapshot", authOpts({ method: "POST" })).then((r) => r.json().then(function(d) {
        return { ok: r.ok, data: d };
      })).then(function(o) {
        if (o.ok) {
          updateSnapshotUI(true, o.data.createdAt);
          statusEl.textContent = "Snapshot saved at " + o.data.createdAt;
        } else statusEl.textContent = o.data.error || "Failed";
      }).catch(function(e) {
        statusEl.textContent = "Error: " + e.message;
      }).finally(function() {
        takeBtn.disabled = false;
      });
    });
    if (compareBtn) compareBtn.addEventListener("click", function() {
      compareBtn.disabled = true;
      resultPre.style.display = "none";
      resultPre.innerHTML = "";
      statusEl.textContent = "Comparing\u2026";
      statusEl.setAttribute("aria-busy", "true");
      fetch("/api/snapshot/compare?detail=rows", authOpts()).then((r) => r.json().then(function(d) {
        return { ok: r.ok, data: d };
      })).then(function(o) {
        if (o.ok) {
          if (o.data.tables) {
            renderRowDiff(resultPre, o.data.tables);
          } else {
            resultPre.textContent = JSON.stringify(o.data, null, 2);
          }
          resultPre.style.display = "block";
          statusEl.textContent = "";
        } else {
          statusEl.textContent = o.data.error || "Compare failed";
        }
      }).catch(function(e) {
        statusEl.textContent = "Error: " + e.message;
      }).finally(function() {
        compareBtn.disabled = false;
        statusEl.removeAttribute("aria-busy");
      });
    });
    if (clearBtn) clearBtn.addEventListener("click", function() {
      clearBtn.disabled = true;
      statusEl.textContent = "Clearing\u2026";
      fetch("/api/snapshot", authOpts({ method: "DELETE" })).then(function() {
        updateSnapshotUI(false);
        resultPre.style.display = "none";
        resultPre.innerHTML = "";
        refreshSnapshotStatus();
      }).catch(function(e) {
        statusEl.textContent = "Error: " + e.message;
      }).finally(function() {
        clearBtn.disabled = false;
      });
    });
    refreshSnapshotStatus();
  }
  function initCompare() {
    const toggle = document.getElementById("compare-toggle");
    const collapsible = document.getElementById("compare-collapsible");
    const viewBtn = document.getElementById("compare-view");
    const exportLink = document.getElementById("compare-export");
    const statusEl = document.getElementById("compare-status");
    const resultPre = document.getElementById("compare-result");
    if (DRIFT_VIEWER_AUTH_TOKEN && exportLink) {
      exportLink.href = "/api/compare/report?format=download";
    }
    if (toggle && collapsible) {
      toggle.addEventListener("click", function() {
        const isCollapsed = collapsible.classList.contains("collapsed");
        collapsible.classList.toggle("collapsed", !isCollapsed);
        syncFeatureCardExpanded(collapsible);
      });
    }
    if (viewBtn) viewBtn.addEventListener("click", function() {
      viewBtn.disabled = true;
      resultPre.style.display = "none";
      statusEl.textContent = "Loading\u2026";
      fetch("/api/compare/report", authOpts()).then((r) => r.json().then(function(d) {
        return { status: r.status, data: d };
      })).then(function(o) {
        if (o.status === 501) {
          statusEl.textContent = "Not configured. A comparison database is needed \u2014 see the setup guide above.";
        } else if (o.status >= 400) {
          statusEl.textContent = o.data.error || "Request failed";
        } else {
          resultPre.textContent = JSON.stringify(o.data, null, 2);
          resultPre.style.display = "block";
          statusEl.textContent = "";
        }
      }).catch(function(e) {
        statusEl.textContent = "Error: " + e.message;
      }).finally(function() {
        viewBtn.disabled = false;
      });
    });
  }
  function initMigrationPreview() {
    var btn = document.getElementById("migration-preview");
    var statusEl = document.getElementById("compare-status");
    var resultPre = document.getElementById("compare-result");
    if (!btn) return;
    btn.addEventListener("click", function() {
      btn.disabled = true;
      setButtonBusy(btn, true, "Generating\u2026");
      resultPre.style.display = "none";
      statusEl.textContent = "";
      fetch("/api/migration/preview", authOpts()).then(function(r) {
        return r.json().then(function(d) {
          return { status: r.status, data: d };
        });
      }).then(function(o) {
        if (o.status === 501) {
          statusEl.textContent = "Not configured. A comparison database is needed \u2014 see the setup guide above.";
          return;
        }
        if (o.status >= 400) {
          statusEl.textContent = o.data.error || "Request failed";
          return;
        }
        var sql = o.data.migrationSql || "-- No changes detected.";
        var html = '<p class="meta">' + o.data.changeCount + " statement(s) generated";
        if (o.data.hasWarnings) html += " (includes warnings)";
        html += "</p>";
        html += '<pre style="font-size:11px;max-height:30vh;overflow:auto;background:var(--bg-pre);padding:0.5rem;border-radius:4px;">' + highlightSqlSafe(sql) + "</pre>";
        html += '<button type="button" id="migration-copy-sql" title="Copy migration SQL to clipboard">Copy SQL</button>';
        resultPre.innerHTML = html;
        resultPre.style.display = "block";
        statusEl.textContent = "";
        var copyBtn = document.getElementById("migration-copy-sql");
        if (copyBtn) copyBtn.addEventListener("click", function() {
          navigator.clipboard.writeText(sql);
          this.textContent = "Copied!";
        });
      }).catch(function(e) {
        statusEl.textContent = "Error: " + e.message;
      }).finally(function() {
        btn.disabled = false;
        setButtonBusy(btn, false, "Migration Preview");
      });
    });
  }

  // assets/web/tools-analytics.ts
  function initIndexSuggestions() {
    const toggle = document.getElementById("index-toggle");
    const collapsible = document.getElementById("index-collapsible");
    const btn = document.getElementById("index-analyze");
    const container = document.getElementById("index-results");
    const saveBtn = document.getElementById("index-save");
    const exportBtn = document.getElementById("index-export");
    const historySel = document.getElementById("index-history");
    const compareBtn = document.getElementById("index-compare");
    var lastIndexData = null;
    function renderIndexData(data) {
      if (!data) return '<p class="meta">No current result. Run Analyze first.</p>';
      var suggestions = data.suggestions || [];
      if (suggestions.length === 0) {
        return '<p class="meta" style="color:#7cb342;">No index suggestions \u2014 schema looks good!</p>';
      }
      var priorityColors = { high: "#e57373", medium: "#ffb74d", low: "#7cb342" };
      var priorityIcons = { high: "!!", medium: "!", low: "\u2713" };
      var html = '<p class="meta">' + suggestions.length + " suggestion(s) across " + (data.tablesAnalyzed || 0) + " tables:</p>";
      html += '<table style="border-collapse:collapse;width:100%;font-size:12px;">';
      html += '<tr><th style="border:1px solid var(--border);padding:4px;">Priority</th><th style="border:1px solid var(--border);padding:4px;">Table.Column</th><th style="border:1px solid var(--border);padding:4px;">Reason</th><th style="border:1px solid var(--border);padding:4px;">SQL</th></tr>';
      suggestions.forEach(function(s) {
        var color = priorityColors[s.priority] || "var(--fg)";
        var icon = priorityIcons[s.priority] || "";
        html += "<tr>";
        html += '<td style="border:1px solid var(--border);padding:4px;color:' + color + ';font-weight:bold;">[' + esc2(icon) + "] " + esc2(s.priority).toUpperCase() + "</td>";
        html += '<td style="border:1px solid var(--border);padding:4px;">' + esc2(s.table) + "." + esc2(s.column) + "</td>";
        html += '<td style="border:1px solid var(--border);padding:4px;">' + esc2(s.reason) + "</td>";
        html += '<td style="border:1px solid var(--border);padding:4px;"><code style="font-size:11px;cursor:pointer;" title="Click to copy" onclick="navigator.clipboard.writeText(this.textContent)">' + esc2(s.sql) + "</code></td>";
        html += "</tr>";
      });
      html += "</table>";
      return html;
    }
    function showIndexResult(html, isError) {
      container.innerHTML = html;
      container.style.display = "block";
    }
    if (toggle && collapsible) {
      toggle.addEventListener("click", function() {
        const isCollapsed = collapsible.classList.contains("collapsed");
        collapsible.classList.toggle("collapsed", !isCollapsed);
        syncFeatureCardExpanded(collapsible);
      });
    }
    if (historySel) {
      populateHistorySelect(historySel, "index");
      historySel.addEventListener("change", function() {
        var id = this.value;
        if (!id) return;
        var saved = getSavedAnalysisById("index", id);
        if (saved && saved.data) {
          lastIndexData = saved.data;
          showIndexResult(renderIndexData(saved.data));
        }
      });
    }
    if (btn) btn.addEventListener("click", function() {
      btn.disabled = true;
      setButtonBusy(btn, true, "Analyzing\u2026");
      container.style.display = "none";
      fetch("/api/index-suggestions", authOpts()).then(function(r) {
        if (!r.ok) return r.json().then(function(d) {
          throw new Error(d.error || "Request failed");
        });
        return r.json();
      }).then(function(data) {
        lastIndexData = data;
        showIndexResult(renderIndexData(data));
        populateHistorySelect(historySel, "index");
      }).catch(function(e) {
        showIndexResult('<p class="meta" style="color:#e57373;">Error: ' + esc2(e.message) + "</p>");
      }).finally(function() {
        btn.disabled = false;
        setButtonBusy(btn, false, "Analyze");
      });
    });
    if (saveBtn) saveBtn.addEventListener("click", function() {
      if (!lastIndexData) return;
      var id = saveAnalysis("index", lastIndexData);
      showCopyToast(id != null ? "Saved" : "Save failed (storage may be full)");
      populateHistorySelect(historySel, "index");
    });
    if (exportBtn) exportBtn.addEventListener("click", function() {
      if (!lastIndexData) return;
      downloadJSON(lastIndexData, "index-suggestions-" + (/* @__PURE__ */ new Date()).toISOString().slice(0, 10) + ".json");
    });
    if (compareBtn) compareBtn.addEventListener("click", function() {
      showAnalysisCompare("index", "Index suggestions", getSavedAnalyses("index"), lastIndexData, renderIndexData, function(a, b) {
        var sa = a && a.suggestions ? a.suggestions.length : 0;
        var sb = b && b.suggestions ? b.suggestions.length : 0;
        return "Before: " + sa + " suggestion(s) \xB7 After: " + sb + " suggestion(s)";
      });
    });
  }
  function initSizeAnalytics() {
    const toggle = document.getElementById("size-toggle");
    const collapsible = document.getElementById("size-collapsible");
    const btn = document.getElementById("size-analyze");
    const container = document.getElementById("size-results");
    const saveBtn = document.getElementById("size-save");
    const exportBtn = document.getElementById("size-export");
    const historySel = document.getElementById("size-history");
    const compareBtn = document.getElementById("size-compare");
    function formatBytes(bytes) {
      if (bytes < 1024) return bytes + " B";
      if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
      return (bytes / 1048576).toFixed(2) + " MB";
    }
    var SIZE_TT = {
      totalCard: "Total size of the SQLite database file: PRAGMA page_count \xD7 PRAGMA page_size. Matches the main .db file size on disk.",
      usedCard: "Bytes in pages that store data: total file size minus bytes in freelist pages (see Free). Same as totalSizeBytes \u2212 freeSpaceBytes from the server.",
      freeCard: "Bytes in pages on SQLite\u2019s freelist (PRAGMA freelist_count \xD7 page_size). Unused pages inside the file that SQLite can reuse for new data without growing the file.",
      journalCard: "SQLite PRAGMA journal_mode. wal means WAL (write-ahead logging): new writes go to a separate .wal file and are merged into the main database at checkpoint; readers can run at the same time as one writer. Other modes include delete, truncate, persist, memory, and off.",
      pagesTotal: "Total bytes in all pages: page_count \xD7 page_size. Same number as Total Size.",
      pagesFormula: "PRAGMA page_count (number of pages) \xD7 PRAGMA page_size (bytes per page, often 4096).",
      thTable: "Name of this table in SQLite.",
      thRows: "Row count for each table (SELECT COUNT(*) FROM table). Bar length is relative to the largest table in this list.",
      thColumns: "Number of columns defined on the table (rows from PRAGMA table_info).",
      thIndexes: "Number of indexes on the table (PRAGMA index_list), plus each index name.",
      tdTableLink: "SQLite table name. Click to open this table in its own tab.",
      tdRows: "Approximate number of rows in this table.",
      tdColumns: "How many columns this table has.",
      tdIndexes: "Index count and names from PRAGMA index_list for this table."
    };
    function renderSizeData(data) {
      if (!data) return '<p class="meta">No data.</p>';
      var html = '<div style="margin:0.5rem 0;">';
      html += '<div style="display:flex;gap:1rem;flex-wrap:wrap;margin-bottom:0.5rem;">';
      html += '<div style="padding:0.5rem;border:1px solid var(--border);border-radius:4px;" title="' + esc2(SIZE_TT.totalCard) + '">';
      html += '<div class="meta">Total Size</div>';
      html += '<div style="font-size:1.2rem;font-weight:bold;">' + formatBytes(data.totalSizeBytes) + "</div></div>";
      html += '<div style="padding:0.5rem;border:1px solid var(--border);border-radius:4px;" title="' + esc2(SIZE_TT.usedCard) + '">';
      html += '<div class="meta">Used</div>';
      html += '<div style="font-size:1.2rem;font-weight:bold;">' + formatBytes(data.usedSizeBytes) + "</div></div>";
      html += '<div style="padding:0.5rem;border:1px solid var(--border);border-radius:4px;" title="' + esc2(SIZE_TT.freeCard) + '">';
      html += '<div class="meta">Free</div>';
      html += '<div style="font-size:1.2rem;font-weight:bold;">' + formatBytes(data.freeSpaceBytes) + "</div></div>";
      html += '<div style="padding:0.5rem;border:1px solid var(--border);border-radius:4px;" title="' + esc2(SIZE_TT.journalCard) + '">';
      html += '<div class="meta">Journal</div>';
      html += '<div style="font-size:1.2rem;font-weight:bold;">' + esc2(data.journalMode || "") + "</div></div>";
      html += '<div style="padding:0.5rem;border:1px solid var(--border);border-radius:4px;" title="' + esc2(SIZE_TT.pagesTotal) + '">';
      html += '<div class="meta">Pages</div>';
      var pc = data.pageCount || 0;
      var ps = data.pageSize || 0;
      var pageBytes = pc * ps;
      html += '<div style="font-size:1.2rem;font-weight:bold;line-height:1.2;" title="' + esc2(SIZE_TT.pagesTotal) + '">' + pageBytes.toLocaleString() + "</div>";
      html += '<div class="meta size-pages-formula" title="' + esc2(SIZE_TT.pagesFormula) + '">(' + pc.toLocaleString() + " \xD7 " + ps.toLocaleString() + ")</div></div>";
      html += "</div>";
      html += '<table style="border-collapse:collapse;width:100%;font-size:12px;">';
      html += '<tr><th style="border:1px solid var(--border);padding:4px;" title="' + esc2(SIZE_TT.thTable) + '">Table</th>';
      html += '<th style="border:1px solid var(--border);padding:4px;min-width:8rem;" title="' + esc2(SIZE_TT.thRows) + '">Rows</th>';
      html += '<th style="border:1px solid var(--border);padding:4px;text-align:right;" title="' + esc2(SIZE_TT.thColumns) + '">Columns</th>';
      html += '<th style="border:1px solid var(--border);padding:4px;" title="' + esc2(SIZE_TT.thIndexes) + '">Indexes</th></tr>';
      var tables = data.tables || [];
      var maxRows = Math.max.apply(null, tables.map(function(t) {
        return t.rowCount;
      }).concat([1]));
      tables.forEach(function(t) {
        var barWidth = Math.max(1, t.rowCount / maxRows * 100);
        html += "<tr>";
        html += '<td style="border:1px solid var(--border);padding:4px;"><a href="#" class="table-link size-table-link" data-table="' + esc2(t.table) + '" title="' + esc2(SIZE_TT.tdTableLink) + '">' + esc2(t.table) + "</a></td>";
        html += '<td style="border:1px solid var(--border);padding:4px;white-space:nowrap;" title="' + esc2(SIZE_TT.tdRows) + '">';
        html += '<div style="background:var(--link);height:12px;width:' + barWidth + '%;opacity:0.3;display:inline-block;vertical-align:middle;margin-right:4px;"></div>';
        html += t.rowCount.toLocaleString() + "</td>";
        html += '<td style="border:1px solid var(--border);padding:4px;text-align:right;font-variant-numeric:tabular-nums;" title="' + esc2(SIZE_TT.tdColumns) + '">' + t.columnCount + "</td>";
        html += '<td style="border:1px solid var(--border);padding:4px;" title="' + esc2(SIZE_TT.tdIndexes) + '">' + t.indexCount;
        if (t.indexes && t.indexes.length > 0) html += ' <span class="size-index-names">(' + t.indexes.map(esc2).join(", ") + ")</span>";
        html += "</td></tr>";
      });
      html += "</table></div>";
      return html;
    }
    if (container) {
      container.addEventListener("click", function(e) {
        var a = e.target.closest("a.size-table-link");
        if (!a || !container.contains(a)) return;
        e.preventDefault();
        var name = a.getAttribute("data-table");
        if (name) openTableTab(name);
      });
    }
    if (toggle && collapsible) {
      toggle.addEventListener("click", function() {
        const isCollapsed = collapsible.classList.contains("collapsed");
        collapsible.classList.toggle("collapsed", !isCollapsed);
        syncFeatureCardExpanded(collapsible);
      });
    }
    if (historySel) {
      populateHistorySelect(historySel, "size");
      historySel.addEventListener("change", function() {
        var id = this.value;
        if (!id) return;
        var saved = getSavedAnalysisById("size", id);
        if (saved && saved.data) {
          setLastSizeAnalyticsData(saved.data);
          container.innerHTML = renderSizeData(saved.data);
          container.style.display = "block";
        }
      });
    }
    if (btn) btn.addEventListener("click", function() {
      btn.disabled = true;
      setButtonBusy(btn, true, "Analyzing\u2026");
      container.style.display = "none";
      fetch("/api/analytics/size", authOpts()).then(function(r) {
        if (!r.ok) return r.json().then(function(d) {
          throw new Error(d.error || "Request failed");
        });
        return r.json();
      }).then(function(data) {
        setLastSizeAnalyticsData(data);
        container.innerHTML = renderSizeData(data);
        container.style.display = "block";
        populateHistorySelect(historySel, "size");
      }).catch(function(e) {
        container.innerHTML = '<p class="meta" style="color:#e57373;">Error: ' + esc2(e.message) + "</p>";
        container.style.display = "block";
      }).finally(function() {
        btn.disabled = false;
        setButtonBusy(btn, false, "Analyze");
      });
    });
    if (saveBtn) saveBtn.addEventListener("click", function() {
      if (!lastSizeAnalyticsData) return;
      var id = saveAnalysis("size", lastSizeAnalyticsData);
      showCopyToast(id != null ? "Saved" : "Save failed (storage may be full)");
      populateHistorySelect(historySel, "size");
    });
    if (exportBtn) exportBtn.addEventListener("click", function() {
      if (!lastSizeAnalyticsData) return;
      downloadJSON(lastSizeAnalyticsData, "size-analytics-" + (/* @__PURE__ */ new Date()).toISOString().slice(0, 10) + ".json");
    });
    if (compareBtn) compareBtn.addEventListener("click", function() {
      showAnalysisCompare("size", "Database size analytics", getSavedAnalyses("size"), lastSizeAnalyticsData, renderSizeData, function(a, b) {
        var ta = (a && a.totalSizeBytes) != null ? formatBytes(a.totalSizeBytes) : "\u2014";
        var tb = (b && b.totalSizeBytes) != null ? formatBytes(b.totalSizeBytes) : "\u2014";
        return "Before: " + ta + " total \xB7 After: " + tb + " total";
      });
    });
  }
  function initAnomalyDetection() {
    const toggle = document.getElementById("anomaly-toggle");
    const collapsible = document.getElementById("anomaly-collapsible");
    const btn = document.getElementById("anomaly-analyze");
    const container = document.getElementById("anomaly-results");
    const saveBtn = document.getElementById("anomaly-save");
    const exportBtn = document.getElementById("anomaly-export");
    const historySel = document.getElementById("anomaly-history");
    const compareBtn = document.getElementById("anomaly-compare");
    var lastAnomalyData = null;
    function computeHealthScore(anomalies) {
      var score = 100;
      (anomalies || []).forEach(function(a) {
        if (a.severity === "error") score -= 15;
        else if (a.severity === "warning") score -= 5;
        else score -= 1;
      });
      if (score < 0) score = 0;
      var grade;
      if (score >= 90) grade = "A";
      else if (score >= 80) grade = "B";
      else if (score >= 70) grade = "C";
      else if (score >= 60) grade = "D";
      else grade = "F";
      var color;
      if (score >= 80) color = "#81c784";
      else if (score >= 60) color = "#ffb74d";
      else color = "#e57373";
      return { score, grade, color };
    }
    function renderAnomalyData(data) {
      if (!data) return '<p class="meta">No current result. Run Scan first.</p>';
      var anomalies = data.anomalies || [];
      var health = computeHealthScore(anomalies);
      var html = '<div class="health-score-pill" style="display:inline-flex;align-items:center;gap:0.5rem;padding:0.4rem 0.8rem;margin:0.4rem 0;border-radius:6px;background:rgba(0,0,0,0.15);font-size:14px;">';
      html += '<span style="font-size:1.6em;font-weight:700;color:' + health.color + ';">' + health.grade + "</span>";
      html += '<span style="color:' + health.color + ';font-weight:600;">' + health.score + "/100</span>";
      html += '<span class="meta" style="margin-left:0.3rem;">across ' + (data.tablesScanned || 0) + " tables</span>";
      html += "</div>";
      if (anomalies.length === 0) {
        html += '<p class="meta" style="color:#7cb342;">No anomalies detected. Data looks clean!</p>';
        return html;
      }
      var errCount = 0, warnCount = 0, infoCount = 0;
      anomalies.forEach(function(a) {
        if (a.severity === "error") errCount++;
        else if (a.severity === "warning") warnCount++;
        else infoCount++;
      });
      var breakdown = [];
      if (errCount) breakdown.push('<span style="color:#e57373;">' + errCount + " error" + (errCount > 1 ? "s" : "") + "</span>");
      if (warnCount) breakdown.push('<span style="color:#ffb74d;">' + warnCount + " warning" + (warnCount > 1 ? "s" : "") + "</span>");
      if (infoCount) breakdown.push('<span style="color:#7cb342;">' + infoCount + " info</span>");
      html += '<p class="meta">' + anomalies.length + " finding(s): " + breakdown.join(", ") + "</p>";
      var icons = { error: "!!", warning: "!", info: "i" };
      var colors = { error: "#e57373", warning: "#ffb74d", info: "#7cb342" };
      anomalies.forEach(function(a) {
        var color = colors[a.severity] || "var(--fg)";
        var icon = icons[a.severity] || "";
        html += '<div style="padding:0.3rem 0.5rem;margin:0.2rem 0;border-left:3px solid ' + color + ';background:rgba(0,0,0,0.1);">';
        html += '<span style="color:' + color + ';font-weight:bold;">[' + icon + "] " + esc2(a.severity).toUpperCase() + "</span> ";
        html += esc2(a.message);
        if (a.count) html += ' <span class="meta">(' + a.count + ")</span>";
        html += "</div>";
      });
      return html;
    }
    if (toggle && collapsible) {
      toggle.addEventListener("click", function() {
        const isCollapsed = collapsible.classList.contains("collapsed");
        collapsible.classList.toggle("collapsed", !isCollapsed);
        syncFeatureCardExpanded(collapsible);
      });
    }
    if (historySel) {
      populateHistorySelect(historySel, "anomaly");
      historySel.addEventListener("change", function() {
        var id = this.value;
        if (!id) return;
        var saved = getSavedAnalysisById("anomaly", id);
        if (saved && saved.data) {
          lastAnomalyData = saved.data;
          container.innerHTML = renderAnomalyData(saved.data);
          container.style.display = "block";
        }
      });
    }
    if (btn) btn.addEventListener("click", function() {
      btn.disabled = true;
      setButtonBusy(btn, true, "Scanning\u2026");
      container.style.display = "none";
      fetch("/api/analytics/anomalies", authOpts()).then(function(r) {
        if (!r.ok) return r.json().then(function(d) {
          throw new Error(d.error || "Request failed");
        });
        return r.json();
      }).then(function(data) {
        lastAnomalyData = data;
        container.innerHTML = renderAnomalyData(data);
        container.style.display = "block";
        populateHistorySelect(historySel, "anomaly");
      }).catch(function(e) {
        container.innerHTML = '<p class="meta" style="color:#e57373;">Error: ' + esc2(e.message) + "</p>";
        container.style.display = "block";
      }).finally(function() {
        btn.disabled = false;
        setButtonBusy(btn, false, "Scan for anomalies");
      });
    });
    if (saveBtn) saveBtn.addEventListener("click", function() {
      if (!lastAnomalyData) return;
      var id = saveAnalysis("anomaly", lastAnomalyData);
      showCopyToast(id != null ? "Saved" : "Save failed (storage may be full)");
      populateHistorySelect(historySel, "anomaly");
    });
    if (exportBtn) exportBtn.addEventListener("click", function() {
      if (!lastAnomalyData) return;
      downloadJSON(lastAnomalyData, "anomaly-scan-" + (/* @__PURE__ */ new Date()).toISOString().slice(0, 10) + ".json");
    });
    if (compareBtn) compareBtn.addEventListener("click", function() {
      showAnalysisCompare("anomaly", "Data health", getSavedAnalyses("anomaly"), lastAnomalyData, renderAnomalyData, function(a, b) {
        var na = a && a.anomalies ? a.anomalies.length : 0;
        var nb = b && b.anomalies ? b.anomalies.length : 0;
        return "Before: " + na + " finding(s) \xB7 After: " + nb + " finding(s)";
      });
    });
  }

  // assets/web/tools-import.ts
  function initImport() {
    const toggle = document.getElementById("import-toggle");
    const collapsible = document.getElementById("import-collapsible");
    const tableSel = document.getElementById("import-table");
    const formatSel = document.getElementById("import-format");
    const fileInput = document.getElementById("import-file");
    const runBtn = document.getElementById("import-run");
    const previewEl = document.getElementById("import-preview");
    const statusEl = document.getElementById("import-status");
    const mappingContainer = document.getElementById("import-column-mapping");
    const mappingTbody = document.getElementById("import-mapping-tbody");
    let importFileData = null;
    let importCsvHeaders = [];
    var importHistory = [];
    var historyDetailsEl = document.getElementById("import-history-details");
    var historyListEl = document.getElementById("import-history-list");
    function addImportHistory(table, format, imported, errors) {
      var now = /* @__PURE__ */ new Date();
      var timeStr = now.toLocaleTimeString();
      var entry = { time: timeStr, table, format, imported, errors: errors || [] };
      importHistory.unshift(entry);
      renderImportHistory();
    }
    function renderImportHistory() {
      if (!historyListEl || !historyDetailsEl) return;
      if (importHistory.length === 0) {
        historyDetailsEl.style.display = "none";
        return;
      }
      historyDetailsEl.style.display = "block";
      var html = "";
      for (var i = 0; i < importHistory.length; i++) {
        var h = importHistory[i];
        var errText = h.errors.length > 0 ? ' <span style="color:#e57373;">(' + h.errors.length + " error(s))</span>" : "";
        html += '<div style="padding:2px 0;border-bottom:1px solid var(--border,#333);"><span style="opacity:0.6;">' + esc2(h.time) + "</span> <strong>" + esc2(h.table) + "</strong> (" + esc2(h.format) + ") &mdash; " + h.imported + " row(s)" + errText + "</div>";
      }
      historyListEl.innerHTML = html;
    }
    function parseCsvHeaderLine(line) {
      var fields = [];
      var cur = "";
      var inQuotes = false;
      for (var i = 0; i < line.length; i++) {
        var c = line[i];
        if (c === '"') {
          if (inQuotes && line[i + 1] === '"') {
            cur += '"';
            i++;
          } else inQuotes = !inQuotes;
        } else if (c === "," && !inQuotes) {
          fields.push(cur.trim());
          cur = "";
        } else cur += c;
      }
      fields.push(cur.trim());
      return fields;
    }
    function renderMappingTable() {
      if (!mappingTbody || importCsvHeaders.length === 0) return;
      var tableName = tableSel && tableSel.value;
      if (!tableName) {
        mappingContainer.style.display = "none";
        return;
      }
      var requestedTable = tableName;
      mappingTbody.innerHTML = '<tr><td colspan="2" class="meta">Loading columns\u2026</td></tr>';
      mappingContainer.style.display = "block";
      fetch("/api/table/" + encodeURIComponent(tableName) + "/columns", authOpts()).then(function(r) {
        return r.json();
      }).then(function(tableColumns) {
        if (tableSel.value !== requestedTable) return;
        if (!Array.isArray(tableColumns)) {
          mappingContainer.style.display = "none";
          return;
        }
        var html = "";
        importCsvHeaders.forEach(function(csvCol) {
          var optHtml = '<option value="">(skip)</option>' + tableColumns.map(function(tc) {
            return '<option value="' + esc2(tc) + '">' + esc2(tc) + "</option>";
          }).join("");
          html += '<tr><td style="border:1px solid var(--border);padding:4px;">' + esc2(csvCol) + "</td>";
          html += '<td style="border:1px solid var(--border);padding:4px;"><select class="import-map-select" data-csv-header="' + esc2(csvCol) + '">' + optHtml + "</select></td></tr>";
        });
        mappingTbody.innerHTML = html;
      }).catch(function() {
        if (tableSel.value !== requestedTable) return;
        mappingTbody.innerHTML = '<tr><td colspan="2" class="meta" style="color:#e57373;">Failed to load table columns.</td></tr>';
      });
    }
    function updateImportState() {
      var hasFile = importFileData !== null && importFileData !== "";
      var table = tableSel && tableSel.value;
      runBtn.disabled = !hasFile || !table;
      if (hasFile && previewEl) {
        previewEl.style.display = "block";
        previewEl.textContent = importFileData.length > 2e3 ? importFileData.slice(0, 2e3) + "\n\u2026" : importFileData;
      }
      var fmt = formatSel && formatSel.value;
      if (fmt === "csv" && hasFile && importCsvHeaders.length > 0) {
        renderMappingTable();
      } else {
        if (mappingContainer) mappingContainer.style.display = "none";
      }
    }
    if (toggle && collapsible) {
      toggle.addEventListener("click", function() {
        var isCollapsed = collapsible.classList.contains("collapsed");
        collapsible.classList.toggle("collapsed", !isCollapsed);
        syncFeatureCardExpanded(collapsible);
      });
    }
    if (fileInput) {
      fileInput.addEventListener("change", function() {
        var f = this.files && this.files[0];
        if (!f) {
          importFileData = null;
          importCsvHeaders = [];
          updateImportState();
          return;
        }
        var reader = new FileReader();
        reader.onload = function() {
          importFileData = reader.result;
          if (typeof importFileData !== "string") importFileData = null;
          importCsvHeaders = [];
          if (importFileData && (formatSel && formatSel.value) === "csv") {
            var firstLine = importFileData.split(/\r?\n/)[0] || "";
            importCsvHeaders = parseCsvHeaderLine(firstLine);
          }
          updateImportState();
        };
        reader.readAsText(f);
      });
    }
    var pasteBtn = document.getElementById("import-paste");
    if (pasteBtn) {
      pasteBtn.addEventListener("click", function() {
        if (!navigator.clipboard || !navigator.clipboard.readText) {
          alert("Clipboard API not available (requires HTTPS or localhost).");
          return;
        }
        navigator.clipboard.readText().then(function(text) {
          if (!text || !text.trim()) {
            alert("Clipboard is empty.");
            return;
          }
          importFileData = text;
          var trimmed = text.trim();
          var detectedFormat = "csv";
          if (trimmed.charAt(0) === "[" || trimmed.charAt(0) === "{") {
            detectedFormat = "json";
          } else if (trimmed.indexOf("	") >= 0) {
            detectedFormat = "csv";
            importFileData = text.split(/\r?\n/).map(function(line) {
              return line.split("	").map(function(field) {
                if (field.indexOf(",") >= 0 || field.indexOf('"') >= 0) {
                  return '"' + field.replace(/"/g, '""') + '"';
                }
                return field;
              }).join(",");
            }).join("\n");
          }
          if (formatSel) formatSel.value = detectedFormat;
          importCsvHeaders = [];
          if (detectedFormat === "csv") {
            var firstLine = importFileData.split(/\r?\n/)[0] || "";
            importCsvHeaders = parseCsvHeaderLine(firstLine);
          }
          if (fileInput) fileInput.value = "";
          updateImportState();
        }).catch(function(e) {
          alert("Failed to read clipboard: " + (e.message || "Permission denied"));
        });
      });
    }
    if (formatSel) formatSel.addEventListener("change", function() {
      if (this.value === "csv" && importFileData) {
        var firstLine = importFileData.split(/\r?\n/)[0] || "";
        importCsvHeaders = parseCsvHeaderLine(firstLine);
      } else importCsvHeaders = [];
      updateImportState();
    });
    if (tableSel) tableSel.addEventListener("change", updateImportState);
    if (runBtn) {
      runBtn.addEventListener("click", function() {
        var table = tableSel && tableSel.value;
        var format = formatSel && formatSel.value;
        if (!table || !importFileData) return;
        if (!confirm('Import data into table "' + esc2(table) + '"? This cannot be undone.')) return;
        runBtn.disabled = true;
        var runBtnOrigText = runBtn.textContent;
        setButtonBusy(runBtn, true, "Importing\u2026");
        statusEl.textContent = "Importing\u2026";
        var body = { format, data: importFileData, table };
        if (format === "csv" && mappingContainer && mappingContainer.style.display !== "none") {
          var mapping = {};
          mappingContainer.querySelectorAll(".import-map-select").forEach(function(sel) {
            var csvHeader = sel.getAttribute("data-csv-header");
            var tableCol = sel.value;
            if (csvHeader && tableCol) mapping[csvHeader] = tableCol;
          });
          if (Object.keys(mapping).length > 0) body.columnMapping = mapping;
        }
        fetch("/api/import", authOpts({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        })).then(function(r) {
          return r.json().then(function(d) {
            return { ok: r.ok, data: d };
          });
        }).then(function(o) {
          if (!o.ok) {
            statusEl.textContent = "Error: " + (o.data.error || "Request failed");
            statusEl.style.color = "#e57373";
            addImportHistory(table, format, 0, [o.data.error || "Request failed"]);
            return;
          }
          var d = o.data;
          var msg = "Imported " + d.imported + " row(s).";
          if (d.errors && d.errors.length > 0) msg += " " + d.errors.length + " error(s): " + d.errors.slice(0, 3).join("; ");
          statusEl.textContent = msg;
          statusEl.style.color = "";
          addImportHistory(table, format, d.imported, d.errors || []);
          if (d.imported > 0 && currentTableName === table) loadTable(table);
        }).catch(function(e) {
          statusEl.textContent = "Error: " + (e.message || "Import failed");
          statusEl.style.color = "#e57373";
          addImportHistory(table, format, 0, [e.message || "Import failed"]);
        }).finally(function() {
          runBtn.disabled = !importFileData || !tableSel || !tableSel.value;
          setButtonBusy(runBtn, false, runBtnOrigText || "Import");
        });
      });
    }
  }

  // assets/web/search-tab.ts
  function initSearchTab() {
    var stTableSel = document.getElementById("st-table");
    var stInput = document.getElementById("st-input");
    var stScopeSel = document.getElementById("st-scope");
    var stFilterEl = document.getElementById("st-filter");
    var stNavEl = document.getElementById("st-nav");
    var stCountEl = document.getElementById("st-count");
    var stPrevBtn = document.getElementById("st-prev");
    var stNextBtn = document.getElementById("st-next");
    var stRowToggle = document.getElementById("st-row-toggle-wrap");
    var stRowAll = document.getElementById("st-row-all");
    var stRowMatch = document.getElementById("st-row-matching");
    var stPanel = document.getElementById("search-results-content");
    if (!stTableSel || !stInput || !stPanel) return;
    var stTableName = null;
    var stTableJson = null;
    var stSchemaText = null;
    var stCachedFks = null;
    var stCachedColTypes = null;
    var stMatches = [];
    var stMatchIdx = -1;
    var stOnlyMatching = true;
    var stLimit = 500;
    var stOffset = 0;
    function stScope() {
      return stScopeSel.value || "";
    }
    function stTerm() {
      return String(stInput.value || "").trim();
    }
    function stFilter() {
      return String(stFilterEl.value || "").trim();
    }
    window._stPopulateTables = function(tables) {
      var prev = stTableSel.value;
      stTableSel.innerHTML = '<option value="">-- select --</option>';
      (tables || []).forEach(function(t) {
        var opt = document.createElement("option");
        opt.value = t;
        opt.textContent = tableCounts[t] != null ? t + " (" + formatTableRowCountDisplay(tableCounts[t]) + ")" : t;
        stTableSel.appendChild(opt);
      });
      if (prev) stTableSel.value = prev;
    };
    window._stSyncTable = function(name) {
      if (name && stTableSel.querySelector('option[value="' + CSS.escape(name) + '"]')) {
        stTableSel.value = name;
      }
    };
    window._stUpdateCount = function(table, count) {
      var opts = stTableSel.options;
      for (var i = 0; i < opts.length; i++) {
        if (opts[i].value === table) {
          opts[i].textContent = table + " (" + formatTableRowCountDisplay(count) + ")";
          break;
        }
      }
    };
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
    function stBuildContent(data, schema, fks, colTypes, tableName) {
      stTableJson = data;
      stCachedFks = fks;
      stCachedColTypes = colTypes;
      if (schema && cachedSchema === null) setCachedSchema(schema);
      var scope = stScope();
      var filtered2 = stFilterRows(data);
      var display = stOnlyMatching && stFilter() ? filtered2 : data;
      if (!display || display.length === 0) display = data;
      var fkMap = {};
      (fks || []).forEach(function(fk) {
        fkMap[fk.fromColumn] = fk;
      });
      var total = tableCounts[tableName];
      var len = data.length;
      var metaText = esc2(tableName);
      if (total != null) {
        var rangeText = len > 0 ? "showing " + (stOffset + 1) + "\u2013" + (stOffset + len) : "no rows in this range";
        metaText = esc2(tableName) + " (" + total + " row" + (total !== 1 ? "s" : "") + "; " + rangeText + ")";
      } else {
        metaText = esc2(tableName) + " (up to " + stLimit + " rows)";
      }
      var filterSuffix = "";
      if (stFilter()) {
        filterSuffix = stOnlyMatching ? " (filtered: " + filtered2.length + " of " + data.length + ")" : " (showing all rows; filter: " + filtered2.length + " match)";
      }
      metaText += filterSuffix;
      var rawTableHtml = buildDataTableHtml(display, fkMap, colTypes, getColumnConfig(tableName));
      var tableHtml = wrapDataTableInScroll(rawTableHtml.replace('id="data-table"', 'id="st-data-table"')) + buildTableStatusBar(
        total,
        stOffset,
        stLimit,
        display.length,
        getVisibleColumnCount(Object.keys(display[0] || {}), getColumnConfig(tableName))
      );
      if (scope === "both" && schema) {
        stSchemaText = schema;
        stPanel.innerHTML = '<div class="search-section-collapsible expanded"><div class="collapsible-header" data-collapsible>Schema</div><div class="collapsible-body"><pre id="st-schema-pre">' + highlightSqlSafe(schema) + '</pre></div></div><div class="search-section-collapsible expanded"><div class="collapsible-header" data-collapsible>Table data: ' + esc2(tableName) + '</div><div class="collapsible-body"><p class="meta st-meta">' + metaText + "</p>" + tableHtml + "</div></div>";
      } else {
        stSchemaText = null;
        stPanel.innerHTML = '<p class="meta st-meta">' + metaText + "</p>" + tableHtml;
      }
      if (stRowToggle) {
        stRowToggle.style.display = scope === "data" || scope === "both" ? "flex" : "none";
      }
      stHighlight();
    }
    function stRender() {
      if (!stPanel) return;
      var scope = stScope();
      var tableName = stTableName;
      if (!tableName && scope !== "schema") {
        stPanel.innerHTML = '<p class="meta">Select a table and type a search term.</p>';
        return;
      }
      if (scope === "schema") {
        stPanel.innerHTML = '<p class="meta">Loading schema\u2026</p>';
        var schemaPromise = cachedSchema !== null ? Promise.resolve(cachedSchema) : fetch("/api/schema", authOpts()).then(function(r) {
          return r.text();
        });
        schemaPromise.then(function(schema) {
          if (cachedSchema === null) setCachedSchema(schema);
          stSchemaText = schema;
          stTableJson = null;
          stPanel.innerHTML = '<p class="meta">Schema</p><pre id="st-schema-pre">' + highlightSqlSafe(schema) + "</pre>";
          stHighlight();
        }).catch(function(e) {
          stPanel.innerHTML = '<p class="meta">Error</p><pre>' + esc2(String(e)) + "</pre>";
        });
        return;
      }
      if (!tableName) {
        stPanel.innerHTML = '<p class="meta">Select a table above.</p>';
        return;
      }
      if (stTableJson && stCachedFks !== null && stCachedColTypes !== null) {
        if (scope === "both" && !cachedSchema) {
          stPanel.innerHTML = '<p class="meta">Loading schema\u2026</p>';
          fetch("/api/schema", authOpts()).then(function(r) {
            return r.text();
          }).then(function(schema) {
            setCachedSchema(schema);
            if (stTableName === tableName) stBuildContent(stTableJson, schema, stCachedFks, stCachedColTypes, tableName);
          }).catch(function(e) {
            stPanel.innerHTML = '<p class="meta">Error loading schema</p><pre>' + esc2(String(e)) + "</pre>";
          });
          return;
        }
        stBuildContent(stTableJson, scope === "both" ? cachedSchema : null, stCachedFks, stCachedColTypes, tableName);
        return;
      }
      stPanel.innerHTML = '<p class="meta">Loading ' + esc2(tableName) + "\u2026</p>";
      var dataFetch = fetch("/api/table/" + encodeURIComponent(tableName) + "?limit=" + stLimit + "&offset=" + stOffset, authOpts()).then(function(r) {
        return r.json();
      });
      var schemaFetch = scope === "both" ? cachedSchema !== null ? Promise.resolve(cachedSchema) : fetch("/api/schema", authOpts()).then(function(r) {
        return r.text();
      }) : Promise.resolve(null);
      Promise.all([dataFetch, schemaFetch, loadFkMeta(tableName), loadColumnTypes(tableName).catch(function() {
        return {};
      })]).then(function(results) {
        var data = results[0];
        var schema = results[1];
        var fks = results[2];
        var colTypes = results[3];
        if (stTableName !== tableName) return;
        stBuildContent(data, schema, fks, colTypes, tableName);
        var total = tableCounts[tableName];
        if (total == null) {
          fetch("/api/table/" + encodeURIComponent(tableName) + "/count", authOpts()).then(function(r) {
            return r.json();
          }).then(function(o) {
            tableCounts[tableName] = o.count;
            if (stTableName === tableName) {
              var metaEl = stPanel.querySelector(".st-meta");
              if (metaEl) {
                var len = stTableJson ? stTableJson.length : 0;
                var rangeText = len > 0 ? "showing " + (stOffset + 1) + "\u2013" + (stOffset + len) : "no rows in this range";
                metaEl.textContent = tableName + " (" + o.count + " row" + (o.count !== 1 ? "s" : "") + "; " + rangeText + ")";
              }
            }
          }).catch(function() {
          });
        }
      }).catch(function(e) {
        stPanel.innerHTML = '<p class="meta">Error</p><pre>' + esc2(String(e)) + "</pre>";
      });
    }
    function stHighlight() {
      var term = stTerm();
      var scope = stScope();
      var schemaPre = stPanel.querySelector("#st-schema-pre");
      if (schemaPre && stSchemaText && (scope === "schema" || scope === "both")) {
        schemaPre.innerHTML = term ? highlightText(stSchemaText, term) : highlightSqlSafe(stSchemaText);
      }
      var dataTable = stPanel.querySelector("#st-data-table");
      if (dataTable && (scope === "data" || scope === "both")) {
        dataTable.querySelectorAll("td").forEach(function(td) {
          if (!td.querySelector(".fk-link")) {
            var copyBtn = td.querySelector(".cell-copy-btn");
            var textNodes = [];
            td.childNodes.forEach(function(n) {
              if (n !== copyBtn) textNodes.push(n.textContent || "");
            });
            var text = textNodes.join("");
            var highlighted = term ? highlightText(text, term) : esc2(text);
            if (copyBtn) {
              td.innerHTML = highlighted + copyBtn.outerHTML;
            } else {
              td.innerHTML = highlighted;
            }
          }
        });
      }
      stMatches = term ? Array.from(stPanel.querySelectorAll(".highlight")) : [];
      stMatchIdx = -1;
      if (stMatches.length > 0) {
        stNavEl.style.display = "flex";
        stNavigate(0);
      } else {
        stNavEl.style.display = term ? "flex" : "none";
        stCountEl.textContent = term ? "No matches" : "";
        stPrevBtn.disabled = true;
        stNextBtn.disabled = true;
      }
    }
    function stNavigate(index) {
      if (stMatches.length === 0) return;
      if (index < 0) index = stMatches.length - 1;
      if (index >= stMatches.length) index = 0;
      if (stMatchIdx >= 0 && stMatchIdx < stMatches.length) {
        stMatches[stMatchIdx].classList.remove("highlight-active");
      }
      stMatchIdx = index;
      var el = stMatches[stMatchIdx];
      el.classList.add("highlight-active");
      expandSectionContaining(el);
      el.scrollIntoView({ behavior: "auto", block: "center", inline: "nearest" });
      stCountEl.textContent = stMatchIdx + 1 + " of " + stMatches.length;
      stPrevBtn.disabled = false;
      stNextBtn.disabled = false;
    }
    function stNext() {
      if (stMatches.length) stNavigate(stMatchIdx + 1);
    }
    function stPrev() {
      if (stMatches.length) stNavigate(stMatchIdx - 1);
    }
    stTableSel.addEventListener("change", function() {
      stTableName = stTableSel.value || null;
      stTableJson = null;
      stCachedFks = null;
      stCachedColTypes = null;
      stRender();
    });
    var stInputTimer = null;
    var stFilterTimer = null;
    stInput.addEventListener("input", function() {
      clearTimeout(stInputTimer);
      stInputTimer = setTimeout(function() {
        if (stPanel.querySelector("#st-data-table, #st-schema-pre")) {
          stHighlight();
        } else {
          if (stTableName || stScope() === "schema") stRender();
        }
      }, 150);
    });
    stInput.addEventListener("keydown", function(e) {
      if (e.key === "Enter") {
        e.preventDefault();
        if (e.shiftKey) {
          stPrev();
        } else {
          stNext();
        }
      }
      if (e.key === "Escape") {
        stInput.value = "";
        clearTimeout(stInputTimer);
        stHighlight();
        stInput.blur();
      }
    });
    stScopeSel.addEventListener("change", function() {
      stRender();
    });
    stFilterEl.addEventListener("input", function() {
      clearTimeout(stFilterTimer);
      stFilterTimer = setTimeout(function() {
        if (stTableName && stTableJson) stRender();
      }, 200);
    });
    stPrevBtn.addEventListener("click", stPrev);
    stNextBtn.addEventListener("click", stNext);
    if (stRowAll) stRowAll.addEventListener("click", function() {
      stOnlyMatching = false;
      stRowAll.classList.add("active");
      if (stRowMatch) stRowMatch.classList.remove("active");
      if (stTableName && stTableJson) stRender();
    });
    if (stRowMatch) stRowMatch.addEventListener("click", function() {
      stOnlyMatching = true;
      stRowMatch.classList.add("active");
      if (stRowAll) stRowAll.classList.remove("active");
      if (stTableName && stTableJson) stRender();
    });
    window._stOnActivate = function() {
      if (!stTableName && currentTableName) {
        stTableSel.value = currentTableName;
        stTableName = currentTableName;
        stRender();
      }
      stInput.focus();
    };
    window._stFocusInput = function() {
      stInput.focus();
      stInput.select();
    };
  }

  // assets/web/sql-history.ts
  function loadSqlHistory() {
    setSqlHistory([]);
    try {
      const raw = localStorage.getItem(SQL_HISTORY_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return;
      setSqlHistory(parsed.map((h) => {
        const sql = h && typeof h.sql === "string" ? h.sql.trim() : "";
        if (!sql) return null;
        const rowCount = h && typeof h.rowCount === "number" ? h.rowCount : null;
        const at = h && typeof h.at === "string" ? h.at : null;
        return { sql, rowCount, at };
      }).filter(Boolean).slice(0, getPref(PREF_SQL_HISTORY_MAX, DEFAULTS[PREF_SQL_HISTORY_MAX])));
    } catch (e) {
      setSqlHistory([]);
    }
  }
  function saveSqlHistory() {
    try {
      localStorage.setItem(SQL_HISTORY_KEY, JSON.stringify(sqlHistory));
    } catch (e) {
    }
  }
  function pushSqlHistory(sql, rowCount) {
    sql = (sql || "").trim();
    if (!sql) return;
    const at = (/* @__PURE__ */ new Date()).toISOString();
    setSqlHistory([{ sql, rowCount, at }].concat(sqlHistory.filter((h) => h.sql !== sql)));
    setSqlHistory(sqlHistory.slice(0, getPref(PREF_SQL_HISTORY_MAX, DEFAULTS[PREF_SQL_HISTORY_MAX])));
    saveSqlHistory();
  }
  function bindDropdownToInput(sel, items, inputEl) {
    if (!sel || !inputEl) return;
    sel.addEventListener("change", function() {
      const idx = parseInt(this.value, 10);
      if (!isNaN(idx) && items[idx]) inputEl.value = items[idx].sql;
    });
  }
  function loadBookmarks() {
    setSqlBookmarks([]);
    try {
      const raw = localStorage.getItem(BOOKMARKS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return;
      setSqlBookmarks(parsed.map(function(b) {
        const name = b && typeof b.name === "string" ? b.name.trim() : "";
        const sql = b && typeof b.sql === "string" ? b.sql.trim() : "";
        if (!name || !sql) return null;
        const createdAt = b && typeof b.createdAt === "string" ? b.createdAt : null;
        return { name, sql, createdAt };
      }).filter(Boolean));
    } catch (e) {
      setSqlBookmarks([]);
    }
  }
  function saveBookmarks() {
    try {
      localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(sqlBookmarks));
    } catch (e) {
    }
  }
  function refreshBookmarksDropdown(sel) {
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = '<option value="">\u2014 Saved queries (' + sqlBookmarks.length + ") \u2014</option>" + sqlBookmarks.map(function(b, i) {
      return '<option value="' + i + '" title="' + esc2(b.sql) + '">' + esc2(b.name) + "</option>";
    }).join("");
    if (cur !== "" && parseInt(cur, 10) < sqlBookmarks.length) sel.value = cur;
  }
  function addBookmark(inputEl, bookmarksSel) {
    const sql = inputEl.value.trim();
    if (!sql) return;
    const name = prompt("Name for this query:", sql.slice(0, 40));
    if (name == null || String(name).trim() === "") return;
    sqlBookmarks.unshift({ name, sql, createdAt: (/* @__PURE__ */ new Date()).toISOString() });
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
    if (sqlBookmarks.length === 0) {
      alert("No saved queries to export.");
      return;
    }
    const blob = new Blob([JSON.stringify(sqlBookmarks, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "drift-viewer-saved-queries.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  function importBookmarks(bookmarksSel) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = function() {
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function() {
        try {
          const raw = typeof reader.result === "string" ? reader.result : "";
          const imported = JSON.parse(raw);
          if (!Array.isArray(imported)) throw new Error("Expected JSON array");
          let newCount = 0;
          imported.forEach(function(b) {
            if (b.name && b.sql && !sqlBookmarks.some(function(e) {
              return e.sql === b.sql;
            })) {
              sqlBookmarks.push({ name: b.name, sql: b.sql, createdAt: b.createdAt || (/* @__PURE__ */ new Date()).toISOString() });
              newCount++;
            }
          });
          saveBookmarks();
          refreshBookmarksDropdown(bookmarksSel);
          alert("Imported " + newCount + " new saved query(s). " + (imported.length - newCount) + " duplicate(s) skipped.");
        } catch (e) {
          alert("Invalid file: " + e.message);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  // assets/web/sql-runner.ts
  function initSqlRunner() {
    const templateSel = document.getElementById("sql-template");
    const tableSel = document.getElementById("sql-table");
    const fieldsSel = document.getElementById("sql-fields");
    const lockBtn = document.getElementById("sql-template-lock");
    const applyBtn = document.getElementById("sql-apply-template");
    const runBtn = document.getElementById("sql-run");
    const historyToggleBtn = document.getElementById("sql-history-toggle");
    const formatSel = document.getElementById("sql-result-format");
    const inputEl = document.getElementById("sql-input");
    const errorEl = document.getElementById("sql-error");
    const resultEl = document.getElementById("sql-result");
    const explainEl = document.getElementById("sql-explain-info");
    const bookmarksSel = document.getElementById("sql-bookmarks");
    let sqlResultAllRows = [];
    let sqlResultPage = 0;
    const SQL_RESULT_PAGE_SIZE = 100;
    const bookmarkSaveBtn = document.getElementById("sql-bookmark-save");
    const bookmarkDeleteBtn = document.getElementById("sql-bookmark-delete");
    const bookmarkExportBtn = document.getElementById("sql-bookmark-export");
    const bookmarkImportBtn = document.getElementById("sql-bookmark-import");
    loadSqlHistory();
    loadBookmarks();
    refreshBookmarksDropdown(bookmarksSel);
    bindDropdownToInput(bookmarksSel, sqlBookmarks, inputEl);
    if (historyToggleBtn) historyToggleBtn.addEventListener("click", togglePanelCollapsed);
    if (bookmarkSaveBtn) bookmarkSaveBtn.addEventListener("click", function() {
      addBookmark(inputEl, bookmarksSel);
    });
    if (bookmarkDeleteBtn) bookmarkDeleteBtn.addEventListener("click", function() {
      deleteBookmark(bookmarksSel);
    });
    if (bookmarkExportBtn) bookmarkExportBtn.addEventListener("click", exportBookmarks);
    if (bookmarkImportBtn) bookmarkImportBtn.addEventListener("click", function() {
      importBookmarks(bookmarksSel);
    });
    const TEMPLATES = {
      "select-star-limit": function(t, cols) {
        const list = cols && cols.length ? cols.map((c) => '"' + c + '"').join(", ") : "*";
        return "SELECT " + list + ' FROM "' + t + '" LIMIT 10';
      },
      "select-star": function(t, cols) {
        const list = cols && cols.length ? cols.map((c) => '"' + c + '"').join(", ") : "*";
        return "SELECT " + list + ' FROM "' + t + '"';
      },
      "count": function(t, _cols) {
        return 'SELECT COUNT(*) FROM "' + t + '"';
      },
      "select-fields": function(t, cols) {
        const list = cols && cols.length ? cols.map((c) => '"' + c + '"').join(", ") : "*";
        return "SELECT " + list + ' FROM "' + t + '" LIMIT 10';
      }
    };
    function getSelectedFields() {
      const opts = fieldsSel ? Array.from(fieldsSel.selectedOptions || []) : [];
      return opts.map((o) => o.value).filter(Boolean);
    }
    function applyTemplate() {
      const table = tableSel && tableSel.value || "";
      const templateId = templateSel && templateSel.value || "custom";
      if (templateId === "custom") return;
      const fn = TEMPLATES[templateId];
      if (!fn) return;
      const cols = getSelectedFields();
      const sql = table ? fn(table, cols) : 'SELECT * FROM "' + (table || "table_name") + '" LIMIT 10';
      if (inputEl) {
        inputEl.value = sql;
        scheduleAutoExplain();
      }
    }
    let templateLocked = true;
    if (lockBtn) {
      lockBtn.addEventListener("click", function() {
        templateLocked = !templateLocked;
        lockBtn.classList.toggle("locked", templateLocked);
        const icon = lockBtn.querySelector(".material-symbols-outlined");
        if (icon) icon.textContent = templateLocked ? "lock" : "lock_open";
        lockBtn.title = templateLocked ? "Lock: auto-apply template when table or fields change" : "Unlocked: table/field changes won\u2019t auto-apply template";
      });
    }
    if (applyBtn) applyBtn.addEventListener("click", applyTemplate);
    if (templateSel) templateSel.addEventListener("change", applyTemplate);
    if (tableSel) {
      tableSel.addEventListener("change", function() {
        const name = this.value;
        if (fieldsSel) fieldsSel.innerHTML = '<option value="">\u2014</option>';
        if (!name) return;
        if (fieldsSel) fieldsSel.innerHTML = '<option value="">Loading\u2026</option>';
        const requestedTable = name;
        fetch("/api/table/" + encodeURIComponent(name) + "/columns", authOpts()).then((r) => r.json()).then((cols) => {
          if (tableSel.value !== requestedTable) return;
          if (Array.isArray(cols) && fieldsSel) {
            fieldsSel.innerHTML = '<option value="">\u2014</option>' + cols.map((c) => '<option value="' + esc2(c) + '">' + esc2(c) + "</option>").join("");
          } else if (fieldsSel) {
            fieldsSel.innerHTML = '<option value="">\u2014</option>';
          }
          if (templateLocked) applyTemplate();
        }).catch(() => {
          if (tableSel.value !== requestedTable) return;
          if (fieldsSel) fieldsSel.innerHTML = '<option value="">\u2014</option>';
        });
      });
    }
    if (fieldsSel) {
      fieldsSel.addEventListener("change", function() {
        if (templateLocked) applyTemplate();
      });
    }
    function renderSqlResultPage() {
      if (!resultEl) return;
      const rows = sqlResultAllRows;
      const pageSize = SQL_RESULT_PAGE_SIZE;
      const start = sqlResultPage * pageSize;
      const pageRows = rows.slice(start, start + pageSize);
      const keys = rows.length > 0 ? Object.keys(rows[0]) : [];
      const total = rows.length;
      let tableHtml = '<div class="data-table-scroll-wrap"><table><thead><tr>' + keys.map(function(k) {
        return '<th data-column-key="' + esc2(k) + '">' + esc2(k) + "</th>";
      }).join("") + "</tr></thead><tbody>";
      pageRows.forEach(function(row) {
        tableHtml += "<tr>" + keys.map(function(k) {
          return "<td>" + esc2(row[k] != null ? String(row[k]) : "") + "</td>";
        }).join("") + "</tr>";
      });
      tableHtml += "</tbody></table></div>";
      const statusHtml = buildTableStatusBar(total, start, pageSize, pageRows.length, keys.length);
      const prevDisabled = sqlResultPage <= 0;
      const nextDisabled = start + pageSize >= total;
      const paginationHtml = '<div class="sql-result-pagination toolbar" style="margin-top:0.35rem;"><button type="button" id="sql-result-prev"' + (prevDisabled ? " disabled" : "") + '>Prev</button><button type="button" id="sql-result-next"' + (nextDisabled ? " disabled" : "") + ">Next</button></div>";
      resultEl.innerHTML = '<p class="meta">' + total + " row(s)</p>" + tableHtml + statusHtml + paginationHtml;
      const prevBtn = resultEl.querySelector("#sql-result-prev");
      const nextBtn = resultEl.querySelector("#sql-result-next");
      if (prevBtn) prevBtn.addEventListener("click", function() {
        sqlResultPage--;
        renderSqlResultPage();
      });
      if (nextBtn) nextBtn.addEventListener("click", function() {
        sqlResultPage++;
        renderSqlResultPage();
      });
    }
    function clearSqlResults() {
      if (errorEl) {
        errorEl.style.display = "none";
      }
      if (resultEl) {
        resultEl.style.display = "none";
        resultEl.innerHTML = "";
      }
      sqlResultAllRows = [];
      sqlResultPage = 0;
      const chartControls = document.getElementById("chart-controls");
      const chartContainer = document.getElementById("chart-container");
      if (chartControls) chartControls.style.display = "none";
      if (chartContainer) chartContainer.style.display = "none";
    }
    let explainTimer = null;
    let lastExplainedSql = "";
    let explainAbort = null;
    const EXPLAIN_DEBOUNCE_MS = 1200;
    function scheduleAutoExplain() {
      if (explainTimer) clearTimeout(explainTimer);
      explainTimer = setTimeout(runAutoExplain, EXPLAIN_DEBOUNCE_MS);
    }
    function runAutoExplain() {
      if (!inputEl || !explainEl) return;
      const sql = String(inputEl.value || "").trim();
      if (!sql) {
        explainEl.style.display = "none";
        lastExplainedSql = "";
        return;
      }
      if (sql === lastExplainedSql) return;
      lastExplainedSql = sql;
      if (explainAbort) explainAbort.abort();
      explainAbort = new AbortController();
      explainEl.style.display = "block";
      explainEl.innerHTML = '<p class="meta explain-loading">Analyzing query\u2026</p>';
      fetch("/api/sql/explain", Object.assign({}, authOpts({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql })
      }), { signal: explainAbort.signal })).then((r) => r.json().then((d) => ({ ok: r.ok, data: d }))).then(({ ok, data }) => {
        if (!ok) {
          explainEl.innerHTML = '<p class="meta" style="color:#e57373;">' + esc2(data.error || "Explain failed") + "</p>";
          return;
        }
        renderExplainInfo(data);
      }).catch((e) => {
        if (e.name === "AbortError") return;
        explainEl.innerHTML = '<p class="meta" style="color:#e57373;">' + esc2(e.message || String(e)) + "</p>";
      });
    }
    function renderExplainInfo(data) {
      if (!explainEl) return;
      const rows = data.rows || [];
      const indexes = data.indexes || {};
      let scanCount = 0;
      let searchCount = 0;
      let subqueryCount = 0;
      let sortPresent = false;
      let tempPresent = false;
      const usedIndexNames = /* @__PURE__ */ new Set();
      const tableAccess = {};
      rows.forEach(function(r) {
        const d = String(r.detail || "").trim();
        const scanMatch = d.match(/\bSCAN\s+(?:TABLE\s+)?(\S+)/i);
        if (scanMatch) {
          scanCount++;
          if (scanMatch[1]) tableAccess[scanMatch[1]] = "scan";
        }
        const searchMatch = d.match(/\bSEARCH\s+(?:TABLE\s+)?(\S+)\s+USING\s+(?:COVERING\s+)?INDEX\s+(\S+)/i);
        if (searchMatch) {
          searchCount++;
          if (searchMatch[1] && tableAccess[searchMatch[1]] !== "scan") tableAccess[searchMatch[1]] = "index";
          if (searchMatch[2]) usedIndexNames.add(searchMatch[2]);
        } else if (/\bSEARCH\b/i.test(d) && /\bINDEX\b/i.test(d)) {
          searchCount++;
          const tblMatch = d.match(/\bSEARCH\s+(?:TABLE\s+)?(\S+)/i);
          if (tblMatch && tblMatch[1] && tableAccess[tblMatch[1]] !== "scan") tableAccess[tblMatch[1]] = "index";
          const idxMatch = d.match(/INDEX\s+(\S+)/i);
          if (idxMatch && idxMatch[1]) usedIndexNames.add(idxMatch[1]);
        } else if (/\bSEARCH\b/i.test(d)) {
          searchCount++;
          const tblMatch = d.match(/\bSEARCH\s+(?:TABLE\s+)?(\S+)/i);
          if (tblMatch && tblMatch[1] && tableAccess[tblMatch[1]] !== "scan") tableAccess[tblMatch[1]] = "index";
        }
        if (/\bSUBQUERY\b/i.test(d) || /\bCORRELATED\b/i.test(d)) subqueryCount++;
        if (/USE TEMP B-TREE.*ORDER/i.test(d)) sortPresent = true;
        if (/TEMP B-TREE|TEMP TABLE/i.test(d)) tempPresent = true;
      });
      const costScore = scanCount * 3 + subqueryCount * 2 + (sortPresent ? 1 : 0) + (tempPresent ? 1 : 0);
      let costLabel, costColor;
      if (costScore === 0) {
        costLabel = "Low";
        costColor = "#81c784";
      } else if (costScore <= 3) {
        costLabel = "Medium";
        costColor = "#ffb74d";
      } else {
        costLabel = "High";
        costColor = "#e57373";
      }
      let html = '<div class="explain-cost-bar">';
      html += '<strong>Estimated cost:</strong> <span style="color:' + costColor + ';font-weight:600;">' + costLabel + "</span>";
      const parts = [];
      if (scanCount > 0) parts.push(scanCount + " full scan" + (scanCount > 1 ? "s" : ""));
      if (searchCount > 0) parts.push(searchCount + " index lookup" + (searchCount > 1 ? "s" : ""));
      if (subqueryCount > 0) parts.push(subqueryCount + " subquer" + (subqueryCount > 1 ? "ies" : "y"));
      if (sortPresent) parts.push("sort");
      if (tempPresent) parts.push("temp storage");
      if (parts.length > 0) html += " &mdash; " + esc2(parts.join(", "));
      html += "</div>";
      const tableNames = Object.keys(tableAccess);
      if (tableNames.length > 0) {
        html += '<div class="explain-index-report">';
        for (const tbl of tableNames) {
          const access = tableAccess[tbl];
          const tblIndexes = indexes[tbl] || [];
          html += '<div class="explain-table-row">';
          html += '<span class="explain-table-name">' + esc2(tbl) + "</span>";
          if (access === "scan") {
            html += ' <span class="explain-badge badge-scan">full scan</span>';
          }
          if (tblIndexes.length === 0) {
            html += ' <span class="explain-badge badge-missing">no indexes</span>';
          } else {
            for (const idx of tblIndexes) {
              const isUsed = usedIndexNames.has(idx.name);
              const badge = isUsed ? "badge-used" : "badge-unused";
              const label = isUsed ? "used" : "available";
              html += ' <span class="explain-badge ' + badge + '" title="' + esc2(idx.name) + " (" + esc2(idx.columns.join(", ")) + ")" + (idx.unique ? " UNIQUE" : "") + '">';
              html += esc2(idx.name) + " <small>(" + label + ")</small></span>";
            }
          }
          html += "</div>";
        }
        html += "</div>";
      }
      if (rows.length > 0) {
        html += '<details class="explain-details"><summary>Query plan detail (' + rows.length + " step" + (rows.length > 1 ? "s" : "") + ")</summary><pre>";
        rows.forEach(function(r) {
          html += esc2(String(r.detail || "").trim()) + "\n";
        });
        html += "</pre></details>";
      }
      explainEl.innerHTML = html;
      explainEl.style.display = "block";
    }
    if (inputEl) {
      inputEl.addEventListener("input", scheduleAutoExplain);
    }
    if (runBtn && inputEl && errorEl && resultEl) {
      runBtn.addEventListener("click", function() {
        const sql = String(inputEl.value || "").trim();
        clearSqlResults();
        if (!sql) {
          errorEl.textContent = "Enter a SELECT query.";
          errorEl.style.display = "block";
          return;
        }
        const runBtnOrigText = runBtn.textContent;
        setButtonBusy(runBtn, true, "Running\u2026");
        runBtn.disabled = true;
        fetch("/api/sql", authOpts({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sql })
        })).then((r) => r.json().then((data) => ({ ok: r.ok, data }))).then(({ ok, data }) => {
          if (!ok) {
            errorEl.textContent = data.error || "Request failed";
            errorEl.style.display = "block";
            return;
          }
          const rows = data.rows || [];
          const asTable = formatSel && formatSel.value === "table";
          if (asTable && rows.length > 0) {
            sqlResultAllRows = rows;
            sqlResultPage = 0;
            renderSqlResultPage();
          } else {
            resultEl.innerHTML = '<p class="meta">' + rows.length + " row(s)</p><pre>" + esc2(JSON.stringify(rows, null, 2)) + "</pre>";
          }
          resultEl.style.display = "block";
          var chartControls = document.getElementById("chart-controls");
          if (rows.length > 0) {
            var keys2 = Object.keys(rows[0]);
            var xSel = document.getElementById("chart-x");
            var ySel = document.getElementById("chart-y");
            if (xSel) xSel.innerHTML = keys2.map(function(k) {
              return "<option>" + esc2(k) + "</option>";
            }).join("");
            if (ySel) ySel.innerHTML = keys2.map(function(k) {
              return "<option>" + esc2(k) + "</option>";
            }).join("");
            if (chartControls) chartControls.style.display = "flex";
            window._chartRows = rows;
          } else {
            if (chartControls) chartControls.style.display = "none";
            var cc = document.getElementById("chart-container");
            if (cc) cc.style.display = "none";
          }
          pushSqlHistory(sql, rows.length);
          fetchHistory();
        }).catch((e) => {
          errorEl.textContent = e.message || String(e);
          errorEl.style.display = "block";
        }).finally(() => {
          runBtn.disabled = false;
          setButtonBusy(runBtn, false, runBtnOrigText);
        });
      });
    }
    (function applySqlFromQueryString() {
      try {
        var params = new URLSearchParams(location.search);
        var sqlParam = params.get("sql");
        if (!sqlParam || !inputEl) return;
        var decoded = sqlParam;
        try {
          decoded = decodeURIComponent(sqlParam);
        } catch (e2) {
        }
        inputEl.value = decoded;
        switchTab("sql");
        scheduleAutoExplain();
        try {
          var u = new URL(location.href);
          u.searchParams.delete("sql");
          history.replaceState(null, "", u.pathname + u.search + u.hash);
        } catch (e3) {
        }
      } catch (e) {
      }
    })();
  }

  // assets/web/performance.ts
  function initPerformance() {
    const toggle = document.getElementById("perf-toggle");
    const collapsible = document.getElementById("perf-collapsible");
    const refreshBtn = document.getElementById("perf-refresh");
    const clearBtn = document.getElementById("perf-clear");
    const container = document.getElementById("perf-results");
    const saveBtn = document.getElementById("perf-save");
    const exportBtn = document.getElementById("perf-export");
    const historySel = document.getElementById("perf-history");
    const compareBtn = document.getElementById("perf-compare");
    const slowThresholdInput = document.getElementById("perf-slow-threshold");
    let perfLoaded = false;
    var lastPerfData = null;
    function getSlowThreshold() {
      var fallback = getPref(PREF_SLOW_QUERY_THRESHOLD, DEFAULTS[PREF_SLOW_QUERY_THRESHOLD]);
      if (!slowThresholdInput) return fallback;
      var v = parseInt(slowThresholdInput.value, 10);
      return v > 0 ? v : fallback;
    }
    function fetchPerformance() {
      if (!refreshBtn || !container) return;
      refreshBtn.disabled = true;
      setButtonBusy(refreshBtn, true, "Loading\u2026");
      container.style.display = "none";
      var threshold = getSlowThreshold();
      fetch("/api/analytics/performance?slowThresholdMs=" + threshold, authOpts()).then(function(r) {
        if (!r.ok) return r.json().then(function(d) {
          throw new Error(d.error || "Request failed");
        });
        return r.json();
      }).then(function(data) {
        perfLoaded = true;
        lastPerfData = data;
        if (data.totalQueries === 0) {
          container.innerHTML = '<p class="meta">No queries recorded yet. Browse some tables, then update.</p>';
        } else {
          container.innerHTML = renderPerformance(data);
        }
        container.style.display = "block";
        populateHistorySelect(historySel, "perf");
      }).catch(function(e) {
        container.innerHTML = '<p class="meta" style="color:#e57373;">Error: ' + esc2(e.message) + "</p>";
        container.style.display = "block";
      }).finally(function() {
        if (refreshBtn) {
          refreshBtn.disabled = false;
          setButtonBusy(refreshBtn, false, "Update");
        }
      });
    }
    function renderPerformance(data) {
      if (!data) return '<p class="meta">No data.</p>';
      var html = '<div style="display:flex;gap:1rem;flex-wrap:wrap;margin:0.3rem 0;">';
      html += '<div class="meta">Total: ' + esc2(String(data.totalQueries || 0)) + " queries</div>";
      html += '<div class="meta">Total time: ' + esc2(String(data.totalDurationMs || 0)) + " ms</div>";
      html += '<div class="meta">Avg: ' + esc2(String(data.avgDurationMs || 0)) + " ms</div>";
      html += "</div>";
      if (data.slowQueries && data.slowQueries.length > 0) {
        var thresh = data.slowThresholdMs || 100;
        html += '<p class="meta" style="color:#e57373;font-weight:bold;">Slow queries (&gt;' + esc2(String(thresh)) + "ms):</p>";
        html += '<table style="border-collapse:collapse;width:100%;font-size:12px;">';
        html += '<tr><th style="border:1px solid var(--border);padding:4px;">Duration</th>';
        html += '<th style="border:1px solid var(--border);padding:4px;">Rows</th>';
        html += '<th style="border:1px solid var(--border);padding:4px;">Time</th>';
        html += '<th style="border:1px solid var(--border);padding:4px;">SQL</th></tr>';
        data.slowQueries.forEach(function(q) {
          var sql = q.sql || "";
          html += "<tr>";
          html += '<td style="border:1px solid var(--border);padding:4px;color:#e57373;font-weight:bold;">[!!] ' + esc2(String(q.durationMs)) + " ms</td>";
          html += '<td style="border:1px solid var(--border);padding:4px;">' + esc2(String(q.rowCount)) + "</td>";
          html += '<td style="border:1px solid var(--border);padding:4px;font-size:11px;">' + esc2(q.at) + "</td>";
          html += '<td style="border:1px solid var(--border);padding:4px;max-width:400px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + esc2(sql) + '">' + esc2(sql.length > 80 ? sql.slice(0, 80) + "\u2026" : sql) + "</td>";
          html += "</tr>";
        });
        html += "</table>";
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
          var pattern = p.pattern || "";
          html += "<tr>";
          html += '<td style="border:1px solid var(--border);padding:4px;">' + esc2(String(p.totalMs)) + "</td>";
          html += '<td style="border:1px solid var(--border);padding:4px;">' + esc2(String(p.count)) + "</td>";
          html += '<td style="border:1px solid var(--border);padding:4px;">' + esc2(String(p.avgMs)) + "</td>";
          html += '<td style="border:1px solid var(--border);padding:4px;">' + esc2(String(p.maxMs)) + "</td>";
          html += '<td style="border:1px solid var(--border);padding:4px;" title="' + esc2(pattern) + '">' + esc2(pattern.length > 60 ? pattern.slice(0, 60) + "\u2026" : pattern) + "</td>";
          html += "</tr>";
        });
        html += "</table>";
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
          var sql = q.sql || "";
          var color = q.durationMs > recentThresh ? "#e57373" : q.durationMs > warnThresh ? "#ffb74d" : "var(--fg)";
          var speedIcon = q.durationMs > recentThresh ? "[!!] " : q.durationMs > warnThresh ? "[!] " : "";
          var speedWeight = speedIcon ? "font-weight:bold;" : "";
          html += "<tr>";
          html += '<td style="border:1px solid var(--border);padding:4px;color:' + color + ";" + speedWeight + '">' + esc2(speedIcon) + esc2(String(q.durationMs)) + "</td>";
          html += '<td style="border:1px solid var(--border);padding:4px;">' + esc2(String(q.rowCount)) + "</td>";
          html += '<td style="border:1px solid var(--border);padding:4px;max-width:400px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + esc2(sql) + '">' + esc2(sql.length > 80 ? sql.slice(0, 80) + "\u2026" : sql) + "</td>";
          html += "</tr>";
        });
        html += "</table>";
      }
      return html;
    }
    if (historySel) {
      populateHistorySelect(historySel, "perf");
      historySel.addEventListener("change", function() {
        var id = this.value;
        if (!id) return;
        var saved = getSavedAnalysisById("perf", id);
        if (saved && saved.data) {
          lastPerfData = saved.data;
          container.innerHTML = saved.data.totalQueries === 0 ? '<p class="meta">No queries recorded (saved run).</p>' : renderPerformance(saved.data);
          container.style.display = "block";
        }
      });
    }
    if (saveBtn) saveBtn.addEventListener("click", function() {
      if (!lastPerfData) return;
      var id = saveAnalysis("perf", lastPerfData);
      showCopyToast(id != null ? "Saved" : "Save failed (storage may be full)");
      populateHistorySelect(historySel, "perf");
    });
    if (exportBtn) exportBtn.addEventListener("click", function() {
      if (!lastPerfData) return;
      downloadJSON(lastPerfData, "performance-" + (/* @__PURE__ */ new Date()).toISOString().slice(0, 10) + ".json");
    });
    if (compareBtn) compareBtn.addEventListener("click", function() {
      showAnalysisCompare("perf", "Query performance", getSavedAnalyses("perf"), lastPerfData, function(d) {
        return d && d.totalQueries !== 0 ? renderPerformance(d) : '<p class="meta">No queries in this run.</p>';
      }, function(a, b) {
        var qa = (a && a.totalQueries) != null ? a.totalQueries : 0;
        var qb = (b && b.totalQueries) != null ? b.totalQueries : 0;
        return "Before: " + qa + " queries \xB7 After: " + qb + " queries";
      });
    });
    if (toggle && collapsible) {
      toggle.addEventListener("click", function() {
        const isCollapsed = collapsible.classList.contains("collapsed");
        collapsible.classList.toggle("collapsed", !isCollapsed);
        syncFeatureCardExpanded(collapsible);
        if (isCollapsed && !perfLoaded) fetchPerformance();
      });
    }
    if (refreshBtn) refreshBtn.addEventListener("click", fetchPerformance);
    if (clearBtn) clearBtn.addEventListener("click", function() {
      clearBtn.disabled = true;
      clearBtn.textContent = "Clearing\u2026";
      fetch("/api/analytics/performance", authOpts({ method: "DELETE" })).then(function(r) {
        if (!r.ok) return r.json().then(function(d) {
          throw new Error(d.error || "Clear failed");
        });
        lastPerfData = null;
        container.innerHTML = '<p class="meta">Performance history cleared.</p>';
        container.style.display = "block";
        perfLoaded = false;
      }).catch(function(e) {
        container.innerHTML = '<p class="meta" style="color:#e57373;">Error: ' + esc2(e.message) + "</p>";
        container.style.display = "block";
      }).finally(function() {
        clearBtn.disabled = false;
        clearBtn.textContent = "Clear";
      });
    });
  }

  // assets/web/app.js
  console.log("[SDA] app.js: executing, window.mastheadStatus=" + (window.mastheadStatus ? "set" : "NOT SET"));
  (function() {
    var el = document.getElementById("sda-loading");
    if (el) el.style.display = "none";
  })();
  clearStaleProjectStorage();
  applyStoredPrefs();
  function applyHealthWriteFlag(data) {
    if (data && typeof data.writeEnabled === "boolean") setDriftWriteEnabled(data.writeEnabled);
    var clearTableBtn = document.getElementById("clear-table-data");
    var clearAllBtn = document.getElementById("clear-all-data");
    var show = driftWriteEnabled ? "" : "none";
    if (clearTableBtn) clearTableBtn.style.display = show;
    if (clearAllBtn) clearAllBtn.style.display = show;
    if (data && typeof data.compareEnabled === "boolean") setDriftCompareEnabled(data.compareEnabled);
    var setupGuide = document.getElementById("compare-setup-guide");
    var activePanel = document.getElementById("compare-active");
    if (setupGuide) setupGuide.style.display = driftCompareEnabled ? "none" : "";
    if (activePanel) activePanel.style.display = driftCompareEnabled ? "" : "none";
  }
  initNlModalListeners();
  function setupNavigateAwayConfirmation() {
    window.addEventListener("beforeunload", function(e) {
      if (!hasUnsavedWebEdit()) return;
      e.preventDefault();
      e.returnValue = "";
      return "";
    });
  }
  setupNavigateAwayConfirmation();
  (function() {
    var dismissBtn = document.getElementById("banner-dismiss");
    if (dismissBtn) {
      dismissBtn.addEventListener("click", function() {
        setBannerDismissed(true);
        hideConnectionBanner();
      });
    }
  })();
  (function() {
    var retryBtn = document.getElementById("banner-retry");
    if (retryBtn) {
      retryBtn.addEventListener("click", function() {
        if (connectionState !== "disconnected" && connectionState !== "reconnecting") return;
        if (heartbeatInFlight) return;
        stopHeartbeat();
        setNextHeartbeatAt(null);
        setCurrentBackoffMs(BACKOFF_INITIAL_MS);
        doHeartbeat();
      });
    }
  })();
  initTheme();
  initThemeListeners();
  initPiiMaskToggle();
  initLongPressCopy();
  if (DRIFT_VIEWER_AUTH_TOKEN) {
    schemaLink = document.getElementById("export-schema");
    if (schemaLink) schemaLink.href = "/api/schema";
  }
  var schemaLink;
  var schemaToggle = document.getElementById("schema-toggle");
  if (schemaToggle) {
    schemaToggle.addEventListener("click", function() {
      const el = document.getElementById("schema-collapsible");
      const isCollapsed = el && el.classList.contains("collapsed");
      if (el) el.classList.toggle("collapsed", !isCollapsed);
      syncFeatureCardExpanded(el);
      if (isCollapsed) loadSchemaIntoPre();
    });
  }
  function refreshSearchResultsPanel() {
    if (typeof window._stOnActivate === "function") window._stOnActivate();
  }
  function triggerToolButtonIfReady(buttonId, opts) {
    var btn = document.getElementById(buttonId);
    if (!btn || btn.classList.contains("offline-disabled")) return;
    if (opts && opts.checkDisabled && btn.disabled) return;
    btn.click();
  }
  window.onTabSwitch = function(tabId) {
    if (tabId === "schema") loadSchemaIntoPre();
    if (tabId === "diagram" && typeof window.ensureDiagramInited === "function") window.ensureDiagramInited();
    if (tabId === "search") refreshSearchResultsPanel();
    if (tabId === "index") triggerToolButtonIfReady("index-analyze", { checkDisabled: true });
    if (tabId === "size" && lastSizeAnalyticsData == null) triggerToolButtonIfReady("size-analyze", { checkDisabled: true });
    if (tabId === "perf") triggerToolButtonIfReady("perf-refresh", { checkDisabled: true });
    if (tabId === "anomaly") triggerToolButtonIfReady("anomaly-analyze", { checkDisabled: true });
    if (tabId === "home" && typeof window._syncHomeSidebarToggles === "function") window._syncHomeSidebarToggles();
    if (typeof window._toolbarSyncActiveTab === "function") window._toolbarSyncActiveTab(tabId);
  };
  initTabsAndToolbar();
  initSidebarCollapse();
  initHistorySidebar();
  initHomeScreen();
  openTool("home");
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
  document.addEventListener("click", function(e) {
    var header = e.target.closest(".collapsible-header[data-collapsible]");
    if (!header) return;
    var wrap = header.closest(".search-section-collapsible");
    var body = wrap && wrap.querySelector(".collapsible-body");
    if (body) {
      body.classList.toggle("collapsed");
      wrap.classList.toggle("expanded", !body.classList.contains("collapsed"));
    }
  });
  document.getElementById("export-csv").addEventListener("click", function(e) {
    e.preventDefault();
    if (!currentTableName || !currentTableJson || currentTableJson.length === 0) {
      document.getElementById("export-csv-status").textContent = " Select a table with data first.";
      return;
    }
    const statusEl = document.getElementById("export-csv-status");
    statusEl.textContent = " Preparing\u2026";
    try {
      const keys = Object.keys(currentTableJson[0]);
      const rowToCsv = (row) => keys.map((k) => {
        const v = row[k];
        const s = getDisplayValue(k, v);
        if (s === "") return "";
        return s.includes(",") || s.includes('"') || s.includes("\n") ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(",");
      const csv = [keys.join(","), ...currentTableJson.map(rowToCsv)].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = currentTableName + ".csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      statusEl.textContent = " Failed: " + err.message;
      return;
    }
    statusEl.textContent = "";
  });
  document.getElementById("export-json").addEventListener("click", function(e) {
    e.preventDefault();
    if (!currentTableName || !currentTableJson || currentTableJson.length === 0) {
      document.getElementById("export-json-status").textContent = " Select a table with data first.";
      return;
    }
    var statusEl = document.getElementById("export-json-status");
    statusEl.textContent = " Preparing\u2026";
    try {
      var json = JSON.stringify(currentTableJson, null, 2);
      var blob = new Blob([json], { type: "application/json;charset=utf-8" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = currentTableName + ".json";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      statusEl.textContent = " Failed: " + err.message;
      return;
    }
    statusEl.textContent = "";
  });
  document.getElementById("search-input").addEventListener("input", applySearch);
  document.getElementById("search-input").addEventListener("keydown", function(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) {
        prevMatch();
      } else {
        nextMatch();
      }
    }
    if (e.key === "Escape") {
      this.value = "";
      applySearch();
      this.blur();
    }
  });
  document.getElementById("search-prev").addEventListener("click", prevMatch);
  document.getElementById("search-next").addEventListener("click", nextMatch);
  document.addEventListener("keydown", function(e) {
    if (e.ctrlKey && e.key === "g") {
      e.preventDefault();
      if (e.shiftKey) {
        prevMatch();
      } else {
        nextMatch();
      }
    }
    if (e.ctrlKey && e.key === "f") {
      e.preventDefault();
      if (activeTabId === "search" && typeof window._stFocusInput === "function") {
        window._stFocusInput();
      } else {
        var wrap = document.getElementById("sidebar-search-wrap");
        if (wrap && wrap.classList.contains("collapsed")) {
          wrap.classList.remove("collapsed");
          wrap.setAttribute("aria-hidden", "false");
        }
        var searchInput = document.getElementById("search-input");
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
      }
    }
  });
  document.getElementById("row-filter").addEventListener("input", function() {
    if (currentTableName && currentTableJson) {
      renderTableView(currentTableName, currentTableJson);
      saveTableState(currentTableName);
    }
  });
  document.getElementById("row-filter").addEventListener("keyup", function() {
    if (currentTableName && currentTableJson) renderTableView(currentTableName, currentTableJson);
  });
  var rowDisplayAll = document.getElementById("row-display-all");
  var rowDisplayMatching = document.getElementById("row-display-matching");
  if (rowDisplayAll) rowDisplayAll.addEventListener("click", function() {
    setShowOnlyMatchingRows(false);
    rowDisplayAll.classList.add("active");
    if (rowDisplayMatching) rowDisplayMatching.classList.remove("active");
    if (currentTableName && currentTableJson) {
      renderTableView(currentTableName, currentTableJson);
      saveTableState(currentTableName);
    }
  });
  if (rowDisplayMatching) rowDisplayMatching.addEventListener("click", function() {
    setShowOnlyMatchingRows(true);
    rowDisplayMatching.classList.add("active");
    if (rowDisplayAll) rowDisplayAll.classList.remove("active");
    if (currentTableName && currentTableJson) {
      renderTableView(currentTableName, currentTableJson);
      saveTableState(currentTableName);
    }
  });
  document.getElementById("search-scope").addEventListener("change", function() {
    const scope = getScope();
    const content = document.getElementById("content");
    const paginationBar = document.getElementById("pagination-bar");
    if (scope === "both") {
      loadBothView();
      paginationBar.style.display = currentTableName ? "flex" : "none";
    } else if (scope === "schema") {
      loadSchemaView();
      paginationBar.style.display = "none";
    } else if (currentTableName) {
      renderTableView(currentTableName, currentTableJson);
      paginationBar.style.display = "flex";
    } else {
      content.innerHTML = "";
      setLastRenderedSchema(null);
      setLastRenderedData(null);
      paginationBar.style.display = "none";
    }
    applySearch();
  });
  document.getElementById("export-dump").addEventListener("click", function(e) {
    e.preventDefault();
    const link = this;
    const statusEl = document.getElementById("export-dump-status");
    const origText = link.textContent;
    link.textContent = "Preparing dump\u2026";
    statusEl.textContent = "";
    fetch("/api/dump", authOpts()).then((r) => {
      if (!r.ok) throw new Error(r.statusText);
      return r.blob();
    }).then((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "dump.sql";
      a.click();
      URL.revokeObjectURL(url);
    }).catch((err) => {
      statusEl.textContent = " Failed: " + err.message;
    }).finally(() => {
      link.textContent = origText;
    });
  });
  document.getElementById("export-database").addEventListener("click", function(e) {
    e.preventDefault();
    const link = this;
    const statusEl = document.getElementById("export-database-status");
    const origText = link.textContent;
    link.textContent = "Preparing\u2026";
    statusEl.textContent = "";
    fetch("/api/database", authOpts()).then((r) => {
      if (r.status === 501) return r.json().then((j) => {
        throw new Error(j.error || "Not configured");
      });
      if (!r.ok) throw new Error(r.statusText);
      return r.blob();
    }).then((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "database.sqlite";
      a.click();
      URL.revokeObjectURL(url);
    }).catch((err) => {
      statusEl.textContent = " " + err.message;
    }).finally(() => {
      link.textContent = origText;
    });
  });
  document.getElementById("pagination-limit").addEventListener("change", function() {
    setLimit(parseInt(this.value, 10));
    saveTableState(currentTableName);
    loadTable(currentTableName);
  });
  document.getElementById("pagination-offset").addEventListener("change", function() {
    setOffset(parseInt(this.value || "0", 10) || 0);
  });
  document.getElementById("pagination-prev").addEventListener("click", function() {
    goToOffset(Math.max(0, offset - limit));
  });
  document.getElementById("pagination-next").addEventListener("click", function() {
    goToOffset(offset + limit);
  });
  document.getElementById("pagination-first").addEventListener("click", function() {
    goToOffset(0);
  });
  document.getElementById("pagination-last").addEventListener("click", function() {
    const total = currentTableName ? tableCounts[currentTableName] ?? null : null;
    if (total == null || total <= 0) return;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    goToOffset((totalPages - 1) * limit);
  });
  document.getElementById("pagination-apply").addEventListener("click", function() {
    goToOffset(parseInt(document.getElementById("pagination-offset").value || "0", 10) || 0);
  });
  (function() {
    const toggle = document.getElementById("pagination-advanced-toggle");
    const advanced = document.getElementById("pagination-advanced");
    if (toggle && advanced) {
      toggle.addEventListener("click", function() {
        const collapsed = advanced.classList.toggle("collapsed");
        advanced.style.display = collapsed ? "none" : "flex";
        advanced.setAttribute("aria-hidden", collapsed ? "true" : "false");
      });
      advanced.style.display = "none";
    }
  })();
  document.getElementById("sample-rows-btn").addEventListener("click", function() {
    if (!currentTableName) return;
    var btn = this;
    var origHtml = btn.innerHTML;
    var sampleSize = limit || 50;
    var sql = 'SELECT * FROM "' + currentTableName.replace(/"/g, '""') + '" ORDER BY RANDOM() LIMIT ' + sampleSize;
    btn.disabled = true;
    btn.textContent = "Sampling\u2026";
    fetch("/api/sql", authOpts({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql })
    })).then(function(r) {
      return r.json().then(function(d) {
        return { ok: r.ok, data: d };
      });
    }).then(function(o) {
      if (!o.ok) throw new Error(o.data.error || "Sample query failed");
      var rows = o.data.rows || [];
      setCurrentTableJson(rows);
      renderTableView(currentTableName, rows);
    }).catch(function(err) {
      document.getElementById("content").innerHTML = '<p class="meta">Sample failed: ' + esc2(String(err.message || err)) + "</p>";
    }).finally(function() {
      btn.disabled = false;
      btn.innerHTML = origHtml;
    });
  });
  document.getElementById("clear-table-state").addEventListener("click", function() {
    clearTableState2(currentTableName);
    document.getElementById("row-filter").value = "";
    setLimit(200);
    setOffset(0);
    setDisplayFormat("raw");
    var fmtSel = document.getElementById("display-format-toggle");
    if (fmtSel) fmtSel.value = "raw";
    setQueryBuilderActive(false);
    setQueryBuilderState(null);
    if (currentTableName) loadTable(currentTableName);
  });
  document.getElementById("clear-table-data").addEventListener("click", function() {
    if (!driftWriteEnabled || !currentTableName) return;
    if (!confirm('Delete ALL rows from "' + currentTableName + '"? This cannot be undone.')) return;
    var btn = this;
    btn.disabled = true;
    fetch("/api/edits/apply", authOpts({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ statements: ['DELETE FROM "' + currentTableName.replace(/"/g, '""') + '"'] })
    })).then(function(r) {
      return r.json().then(function(d) {
        return { ok: r.ok, data: d };
      });
    }).then(function(o) {
      if (!o.ok) {
        alert("Clear failed: " + (o.data.error || "Unknown error"));
        return;
      }
      loadTable(currentTableName);
    }).catch(function(e) {
      alert("Clear failed: " + (e.message || "Network error"));
    }).finally(function() {
      btn.disabled = false;
    });
  });
  document.getElementById("clear-all-data").addEventListener("click", function() {
    if (!driftWriteEnabled) return;
    var tables = lastKnownTables || [];
    if (tables.length === 0) {
      alert("No tables loaded.");
      return;
    }
    if (!confirm("Delete ALL rows from ALL " + tables.length + " table(s)? This cannot be undone.")) return;
    var btn = this;
    btn.disabled = true;
    var stmts = tables.map(function(t) {
      return 'DELETE FROM "' + t.replace(/"/g, '""') + '"';
    });
    fetch("/api/edits/apply", authOpts({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ statements: stmts })
    })).then(function(r) {
      return r.json().then(function(d) {
        return { ok: r.ok, data: d };
      });
    }).then(function(o) {
      if (!o.ok) {
        alert("Clear all failed: " + (o.data.error || "Unknown error"));
        return;
      }
      if (currentTableName) loadTable(currentTableName);
    }).catch(function(e) {
      alert("Clear all failed: " + (e.message || "Network error"));
    }).finally(function() {
      btn.disabled = false;
    });
  });
  document.getElementById("display-format-toggle").addEventListener("change", function() {
    setDisplayFormat(String(this.value || "raw"));
    if (currentTableName) {
      saveTableState(currentTableName);
      if (currentTableJson) renderTableView(currentTableName, currentTableJson);
    }
  });
  document.getElementById("column-chooser-btn").addEventListener("click", function() {
    var panel = document.getElementById("column-chooser");
    if (!currentTableName || !currentTableJson || !currentTableJson.length) {
      panel.style.display = "none";
      return;
    }
    populateColumnChooserList();
    panel.style.display = "block";
    panel.setAttribute("aria-hidden", "false");
  });
  document.getElementById("column-chooser-close").addEventListener("click", function() {
    document.getElementById("column-chooser").style.display = "none";
    document.getElementById("column-chooser").setAttribute("aria-hidden", "true");
  });
  document.getElementById("column-chooser-reset").addEventListener("click", function() {
    if (!currentTableName) return;
    setColumnConfig(currentTableName, null);
    delete tableColumnConfig[currentTableName];
    document.getElementById("column-chooser").style.display = "none";
    document.getElementById("column-chooser").setAttribute("aria-hidden", "true");
    applyColumnConfigAndRender();
  });
  document.getElementById("column-context-menu").querySelectorAll("button").forEach(function(btn) {
    btn.addEventListener("click", function() {
      var action = this.getAttribute("data-action");
      var key = columnContextMenuTargetKey;
      document.getElementById("column-context-menu").style.display = "none";
      document.getElementById("column-context-menu").setAttribute("aria-hidden", "true");
      if (!key || !currentTableName || !currentTableJson) return;
      var dataKeys = Object.keys(currentTableJson[0]);
      var config = ensureColumnConfig(currentTableName, dataKeys);
      if (action === "hide") {
        if (config.hidden.indexOf(key) < 0) config.hidden.push(key);
        setColumnConfig(currentTableName, config);
        applyColumnConfigAndRender();
      } else if (action === "pin") {
        if (config.pinned.indexOf(key) < 0) config.pinned.push(key);
        setColumnConfig(currentTableName, config);
        applyColumnConfigAndRender();
      } else if (action === "unpin") {
        config.pinned = config.pinned.filter(function(k) {
          return k !== key;
        });
        setColumnConfig(currentTableName, config);
        applyColumnConfigAndRender();
      }
    });
  });
  document.addEventListener("contextmenu", function(e) {
    var th = e.target.closest(".drift-table th");
    if (!th) {
      document.getElementById("column-context-menu").style.display = "none";
      return;
    }
    e.preventDefault();
    setColumnContextMenuTargetKey(th.getAttribute("data-column-key"));
    var menu = document.getElementById("column-context-menu");
    var config = getColumnConfig(currentTableName);
    var pinned = config && config.pinned && config.pinned.indexOf(columnContextMenuTargetKey) >= 0;
    menu.querySelector('[data-action="hide"]').style.display = "block";
    menu.querySelector('[data-action="pin"]').style.display = pinned ? "none" : "block";
    menu.querySelector('[data-action="unpin"]').style.display = pinned ? "block" : "none";
    menu.style.left = e.clientX + 2 + "px";
    menu.style.top = e.clientY + 2 + "px";
    menu.style.display = "block";
    menu.setAttribute("aria-hidden", "false");
  });
  document.addEventListener("click", function(e) {
    document.getElementById("column-context-menu").style.display = "none";
    document.getElementById("column-context-menu").setAttribute("aria-hidden", "true");
    var chooser = document.getElementById("column-chooser");
    if (chooser && chooser.style.display === "block" && !chooser.contains(
      /** @type {Node} */
      e.target
    ) && e.target.id !== "column-chooser-btn") {
      chooser.style.display = "none";
      chooser.setAttribute("aria-hidden", "true");
    }
  });
  document.addEventListener("dragstart", function(e) {
    var th = e.target.closest(".drift-table th");
    if (!th) return;
    setColumnDragKey(th.getAttribute("data-column-key"));
    if (!columnDragKey) return;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", columnDragKey);
    e.dataTransfer.setData("application/x-column-key", columnDragKey);
  });
  document.addEventListener("dragover", function(e) {
    var th = e.target.closest(".drift-table th");
    if (!th) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    document.querySelectorAll(".drift-table th.drag-over").forEach(function(el) {
      el.classList.remove("drag-over");
    });
    th.classList.add("drag-over");
  });
  document.addEventListener("dragleave", function(e) {
    if (e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest(".drift-table")) return;
    document.querySelectorAll(".drift-table th.drag-over").forEach(function(el) {
      el.classList.remove("drag-over");
    });
  });
  document.addEventListener("drop", function(e) {
    var th = e.target.closest(".drift-table th");
    if (!th) return;
    e.preventDefault();
    th.classList.remove("drag-over");
    var dropKey = th.getAttribute("data-column-key");
    var dragKey = e.dataTransfer.getData("application/x-column-key") || columnDragKey;
    if (!dragKey || !dropKey || dragKey === dropKey || !currentTableName || !currentTableJson) return;
    var dataKeys = Object.keys(currentTableJson[0]);
    var config = ensureColumnConfig(currentTableName, dataKeys);
    var visibleOrder = config.order.filter(function(k) {
      return config.hidden.indexOf(k) < 0;
    });
    var dragIdx = visibleOrder.indexOf(dragKey);
    var dropIdx = visibleOrder.indexOf(dropKey);
    if (dragIdx < 0 || dropIdx < 0) return;
    visibleOrder.splice(dragIdx, 1);
    visibleOrder.splice(dropIdx, 0, dragKey);
    config.order = visibleOrder.concat(config.order.filter(function(k) {
      return config.hidden.indexOf(k) >= 0;
    }));
    setColumnConfig(currentTableName, config);
    applyColumnConfigAndRender();
  });
  document.addEventListener("dragend", function(e) {
    if (e.target.closest(".drift-table th")) {
      document.querySelectorAll(".drift-table th.drag-over").forEach(function(el) {
        el.classList.remove("drag-over");
      });
    }
  });
  document.addEventListener("click", function(e) {
    var copyBtn = e.target.closest(".cell-copy-btn");
    if (copyBtn) {
      e.preventDefault();
      e.stopPropagation();
      copyCellValue(copyBtn.getAttribute("data-raw") || "");
      return;
    }
    var link = e.target.closest(".fk-link");
    if (!link) return;
    e.preventDefault();
    navigateToFk(link.dataset.table, link.dataset.column, link.dataset.value);
  });
  document.addEventListener("dblclick", function(e) {
    var td = e.target.closest(".drift-table td");
    if (!td) return;
    if (driftWriteEnabled && !e.shiftKey && !td.querySelector("input.cell-inline-editor")) {
      e.preventDefault();
      e.stopPropagation();
      tryStartBrowserCellEdit(td);
      return;
    }
    var copyBtn = td.querySelector(".cell-copy-btn");
    var rawValue = copyBtn ? copyBtn.getAttribute("data-raw") || "" : (td.textContent || "").trim();
    var columnKey = td.getAttribute("data-column-key") || "";
    showCellValuePopup(rawValue, columnKey);
  });
  document.addEventListener("click", function(e) {
    var delBtn = (
      /** @type {HTMLButtonElement | null} */
      e.target.closest(".row-delete-btn")
    );
    if (!delBtn) return;
    if (!driftWriteEnabled || !currentTableName) return;
    var pkCol = delBtn.getAttribute("data-pk-col") || "";
    var pkRaw = delBtn.getAttribute("data-pk-raw") || "";
    if (!pkCol) return;
    var confirmed = window.confirm("Delete row where " + pkCol + " = " + pkRaw + "?");
    if (!confirmed) return;
    delBtn.disabled = true;
    var safeTable = currentTableName.replace(/"/g, '""');
    var safePkCol = pkCol.replace(/"/g, '""');
    var pkJson = JSON.stringify(jsonPkValueForCellUpdate(pkRaw, pkCol));
    var stmt = 'DELETE FROM "' + safeTable + '" WHERE "' + safePkCol + '" = ' + pkJson;
    fetch("/api/edits/apply", authOpts({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ statements: [stmt] })
    })).then(function(r) {
      return r.json().then(function(d) {
        return { ok: r.ok, data: d };
      });
    }).then(function(res) {
      if (!res.ok || !res.data || res.data.error) {
        var msg = res.data && res.data.error ? res.data.error : "Request failed";
        if (window.confirm("Delete failed: " + msg + "\n\nReload table data now? (Cancel keeps the current grid.)")) {
          loadTable(currentTableName);
        }
        delBtn.disabled = false;
        return;
      }
      loadTable(currentTableName);
    }).catch(function(err) {
      var em = err && err.message ? err.message : String(err);
      if (window.confirm("Delete failed: " + em + "\n\nReload table data now? (Cancel keeps the current grid.)")) {
        loadTable(currentTableName);
      }
      delBtn.disabled = false;
    });
  });
  setupCellValuePopupButtons();
  document.getElementById("chart-render").addEventListener("click", function() {
    var type = document.getElementById("chart-type").value;
    var xKey = document.getElementById("chart-x").value;
    var yKey = document.getElementById("chart-y").value;
    var titleInput = document.getElementById("chart-title-input");
    var title = titleInput ? titleInput.value : "";
    var container = document.getElementById("chart-svg-wrap");
    var rows = window._chartRows || [];
    if (type === "none" || rows.length === 0) {
      document.getElementById("chart-container").style.display = "none";
      setLastChartState(null);
      return;
    }
    var chartData = rows;
    if (rows.length > 500) {
      var nth = Math.ceil(rows.length / 500);
      chartData = rows.filter(function(_, i) {
        return i % nth === 0;
      });
    }
    var opts = { title, description: "", xLabel: xKey, yLabel: yKey };
    setLastChartState({ type, xKey, yKey, data: chartData, opts });
    if (type === "bar") renderBarChart(container, chartData, xKey, yKey, opts);
    else if (type === "stacked-bar") renderStackedBarChart(container, chartData, xKey, yKey, opts);
    else if (type === "pie") renderPieChart(container, chartData, xKey, yKey, opts);
    else if (type === "line") renderLineChart(container, chartData, xKey, yKey, opts);
    else if (type === "area") renderAreaChart(container, chartData, xKey, yKey, opts);
    else if (type === "scatter") renderScatterChart(container, chartData, xKey, yKey, opts);
    else if (type === "histogram") renderHistogram(container, chartData, yKey, 10, opts);
  });
  document.getElementById("chart-export-png").addEventListener("click", exportChartPng);
  document.getElementById("chart-export-svg").addEventListener("click", exportChartSvg);
  document.getElementById("chart-export-copy").addEventListener("click", exportChartCopy);
  setupChartResize();
  initConnectionDeps({
    applyHealthWriteFlag,
    pollGeneration
  });
  console.log("[SDA] app.js: initConnectionDeps wired");
  console.log("[SDA] app.js: fetching /api/change-detection");
  fetch("/api/change-detection", authOpts()).then(function(r) {
    return r.json();
  }).then(function(data) {
    setPollingEnabled(data.changeDetection !== false);
    console.log("[SDA] app.js: change-detection initial state: polling=" + pollingEnabled);
    updateLiveIndicatorForConnection();
  }).catch(function() {
  });
  setTimeout(function() {
    if (window.mastheadStatus) {
      window.mastheadStatus.onToggle = function() {
        if (connectionState !== "connected") return;
        window.mastheadStatus.setBusy();
        var newState = !pollingEnabled;
        console.log("[SDA] onToggle: requesting polling=" + newState);
        var opts = authOpts();
        fetch("/api/change-detection", Object.assign({}, opts, {
          method: "POST",
          headers: Object.assign(
            { "Content-Type": "application/json" },
            opts.headers || {}
          ),
          body: JSON.stringify({ enabled: newState })
        })).then(function(r) {
          return r.json();
        }).then(function(data) {
          setPollingEnabled(data.changeDetection !== false);
          console.log("[SDA] onToggle: server confirmed polling=" + pollingEnabled);
        }).catch(function(e) {
          console.error("[SDA] onToggle: failed to toggle polling:", e);
        }).finally(function() {
          updateLiveIndicatorForConnection();
          if (!pollingEnabled && connectionState === "connected") {
            startKeepAlive();
          } else {
            stopKeepAlive();
          }
        });
      };
      console.log("[SDA] app.js: onToggle wired to mastheadStatus");
    } else {
      console.warn("[SDA] app.js: window.mastheadStatus not available for onToggle wiring");
    }
  }, 0);
  console.log("[SDA] app.js: fetching /api/tables");
  fetch("/api/tables", authOpts()).then((r) => r.json()).then((data) => {
    const loadingEl = document.getElementById("tables-loading");
    if (loadingEl) {
      loadingEl.style.display = "none";
      loadingEl.setAttribute("aria-busy", "false");
    }
    var tables = applyTableListAndCounts(data);
    console.log("[SDA] app.js: /api/tables OK, " + tables.length + " tables \u2014 starting pollGeneration");
    pollGeneration();
    var restoredTable = loadNavHistory();
    if (navHistory.length > 0) {
      var originalLength = navHistory.length;
      for (var i = 0; i < navHistory.length; i++) {
        if (tables.indexOf(navHistory[i].table) < 0) {
          navHistory.length = i;
          break;
        }
      }
      if (navHistory.length !== originalLength) {
        saveNavHistory();
      }
    }
    var hash = "";
    if (location.hash && location.hash.length > 1) {
      try {
        hash = decodeURIComponent(location.hash.slice(1));
      } catch (e) {
      }
    }
    if (hash && tables.indexOf(hash) >= 0) {
      openTableTab(hash);
    } else if (restoredTable && tables.indexOf(restoredTable) >= 0 && navHistory.length > 0) {
      openTableTab(restoredTable);
    }
    if (navHistory.length > 0) {
      renderBreadcrumb();
    }
  }).catch((e) => {
    console.log("[SDA] app.js: /api/tables FAILED", e);
    var wrap = document.getElementById("tables-loading");
    if (!wrap) return;
    var sk = wrap.querySelector(".tables-skeleton");
    var errEl = document.getElementById("tables-loading-error");
    if (sk) sk.style.display = "none";
    wrap.setAttribute("aria-busy", "false");
    if (errEl) {
      errEl.hidden = false;
      errEl.textContent = "Failed to load tables: " + e;
    }
  });
  console.log("[SDA] app.js: fetching /api/health for version");
  fetch("/api/health", authOpts()).then(function(r) {
    return r.json();
  }).then(function(d) {
    console.log("[SDA] app.js: /api/health OK, version=" + (d.version || "?"));
    applyHealthWriteFlag(d);
    if (d.version) {
      var badge = document.getElementById("version-badge");
      badge.textContent = "v" + d.version;
      badge.title = "v" + d.version + " \u2014 View changelog";
      badge.style.opacity = "1";
    }
  }).catch(function() {
  });
  var shareBtn = document.getElementById("tb-share-btn");
  if (shareBtn) shareBtn.addEventListener("click", createShareSession);
  restoreSession();

  // assets/web/toolbar.ts
  function initToolbar() {
    document.querySelectorAll(".tb-icon-btn[data-tool]").forEach(function(btn) {
      var toolId = btn.getAttribute("data-tool");
      if (toolId) {
        btn.addEventListener("click", function() {
          openTool(toolId);
        });
      }
    });
    window._toolbarSyncActiveTab = function(tabId) {
      document.querySelectorAll(".tb-icon-btn[data-tool]").forEach(function(btn) {
        var isActive = btn.getAttribute("data-tool") === tabId;
        btn.classList.toggle("active", isActive);
      });
    };
    var sidebarBtn = document.getElementById("tb-sidebar-toggle");
    if (sidebarBtn) {
      sidebarBtn.addEventListener("click", function() {
        toggleSidebarCollapsed();
        var layout3 = document.getElementById("app-layout");
        var collapsed = layout3 ? layout3.classList.contains("app-sidebar-panel-collapsed") : false;
        sidebarBtn.setAttribute("aria-pressed", collapsed ? "false" : "true");
        if (typeof window._syncHomeSidebarToggles === "function") window._syncHomeSidebarToggles();
      });
    }
    var historyBtn = document.getElementById("tb-history-toggle");
    if (historyBtn) {
      historyBtn.addEventListener("click", function() {
        togglePanelCollapsed();
        var layout3 = document.getElementById("app-layout");
        var collapsed = layout3 ? layout3.classList.contains("history-sidebar-collapsed") : false;
        historyBtn.setAttribute("aria-pressed", collapsed ? "false" : "true");
        if (typeof window._syncHomeSidebarToggles === "function") window._syncHomeSidebarToggles();
      });
    }
    var maskBtn = document.getElementById("tb-mask-toggle");
    var maskCb = document.getElementById("tb-mask-checkbox");
    if (maskBtn && maskCb) {
      maskBtn.addEventListener("click", function() {
        maskCb.checked = !maskCb.checked;
        maskCb.dispatchEvent(new Event("change"));
        maskBtn.setAttribute("aria-pressed", maskCb.checked ? "true" : "false");
      });
    }
    var themeTrigger = document.getElementById("tb-theme-trigger");
    var themeFlyout = document.getElementById("tb-theme-flyout");
    if (themeTrigger && themeFlyout) {
      themeTrigger.addEventListener("click", function(e) {
        e.stopPropagation();
        var isOpen = themeTrigger.getAttribute("aria-expanded") === "true";
        themeTrigger.setAttribute("aria-expanded", isOpen ? "false" : "true");
      });
      themeFlyout.querySelectorAll(".tb-theme-option").forEach(function(btn) {
        btn.addEventListener("click", function() {
          var chosen = btn.getAttribute("data-theme");
          if (chosen) {
            localStorage.setItem(THEME_KEY, chosen);
            applyTheme(chosen);
            themeTrigger.setAttribute("aria-expanded", "false");
          }
        });
      });
      document.addEventListener("click", function(e) {
        if (themeTrigger.getAttribute("aria-expanded") === "true") {
          var wrap = document.getElementById("tb-theme-wrap");
          if (wrap && !wrap.contains(e.target)) {
            themeTrigger.setAttribute("aria-expanded", "false");
          }
        }
      });
      document.addEventListener("keydown", function(e) {
        if (e.key === "Escape" && themeTrigger.getAttribute("aria-expanded") === "true") {
          themeTrigger.setAttribute("aria-expanded", "false");
          themeTrigger.focus();
        }
      });
    }
    var layout2 = document.getElementById("app-layout");
    if (layout2 && sidebarBtn) {
      var sidebarCollapsed = layout2.classList.contains("app-sidebar-panel-collapsed");
      sidebarBtn.setAttribute("aria-pressed", sidebarCollapsed ? "false" : "true");
    }
    if (layout2 && historyBtn) {
      var historyCollapsed = layout2.classList.contains("history-sidebar-collapsed");
      historyBtn.setAttribute("aria-pressed", historyCollapsed ? "false" : "true");
    }
    if (typeof window._syncHomeSidebarToggles === "function") window._syncHomeSidebarToggles();
    var activeTab = document.querySelector(".tab-btn.active");
    if (activeTab) {
      var activeToolId = activeTab.getAttribute("data-tab");
      document.querySelectorAll(".tb-icon-btn[data-tool]").forEach(function(btn) {
        btn.classList.toggle("active", btn.getAttribute("data-tool") === activeToolId);
      });
    }
  }

  // assets/web/table-def-toggle.ts
  function initTableDefToggle() {
    const style = document.createElement("style");
    style.textContent = "/* table-def-toggle \u2014 collapsible table definition styles */\n.table-definition-heading {\n  cursor: pointer;\n  user-select: none;\n  color: var(--link);\n  font-size: 0.875rem;\n  padding: 0.25rem 0;\n}\n.table-definition-heading:hover { text-decoration: underline; }\n.td-collapsed .table-definition-scroll { display: none; }\n";
    document.head.appendChild(style);
    document.addEventListener("click", (e) => {
      const target = e.target;
      const heading = target.closest && target.closest(".table-definition-heading");
      if (!heading) return;
      const wrap = heading.closest(".table-definition-wrap");
      if (!wrap) return;
      const isCollapsed = wrap.classList.toggle("td-collapsed");
      heading.textContent = isCollapsed ? "\u25BC Table definition" : "\u25B2 Table definition";
    });
    const existing = document.querySelectorAll(".table-definition-wrap");
    for (let i = 0; i < existing.length; i++) {
      existing[i].classList.add("td-collapsed");
      const h = existing[i].querySelector(".table-definition-heading");
      if (h) h.textContent = "\u25BC Table definition";
    }
  }

  // assets/web/index.js
  console.log("[SDA] index.js bridge: setting window.sqlHighlight");
  window.sqlHighlight = highlightSql;
  console.log("[SDA] index.js bridge: calling initMasthead()");
  var api = initMasthead();
  console.log("[SDA] index.js bridge: initMasthead returned " + (api ? "API object" : "null"));
  if (api) window.mastheadStatus = api;
  console.log("[SDA] index.js bridge: calling initToolbar()");
  initToolbar();
  console.log("[SDA] index.js bridge: calling initTableDefToggle()");
  initTableDefToggle();
  console.log("[SDA] index.js bridge: calling initSettings()");
  initSettings();
  console.log("[SDA] index.js bridge: init complete");
})();
