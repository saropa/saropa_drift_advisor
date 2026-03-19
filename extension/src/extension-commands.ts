/**
 * Command registration: wires all register*Commands with shared context and dependencies.
 */

import * as vscode from 'vscode';
import type { DriftApiClient } from './api-client';
import type { AnnotationStore } from './annotations/annotation-store';
import type { ServerDiscovery } from './server-discovery';
import type { ServerManager } from './server-manager';
import type { GenerationWatcher } from './generation-watcher';
import type { ProviderSetupResult } from './extension-providers';
import type { EditingSetupResult } from './extension-editing';
import { registerAnnotationCommands } from './annotations/annotation-commands';
import { registerSeederCommands } from './seeder/seeder-commands';
import { registerConstraintWizardCommands } from './constraint-wizard/constraint-commands';
import { registerImpactCommands } from './impact/impact-commands';
import { registerIsarGenCommands } from './isar-gen/isar-gen-commands';
import { registerMigrationGenCommands } from './migration-gen/migration-gen-commands';
import { registerDataManagementCommands } from './data-management/data-management-commands';
import { registerChangelogCommands } from './changelog/changelog-commands';
import { registerComparatorCommands } from './comparator/comparator-commands';
import { registerSnippetCommands } from './snippets/snippet-commands';
import { registerSchemaDiffCommands } from './schema-diff/schema-diff-commands';
import { registerExportCommands } from './export/export-commands';
import { registerTreeCommands } from './tree/tree-commands';
import { registerNavCommands } from './navigation/nav-commands';
import { registerSnapshotCommands } from './timeline/snapshot-commands';
import { registerEditingCommands } from './editing/editing-commands';
import { registerDataBreakpointCommands } from './data-breakpoint/data-breakpoint-commands';
import { registerDebugCommands } from './debug/debug-commands';
import { registerHealthCommands } from './health/health-commands';
import { registerQueryCostCommands } from './query-cost/query-cost-commands';
import { registerDashboardCommands } from './dashboard/dashboard-commands';
import { registerInvariantCommands } from './invariants';
import { registerErDiagramCommands } from './er-diagram';
import { registerNarratorCommands } from './narrator';
import { registerClipboardImportCommands } from './import/clipboard-import-commands';
import { registerReportCommands } from './report/report-commands';
import { registerWorkspaceSetupCommands } from './workspace-setup/workspace-setup-commands';
import { registerTroubleshootingCommands } from './troubleshooting/troubleshooting-commands';
import { registerRollbackCommands } from './rollback/rollback-commands';
import { registerAboutCommands } from './about/about-commands';
import { registerPollingCommands } from './polling/polling-commands';
import { registerSaropaLintsCommands } from './saropa-lints-commands';
import { HealthScorer } from './health/health-scorer';
import { updateStatusBar } from './status-bar';
import type { HealthStatusBar } from './status-bar-health';
import type { SchemaTracker } from './schema-timeline/schema-tracker';

export interface CommandRegistrationDeps extends ProviderSetupResult, EditingSetupResult {
  annotationStore: AnnotationStore;
  statusItem: vscode.StatusBarItem;
  discovery: ServerDiscovery;
  serverManager: ServerManager;
  discoveryEnabled: boolean;
  watcher: GenerationWatcher;
  /** Schema timeline tracker for rollback generation. */
  schemaTracker: SchemaTracker;
  updateStatusBar: () => void;
  connectionChannel: vscode.OutputChannel;
  /** Status bar item updated after each health check. */
  healthStatusBar: HealthStatusBar;
}

/**
 * Register all extension commands. Call after setupProviders, setupDiagnostics, setupEditing.
 */
export function registerAllCommands(
  context: vscode.ExtensionContext,
  client: DriftApiClient,
  deps: CommandRegistrationDeps,
): void {
  const {
    treeProvider,
    treeView,
    codeLensProvider,
    hoverCache,
    linter,
    snapshotStore,
    watchManager,
    refreshBadges,
    dbpProvider,
    logBridge,
    editingBridge,
    fkNavigator,
    filterBridge,
    changeTracker,
    annotationStore,
    statusItem,
    discovery,
    serverManager,
    discoveryEnabled,
    watcher,
    updateStatusBar,
    connectionChannel,
    schemaTracker,
    healthStatusBar,
  } = deps;

  // About commands (no deps) are registered first so the Database view (i) icon
  // works even if a later feature module fails to register.
  registerAboutCommands(context);

  // Debug commands (VM Service connection, debug session lifecycle) are
  // registered next because they are critical for server connectivity.
  // Feature command modules are registered afterwards inside a try/catch so
  // that a failure in any single module cannot prevent the core connection
  // logic from running.
  registerDebugCommands(context, {
    client,
    treeProvider,
    treeView,
    hoverCache,
    linter,
    logBridge,
    discovery,
    serverManager,
    watcher,
    codeLensProvider,
    watchManager,
    refreshBadges,
    refreshStatusBar: updateStatusBar,
    connectionLog: { appendLine: (msg) => connectionChannel.appendLine(msg) },
  });

  // Feature command modules — each is isolated so one failing module does not
  // block the others or the core debug/connection logic above.
  const featureModules: Array<[string, () => void]> = [
    ['tree', () => registerTreeCommands(context, client, treeProvider, editingBridge, fkNavigator, filterBridge, serverManager)],
    ['nav', () => registerNavCommands(context, client, linter, editingBridge, fkNavigator, serverManager, discovery, filterBridge, connectionChannel)],
    ['snapshot', () => registerSnapshotCommands(context, client, snapshotStore)],
    ['schemaDiff', () => registerSchemaDiffCommands(context, client)],
    ['editing', () => registerEditingCommands(context, client, changeTracker, watchManager)],
    ['export', () => registerExportCommands(context, client)],
    ['snippet', () => registerSnippetCommands(context, client)],
    ['dataBreakpoint', () => registerDataBreakpointCommands(context, client, dbpProvider)],
    ['migrationGen', () => registerMigrationGenCommands(context, client)],
    ['dataManagement', () => registerDataManagementCommands(context, client)],
    ['comparator', () => registerComparatorCommands(context, client)],
    ['changelog', () => registerChangelogCommands(context, snapshotStore)],
    ['annotation', () => registerAnnotationCommands(context, annotationStore, treeProvider)],
    ['seeder', () => registerSeederCommands(context, client)],
    ['constraintWizard', () => registerConstraintWizardCommands(context, client)],
    ['impact', () => registerImpactCommands(context, client)],
    ['isarGen', () => registerIsarGenCommands(context)],
    ['health', () => registerHealthCommands(context, client, healthStatusBar)],
    ['queryCost', () => registerQueryCostCommands(context, client)],
    ['dashboard', () => registerDashboardCommands(context, client, new HealthScorer())],
    ['invariant', () => registerInvariantCommands(context, client, watcher)],
    ['narrator', () => registerNarratorCommands(context, client)],
    ['erDiagram', () => registerErDiagramCommands(context, client, watcher)],
    ['clipboardImport', () => registerClipboardImportCommands(context, client)],
    ['report', () => registerReportCommands(context, client)],
    ['workspaceSetup', () => registerWorkspaceSetupCommands(context, connectionChannel)],
    ['troubleshooting', () => registerTroubleshootingCommands(context, connectionChannel)],
    ['rollback', () => registerRollbackCommands(context, schemaTracker)],
    ['polling', () => registerPollingCommands(context, client, deps.toolsProvider)],
    ['saropaLints', () => registerSaropaLintsCommands(context)],
  ];
  for (const [name, register] of featureModules) {
    try {
      register();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      connectionChannel.appendLine(
        `[${new Date().toISOString()}] Failed to register ${name} commands: ${msg}`,
      );
    }
  }
}
