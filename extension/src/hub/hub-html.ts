/**
 * HTML for the Saropa Drift Tools Hub — one composed document that shows the
 * Dashboard and Health Score panes side by side and surfaces every other
 * webview tool as a launcher tile, plus a link to the Saropa website.
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
 * `buildHubDocument` takes no webview argument so the composition contract is
 * unit-testable directly: both panes present, pane styles scoped, one script.
 */

import { t } from '../l10n';

/** A composed pane: either its rendered snapshot, or a failed placeholder. */
export type PaneRender =
  | { ok: true; body: string; style: string }
  | { ok: false };

/** One launcher tile: a tool command surfaced in the hub's "All tools" grid. */
export interface HubTile {
  /** VS Code command id run when the tile is clicked. */
  id: string;
  /** l10n key for the tile label. */
  labelKey: string;
}

/**
 * Every webview-backed tool EXCEPT the two composed panes (Dashboard, Health),
 * which appear as full panes above the grid rather than as tiles. Order groups
 * structural → quality → data → query tools the way the sidebar does.
 */
export const HUB_TILES: HubTile[] = [
  { id: 'driftViewer.showErDiagram', labelKey: 'panel.hub.tile.erDiagram' },
  { id: 'driftViewer.schemaDiff', labelKey: 'panel.hub.tile.schemaDiff' },
  { id: 'driftViewer.showAnomalies', labelKey: 'panel.hub.tile.anomalies' },
  { id: 'driftViewer.analyzeQueryCost', labelKey: 'panel.hub.tile.queryCost' },
  { id: 'driftViewer.manageInvariants', labelKey: 'panel.hub.tile.invariants' },
  { id: 'driftViewer.seedAllTables', labelKey: 'panel.hub.tile.seed' },
  { id: 'driftViewer.importDataset', labelKey: 'panel.hub.tile.import' },
  { id: 'driftViewer.exportDataset', labelKey: 'panel.hub.tile.export' },
  { id: 'driftViewer.openSqlNotebook', labelKey: 'panel.hub.tile.sqlNotebook' },
  { id: 'driftViewer.openSnippetLibrary', labelKey: 'panel.hub.tile.snippets' },
  { id: 'driftViewer.globalSearch', labelKey: 'panel.hub.tile.globalSearch' },
  { id: 'driftViewer.isarToDrift', labelKey: 'panel.hub.tile.isar' },
];

/** Hub chrome CSS — owns the hero, two-pane grid, launchers, and placeholders.
 * Deliberately NOT scoped: these classes are unique to the hub and the pane
 * stylesheets are scoped away from them, so there is nothing to collide with. */
function hubChromeCss(): string {
  return `
:root { color-scheme: light dark; }
body { font-family: var(--vscode-font-family); color: var(--vscode-foreground);
  background: var(--vscode-editor-background); margin: 0; padding: 16px; }
.hub-hero { display: flex; align-items: center; justify-content: space-between;
  gap: 16px; padding: 16px 18px; margin-bottom: 16px; border-radius: 8px;
  border: 1px solid var(--vscode-widget-border);
  background: linear-gradient(135deg,
    color-mix(in srgb, var(--brand) 14%, transparent),
    color-mix(in srgb, var(--brand-2) 6%, transparent)); }
.hub-hero h1 { margin: 0; font-size: 18px; font-weight: 600; }
.hub-hero p { margin: 4px 0 0; font-size: 12px; opacity: 0.75; }
.hub-hero-actions { display: flex; gap: 8px; flex-shrink: 0; }
.hub-btn { padding: 5px 12px; font-size: 12px; cursor: pointer; border-radius: 4px;
  border: 1px solid var(--vscode-button-border, var(--vscode-widget-border));
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground); }
.hub-btn:hover { background: var(--vscode-button-secondaryHoverBackground); }
.hub-btn.primary { background: var(--vscode-button-background);
  color: var(--vscode-button-foreground); border-color: var(--vscode-button-background); }
.hub-btn.primary:hover { opacity: 0.9; }
.dash-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
@media (max-width: 1100px) { .dash-grid { grid-template-columns: 1fr; } }
.dash-pane { border: 1px solid var(--vscode-widget-border); border-radius: 8px;
  overflow: hidden; display: flex; flex-direction: column; min-width: 0; }
.pane-head { display: flex; align-items: center; justify-content: space-between;
  gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--vscode-widget-border);
  background: var(--vscode-sideBar-background); }
.pane-head h2 { margin: 0; font-size: 13px; font-weight: 600; }
.pane-body { padding: 4px; overflow: auto; }
.pane-failed { padding: 24px; text-align: center; opacity: 0.7; font-size: 12px; }
.hub-launchers { margin-top: 20px; }
.hub-launchers h2 { font-size: 13px; font-weight: 600; margin: 0 0 10px; opacity: 0.85; }
.launcher-grid { display: grid; gap: 10px;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); }
.launcher-tile { display: flex; align-items: center; gap: 8px; text-align: left;
  padding: 10px 12px; font-size: 12px; cursor: pointer; border-radius: 6px;
  border: 1px solid var(--vscode-widget-border);
  background: var(--vscode-editor-background); color: var(--vscode-foreground);
  transition: border-color 0.15s, background 0.15s; }
.launcher-tile:hover { border-color: var(--vscode-focusBorder);
  background: var(--vscode-list-hoverBackground); }
.tile-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0;
  background: var(--brand); }
`;
}

/** Pane body: rendered snapshot, or the failed placeholder when its scan died. */
function paneBody(pane: PaneRender, scopeClass: string): string {
  if (!pane.ok) {
    return `<div class="pane-body ${scopeClass}"><div class="pane-failed">${t('panel.hub.pane.failed')}</div></div>`;
  }
  return `<div class="pane-body ${scopeClass}">${pane.body}</div>`;
}

/** One pane card: titled head with a full-screen button, then the body. */
function paneCard(opts: {
  titleKey: string;
  fullCmd: string;
  scopeClass: string;
  pane: PaneRender;
}): string {
  return `<section class="dash-pane">
  <div class="pane-head">
    <h2>${t(opts.titleKey)}</h2>
    <button class="hub-btn" data-hub-cmd="runCommand" data-cmd-id="${opts.fullCmd}">${t('panel.hub.btn.openFull')}</button>
  </div>
  ${paneBody(opts.pane, opts.scopeClass)}
</section>`;
}

/** The "All tools" launcher grid — one tile per surfaced webview tool. */
function launcherGrid(): string {
  const tiles = HUB_TILES.map((tile) => `<button class="launcher-tile" data-hub-cmd="runCommand" data-cmd-id="${tile.id}">
    <span class="tile-dot"></span><span class="tile-label">${t(tile.labelKey)}</span>
  </button>`).join('\n');
  return `<section class="hub-launchers">
  <h2>${t('panel.hub.launchers.title')}</h2>
  <div class="launcher-grid">${tiles}</div>
</section>`;
}

/** Hero band: title/subtitle plus Rescan and Open-website actions. */
function hero(): string {
  return `<div class="hub-hero">
  <div>
    <h1>${t('panel.hub.title')}</h1>
    <p>${t('panel.hub.subtitle')}</p>
  </div>
  <div class="hub-hero-actions">
    <button class="hub-btn" data-hub-cmd="rescan">${t('panel.hub.btn.rescan')}</button>
    <button class="hub-btn primary" data-hub-cmd="openWebsite">${t('panel.hub.btn.website')}</button>
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

/** Assemble the full hub document head + body for the given pane renders. */
function document(paneStyles: string, bodyInner: string): string {
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
${paneCard({ titleKey: 'panel.hub.pane.dashboard', fullCmd: 'driftViewer.openDashboard', scopeClass: 'pane-dashboard', pane: dashboard })}
${paneCard({ titleKey: 'panel.hub.pane.health', fullCmd: 'driftViewer.healthScore', scopeClass: 'pane-health', pane: health })}
</div>
${launcherGrid()}`;
  return document(paneStyles, bodyInner);
}

/**
 * The immediate skeleton shown before scans finish: hero + two panes each in a
 * "scanning…" status + the launcher grid (which needs no scan and is usable at
 * once). Revealed the moment the panel opens so the hub never shows a blank tab.
 */
export function buildHubLoadingShell(): string {
  const scanning = `<div class="pane-body"><div class="pane-failed">${t('panel.hub.loading')}</div></div>`;
  // The loading shell omits the per-pane "Open full screen" button — there is
  // nothing rendered to escalate yet (it appears once the assembled doc lands).
  const pane = (titleKey: string): string => `<section class="dash-pane">
  <div class="pane-head"><h2>${t(titleKey)}</h2></div>
  ${scanning}
</section>`;
  const bodyInner = `${hero()}
<div class="dash-grid">
${pane('panel.hub.pane.dashboard')}
${pane('panel.hub.pane.health')}
</div>
${launcherGrid()}`;
  return document('', bodyInner);
}
