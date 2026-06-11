/**
 * Bridge to Saropa Log Capture extension.
 * Registers an integration provider so session-end contributions (meta + sidecar)
 * are sent when Log Capture is installed and "Drift Advisor" is enabled.
 * No dependency on saropa-log-capture package; uses minimal compatible types.
 */

import * as vscode from 'vscode';
import { DriftApiClient, QueryEntry } from '../api-client';
import type {
  LogCaptureBridgeInitOptions,
  LogCaptureContribution,
  LogCaptureEndContext,
  LogCaptureIntegrationContext,
} from './log-capture-types';
import { getLogMode } from './log-capture-utils';
import { buildSessionEndContributions } from './log-capture-session-builder';
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
    const client = this._client;
    if (!client) return undefined;
    return buildSessionEndContributions(client, this._options, endContext);
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
