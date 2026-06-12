// Tests for snapshot persistence across server restart (Feature 72, Phase 4).
//
// Covers Snapshot JSON round-trip, the SnapshotStore file format (atomic write
// + graceful load), and ServerContext mirroring its in-memory list to disk and
// reloading it — the "survives a restart" behavior the original Phase 1-3 work
// deferred.

import 'dart:io';

import 'package:saropa_drift_advisor/src/server/server_context.dart';
import 'package:saropa_drift_advisor/src/server/server_types.dart';
import 'package:saropa_drift_advisor/src/server/snapshot_store.dart';
import 'package:test/test.dart';

/// A ServerContext wired to [path] with a no-op query (snapshot methods need no
/// database access — they operate purely on the in-memory list + the file).
ServerContext _ctx(String? path) => ServerContext(
  query: (String sql) async => <Map<String, dynamic>>[],
  snapshotStorePath: path,
);

Snapshot _snap(String id, {String? label}) => Snapshot(
  id: id,
  createdAt: DateTime.parse('2026-06-12T10:00:00.000Z'),
  tables: <String, List<Map<String, dynamic>>>{
    'users': <Map<String, dynamic>>[
      <String, dynamic>{'id': 1, 'name': 'Eve'},
    ],
  },
  label: label,
);

void main() {
  group('Snapshot JSON', () {
    test('round-trips through toJson/fromJson', () {
      final Snapshot s = _snap('s1', label: 'before migration');
      final Snapshot? back = Snapshot.fromJson(s.toJson());
      expect(back, isNotNull);
      expect(back!.id, 's1');
      expect(back.label, 'before migration');
      expect(back.createdAt, s.createdAt);
      expect(back.tables['users']!.first['name'], 'Eve');
    });

    test('omits label when null and restores it as null', () {
      final Map<String, dynamic> json = _snap('s2').toJson();
      expect(json.containsKey('label'), isFalse);
      expect(Snapshot.fromJson(json)!.label, isNull);
    });

    test('returns null for malformed entries', () {
      expect(Snapshot.fromJson(null), isNull);
      expect(Snapshot.fromJson('not a map'), isNull);
      expect(
        Snapshot.fromJson(<String, dynamic>{'id': 1}),
        isNull,
      ); // id not String
      expect(
        Snapshot.fromJson(<String, dynamic>{'id': 'x', 'createdAt': 'nope'}),
        isNull,
      );
    });
  });

  group('SnapshotStore', () {
    late Directory dir;
    setUp(() => dir = Directory.systemTemp.createTempSync('snap_store_test'));
    tearDown(() => dir.deleteSync(recursive: true));

    test('save then load round-trips the list', () async {
      final String path = '${dir.path}/snapshots.json';
      await SnapshotStore.save(path, <Snapshot>[
        _snap('a'),
        _snap('b', label: 'B'),
      ]);
      final List<Snapshot> loaded = await SnapshotStore.load(path);
      expect(loaded.map((s) => s.id), <String>['a', 'b']);
      expect(loaded[1].label, 'B');
    });

    test('load of a missing file returns empty (no throw)', () async {
      final List<Snapshot> loaded = await SnapshotStore.load(
        '${dir.path}/does-not-exist.json',
      );
      expect(loaded, isEmpty);
    });

    test(
      'load of a corrupt file returns empty and reports the error',
      () async {
        final String path = '${dir.path}/corrupt.json';
        File(path).writeAsStringSync('{ this is not json');
        Object? logged;
        final List<Snapshot> loaded = await SnapshotStore.load(
          path,
          onError: (Object e, StackTrace _) => logged = e,
        );
        expect(loaded, isEmpty);
        expect(logged, isNotNull); // error surfaced, not silently swallowed
      },
    );

    test(
      'load skips individually corrupt records but keeps valid ones',
      () async {
        final String path = '${dir.path}/mixed.json';
        // One good record, one malformed (no id) — only the good one survives.
        File(path).writeAsStringSync(
          '{"snapshots":[{"id":"good","createdAt":"2026-06-12T10:00:00.000Z","tables":{}},'
          '{"createdAt":"2026-06-12T10:00:00.000Z"}]}',
        );
        final List<Snapshot> loaded = await SnapshotStore.load(path);
        expect(loaded.map((s) => s.id), <String>['good']);
      },
    );
  });

  group('ServerContext persistence', () {
    late Directory dir;
    late String path;
    setUp(() {
      dir = Directory.systemTemp.createTempSync('snap_ctx_test');
      path = '${dir.path}/snapshots.json';
    });
    tearDown(() => dir.deleteSync(recursive: true));

    test(
      'snapshots survive a simulated restart (new context, same path)',
      () async {
        final ServerContext a = _ctx(path);
        a.addSnapshot(_snap('s1', label: 'first'));
        a.addSnapshot(_snap('s2'));
        await a.snapshotPersistenceSettled;

        // A fresh context (new process) loads what the previous one wrote.
        final ServerContext b = _ctx(path);
        await b.loadPersistedSnapshots();
        expect(b.snapshots.map((s) => s.id), <String>['s1', 's2']);
        expect(b.snapshots.first.label, 'first');
      },
    );

    test('delete and clear rewrite the persisted file', () async {
      final ServerContext a = _ctx(path);
      a.addSnapshot(_snap('s1'));
      a.addSnapshot(_snap('s2'));
      a.removeSnapshot('s1');
      await a.snapshotPersistenceSettled;
      expect((await SnapshotStore.load(path)).map((s) => s.id), <String>['s2']);

      a.clearSnapshots();
      await a.snapshotPersistenceSettled;
      expect(await SnapshotStore.load(path), isEmpty);
    });

    test('no path configured writes nothing and stays in memory', () async {
      final ServerContext a = _ctx(null);
      a.addSnapshot(_snap('s1'));
      await a.snapshotPersistenceSettled; // resolves immediately
      expect(a.snapshots.single.id, 's1');
      // Nothing was written anywhere; loadPersistedSnapshots is a no-op.
      await a.loadPersistedSnapshots();
      expect(a.snapshots.single.id, 's1');
    });

    test('loaded list is capped to maxSnapshots (keeps newest)', () async {
      // Write more than the cap directly, then load through a context.
      final List<Snapshot> many = <Snapshot>[
        for (int i = 0; i < ServerContext.maxSnapshots + 5; i++) _snap('s$i'),
      ];
      await SnapshotStore.save(path, many);
      final ServerContext a = _ctx(path);
      await a.loadPersistedSnapshots();
      expect(a.snapshots.length, ServerContext.maxSnapshots);
      // Newest (highest index) retained; oldest dropped.
      expect(a.snapshots.last.id, 's${ServerContext.maxSnapshots + 4}');
      expect(a.snapshots.first.id, 's5');
    });
  });
}
