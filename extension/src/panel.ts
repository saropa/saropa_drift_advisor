/**
 * DriftViewerPanel — singleton webview that displays the Drift Advisor
 * web UI inside VS Code.
 *
 * **Server-switch handling**: when `createOrShow` is called with a
 * different host/port than the current panel, the webview content is
 * fully reloaded from the new server. A monotonic `_loadSeq` counter
 * guards against race conditions when two switches happen in quick
 * succession (only the most recent fetch writes its HTML).
 *
 * **Retry**: the webview "Retry" button posts a `{ command: 'retry' }`
 * message. The handler always uses the panel's current `_host`/`_port`
 * so that retry targets the correct server even after a switch.
 */
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
   * Creates a new webview panel or reveals the existing one.
   *
   * If a panel already exists and the host/port changed (different
   * project), the content is reloaded from the new server rather
   * than showing stale data from the previous project.
   *
   * @param options.vmOnly - When true, connected via VM Service only
   *   (no HTTP); show fallback message instead of loading the web app.
   */
  static createOrShow(
    host: string,
    port: number,
    editingBridge?: EditingBridge,
    fkNavigator?: FkNavigator,
    filterBridge?: FilterBridge,
    options?: { vmOnly?: boolean; focusTable?: string },
  ): void {
    const column = vscode.ViewColumn.Beside;
    const focusTable = options?.focusTable?.trim() || undefined;
    if (DriftViewerPanel.currentPanel) {
      // If the server changed (different project), reload content
      // instead of just revealing the stale panel.
      const cur = DriftViewerPanel.currentPanel;
      if (focusTable) cur._focusTable = focusTable;
      if (cur._host !== host || cur._port !== port) {
        cur._host = host;
        cur._port = port;
        if (cur._vmOnly) {
          cur._showVmOnlyFallback();
        } else {
          cur._loadContent(host, port);
        }
      } else if (focusTable && !cur._vmOnly) {
        // Same server, but a sibling deep-link (plan 67 R5) asked to focus a
        // specific table. The web app reads its `#TableName` deep-link only on
        // load, so reload the content to re-fire it against the new table.
        cur._loadContent(host, port);
      }
      cur._panel.reveal(column);
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
      panel, host, port, editingBridge, fkNavigator, filterBridge, options?.vmOnly, focusTable,
    );
  }

  private readonly _vmOnly: boolean;
  private _host: string;
  private _port: number;
  /**
   * Table to deep-link to on the next content load (plan 67 R5). When set, the
   * loaded web app's existing `#TableName` deep-link is fired so a sibling tool's
   * "open table" lands on that table rather than the default view. Mutable: a
   * later focus request on the reused panel overwrites it before a reload.
   */
  private _focusTable?: string;

  /**
   * Monotonic load sequence counter. Incremented at the start of each
   * `_loadContent` call; the async continuation only writes HTML when
   * its captured sequence matches the current value. This prevents a
   * slow response from an earlier server overwriting a later one.
   */
  private _loadSeq = 0;

  private constructor(
    panel: vscode.WebviewPanel,
    host: string,
    port: number,
    private readonly _editingBridge?: EditingBridge,
    private readonly _fkNavigator?: FkNavigator,
    private readonly _filterBridge?: FilterBridge,
    vmOnly = false,
    focusTable?: string,
  ) {
    this._panel = panel;
    this._vmOnly = vmOnly;
    this._host = host;
    this._port = port;
    this._focusTable = focusTable;
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
          // Always use the panel's current host/port so retry targets
          // the correct server even after a server switch.
          if (!this._vmOnly) this._loadContent(this._host, this._port);
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
    // Bump the load sequence so any in-flight fetch from a previous
    // server is silently discarded when it finally resolves.
    const seq = ++this._loadSeq;
    const baseUrl = `http://${host}:${port}`;
    // Fetch the shell with the editor display language so the server inlines the
    // matching l10n catalog (plan 75 §3.3) and a hosted panel matches the editor
    // rather than the OS locale. The query is only on the fetch URL — `<base href>`
    // below stays query-free so relative `/api/...` calls resolve correctly.
    const lang = encodeURIComponent(vscode.env.language || '');
    const fetchUrl = lang ? `${baseUrl}?locale=${lang}` : baseUrl;

    // Show loading state immediately
    this._panel.webview.html = `
      <html><body style="padding:2rem;font-family:system-ui;color:var(--vscode-foreground,#ccc);">
        <h2>Loading Saropa Drift Advisor\u2026</h2>
        <p>Connecting to <code>${baseUrl}</code></p>
      </body></html>`;

    try {
      const resp = await fetch(fetchUrl);
      if (this._disposed || seq !== this._loadSeq) return;

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

      // Deep-link to a specific table when a sibling tool asked for one (plan 67
      // R5). Sets the fragment before the web app runs, so its existing
      // `#TableName` deep-link opens that table. Injected into <head> so it lands
      // before the app's bundle; harmless when the table is absent (the app's
      // own `tables.indexOf` guard simply ignores an unknown name).
      if (this._focusTable) {
        html = html.replace('<head>', `<head>${focusTableHashScript(this._focusTable)}`);
      }

      this._panel.webview.html = html;
    } catch {
      if (this._disposed || seq !== this._loadSeq) return;
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

/**
 * Builds the inline script that sets the document fragment to [table], so the
 * loaded web app's existing `#TableName` deep-link (in bundle.js) opens that
 * table. Exported for tests.
 *
 * Defense in depth on the table name (untrusted: it can arrive from a sibling
 * tool's diagnostic): `encodeURIComponent` strips the characters that could end
 * the `<script>`/break the URL fragment (`<`, `>`, `/`, quotes all percent-
 * encode), and `JSON.stringify` then wraps the result as a safe JS string
 * literal. The web app decodes it back with `decodeURIComponent`.
 */
export function focusTableHashScript(table: string): string {
  const encoded = JSON.stringify(encodeURIComponent(table));
  return `<script>try{location.hash=${encoded};}catch(e){}</script>`;
}
