/**
 * Webview form for the Snapshot Changelog command.
 * Replaces the two sequential showQuickPick prompts (from/to snapshot)
 * with a single form showing both dropdowns at once.
 */

import * as vscode from 'vscode';
import type { SnapshotStore, ISnapshot } from '../timeline/snapshot-store';
import { ChangelogGenerator } from './changelog-generator';
import { ChangelogRenderer } from './changelog-renderer';
import type { ISnapshotRef } from './changelog-types';
import { buildChangelogFormHtml } from './changelog-form-html';

function toRef(snap: ISnapshot): ISnapshotRef {
  return {
    name: snap.id,
    timestamp: new Date(snap.timestamp).toLocaleString(),
  };
}

/** Non-singleton form panel for changelog snapshot selection. */
export class ChangelogFormPanel {
  private readonly _panel: vscode.WebviewPanel;
  private readonly _disposables: vscode.Disposable[] = [];

  /** Open the changelog form. Caller should verify >= 2 snapshots exist. */
  static open(snapshotStore: SnapshotStore): void {
    const snapshots = snapshotStore.snapshots;

    const items = snapshots.map((s) => ({
      id: s.id,
      label: new Date(s.timestamp).toLocaleString(),
      description: `${s.tables.size} table(s)`,
    }));

    const panel = vscode.window.createWebviewPanel(
      'driftChangelogForm',
      'Snapshot Changelog',
      vscode.ViewColumn.Active,
      { enableScripts: true },
    );
    new ChangelogFormPanel(panel, snapshotStore, items);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly _store: SnapshotStore,
    items: Array<{ id: string; label: string; description: string }>,
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
    this._panel.webview.html = buildChangelogFormHtml(items);
  }

  private async _handleMessage(
    msg: { command: string; fromId?: string; toId?: string },
  ): Promise<void> {
    switch (msg.command) {
      case 'generate': {
        const { fromId, toId } = msg;
        if (!fromId || !toId || fromId === toId) return;

        const snapA = this._store.snapshots.find((s) => s.id === fromId);
        const snapB = this._store.snapshots.find((s) => s.id === toId);
        if (!snapA || !snapB) return;

        try {
          const markdown = await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: 'Generating snapshot changelog\u2026',
            },
            async () => {
              const generator = new ChangelogGenerator();
              const changelog = generator.generate(
                toRef(snapA), toRef(snapB),
                snapA.tables, snapB.tables,
              );
              return new ChangelogRenderer().render(changelog);
            },
          );

          // Close the form and show the generated changelog
          this._panel.dispose();
          const doc = await vscode.workspace.openTextDocument({
            content: markdown,
            language: 'markdown',
          });
          await vscode.window.showTextDocument(doc);
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Changelog failed: ${errMsg}`);
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
