/**
 * NarratorPanel: Webview panel for displaying data story narratives.
 */

import * as vscode from 'vscode';
import { DataNarrator } from './data-narrator';
import { buildErrorHtml, buildLoadingHtml, buildNarratorHtml } from './narrator-html';
import type { INarrativeResult, NarratorToExtensionMessage } from './narrator-types';

export class NarratorPanel {
  private static _currentPanel: NarratorPanel | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private readonly _narrator: DataNarrator;
  private readonly _disposables: vscode.Disposable[] = [];

  private _currentTable: string;
  private _currentPkColumn: string;
  private _currentPkValue: unknown;
  private _result: INarrativeResult | undefined;
  private _isRegenerating = false;

  static createOrShow(
    narrator: DataNarrator,
    result: INarrativeResult,
  ): void {
    const column = vscode.ViewColumn.Beside;

    if (NarratorPanel._currentPanel) {
      NarratorPanel._currentPanel._update(result);
      NarratorPanel._currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'driftNarrator',
      'Data Story',
      column,
      { enableScripts: true },
    );

    NarratorPanel._currentPanel = new NarratorPanel(panel, narrator, result);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    narrator: DataNarrator,
    result: INarrativeResult,
  ) {
    this._panel = panel;
    this._narrator = narrator;
    this._result = result;
    this._currentTable = result.graph.root.table;
    this._currentPkColumn = result.graph.root.pkColumn;
    this._currentPkValue = result.graph.root.pkValue;

    this._panel.onDidDispose(() => this._dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      (msg: NarratorToExtensionMessage) => this._handleMessage(msg),
      null,
      this._disposables,
    );

    this._render();
  }

  private _update(result: INarrativeResult): void {
    this._result = result;
    this._currentTable = result.graph.root.table;
    this._currentPkColumn = result.graph.root.pkColumn;
    this._currentPkValue = result.graph.root.pkValue;
    this._updateTitle();
    this._render();
  }

  private _updateTitle(): void {
    this._panel.title = `Story: ${this._currentTable} #${this._currentPkValue}`;
  }

  private _render(): void {
    if (!this._result) {
      this._panel.webview.html = buildLoadingHtml(
        this._currentTable,
        this._currentPkValue,
      );
      return;
    }

    this._panel.webview.html = buildNarratorHtml(this._result);
  }

  private async _handleMessage(msg: NarratorToExtensionMessage): Promise<void> {
    switch (msg.command) {
      case 'copyText':
        if (this._result) {
          await vscode.env.clipboard.writeText(this._result.text);
          vscode.window.showInformationMessage('Narrative text copied to clipboard.');
        }
        break;

      case 'copyMarkdown':
        if (this._result) {
          await vscode.env.clipboard.writeText(this._result.markdown);
          vscode.window.showInformationMessage('Narrative Markdown copied to clipboard.');
        }
        break;

      case 'regenerate':
        await this._regenerate();
        break;

      case 'narrate':
        this._currentTable = msg.table;
        this._currentPkColumn = msg.pkColumn;
        this._currentPkValue = msg.pkValue;
        await this._regenerate();
        break;
    }
  }

  private async _regenerate(): Promise<void> {
    if (this._isRegenerating) return;
    this._isRegenerating = true;

    this._result = undefined;
    this._updateTitle();
    this._panel.webview.html = buildLoadingHtml(
      this._currentTable,
      this._currentPkValue,
    );

    try {
      const graph = await this._narrator.buildGraph(
        this._currentTable,
        this._currentPkColumn,
        this._currentPkValue,
      );
      const result = this._narrator.generateNarrative(graph);
      this._update(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this._panel.webview.html = buildErrorHtml(message);
    } finally {
      this._isRegenerating = false;
    }
  }

  private _dispose(): void {
    NarratorPanel._currentPanel = undefined;
    this._panel.dispose();
    for (const d of this._disposables) {
      d.dispose();
    }
  }
}
