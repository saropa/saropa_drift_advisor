// Tests for Feature 72 — website multiple snapshots.
//
// Exercises the multi-snapshot surface end-to-end via the real DriftDebugServer:
// append-on-capture with optional labels, the new list endpoint, pairwise
// compare (from/to), per-id delete and rename, the oldest-first cap, and that
// the legacy single-snapshot endpoints still behave (latest / compare-vs-now).

import 'package:test/test.dart';

import 'package:saropa_drift_advisor/saropa_drift_advisor.dart';

import 'helpers/test_helpers.dart';

void main() {
  group('multi-snapshot HTTP', () {
    int? port;

    final mockQuery = mockQueryWithTables(
      tableColumns: {
        'items': [
          <String, dynamic>{'name': 'id', 'type': 'INTEGER', 'pk': 1},
          <String, dynamic>{'name': 'title', 'type': 'TEXT', 'pk': 0},
        ],
      },
      tableData: {
        'items': [
          <String, dynamic>{'id': 1, 'title': 'First'},
        ],
      },
    );

    Future<void> start() async {
      await DriftDebugServer.start(query: mockQuery, enabled: true, port: 0);
      port = DriftDebugServer.port;
    }

    tearDown(() async {
      await DriftDebugServer.stop();
      port = null;
    });

    test('POST appends and GET /api/snapshots lists all with labels', () async {
      await start();
      final a = await httpPost(
        port!,
        '/api/snapshot',
        json: {'label': 'alpha'},
      );
      final b = await httpPost(port!, '/api/snapshot', json: {'label': 'beta'});
      final c = await httpPost(port!, '/api/snapshot'); // unlabeled
      expect(a.status, 200);
      expect(b.status, 200);
      expect(c.status, 200);

      final list = await httpGet(port!, '/api/snapshots');
      expect(list.status, 200);
      final snaps = (list.body as Map)['snapshots'] as List;
      expect(snaps.length, 3);
      // Oldest-first order; labels round-trip; unlabeled stays null.
      expect((snaps[0] as Map)['label'], 'alpha');
      expect((snaps[1] as Map)['label'], 'beta');
      expect((snaps[2] as Map)['label'], isNull);
      expect((snaps[0] as Map)['tableCount'], 1);
    });

    test('GET /api/snapshot returns the most recent snapshot', () async {
      await start();
      await httpPost(port!, '/api/snapshot', json: {'label': 'old'});
      final newest = await httpPost(
        port!,
        '/api/snapshot',
        json: {'label': 'new'},
      );
      final newId = (newest.body as Map)['id'];

      final got = await httpGet(port!, '/api/snapshot');
      expect(got.status, 200);
      final snap = (got.body as Map)['snapshot'] as Map;
      expect(snap['id'], newId);
    });

    test('pairwise compare diffs two stored snapshots (from/to)', () async {
      await start();
      final a = await httpPost(port!, '/api/snapshot');
      final b = await httpPost(port!, '/api/snapshot');
      final fromId = (a.body as Map)['id'];
      final toId = (b.body as Map)['id'];

      final cmp = await httpGet(
        port!,
        '/api/snapshot/compare?from=$fromId&to=$toId',
      );
      expect(cmp.status, 200);
      final body = cmp.body as Map;
      expect(body['snapshotId'], fromId);
      expect(body['to'], toId); // target is the stored snapshot, not live
      expect(body['tables'], isA<List<dynamic>>());
    });

    test(
      'compare with no params still diffs latest vs live (back-compat)',
      () async {
        await start();
        await httpPost(port!, '/api/snapshot');
        final cmp = await httpGet(port!, '/api/snapshot/compare');
        expect(cmp.status, 200);
        // No `to` snapshot → compared against the live database.
        expect((cmp.body as Map)['to'], isNull);
      },
    );

    test('compare with an unknown to-id is rejected (400)', () async {
      await start();
      final a = await httpPost(port!, '/api/snapshot');
      final fromId = (a.body as Map)['id'];
      final cmp = await httpGet(
        port!,
        '/api/snapshot/compare?from=$fromId&to=does-not-exist',
      );
      expect(cmp.status, 400);
    });

    test(
      'DELETE /api/snapshot/{id} removes one; bare DELETE clears all',
      () async {
        await start();
        final a = await httpPost(port!, '/api/snapshot');
        await httpPost(port!, '/api/snapshot');
        final delId = (a.body as Map)['id'];

        final del = await httpDelete(port!, '/api/snapshot/$delId');
        expect(del.status, 200);
        var list = await httpGet(port!, '/api/snapshots');
        expect(((list.body as Map)['snapshots'] as List).length, 1);

        // Unknown id → 404.
        final del404 = await httpDelete(port!, '/api/snapshot/nope');
        expect(del404.status, 404);

        // Bare DELETE clears everything.
        final clear = await httpDelete(port!, '/api/snapshot');
        expect(clear.status, 200);
        list = await httpGet(port!, '/api/snapshots');
        expect(((list.body as Map)['snapshots'] as List).length, 0);
      },
    );

    test('PUT /api/snapshot/{id} renames the label', () async {
      await start();
      final a = await httpPost(
        port!,
        '/api/snapshot',
        json: {'label': 'before'},
      );
      final id = (a.body as Map)['id'];

      final put = await httpPut(
        port!,
        '/api/snapshot/$id',
        json: {'label': 'after'},
      );
      expect(put.status, 200);
      expect((put.body as Map)['label'], 'after');

      // The rename is reflected in the list.
      final list = await httpGet(port!, '/api/snapshots');
      final snaps = (list.body as Map)['snapshots'] as List;
      expect((snaps.first as Map)['label'], 'after');

      // Unknown id → 404.
      final put404 = await httpPut(
        port!,
        '/api/snapshot/missing',
        json: {'label': 'x'},
      );
      expect(put404.status, 404);
    });

    test('oldest snapshot is evicted past the cap', () async {
      await start();
      // Capture one more than the cap; the very first must be gone.
      String? firstId;
      for (var i = 0; i < DriftDebugServerSnapshotCap.max + 1; i++) {
        final r = await httpPost(
          port!,
          '/api/snapshot',
          json: {'label': 'n$i'},
        );
        firstId ??= (r.body as Map)['id'] as String;
      }
      final list = await httpGet(port!, '/api/snapshots');
      final snaps = (list.body as Map)['snapshots'] as List;
      expect(snaps.length, DriftDebugServerSnapshotCap.max);
      expect(snaps.any((s) => (s as Map)['id'] == firstId), isFalse);
    });
  });
}

/// Local mirror of [ServerContext.maxSnapshots] so the eviction test does not
/// depend on importing server internals; kept in sync with the server cap.
abstract final class DriftDebugServerSnapshotCap {
  static const int max = 20;
}
