/**
 * Session serialization helpers for Log Capture bridge contributions.
 */

import * as vscode from 'vscode';
import type { Anomaly, PerformanceData, TableMetadata } from '../api-types';
import type {
  DriftAdvisorMetaPayload,
  DriftAdvisorSidecar,
  DriftAdvisorSidecarIssue,
  LogCaptureIssueLike,
} from './log-capture-types';
import { severityToString, toWorkspaceRelativePath } from './log-capture-utils';

/** Builds compact performance payload for SessionMeta. */
export function buildMetaPerformance(
  perf: PerformanceData | null,
): DriftAdvisorMetaPayload['performance'] {
  if (!perf) {
    return {
      totalQueries: 0,
      totalDurationMs: 0,
      avgDurationMs: 0,
      slowCount: 0,
      topSlow: [],
    };
  }

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

/** Aggregates anomalies by severity for SessionMeta. */
export function buildMetaAnomalies(
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

/** Builds schema summary with optional table names for smaller workspaces. */
export function buildMetaSchema(
  schema: TableMetadata[],
): DriftAdvisorMetaPayload['schema'] {
  return {
    tableCount: schema.length,
    tableNames: schema.length <= 50 ? schema.map((t) => t.name) : undefined,
  };
}

/** Summarizes diagnostic issues for session metadata payloads. */
export function buildIssuesSummary(issues: LogCaptureIssueLike[]): {
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

/** Converts diagnostic issues into JSON-safe sidecar entries. */
export function serializeIssues(
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

/** Writes .saropa/drift-advisor-session.json in the first workspace folder. */
export async function writeSessionFile(sidecar: DriftAdvisorSidecar): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) return;
  const dirUri = vscode.Uri.joinPath(folder.uri, '.saropa');
  const fileUri = vscode.Uri.joinPath(dirUri, 'drift-advisor-session.json');
  await vscode.workspace.fs.createDirectory(dirUri);
  const bytes = new TextEncoder().encode(JSON.stringify(sidecar, null, 2));
  await vscode.workspace.fs.writeFile(fileUri, bytes);
}
