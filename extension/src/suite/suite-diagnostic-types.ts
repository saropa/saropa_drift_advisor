/**
 * Saropa suite integration — shared diagnostic shapes (plan 67 R3).
 *
 * Extracted from suite-diagnostics.ts so the plain data shapes used across the
 * suite-reading modules (envelope parsing, mirror-file I/O, filtering) live in
 * one place without pulling in `vscode` or file-I/O code.
 */

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
