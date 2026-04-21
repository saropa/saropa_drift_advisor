/**
 * Drift API client: routes requests to VM Service when debugging,
 * otherwise uses HTTP. Re-exports API types for convenience.
 */

export type * from './api-types';
import type {
  Anomaly,
  ForeignKey,
  HealthResponse,
  ICompareReport,
  IDiagramData,
  IImportResult,
  IMigrationPreview,
  IndexSuggestion,
  ISessionData,
  ISessionShareResult,
  ISizeAnalytics,
  IMutationStreamResponse,
  PerformanceData,
  TableMetadata,
} from './api-types';
import type { VmServiceClient } from './transport/vm-service-client';
import {
  importDataRequest,
  sessionAnnotateRequest,
  sessionGetRequest,
  sessionShareRequest,
} from './api-client-sessions';
import * as http from './api-client-http';

/** Returned by [DriftApiClient.onVmTransportChanged] so callers can unsubscribe. */
export interface IVmTransportSubscription {
  dispose(): void;
}

export class DriftApiClient {
  private _baseUrl: string;
  private _authToken: string | undefined;
  /** When set and connected, VM used for health, schema, sql, generation, performance, anomalies, explain, clear (Plan 68). */
  private _vmClient: VmServiceClient | null = null;
  /** Listeners notified whenever [setVmClient] runs (connect, swap, or clear). */
  private readonly _vmTransportListeners = new Set<() => void>();

  constructor(host: string, port: number) {
    this._baseUrl = `http://${host}:${port}`;
  }

  /** Update the server endpoint (called by ServerManager on active server change). */
  reconfigure(host: string, port: number): void {
    this._baseUrl = `http://${host}:${port}`;
  }

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

  /** Set or clear the Bearer auth token sent with every request. */
  setAuthToken(token: string | undefined): void {
    this._authToken = token || undefined;
  }

  get host(): string {
    return new URL(this._baseUrl).hostname;
  }

  get port(): number {
    return Number.parseInt(new URL(this._baseUrl).port, 10);
  }

  get baseUrl(): string {
    return this._baseUrl;
  }

  /** UI label when connected: "VM Service" or HTTP URL. */
  get connectionDisplayName(): string {
    return this.usingVmService ? 'VM Service' : this._baseUrl;
  }

  private _headers(extra?: Record<string, string>): Record<string, string> {
    const h: Record<string, string> = { 'X-Drift-Client': 'vscode', ...extra };
    if (this._authToken) {
      h['Authorization'] = `Bearer ${this._authToken}`;
    }
    return h;
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
   */
  async sql(
    query: string,
    opts?: { internal?: boolean },
  ): Promise<{ columns: string[]; rows: unknown[][] }> {
    const internal = opts?.internal === true;
    if (this._vmClient?.connected) return this._vmClient.runSql(query, { internal });
    return http.httpSql(this._baseUrl, this._headers(), query, { internal });
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

  async clearPerformance(): Promise<void> {
    if (this._vmClient?.connected) {
      await this._vmClient.clearPerformance();
      return;
    }
    return http.httpClearPerformance(this._baseUrl, this._headers());
  }

  async schemaDiagram(): Promise<IDiagramData> {
    return http.httpSchemaDiagram(this._baseUrl, this._headers());
  }

  async schemaDump(): Promise<string> {
    return http.httpSchemaDump(this._baseUrl, this._headers());
  }

  async databaseFile(): Promise<ArrayBuffer> {
    return http.httpDatabaseFile(this._baseUrl, this._headers());
  }

  async compareReport(): Promise<ICompareReport> {
    return http.httpCompareReport(this._baseUrl, this._headers());
  }

  async migrationPreview(): Promise<IMigrationPreview> {
    return http.httpMigrationPreview(this._baseUrl, this._headers());
  }

  async sizeAnalytics(): Promise<ISizeAnalytics> {
    return http.httpSizeAnalytics(this._baseUrl, this._headers());
  }

  async importData(
    format: string,
    table: string,
    data: string,
  ): Promise<IImportResult> {
    return importDataRequest(
      this._baseUrl,
      this._headers({ 'Content-Type': 'application/json' }),
      format,
      table,
      data,
    );
  }

  async sessionShare(state: Record<string, unknown>): Promise<ISessionShareResult> {
    return sessionShareRequest(
      this._baseUrl,
      this._headers({ 'Content-Type': 'application/json' }),
      state,
    );
  }

  async sessionGet(id: string): Promise<ISessionData> {
    return sessionGetRequest(this._baseUrl, this._headers(), id);
  }

  async sessionAnnotate(id: string, text: string, author: string): Promise<void> {
    return sessionAnnotateRequest(
      this._baseUrl,
      this._headers({ 'Content-Type': 'application/json' }),
      id,
      text,
      author,
    );
  }
}
