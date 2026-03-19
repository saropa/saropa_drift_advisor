/**
 * Bridge to Saropa Log Capture extension.
 * Registers an integration provider so session-end contributions (meta + sidecar)
 * are sent when Log Capture is installed and "Drift Advisor" is enabled.
 * No dependency on saropa-log-capture package; uses minimal compatible types.
 */

import * as vscode from 'vscode';
import { DriftApiClient, QueryEntry } from '../api-client';
import type {
  Anomaly,
  HealthResponse,
  IndexSuggestion,
  PerformanceData,
  TableMetadata,
} from '../api-types';

/** Minimal shape we need from Log Capture's IntegrationEndContext. */
export interface LogCaptureEndContext {
  baseFileName: string;
  logUri: { fsPath: string };
  logDirUri?: { fsPath: string };
  sessionStartTime: number;
  sessionEndTime: number;
  config?: { integrationsAdapters?: readonly string[] };
  outputChannel?: { appendLine(msg: string): void };
}

/** Context passed to isEnabled (integration adapter list). */
export interface LogCaptureIntegrationContext {
  config?: { integrationsAdapters?: readonly string[] };
}

/** Contribution kinds returned by the provider to Log Capture. */
export type LogCaptureContribution =
  | { kind: 'header'; lines: string[] }
  | { kind: 'meta'; key: string; payload: unknown }
  | {
      kind: 'sidecar';
      filename: string;
      content: string | Buffer;
      contentType?: 'utf8' | 'json';
    };

/** Meta payload stored under SessionMeta.integrations['saropa-drift-advisor']. */
export interface DriftAdvisorMetaPayload {
  baseUrl: string;
  performance: {
    totalQueries: number;
    totalDurationMs: number;
    avgDurationMs: number;
    slowCount: number;
    topSlow: Array<{
      sql: string;
      durationMs: number;
      rowCount?: number;
      at?: string;
    }>;
  };
  anomalies: {
    count: number;
    bySeverity: { error: number; warning: number; info: number };
  };
  schema: { tableCount: number; tableNames?: string[] };
  health: { ok: boolean; extensionConnected?: boolean };
  indexSuggestionsCount?: number;
  issuesSummary?: {
    count: number;
    byCode: Record<string, number>;
    bySeverity: Record<string, number>;
  };
}

/** Serialized issue for sidecar (workspace-relative path). */
export interface DriftAdvisorSidecarIssue {
  code: string;
  message: string;
  file: string;
  range?: { start: number; end: number };
  severity: string;
}

/** Full sidecar object written as {baseFileName}.drift-advisor.json */
export interface DriftAdvisorSidecar {
  generatedAt: string;
  baseUrl: string;
  performance: PerformanceData;
  anomalies: Anomaly[];
  schema: TableMetadata[];
  health: HealthResponse;
  indexSuggestions?: IndexSuggestion[];
  sizeAnalytics?: unknown;
  compareReport?: unknown;
  issues?: DriftAdvisorSidecarIssue[];
}

/** Issue shape expected from the optional getter (matches IDiagnosticIssue subset). */
export interface LogCaptureIssueLike {
  code: string;
  message: string;
  fileUri: vscode.Uri;
  range: vscode.Range;
  severity?: number;
}

/** Optional init options: issues getter for Phase 2. */
export interface LogCaptureBridgeInitOptions {
  getLastCollectedIssues?(): LogCaptureIssueLike[];
}

/** Minimal subset of the Saropa Log Capture API used by this bridge. */
interface LogCaptureApi {
  writeLine(text: string, options?: { category?: string }): void;
  insertMarker(text?: string): void;
  getSessionInfo(): { isActive: boolean } | undefined;
  registerIntegrationProvider(provider: {
    readonly id: string;
    isEnabled(context: LogCaptureIntegrationContext): boolean;
    onSessionStartSync?(): Array<{ kind: 'header'; lines: string[] }> | undefined;
    onSessionEnd?: (context: LogCaptureEndContext) => Promise<LogCaptureContribution[] | undefined>;
  }): vscode.Disposable;
}

type LogMode = 'off' | 'slow-only' | 'all';
type IncludeInLogCaptureMode = 'none' | 'header' | 'full';

/** Timeout for each API call during session end / snapshot (ms). Exported for log-capture-api. */
export const LOG_CAPTURE_SESSION_TIMEOUT_MS = 5000;

function getLogMode(): LogMode {
  return (
    vscode.workspace
      .getConfiguration('driftViewer')
      .get<LogMode>('performance.logToCapture', 'slow-only') ?? 'slow-only'
  );
}

function getIncludeInLogCaptureSession(): IncludeInLogCaptureMode {
  return (
    vscode.workspace
      .getConfiguration('driftViewer')
      .get<IncludeInLogCaptureMode>(
        'integrations.includeInLogCaptureSession',
        'full',
      ) ?? 'full'
  );
}

/**
 * Map VS Code DiagnosticSeverity (0–3) to string for meta/sidecar.
 * Exported for use by log-capture-api to avoid duplication.
 */
export function severityToString(severity?: number): string {
  if (severity === undefined) return 'unknown';
  switch (severity) {
    case 0:
      return 'error';
    case 1:
      return 'warning';
    case 2:
      return 'info';
    case 3:
      return 'hint';
    default:
      return 'unknown';
  }
}

/**
 * Workspace-relative path from absolute fsPath; falls back to fsPath if no workspace.
 * Exported for use by log-capture-api to avoid duplication.
 */
export function toWorkspaceRelativePath(fsPath: string): string {
  try {
    return vscode.workspace.asRelativePath(vscode.Uri.file(fsPath));
  } catch {
    return fsPath;
  }
}

export class LogCaptureBridge {
  private _api: LogCaptureApi | undefined;
  private readonly _disposables: vscode.Disposable[] = [];
  private _client: DriftApiClient | null = null;
  private _options: LogCaptureBridgeInitOptions | undefined;

  /**
   * Attempt to connect to the Saropa Log Capture extension.
   * No-op if the extension is not installed.
   * When options.getLastCollectedIssues is provided, meta/sidecar include issues (Phase 2).
   */
  async init(
    context: vscode.ExtensionContext,
    client: DriftApiClient,
    options?: LogCaptureBridgeInitOptions,
  ): Promise<void> {
    this._client = client;
    this._options = options;

    const ext = vscode.extensions.getExtension('saropa.saropa-log-capture');
    if (!ext) return;

    this._api = ext.isActive
      ? (ext.exports as LogCaptureApi)
      : ((await ext.activate()) as LogCaptureApi);

    const cfg = vscode.workspace.getConfiguration('driftViewer');
    const slowMs = cfg.get<number>('performance.slowThresholdMs', 500) ?? 500;

    const reg = this._api.registerIntegrationProvider({
      id: 'saropa-drift-advisor',
      isEnabled: (ctx: LogCaptureIntegrationContext) =>
        (ctx?.config?.integrationsAdapters ?? []).includes('driftAdvisor'),
      onSessionStartSync: () => [
        {
          kind: 'header',
          lines: [
            `Saropa Drift Advisor: ${client.baseUrl}`,
            `Slow query threshold: ${slowMs}ms`,
          ],
        },
      ],
      onSessionEnd: (endContext: LogCaptureEndContext) =>
        this._onSessionEnd(endContext),
    });
    this._disposables.push(reg);
  }

  private async _onSessionEnd(
    endContext: LogCaptureEndContext,
  ): Promise<LogCaptureContribution[] | undefined> {
    const mode = getIncludeInLogCaptureSession();
    if (mode === 'none') return [];

    const client = this._client;
    if (!client) return undefined;

    const log = (msg: string): void => {
      endContext.outputChannel?.appendLine(`[Drift Advisor] ${msg}`);
    };

    let perf: PerformanceData | null = null;
    let anomalies: Anomaly[] | null = null;
    let schema: TableMetadata[] | null = null;
    let health: HealthResponse | null = null;
    let indexSuggestions: IndexSuggestion[] | null = null;

    if (mode === 'header') {
      // Header-only: single fetch to avoid unnecessary API load.
      perf = await this._withTimeout(
        client.performance(),
        LOG_CAPTURE_SESSION_TIMEOUT_MS,
        'performance',
        log,
      ).catch(() => null);
    } else {
      // Full: one parallel batch (avoids calling performance() twice).
      [perf, anomalies, schema, health, indexSuggestions] = await Promise.all([
        this._withTimeout(
          client.performance(),
          LOG_CAPTURE_SESSION_TIMEOUT_MS,
          'performance',
          log,
        ).catch(() => null),
        this._withTimeout(
          client.anomalies(),
          LOG_CAPTURE_SESSION_TIMEOUT_MS,
          'anomalies',
          log,
        ).catch(() => null),
        this._withTimeout(
          client.schemaMetadata(),
          LOG_CAPTURE_SESSION_TIMEOUT_MS,
          'schemaMetadata',
          log,
        ).catch(() => null),
        this._withTimeout(
          client.health(),
          LOG_CAPTURE_SESSION_TIMEOUT_MS,
          'health',
          log,
        ).catch(() => null),
        this._withTimeout(
          client.indexSuggestions(),
          LOG_CAPTURE_SESSION_TIMEOUT_MS,
          'indexSuggestions',
          log,
        ).catch(() => null),
      ]);
    }

    // Header: include when mode is header or full.
    const headerContributions: LogCaptureContribution[] = [];
    if (perf) {
      headerContributions.push({
        kind: 'header',
        lines: [
          `Drift Queries: ${perf.totalQueries} total, ${perf.avgDurationMs}ms avg`,
          `Slow queries: ${perf.slowQueries.length}`,
          ...perf.slowQueries
            .slice(0, 5)
            .map((q) => `  ${q.durationMs}ms: ${q.sql.slice(0, 80)}`),
        ],
      });
    }

    if (mode === 'header') {
      return headerContributions.length > 0 ? headerContributions : undefined;
    }

    const issues = this._options?.getLastCollectedIssues?.() ?? [];
    const issuesSummary = this._buildIssuesSummary(issues);
    const sidecarIssues = this._serializeIssues(issues);

    const baseUrl = client.baseUrl;

    const metaPayload: DriftAdvisorMetaPayload = {
      baseUrl,
      performance: this._metaPerformance(perf),
      anomalies: this._metaAnomalies(anomalies ?? []),
      schema: this._metaSchema(schema ?? []),
      health: health ?? { ok: false },
      indexSuggestionsCount: indexSuggestions?.length,
    };
    if (issuesSummary.count > 0) {
      metaPayload.issuesSummary = issuesSummary;
    }

    const sidecar: DriftAdvisorSidecar = {
      generatedAt: new Date().toISOString(),
      baseUrl,
      performance: perf ?? {
        totalQueries: 0,
        totalDurationMs: 0,
        avgDurationMs: 0,
        slowQueries: [],
        recentQueries: [],
      },
      anomalies: anomalies ?? [],
      schema: schema ?? [],
      health: health ?? { ok: false },
      indexSuggestions: indexSuggestions ?? undefined,
      issues: sidecarIssues.length > 0 ? sidecarIssues : undefined,
    };

    const contributions: LogCaptureContribution[] = [
      ...headerContributions,
      { kind: 'meta', key: 'saropa-drift-advisor', payload: metaPayload },
      {
        kind: 'sidecar',
        filename: `${endContext.baseFileName}.drift-advisor.json`,
        content: JSON.stringify(sidecar, null, 2),
        contentType: 'json',
      },
    ];

    // Optional Phase 4: write well-known file for tools/Log Capture to read without activating
    this._writeSessionFile(sidecar).catch(() => { /* ignore write errors */ });

    return contributions;
  }

  /** Writes .saropa/drift-advisor-session.json in the first workspace folder (file contract). */
  private async _writeSessionFile(sidecar: DriftAdvisorSidecar): Promise<void> {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) return;
    const dirUri = vscode.Uri.joinPath(folder.uri, '.saropa');
    const fileUri = vscode.Uri.joinPath(dirUri, 'drift-advisor-session.json');
    await vscode.workspace.fs.createDirectory(dirUri);
    const bytes = new TextEncoder().encode(JSON.stringify(sidecar, null, 2));
    await vscode.workspace.fs.writeFile(fileUri, bytes);
  }

  private _withTimeout<T>(
    promise: Promise<T>,
    ms: number,
    label: string,
    log: (msg: string) => void,
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`${label} timed out after ${ms}ms`)),
          ms,
        ),
      ),
    ]).catch((err) => {
      log(`${label}: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    });
  }

  private _metaPerformance(perf: PerformanceData | null): DriftAdvisorMetaPayload['performance'] {
    if (!perf)
      return {
        totalQueries: 0,
        totalDurationMs: 0,
        avgDurationMs: 0,
        slowCount: 0,
        topSlow: [],
      };
    const topSlow = perf.slowQueries.slice(0, 10).map((q) => ({
      sql: q.sql,
      durationMs: q.durationMs,
      rowCount: q.rowCount,
      at: q.at,
    }));
    return {
      totalQueries: perf.totalQueries,
      totalDurationMs: perf.totalDurationMs,
      avgDurationMs: perf.avgDurationMs,
      slowCount: perf.slowQueries.length,
      topSlow,
    };
  }

  private _metaAnomalies(
    anomalies: Anomaly[],
  ): DriftAdvisorMetaPayload['anomalies'] {
    const bySeverity = { error: 0, warning: 0, info: 0 };
    for (const a of anomalies) {
      if (a.severity in bySeverity) {
        bySeverity[a.severity]++;
      }
    }
    return { count: anomalies.length, bySeverity };
  }

  private _metaSchema(
    schema: TableMetadata[],
  ): DriftAdvisorMetaPayload['schema'] {
    return {
      tableCount: schema.length,
      tableNames: schema.length <= 50 ? schema.map((t) => t.name) : undefined,
    };
  }

  private _buildIssuesSummary(issues: LogCaptureIssueLike[]): {
    count: number;
    byCode: Record<string, number>;
    bySeverity: Record<string, number>;
  } {
    const byCode: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    for (const i of issues) {
      byCode[i.code] = (byCode[i.code] ?? 0) + 1;
      const s = severityToString(i.severity);
      bySeverity[s] = (bySeverity[s] ?? 0) + 1;
    }
    return { count: issues.length, byCode, bySeverity };
  }

  private _serializeIssues(
    issues: LogCaptureIssueLike[],
  ): DriftAdvisorSidecarIssue[] {
    return issues.map((i) => ({
      code: i.code,
      message: i.message,
      file: toWorkspaceRelativePath(i.fileUri.fsPath),
      range: {
        start: i.range.start.line,
        end: i.range.end.line,
      },
      severity: severityToString(i.severity),
    }));
  }

  /** Write a slow-query alert line into the capture session. */
  writeSlowQuery(query: QueryEntry): void {
    if (!this._api) return;
    const mode = getLogMode();
    if (mode === 'off') return;

    this._api.writeLine(
      `\u26a0 DRIFT SLOW (${query.durationMs}ms): ${query.sql.slice(0, 200)}`,
      { category: 'drift-perf' },
    );
  }

  /** Write a query line (for 'all' mode). */
  writeQuery(query: QueryEntry): void {
    if (!this._api) return;
    if (getLogMode() !== 'all') return;

    this._api.writeLine(
      `DRIFT QUERY (${query.durationMs}ms): ${query.sql.slice(0, 200)}`,
      { category: 'drift-query' },
    );
  }

  /** Write a terminal link match/action event. */
  writeTerminalLinkEvent(msg: string): void {
    if (!this._api) return;
    this._api.writeLine(`DRIFT LINK: ${msg}`, { category: 'drift-link' });
  }

  /** Write a data editing event. */
  writeDataEdit(msg: string): void {
    if (!this._api) return;
    this._api.writeLine(`DRIFT EDIT: ${msg}`, { category: 'drift-edit' });
  }

  /** Write a connection lifecycle event. */
  writeConnectionEvent(msg: string): void {
    if (!this._api) return;
    if (getLogMode() === 'off') return;

    this._api.writeLine(`DRIFT: ${msg}`, { category: 'drift-perf' });
  }

  dispose(): void {
    for (const d of this._disposables) {
      d.dispose();
    }
    this._disposables.length = 0;
    this._api = undefined;
    this._client = null;
    this._options = undefined;
  }
}
