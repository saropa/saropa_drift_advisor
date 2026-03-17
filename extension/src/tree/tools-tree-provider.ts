/**
 * Static tree view provider for the "Drift Tools" sidebar.
 * Lists all major commands grouped by category. Server-dependent items
 * show a disabled state when not connected, teaching users what the
 * extension can do even before they connect.
 */

import * as vscode from 'vscode';

// ── Node types ────────────────────────────────────────────────────────

/** Union of all node types in the tools tree. */
export type ToolsTreeNode = ToolCategoryItem | ToolCommandItem;

/** Collapsible category header (e.g. "Schema & Migrations"). */
export class ToolCategoryItem extends vscode.TreeItem {
  /** Child tool commands belonging to this category. */
  readonly tools: ToolCommandItem[];

  constructor(
    categoryName: string,
    icon: string,
    tools: ToolCommandItem[],
  ) {
    super(categoryName, vscode.TreeItemCollapsibleState.Expanded);
    this.tools = tools;
    this.iconPath = new vscode.ThemeIcon(icon);
    this.contextValue = 'toolCategory';
    this.description = `${tools.length}`;
  }
}

/** Leaf item representing a single command. */
export class ToolCommandItem extends vscode.TreeItem {
  /** The VS Code command ID to execute when clicked. */
  readonly commandId: string;
  /** Whether this command requires an active server connection. */
  readonly requiresConnection: boolean;
  /** The ThemeIcon name used when the item is enabled. */
  private readonly _enabledIcon: string;

  constructor(
    label: string,
    commandId: string,
    icon: string,
    requiresConnection: boolean,
    tooltip?: string,
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.commandId = commandId;
    this.requiresConnection = requiresConnection;
    this._enabledIcon = icon;
    this.iconPath = new vscode.ThemeIcon(icon);
    this.contextValue = 'toolCommand';
    if (tooltip) {
      this.tooltip = tooltip;
    }
  }

  /** Apply enabled/disabled visual state depending on server connection. */
  applyConnectionState(connected: boolean): void {
    if (this.requiresConnection && !connected) {
      // Grey out: remove click handler, show disabled icon and description
      this.command = undefined;
      this.description = '(not connected)';
      this.iconPath = new vscode.ThemeIcon(
        'circle-slash',
        new vscode.ThemeColor('disabledForeground'),
      );
    } else {
      // Active: wire up click handler, restore original icon
      this.command = {
        command: this.commandId,
        title: this.label as string,
      };
      this.description = undefined;
      this.iconPath = new vscode.ThemeIcon(this._enabledIcon);
    }
  }
}

// ── Provider ──────────────────────────────────────────────────────────

export class ToolsTreeProvider implements vscode.TreeDataProvider<ToolsTreeNode> {
  private _connected = false;
  private readonly _version: string;
  private readonly _onDidChangeTreeData =
    new vscode.EventEmitter<ToolsTreeNode | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(version?: string) {
    this._version = version ?? '0.0.0';
  }

  /** Called when server connection state changes. Re-renders the tree. */
  setConnected(connected: boolean): void {
    if (this._connected !== connected) {
      this._connected = connected;
      this._onDidChangeTreeData.fire();
    }
  }

  getTreeItem(element: ToolsTreeNode): vscode.TreeItem {
    // Apply dynamic enable/disable state to command items
    if (element instanceof ToolCommandItem) {
      element.applyConnectionState(this._connected);
    }
    return element;
  }

  getChildren(element?: ToolsTreeNode): ToolsTreeNode[] {
    if (!element) {
      return buildCategories(this._version);
    }
    if (element instanceof ToolCategoryItem) {
      return element.tools;
    }
    return [];
  }
}

// ── Static category definitions ───────────────────────────────────────

/** Build the full categorised tool list. Called on every render. */
function buildCategories(version: string): ToolCategoryItem[] {
  return [
    new ToolCategoryItem('Getting Started', 'star', [
      new ToolCommandItem(
        `About Saropa Drift Advisor v${version}`, 'driftViewer.about', 'book',
        false, 'View release notes and changelog',
      ),
      new ToolCommandItem(
        'Open Walkthrough', 'driftViewer.openWalkthrough', 'info',
        false, 'Step-by-step guide to the extension',
      ),
      new ToolCommandItem(
        'Add Saropa Drift Advisor', 'driftViewer.addPackageToProject', 'package',
        false, 'Add saropa_drift_advisor to pubspec.yaml',
      ),
    ]),

    new ToolCategoryItem('Schema & Migrations', 'diff', [
      new ToolCommandItem(
        'Schema Diff', 'driftViewer.schemaDiff', 'diff',
        true, 'Compare Dart code vs runtime schema',
      ),
      new ToolCommandItem(
        'Generate Migration', 'driftViewer.generateMigration', 'file-code',
        true, 'Generate Dart migration code with version number',
      ),
      new ToolCommandItem(
        'Generate Rollback', 'driftViewer.generateRollback', 'discard',
        true, 'Generate reverse migration from schema timeline',
      ),
      new ToolCommandItem(
        'Generate Dart', 'driftViewer.generateDart', 'code',
        true, 'Generate Dart table classes from runtime schema',
      ),
    ]),

    new ToolCategoryItem('Health & Quality', 'heart', [
      new ToolCommandItem(
        'Health Score', 'driftViewer.healthScore', 'heart',
        true, 'Compute database health score',
      ),
      new ToolCommandItem(
        'Run Linter', 'driftViewer.runLinter', 'warning',
        true, 'Check schema for diagnostics and issues',
      ),
      new ToolCommandItem(
        'Anomaly Detection', 'driftViewer.showAnomalies', 'bug',
        true, 'Detect FK violations, duplicates, empty strings',
      ),
      new ToolCommandItem(
        'Query Cost', 'driftViewer.analyzeQueryCost', 'pulse',
        true, 'Analyze query performance with EXPLAIN',
      ),
      new ToolCommandItem(
        'Manage Invariants', 'driftViewer.manageInvariants', 'shield',
        true, 'Define and run data integrity rules',
      ),
    ]),

    new ToolCategoryItem('Data Management', 'database', [
      new ToolCommandItem(
        'Seed Data', 'driftViewer.seedAllTables', 'beaker',
        true, 'Generate test data for all tables',
      ),
      new ToolCommandItem(
        'Import Dataset', 'driftViewer.importDataset', 'cloud-download',
        true, 'Import a dataset JSON file',
      ),
      new ToolCommandItem(
        'Export Dataset', 'driftViewer.exportDataset', 'cloud-upload',
        true, 'Export current data as portable JSON',
      ),
      new ToolCommandItem(
        'Clear All Tables', 'driftViewer.clearAllTables', 'trash',
        true, 'Delete all rows from all tables',
      ),
      new ToolCommandItem(
        'Download Database', 'driftViewer.downloadDatabase', 'desktop-download',
        true, 'Save the SQLite database file locally',
      ),
    ]),

    new ToolCategoryItem('Visualization', 'type-hierarchy', [
      new ToolCommandItem(
        'ER Diagram', 'driftViewer.showErDiagram', 'type-hierarchy',
        true, 'Entity-relationship diagram with FK links',
      ),
      new ToolCommandItem(
        'Dashboard', 'driftViewer.openDashboard', 'dashboard',
        true, 'Open custom dashboard with widgets',
      ),
      new ToolCommandItem(
        'Schema Docs', 'driftViewer.generateSchemaDocs', 'book',
        true, 'Generate schema documentation',
      ),
    ]),

    new ToolCategoryItem('Tools', 'tools', [
      new ToolCommandItem(
        'SQL Notebook', 'driftViewer.openSqlNotebook', 'terminal',
        true, 'Interactive SQL console',
      ),
      new ToolCommandItem(
        'Snippet Library', 'driftViewer.openSnippetLibrary', 'notebook',
        true, 'Browse and manage saved SQL snippets',
      ),
      new ToolCommandItem(
        'Global Search', 'driftViewer.globalSearch', 'search',
        true, 'Search across all tables',
      ),
      new ToolCommandItem(
        'Isar Converter', 'driftViewer.isarToDrift', 'arrow-swap',
        false, 'Convert Isar schema to Drift code',
      ),
    ]),
  ];
}
