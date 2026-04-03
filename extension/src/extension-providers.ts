/**
 * Tree, language, and file decoration provider registration.
 * Registers tree view, definition/codelens/hover, file badges, timeline, task/terminal, log bridge.
 */

import * as vscode from 'vscode';
import type { DriftApiClient } from './api-client';
import type { AnnotationStore } from './annotations/annotation-store';
import { DriftFileDecorationProvider, buildTableFileMap } from './decorations/file-decoration-provider';
import { DriftCodeActionProvider, SchemaDiagnostics } from './linter/schema-diagnostics';
import { DriftCodeLensProvider } from './codelens/drift-codelens-provider';
import { TableNameMapper } from './codelens/table-name-mapper';
import type { IDiagnosticIssue } from './diagnostics/diagnostic-types';
import { LogCaptureBridge } from './debug/log-capture-bridge';
import { DriftDefinitionProvider } from './definition/drift-definition-provider';
import { DriftHoverProvider, HoverCache } from './hover/drift-hover-provider';
import { DriftTaskProvider } from './tasks/drift-task-provider';
import { HealthTerminalLinkProvider } from './tasks/health-link-provider';
import { DriftTimelineProvider } from './timeline/drift-timeline-provider';
import { SnapshotStore } from './timeline/snapshot-store';
import { DriftTreeProvider } from './tree/drift-tree-provider';
import { ToolsTreeProvider } from './tree/tools-tree-provider';
import { WatchManager } from './watch/watch-manager';
import { DataBreakpointProvider } from './data-breakpoint/data-breakpoint-provider';

export interface ProviderSetupResult {
  treeProvider: DriftTreeProvider;
  treeView: vscode.TreeView<unknown>;
  definitionProvider: DriftDefinitionProvider;
  codeLensProvider: DriftCodeLensProvider;
  hoverCache: HoverCache;
  hoverProvider: DriftHoverProvider;
  fileDecoProvider: DriftFileDecorationProvider;
  mapper: TableNameMapper;
  linter: SchemaDiagnostics;
  snapshotStore: SnapshotStore;
  timelineProvider: DriftTimelineProvider;
  watchManager: WatchManager;
  refreshBadges: () => Promise<void>;
  dbpProvider: DataBreakpointProvider;
  logBridge: LogCaptureBridge;
  toolsProvider: ToolsTreeProvider;
}

/**
 * Ref type for optional issues getter (set after DiagnosticManager is created in extension.ts).
 */
export interface LogCaptureIssuesRef {
  get(): IDiagnosticIssue[];
}

/**
 * Register tree view, language providers (definition, codelens, hover), legacy linter,
 * file decorations, timeline, watch manager, data breakpoint provider, task/terminal, log bridge.
 * When issuesRef is provided, the log bridge will include diagnostic issues in session-end meta/sidecar.
 * [isDriftUiConnected] mirrors connection UI state so the Database tree can show real command rows
 * when REST schema fails while HTTP/VM still reports connected (see DriftTreeProvider).
 */
export function setupProviders(
  context: vscode.ExtensionContext,
  client: DriftApiClient,
  annotationStore: AnnotationStore,
  issuesRef?: LogCaptureIssuesRef,
  isDriftUiConnected?: () => boolean,
  log?: { appendLine(msg: string): void },
): ProviderSetupResult {
  const cfg = vscode.workspace.getConfiguration('driftViewer');

  // Extract the extension version once — used for both the Database header
  // and the "About Saropa Drift Advisor vX.Y.Z" item in the Drift Tools tree.
  const extensionVersion = (context.extension?.packageJSON as { version?: string } | undefined)?.version ?? '0.0.0';

  const treeProvider = new DriftTreeProvider(client, annotationStore, isDriftUiConnected, log);
  const treeView = vscode.window.createTreeView(
    'driftViewer.databaseExplorer',
    { treeDataProvider: treeProvider, showCollapseAll: true },
  );
  // Show the version in the Database section header (visible in both
  // connected and disconnected states).
  treeView.description = `v${extensionVersion}`;
  context.subscriptions.push(treeView);

  // Register the Drift Tools tree view immediately after the Database view.
  // Both are always-visible sidebar sections declared in package.json.
  // Creating them first ensures VS Code never shows "no data provider" even
  // if a later provider registration throws.
  const toolsProvider = new ToolsTreeProvider(extensionVersion);
  const toolsView = vscode.window.createTreeView('driftViewer.toolbox', {
    treeDataProvider: toolsProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(toolsView);

  const definitionProvider = new DriftDefinitionProvider(client);
  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(
      { language: 'dart', scheme: 'file' },
      definitionProvider,
    ),
  );

  const mapper = new TableNameMapper();
  const codeLensProvider = new DriftCodeLensProvider(client, mapper);
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { language: 'dart', scheme: 'file' },
      codeLensProvider,
    ),
  );

  const hoverCache = new HoverCache();
  const hoverProvider = new DriftHoverProvider(client, mapper, hoverCache);
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      { language: 'dart', scheme: 'file' },
      hoverProvider,
    ),
  );

  const diagnosticCollection = vscode.languages.createDiagnosticCollection('drift-linter');
  context.subscriptions.push(diagnosticCollection);
  const linter = new SchemaDiagnostics(client, diagnosticCollection);
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      { language: 'dart', scheme: 'file' },
      new DriftCodeActionProvider(),
      { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] },
    ),
  );

  const fileDecoProvider = new DriftFileDecorationProvider();
  context.subscriptions.push(
    vscode.window.registerFileDecorationProvider(fileDecoProvider),
  );
  let tableFileMap: Map<string, string> | null = null;

  const snapshotStore = new SnapshotStore(
    cfg.get<number>('timeline.maxSnapshots', 20) ?? 20,
    cfg.get<number>('timeline.minIntervalMs', 10000) ?? 10000,
  );
  const timelineProvider = new DriftTimelineProvider(snapshotStore);
  // registerTimelineProvider is a proposed API in @types/vscode but stable
  // at runtime since VS Code 1.45. In Extension Development Host mode,
  // VS Code blocks it unless --enable-proposed-api is passed. Isolate the
  // call so a failure here does not take down the entire providers phase.
  try {
    context.subscriptions.push(
      vscode.workspace.registerTimelineProvider('file', timelineProvider),
    );
  } catch {
    // Timeline unavailable — dev host without --enable-proposed-api flag.
    // Non-critical: all other providers (tree, codeLens, hover, etc.) still work.
    log?.appendLine(
      `[${new Date().toISOString()}] Timeline provider skipped (proposed API not enabled in dev mode)`,
    );
  }
  context.subscriptions.push({ dispose: () => snapshotStore.dispose() });

  const watchManager = new WatchManager(client, context.workspaceState);
  watchManager.restore().catch(() => { /* no stored watches */ });

  async function ensureTableFileMap(): Promise<Map<string, string>> {
    if (!tableFileMap) {
      const meta = await client.schemaMetadata();
      mapper.updateTableList(meta.map((t) => t.name));
      tableFileMap = await buildTableFileMap(mapper);
    }
    timelineProvider.updateFileToTables(tableFileMap);
    return tableFileMap;
  }

  async function refreshBadges(): Promise<void> {
    const map = await ensureTableFileMap();
    const driftCfg = vscode.workspace.getConfiguration('driftViewer');
    if (!driftCfg.get<boolean>('fileBadges.enabled', true)) return;
    await fileDecoProvider.refresh(client, map);
  }

  const dbpProvider = new DataBreakpointProvider(client);
  context.subscriptions.push(dbpProvider);

  context.subscriptions.push(
    vscode.tasks.registerTaskProvider(DriftTaskProvider.type, new DriftTaskProvider()),
  );
  context.subscriptions.push(
    vscode.window.registerTerminalLinkProvider(new HealthTerminalLinkProvider()),
  );

  const logBridge = new LogCaptureBridge();
  const bridgeOptions = issuesRef
    ? { getLastCollectedIssues: () => issuesRef.get() }
    : undefined;
  logBridge.init(context, client, bridgeOptions).catch(() => { /* extension not installed */ });
  context.subscriptions.push({ dispose: () => logBridge.dispose() });

  return {
    treeProvider,
    treeView,
    definitionProvider,
    codeLensProvider,
    hoverCache,
    hoverProvider,
    fileDecoProvider,
    mapper,
    linter,
    snapshotStore,
    timelineProvider,
    watchManager,
    refreshBadges,
    dbpProvider,
    logBridge,
    toolsProvider,
  };
}
