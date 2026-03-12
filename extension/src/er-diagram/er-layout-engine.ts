/**
 * Layout engine for ER diagrams.
 * Computes node positions using force-directed and hierarchical algorithms.
 */

import type { TableMetadata } from '../api-types';
import type { IErColumn, IErEdge, IErLayout, IErNode, IFkContext, LayoutMode } from './er-diagram-types';

const NODE_WIDTH = 180;
const HEADER_HEIGHT = 32;
const COLUMN_HEIGHT = 20;
const MAX_COLUMNS_DISPLAY = 10;

export class ErLayoutEngine {
  layout(
    tables: TableMetadata[],
    fks: IFkContext[],
    mode: LayoutMode,
  ): IErLayout {
    const nodes = tables.map((t) => this._createNode(t));
    const edges = fks.map((fk) => ({
      from: { table: fk.fromTable, column: fk.fromColumn },
      to: { table: fk.toTable, column: fk.toColumn },
    }));

    // Mark FK columns
    for (const edge of edges) {
      const node = nodes.find((n) => n.table === edge.from.table);
      if (node) {
        const col = node.columns.find((c) => c.name === edge.from.column);
        if (col) col.fk = true;
      }
    }

    switch (mode) {
      case 'auto':
        return { nodes: this._forceDirected(nodes, edges), edges };
      case 'hierarchical':
        return { nodes: this._hierarchical(nodes, edges), edges };
      case 'clustered':
        return { nodes: this._clustered(nodes, edges), edges };
    }
  }

  private _createNode(t: TableMetadata): IErNode {
    const cols: IErColumn[] = t.columns.slice(0, MAX_COLUMNS_DISPLAY).map((c) => ({
      name: c.name,
      type: c.type,
      pk: c.pk,
      fk: false,
      nullable: !c.notnull,
    }));
    const displayedCols = Math.min(t.columns.length, MAX_COLUMNS_DISPLAY);
    const height = HEADER_HEIGHT + displayedCols * COLUMN_HEIGHT + 8;

    return {
      table: t.name,
      x: 0,
      y: 0,
      width: NODE_WIDTH,
      height,
      columns: cols,
      rowCount: t.rowCount,
    };
  }

  private _forceDirected(nodes: IErNode[], edges: IErEdge[]): IErNode[] {
    if (nodes.length === 0) return nodes;

    const ITERATIONS = 100;
    const REPULSION = 5000;
    const SPRING_LENGTH = 200;
    const SPRING_STRENGTH = 0.01;

    // Initialize with grid positions
    const cols = Math.ceil(Math.sqrt(nodes.length));
    nodes.forEach((n, i) => {
      n.x = (i % cols) * 300;
      n.y = Math.floor(i / cols) * 250;
    });

    for (let iter = 0; iter < ITERATIONS; iter++) {
      // Repulsion between all pairs
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[j].x - nodes[i].x;
          const dy = nodes[j].y - nodes[i].y;
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
          const force = REPULSION / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          nodes[i].x -= fx;
          nodes[i].y -= fy;
          nodes[j].x += fx;
          nodes[j].y += fy;
        }
      }

      // Spring attraction along edges
      for (const edge of edges) {
        const a = nodes.find((n) => n.table === edge.from.table);
        const b = nodes.find((n) => n.table === edge.to.table);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const force = (dist - SPRING_LENGTH) * SPRING_STRENGTH;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.x += fx;
        a.y += fy;
        b.x -= fx;
        b.y -= fy;
      }
    }

    // Normalize to ensure all positions are positive
    this._normalize(nodes);
    return nodes;
  }

  private _hierarchical(nodes: IErNode[], edges: IErEdge[]): IErNode[] {
    if (nodes.length === 0) return nodes;

    // Build adjacency for parent determination
    const children = new Map<string, Set<string>>();
    const hasParent = new Set<string>();

    for (const edge of edges) {
      // FK from A->B means A references B, so B is the parent
      if (!children.has(edge.to.table)) {
        children.set(edge.to.table, new Set());
      }
      children.get(edge.to.table)!.add(edge.from.table);
      hasParent.add(edge.from.table);
    }

    // Root tables are those with no parent (not referencing any other table via FK)
    const roots = nodes.filter((n) => !hasParent.has(n.table)).map((n) => n.table);
    if (roots.length === 0 && nodes.length > 0) {
      // Cycle or all connected — pick first as root
      roots.push(nodes[0].table);
    }

    // BFS to assign layers
    const depth = new Map<string, number>();
    const queue = [...roots];
    for (const r of roots) {
      depth.set(r, 0);
    }

    while (queue.length > 0) {
      const current = queue.shift()!;
      const d = depth.get(current) ?? 0;
      const kids = children.get(current) ?? new Set();
      for (const child of kids) {
        if (!depth.has(child)) {
          depth.set(child, d + 1);
          queue.push(child);
        }
      }
    }

    // Assign any unvisited nodes (disconnected)
    for (const n of nodes) {
      if (!depth.has(n.table)) {
        depth.set(n.table, 0);
      }
    }

    // Group by layer
    const layers = new Map<number, IErNode[]>();
    for (const n of nodes) {
      const d = depth.get(n.table) ?? 0;
      if (!layers.has(d)) layers.set(d, []);
      layers.get(d)!.push(n);
    }

    // Position nodes
    const LAYER_HEIGHT = 250;
    const NODE_SPACING = 220;

    for (const [layer, layerNodes] of layers) {
      const totalWidth = layerNodes.length * NODE_SPACING;
      const startX = -totalWidth / 2 + NODE_SPACING / 2;
      layerNodes.forEach((n, i) => {
        n.x = startX + i * NODE_SPACING;
        n.y = layer * LAYER_HEIGHT;
      });
    }

    this._normalize(nodes);
    return nodes;
  }

  private _clustered(nodes: IErNode[], edges: IErEdge[]): IErNode[] {
    if (nodes.length === 0) return nodes;

    // Union-Find for clustering
    const parent = new Map<string, string>();
    for (const n of nodes) {
      parent.set(n.table, n.table);
    }

    const find = (x: string): string => {
      // Iterative path compression to avoid stack overflow on deep trees
      let root = x;
      while (parent.get(root) !== root) {
        root = parent.get(root)!;
      }
      // Path compression
      let current = x;
      while (parent.get(current) !== root) {
        const next = parent.get(current)!;
        parent.set(current, root);
        current = next;
      }
      return root;
    };

    const union = (a: string, b: string): void => {
      const rootA = find(a);
      const rootB = find(b);
      if (rootA !== rootB) {
        parent.set(rootA, rootB);
      }
    };

    // Cluster connected tables
    for (const edge of edges) {
      union(edge.from.table, edge.to.table);
    }

    // Group by cluster
    const clusters = new Map<string, IErNode[]>();
    for (const n of nodes) {
      const root = find(n.table);
      if (!clusters.has(root)) clusters.set(root, []);
      clusters.get(root)!.push(n);
    }

    // Layout each cluster, then arrange clusters
    const CLUSTER_SPACING = 400;
    const NODE_SPACING = 220;
    let clusterX = 0;

    for (const [, clusterNodes] of clusters) {
      // Simple grid within cluster
      const cols = Math.ceil(Math.sqrt(clusterNodes.length));
      clusterNodes.forEach((n, i) => {
        n.x = clusterX + (i % cols) * NODE_SPACING;
        n.y = Math.floor(i / cols) * 250;
      });
      const maxX = Math.max(...clusterNodes.map((n) => n.x + n.width));
      clusterX = maxX + CLUSTER_SPACING;
    }

    this._normalize(nodes);
    return nodes;
  }

  private _normalize(nodes: IErNode[]): void {
    if (nodes.length === 0) return;
    const minX = Math.min(...nodes.map((n) => n.x));
    const minY = Math.min(...nodes.map((n) => n.y));
    const padding = 50;
    for (const n of nodes) {
      n.x = n.x - minX + padding;
      n.y = n.y - minY + padding;
    }
  }
}
