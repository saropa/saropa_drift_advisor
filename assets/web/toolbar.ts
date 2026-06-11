/**
 * Toolbar — wires the inline icon buttons in the tab bar row.
 *
 * Handles:
 * - Tool launcher icons (data-tool → openTool)
 * - Active tool highlighting (syncs with current tab)
 * - Left sidebar toggle (#tb-sidebar-toggle)
 * - Right history sidebar toggle (#tb-history-toggle)
 * - Mask PII toggle (#tb-mask-toggle + #tb-mask-checkbox)
 * - Theme flyout (#tb-theme-trigger + #tb-theme-flyout)
 * - Share button (#tb-share-btn)
 * - Density toggle: clicking bare toolbar whitespace (not an icon) switches
 *   between icon-only and icon+label ("labeled") modes.
 */
import { openTool } from './tabs.ts';
import { toggleSidebarCollapsed } from './sidebar.ts';
import { togglePanelCollapsed as toggleHistoryCollapsed } from './history-sidebar.ts';
import { applyTheme } from './theme.ts';
import * as S from './state.ts';

/** Initializes toolbar icon buttons. Call once from app.js. */
export function initToolbar(): void {
  // --- Density toggle: icon-only vs icon+label ---
  // Clicking the toolbar's bare whitespace (the strip itself, a divider, or
  // the flex spacer — anything that is NOT an icon button or the theme
  // flyout) flips between the default icon-only layout and a "labeled" layout
  // that shows each button's short title in a dim bounding box. We gate on
  // closest('.tb-icon-btn, .tb-flyout') so a real button click still runs its
  // own action without also toggling density.
  var toolbar = document.getElementById('toolbar-bar');
  if (toolbar) {
    // Restore the persisted density before wiring the toggle so the initial
    // paint matches the user's last choice. localStorage reads can throw in
    // private-mode / restricted webview contexts, so guard like sidebar.ts.
    try {
      if (localStorage.getItem(S.TOOLBAR_LABELS_KEY) === '1') {
        toolbar.classList.add('tb-labeled');
      }
    } catch (e) {
      /* localStorage unavailable — fall back to default icon-only mode */
    }
    toolbar.addEventListener('click', function (e: Event) {
      var hitButton = (e.target as HTMLElement).closest('.tb-icon-btn, .tb-flyout');
      if (hitButton) return; // real control click — let its own handler run
      var labeled = toolbar!.classList.toggle('tb-labeled');
      try {
        localStorage.setItem(S.TOOLBAR_LABELS_KEY, labeled ? '1' : '0');
      } catch (e) {
        /* localStorage unavailable — density still toggles for this session */
      }
    });
  }

  // --- Tool launcher icons ---
  document.querySelectorAll('.tb-icon-btn[data-tool]').forEach(function (btn) {
    var toolId = btn.getAttribute('data-tool');
    if (toolId) {
      btn.addEventListener('click', function () {
        openTool(toolId!);
      });
    }
  });

  // --- Active tool highlighting: sync toolbar icons with active tab.
  //     app.js wires window.onTabSwitch which calls this. ---
  (window as any)._toolbarSyncActiveTab = function (tabId: string) {
    document.querySelectorAll('.tb-icon-btn[data-tool]').forEach(function (btn) {
      var isActive = btn.getAttribute('data-tool') === tabId;
      btn.classList.toggle('active', isActive);
    });
  };

  // --- Left sidebar toggle ---
  var sidebarBtn = document.getElementById('tb-sidebar-toggle');
  if (sidebarBtn) {
    sidebarBtn.addEventListener('click', function () {
      toggleSidebarCollapsed();
      // Sync aria-pressed with the sidebar state.
      var layout = document.getElementById('app-layout');
      var collapsed = layout ? layout.classList.contains('app-sidebar-panel-collapsed') : false;
      sidebarBtn!.setAttribute('aria-pressed', collapsed ? 'false' : 'true');
      if (typeof (window as any)._syncHomeSidebarToggles === 'function') (window as any)._syncHomeSidebarToggles();
    });
  }

  // --- Right history sidebar toggle ---
  var historyBtn = document.getElementById('tb-history-toggle');
  if (historyBtn) {
    historyBtn.addEventListener('click', function () {
      toggleHistoryCollapsed();
      // Sync aria-pressed with the sidebar state.
      var layout = document.getElementById('app-layout');
      var collapsed = layout ? layout.classList.contains('history-sidebar-collapsed') : false;
      historyBtn!.setAttribute('aria-pressed', collapsed ? 'false' : 'true');
      if (typeof (window as any)._syncHomeSidebarToggles === 'function') (window as any)._syncHomeSidebarToggles();
    });
  }

  // --- Mask PII toggle ---
  var maskBtn = document.getElementById('tb-mask-toggle');
  var maskCb = document.getElementById('tb-mask-checkbox') as HTMLInputElement | null;
  if (maskBtn && maskCb) {
    maskBtn.addEventListener('click', function () {
      // Toggle the hidden checkbox, then fire its change event
      // so the existing PII mask logic in table-view.ts picks it up.
      maskCb!.checked = !maskCb!.checked;
      maskCb!.dispatchEvent(new Event('change'));
      maskBtn!.setAttribute('aria-pressed', maskCb!.checked ? 'true' : 'false');
    });
  }

  // --- Theme flyout ---
  var themeTrigger = document.getElementById('tb-theme-trigger');
  var themeFlyout = document.getElementById('tb-theme-flyout');
  if (themeTrigger && themeFlyout) {
    // Toggle flyout on click.
    themeTrigger.addEventListener('click', function (e: Event) {
      e.stopPropagation();
      var isOpen = themeTrigger!.getAttribute('aria-expanded') === 'true';
      themeTrigger!.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
    });

    // Wire theme option clicks.
    themeFlyout.querySelectorAll('.tb-theme-option').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var chosen = (btn as HTMLElement).getAttribute('data-theme');
        if (chosen) {
          localStorage.setItem(S.THEME_KEY, chosen);
          applyTheme(chosen);
          // Close the flyout after selection.
          themeTrigger!.setAttribute('aria-expanded', 'false');
        }
      });
    });

    // Close flyout on outside click.
    document.addEventListener('click', function (e: Event) {
      if (themeTrigger!.getAttribute('aria-expanded') === 'true') {
        var wrap = document.getElementById('tb-theme-wrap');
        if (wrap && !wrap.contains(e.target as Node)) {
          themeTrigger!.setAttribute('aria-expanded', 'false');
        }
      }
    });

    // Close flyout on Escape.
    document.addEventListener('keydown', function (e: KeyboardEvent) {
      if (e.key === 'Escape' && themeTrigger!.getAttribute('aria-expanded') === 'true') {
        themeTrigger!.setAttribute('aria-expanded', 'false');
        themeTrigger!.focus();
      }
    });
  }

  // --- Share button ---
  // The share button's click handler is wired by session.ts
  // via the #tb-share-btn ID. No additional wiring needed here.

  // --- Sync initial sidebar button states ---
  var layout = document.getElementById('app-layout');
  if (layout && sidebarBtn) {
    var sidebarCollapsed = layout.classList.contains('app-sidebar-panel-collapsed');
    sidebarBtn.setAttribute('aria-pressed', sidebarCollapsed ? 'false' : 'true');
  }
  if (layout && historyBtn) {
    var historyCollapsed = layout.classList.contains('history-sidebar-collapsed');
    historyBtn.setAttribute('aria-pressed', historyCollapsed ? 'false' : 'true');
  }

  if (typeof (window as any)._syncHomeSidebarToggles === 'function') (window as any)._syncHomeSidebarToggles();

  // --- Sync initial active tool highlight ---
  // Highlight the toolbar button matching the initially active tab (if any).
  var activeTab = document.querySelector('.tab-btn.active');
  if (activeTab) {
    var activeToolId = activeTab.getAttribute('data-tab');
    document.querySelectorAll('.tb-icon-btn[data-tool]').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-tool') === activeToolId);
    });
  }
}
