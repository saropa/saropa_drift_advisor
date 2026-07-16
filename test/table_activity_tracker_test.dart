// Tests for the Heartbeat / Watch screen server half (Feature 80, phase 1):
//   - TableActivityTracker aggregates, generation monotonicity, and the
//     200-entry ListQueue recent-event ring (O(1) eviction).
//   - Best-effort table-name extraction over masked SQL (string literals and
//     comments can never produce a false match; unattributable SQL records
//     NOTHING rather than something wrong).
//   - Feed points: timedQuery records reads for non-internal queries only
//     (the load-bearing rule — the board must not glow from watching itself),
//     checkDataChange diffs row counts into hostChange events with zero extra
//     queries, and the wrapped writeQuery path records writes.
//   - GET /api/activity: payload shape, omitted-field rules, ?since=
//     filtering, self-exclusion (polling bumps nothing), and the structured
//     403 while the global kill switch is engaged.

import 'dart:io';

import 'package:test/test.dart';

import 'package:saropa_drift_advisor/saropa_drift_advisor.dart';
import 'package:saropa_drift_advisor/src/server/mutation_tracker.dart';
import 'package:saropa_drift_advisor/src/server/server_constants.dart';
import 'package:saropa_drift_advisor/src/server/server_context.dart';
import 'package:saropa_drift_advisor/src/server/table_activity_tracker.dart';

import 'helpers/test_helpers.dart';

void main() {
  group('TableActivityTracker unit', () {
    test('counters increment per kind and generation is monotonic', () {
      final tracker = TableActivityTracker();
      expect(tracker.activityGeneration, 0);

      tracker.recordRead('items');
      tracker.recordRead('items');
      tracker.recordWrite('items');
      tracker.recordHostChange('users');

      expect(tracker.activityGeneration, 4);

      final json = tracker.toJson();
      final tables = json[ServerConstants.jsonKeyTables] as List<dynamic>;
      expect(tables, hasLength(2));

      final items =
          tables.firstWhere(
                (dynamic t) =>
                    (t as Map<String, dynamic>)[ServerConstants.jsonKeyTable] ==
                    'items',
              )
              as Map<String, dynamic>;
      expect(items[ServerConstants.jsonKeyReads], 2);
      expect(items[ServerConstants.jsonKeyWrites], 1);
      expect(items[ServerConstants.jsonKeyHostChanges], 0);

      // Generation must never decrease and bumps exactly once per event.
      final gens = [
        for (final e in tracker.eventsSince(0)) (e.toJson())['gen'] as int,
      ];
      expect(gens, [1, 2, 3, 4]);
    });

    test('sqlite internals and empty names record nothing', () {
      final tracker = TableActivityTracker();
      tracker.recordRead('sqlite_master');
      tracker.recordWrite('sqlite_sequence');
      tracker.recordHostChange('');
      expect(tracker.activityGeneration, 0);
      expect(
        tracker.toJson()[ServerConstants.jsonKeyTables] as List<dynamic>,
        isEmpty,
      );
    });

    test('eventsSince filters gen > since, oldest first', () {
      final tracker = TableActivityTracker();
      tracker.recordRead('a');
      tracker.recordRead('b');
      tracker.recordWrite('c');

      final since2 = tracker.eventsSince(2);
      expect(since2, hasLength(1));
      final only = since2.firstOrNull;
      expect(only?.table, 'c');
      expect(only?.gen, 3);

      // since >= current generation yields nothing.
      expect(tracker.eventsSince(3), isEmpty);
    });

    test('recent-event ring evicts the oldest entries past the 200 cap '
        'while aggregates keep counting', () {
      final tracker = TableActivityTracker();
      const overflow = 5;
      const total = TableActivityTracker.maxRecentEvents + overflow;
      for (var i = 0; i < total; i++) {
        tracker.recordRead('items');
      }

      final events = tracker.eventsSince(0);
      expect(events, hasLength(TableActivityTracker.maxRecentEvents));
      // Oldest surviving event is the (overflow+1)-th recorded one — the
      // first `overflow` were evicted from the front, never the back.
      expect(events.firstOrNull?.gen, overflow + 1);
      expect(events.lastOrNull?.gen, total);
      // Aggregates are NOT capped by the ring: every event still counted.
      final tables =
          tracker.toJson()[ServerConstants.jsonKeyTables] as List<dynamic>;
      expect(
        (tables.firstOrNull
            as Map<String, dynamic>?)?[ServerConstants.jsonKeyReads],
        total,
      );
    });

    test('toJson omits unknown rowCount and never-seen timestamps', () {
      final tracker = TableActivityTracker();
      tracker.recordRead('items');

      // No rowCounts supplied -> rowCount omitted entirely (not null).
      final noCounts = tracker.toJson();
      final entry =
          (noCounts[ServerConstants.jsonKeyTables] as List<dynamic>).firstOrNull
              as Map<String, dynamic>?;
      expect(entry, isNotNull);
      expect(entry?.containsKey(ServerConstants.jsonKeyRowCount), isFalse);
      expect(entry?.containsKey(ServerConstants.jsonKeyLastReadAt), isTrue);
      // Never written / never host-changed -> those timestamps are omitted.
      expect(entry?.containsKey(ServerConstants.jsonKeyLastWriteAt), isFalse);
      expect(
        entry?.containsKey(ServerConstants.jsonKeyLastHostChangeAt),
        isFalse,
      );

      // rowCounts covering the table -> rowCount present.
      final withCounts = tracker.toJson(rowCounts: <String, int>{'items': 7});
      final entry2 =
          (withCounts[ServerConstants.jsonKeyTables] as List<dynamic>)
                  .firstOrNull
              as Map<String, dynamic>?;
      expect(entry2?[ServerConstants.jsonKeyRowCount], 7);
    });
  });

  group('extractTableNames (best-effort, masked SQL)', () {
    test('finds FROM and JOIN identifiers, plain and quoted', () {
      expect(
        TableActivityTracker.extractTableNames(
          'SELECT * FROM items JOIN "users" u ON u.id = items.uid '
          'LEFT JOIN `orders` o ON o.uid = u.id',
        ),
        {'items', 'users', 'orders'},
      );
      expect(TableActivityTracker.extractTableNames('SELECT * FROM [labels]'), {
        'labels',
      });
    });

    test('DML verbs attribute writes (fallback path)', () {
      expect(
        TableActivityTracker.extractTableNames(
          "INSERT INTO items (id) VALUES (1)",
        ),
        {'items'},
      );
      expect(TableActivityTracker.extractTableNames('UPDATE users SET n = 1'), {
        'users',
      });
      expect(
        TableActivityTracker.extractTableNames('DELETE FROM orders WHERE 1'),
        {'orders'},
      );
    });

    test('string literals and comments can never produce a match', () {
      expect(
        TableActivityTracker.extractTableNames(
          "SELECT 'x FROM fake_literal' AS s",
        ),
        isEmpty,
      );
      expect(
        TableActivityTracker.extractTableNames(
          'SELECT 1 -- FROM fake_comment\n',
        ),
        isEmpty,
      );
      expect(
        TableActivityTracker.extractTableNames(
          'SELECT 1 /* FROM fake_block */',
        ),
        isEmpty,
      );
    });

    test('unattributable SQL records nothing rather than something wrong', () {
      // No table reference at all.
      expect(TableActivityTracker.extractTableNames('SELECT 1'), isEmpty);
      // Conflict-clause keyword after UPDATE would capture 'OR' — the
      // stop-word guard drops it instead of inventing a table named OR.
      expect(
        TableActivityTracker.extractTableNames(
          'UPDATE OR ABORT items SET n = 1',
        ),
        isEmpty,
      );
      // Quoted identifier that is not a plain identifier (space) is masked.
      expect(
        TableActivityTracker.extractTableNames('SELECT * FROM "my table"'),
        isEmpty,
      );
      // Subquery parenthesis is not an identifier.
      expect(
        TableActivityTracker.extractTableNames(
          'SELECT * FROM (SELECT 1) AS sub',
        ),
        isEmpty,
      );
    });

    test('sqlite internals are excluded', () {
      expect(
        TableActivityTracker.extractTableNames('SELECT * FROM sqlite_master'),
        isEmpty,
      );
      expect(
        TableActivityTracker.extractTableNames(
          'SELECT * FROM sqlite_sequence JOIN items ON 1',
        ),
        {'items'},
      );
    });
  });

  group('ServerContext feed points', () {
    test('timedQuery records a read for a non-internal query', () async {
      final ctx = ServerContext(
        query: (_) async => [
          <String, dynamic>{'id': 1},
        ],
      );

      await ctx.timedQuery('SELECT * FROM items');

      expect(ctx.tableActivity.activityGeneration, 1);
      final events = ctx.tableActivity.eventsSince(0);
      expect(events.firstOrNull?.table, 'items');
      expect(events.firstOrNull?.kind, TableActivityKind.read);
    });

    test('internal queries record NOTHING (load-bearing rule)', () async {
      final ctx = ServerContext(query: (_) async => <Map<String, dynamic>>[]);

      // The change-detection sweep, extension probes, and the heartbeat
      // screen's own polling all go through the internal path — if any of
      // them recorded activity the board would glow from watching itself.
      await ctx.internalQuery('SELECT * FROM items');
      await ctx.timedQuery('SELECT * FROM users', isInternal: true);

      expect(ctx.tableActivity.activityGeneration, 0);
    });

    test('kill switch: timedQuery records no activity', () async {
      final ctx = ServerContext(
        query: (_) async => <Map<String, dynamic>>[],
        monitoringEnabled: false,
      );

      await ctx.timedQuery('SELECT * FROM items');

      expect(ctx.tableActivity.activityGeneration, 0);
    });

    test('checkDataChange records hostChange for moved counts only '
        '(up, down, new table; first cycle is baseline)', () async {
      // Mutable canned results the mock returns for the sweep queries.
      var countRows = <Map<String, dynamic>>[
        <String, dynamic>{'t': 'items', 'c': 1},
        <String, dynamic>{'t': 'users', 'c': 2},
      ];
      final ctx = ServerContext(
        query: (String sql) async {
          if (sql.contains("type IN ('table','view')")) {
            return <Map<String, dynamic>>[
              <String, dynamic>{'name': 'items'},
              <String, dynamic>{'name': 'orders'},
              <String, dynamic>{'name': 'users'},
            ];
          }
          if (sql.contains('UNION ALL') || sql.contains('COUNT(*)')) {
            return countRows;
          }
          return <Map<String, dynamic>>[];
        },
      );

      // Cycle 1: baseline only — nothing may light up on startup.
      await ctx.checkDataChange();
      expect(ctx.tableActivity.activityGeneration, 0);

      // Cycle 2: items up 1->3, users unchanged, orders appears (absent
      // from cycle 1's counts -> counted as changed).
      countRows = <Map<String, dynamic>>[
        <String, dynamic>{'t': 'items', 'c': 3},
        <String, dynamic>{'t': 'users', 'c': 2},
        <String, dynamic>{'t': 'orders', 'c': 5},
      ];
      await ctx.checkDataChange();

      var events = ctx.tableActivity.eventsSince(0);
      expect({for (final e in events) e.table}, {'items', 'orders'});
      expect(
        events.every((e) => e.kind == TableActivityKind.hostChange),
        isTrue,
      );

      // Cycle 3: items down 3->0 records again; others unchanged.
      final genBefore = ctx.tableActivity.activityGeneration;
      countRows = <Map<String, dynamic>>[
        <String, dynamic>{'t': 'items', 'c': 0},
        <String, dynamic>{'t': 'users', 'c': 2},
        <String, dynamic>{'t': 'orders', 'c': 5},
      ];
      await ctx.checkDataChange();

      events = ctx.tableActivity.eventsSince(genBefore);
      expect(events, hasLength(1));
      expect(events.firstOrNull?.table, 'items');
      expect(events.firstOrNull?.kind, TableActivityKind.hostChange);
    });
  });

  group('GET /api/activity over HTTP', () {
    int? port;
    Directory? discoveryDir;

    Future<void> startServer({
      bool monitoringEnabled = true,
      DriftDebugWriteQuery? writeQuery,
    }) async {
      discoveryDir = await Directory.systemTemp.createTemp('sda_activity_');
      await DriftDebugServer.start(
        query: (sql) async => [
          <String, dynamic>{'id': 1},
        ],
        port: 0,
        monitoringEnabled: monitoringEnabled,
        writeQuery: writeQuery,
        // Isolated manifest dir: the home default is shared process-wide and
        // parallel suites would clobber each other's server.json.
        discoveryDirectory: discoveryDir!.path,
      );
      port = DriftDebugServer.port;
    }

    tearDown(() async {
      await DriftDebugServer.stop();
      port = null;
      final dir = discoveryDir;
      discoveryDir = null;
      if (dir != null && await dir.exists()) {
        await dir.delete(recursive: true);
      }
    });

    test('payload shape after an advisor read; polling itself records '
        'nothing', () async {
      await startServer();

      final sql = await httpPost(
        port!,
        '/api/sql',
        json: <String, dynamic>{'sql': 'SELECT id FROM items'},
      );
      expect(sql.status, HttpStatus.ok);

      final first = await httpGet(port!, '/api/activity');
      expect(first.status, HttpStatus.ok);
      final body = first.body as Map<String, dynamic>;
      final gen = body[ServerConstants.jsonKeyActivityGeneration] as int;
      expect(gen, greaterThanOrEqualTo(1));

      final tables = body[ServerConstants.jsonKeyTables] as List<dynamic>;
      final items = tables.firstOrNull as Map<String, dynamic>?;
      expect(items?[ServerConstants.jsonKeyTable], 'items');
      expect(items?[ServerConstants.jsonKeyReads], greaterThanOrEqualTo(1));
      // No change-detection cycle has run -> rowCount unknown -> omitted.
      expect(items?.containsKey(ServerConstants.jsonKeyRowCount), isFalse);
      expect(items?.containsKey(ServerConstants.jsonKeyLastReadAt), isTrue);
      expect(items?.containsKey(ServerConstants.jsonKeyLastWriteAt), isFalse);

      final events = body[ServerConstants.jsonKeyRecentEvents] as List<dynamic>;
      final event = events.firstOrNull as Map<String, dynamic>?;
      expect(event?[ServerConstants.jsonKeyTable], 'items');
      expect(event?[ServerConstants.jsonKeyKind], 'read');
      expect(event?[ServerConstants.jsonKeyGen], isA<int>());
      expect(event?[ServerConstants.jsonKeyAt], isA<String>());

      // Self-exclusion: the endpoint reads in-memory state only, so polling
      // it repeatedly must not bump the generation (no self-glow loop).
      final second = await httpGet(port!, '/api/activity');
      expect(
        (second.body
            as Map<String, dynamic>)[ServerConstants.jsonKeyActivityGeneration],
        gen,
      );
    });

    test('?since= filters recentEvents to gen > N', () async {
      await startServer();

      await httpPost(
        port!,
        '/api/sql',
        json: <String, dynamic>{'sql': 'SELECT id FROM alpha'},
      );
      final mid = await httpGet(port!, '/api/activity');
      final midGen =
          (mid.body as Map<String, dynamic>)[ServerConstants
                  .jsonKeyActivityGeneration]
              as int;

      await httpPost(
        port!,
        '/api/sql',
        json: <String, dynamic>{'sql': 'SELECT id FROM beta'},
      );

      final filtered = await httpGet(port!, '/api/activity?since=$midGen');
      final events =
          (filtered.body
                  as Map<String, dynamic>)[ServerConstants.jsonKeyRecentEvents]
              as List<dynamic>;
      expect(events, isNotEmpty);
      for (final e in events) {
        expect(
          (e as Map<String, dynamic>)[ServerConstants.jsonKeyGen] as int,
          greaterThan(midGen),
        );
        expect(e[ServerConstants.jsonKeyTable], 'beta');
      }
      // But the aggregate table list still carries BOTH touched tables —
      // since filters events only, never the counters.
      final tables =
          (filtered.body as Map<String, dynamic>)[ServerConstants.jsonKeyTables]
              as List<dynamic>;
      expect(
        {
          for (final t in tables)
            (t as Map<String, dynamic>)[ServerConstants.jsonKeyTable],
        },
        {'alpha', 'beta'},
      );
    });

    test('advisor write records a write for the inferred table', () async {
      await startServer(writeQuery: (_) async {});

      final apply = await httpPost(
        port!,
        '/api/edits/apply',
        json: <String, dynamic>{
          ServerConstants.jsonKeyStatements: <String>[
            "INSERT INTO items (id) VALUES (1)",
          ],
        },
      );
      expect(apply.status, HttpStatus.ok);

      final activity = await httpGet(port!, '/api/activity');
      final tables =
          (activity.body as Map<String, dynamic>)[ServerConstants.jsonKeyTables]
              as List<dynamic>;
      final items =
          tables.firstWhere(
                (dynamic t) =>
                    (t as Map<String, dynamic>)[ServerConstants.jsonKeyTable] ==
                    'items',
              )
              as Map<String, dynamic>;
      expect(items[ServerConstants.jsonKeyWrites], 1);
      expect(items.containsKey(ServerConstants.jsonKeyLastWriteAt), isTrue);
      // The BEGIN/COMMIT transaction framing around the batch must not be
      // attributed to any table (unattributable SQL records nothing).
      final events =
          (activity.body
                  as Map<String, dynamic>)[ServerConstants.jsonKeyRecentEvents]
              as List<dynamic>;
      final writeEvents = [
        for (final e in events)
          if ((e as Map<String, dynamic>)[ServerConstants.jsonKeyKind] ==
              'write')
            e,
      ];
      expect(writeEvents, hasLength(1));
      expect(writeEvents.firstOrNull?[ServerConstants.jsonKeyTable], 'items');
    });

    // Feature 22 tripwire (see the COUPLING WARNING in
    // drift_debug_server_io.dart): write attribution prefers MutationTracker
    // events; when the tracker produces NO event for a statement, the
    // fallback extraction must still record the write. These tests pin both
    // halves so a MutationTracker/eventsSince refactor that silently stops
    // emitting events fails HERE instead of silently killing write glow.
    group('write-path fallback safety net', () {
      // A DML quoting shape MutationTracker's inference regexes do not
      // match: they accept only `"table"` or a bare identifier after
      // INSERT INTO, so a backtick-quoted table falls through.
      const backtickInsert = 'INSERT INTO `items` (id) VALUES (1)';

      test('MutationTracker emits NO event for backtick-quoted DML '
          '(the premise the fallback exists for)', () async {
        final mutations = MutationTracker();
        var wrote = false;
        final snapshots = await mutations.captureFromWriteQuery(
          originalWrite: (_) async => wrote = true,
          readQuery: (_) async => <Map<String, dynamic>>[],
          sql: backtickInsert,
        );
        // Not recognized as tracked DML: no snapshots, no event appended —
        // but the write itself still executed.
        expect(snapshots, isNull);
        expect(mutations.latestId, 0);
        expect(mutations.eventsSince(0), isEmpty);
        expect(wrote, isTrue);
        // The extraction fallback DOES attribute it (masking unquotes the
        // backtick identifier), so the write path has a net to land in.
        expect(TableActivityTracker.extractTableNames(backtickInsert), {
          'items',
        });
      });

      test('write glow survives a statement MutationTracker misses '
          '(fallback extraction records the write)', () async {
        await startServer(writeQuery: (_) async {});

        final apply = await httpPost(
          port!,
          '/api/edits/apply',
          json: <String, dynamic>{
            ServerConstants.jsonKeyStatements: <String>[backtickInsert],
          },
        );
        expect(apply.status, HttpStatus.ok);

        final activity = await httpGet(port!, '/api/activity');
        final tables =
            (activity.body
                    as Map<String, dynamic>)[ServerConstants.jsonKeyTables]
                as List<dynamic>;
        final items =
            tables.firstWhere(
                  (dynamic t) =>
                      (t as Map<String, dynamic>)[ServerConstants
                          .jsonKeyTable] ==
                      'items',
                )
                as Map<String, dynamic>;
        // Attribution came from the fallback (the tracker emitted nothing
        // for this shape — pinned by the unit test above).
        expect(items[ServerConstants.jsonKeyWrites], 1);
        expect(items.containsKey(ServerConstants.jsonKeyLastWriteAt), isTrue);
      });
    });

    test('kill switch: 403 with the shared structured error', () async {
      await startServer(monitoringEnabled: false);

      final r = await httpGet(port!, '/api/activity');

      expect(r.status, HttpStatus.forbidden);
      expect(
        (r.body as Map<String, dynamic>)[ServerConstants.jsonKeyError],
        ServerConstants.errorMonitoringDisabled,
      );
    });
  });
}
