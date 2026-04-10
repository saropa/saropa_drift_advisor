/**
 * Generic analysis comparison panel.
 * Opens a webview showing a side-by-side diff of two saved analysis snapshots.
 * Each analysis type provides its own HTML renderer via a callback.
 */

import * as vscode from 'vscode';
import type { IAnalysisSnapshot } from './analysis-history-store';
import { buildCompareHtml } from './analysis-compare-html';

/**
 * Renders a single analysis snapshot as an HTML fragment (no <html>/<body>).
 * Used inside the left/right columns of the compare panel.
 */
export type SnapshotRenderer<T> = (data: T) => string;

/**
 * Produces a short text summary of the diff between two snapshots.
 * Shown above the side-by-side columns.
 */
export type DiffSummarizer<T> = (before: T, after: T) => string;

/** Singleton compare panel — reused across analysis types. */
export class AnalysisComparePanel {
  private static _currentPanel: AnalysisComparePanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _disposables: vscode.Disposable[] = [];

  /**
   * Open (or replace) the compare panel for a given analysis type.
   * The generic type parameter is captured in closures so the class
   * itself does not need to be generic.
   */
  static show<T>(
    title: string,
    snapshots: readonly IAnalysisSnapshot<T>[],
    current: T,
    renderer: SnapshotRenderer<T>,
    summarizer: DiffSummarizer<T>,
  ): void {
    // Close any existing compare panel so we don't stack them
    if (AnalysisComparePanel._currentPanel) {
      AnalysisComparePanel._currentPanel._panel.dispose();
    }

    const panel = vscode.window.createWebviewPanel(
      'driftAnalysisCompare',
      `Compare: ${title}`,
      vscode.ViewColumn.Active,
      { enableScripts: true },
    );

    // Build a message handler that closes over the typed arguments
    const handleMessage = (
      msg: { command: string; beforeId?: string; afterId?: string },
    ): void => {
      if (msg.command !== 'compare') return;

      const resolve = (id: string | undefined): T | undefined => {
        if (id === '_current') return current;
        if (!id) return undefined;
        const snap = snapshots.find((s) => s.id === id);
        return snap?.data;
      };
      const before = resolve(msg.beforeId);
      const after = resolve(msg.afterId);

      const payload: {
        command: string;
        beforeHtml?: string;
        afterHtml?: string;
        summary?: string;
      } = { command: 'compareResult' };

      if (before) payload.beforeHtml = renderer(before);
      if (after) payload.afterHtml = renderer(after);
      if (before && after) payload.summary = summarizer(before, after);

      void panel.webview.postMessage(payload);
    };

    AnalysisComparePanel._currentPanel =
      new AnalysisComparePanel(panel, title, snapshots, handleMessage);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    title: string,
    snapshots: readonly IAnalysisSnapshot<unknown>[],
    handleMessage: (msg: { command: string; beforeId?: string; afterId?: string }) => void,
  ) {
    this._panel = panel;

    this._panel.onDidDispose(
      () => this._dispose(), null, this._disposables,
    );
    this._panel.webview.onDidReceiveMessage(
      handleMessage, null, this._disposables,
    );

    // Initial render with empty selection
    this._panel.webview.html = buildCompareHtml(title, snapshots);
  }

  private _dispose(): void {
    AnalysisComparePanel._currentPanel = undefined;
    this._panel.dispose();
    for (const d of this._disposables) {
      d.dispose();
    }
  }
}
