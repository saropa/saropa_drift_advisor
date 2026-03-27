/**
 * Status bar affordance for pending table edits: shows count and runs the
 * SQL preview command so users discover batch edits without opening the tree view.
 */

import * as vscode from 'vscode';
import type { ChangeTracker } from './change-tracker';

/**
 * Creates a left status-bar item that appears when [changeTracker] has pending
 * operations; hidden when the queue is empty. Click opens preview SQL.
 */
export function createPendingEditsStatusBar(
  changeTracker: ChangeTracker,
): vscode.Disposable {
  const item = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    50,
  );
  item.command = 'driftViewer.generateSql';
  item.tooltip = 'Preview SQL for pending data edits (Saropa Drift Advisor)';

  const refresh = (): void => {
    const n = changeTracker.changeCount;
    if (n === 0) {
      item.hide();
      return;
    }
    item.text = `$(edit) Pending edits: ${n}`;
    item.show();
  };

  refresh();
  const sub = changeTracker.onDidChange(refresh);

  return new vscode.Disposable(() => {
    sub.dispose();
    item.dispose();
  });
}
