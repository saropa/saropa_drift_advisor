/**
 * Minimal VM Service protocol client (Plan 68).
 * Connects via WebSocket, sends JSON-RPC requests, resolves main isolate ID,
 * and calls ext.saropa.drift.* extension methods.
 *
 * **Extension stream (Phase 5).** After connecting, subscribes to the VM
 * Service `Extension` stream. Events posted by the Dart server via
 * `developer.postEvent('ext.saropa.drift.*', ...)` arrive as `streamNotify`
 * messages and are surfaced through {@link onExtensionEvent}.
 */

import type {
  Anomaly,
  ForeignKey,
  HealthResponse,
  IndexSuggestion,
  PerformanceData,
  TableMetadata,
} from '../api-types';
import {
  apiClearPerformance,
  apiExplainSql,
  apiApplyEditsBatch,
  apiGetAnomalies,
  apiGetChangeDetection,
  apiGetGeneration,
  apiGetHealth,
  apiGetIndexSuggestions,
  apiGetMonitoring,
  apiGetPerformance,
  apiGetSchemaMetadata,
  apiGetTableFkMeta,
  apiRunSql,
  apiSetChangeDetection,
  apiSetMonitoring,
  type ExtensionRequest,
} from './vm-service-api';

/** An event from the VM Service Extension stream (developer.postEvent). */
export interface VmExtensionEvent {
  /** e.g. 'ext.saropa.drift.ServerStarted' */
  kind: string;
  /** The data map passed to developer.postEvent. */
  data: Record<string, unknown>;
}

export interface VmServiceClientConfig {
  wsUri: string;
  timeoutMs?: number;
  /** Called when the WebSocket closes (e.g. hot restart). Use to clear UI state. */
  onClose?: () => void;
  /** Called when a VM Service Extension stream event arrives. */
  onExtensionEvent?: (event: VmExtensionEvent) => void;
}

export class VmServiceClient {
  private _ws: WebSocket | null = null;
  private _wsUri: string;
  private _timeoutMs: number;
  private _isolateId: string | null = null;
  private _nextId = 1;
  private _pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();

  private readonly _onClose: (() => void) | undefined;
  private readonly _onExtensionEvent: ((event: VmExtensionEvent) => void) | undefined;

  constructor(config: VmServiceClientConfig) {
    this._wsUri = config.wsUri;
    this._timeoutMs = config.timeoutMs ?? 10_000;
    this._onClose = config.onClose;
    this._onExtensionEvent = config.onExtensionEvent;
  }

  /** Connect, resolve main isolate ID, and prepare for RPC. */
  async connect(): Promise<void> {
    const ws = new WebSocket(this._wsUri);
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => {
        ws.close();
        reject(new Error('VM Service WebSocket connect timeout'));
      }, this._timeoutMs);
      ws.onopen = () => {
        clearTimeout(t);
        resolve();
      };
      ws.onerror = () => reject(new Error('VM Service WebSocket error'));
    });
    this._ws = ws;
    ws.onmessage = (ev) => this._onMessage(ev);
    ws.onclose = () => {
      this._ws = null;
      this._isolateId = null;
      for (const [, { reject }] of this._pending) {
        reject(new Error('VM Service WebSocket closed'));
      }
      this._pending.clear();
      this._onClose?.();
    };
    let list = await this._resolveIsolates();
    if (!list?.length) {
      await new Promise((r) => setTimeout(r, 300));
      list = await this._resolveIsolates();
    }
    if (!list?.length) {
      this.close();
      throw new Error('VM Service: no isolates');
    }
    this._isolateId = list[0].id;

    // Subscribe to the Extension event stream so push notifications from the
    // Dart server (developer.postEvent) arrive as streamNotify messages.
    // Best-effort: failure to subscribe falls back to polling discovery.
    try {
      await this._request('streamListen', { streamId: 'Extension' });
    } catch {
      // Some embedders or older Dart VMs may not support streamListen.
    }
  }

  private async _resolveIsolates(): Promise<{ id: string }[] | undefined> {
    const result = (await this._request('getVM', {})) as {
      isolates?: { id: string; isSystemIsolate?: boolean }[];
    };
    const all = result?.isolates;
    if (!all?.length) return all;
    const nonSystem = all.filter((i) => i.isSystemIsolate !== true);
    return nonSystem.length > 0 ? nonSystem : all;
  }

  get connected(): boolean {
    return this._ws !== null && this._ws.readyState === WebSocket.OPEN;
  }

  get isolateId(): string | null {
    return this._isolateId;
  }

  close(): void {
    if (this._ws) {
      this._ws.close();
      this._ws = null;
    }
    this._isolateId = null;
  }

  private _callExtension: ExtensionRequest = (method, params) => {
    if (!this._isolateId) {
      return Promise.reject(new Error('VM Service: not connected'));
    }
    return this._request(method, { isolateId: this._isolateId, ...params });
  };

  private _request(
    method: string,
    params: Record<string, string>,
  ): Promise<unknown> {
    const ws = this._ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('VM Service: WebSocket not open'));
    }
    const id = this._nextId++;
    const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pending.delete(id);
        reject(new Error(`VM Service request timeout: ${method}`));
      }, this._timeoutMs);
      this._pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      ws.send(msg);
    });
  };

  private _onMessage(ev: MessageEvent): void {
    let data: {
      id?: number;
      method?: string;
      params?: { streamId?: string; event?: { extensionKind?: string; extensionData?: Record<string, unknown> } };
      result?: unknown;
      error?: { message?: string };
    };
    try {
      data = JSON.parse(ev.data as string);
    } catch {
      return;
    }

    // VM Service push events arrive as streamNotify with no id.
    if (data.method === 'streamNotify' && data.params?.streamId === 'Extension') {
      const event = data.params.event;
      if (event?.extensionKind && this._onExtensionEvent) {
        this._onExtensionEvent({
          kind: event.extensionKind,
          data: event.extensionData ?? {},
        });
      }
      return;
    }

    const id = data.id;
    if (id === undefined || !this._pending.has(id)) return;
    const entry = this._pending.get(id)!;
    this._pending.delete(id);
    if (data.error) {
      entry.reject(new Error(data.error.message ?? JSON.stringify(data.error)));
    } else {
      const result = data.result;
      const unwrapped =
        typeof result === 'object' && result !== null && 'value' in result
          ? (result as { value: string }).value
          : result;
      entry.resolve(unwrapped);
    }
  }

  async getHealth(): Promise<HealthResponse> {
    return apiGetHealth(this._callExtension);
  }

  async getSchemaMetadata(options?: {
    includeForeignKeys?: boolean;
  }): Promise<TableMetadata[]> {
    return apiGetSchemaMetadata(this._callExtension, options);
  }

  async getTableFkMeta(tableName: string): Promise<ForeignKey[]> {
    return apiGetTableFkMeta(this._callExtension, tableName);
  }

  /**
   * Runs read-only SQL via VM service. Pass `{ internal: true }` for
   * extension-owned diagnostic probes so the server tags the timing
   * record as `isInternal` and excludes it from slow-query and perf
   * regression diagnostics (mirrors the HTTP path).
   */
  async runSql(
    sql: string,
    opts?: {
      internal?: boolean;
      args?: unknown[];
      namedArgs?: Record<string, unknown>;
    },
  ): Promise<{ columns: string[]; rows: unknown[][] }> {
    return apiRunSql(this._callExtension, sql, opts);
  }

  async applyEditsBatch(statements: string[]): Promise<void> {
    await apiApplyEditsBatch(this._callExtension, statements);
  }

  async getGeneration(): Promise<number> {
    return apiGetGeneration(this._callExtension);
  }

  async getPerformance(): Promise<PerformanceData> {
    return apiGetPerformance(this._callExtension);
  }

  async clearPerformance(): Promise<void> {
    return apiClearPerformance(this._callExtension);
  }

  async getAnomalies(): Promise<{ anomalies: Anomaly[] }> {
    return apiGetAnomalies(this._callExtension);
  }

  async explainSql(sql: string): Promise<{ rows: Record<string, unknown>[]; sql: string }> {
    return apiExplainSql(this._callExtension, sql);
  }

  async getIndexSuggestions(): Promise<IndexSuggestion[]> {
    return apiGetIndexSuggestions(this._callExtension);
  }

  async getChangeDetection(): Promise<boolean> {
    return apiGetChangeDetection(this._callExtension);
  }

  async setChangeDetection(enabled: boolean): Promise<boolean> {
    return apiSetChangeDetection(this._callExtension, enabled);
  }

  /** Kill-switch state; reachable while the server is killed. */
  async getMonitoring(): Promise<boolean> {
    return apiGetMonitoring(this._callExtension);
  }

  /** Flip the kill switch; the VM-only kill/resume path. */
  async setMonitoring(enabled: boolean): Promise<boolean> {
    return apiSetMonitoring(this._callExtension, enabled);
  }
}
