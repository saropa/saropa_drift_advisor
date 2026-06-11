/**
 * Home tab — launcher grid for every primary tool plus Mask / Theme / Share,
 * and sidebar visibility switches (tables left, history right).
 */
import * as S from './state.ts';
import { openTool } from './tabs.ts';
import { togglePanel } from './sidebar-panels.ts';

/**
 * Reflects the single sidebar's state onto the two Home switches. With one
 * swappable sidebar, a switch reads "on" only when its panel is the visible
 * one (active AND not collapsed) — so the pair behaves like a radio: showing
 * Tables turns History off, and collapsing turns both off.
 */
function syncSidebarTogglesFromLayout(): void {
  var layout = document.getElementById('app-layout');
  var sidebar = document.getElementById('app-sidebar');
  var tablesSw = document.getElementById('home-switch-tables');
  var historySw = document.getElementById('home-switch-history');
  if (!layout || !sidebar) return;
  var collapsed = layout.classList.contains('app-sidebar-panel-collapsed');
  var active = sidebar.getAttribute('data-active-panel');
  var tablesOn = !collapsed && active === 'tables';
  var historyOn = !collapsed && active === 'history';
  if (tablesSw) {
    tablesSw.setAttribute('aria-checked', tablesOn ? 'true' : 'false');
    tablesSw.classList.toggle('home-switch-on', tablesOn);
  }
  if (historySw) {
    historySw.setAttribute('aria-checked', historyOn ? 'true' : 'false');
    historySw.classList.toggle('home-switch-on', historyOn);
  }
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
  wireHomeSwitch('home-switch-tables', function () { togglePanel('tables'); });
  wireHomeSwitch('home-switch-history', function () { togglePanel('history'); });
  syncSidebarTogglesFromLayout();
  (window as unknown as { _syncHomeSidebarToggles?: () => void })._syncHomeSidebarToggles =
    syncSidebarTogglesFromLayout;
}
