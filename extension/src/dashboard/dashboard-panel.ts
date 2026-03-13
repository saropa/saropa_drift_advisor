import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import type {
  IDashboardLayout,
  IHealthScorerProvider,
  WebviewToExtensionMessage,
  WidgetType,
} from './dashboard-types';
import { DashboardState } from './dashboard-state';
import { buildDashboardHtml } from './dashboard-html';
import { handleDashboardMessage } from './panel/message-handler';
import { findNextGridX, findNextGridY, generateId } from './panel/widget-layout';
import { getDefaultWidgetConfig, WidgetDataFetcher } from './widget-data-fetcher';
import { getWidgetDefinition, getWidgetTypeInfoList } from './widget-registry';

/** Singleton webview panel for the custom dashboard builder. */
export class DashboardPanel {
  private static _currentPanel: DashboardPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _disposables: vscode.Disposable[] = [];
  private readonly _client: DriftApiClient;
  private readonly _state: DashboardState;
  private readonly _fetcher: WidgetDataFetcher;
  private _layout: IDashboardLayout;

  /** Get the current panel instance if it exists. */
  static get currentPanel(): DashboardPanel | undefined {
    return DashboardPanel._currentPanel;
  }

  /** Create or show the dashboard panel. */
  static createOrShow(
    extensionUri: vscode.Uri,
    client: DriftApiClient,
    layout: IDashboardLayout,
    state: DashboardState,
    healthScorer?: IHealthScorerProvider,
  ): void {
    const column = vscode.ViewColumn.One;

    if (DashboardPanel._currentPanel) {
      DashboardPanel._currentPanel._updateLayout(layout);
      DashboardPanel._currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'driftDashboard',
      'Dashboard',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      },
    );
    DashboardPanel._currentPanel = new DashboardPanel(panel, client, layout, state, healthScorer);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    client: DriftApiClient,
    layout: IDashboardLayout,
    state: DashboardState,
    healthScorer?: IHealthScorerProvider,
  ) {
    this._panel = panel;
    this._client = client;
    this._layout = layout;
    this._state = state;
    this._fetcher = new WidgetDataFetcher(client, healthScorer);

    this._panel.onDidDispose(() => this._dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage(
      (msg) => this._handleMessage(msg as WebviewToExtensionMessage),
      null,
      this._disposables,
    );

    this._render();
    this._refreshAllWidgets();
  }

  /** Refresh all widgets (called on generation change). */
  async refreshAll(): Promise<void> {
    await this._refreshAllWidgets();
  }

  /** Save the current layout with a new name. */
  saveAs(name: string): void {
    this._layout.name = name;
    this._state.save(this._layout);
    vscode.window.showInformationMessage(`Dashboard "${name}" saved.`);
  }

  private _updateLayout(layout: IDashboardLayout): void {
    this._layout = layout;
    this._render();
    this._refreshAllWidgets();
  }

  private async _render(): Promise<void> {
    const widgetTypes = getWidgetTypeInfoList();
    const initialHtml = new Map<string, string>();
    this._panel.webview.html = buildDashboardHtml(this._layout, widgetTypes, initialHtml);
  }

  private async _refreshAllWidgets(): Promise<void> {
    if (this._layout.widgets.length === 0) return;

    const updates = await this._fetcher.fetchAllAsArray(this._layout.widgets);
    this._panel.webview.postMessage({ command: 'updateAll', updates });
  }

  private async _refreshWidget(id: string): Promise<void> {
    const widget = this._layout.widgets.find((w) => w.id === id);
    if (!widget) return;

    const result = await this._fetcher.fetchOne(widget);
    this._panel.webview.postMessage({
      command: 'updateWidget',
      id: result.id,
      html: result.html,
    });
  }

  private async _handleMessage(msg: WebviewToExtensionMessage): Promise<void> {
    const ctx = this._getMessageContext();
    await handleDashboardMessage(msg, ctx);
  }

  private _getMessageContext() {
    return {
      layout: this._layout,
      state: this._state,
      panel: this._panel,
      saveAndNotify: () => this._saveAndNotify(),
      getWidgetDefinition,
      getDefaultWidgetConfig,
      findNextGridX: () => findNextGridX(this._layout),
      findNextGridY: () => findNextGridY(this._layout),
      generateId,
      getTableNames: () => this._fetcher.getTableNames(),
      refreshWidget: (id: string) => this._refreshWidget(id),
      refreshAllWidgets: () => this._refreshAllWidgets(),
      updateLayout: (layout: IDashboardLayout) => this._updateLayout(layout),
      sendConfigSchema: (type: WidgetType, config: Record<string, unknown>) =>
        this._sendConfigSchema(type, config),
      saveAs: (name: string) => this.saveAs(name),
    };
  }

  private async _sendConfigSchema(
    type: WidgetType,
    existingConfig: Record<string, unknown>,
  ): Promise<void> {
    const def = getWidgetDefinition(type);
    if (!def) return;

    const tables = await this._fetcher.getTableNames();
    this._panel.webview.postMessage({
      command: 'showConfigForm',
      schema: def.configSchema,
      existingConfig: existingConfig || getDefaultWidgetConfig(type),
      tables,
    });
  }

  private _saveAndNotify(): void {
    this._state.save(this._layout);
    this._panel.webview.postMessage({
      command: 'layoutChanged',
      layout: this._layout,
    });
  }

  private _dispose(): void {
    DashboardPanel._currentPanel = undefined;
    this._panel.dispose();
    for (const d of this._disposables) {
      d.dispose();
    }
  }
}
