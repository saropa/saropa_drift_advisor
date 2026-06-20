/**
 * Returns the ER diagram webview script body with nodes/edges JSON injected.
 * Escapes inner template literals so the output script contains literal backticks and ${}.
 */

import { getErDiagramHelperJs } from './er-diagram-script-helpers';
import { getErDiagramScriptEvents } from './er-diagram-script-events';

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

  // Field-filter state, read by the matching helpers (er-diagram-script-helpers).
  // highlightOn defaults true so typing a search immediately emphasizes matches;
  // hideOn is opt-in so the diagram is never silently emptied.
  let filterText = '';
  let filterType = '';
  let highlightOn = true;
  let hideOn = false;

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

    // With hide-mode + an active filter, only matching tables render; their edges
    // are dropped too. Build the visible set once so edge filtering is O(1).
    const hiding = hideOn && filterActive();
    const visNodes = hiding ? nodes.filter(nodeMatches) : nodes;
    const visSet = {};
    for (const n of visNodes) visSet[n.table] = true;

    // Bounds use each node's DISPLAYED height (hide-mode shrinks boxes that lost
    // rows) so the viewBox is not padded by hidden columns.
    let maxX = 0, maxY = 0;
    for (const node of visNodes) {
      maxX = Math.max(maxX, node.x + node.width);
      maxY = Math.max(maxY, node.y + nodeDisplayHeight(visibleColumns(node)));
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
      // Skip edges whose endpoint table is hidden by the filter.
      if (hiding && (!visSet[edge.from.table] || !visSet[edge.to.table])) continue;

      const fromCols = visibleColumns(fromNode);
      const toCols = visibleColumns(toNode);
      const fromY = fromNode.y + getColumnY(fromNode, fromCols, edge.from.column);
      const toY = toNode.y + getColumnY(toNode, toCols, edge.to.column);
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
    for (const node of visNodes) {
      const g = renderTableNode(node, visibleColumns(node));
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

` + getErDiagramScriptEvents() + `

  // Initial render
  renderDiagram();
  setTimeout(fitToView, 100);
})();
`;
}
