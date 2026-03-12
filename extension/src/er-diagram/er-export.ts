/**
 * Export ER diagram to SVG, PNG, or Mermaid format.
 */

import type { IErEdge, IErNode } from './er-diagram-types';

export class ErExport {
  /**
   * Generate standalone SVG string with embedded styles.
   */
  toSvg(nodes: IErNode[], edges: IErEdge[]): string {
    if (nodes.length === 0) {
      return '<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"></svg>';
    }

    const maxX = Math.max(...nodes.map((n) => n.x + n.width)) + 50;
    const maxY = Math.max(...nodes.map((n) => n.y + n.height)) + 50;

    const styles = `
      .er-node rect { fill: #1e1e1e; stroke: #444; stroke-width: 1; }
      .er-table-name { fill: #fff; font-family: sans-serif; font-size: 12px; font-weight: bold; }
      .er-column { fill: #ccc; font-family: monospace; font-size: 10px; }
      .er-column.pk { fill: #fbbf24; }
      .er-column.fk { fill: #60a5fa; }
      .er-edge { fill: none; stroke: #666; stroke-width: 1.5; }
    `;

    const edgePaths = edges.map((edge) => {
      const fromNode = nodes.find((n) => n.table === edge.from.table);
      const toNode = nodes.find((n) => n.table === edge.to.table);
      if (!fromNode || !toNode) return '';
      const fromY = fromNode.y + this._getColumnY(fromNode, edge.from.column);
      const toY = toNode.y + this._getColumnY(toNode, edge.to.column);
      const d = this._bezierPath(
        fromNode.x + fromNode.width, fromY,
        toNode.x, toY,
      );
      return `<path class="er-edge" d="${d}" marker-end="url(#arrowhead)"/>`;
    }).join('\n    ');

    const nodeGroups = nodes.map((node) => this._renderNodeSvg(node)).join('\n    ');

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${maxX}" height="${maxY}" viewBox="0 0 ${maxX} ${maxY}">
  <defs>
    <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="#666"/>
    </marker>
    <style>${styles}</style>
  </defs>
  <g>
    ${edgePaths}
    ${nodeGroups}
  </g>
</svg>`;
  }

  /**
   * Generate Mermaid ER diagram syntax.
   */
  toMermaid(nodes: IErNode[], edges: IErEdge[]): string {
    const lines = ['erDiagram'];

    for (const node of nodes) {
      lines.push(`    ${this._sanitizeMermaidId(node.table)} {`);
      for (const col of node.columns) {
        const key = col.pk ? 'PK' : col.fk ? 'FK' : '';
        const colType = this._sanitizeMermaidType(col.type);
        lines.push(`        ${colType} ${col.name} ${key}`.trimEnd());
      }
      lines.push('    }');
    }

    for (const edge of edges) {
      const from = this._sanitizeMermaidId(edge.from.table);
      const to = this._sanitizeMermaidId(edge.to.table);
      lines.push(`    ${to} ||--o{ ${from} : "${edge.from.column}"`);
    }

    return lines.join('\n');
  }

  private _renderNodeSvg(node: IErNode): string {
    const columnLines = node.columns.map((col, i) => {
      const cls = col.pk ? 'er-column pk' : col.fk ? 'er-column fk' : 'er-column';
      const icon = col.pk ? '🔑 ' : col.fk ? '🔗 ' : '   ';
      const y = 44 + i * 20;
      return `<text x="10" y="${y}" class="${cls}">${this._escSvg(icon + col.name + '  ' + col.type)}</text>`;
    }).join('\n      ');

    return `<g class="er-node" transform="translate(${node.x},${node.y})">
      <rect width="${node.width}" height="${node.height}" rx="6"/>
      <text x="10" y="22" class="er-table-name">${this._escSvg(node.table)} (${node.rowCount})</text>
      ${columnLines}
    </g>`;
  }

  private _getColumnY(node: IErNode, column: string): number {
    const idx = node.columns.findIndex((c) => c.name === column);
    if (idx < 0) return 32 + 10; // Default to header + some offset
    return 32 + 10 + idx * 20 + 10;
  }

  private _bezierPath(x1: number, y1: number, x2: number, y2: number): string {
    const midX = (x1 + x2) / 2;
    return `M${x1},${y1} C${midX},${y1} ${midX},${y2} ${x2},${y2}`;
  }

  private _escSvg(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private _sanitizeMermaidId(name: string): string {
    // Mermaid IDs: alphanumeric + underscore
    return name.replace(/[^a-zA-Z0-9_]/g, '_');
  }

  private _sanitizeMermaidType(type: string): string {
    // Remove parentheses and special chars for Mermaid
    return type.replace(/[()]/g, '').replace(/\s+/g, '_') || 'unknown';
  }
}
