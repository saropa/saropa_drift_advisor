/**
 * Saropa suite integration — parsing sibling envelope JSON (plan 67 R3).
 *
 * Pure, malformed-safe parsing of the envelope shape shared by the two
 * sibling mirror files and Advisor's own `/api/issues` payload. No file I/O
 * or `vscode` dependency here — see suite-mirror-files.ts for the readers
 * that feed this.
 */
import type { SuiteDiagnostic } from './suite-diagnostic-types';

/** A sibling's on-disk envelope. Carrier key is `issues` (Advisor) or `diagnostics` (canonical). */
interface SuiteEnvelope {
  issues?: unknown;
  diagnostics?: unknown;
  /** Envelope-level capture commit (plan 67 R6); applied to entries that omit their own. */
  commitSha?: string;
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
 * True when an Advisor `/api/issues` envelope carries `truncated: true` — its
 * live anomaly scan hit the wall-clock budget and stopped before checking
 * every table, so the `anomaly`-sourced issues in the envelope are partial.
 * Single source of truth for this extraction: both the Drift Health panel
 * (`collectDiagnostics`) and the Suite Findings dashboard widget
 * (`fetchSuiteFindings`) call this instead of re-deriving the cast, so a
 * future change to the envelope's truncation contract only needs updating
 * here. Malformed-safe like the rest of this module: anything other than a
 * literal `true` (missing envelope, wrong type, absent field) reads as false.
 */
export function extractTruncatedFlag(envelope: unknown): boolean {
  return (
    typeof envelope === 'object' &&
    envelope !== null &&
    (envelope as { truncated?: unknown }).truncated === true
  );
}
