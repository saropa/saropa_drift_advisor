/**
 * Ingest `saropa_lints` findings as real VS Code diagnostics.
 *
 * The standalone scanner (`dart run saropa_lints scan . --format json`) emits a
 * stable, versioned JSON report (schema v1). We parse it and publish the
 * findings into a dedicated diagnostic collection so they appear in the Problems
 * panel and inline editor squiggles — the same surface as the advisor's own
 * checks — instead of only a text dump in an Output channel.
 *
 * Why a dedicated collection (and an on-demand command) rather than a provider
 * in the auto-refresh pipeline: the scan shells out to the Dart analyzer over
 * the whole project, which is far too expensive to run on every 30s refresh /
 * on-save cycle. It is user-triggered; results persist until re-run or cleared.
 * saropa_lints rules are toggled in the consumer's `analysis_options.yaml`
 * (custom_lint convention), so this collection deliberately does NOT route
 * through the advisor's `disabledRules` machinery — the rule registry lives in
 * saropa_lints, not here.
 */

import { spawn } from 'node:child_process';
import * as vscode from 'vscode';
import {
  mapReportToFileDiagnostics,
  parseScanReport,
  type IScanReport,
} from './saropa-lints-report';

// Re-export the report parsing surface so existing importers (and tests) keep
// resolving these from this module after the pure logic moved to
// saropa-lints-report.ts.
export {
  mapScanSeverity,
  parseScanReport,
  mapReportToFileDiagnostics,
} from './saropa-lints-report';
export type { IScanDiagnostic, IScanReport } from './saropa-lints-report';

const COLLECTION_NAME = 'saropa-lints';
const OUTPUT_CHANNEL_NAME = 'Saropa Lints';

/**
 * Owns the saropa_lints diagnostic collection and the on-demand scan command.
 */
export class SaropaLintsDiagnostics {
  private readonly _collection: vscode.DiagnosticCollection;
  private _output: vscode.OutputChannel | undefined;

  constructor() {
    this._collection =
      vscode.languages.createDiagnosticCollection(COLLECTION_NAME);
  }

  dispose(): void {
    this._collection.dispose();
    this._output?.dispose();
  }

  /** Remove all published saropa_lints diagnostics. */
  clear(): void {
    this._collection.clear();
  }

  private _channel(): vscode.OutputChannel {
    this._output ??= vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
    return this._output;
  }

  /**
   * Run the scanner and publish its findings as diagnostics. Fails gracefully
   * if no workspace, Dart isn't on PATH, or saropa_lints isn't in the project.
   */
  async runAndPublish(): Promise<void> {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      const choice = await vscode.window.showWarningMessage(
        'To run Saropa Lints you must open a valid workspace folder first.',
        'Open Folder',
      );
      if (choice === 'Open Folder') {
        void vscode.commands.executeCommand('vscode.openFolder');
      }
      return;
    }

    const root = folder.uri.fsPath;
    const channel = this._channel();

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Running Saropa Lints…',
        cancellable: false,
      },
      () =>
        new Promise<void>((resolve) => {
          let stdout = '';
          let stderr = '';
          const child = spawn(
            'dart',
            ['run', 'saropa_lints', 'scan', '.', '--format', 'json'],
            { cwd: root, shell: process.platform === 'win32' },
          );

          child.stdout?.on('data', (data: Buffer | string) => {
            stdout += data.toString();
          });
          child.stderr?.on('data', (data: Buffer | string) => {
            stderr += data.toString();
          });

          child.on('error', (err) => {
            channel.appendLine(`Error: ${err.message}`);
            channel.appendLine(
              'Make sure Dart is on PATH and the workspace has saropa_lints in dev_dependencies.',
            );
            channel.show(true);
            resolve();
          });

          // Exit 0 = clean, 1 = findings present (NOT a failure), 2 = scan
          // error. Only a missing/invalid report is treated as an error.
          child.on('close', (code) => {
            const report = parseScanReport(stdout);
            if (!report) {
              channel.appendLine(
                `Saropa Lints scan did not return a JSON report (exit ${code ?? 'unknown'}).`,
              );
              if (stderr.trim()) channel.appendLine(stderr.trim());
              channel.show(true);
              resolve();
              return;
            }
            this._publish(report, root, channel);
            resolve();
          });
        }),
    );
  }

  /** Replace the collection with the report's findings and log a summary. */
  private _publish(
    report: IScanReport,
    root: string,
    channel: vscode.OutputChannel,
  ): void {
    this._collection.clear();

    const fileDiagnostics = mapReportToFileDiagnostics(report, root);
    for (const { uri, diagnostics } of fileDiagnostics) {
      this._collection.set(uri, diagnostics);
    }

    this._logSummary(report, fileDiagnostics.length, channel);
  }

  /** Write a human-readable summary (counts + top rules) to the channel. */
  private _logSummary(
    report: IScanReport,
    fileCount: number,
    channel: vscode.OutputChannel,
  ): void {
    const total = report.diagnostics.length;
    channel.clear();
    if (total === 0) {
      channel.appendLine('Saropa Lints: no issues found.');
      void vscode.window.showInformationMessage(
        'Saropa Lints: no issues found.',
      );
      return;
    }

    channel.appendLine(
      `Saropa Lints: ${total} issue(s) in ${fileCount} file(s) — published to Problems.`,
    );

    const byRule = report.summary?.byRule ?? {};
    const topRules = Object.entries(byRule)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    if (topRules.length > 0) {
      channel.appendLine('');
      channel.appendLine('Top rules:');
      for (const [rule, count] of topRules) {
        channel.appendLine(`  ${String(count).padStart(6)}  ${rule}`);
      }
    }
    channel.show(true);
    void vscode.window.showInformationMessage(
      `Saropa Lints: ${total} issue(s) in ${fileCount} file(s). See Problems panel.`,
    );
  }
}
