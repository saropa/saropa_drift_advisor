/**
 * Singleton webview panel for browsing and managing annotations.
 * Follows the ProfilerPanel pattern.
 */

import * as vscode from 'vscode';
import type { AnnotationStore } from './annotation-store';
import { buildAnnotationHtml } from './annotation-panel-html';

/** Bookmarks panel showing all annotations grouped by table. */
export class AnnotationPanel {
  private static _currentPanel: AnnotationPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _disposables: vscode.Disposable[] = [];

  static createOrShow(store: AnnotationStore): void {
    const column = vscode.ViewColumn.Beside;

    if (AnnotationPanel._currentPanel) {
      AnnotationPanel._currentPanel._render();
      AnnotationPanel._currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'driftAnnotations',
      'Annotations & Bookmarks',
      column,
      { enableScripts: true },
    );
    AnnotationPanel._currentPanel = new AnnotationPanel(
      panel, store,
    );
  }

  /** Expose for testing. */
  static get currentPanel(): AnnotationPanel | undefined {
    return AnnotationPanel._currentPanel;
  }

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly _store: AnnotationStore,
  ) {
    this._panel = panel;

    this._panel.onDidDispose(
      () => this._dispose(), null, this._disposables,
    );
    this._panel.webview.onDidReceiveMessage(
      (msg) => this._handleMessage(msg),
      null,
      this._disposables,
    );

    this._disposables.push(
      _store.onDidChange(() => this._render()),
    );

    this._render();
  }

  private _render(): void {
    this._panel.webview.html = buildAnnotationHtml(
      this._store.annotations,
    );
  }

  private _handleMessage(
    msg: { command: string; id?: string; note?: string; icon?: string },
  ): void {
    switch (msg.command) {
      case 'remove':
        if (msg.id) this._store.remove(msg.id);
        break;
      case 'edit':
        if (msg.id && msg.note) {
          this._store.update(msg.id, msg.note);
        }
        break;
      case 'copyJson':
        vscode.env.clipboard.writeText(
          JSON.stringify(this._store.exportJson(), null, 2),
        );
        break;
    }
  }

  private _dispose(): void {
    AnnotationPanel._currentPanel = undefined;
    this._panel.dispose();
    for (const d of this._disposables) {
      d.dispose();
    }
  }
}
