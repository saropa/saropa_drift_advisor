/**
 * Tree items for the "Quick Actions" collapsible group in the Database Explorer, plus
 * [getSchemaRestFailureActions] for the connected-but-REST-failed empty state (same
 * commands as the Database `viewsWelcome` overlay, exposed as real tree rows).
 */

import * as vscode from 'vscode';

// ── Node types ────────────────────────────────────────────────────────

/** Top-level collapsible group node displayed at the top of the Database tree. */
export class QuickActionsGroupItem extends vscode.TreeItem {
  constructor() {
    // Start collapsed so the table list isn't pushed down on every load
    super('Quick Actions', vscode.TreeItemCollapsibleState.Collapsed);
    this.iconPath = new vscode.ThemeIcon('rocket');
    this.contextValue = 'quickActionsGroup';
    this.description = 'Tools & features';
  }
}

/** A category header within Quick Actions (e.g. "Schema & Migrations"). */
export class ActionCategoryItem extends vscode.TreeItem {
  /** Child action items belonging to this category. */
  readonly actions: ActionItem[];

  constructor(category: string, icon: string, actions: ActionItem[]) {
    super(category, vscode.TreeItemCollapsibleState.Collapsed);
    this.actions = actions;
    this.iconPath = new vscode.ThemeIcon(icon);
    this.contextValue = 'actionCategory';
    this.description = `${actions.length}`;
  }
}

/** An individual clickable action that runs a command. */
export class ActionItem extends vscode.TreeItem {
  constructor(label: string, commandId: string, icon: string, tooltip?: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon(icon);
    this.command = { command: commandId, title: label };
    this.contextValue = 'quickAction';
    if (tooltip) {
      this.tooltip = tooltip;
    }
  }
}

// ── Category builder ──────────────────────────────────────────────────

/** Build the categorised quick-action list for the Database Explorer tree. */
export function getQuickActionCategories(): ActionCategoryItem[] {
  return [
    new ActionCategoryItem('Schema & Migrations', 'diff', [
      new ActionItem('Schema Diff', 'driftViewer.schemaDiff', 'diff',
        'Compare Dart code vs runtime schema'),
      new ActionItem('Generate Migration', 'driftViewer.generateMigration', 'file-code',
        'Generate Dart migration code'),
      new ActionItem('Generate Rollback', 'driftViewer.generateRollback', 'discard',
        'Reverse the last migration'),
      new ActionItem('Generate Dart', 'driftViewer.generateDart', 'code',
        'Dart classes from live schema'),
    ]),

    new ActionCategoryItem('Health & Quality', 'heart', [
      new ActionItem('Health Score', 'driftViewer.healthScore', 'heart',
        'Compute database health score'),
      new ActionItem('Run Linter', 'driftViewer.runLinter', 'warning',
        'Check schema for issues'),
      new ActionItem('Anomaly Detection', 'driftViewer.showAnomalies', 'bug',
        'Detect FK violations, duplicates, etc.'),
      new ActionItem('Query Cost', 'driftViewer.analyzeQueryCost', 'pulse',
        'Analyze query performance'),
    ]),

    new ActionCategoryItem('Data Management', 'database', [
      new ActionItem('Seed Data', 'driftViewer.seedAllTables', 'beaker',
        'Generate test data for all tables'),
      new ActionItem('Import Dataset', 'driftViewer.importDataset', 'cloud-download',
        'Import a dataset file'),
      new ActionItem('Clear All Tables', 'driftViewer.clearAllTables', 'trash',
        'Delete all table data'),
      new ActionItem('Download Database', 'driftViewer.downloadDatabase', 'desktop-download',
        'Save the database file locally'),
    ]),

    new ActionCategoryItem('Visualization', 'type-hierarchy', [
      new ActionItem('ER Diagram', 'driftViewer.showErDiagram', 'type-hierarchy',
        'Entity-relationship diagram'),
      new ActionItem('Dashboard', 'driftViewer.openDashboard', 'dashboard',
        'Open custom dashboard'),
      new ActionItem('Schema Docs', 'driftViewer.generateSchemaDocs', 'book',
        'Generate schema documentation'),
    ]),

    new ActionCategoryItem('Tools', 'tools', [
      new ActionItem('SQL Notebook', 'driftViewer.openSqlNotebook', 'terminal',
        'Interactive SQL console'),
      new ActionItem('Snippet Library', 'driftViewer.openSnippetLibrary', 'notebook',
        'Saved SQL snippets'),
      new ActionItem('Global Search', 'driftViewer.globalSearch', 'search',
        'Search across all tables'),
      new ActionItem('Mutation Stream', 'driftViewer.openMutationStream', 'pulse',
        'Open real-time INSERT/UPDATE/DELETE mutation feed'),
      new ActionItem('Isar Converter', 'driftViewer.isarToDrift', 'arrow-swap',
        'Convert Isar schema to Drift'),
    ]),
  ];
}

/**
 * Clickable tree rows for the "connected but REST schema failed" state.
 * Mirrors package.json `viewsWelcome` for that scenario so actions work when markdown
 * `command:` links in the welcome overlay do not (some VS Code forks).
 */
export function getSchemaRestFailureActions(): ActionItem[] {
  return [
    new ActionItem('Refresh tree', 'driftViewer.refreshTree', 'refresh',
      'Retry loading schema from the Drift REST API'),
    new ActionItem('Diagnose connection', 'driftViewer.diagnoseConnection', 'pulse',
      'Write connection details to Output and optionally copy a summary'),
    new ActionItem('Troubleshooting', 'driftViewer.showTroubleshooting', 'tools',
      'Open the troubleshooting panel'),
    new ActionItem('Connection log', 'driftViewer.showConnectionLog', 'output',
      'Show Saropa Drift Advisor output'),
    new ActionItem('Open in Browser', 'driftViewer.openInBrowser', 'globe',
      'Open the Drift viewer in an external browser'),
    new ActionItem('Select Server', 'driftViewer.selectServer', 'plug',
      'Pick the Drift debug server to use'),
    new ActionItem('Connection help (web)', 'driftViewer.openConnectionHelp', 'book',
      'Open connection documentation in the browser'),
  ];
}
