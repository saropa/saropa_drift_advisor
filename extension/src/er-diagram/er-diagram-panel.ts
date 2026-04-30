/**
 * Singleton webview panel for ER Diagram display.
 * Follows the HealthPanel / DiagramPanel pattern.
 */

import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import type { IErLayout, LayoutMode, WebviewToExtMessage } from './er-diagram-types';
import { ErLayoutEngine } from './er-layout-engine';
import { ErExport } from './er-export';
import { buildErDiagramHtml } from './er-diagram-html';
import { fetchAllFks } from './er-diagram-utils';

export class ErDiagramPanel {
  private static _currentPanel: ErDiagramPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _disposables: vscode.Disposable[] = [];
  private readonly _client: DriftApiClient;
  private _layout: IErLayout;
  private _mode: LayoutMode = 'auto';

  static get currentPanel(): ErDiagramPanel | undefined {
    return ErDiagramPanel._currentPanel;
  }

  static createOrShow(
    client: DriftApiClient,
    layout: IErLayout,
    mode: LayoutMode = 'auto',
    focusTable?: string,
  ): void {
    const column = vscode.ViewColumn.Beside;

    if (ErDiagramPanel._currentPanel) {
      ErDiagramPanel._currentPanel._update(layout, mode);
      ErDiagramPanel._currentPanel._panel.reveal(column);
      if (focusTable) {
        setTimeout(() => {
          void ErDiagramPanel._currentPanel?._panel.webview.postMessage({
            command: 'focusTable',
            table: focusTable,
          });
        }, 200);
      }
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'driftErDiagram',
      'ER Diagram',
      column,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    ErDiagramPanel._currentPanel = new ErDiagramPanel(panel, client, layout, mode, focusTable);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    client: DriftApiClient,
    layout: IErLayout,
    mode: LayoutMode,
    focusTable?: string,
  ) {
    this._panel = panel;
    this._client = client;
    this._layout = layout;
    this._mode = mode;

    this._panel.onDidDispose(
      () => this._dispose(), null, this._disposables,
    );
    this._panel.webview.onDidReceiveMessage(
      (msg) => this._handleMessage(msg as WebviewToExtMessage),
      null,
      this._disposables,
    );
    this._render();
    if (focusTable) {
      const t = focusTable;
      setTimeout(() => {
        void this._panel.webview.postMessage({ command: 'focusTable', table: t });
      }, 200);
    }
  }

  async refresh(): Promise<void> {
    try {
      const meta = await this._client.schemaMetadata();
      const allFks = await fetchAllFks(this._client, meta.map((t) => t.name));
      const engine = new ErLayoutEngine();
      const layout = engine.layout(meta, allFks, this._mode);
      this._update(layout, this._mode);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`ER Diagram refresh failed: ${msg}`);
    }
  }

  private _update(layout: IErLayout, mode: LayoutMode): void {
    this._layout = layout;
    this._mode = mode;
    this._panel.title = 'ER Diagram';
    this._render();
  }

  private _render(): void {
    this._panel.webview.html = buildErDiagramHtml(
      this._layout.nodes,
      this._layout.edges,
      this._mode,
    );
  }

  private async _handleMessage(msg: WebviewToExtMessage): Promise<void> {
    switch (msg.command) {
      case 'refresh':
        await this.refresh();
        break;

      case 'changeLayout':
        await this._changeLayout(msg.mode);
        break;

      case 'export':
        await this._export(msg.format);
        break;

      case 'tableAction':
        this._executeTableAction(msg.table, msg.action);
        break;

      case 'nodesMoved':
        // Update internal positions (already handled in webview)
        for (const pos of msg.positions) {
          const node = this._layout.nodes.find((n) => n.table === pos.table);
          if (node) {
            node.x = pos.x;
            node.y = pos.y;
          }
        }
        break;

      case 'fit':
      case 'zoomIn':
      case 'zoomOut':
        // These are handled entirely in the webview
        break;
    }
  }

  private async _changeLayout(mode: LayoutMode): Promise<void> {
    try {
      const meta = await this._client.schemaMetadata();
      const allFks = await fetchAllFks(this._client, meta.map((t) => t.name));
      const engine = new ErLayoutEngine();
      const layout = engine.layout(meta, allFks, mode);
      this._mode = mode;
      this._layout = layout;
      // Send update to webview
      this._panel.webview.postMessage({
        command: 'update',
        nodes: layout.nodes,
        edges: layout.edges,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Layout change failed: ${msg}`);
    }
  }

  private async _export(format: 'svg' | 'png' | 'mermaid'): Promise<void> {
    const exporter = new ErExport();

    try {
      let content: string;
      let fileExt: string;
      let fileFilter: Record<string, string[]>;

      switch (format) {
        case 'svg':
          content = exporter.toSvg(this._layout.nodes, this._layout.edges);
          fileExt = 'svg';
          fileFilter = { 'SVG': ['svg'] };
          break;
        case 'mermaid':
          content = exporter.toMermaid(this._layout.nodes, this._layout.edges);
          fileExt = 'md';
          fileFilter = { 'Markdown': ['md'] };
          break;
        case 'png':
          // PNG export requires webview canvas rendering
          // For now, export as SVG with a note
          vscode.window.showInformationMessage(
            'PNG export: Copy the SVG and convert to PNG using an external tool.',
          );
          content = exporter.toSvg(this._layout.nodes, this._layout.edges);
          fileExt = 'svg';
          fileFilter = { 'SVG': ['svg'] };
          break;
        default:
          return;
      }

      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(`er-diagram.${fileExt}`),
        filters: fileFilter,
      });

      if (uri) {
        await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
        vscode.window.showInformationMessage(`ER Diagram exported to ${uri.fsPath}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Export failed: ${msg}`);
    }
  }

  private _executeTableAction(
    table: string,
    action: 'viewData' | 'seed' | 'profile',
  ): void {
    switch (action) {
      case 'viewData':
        vscode.commands.executeCommand('driftViewer.viewTableInPanel', table);
        break;
      case 'seed':
        vscode.commands.executeCommand('driftViewer.seedTable', table);
        break;
      case 'profile':
        // Profile requires a column, so open the table first
        vscode.commands.executeCommand('driftViewer.viewTableInPanel', table);
        break;
    }
  }

  private _dispose(): void {
    ErDiagramPanel._currentPanel = undefined;
    this._panel.dispose();
    for (const d of this._disposables) {
      d.dispose();
    }
  }
}
