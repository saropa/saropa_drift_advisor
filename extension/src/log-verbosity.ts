/**
 * Log verbosity controls which runtime events are emitted to Output channels.
 *
 * This is intentionally heuristic-based: existing call sites do not pass
 * log levels, so we infer "noise" vs "important/error" from message text.
 */

import * as vscode from 'vscode';

export type LogVerbosity = 'quiet' | 'normal' | 'verbose';

export function getLogVerbosity(
  cfg: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration(
    'driftViewer',
  ),
): LogVerbosity {
  const v = cfg.get<string>('logVerbosity', 'verbose');
  if (v === 'quiet' || v === 'normal' || v === 'verbose') return v;
  return 'verbose';
}

function stripTsPrefix(line: string): string {
  // Connection channel uses ISO timestamps; edits channel uses hh:mm:ss.
  // Both are wrapped as: `[<timestamp>] <msg>`.
  return line.replace(/^\[[^\]]+\]\s*/, '');
}

function isImportantConnectionLine(stripped: string): boolean {
  const lower = stripped.toLowerCase();
  return (
    lower.includes('failed') ||
    lower.includes('error') ||
    lower.includes('poll error') ||
    lower.includes('port scan failed') ||
    lower.includes('state:') ||
    lower.includes('connected to :') ||
    lower.includes('retry') ||
    lower.includes('found servers on ports')
  );
}

function isVerboseConnectionLine(stripped: string): boolean {
  const lower = stripped.toLowerCase();
  return (
    lower.includes('triggered by user') ||
    lower.includes('discovery: scanning') ||
    lower.startsWith('discovery: scanning')
  );
}

export function shouldLogConnectionLine(
  line: string,
  verbosity: LogVerbosity,
): boolean {
  if (verbosity === 'verbose') return true;

  const stripped = stripTsPrefix(line);
  const important = isImportantConnectionLine(stripped);
  if (verbosity === 'quiet') {
    return important;
  }

  // normal: keep important/error + non-verbose noise.
  if (verbosity === 'normal') {
    return important || !isVerboseConnectionLine(stripped);
  }

  return true;
}

function isStructuralEditLine(stripped: string): boolean {
  const lower = stripped.toLowerCase();
  return (
    lower.startsWith('undo ') ||
    lower.startsWith('redo ') ||
    lower.startsWith('discard all') ||
    lower.startsWith('generate sql') ||
    lower.startsWith('remove change')
  );
}

export function shouldLogEditLine(
  line: string,
  verbosity: LogVerbosity,
): boolean {
  if (verbosity === 'verbose') return true;
  const stripped = stripTsPrefix(line);
  const lower = stripped.toLowerCase();

  // `ChangeTracker` emits per-cell edits as: `EDIT <table>.<col> ...`.
  const isCellEdit = lower.startsWith('edit ');
  const isStructural = isStructuralEditLine(stripped);

  if (verbosity === 'normal') {
    return !isCellEdit || isStructural;
  }

  // quiet: only structural actions.
  return isStructural;
}

export interface IAppendLineSink {
  appendLine(msg: string): void;
}

export function createVerbosityFilteredSink(
  sink: IAppendLineSink,
  verbosity: LogVerbosity,
  kind: 'connection' | 'edit',
): IAppendLineSink {
  return {
    appendLine: (msg: string) => {
      if (kind === 'connection') {
        if (shouldLogConnectionLine(msg, verbosity)) sink.appendLine(msg);
        return;
      }
      if (shouldLogEditLine(msg, verbosity)) sink.appendLine(msg);
    },
  };
}

