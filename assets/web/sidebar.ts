/**
 * Sidebar panel collapse/expand — self-contained UI controller.
 *
 * Exports toggleSidebarCollapsed() so the toolbar can call it
 * without needing to know about internal DOM references.
 */
import * as S from './state.ts';

// Module-level refs resolved once in init.
let layout: HTMLElement | null = null;
let aside: HTMLElement | null = null;

/** Applies the collapsed/visible state to the left sidebar. */
function applyAppSidebarCollapsed(collapsed: boolean): void {
  if (!layout || !aside) return;
  layout.classList.toggle('app-sidebar-panel-collapsed', collapsed);
  aside.setAttribute('aria-hidden', collapsed ? 'true' : 'false');
  // Tables heading toggle (inside sidebar) tracks expansion state.
  var tablesToggle = document.getElementById('tables-heading-toggle');
  if (tablesToggle) {
    tablesToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  }
}

/** Toggles the left sidebar collapsed state and persists to localStorage. */
export function toggleSidebarCollapsed(): void {
  if (!layout) return;
  var collapsed = !layout.classList.contains('app-sidebar-panel-collapsed');
  applyAppSidebarCollapsed(collapsed);
  try { localStorage.setItem(S.APP_SIDEBAR_PANEL_KEY, collapsed ? '1' : '0'); }
  catch (e) { /* localStorage unavailable */ }
}

/** Initializes sidebar: restores persisted state, wires Tables heading toggle. */
export function initSidebarCollapse(): void {
  layout = document.getElementById('app-layout');
  aside = document.getElementById('app-sidebar');
  var tablesToggle = document.getElementById('tables-heading-toggle');
  if (!layout || !aside) return;

  // Restore persisted collapsed state.
  var storedCollapsed = false;
  try { storedCollapsed = localStorage.getItem(S.APP_SIDEBAR_PANEL_KEY) === '1'; }
  catch (e) { /* localStorage unavailable */ }
  applyAppSidebarCollapsed(storedCollapsed);

  // Clean up legacy key from older versions.
  try { localStorage.removeItem('saropa_sidebar_tables_collapsed'); }
  catch (e) { /* ignore */ }

  // Tables heading button inside the sidebar also toggles collapse.
  if (tablesToggle) tablesToggle.addEventListener('click', toggleSidebarCollapsed);
}
