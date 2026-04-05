/**
 * Connection health check: add connection-error diagnostic if server unreachable.
 * Skips the check entirely for workspaces that don't declare `drift` as a
 * dependency — no point warning about a missing server for non-Drift projects.
 */

import * as vscode from 'vscode';
import type { DriftApiClient } from '../../api-client';
import type { IDiagnosticIssue } from '../diagnostic-types';
import { isDriftProject } from '../dart-file-parser';

/**
 * Returns true if the workspace pubspec.yaml lists `drift` (or
 * `saropa_drift_advisor`) as a dependency. Returns false when pubspec
 * doesn't exist or can't be read.
 */
async function hasDriftDependency(workspaceUri: vscode.Uri): Promise<boolean> {
  try {
    const pubspecUri = vscode.Uri.joinPath(workspaceUri, 'pubspec.yaml');
    const bytes = await vscode.workspace.fs.readFile(pubspecUri);
    return isDriftProject(Buffer.from(bytes).toString('utf-8'));
  } catch {
    // pubspec.yaml doesn't exist or can't be read — not a Drift project
    return false;
  }
}

/**
 * If the client fails to reach the server and hasRecentConnectionError is false,
 * push a connection-error issue. Caller should pass true if connection errors
 * were already recorded recently (e.g. via RuntimeEventStore).
 *
 * Skips the check entirely when the workspace pubspec.yaml does not list `drift`
 * as a dependency — non-Drift projects should never see this warning.
 */
export async function checkConnection(
  client: DriftApiClient,
  issues: IDiagnosticIssue[],
  workspaceUri: vscode.Uri,
  hasRecentConnectionError: boolean,
): Promise<void> {
  // Don't warn about a missing Drift server in projects that don't use Drift
  const isDrift = await hasDriftDependency(workspaceUri);
  if (!isDrift) {
    return;
  }

  try {
    await client.generation(0);
  } catch (err) {
    if (!hasRecentConnectionError) {
      const detail = err instanceof Error ? err.message : 'unknown error';
      issues.push({
        code: 'connection-error',
        message:
          'Drift server not reachable — start your app with '
          + 'DriftDebugServer.start() or use Quick Fix to dismiss '
          + `(${detail})`,
        fileUri: workspaceUri,
        range: new vscode.Range(0, 0, 0, 0),
        severity: vscode.DiagnosticSeverity.Warning,
      });
    }
  }
}
