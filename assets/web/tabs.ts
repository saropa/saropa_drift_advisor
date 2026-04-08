/**
 * Tabs module: tab bar switching, closeable tab creation, tool/table tab
 * management, and toolbar initialisation.
 *
 * Extracted from app.js — function bodies are unchanged.
 */
import * as S from './state.ts';

// TODO: cross-module imports — these functions live in modules still being
// extracted or remaining in app.js. Listed here for future wiring.
// saveTableState, restoreTableState come from persistence.ts (already extracted)
import { saveTableState } from './persistence.ts';

// TODO: loadTable is in table-list.ts (cross-module call)
import { loadTable } from './table-list.ts';

/**
 * Switches the main content area to the given tab.
 * Table-specific tabs use the 'tbl:' prefix (e.g. 'tbl:users') and share
 * the #panel-tables panel. The "tables" tab shows a browse-all list;
 * 'tbl:{name}' tabs show that table's data in the shared content area.
 * @param {string} tabId - One of: tables, tbl:{name}, sql, search, snapshot, compare, index, size, perf, anomaly, import, schema, diagram
 */
export function switchTab(tabId) {
  var tabBar = document.getElementById('tab-bar');
  var panels = document.getElementById('tab-panels');
  if (!tabBar || !panels) return;

  // Save state for the previously active table tab before switching away
  var prevIsTable = S.activeTabId.indexOf('tbl:') === 0;
  if (prevIsTable && S.currentTableName) {
    saveTableState(S.currentTableName);
  }

  S.setActiveTabId(tabId);

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
    //    guard `if (S.currentTableName !== name) return` prevents
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
export function findTabBtn(tabId) {
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
export function createClosableTab(tabId: any, label: any, ariaControls: any, opts?: any) {
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
export function openTool(toolId) {
  var existing = findTabBtn(toolId);
  if (!existing) {
    createClosableTab(toolId, S.TOOL_LABELS[toolId] || toolId, 'panel-' + toolId);
  }
  switchTab(toolId);
}

/**
 * Closes a tool or table tab and switches to the Tables browse tab
 * if the closed tab was the active one. For table tabs (tbl:*),
 * also removes from the S.openTableTabs tracking array.
 */
export function closeToolTab(toolId) {
  var btn = findTabBtn(toolId);
  if (!btn) return;
  btn.remove();

  // Remove from S.openTableTabs if it's a table tab
  if (toolId.indexOf('tbl:') === 0) {
    var tableName = toolId.slice(4);
    var idx = S.openTableTabs.indexOf(tableName);
    if (idx >= 0) S.openTableTabs.splice(idx, 1);
  }

  if (S.activeTabId === toolId) {
    // Prefer switching to the Tables browse tab when closing the active tab
    switchTab('tables');
  }
}

/** Binds tools toolbar and tab bar. Call once when DOM is ready. */
export function initTabsAndToolbar() {
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

/**
 * Opens a table in its own closeable tab. If a tab for this table
 * already exists, switches to it instead of creating a duplicate.
 * Both sidebar links and browse-panel cards call this function.
 * @param {string} name - The table name to open
 */
export function openTableTab(name) {
  var tabId = 'tbl:' + name;
  var existing = findTabBtn(tabId);

  if (!existing) {
    // Create a closeable tab for this table (shares #panel-tables)
    createClosableTab(tabId, name, 'panel-tables', { truncateLabel: true });
    S.openTableTabs.push(name);
  }

  // Switch to this table's tab (loads data if needed)
  switchTab(tabId);
}
