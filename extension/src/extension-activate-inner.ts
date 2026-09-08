/**
 * Inner activation — phased setup.
 *
 * Extracted from extension-main.ts to keep that file under the line cap.
 * See extension-main.ts for the full phase-sequence overview and the
 * "activate() never re-throws" contract that governs how failures here
 * are handled by the caller.
 */

import * as vscode from 'vscode';
import { AnnotationStore } from './annotations/annotation-store';
import { SchemaIntelligence } from './engines/schema-intelligence';
import { QueryIntelligence } from './engines/query-intelligence';
import { setupProviders, type LogCaptureIssuesRef } from './extension-providers';
import { setupDiagnostics } from './extension-diagnostics';
import { setupEditing } from './extension-editing';
import { registerAboutCommands } from './about/about-commands';
import { registerRefreshTreeCommand } from './tree/tree-refresh-command';
import { isDriftUiConnected } from './connection-ui-state';
import { bootstrapExtension } from './extension-bootstrap';
import { SchemaTracker } from './schema-timeline/schema-tracker';
import { PackageStatusMonitor } from './workspace-setup/package-status-monitor';
import { SchemaCache } from './schema-cache/schema-cache';
import { createCachedDriftClient } from './schema-cache/cached-drift-client';
import type { DriftAdvisorApi } from './log-capture-api';
import { createDriftAdvisorApi } from './log-capture-api';
import { ts, runPhase } from './extension-phase-utils';
import { setupFinalPhases } from './extension-activation-final';
import { createBulkState } from './storage/bulk-state-factory';
// SQL Console sidebar view — the extension's first WebviewViewProvider
// (every other sidebar view is a TreeDataProvider). See plan 84.
import { SqlConsoleViewProvider } from './sql-console/sql-console-view';

// ---------------------------------------------------------------------------
// Inner activation — phased setup
// ---------------------------------------------------------------------------
/**
 * Runs each activation phase in sequence. Each phase is isolated via
 * {@link runPhase}: if it throws, the error is logged and surfaced but
 * later phases still execute. Phases that depend on an earlier phase's
 * result check for `undefined` and skip gracefully.
 */
export function activateInner(
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
  // Bulk state: disk-backed memento for heavy stores (branches, schema
  // snapshots, analysis history). Migrates existing workspaceState keys
  // to storageUri on first run to free the renderer heap (bug 086).
  // -----------------------------------------------------------------------
  const bulkState = createBulkState(context, channel);

  // -----------------------------------------------------------------------
  // Phase 3: Schema cache + cached client.
  // Commands need cachedClient, so we bail if this fails.
  // -----------------------------------------------------------------------
  const cacheResult = track(runPhase('schema-cache', channel, () => {
    const schemaCache = new SchemaCache(client, bulkState, {
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

  // -----------------------------------------------------------------------
  // Phase 4 (providers, continued): SQL Console sidebar webview view.
  //
  // Belongs to the providers phase because it is a view provider like the
  // trees registered above — but it is the first WebviewViewProvider in the
  // extension, so it gets its own runPhase rather than being folded into
  // setupProviders(): a failure constructing or registering the webview view
  // must not take the tree providers (or activation) down with it. runPhase
  // swallows and logs the error so later phases still run, honoring the
  // "activate() never re-throws" contract at the top of this file.
  //
  // The provider only needs the extension context — it resolves its client,
  // configuration, and l10n lazily when the view is first shown — so it has
  // no dependency on the providers phase having succeeded.
  track(runPhase('sql-console', channel, () => {
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
        SqlConsoleViewProvider.viewType,
        new SqlConsoleViewProvider(context),
      ),
    );
    // runPhase reports failure as `undefined`, and track() counts a phase as
    // succeeded only when the result is not `undefined` — so return a value
    // even though registration itself produces nothing useful.
    return true;
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
    const tracker = new SchemaTracker(cachedClient, bulkState, watcher);
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
  // Phases 8–10: Status bars, command registration, event wiring.
  // Extracted to extension-activation-final.ts to keep this file compact.
  // -----------------------------------------------------------------------
  setupFinalPhases({
    context,
    channel,
    cachedClient,
    schemaCache,
    discovery,
    serverManager,
    discoveryEnabled,
    extensionEnabled,
    watcher,
    providers,
    editing,
    diagnostics,
    annotationStore,
    schemaTracker,
    loadOnConnect,
    getLightweight,
    intel: intel ?? undefined,
    bulkState,
  }, track);

  // -----------------------------------------------------------------------
  // Activation summary.
  // -----------------------------------------------------------------------
  channel.appendLine(
    `[${ts()}] Activation complete: ${successCount}/${phaseCount} phases succeeded.`,
  );

  return driftAdvisorApi;
}
