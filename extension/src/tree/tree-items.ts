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
    } else {
      // Offline or disconnected: clicking opens the connection help panel (live
      // diagnostics + setup guidance) instead of being inert. Previously this row
      // had no command, so a user who saw "Offline" had nothing to act on — the
      // exact dead-end this wiring removes. The state hint lets the panel render
      // the precise status header and next step for offline vs. never-connected.
      const stateHint = offlineSchema ? 'offline' : 'disconnected';
      this.command = {
        command: 'driftViewer.showTroubleshooting',
        title: 'Open Connection Help',
        arguments: [stateHint],
      };
      this.tooltip = offlineSchema
        ? `${baseUrl} — schema from workspace cache; click for connection help.`
        : `${baseUrl} — not connected; click for connection help.`;
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

/**
 * Group node for the "group tables by name" toggle. Bundles all tables that
 * share an entity stem (the singularized segment before the first underscore,
 * so `contacts` joins every `contact_*` table) into a navigable section.
 * Starts EXPANDED so the grouped view reveals its tables without an extra click
 * — grouping is meant to add structure, not hide the table list behind a chevron.
 * Carries its member [TableItem]s so the provider can return them on expand
 * without recomputing the grouping.
 */
export class TableGroupItem extends vscode.TreeItem {
  constructor(
    public readonly groupKey: string,
    public readonly tables: TableItem[],
  ) {
    super(groupKey, vscode.TreeItemCollapsibleState.Expanded);
    const count = tables.length;
    this.description = `${count} table${count === 1 ? '' : 's'}`;
    this.iconPath = new vscode.ThemeIcon('symbol-namespace');
    this.contextValue = 'driftTableGroup';
    this.tooltip = `${count} tables in the "${groupKey}" group`;
  }
}

export class TableItem extends vscode.TreeItem {
  constructor(
    public readonly table: TableMetadata,
    public readonly pinned = false,
  ) {
    super(table.name, vscode.TreeItemCollapsibleState.Collapsed);
    // Show column count and row count so users can gauge table shape at a glance.
    const cols = table.columns.length;
    this.description = `${cols} ${cols === 1 ? 'col' : 'cols'}, ${table.rowCount} ${table.rowCount === 1 ? 'row' : 'rows'}`;
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
