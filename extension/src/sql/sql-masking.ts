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
