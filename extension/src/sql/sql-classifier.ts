// SQL classification for the sidebar SQL console's live validation feedback.
//
// ---------------------------------------------------------------------------
// THIS IS NOT A SECURITY BOUNDARY.
// ---------------------------------------------------------------------------
// This classifier exists ONLY to drive UI hints: which severity icon to show
// next to the SQL box, and whether the Execute button is enabled. The Dart
// server re-validates every statement it receives (`SqlValidator.isReadOnlySql`
// for `POST /api/sql`, `SqlValidator.isSingleDataMutationSql` for
// `POST /api/edits/apply`) and is the SOLE authority on what may run. A
// disagreement between this file and the server is a UX papercut, never a
// safety hole — the server rejects what it does not like regardless of what
// this file decided. Nothing here may be relied upon to prevent anything.
//
// It is nevertheless a faithful port of `lib/src/server/sql_validator.dart`
// (masking + single-statement + verb + forbidden-keyword scan) so that the two
// rarely disagree: an Execute button that enables for a query the server then
// rejects is exactly the confusing round trip this classifier is meant to avoid.
//
// ---------------------------------------------------------------------------
// PURITY CONTRACT
// ---------------------------------------------------------------------------
// Zero `vscode` imports, zero I/O, zero module state. This keeps the file unit
// testable under plain mocha without loading the vscode mock, and lets both the
// extension host and (later) the SQL Notebook panel share one implementation.
//
// ---------------------------------------------------------------------------
// l10n KEYS EMITTED BY THIS MODULE
// ---------------------------------------------------------------------------
// `reason` is a developer-facing hint rendered in the sidebar, so it must be
// translatable. This module never returns English: it returns a stable key, and
// work package C resolves it with `t()` from `extension/src/l10n.ts` at the
// render site. Every key this file can emit — package C must register all of
// them in the appropriate `extension/src/l10n/strings-*.ts` registry:
//
//   sqlConsole.reason.empty              - nothing to run (blank/comment-only)
//   sqlConsole.reason.multiStatement     - text follows the first `;`
//   sqlConsole.reason.forbiddenStatement - leading verb is not SELECT/WITH or a
//                                          supported mutation (DDL, PRAGMA,
//                                          ATTACH, VACUUM, unknown verb, ...)
//   sqlConsole.reason.forbiddenKeyword   - permitted leading verb, but a
//                                          forbidden keyword appears later
//   sqlConsole.reason.malformedMutation  - mutation verb missing its required
//                                          clause (INSERT/REPLACE without INTO,
//                                          DELETE without FROM)
//   sqlConsole.reason.mutation           - accepted write; warn before running
//
// An empty `reason` ('') is emitted only for `readOnly`, per the plan contract.

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

// Keywords that can never appear anywhere in a read-only statement. Mirrors the
// 14-entry set in `SqlValidator.isReadOnlySql` step 7 exactly. Matched only
// against whole words of the MASKED text, so a table named `analyze_results` or
// a quoted identifier "delete" cannot trip it.
const READ_ONLY_FORBIDDEN = new Set<string>([
  'INSERT',
  'UPDATE',
  'DELETE',
  'REPLACE',
  'TRUNCATE',
  'CREATE',
  'ALTER',
  'DROP',
  'ATTACH',
  'DETACH',
  'PRAGMA',
  'VACUUM',
  'ANALYZE',
  'REINDEX',
]);

// Keywords forbidden inside a data mutation. Mirrors
// `SqlValidator.isSingleDataMutationSql`. REPLACE is deliberately absent: it is
// legal DML both as a leading verb (`REPLACE INTO`) and as a conflict clause
// (`INSERT OR REPLACE INTO`), and the single-statement guard already prevents a
// second write being stacked behind it.
const MUTATION_FORBIDDEN = new Set<string>([
  'CREATE',
  'DROP',
  'ALTER',
  'ATTACH',
  'DETACH',
  'PRAGMA',
  'VACUUM',
  'ANALYZE',
  'REINDEX',
  'TRUNCATE',
]);

// Leading-verb shapes accepted as a single data mutation. Ported verbatim from
// the hoisted patterns in sql_validator.dart, including the deliberate absence
// of a trailing \b on the UPDATE pattern: masking turns a quoted table name into
// `?`, and `\b` fails before a non-word character, which would reject
// `UPDATE "my table" SET ...`.
const INSERT_PATTERN = /^INSERT\s+(OR\s+(REPLACE|IGNORE|ABORT|ROLLBACK|FAIL)\s+)?INTO\b/;
const REPLACE_PATTERN = /^REPLACE\s+INTO\b/;
const UPDATE_PATTERN = /^UPDATE\s+(OR\s+(REPLACE|IGNORE|ABORT|ROLLBACK|FAIL)\s+)?/;
const DELETE_PATTERN = /^DELETE\s+FROM\b/;

// Leading verbs that mean "the user is trying to write data". Used to choose
// between `malformedMutation` (they meant a write but got the syntax wrong) and
// `forbiddenStatement` (they asked for something never allowed at all) — a much
// more useful hint than collapsing both into one message.
const MUTATION_VERBS = new Set<string>(['INSERT', 'UPDATE', 'DELETE', 'REPLACE']);

// Requires ANY whitespace after the verb, not a literal space. A query formatted
// as `SELECT\n  id, ...` is normal pretty-printer output and perfectly valid;
// `startsWith('SELECT ')` rejected every multi-line query, which was a real
// server-side bug (see sql_validator.dart step 6).
const READ_ONLY_PREFIX = /^(SELECT|WITH)\s/;

// Whole-word scanner used for the forbidden-keyword passes.
const WORD_BOUNDARY = /\b\w+\b/g;

// First identifier-shaped token, used to report the leading verb.
const LEADING_WORD = /^[A-Za-z_][A-Za-z0-9_]*/;

/**
 * Masks comments and quoted runs in [sql] in a SINGLE left-to-right pass that
 * tracks lexical state: comments become one space, every quoted run becomes `?`.
 *
 * WHY A STATE MACHINE AND NOT A CHAIN OF REGEXES: a chain (strip `--`, strip
 * `/* *\/`, then replace `'...'`) processes each construct in ignorance of the
 * others. Stripping comments first lets an apostrophe inside a comment — or a
 * `--` inside a string literal — desynchronize quote pairing, after which a
 * trailing `; DROP TABLE t` is invisible to the multi-statement check. The
 * canonical failure is `SELECT 'a -- b' ; DROP TABLE t --`, which the regex
 * chain classified as a safe read-only query. That was a real audit finding on
 * the Dart side (see the H1 entry in
 * plans/history/2026.06/2026.06.12/full-codebase-audit-2026.06.12.md) and the
 * reason this port must not "simplify" back to regexes. One pass cannot desync
 * because it only enters a comment when it is not already inside a string, and
 * only enters a string when it is not already inside a comment.
 *
 * Exported for direct unit testing of the masking traps; callers outside tests
 * should use {@link classifySql}.
 */
export function maskCommentsAndLiterals(sql: string): string {
  let out = '';
  const n = sql.length;
  let i = 0;
  while (i < n) {
    const c = sql[i];

    // Line comment `-- ... <newline>` collapses to a single space. The newline
    // itself is left in place so line structure (and thus whitespace after a
    // verb) survives masking.
    if (c === '-' && i + 1 < n && sql[i + 1] === '-') {
      i += 2;
      while (i < n && sql[i] !== '\n') {
        i++;
      }
      out += ' ';
      continue;
    }

    // Block comment `/* ... */` collapses to a single space. An unterminated
    // block runs to the end of input, matching SQLite's tolerance and the Dart
    // implementation.
    if (c === '/' && i + 1 < n && sql[i + 1] === '*') {
      i += 2;
      while (i < n && !(sql[i] === '*' && i + 1 < n && sql[i + 1] === '/')) {
        i++;
      }
      i += 2; // step over the closing */
      if (i > n) {
        i = n; // clamp when the block was unterminated
      }
      out += ' ';
      continue;
    }

    // Single-quoted string literal, with `''` as the embedded-quote escape.
    if (c === "'") {
      i = skipQuoted(sql, i, "'");
      out += '?';
      continue;
    }

    // Double-quoted identifier, with `""` as the embedded-quote escape.
    if (c === '"') {
      i = skipQuoted(sql, i, '"');
      out += '?';
      continue;
    }

    // Backtick identifier (MySQL-compatible quoting SQLite also accepts), with
    // ``` `` ``` as the escape.
    if (c === '`') {
      i = skipQuoted(sql, i, '`');
      out += '?';
      continue;
    }

    // Bracket identifier `[ ... ]`. SQLite defines no escape inside brackets —
    // the first `]` closes the run — so doubling is not honored here.
    if (c === '[') {
      i++;
      while (i < n && sql[i] !== ']') {
        i++;
      }
      if (i < n) {
        i++; // step over the closing ]
      }
      out += '?';
      continue;
    }

    out += c;
    i++;
  }
  return out;
}

/**
 * Consumes a quoted run starting at [start] (which must index the opening
 * quote) and returns the index just past its closing quote, or the end of input
 * when the run is unterminated. Shared by the three doubling-escaped quote
 * styles so the escape rule is written once rather than three times.
 */
function skipQuoted(sql: string, start: number, quote: string): number {
  const n = sql.length;
  let i = start + 1; // step over the opening quote
  while (i < n) {
    if (sql[i] === quote) {
      // A doubled quote is an escaped quote, not the terminator — stay inside.
      if (i + 1 < n && sql[i + 1] === quote) {
        i += 2;
        continue;
      }
      return i + 1; // past the closing quote
    }
    i++;
  }
  return n; // unterminated run: everything to end of input was quoted
}

/**
 * Outcome of reducing raw input to a single analyzable statement. A plain
 * `string | null` (as the Dart side uses) cannot tell "blank" from
 * "multi-statement", and the console needs different reasons and different
 * kinds for those two cases, so the failure is tagged.
 */
type CoreResult =
  | { ok: true; core: string }
  | { ok: false; problem: 'empty' | 'multiStatement'; core: string };

/**
 * Masks the input, rejects multi-statement text, and strips a trailing
 * semicolon — the TypeScript equivalent of
 * `SqlValidator._singleStatementCoreForAnalysis`.
 *
 * The `core` field is populated even on failure so the caller can still report
 * a leading verb for a rejected multi-statement query (the icon tooltip reads
 * better naming the verb the user typed).
 */
function singleStatementCore(sql: string): CoreResult {
  const trimmed = sql.trim();
  if (trimmed.length === 0) {
    return { ok: false, problem: 'empty', core: '' };
  }

  // Mask FIRST, then look for `;` — a semicolon inside a string literal or a
  // comment is not a statement separator, and only the masked text can tell the
  // difference.
  const masked = maskCommentsAndLiterals(trimmed).trim();

  const firstSemicolon = masked.indexOf(';');
  if (firstSemicolon >= 0) {
    const after = masked.slice(firstSemicolon + 1).trim();
    if (after.length > 0) {
      // Anything non-blank after the first `;` is a second statement. Both
      // server endpoints accept exactly one statement, so this is fatal.
      return {
        ok: false,
        problem: 'multiStatement',
        core: masked.slice(0, firstSemicolon).trim(),
      };
    }
  }

  const core = (
    masked.endsWith(';') ? masked.slice(0, masked.length - 1) : masked
  ).trim();

  // Comment-only or semicolon-only input masks down to nothing: there is no
  // statement to run, which is "empty" rather than "forbidden".
  if (core.length === 0) {
    return { ok: false, problem: 'empty', core: '' };
  }
  return { ok: true, core };
}

/**
 * Returns the uppercased leading keyword of [core], or '' when the text does
 * not begin with an identifier-shaped token (e.g. it starts with `(` or a
 * masked literal `?`).
 */
function leadingVerb(core: string): string {
  const match = LEADING_WORD.exec(core.trimStart());
  return match ? match[0].toUpperCase() : '';
}

/**
 * True when any whole word of [upper] is in [forbidden]. [upper] must already
 * be masked and uppercased, so every word seen here is real SQL syntax rather
 * than the contents of a string literal, a quoted identifier, or a comment.
 */
function containsForbiddenWord(upper: string, forbidden: Set<string>): boolean {
  // `lastIndex` is reset because WORD_BOUNDARY is a module-level /g regex and
  // would otherwise resume mid-string from the previous call.
  WORD_BOUNDARY.lastIndex = 0;
  let match = WORD_BOUNDARY.exec(upper);
  while (match !== null) {
    if (forbidden.has(match[0])) {
      return true;
    }
    match = WORD_BOUNDARY.exec(upper);
  }
  return false;
}

/** Builds a classification, deriving `executable` from `kind` in one place. */
function classification(
  kind: SqlKind,
  severity: SqlSeverity,
  reason: string,
  verb: string,
): SqlClassification {
  return {
    kind,
    severity,
    reason,
    verb,
    // Single source of truth for the executable rule from the plan contract:
    // only readOnly and mutation can be sent to a server endpoint.
    executable: kind === 'readOnly' || kind === 'mutation',
  };
}

/**
 * Classifies one SQL string for the sidebar console's live validation.
 *
 * UI hinting only — see the security note at the top of this file. The pipeline
 * mirrors sql_validator.dart: mask, require a single statement, inspect the
 * leading verb, then scan for stacked forbidden keywords.
 */
export function classifySql(sql: string): SqlClassification {
  const result = singleStatementCore(sql);

  if (!result.ok) {
    if (result.problem === 'empty') {
      // Blank, whitespace-only, comment-only, or bare `;`: nothing to run. Kept
      // distinct from `forbidden` so the UI can stay quiet (no scary error
      // wording) while the box is simply not filled in yet.
      return classification('empty', 'error', 'sqlConsole.reason.empty', '');
    }
    // Multi-statement. The verb is still reported so the tooltip can say which
    // statement the user started with.
    return classification(
      'forbidden',
      'error',
      'sqlConsole.reason.multiStatement',
      leadingVerb(result.core),
    );
  }

  const upper = result.core.toUpperCase();
  const verb = leadingVerb(result.core);

  // --- Read-only path: SELECT / WITH ---------------------------------------
  if (READ_ONLY_PREFIX.test(upper)) {
    // Ported from isReadOnlySql step 7. A leading SELECT is not sufficient:
    // `WITH x AS (...) INSERT INTO ...` starts with WITH and still writes, and
    // the server rejects it. Classifying it readOnly here would enable Execute
    // for a query that then fails server-side, which is the exact round trip
    // this classifier exists to prevent.
    if (containsForbiddenWord(upper, READ_ONLY_FORBIDDEN)) {
      return classification(
        'forbidden',
        'error',
        'sqlConsole.reason.forbiddenKeyword',
        verb,
      );
    }
    // The only case with an empty reason, per the plan contract: nothing to
    // warn about, so there is no hint text to translate.
    return classification('readOnly', 'info', '', verb);
  }

  // --- Mutation path: INSERT / UPDATE / DELETE / REPLACE --------------------
  const isMutationShape =
    INSERT_PATTERN.test(upper) ||
    REPLACE_PATTERN.test(upper) ||
    UPDATE_PATTERN.test(upper) ||
    DELETE_PATTERN.test(upper);

  if (isMutationShape) {
    // Ported from isSingleDataMutationSql: DDL/utility keywords stacked into an
    // otherwise well-formed mutation are rejected by /api/edits/apply.
    if (containsForbiddenWord(upper, MUTATION_FORBIDDEN)) {
      return classification(
        'forbidden',
        'error',
        'sqlConsole.reason.forbiddenKeyword',
        verb,
      );
    }
    // Warning, not error: this is legal and executable, but it changes data, so
    // package C gates it behind the confirm-destructive prompt.
    return classification(
      'mutation',
      'warning',
      'sqlConsole.reason.mutation',
      verb,
    );
  }

  // A write verb whose required clause is missing (`INSERT t VALUES ...`,
  // `DELETE t`). Separated from the generic forbidden case because the useful
  // hint is "fix the syntax", not "this is not allowed".
  if (MUTATION_VERBS.has(verb)) {
    return classification(
      'forbidden',
      'error',
      'sqlConsole.reason.malformedMutation',
      verb,
    );
  }

  // Everything else: DDL (CREATE/ALTER/DROP/TRUNCATE), ATTACH/DETACH/PRAGMA/
  // VACUUM/ANALYZE/REINDEX, and any unrecognized leading token. Neither server
  // endpoint accepts these, so Execute stays disabled.
  return classification(
    'forbidden',
    'error',
    'sqlConsole.reason.forbiddenStatement',
    verb,
  );
}
