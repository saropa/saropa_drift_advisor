/** Shared types for ER Diagram feature. */

export interface IErColumn {
  name: string;
  type: string;
  pk: boolean;
  fk: boolean;
  nullable: boolean;
}

export interface IErNode {
  table: string;
  x: number;
  y: number;
  width: number;
  height: number;
  columns: IErColumn[];
  rowCount: number;
}

export interface IErEdge {
  from: { table: string; column: string };
  to: { table: string; column: string };
}

export interface IErLayout {
  nodes: IErNode[];
  edges: IErEdge[];
}

export interface IFkContext {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
}

export type LayoutMode = 'auto' | 'hierarchical' | 'clustered';

export interface INodePosition {
  table: string;
  x: number;
  y: number;
}

/** Message from webview to extension. */
export type WebviewToExtMessage =
  | { command: 'nodesMoved'; positions: INodePosition[] }
  | { command: 'export'; format: 'svg' | 'png' | 'mermaid' }
  | { command: 'changeLayout'; mode: LayoutMode }
  | { command: 'tableAction'; table: string; action: 'viewData' | 'seed' | 'profile' }
  | { command: 'refresh' }
  | { command: 'fit' }
  | { command: 'zoomIn' }
  | { command: 'zoomOut' };

/** Message from extension to webview. */
export type ExtToWebviewMessage =
  | { command: 'init'; nodes: IErNode[]; edges: IErEdge[] }
  | { command: 'update'; nodes: IErNode[]; edges: IErEdge[] }
  | { command: 'exported'; format: string; data: string };
