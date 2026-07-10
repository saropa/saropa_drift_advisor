/**
 * Singleton webview panel for the Saropa Drift Tools Hub.
 *
 * Opens immediately with a loading shell, then runs both pane scans (Dashboard
 * snapshot + Health Score) concurrently under one cancellable progress
 * notification and assembles the composed document. A failed or canceled pane
 * renders an inline placeholder without blanking the other — one engine erroring
 * must not take down the whole view. Interactions arrive over untrusted
 * `postMessage`, so command ids are validated to the `driftViewer.` namespace
 * before they reach `executeCommand`.
 */

import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import type { IHealthScorerProvider } from '../dashboard/dashboard-types';
import { buildHealthFragment } from '../health/health-html';
import { readAdvisorSession } from '../refactoring/refactoring-advisor-state';
import { DashboardState } from '../dashboard/dashboard-state';
import { WidgetDataFetcher } from '../dashboard/widget-data-fetcher';
import { buildDashboardFragment } from '../dashboard/dashboard-html';
import { buildHubDocument, buildHubLoadingShell, type PaneRender } from './hub-html';
import { isMonitoringEnabled } from '../monitoring/monitoring-state';
import { secureWebviewHtml } from '../webview-csp';

/** External site opened by the hero "Open website" button. */
const SAROPA_WEBSITE = 'https://saropa.com/';

/** Only commands in this namespace may be dispatched from the webview. */
const COMMAND_PREFIX = 'driftViewer.';

interface HubMessage {
  command: string;
  id?: string;
  actionCommand?: string;
  args?: unknown;
}

export class DriftToolsHubPanel {
  private static _current: DriftToolsHubPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _disposables: vscode.Disposable[] = [];
  private readonly _client: DriftApiClient;
  private readonly _healthScorer: IHealthScorerProvider;
  private readonly _workspaceState: vscode.Memento;
  /** Shared in-flight scan promise — guards against double-spawning scans. */
  private _inflight: Promise<void> | undefined;

  static createOrShow(
    client: DriftApiClient,
    healthScorer: IHealthScorerProvider,
    workspaceState: vscode.Memento,
  ): void {
    const column = vscode.ViewColumn.One;
    if (DriftToolsHubPanel._current) {
      DriftToolsHubPanel._current._panel.reveal(column);
      void DriftToolsHubPanel._current._runAndRender();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'driftToolsHub',
      'Saropa Drift Tools',
      column,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    DriftToolsHubPanel._current = new DriftToolsHubPanel(panel, client, healthScorer, workspaceState);
  }

  /**
   * Re-render the open hub (no-op when closed). Used by the monitoring kill
   * switch so the status card at the top of the hub flips between "Monitoring
   * Active" and "Monitoring Suppressed" the moment the state changes.
   */
  static refreshIfOpen(): void {
    void DriftToolsHubPanel._current?._runAndRender();
  }

  private constructor(
    panel: vscode.WebviewPanel,
    client: DriftApiClient,
    healthScorer: IHealthScorerProvider,
    workspaceState: vscode.Memento,
  ) {
    this._panel = panel;
    this._client = client;
    this._healthScorer = healthScorer;
    this._workspaceState = workspaceState;

    this._panel.onDidDispose(() => this._dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage(
      (msg) => this._handleMessage(msg as HubMessage),
      null,
      this._disposables,
    );

    // Show the skeleton at once so the tab is never blank, then scan.
    this._panel.webview.html = secureWebviewHtml(
      buildHubLoadingShell(isMonitoringEnabled()),
    );
    void this._runAndRender();
  }

  /** Run both pane scans (shared in-flight lock), then assemble the document. */
  private _runAndRender(): Promise<void> {
    if (this._inflight) {
      return this._inflight;
    }
    this._inflight = this._scanAndAssemble().finally(() => {
      this._inflight = undefined;
    });
    return this._inflight;
  }

  private async _scanAndAssemble(): Promise<void> {
    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Loading Saropa Drift Tools…',
          cancellable: true,
        },
        async (_progress, token) => {
          const [dashboard, health] = await Promise.all([
            this._scanDashboard(),
            this._scanHealth(),
          ]);
          // Never write to a panel disposed mid-scan, and skip assembly if the
          // user canceled — the loading shell stays put rather than flashing.
          if (token.isCancellationRequested || this._disposed) {
            return;
          }
          this._panel.webview.html = secureWebviewHtml(
            buildHubDocument(dashboard, health, isMonitoringEnabled()),
          );
        },
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Saropa Drift Tools failed to load: ${msg}`);
    }
  }

  /** Health pane snapshot; any failure collapses to a failed placeholder. */
  private async _scanHealth(): Promise<PaneRender> {
    try {
      const score = await this._healthScorer.compute(this._client);
      const advisor = readAdvisorSession(this._workspaceState);
      const { body, style } = buildHealthFragment(score, 'pane-health', advisor);
      return { ok: true, body, style };
    } catch {
      return { ok: false };
    }
  }

  /** Dashboard pane snapshot with widget data pre-fetched server-side. */
  private async _scanDashboard(): Promise<PaneRender> {
    try {
      const state = new DashboardState(this._workspaceState);
      const layout = state.load() ?? DashboardState.createDefault();
      const fetcher = new WidgetDataFetcher(this._client, this._healthScorer);
      const data = await fetcher.fetchAllAsArray(layout.widgets);
      const widgetHtml = new Map(data.map((d) => [d.id, d.html]));
      const { body, style } = buildDashboardFragment(layout, widgetHtml, 'pane-dashboard');
      return { ok: true, body, style };
    } catch {
      return { ok: false };
    }
  }

  private _handleMessage(msg: HubMessage): void {
    switch (msg.command) {
      // Tiles and "Open full screen" both route here with a namespaced id.
      case 'runCommand':
      case 'openCommand':
        this._runDriftCommand(msg.id);
        break;
      // Drill-down from an embedded Health card action button.
      case 'executeAction':
        if (this._isDriftCommand(msg.actionCommand)) {
          void vscode.commands.executeCommand(msg.actionCommand as string, msg.args);
        }
        break;
      case 'openWebsite':
        void vscode.env.openExternal(vscode.Uri.parse(SAROPA_WEBSITE));
        break;
      case 'rescan':
        void this._runAndRender();
        break;
    }
  }

  /** Forward an id to executeCommand only if it is a Drift Advisor command. */
  private _runDriftCommand(id?: string): void {
    if (this._isDriftCommand(id)) {
      void vscode.commands.executeCommand(id as string);
    }
  }

  private _isDriftCommand(id?: string): boolean {
    return typeof id === 'string' && id.startsWith(COMMAND_PREFIX);
  }

  private _disposed = false;

  private _dispose(): void {
    this._disposed = true;
    DriftToolsHubPanel._current = undefined;
    this._panel.dispose();
    for (const d of this._disposables) {
      d.dispose();
    }
  }
}
