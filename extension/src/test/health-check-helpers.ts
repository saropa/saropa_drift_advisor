/**
 * Shared test helper for health-check-runner tests.
 */

import { HealthCheckTerminal } from '../tasks/health-check-runner';

/** Collect all writes and the close code from a HealthCheckTerminal. */
export function runTerminal(check: 'healthCheck' | 'anomalyScan' | 'indexCoverage'): {
  terminal: HealthCheckTerminal;
  lines: string[];
  closeCode: Promise<number>;
} {
  const terminal = new HealthCheckTerminal(check);
  const lines: string[] = [];

  terminal.onDidWrite((text: string) => {
    lines.push(text);
  });

  const closeCode = new Promise<number>((resolve) => {
    terminal.onDidClose((code: number) => {
      resolve(code);
    });
  });

  return { terminal, lines, closeCode };
}
