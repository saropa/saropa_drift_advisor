/**
 * Webview panel form for adding annotations to tables/columns.
 * Replaces the sequential showQuickPick + showInputBox flow with a
 * single form that collects icon type and note text at once.
 */

import * as vscode from 'vscode';
import type { AnnotationIcon } from './annotation-types';
import type { AnnotationStore } from './annotation-store';
import type { IAnnotateFormContext } from './annotate-form-html';
import { buildAnnotateFormHtml } from './annotate-form-html';

/** Non-singleton panel — a new form opens each time the user annotates. */
export class AnnotateFormPanel {
  private readonly _panel: vscode.WebviewPanel;
  private readonly _disposables: vscode.Disposable[] = [];

  /**
   * Open the annotation form.
   * @param ctx identifies what is being annotated (table or column)
   * @param store the annotation store to write to on submit
   */
  static open(
    ctx: IAnnotateFormContext,
    store: AnnotationStore,
  ): void {
    const panel = vscode.window.createWebviewPanel(
      'driftAnnotateForm',
      `Annotate ${ctx.kind === 'column' ? ctx.table + '.' + ctx.column : ctx.table}`,
      vscode.ViewColumn.Active,
      { enableScripts: true },
    );
    // Not a singleton — each annotation gets its own form instance
    new AnnotateFormPanel(panel, ctx, store);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly _ctx: IAnnotateFormContext,
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
    this._panel.webview.html = buildAnnotateFormHtml(this._ctx);
  }

  private _handleMessage(
    msg: { command: string; icon?: string; note?: string },
  ): void {
    switch (msg.command) {
      case 'submit': {
        const icon = (msg.icon ?? 'note') as AnnotationIcon;
        const note = msg.note ?? '';
        if (!note) return;

        if (this._ctx.kind === 'column') {
          this._store.add(
            { kind: 'column', table: this._ctx.table, column: this._ctx.column },
            note,
            icon,
          );
          vscode.window.showInformationMessage(
            `Annotation added to column '${this._ctx.table}.${this._ctx.column}'.`,
          );
        } else {
          this._store.add(
            { kind: 'table', table: this._ctx.table },
            note,
            icon,
          );
          vscode.window.showInformationMessage(
            `Annotation added to table '${this._ctx.table}'.`,
          );
        }
        // Close the form after saving
        this._panel.dispose();
        break;
      }
      case 'cancel':
        this._panel.dispose();
        break;
    }
  }

  private _dispose(): void {
    // Panel is already disposed when onDidDispose fires — only clean up listeners
    for (const d of this._disposables) {
      d.dispose();
    }
  }
}
