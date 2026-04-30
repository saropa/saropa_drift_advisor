/**
 * Bridge to Saropa Log Capture extension.
 * Registers an integration provider so session-end contributions (meta + sidecar)
 * are sent when Log Capture is installed and "Drift Advisor" is enabled.
 * No dependency on saropa-log-capture package; uses minimal compatible types.
 */

import * as vscode from 'vscode';
import { DriftApiClient, QueryEntry } from '../api-client';
import type {
  PerformanceData,
} from '../api-types';
import type {
  DriftAdvisorMetaPayload,
  DriftAdvisorSidecar,
  LogCaptureBridgeInitOptions,
  LogCaptureContribution,
  LogCaptureEndContext,
  LogCaptureIntegrationContext,
} from './log-capture-types';
import {
  getIncludeInLogCaptureSession,
  getLogMode,
  LOG_CAPTURE_SESSION_TIMEOUT_MS,
  withTimeout,
} from './log-capture-utils';
import {
  buildIssuesSummary,
  buildMetaAnomalies,
  buildMetaPerformance,
  buildMetaSchema,
  serializeIssues,
  writeSessionFile,
} from './log-capture-session-serialization';
import type { LogCaptureApi } from './log-capture-api-types';
export type {
  DriftAdvisorMetaPayload,
  DriftAdvisorSidecar,
  DriftAdvisorSidecarIssue,
  LogCaptureBridgeInitOptions,
  LogCaptureContribution,
  LogCaptureEndContext,
  LogCaptureIntegrationContext,
  LogCaptureIssueLike,
} from './log-capture-types';
export {
  LOG_CAPTURE_SESSION_TIMEOUT_MS,
  severityToString,
  toWorkspaceRelativePath,
} from './log-capture-utils';

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
    let anomalies: Awaited<ReturnType<DriftApiClient['anomalies']>> | null = null;
    let schema: Awaited<ReturnType<DriftApiClient['schemaMetadata']>> | null = null;
    let health: Awaited<ReturnType<DriftApiClient['health']>> | null = null;
    let indexSuggestions: Awaited<ReturnType<DriftApiClient['indexSuggestions']>> | null = null;

    if (mode === 'header') {
      // Header-only: single fetch to avoid unnecessary API load.
      perf = await withTimeout(
        // Keep runtime behavior unchanged while using shared timeout utility.
        client.performance(),
        LOG_CAPTURE_SESSION_TIMEOUT_MS,
        'performance',
        log,
      ).catch(() => null);
    } else {
      // Full: one parallel batch (avoids calling performance() twice).
      [perf, anomalies, schema, health, indexSuggestions] = await Promise.all([
        withTimeout(
          client.performance(),
          LOG_CAPTURE_SESSION_TIMEOUT_MS,
          'performance',
          log,
        ).catch(() => null),
        withTimeout(
          client.anomalies(),
          LOG_CAPTURE_SESSION_TIMEOUT_MS,
          'anomalies',
          log,
        ).catch(() => null),
        withTimeout(
          client.schemaMetadata(),
          LOG_CAPTURE_SESSION_TIMEOUT_MS,
          'schemaMetadata',
          log,
        ).catch(() => null),
        withTimeout(
          client.health(),
          LOG_CAPTURE_SESSION_TIMEOUT_MS,
          'health',
          log,
        ).catch(() => null),
        withTimeout(
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
    const issuesSummary = buildIssuesSummary(issues);
    const sidecarIssues = serializeIssues(issues);

    const baseUrl = client.baseUrl;

    const metaPayload: DriftAdvisorMetaPayload = {
      baseUrl,
      performance: buildMetaPerformance(perf),
      anomalies: buildMetaAnomalies(anomalies ?? []),
      schema: buildMetaSchema(schema ?? []),
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
    writeSessionFile(sidecar).catch(() => { /* ignore write errors */ });

    return contributions;
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

  /**
   * Writes a compact JSON line for NL-to-SQL generations when log capture is
   * enabled (same gating as {@link writeConnectionEvent}) so sessions can
   * correlate prompts with generated SQL without logging full schema text.
   */
  writeNlQueryEvent(question: string, generatedSql: string): void {
    if (!this._api) return;
    if (getLogMode() === 'off') return;

    const payload = JSON.stringify({
      type: 'nl-query',
      question,
      generatedSql,
      timestamp: Date.now(),
    });
    this._api.writeLine(`DRIFT NL-QUERY ${payload}`, { category: 'drift-perf' });
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
