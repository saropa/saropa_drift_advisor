// Best-effort table-name extraction for the Heartbeat / Watch screen
// (Feature 80). Split out of table_activity_tracker.dart so the tracker
// stays a pure in-memory store and this file owns the lexical scan; the
// tracker re-exposes [TableNameExtractor.extractTableNames] unchanged so
// existing call sites keep compiling.

/// Extracts the table names a SQL statement references, best-effort.
///
/// The SQL is first masked with the same single-pass lexical approach as
/// sql_validator.dart (comments -> space, string literals -> `?`) so a
/// literal like `'order FROM users'` can never produce a false match.
/// Quoted identifiers (`"t"`, `` `t` ``, `[t]`) are UNQUOTED and kept when
/// their content is a plain identifier — unlike the validator, which masks
/// them, because here the identifier IS the answer. Non-plain quoted content
/// (spaces, embedded quotes) is masked to `?`: unattributable, not wrong.
/// SQLite internals (sqlite_master, sqlite_%) are excluded by the tracker's
/// record guard AND skipped here so callers never see them.
///
/// ACCEPTED LIMITS — this is a linear masked scan, NOT a SQL parser (plan 80
/// risk checklist: SQL the scan cannot attribute confidently records NOTHING
/// rather than something wrong). Known blind spots, all accepted:
///  - Only FROM / JOIN / INTO / UPDATE clause heads are scanned; exotic
///    references (INDEXED BY, table-valued functions, trigger bodies) are
///    not attributed.
///  - CTE names are collected from the `name [(cols)] AS (` definition shape
///    anywhere in the statement, not by walking the WITH prologue's grammar.
///    That deliberately also matches nested WITHs inside subqueries AND
///    window definitions (`WINDOW w AS (...)`) — both harmless to exclude,
///    since neither is ever a base-table reference.
///  - A real table sharing a name with a CTE in the same statement is
///    excluded; SQLite resolves that name to the CTE anyway, so exclusion
///    matches engine behavior.
///  - Derived tables (`FROM (SELECT ...)` ) yield no name: `(` is not an
///    identifier and the alias after `AS` is never captured.
///  - Multi-statement text is scanned as one string and names are merged
///    (the server's validators keep real traffic single-statement).
abstract final class TableNameExtractor {
  /// Identifiers captured after these clause keywords. FROM/JOIN attribute
  /// reads; INTO/UPDATE attribute the write fallback path (DELETE lands on
  /// FROM). An optional `schema.` qualifier (`main.items`, also the spaced
  /// form the masker produces for quoted parts) is consumed so the TABLE is
  /// captured — without it `FROM main.items` recorded the schema name "main"
  /// as if it were a table.
  static final RegExp _tableRefPattern = RegExp(
    r'\b(?:from|join|into|update)\s+'
    r'(?:[A-Za-z_][A-Za-z0-9_$]*\s*\.\s*)?' // schema qualifier, dropped
    r'([A-Za-z_][A-Za-z0-9_$]*)',
    caseSensitive: false,
  );

  /// Words a clause keyword can legally be followed by that are NOT table
  /// names (e.g. `UPDATE OR ABORT t` captures `OR`; `FROM (SELECT...)` never
  /// matches). Skipping them keeps a wrong name off the board — recording
  /// nothing is the accepted failure mode, recording a fake table is not.
  static const Set<String> _extractionStopWords = <String>{
    'select', 'from', 'join', 'into', 'update', 'where', 'set', 'values',
    'or', 'and', 'not', 'on', 'as', 'exists', 'if', // clause connectors
  };

  /// The CTE definition shape `name [(col, ...)] AS (` over MASKED text.
  /// Matched anywhere (see class doc): after masking, the only SQL constructs
  /// with this shape are CTE and window definitions, and excluding either
  /// from table attribution is correct. The column list allows no nested
  /// parens — a CTE column list is a flat identifier list, so `[^()]*` is
  /// exact, and refusing nesting keeps the regex from swallowing the body.
  static final RegExp _cteDefinitionPattern = RegExp(
    r'\b([A-Za-z_][A-Za-z0-9_$]*)\s*(?:\([^()]*\))?\s+as\s*\(',
    caseSensitive: false,
  );

  /// Cheap gate for [_collectCteNames]: a bare `with` word token. Runs on
  /// masked text, so `with` inside a string literal can never trigger it.
  static final RegExp _withKeyword = RegExp(r'\bwith\b', caseSensitive: false);

  /// Extracts the table names referenced by [sql], best-effort (class doc
  /// states the masking rules and the accepted limits).
  static Set<String> extractTableNames(String sql) {
    final masked = _maskForExtraction(sql);
    // CTE aliases must never be recorded as tables: in
    // `WITH cte AS (SELECT ... FROM real_table) SELECT * FROM cte`, the
    // trailing `FROM cte` matches the table pattern but names a query, not a
    // table. Real tables INSIDE the CTE bodies still match normally because
    // the whole masked string is scanned — only the alias names are dropped.
    final cteNames = _collectCteNames(masked);
    final names = <String>{};
    for (final match in _tableRefPattern.allMatches(masked)) {
      final name = match.group(1);
      if (name == null || name.isEmpty) continue;
      final lower = name.toLowerCase();
      if (_extractionStopWords.contains(lower)) continue;
      if (lower.startsWith('sqlite_')) continue;
      // Case-insensitive on purpose: SQLite identifier resolution is
      // case-insensitive for ASCII, so `FROM CTE` resolves to `WITH cte`.
      if (cteNames.contains(lower)) continue;
      names.add(name);
    }
    return names;
  }

  /// Lowercased CTE (and window-definition) names found in [masked], or an
  /// empty set when no `with` keyword is present — the gate keeps the common
  /// non-CTE path to one word scan instead of a definition-shape scan.
  static Set<String> _collectCteNames(String masked) {
    if (!_withKeyword.hasMatch(masked)) {
      return const <String>{};
    }
    return <String>{
      for (final match in _cteDefinitionPattern.allMatches(masked))
        if (match.group(1) != null) match.group(1)!.toLowerCase(),
    };
  }

  /// Plain-identifier shape a quoted identifier must match to be kept
  /// unquoted (anything else is masked — see [extractTableNames]).
  static final RegExp _plainIdentifier = RegExp(r'^[A-Za-z_][A-Za-z0-9_$]*$');

  /// Single left-to-right lexical pass mirroring the validator's
  /// `_maskCommentsAndLiterals` state machine (a comment is only entered
  /// outside a string and vice versa, so the pass cannot desynchronize).
  /// Differences from the validator, both deliberate: quoted IDENTIFIERS are
  /// unquoted (kept) when plain, and this masker is a private copy rather
  /// than a shared extraction — the validator is a security boundary and must
  /// not gain a "keep identifier content" mode that could weaken it.
  static String _maskForExtraction(String sql) {
    final buf = StringBuffer();
    final n = sql.length;
    var i = 0;

    // Consumes a quoted identifier run starting past the opening quote; the
    // closing char is [close] with doubled-[close] escapes. Returns the index
    // after the run and writes the unquoted content (or `?`) to [buf].
    int consumeQuotedIdent(int start, String close) {
      var j = start;
      final content = StringBuffer();
      while (j < n) {
        if (sql[j] == close) {
          if (j + 1 < n && sql[j + 1] == close) {
            content.write(close); // escaped quote stays in content
            j += 2;
            continue;
          }
          j++; // closing quote
          break;
        }
        content.write(sql[j]);
        j++;
      }
      final ident = content.toString();
      // Surrounding spaces keep the identifier a separate word token.
      buf.write(_plainIdentifier.hasMatch(ident) ? ' $ident ' : '?');
      return j;
    }

    while (i < n) {
      final c = sql[i];

      // Line comment `-- ...` -> one space.
      if (c == '-' && i + 1 < n && sql[i + 1] == '-') {
        i += 2;
        while (i < n && sql[i] != '\n') {
          i++;
        }
        buf.write(' ');
        continue;
      }

      // Block comment `/* ... */` -> one space (unterminated runs to end).
      if (c == '/' && i + 1 < n && sql[i + 1] == '*') {
        i += 2;
        while (i < n && !(sql[i] == '*' && i + 1 < n && sql[i + 1] == '/')) {
          i++;
        }
        i += 2;
        if (i > n) i = n;
        buf.write(' ');
        continue;
      }

      // String literal with '' escape -> `?` (never a table name).
      if (c == "'") {
        i++;
        while (i < n) {
          if (sql[i] == "'") {
            if (i + 1 < n && sql[i + 1] == "'") {
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

      // Quoted identifiers: keep plain content, mask the rest.
      if (c == '"' || c == '`') {
        i = consumeQuotedIdent(i + 1, c);
        continue;
      }

      // Bracket identifier `[ ... ]` (no escape in SQLite; first `]` closes).
      if (c == '[') {
        var j = i + 1;
        while (j < n && sql[j] != ']') {
          j++;
        }
        final ident = sql.substring(i + 1, j);
        if (j < n) j++; // skip closing ]
        buf.write(_plainIdentifier.hasMatch(ident) ? ' $ident ' : '?');
        i = j;
        continue;
      }

      buf.write(c);
      i++;
    }
    return buf.toString();
  }
}
