import * as vscode from 'vscode';
import { ColumnMetadata, ForeignKey, TableMetadata } from '../api-client';

function columnIcon(col: ColumnMetadata): vscode.ThemeIcon {
  if (col.pk) return new vscode.ThemeIcon('key');
  const upper = col.type.toUpperCase();
  if (upper === 'INTEGER' || upper === 'REAL') {
    return new vscode.ThemeIcon('symbol-number');
  }
  if (upper === 'BLOB') {
    return new vscode.ThemeIcon('file-binary');
  }
  return new vscode.ThemeIcon('symbol-string');
}

export class ConnectionStatusItem extends vscode.TreeItem {
  /**
   * @param offlineSchema - When true, the tree shows last-known schema with no live server.
   */
  constructor(baseUrl: string, connected: boolean, offlineSchema = false) {
    const label = offlineSchema
      ? 'Offline — cached schema'
      : connected
        ? 'Connected'
        : 'Disconnected';
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = offlineSchema ? `${baseUrl} · not live` : baseUrl;
    this.iconPath = offlineSchema
      ? new vscode.ThemeIcon('history')
      : connected
        ? new vscode.ThemeIcon('database', new vscode.ThemeColor('testing.iconPassed'))
        : new vscode.ThemeIcon('error', new vscode.ThemeColor('testing.iconFailed'));
    this.contextValue = 'connectionStatus';

    // When connected to a live server, clicking opens the HTTP UI in a browser.
    if (connected && !offlineSchema) {
      this.command = {
        command: 'driftViewer.openInBrowser',
        title: 'Open in Browser',
      };
      this.tooltip = `${baseUrl} — click to open in browser`;
    } else if (offlineSchema) {
      this.tooltip =
        `${baseUrl} — schema from workspace cache; connect to the app for live data.`;
    }
  }
}

export class PinnedGroupItem extends vscode.TreeItem {
  constructor(count: number) {
    super('Pinned', vscode.TreeItemCollapsibleState.None);
    this.description = `${count} table${count === 1 ? '' : 's'}`;
    this.iconPath = new vscode.ThemeIcon('pin');
    this.contextValue = 'pinnedGroup';
  }
}

export class TableItem extends vscode.TreeItem {
  constructor(
    public readonly table: TableMetadata,
    public readonly pinned = false,
  ) {
    super(table.name, vscode.TreeItemCollapsibleState.Collapsed);
    this.description = `${table.rowCount} ${table.rowCount === 1 ? 'row' : 'rows'}`;
    this.iconPath = new vscode.ThemeIcon('table');
    this.contextValue = pinned ? 'driftTablePinned' : 'driftTable';
  }
}

export class ColumnItem extends vscode.TreeItem {
  constructor(
    public readonly column: ColumnMetadata,
    public readonly tableName: string,
  ) {
    super(column.name, vscode.TreeItemCollapsibleState.None);
    this.description = column.type;
    this.iconPath = columnIcon(column);
    this.contextValue = column.pk ? 'driftColumnPk' : 'driftColumn';
  }
}

export class ForeignKeyItem extends vscode.TreeItem {
  constructor(public readonly fk: ForeignKey) {
    super(fk.fromColumn, vscode.TreeItemCollapsibleState.None);
    this.description = `\u2192 ${fk.toTable}.${fk.toColumn}`;
    this.iconPath = new vscode.ThemeIcon('references');
    this.contextValue = 'driftForeignKey';
  }
}

/**
 * Non-clickable banner when no Drift server is connected. Real commands are listed as
 * [ActionItem] siblings so they work in hosts where `viewsWelcome` markdown `command:`
 * links do not fire (observed in some VS Code forks/versions).
 */
export class DisconnectedBannerItem extends vscode.TreeItem {
  constructor() {
    super('No Drift server connected', vscode.TreeItemCollapsibleState.None);
    this.description = 'Use the actions below';
    this.iconPath = new vscode.ThemeIcon('plug', new vscode.ThemeColor('testing.iconSkipped'));
    this.contextValue = 'disconnectedBanner';
    const md = new vscode.MarkdownString(
      'Run your Flutter/Dart app with `DriftDebugServer.start()`, '
        + 'then start a debug session or wait for auto-discovery.\n\n'
        + 'Check **Output → Saropa Drift Advisor** for connection progress.',
      true,
    );
    this.tooltip = md;
  }
}

export class SchemaRestFailureBannerItem extends vscode.TreeItem {
  constructor() {
    super('Could not load schema (REST API)', vscode.TreeItemCollapsibleState.None);
    this.description = 'Use the actions below';
    this.iconPath = new vscode.ThemeIcon('warning');
    this.contextValue = 'schemaRestFailureBanner';
    const md = new vscode.MarkdownString(
      'The sidebar reports a connection (HTTP and/or VM Service), but the **Database** '
        + 'tree could not load schema from the REST API. The embedded browser may still work.\n\n'
        + 'Check `driftViewer.authToken`, host/port, VPN/WSL, and that **Select Server** '
        + 'points at the live process.',
      true,
    );
    this.tooltip = md;
  }
}
