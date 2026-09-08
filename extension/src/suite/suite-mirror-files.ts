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

import type { SuiteDiagnostic } from './suite-diagnostic-types';
import { envelopeMeta, parseEnvelope } from './suite-envelope-parser';

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
