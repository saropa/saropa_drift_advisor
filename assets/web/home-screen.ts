/**
 * Home tab — launcher grid for every primary tool plus Mask / Theme / Share,
 * and sidebar visibility switches (tables left, history right).
 */
import * as S from './state.ts';
import { openTool } from './tabs.ts';
import { toggleSidebarCollapsed } from './sidebar.ts';
import { togglePanelCollapsed } from './history-sidebar.ts';

function syncSidebarTogglesFromLayout(): void {
  var layout = document.getElementById('app-layout');
  var leftSw = document.getElementById('home-switch-tables');
  var rightSw = document.getElementById('home-switch-history');
  if (!layout) return;
  var leftCollapsed = layout.classList.contains('app-sidebar-panel-collapsed');
  var rightCollapsed = layout.classList.contains('history-sidebar-collapsed');
  var leftOn = !leftCollapsed;
  var rightOn = !rightCollapsed;
  if (leftSw) {
    leftSw.setAttribute('aria-checked', leftOn ? 'true' : 'false');
    leftSw.classList.toggle('home-switch-on', leftOn);
  }
  if (rightSw) {
    rightSw.setAttribute('aria-checked', rightOn ? 'true' : 'false');
    rightSw.classList.toggle('home-switch-on', rightOn);
  }
  var sidebarBtn = document.getElementById('tb-sidebar-toggle');
  var historyBtn = document.getElementById('tb-history-toggle');
  if (sidebarBtn) sidebarBtn.setAttribute('aria-pressed', leftOn ? 'true' : 'false');
  if (historyBtn) historyBtn.setAttribute('aria-pressed', rightOn ? 'true' : 'false');
}

function wireHomeSwitch(id: string, toggle: () => void): void {
  var el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('click', function () {
    toggle();
    syncSidebarTogglesFromLayout();
  });
}

function buildToolGrid(): void {
  var grid = document.getElementById('home-tool-grid');
  if (!grid) return;
  grid.replaceChildren();

  S.HOME_LAUNCHERS.forEach(function (item) {
    var iconName = S.TOOL_ICONS[item.id];
    var label = S.TOOL_LABELS[item.id] || item.id;
    var card = document.createElement('button');
    card.type = 'button';
    card.className = 'home-tool-card';
    card.setAttribute('data-tool', item.id);
    card.title = label + ' — ' + item.blurb;
    if (iconName) {
      var icon = document.createElement('span');
      icon.className = 'material-symbols-outlined home-tool-card-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = iconName;
      card.appendChild(icon);
    }
    var name = document.createElement('span');
    name.className = 'home-tool-card-name';
    name.textContent = label;
    card.appendChild(name);
    var blurb = document.createElement('span');
    blurb.className = 'home-tool-card-blurb';
    blurb.textContent = item.blurb;
    card.appendChild(blurb);
    card.addEventListener('click', function () {
      openTool(item.id);
    });
    grid.appendChild(card);
  });

  S.HOME_EXTRAS.forEach(function (item) {
    var card = document.createElement('button');
    card.type = 'button';
    card.className = 'home-tool-card home-tool-card-extra';
    card.setAttribute('data-home-extra', item.action);
    card.title = item.label + ' — ' + item.blurb;
    var icon = document.createElement('span');
    icon.className = 'material-symbols-outlined home-tool-card-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = item.icon;
    card.appendChild(icon);
    var name = document.createElement('span');
    name.className = 'home-tool-card-name';
    name.textContent = item.label;
    card.appendChild(name);
    var blurb = document.createElement('span');
    blurb.className = 'home-tool-card-blurb';
    blurb.textContent = item.blurb;
    card.appendChild(blurb);
    card.addEventListener('click', function () {
      if (item.action === 'mask') {
        document.getElementById('tb-mask-toggle')?.click();
        return;
      }
      if (item.action === 'theme') {
        document.getElementById('tb-theme-trigger')?.click();
        return;
      }
      if (item.action === 'share') document.getElementById('tb-share-btn')?.click();
    });
    grid.appendChild(card);
  });
}

/** Builds the launcher grid, wires sidebar switches. Call once after DOM is ready. */
export function initHomeScreen(): void {
  buildToolGrid();
  wireHomeSwitch('home-switch-tables', toggleSidebarCollapsed);
  wireHomeSwitch('home-switch-history', togglePanelCollapsed);
  syncSidebarTogglesFromLayout();
  (window as unknown as { _syncHomeSidebarToggles?: () => void })._syncHomeSidebarToggles =
    syncSidebarTogglesFromLayout;
}
