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
}

/** A sibling's on-disk envelope. Carrier key is `issues` (Advisor) or `diagnostics` (canonical). */
interface SuiteEnvelope {
  issues?: unknown;
  diagnostics?: unknown;
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
  if (typeof parsed !== 'object' || parsed === null) return [];

  const env = parsed as SuiteEnvelope;
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
    out.push({ ...d, source: d.source ?? source });
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
