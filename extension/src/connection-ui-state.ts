/**
 * Connection UI orchestration for the VS Code extension.
 *
 * **Problem:** Discovery reports an HTTP endpoint and/or the Dart debugger attaches a VM
 * Service transport. Sidebar features used to key off `ServerManager.activeServer` only,
 * so Schema Search and `driftViewer.serverConnected` could disagree with a working
 * Database tree (VM-only) or with a verified HTTP fallback before discovery adopted the port.
 *
 * **Model:** `isDriftUiConnected` is true if either HTTP has an active server **or**
 * `DriftApiClient.usingVmService` is true. `buildConnectionPresentation` turns that into
 * user-facing `label` / `hint` strings for the Schema Search webview and logs.
 *
 * **Refresh:** `refreshDriftConnectionUi` updates (1) VS Code context, (2) Drift Tools tree,
 * (3) Schema Search presentation. Each step is try/catch-isolated so one failure does not
 * block the others. Logging is optional and may be verbosity-filtered by the caller.
 *
 * **Logging dedup:** When a log sink is provided, we emit a full line when the presentation
 * signature changes, or on every refresh if `driftViewer.connection.logEveryUiRefresh` is
 * true (troubleshooting). Hints on disconnect are logged only when the signature changes.
 *
 * **Tests:** Call `resetConnectionUiPresentationCacheForTests()` between cases that assert
 * on log call counts (module-level signature cache).
 */

import * as vscode from 'vscode';
import type { DriftApiClient } from './api-client';
import type { ServerManager } from './server-manager';
import type { ToolsTreeProvider } from './tree/tools-tree-provider';
import type { DriftTreeProvider } from './tree/drift-tree-provider';
import type { SchemaSearchViewProvider } from './schema-search/schema-search-view';
import type { SchemaCache } from './schema-cache/schema-cache';

/** User-visible summary of how the extension reaches Drift. */
export interface DriftConnectionPresentation {
  connected: boolean;
  /**
   * When true, Schema Search may query persisted/cached schema without a live session.
   * Mirrors [connected] unless the Database tree is showing offline cached schema.
   */
  schemaOperationsEnabled: boolean;
  /** Short status line for the Schema Search panel. */
  label: string;
  /** Longer troubleshooting hint when disconnected or in mixed VM/HTTP mode. */
  hint: string;
  viaHttp: boolean;
  viaVm: boolean;
  host?: string;
  port?: number;
  /**
   * Workspace has a non-empty persisted schema list (may not be loaded into the tree yet).
   */
  persistedSchemaAvailable: boolean;
}

/** True when the API client can reach Drift via HTTP selection or VM Service. */
export function isDriftUiConnected(
  serverManager: ServerManager,
  client: DriftApiClient,
): boolean {
  return serverManager.activeServer !== undefined || client.usingVmService;
}

/**
 * Builds a stable label + hint for logs and the Schema Search webview.
 */
export function buildConnectionPresentation(
  serverManager: ServerManager,
  client: DriftApiClient,
): DriftConnectionPresentation {
  const viaVm = client.usingVmService;
  const active = serverManager.activeServer;
  const viaHttp = active !== undefined;
  const connected = viaHttp || viaVm;

  if (!connected) {
    return {
      connected: false,
      schemaOperationsEnabled: false,
      persistedSchemaAvailable: false,
      label: 'Not connected',
      hint:
        'Run the app with DriftDebugServer.start(), start a Dart/Flutter debug session, '
        + 'or use the actions below (Retry discovery, Diagnose). '
        + 'Check Output → Saropa Drift Advisor for connection lines.',
      viaHttp: false,
      viaVm: false,
    };
  }

  const port = active?.port ?? client.port;
  const host = active?.host ?? client.host;
  let label: string;
  if (viaVm && viaHttp) {
    label = `VM Service + HTTP (${host}:${port})`;
  } else if (viaVm) {
    label = 'VM Service (debug session)';
  } else {
    label = `HTTP ${host}:${port}`;
  }

  const hint = viaVm && !viaHttp
    ? 'API calls go through the VM Service; HTTP discovery has not selected a port yet. '
      + 'If the Database tree works but something else fails, use Diagnose Connection.'
    : 'Schema Search and Database views use the connection above.';

  return {
    connected: true,
    schemaOperationsEnabled: true,
    persistedSchemaAvailable: false,
    label,
    hint,
    viaHttp,
    viaVm,
    host,
    port,
  };
}

export interface IConnectionUiTargets {
  toolsProvider: ToolsTreeProvider;
  schemaSearchProvider: SchemaSearchViewProvider;
  /** Used to enable Schema Search against persisted metadata when the tree is offline-only. */
  treeProvider?: DriftTreeProvider;
  /** Detects workspace-persisted schema for empty-state copy in Schema Search. */
  schemaCache?: SchemaCache;
}

/** Optional logging and behaviour for [refreshDriftConnectionUi]. */
export interface IRefreshConnectionUiOptions {
  /** Raw output sink (caller may apply verbosity filtering). */
  appendLine?: (msg: string) => void;
}

let _lastPresentationSignature: string | undefined;

/** Clears log deduplication state; use between unit tests that count `appendLine` calls. */
export function resetConnectionUiPresentationCacheForTests(): void {
  _lastPresentationSignature = undefined;
}

function presentationSignature(pres: DriftConnectionPresentation): string {
  return `${pres.connected}|${pres.schemaOperationsEnabled}|${pres.viaHttp}|${pres.viaVm}|${pres.port ?? ''}|${pres.label}`;
}

/**
 * Updates VS Code context, Drift Tools tree, and Schema Search webview together.
 * Each step is isolated so one failure cannot block the others.
 */
export function refreshDriftConnectionUi(
  serverManager: ServerManager,
  client: DriftApiClient,
  targets: IConnectionUiTargets,
  options?: IRefreshConnectionUiOptions,
): void {
  const append = options?.appendLine;
  const base = buildConnectionPresentation(serverManager, client);
  const offlineTree = targets.treeProvider?.offlineSchema === true;
  const persistedSchemaAvailable =
    targets.schemaCache?.hasWorkspacePersistedSchema() === true;
  const pres: DriftConnectionPresentation = {
    ...base,
    persistedSchemaAvailable,
    schemaOperationsEnabled: base.connected || offlineTree,
    hint:
      offlineTree && !base.connected
        ? `${base.hint} Schema Search can use last-known schema from this workspace.`
        : base.hint,
  };
  const sig = presentationSignature(pres);
  const now = new Date().toISOString();

  const logEveryRefresh =
    vscode.workspace
      .getConfiguration('driftViewer')
      .get<boolean>('connection.logEveryUiRefresh', false) === true;

  if (append) {
    if (sig !== _lastPresentationSignature || logEveryRefresh) {
      append(
        `[${now}] Connection UI: connected=${pres.connected} http=${pres.viaHttp} vm=${pres.viaVm} — ${pres.label}`,
      );
      if (sig !== _lastPresentationSignature && !pres.connected) {
        append(`[${now}] Connection UI: hint — ${pres.hint}`);
      }
      _lastPresentationSignature = sig;
    }
  }

  try {
    void vscode.commands.executeCommand(
      'setContext',
      'driftViewer.serverConnected',
      pres.connected,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    append?.(`[${now}] Connection UI: setContext failed — ${msg}`);
  }

  try {
    targets.toolsProvider.setConnected(pres.connected);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    append?.(`[${now}] Connection UI: Drift Tools tree update failed — ${msg}`);
  }

  try {
    targets.schemaSearchProvider.setConnectionPresentation(pres);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    append?.(`[${now}] Connection UI: Schema Search update failed — ${msg}`);
  }
}
