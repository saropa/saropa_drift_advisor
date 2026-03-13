/**
 * Webview panel for managing data invariants.
 * Follows the singleton pattern used by HealthPanel.
 */

import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import type { InvariantManager } from './invariant-manager';
import type { IInvariantWebviewMessage } from './invariant-types';
import { buildInvariantHtml } from './invariant-html';
import {
  promptAddRule,
  promptEditRule,
  promptRemoveRule,
} from './invariant-prompts';

/** Singleton webview panel for managing data invariants. */
export class InvariantPanel {
  private static _currentPanel: InvariantPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _disposables: vscode.Disposable[] = [];

  static createOrShow(
    extensionUri: vscode.Uri,
    manager: InvariantManager,
    client: DriftApiClient,
  ): void {
    const column = vscode.ViewColumn.Beside;

    if (InvariantPanel._currentPanel) {
      InvariantPanel._currentPanel._render();
      InvariantPanel._currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'driftInvariants',
      'Data Invariants',
      column,
      { enableScripts: true },
    );

    InvariantPanel._currentPanel = new InvariantPanel(
      panel,
      manager,
      client,
    );
  }

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly _manager: InvariantManager,
    private readonly _client: DriftApiClient,
  ) {
    this._panel = panel;

    this._panel.onDidDispose(
      () => this._dispose(),
      null,
      this._disposables,
    );

    this._panel.webview.onDidReceiveMessage(
      (msg) => this._handleMessage(msg),
      null,
      this._disposables,
    );

    this._disposables.push(
      this._manager.onDidChange(() => this._render()),
    );

    this._render();
  }

  private _render(): void {
    const summary = this._manager.getSummary();
    this._panel.webview.html = buildInvariantHtml(
      this._manager.invariants,
      summary,
    );
  }

  private async _handleMessage(msg: IInvariantWebviewMessage): Promise<void> {
    switch (msg.command) {
      case 'refresh':
        this._render();
        break;

      case 'runAll':
        await this._runAll();
        break;

      case 'runOne':
        if (msg.id) {
          await this._manager.evaluateOne(msg.id);
        }
        break;

      case 'addRule':
        await promptAddRule(this._getPromptContext());
        break;

      case 'edit':
        if (msg.id) {
          await promptEditRule(this._getPromptContext(), msg.id);
        }
        break;

      case 'remove':
        if (msg.id) {
          await promptRemoveRule(this._getPromptContext(), msg.id);
        }
        break;

      case 'toggle':
        if (msg.id) {
          this._manager.toggle(msg.id);
        }
        break;

      case 'viewViolations':
        if (msg.id) {
          await this._showViolations(msg.id);
        }
        break;
    }
  }

  private async _runAll(): Promise<void> {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Running invariant checks...',
        cancellable: false,
      },
      async () => {
        await this._manager.evaluateAll();
      },
    );
  }

  private _getPromptContext() {
    return {
      client: this._client,
      manager: this._manager,
      getTableList: () => this._getTableList(),
    };
  }

  private async _showViolations(id: string): Promise<void> {
    const inv = this._manager.get(id);
    if (!inv?.lastResult?.violatingRows.length) {
      vscode.window.showInformationMessage('No violations to display.');
      return;
    }

    const violations = inv.lastResult.violatingRows;
    const content = JSON.stringify(violations, null, 2);

    const doc = await vscode.workspace.openTextDocument({
      content,
      language: 'json',
    });
    await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
  }

  private async _getTableList(): Promise<string[]> {
    try {
      const meta = await this._client.schemaMetadata();
      return meta.map((t) => t.name);
    } catch {
      return [];
    }
  }

  private _dispose(): void {
    InvariantPanel._currentPanel = undefined;
    this._panel.dispose();
    for (const d of this._disposables) {
      d.dispose();
    }
  }
}
