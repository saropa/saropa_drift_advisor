import * as vscode from 'vscode';
import { DriftApiClient } from '../api-client';
import type { DriftCheckKind } from './drift-task-provider';

export class HealthCheckTerminal implements vscode.Pseudoterminal {
  private readonly _writeEmitter = new vscode.EventEmitter<string>();
  private readonly _closeEmitter = new vscode.EventEmitter<number>();
  readonly onDidWrite = this._writeEmitter.event;
  readonly onDidClose = this._closeEmitter.event;

  constructor(private readonly _check: DriftCheckKind) {}

  open(): void {
    this.run();
  }

  close(): void {}

  private async run(): Promise<void> {
    const write = (text: string) => this._writeEmitter.fire(text + '\r\n');

    write('Drift Health Check');
    write('\u2550'.repeat(40));
    write('');

    const cfg = vscode.workspace.getConfiguration('driftViewer');
    const host = cfg.get<string>('host', '127.0.0.1') ?? '127.0.0.1';
    const port = cfg.get<number>('port', 8642) ?? 8642;
    const blockOnWarnings = cfg.get<boolean>('tasks.blockOnWarnings', false) ?? false;

    const client = new DriftApiClient(host, port);

    write(`Connecting to Drift server on ${host}:${port}...`);
    try {
      await client.health();
      write('  \u2713 Connected');
      write('');
    } catch {
      write('  \u2717 Cannot connect to Drift server');
      write('  Make sure your Flutter app is running with DriftDebugServer.start()');
      this._closeEmitter.fire(1);
      return;
    }

    let errorCount = 0;
    let warningCount = 0;

    if (this._check === 'healthCheck' || this._check === 'indexCoverage') {
      write('Index Coverage:');
      try {
        const suggestions = await client.indexSuggestions();
        if (suggestions.length === 0) {
          write('  \u2713 No missing indexes detected');
        } else {
          for (const s of suggestions) {
            const icon = s.priority === 'high' ? '\u2717' : '\u26A0';
            write(`  ${icon} ${s.table}.${s.column}: ${s.reason}`);
            write(`    ${s.sql}`);
            if (s.priority === 'high') { errorCount++; }
            else { warningCount++; }
          }
        }
      } catch (e) {
        write(`  \u2717 Failed to check indexes: ${e}`);
        errorCount++;
      }
      write('');
    }

    if (this._check === 'healthCheck' || this._check === 'anomalyScan') {
      write('Anomaly Scan:');
      try {
        const anomalies = await client.anomalies();
        if (anomalies.length === 0) {
          write('  \u2713 No anomalies detected');
        } else {
          for (const a of anomalies) {
            const icon = a.severity === 'error' ? '\u2717' : a.severity === 'warning' ? '\u26A0' : '\u2139';
            write(`  ${icon} ${a.message}`);
            if (a.severity === 'error') { errorCount++; }
            else if (a.severity === 'warning') { warningCount++; }
          }
        }
      } catch (e) {
        write(`  \u2717 Failed to scan anomalies: ${e}`);
        errorCount++;
      }
      write('');
    }

    write('\u2550'.repeat(40));
    const total = errorCount + warningCount;
    if (total === 0) {
      write('\u2713 All checks passed');
    } else {
      write(`${total} issue(s) found (${errorCount} error(s), ${warningCount} warning(s))`);
    }

    const shouldBlock = errorCount > 0 || (blockOnWarnings && warningCount > 0);
    this._closeEmitter.fire(shouldBlock ? 1 : 0);
  }
}
