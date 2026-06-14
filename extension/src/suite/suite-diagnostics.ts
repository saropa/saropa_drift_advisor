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

/**
 * All three suite mirror files, including Advisor's own. Used by surfaces that
 * snapshot the persisted on-disk state of every tool (the commit timeline),
 * rather than fetching Advisor live. Advisor's mirror is already canonical
 * (`source: "advisor"` per entry), so the implied source is just a backfill.
 */
const ALL_MIRROR_FILES: ReadonlyArray<{ file: string; source: string }> = [
  { file: 'advisor.json', source: 'advisor' },
  ...SIBLING_FILES,
];

const MIRROR_DIR = '.saropa/diagnostics';

/** Reads the given mirror files from the first workspace folder, merged. */
async function readMirrorFiles(
  files: ReadonlyArray<{ file: string; source: string }>,
): Promise<SuiteDiagnostic[]> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) return [];

  const all: SuiteDiagnostic[] = [];
  for (const { file, source } of files) {
    const uri = vscode.Uri.joinPath(folder.uri, ...MIRROR_DIR.split('/'), file);
    const diags = await readEnvelopeFile(uri, source);
    all.push(...diags);
  }
  return all;
}

/**
 * Reads both sibling mirrors from the first workspace folder and returns their
 * merged diagnostics. Each entry's `source` is backfilled from the file it came
 * from when the envelope omits it. Returns [] when there is no workspace.
 */
export function readSiblingDiagnostics(): Promise<SuiteDiagnostic[]> {
  return readMirrorFiles(SIBLING_FILES);
}

/**
 * Reads all three suite mirrors (Advisor + the two siblings) from disk, merged.
 * Unlike the Drift Health panel — which fetches Advisor live for freshness —
 * the commit timeline records the persisted snapshot at a commit, so it reads
 * Advisor from its mirror too. Returns [] when there is no workspace.
 */
export function readAllSuiteDiagnostics(): Promise<SuiteDiagnostic[]> {
  return readMirrorFiles(ALL_MIRROR_FILES);
}

/**
 * A pointer to one tool's on-disk mirror, with just enough to correlate it —
 * NOT a copy of its contents (the mirror file is the single source of truth).
 * Used by the Log Capture session sidecar (plan 67 §6) to record, per tool,
 * which mirror existed at session end, the commit it was captured at, and how
 * many findings it held — so a session can be aligned against all three tools
 * by commit without duplicating their diagnostics into the session artifact.
 */
export interface SuiteMirrorRef {
  /** Producing tool: 'advisor' | 'lints' | 'log-capture'. */
  source: string;
  /** Workspace-relative path to the mirror (never an absolute home path). */
  file: string;
  /** False when the tool has written no mirror (not installed / never ran). */
  present: boolean;
  /** The commit the mirror was captured at (plan 67 R6), when stamped. */
  commitSha?: string;
  /** Number of diagnostics the mirror holds. */
  count: number;
}

/**
 * Reads a mirror's top-level capture commit and finding count from its JSON
 * text, malformed-safe. Exported for tests. Accepts either carrier key
 * (`diagnostics` canonical, `issues` legacy); a non-object or unparseable input
 * yields `{count: 0}` with no commit.
 */
export function envelopeMeta(text: string): { commitSha?: string; count: number } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { count: 0 };
  }
  if (typeof parsed !== 'object' || parsed === null) return { count: 0 };
  const env = parsed as SuiteEnvelope;
  const arr = Array.isArray(env.diagnostics)
    ? env.diagnostics
    : Array.isArray(env.issues)
      ? env.issues
      : [];
  return {
    commitSha: typeof env.commitSha === 'string' ? env.commitSha : undefined,
    count: arr.length,
  };
}

/**
 * Returns a reference to each suite mirror (Advisor + the two siblings) — present
 * flag, capture commit, and finding count — without loading their full contents.
 * Returns [] when there is no workspace. Best-effort per file: an unreadable or
 * malformed mirror reports `present:false` / `count:0` rather than throwing.
 */
export async function readSuiteMirrorRefs(): Promise<SuiteMirrorRef[]> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) return [];

  const refs: SuiteMirrorRef[] = [];
  for (const { file, source } of ALL_MIRROR_FILES) {
    const rel = `${MIRROR_DIR}/${file}`;
    const uri = vscode.Uri.joinPath(folder.uri, ...MIRROR_DIR.split('/'), file);
    let text: string;
    try {
      text = new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
    } catch {
      refs.push({ source, file: rel, present: false, count: 0 });
      continue;
    }
    const { commitSha, count } = envelopeMeta(text);
    refs.push({ source, file: rel, present: true, commitSha, count });
  }
  return refs;
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
