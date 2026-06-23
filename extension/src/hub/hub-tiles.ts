/**
 * The Drift Tools Hub launcher catalog: every sidebar tool, grouped into the
 * same six categories the Drift Tools tree uses, so the hub reads as a complete
 * index rather than a partial subset. Each tile carries its VS Code command id,
 * an l10n label key, and an icon name (see hub-icons.ts).
 *
 * The two tools also rendered as live preview panes at the top of the hub
 * (Dashboard, Health Score) still appear here in their groups so each category
 * is complete and matches the sidebar; their tile opens the full panel, the same
 * as the pane's "Open full screen" button.
 */

/** One launcher tile: a tool command surfaced in a hub category. */
export interface HubTile {
  /** VS Code command id run when the tile is clicked (must be `driftViewer.*`). */
  id: string;
  /** l10n key for the tile label. */
  labelKey: string;
  /** Icon name from hub-icons.ts. */
  icon: string;
  /** Destructive action — rendered with a caution accent. */
  danger?: boolean;
}

/** A collapsible category of tiles in the launcher. */
export interface HubGroup {
  /** l10n key for the group title. */
  titleKey: string;
  /** l10n key for the one-line guidance note shown in the group header. */
  descKey: string;
  /** Icon name for the group header. */
  icon: string;
  tiles: HubTile[];
}

/** Full launcher catalog, ordered and grouped to mirror the Drift Tools tree. */
export const HUB_GROUPS: HubGroup[] = [
  {
    titleKey: 'panel.hub.group.gettingStarted',
    descKey: 'panel.hub.group.gettingStarted.desc',
    icon: 'compass',
    tiles: [
      { id: 'driftViewer.about', labelKey: 'panel.hub.tile.about', icon: 'info' },
      { id: 'driftViewer.openWalkthrough', labelKey: 'panel.hub.tile.walkthrough', icon: 'compass' },
    ],
  },
  {
    titleKey: 'panel.hub.group.schema',
    descKey: 'panel.hub.group.schema.desc',
    icon: 'diff',
    tiles: [
      { id: 'driftViewer.schemaDiff', labelKey: 'panel.hub.tile.schemaDiff', icon: 'diff' },
      { id: 'driftViewer.generateMigration', labelKey: 'panel.hub.tile.generateMigration', icon: 'filePlus' },
      { id: 'driftViewer.generateRollback', labelKey: 'panel.hub.tile.generateRollback', icon: 'rotateCcw' },
      { id: 'driftViewer.generateDart', labelKey: 'panel.hub.tile.generateDart', icon: 'code' },
    ],
  },
  {
    titleKey: 'panel.hub.group.health',
    descKey: 'panel.hub.group.health.desc',
    icon: 'heart',
    tiles: [
      { id: 'driftViewer.healthScore', labelKey: 'panel.hub.pane.health', icon: 'heart' },
      { id: 'driftViewer.runLinter', labelKey: 'panel.hub.tile.runLinter', icon: 'checkCircle' },
      { id: 'driftViewer.openRulesConfig', labelKey: 'panel.hub.tile.configureRules', icon: 'sliders' },
      { id: 'driftViewer.showAnomalies', labelKey: 'panel.hub.tile.anomalies', icon: 'bug' },
      { id: 'driftViewer.analyzeQueryCost', labelKey: 'panel.hub.tile.queryCost', icon: 'activity' },
      { id: 'driftViewer.manageInvariants', labelKey: 'panel.hub.tile.invariants', icon: 'shield' },
    ],
  },
  {
    titleKey: 'panel.hub.group.data',
    descKey: 'panel.hub.group.data.desc',
    icon: 'database',
    tiles: [
      { id: 'driftViewer.seedAllTables', labelKey: 'panel.hub.tile.seed', icon: 'flask' },
      { id: 'driftViewer.importDataset', labelKey: 'panel.hub.tile.import', icon: 'download' },
      { id: 'driftViewer.exportDataset', labelKey: 'panel.hub.tile.export', icon: 'upload' },
      { id: 'driftViewer.clearAllTables', labelKey: 'panel.hub.tile.clearTables', icon: 'trash', danger: true },
      { id: 'driftViewer.downloadDatabase', labelKey: 'panel.hub.tile.downloadDb', icon: 'database' },
    ],
  },
  {
    titleKey: 'panel.hub.group.visualization',
    descKey: 'panel.hub.group.visualization.desc',
    icon: 'shareNodes',
    tiles: [
      { id: 'driftViewer.showErDiagram', labelKey: 'panel.hub.tile.erDiagram', icon: 'shareNodes' },
      { id: 'driftViewer.openDashboard', labelKey: 'panel.hub.pane.dashboard', icon: 'grid' },
      { id: 'driftViewer.generateSchemaDocs', labelKey: 'panel.hub.tile.schemaDocs', icon: 'fileText' },
    ],
  },
  {
    titleKey: 'panel.hub.group.tools',
    descKey: 'panel.hub.group.tools.desc',
    icon: 'terminal',
    tiles: [
      { id: 'driftViewer.togglePolling', labelKey: 'panel.hub.tile.togglePolling', icon: 'radio' },
      { id: 'driftViewer.openSqlNotebook', labelKey: 'panel.hub.tile.sqlNotebook', icon: 'terminal' },
      { id: 'driftViewer.openSnippetLibrary', labelKey: 'panel.hub.tile.snippets', icon: 'bookmark' },
      { id: 'driftViewer.globalSearch', labelKey: 'panel.hub.tile.globalSearch', icon: 'search' },
      { id: 'driftViewer.isarToDrift', labelKey: 'panel.hub.tile.isar', icon: 'swap' },
    ],
  },
];

/** Flattened list of every tile across all groups (for tests / validation). */
export function allHubTiles(): HubTile[] {
  return HUB_GROUPS.flatMap((g) => g.tiles);
}
