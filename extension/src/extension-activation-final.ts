/**
 * Late activation phases: status bars, command registration, and event wiring.
 * Extracted from extension-main to keep files under the line cap.
 */
import * as vscode from 'vscode';
import { updateStatusBar } from './status-bar';
import { HealthStatusBar } from './status-bar-health';
import { ToolsQuickPickStatusBar, registerToolsQuickPickCommand } from './status-bar-tools';
import { registerAllCommands } from './extension-commands';
import { refreshDriftConnectionUi as syncDriftConnectionUi } from './connection-ui-state';
import { ConnectionStateMachine } from './connection-state';
import { getLogVerbosity, shouldLogConnectionLine } from './log-verbosity';
import { wireEventListeners } from './extension-activation-event-wiring';
import { maybeShowCoverageNotice } from './l10n/coverage-notice';
import { maybeRecommendSuiteTools } from './suite/cross-discovery';
import type { SchemaCache } from './schema-cache/schema-cache';
import type { ServerDiscovery } from './server-discovery';
import type { ServerManager } from './server-manager';
import type { AnnotationStore } from './annotations/annotation-store';
import { SchemaTracker } from './schema-timeline/schema-tracker';
import type { DriftApiClient } from './api-client';
import type { GenerationWatcher } from './generation-watcher';
import type { setupProviders } from './extension-providers';
import type { setupEditing } from './extension-editing';
import type { setupDiagnostics } from './extension-diagnostics';
import type { SchemaIntelligence } from './engines/schema-intelligence';
import type { QueryIntelligence } from './engines/query-intelligence';
import { ts, runPhase } from './extension-phase-utils';

/** Dependencies for final activation phases (8–10). */
export interface FinalPhaseDeps {
  context: vscode.ExtensionContext;
  channel: vscode.OutputChannel;
  cachedClient: DriftApiClient;
  schemaCache: SchemaCache;
  discovery: ServerDiscovery;
  serverManager: ServerManager;
  discoveryEnabled: boolean;
  extensionEnabled: boolean;
  watcher: GenerationWatcher;
  providers?: ReturnType<typeof setupProviders>;
  editing?: ReturnType<typeof setupEditing>;
  diagnostics?: ReturnType<typeof setupDiagnostics>;
  annotationStore: AnnotationStore;
  schemaTracker?: SchemaTracker;
  loadOnConnect: boolean;
  getLightweight: () => boolean;
  /** Intelligence engines when the intelligence activation phase succeeded. */
  intel?: { schemaIntel: SchemaIntelligence; queryIntel: QueryIntelligence };
}

/**
 * Run phases 8–10 of activation: status bars, command registration, and
 * event wiring. Returns the number of phases run and succeeded so the
 * caller can include them in the activation summary.
 */
export function setupFinalPhases(
  d: FinalPhaseDeps,
  track: <T>(r: T | undefined) => T | undefined,
): void {
  // Phase 8: Status bars + UI wiring.
  const statusBars = track(runPhase('status-bars', d.channel, () => {
    const statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    const refreshStatusBar = (): void =>
      updateStatusBar(statusItem, d.discovery, d.serverManager, d.discoveryEnabled, d.cachedClient);
    refreshStatusBar();
    d.context.subscriptions.push(statusItem);

    const healthStatusBar = new HealthStatusBar();
    d.context.subscriptions.push(healthStatusBar);

    const toolsQuickPick = new ToolsQuickPickStatusBar();
    d.context.subscriptions.push(toolsQuickPick);
    registerToolsQuickPickCommand(d.context);

    return { statusItem, healthStatusBar, toolsQuickPick, refreshStatusBar };
  }));

  // Single connection-state authority (Phase 1): the one writer of serverConnected /
  // databaseTreeEmpty. Every connection refresh below feeds it the four signals.
  const connectionStateMachine = new ConnectionStateMachine();
  d.context.subscriptions.push(connectionStateMachine);

  // Connection UI refresh callback — needs providers and schemaCache.
  const connectionUiRefresh: { fn?: () => void } = {};
  if (d.providers) {
    const providers = d.providers;
    connectionUiRefresh.fn = () => {
      syncDriftConnectionUi(d.serverManager, d.cachedClient, {
        toolsProvider: providers.toolsProvider,
        treeProvider: providers.treeProvider,
        schemaCache: d.schemaCache,
        stateMachine: connectionStateMachine,
      }, {
        appendLine: (msg: string) => {
          if (shouldLogConnectionLine(msg, getLogVerbosity())) {
            d.channel.appendLine(msg);
          }
        },
      });
      providers.treeProvider.notifyConnectionPresentationChanged();
    };
    d.providers.treeProvider.postRefreshHook = () => connectionUiRefresh.fn?.();
    d.context.subscriptions.push(
      d.schemaCache.onDidUpdate(() => {
        void providers.treeProvider.refresh();
      }),
    );
  }

  // Phase 9: Command registration.
  track(runPhase('commands', d.channel, () => {
    if (d.providers && d.editing) {
      // `d.diagnostics` is optional: if `setupDiagnostics` threw,
      // we still register commands so the user keeps basic nav /
      // debug commands. Nav-commands that dispatch to
      // `diagnosticManager.refresh()` degrade to a visible error
      // toast on invocation (the command still registers).
      registerAllCommands(d.context, d.cachedClient, {
        ...d.providers,
        ...d.editing,
        ...(d.diagnostics ?? {}),
        annotationStore: d.annotationStore,
        statusItem: statusBars?.statusItem ?? vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100),
        discovery: d.discovery,
        serverManager: d.serverManager,
        discoveryEnabled: d.discoveryEnabled,
        watcher: d.watcher,
        schemaTracker: d.schemaTracker ?? new SchemaTracker(d.cachedClient, d.context.workspaceState, d.watcher),
        updateStatusBar: statusBars?.refreshStatusBar ?? (() => {}),
        connectionChannel: d.channel,
        healthStatusBar: statusBars?.healthStatusBar ?? new HealthStatusBar(),
        refreshDriftConnectionUi: () => connectionUiRefresh.fn?.(),
        schemaIntelligence: d.intel?.schemaIntel,
        queryIntelligence: d.intel?.queryIntel,
      });
    } else if (d.providers) {
      d.channel.appendLine(`[${ts()}] Registering commands without editing (editing phase failed).`);
    } else {
      d.channel.appendLine(`[${ts()}] Skipping command registration: providers phase failed.`);
    }
  }));

  // Initial connection UI sync + VM transport listener.
  connectionUiRefresh.fn?.();
  d.context.subscriptions.push(
    d.cachedClient.onVmTransportChanged(() => connectionUiRefresh.fn?.()),
  );

  // Phase 10: Event listeners + initial state.
  track(runPhase('event-wiring', d.channel, () => {
    wireEventListeners(d, statusBars, connectionUiRefresh);
  }));

  // Phase 11: One-time per-display-language l10n coverage notice (plan 75 §2).
  // Fire-and-forget — it must never block or fail activation; the function
  // itself stays silent for English, untracked, and already-complete locales.
  track(runPhase('l10n-coverage-notice', d.channel, () => {
    void maybeShowCoverageNotice(d.context);
  }));

  // Phase 12: Suite cross-discovery nudge (plan 67 Phase 6). Fire-and-forget —
  // offers a sibling Saropa extension once when the project uses its Dart
  // package but lacks the extension; silent for non-Dart projects and tools the
  // user already has or has been offered.
  track(runPhase('suite-cross-discovery', d.channel, () => {
    void maybeRecommendSuiteTools(d.context);
  }));
}
