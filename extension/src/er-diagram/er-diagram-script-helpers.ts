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
  // --- Field-filter matching (state vars filterText/filterType/highlightOn/hideOn
  // are declared in the outer script scope) ---

  function filterActive() {
    return (filterText && filterText.trim() !== '') || (filterType && filterType !== '');
  }

  // A column matches when the search text appears in its name OR type string AND
  // (no type filter set OR its type equals the selected type). Both comparisons
  // are case-insensitive so "integer" finds INTEGER columns.
  function columnMatches(col) {
    const q = (filterText || '').trim().toLowerCase();
    const textHit = !q
      || col.name.toLowerCase().indexOf(q) >= 0
      || (col.type || '').toLowerCase().indexOf(q) >= 0;
    const typeHit = !filterType || (col.type || '').toLowerCase() === filterType.toLowerCase();
    return textHit && typeHit;
  }

  // The table name only counts as a match when no type filter is active — a type
  // filter is about columns, so a bare table-name hit should not survive it.
  function tableNameMatches(node) {
    const q = (filterText || '').trim().toLowerCase();
    return !filterType && q && node.table.toLowerCase().indexOf(q) >= 0;
  }

  function nodeMatches(node) {
    return tableNameMatches(node) || node.columns.some(columnMatches);
  }

  // Columns to actually render for a node. With hide-mode on and a filter active,
  // a node that has matching columns shows only those; a node that matched only by
  // its name keeps all columns (so it does not render as an empty box).
  function visibleColumns(node) {
    if (hideOn && filterActive() && node.columns.some(columnMatches)) {
      return node.columns.filter(columnMatches);
    }
    return node.columns;
  }

  // Box height for the columns actually rendered (mirrors the layout engine:
  // HEADER_HEIGHT 32 + COLUMN_HEIGHT 20 per row + 8 padding).
  function nodeDisplayHeight(cols) {
    return 32 + cols.length * 20 + 8;
  }

  function renderTableNode(node, cols) {
    const active = filterActive();
    const matched = nodeMatches(node);

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('transform', 'translate(' + node.x + ',' + node.y + ')');
    let cls = 'er-node' + (selectedTable === node.table ? ' selected' : '');
    // Highlight mode emphasizes matching tables and dims the rest; nothing is
    // removed here (hide mode handles removal upstream in renderDiagram).
    if (highlightOn && active) cls += matched ? ' match' : ' dim';
    g.setAttribute('class', cls);
    g.dataset.table = node.table;

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('width', String(node.width));
    rect.setAttribute('height', String(nodeDisplayHeight(cols)));
    rect.setAttribute('rx', '6');
    g.appendChild(rect);

    const header = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    header.setAttribute('x', '10');
    header.setAttribute('y', '22');
    header.setAttribute('class', 'er-table-name');
    header.textContent = node.table + ' (' + node.rowCount + ')';
    g.appendChild(header);

    cols.forEach((col, i) => {
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', '10');
      text.setAttribute('y', String(44 + i * 20));
      let ccls = 'er-column' + (col.pk ? ' pk' : '') + (col.fk ? ' fk' : '');
      const icon = col.pk ? '🔑 ' : col.fk ? '🔗 ' : '   ';
      let prefix = icon;
      // In highlight mode, mark each matching column with a leading chevron and
      // the match class; dim the non-matching ones.
      if (highlightOn && active) {
        if (columnMatches(col)) {
          ccls += ' match';
          prefix = '› ' + icon;
        } else {
          ccls += ' dim';
        }
      }
      text.setAttribute('class', ccls);
      text.textContent = prefix + col.name + '  ' + col.type;
      g.appendChild(text);
    });

    return g;
  }

  // Y of a column's connector within a node, using the columns actually rendered
  // (so edges land correctly even when hide-mode dropped some rows). Falls back to
  // the header band when the column is not currently visible.
  function getColumnY(node, cols, columnName) {
    const idx = cols.findIndex(c => c.name === columnName);
    if (idx < 0) return 32 + 10;
    return 32 + 10 + idx * 20 + 10;
  }

  function bezierPath(x1, y1, x2, y2) {
    const midX = (x1 + x2) / 2;
    return 'M' + x1 + ',' + y1 + ' C' + midX + ',' + y1 + ' ' + midX + ',' + y2 + ' ' + x2 + ',' + y2;
  }
`;
}
