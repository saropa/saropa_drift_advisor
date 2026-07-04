// Schema-aware enrichment of bare SQLite prepare-time errors from /api/sql.
//
// The interactive SQL path forwards a client-composed query straight to the
// Drift executor, so a column typo — or a name that does not match Drift's
// snake_case acronym splitting (`UUID` -> `u_u_i_d`) — comes back as a bare
// `SqliteException(1): no such column: ...` with zero schema assistance. The
// Advisor already knows every table's real columns, and the source-file
// checker (raw-sql-column-checker.ts) already turns the same mistake into a
// "did you mean" hint for Dart source. This closes the gap on the runtime
// path: it runs AFTER SQLite has rejected the statement, so there are no
// false positives — SQLite has already decided the column/keyword is wrong,
// and we only attach the nearest-real-column hint and the table's actual
// column list to the message the client already receives.
//
// Best-effort by contract: any lookup failure (PRAGMA error, unexpected error
// text, empty schema) returns the original message unchanged. An enrichment
// pass must never turn a query error into a different error.

import 'server_constants.dart';
import 'server_typedefs.dart';
import 'server_utils.dart';

/// Attaches nearest-column and reserved-word hints to raw SQLite errors.
final class SqlErrorEnricher {
  const SqlErrorEnricher._();

  /// Max columns listed per table in an enriched message before truncation, so
  /// a wide table cannot bloat the error body into an unreadable wall.
  static const int _maxListedColumns = 60;

  /// SQLite keywords people most often misuse as a bare column alias
  /// (`... AS primary`). Not the full reserved list — only the words that
  /// realistically appear as an intended alias/identifier and produce the
  /// `near "<word>": syntax error` this hint explains. Lowercase for lookup.
  static const Set<String> _reservedAliasWords = <String>{
    'primary',
    'order',
    'group',
    'index',
    'table',
    'select',
    'where',
    'from',
    'join',
    'default',
    'check',
    'unique',
    'references',
    'foreign',
    'key',
    'values',
    'column',
    'constraint',
    'having',
    'limit',
    'offset',
    'union',
    'using',
    'when',
    'then',
    'case',
  };

  /// Returns [message] enriched with a schema-aware hint, or [message]
  /// unchanged when nothing applies. Never throws.
  ///
  /// [query] runs schema lookups (PRAGMA table_info) — pass the server's
  /// internal query callback so these probes are excluded from slow-query
  /// diagnostics. It is only exercised for the `no such column` path (the
  /// reserved-word hint needs no lookup). [onError] is called with any
  /// enrichment-time failure so it is logged rather than silently dropped,
  /// while the caller still gets the original message back.
  static Future<String> enrich({
    required String message,
    required String sql,
    required DriftDebugQuery query,
    void Function(Object error, StackTrace stack)? onError,
  }) async {
    try {
      final columnHint = await _enrichNoSuchColumn(message, sql, query);
      if (columnHint != null) return columnHint;

      final reservedHint = _enrichReservedWordAlias(message);
      if (reservedHint != null) return reservedHint;
    } on Object catch (error, stack) {
      // Enrichment is a courtesy layer; a failure here must never replace the
      // real query error with an enrichment error. Log it (so a broken lookup
      // is diagnosable) and fall through to the untouched original message.
      onError?.call(error, stack);
    }
    return message;
  }

  /// Extracts the unknown column from a `no such column: <ref>` error, resolves
  /// the referenced table(s) from the query's FROM/JOIN clauses, and appends
  /// the nearest real column plus that table's actual column list.
  ///
  /// Returns null when the message is not a `no such column` error, when no
  /// table could be resolved, or when the schema lookup found no columns.
  static Future<String?> _enrichNoSuchColumn(
    String message,
    String sql,
    DriftDebugQuery query,
  ) async {
    final ref = _parseUnknownColumnRef(message);
    if (ref == null) return null;

    final (String? aliasPrefix, String column) = ref;

    // Resolve which physical table(s) the column reference could belong to.
    // With an alias/table prefix we target exactly that table; a bare column
    // is checked against every table in the FROM/JOIN set.
    final tableMap = _parseFromJoinTables(sql);
    if (tableMap.isEmpty) return null;

    final Iterable<String> candidateTables;
    if (aliasPrefix != null) {
      final resolved = tableMap[aliasPrefix.toLowerCase()];
      // Prefix names a table/alias we could not resolve -> nothing reliable to
      // suggest; leave the bare SQLite error rather than guess wrong columns.
      if (resolved == null) return null;
      candidateTables = <String>{resolved};
    } else {
      candidateTables = tableMap.values.toSet();
    }

    // Gather each candidate table's real columns via PRAGMA. A parsed token
    // that is not a real table (CTE, subquery alias) returns no rows and is
    // silently skipped.
    final perTableColumns = <String, List<String>>{};
    final allColumns = <String>[];
    for (final table in candidateTables) {
      final rows = ServerUtils.normalizeRows(
        await query('PRAGMA table_info(${ServerUtils.quoteIdent(table)})'),
      );
      final columns = rows
          .map((r) => r[ServerConstants.jsonKeyName] as String? ?? '')
          .where((c) => c.isNotEmpty)
          .toList();
      if (columns.isEmpty) continue;
      perTableColumns[table] = columns;
      allColumns.addAll(columns);
    }
    if (allColumns.isEmpty) return null;

    return _buildColumnHint(
      message: message,
      column: column,
      perTableColumns: perTableColumns,
      allColumns: allColumns,
    );
  }

  /// Composes the enriched message: original text, an optional nearest-column
  /// suggestion, and each candidate table's real column list (truncated).
  static String _buildColumnHint({
    required String message,
    required String column,
    required Map<String, List<String>> perTableColumns,
    required List<String> allColumns,
  }) {
    final buffer = StringBuffer(message);

    // Suggest the single closest real column only when it is plausibly a typo /
    // acronym mistake rather than an unrelated word. Threshold mirrors the
    // source-file checker (raw-sql-column-checker.ts) so both paths agree.
    final closest = _closestMatch(column, allColumns);
    final threshold = _suggestThreshold(column);
    if (closest != null && closest.$2 <= threshold) {
      buffer.write(' — did you mean "${closest.$1}"?');
    }

    // Always list the real columns of the resolved table(s): even when the
    // fuzzy distance is too large to suggest (dropped prefix + acronym split),
    // seeing `contact_saropa_u_u_i_d` in the list solves the query outright.
    for (final entry in perTableColumns.entries) {
      final columns = entry.value;
      final shown = columns.take(_maxListedColumns).join(', ');
      final overflow = columns.length > _maxListedColumns
          ? ' (+${columns.length - _maxListedColumns} more)'
          : '';
      buffer.write(' Columns in "${entry.key}": $shown$overflow.');
    }

    return buffer.toString();
  }

  /// Detects a `near "<word>": syntax error` whose `<word>` is a SQLite keyword
  /// misused as a bare alias/identifier, and appends a quote-or-rename hint.
  /// Returns null when the pattern does not apply.
  static String? _enrichReservedWordAlias(String message) {
    final match = RegExp(
      r'near "([^"]+)": syntax error',
      caseSensitive: false,
    ).firstMatch(message);
    if (match == null) return null;

    final word = match.group(1);
    if (word == null) return null;
    if (!_reservedAliasWords.contains(word.toLowerCase())) return null;

    return '$message — "$word" is a reserved SQLite keyword; quote it as '
        '"$word" or rename the alias (e.g. "${word}_col").';
  }

  /// Parses the unknown column out of a `no such column: <ref>` error.
  ///
  /// Returns `(aliasPrefix, column)` where `aliasPrefix` is the table/alias
  /// qualifier before the dot (null for a bare column), or null when the
  /// message is not a `no such column` error. Surrounding quotes/backticks on
  /// the reference are stripped.
  static (String?, String)? _parseUnknownColumnRef(String message) {
    // Capture up to the comma SQLite appends (", SQL logic error ...") or EOL.
    final match = RegExp(
      r'no such column:\s*([^,]+)',
      caseSensitive: false,
    ).firstMatch(message);
    if (match == null) return null;

    var ref = match.group(1)?.trim() ?? '';
    ref = _stripIdentifierQuotes(ref);
    if (ref.isEmpty) return null;

    final dot = ref.lastIndexOf('.');
    if (dot < 0) return (null, ref);

    final prefix = _stripIdentifierQuotes(ref.substring(0, dot));
    final column = _stripIdentifierQuotes(ref.substring(dot + 1));
    if (column.isEmpty) return null;
    return (prefix.isEmpty ? null : prefix, column);
  }

  /// Builds an `alias-or-table (lowercased) -> real table name` map from the
  /// query's FROM/JOIN clauses. The table name maps to itself so an unaliased
  /// reference (`contacts.col`) resolves too. Tokens that are SQL keywords are
  /// not treated as aliases (`FROM contacts LEFT JOIN ...` — `LEFT` is not an
  /// alias of `contacts`).
  static Map<String, String> _parseFromJoinTables(String sql) {
    final result = <String, String>{};

    // FROM/JOIN <table> [AS] [<alias>]. Table and alias are simple identifiers,
    // optionally double-quoted. Anything more exotic (subquery, function) does
    // not match its inner name and is skipped — acceptable for a hint.
    final pattern = RegExp(
      r'\b(?:FROM|JOIN)\s+"?([A-Za-z_][\w]*)"?(?:\s+(?:AS\s+)?"?([A-Za-z_]\w*)"?)?',
      caseSensitive: false,
    );

    for (final match in pattern.allMatches(sql)) {
      final table = match.group(1);
      if (table == null || table.isEmpty) continue;
      result[table.toLowerCase()] = table;

      final alias = match.group(2);
      if (alias == null || alias.isEmpty) continue;
      // A clause keyword captured where an alias would sit is not an alias.
      if (_reservedAliasWords.contains(alias.toLowerCase()) ||
          _joinClauseKeywords.contains(alias.toLowerCase())) {
        continue;
      }
      result[alias.toLowerCase()] = table;
    }

    return result;
  }

  /// Keywords that can immediately follow a table name and must not be mistaken
  /// for its alias (`FROM a LEFT JOIN b`, `FROM a ON ...`).
  static const Set<String> _joinClauseKeywords = <String>{
    'left',
    'right',
    'inner',
    'outer',
    'cross',
    'natural',
    'full',
    'on',
  };

  /// Strips one layer of surrounding `"..."`, `` `...` ``, or `[...]` identifier
  /// quoting SQLite may echo back around a name.
  static String _stripIdentifierQuotes(String value) {
    final v = value.trim();
    if (v.length < 2) return v;
    final first = v[0];
    final last = v[v.length - 1];
    if ((first == '"' && last == '"') ||
        (first == '`' && last == '`') ||
        (first == '[' && last == ']')) {
      return v.substring(1, v.length - 1);
    }
    return v;
  }

  /// Distance below which a nearest match is offered as a suggestion. Mirrors
  /// raw-sql-column-checker.ts: `max(3, ceil(len / 2))` — long names tolerate
  /// more edits (an acronym split adds several underscores) while short names
  /// stay strict to avoid noise.
  static int _suggestThreshold(String column) {
    final half = (column.length / 2).ceil();
    return half > 3 ? half : 3;
  }

  /// Returns the `(name, distance)` of the closest candidate to [target] by
  /// case-insensitive Levenshtein distance, or null when [candidates] is empty.
  static (String, int)? _closestMatch(String target, List<String> candidates) {
    if (candidates.isEmpty) return null;
    final lowerTarget = target.toLowerCase();
    String? bestName;
    var bestDistance = 1 << 30;
    for (final candidate in candidates) {
      final distance = _levenshtein(lowerTarget, candidate.toLowerCase());
      if (distance < bestDistance) {
        bestDistance = distance;
        bestName = candidate;
      }
    }
    if (bestName == null) return null;
    return (bestName, bestDistance);
  }

  /// Levenshtein edit distance with a single rolling row buffer (O(n) memory).
  /// Matches the extension's fuzzy-match.ts so suggestions agree across paths.
  static int _levenshtein(String a, String b) {
    if (a == b) return 0;
    if (a.isEmpty) return b.length;
    if (b.isEmpty) return a.length;

    // row[j] holds the distance from a[0..i] to b[0..j]; `diagonal` carries the
    // previous row's value at j-1 so one buffer serves both rows.
    final row = List<int>.generate(b.length + 1, (i) => i);

    for (var i = 1; i <= a.length; i++) {
      // Distance from a[0..i] to b[0..0]="" is i; that was row[0] before this
      // overwrite (i-1 from the prior iteration), so carry it as the diagonal.
      var diagonal = i - 1;
      // Base case: the first column of DP row i is i by definition.
      // ignore: avoid_accessing_collections_by_constant_index -- constant [0] is the algorithm's base case, not a loop-index mistake
      row[0] = i;
      for (var j = 1; j <= b.length; j++) {
        final above = row[j];
        final cost = a.codeUnitAt(i - 1) == b.codeUnitAt(j - 1) ? 0 : 1;
        final deletion = above + 1;
        final insertion = row[j - 1] + 1;
        final substitution = diagonal + cost;
        var min = deletion < insertion ? deletion : insertion;
        if (substitution < min) min = substitution;
        row[j] = min;
        diagonal = above;
      }
    }
    return row[b.length];
  }
}
