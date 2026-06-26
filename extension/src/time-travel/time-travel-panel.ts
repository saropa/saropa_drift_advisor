/**
 * Time-Travel panel (Feature 60, Phase 3): the webview that hosts the slider.
 *
 * Singleton panel. It owns a {@link TimeTravelEngine} over the shared {@link SnapshotStore} and
 * translates webview messages into engine queries:
 *   - `ready`               → send the table list, snapshot range, and the initial frame
 *   - `seekTo` / `setTable` → recompute and post the new frame
 * Playback is client-side (the webview drives the timer and posts successive `seekTo`s), so the
 * extension only ever computes one frame per message — the heavy diff never blocks the UI thread.
 *
 * When the snapshot store changes while the panel is open (a new capture lands), the panel
 * refreshes the range and re-renders the current frame so the timeline stays live.
 */

import * as vscode from 'vscode';
import { SnapshotStore } from '../timeline/snapshot-store';
import { TimeTravelEngine } from './time-travel-engine';
import { buildTimeTravelHtml } from './time-travel-html';
import { secureWebviewHtml } from '../webview-csp';

export class TimeTravelPanel {
  private static _current: TimeTravelPanel | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private readonly _engine: TimeTravelEngine;
  private readonly _store: SnapshotStore;
  private readonly _disposables: vscode.Disposable[] = [];
  private _table: string;
  private _index = 0;

  /** Open (or reveal) the panel focused on {@link initialTable}. */
  static createOrShow(store: SnapshotStore, initialTable: string): void {
    const column = vscode.ViewColumn.Beside;
    if (TimeTravelPanel._current) {
      TimeTravelPanel._current._panel.reveal(column);
      TimeTravelPanel._current.focusTable(initialTable);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'driftTimeTravel',
      `Time Travel: ${initialTable}`,
      column,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    TimeTravelPanel._current = new TimeTravelPanel(panel, store, initialTable);
  }

  private constructor(panel: vscode.WebviewPanel, store: SnapshotStore, initialTable: string) {
    this._panel = panel;
    this._store = store;
    this._engine = new TimeTravelEngine(store);
    this._table = initialTable;
    // Start at the most recent snapshot so the panel opens on "now", not the oldest frame.
    this._index = Math.max(0, this._engine.getSnapshotCount() - 1);

    this._panel.webview.html = secureWebviewHtml(buildTimeTravelHtml());

    this._panel.webview.onDidReceiveMessage(
      (msg) => this._onMessage(msg),
      null,
      this._disposables,
    );
    // Keep the open panel live as new snapshots are captured.
    this._disposables.push(
      store.onDidChange(() => this._sendInfoAndState()),
    );
    this._panel.onDidDispose(() => this._dispose(), null, this._disposables);
  }

  /** Re-point an already-open panel at a different table (from a second context-menu click). */
  focusTable(table: string): void {
    this._table = table;
    this._index = Math.max(0, this._engine.getSnapshotCount() - 1);
    this._panel.title = `Time Travel: ${table}`;
    this._sendTables();
    this._sendInfoAndState();
  }

  private _onMessage(msg: { command: string; index?: number; table?: string }): void {
    switch (msg.command) {
      case 'ready':
        this._panel.title = `Time Travel: ${this._table}`;
        this._sendTables();
        this._sendInfoAndState();
        void this._sendCapabilities();
        break;
      case 'seekTo':
        if (typeof msg.index === 'number') {
          this._index = msg.index;
          this._sendState();
        }
        break;
      case 'setTable':
        if (typeof msg.table === 'string') {
          this._table = msg.table;
          this._panel.title = `Time Travel: ${this._table}`;
          this._sendState();
        }
        break;
      case 'createBranch':
        void this._createBranchHere();
        break;
      default:
        break;
    }
  }

  /**
   * Tell the webview whether "Create Branch Here" is available. The button is hidden unless Data
   * Branching (Feature 37) registered its command, so the panel stays functional on its own when
   * that module failed to load (each feature module is registered in isolation) — the plan's
   * "when absent, hidden not broken" gate.
   */
  private async _sendCapabilities(): Promise<void> {
    const commands = await vscode.commands.getCommands(true);
    const canBranch = commands.includes('driftViewer.branchFromSnapshot');
    void this._panel.webview.postMessage({ command: 'capabilities', canBranch });
  }

  /** Branch the snapshot at the current slider position (delegates to Feature 37's command). */
  private async _createBranchHere(): Promise<void> {
    const snapshot = this._store.snapshots[this._index];
    if (!snapshot) {
      void vscode.window.showInformationMessage(
        'No snapshot at the current position to branch from.',
      );
      return;
    }
    await vscode.commands.executeCommand('driftViewer.branchFromSnapshot', snapshot);
  }

  private _sendTables(): void {
    const names = this._engine.getTableNames();
    // Ensure the requested table appears even if it has no captured snapshot yet.
    if (this._table && !names.includes(this._table)) names.unshift(this._table);
    void this._panel.webview.postMessage({ command: 'tables', names, selected: this._table });
  }

  private _sendInfoAndState(): void {
    const count = this._engine.getSnapshotCount();
    // Clamp the index if snapshots were trimmed by the rolling window since the last frame.
    if (this._index > count - 1) this._index = Math.max(0, count - 1);
    void this._panel.webview.postMessage({ command: 'snapshotInfo', count });
    this._sendState();
  }

  private _sendState(): void {
    const state = this._engine.getStateAt(this._table, this._index);
    void this._panel.webview.postMessage({ command: 'state', state });
  }

  private _dispose(): void {
    TimeTravelPanel._current = undefined;
    this._panel.dispose();
    for (const d of this._disposables) d.dispose();
  }
}
