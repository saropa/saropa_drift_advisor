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

export class DriftApiClient {
  private _baseUrl: string;
  private _authToken: string | undefined;
  /** When set and connected, VM used for health, schema, sql, generation, performance, anomalies, explain, clear (Plan 68). */
  private _vmClient: VmServiceClient | null = null;

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

  async schemaMetadata(): Promise<TableMetadata[]> {
    if (this._vmClient?.connected) return this._vmClient.getSchemaMetadata();
    return http.httpSchemaMetadata(this._baseUrl, this._headers());
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

  async sql(query: string): Promise<{ columns: string[]; rows: unknown[][] }> {
    if (this._vmClient?.connected) return this._vmClient.runSql(query);
    return http.httpSql(this._baseUrl, this._headers(), query);
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
