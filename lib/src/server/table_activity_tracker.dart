// In-memory table-activity store for the Heartbeat / Watch screen
// (Feature 80, phase 1). Fed by the three existing signals only:
// advisor reads (ServerContext.timedQuery), advisor writes (the wrapped
// writeQuery path), and host-change row-count diffs (checkDataChange).
// It never issues queries itself — GET /api/activity is a pure in-memory
// read, so the screen's own polling cannot generate DB traffic.

import 'dart:collection';

import 'host_statement_capture.dart';
import 'server_constants.dart';
import 'table_name_extractor.dart';

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
  /// Capture always starts DISARMED: it is a session-scoped observation tool
  /// the heartbeat screen arms explicitly, never persisted state and never a
  /// start() parameter — a fresh construction must never leave the host's
  /// per-query hook hot. [nowMs] is an injectable clock (defaults to wall
  /// clock) so the lease-expiry test can advance time instead of sleeping
  /// out the real 5 s window.
  // ignore: avoid_non_empty_constructor_bodies -- the capture module is fed this tracker's own recordRead/recordWrite (instance methods, i.e. `this`), which an initializer list cannot reference; the body is the only place this wiring can live
  TableActivityTracker({int Function()? nowMs}) {
    // The capture state machine (arm/lease/classification/statement rings)
    // lives in host_statement_capture.dart to keep this file near the
    // ~300-line guideline; it feeds back through recordRead/recordWrite so
    // captured host statements bump the same generation, event ring, and
    // aggregates as advisor traffic.
    _capture = HostStatementCapture(
      nowMs: nowMs ?? _wallNowMs,
      recordRead: recordRead,
      recordWrite: recordWrite,
    );
  }

  static int _wallNowMs() => DateTime.now().millisecondsSinceEpoch;

  /// Recent-event ring cap. Sized so a client polling every ~750 ms can miss
  /// several polls under burst traffic and still see every pulse.
  static const int maxRecentEvents = 200;

  late final HostStatementCapture _capture;

  /// Kill-switch probe, wired by ServerContext to `() => monitoringEnabled`.
  /// Forwarded to the capture state machine (which owns every use of it).
  bool Function()? get monitoringEnabledProbe =>
      _capture.monitoringEnabledProbe;
  set monitoringEnabledProbe(bool Function()? probe) =>
      _capture.monitoringEnabledProbe = probe;

  /// Whether host-statement capture is armed (and [recordHostStatement]
  /// therefore does real work). Surfaced in [toJson] as `captureArmed`.
  bool get captureArmed => _capture.armed;

  /// Arms host-statement capture and starts the lease window. Refused while
  /// monitoring is disabled (kill-switch precedence).
  void armCapture() => _capture.arm();

  /// Disarms host-statement capture immediately.
  void disarmCapture() => _capture.disarm();

  /// Renews the capture lease. Called by the GET /api/activity handler on
  /// every poll while armed — the poll IS the proof a heartbeat screen is
  /// alive and watching. No-op while disarmed (a poll never arms).
  void renewCaptureLease() => _capture.renewLease();

  /// Records a host-app statement reported via `reportActivity` (Feature 80,
  /// phase 2). SELECT/WITH → reads, INSERT/UPDATE/DELETE/REPLACE → writes,
  /// anything else (DDL, PRAGMA, BEGIN/COMMIT framing) records nothing —
  /// schema churn and transaction framing are not table traffic. Leading SQL
  /// comments are skipped before classification; recorded statements also
  /// land in the per-table statement-tap rings ([hostStatementsFor]).
  void recordHostStatement(String sql) {
    // Cheap bail FIRST: while disarmed this method costs one field read and
    // a branch — no parsing, no allocation. The host wires this into a
    // per-query hook, so the disarmed path is the permanent hot path.
    if (!_capture.armed) {
      return;
    }
    _capture.recordStatement(sql);
  }

  /// Captured host statements for [table], newest first ("statement tap").
  List<HostStatement> hostStatementsFor(String table) =>
      _capture.statementsFor(table);

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
      // Additive phase 2 field: lets the heartbeat screen keep its capture
      // toggle synced to the server truth on every poll (a lease can expire,
      // or another viewer can disarm, while the local toggle still shows on).
      ServerConstants.jsonKeyCaptureArmed: _capture.armed,
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

  /// Extracts the table names referenced by [sql], best-effort.
  ///
  /// Delegates to [TableNameExtractor.extractTableNames] — the scan (masking,
  /// clause patterns, CTE-alias exclusion, accepted limits) lives in
  /// table_name_extractor.dart. Kept here as a pass-through so the tracker's
  /// public API is unchanged by the file split and feed points keep one
  /// import for "record activity + name the tables".
  static Set<String> extractTableNames(String sql) =>
      TableNameExtractor.extractTableNames(sql);
}
