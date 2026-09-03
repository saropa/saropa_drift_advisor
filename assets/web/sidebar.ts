/**
 * Sidebar panel collapse/expand — self-contained UI controller.
 *
 * Exports toggleSidebarCollapsed() so the toolbar can call it
 * without needing to know about internal DOM references.
 */
import * as S from './state.ts';
import { safeGetItem, safeSetItem, safeRemoveItem } from './storage.ts';

// Module-level refs resolved once in init.
let layout: HTMLElement | null = null;
let aside: HTMLElement | null = null;

/** Applies the collapsed/visible state to the left sidebar. */
function applyAppSidebarCollapsed(collapsed: boolean): void {
  if (!layout || !aside) return;
  layout.classList.toggle('app-sidebar-panel-collapsed', collapsed);
  aside.setAttribute('aria-hidden', collapsed ? 'true' : 'false');
}

/** Toggles the left sidebar collapsed state and persists to localStorage. */
export function toggleSidebarCollapsed(): void {
  if (!layout) return;
  var collapsed = !layout.classList.contains('app-sidebar-panel-collapsed');
  applyAppSidebarCollapsed(collapsed);
  safeSetItem(S.APP_SIDEBAR_PANEL_KEY, collapsed ? '1' : '0');
}

/** Initializes sidebar: restores persisted state, wires Tables heading toggle. */
export function initSidebarCollapse(): void {
  layout = document.getElementById('app-layout');
  aside = document.getElementById('app-sidebar');
  if (!layout || !aside) return;

  // Restore persisted collapsed state.
  // Restore persisted collapsed state.
  var storedCollapsed = safeGetItem(S.APP_SIDEBAR_PANEL_KEY) === '1';
  applyAppSidebarCollapsed(storedCollapsed);

  // Clean up legacy key from older versions.
  safeRemoveItem('saropa_sidebar_tables_collapsed');
}
