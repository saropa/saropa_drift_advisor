/**
 * Persistence helpers: pinned tables, per-table column config,
 * table state (filter, limit, offset), and FK navigation history.
 * All backed by localStorage. Extracted from app.js.
 *
 * Also owns **server-origin change detection**: when the debug server
 * host/port changes (user switched Flutter projects), all project-
 * specific keys are purged so stale data from the previous project
 * does not bleed into the new one. See {@link clearStaleProjectStorage}.
 */
import { renderTableList } from './table-list.ts';
import { captureQueryBuilderState } from './query-builder.ts';
import * as S from './state.ts';

/**
 * Returns all project-specific localStorage keys. Used by both
 * clearStaleProjectStorage (origin change) and the Settings panel's
 * "Clear all stored data" action so the key list stays in sync.
 */
export function collectProjectStorageKeys(): string[] {
  var keys: string[] = [];
  for (var i = 0; i < localStorage.length; i++) {
    var key = localStorage.key(i);
    if (!key) continue;
    if (
      key === S.PINNED_TABLES_KEY ||
      key === S.NAV_HISTORY_KEY ||
      key === S.SQL_HISTORY_KEY ||
      key === S.BOOKMARKS_KEY ||
      key.startsWith(S.TABLE_STATE_KEY_PREFIX) ||
      key.startsWith(S.ANALYSIS_STORAGE_PREFIX)
    ) {
      keys.push(key);
    }
  }
  return keys;
}

/**
 * Detects whether the debug server origin (scheme + host + port) has
 * changed since the last page load.  When it has, all project-specific
 * localStorage keys are removed so stale table state, pinned tables,
 * nav history, SQL history, bookmarks, and analysis results from the
 * previous project do not bleed into the new one.
 *
 * UI-preference keys (theme, sidebar collapsed state) are kept because
 * they are user choices that should survive across projects.
 *
 * Call this once, early in app.js, before any other localStorage reads.
 */
export function clearStaleProjectStorage(): void {
  try {
    // The <base href> tag is injected by the extension with the
    // current server URL (e.g. "http://127.0.0.1:8080/").  Falling
    // back to location.origin covers the standalone-browser case.
    var baseEl = document.querySelector('base');
    var origin = baseEl ? baseEl.href.replace(/\/+$/, '') : location.origin;
    var prev = localStorage.getItem(S.SERVER_ORIGIN_KEY);

    if (prev === origin) return; // same server — nothing to clear

    console.log('[SDA] server origin changed: ' + prev + ' → ' + origin + ' — clearing stale project storage');

    // Remove every project-specific key (pinned tables, table state,
    // nav history, SQL history, bookmarks, analysis snapshots).
    collectProjectStorageKeys().forEach(function(k) { localStorage.removeItem(k); });

    // Record the new origin so subsequent reloads within the same
    // project skip the clear path.
    localStorage.setItem(S.SERVER_ORIGIN_KEY, origin);
  } catch (e) {
    // localStorage unavailable — degrade silently.
  }
}

export function getPinnedTables() {
      try {
        var raw = localStorage.getItem(S.PINNED_TABLES_KEY);
        if (!raw) return [];
        var arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : [];
      } catch (e) { return []; }
    }

    /** Saves the pinned table names array to localStorage. */
export function setPinnedTables(arr) {
      try { localStorage.setItem(S.PINNED_TABLES_KEY, JSON.stringify(arr)); }
      catch (e) { /* localStorage full or disabled */ }
    }

    /** Toggles a table's pinned state and re-renders the sidebar list. */
export function togglePinTable(name) {
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
      renderTableList(S.lastKnownTables || []);
    }

    // Per-table column config: order, hidden, pinned. Persisted in saveTableState.

    /** Returns column config for a table, or null to use default (all columns, natural order). */
export function getColumnConfig(tableName) {
      if (!tableName) return null;
      return S.tableColumnConfig[tableName] || null;
    }

    /** Updates in-memory column config for a table and optionally persists. */
export function setColumnConfig(tableName, config) {
      if (!tableName) return;
      S.tableColumnConfig[tableName] = config;
    }

export function saveTableState(tableName) {
      if (!tableName) return;
      var state = {
        rowFilter: (document.getElementById('row-filter').value || ''),
        limit: S.limit,
        offset: S.offset,
        displayFormat: (typeof S.displayFormat !== 'undefined') ? S.displayFormat : 'raw',
        queryBuilder: (typeof captureQueryBuilderState === 'function') ? captureQueryBuilderState() : null,
        columnConfig: getColumnConfig(tableName) || null
      };
      try { localStorage.setItem(S.TABLE_STATE_KEY_PREFIX + tableName, JSON.stringify(state)); } catch (e) {}
    }
export function restoreTableState(tableName) {
      try {
        var raw = localStorage.getItem(S.TABLE_STATE_KEY_PREFIX + tableName);
        if (!raw) return;
        var state = JSON.parse(raw);
        if (state.rowFilter != null) document.getElementById('row-filter').value = state.rowFilter;
        if (typeof state.limit === 'number' && state.limit > 0) S.setLimit(state.limit);
        if (typeof state.offset === 'number' && state.offset >= 0) S.setOffset(state.offset);
        if (state.displayFormat && typeof S.displayFormat !== 'undefined') {
          S.setDisplayFormat(state.displayFormat);
          var sel = document.getElementById('display-format-toggle');
          if (sel) sel.value = S.displayFormat;
        }
        if (state.queryBuilder) S.setQueryBuilderState(state.queryBuilder);
        if (state.columnConfig && state.columnConfig.order) setColumnConfig(tableName, state.columnConfig);
      } catch (e) {}
    }
export function clearTableState(tableName) {
      if (!tableName) return;
      setColumnConfig(tableName, null);
      delete S.tableColumnConfig[tableName];
      try { localStorage.removeItem(S.TABLE_STATE_KEY_PREFIX + tableName); } catch (e) {}
    }

    // --- FK navigation history: localStorage persistence ---

    // Persist the FK breadcrumb trail to localStorage so it survives page
    // refreshes.  We store the S.navHistory array plus the current table
    // name so the breadcrumb can be fully reconstructed.  Writing is
    // wrapped in try/catch because localStorage can throw when storage is
    // full or disabled by browser policy.
export function saveNavHistory() {
      try {
        localStorage.setItem(S.NAV_HISTORY_KEY, JSON.stringify({
          history: S.navHistory,
          currentTable: S.currentTableName
        }));
      } catch (e) { /* localStorage full or disabled -- degrade silently */ }
    }

    // Restore the FK breadcrumb trail from localStorage.  Returns the
    // saved currentTable name (or null) so the caller can decide whether
    // to load that table.  Validates every entry in the array to guard
    // against corrupt or hand-edited storage values.
export function loadNavHistory() {
      try {
        var raw = localStorage.getItem(S.NAV_HISTORY_KEY);
        if (!raw) return null;
        var data = JSON.parse(raw);
        if (!data || !Array.isArray(data.history)) return null;

        // Rebuild S.navHistory from validated entries only.  Each entry
        // must have a non-empty table name; offset and filter are
        // optional and default to safe values.
        S.navHistory.length = 0;
        data.history.forEach(function(h) {
          if (h && typeof h.table === 'string' && h.table.trim() !== '') {
            S.navHistory.push({
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
export function clearNavHistory() {
      S.navHistory.length = 0;
      try { localStorage.removeItem(S.NAV_HISTORY_KEY); } catch (e) {}
    }
