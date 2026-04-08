/**
 * ER diagram SVG rendering helpers for the webview script.
 * Extracted from er-diagram-script to keep files under 300 lines.
 */

/**
 * Returns the inline JS defining renderTableNode, getColumnY, and bezierPath
 * helper functions used by the ER diagram webview script.
 */
export function getErDiagramHelperJs(): string {
  return `
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
`;
}
