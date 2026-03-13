import * as vscode from 'vscode';
import type { DriftApiClient, QueryEntry } from '../api-client';
import type { DriftTreeProvider } from '../tree/drift-tree-provider';
import type { HoverCache } from '../hover/drift-hover-provider';
import type { SchemaDiagnostics } from '../linter/schema-diagnostics';
import type { LogCaptureBridge } from './log-capture-bridge';
import type { ServerDiscovery } from '../server-discovery';
import type { ServerManager } from '../server-manager';
import type { GenerationWatcher } from '../generation-watcher';
import type { DriftCodeLensProvider } from '../codelens/drift-codelens-provider';
import type { WatchManager } from '../watch/watch-manager';
import { PerformanceTreeProvider } from './performance-tree-provider';
import { DriftTerminalLinkProvider } from '../terminal/drift-terminal-link-provider';
import { SchemaSearchViewProvider } from '../schema-search/schema-search-view';
import { ColumnItem } from '../tree/tree-items';
import { buildProfileQueries, assembleProfile } from '../profiler/profiler-queries';
import { ProfilerPanel } from '../profiler/profiler-panel';
import { collectSchemaDocsData } from '../schema-docs/schema-docs-command';
import { DocsHtmlRenderer } from '../schema-docs/docs-html-renderer';
import { DocsMdRenderer } from '../schema-docs/docs-md-renderer';
import { GlobalSearchPanel } from '../global-search/global-search-panel';
import {
  getVmServiceUri,
  registerVmServiceOutputListener,
} from '../vm-service-uri';
import { VmServiceClient } from '../transport/vm-service-client';

export interface IDebugCommandDeps {
  client: DriftApiClient;
  treeProvider: DriftTreeProvider;
  treeView: vscode.TreeView<any>;
  hoverCache: HoverCache;
  linter: SchemaDiagnostics;
  logBridge: LogCaptureBridge;
  discovery: ServerDiscovery;
  serverManager: ServerManager;
  watcher: GenerationWatcher;
  codeLensProvider: DriftCodeLensProvider;
  watchManager: WatchManager;
  refreshBadges: () => Promise<void>;
  /** Called when VM Service connection state changes (connect or disconnect). */
  refreshStatusBar?: () => void;
}

/** Register debug panel, profiler, docs, and global search commands. */
export function registerDebugCommands(
  context: vscode.ExtensionContext,
  deps: IDebugCommandDeps,
): void {
  const {
    client, treeProvider, treeView, hoverCache, linter,
    logBridge, discovery, serverManager, watcher, codeLensProvider,
    watchManager, refreshBadges, refreshStatusBar,
  } = deps;

  // Performance tree view
  const perfProvider = new PerformanceTreeProvider();
  const perfView = vscode.window.createTreeView(
    'driftViewer.queryPerformance',
    { treeDataProvider: perfProvider },
  );
  context.subscriptions.push(perfView);

  // Terminal link provider — clickable SQLite errors
  const revealTable = async (name: string): Promise<void> => {
    let item = treeProvider.findTableItem(name);
    if (!item) {
      await treeProvider.refresh();
      item = treeProvider.findTableItem(name);
    }
    if (item) {
      await treeView.reveal(item, { select: true, focus: true });
    } else {
      await vscode.commands.executeCommand(
        'driftViewer.databaseExplorer.focus',
      );
    }
  };
  context.subscriptions.push(
    vscode.window.registerTerminalLinkProvider(
      new DriftTerminalLinkProvider(client, revealTable, logBridge),
    ),
  );

  // Show all tables (QuickPick)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.showAllTables',
      async () => {
        try {
          const meta = await client.schemaMetadata();
          const names = meta.map((t) => t.name).sort();
          if (names.length === 0) {
            vscode.window.showInformationMessage('No tables found.');
            return;
          }
          const picked = await vscode.window.showQuickPick(names, {
            placeHolder: 'Select a table to reveal',
          });
          if (picked) await revealTable(picked);
        } catch {
          vscode.window.showWarningMessage(
            'Drift debug server not reachable.',
          );
        }
      },
    ),
  );

  // Schema search sidebar panel
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      SchemaSearchViewProvider.viewType,
      new SchemaSearchViewProvider(client, revealTable),
    ),
  );

  // Refresh performance
  context.subscriptions.push(
    vscode.commands.registerCommand('driftViewer.refreshPerformance', () =>
      perfProvider.refresh(client),
    ),
  );

  // Clear performance stats
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.clearPerformance',
      async () => {
        try {
          await client.clearPerformance();
          await perfProvider.refresh(client);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Clear stats failed: ${msg}`);
        }
      },
    ),
  );

  // Show query detail (click on a query item)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.showQueryDetail',
      async (query: QueryEntry) => {
        const content = [
          `-- Duration: ${query.durationMs}ms`,
          `-- Rows: ${query.rowCount}`,
          `-- Time: ${query.at}`,
          '',
          query.sql,
        ].join('\n');
        const doc = await vscode.workspace.openTextDocument({
          content,
          language: 'sql',
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
      },
    ),
  );

  // Column profiler
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.profileColumn',
      async (item: ColumnItem) => {
        try {
          const profile = await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: `Profiling ${item.tableName}.${item.column.name}\u2026`,
            },
            async () => {
              const queries = buildProfileQueries(
                item.tableName, item.column.name, item.column.type,
              );
              const results = new Map<string, unknown[][]>();
              for (const query of queries) {
                try {
                  const r = await client.sql(query.sql);
                  results.set(query.name, r.rows);
                } catch {
                  // Skip failed queries gracefully
                }
              }
              return assembleProfile(
                item.tableName, item.column.name,
                item.column.type, results,
              );
            },
          );
          ProfilerPanel.createOrShow(profile);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Profile failed: ${msg}`);
        }
      },
    ),
  );

  // Schema documentation generator
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.generateSchemaDocs',
      async () => {
        const format = await vscode.window.showQuickPick([
          { label: 'HTML', description: 'Self-contained web page', value: 'html' as const },
          { label: 'Markdown', description: 'Plain text, VCS-friendly', value: 'md' as const },
        ], { placeHolder: 'Output format' });
        if (!format) return;
        try {
          await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: 'Generating documentation\u2026' },
            async () => {
              const data = await collectSchemaDocsData(client);
              if (format.value === 'html') {
                const html = new DocsHtmlRenderer().render(data);
                const uri = await vscode.window.showSaveDialog({
                  defaultUri: vscode.Uri.file('schema-docs.html'),
                  filters: { HTML: ['html'] },
                });
                if (uri) {
                  await vscode.workspace.fs.writeFile(uri, Buffer.from(html, 'utf-8'));
                  await vscode.env.openExternal(uri);
                }
              } else {
                const md = new DocsMdRenderer().render(data);
                const doc = await vscode.workspace.openTextDocument({ content: md, language: 'markdown' });
                await vscode.window.showTextDocument(doc);
              }
            },
          );
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Schema docs failed: ${msg}`);
        }
      },
    ),
  );

  // Global search
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.globalSearch',
      () => GlobalSearchPanel.createOrShow(client),
    ),
  );

  // Debug session lifecycle (Plan 68: prefer VM Service when Dart/Flutter debugging)
  const refreshInterval = vscode.workspace.getConfiguration('driftViewer')
    .get<number>('performance.refreshIntervalMs', 3000) ?? 3000;

  const tryConnectVm = async (
    session: vscode.DebugSession,
    vmUri: string,
  ): Promise<boolean> => {
    if (session.type !== 'dart' && session.type !== 'flutter') return false;
    if (client.usingVmService) return true;
    try {
      const vmClient = new VmServiceClient({
        wsUri: vmUri,
        onClose: () => {
          // Hot restart or VM disconnect: clear VM client and UI state so we don't stay in a broken state.
          client.setVmClient(null);
          vscode.commands.executeCommand(
            'setContext',
            'driftViewer.serverConnected',
            false,
          );
          hoverCache.clear();
          perfProvider.stopAutoRefresh();
          linter.clear();
          refreshStatusBar?.();
          treeProvider.refresh();
          logBridge.writeConnectionEvent('VM Service disconnected (e.g. hot restart)');
        },
      });
      await vmClient.connect();
      client.setVmClient(vmClient);
      await client.health();
      vscode.commands.executeCommand(
        'setContext',
        'driftViewer.serverConnected',
        true,
      );
      await treeProvider.refresh();
      perfProvider.startAutoRefresh(client, refreshInterval);
      refreshStatusBar?.();
      logBridge.writeConnectionEvent(
        'Connected to Drift debug server via VM Service',
      );
      return true;
    } catch {
      client.setVmClient(null);
      return false;
    }
  };

  registerVmServiceOutputListener((session, wsUri) => {
    void tryConnectVm(session, wsUri);
  }).forEach((d) => context.subscriptions.push(d));

  context.subscriptions.push(
    vscode.debug.onDidStartDebugSession(async (session) => {
      if (session.type !== 'dart' && session.type !== 'flutter') return;
      hoverCache.clear();
      const vmUri = await getVmServiceUri(session);
      if (vmUri && (await tryConnectVm(session, vmUri))) return;
      if (!serverManager.activeServer) discovery.retry();
      try {
        await client.health();
        vscode.commands.executeCommand(
          'setContext',
          'driftViewer.serverConnected',
          true,
        );
        perfProvider.startAutoRefresh(client, refreshInterval);
        logBridge.writeConnectionEvent(
          `Connected to Drift debug server at ${client.baseUrl}`,
        );
      } catch {
        // Server not reachable — panel stays hidden
      }
    }),
  );

  context.subscriptions.push(
    vscode.debug.onDidTerminateDebugSession((session) => {
      if (session.type !== 'dart' && session.type !== 'flutter') return;
      client.setVmClient(null);
      vscode.commands.executeCommand(
        'setContext',
        'driftViewer.serverConnected',
        false,
      );
      hoverCache.clear();
      perfProvider.stopAutoRefresh();
      linter.clear();
      refreshStatusBar?.();
      logBridge.writeConnectionEvent('Drift debug server disconnected');
    }),
  );

  context.subscriptions.push({
    dispose: () => perfProvider.stopAutoRefresh(),
  });
}
