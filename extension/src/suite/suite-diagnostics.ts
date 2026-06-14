/**
 * Saropa suite integration — reading sibling diagnostics (plan 67 R3).
 *
 * The counterpart to the mirror writer (R2): this reads the envelopes the
 * sibling tools leave in the workspace —
 *   `.saropa/diagnostics/lints.json`        (Saropa Lints static findings)
 *   `.saropa/diagnostics/log-capture.json`  (Saropa Log Capture runtime signals)
 * — so Advisor can show, next to its own runtime analysis, "Lints rule X also
 * governs this" and "Log Capture saw this query slow this session".
 *
 * Everything here is best-effort and malformed-safe: a missing, truncated, or
 * non-envelope file yields an empty list, never an exception — a sibling's bad
 * write must never break Advisor's own panels.
 */
import * as vscode from 'vscode';

/** One diagnostic from a sibling tool's envelope (plan 67 §2.1). */
export interface SuiteDiagnostic {
  id?: string;
  /** Producing tool: 'lints' | 'log-capture' | 'advisor'. Filled from the file when absent. */
  source?: string;
  severity?: string;
  category?: string;
  /** Already-localized one-line summary (passthrough — never re-translated here). */
  title?: string;
  detail?: string;
  ruleId?: string;
  table?: string;
  sql?: string;
  /** Commit the finding was captured at (plan 67 R6); backfilled from the envelope when absent. */
  commitSha?: string;
  /** Optional primary action — a deep-link to a suite command (plan 67 §2.1 / R1). */
  fix?: SuiteFix;
}

/** A diagnostic's primary action: a contributed VS Code command (plan 67 §3). */
export interface SuiteFix {
  kind?: string;
  title?: string;
  command?: string;
  args?: unknown[];
  uri?: string;
}

/**
 * Command-id prefixes a suite fix-action is allowed to invoke. A `fix.command`
 * arrives from a sibling's on-disk file or the debug server, so it is untrusted
 * input: the panels execute it ONLY when it is both in this allowlist and
 * actually registered. This mirrors the Log Capture hardening that removed an
 * over-broad "run any command" webview message.
 */
export const SUITE_COMMAND_PREFIXES: readonly string[] = [
  'driftViewer.',
  'saropaLints.',
  'saropaLogCapture.',
];

/** True when [command] is a non-empty string under an allowed suite prefix. */
export function isAllowedSuiteCommand(command: unknown): command is string {
  return (
    typeof command === 'string'
    && SUITE_COMMAND_PREFIXES.some((p) => command.startsWith(p))
  );
}

/** A sibling's on-disk envelope. Carrier key is `issues` (Advisor) or `diagnostics` (canonical). */
interface SuiteEnvelope {
  issues?: unknown;
  diagnostics?: unknown;
  /** Envelope-level capture commit (plan 67 R6); applied to entries that omit their own. */
  commitSha?: string;
}

/** The two sibling mirror files Advisor consumes, with the source each implies. */
const SIBLING_FILES: ReadonlyArray<{ file: string; source: string }> = [
  { file: 'lints.json', source: 'lints' },
  { file: 'log-capture.json', source: 'log-capture' },
];

const MIRROR_DIR = '.saropa/diagnostics';

/**
 * Reads both sibling mirrors from the first workspace folder and returns their
 * merged diagnostics. Each entry's `source` is backfilled from the file it came
 * from when the envelope omits it. Returns [] when there is no workspace.
 */
export async function readSiblingDiagnostics(): Promise<SuiteDiagnostic[]> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) return [];

  const all: SuiteDiagnostic[] = [];
  for (const { file, source } of SIBLING_FILES) {
    const uri = vscode.Uri.joinPath(folder.uri, ...MIRROR_DIR.split('/'), file);
    const diags = await readEnvelopeFile(uri, source);
    all.push(...diags);
  }
  return all;
}

/** Reads and parses one envelope file; any failure yields []. */
async function readEnvelopeFile(
  uri: vscode.Uri,
  source: string,
): Promise<SuiteDiagnostic[]> {
  let text: string;
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    text = new TextDecoder().decode(bytes);
  } catch {
    // Absent file is the normal case (sibling not installed / never ran).
    return [];
  }
  return parseEnvelope(text, source);
}

/**
 * Parses an envelope's JSON text into diagnostics. Exported for tests. Tolerates
 * either carrier key (`issues` / `diagnostics`), a non-object root, and entries
 * that are not objects — dropping anything malformed rather than throwing.
 */
export function parseEnvelope(text: string, source: string): SuiteDiagnostic[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  return diagnosticsFromEnvelope(parsed, source);
}

/**
 * Extracts diagnostics from an already-parsed envelope object. Exported for the
 * Drift Health panel, which feeds it the live `/api/issues` payload (already
 * JSON) rather than file text.
 *
 * When [forceSource] is true the diagnostic's own `source` is overridden with
 * [source] — used for Advisor's own envelope, whose per-issue `source` is the
 * detector (anomaly / index-suggestion) and must be relabeled to the tool
 * ("advisor") for tool-level grouping. Otherwise `source` is only backfilled
 * when absent.
 */
export function diagnosticsFromEnvelope(
  envelope: unknown,
  source: string,
  forceSource = false,
): SuiteDiagnostic[] {
  if (typeof envelope !== 'object' || envelope === null) return [];

  const env = envelope as SuiteEnvelope;
  const raw = Array.isArray(env.issues)
    ? env.issues
    : Array.isArray(env.diagnostics)
      ? env.diagnostics
      : null;
  if (!raw) return [];

  const out: SuiteDiagnostic[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue;
    const d = entry as SuiteDiagnostic;
    out.push({
      ...d,
      source: forceSource ? source : (d.source ?? source),
      // Per-diagnostic commit wins; otherwise inherit the envelope's (plan 67 R6).
      commitSha: d.commitSha ?? env.commitSha,
    });
  }
  return out;
}

/**
 * Filters diagnostics to those related to a query: its `table` is among
 * [tables] (case-insensitive) or its `sql` matches [sql] (trimmed, exact).
 * Pure and exported for tests. A diagnostic with neither a matching table nor
 * sql is excluded, so unrelated findings never appear against a query.
 */
export function relatedDiagnostics(
  diagnostics: ReadonlyArray<SuiteDiagnostic>,
  query: { tables?: ReadonlyArray<string>; sql?: string },
): SuiteDiagnostic[] {
  const tableSet = new Set((query.tables ?? []).map((t) => t.toLowerCase()));
  const sql = query.sql?.trim();
  return diagnostics.filter((d) => {
    if (d.table && tableSet.has(d.table.toLowerCase())) return true;
    if (sql && d.sql && d.sql.trim() === sql) return true;
    return false;
  });
}
