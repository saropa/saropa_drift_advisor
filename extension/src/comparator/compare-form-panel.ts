/**
 * Webview form for the Compare Rows command.
 * Replaces the 4-5 step sequential showQuickPick / showInputBox chain
 * with a single form collecting all inputs at once.
 */

import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import type { TableItem } from '../tree/tree-items';
import { rowsToObjects } from '../timeline/snapshot-store';
import { RowDiffer } from './row-differ';
import { ComparatorPanel } from './comparator-panel';
import { buildCompareFormHtml } from './compare-form-html';

/** Quote a PK value for use in a WHERE clause. */
function sqlLiteral(value: string): string {
  if (/^-?\d+(\.\d+)?$/.test(value)) return value;
  return `'${value.replace(/'/g, "''")}'`;
}

/** Non-singleton form panel for compare rows input. */
export class CompareFormPanel {
  private readonly _panel: vscode.WebviewPanel;
  private readonly _disposables: vscode.Disposable[] = [];

  /**
   * Open the compare rows form.
   * @param client API client for fetching schema and row data
   * @param preselectedTable optional table name from context menu
   */
  static async open(
    client: DriftApiClient,
    preselectedTable?: string,
  ): Promise<void> {
    // Fetch table names up-front so the form can populate dropdowns
    const meta = await client.schemaMetadata();
    const names = meta
      .filter((t) => !t.name.startsWith('sqlite_'))
      .map((t) => t.name)
      .sort();

    const panel = vscode.window.createWebviewPanel(
      'driftCompareForm',
      'Compare Rows',
      vscode.ViewColumn.Active,
      { enableScripts: true },
    );
    new CompareFormPanel(panel, client, names, meta, preselectedTable);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly _client: DriftApiClient,
    private readonly _tableNames: string[],
    private readonly _meta: Array<{
      name: string;
      columns: Array<{ name: string; pk: boolean }>;
    }>,
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
    this._panel.webview.html = buildCompareFormHtml(
      this._tableNames,
      preselectedTable,
    );
  }

  private async _handleMessage(
    msg: {
      command: string;
      tableA?: string;
      pkA?: string;
      tableB?: string;
      pkB?: string;
    },
  ): Promise<void> {
    switch (msg.command) {
      case 'compare': {
        const { tableA, pkA, tableB, pkB } = msg;
        if (!tableA || !pkA || !tableB || !pkB) return;

        try {
          const findPk = (table: string): string =>
            this._meta.find((t) => t.name === table)
              ?.columns.find((c) => c.pk)?.name ?? 'id';

          const pkColA = findPk(tableA);
          const pkColB = findPk(tableB);

          const [resultA, resultB] = await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: 'Comparing rows\u2026',
            },
            () => Promise.all([
              this._client.sql(
                `SELECT * FROM "${tableA}" WHERE "${pkColA}" = ${sqlLiteral(pkA)} LIMIT 1`,
              ),
              this._client.sql(
                `SELECT * FROM "${tableB}" WHERE "${pkColB}" = ${sqlLiteral(pkB)} LIMIT 1`,
              ),
            ]),
          );

          const rowA = rowsToObjects(resultA.columns, resultA.rows);
          const rowB = rowsToObjects(resultB.columns, resultB.rows);

          if (rowA.length === 0) {
            vscode.window.showWarningMessage(
              `Row not found: ${tableA}.${pkColA}=${pkA}`,
            );
            return;
          }
          if (rowB.length === 0) {
            vscode.window.showWarningMessage(
              `Row not found: ${tableB}.${pkColB}=${pkB}`,
            );
            return;
          }

          const differ = new RowDiffer();
          const diff = differ.diff(
            rowA[0], rowB[0],
            `${tableA}.${pkColA}=${pkA}`,
            `${tableB}.${pkColB}=${pkB}`,
          );

          // Close the form and show results
          this._panel.dispose();
          ComparatorPanel.createOrShow(diff);
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Compare failed: ${errMsg}`);
        }
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
