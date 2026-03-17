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
    final trimmed = sql.trim();
    if (trimmed.isEmpty) {
      return false;
    }

    // 1. Strip line comments (-- to end of line).
    final noLineComments = trimmed.replaceAll(
      RegExp(r'--[^\n]*'),
      ' ',
    );

    // 2. Strip block comments (/* ... */).
    final noBlockComments = noLineComments.replaceAll(
      RegExp(r'/\*[\s\S]*?\*/'),
      ' ',
    );

    // 3. Replace single-quoted string literals with
    //    placeholder '?' so quoted content (e.g.,
    //    'INSERT failed') doesn't trigger false
    //    positives on forbidden keyword scan.
    final noSingleQuotes = noBlockComments.replaceAllMapped(
      RegExp(r"'(?:[^']|'')*'"),
      (_) => '?',
    );

    // 4. Replace double-quoted identifiers with '?'
    //    so column/table names like "UPDATE_LOG" don't
    //    trigger false positives.
    final noStrings = noSingleQuotes.replaceAllMapped(
      RegExp(r'"(?:[^"]|"")*"'),
      (_) => '?',
    );

    final sqlNoStrings = noStrings.trim();

    // 5. Reject multi-statement SQL: if there's a
    //    semicolon with non-whitespace after it,
    //    it's multiple statements.
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
        return false;
      }
    }

    // Strip optional trailing semicolon before prefix
    // and keyword checks.
    final withoutTrailingSemicolon = sqlNoStrings.endsWith(';')
        ? ServerUtils.safeSubstring(
            sqlNoStrings,
            start: 0,
            end: sqlNoStrings.length - ServerConstants.indexAfterSemicolon,
          ).trim()
        : sqlNoStrings;

    // 6. Require SELECT or WITH prefix (case-insensitive).
    final upper = withoutTrailingSemicolon.toUpperCase();
    const selectPrefix = 'SELECT ';
    const withPrefix = 'WITH ';
    if (!upper.startsWith(selectPrefix) && !upper.startsWith(withPrefix)) {
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
}
