// Host-statement capture state machine for the Heartbeat screen (Feature 80,
// phase 2) plus the per-table statement rings behind "statement tap".
//
// Split out of table_activity_tracker.dart to keep both files near the repo's
// ~300-line guideline: the tracker keeps the phase 1 aggregates/event ring and
// delegates every capture concern here. The tracker feeds this class its own
// recordRead/recordWrite so captured host statements light the board through
// the exact same paths as advisor traffic.

import 'dart:collection';

import 'server_constants.dart';
import 'table_name_extractor.dart';

/// One captured host statement, kept in a per-table ring so the heartbeat
/// screen's card flyout can show "what did the app just run against this
/// table". SQL is stored TRUNCATED ([ServerConstants.maxHostStatementSqlChars])
/// — the ring is a glanceable inspector, not a DVR; the full-fidelity capture
/// paths (DVR, mutation stream) already exist for forensic needs.
final class HostStatement {
  const HostStatement({
    required this.sql,
    required this.kind,
    required this.at,
  });

  final String sql;

  /// 'read' | 'write' — matches the recent-event `kind` names so clients
  /// reuse the same channel styling.
  final String kind;

  final DateTime at;

  Map<String, dynamic> toJson() => <String, dynamic>{
    ServerConstants.jsonKeySql: sql,
    ServerConstants.jsonKeyKind: kind,
    ServerConstants.jsonKeyAt: at.toIso8601String(),
  };
}

/// Arm/disarm + lease + classification + statement rings for host-reported
/// SQL. Single-isolate by design (no synchronization): Dart isolates do not
/// share memory, so `reportActivity` must be called from the isolate the
/// debug server runs in — forwarding from another isolate reaches a
/// different copy of this state and records nothing.
final class HostStatementCapture {
  /// [nowMs] is the tracker's injectable clock (tests advance it instead of
  /// sleeping out the lease window). [recordRead]/[recordWrite] are the
  /// tracker's own feed points, so captured statements bump the same
  /// generation/event ring as advisor traffic.
  HostStatementCapture({
    required int Function() nowMs,
    required void Function(String table) recordRead,
    required void Function(String table) recordWrite,
  }) : _nowMs = nowMs,
       _recordRead = recordRead,
       _recordWrite = recordWrite;

  final int Function() _nowMs;
  final void Function(String table) _recordRead;
  final void Function(String table) _recordWrite;

  /// Kill-switch probe, wired by ServerContext to `() => monitoringEnabled`.
  /// A late-bound getter (not a captured bool) because the kill switch flips
  /// at runtime; null (standalone tracker, e.g. unit tests) means enabled.
  bool Function()? monitoringEnabledProbe;

  bool _armed = false;

  /// Millisecond timestamp of the last arm/renewal; meaningless while
  /// disarmed. Compared (never scheduled) — the lease needs no timer.
  int _leaseRenewedAtMs = 0;

  // Per-second rate cap state: protects the HOST app's CPU from a pathological
  // write burst while armed — past the cap a statement is dropped before any
  // parsing/extraction happens. Capture is a visualization, not an audit, so
  // losing events past ~200/s is the accepted trade (comment also at the cap
  // constant in server_constants.dart).
  int _rateWindowStartMs = 0;
  int _recordedThisSecond = 0;

  /// Per-table rings of the most recent captured statements ("statement
  /// tap"). Bounded: finitely many tables × [ServerConstants
  /// .maxHostStatementsPerTable] entries × truncated SQL. A statement that
  /// touches several tables (a JOIN) appears in EACH table's ring — the ring
  /// answers "what ran against THIS table", so duplication across rings is
  /// the point, not a bug.
  final Map<String, ListQueue<HostStatement>> _statements =
      <String, ListQueue<HostStatement>>{};

  bool get armed => _armed;

  /// Arms capture and starts the lease window. Refuses while monitoring is
  /// disabled — the kill switch guarantees ZERO capture, so arming must not
  /// create a hook that goes hot the moment monitoring is re-enabled.
  void arm() {
    if (!(monitoringEnabledProbe?.call() ?? true)) {
      return;
    }
    _armed = true;
    _leaseRenewedAtMs = _nowMs();
  }

  void disarm() {
    _armed = false;
  }

  /// Renews the lease. Called on every GET /api/activity poll while armed —
  /// the poll IS the proof a heartbeat screen is alive and watching. No-op
  /// while disarmed (a poll never arms).
  void renewLease() {
    if (_armed) {
      _leaseRenewedAtMs = _nowMs();
    }
  }

  /// Statement head word after [_skipLeadingComments], used to classify.
  static final RegExp _statementHead = RegExp(r'^\s*([A-Za-z]+)');

  /// Returns the offset of the first non-comment, non-whitespace character.
  ///
  /// Drift-generated SQL is bare, but hand-written queries (and some ORMs)
  /// prefix statements with `/* tag */` or `-- note` comments; without this
  /// skip the head-word classifier would silently record nothing for them.
  /// Linear single pass, bounded by the string length — cheap enough for the
  /// armed path (the disarmed path never gets here).
  static int _skipLeadingComments(String sql) {
    var i = 0;
    final n = sql.length;
    while (i < n) {
      final c = sql.codeUnitAt(i);
      // Whitespace: space, tab, LF, CR.
      if (c == 0x20 || c == 0x09 || c == 0x0A || c == 0x0D) {
        i++;
        continue;
      }
      // Line comment: skip to end of line.
      if (c == 0x2D && i + 1 < n && sql.codeUnitAt(i + 1) == 0x2D) {
        final nl = sql.indexOf('\n', i + 2);
        if (nl < 0) return n;
        i = nl + 1;
        continue;
      }
      // Block comment: skip past the closing */ (unterminated = no head).
      if (c == 0x2F && i + 1 < n && sql.codeUnitAt(i + 1) == 0x2A) {
        final end = sql.indexOf('*/', i + 2);
        if (end < 0) return n;
        i = end + 2;
        continue;
      }
      break;
    }
    return i;
  }

  /// Records one host statement: classify, attribute, ring. See
  /// TableActivityTracker.recordHostStatement for the full contract; the
  /// disarmed cheap-bail happens BEFORE this call.
  void recordStatement(String sql) {
    // Kill-switch precedence: monitoring disabled force-disarms and records
    // nothing. (ServerContext.setMonitoring(false) also disarms eagerly;
    // this check covers a probe that flips without going through it.)
    if (!(monitoringEnabledProbe?.call() ?? true)) {
      _armed = false;
      return;
    }

    final now = _nowMs();

    // Lease compare: no poll within the window means no live heartbeat
    // screen, so a killed tab / dropped adb forward / crashed webview can
    // never leave this hook hot. Self-disarm keeps every later call on the
    // tracker's cheap bail until an explicit re-arm.
    if (now - _leaseRenewedAtMs > ServerConstants.activityCaptureLeaseMs) {
      _armed = false;
      return;
    }

    // Per-second rate cap, checked BEFORE any parsing so a burst costs the
    // host one subtraction + compare per dropped statement.
    if (now - _rateWindowStartMs >= 1000) {
      _rateWindowStartMs = now;
      _recordedThisSecond = 0;
    }
    if (_recordedThisSecond >= ServerConstants.maxHostStatementsPerSecond) {
      return;
    }

    final head = _statementHead
        .firstMatch(sql.substring(_skipLeadingComments(sql)))
        ?.group(1)
        ?.toLowerCase();
    if (head == null) {
      return;
    }
    final isRead = head == 'select' || head == 'with';
    final isWrite =
        head == 'insert' ||
        head == 'update' ||
        head == 'delete' ||
        head == 'replace';
    if (!isRead && !isWrite) {
      return;
    }

    final tables = TableNameExtractor.extractTableNames(sql);
    if (tables.isEmpty) {
      return;
    }
    _recordedThisSecond++;

    // Truncate ONCE per statement, shared across every table's ring entry.
    final stored = sql.length > ServerConstants.maxHostStatementSqlChars
        ? '${sql.substring(0, ServerConstants.maxHostStatementSqlChars)}…'
        : sql;
    final entry = HostStatement(
      sql: stored,
      kind: isRead ? 'read' : 'write',
      at: DateTime.now().toUtc(),
    );

    for (final table in tables) {
      isRead ? _recordRead(table) : _recordWrite(table);
      final ring = _statements.putIfAbsent(table, ListQueue<HostStatement>.new);
      ring.addLast(entry);
      while (ring.length > ServerConstants.maxHostStatementsPerTable) {
        // Bounded ring, O(1) eviction (architecture §7); value discarded.
        // ignore: avoid_ignoring_return_values -- evicting the oldest entry
        ring.removeFirst();
      }
    }
  }

  /// Captured statements for [table], newest first (the flyout reads top-down
  /// as "most recent first"). Empty list when the table has none.
  List<HostStatement> statementsFor(String table) {
    final ring = _statements[table];
    if (ring == null) {
      return const <HostStatement>[];
    }
    return ring.toList().reversed.toList();
  }
}
