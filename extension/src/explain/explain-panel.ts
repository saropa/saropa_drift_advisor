/**
 * WebviewPanel for EXPLAIN QUERY PLAN visualization.
 * Builds a tree from flat EXPLAIN rows and renders via explain-html.
 */

import * as vscode from 'vscode';
import type { IndexSuggestion } from '../api-client';
import { buildExplainHtml, buildPlanText } from './explain-html';
import {
  readSiblingDiagnostics,
  relatedDiagnostics,
  type SuiteDiagnostic,
} from '../suite/suite-diagnostics';
import {
  availableCommandSet,
  executeSuiteFix,
  type SuiteRenderOptions,
} from '../suite/suite-notes-html';
import { secureWebviewHtml } from '../webview-csp';

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

/**
 * Extract every table named in the plan (both SCAN TABLE and SEARCH TABLE),
 * used to relate sibling-tool findings to this query. Broader than
 * [findScannedTables], which is intentionally limited to full scans for index
 * suggestions — a Lints finding about a table is relevant however that table is
 * accessed.
 */
export function findReferencedTables(nodes: IExplainNode[]): string[] {
  const tables: string[] = [];
  for (const node of nodes) {
    const m = /\bTABLE\s+(\w+)/i.exec(node.detail);
    if (m) tables.push(m[1]);
    tables.push(...findReferencedTables(node.children));
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
  private _suiteNotes: SuiteDiagnostic[];
  private _suiteOpts: SuiteRenderOptions;

  static async createOrShow(
    sql: string,
    result: { rows: Record<string, unknown>[]; sql: string },
    allSuggestions: IndexSuggestion[],
  ): Promise<void> {
    const nodes = buildExplainTree(result.rows);
    const scanned = findScannedTables(nodes);
    const suggestions = filterSuggestions(allSuggestions, scanned);
    // Cross-tool context (plan 67 R3): findings the sibling tools left for the
    // tables/SQL in this plan. Best-effort — readSiblingDiagnostics never throws,
    // so a missing or bad sibling mirror just yields no notes.
    const suiteNotes = relatedDiagnostics(await readSiblingDiagnostics(), {
      tables: findReferencedTables(nodes),
      sql,
    });
    // Gate fix-action buttons to commands the host actually has (plan 67 R1).
    const suiteOpts: SuiteRenderOptions = {
      availableCommands: await availableCommandSet(),
    };
    const column = vscode.ViewColumn.Beside;

    if (ExplainPanel._currentPanel) {
      ExplainPanel._currentPanel._update(sql, nodes, suggestions, suiteNotes, suiteOpts);
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
      panel, sql, nodes, suggestions, suiteNotes, suiteOpts,
    );
  }

  private constructor(
    panel: vscode.WebviewPanel,
    sql: string,
    nodes: IExplainNode[],
    suggestions: IndexSuggestion[],
    suiteNotes: SuiteDiagnostic[],
    suiteOpts: SuiteRenderOptions,
  ) {
    this._panel = panel;
    this._sql = sql;
    this._nodes = nodes;
    this._suggestions = suggestions;
    this._suiteNotes = suiteNotes;
    this._suiteOpts = suiteOpts;

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
    suiteNotes: SuiteDiagnostic[],
    suiteOpts: SuiteRenderOptions,
  ): void {
    this._sql = sql;
    this._nodes = nodes;
    this._suggestions = suggestions;
    this._suiteNotes = suiteNotes;
    this._suiteOpts = suiteOpts;
    this._panel.title = 'Explain: Query Plan';
    this._render();
  }

  private _render(): void {
    this._panel.webview.html = secureWebviewHtml(buildExplainHtml(
      this._sql, this._nodes, this._suggestions, this._suiteNotes, this._suiteOpts,
    ));
  }

  private _handleMessage(msg: {
    command: string;
    index?: number;
    fixCommand?: unknown;
    fixArgs?: unknown;
  }): void {
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
      // Cross-tool deep-link (plan 67 R1). executeSuiteFix re-validates the
      // command against the allowlist + registered set before running it.
      case 'suiteFix':
        void executeSuiteFix(msg);
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
