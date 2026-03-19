/**
 * Utility helpers shared by Log Capture bridge and API helpers.
 */

import * as vscode from 'vscode';

/** Timeout for each API call during session end / snapshot (ms). */
export const LOG_CAPTURE_SESSION_TIMEOUT_MS = 5000;

type LogMode = 'off' | 'slow-only' | 'all';
type IncludeInLogCaptureMode = 'none' | 'header' | 'full';

/** Reads query line logging mode from workspace settings. */
export function getLogMode(): LogMode {
  return (
    vscode.workspace
      .getConfiguration('driftViewer')
      .get<LogMode>('performance.logToCapture', 'slow-only') ?? 'slow-only'
  );
}

/** Reads session contribution mode from workspace settings. */
export function getIncludeInLogCaptureSession(): IncludeInLogCaptureMode {
  return (
    vscode.workspace
      .getConfiguration('driftViewer')
      .get<IncludeInLogCaptureMode>(
        'integrations.includeInLogCaptureSession',
        'full',
      ) ?? 'full'
  );
}

/** Maps VS Code DiagnosticSeverity (0-3) to stable string values. */
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

/** Converts absolute path into workspace-relative path when possible. */
export function toWorkspaceRelativePath(fsPath: string): string {
  try {
    return vscode.workspace.asRelativePath(vscode.Uri.file(fsPath));
  } catch {
    return fsPath;
  }
}

/** Adds timeout and logs failures with a human-friendly label. */
export async function withTimeout<T>(
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
