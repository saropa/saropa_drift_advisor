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
//
// ---------------------------------------------------------------------------
// MODULE LAYOUT (kept under the 300-line advisory cap)
// ---------------------------------------------------------------------------
// This file holds the orchestration (`classifySql` and its private helpers).
// The pieces it composes live alongside it in this directory:
//   sql-masking.ts            - maskCommentsAndLiterals (comment/quote lexer)
//   sql-classifier-patterns.ts - forbidden-keyword sets and verb-shape regexes
//   sql-classifier-types.ts    - SqlKind/SqlSeverity/SqlClassification + the
//                                 classification() builder
// Both are re-exported here so existing import paths (`'../sql/sql-classifier'`)
// keep working unchanged.

export type { SqlKind, SqlSeverity, SqlClassification } from './sql-classifier-types';
import { classification, type SqlClassification } from './sql-classifier-types';
export { maskCommentsAndLiterals } from './sql-masking';
import { maskCommentsAndLiterals } from './sql-masking';
import {
  READ_ONLY_FORBIDDEN,
  MUTATION_FORBIDDEN,
  INSERT_PATTERN,
  REPLACE_PATTERN,
  UPDATE_PATTERN,
  DELETE_PATTERN,
  MUTATION_VERBS,
  READ_ONLY_PREFIX,
  WORD_BOUNDARY,
  LEADING_WORD,
} from './sql-classifier-patterns';

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
      return classification('empty', 'sqlConsole.reason.empty', '');
    }
    // Multi-statement. The verb is still reported so the tooltip can say which
    // statement the user started with.
    return classification(
      'forbidden',
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
      return classification('forbidden', 'sqlConsole.reason.forbiddenKeyword', verb);
    }
    // The only case with an empty reason, per the plan contract: nothing to
    // warn about, so there is no hint text to translate.
    return classification('readOnly', '', verb);
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
      return classification('forbidden', 'sqlConsole.reason.forbiddenKeyword', verb);
    }
    // Warning, not error: this is legal and executable, but it changes data, so
    // package C gates it behind the confirm-destructive prompt.
    return classification('mutation', 'sqlConsole.reason.mutation', verb);
  }

  // A write verb whose required clause is missing (`INSERT t VALUES ...`,
  // `DELETE t`). Separated from the generic forbidden case because the useful
  // hint is "fix the syntax", not "this is not allowed".
  if (MUTATION_VERBS.has(verb)) {
    return classification('forbidden', 'sqlConsole.reason.malformedMutation', verb);
  }

  // Everything else: DDL (CREATE/ALTER/DROP/TRUNCATE), ATTACH/DETACH/PRAGMA/
  // VACUUM/ANALYZE/REINDEX, and any unrecognized leading token. Neither server
  // endpoint accepts these, so Execute stays disabled.
  return classification('forbidden', 'sqlConsole.reason.forbiddenStatement', verb);
}
