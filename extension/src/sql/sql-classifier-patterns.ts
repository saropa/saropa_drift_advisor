// Keywords that can never appear anywhere in a read-only statement. Mirrors the
// 14-entry set in `SqlValidator.isReadOnlySql` step 7 exactly. Matched only
// against whole words of the MASKED text, so a table named `analyze_results` or
// a quoted identifier "delete" cannot trip it.
export const READ_ONLY_FORBIDDEN = new Set<string>([
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

// The four DML verbs that are legal mutations — used both to derive
// MUTATION_FORBIDDEN (set subtraction) and at the classifySql call site to
// distinguish "malformed mutation" from "forbidden statement". Declared before
// MUTATION_FORBIDDEN because it depends on this.
export const DML_VERBS = new Set<string>(['INSERT', 'UPDATE', 'DELETE', 'REPLACE']);

// Keywords forbidden inside a data mutation. Derived from READ_ONLY_FORBIDDEN
// minus the four DML verbs so a new keyword added to the read-only set
// automatically propagates here — a review finding (2026-09-07) showed the two
// hand-maintained sets had drifted-apart potential. REPLACE is deliberately
// absent: it is legal DML both as a leading verb (`REPLACE INTO`) and as a
// conflict clause (`INSERT OR REPLACE INTO`).
export const MUTATION_FORBIDDEN = new Set<string>(
  [...READ_ONLY_FORBIDDEN].filter((kw) => !DML_VERBS.has(kw)),
);

// Leading-verb shapes accepted as a single data mutation. Ported verbatim from
// the hoisted patterns in sql_validator.dart, including the deliberate absence
// of a trailing \b on the UPDATE pattern: masking turns a quoted table name into
// `?`, and `\b` fails before a non-word character, which would reject
// `UPDATE "my table" SET ...`.
export const INSERT_PATTERN = /^INSERT\s+(OR\s+(REPLACE|IGNORE|ABORT|ROLLBACK|FAIL)\s+)?INTO\b/;
export const REPLACE_PATTERN = /^REPLACE\s+INTO\b/;
export const UPDATE_PATTERN = /^UPDATE\s+(OR\s+(REPLACE|IGNORE|ABORT|ROLLBACK|FAIL)\s+)?/;
export const DELETE_PATTERN = /^DELETE\s+FROM\b/;

// Alias for readability at the call site in classifySql — DML_VERBS is also
// used to distinguish "malformed mutation" from "forbidden statement".
export const MUTATION_VERBS = DML_VERBS;

// Requires ANY whitespace after the verb, not a literal space. A query formatted
// as `SELECT\n  id, ...` is normal pretty-printer output and perfectly valid;
// `startsWith('SELECT ')` rejected every multi-line query, which was a real
// server-side bug (see sql_validator.dart step 6).
export const READ_ONLY_PREFIX = /^(SELECT|WITH)\s/;

// Whole-word scanner used for the forbidden-keyword passes.
export const WORD_BOUNDARY = /\b\w+\b/g;

// First identifier-shaped token, used to report the leading verb.
export const LEADING_WORD = /^[A-Za-z_][A-Za-z0-9_]*/;
