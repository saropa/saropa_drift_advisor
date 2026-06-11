/**
 * Builds the Log Capture session-end contributions (header lines, meta payload,
 * JSON sidecar, and the well-known session file) from a live Drift connection.
 * Extracted from log-capture-bridge.ts so the data-gathering and assembly logic
 * is isolated from the extension-integration plumbing on the bridge class.
 */

import type { DriftApiClient } from '../api-client';
import type { PerformanceData } from '../api-types';
import type {
  DriftAdvisorMetaPayload,
  DriftAdvisorSidecar,
  LogCaptureBridgeInitOptions,
  LogCaptureContribution,
  LogCaptureEndContext,
} from './log-capture-types';
import {
  getIncludeInLogCaptureSession,
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

/**
 * Gathers performance/anomaly/schema/health/index data (respecting the
 * configured header-vs-full mode) and assembles the contributions Log Capture
 * persists when a session ends. Returns `undefined` when nothing should be
 * contributed.
 */
export async function buildSessionEndContributions(
  client: DriftApiClient,
  options: LogCaptureBridgeInitOptions | undefined,
  endContext: LogCaptureEndContext,
): Promise<LogCaptureContribution[] | undefined> {
  const mode = getIncludeInLogCaptureSession();
  if (mode === 'none') return [];

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

  const issues = options?.getLastCollectedIssues?.() ?? [];
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
