import * as vscode from 'vscode';
import { EditingBridge } from './editing/editing-bridge';
import { FilterBridge } from './filters/filter-bridge';
import { FkNavigator } from './navigation/fk-navigator';

export class DriftViewerPanel {
  public static currentPanel: DriftViewerPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposed = false;
  private _disposables: vscode.Disposable[] = [];

  /**
   * @param options.vmOnly - When true, connected via VM Service only (no HTTP);
   *   show fallback message instead of loading the web app.
   */
  static createOrShow(
    host: string,
    port: number,
    editingBridge?: EditingBridge,
    fkNavigator?: FkNavigator,
    filterBridge?: FilterBridge,
    options?: { vmOnly?: boolean },
  ): void {
    const column = vscode.ViewColumn.Beside;
    if (DriftViewerPanel.currentPanel) {
      DriftViewerPanel.currentPanel._panel.reveal(column);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'driftViewer',
      'Saropa Drift Advisor',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [],
      },
    );
    DriftViewerPanel.currentPanel = new DriftViewerPanel(
      panel, host, port, editingBridge, fkNavigator, filterBridge, options?.vmOnly,
    );
  }

  private readonly _vmOnly: boolean;

  private constructor(
    panel: vscode.WebviewPanel,
    host: string,
    port: number,
    private readonly _editingBridge?: EditingBridge,
    private readonly _fkNavigator?: FkNavigator,
    private readonly _filterBridge?: FilterBridge,
    vmOnly = false,
  ) {
    this._panel = panel;
    this._vmOnly = vmOnly;
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    if (this._editingBridge) {
      this._editingBridge.attach(this._panel.webview);
    }
    if (this._fkNavigator) {
      this._fkNavigator.attach(this._panel.webview);
    }
    if (this._filterBridge) {
      this._filterBridge.attach(this._panel.webview);
    }

    // Listen for messages from the webview
    this._panel.webview.onDidReceiveMessage(
      (msg) => {
        if (msg.command === 'retry') {
          if (!this._vmOnly) this._loadContent(host, port);
          return;
        }
        // Forward to FK navigator
        if (this._fkNavigator) {
          if (this._fkNavigator.handleMessage(msg)) return;
        }
        // Forward filter messages to the bridge
        if (this._filterBridge) {
          if (this._filterBridge.handleMessage(msg)) return;
        }
        // Forward editing messages to the bridge
        if (this._editingBridge) {
          this._editingBridge.handleMessage(msg);
        }
      },
      null,
      this._disposables,
    );

    if (this._vmOnly) {
      this._showVmOnlyFallback();
    } else {
      this._loadContent(host, port);
    }
  }

  /** Static HTML when connected via VM Service only (no HTTP server to load). */
  private _showVmOnlyFallback(): void {
    this._panel.webview.html = `
      <html><body style="padding:2rem;font-family:system-ui;color:var(--vscode-foreground);max-width:42rem;">
        <h2>Connected via VM Service</h2>
        <p>You're connected to the Drift debug server through the Dart VM Service (debug session). The full web UI is not available in this mode.</p>
        <ul>
          <li>Use the <strong>Database</strong> tree in the sidebar for schema, tables, and running SQL.</li>
          <li><strong>Open in browser</strong> is only available when the app is reachable over HTTP (e.g. same network or port forward).</li>
        </ul>
      </body></html>`;
  }

  private async _loadContent(host: string, port: number): Promise<void> {
    const baseUrl = `http://${host}:${port}`;

    // Show loading state immediately
    this._panel.webview.html = `
      <html><body style="padding:2rem;font-family:system-ui;color:#ccc;">
        <h2>Loading Saropa Drift Advisor\u2026</h2>
        <p>Connecting to <code>${baseUrl}</code></p>
      </body></html>`;

    try {
      const resp = await fetch(baseUrl);
      if (this._disposed) return;

      let html = await resp.text();

      // Inject <base> so relative fetch('/api/...') calls resolve to server
      html = html.replace('<head>', `<head><base href="${baseUrl}/">`);

      // Allow the debug server plus jsDelivr / Google Fonts so the same HTML
      // shell works when /assets/web/* returns 404 (package root unavailable)
      // and onerror falls back to CDN; drift-enhanced.css is injected the same way.
      const csp = [
        `default-src 'none'`,
        `connect-src ${baseUrl}`,
        `style-src 'unsafe-inline' ${baseUrl} https://cdn.jsdelivr.net https://fonts.googleapis.com`,
        `script-src 'unsafe-inline' ${baseUrl} https://cdn.jsdelivr.net`,
        `img-src ${baseUrl} data:`,
        `font-src ${baseUrl} data: https://fonts.gstatic.com`,
      ].join('; ');
      html = html.replace(
        '<head>',
        `<head><meta http-equiv="Content-Security-Policy" content="${csp}">`,
      );

      // Inject editing script if bridge is available
      if (this._editingBridge) {
        const script = EditingBridge.injectedScript();
        html = html.replace('</body>', `<script>${script}</script></body>`);
      }

      // Inject FK navigation script if navigator is available
      if (this._fkNavigator) {
        const fkScript = FkNavigator.injectedScript();
        html = html.replace('</body>', `<script>${fkScript}</script></body>`);
      }

      // Inject filter script if bridge is available
      if (this._filterBridge) {
        const filterScript = FilterBridge.injectedScript();
        html = html.replace('</body>', `<script>${filterScript}</script></body>`);
      }

      this._panel.webview.html = html;
    } catch {
      if (this._disposed) return;
      this._panel.webview.html = `
        <html><body style="padding:2rem;font-family:system-ui;">
          <h2>Cannot connect to Drift debug server</h2>
          <p>Expected server at <code>${baseUrl}</code></p>
          <p>Make sure your Flutter app is running with <code>DriftDebugServer.start()</code>.</p>
          <button onclick="(function(){
            const vscode = acquireVsCodeApi();
            vscode.postMessage({ command: 'retry' });
          })()">Retry</button>
        </body></html>`;
    }
  }

  dispose(): void {
    this._disposed = true;
    DriftViewerPanel.currentPanel = undefined;
    if (this._editingBridge) {
      this._editingBridge.detach();
    }
    if (this._fkNavigator) {
      this._fkNavigator.detach();
    }
    if (this._filterBridge) {
      this._filterBridge.detach();
    }
    this._panel.dispose();
    this._disposables.forEach((d) => d.dispose());
  }
}
