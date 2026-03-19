/**
 * Public API for other VS Code extensions (e.g. Saropa Log Capture).
 * Exposes getSessionSnapshot() so consumers can pull the same data we contribute
 * at session end without relying on the integration provider having run.
 * Reuses timeout and issue-serialization helpers from the bridge to avoid duplication.
 */

import type { DriftApiClient } from './api-client';
import type {
  DriftAdvisorSidecar,
  DriftAdvisorSidecarIssue,
  LogCaptureIssueLike,
} from './debug/log-capture-bridge';
import {
  LOG_CAPTURE_SESSION_TIMEOUT_MS,
  severityToString,
  toWorkspaceRelativePath,
} from './debug/log-capture-bridge';

/** Public snapshot shape: same as sidecar (full export). Returned by getSessionSnapshot(). */
export type DriftAdvisorSnapshot = DriftAdvisorSidecar;

/** API surface exposed via context.exports for extension ID saropa.drift-viewer. */
export interface DriftAdvisorApi {
  /** Returns current session snapshot (performance, anomalies, schema, health, issues) or null if not connected. */
  getSessionSnapshot(): Promise<DriftAdvisorSnapshot | null>;
}

/** Serialize issues for snapshot/sidecar using shared bridge helpers. */
function serializeIssues(issues: LogCaptureIssueLike[]): DriftAdvisorSidecarIssue[] {
  return issues.map((i) => ({
    code: i.code,
    message: i.message,
    file: toWorkspaceRelativePath(i.fileUri.fsPath),
    range: { start: i.range.start.line, end: i.range.end.line },
    severity: severityToString(i.severity),
  }));
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms),
    ),
  ]);
}

/**
 * Builds the session snapshot by fetching performance, anomalies, schema, health,
 * indexSuggestions in parallel. Returns null if client is missing; otherwise
 * returns a snapshot with whatever data was fetched (failed calls yield empty/defaults).
 */
export async function buildSessionSnapshot(
  client: DriftApiClient | null,
  getIssues?: () => LogCaptureIssueLike[],
): Promise<DriftAdvisorSnapshot | null> {
  if (!client) return null;

  const [perf, anomalies, schema, health, indexSuggestions] = await Promise.all([
    withTimeout(client.performance(), LOG_CAPTURE_SESSION_TIMEOUT_MS).catch(() => null),
    withTimeout(client.anomalies(), LOG_CAPTURE_SESSION_TIMEOUT_MS).catch(() => null),
    withTimeout(client.schemaMetadata(), LOG_CAPTURE_SESSION_TIMEOUT_MS).catch(() => null),
    withTimeout(client.health(), LOG_CAPTURE_SESSION_TIMEOUT_MS).catch(() => null),
    withTimeout(client.indexSuggestions(), LOG_CAPTURE_SESSION_TIMEOUT_MS).catch(() => null),
  ]);

  const issues = getIssues?.() ?? [];
  const sidecarIssues = serializeIssues(issues);

  const snapshot: DriftAdvisorSnapshot = {
    generatedAt: new Date().toISOString(),
    baseUrl: client.baseUrl,
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

  return snapshot;
}

/**
 * Creates the API object to expose via context.exports.
 * getSessionSnapshot uses the current client and issues getter.
 */
export function createDriftAdvisorApi(
  getClient: () => DriftApiClient | null,
  getIssues?: () => LogCaptureIssueLike[],
): DriftAdvisorApi {
  return {
    async getSessionSnapshot(): Promise<DriftAdvisorSnapshot | null> {
      return buildSessionSnapshot(getClient(), getIssues);
    },
  };
}
