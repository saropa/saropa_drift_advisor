/**
 * Returns the ER diagram webview script body with nodes/edges JSON injected.
 * Escapes inner template literals so the output script contains literal backticks and ${}.
 */

import { getErDiagramHelperJs } from './er-diagram-script-helpers';

export function getErDiagramScript(nodesJson: string, edgesJson: string): string {
  return `(function() {
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
  let didDrag = false;

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

` + getErDiagramHelperJs() + `

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
    didDrag = false;
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
    if (dragTarget || isPanning) {
      didDrag = true;
    }
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

  // Double-click a table node to open its data view
  svg.addEventListener('dblclick', (e) => {
    if (didDrag) return;
    const nodeGroup = e.target.closest('.er-node');
    if (nodeGroup && nodeGroup.dataset.table) {
      vscode.postMessage({ command: 'tableAction', table: nodeGroup.dataset.table, action: 'viewData' });
    }
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
    if (msg.command === 'focusTable' && msg.table) {
      const hit = nodes.find((n) => n.table === msg.table);
      if (hit) {
        selectedTable = msg.table;
        zoom = Math.min(2.2, Math.max(zoom, 1));
        renderDiagram();
      }
    }
  });

  // --- Responsive redraw: re-fit diagram when the panel is resized ---
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    // Debounce to avoid excessive redraws during continuous resize
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(fitToView, 150);
  });

  // Initial render
  renderDiagram();
  setTimeout(fitToView, 100);
})();
`;
}
