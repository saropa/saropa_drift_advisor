/**
 * Shared mutable state for the web viewer.
 *
 * All cross-module state lives here. Feature modules import what they
 * need rather than relying on closure over file-scoped variables.
 * This makes dependencies explicit and enables incremental extraction
 * of app.js into typed modules.
 */

// --- Authentication & permissions ---
export let DRIFT_VIEWER_AUTH_TOKEN = '';
export let driftWriteEnabled = false;

export function setDriftWriteEnabled(v: boolean): void { driftWriteEnabled = v; }
export function setAuthToken(t: string): void { DRIFT_VIEWER_AUTH_TOKEN = t; }

// --- Schema metadata ---
export let schemaMeta: any = null;
export function setSchemaMeta(m: any): void { schemaMeta = m; }

// --- Tab state ---
export let activeTabId = 'tables';
export let openTableTabs: string[] = [];
export function setActiveTabId(id: string): void { activeTabId = id; }
export function setOpenTableTabs(tabs: string[]): void { openTableTabs = tabs; }

// --- Table data state ---
export let cachedSchema: any = null;
export let currentTableName: string | null = null;
export let currentTableJson: any = null;
export let lastRenderedSchema: any = null;
export let lastRenderedData: any = null;
export let limit = 200;
export let offset = 0;
export let tableCounts: Record<string, number> = {};
export let lastKnownTables: any[] = [];
export let rowFilter = '';
export let lastGeneration = 0;
export let refreshInFlight = false;

export function setCachedSchema(s: any): void { cachedSchema = s; }
export function setCurrentTableName(n: string | null): void { currentTableName = n; }
export function setCurrentTableJson(j: any): void { currentTableJson = j; }
export function setLastRenderedSchema(s: any): void { lastRenderedSchema = s; }
export function setLastRenderedData(d: any): void { lastRenderedData = d; }
export function setLimit(l: number): void { limit = l; }
export function setOffset(o: number): void { offset = o; }
export function setTableCounts(c: Record<string, number>): void { tableCounts = c; }
export function setLastKnownTables(t: any[]): void { lastKnownTables = t; }
export function setRowFilter(f: string): void { rowFilter = f; }
export function setLastGeneration(g: number): void { lastGeneration = g; }
export function setRefreshInFlight(f: boolean): void { refreshInFlight = f; }

// --- Search state ---
export let searchMatches: Element[] = [];
export let searchCurrentIndex = -1;

export function setSearchMatches(m: Element[]): void { searchMatches = m; }
export function setSearchCurrentIndex(i: number): void { searchCurrentIndex = i; }

// --- Connection health state ---
export let connectionState = 'connected';
export let consecutivePollFailures = 0;
export let currentBackoffMs = 1000;
export let heartbeatTimerId: number | null = null;
export let keepAliveTimerId: number | null = null;
export let bannerDismissed = false;
export let nextHeartbeatAt: number | null = null;
export let heartbeatInFlight = false;
export let heartbeatAttemptCount = 0;
export let bannerUpdateIntervalId: number | null = null;

export function setConnectionState(s: string): void { connectionState = s; }
export function setConsecutivePollFailures(n: number): void { consecutivePollFailures = n; }
export function setCurrentBackoffMs(ms: number): void { currentBackoffMs = ms; }
export function setHeartbeatTimerId(id: number | null): void { heartbeatTimerId = id; }
export function setKeepAliveTimerId(id: number | null): void { keepAliveTimerId = id; }
export function setBannerDismissed(d: boolean): void { bannerDismissed = d; }
export function setNextHeartbeatAt(t: number | null): void { nextHeartbeatAt = t; }
export function setHeartbeatInFlight(f: boolean): void { heartbeatInFlight = f; }
export function setHeartbeatAttemptCount(n: number): void { heartbeatAttemptCount = n; }
export function setBannerUpdateIntervalId(id: number | null): void { bannerUpdateIntervalId = id; }

// --- Connection health constants ---
export const BACKOFF_INITIAL_MS = 1000;
export const BACKOFF_MAX_MS = 30000;
export const BACKOFF_MULTIPLIER = 2;
export const HEALTH_CHECK_THRESHOLD = 3;
export const KEEP_ALIVE_INTERVAL_MS = 15000;

// --- SQL history & bookmarks ---
export const SQL_HISTORY_KEY = 'drift-viewer-sql-history';
export const SQL_HISTORY_MAX = 200;
export const BOOKMARKS_KEY = 'drift-viewer-sql-bookmarks';
export let sqlHistory: any[] = [];
export let sqlBookmarks: any[] = [];

export function setSqlHistory(h: any[]): void { sqlHistory = h; }
export function setSqlBookmarks(b: any[]): void { sqlBookmarks = b; }

// --- Persistence keys ---
export const THEME_KEY = 'drift-viewer-theme';
export const TABLE_STATE_KEY_PREFIX = 'drift-viewer-table-state-';
export const NAV_HISTORY_KEY = 'drift-viewer-nav-history';
export const PINNED_TABLES_KEY = 'drift-viewer-pinned-tables';
// Tracks which server (host:port) owns the current localStorage data.
// When the user switches projects the origin changes and we must clear
// stale table state, pinned tables, nav history, etc. so the webview
// does not show data from the previous project.
export const SERVER_ORIGIN_KEY = 'drift-viewer-server-origin';
export const LIMIT_OPTIONS = [50, 200, 500, 1000];

// --- Display & UI state ---
export let displayFormat = 'raw';
export let tableColumnTypes: Record<string, any> = {};
export let queryBuilderActive = false;
export let queryBuilderState: any = null;
export let tableColumnConfig: Record<string, any> = {};
export let showOnlyMatchingRows = true;
export let columnContextMenuTargetKey: string | null = null;
export let columnDragKey: string | null = null;

export function setDisplayFormat(f: string): void { displayFormat = f; }
export function setTableColumnTypes(t: Record<string, any>): void { tableColumnTypes = t; }
export function setQueryBuilderActive(a: boolean): void { queryBuilderActive = a; }
export function setQueryBuilderState(s: any): void { queryBuilderState = s; }
export function setTableColumnConfig(c: Record<string, any>): void { tableColumnConfig = c; }
export function setShowOnlyMatchingRows(v: boolean): void { showOnlyMatchingRows = v; }
export function setColumnContextMenuTargetKey(k: string | null): void { columnContextMenuTargetKey = k; }
export function setColumnDragKey(k: string | null): void { columnDragKey = k; }

// --- Analysis ---
export const ANALYSIS_STORAGE_PREFIX = 'saropa_analysis_';
export const ANALYSIS_MAX_SAVED = 50;
export let lastSizeAnalyticsData: any = null;
export function setLastSizeAnalyticsData(d: any): void { lastSizeAnalyticsData = d; }

// --- Charts ---
export const CHART_COLORS = [
  '#4e79a7', '#f28e2b', '#e15759', '#76b7b2',
  '#59a14f', '#edc948', '#b07aa1', '#ff9da7',
  '#9c755f', '#bab0ac',
];
export let lastChartState: any = null;
export let chartResizeObserver: ResizeObserver | null = null;
export function setLastChartState(s: any): void { lastChartState = s; }
export function setChartResizeObserver(o: ResizeObserver | null): void { chartResizeObserver = o; }

// --- Polling ---
export let pollingEnabled = true;
export function setPollingEnabled(p: boolean): void { pollingEnabled = p; }

// --- NL modal ---
export let nlLiveDebounce: number | null = null;
export let nlModalEscapeListenerActive = false;
export function setNlLiveDebounce(d: number | null): void { nlLiveDebounce = d; }
export function setNlModalEscapeListenerActive(a: boolean): void { nlModalEscapeListenerActive = a; }

// --- FK navigation ---
export const fkMetaCache: Record<string, any> = {};
export const navHistory: any[] = [];

// --- Session sharing ---
export let currentSessionId: string | null = null;
export let currentSessionExpiresAt: string | null = null;
export let sessionCountdownInterval: number | null = null;
export let sessionWarningShown = false;
export let sessionFastMode = false;

export function setCurrentSessionId(id: string | null): void { currentSessionId = id; }
export function setCurrentSessionExpiresAt(at: string | null): void { currentSessionExpiresAt = at; }
export function setSessionCountdownInterval(id: number | null): void { sessionCountdownInterval = id; }
export function setSessionWarningShown(s: boolean): void { sessionWarningShown = s; }
export function setSessionFastMode(f: boolean): void { sessionFastMode = f; }

// --- Sidebar ---
export const APP_SIDEBAR_PANEL_KEY = 'saropa_app_sidebar_collapsed';

// --- Tool labels ---
export const TOOL_LABELS: Record<string, string> = {
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
  diagram: 'Diagram',
  export: 'Export',
};

// --- Offline disable IDs ---
export const OFFLINE_DISABLE_IDS = [
  'sql-run', 'sql-explain', 'sql-apply-template',
  'pagination-first', 'pagination-prev', 'pagination-next', 'pagination-last',
  'pagination-apply', 'sample-rows-btn', 'clear-table-state',
  'clear-table-data', 'clear-all-data',
];

/** Add auth header to a fetch options object. */
export function authOpts(o?: any): any {
  o = o || {};
  o.headers = o.headers || {};
  if (DRIFT_VIEWER_AUTH_TOKEN) o.headers['Authorization'] = 'Bearer ' + DRIFT_VIEWER_AUTH_TOKEN;
  return o;
}
