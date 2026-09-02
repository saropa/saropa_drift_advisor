/**
 * Tabs module: tab bar switching, closeable tab creation, tool/table tab
 * management, and toolbar initialisation.
 *
 * Extracted from app.js — function bodies are unchanged.
 */
import * as S from './state.ts';
import { vt } from './l10n.ts';

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
 * @param {string} tabId - One of: home, tables, tbl:{name}, sql, search, snapshot, compare, index, size, perf, anomaly, import, schema, diagram, heartbeat
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

  // Decoupled tab-change signal: standalone TS screens (e.g.
  // heartbeat-screen.ts) subscribe to this event instead of adding cases to
  // app.js's onTabSwitch monolith, so a new screen ships without touching
  // app.js. Dispatched AFTER onTabSwitch so legacy handlers run first.
  document.dispatchEvent(new CustomEvent('sda-tab-switch', { detail: tabId }));
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
 * Reports whether a tab button belongs to a closeable tab.
 *
 * BUG FIX (plans/history/2026.09/20260902/084): this used to be `btn.querySelector('.tab-btn-close')`,
 * which only worked while the close control was (invalidly) a CHILD of the
 * tab <button>. It is now a SIBLING inside the `.tab-item` wrapper, so the
 * probe runs on that wrapper. The wrapper check must be explicit: falling
 * back to `btn.parentElement` would land on #tab-bar for permanent tabs
 * (which have no wrapper) and find some OTHER tab's close button, wrongly
 * reporting every permanent tab as closeable.
 * @param {Element} btn - A `.tab-btn` element.
 * @returns {boolean}
 */
function isClosableTab(btn) {
  var wrap = btn.parentElement;
  if (!wrap || !wrap.classList.contains('tab-item')) return false;
  return !!wrap.querySelector('.tab-btn-close');
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
  // A role="tab" with no aria-selected has an undefined selected state, so AT
  // announces nothing about it. switchTab() sets the real value immediately
  // after every call site, but seed "false" here so the element is never in
  // the accessibility tree without it (e.g. if a caller builds a tab without
  // switching to it).
  btn.setAttribute('aria-selected', 'false');
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
  closeBtn.title = vt('viewer.nav.tab.close');
  closeBtn.setAttribute('aria-label', vt('viewer.nav.tab.closeNamed', label));
  closeBtn.textContent = '\u00d7';
  closeBtn.addEventListener('click', function() { closeToolTab(tabId); });

  // BUG FIX (plans/history/2026.09/20260902/084): the close button used to be appended INTO `btn`. That
  // was wrong twice over. (1) The HTML content model forbids interactive
  // content inside <button>. (2) ARIA gives the `tab` role
  // `childrenPresentational: true`, so even where a browser tolerated the
  // markup the inner control was NOT exposed — it was folded into the tab's
  // accessible name ("users x, button"), dropped, or double-announced
  // depending on the browser, and focus order differed between Chromium and
  // Firefox. Nesting can therefore never be made to work; the two controls
  // must be siblings. `.tab-item` is that sibling wrapper.
  //
  // The wrapper deliberately carries NO role.
  //
  // An earlier revision set role="presentation" here with the comment that it
  // "keeps #tab-bar (role=tablist) owning the role=tab buttons through the
  // wrapper". That reasoning was false and the attribute was a no-op:
  //   - WAI-ARIA 1.2 defines an owned element as "any DOM descendant of the
  //     element, any element specified as a child via aria-owns, or any DOM
  //     descendant of the owned child". Ownership already reaches through any
  //     intermediate box; no role is needed to make it do so.
  //   - axe-core's aria-required-children walks INTO a child (rather than
  //     counting it as an owned role) when the child has no role, no global
  //     ARIA attribute and is not focusable. axe assigns <div> no implicit
  //     role (lib/standards/html-elms.js has no implicitRole for `div`), and
  //     getRole(..., {noPresentational:true}) returns null for
  //     presentation/none. A bare <div> and a role="presentation" <div> are
  //     therefore treated IDENTICALLY. The attribute changed nothing.
  // Removing it deletes a claim that was not true rather than a behavior.
  //
  // ACCEPTED DEVIATION — why #tab-bar stays role="tablist".
  // Because ownership reaches through this wrapper, the close <button> is an
  // owned child of the tablist whatever the wrapper's role is. axe-core's
  // aria-required-children flags that ("children which are not allowed"),
  // since it treats `tablist`'s requiredOwned: ['tab'] as an allowlist. The
  // ARIA specification itself does not: 5.2.6 Required Owned Elements states
  // only that "at least one instance of one required owned element is
  // expected" — a minimum, not an exclusive list. axe is stricter than the
  // normative text here, so this is a linter finding, not a spec violation.
  //
  // The alternatives were weighed and rejected:
  //   - Wrapper with no role (this code): identical to presentation for axe;
  //     chosen because the attribute was misleading, not because it silences
  //     anything.
  //   - Move the close buttons out of the tablist entirely: each × must
  //     overlay its own tab in a horizontally scrolling bar, so it would need
  //     JS-synced absolute positioning, and Tab order would become "all tabs,
  //     then all close buttons". Not viable.
  //   - Re-role #tab-bar to `toolbar` (no requiredOwned, so axe-clean): costs
  //     every user the `tab` role, aria-selected, and the tab/tabpanel
  //     relationship, so every screen reader would hear "users, button"
  //     instead of "users, tab, selected, 3 of 7". That is a certain
  //     regression for AT users traded against a linter rule that is stricter
  //     than the spec. Rejected.
  //   - Drop the focusable close button and use the APG Tabs pattern's
  //     optional Delete key with an aria-hidden × glyph: spec-clean and
  //     axe-clean, but it removes a control sighted keyboard users can reach
  //     by Tab and hides the close affordance behind an undiscoverable
  //     shortcut. Rejected as a UX regression.
  // The trade-off taken: keep real tab semantics (the better assistive-tech
  // outcome) and accept the axe finding, rather than degrade every user's
  // announcement to satisfy it.
  //
  // Because the close button is no longer a descendant, the old
  // `e.stopPropagation()` and the `e.target !== closeBtn` guard below are
  // unnecessary: a click on the close button never reaches the tab button.
  var wrap = document.createElement('div');
  wrap.className = 'tab-item';
  wrap.appendChild(btn);
  wrap.appendChild(closeBtn);

  // Click anywhere on the tab switches to it. The close button is a sibling,
  // so its clicks no longer have to be filtered out here.
  btn.addEventListener('click', function() { switchTab(tabId); });

  // Double-click to close all other closeable tabs
  btn.addEventListener('dblclick', function() { closeOtherTabs(tabId); });

  // Insert the WRAPPER, not the button — the tab and its close control must
  // be prepended, moved, and removed as one unit.
  if (opts && opts.prepend) {
    tabBar.insertBefore(wrap, tabBar.firstChild);
  } else {
    tabBar.appendChild(wrap);
  }
  // Callers expect the tab button itself (they read data-tab and toggle
  // classes on it), so keep returning `btn` rather than the new wrapper.
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
    // Closeability is now decided by isClosableTab() — see plans/history/2026.09/20260902/084; the
    // close control moved out of the tab <button> into the .tab-item wrapper.
    if (id && id !== keepTabId && isClosableTab(btn)) {
      toClose.push(id);
    }
  });

  if (toClose.length === 0) return;

  // Confirm before bulk-closing. Singular and plural are separate l10n keys so
  // languages with non-English plural rules render correctly.
  const confirmMsg =
    toClose.length > 1
      ? vt('viewer.nav.tab.closeOthers.many', toClose.length)
      : vt('viewer.nav.tab.closeOthers.one', toClose.length);
  if (!window.confirm(confirmMsg)) return;

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
  // BUG FIX (plans/history/2026.09/20260902/084): remove the .tab-item wrapper, not just the button —
  // the close control is now a sibling inside it and would otherwise be left
  // behind in the tab bar as a stray x.
  var host = (btn.parentElement && btn.parentElement.classList.contains('tab-item'))
    ? btn.parentElement
    : btn;
  host.remove();

  // Remove from S.openTableTabs if it's a table tab
  if (toolId.indexOf('tbl:') === 0) {
    var tableName = toolId.slice(4);
    var idx = S.openTableTabs.indexOf(tableName);
    if (idx >= 0) S.openTableTabs.splice(idx, 1);
  }

  var tabBar = document.getElementById('tab-bar');
  var remaining = tabBar ? tabBar.querySelectorAll('.tab-btn') : [];
  if (remaining.length === 0) {
    createClosableTab('home', S.TOOL_LABELS.home || vt('viewer.nav.tab.home'), 'panel-home', { prepend: true });
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
    // Only permanent (non-closeable) tabs need a click handler wired here;
    // closeable tabs wire their own inside createClosableTab(). The test goes
    // through isClosableTab() because the close control is no longer a child
    // of the tab <button> (plans/history/2026.09/20260902/084).
    if (tabId && !isClosableTab(btn)) {
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
