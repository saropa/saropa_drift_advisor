/**
 * Returns the ER diagram webview event-handler script body (mouse drag/pan,
 * zoom, context menu, toolbar buttons, field filters, message + resize
 * listeners). Split from er-diagram-script for modularization; the returned
 * text is concatenated into the same IIFE, so it shares that scope's state
 * (nodes, edges, zoom, pan, …) and helpers (renderDiagram, fitToView,
 * showLoading/hideLoading).
 */

export function getErDiagramScriptEvents(): string {
  return `
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

  // Field-filter controls. Each updates filter state and re-renders in place; no
  // round-trip to the extension is needed because all matching happens client-side.
  document.getElementById('fieldSearch').addEventListener('input', (e) => {
    filterText = e.target.value;
    renderDiagram();
  });
  document.getElementById('typeFilter').addEventListener('change', (e) => {
    filterType = e.target.value;
    renderDiagram();
  });
  const highlightBtn = document.getElementById('highlightToggle');
  highlightBtn.addEventListener('click', () => {
    highlightOn = !highlightOn;
    highlightBtn.classList.toggle('active', highlightOn);
    highlightBtn.setAttribute('aria-pressed', String(highlightOn));
    renderDiagram();
  });
  const hideBtn = document.getElementById('hideToggle');
  hideBtn.addEventListener('click', () => {
    hideOn = !hideOn;
    hideBtn.classList.toggle('active', hideOn);
    hideBtn.setAttribute('aria-pressed', String(hideOn));
    renderDiagram();
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
`;
}
