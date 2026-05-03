/**
 * Table-list module: sidebar table list rendering, table loading,
 * browse-all grid, generation polling, and live-refresh logic.
 *
 * Extracted from app.js — function bodies are unchanged.
 */
import * as S from './state.ts';
import { esc, formatTableRowCountDisplay } from './utils.ts';
import { getPinnedTables, setPinnedTables, togglePinTable, saveTableState, restoreTableState } from './persistence.ts';
import { getScope } from './search.ts';
import { setConnected, setDisconnected, updateLiveIndicatorForConnection, startHeartbeat } from './connection.ts';

// TODO: cross-module imports from the other two new modules
import { renderTableView } from './table-view.ts';
import { openTableTab, closeToolTab } from './tabs.ts';

import { setupPagination, updatePaginationBar } from './pagination.ts';

export function rowCountText(name) {
  const total = S.tableCounts[name];
  const len = (S.currentTableJson && S.currentTableJson.length) || 0;
  if (total == null) return esc(name) + ' (up to ' + S.limit + ' rows)';
  const rangeText = len > 0 ? ('showing ' + (S.offset + 1) + '–' + (S.offset + len)) : 'no rows in this range';
  return esc(name) + ' (' + total + ' row' + (total !== 1 ? 's' : '') + '; ' + rangeText + ')';
}

/** Updates which table link has .active in the sidebar (UI redesign: current table highlight). */
export function updateTableListActive() {
  var name = S.currentTableName;
  var ul = document.getElementById('tables');
  if (!ul) return;
  var targetHash = name ? '#' + encodeURIComponent(name) : '';
  ul.querySelectorAll('a.table-link').forEach(function(a) {
    a.classList.toggle('active', a.getAttribute('href') === targetHash);
  });
}

export function loadTable(name) {
  if (S.currentTableName && S.currentTableName !== name) {
    saveTableState(S.currentTableName);
  }
  var isNewTable = (S.currentTableName !== name);
  S.setCurrentTableName(name);
  updateTableListActive();
  // Keep Search tab dropdown in sync with the sidebar table selection
  if (typeof window._stSyncTable === 'function') window._stSyncTable(name);
  if (isNewTable) restoreTableState(name);
  const content = document.getElementById('content');
  const scope = getScope();
  if (scope === 'both' && S.cachedSchema !== null) {
    content.innerHTML = '<p class="meta">Loading ' + esc(name) + '…</p>';
  } else if (scope !== 'both') {
    content.innerHTML = '<p class="meta">' + esc(name) + '</p><p class="meta">Loading…</p>';
  }
  fetch('/api/table/' + encodeURIComponent(name) + '?S.limit=' + S.limit + '&S.offset=' + S.offset, S.authOpts())
    .then(r => r.json())
    .then(data => {
      if (S.currentTableName !== name) return;
      S.setCurrentTableJson(data);
      setupPagination();
      renderTableView(name, data);
      fetch('/api/table/' + encodeURIComponent(name) + '/count', S.authOpts())
        .then(r => r.json())
        .then(o => {
          if (S.currentTableName !== name) return;
          S.tableCounts[name] = o.count;
          updatePaginationBar(o.count);
          renderTableView(name, data);
        })
        .catch(() => {});
    })
    .catch(e => {
      if (S.currentTableName !== name) return;
      content.innerHTML = '<p class="meta">Error</p><pre>' + esc(String(e)) + '</pre>';
    });
}

export function renderTableList(tables) {
  // Cache for re-renders triggered by pin/unpin toggle
  S.setLastKnownTables(tables);

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

  var countEl = document.getElementById('tables-count');
  if (countEl) {
    countEl.replaceChildren(document.createTextNode('(' + sorted.length + ')'));
  }

  sorted.forEach(function(t) {
    var isPinned = pinnedSet.has(t);
    var li = document.createElement('li');
    var a = document.createElement('a');
    a.href = '#' + encodeURIComponent(t);
    a.className = 'table-link' + (t === S.currentTableName ? ' active' : '');
    a.setAttribute('data-table', t);

    // Table name + optional count in a separate span (grey, right-aligned)
    // so the pin button and ellipsis on long names stay correct.
    var nameSpan = document.createElement('span');
    nameSpan.className = 'table-link-name';
    nameSpan.textContent = t;
    a.appendChild(nameSpan);
    if (S.tableCounts[t] != null) {
      var countSpan = document.createElement('span');
      // Empty tables get a "-zero" modifier so the SCSS can dim "(0)" — the
      // count carries no information for an empty table, so it should sit
      // back visually instead of competing with non-empty rows for attention.
      var isZero = Number(S.tableCounts[t]) === 0;
      countSpan.className = 'table-link-count' + (isZero ? ' table-link-count-zero' : '');
      countSpan.textContent = '(' + formatTableRowCountDisplay(S.tableCounts[t]) + ')';
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
    importTableSel.innerHTML = tables.map(t => '<option value="' + esc(t) + '">' + esc(t) + (S.tableCounts[t] != null ? ' (' + esc(formatTableRowCountDisplay(S.tableCounts[t])) + ')' : '') + '</option>').join('');
  }
  // Populate the Search tab's table dropdown
  if (typeof window._stPopulateTables === 'function') window._stPopulateTables(tables);

  // Update the browse-all grid in the Tables tab panel
  renderTablesBrowse(tables);
}

/**
 * Renders the browse-all table list inside the Tables tab panel.
 * Shows clickable cards with table names and row counts. Each card
 * calls openTableTab() to open the table in its own tab.
 * @param {string[]} tables - Array of table names
 */
export function renderTablesBrowse(tables) {
  var browseEl = document.getElementById('tables-browse');
  if (!browseEl) return;

  if (!tables || tables.length === 0) {
    browseEl.innerHTML = '<p class="meta">No tables found.</p>';
    return;
  }

  var html = '<div class="tables-browse-grid">';
  tables.forEach(function(t) {
    var countHtml = '';
    if (S.tableCounts[t] != null) {
      countHtml = '<span class="browse-card-count">(' + esc(formatTableRowCountDisplay(S.tableCounts[t])) + ')</span>';
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

export function applyTableListAndCounts(data) {
  // Extract tables array and counts map from the
  // response object. Graceful fallback for plain
  // array format (should not occur in practice).
  var tables = Array.isArray(data) ? data : ((data && data.tables) || []);
  var counts = (data && data.counts) ? data.counts : {};

  // Merge server-provided counts into the local
  // S.tableCounts cache so renderTableList can display
  // them immediately without additional fetches.
  Object.keys(counts).forEach(function(t) {
    S.tableCounts[t] = counts[t];

    // Update Search tab dropdown label with count
    if (typeof window._stUpdateCount === 'function') window._stUpdateCount(t, counts[t]);
  });

  // Render the sidebar list, browse cards, and
  // dropdowns. renderTableList reads from S.tableCounts
  // to display comma-separated counts (no "rows" suffix).
  renderTableList(tables);
  return tables;
}
export function refreshOnGenerationChange() {
  if (S.refreshInFlight) { console.log('[SDA] refreshOnGenerationChange: skipped (already in flight)'); return; }
  console.log('[SDA] refreshOnGenerationChange: refreshing tables + current table');
  S.setRefreshInFlight(true);
  // Show transient busy state while refreshing — only when connected,
  // to avoid overwriting the Offline indicator during a stale refresh.
  if (window.mastheadStatus && S.connectionState === 'connected') window.mastheadStatus.setBusy();
  fetch('/api/tables', S.authOpts())
    .then(function(r) { return r.json(); })
    .then(function(data) {
      // applyTableListAndCounts returns the extracted
      // tables array so we can reuse it for tab cleanup
      // and current-table reload below.
      var tables = applyTableListAndCounts(data);

      // Close tabs for tables that no longer exist (e.g. dropped/renamed).
      // Iterate a copy since closeToolTab mutates the S.openTableTabs array.
      S.openTableTabs.slice().forEach(function(name) {
        if (tables.indexOf(name) < 0) closeToolTab('tbl:' + name);
      });

      // Reload the current table only if it still exists and we're on a table tab
      if (S.currentTableName && tables.indexOf(S.currentTableName) >= 0) {
        loadTable(S.currentTableName);
      }
    })
    .catch(function() {})
    .finally(function() {
      S.setRefreshInFlight(false);
      // Restore indicator based on current connection + polling state.
      updateLiveIndicatorForConnection();
    });
}
// Long-poll /api/generation?since=N; when generation changes,
// refresh table list and current table. Enhanced with exponential
// backoff and connection state tracking for offline resilience.
export function pollGeneration() {
  console.log('[SDA] pollGeneration: since=' + S.lastGeneration);
  fetch('/api/generation?since=' + S.lastGeneration, S.authOpts())
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var g = data.generation;
      var changed = (typeof g === 'number' && g !== S.lastGeneration);
      console.log('[SDA] pollGeneration: received generation=' + g + ', changed=' + changed);
      // Successful response: mark connected, reset backoff.
      setConnected();

      if (changed) {
        // Server restart detection: if generation went backwards
        // the server restarted and data may have changed.
        if (g < S.lastGeneration) {
          console.log('[SDA] pollGeneration: generation went backwards ('
            + S.lastGeneration + ' -> ' + g
            + '). Server may have restarted.');
        }
        S.setLastGeneration(g);
        refreshOnGenerationChange();
      }
      // Continue polling immediately on success.
      pollGeneration();
    })
    .catch(function(err) {
      // Poll failed. Increment failure count and apply backoff.
      S.setConsecutivePollFailures(S.consecutivePollFailures + 1);
      console.log('[SDA] pollGeneration: FAILED, failures=' + S.consecutivePollFailures
        + ', backoff=' + S.currentBackoffMs + 'ms', err);

      // After first failure, mark disconnected to show banner.
      if (S.consecutivePollFailures >= 1 && S.connectionState === 'connected') {
        setDisconnected();
      }

      // After S.HEALTH_CHECK_THRESHOLD consecutive failures, switch
      // to lightweight /api/health heartbeat checks (the generation
      // endpoint has a 30 s server-side timeout, making it slow to
      // detect recovery).
      if (S.consecutivePollFailures >= S.HEALTH_CHECK_THRESHOLD) {
        console.log('[SDA] pollGeneration: switching to heartbeat after ' + S.consecutivePollFailures + ' failures');
        startHeartbeat();
        return;
      }

      // Exponential backoff for early failures (before switching
      // to heartbeat). Doubles each time: 1 s, 2 s, 4 s.
      S.setCurrentBackoffMs(Math.min(
        S.currentBackoffMs * S.BACKOFF_MULTIPLIER, S.BACKOFF_MAX_MS
      ));
      setTimeout(pollGeneration, S.currentBackoffMs);
    });
}
