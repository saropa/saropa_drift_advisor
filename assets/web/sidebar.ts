/**
 * Sidebar panel collapse/expand — self-contained UI controller.
 */
import * as S from './state.ts';

/** Initialises the sidebar collapse toggle (hamburger menu button + Tables heading). */
export function initSidebarCollapse(): void {
  var layout = document.getElementById('app-layout');
  var aside = document.getElementById('app-sidebar');
  /* Sidebar toggle moved from FAB to hamburger menu. */
  var menuBtn = document.getElementById('hamburger-sidebar-toggle');
  var menuIcon = document.getElementById('hamburger-sidebar-icon');
  var menuLabel = document.getElementById('hamburger-sidebar-label');
  var tablesToggle = document.getElementById('tables-heading-toggle');
  if (!layout || !aside) return;

  function applyAppSidebarCollapsed(collapsed) {
    layout.classList.toggle('app-sidebar-panel-collapsed', collapsed);
    aside.setAttribute('aria-hidden', collapsed ? 'true' : 'false');
    var label = collapsed ? 'Show tables sidebar' : 'Hide tables sidebar';
    if (menuBtn) {
      menuBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      menuBtn.setAttribute('aria-label', label);
      menuBtn.title = label;
    }
    if (menuIcon) menuIcon.textContent = collapsed ? 'chevron_right' : 'chevron_left';
    if (menuLabel) menuLabel.textContent = collapsed ? 'Show Sidebar' : 'Hide Sidebar';
    if (tablesToggle) {
      tablesToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    }
  }

  function toggleSidebarCollapsed() {
    var collapsed = !layout.classList.contains('app-sidebar-panel-collapsed');
    applyAppSidebarCollapsed(collapsed);
    try { localStorage.setItem(S.APP_SIDEBAR_PANEL_KEY, collapsed ? '1' : '0'); }
    catch (e) { /* localStorage unavailable */ }
  }

  var storedCollapsed = false;
  try { storedCollapsed = localStorage.getItem(S.APP_SIDEBAR_PANEL_KEY) === '1'; }
  catch (e) { /* localStorage unavailable */ }
  applyAppSidebarCollapsed(storedCollapsed);

  try { localStorage.removeItem('saropa_sidebar_tables_collapsed'); }
  catch (e) { /* ignore */ }

  if (menuBtn) menuBtn.addEventListener('click', toggleSidebarCollapsed);
  if (tablesToggle) tablesToggle.addEventListener('click', toggleSidebarCollapsed);
}
