/**
 * Status bar item that opens a QuickPick command launcher.
 * Provides a "Drift Tools" button visible when a server is connected,
 * giving users quick access to the most important commands without
 * needing to know the Command Palette search terms.
 */

import * as vscode from 'vscode';

/** QuickPick item with a command ID to execute when selected. */
interface ToolQuickPickItem extends vscode.QuickPickItem {
  commandId: string;
}

/** The top commands surfaced in the QuickPick menu. */
const TOOL_ITEMS: ToolQuickPickItem[] = [
  { label: '$(heart) Health Score', description: 'Compute database health', commandId: 'driftViewer.healthScore' },
  { label: '$(diff) Schema Diff', description: 'Code vs runtime schema', commandId: 'driftViewer.schemaDiff' },
  { label: '$(file-code) Generate Migration', description: 'Generate migration code', commandId: 'driftViewer.generateMigration' },
  { label: '$(discard) Generate Rollback', description: 'Rollback last migration', commandId: 'driftViewer.generateRollback' },
  { label: '$(type-hierarchy) ER Diagram', description: 'Entity relationship diagram', commandId: 'driftViewer.showErDiagram' },
  { label: '$(dashboard) Dashboard', description: 'Open custom dashboard', commandId: 'driftViewer.openDashboard' },
  { label: '$(terminal) SQL Notebook', description: 'Interactive SQL console', commandId: 'driftViewer.openSqlNotebook' },
  { label: '$(search) Global Search', description: 'Search all tables', commandId: 'driftViewer.globalSearch' },
  { label: '$(warning) Run Linter', description: 'Check schema for issues', commandId: 'driftViewer.runLinter' },
  { label: '$(beaker) Seed Data', description: 'Generate test data', commandId: 'driftViewer.seedAllTables' },
  { label: '$(cloud-download) Import Dataset', description: 'Import data file', commandId: 'driftViewer.importDataset' },
  { label: '$(book) Schema Docs', description: 'Generate documentation', commandId: 'driftViewer.generateSchemaDocs' },
  { label: '$(shield) Invariants', description: 'Manage data invariants', commandId: 'driftViewer.manageInvariants' },
  { label: '$(notebook) Snippet Library', description: 'Saved SQL snippets', commandId: 'driftViewer.openSnippetLibrary' },
  { label: '$(pulse) Query Cost', description: 'Analyze query performance', commandId: 'driftViewer.analyzeQueryCost' },
];

export class ToolsQuickPickStatusBar implements vscode.Disposable {
  private readonly _item: vscode.StatusBarItem;

  constructor() {
    // Priority 60: between health score (80) and invariants (40)
    this._item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      60,
    );
    this._item.text = '$(tools) Drift Tools';
    this._item.tooltip = 'Open Drift Tools quick menu';
    this._item.command = 'driftViewer.showToolsQuickPick';
    // Hidden by default; shown when a server is connected
  }

  /** Show or hide based on server connection state. */
  setConnected(connected: boolean): void {
    if (connected) {
      this._item.show();
    } else {
      this._item.hide();
    }
  }

  dispose(): void {
    this._item.dispose();
  }
}

/** Register the QuickPick command that the status bar item triggers. */
export function registerToolsQuickPickCommand(
  context: vscode.ExtensionContext,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('driftViewer.showToolsQuickPick', async () => {
      const picked = await vscode.window.showQuickPick(TOOL_ITEMS, {
        placeHolder: 'Select a Drift Tool',
        matchOnDescription: true,
      });
      if (picked) {
        await vscode.commands.executeCommand(picked.commandId);
      }
    }),
  );
}
