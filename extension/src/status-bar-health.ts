/**
 * Status bar item for the database health score.
 * Hidden until the first health check is run. Clicking re-runs the check.
 * Colour-coded by grade: green for A, default for B, warning for C/D/F.
 */

import * as vscode from 'vscode';

export class HealthStatusBar implements vscode.Disposable {
  private readonly _item: vscode.StatusBarItem;

  constructor() {
    // Priority 80: between the main connection item (100) and invariants (40)
    this._item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      80,
    );
    this._item.command = 'driftViewer.healthScore';
    this._item.tooltip = 'Database Health — click to re-check';
    // Hidden by default; shown after the first health score computation
  }

  /** Update the displayed health score and show the item. */
  update(score: number, grade: string): void {
    this._item.text = `$(heart) Health: ${grade} (${score})`;

    // Colour-code by grade letter
    const letter = grade.charAt(0).toUpperCase();
    if (letter === 'A') {
      // Green check colour for excellent health
      this._item.backgroundColor = undefined;
      this._item.color = new vscode.ThemeColor('testing.iconPassed');
    } else if (letter === 'B') {
      // Default colour for good health
      this._item.backgroundColor = undefined;
      this._item.color = undefined;
    } else {
      // Warning background for mediocre/poor health
      this._item.backgroundColor = new vscode.ThemeColor(
        'statusBarItem.warningBackground',
      );
      this._item.color = undefined;
    }

    this._item.show();
  }

  /** Hide when the server disconnects or the extension is disabled. */
  hide(): void {
    this._item.hide();
  }

  dispose(): void {
    this._item.dispose();
  }
}
