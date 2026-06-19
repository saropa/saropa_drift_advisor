/**
 * HTML/CSS/JS generator for ER Diagram webview with interactive SVG rendering.
 */

import type { IErEdge, IErNode, LayoutMode } from './er-diagram-types';
import { getErDiagramCss } from './er-diagram-styles';
import { getErDiagramScript } from './er-diagram-script';
import { t } from '../l10n';
import { jsonForScript, escapeHtml } from '../shared-utils';

export function buildErDiagramHtml(
  nodes: IErNode[],
  edges: IErEdge[],
  currentMode: LayoutMode,
): string {
  if (nodes.length === 0) {
    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<style>body { font-family: var(--vscode-font-family); color: var(--vscode-foreground);
  background: var(--vscode-editor-background); }
.empty { padding: 32px; text-align: center; opacity: 0.6; }</style>
</head><body><div class="empty">${t('panel.schema.er.empty')}</div></body></html>`;
  }

  // jsonForScript (not plain JSON.stringify): nodes/edges carry DB table and
  // column names; a name containing `</script>` would otherwise break out of the
  // inline <script nonce="__CSP_NONCE__"> below. See plans/full-codebase-audit-2026.06.12.md C2.
  const nodesJson = jsonForScript(nodes);
  const edgesJson = jsonForScript(edges);

  // Distinct column types across the whole schema populate the type-filter
  // dropdown. Sorted case-insensitively so the list is stable and scannable;
  // the raw type string is kept as the option value for exact-match filtering.
  const typeSet = new Set<string>();
  for (const node of nodes) {
    for (const col of node.columns) {
      if (col.type) typeSet.add(col.type);
    }
  }
  const typeOptions = [...typeSet]
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    .map((ty) => `<option value="${escapeHtml(ty)}">${escapeHtml(ty)}</option>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  ${getErDiagramCss()}
</style>
</head>
<body>
<div class="toolbar">
  <span class="toolbar-title">${t('panel.schema.er.title')}</span>
  <div class="toolbar-group">
    <select id="layoutMode">
      <option value="auto"${currentMode === 'auto' ? ' selected' : ''}>${t('panel.schema.er.layout.auto')}</option>
      <option value="hierarchical"${currentMode === 'hierarchical' ? ' selected' : ''}>${t('panel.schema.er.layout.hierarchical')}</option>
      <option value="clustered"${currentMode === 'clustered' ? ' selected' : ''}>${t('panel.schema.er.layout.clustered')}</option>
    </select>
    <button class="btn" id="fitBtn">${t('panel.schema.er.btn.fit')}</button>
    <button class="btn" id="zoomInBtn">+</button>
    <button class="btn" id="zoomOutBtn">−</button>
    <button class="btn" id="refreshBtn">⟳</button>
    <select id="exportFormat">
      <option value="">${t('panel.schema.er.export.placeholder')}</option>
      <option value="svg">${t('panel.schema.er.export.svg')}</option>
      <option value="png">${t('panel.schema.er.export.png')}</option>
      <option value="mermaid">${t('panel.schema.er.export.mermaid')}</option>
    </select>
  </div>
</div>

<div class="toolbar toolbar-filter">
  <div class="toolbar-group">
    <input type="search" id="fieldSearch" class="filter-input"
      placeholder="${t('panel.schema.filter.search.placeholder')}"
      aria-label="${t('panel.schema.filter.search.aria')}" />
    <select id="typeFilter" aria-label="${t('panel.schema.filter.type.aria')}">
      <option value="">${t('panel.schema.filter.type.all')}</option>
      ${typeOptions}
    </select>
    <button class="btn active" id="highlightToggle" aria-pressed="true">${t('panel.schema.filter.highlight')}</button>
    <button class="btn" id="hideToggle" aria-pressed="false">${t('panel.schema.filter.hide')}</button>
  </div>
</div>

<div class="canvas-container" id="canvasContainer">
  <svg id="er-svg"></svg>
  <div class="loading-overlay hidden" id="loadingOverlay">
    <div class="spinner"></div>
  </div>
</div>

<div class="context-menu" id="contextMenu">
  <div class="context-menu-item" data-action="viewData">${t('panel.schema.er.menu.viewData')}</div>
  <div class="context-menu-item" data-action="seed">${t('panel.schema.er.menu.seed')}</div>
  <div class="context-menu-item" data-action="profile">${t('panel.schema.er.menu.profile')}</div>
</div>

<script nonce="__CSP_NONCE__">${getErDiagramScript(nodesJson, edgesJson)}</script>
</body>
</html>`;
}
