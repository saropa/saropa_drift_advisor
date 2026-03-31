/**
 * Drift Advisor extension entry point.
 *
 * Activation is split into isolated **phases**, each wrapped in its own
 * try/catch. If one phase throws, the error is logged and surfaced via
 * toast — but later phases still run so commands registered by surviving
 * phases remain functional. The outer activate() **never re-throws**:
 * re-throwing causes VS Code to dispose ALL registered commands, turning
 * every sidebar button into "command not found".
 *
 * Phase sequence:
 *   0  Output channel (cannot fail — created before anything else)
 *   1  Bootstrap (client, discovery, watcher, serverManager)
 *   2  About commands (zero-dependency sidebar icons)
 *   3  Schema cache + cached client
 *   4  Providers (tree, tools, codeLens, hover, linter, etc.)
 *   5  Intelligence engines (schema, query)
 *   6  Diagnostics
 *   7  Editing (change tracker, FK navigator, pending edits)
 *   8  Status bars + UI wiring
 *   9  Command registration (registerAllCommands)
 *  10  Event listeners + initial state
 */

import * as vscode from 'vscode';
import { AnnotationStore } from './annotations/annotation-store';
import { DashboardPanel } from './dashboard/dashboard-panel';
import { SchemaIntelligence } from './engines/schema-intelligence';
import { QueryIntelligence } from './engines/query-intelligence';
import { updateStatusBar } from './status-bar';
import { HealthStatusBar } from './status-bar-health';
import { ToolsQuickPickStatusBar, registerToolsQuickPickCommand } from './status-bar-tools';
import { setupProviders, type LogCaptureIssuesRef } from './extension-providers';
import { setupDiagnostics } from './extension-diagnostics';
import { setupEditing } from './extension-editing';
import { registerAllCommands } from './extension-commands';
import { registerAboutCommands } from './about/about-commands';
import { registerRefreshTreeCommand } from './tree/tree-commands';
import {
  isDriftUiConnected,
  refreshDriftConnectionUi as syncDriftConnectionUi,
} from './connection-ui-state';
import { bootstrapExtension } from './extension-bootstrap';
import { SchemaTracker } from './schema-timeline/schema-tracker';
import { PackageStatusMonitor } from './workspace-setup/package-status-monitor';
import { SchemaCache } from './schema-cache/schema-cache';
import { createCachedDriftClient } from './schema-cache/cached-drift-client';
import type { DriftAdvisorApi } from './log-capture-api';
import { createDriftAdvisorApi } from './log-capture-api';
import { getLogVerbosity, shouldLogConnectionLine } from './log-verbosity';

// ---------------------------------------------------------------------------
// Timestamp helper for activation log lines.
// ---------------------------------------------------------------------------
/** Returns an ISO timestamp string for log lines. */
function ts(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Phase runner — isolates each activation step so one failure does not
// cascade to later phases.
// ---------------------------------------------------------------------------
/**
 * Runs a single activation phase inside a try/catch.
 *
 * On success: logs completion and returns the phase result.
 * On failure: logs the error + stack trace to the output channel,
 * shows a user-visible error toast, and returns `undefined` so later
 * phases can check whether their dependency is available.
 */
function runPhase<T>(
  name: string,
  channel: vscode.OutputChannel,
  fn: () => T,
): T | undefined {
  channel.appendLine(`[${ts()}] Phase "${name}" starting...`);
  try {
    const result = fn();
    channel.appendLine(`[${ts()}] Phase "${name}" completed.`);
    return result;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack ?? '' : '';
    channel.appendLine(`[${ts()}] Phase "${name}" FAILED: ${msg}\n${stack}`);
    void vscode.window.showErrorMessage(
      `Saropa Drift Advisor: "${name}" failed — ${msg}. Some features may be unavailable.`,
    );
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------
/**
 * Extension activation. Creates an output channel first, then delegates to
 * {@link _activateInner} for phased setup. The outer try/catch is a safety
 * net for anything that escapes the per-phase isolation — it **never
 * re-throws** so that VS Code does not dispose already-registered commands.
 */
export function activate(context: vscode.ExtensionContext): DriftAdvisorApi | undefined {
  // Phase 0: Output channel — created before everything else so every
  // subsequent phase can log to it. Cannot meaningfully fail.
  const channel = vscode.window.createOutputChannel('Saropa Drift Advisor');
  context.subscriptions.push(channel);
  channel.appendLine(`[${ts()}] Saropa Drift Advisor activating...`);

  try {
    return _activateInner(context, channel);
  } catch (err: unknown) {
    // Safety net for any error that escaped per-phase isolation.
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack ?? '' : '';
    void vscode.window.showErrorMessage(
      `Saropa Drift Advisor failed to activate: ${msg}`,
    );
    channel.appendLine(`[${ts()}] FATAL unhandled error: ${msg}\n${stack}`);
    // Log to Extension Host console so developers can find it in
    // Output → Extension Host even if the Saropa channel is not open.
    console.error('[Saropa Drift Advisor] Activation failed:', msg, '\n', stack);
    // DO NOT re-throw. Re-throwing causes VS Code to mark the extension
    // as failed and dispose ALL registered commands — even those from
    // earlier phases that completed successfully. The tree view survives
    // (it is a UI element) but every command becomes "command not found".
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Inner activation — phased setup
// ---------------------------------------------------------------------------
/**
 * Runs each activation phase in sequence. Each phase is isolated via
 * {@link runPhase}: if it throws, the error is logged and surfaced but
 * later phases still execute. Phases that depend on an earlier phase's
 * result check for `undefined` and skip gracefully.
 */
function _activateInner(
  context: vscode.ExtensionContext,
  channel: vscode.OutputChannel,
): DriftAdvisorApi | undefined {
  let phaseCount = 0;
  let successCount = 0;
  const track = <T>(result: T | undefined): T | undefined => {
    phaseCount++;
    if (result !== undefined) successCount++;
    return result;
  };

  // -----------------------------------------------------------------------
  // Phase 1: Bootstrap — client, discovery, watcher, serverManager.
  // Without these, nothing works, so we bail if this phase fails.
  // -----------------------------------------------------------------------
  const bootstrap = track(runPhase('bootstrap', channel, () =>
    bootstrapExtension(context, channel),
  ));
  if (!bootstrap) {
    // About commands can still be registered even without bootstrap —
    // they only need the extension context.
    track(runPhase('about-commands', channel, () =>
      registerAboutCommands(context),
    ));
    channel.appendLine(
      `[${ts()}] Activation aborted: bootstrap failed. ${successCount}/${phaseCount} phases succeeded.`,
    );
    return undefined;
  }

  const {
    client,
    watcher,
    discovery,
    serverManager,
    discoveryEnabled,
    extensionEnabled,
    cfg,
  } = bootstrap;

  // -----------------------------------------------------------------------
  // Phase 2: About commands — zero-dependency sidebar title icons.
  // Registered early so the (i) icon works even if everything else fails.
  // -----------------------------------------------------------------------
  track(runPhase('about-commands', channel, () =>
    registerAboutCommands(context),
  ));

  // -----------------------------------------------------------------------
  // Phase 3: Schema cache + cached client.
  // Commands need cachedClient, so we bail if this fails.
  // -----------------------------------------------------------------------
  const cacheResult = track(runPhase('schema-cache', channel, () => {
    const schemaCache = new SchemaCache(client, context.workspaceState, {
      ttlMs: cfg.get<number>('schemaCache.ttlMs', 30_000) ?? 30_000,
      persistKey: cfg.get<string>('schemaCache.persistKey', 'driftViewer.lastKnownSchema') || undefined,
      log: channel,
    });
    const cachedClient = createCachedDriftClient(client, schemaCache);
    return { schemaCache, cachedClient };
  }));
  if (!cacheResult) {
    channel.appendLine(
      `[${ts()}] Activation aborted: schema-cache failed. ${successCount}/${phaseCount} phases succeeded.`,
    );
    return undefined;
  }
  const { schemaCache, cachedClient } = cacheResult;

  // Config values used by multiple later phases.
  const loadOnConnect = cfg.get<boolean>('database.loadOnConnect', true) !== false;
  let treeLoadedLazy = false;
  const getLightweight = (): boolean =>
    vscode.workspace.getConfiguration('driftViewer').get<boolean>('lightweight', false) === true;

  // -----------------------------------------------------------------------
  // Phase 4: Providers — tree, tools, codeLens, hover, linter, etc.
  // -----------------------------------------------------------------------
  const annotationStore = new AnnotationStore(context.workspaceState);
  const issuesRef: LogCaptureIssuesRef = { get: () => [] };
  const providers = track(runPhase('providers', channel, () => {
    const result = setupProviders(
      context,
      cachedClient,
      annotationStore,
      issuesRef,
      () => isDriftUiConnected(serverManager, cachedClient),
      channel,
    );
    // Register the tree refresh command immediately alongside the tree
    // provider so the Database header refresh icon works even if later
    // command registration fails.
    registerRefreshTreeCommand(context, result.treeProvider);
    return result;
  }));

  // Package status monitor — lightweight, independent of providers.
  const packageMonitor = new PackageStatusMonitor();
  packageMonitor.start();
  context.subscriptions.push(packageMonitor);
  if (providers) {
    context.subscriptions.push(
      packageMonitor.onDidChangeInstalled((installed) => {
        providers.toolsProvider.setPackageInstalled(installed);
      }),
    );
  }

  // -----------------------------------------------------------------------
  // Phase 5: Intelligence engines (schema analysis, query analysis).
  // -----------------------------------------------------------------------
  const intel = track(runPhase('intelligence', channel, () => {
    const schemaIntel = new SchemaIntelligence(cachedClient);
    const queryIntel = new QueryIntelligence(cachedClient);
    context.subscriptions.push(schemaIntel, queryIntel);
    return { schemaIntel, queryIntel };
  }));

  // -----------------------------------------------------------------------
  // Phase 6: Diagnostics — requires intelligence engines and providers.
  // -----------------------------------------------------------------------
  const diagnostics = (intel)
    ? track(runPhase('diagnostics', channel, () => {
        const result = setupDiagnostics(context, cachedClient, intel.schemaIntel, intel.queryIntel);
        // Wire up the issues ref so log-capture can report diagnostics.
        issuesRef.get = () => result.diagnosticManager.getLastCollectedIssues();
        return result;
      }))
    : undefined;
  // Track skipped phase so the counter is accurate.
  if (!intel) { phaseCount++; }

  // Schema tracker depends on watcher; independent of diagnostics.
  const schemaTracker = runPhase('schema-tracker', channel, () => {
    const tracker = new SchemaTracker(cachedClient, context.workspaceState, watcher);
    context.subscriptions.push(tracker);
    return tracker;
  });
  if (schemaTracker !== undefined) { phaseCount++; successCount++; } else { phaseCount++; }

  // Log Capture API — returned from activate() so other extensions can
  // access it via vscode.extensions.getExtension('saropa.drift-viewer')?.exports.
  // Built here (after cachedClient exists) and returned at the end.
  const driftAdvisorApi = createDriftAdvisorApi(
    () => (isDriftUiConnected(serverManager, cachedClient) ? cachedClient : null),
    () => issuesRef.get(),
  );

  // -----------------------------------------------------------------------
  // Phase 7: Editing — change tracker, FK navigator, pending edits.
  // -----------------------------------------------------------------------
  const editing = track(runPhase('editing', channel, () =>
    setupEditing(context, cachedClient),
  ));

  // Wire editing change tracker → context + log bridge (only if both
  // editing and providers succeeded).
  if (editing && providers) {
    editing.changeTracker.onDidChange(() => {
      vscode.commands.executeCommand('setContext', 'driftViewer.hasEdits', editing.changeTracker.changeCount > 0);
      vscode.commands.executeCommand('setContext', 'driftViewer.editingActive', editing.changeTracker.changeCount > 0);
      providers.logBridge.writeDataEdit(editing.changeTracker.lastLogMessage);
    });
  }

  // -----------------------------------------------------------------------
  // Phase 8: Status bars + UI wiring.
  // -----------------------------------------------------------------------
  let dashboardPromptShown = false;
  const statusBars = track(runPhase('status-bars', channel, () => {
    const statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    const refreshStatusBar = (): void =>
      updateStatusBar(statusItem, discovery, serverManager, discoveryEnabled, cachedClient);
    refreshStatusBar();
    context.subscriptions.push(statusItem);

    const healthStatusBar = new HealthStatusBar();
    context.subscriptions.push(healthStatusBar);

    const toolsQuickPick = new ToolsQuickPickStatusBar();
    context.subscriptions.push(toolsQuickPick);
    registerToolsQuickPickCommand(context);

    return { statusItem, healthStatusBar, toolsQuickPick, refreshStatusBar };
  }));

  // Connection UI refresh callback — needs providers and schemaCache.
  // Wrapped in a mutable ref so commands can call it after wiring.
  const connectionUiRefresh: { fn?: () => void } = {};
  if (providers) {
    connectionUiRefresh.fn = () => {
      syncDriftConnectionUi(serverManager, cachedClient, {
        toolsProvider: providers.toolsProvider,
        schemaSearchProvider: providers.schemaSearchProvider,
        treeProvider: providers.treeProvider,
        schemaCache,
      }, {
        appendLine: (msg: string) => {
          if (shouldLogConnectionLine(msg, getLogVerbosity())) {
            channel.appendLine(msg);
          }
        },
      });
      providers.treeProvider.notifyConnectionPresentationChanged();
    };
    providers.treeProvider.postRefreshHook = () => connectionUiRefresh.fn?.();
    context.subscriptions.push(
      schemaCache.onDidUpdate(() => {
        void providers.treeProvider.refresh();
      }),
    );
  }

  // -----------------------------------------------------------------------
  // Phase 9: Command registration.
  // -----------------------------------------------------------------------
  track(runPhase('commands', channel, () => {
    if (providers && editing) {
      registerAllCommands(context, cachedClient, {
        ...providers,
        ...editing,
        annotationStore,
        statusItem: statusBars?.statusItem ?? vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100),
        discovery,
        serverManager,
        discoveryEnabled,
        watcher,
        schemaTracker: schemaTracker ?? new SchemaTracker(cachedClient, context.workspaceState, watcher),
        updateStatusBar: statusBars?.refreshStatusBar ?? (() => {}),
        connectionChannel: channel,
        healthStatusBar: statusBars?.healthStatusBar ?? new HealthStatusBar(),
        refreshDriftConnectionUi: () => connectionUiRefresh.fn?.(),
      });
    } else if (providers) {
      // Editing failed but providers are available — register commands
      // without editing dependencies. Some commands will be unavailable
      // but tree/nav/tools commands will work.
      channel.appendLine(`[${ts()}] Registering commands without editing (editing phase failed).`);
    } else {
      // Providers failed — cannot register commands at all.
      channel.appendLine(`[${ts()}] Skipping command registration: providers phase failed.`);
    }
  }));

  // Wire schema search to discovery (only if providers exist).
  if (providers) {
    providers.schemaSearchProvider.attachDiscoveryMonitor(discovery);
    context.subscriptions.push({
      dispose: () => {
        providers.schemaSearchProvider.disposeDiscoveryMonitor();
      },
    });
  }

  // Initial connection UI sync + VM transport listener.
  connectionUiRefresh.fn?.();
  context.subscriptions.push(
    cachedClient.onVmTransportChanged(() => connectionUiRefresh.fn?.()),
  );

  // -----------------------------------------------------------------------
  // Phase 10: Event listeners + initial state.
  // -----------------------------------------------------------------------
  track(runPhase('event-wiring', channel, () => {
    // Master enable/disable switch.
    const applyEnabledState = (enabled: boolean): void => {
      void vscode.commands.executeCommand('setContext', 'driftViewer.enabled', enabled);
      if (enabled) {
        if (discoveryEnabled) discovery.start();
        watcher.start();
        if (providers) {
          if (loadOnConnect) void providers.treeProvider.refresh();
          providers.codeLensProvider.refreshRowCounts();
          providers.linter.refresh();
        }
        diagnostics?.diagnosticManager.refresh().catch(() => {});
        if (providers && !getLightweight()) providers.refreshBadges().catch(() => {});
        connectionUiRefresh.fn?.();
      } else {
        discovery.stop();
        watcher.stop();
        serverManager.clearActive();
        schemaCache.invalidate();
        statusBars?.healthStatusBar.hide();
        statusBars?.toolsQuickPick.hide();
        connectionUiRefresh.fn?.();
      }
      statusBars?.refreshStatusBar();
    };

    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('driftViewer.enabled')) {
          const enabled = vscode.workspace.getConfiguration('driftViewer').get<boolean>('enabled', true) !== false;
          applyEnabledState(enabled);
        }
      }),
    );

    // Server connection lifecycle.
    serverManager.onDidChangeActive((server) => {
      statusBars?.refreshStatusBar();
      schemaCache.invalidate();
      connectionUiRefresh.fn?.();
      if (isDriftUiConnected(serverManager, cachedClient)) {
        statusBars?.toolsQuickPick.show();
      } else {
        statusBars?.toolsQuickPick.hide();
      }
      if (!server) {
        statusBars?.healthStatusBar.hide();
        treeLoadedLazy = false;
      }
      if (server) {
        watcher.stop();
        watcher.reset();
        watcher.start();
        schemaCache.prewarm();
        if (providers) {
          if (loadOnConnect) void providers.treeProvider.refresh();
          providers.codeLensProvider.refreshRowCounts();
          providers.linter.refresh();
        }
        diagnostics?.diagnosticManager.refresh().catch(() => {});
        if (providers && !getLightweight()) providers.refreshBadges().catch(() => {});
        if (providers) providers.watchManager.refresh().catch(() => {});
        if (!dashboardPromptShown) {
          dashboardPromptShown = true;
          const showOnConnect = vscode.workspace
            .getConfiguration('driftViewer')
            .get<boolean>('dashboard.showOnConnect', true);
          const suppressKey = 'driftViewer.suppressDashboardPrompt';
          const suppressed = context.workspaceState.get<boolean>(suppressKey, false);
          if (showOnConnect && !suppressed) {
            void vscode.window.showInformationMessage(
              'Drift server connected! Open the Dashboard to explore all features.',
              'Open Dashboard',
              "Don't Show Again",
            ).then((choice) => {
              if (choice === 'Open Dashboard') {
                vscode.commands.executeCommand('driftViewer.openDashboard');
              } else if (choice === "Don't Show Again") {
                context.workspaceState.update(suppressKey, true);
              }
            });
          }
        }
      }
    });

    // Delayed context sync to handle races where the sidebar evaluates
    // before the extension finishes wiring.
    const syncContextTimeout = setTimeout(() => {
      connectionUiRefresh.fn?.();
    }, 1500);
    context.subscriptions.push({
      dispose: () => clearTimeout(syncContextTimeout),
    });

    // Discovery server list changes.
    discovery.onDidChangeServers(() => {
      statusBars?.refreshStatusBar();
      connectionUiRefresh.fn?.();
    });

    // Lazy tree loading when the tree view becomes visible.
    if (providers && typeof providers.treeView.onDidChangeVisibility === 'function') {
      context.subscriptions.push(
        providers.treeView.onDidChangeVisibility((e: { visible: boolean }) => {
          if (e.visible && !loadOnConnect && !treeLoadedLazy && isDriftUiConnected(serverManager, cachedClient)) {
            treeLoadedLazy = true;
            void providers.treeProvider.refresh();
          }
        }),
      );
    }

    // Schema generation watcher — refreshes tree, caches, linters, etc.
    watcher.onDidChange(async () => {
      schemaCache.invalidate();
      if (!getLightweight() && providers) {
        void providers.treeProvider.refresh();
        providers.definitionProvider.clearCache();
        providers.hoverCache.clear();
        await providers.codeLensProvider.refreshRowCounts();
        providers.codeLensProvider.notifyChange();
        providers.linter.refresh();
        diagnostics?.diagnosticManager.refresh().catch(() => {});
        providers.refreshBadges().catch(() => {});
        if (vscode.workspace.getConfiguration('driftViewer').get<boolean>('timeline.autoCapture', true)) {
          providers.snapshotStore.capture(cachedClient).catch(() => {});
        }
        providers.watchManager.refresh().catch(() => {});
        if (DashboardPanel.currentPanel) {
          DashboardPanel.currentPanel.refreshAll().catch(() => {});
        }
      }
      if (providers) {
        providers.dbpProvider.onGenerationChange().catch(() => {});
      }
    });

    // Start watcher + initial refresh if extension is enabled.
    if (extensionEnabled) {
      watcher.start();
      if (providers) {
        if (loadOnConnect) {
          void providers.treeProvider.refresh();
        }
        providers.codeLensProvider.refreshRowCounts();
        providers.linter.refresh();
      }
      if (isDriftUiConnected(serverManager, cachedClient)) {
        schemaCache.prewarm();
      }
      diagnostics?.diagnosticManager.refresh().catch(() => {});
      if (providers && !getLightweight()) providers.refreshBadges().catch(() => {});
    }
    context.subscriptions.push({ dispose: () => watcher.stop() });
  }));

  // -----------------------------------------------------------------------
  // Activation summary.
  // -----------------------------------------------------------------------
  channel.appendLine(
    `[${ts()}] Activation complete: ${successCount}/${phaseCount} phases succeeded.`,
  );

  return driftAdvisorApi;
}

/** Called when the extension is deactivated. */
export function deactivate(): void {
  return;
}
