// Unit tests for SnapshotHandler — snapshot CRUD and row-level diff.
//
// Since _addRowLevelDiff is private, we test through the server's
// HTTP endpoint (handleSnapshotCompare) using integration-style
// tests with DriftDebugServer (static singleton).

import 'package:saropa_drift_advisor/saropa_drift_advisor.dart';
import 'package:test/test.dart';

import 'helpers/test_helpers.dart';

void main() {
  group('SnapshotHandler', () {
    // Port assigned by the OS on each server start.
    int? serverPort;

    // Mutable row data so we can change it between snapshot
    // and compare to simulate DB modifications.
    List<Map<String, dynamic>> itemRows = [];

    Future<void> startServer({List<Map<String, dynamic>>? initialRows}) async {
      itemRows =
          initialRows ??
          [
            {'id': 1, 'title': 'Alpha'},
            {'id': 2, 'title': 'Beta'},
          ];

      await DriftDebugServer.start(
        query: (sql) async {
          // Table names.
          if (sql.contains("type='table'") && sql.contains('ORDER BY name')) {
            return [
              {'name': 'items'},
            ];
          }
          // Schema master (CREATE TABLE).
          if (sql.contains('ORDER BY type, name') &&
              sql.contains('sqlite_master')) {
            return [
              {
                'type': 'table',
                'name': 'items',
                'sql':
                    'CREATE TABLE items (id INTEGER PRIMARY KEY, '
                    'title TEXT)',
              },
            ];
          }
          // PRAGMA table_info — only return columns for the 'items' table.
          if (sql.contains('PRAGMA table_info')) {
            if (sql.contains('items')) {
              return [
                {
                  'cid': 0,
                  'name': 'id',
                  'type': 'INTEGER',
                  'notnull': 0,
                  'dflt_value': null,
                  'pk': 1,
                },
                {
                  'cid': 1,
                  'name': 'title',
                  'type': 'TEXT',
                  'notnull': 0,
                  'dflt_value': null,
                  'pk': 0,
                },
              ];
            }
            // Unknown table — return empty.
            return <Map<String, dynamic>>[];
          }
          // PRAGMA foreign_key_list — only respond for known tables.
          if (sql.contains('PRAGMA foreign_key_list')) {
            return <Map<String, dynamic>>[];
          }
          // COUNT(*).
          if (sql.contains('COUNT(*)')) {
            return [
              {'c': itemRows.length},
            ];
          }
          // SELECT * FROM items.
          if (sql.contains('SELECT * FROM')) {
            return itemRows;
          }
          // UNION ALL signature (for change detection) — matches
          // the specific pattern used by ServerContext.checkDataChange.
          if (sql.contains('UNION ALL') ||
              (sql.contains("AS t") && sql.contains('COUNT(*)'))) {
            return [
              {'t': 'items', 'c': itemRows.length},
            ];
          }
          return <Map<String, dynamic>>[];
        },
        port: 0,
        enabled: true,
      );
      serverPort = DriftDebugServer.port;
    }

    tearDown(() async {
      await DriftDebugServer.stop();
      serverPort = null;
    });

    test('GET /api/snapshot returns null when none captured', () async {
      await startServer();
      final resp = await httpGet(serverPort!, '/api/snapshot');

      expect(resp.status, 200);
      expect((resp.body as Map)['snapshot'], isNull);
    });

    test('POST /api/snapshot creates snapshot with metadata', () async {
      await startServer();
      final resp = await httpPost(serverPort!, '/api/snapshot');

      expect(resp.status, 200);
      final body = resp.body as Map;
      expect(body['id'], isNotNull);
      expect(body['createdAt'], isNotNull);
      expect(body['tableCount'], 1);
      expect(body['tables'], contains('items'));
    });

    test('GET /api/snapshot returns metadata after capture', () async {
      await startServer();
      // Create snapshot first.
      await httpPost(serverPort!, '/api/snapshot');

      final resp = await httpGet(serverPort!, '/api/snapshot');
      expect(resp.status, 200);
      final snapshot = (resp.body as Map)['snapshot'] as Map;
      expect(snapshot['id'], isNotNull);
      expect(snapshot['tables'], contains('items'));
      expect((snapshot['counts'] as Map)['items'], 2);
    });

    test('DELETE /api/snapshot clears snapshot', () async {
      await startServer();
      // Create then delete.
      await httpPost(serverPort!, '/api/snapshot');
      final delResp = await httpDelete(serverPort!, '/api/snapshot');
      expect(delResp.status, 200);

      // Verify it's gone.
      final getResp = await httpGet(serverPort!, '/api/snapshot');
      expect((getResp.body as Map)['snapshot'], isNull);
    });

    test('compare returns 400 when no snapshot exists', () async {
      await startServer();
      final resp = await httpGet(serverPort!, '/api/snapshot/compare');
      expect(resp.status, 400);
    });

    test('compare with identical data shows zero diffs', () async {
      await startServer();
      // Create snapshot, then compare (data unchanged).
      await httpPost(serverPort!, '/api/snapshot');
      final resp = await httpGet(serverPort!, '/api/snapshot/compare');

      expect(resp.status, 200);
      final body = resp.body as Map;
      final tables = body['tables'] as List;
      expect(tables, hasLength(1));
      final tableDiff = tables.first as Map;
      expect(tableDiff['added'], 0);
      expect(tableDiff['removed'], 0);
    });

    test('compare detects added rows', () async {
      await startServer();
      // Capture snapshot with 2 rows.
      await httpPost(serverPort!, '/api/snapshot');

      // Simulate adding a row.
      itemRows = [
        {'id': 1, 'title': 'Alpha'},
        {'id': 2, 'title': 'Beta'},
        {'id': 3, 'title': 'Gamma'},
      ];

      final resp = await httpGet(serverPort!, '/api/snapshot/compare');
      expect(resp.status, 200);
      final tableDiff = ((resp.body as Map)['tables'] as List).first as Map;
      expect(tableDiff['countNow'], 3);
      expect(tableDiff['added'], greaterThan(0));
    });

    test('compare detects removed rows', () async {
      await startServer();
      // Capture snapshot with 2 rows.
      await httpPost(serverPort!, '/api/snapshot');

      // Simulate removing a row.
      itemRows = [
        {'id': 1, 'title': 'Alpha'},
      ];

      final resp = await httpGet(serverPort!, '/api/snapshot/compare');
      expect(resp.status, 200);
      final tableDiff = ((resp.body as Map)['tables'] as List).first as Map;
      expect(tableDiff['countNow'], 1);
      expect(tableDiff['removed'], greaterThan(0));
    });

    test(
      'detail=rows triggers row-level diff with PK-based comparison',
      () async {
        await startServer();
        // Capture snapshot.
        await httpPost(serverPort!, '/api/snapshot');

        // Modify one row's title (same PK, different value).
        itemRows = [
          {'id': 1, 'title': 'Alpha Updated'},
          {'id': 2, 'title': 'Beta'},
          {'id': 3, 'title': 'New Row'},
        ];

        final resp = await httpGet(
          serverPort!,
          '/api/snapshot/compare?detail=rows',
        );
        expect(resp.status, 200);
        final tableDiff = ((resp.body as Map)['tables'] as List).first as Map;

        // Should have PK-based diff info.
        expect(tableDiff['hasPk'], true);
        expect(tableDiff['addedRows'], isA<List<dynamic>>());
        expect(tableDiff['removedRows'], isA<List<dynamic>>());
        expect(tableDiff['changedRows'], isA<List<dynamic>>());

        // id=3 is new (added).
        final addedRows = tableDiff['addedRows'] as List;
        expect(addedRows.any((r) => (r as Map)['id'] == 3), isTrue);

        // id=1 changed title.
        final changedRows = tableDiff['changedRows'] as List;
        expect(
          changedRows.any(
            (r) => ((r as Map)['changedColumns'] as List<dynamic>).contains(
              'title',
            ),
          ),
          isTrue,
        );
      },
    );

    test('compare includes snapshotId and timestamps', () async {
      await startServer();
      await httpPost(serverPort!, '/api/snapshot');

      final resp = await httpGet(serverPort!, '/api/snapshot/compare');
      final body = resp.body as Map;

      expect(body['snapshotId'], isNotNull);
      expect(body['snapshotCreatedAt'], isNotNull);
      expect(body['comparedAt'], isNotNull);
    });
  });
}
