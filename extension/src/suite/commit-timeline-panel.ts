/**
 * Suite Commit Timeline webview panel (plan 67 R6 / §6).
 *
 * Renders the accumulated per-commit finding history (read from
 * `.saropa/diagnostics/history.json`) as a trend: which commits added or cleared
 * suite issues. Read-only; refreshes on open, on its Refresh button, and on each
 * generation tick while visible (the same data-change signal that records new
 * snapshots, so the trend stays live during a session).
 */
import * as vscode from 'vscode';
import type { GenerationWatcher } from '../generation-watcher';
import { readCommitHistory } from './commit-history-store';
import { buildCommitTimeline } from './commit-timeline';
import { buildCommitTimelineHtml } from './commit-timeline-html';
import { resolveWorkspaceCommit } from './workspace-commit';
import { secureWebviewHtml } from '../webview-csp';

// Coalesce generation-watcher bursts so the panel re-reads history once, not
// per tick — matching the Drift Health panel's debounce.
const REFRESH_DEBOUNCE_MS = 1200;

/** Singleton Commit Timeline panel. */
export class CommitTimelinePanel {
  private static _current: CommitTimelinePanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _disposables: vscode.Disposable[] = [];
  private _refreshTimer: ReturnType<typeof setTimeout> | undefined;

  static async createOrShow(watcher?: GenerationWatcher): Promise<void> {
    const column = vscode.ViewColumn.Beside;
    if (CommitTimelinePanel._current) {
      await CommitTimelinePanel._current._refresh();
      CommitTimelinePanel._current._panel.reveal(column);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'driftCommitTimeline',
      'Suite Commit Timeline',
      column,
      { enableScripts: true },
    );
    CommitTimelinePanel._current = new CommitTimelinePanel(panel, watcher);
    await CommitTimelinePanel._current._refresh();
  }

  private constructor(panel: vscode.WebviewPanel, watcher?: GenerationWatcher) {
    this._panel = panel;
    this._panel.onDidDispose(() => this._dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage(
      (msg: { command?: string }) => {
        if (msg?.command === 'refresh') void this._refresh();
      },
      null,
      this._disposables,
    );

    // Auto-refresh on data change, debounced and only while visible — the same
    // tick that records a new snapshot should update the open timeline.
    if (watcher) {
      this._disposables.push(
        watcher.onDidChange(() => {
          if (!this._panel.visible) return;
          if (this._refreshTimer) clearTimeout(this._refreshTimer);
          this._refreshTimer = setTimeout(() => {
            this._refreshTimer = undefined;
            void this._refresh();
          }, REFRESH_DEBOUNCE_MS);
        }),
      );
    }
  }

  private async _refresh(): Promise<void> {
    const [history, currentCommit] = await Promise.all([
      readCommitHistory(),
      resolveWorkspaceCommit(),
    ]);
    const model = buildCommitTimeline(history, currentCommit);
    this._panel.webview.html = secureWebviewHtml(buildCommitTimelineHtml(model));
  }

  private _dispose(): void {
    CommitTimelinePanel._current = undefined;
    if (this._refreshTimer) clearTimeout(this._refreshTimer);
    while (this._disposables.length) {
      this._disposables.pop()?.dispose();
    }
  }
}
