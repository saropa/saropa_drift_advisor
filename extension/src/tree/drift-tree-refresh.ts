/**
 * Tree refresh logic: schema fetch, offline fallback, and coalesced re-run.
 */
import * as vscode from 'vscode';
import { DriftApiClient, TableMetadata } from '../api-client';
import { TableItem } from './tree-items';
import type { PinStore } from './pin-store';

/** Minimal log sink — matches vscode.OutputChannel.appendLine signature. */
interface LogSink {
  appendLine(msg: string): void;
}

/**
 * Maximum wall-clock time (ms) a single refresh cycle may take before being
 * force-aborted. This is a last-resort safety net: if both the
 * `fetchWithTimeout` AbortController AND the per-call timeout somehow hang
 * (observed on some Windows/undici builds), this ensures the caller can retry.
 *
 * Set generously — well above the worst-case for
 * `health()` (8s + retry 8s) + `schemaMetadata()` (30s cache safety)
 * so it never interferes with legitimate slow responses.
 */
const REFRESH_SAFETY_TIMEOUT_MS = 55_000;

export interface RefreshState {
  tables: TableMetadata[];
  tableItems: TableItem[];
  connected: boolean;
  offlineSchema: boolean;
}

/**
 * Refreshes the tree schema from the server with offline fallback.
 * Returns the updated state; caller is responsible for applying mutations.
 * [pinStore] is read at call time (not captured) because the provider's pin
 * store is assigned via setPinStore() AFTER construction.
 */
export async function refreshTreeSchema(
  client: DriftApiClient,
  pinStore: PinStore | undefined,
  log: LogSink | undefined,
): Promise<RefreshState> {
  const state: RefreshState = {
    tables: [],
    tableItems: [],
    connected: false,
    offlineSchema: false,
  };

  try {
    await client.health();
    state.tables = await client.schemaMetadata();
    state.tableItems = state.tables.map(
      (t) => new TableItem(t, pinStore?.isPinned(t.name)),
    );
    state.connected = true;
    log?.appendLine(
      `[${new Date().toISOString()}] Tree refresh: loaded ${state.tables.length} table(s) from live server.`,
    );
  } catch (err: unknown) {
    // Log the ACTUAL error so "Could not load schema" is never a mystery.
    const msg = err instanceof Error ? err.message : String(err);
    log?.appendLine(
      `[${new Date().toISOString()}] Tree refresh FAILED (health or schema): ${msg}`,
    );
    state.connected = false;
    state.tables = [];
    state.tableItems = [];

    const allowOffline =
      vscode.workspace.getConfiguration('driftViewer').get<boolean>(
        'database.allowOfflineSchema',
        true,
      ) !== false;

    if (allowOffline) {
      try {
        // Cached client may return workspace-persisted last-known schema without a live server.
        state.tables = await client.schemaMetadata();
        if (state.tables.length > 0) {
          state.offlineSchema = true;
          state.tableItems = state.tables.map(
            (t) => new TableItem(t, pinStore?.isPinned(t.name)),
          );
          log?.appendLine(
            `[${new Date().toISOString()}] Tree refresh: fell back to offline schema (${state.tables.length} table(s)).`,
          );
        }
      } catch (offlineErr: unknown) {
        const offlineMsg = offlineErr instanceof Error ? offlineErr.message : String(offlineErr);
        log?.appendLine(
          `[${new Date().toISOString()}] Tree refresh: offline schema fallback also failed: ${offlineMsg}`,
        );
        state.tables = [];
        state.tableItems = [];
      }
    }
  }

  return state;
}

/**
 * Creates a refresh orchestrator that wraps schema fetches in a safety timeout
 * and coalesces concurrent refresh requests.
 */
export function createTreeRefreshOrchestrator(
  client: DriftApiClient,
  getPinStore: () => PinStore | undefined,
  log: LogSink | undefined,
) {
  let refreshing = false;
  let pendingRefresh = false;

  /**
   * @param onFetch   Applies the fetched schema state on success.
   * @param onComplete Runs after every cycle (sync context, fire tree event, hook).
   * @param reinvoke  Re-enters the OWNING provider's `refresh()` for the coalesced
   *   pending run — NOT this function directly. Going back through the provider
   *   re-evaluates the monitoring kill switch, so a kill that lands between the
   *   in-flight refresh and its queued re-run still takes the zero-traffic path.
   */
  const runRefresh = async (
    onFetch: (state: RefreshState) => void,
    onComplete: () => void,
    reinvoke: () => Promise<void>,
  ): Promise<void> => {
    if (refreshing) {
      pendingRefresh = true;
      return;
    }
    refreshing = true;
    pendingRefresh = false;

    // Last-resort safety: reject if the inner work hangs beyond all per-call
    // timeouts (AbortController + schema cache safety). Uses setTimeout +
    // Promise.race — does not depend on AbortController, so it always fires.
    let safetyTimer: ReturnType<typeof setTimeout> | undefined;
    const safety = new Promise<never>((_, reject) => {
      safetyTimer = setTimeout(
        () => reject(new Error('Tree refresh safety timeout')),
        REFRESH_SAFETY_TIMEOUT_MS,
      );
    });

    try {
      const state = await Promise.race([
        refreshTreeSchema(client, getPinStore(), log),
        safety,
      ]);
      onFetch(state);
    } catch (err: unknown) {
      // Safety timeout or unhandled refresh error: LOG ONLY. State is left
      // intact deliberately — a transient hang must keep the last-known /
      // offline schema visible rather than blanking the tree to disconnected.
      const msg = err instanceof Error ? err.message : String(err);
      log?.appendLine(`[${new Date().toISOString()}] Tree refresh aborted: ${msg}`);
    } finally {
      if (safetyTimer !== undefined) clearTimeout(safetyTimer);
      refreshing = false;
    }
    onComplete();

    // Run the coalesced pending refresh (e.g. discovery found the server while
    // the initial loadOnConnect refresh was still in flight and failed). Re-enter
    // via the provider so the kill switch is re-checked (see reinvoke doc above).
    if (pendingRefresh) {
      pendingRefresh = false;
      void reinvoke();
    }
  };

  return {
    refresh: runRefresh,
    isRefreshing: () => refreshing,
  };
}

export type TreeRefreshOrchestrator = ReturnType<typeof createTreeRefreshOrchestrator>;
