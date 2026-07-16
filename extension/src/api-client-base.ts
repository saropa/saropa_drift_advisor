/**
 * Base of the Drift API client: owns connection state (base URL + auth token)
 * and the endpoints that are always plain HTTP — schema export, database file,
 * compare/migration reports, size analytics, session sharing, and the DVR
 * recorder. The VM-Service-routed methods (health, schema, sql, generation,
 * etc.) live on the [DriftApiClient] subclass in api-client.ts, which adds the
 * VM transport on top of this base. Split for the 300-line file budget; the
 * subclass keeps the same public surface so callers and `new DriftApiClient(...)`
 * are unchanged.
 */

import type {
  ICompareReport,
  IDiagramData,
  IDvrQueriesPage,
  IDvrStatus,
  IRecordedQueryV1,
  IImportResult,
  IMigrationPreview,
  ISessionData,
  ISessionShareResult,
  ISizeAnalytics,
} from './api-types';
import {
  importDataRequest,
  sessionAnnotateRequest,
  sessionGetRequest,
  sessionShareRequest,
} from './api-client-sessions';
import * as http from './api-client-http';
import { isLoopbackHost } from './shared-utils';

export class DriftApiClientBase {
  protected _baseUrl: string;
  protected _authToken: string | undefined;

  constructor(host: string, port: number) {
    this._baseUrl = `http://${host}:${port}`;
  }

  /** Update the server endpoint (called by ServerManager on active server change). */
  reconfigure(host: string, port: number): void {
    this._baseUrl = `http://${host}:${port}`;
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

  protected _headers(extra?: Record<string, string>): Record<string, string> {
    const h: Record<string, string> = { 'X-Drift-Client': 'vscode', ...extra };
    // Only ever send the Bearer token to a loopback host. `host` comes from
    // free-form workspace config (`driftViewer.host`), so a malicious
    // `.vscode/settings.json` could otherwise exfiltrate the token to an
    // attacker-chosen address on workspace open. Sending the token to a remote
    // host is opt-out by omission here, not by trust of the config value.
    // See plans/history/2026.06/2026.06.12/full-codebase-audit-2026.06.12.md H4.
    if (this._authToken && isLoopbackHost(this.host)) {
      h['Authorization'] = `Bearer ${this._authToken}`;
    }
    return h;
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

  /** Returns current DVR recorder status. */
  async dvrStatus(): Promise<IDvrStatus> {
    return http.httpDvrStatus(this._baseUrl, this._headers());
  }

  /** Starts DVR recording. */
  async dvrStart(): Promise<IDvrStatus> {
    return http.httpDvrStart(this._baseUrl, this._headers());
  }

  /** Stops DVR recording. */
  async dvrStop(): Promise<IDvrStatus> {
    return http.httpDvrStop(this._baseUrl, this._headers());
  }

  /** Pauses DVR recording without clearing captured history. */
  async dvrPause(): Promise<IDvrStatus> {
    return http.httpDvrPause(this._baseUrl, this._headers());
  }

  /** Updates DVR recorder options (buffer size, before/after capture). */
  async dvrConfigure(body: {
    maxQueries?: number;
    captureBeforeAfter?: boolean;
  }): Promise<{ maxQueries: number; captureBeforeAfter: boolean; queryCount: number; sessionId: string }> {
    return http.httpDvrConfig(this._baseUrl, this._headers(), body);
  }

  /** Returns a cursor page of recorded DVR queries. */
  async dvrQueries(options?: {
    cursor?: number;
    limit?: number;
    direction?: 'forward' | 'backward';
  }): Promise<IDvrQueriesPage> {
    return http.httpDvrQueries(this._baseUrl, this._headers(), options);
  }

  /** Returns a single recorded DVR query event. */
  async dvrQuery(sessionId: string, id: number): Promise<IRecordedQueryV1> {
    return http.httpDvrQuery(this._baseUrl, this._headers(), sessionId, id);
  }
}
