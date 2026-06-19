/**
 * Single swappable sidebar — VS Code model.
 *
 * The left sidebar (#app-sidebar) hosts several panels (Tables, Search,
 * History, and later Ask) but shows exactly ONE at a time, chosen by the
 * activity-bar icons. This module is the single source of truth for "which
 * panel is active" and "is the sidebar collapsed", replacing the old pair of
 * independent left/right sidebar toggles.
 *
 * Behavior:
 * - clicking a panel's activity-bar icon shows that panel (and expands the
 *   sidebar if it was collapsed);
 * - clicking the icon of the already-active panel collapses the sidebar
 *   (VS Code's click-active-to-hide);
 * - active panel + collapsed flag persist in one localStorage entry.
 *
 * Visibility itself is pure CSS driven by `data-active-panel` on #app-sidebar
 * (see _sidebar.scss); this module only flips that attribute + the collapse
 * class and keeps the icons' pressed state in sync.
 */

// One combined entry so a reload restores both which panel and whether it was
// hidden. JSON (not two keys) keeps the two facts atomic.
const PANEL_KEY = 'saropa_sidebar_panel';
const COLLAPSED_CLASS = 'app-sidebar-panel-collapsed';

let sidebar: HTMLElement | null = null;
let layout: HTMLElement | null = null;

function persist(panel: string, collapsed: boolean): void {
  try {
    localStorage.setItem(PANEL_KEY, JSON.stringify({ panel: panel, collapsed: collapsed }));
  } catch (e) {
    /* localStorage unavailable (private mode / restricted webview) */
  }
}

/** Reflects active panel + collapsed state onto the activity-bar icons. */
function syncIcons(): void {
  if (!sidebar || !layout) return;
  const active = sidebar.getAttribute('data-active-panel');
  const collapsed = layout.classList.contains(COLLAPSED_CLASS);
  document.querySelectorAll('[data-panel-btn]').forEach(function (btn) {
    // An icon reads "pressed" only when its panel is the visible one — a
    // collapsed sidebar means no panel is showing, so none are pressed.
    const on = btn.getAttribute('data-panel-btn') === active && !collapsed;
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.classList.toggle('active', on);
  });
}

/** Shows [name] and expands the sidebar if it was collapsed. */
export function selectPanel(name: string): void {
  if (!sidebar || !layout) return;
  sidebar.setAttribute('data-active-panel', name);
  layout.classList.remove(COLLAPSED_CLASS);
  sidebar.setAttribute('aria-hidden', 'false');
  persist(name, false);
  syncIcons();
}

/**
 * Sets the collapsed (hidden) state of the sidebar without changing which panel
 * is active. Shared by the panel-icon click-to-hide, the keyboard/header path,
 * and the resize bar (sidebar-resize.ts) so all three keep the persisted flag,
 * the layout class, and the icon state in agreement.
 */
export function setSidebarCollapsed(collapsed: boolean): void {
  if (!sidebar || !layout) return;
  layout.classList.toggle(COLLAPSED_CLASS, collapsed);
  sidebar.setAttribute('aria-hidden', collapsed ? 'true' : 'false');
  persist(sidebar.getAttribute('data-active-panel') || 'tables', collapsed);
  syncIcons();
}

/** True when the sidebar is currently collapsed (hidden). */
export function isSidebarCollapsed(): boolean {
  return !!layout && layout.classList.contains(COLLAPSED_CLASS);
}

/**
 * Click handler for a panel icon: switch to it, OR collapse the sidebar if it
 * is already the visible panel (VS Code click-active-to-hide).
 */
export function togglePanel(name: string): void {
  if (!sidebar || !layout) return;
  const isActive = sidebar.getAttribute('data-active-panel') === name;
  const collapsed = layout.classList.contains(COLLAPSED_CLASS);
  if (isActive && !collapsed) {
    setSidebarCollapsed(true);
    return;
  }
  selectPanel(name);
}

/** Collapses/expands the current panel without changing which panel is active. */
export function toggleSidebarCollapsed(): void {
  setSidebarCollapsed(!isSidebarCollapsed());
}

/** Restores persisted state and wires the activity-bar panel icons. */
export function initSidebarPanels(): void {
  sidebar = document.getElementById('app-sidebar');
  layout = document.getElementById('app-layout');
  if (!sidebar || !layout) return;

  // The Ask (NL) panel is authored next to the SQL runner for editing
  // convenience; relocate it into the sidebar so it becomes a swappable panel
  // alongside Tables / Search / History (must be a direct child for the
  // data-active-panel CSS to show/hide it).
  const ask = document.getElementById('sidebar-ask');
  if (ask && ask.parentElement !== sidebar) sidebar.appendChild(ask);

  // Restore { panel, collapsed }; default to Tables, expanded.
  let panel = 'tables';
  let collapsed = false;
  try {
    const raw = localStorage.getItem(PANEL_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.panel === 'string') panel = parsed.panel;
      collapsed = !!(parsed && parsed.collapsed);
    }
  } catch (e) {
    /* malformed / unavailable — keep defaults */
  }
  sidebar.setAttribute('data-active-panel', panel);
  layout.classList.toggle(COLLAPSED_CLASS, collapsed);
  sidebar.setAttribute('aria-hidden', collapsed ? 'true' : 'false');

  // Each activity-bar panel icon carries data-panel-btn="<name>".
  document.querySelectorAll('[data-panel-btn]').forEach(function (btn) {
    const name = btn.getAttribute('data-panel-btn');
    if (name) btn.addEventListener('click', function () { togglePanel(name); });
  });

  syncIcons();
}
