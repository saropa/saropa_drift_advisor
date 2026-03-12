import * as vscode from 'vscode';
import { DriftApiClient } from '../api-client';
import { HealthScorer, toGrade } from '../health/health-scorer';
import type { IHealthScore } from '../health/health-types';
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

    write('Saropa Drift Advisor - Health Check');
    write('\u2550'.repeat(40));
    write('');

    const cfg = vscode.workspace.getConfiguration('driftViewer');
    const host = cfg.get<string>('host', '127.0.0.1') ?? '127.0.0.1';
    const port = cfg.get<number>('port', 8642) ?? 8642;
    const blockOnWarnings = cfg.get<boolean>('tasks.blockOnWarnings', false) ?? false;
    const minGrade = cfg.get<string>('tasks.minHealthGrade', 'D') ?? 'D';

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
    let healthScore: IHealthScore | undefined;

    if (this._check === 'healthCheck') {
      write('Computing Health Score...');
      try {
        const scorer = new HealthScorer();
        healthScore = await scorer.compute(client);

        const gradeColor = this._gradeColor(healthScore.grade);
        write('');
        write(`  Overall Health: ${gradeColor}${healthScore.grade}${this._resetColor()} (${healthScore.overall}/100)`);
        write('');

        for (const metric of healthScore.metrics) {
          const metricGradeColor = this._gradeColor(metric.grade);
          const icon = metric.score >= 80 ? '\u2713' : metric.score >= 60 ? '\u26A0' : '\u2717';
          write(`  ${icon} ${metric.name}: ${metricGradeColor}${metric.grade}${this._resetColor()} (${metric.score}/100)`);
          write(`    ${metric.summary}`);

          if (metric.score < 60) errorCount++;
          else if (metric.score < 80) warningCount++;
        }
        write('');

        if (healthScore.recommendations.length > 0) {
          write('Recommendations:');
          for (const rec of healthScore.recommendations.slice(0, 5)) {
            const icon = rec.severity === 'error' ? '\u2717' : rec.severity === 'warning' ? '\u26A0' : '\u2139';
            write(`  ${icon} ${rec.message}`);
          }
          if (healthScore.recommendations.length > 5) {
            write(`  ... and ${healthScore.recommendations.length - 5} more`);
          }
          write('');
        }
      } catch (e) {
        write(`  \u2717 Failed to compute health score: ${e}`);
        errorCount++;
      }
    }

    if (this._check === 'indexCoverage') {
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

    if (this._check === 'anomalyScan') {
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

    let shouldBlock = false;

    if (healthScore) {
      const belowMinGrade = this._isGradeBelowMinimum(healthScore.grade, minGrade);
      if (belowMinGrade) {
        write(`\u2717 Health grade ${healthScore.grade} is below minimum ${minGrade}`);
        shouldBlock = true;
      } else {
        write(`\u2713 Health grade ${healthScore.grade} meets minimum ${minGrade}`);
      }
    }

    const total = errorCount + warningCount;
    if (total === 0) {
      write('\u2713 All checks passed');
    } else {
      write(`${total} issue(s) found (${errorCount} error(s), ${warningCount} warning(s))`);
      shouldBlock = shouldBlock || errorCount > 0 || (blockOnWarnings && warningCount > 0);
    }

    this._closeEmitter.fire(shouldBlock ? 1 : 0);
  }

  private _gradeColor(grade: string): string {
    const letter = grade.charAt(0).toUpperCase();
    if (letter === 'A') return '\x1b[32m';
    if (letter === 'B') return '\x1b[92m';
    if (letter === 'C') return '\x1b[33m';
    if (letter === 'D') return '\x1b[91m';
    return '\x1b[31m';
  }

  private _resetColor(): string {
    return '\x1b[0m';
  }

  private _isGradeBelowMinimum(grade: string, minGrade: string): boolean {
    const gradeOrder = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F'];
    const gradeIdx = gradeOrder.indexOf(grade);
    const minIdx = gradeOrder.indexOf(minGrade);
    if (gradeIdx === -1 || minIdx === -1) return false;
    return gradeIdx > minIdx;
  }
}
