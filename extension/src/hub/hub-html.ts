/**
 * HTML for the Saropa Drift Tools Hub — one composed document that shows the
 * Dashboard and Health Score panes side by side and indexes every other tool in
 * a grouped, collapsible launcher, plus a link to the Saropa website.
 *
 * Composition model (see the saropa_lints "Dashboards Hub" spec this mirrors):
 * each pane is a READ-ONLY snapshot of its engine's real markup + data, NOT the
 * live interactive panel. That is the key simplification — because the panes
 * carry no engine scripts, only the hub's own script calls `acquireVsCodeApi()`,
 * so the "acquire-once-per-document" hazard never arises and no API shim is
 * needed. The remaining hazard, CSS collision on shared selectors, is handled by
 * scoping each pane's stylesheet under `.pane-health` / `.pane-dashboard` (see
 * webview-scope-css.ts). Editing/actions live on the standalone panels, reached
 * via each pane's "Open full screen" button.
 *
 * The launcher uses native `<details>` for collapsible category sections — no
 * script needed for expand/collapse, and it stays accessible. `buildHubDocument`
 * takes no webview argument so the composition contract is unit-testable
 * directly: both panes present, pane styles scoped, exactly one script.
 */

import { t } from '../l10n';
import { hubIcon } from './hub-icons';
import { hubChromeCss } from './hub-css';
import { HUB_GROUPS, type HubGroup, type HubTile } from './hub-tiles';

/** A composed pane: either its rendered snapshot, or a failed placeholder. */
export type PaneRender =
  | { ok: true; body: string; style: string }
  | { ok: false };

/** Pane body: rendered snapshot, or the failed placeholder when its scan died. */
function paneBody(pane: PaneRender, scopeClass: string): string {
  const inner = pane.ok
    ? pane.body
    : `<div class="pane-failed">${t('panel.hub.pane.failed')}</div>`;
  return `<div class="pane-body ${scopeClass}">${inner}</div>`;
}

/** One pane card: titled head (icon + full-screen button) then the body. */
function paneCard(opts: {
  titleKey: string;
  icon: string;
  fullCmd: string;
  scopeClass: string;
  pane: PaneRender;
}): string {
  return `<section class="dash-pane">
  <div class="pane-head">
    <span class="pane-title">${hubIcon(opts.icon)}<h2>${t(opts.titleKey)}</h2></span>
    <button class="hub-btn" data-hub-cmd="runCommand" data-cmd-id="${opts.fullCmd}">${t('panel.hub.btn.openFull')}</button>
  </div>
  ${paneBody(opts.pane, opts.scopeClass)}
</section>`;
}

/** A single launcher tile (icon + label), with a caution accent if destructive. */
function tile(t0: HubTile): string {
  const cls = t0.danger ? 'launcher-tile danger' : 'launcher-tile';
  return `<button class="${cls}" data-hub-cmd="runCommand" data-cmd-id="${t0.id}">
    <span class="tile-icon">${hubIcon(t0.icon)}</span><span class="tile-label">${t(t0.labelKey)}</span>
  </button>`;
}

/** One collapsible category: header (icon, title, count, guidance) + tile grid. */
function group(g: HubGroup): string {
  const tiles = g.tiles.map(tile).join('\n');
  return `<details class="hub-group" open>
  <summary>
    <span class="group-chevron">${hubIcon('chevron')}</span>
    <span class="group-icon">${hubIcon(g.icon)}</span>
    <span class="group-title">${t(g.titleKey)}</span>
    <span class="group-count">${g.tiles.length}</span>
    <span class="group-desc">${t(g.descKey)}</span>
  </summary>
  <div class="group-body"><div class="launcher-grid">${tiles}</div></div>
</details>`;
}

/** The full "All tools" section: guidance note + every grouped category. */
function launcherSection(): string {
  const groups = HUB_GROUPS.map(group).join('\n');
  return `<section class="hub-launchers">
  <h2>${t('panel.hub.launchers.title')}</h2>
  <div class="hub-note"><span class="note-icon">${hubIcon('info')}</span><span>${t('panel.hub.note.intro')}</span></div>
  ${groups}
</section>`;
}

/**
 * Hero band: title/subtitle plus Rescan, Open-database-browser (the primary
 * action — opens the live web viewer at http://host:port, the thing users
 * most often want and previously could not find), and Open-website actions.
 */
function hero(): string {
  return `<div class="hub-hero">
  <div>
    <h1>${t('panel.hub.title')}</h1>
    <p>${t('panel.hub.subtitle')}</p>
  </div>
  <div class="hub-hero-actions">
    <button class="hub-btn" data-hub-cmd="rescan"><span class="btn-icon">${hubIcon('rotateCcw')}</span>${t('panel.hub.btn.rescan')}</button>
    <button class="hub-btn primary" data-hub-cmd="runCommand" data-cmd-id="driftViewer.openInBrowser"><span class="btn-icon">${hubIcon('database')}</span>${t('panel.hub.btn.browser')}</button>
    <button class="hub-btn" data-hub-cmd="openWebsite">${t('panel.hub.btn.website')}</button>
  </div>
</div>`;
}

/**
 * Single delegated click handler. The hub owns the ONLY script in the document
 * (no engine scripts), so it acquires the VS Code API once and routes every
 * click by `data-hub-cmd`, plus the Health pane's own drill-down attributes
 * (`data-action-command` / `data-command`) that the embedded cards still carry.
 */
function hubScript(): string {
  return `(function(){
  var vscode = acquireVsCodeApi();
  document.addEventListener('click', function(e){
    var hub = e.target.closest('[data-hub-cmd]');
    if (hub) {
      var cmd = hub.getAttribute('data-hub-cmd');
      if (cmd === 'runCommand') { vscode.postMessage({ command: 'runCommand', id: hub.getAttribute('data-cmd-id') }); }
      else { vscode.postMessage({ command: cmd }); }
      return;
    }
    var action = e.target.closest('[data-action-command]');
    if (action) {
      e.stopPropagation();
      var args;
      try { args = action.dataset.args ? JSON.parse(action.dataset.args) : undefined; } catch (_e) { args = undefined; }
      vscode.postMessage({ command: 'executeAction', actionCommand: action.getAttribute('data-action-command'), args: args });
      return;
    }
    var card = e.target.closest('[data-command]');
    if (card) { vscode.postMessage({ command: 'openCommand', id: card.getAttribute('data-command') }); }
  });
})();`;
}

/** Assemble the full hub document head + body. */
function htmlDocument(paneStyles: string, bodyInner: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>${hubChromeCss()}${paneStyles}</style>
</head>
<body>
${bodyInner}
<script nonce="__CSP_NONCE__">${hubScript()}</script>
</body>
</html>`;
}

/**
 * Compose the assembled hub document from both pane renders. Pure: no webview
 * argument, so tests can assert the composition contract directly.
 */
export function buildHubDocument(dashboard: PaneRender, health: PaneRender): string {
  const paneStyles = [
    dashboard.ok ? dashboard.style : '',
    health.ok ? health.style : '',
  ].join('\n');
  const bodyInner = `${hero()}
<div class="dash-grid">
${paneCard({ titleKey: 'panel.hub.pane.dashboard', icon: 'grid', fullCmd: 'driftViewer.openDashboard', scopeClass: 'pane-dashboard', pane: dashboard })}
${paneCard({ titleKey: 'panel.hub.pane.health', icon: 'heart', fullCmd: 'driftViewer.healthScore', scopeClass: 'pane-health', pane: health })}
</div>
${launcherSection()}`;
  return htmlDocument(paneStyles, bodyInner);
}

/**
 * The immediate skeleton shown before scans finish: hero + two panes each in a
 * "scanning…" status + the full launcher (which needs no scan and is usable at
 * once). Revealed the moment the panel opens so the hub never shows a blank tab.
 */
export function buildHubLoadingShell(): string {
  const scanning = `<div class="pane-body"><div class="pane-failed">${t('panel.hub.loading')}</div></div>`;
  // The loading shell omits the per-pane "Open full screen" button — there is
  // nothing rendered to escalate yet (it appears once the assembled doc lands).
  const pane = (titleKey: string, icon: string): string => `<section class="dash-pane">
  <div class="pane-head"><span class="pane-title">${hubIcon(icon)}<h2>${t(titleKey)}</h2></span></div>
  ${scanning}
</section>`;
  const bodyInner = `${hero()}
<div class="dash-grid">
${pane('panel.hub.pane.dashboard', 'grid')}
${pane('panel.hub.pane.health', 'heart')}
</div>
${launcherSection()}`;
  return htmlDocument('', bodyInner);
}
