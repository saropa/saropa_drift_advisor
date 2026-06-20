/**
 * Pure parsing and mapping for the `saropa_lints` scanner report (schema v1).
 *
 * Split out from saropa-lints-diagnostics so the JSON-parsing, severity
 * mapping, and path/range resolution stay free of any VS Code lifecycle code
 * and remain individually unit-testable. The owning class (SaropaLintsDiagnostics)
 * imports these and re-exports the ones tests consume.
 */

import * as path from 'node:path';
import * as vscode from 'vscode';

/** Diagnostic source label shown on each published finding. */
export const DIAGNOSTIC_SOURCE = 'Saropa Lints';

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
