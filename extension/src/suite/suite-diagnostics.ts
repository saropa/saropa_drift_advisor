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
 *
 * This file was split (300-line cap) into cohesive modules that it re-exports
 * for back-compat, so existing importers keep working unchanged:
 *   suite-diagnostic-types.ts  — SuiteDiagnostic / SuiteFix shapes
 *   suite-command-allowlist.ts — the fix-action command allowlist
 *   suite-envelope-parser.ts   — pure envelope JSON parsing
 *   suite-mirror-files.ts      — the on-disk mirror-file readers
 * `relatedDiagnostics` (the query-matching filter) stays here.
 */
import type { SuiteDiagnostic } from './suite-diagnostic-types';

export * from './suite-diagnostic-types';
export * from './suite-command-allowlist';
export * from './suite-envelope-parser';
export * from './suite-mirror-files';

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
