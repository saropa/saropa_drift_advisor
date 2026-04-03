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
import { registerPollingCommands } from './polling/polling-commands';
import { registerSaropaLintsCommands } from './saropa-lints-commands';
import { registerMutationStreamCommands } from './mutation-stream/mutation-stream-commands';
import { HealthScorer } from './health/health-scorer';
import type { HealthStatusBar } from './status-bar-health';
import type { SchemaTracker } from './schema-timeline/schema-tracker';
import { getLogVerbosity, shouldLogConnectionLine } from './log-verbosity';

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
  /** Filled by extension.ts; VM/debug code invokes to sync sidebar connection UI. */
  refreshDriftConnectionUi?: () => void;
}

/**
 * Register all extension commands. Call after setupProviders, setupDiagnostics, setupEditing.
 */
export function registerAllCommands(
  context: vscode.ExtensionContext,
  client: DriftApiClient,
  deps: CommandRegistrationDeps,
): void {
  let logVerbosity = getLogVerbosity(
    vscode.workspace.getConfiguration('driftViewer'),
  );
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('driftViewer.logVerbosity')) {
        logVerbosity = getLogVerbosity(vscode.workspace.getConfiguration('driftViewer'));
      }
    }),
  );
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
    discovery,
    serverManager,
    watcher,
    updateStatusBar,
    connectionChannel,
    schemaTracker,
    healthStatusBar,
  } = deps;

  // About commands are registered at the start of activate() (extension-main)
  // so the Database view (i) icon works even if registration here fails.

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.setLogVerbosity',
      async () => {
        const cfg = vscode.workspace.getConfiguration('driftViewer');
        const current = cfg.get<string>('logVerbosity', 'verbose') ?? 'verbose';

        const items: Array<vscode.QuickPickItem & { value: string }> = [
          {
            label: 'quiet',
            description: 'Only errors + important connection events',
            value: 'quiet',
          },
          {
            label: 'normal',
            description: 'Reduce noise; keep important lines',
            value: 'normal',
          },
          {
            label: 'verbose',
            description: 'Most runtime information (default)',
            value: 'verbose',
          },
        ];

        const pick = await vscode.window.showQuickPick(items, {
          placeHolder: `Select log verbosity (current: ${current})`,
        });
        if (!pick) return;

        await cfg.update(
          'logVerbosity',
          pick.value,
          vscode.ConfigurationTarget.Workspace,
        );
        void vscode.window.showInformationMessage(
          `Saropa Drift Advisor log verbosity set to: ${pick.value}`,
        );
      },
    ),
  );

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
    connectionLog: {
      appendLine: (msg) => {
        if (shouldLogConnectionLine(msg, logVerbosity)) {
          connectionChannel.appendLine(msg);
        }
      },
    },
    refreshDriftConnectionUi: deps.refreshDriftConnectionUi,
  });

  // Feature command modules — each is isolated so one failing module does not
  // block the others or the core debug/connection logic above.
  const featureModules: Array<[string, () => void]> = [
    ['tree', () => registerTreeCommands(context, client, treeProvider, editingBridge, fkNavigator, filterBridge, serverManager)],
    ['nav', () => registerNavCommands(context, client, linter, editingBridge, fkNavigator, serverManager, discovery, filterBridge, connectionChannel, deps.refreshDriftConnectionUi)],
    ['mutationStream', () => registerMutationStreamCommands(context, client, editingBridge, fkNavigator, filterBridge)],
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
  const failedModules: Array<{ name: string; error: string }> = [];
  for (const [name, register] of featureModules) {
    try {
      register();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failedModules.push({ name, error: msg });
      connectionChannel.appendLine(
        `[${new Date().toISOString()}] Failed to register ${name} commands: ${msg}`,
      );
    }
  }
  // Surface registration failures with the actual error and an "Open Output"
  // button so the user can reach the full log without guessing where it is.
  if (failedModules.length > 0) {
    const summary = failedModules
      .map((m) => `${m.name}: ${m.error}`)
      .join('; ');
    void vscode.window
      .showWarningMessage(
        `Failed to register command modules — ${summary}`,
        'Open Output',
      )
      .then((choice) => {
        if (choice === 'Open Output') {
          connectionChannel.show(true);
        }
      });
  }

}
