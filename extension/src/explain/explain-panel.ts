/**
 * WebviewPanel for EXPLAIN QUERY PLAN visualization.
 * Builds a tree from flat EXPLAIN rows and renders via explain-html.
 */

import * as vscode from 'vscode';
import { IndexSuggestion } from '../api-client';
import { buildExplainHtml, buildPlanText } from './explain-html';

export interface IExplainNode {
  id: number;
  parent: number;
  detail: string;
  children: IExplainNode[];
  scanType: 'search' | 'scan' | 'temp' | 'other';
}

/** Classify a detail string into a scan type. */
export function classifyScanType(
  detail: string,
): 'search' | 'scan' | 'temp' | 'other' {
  const upper = detail.toUpperCase();
  if (upper.includes('SEARCH')) return 'search';
  if (upper.includes('SCAN TABLE') || upper.includes('SCAN SUBQUERY')) {
    return 'scan';
  }
  if (upper.includes('TEMP B-TREE') || upper.includes('USE TEMP')) {
    return 'temp';
  }
  return 'other';
}

/**
 * Build a tree from flat EXPLAIN QUERY PLAN rows.
 * Each row has `id`, `parent`, and `detail` fields.
 */
export function buildExplainTree(
  rows: Record<string, unknown>[],
): IExplainNode[] {
  const nodes = new Map<number, IExplainNode>();

  for (const row of rows) {
    const id = Number(row['id'] ?? row['selectid'] ?? 0);
    const parent = Number(row['parent'] ?? 0);
    const detail = String(row['detail'] ?? '');
    nodes.set(id, {
      id,
      parent,
      detail,
      children: [],
      scanType: classifyScanType(detail),
    });
  }

  const roots: IExplainNode[] = [];
  for (const node of nodes.values()) {
    const parentNode = nodes.get(node.parent);
    if (parentNode && parentNode !== node) {
      parentNode.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

/** Extract table names that have SCAN (full table scan) in the plan. */
export function findScannedTables(nodes: IExplainNode[]): string[] {
  const tables: string[] = [];
  for (const node of nodes) {
    if (node.scanType === 'scan') {
      const m = /\bSCAN TABLE\s+(\w+)/i.exec(node.detail);
      if (m) tables.push(m[1]);
    }
    tables.push(...findScannedTables(node.children));
  }
  return tables;
}

/** Filter index suggestions to those relevant to scanned tables. */
function filterSuggestions(
  suggestions: IndexSuggestion[],
  scannedTables: string[],
): IndexSuggestion[] {
  const lower = new Set(scannedTables.map((t) => t.toLowerCase()));
  return suggestions.filter((s) => lower.has(s.table.toLowerCase()));
}

/** Singleton webview panel for explain plan visualization. */
export class ExplainPanel {
  private static _currentPanel: ExplainPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _disposables: vscode.Disposable[] = [];
  private _sql: string;
  private _nodes: IExplainNode[];
  private _suggestions: IndexSuggestion[];

  static createOrShow(
    sql: string,
    result: { rows: Record<string, unknown>[]; sql: string },
    allSuggestions: IndexSuggestion[],
  ): void {
    const nodes = buildExplainTree(result.rows);
    const scanned = findScannedTables(nodes);
    const suggestions = filterSuggestions(allSuggestions, scanned);
    const column = vscode.ViewColumn.Beside;

    if (ExplainPanel._currentPanel) {
      ExplainPanel._currentPanel._update(sql, nodes, suggestions);
      ExplainPanel._currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'driftExplain',
      'Explain: Query Plan',
      column,
      { enableScripts: true },
    );
    ExplainPanel._currentPanel = new ExplainPanel(
      panel, sql, nodes, suggestions,
    );
  }

  private constructor(
    panel: vscode.WebviewPanel,
    sql: string,
    nodes: IExplainNode[],
    suggestions: IndexSuggestion[],
  ) {
    this._panel = panel;
    this._sql = sql;
    this._nodes = nodes;
    this._suggestions = suggestions;

    this._panel.onDidDispose(
      () => this._dispose(), null, this._disposables,
    );

    this._panel.webview.onDidReceiveMessage(
      (msg) => this._handleMessage(msg),
      null,
      this._disposables,
    );

    this._render();
  }

  private _update(
    sql: string,
    nodes: IExplainNode[],
    suggestions: IndexSuggestion[],
  ): void {
    this._sql = sql;
    this._nodes = nodes;
    this._suggestions = suggestions;
    this._panel.title = 'Explain: Query Plan';
    this._render();
  }

  private _render(): void {
    this._panel.webview.html = buildExplainHtml(
      this._sql, this._nodes, this._suggestions,
    );
  }

  private _handleMessage(msg: { command: string; index?: number }): void {
    switch (msg.command) {
      case 'copySql':
        vscode.env.clipboard.writeText(this._sql);
        break;
      case 'copyPlan':
        vscode.env.clipboard.writeText(buildPlanText(this._nodes));
        break;
      case 'copySuggestion':
        if (
          msg.index !== undefined
          && msg.index >= 0
          && msg.index < this._suggestions.length
        ) {
          vscode.env.clipboard.writeText(this._suggestions[msg.index].sql);
        }
        break;
    }
  }

  private _dispose(): void {
    ExplainPanel._currentPanel = undefined;
    this._panel.dispose();
    for (const d of this._disposables) {
      d.dispose();
    }
  }
}
