/**
 * HTML/CSS/JS generator for ER Diagram webview with interactive SVG rendering.
 */

import type { IErEdge, IErNode, LayoutMode } from './er-diagram-types';

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
  * { box-sizing: border-box; }
  body {
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    margin: 0;
    padding: 0;
    overflow: hidden;
  }
  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 16px;
    border-bottom: 1px solid var(--vscode-widget-border);
    background: var(--vscode-editor-background);
  }
  .toolbar-title {
    font-size: 14px;
    font-weight: bold;
  }
  .toolbar-group {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .btn {
    padding: 4px 10px;
    border: 1px solid var(--vscode-button-border, var(--vscode-widget-border));
    background: var(--vscode-button-secondaryBackground, var(--vscode-editor-background));
    color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
    border-radius: 3px;
    cursor: pointer;
    font-size: 12px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .btn:hover { background: var(--vscode-button-secondaryHoverBackground, var(--vscode-list-hoverBackground)); }
  .btn.active {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border-color: var(--vscode-button-background);
  }
  select {
    padding: 4px 8px;
    border: 1px solid var(--vscode-widget-border);
    background: var(--vscode-dropdown-background);
    color: var(--vscode-dropdown-foreground);
    border-radius: 3px;
    font-size: 12px;
  }
  .canvas-container {
    width: 100%;
    height: calc(100vh - 50px);
    overflow: hidden;
    cursor: grab;
  }
  .canvas-container.dragging { cursor: grabbing; }
  svg {
    display: block;
  }
  .er-node {
    cursor: move;
  }
  .er-node rect {
    fill: var(--vscode-editor-background);
    stroke: var(--vscode-widget-border);
    stroke-width: 1;
    transition: stroke 0.15s ease, stroke-width 0.15s ease;
  }
  .er-node:hover rect {
    stroke: var(--vscode-focusBorder);
    stroke-width: 2;
  }
  .er-node.selected rect {
    stroke: var(--vscode-button-background);
    stroke-width: 2;
  }
  .loading-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: var(--vscode-editor-background);
    opacity: 0.8;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }
  .loading-overlay.hidden { display: none; }
  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid var(--vscode-widget-border);
    border-top-color: var(--vscode-button-background);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  .er-table-name {
    fill: var(--vscode-foreground);
    font-family: var(--vscode-font-family);
    font-size: 12px;
    font-weight: bold;
  }
  .er-column {
    fill: var(--vscode-descriptionForeground);
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 10px;
  }
  .er-column.pk { fill: #fbbf24; }
  .er-column.fk { fill: #60a5fa; }
  .er-edge {
    fill: none;
    stroke: var(--vscode-editorLineNumber-foreground);
    stroke-width: 1.5;
    transition: stroke 0.15s;
  }
  .er-edge:hover, .er-edge.highlight {
    stroke: var(--vscode-focusBorder);
    stroke-width: 2;
  }
  .context-menu {
    position: absolute;
    background: var(--vscode-menu-background);
    border: 1px solid var(--vscode-menu-border);
    border-radius: 4px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    min-width: 140px;
    z-index: 1000;
    display: none;
  }
  .context-menu.visible { display: block; }
  .context-menu-item {
    padding: 6px 12px;
    font-size: 12px;
    cursor: pointer;
  }
  .context-menu-item:hover {
    background: var(--vscode-menu-selectionBackground);
    color: var(--vscode-menu-selectionForeground);
  }
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

<script>
(function() {
  const vscode = acquireVsCodeApi();
  let nodes = ${nodesJson};
  let edges = ${edgesJson};
  let zoom = 1;
  let pan = { x: 0, y: 0 };
  let dragTarget = null;
  let dragOffset = { x: 0, y: 0 };
  let isPanning = false;
  let panStart = { x: 0, y: 0 };
  let selectedTable = null;

  const svg = document.getElementById('er-svg');
  const container = document.getElementById('canvasContainer');
  const contextMenu = document.getElementById('contextMenu');
  const loadingOverlay = document.getElementById('loadingOverlay');

  function showLoading() {
    loadingOverlay.classList.remove('hidden');
  }

  function hideLoading() {
    loadingOverlay.classList.add('hidden');
  }

  function renderDiagram() {
    svg.innerHTML = '';

    // Calculate bounds
    let maxX = 0, maxY = 0;
    for (const node of nodes) {
      maxX = Math.max(maxX, node.x + node.width);
      maxY = Math.max(maxY, node.y + node.height);
    }
    const svgWidth = maxX + 100;
    const svgHeight = maxY + 100;

    svg.setAttribute('width', svgWidth * zoom);
    svg.setAttribute('height', svgHeight * zoom);
    svg.setAttribute('viewBox', \`\${-pan.x / zoom} \${-pan.y / zoom} \${svgWidth} \${svgHeight}\`);

    // Defs for arrowhead
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = \`
      <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
        <polygon points="0 0, 10 3.5, 0 7" fill="var(--vscode-editorLineNumber-foreground)"/>
      </marker>
    \`;
    svg.appendChild(defs);

    // Render edges first (behind nodes)
    for (const edge of edges) {
      const fromNode = nodes.find(n => n.table === edge.from.table);
      const toNode = nodes.find(n => n.table === edge.to.table);
      if (!fromNode || !toNode) continue;

      const fromY = fromNode.y + getColumnY(fromNode, edge.from.column);
      const toY = toNode.y + getColumnY(toNode, edge.to.column);
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const d = bezierPath(fromNode.x + fromNode.width, fromY, toNode.x, toY);
      path.setAttribute('d', d);
      path.setAttribute('class', 'er-edge');
      path.setAttribute('marker-end', 'url(#arrowhead)');
      path.dataset.from = edge.from.table;
      path.dataset.to = edge.to.table;
      svg.appendChild(path);
    }

    // Render nodes
    for (const node of nodes) {
      const g = renderTableNode(node);
      svg.appendChild(g);
    }
  }

  function renderTableNode(node) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('transform', 'translate(' + node.x + ',' + node.y + ')');
    g.setAttribute('class', 'er-node' + (selectedTable === node.table ? ' selected' : ''));
    g.dataset.table = node.table;

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('width', String(node.width));
    rect.setAttribute('height', String(node.height));
    rect.setAttribute('rx', '6');
    g.appendChild(rect);

    const header = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    header.setAttribute('x', '10');
    header.setAttribute('y', '22');
    header.setAttribute('class', 'er-table-name');
    header.textContent = node.table + ' (' + node.rowCount + ')';
    g.appendChild(header);

    node.columns.forEach((col, i) => {
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', '10');
      text.setAttribute('y', String(44 + i * 20));
      const cls = 'er-column' + (col.pk ? ' pk' : '') + (col.fk ? ' fk' : '');
      text.setAttribute('class', cls);
      const icon = col.pk ? '🔑 ' : col.fk ? '🔗 ' : '   ';
      text.textContent = icon + col.name + '  ' + col.type;
      g.appendChild(text);
    });

    return g;
  }

  function getColumnY(node, columnName) {
    const idx = node.columns.findIndex(c => c.name === columnName);
    if (idx < 0) return 32 + 10;
    return 32 + 10 + idx * 20 + 10;
  }

  function bezierPath(x1, y1, x2, y2) {
    const midX = (x1 + x2) / 2;
    return 'M' + x1 + ',' + y1 + ' C' + midX + ',' + y1 + ' ' + midX + ',' + y2 + ' ' + x2 + ',' + y2;
  }

  function fitToView() {
    let minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
    for (const node of nodes) {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + node.width);
      maxY = Math.max(maxY, node.y + node.height);
    }
    const contentW = maxX - minX + 100;
    const contentH = maxY - minY + 100;
    const containerW = container.clientWidth;
    const containerH = container.clientHeight;
    zoom = Math.min(containerW / contentW, containerH / contentH, 2);
    pan = { x: 0, y: 0 };
    renderDiagram();
  }

  // Event handlers
  svg.addEventListener('mousedown', (e) => {
    hideContextMenu();
    const nodeGroup = e.target.closest('.er-node');
    if (nodeGroup) {
      const table = nodeGroup.dataset.table;
      const node = nodes.find(n => n.table === table);
      if (node) {
        dragTarget = node;
        const pt = svg.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;
        const svgPt = pt.matrixTransform(svg.getScreenCTM().inverse());
        dragOffset = { x: svgPt.x - node.x, y: svgPt.y - node.y };
        selectedTable = table;
        renderDiagram();
      }
    } else {
      isPanning = true;
      panStart = { x: e.clientX - pan.x, y: e.clientY - pan.y };
      container.classList.add('dragging');
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (dragTarget) {
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const svgPt = pt.matrixTransform(svg.getScreenCTM().inverse());
      dragTarget.x = svgPt.x - dragOffset.x;
      dragTarget.y = svgPt.y - dragOffset.y;
      renderDiagram();
    } else if (isPanning) {
      pan = { x: e.clientX - panStart.x, y: e.clientY - panStart.y };
      renderDiagram();
    }
  });

  window.addEventListener('mouseup', () => {
    if (dragTarget) {
      const positions = nodes.map(n => ({ table: n.table, x: n.x, y: n.y }));
      vscode.postMessage({ command: 'nodesMoved', positions });
      dragTarget = null;
    }
    isPanning = false;
    container.classList.remove('dragging');
  });

  container.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    zoom = Math.max(0.2, Math.min(3, zoom * delta));
    renderDiagram();
  });

  // Context menu for table actions
  svg.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const nodeGroup = e.target.closest('.er-node');
    if (nodeGroup) {
      selectedTable = nodeGroup.dataset.table;
      renderDiagram();
      contextMenu.style.left = e.clientX + 'px';
      contextMenu.style.top = e.clientY + 'px';
      contextMenu.classList.add('visible');
    } else {
      hideContextMenu();
    }
  });

  function hideContextMenu() {
    contextMenu.classList.remove('visible');
  }

  contextMenu.addEventListener('click', (e) => {
    const item = e.target.closest('.context-menu-item');
    if (item && selectedTable) {
      vscode.postMessage({ command: 'tableAction', table: selectedTable, action: item.dataset.action });
      hideContextMenu();
    }
  });

  document.addEventListener('click', (e) => {
    if (!contextMenu.contains(e.target)) {
      hideContextMenu();
    }
  });

  // Edge hover highlighting
  svg.addEventListener('mouseover', (e) => {
    if (e.target.classList.contains('er-edge')) {
      e.target.classList.add('highlight');
    }
  });
  svg.addEventListener('mouseout', (e) => {
    if (e.target.classList.contains('er-edge')) {
      e.target.classList.remove('highlight');
    }
  });

  // Toolbar handlers
  document.getElementById('fitBtn').addEventListener('click', fitToView);
  document.getElementById('zoomInBtn').addEventListener('click', () => {
    zoom = Math.min(3, zoom * 1.2);
    renderDiagram();
  });
  document.getElementById('zoomOutBtn').addEventListener('click', () => {
    zoom = Math.max(0.2, zoom * 0.8);
    renderDiagram();
  });
  document.getElementById('refreshBtn').addEventListener('click', () => {
    showLoading();
    vscode.postMessage({ command: 'refresh' });
  });
  document.getElementById('layoutMode').addEventListener('change', (e) => {
    showLoading();
    vscode.postMessage({ command: 'changeLayout', mode: e.target.value });
  });
  document.getElementById('exportFormat').addEventListener('change', (e) => {
    if (e.target.value) {
      vscode.postMessage({ command: 'export', format: e.target.value });
      e.target.value = '';
    }
  });

  // Listen for messages from extension
  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.command === 'update') {
      nodes = msg.nodes;
      edges = msg.edges;
      renderDiagram();
      hideLoading();
    }
  });

  // Initial render
  renderDiagram();
  setTimeout(fitToView, 100);
})();
</script>
</body>
</html>`;
}
