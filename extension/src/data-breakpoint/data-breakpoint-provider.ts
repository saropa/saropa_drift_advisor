import * as vscode from 'vscode';
import { DriftApiClient } from '../api-client';
import { DataBreakpointChecker } from './data-breakpoint-checker';
import type {
  DataBreakpointType,
  IBreakpointHit,
  IDataBreakpoint,
} from './data-breakpoint-types';

/**
 * Manages data breakpoint definitions and triggers evaluation
 * on each generation change while a debug session is active.
 */
export class DataBreakpointProvider implements vscode.Disposable {
  private readonly _breakpoints: IDataBreakpoint[] = [];
  private readonly _checker: DataBreakpointChecker;
  private _evaluating = false;
  private _nextId = 1;

  constructor(client: DriftApiClient) {
    this._checker = new DataBreakpointChecker(client);
  }

  /** All registered breakpoints. */
  get breakpoints(): readonly IDataBreakpoint[] {
    return this._breakpoints;
  }

  /** Add a new data breakpoint. */
  add(
    table: string,
    type: DataBreakpointType,
    condition?: string,
  ): IDataBreakpoint {
    const label = this._buildLabel(table, type, condition);
    const bp: IDataBreakpoint = {
      id: `dbp-${this._nextId++}`,
      label,
      table,
      type,
      condition,
      enabled: true,
      hitCount: 0,
    };
    this._breakpoints.push(bp);
    return bp;
  }

  /** Remove a breakpoint by id. */
  remove(id: string): void {
    const idx = this._breakpoints.findIndex((bp) => bp.id === id);
    if (idx >= 0) {
      this._breakpoints.splice(idx, 1);
    }
  }

  /** Toggle a breakpoint's enabled state. */
  toggle(id: string): void {
    const bp = this._breakpoints.find((b) => b.id === id);
    if (bp) {
      bp.enabled = !bp.enabled;
    }
  }

  /**
   * Called on each generation change. Evaluates all enabled breakpoints
   * if a debug session is active. Skips if already evaluating.
   */
  async onGenerationChange(): Promise<void> {
    if (!vscode.debug.activeDebugSession || this._evaluating) {
      return;
    }

    const cfg = vscode.workspace.getConfiguration('driftViewer');
    if (!cfg.get<boolean>('dataBreakpoints.enabled', true)) {
      return;
    }

    this._evaluating = true;
    try {
      const enabled = this._breakpoints.filter((bp) => bp.enabled);
      for (const bp of enabled) {
        try {
          const hit = await this._checker.evaluate(bp);
          if (hit) {
            bp.hitCount++;
            this._onBreakpointHit(hit);
          }
        } catch {
          // Query failed — skip this breakpoint silently
        }
      }
    } finally {
      this._evaluating = false;
    }
  }

  dispose(): void {
    this._breakpoints.length = 0;
  }

  // --- Private --------------------------------------------------------------

  private _onBreakpointHit(hit: IBreakpointHit): void {
    vscode.commands.executeCommand('workbench.action.debug.pause');

    const detail =
      hit.message ?? `${hit.matchCount} row(s) match`;
    vscode.window
      .showWarningMessage(
        `Data breakpoint hit: ${hit.breakpoint.label} (${detail})`,
        'View Rows',
      )
      .then((action) => {
        if (action === 'View Rows' && hit.rows) {
          this._showMatchingRows(hit);
        }
      });
  }

  private async _showMatchingRows(hit: IBreakpointHit): Promise<void> {
    const doc = await vscode.workspace.openTextDocument({
      content: JSON.stringify(hit.rows, null, 2),
      language: 'json',
    });
    await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
  }

  private _buildLabel(
    table: string,
    type: DataBreakpointType,
    condition?: string,
  ): string {
    switch (type) {
      case 'conditionMet':
        return condition ?? table;
      case 'rowInserted':
        return `${table}: row inserted`;
      case 'rowDeleted':
        return `${table}: row deleted`;
      case 'rowChanged':
        return `${table}: data changed`;
    }
  }
}
