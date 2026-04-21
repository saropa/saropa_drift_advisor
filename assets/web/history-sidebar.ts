/**
 * History sidebar — right-side panel that fetches query execution
 * history from the server and renders it as a filterable list.
 *
 * Each entry shows a source badge (browser / app / internal),
 * truncated SQL preview, duration, row count, and timestamp.
 * Clicking an entry populates the SQL runner input.
 *
 * The panel is toggled via a toolbar icon button and its
 * visibility persists in localStorage.
 */
import { esc } from './utils.ts';
import * as S from './state.ts';
import { openTool } from './tabs.ts';

/** Shape of a single history entry from GET /api/history. */
interface HistoryEntry {
  sql: string;
  durationMs: number;
  rowCount: number;
  error: string | null;
  at: string;
  source: 'browser' | 'app' | 'internal';
  callerFile: string | null;
  callerLine: number | null;
  isInternal?: boolean;
}

/** In-memory cache of last fetched entries. */
let entries: HistoryEntry[] = [];

/** Currently active source filter. */
let activeFilter: string = 'all';

// -------------------------------------------------------
// DOM references (resolved once in init)
// -------------------------------------------------------
let listEl: HTMLUListElement | null = null;
let countEl: HTMLElement | null = null;
let sidebarEl: HTMLElement | null = null;

// -------------------------------------------------------
// Rendering
// -------------------------------------------------------

/** Returns entries matching the current filter. */
function filtered(): HistoryEntry[] {
  if (activeFilter === 'all') return entries;
  return entries.filter((e) => e.source === activeFilter);
}

/** Renders the history list from the in-memory cache. */
function render(): void {
  if (!listEl) return;

  const items = filtered();
  countEl?.replaceChildren(document.createTextNode('(' + items.length + ')'));

  if (items.length === 0) {
    listEl.innerHTML = '<li class="history-empty">No queries yet.</li>';
    return;
  }

  // Build HTML for each entry: source badge, SQL preview,
  // duration/row-count, and relative timestamp.
  listEl.innerHTML = items
    .map((e, i) => {
      const preview =
        e.sql.length > 60 ? e.sql.slice(0, 57) + '\u2026' : e.sql;
      const badge =
        '<span class="history-badge history-badge--' +
        esc(e.source) +
        '">' +
        esc(e.source) +
        '</span>';
      const meta: string[] = [];
      meta.push(e.durationMs + ' ms');
      if (e.rowCount != null) meta.push(e.rowCount + ' row(s)');
      if (e.error) meta.push('ERR');
      const at = e.at ? formatRelativeTime(e.at) : '';
      const metaStr = meta.join(' \u00B7 ');
      // data-idx lets click handler find the entry by position
      // in the filtered list; title shows full SQL on hover.
      return (
        '<li class="history-item' +
        (e.error ? ' history-item--error' : '') +
        '" data-idx="' +
        i +
        '" title="' +
        esc(e.sql) +
        '">' +
        badge +
        '<span class="history-sql">' +
        esc(preview) +
        '</span>' +
        '<span class="history-meta">' +
        esc(metaStr) +
        (at ? ' \u00B7 ' + esc(at) : '') +
        '</span>' +
        '</li>'
      );
    })
    .join('');
}

/** Formats an ISO timestamp as a short relative string (e.g. "2 m ago"). */
function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return 'just now';
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return sec + ' s ago';
  const min = Math.floor(sec / 60);
  if (min < 60) return min + ' m ago';
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr + ' h ago';
  return Math.floor(hr / 24) + ' d ago';
}

// -------------------------------------------------------
// Panel visibility (toolbar toggle)
// -------------------------------------------------------

/** Applies the collapsed/visible state to the history sidebar panel. */
function applyPanelCollapsed(panelCollapsed: boolean): void {
  const layout = document.getElementById('app-layout');
  if (!layout) return;

  layout.classList.toggle('history-sidebar-collapsed', panelCollapsed);

  if (sidebarEl) {
    sidebarEl.setAttribute('aria-hidden', panelCollapsed ? 'true' : 'false');
  }
}

/** Toggles the history sidebar collapsed state and persists to localStorage. */
export function togglePanelCollapsed(): void {
  const layout = document.getElementById('app-layout');
  if (!layout) return;
  const panelCollapsed = !layout.classList.contains('history-sidebar-collapsed');
  applyPanelCollapsed(panelCollapsed);
  try { localStorage.setItem(S.HISTORY_SIDEBAR_KEY, panelCollapsed ? '1' : '0'); }
  catch (e) { /* localStorage unavailable */ }
}

// -------------------------------------------------------
// Data fetching
// -------------------------------------------------------

/** Fetches history from the server and re-renders. */
export function fetchHistory(): void {
  fetch('/api/history', S.authOpts())
    .then(function (r) {
      return r.json();
    })
    .then(function (data: { entries: HistoryEntry[] }) {
      entries = Array.isArray(data.entries) ? data.entries : [];
      render();
    })
    .catch(function () {
      // Network error — keep stale cache visible.
    });
}

/** Sends DELETE /api/history and clears the local cache. */
function clearHistory(): void {
  if (!confirm('Clear all query history?')) return;
  fetch('/api/history', Object.assign({ method: 'DELETE' }, S.authOpts()))
    .then(function () {
      entries = [];
      render();
    })
    .catch(function () {});
}

// -------------------------------------------------------
// Initialization
// -------------------------------------------------------

/** Wires up the History sidebar panel. Call once from app.js. */
export function initHistorySidebar(): void {
  sidebarEl = document.getElementById('history-sidebar');
  listEl = document.getElementById(
    'query-history-list',
  ) as HTMLUListElement | null;
  countEl = document.getElementById('history-count');

  if (!sidebarEl || !listEl) return;

  // --- Panel visibility: restore from localStorage ---
  // The heading-chevron content-collapse was removed: the sidebar is now
  // collapsed only via the #tb-history-toggle toolbar icon (matches the
  // tables sidebar pattern). We still honor any previously persisted
  // collapsed state so reloads don't resurrect a hidden sidebar.
  var storedCollapsed = false;
  try { storedCollapsed = localStorage.getItem(S.HISTORY_SIDEBAR_KEY) === '1'; }
  catch (e) { /* localStorage unavailable */ }
  applyPanelCollapsed(storedCollapsed);

  // --- Filter buttons ---
  const filterBar = sidebarEl.querySelector('.history-filter-bar');
  if (filterBar) {
    filterBar.addEventListener('click', function (e: Event) {
      const btn = (e.target as HTMLElement).closest(
        '.history-filter',
      ) as HTMLButtonElement | null;
      if (!btn) return;
      const filter = btn.getAttribute('data-filter');
      if (!filter) return;
      activeFilter = filter;
      // Update active state + aria-pressed on all filter buttons.
      filterBar
        .querySelectorAll('.history-filter')
        .forEach(function (b: Element) {
          const isActive = b.getAttribute('data-filter') === filter;
          b.classList.toggle('active', isActive);
          b.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
      render();
    });
  }

  // --- Click to load SQL into runner input ---
  // Also switch to the Run SQL tab so the user can see / edit / execute
  // the loaded query immediately. Without the tab switch, clicking a
  // history entry from any other tab (Tables, Schema, etc.) silently
  // populated the hidden #sql-input — useful on refresh but invisible.
  listEl.addEventListener('click', function (e: Event) {
    const li = (e.target as HTMLElement).closest('.history-item') as HTMLElement | null;
    if (!li) return;
    const idx = parseInt(li.getAttribute('data-idx') || '', 10);
    const items = filtered();
    if (isNaN(idx) || !items[idx]) return;
    const sqlInput = document.getElementById('sql-input') as HTMLTextAreaElement | null;
    if (sqlInput) {
      sqlInput.value = items[idx].sql;
      // Switch tabs FIRST so #sql-input is visible before we try to focus
      // it — focusing a hidden element is a no-op in some browsers.
      // `openTool` creates the Run SQL tab if it isn't already open (it
      // no longer exists as a permanent tab — Tables/Search/Run SQL are
      // toolbar icons now), then switches to it.
      openTool('sql');
      sqlInput.focus();
    }
  });

  // --- Action buttons ---
  const refreshBtn = document.getElementById('history-refresh');
  if (refreshBtn) refreshBtn.addEventListener('click', fetchHistory);

  const clearBtn = document.getElementById('history-clear');
  if (clearBtn) clearBtn.addEventListener('click', clearHistory);

  // Initial fetch.
  fetchHistory();
}
