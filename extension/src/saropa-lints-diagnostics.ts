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
import * as path from 'node:path';
import * as vscode from 'vscode';

const COLLECTION_NAME = 'saropa-lints';
const DIAGNOSTIC_SOURCE = 'Saropa Lints';
const OUTPUT_CHANNEL_NAME = 'Saropa Lints';

/** One finding from the scanner's `--format json` report (schema v1). */
export interface IScanDiagnostic {
  filePath: string;
  /** 1-based line (analyzer convention). */
  line: number;
  /** 1-based column (analyzer convention). */
  column: number;
  ruleName: string;
  /** Analyzer severity name: 'ERROR' | 'WARNING' | 'INFO' (case-insensitive). */
  severity: string;
  problemMessage?: string | null;
  correctionMessage?: string | null;
}

/** Top-level shape of `scan --format json` (schema v1). */
export interface IScanReport {
  version: number;
  diagnostics: IScanDiagnostic[];
  summary?: {
    totalCount: number;
    byFile: Record<string, number>;
    byRule: Record<string, number>;
  };
}

/** Map the scanner's analyzer-severity string to a VS Code severity. */
export function mapScanSeverity(severity: string): vscode.DiagnosticSeverity {
  // The scanner emits `DiagnosticSeverity.name` from the analyzer; case has
  // varied across analyzer versions, so compare case-insensitively. Unknown
  // values fall back to Information rather than silently dropping the finding.
  switch (severity.toUpperCase()) {
    case 'ERROR':
      return vscode.DiagnosticSeverity.Error;
    case 'WARNING':
      return vscode.DiagnosticSeverity.Warning;
    case 'INFO':
      return vscode.DiagnosticSeverity.Information;
    default:
      return vscode.DiagnosticSeverity.Information;
  }
}

/**
 * Tolerantly parse the scanner's stdout into a report. `dart run` can prepend
 * build chatter, so we slice from the first `{` to the last `}` before parsing
 * rather than assuming stdout is pure JSON. Returns null when no valid v1
 * report is present (caller treats that as "nothing to publish").
 */
export function parseScanReport(stdout: string): IScanReport | null {
  const start = stdout.indexOf('{');
  const end = stdout.lastIndexOf('}');
  if (start < 0 || end <= start) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout.slice(start, end + 1));
  } catch {
    return null;
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !Array.isArray((parsed as IScanReport).diagnostics)
  ) {
    return null;
  }
  return parsed as IScanReport;
}

/** Build a single VS Code diagnostic from one scanner finding. */
function toDiagnostic(d: IScanDiagnostic): vscode.Diagnostic {
  // Analyzer line/column are 1-based; VS Code ranges are 0-based. Clamp so a
  // 0/negative coordinate (defensive against a malformed report) can't throw.
  const line = Math.max(0, d.line - 1);
  const col = Math.max(0, d.column - 1);
  // No length is reported, so highlight a single character at the location;
  // VS Code widens to the token under the cursor when needed.
  const range = new vscode.Range(line, col, line, col + 1);

  const problem = d.problemMessage ?? d.ruleName;
  const message = d.correctionMessage
    ? `${problem}\n${d.correctionMessage}`
    : problem;

  const diag = new vscode.Diagnostic(range, message, mapScanSeverity(d.severity));
  diag.source = DIAGNOSTIC_SOURCE;
  diag.code = d.ruleName;
  return diag;
}

/**
 * Convert a parsed report into per-file diagnostics, ready for
 * `DiagnosticCollection.set`. `workspaceRoot` resolves any relative file paths
 * the scanner emits; absolute paths are used as-is. Pure (no I/O) so the
 * path-resolution, range, and severity mapping stay unit-testable.
 */
export function mapReportToFileDiagnostics(
  report: IScanReport,
  workspaceRoot: string,
): Array<{ uri: vscode.Uri; diagnostics: vscode.Diagnostic[] }> {
  const grouped = new Map<
    string,
    { uri: vscode.Uri; diagnostics: vscode.Diagnostic[] }
  >();

  for (const d of report.diagnostics) {
    const absPath = path.isAbsolute(d.filePath)
      ? d.filePath
      : path.join(workspaceRoot, d.filePath);
    const uri = vscode.Uri.file(absPath);
    const key = uri.toString();

    const entry = grouped.get(key);
    if (entry) {
      entry.diagnostics.push(toDiagnostic(d));
    } else {
      grouped.set(key, { uri, diagnostics: [toDiagnostic(d)] });
    }
  }

  return [...grouped.values()];
}

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
