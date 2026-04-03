/**
 * Webview form for the Add Data Breakpoint command.
 * Replaces the 2-3 step sequential showQuickPick / showInputBox chain
 * with a single form collecting table, type, and condition at once.
 */

import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import type { DataBreakpointProvider } from './data-breakpoint-provider';
import type { DataBreakpointType } from './data-breakpoint-types';
import { buildBreakpointFormHtml } from './breakpoint-form-html';

/** Non-singleton form panel — opens fresh each time. */
export class BreakpointFormPanel {
  private readonly _panel: vscode.WebviewPanel;
  private readonly _disposables: vscode.Disposable[] = [];

  /**
   * Open the data breakpoint form.
   * @param client API client for fetching table names
   * @param dbpProvider breakpoint provider to register the breakpoint
   * @param preselectedTable optional table from context menu
   */
  static async open(
    client: DriftApiClient,
    dbpProvider: DataBreakpointProvider,
    preselectedTable?: string,
  ): Promise<void> {
    const meta = await client.schemaMetadata();
    const names = meta
      .filter((t) => !t.name.startsWith('sqlite_'))
      .map((t) => t.name)
      .sort();

    const panel = vscode.window.createWebviewPanel(
      'driftBreakpointForm',
      'Add Data Breakpoint',
      vscode.ViewColumn.Active,
      { enableScripts: true },
    );
    new BreakpointFormPanel(panel, dbpProvider, names, preselectedTable);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly _dbpProvider: DataBreakpointProvider,
    tableNames: string[],
    preselectedTable?: string,
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
    this._panel.webview.html = buildBreakpointFormHtml(
      tableNames, preselectedTable,
    );
  }

  private _handleMessage(
    msg: {
      command: string;
      table?: string;
      type?: string;
      condition?: string;
    },
  ): void {
    switch (msg.command) {
      case 'submit': {
        const table = msg.table;
        const type = msg.type as DataBreakpointType | undefined;
        if (!table || !type) return;

        this._dbpProvider.add(table, type, msg.condition);
        vscode.window.showInformationMessage(
          `Data breakpoint added on ${table}.`,
        );
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
