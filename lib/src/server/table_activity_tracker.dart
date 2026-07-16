// In-memory table-activity store for the Heartbeat / Watch screen
// (Feature 80, phase 1). Fed by the three existing signals only:
// advisor reads (ServerContext.timedQuery), advisor writes (the wrapped
// writeQuery path), and host-change row-count diffs (checkDataChange).
// It never issues queries itself — GET /api/activity is a pure in-memory
// read, so the screen's own polling cannot generate DB traffic.

import 'dart:collection';

import 'server_constants.dart';

/// What kind of table activity an event records.
///
/// `hostChange` is deliberately distinct from `write`: it is INFERRED from a
/// row-count delta between change-detection sweeps (the server never sees the
/// host app's statements in phase 1), so clients must label it "detected
/// change", never claim an observed write.
enum TableActivityKind { read, write, hostChange }

/// One recorded activity pulse, kept in the recent-event ring so a polling
/// client can render one glow per event instead of only counter deltas.
final class TableActivityEvent {
  const TableActivityEvent({
    required this.table,
    required this.kind,
    required this.at,
    required this.gen,
  });

  final String table;
  final TableActivityKind kind;
  final DateTime at;

  /// The [TableActivityTracker.activityGeneration] value stamped when this
  /// event was recorded. Monotonic, so `?since=N` filtering is an integer
  /// compare — no timestamp parsing or clock-skew concerns.
  final int gen;

  Map<String, dynamic> toJson() => <String, dynamic>{
    ServerConstants.jsonKeyTable: table,
    ServerConstants.jsonKeyKind: kind.name,
    ServerConstants.jsonKeyAt: at.toIso8601String(),
    ServerConstants.jsonKeyGen: gen,
  };
}

/// Mutable per-table aggregates. Private: consumers read the JSON shape from
/// [TableActivityTracker.toJson], not this object.
final class _TableActivityCounters {
  int reads = 0;
  int writes = 0;
  int hostChanges = 0;
  DateTime? lastReadAt;
  DateTime? lastWriteAt;
  DateTime? lastHostChangeAt;
}

/// Per-table activity aggregates + a bounded recent-event ring.
///
/// Memory contract (architecture §7): the aggregate map is bounded naturally
/// by the finite table count (aggregates, not events), and the event store is
/// a [ListQueue] ring capped at [maxRecentEvents] with O(1) eviction — never
/// `List.removeAt(0)`, which shifts every element per eviction on what is a
/// per-query hot path.
final class TableActivityTracker {
  /// Recent-event ring cap. Sized so a client polling every ~750 ms can miss
  /// several polls under burst traffic and still see every pulse.
  static const int maxRecentEvents = 200;

  final Map<String, _TableActivityCounters> _tables =
      <String, _TableActivityCounters>{};

  final ListQueue<TableActivityEvent> _recentEvents =
      ListQueue<TableActivityEvent>();

  int _activityGeneration = 0;

  /// Monotonic counter bumped on every recorded event, so clients can
  /// cheap-poll "anything new since N?" without diffing payloads.
  int get activityGeneration => _activityGeneration;

  /// Records an advisor-driven read of [table].
  void recordRead(String table) => _record(table, TableActivityKind.read);

  /// Records an advisor-driven write to [table].
  void recordWrite(String table) => _record(table, TableActivityKind.write);

  /// Records a host-app change DETECTED via a row-count delta (not an
  /// observed statement — see [TableActivityKind.hostChange]).
  void recordHostChange(String table) =>
      _record(table, TableActivityKind.hostChange);

  void _record(String table, TableActivityKind kind) {
    // SQLite internals must never light the board: sqlite_master lookups and
    // sqlite_% bookkeeping tables are server/engine traffic, not app data.
    // Guarded here (not only in extraction) so every feed point is covered.
    if (table.isEmpty || table.toLowerCase().startsWith('sqlite_')) {
      return;
    }

    final now = DateTime.now().toUtc();
    _activityGeneration++;

    final counters = _tables.putIfAbsent(table, _TableActivityCounters.new);
    switch (kind) {
      case TableActivityKind.read:
        counters.reads++;
        counters.lastReadAt = now;
      case TableActivityKind.write:
        counters.writes++;
        counters.lastWriteAt = now;
      case TableActivityKind.hostChange:
        counters.hostChanges++;
        counters.lastHostChangeAt = now;
    }

    _recentEvents.addLast(
      TableActivityEvent(
        table: table,
        kind: kind,
        at: now,
        gen: _activityGeneration,
      ),
    );
    while (_recentEvents.length > maxRecentEvents) {
      // Drop the oldest entry to keep the ring bounded; the value is not needed.
      // ignore: avoid_ignoring_return_values -- evicting the oldest entry; the removed value is intentionally discarded
      _recentEvents.removeFirst();
    }
  }

  /// Events with `gen > since`, oldest first (the ring is already
  /// oldest-first, so no sort is needed).
  List<TableActivityEvent> eventsSince(int since) => <TableActivityEvent>[
    for (final event in _recentEvents)
      if (event.gen > since) event,
  ];

  /// Builds the GET /api/activity payload.
  ///
  /// `tables` lists ONLY tables with at least one recorded event this session
  /// (untouched tables are never listed — the client seeds its card grid from
  /// /api/tables instead). Null/absent optional fields are OMITTED, never
  /// emitted as null, so clients can use plain `in`/`hasOwnProperty` checks.
  /// [rowCounts] comes from the change-detection cache — passing it here keeps
  /// this method (and the endpoint) free of any DB query.
  Map<String, dynamic> toJson({Map<String, int>? rowCounts, int since = 0}) {
    // Sorted for a deterministic payload (map insertion order would leak
    // first-touch order, which is meaningless to clients and unstable in tests).
    final names = _tables.keys.toList()..sort();
    return <String, dynamic>{
      ServerConstants.jsonKeyActivityGeneration: _activityGeneration,
      ServerConstants.jsonKeyTables: <Map<String, dynamic>>[
        for (final name in names) _tableJson(name, rowCounts),
      ],
      ServerConstants.jsonKeyRecentEvents: <Map<String, dynamic>>[
        for (final event in eventsSince(since)) event.toJson(),
      ],
    };
  }

  Map<String, dynamic> _tableJson(String name, Map<String, int>? rowCounts) {
    // Nullable-safe lookup: `names` comes from _tables.keys so the entry
    // exists, but a map read stays the safe accessor form regardless.
    final counters = _tables[name];
    final rowCount = rowCounts?[name];
    return <String, dynamic>{
      ServerConstants.jsonKeyTable: name,
      ServerConstants.jsonKeyReads: counters?.reads ?? 0,
      ServerConstants.jsonKeyWrites: counters?.writes ?? 0,
      ServerConstants.jsonKeyHostChanges: counters?.hostChanges ?? 0,
      if (rowCount != null) ServerConstants.jsonKeyRowCount: rowCount,
      if (counters?.lastReadAt != null)
        ServerConstants.jsonKeyLastReadAt: counters?.lastReadAt
            ?.toIso8601String(),
      if (counters?.lastWriteAt != null)
        ServerConstants.jsonKeyLastWriteAt: counters?.lastWriteAt
            ?.toIso8601String(),
      if (counters?.lastHostChangeAt != null)
        ServerConstants.jsonKeyLastHostChangeAt: counters?.lastHostChangeAt
            ?.toIso8601String(),
    };
  }

  // -------------------------------------------------
  // Best-effort table-name extraction
  // -------------------------------------------------

  /// Identifiers captured after these clause keywords. FROM/JOIN attribute
  /// reads; INTO/UPDATE attribute the write fallback path (DELETE lands on
  /// FROM). Best-effort by design: SQL this scan cannot attribute records
  /// NOTHING rather than something wrong (plan 80 risk checklist).
  static final RegExp _tableRefPattern = RegExp(
    r'\b(?:from|join|into|update)\s+([A-Za-z_][A-Za-z0-9_$]*)',
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

  /// Extracts the table names referenced by [sql], best-effort.
  ///
  /// The SQL is first masked with the same single-pass lexical approach as
  /// sql_validator.dart (comments -> space, string literals -> `?`) so a
  /// literal like `'order FROM users'` can never produce a false match.
  /// Quoted identifiers (`"t"`, `` `t` ``, `[t]`) are UNQUOTED and kept when
  /// their content is a plain identifier — unlike the validator, which masks
  /// them, because here the identifier IS the answer. Non-plain quoted content
  /// (spaces, embedded quotes) is masked to `?`: unattributable, not wrong.
  /// SQLite internals (sqlite_master, sqlite_%) are excluded.
  static Set<String> extractTableNames(String sql) {
    final masked = _maskForExtraction(sql);
    final names = <String>{};
    for (final match in _tableRefPattern.allMatches(masked)) {
      final name = match.group(1);
      if (name == null || name.isEmpty) continue;
      final lower = name.toLowerCase();
      if (_extractionStopWords.contains(lower)) continue;
      if (lower.startsWith('sqlite_')) continue;
      names.add(name);
    }
    return names;
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
