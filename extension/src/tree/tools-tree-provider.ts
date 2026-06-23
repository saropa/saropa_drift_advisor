/**
 * Static tree view provider for the "Drift Tools" sidebar.
 *
 * Slimmed to a thin launcher: the full per-tool catalog now lives in the Drift
 * Tools Hub webview (`driftViewer.openDriftToolsHub`), which indexes every tool
 * grouped by category. This docked view keeps only what a launcher needs — a
 * prominent "Drift Tools Hub" entry, the package-setup gate when the dependency
 * is missing, and a connection-status row — so the sidebar opens the Hub in one
 * click and still teaches connection state before you connect. The old
 * category-per-tool tree was redundant with the Hub and was removed.
 */

import * as vscode from 'vscode';

// ── Node types ────────────────────────────────────────────────────────

/** Union of all node types in the tools tree. */
export type ToolsTreeNode = ToolLauncherItem | ToolCommandItem | ToolsStatusItem;

/**
 * The prominent top entry that opens the Drift Tools Hub. Kept distinct from
 * ToolCommandItem so its version description survives `getTreeItem` (the command
 * item clears its description when wiring connection state).
 */
export class ToolLauncherItem extends vscode.TreeItem {
  /** The VS Code command ID to execute when clicked. */
  readonly commandId: string;

  constructor(label: string, commandId: string, version: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.commandId = commandId;
    this.description = `v${version}`;
    this.iconPath = new vscode.ThemeIcon('layout');
    this.contextValue = 'toolLauncher';
    this.tooltip = 'Open the Drift Tools Hub — dashboard, health, and every tool on one page';
    this.command = { command: commandId, title: label };
  }
}

/**
 * Connection-status row. Mirrors the live server state so a user can tell at a
 * glance whether the server-dependent tools in the Hub will work; when not
 * connected, clicking opens the connection-help panel rather than being inert.
 */
export class ToolsStatusItem extends vscode.TreeItem {
  constructor(connected: boolean) {
    super(connected ? 'Connected' : 'Not connected', vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'toolsConnectionStatus';
    if (connected) {
      this.description = 'server live';
      this.iconPath = new vscode.ThemeIcon('database', new vscode.ThemeColor('testing.iconPassed'));
      this.tooltip = 'A Drift debug server is connected — all tools are available.';
    } else {
      this.description = 'click for help';
      this.iconPath = new vscode.ThemeIcon('plug', new vscode.ThemeColor('testing.iconSkipped'));
      this.tooltip = 'No Drift server connected — server-dependent tools will prompt you to connect.';
      this.command = {
        command: 'driftViewer.showTroubleshooting',
        title: 'Open Connection Help',
        arguments: ['disconnected'],
      };
    }
  }
}

/** Leaf item representing a single command (used for the package-setup gate). */
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
  private _packageInstalled = false;
  private readonly _version: string;
  private readonly _onDidChangeTreeData =
    new vscode.EventEmitter<ToolsTreeNode | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(version?: string) {
    this._version = version ?? '0.0.0';
  }

  /** Force a full tree re-render (e.g. after toggling polling state). */
  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  /** Called when server connection state changes. Re-renders the tree. */
  setConnected(connected: boolean): void {
    if (this._connected !== connected) {
      this._connected = connected;
      this._onDidChangeTreeData.fire();
    }
  }

  /** Called when package-installed state changes. Hides the "Add Package" item when installed. */
  setPackageInstalled(installed: boolean): void {
    if (this._packageInstalled !== installed) {
      this._packageInstalled = installed;
      this._onDidChangeTreeData.fire();
    }
  }

  getTreeItem(element: ToolsTreeNode): vscode.TreeItem {
    // Only the command-gate item carries connection-dependent enable/disable.
    if (element instanceof ToolCommandItem) {
      element.applyConnectionState(this._connected);
    }
    return element;
  }

  getChildren(element?: ToolsTreeNode): ToolsTreeNode[] {
    try {
      // Flat launcher — no nesting, so any non-root element has no children.
      if (element) {
        return [];
      }
      return buildLauncher(this._version, this._packageInstalled, this._connected);
    } catch {
      // Never throw so the view never shows "no data provider" errors.
      return [];
    }
  }
}

// ── Launcher contents ─────────────────────────────────────────────────

/**
 * Build the slim launcher: the Hub entry, the package-setup gate (only when the
 * dependency is missing), and the connection-status row. Order puts the primary
 * action first and the status last.
 */
function buildLauncher(
  version: string,
  packageInstalled: boolean,
  connected: boolean,
): ToolsTreeNode[] {
  const items: ToolsTreeNode[] = [
    new ToolLauncherItem('Drift Tools Hub', 'driftViewer.openDriftToolsHub', version),
  ];

  // The setup gate appears only until the package is present in pubspec.yaml —
  // it does not need a connection, so it stays clickable offline.
  if (!packageInstalled) {
    items.push(
      new ToolCommandItem(
        'Add Saropa Drift Advisor', 'driftViewer.addPackageToProject', 'package',
        false, 'Add saropa_drift_advisor to pubspec.yaml',
      ),
    );
  }

  items.push(new ToolsStatusItem(connected));
  return items;
}
