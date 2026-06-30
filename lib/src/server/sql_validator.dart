// SQL read-only validation extracted from SqlHandler.
// Pure static logic with no instance state dependencies.

import 'server_constants.dart';
import 'server_utils.dart';

/// Static SQL validation methods.
///
/// All methods are [static] and stateless — they depend
/// only on their parameters, never on instance fields.
/// Extracted from [SqlHandler] so validation can be
/// tested without constructing a full handler context.
abstract final class SqlValidator {
  /// Masks comments and string/identifier literals in [sql] in a SINGLE
  /// left-to-right pass that tracks lexical state, returning text where comments
  /// become spaces and every quoted run becomes `?`.
  ///
  /// This replaces the previous chain of independent regex passes. That chain
  /// stripped comments BEFORE masking strings, so an apostrophe inside a comment
  /// (or a `--` / `/*` inside a string literal) desynchronized quote pairing and
  /// could hide a trailing `; <write statement>` from the multi-statement check
  /// — e.g. `SELECT 'a -- b' ; DROP TABLE t --` was wrongly accepted as
  /// read-only. A single state machine cannot desync because it only enters a
  /// comment when not already inside a string, and vice versa. It also masks
  /// `[bracket]` and `` `backtick` `` identifier quoting, which the regex chain
  /// ignored entirely. See plans/full-codebase-audit-2026.06.12.md H1.
  static String _maskCommentsAndLiterals(String sql) {
    final buf = StringBuffer();
    final n = sql.length;
    var i = 0;
    while (i < n) {
      final c = sql[i];

      // Line comment `-- … <newline>`: replace the whole run with one space.
      if (c == '-' && i + 1 < n && sql[i + 1] == '-') {
        i += 2;
        while (i < n && sql[i] != '\n') {
          i++;
        }
        buf.write(' ');
        continue;
      }

      // Block comment `/* … */`: replace with one space (unterminated → to end).
      if (c == '/' && i + 1 < n && sql[i + 1] == '*') {
        i += 2;
        while (i < n && !(sql[i] == '*' && i + 1 < n && sql[i + 1] == '/')) {
          i++;
        }
        i += 2; // skip the closing */ (clamped below if it ran off the end)
        if (i > n) i = n;
        buf.write(' ');
        continue;
      }

      // Single-quoted string literal with `''` escape → `?`.
      if (c == "'") {
        i++;
        while (i < n) {
          if (sql[i] == "'") {
            if (i + 1 < n && sql[i + 1] == "'") {
              i += 2; // doubled '' is an escaped quote, stay in the string
              continue;
            }
            i++; // closing quote
            break;
          }
          i++;
        }
        buf.write('?');
        continue;
      }

      // Double-quoted identifier with `""` escape → `?`.
      if (c == '"') {
        i++;
        while (i < n) {
          if (sql[i] == '"') {
            if (i + 1 < n && sql[i + 1] == '"') {
              i += 2;
              continue;
            }
            i++;
            break;
          }
          i++;
        }
        buf.write('?');
        continue;
      }

      // Backtick identifier with `` `` `` escape → `?` (MySQL-compat quoting).
      if (c == '`') {
        i++;
        while (i < n) {
          if (sql[i] == '`') {
            if (i + 1 < n && sql[i + 1] == '`') {
              i += 2;
              continue;
            }
            i++;
            break;
          }
          i++;
        }
        buf.write('?');
        continue;
      }

      // Bracket identifier `[ … ]` (no escape in SQLite; first `]` closes) → `?`.
      if (c == '[') {
        i++;
        while (i < n && sql[i] != ']') {
          i++;
        }
        if (i < n) i++; // skip closing ]
        buf.write('?');
        continue;
      }

      buf.write(c);
      i++;
    }
    return buf.toString();
  }

  /// Steps 1–5 of the read-only pipeline: strip comments and
  /// literal/identifier markers, require a single statement,
  /// return the core text with no trailing semicolon; or null
  /// when empty / invalid multi-statement.
  static String? _singleStatementCoreForAnalysis(String sql) {
    final trimmed = sql.trim();
    if (trimmed.isEmpty) {
      return null;
    }

    final sqlNoStrings = _maskCommentsAndLiterals(trimmed).trim();

    final firstSemicolon = sqlNoStrings.indexOf(';');
    if (firstSemicolon >= 0 &&
        firstSemicolon + ServerConstants.indexAfterSemicolon <=
            sqlNoStrings.length &&
        firstSemicolon <
            sqlNoStrings.length - ServerConstants.indexAfterSemicolon) {
      final after = ServerUtils.safeSubstring(
        sqlNoStrings,
        start: firstSemicolon + ServerConstants.indexAfterSemicolon,
      ).trim();
      if (after.isNotEmpty) {
        return null;
      }
    }

    final withoutTrailingSemicolon = sqlNoStrings.endsWith(';')
        ? ServerUtils.safeSubstring(
            sqlNoStrings,
            start: 0,
            end: sqlNoStrings.length - ServerConstants.indexAfterSemicolon,
          ).trim()
        : sqlNoStrings;

    if (withoutTrailingSemicolon.trim().isEmpty) {
      return null;
    }
    return withoutTrailingSemicolon.trim();
  }

  /// Validates that [sql] is read-only: single statement,
  /// SELECT or WITH...SELECT only. Rejects
  /// INSERT/UPDATE/DELETE and DDL.
  ///
  /// Processing pipeline:
  /// 1. Strip line comments (`-- ...`)
  /// 2. Strip block comments (`/* ... */`)
  /// 3. Replace single-quoted strings with `?`
  /// 4. Replace double-quoted identifiers with `?`
  /// 5. Reject multi-statement SQL (anything after `;`)
  /// 6. Require `SELECT` or `WITH` prefix
  /// 7. Scan for 14 forbidden keywords (INSERT, UPDATE,
  ///    DELETE, CREATE, DROP, ALTER, etc.)
  ///
  /// Returns true if [sql] is a valid read-only query.
  static bool isReadOnlySql(String sql) {
    final withoutTrailingSemicolon = _singleStatementCoreForAnalysis(sql);
    if (withoutTrailingSemicolon == null) {
      return false;
    }

    // 6. Require SELECT or WITH prefix (case-insensitive).
    //
    // The keyword must be followed by ANY whitespace (space, tab, newline, CR),
    // not a literal space: a query formatted with a line break right after the
    // verb — `SELECT\n  id, ...` — is valid SQL and a normal pretty-printer
    // output. The previous `startsWith('SELECT ')` demanded one specific space
    // character and wrongly rejected every multi-line query, surfacing the
    // "Only read-only SQL is allowed" error for a plain SELECT.
    final upper = withoutTrailingSemicolon.toUpperCase();
    if (!RegExp(r'^(SELECT|WITH)\s').hasMatch(upper)) {
      return false;
    }

    // 7. Scan for forbidden keywords that indicate
    //    write operations or DDL. At this point, all
    //    string literals and comments have been stripped,
    //    so any match is a real keyword.
    const forbidden = <String>{
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
    };
    final words = RegExp(r'\b\w+\b');
    for (final match in words.allMatches(upper)) {
      final word = match.group(0);
      if (word != null && forbidden.contains(word)) {
        return false;
      }
    }

    return true;
  }

  /// True when [sql] is a single UPDATE / INSERT INTO / DELETE FROM
  /// statement (no DDL / PRAGMA / multi-statement). Used to validate
  /// VS Code extension batch applies before [DriftDebugWriteQuery].
  static bool isSingleDataMutationSql(String sql) {
    final core = _singleStatementCoreForAnalysis(sql);
    if (core == null) {
      return false;
    }
    final upper = core.toUpperCase();

    final isUpdate = RegExp(r'^UPDATE\b').hasMatch(upper);
    final isDelete = RegExp(r'^DELETE\s+FROM\b').hasMatch(upper);
    final isInsert = RegExp(r'^INSERT\s+INTO\b').hasMatch(upper);
    if (!isUpdate && !isDelete && !isInsert) {
      return false;
    }

    const forbidden = <String>{
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
      'REPLACE',
    };
    for (final match in RegExp(r'\b\w+\b').allMatches(upper)) {
      final word = match.group(0);
      if (word != null && forbidden.contains(word)) {
        return false;
      }
    }
    return true;
  }

  /// True when [sql] is a single `CREATE [UNIQUE] INDEX [IF NOT EXISTS] ...`
  /// statement and nothing else. Deliberately separate from
  /// [isSingleDataMutationSql] (which rejects all DDL): index creation is the
  /// only DDL the website is allowed to batch-apply, so it is gated by its own
  /// narrowly-scoped check rather than loosening the data-mutation validator.
  ///
  /// Rejects multi-statement input, any non-index leading verb, and any stacked
  /// DDL/DML/PRAGMA keyword (or a second `CREATE`) that slipped past the
  /// single-statement guard. Partial-index `WHERE` clauses are allowed because
  /// none of the forbidden keywords appear in a legitimate index definition.
  static bool isSingleCreateIndexSql(String sql) {
    final core = _singleStatementCoreForAnalysis(sql);
    if (core == null) {
      return false;
    }
    final upper = core.toUpperCase();

    final isCreateIndex = RegExp(
      r'^CREATE\s+(UNIQUE\s+)?INDEX\s+(IF\s+NOT\s+EXISTS\s+)?',
    ).hasMatch(upper);
    if (!isCreateIndex) {
      return false;
    }

    const forbidden = <String>{
      'INSERT',
      'UPDATE',
      'DELETE',
      'REPLACE',
      'TRUNCATE',
      'DROP',
      'ALTER',
      'ATTACH',
      'DETACH',
      'PRAGMA',
      'VACUUM',
      'REINDEX',
      'ANALYZE',
    };
    final words = RegExp(r'\b\w+\b').allMatches(upper).toList();
    for (var i = 0; i < words.length; i++) {
      final word = words[i].group(0);
      if (word == null) continue;
      if (forbidden.contains(word)) {
        return false;
      }
      // The leading verb is the only legitimate CREATE; a later one indicates
      // stacking that escaped the single-statement check.
      if (i > 0 && word == 'CREATE') {
        return false;
      }
    }
    return true;
  }
}
