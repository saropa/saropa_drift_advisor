/** Coarse classification of a single SQL string entered in the console. */
export type SqlKind = 'empty' | 'readOnly' | 'mutation' | 'forbidden';

/** Severity vocabulary shared with the diagnostics UI (error/warning/info). */
export type SqlSeverity = 'info' | 'warning' | 'error';

/** Result of classifying one SQL string. */
export interface SqlClassification {
  kind: SqlKind;
  /** readOnly -> info, mutation -> warning, forbidden/empty -> error. */
  severity: SqlSeverity;
  /** Stable l10n KEY (never English); '' when kind is readOnly. */
  reason: string;
  /** Uppercased leading keyword (SELECT, WITH, UPDATE, ...), '' when empty. */
  verb: string;
  /** True only when kind === 'readOnly' or 'mutation'. */
  executable: boolean;
}

/**
 * Builds a classification, deriving BOTH `severity` and `executable` from
 * `kind` in one place. Both are deterministic: empty/forbidden -> error,
 * readOnly -> info, mutation -> warning; executable = readOnly | mutation.
 * Callers no longer pass severity, which eliminates the risk of a contradictory
 * kind/severity pair drifting in over time (review finding, 2026-09-07).
 */
export function classification(
  kind: SqlKind,
  reason: string,
  verb: string,
): SqlClassification {
  // Severity is fully derivable from kind — there is no case where the two
  // should disagree, so computing it here prevents a future caller from passing
  // a contradictory pair.
  const severityMap: Record<SqlKind, SqlSeverity> = {
    empty: 'error',
    forbidden: 'error',
    readOnly: 'info',
    mutation: 'warning',
  };
  return {
    kind,
    severity: severityMap[kind],
    reason,
    verb,
    // Single source of truth for the executable rule from the plan contract:
    // only readOnly and mutation can be sent to a server endpoint.
    executable: kind === 'readOnly' || kind === 'mutation',
  };
}
