/**
 * Feature command-module registry: registers every per-feature `register*Commands`
 * module inside an isolated try/catch so one failing module cannot block the
 * others or the core debug/connection logic. Surfaces any failures with an
 * "Open Output" warning. Extracted from extension-commands.ts to keep that file
 * focused on shared setup + debug-command registration.
 */
import * as vscode from 'vscode';
import type { DriftApiClient } from './api-client';
import type { CommandRegistrationDeps } from './extension-commands';
import type { DiagnosticManager } from './diagnostics/diagnostic-manager';
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
import { registerBranchCommands } from './branching/branch-commands';
import { registerEditingCommands } from './editing/editing-commands';
import { registerDataBreakpointCommands } from './data-breakpoint/data-breakpoint-commands';
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
import { registerSuiteCommands } from './suite/suite-commands';
import { registerDiagnosticsMirror } from './suite/diagnostics-mirror';
import { registerMutationStreamCommands } from './mutation-stream/mutation-stream-commands';
import { registerDvrCommands } from './dvr/dvr-commands';
import { DvrPanel } from './dvr/dvr-panel';
import { refreshDvrStatusBar } from './dvr/dvr-status-bar';
import { registerNlSqlCommands } from './nl-sql/nl-sql-commands';
import { registerQueryBuilderCommands } from './query-builder/query-builder-commands';
import { registerRefactoringCommands } from './refactoring/refactoring-commands';
import { HealthScorer } from './health/health-scorer';

/**
 * Build and run the feature-module registry. `diagnosticManager` is the
 * (possibly no-op) manager resolved by the caller.
 */
export function registerFeatureModules(
  context: vscode.ExtensionContext,
  client: DriftApiClient,
  deps: CommandRegistrationDeps,
  diagnosticManager: DiagnosticManager,
): void {
  const {
    treeProvider,
    snapshotStore,
    watchManager,
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
    connectionChannel,
    schemaTracker,
    healthStatusBar,
    filterStore,
  } = deps;

  // Feature command modules — each is isolated so one failing module does not
  // block the others or the core debug/connection logic.
  const featureModules: Array<[string, () => void]> = [
    ['tree', () => registerTreeCommands(context, client, treeProvider, editingBridge, fkNavigator, filterBridge, serverManager)],
    ['nav', () => registerNavCommands(context, client, diagnosticManager, editingBridge, fkNavigator, serverManager, discovery, filterBridge, connectionChannel, deps.refreshDriftConnectionUi)],
    ['mutationStream', () => registerMutationStreamCommands(context, client, editingBridge, fkNavigator, filterBridge)],
    [
      'dvr',
      () => {
        registerDvrCommands(context, client, {
          queryIntelligence: deps.queryIntelligence,
        });
        context.subscriptions.push(
          watcher.onDidChange(() => {
            DvrPanel.refreshIfVisible();
            void refreshDvrStatusBar(client);
          }),
        );
      },
    ],
    [
      'nlSql',
      () =>
        registerNlSqlCommands(context, client, {
          filterStore,
          schemaIntelligence: deps.schemaIntelligence,
          queryIntelligence: deps.queryIntelligence,
          logBridge,
        }),
    ],
    ['snapshot', () => registerSnapshotCommands(context, client, snapshotStore)],
    ['branching', () => registerBranchCommands(context, client)],
    ['schemaDiff', () => registerSchemaDiffCommands(context, client)],
    [
      'editing',
      () =>
        registerEditingCommands(
          context,
          client,
          changeTracker,
          watchManager,
          connectionChannel,
          snapshotStore,
        ),
    ],
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
    [
      'queryBuilder',
      () =>
        registerQueryBuilderCommands(context, client, {
          queryIntelligence: deps.queryIntelligence,
        }),
    ],
    ['refactoring', () => registerRefactoringCommands(context, client)],
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
    ['suite', () => {
      registerSuiteCommands(context, client, watcher);
      registerDiagnosticsMirror(context, client, watcher);
    }],
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
