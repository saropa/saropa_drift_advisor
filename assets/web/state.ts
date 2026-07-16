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
export let driftCompareEnabled = false;

export function setDriftWriteEnabled(v: boolean): void { driftWriteEnabled = v; }
export function setDriftCompareEnabled(v: boolean): void { driftCompareEnabled = v; }
export function setAuthToken(t: string): void { DRIFT_VIEWER_AUTH_TOKEN = t; }

// --- Schema metadata ---
export let schemaMeta: any = null;
export function setSchemaMeta(m: any): void { schemaMeta = m; }

// --- Tab state ---
export let activeTabId = 'home';
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
// Toolbar density: when set, icon buttons show their short text label inside
// a dim bounding box ("labeled" mode); unset is the default icon-only mode.
// Toggled by clicking bare toolbar whitespace (not an icon). Persisted so the
// chosen density survives reloads.
export const TOOLBAR_LABELS_KEY = 'drift-viewer-toolbar-labels';
// Tracks which server (host:port) owns the current localStorage data.
// When the user switches projects the origin changes and we must clear
// stale table state, pinned tables, nav history, etc. so the webview
// does not show data from the previous project.
export const SERVER_ORIGIN_KEY = 'drift-viewer-server-origin';
export const LIMIT_OPTIONS = [50, 200, 500, 1000];

// --- Display & UI state ---
export let displayFormat = 'raw';
// String shown in place of SQL NULL in data table cells. User-configurable
// via Settings (Data Formatting → "NULL display"). Two values supported:
//   'NULL' — explicit, industry-standard DB tool convention (default)
//   '-'    — compact dash, common in dashboards/reports
// Always rendered inside .cell-null so the chosen string is visually dimmed
// regardless of which option is picked.
export let nullDisplay = 'NULL';
export let tableColumnTypes: Record<string, any> = {};
export let queryBuilderActive = false;
export let queryBuilderState: any = null;
export let tableColumnConfig: Record<string, any> = {};
export let showOnlyMatchingRows = true;
export let columnContextMenuTargetKey: string | null = null;
export let columnDragKey: string | null = null;

// --- Table-definition meta columns ---
// When on, the table-definition panel renders per-column profiling stats
// (fill rate, nulls, distinct/uniqueness, min/max, byte size). Opt-in because
// the stats are computed with a full-table aggregate SQL query (one round trip
// per table) — too expensive to run on every table view automatically.
export let tableDefMetaOn = false;
// Per-table stats cache keyed by table name. Each value is the parsed result of
// the profiling query (see table-def-meta.ts buildStatsForTable). Cached so
// re-renders (column reorder, full table re-render) reuse the same numbers
// instead of re-querying the database.
export const tableDefStats: Record<string, any> = {};
export function setTableDefMetaOn(v: boolean): void { tableDefMetaOn = v; }

export function setDisplayFormat(f: string): void { displayFormat = f; }
export function setNullDisplay(s: string): void { nullDisplay = s; }
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
export const HISTORY_SIDEBAR_KEY = 'saropa_history_sidebar_collapsed';
// User-chosen sidebar width (px) set by dragging the resize bar. Stored apart
// from the collapsed flag so "how wide when shown" survives a hide/show cycle.
export const APP_SIDEBAR_WIDTH_KEY = 'saropa_app_sidebar_width';

// --- Tool labels ---
/**
 * Material Symbols icon name for each tab type.
 * Used by both static tabs (html_content.dart) and dynamic tabs (createClosableTab).
 * Keep in sync with the hamburger menu icons in html_content.dart.
 */
export const TOOL_ICONS: Record<string, string> = {
  home: 'home',
  tables: 'table_chart',
  sql: 'terminal',
  search: 'search',
  snapshot: 'photo_camera',
  compare: 'compare_arrows',
  index: 'format_list_bulleted',
  size: 'bar_chart',
  perf: 'speed',
  anomaly: 'favorite',
  heartbeat: 'monitor_heart',
  import: 'upload',
  schema: 'grid_on',
  views: 'table_view',
  declared: 'code',
  diagram: 'account_tree',
  export: 'download',
  settings: 'settings',
};

export const TOOL_LABELS: Record<string, string> = {
  home: 'Home',
  tables: 'Tables',
  sql: 'Run SQL',
  search: 'Search',
  snapshot: 'Snapshot',
  compare: 'DB diff',
  index: 'Index',
  size: 'Size',
  perf: 'Perf',
  anomaly: 'Health',
  heartbeat: 'Heartbeat',
  import: 'Import',
  schema: 'Schema',
  views: 'Views',
  declared: 'Code schema',
  diagram: 'Diagram',
  export: 'Export',
  settings: 'Settings',
};

/**
 * Ordered list for the Home screen launcher grid (id + one-line blurb + accent).
 *
 * `color` is the per-tool accent shown on its Home card (left rule + icon tint +
 * hover ring) so each screen is visually identifiable at a glance. The palette is
 * deliberately mid-saturation: every hue must keep adequate contrast on BOTH the
 * light surface and the dark/midnight glass surfaces, since the cards inherit the
 * theme background. Tune a hue here and it updates the card everywhere — this list
 * is the single source of truth for the accent (see buildToolGrid()).
 */
export const HOME_LAUNCHERS: { id: string; blurb: string; color: string }[] = [
  { id: 'tables', blurb: 'browse, open tables, pagination, export', color: '#3b82f6' },
  { id: 'search', blurb: 'schema + data search, filters, jump matches', color: '#06b6d4' },
  { id: 'sql', blurb: 'editor, templates, bookmarks, charts, NL ask', color: '#8b5cf6' },
  { id: 'snapshot', blurb: 'capture schema, time travel', color: '#ec4899' },
  { id: 'compare', blurb: 'diff databases, migrations', color: '#f59e0b' },
  { id: 'index', blurb: 'suggested indexes, query hints', color: '#10b981' },
  { id: 'schema', blurb: 'DDL, columns, PRAGMA', color: '#6366f1' },
  { id: 'views', blurb: 'view definitions + their output', color: '#7c3aed' },
  { id: 'diagram', blurb: 'relationship graph', color: '#14b8a6' },
  { id: 'size', blurb: 'table sizes, growth', color: '#84cc16' },
  { id: 'perf', blurb: 'slow statements, timings', color: '#ef4444' },
  { id: 'anomaly', blurb: 'health checks, drift signals', color: '#f43f5e' },
  { id: 'heartbeat', blurb: 'live table activity, glowing cards', color: '#e11d48' },
  { id: 'import', blurb: 'CSV → table', color: '#22c55e' },
  { id: 'export', blurb: 'CSV, schema', color: '#0ea5e9' },
  { id: 'settings', blurb: 'prefs, masking, confirm navigate', color: '#64748b' },
];

/** Home-only shortcuts for toolbar actions without their own tab panel. */
export const HOME_EXTRAS: { action: 'mask' | 'theme' | 'share'; icon: string; label: string; blurb: string; color: string }[] = [
  { action: 'mask', icon: 'visibility_off', label: 'Mask PII', blurb: 'redact sensitive columns', color: '#a855f7' },
  { action: 'theme', icon: 'palette', label: 'Theme', blurb: 'light, dark, showcase, midnight', color: '#f97316' },
  { action: 'share', icon: 'share', label: 'Share', blurb: 'read-only session link', color: '#0d9488' },
];

/**
 * Feature-search dictionary for the Home search box (id → synonyms/keywords).
 *
 * The box fuzzy-matches the typed query against each card's label, blurb, AND the
 * terms below — so a user can type a feature they expect ("erd", "redact", "diff",
 * "appearance") and still land on the right card even when that exact word is not
 * the tool's name. Keep it generous: extra synonyms only help recall, and a term
 * appearing for two tools simply surfaces both. Keyed by launcher id / extra action
 * so it stays aligned with HOME_LAUNCHERS + HOME_EXTRAS above.
 */
export const HOME_SEARCH_KEYWORDS: Record<string, string[]> = {
  tables: ['browse', 'open', 'list', 'rows', 'records', 'columns', 'pagination', 'paginate', 'page', 'view', 'grid', 'data', 'datasheet'],
  search: ['find', 'lookup', 'query', 'filter', 'filters', 'jump', 'matches', 'locate', 'grep', 'seek', 'full text', 'schema search', 'data search'],
  sql: ['query', 'editor', 'run sql', 'statement', 'terminal', 'console', 'template', 'templates', 'bookmark', 'bookmarks', 'chart', 'charts', 'graph', 'natural language', 'nl', 'ask', 'ai', 'execute', 'select'],
  snapshot: ['capture', 'schema', 'time travel', 'history', 'version', 'backup', 'restore', 'point in time', 'photo', 'save state'],
  compare: ['diff', 'difference', 'databases', 'migration', 'migrations', 'merge', 'delta', 'changes', 'two databases', 'drift'],
  index: ['indexes', 'indices', 'suggested', 'query hints', 'optimize', 'optimization', 'performance', 'speed up', 'btree', 'key', 'covering'],
  schema: ['ddl', 'columns', 'pragma', 'structure', 'definition', 'create table', 'fields', 'types', 'metadata', 'constraints'],
  views: ['view', 'views', 'create view', 'virtual table', 'saved query', 'powersync', 'definition', 'sql view', 'output', 'derived'],
  diagram: ['relationship', 'relationships', 'graph', 'erd', 'entity', 'map', 'visual', 'tree', 'connections', 'foreign key', 'fk', 'links'],
  size: ['table sizes', 'growth', 'storage', 'bytes', 'disk', 'space', 'row count', 'big tables', 'usage'],
  perf: ['performance', 'slow', 'statements', 'timings', 'latency', 'profiling', 'speed', 'bottleneck', 'query time', 'duration'],
  anomaly: ['health', 'checks', 'drift', 'signals', 'issues', 'problems', 'integrity', 'warnings', 'monitor', 'diagnostics'],
  heartbeat: ['activity', 'live', 'watch', 'pulse', 'traffic', 'reads', 'writes', 'glow', 'monitor', 'ecg', 'heart', 'realtime', 'real-time', 'events'],
  import: ['csv', 'upload', 'load', 'ingest', 'file', 'data in', 'insert'],
  export: ['csv', 'download', 'schema', 'save', 'dump', 'backup', 'data out', 'extract'],
  settings: ['preferences', 'prefs', 'options', 'config', 'configuration', 'masking', 'confirm navigate', 'pii', 'defaults'],
  mask: ['redact', 'pii', 'sensitive', 'hide', 'privacy', 'obscure', 'columns', 'censor', 'anonymize'],
  theme: ['appearance', 'color', 'colors', 'light', 'dark', 'showcase', 'midnight', 'style', 'look', 'palette', 'skin', 'mode'],
  share: ['link', 'session', 'read-only', 'url', 'collaborate', 'send', 'invite'],
};

// --- Offline disable IDs ---
export const OFFLINE_DISABLE_IDS = [
  'sql-run', 'sql-apply-template',
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
