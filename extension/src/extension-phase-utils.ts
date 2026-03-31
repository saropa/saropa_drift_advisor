/**
 * Activation phase utilities: timestamp helper and isolated phase runner.
 * Extracted from extension-main to keep files under the line cap.
 */
import * as vscode from 'vscode';

/** Returns an ISO timestamp string for log lines. */
export function ts(): string {
  return new Date().toISOString();
}

/**
 * Runs a single activation phase inside a try/catch.
 *
 * On success: logs completion and returns the phase result.
 * On failure: logs the error + stack trace to the output channel,
 * shows a user-visible error toast, and returns `undefined` so later
 * phases can check whether their dependency is available.
 */
export function runPhase<T>(
  name: string,
  channel: vscode.OutputChannel,
  fn: () => T,
): T | undefined {
  channel.appendLine(`[${ts()}] Phase "${name}" starting...`);
  try {
    const result = fn();
    channel.appendLine(`[${ts()}] Phase "${name}" completed.`);
    return result;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack ?? '' : '';
    channel.appendLine(`[${ts()}] Phase "${name}" FAILED: ${msg}\n${stack}`);
    void vscode.window.showErrorMessage(
      `Saropa Drift Advisor: "${name}" failed — ${msg}. Some features may be unavailable.`,
    );
    return undefined;
  }
}
