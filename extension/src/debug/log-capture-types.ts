/**
 * Shared type contracts for the Log Capture integration bridge.
 */

import * as vscode from 'vscode';
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
