import { escapeHtml, type IDashboardLayout, type IWidgetConfig, type IWidgetTypeInfo } from './dashboard-types';
import { getDashboardCss } from './dashboard-css';
import { getDashboardJs } from './dashboard-scripts';

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
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src blob:;">
<style>
${getDashboardCss()}
</style>
</head>
<body>
<div class="dashboard">
  <div class="header">
    <h1>Dashboard</h1>
    <div class="header-actions">
      <button class="btn" id="addWidgetBtn">\u{2795} Add Widget</button>
      <button class="btn" id="layoutBtn">\u2699 Layout</button>
      <button class="btn" id="refreshBtn">\u{1F504} Refresh</button>
    </div>
  </div>

  <div class="grid" id="grid" style="grid-template-columns: repeat(${layout.columns}, 1fr);">
    ${widgetsHtml || '<div class="empty-state"><p>No widgets yet.</p><p>Click "+ Add Widget" to get started.</p></div>'}
  </div>
</div>

<div class="modal" id="addWidgetModal">
  <div class="modal-content">
    <div class="modal-header">
      <h2>Add Widget</h2>
      <button class="modal-close" id="closeAddModal">\u00D7</button>
    </div>
    <div class="widget-picker" id="widgetPicker">
    </div>
  </div>
</div>

<div class="modal" id="configModal">
  <div class="modal-content">
    <div class="modal-header">
      <h2 id="configModalTitle">Configure Widget</h2>
      <button class="modal-close" id="closeConfigModal">\u00D7</button>
    </div>
    <form id="configForm">
      <div id="configFields"></div>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary">Save</button>
        <button type="button" class="btn" id="cancelConfigBtn">Cancel</button>
      </div>
    </form>
  </div>
</div>

<div class="modal" id="layoutModal">
  <div class="modal-content">
    <div class="modal-header">
      <h2>Manage Layouts</h2>
      <button class="modal-close" id="closeLayoutModal">\u00D7</button>
    </div>
    <div class="layout-actions">
      <input type="text" id="layoutNameInput" placeholder="Layout name..." value="${esc(layout.name)}">
      <button class="btn" id="saveLayoutBtn">Save</button>
    </div>
  </div>
</div>

<script>
${getDashboardJs(widgetTypesJson, layoutJson)}
</script>
</body>
</html>`;
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
        ${widget.type === 'chart' ? '<button class="widget-btn widget-copy-chart" title="Copy chart to clipboard">\u{1F4CB}</button>' : ''}
        <button class="widget-btn widget-edit" title="Edit">\u270F</button>
        <button class="widget-btn widget-refresh" title="Refresh">\u{1F504}</button>
        <button class="widget-btn widget-remove" title="Remove">\u00D7</button>
      </div>
    </div>
    <div class="widget-body" id="body-${esc(widget.id)}">
      ${bodyHtml || '<p class="loading">Loading\u2026</p>'}
    </div>
    <div class="widget-resize-handle"></div>
  </div>`;
}

const esc = escapeHtml;
