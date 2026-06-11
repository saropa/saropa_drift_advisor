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
import { showCopyToast } from './table-view.ts';

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

/**
 * A run of identical SQL collapsed into one row. `occurrences` holds every
 * execution that shares the exact same SQL text (within the active filter),
 * newest first; `latest` drives the badge / preview / meta line so the
 * collapsed row reflects the most recent run.
 */
interface HistoryGroup {
  sql: string;
  latest: HistoryEntry;
  occurrences: HistoryEntry[];
}

/** In-memory cache of last fetched entries. */
let entries: HistoryEntry[] = [];

/**
 * Groups rendered for the current filter, in display order. Click handlers
 * resolve a clicked row back to its group via data-idx into this array, so
 * it must stay in sync with what render() emits.
 */
let groups: HistoryGroup[] = [];

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

/**
 * Collapses a flat, newest-first entry list into groups keyed by exact SQL
 * text. Group order follows first appearance, so the newest run of a given
 * SQL keeps that SQL near the top. `latest` is recomputed by timestamp rather
 * than assumed from position because callers (filters) can reorder.
 */
function groupEntries(list: HistoryEntry[]): HistoryGroup[] {
  const bySql = new Map<string, HistoryGroup>();
  const result: HistoryGroup[] = [];
  for (const e of list) {
    let g = bySql.get(e.sql);
    if (!g) {
      g = { sql: e.sql, latest: e, occurrences: [] };
      bySql.set(e.sql, g);
      result.push(g);
    }
    g.occurrences.push(e);
    // Keep the most recent execution as the row's representative.
    if (
      e.at &&
      (!g.latest.at ||
        new Date(e.at).getTime() > new Date(g.latest.at).getTime())
    ) {
      g.latest = e;
    }
  }
  return result;
}

/** Renders the grouped history list from the in-memory cache. */
function render(): void {
  if (!listEl) return;

  groups = groupEntries(filtered());
  // Count reflects collapsed rows, not raw executions, matching the list.
  countEl?.replaceChildren(document.createTextNode('(' + groups.length + ')'));

  if (groups.length === 0) {
    listEl.innerHTML = '<li class="history-empty">No queries yet.</li>';
    return;
  }

  // Build HTML for each group: source badge, SQL preview, a clickable
  // (n) count when the SQL ran more than once, and the latest run's
  // duration/row-count/relative timestamp.
  listEl.innerHTML = groups
    .map((g, i) => {
      const e = g.latest;
      const preview =
        e.sql.length > 60 ? e.sql.slice(0, 57) + '\u2026' : e.sql;
      // Since identical SQL from different sources is merged into one group,
      // show one pill per distinct source (first-seen order) rather than only
      // the latest run's source \u2014 so a mixed browser/app group reads as such.
      const sources: string[] = [];
      for (const o of g.occurrences) {
        if (sources.indexOf(o.source) < 0) sources.push(o.source);
      }
      const badge =
        '<span class="history-badges">' +
        sources
          .map(
            (s) =>
              '<span class="history-badge history-badge--' +
              esc(s) +
              '">' +
              esc(s) +
              '</span>',
          )
          .join('') +
        '</span>';
      const meta: string[] = [];
      meta.push(e.durationMs + ' ms');
      if (e.rowCount != null) meta.push(e.rowCount + ' row(s)');
      if (e.error) meta.push('ERR');
      const at = e.at ? formatRelativeTime(e.at) : '';
      const metaStr = meta.join(' \u00B7 ');
      // The (n) badge is a separate click target (handled before the
      // load-into-runner click) that opens the occurrences dialog; only
      // shown when the SQL ran more than once.
      const count = g.occurrences.length;
      const countBadge =
        count > 1
          ? '<button type="button" class="history-count-badge" data-idx="' +
            i +
            '" title="Show all ' +
            count +
            ' runs of this query">(' +
            count +
            ')</button>'
          : '';
      // data-idx lets click handler find the group by position in the
      // rendered list; title shows full SQL on hover.
      return (
        '<li class="history-item' +
        (e.error ? ' history-item--error' : '') +
        '" data-idx="' +
        i +
        '" title="' +
        esc(e.sql) +
        '">' +
        badge +
        '<span class="history-item-line">' +
        '<span class="history-sql">' +
        esc(preview) +
        '</span>' +
        countBadge +
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

/** Formats an ISO timestamp as a readable local date-time, or '—' if absent. */
function formatAbsoluteTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

// -------------------------------------------------------
// Occurrences dialog (clicking the (n) count badge)
// -------------------------------------------------------

/** Currently open occurrences dialog overlay, reused across opens. */
let dialogOverlay: HTMLElement | null = null;

/** Hides the occurrences dialog and detaches its Escape handler. */
function closeOccurrencesDialog(): void {
  if (dialogOverlay) dialogOverlay.style.display = 'none';
  document.removeEventListener('keydown', onOccurrencesKey);
}

/** Closes the dialog on Escape; attached only while the dialog is open. */
function onOccurrencesKey(ev: KeyboardEvent): void {
  if (ev.key === 'Escape') closeOccurrencesDialog();
}

/**
 * Builds the tab-separated text copied by the dialog's Copy button: the SQL
 * on the first line, a blank line, then a header and one row per execution.
 * TSV so it pastes cleanly into a spreadsheet.
 */
function occurrencesToTsv(group: HistoryGroup, rows: HistoryEntry[]): string {
  const header = 'Time\tDuration (ms)';
  const body = rows
    .map((e) => formatAbsoluteTime(e.at) + '\t' + e.durationMs)
    .join('\n');
  return group.sql + '\n\n' + header + '\n' + body;
}

/**
 * Opens a modal listing every execution of the group's SQL in a table of
 * time + duration, with a Copy button. Reuses a single overlay element and
 * closes on Escape, backdrop click, or the Close button.
 */
function showOccurrencesDialog(group: HistoryGroup): void {
  // Newest first so the most recent run reads at the top, matching the list.
  const rows = group.occurrences.slice().sort((a, b) => {
    const ta = a.at ? new Date(a.at).getTime() : 0;
    const tb = b.at ? new Date(b.at).getTime() : 0;
    return tb - ta;
  });

  if (!dialogOverlay) {
    dialogOverlay = document.createElement('div');
    dialogOverlay.className = 'history-dialog-overlay';
    dialogOverlay.setAttribute('role', 'dialog');
    dialogOverlay.setAttribute('aria-modal', 'true');
    dialogOverlay.setAttribute('aria-label', 'Query run history');
    document.body.appendChild(dialogOverlay);
  }
  const overlay = dialogOverlay;

  function close(): void {
    overlay.style.display = 'none';
    document.removeEventListener('keydown', onKey);
  }
  function onKey(ev: KeyboardEvent): void {
    if (ev.key === 'Escape') close();
  }

  const preview =
    group.sql.length > 200 ? group.sql.slice(0, 197) + '…' : group.sql;

  // Build the run table: source badge, absolute time, duration, error marker.
  const tableRows = rows
    .map((e) => {
      const badge =
        '<span class="history-badge history-badge--' +
        esc(e.source) +
        '">' +
        esc(e.source) +
        '</span>';
      return (
        '<tr' +
        (e.error ? ' class="history-dialog-row--error"' : '') +
        '><td>' +
        badge +
        '</td><td>' +
        esc(formatAbsoluteTime(e.at)) +
        '</td><td class="history-dialog-num">' +
        esc(e.durationMs + ' ms') +
        '</td><td>' +
        (e.error ? '<span title="' + esc(e.error) + '">ERR</span>' : '') +
        '</td></tr>'
      );
    })
    .join('');

  overlay.innerHTML =
    '<div class="history-dialog">' +
    '<div class="history-dialog-header">' +
    '<h3 class="history-dialog-title">Query runs (' +
    rows.length +
    ')</h3>' +
    '<button type="button" class="history-dialog-close" title="Close">✕</button>' +
    '</div>' +
    '<pre class="history-dialog-sql">' +
    esc(preview) +
    '</pre>' +
    '<div class="history-dialog-table-wrap">' +
    '<table class="history-dialog-table">' +
    '<thead><tr><th>Source</th><th>Time</th><th>Duration</th><th></th></tr></thead>' +
    '<tbody>' +
    tableRows +
    '</tbody></table>' +
    '</div>' +
    '<div class="history-dialog-actions">' +
    '<button type="button" class="history-dialog-copy">Copy</button>' +
    '</div>' +
    '</div>';

  // Wire up controls (innerHTML was just replaced, so query fresh nodes).
  const copyBtn = overlay.querySelector('.history-dialog-copy');
  if (copyBtn) {
    copyBtn.addEventListener('click', function () {
      const text = occurrencesToTsv(group, rows);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard
          .writeText(text)
          .then(function () {
            showCopyToast('Copied ' + rows.length + ' runs');
          })
          .catch(function () {});
      }
    });
  }
  const closeBtn = overlay.querySelector('.history-dialog-close');
  if (closeBtn) closeBtn.addEventListener('click', close);
  // Backdrop click (outside the panel) closes; clicks inside do not.
  overlay.addEventListener('click', function (ev: Event) {
    if (ev.target === overlay) close();
  });
  document.addEventListener('keydown', onKey);
  overlay.style.display = 'flex';
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
    // The (n) count badge opens the occurrences dialog instead of loading
    // the SQL. Handle it first and stop here so the row's load-into-runner
    // behavior doesn't also fire.
    const countBtn = (e.target as HTMLElement).closest(
      '.history-count-badge',
    ) as HTMLElement | null;
    if (countBtn) {
      const gi = parseInt(countBtn.getAttribute('data-idx') || '', 10);
      if (!isNaN(gi) && groups[gi]) showOccurrencesDialog(groups[gi]);
      return;
    }

    const li = (e.target as HTMLElement).closest('.history-item') as HTMLElement | null;
    if (!li) return;
    const idx = parseInt(li.getAttribute('data-idx') || '', 10);
    if (isNaN(idx) || !groups[idx]) return;
    const sqlInput = document.getElementById('sql-input') as HTMLTextAreaElement | null;
    if (sqlInput) {
      sqlInput.value = groups[idx].sql;
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
