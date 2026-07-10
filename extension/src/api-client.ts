/**
 * Drift API client: routes requests to VM Service when debugging,
 * otherwise uses HTTP. Re-exports API types for convenience.
 *
 * Connection state and the always-HTTP endpoints (schema export, database file,
 * reports, sessions, DVR recorder) live on [DriftApiClientBase] in
 * api-client-base.ts. This subclass adds the VM-Service transport and the
 * methods that route between VM and HTTP based on `_vmClient.connected`.
 */

export type * from './api-types';
import type {
  Anomaly,
  ForeignKey,
  HealthResponse,
  IndexSuggestion,
  IMutationStreamResponse,
  PerformanceData,
  TableMetadata,
} from './api-types';
import type { VmServiceClient } from './transport/vm-service-client';
import * as http from './api-client-http';
import { DriftApiClientBase } from './api-client-base';

/** Returned by [DriftApiClient.onVmTransportChanged] so callers can unsubscribe. */
export interface IVmTransportSubscription {
  dispose(): void;
}

export class DriftApiClient extends DriftApiClientBase {
  /** When set and connected, VM used for health, schema, sql, generation, performance, anomalies, explain, clear (Plan 68). */
  private _vmClient: VmServiceClient | null = null;
  /** Listeners notified whenever [setVmClient] runs (connect, swap, or clear). */
  private readonly _vmTransportListeners = new Set<() => void>();

  /** Use VM Service for core API when debugging (Plan 68). Clears on debug session end. */
  setVmClient(client: VmServiceClient | null): void {
    if (this._vmClient) {
      this._vmClient.close();
    }
    this._vmClient = client;
    this._notifyVmTransportChanged();
  }

  /**
   * Subscribe to VM transport changes (after [setVmClient]).
   * Used to refresh sidebar "connected" state when HTTP discovery and VM path diverge.
   */
  onVmTransportChanged(listener: () => void): IVmTransportSubscription {
    this._vmTransportListeners.add(listener);
    return {
      dispose: () => {
        this._vmTransportListeners.delete(listener);
      },
    };
  }

  private _notifyVmTransportChanged(): void {
    for (const fn of this._vmTransportListeners) {
      try {
        fn();
      } catch {
        /* Ignore listener failures so one bad subscriber cannot break transport setup. */
      }
    }
  }

  /** True when using VM Service transport for core methods. */
  get usingVmService(): boolean {
    return this._vmClient?.connected === true;
  }

  /** UI label when connected: "VM Service" or HTTP URL. */
  get connectionDisplayName(): string {
    return this.usingVmService ? 'VM Service' : this._baseUrl;
  }

  async health(): Promise<HealthResponse> {
    if (this._vmClient?.connected) return this._vmClient.getHealth();
    return http.httpHealth(this._baseUrl, this._headers());
  }

  async schemaMetadata(options?: {
    includeForeignKeys?: boolean;
  }): Promise<TableMetadata[]> {
    if (this._vmClient?.connected) {
      return this._vmClient.getSchemaMetadata(options);
    }
    return http.httpSchemaMetadata(this._baseUrl, this._headers(), options);
  }

  async tableFkMeta(tableName: string): Promise<ForeignKey[]> {
    if (this._vmClient?.connected) return this._vmClient.getTableFkMeta(tableName);
    return http.httpTableFkMeta(this._baseUrl, this._headers(), tableName);
  }

  async generation(since: number): Promise<number> {
    if (this._vmClient?.connected) return this._vmClient.getGeneration();
    return http.httpGeneration(this._baseUrl, this._headers(), since);
  }

  async mutations(since: number): Promise<IMutationStreamResponse> {
    // VM Service transport doesn't currently expose mutation events.
    if (this._vmClient?.connected) {
      throw new Error('Mutation stream requires HTTP (writeQuery wrapper on server).');
    }
    return http.httpMutations(this._baseUrl, this._headers(), since);
  }

  /**
   * Runs read-only SQL.
   *
   * Pass `{ internal: true }` for extension-owned diagnostic probes
   * (null-count scans, health-metrics aggregates, change-detection
   * queries). The server tags the timing record with `isInternal`
   * so it is excluded from slow-query diagnostics and perf-regression
   * detection — preventing a feedback loop where the extension's own
   * overhead is reported as an application performance problem. See
   * BUG_perf_regression_false_positives_from_data_quality_probes.md.
   *
   * Optional `args` / `namedArgs` are forwarded on both HTTP and VM Service
   * paths for DVR-declared bindings (the host may still execute SQL-only if
   * it does not supply `queryWithBindings` on the Dart server).
   */
  async sql(
    query: string,
    opts?: {
      internal?: boolean;
      args?: unknown[];
      namedArgs?: Record<string, unknown>;
    },
  ): Promise<{ columns: string[]; rows: unknown[][] }> {
    const internal = opts?.internal === true;
    if (this._vmClient?.connected) {
      return this._vmClient.runSql(query, {
        internal,
        args: opts?.args,
        namedArgs: opts?.namedArgs,
      });
    }
    return http.httpSql(this._baseUrl, this._headers(), query, {
      internal,
      args: opts?.args,
      namedArgs: opts?.namedArgs,
    });
  }

  /**
   * Runs pending-edit statements in one transaction: HTTP `POST /api/edits/apply`,
   * or `ext.saropa.drift.applyEditsBatch` when using VM Service. Requires `writeQuery`.
   */
  async applyEditsBatch(statements: string[]): Promise<void> {
    if (this._vmClient?.connected) {
      await this._vmClient.applyEditsBatch(statements);
      return;
    }
    return http.httpApplyEditsBatch(this._baseUrl, this._headers(), statements);
  }

  async indexSuggestions(): Promise<IndexSuggestion[]> {
    if (this._vmClient?.connected) return this._vmClient.getIndexSuggestions();
    return http.httpIndexSuggestions(this._baseUrl, this._headers());
  }

  async anomalies(): Promise<Anomaly[]> {
    if (this._vmClient?.connected) {
      const { anomalies } = await this._vmClient.getAnomalies();
      return anomalies;
    }
    return http.httpAnomalies(this._baseUrl, this._headers());
  }

  /**
   * Merged issues as the raw Saropa Diagnostic Envelope (plan 67 §2), used by
   * the offline diagnostics mirror. HTTP-only: the merged+enveloped endpoint
   * is not exposed over the VM bridge, and discovery always has an HTTP base
   * URL while the server is reachable.
   */
  async issues(): Promise<unknown> {
    return http.httpIssuesEnvelope(this._baseUrl, this._headers());
  }

  async performance(): Promise<PerformanceData> {
    if (this._vmClient?.connected) return this._vmClient.getPerformance();
    return http.httpPerformance(this._baseUrl, this._headers());
  }

  async explainSql(
    query: string,
  ): Promise<{ rows: Record<string, unknown>[]; sql: string }> {
    if (this._vmClient?.connected) return this._vmClient.explainSql(query);
    return http.httpExplainSql(this._baseUrl, this._headers(), query);
  }

  async getChangeDetection(): Promise<boolean> {
    if (this._vmClient?.connected) return this._vmClient.getChangeDetection();
    return http.httpGetChangeDetection(this._baseUrl, this._headers());
  }

  async setChangeDetection(enabled: boolean): Promise<boolean> {
    if (this._vmClient?.connected) return this._vmClient.setChangeDetection(enabled);
    return http.httpSetChangeDetection(this._baseUrl, this._headers(), enabled);
  }

  /**
   * Global monitoring & logging kill-switch state on the server. HTTP-only:
   * the /api/monitoring endpoint is deliberately exempt from the server's
   * 403 gate so it works while the server is killed (the resume path).
   */
  async getMonitoring(): Promise<boolean> {
    return http.httpGetMonitoring(this._baseUrl, this._headers());
  }

  /** Flip the server's global monitoring & logging kill switch. */
  async setMonitoring(enabled: boolean): Promise<boolean> {
    return http.httpSetMonitoring(this._baseUrl, this._headers(), enabled);
  }

  async clearPerformance(): Promise<void> {
    if (this._vmClient?.connected) {
      await this._vmClient.clearPerformance();
      return;
    }
    return http.httpClearPerformance(this._baseUrl, this._headers());
  }
}
