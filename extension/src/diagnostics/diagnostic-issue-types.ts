import * as vscode from 'vscode';

/**
 * Extra data attached when a diagnostic pins to a caller site instead of the
 * table definition file. Carries the table file's URI and class line so the
 * suppression layer can check ignore directives there (the caller file is
 * not in dartFiles and would otherwise be missed).
 */
export interface ICallerPinnedData extends Record<string, unknown> {
  /** Stringified URI of the Drift table definition file. */
  tableFileUri: string;
  /** 0-based line of the table class declaration in the table file. */
  tableFileLine: number;
}

/**
 * A single compiled `columnNameExclusions` glob entry. Only a leading and/or
 * trailing `*` is supported (`*_at`, `created*`, `*mid*`) — deliberately not
 * a general glob-to-regex translation. A regex with several interior `.*`
 * segments (from multiple `*` wildcards) can force catastrophic backtracking
 * on a crafted or coincidentally-adversarial input; matching prefix/suffix/
 * substring directly with plain string ops has no backtracking to exploit,
 * so this stays linear-time regardless of what a user pastes into settings.
 * `text` is pre-lowercased so the hot per-issue check never re-lowercases.
 */
export interface IColumnNameGlobPattern {
  /** How `text` anchors against the (lowercased) column name. */
  kind: 'prefix' | 'suffix' | 'contains' | 'inert';
  /** Lowercased literal to match; for `inert`, never matches anything. */
  text: string;
}

/**
 * Compiled `columnNameExclusions` entries for one diagnostic code. Split at
 * config-load time into exact names (O(1) `Set` lookup) and glob patterns
 * so the hot per-issue suppression check never re-parses a pattern.
 */
export interface IColumnNameExclusionSet {
  /** Lowercased exact column names. */
  exact: Set<string>;
  /** Compiled `*`-glob patterns. */
  patterns: IColumnNameGlobPattern[];
}

/** True when `columnName` matches an exact name or glob pattern in `set`. */
export function matchesColumnNameExclusion(
  set: IColumnNameExclusionSet | undefined,
  columnName: string,
): boolean {
  if (!set) {
    return false;
  }
  const lower = columnName.toLowerCase();
  if (set.exact.has(lower)) {
    return true;
  }
  return set.patterns.some((p) => {
    switch (p.kind) {
      case 'prefix':
        return lower.startsWith(p.text);
      case 'suffix':
        return lower.endsWith(p.text);
      case 'contains':
        return lower.includes(p.text);
      case 'inert':
        return false;
    }
  });
}

/** Type guard: true when issue.data carries caller-pinned table file info. */
export function hasCallerPinnedData(
  data: Record<string, unknown> | undefined,
): data is ICallerPinnedData {
  return (
    data !== undefined &&
    typeof data.tableFileUri === 'string' &&
    typeof data.tableFileLine === 'number'
  );
}

/**
 * Known data shapes per diagnostic code. Checkers that use `createTypedIssue`
 * get compile-time enforcement of these fields. Checkers not yet migrated
 * still push plain `IDiagnosticIssue` with `data?: Record<string, unknown>`.
 *
 * To add a new code: define its data shape here, then use `createTypedIssue`
 * in the checker. The consumer side (`diagnostic-apply.ts`) reads fields via
 * `issue.data?.fieldName` — no casting needed since the runtime shape is the
 * same `Record<string, unknown>`.
 */
export interface DiagnosticDataMap {
  'n-plus-one': { tableName: string } & Partial<ICallerPinnedData>;
  'slow-query-pattern': { sql: string; durationMs: number } & Partial<ICallerPinnedData>;
  'unindexed-where-clause': { sql: string };
  'unindexed-join': { sql: string };
  'high-null-rate': { table: string; column: string; nullPct: number };
  'unused-column': { table: string; column: string; nullPct: number };
  'empty-table': { table: string; percentage: number };
  'raw-sql-column-type-mismatch': { tableName: string; column: string };
  'missing-pk': { tableName: string };
  'composite-pk-no-index': { tableName: string };
  'naming-table': { current: string; suggested: string };
  'naming-column': { current: string; suggested: string };
}

/** A single diagnostic issue reported by a provider. */
export interface IDiagnosticIssue {
  /** References a registered diagnostic code. */
  code: string;
  /** Formatted message (placeholders already substituted). */
  message: string;
  /** File where the issue was found. */
  fileUri: vscode.Uri;
  /** Location within the file. */
  range: vscode.Range;
  /** Override default severity for this instance. */
  severity?: vscode.DiagnosticSeverity;
  /** Related information (e.g., suggested SQL). */
  relatedInfo?: vscode.DiagnosticRelatedInformation[];
  /** Arbitrary data for quick fix actions and suppression fallback. */
  data?: Record<string, unknown>;
}

/**
 * Create a diagnostic issue with compile-time typed data for a known code.
 * Returns a plain `IDiagnosticIssue` so it slots into existing arrays
 * without casting. Checkers not yet migrated can still push raw issues.
 */
export function createTypedIssue<C extends keyof DiagnosticDataMap>(
  issue: Omit<IDiagnosticIssue, 'code' | 'data'> & {
    code: C;
    data: DiagnosticDataMap[C];
  },
): IDiagnosticIssue {
  return issue as IDiagnosticIssue;
}
