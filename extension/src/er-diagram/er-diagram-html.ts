/**
 * HTML/CSS/JS generator for ER Diagram webview with interactive SVG rendering.
 */

import type { IErEdge, IErNode, LayoutMode } from './er-diagram-types';
import { getErDiagramCss } from './er-diagram-styles';
import { getErDiagramScript } from './er-diagram-script';

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
</head><body><div class="empty">No tables in schema.</div></body></html>`;
  }

  const nodesJson = JSON.stringify(nodes);
  const edgesJson = JSON.stringify(edges);

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
  <span class="toolbar-title">ER Diagram</span>
  <div class="toolbar-group">
    <select id="layoutMode">
      <option value="auto"${currentMode === 'auto' ? ' selected' : ''}>Auto Layout</option>
      <option value="hierarchical"${currentMode === 'hierarchical' ? ' selected' : ''}>Hierarchical</option>
      <option value="clustered"${currentMode === 'clustered' ? ' selected' : ''}>Clustered</option>
    </select>
    <button class="btn" id="fitBtn">Fit</button>
    <button class="btn" id="zoomInBtn">+</button>
    <button class="btn" id="zoomOutBtn">−</button>
    <button class="btn" id="refreshBtn">⟳</button>
    <select id="exportFormat">
      <option value="">Export…</option>
      <option value="svg">SVG</option>
      <option value="png">PNG</option>
      <option value="mermaid">Mermaid</option>
    </select>
  </div>
</div>

<div class="canvas-container" id="canvasContainer">
  <svg id="er-svg"></svg>
  <div class="loading-overlay hidden" id="loadingOverlay">
    <div class="spinner"></div>
  </div>
</div>

<div class="context-menu" id="contextMenu">
  <div class="context-menu-item" data-action="viewData">View Data</div>
  <div class="context-menu-item" data-action="seed">Seed Test Data</div>
  <div class="context-menu-item" data-action="profile">Profile Columns</div>
</div>

<script>${getErDiagramScript(nodesJson, edgesJson)}</script>
</body>
</html>`;
}
