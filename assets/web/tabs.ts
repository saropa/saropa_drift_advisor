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
 * @param {string} tabId - One of: home, tables, tbl:{name}, sql, search, snapshot, compare, index, size, perf, anomaly, import, schema, diagram
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
 * @param {boolean} [opts.prepend] - Insert at the start of the tab bar (e.g. Home recovery)
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

  // Resolve tab type: 'tbl:*' tabs share the 'tables' type; others use their own id.
  // data-tab-type drives per-type accent colors in midnight/showcase themes.
  var tabType = tabId.indexOf('tbl:') === 0 ? 'tables' : tabId;
  btn.setAttribute('data-tab-type', tabType);

  // Icon: prepend a Material Symbols icon matching the tab type
  var iconName = S.TOOL_ICONS[tabType];
  if (iconName) {
    var iconSpan = document.createElement('span');
    iconSpan.className = 'material-symbols-outlined tab-icon';
    iconSpan.setAttribute('aria-hidden', 'true');
    iconSpan.textContent = iconName;
    btn.appendChild(iconSpan);
  }

  // Label: optionally wrap in a span for CSS truncation of long names
  if (opts && opts.truncateLabel) {
    var nameSpan = document.createElement('span');
    nameSpan.className = 'tab-btn-label';
    nameSpan.textContent = label;
    nameSpan.title = label; // full name on hover
    btn.appendChild(nameSpan);
  } else {
    // Use a text node instead of textContent to avoid overwriting the icon span
    btn.appendChild(document.createTextNode(label));
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

  // Double-click to close all other closeable tabs
  btn.addEventListener('dblclick', function() { closeOtherTabs(tabId); });

  if (opts && opts.prepend) {
    tabBar.insertBefore(btn, tabBar.firstChild);
  } else {
    tabBar.appendChild(btn);
  }
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
 * Closes every closeable tab except the one identified by `keepTabId`.
 * Prompts the user for confirmation before proceeding.
 * If the active tab is among those closed, switches to `keepTabId`.
 * @param {string} keepTabId - The tab to keep open (the one that was double-clicked)
 */
export function closeOtherTabs(keepTabId) {
  var tabBar = document.getElementById('tab-bar');
  if (!tabBar) return;

  // Collect closeable tabs that are not the one being kept
  var toClose: string[] = [];
  tabBar.querySelectorAll('.tab-btn').forEach(function(btn) {
    var id = btn.getAttribute('data-tab');
    if (id && id !== keepTabId && btn.querySelector('.tab-btn-close')) {
      toClose.push(id);
    }
  });

  if (toClose.length === 0) return;

  // Confirm before bulk-closing
  if (!window.confirm('Close ' + toClose.length + ' other tab' + (toClose.length > 1 ? 's' : '') + '?')) return;

  toClose.forEach(function(id) { closeToolTab(id); });

  // If the kept tab isn't already active, switch to it
  if (S.activeTabId !== keepTabId) switchTab(keepTabId);
}

/**
 * Closes a tool or table tab. If the bar becomes empty, opens Home again.
 * If the closed tab was active, switches to the last remaining tab.
 * For table tabs (tbl:*), also removes from the S.openTableTabs tracking array.
 */
export function closeToolTab(toolId) {
  var btn = findTabBtn(toolId);
  if (!btn) return;
  var wasActive = S.activeTabId === toolId;
  btn.remove();

  // Remove from S.openTableTabs if it's a table tab
  if (toolId.indexOf('tbl:') === 0) {
    var tableName = toolId.slice(4);
    var idx = S.openTableTabs.indexOf(tableName);
    if (idx >= 0) S.openTableTabs.splice(idx, 1);
  }

  var tabBar = document.getElementById('tab-bar');
  var remaining = tabBar ? tabBar.querySelectorAll('.tab-btn') : [];
  if (remaining.length === 0) {
    createClosableTab('home', S.TOOL_LABELS.home || 'Home', 'panel-home', { prepend: true });
    switchTab('home');
    return;
  }
  if (wasActive) {
    var last = remaining[remaining.length - 1];
    var nextId = last.getAttribute('data-tab');
    if (nextId) switchTab(nextId);
  }
}

/** Binds tab bar click handlers. Call once when DOM is ready.
 *  Tool launcher buttons are in the toolbar and wired
 *  by initToolbar() in toolbar.ts. */
export function initTabsAndToolbar() {
  document.querySelectorAll('#tab-bar .tab-btn').forEach(function(btn) {
    var tabId = btn.getAttribute('data-tab');
    if (tabId && !btn.querySelector('.tab-btn-close')) {
      btn.addEventListener('click', function() { switchTab(tabId); });
    }
    // Double-click any tab (including permanent ones) to close all other closeable tabs
    if (tabId) {
      btn.addEventListener('dblclick', function() { closeOtherTabs(tabId); });
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
