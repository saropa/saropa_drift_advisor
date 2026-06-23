import { escapeHtml, type IDashboardLayout, type IWidgetConfig, type IWidgetTypeInfo } from './dashboard-types';
import { getDashboardCss } from './dashboard-css';
import { getDashboardJs } from './dashboard-scripts';
import { t } from '../l10n';

/** Build the complete HTML for the dashboard webview. */
export function buildDashboardHtml(
  layout: IDashboardLayout,
  widgetTypes: IWidgetTypeInfo[],
  initialWidgetHtml: Map<string, string>,
): string {
  const widgetsHtml = layout.widgets.map((w) => buildWidgetHtml(w, initialWidgetHtml.get(w.id))).join('\n');
  const widgetTypesJson = JSON.stringify(widgetTypes);
  const layoutJson = JSON.stringify(layout);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<!-- CSP applied centrally by secureWebviewHtml (audit C2b): a per-render nonce
  locks script-src; the shared policy allows blob:/data: images. -->
<style>
${getDashboardCss()}
</style>
</head>
<body>
<div class="dashboard">
  <div class="header">
    <h1>${t('panel.dashboard.title')}</h1>
    <div class="header-actions">
      <button class="btn" id="addWidgetBtn">\u{2795} ${t('panel.dashboard.btn.addWidget')}</button>
      <button class="btn" id="layoutBtn">\u2699 ${t('panel.dashboard.btn.layout')}</button>
      <button class="btn" id="refreshBtn">\u{1F504} ${t('panel.dashboard.btn.refresh')}</button>
    </div>
  </div>

  <div class="grid" id="grid" style="grid-template-columns: repeat(${layout.columns}, 1fr);">
    ${widgetsHtml || `<div class="empty-state"><p>${t('panel.dashboard.empty.title')}</p><p>${t('panel.dashboard.empty.hint')}</p></div>`}
  </div>
</div>

<div class="modal" id="addWidgetModal">
  <div class="modal-content">
    <div class="modal-header">
      <h2>${t('panel.dashboard.addModal.title')}</h2>
      <button class="modal-close" id="closeAddModal">\u00D7</button>
    </div>
    <div class="widget-picker" id="widgetPicker">
    </div>
  </div>
</div>

<div class="modal" id="configModal">
  <div class="modal-content">
    <div class="modal-header">
      <h2 id="configModalTitle">${t('panel.dashboard.configModal.title')}</h2>
      <button class="modal-close" id="closeConfigModal">\u00D7</button>
    </div>
    <form id="configForm">
      <div id="configFields"></div>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary">${t('panel.dashboard.configModal.save')}</button>
        <button type="button" class="btn" id="cancelConfigBtn">${t('panel.dashboard.configModal.cancel')}</button>
      </div>
    </form>
  </div>
</div>

<div class="modal" id="layoutModal">
  <div class="modal-content">
    <div class="modal-header">
      <h2>${t('panel.dashboard.layoutModal.title')}</h2>
      <button class="modal-close" id="closeLayoutModal">\u00D7</button>
    </div>
    <div class="layout-actions">
      <input type="text" id="layoutNameInput" placeholder="${t('panel.dashboard.layoutModal.namePlaceholder')}" value="${esc(layout.name)}">
      <button class="btn" id="saveLayoutBtn">${t('panel.dashboard.layoutModal.save')}</button>
    </div>
  </div>
</div>

<script nonce="__CSP_NONCE__">
${getDashboardJs(widgetTypesJson, layoutJson)}
</script>
</body>
</html>`;
}

/**
 * Read-only Dashboard pane for the Drift Tools Hub: the widget grid with data
 * already populated (the hub pre-fetches every widget server-side before
 * composing), but WITHOUT the editing chrome — no header buttons, no modals, no
 * drag/drop, no resize handle, no script. Editing the layout stays on the
 * standalone Dashboard panel reached via "Open full screen", because the live
 * editor relies on a per-panel message protocol the hub does not host.
 *
 * Returns the `body` and the pane-`scope`d `style`; `widgetHtml` maps each
 * widget id to its rendered inner HTML.
 */
export function buildDashboardFragment(
  layout: IDashboardLayout,
  widgetHtml: Map<string, string>,
  scope: string,
): { body: string; style: string } {
  const style = getDashboardCss(scope);
  const widgets = layout.widgets
    .map((w) => buildReadOnlyWidgetHtml(w, widgetHtml.get(w.id)))
    .join('\n');
  const grid = layout.widgets.length > 0
    ? `<div class="grid" style="grid-template-columns: repeat(${layout.columns}, 1fr);">${widgets}</div>`
    : `<div class="empty-state"><p>${t('panel.dashboard.empty.title')}</p></div>`;
  return { body: `<div class="dashboard">${grid}</div>`, style };
}

/** Static widget card for the hub snapshot — title + body only, no controls. */
function buildReadOnlyWidgetHtml(widget: IWidgetConfig, bodyHtml?: string): string {
  return `<div class="widget"
    style="grid-column: ${widget.gridX + 1} / span ${widget.gridW}; grid-row: ${widget.gridY + 1} / span ${widget.gridH};">
    <div class="widget-header" style="cursor: default;">
      <span class="widget-title">${esc(widget.title)}</span>
    </div>
    <div class="widget-body">
      ${bodyHtml || `<p class="loading">${t('panel.dashboard.widget.loading')}</p>`}
    </div>
  </div>`;
}

function buildWidgetHtml(widget: IWidgetConfig, bodyHtml?: string): string {
  return `<div class="widget" 
    data-id="${esc(widget.id)}" 
    data-type="${esc(widget.type)}"
    draggable="true"
    style="grid-column: ${widget.gridX + 1} / span ${widget.gridW}; grid-row: ${widget.gridY + 1} / span ${widget.gridH};">
    <div class="widget-header">
      <span class="widget-title">${esc(widget.title)}</span>
      <div class="widget-actions">
        ${widget.type === 'chart' ? `<button class="widget-btn widget-copy-chart" title="${t('panel.dashboard.widget.copyChart')}">\u{1F4CB}</button>` : ''}
        <button class="widget-btn widget-edit" title="${t('panel.dashboard.widget.edit')}">\u270F</button>
        <button class="widget-btn widget-refresh" title="${t('panel.dashboard.widget.refresh')}">\u{1F504}</button>
        <button class="widget-btn widget-remove" title="${t('panel.dashboard.widget.remove')}">\u00D7</button>
      </div>
    </div>
    <div class="widget-body" id="body-${esc(widget.id)}">
      ${bodyHtml || `<p class="loading">${t('panel.dashboard.widget.loading')}</p>`}
    </div>
    <div class="widget-resize-handle"></div>
  </div>`;
}

const esc = escapeHtml;
