/**
 * Drift Health webview panel (plan 67 R4 / §5).
 *
 * One surface that joins the three suite lenses per table: Advisor's live
 * runtime issues (fetched from /api/issues), Saropa Lints' static findings, and
 * Saropa Log Capture's runtime signals (both read from their workspace mirrors).
 * Advisor hosts this because it is the only tool that has the live data; the
 * static and telemetry sides come from the sibling mirrors written under R2/R3.
 */
import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import {
  diagnosticsFromEnvelope,
  readSiblingDiagnostics,
  type SuiteDiagnostic,
} from './suite-diagnostics';
import { buildDriftHealth } from './drift-health';
import { buildDriftHealthHtml } from './drift-health-html';
import { resolveWorkspaceCommit } from './workspace-commit';

/**
 * Gathers the three tools' diagnostics. Advisor's own envelope is fetched live
 * (best-effort — no notes if the server is down) and relabeled source=advisor
 * so its per-issue detector token does not split it across buckets; the siblings
 * come from their on-disk mirrors.
 */
async function collectDiagnostics(client: DriftApiClient): Promise<SuiteDiagnostic[]> {
  let advisor: SuiteDiagnostic[] = [];
  try {
    advisor = diagnosticsFromEnvelope(await client.issues(), 'advisor', true);
  } catch {
    advisor = [];
  }
  const siblings = await readSiblingDiagnostics();
  return [...advisor, ...siblings];
}

/** Singleton Drift Health panel. */
export class DriftHealthPanel {
  private static _current: DriftHealthPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _client: DriftApiClient;
  private readonly _disposables: vscode.Disposable[] = [];

  static async createOrShow(client: DriftApiClient): Promise<void> {
    const column = vscode.ViewColumn.Beside;
    if (DriftHealthPanel._current) {
      await DriftHealthPanel._current._refresh();
      DriftHealthPanel._current._panel.reveal(column);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'driftHealth',
      'Drift Health',
      column,
      { enableScripts: true },
    );
    DriftHealthPanel._current = new DriftHealthPanel(panel, client);
    await DriftHealthPanel._current._refresh();
  }

  private constructor(panel: vscode.WebviewPanel, client: DriftApiClient) {
    this._panel = panel;
    this._client = client;
    this._panel.onDidDispose(() => this._dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage(
      (msg: { command?: string }) => {
        if (msg?.command === 'refresh') void this._refresh();
      },
      null,
      this._disposables,
    );
  }

  private async _refresh(): Promise<void> {
    // Resolve the current commit so findings captured at a different one are
    // flagged stale (plan 67 R6); undefined when not a git workspace.
    const [diagnostics, currentCommit] = await Promise.all([
      collectDiagnostics(this._client),
      resolveWorkspaceCommit(),
    ]);
    const model = buildDriftHealth(diagnostics);
    this._panel.webview.html = buildDriftHealthHtml(model, currentCommit);
  }

  private _dispose(): void {
    DriftHealthPanel._current = undefined;
    while (this._disposables.length) {
      this._disposables.pop()?.dispose();
    }
  }
}
