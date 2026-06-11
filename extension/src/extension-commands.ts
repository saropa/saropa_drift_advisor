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
import type { DiagnosticSetupResult } from './extension-diagnostics';
import { registerDebugCommands } from './debug/debug-commands';
import type { HealthStatusBar } from './status-bar-health';
import type { SchemaTracker } from './schema-timeline/schema-tracker';
import { getLogVerbosity, shouldLogConnectionLine } from './log-verbosity';
import type { SchemaIntelligence } from './engines/schema-intelligence';
import type { QueryIntelligence } from './engines/query-intelligence';
import { registerSetLogVerbosityCommand } from './extension-set-log-verbosity-command';
import { registerFeatureModules } from './extension-feature-commands';

export interface CommandRegistrationDeps
  extends ProviderSetupResult,
    EditingSetupResult,
    Partial<DiagnosticSetupResult> {
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
  /** Present when the intelligence activation phase succeeded. */
  schemaIntelligence?: SchemaIntelligence;
  queryIntelligence?: QueryIntelligence;
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
    watchManager,
    refreshBadges,
    logBridge,
    discovery,
    serverManager,
    watcher,
    updateStatusBar,
    connectionChannel,
  } = deps;

  // `diagnosticManager` comes from the optional `DiagnosticSetupResult`
  // spread: if `setupDiagnostics` threw during activation, it's absent.
  // Fall back to a minimal no-op so downstream command handlers don't
  // have to check for undefined each time. The no-op preserves the
  // public contract (`refresh()` returns a resolved Promise, `clear()`
  // is a no-op) and simply does nothing — the user will see no
  // diagnostics because the collection never got created, which is
  // the correct degraded state when the diagnostic subsystem failed.
  const diagnosticManager =
    deps.diagnosticManager ??
    ({
      refresh: () => Promise.resolve(),
      clear: () => {},
    } as unknown as import('./diagnostics/diagnostic-manager').DiagnosticManager);

  // About commands are registered at the start of activate() (extension-main)
  // so the Database view (i) icon works even if registration here fails.

  registerSetLogVerbosityCommand(context);

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
    diagnosticManager,
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

  // Feature command modules — registered in an isolated try/catch per module so
  // one failure cannot block the others or the core debug/connection logic above.
  registerFeatureModules(context, client, deps, diagnosticManager);
}
