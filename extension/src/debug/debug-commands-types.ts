/**
 * Types for debug command registration.
 * Shared by debug-commands and its submodules.
 */

import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import type { DriftTreeProvider } from '../tree/drift-tree-provider';
import type { HoverCache } from '../hover/drift-hover-provider';
import type { SchemaDiagnostics } from '../linter/schema-diagnostics';
import type { LogCaptureBridge } from './log-capture-bridge';
import type { ServerDiscovery } from '../server-discovery';
import type { ServerManager } from '../server-manager';
import type { GenerationWatcher } from '../generation-watcher';
import type { DriftCodeLensProvider } from '../codelens/drift-codelens-provider';
import type { WatchManager } from '../watch/watch-manager';

/** Optional connection log for troubleshooting (e.g. Output > Saropa Drift Advisor). */
export interface IConnectionLog {
  appendLine(msg: string): void;
}

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
  refreshStatusBar?: () => void;
  connectionLog?: IConnectionLog;
}
