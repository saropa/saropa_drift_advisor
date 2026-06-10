/**
 * Branch Manager panel (Feature 37, Phase 5): the webview that lists branches and drives the
 * create / diff / merge-SQL / restore / delete actions.
 *
 * "Diff vs Now" builds a pseudo-branch from the current live tables (reusing the manager's
 * capture path) and diffs the selected branch against it, so the same PK-keyed diff engine powers
 * both branch-vs-branch and branch-vs-current. Destructive restore is double-gated: an explicit
 * warning plus an offer to capture a backup branch of the current state first.
 */

import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import type { BranchManager } from './branch-manager';
import type { IDataBranch } from './branch-types';
import { diffBranches } from './branch-diff';
import { generateMergeSql } from './branch-merge-sql';
import { restoreBranch } from './branch-restore';
import { DependencySorter } from '../data-management/dependency-sorter';
import { DataReset } from '../data-management/data-reset';
import { buildBranchDiffHtml, buildBranchListHtml } from './branch-html';

export class BranchPanel {
  private static _current: BranchPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _disposables: vscode.Disposable[] = [];

  static createOrShow(manager: BranchManager, client: DriftApiClient): void {
    const column = vscode.ViewColumn.Active;
    if (BranchPanel._current) {
      BranchPanel._current._panel.reveal(column);
      BranchPanel._current._renderList();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'driftBranches',
      'Data Branches',
      column,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    BranchPanel._current = new BranchPanel(panel, manager, client);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly _manager: BranchManager,
    private readonly _client: DriftApiClient,
  ) {
    this._panel = panel;
    this._panel.webview.onDidReceiveMessage((m) => this._onMessage(m), null, this._disposables);
    this._disposables.push(this._manager.onDidChange(() => this._renderList()));
    this._panel.onDidDispose(() => this._dispose(), null, this._disposables);
    this._renderList();
  }

  private _renderList(): void {
    this._panel.webview.html = buildBranchListHtml(this._manager.branches);
  }

  private async _onMessage(msg: { command: string; branchId?: string }): Promise<void> {
    switch (msg.command) {
      case 'list':
        this._renderList();
        break;
      case 'create':
        await this._create();
        break;
      case 'diff':
        await this._diff(msg.branchId);
        break;
      case 'merge':
        await this._merge(msg.branchId);
        break;
      case 'restore':
        await this._restore(msg.branchId);
        break;
      case 'delete':
        await this._delete(msg.branchId);
        break;
      default:
        break;
    }
  }

  private _resolve(branchId?: string): IDataBranch | undefined {
    return branchId ? this._manager.getBranch(branchId) : undefined;
  }

  private async _create(): Promise<void> {
    const name = await vscode.window.showInputBox({
      prompt: 'Branch name',
      placeHolder: 'e.g. before-migration, experiment-1',
      validateInput: (v) => (v.trim() ? null : 'Name required'),
    });
    if (!name) return;
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: `Creating branch "${name.trim()}"…` },
      async () => {
        const b = await this._manager.createBranch(name.trim());
        vscode.window.showInformationMessage(
          `Branch "${b.name}" created — ${b.metadata.tableCount} tables, ${b.metadata.totalRows.toLocaleString()} rows`
          + (b.metadata.truncated ? ' (some tables truncated to the row cap)' : ''),
        );
      },
    );
  }

  /** Build a pseudo-branch from the current live tables for branch-vs-current diffing. */
  private async _currentAsBranch(): Promise<IDataBranch> {
    const { tables, truncated } = await this._manager.captureLiveTables();
    return {
      id: 'current',
      name: 'current',
      createdAt: new Date().toISOString(),
      tables,
      metadata: {
        tableCount: tables.length,
        totalRows: tables.reduce((s, t) => s + t.rows.length, 0),
        truncated,
      },
    };
  }

  private async _diff(branchId?: string): Promise<void> {
    const branch = this._resolve(branchId);
    if (!branch) return;
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Computing diff…' },
      async () => {
        const current = await this._currentAsBranch();
        const diff = diffBranches(branch, current);
        this._panel.webview.html = buildBranchDiffHtml(diff);
      },
    );
  }

  private async _merge(branchId?: string): Promise<void> {
    const branch = this._resolve(branchId);
    if (!branch) return;
    const current = await this._currentAsBranch();
    const diff = diffBranches(branch, current);
    const tableNames = branch.tables.map((t) => t.name);
    const fks = await new DataReset(this._client, new DependencySorter()).getAllFks(tableNames);
    const insertOrder = new DependencySorter().sortForInsert(tableNames, fks);
    const sql = generateMergeSql(diff, 'forward', insertOrder);
    const doc = await vscode.workspace.openTextDocument({ content: sql, language: 'sql' });
    await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
  }

  private async _restore(branchId?: string): Promise<void> {
    const branch = this._resolve(branchId);
    if (!branch) return;
    const choice = await vscode.window.showWarningMessage(
      `Restore branch "${branch.name}"? This overwrites the current database with ${branch.metadata.totalRows.toLocaleString()} captured rows.`,
      { modal: true },
      'Create Backup First',
      'Restore Now',
    );
    if (choice !== 'Create Backup First' && choice !== 'Restore Now') return;
    if (choice === 'Create Backup First') {
      await this._manager.createBranch(`backup-${branch.name}`);
    }
    try {
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `Restoring "${branch.name}"…` },
        async () => {
          const result = await restoreBranch(this._client, branch);
          vscode.window.showInformationMessage(
            `Restored "${branch.name}" — ${result.rowsInserted.toLocaleString()} rows across ${result.tablesRestored} tables.`,
          );
        },
      );
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(
        `Restore failed (the server may be read-only): ${m}`,
      );
    }
  }

  private async _delete(branchId?: string): Promise<void> {
    const branch = this._resolve(branchId);
    if (!branch) return;
    const confirm = await vscode.window.showWarningMessage(
      `Delete branch "${branch.name}"?`,
      { modal: true },
      'Delete',
    );
    if (confirm === 'Delete') await this._manager.deleteBranch(branch.id);
  }

  private _dispose(): void {
    BranchPanel._current = undefined;
    this._panel.dispose();
    for (const d of this._disposables) d.dispose();
  }
}
