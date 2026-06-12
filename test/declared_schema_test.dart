// Tests for Feature 71 — website Dart (code-declared) schema scanning.
//
// Exercises GET /api/schema/declared via the real DriftDebugServer: a supplied
// declaredSchema callback is serialized; no callback reports available:false;
// a throwing callback returns 500.

import 'package:test/test.dart';

import 'package:saropa_drift_advisor/saropa_drift_advisor.dart';

import 'helpers/test_helpers.dart';

void main() {
  group('GET /api/schema/declared', () {
    int? port;

    final mockQuery = mockQueryWithTables(
      tableColumns: {
        'users': [
          <String, dynamic>{'name': 'id', 'type': 'INTEGER', 'pk': 1},
        ],
      },
    );

    tearDown(() async {
      await DriftDebugServer.stop();
      port = null;
    });

    test('serializes a supplied declared schema', () async {
      DeclaredSchema declared() => <DeclaredTable>[
        const DeclaredTable(
          name: 'users',
          columns: <DeclaredColumn>[
            DeclaredColumn(
              name: 'id',
              sqlType: 'INTEGER',
              nullable: false,
              isPk: true,
            ),
            DeclaredColumn(name: 'email', sqlType: 'TEXT'),
          ],
          indexes: <String>['idx_users_email'],
        ),
      ];

      await DriftDebugServer.start(
        query: mockQuery,
        enabled: true,
        port: 0,
        declaredSchema: declared,
      );
      port = DriftDebugServer.port;

      final res = await httpGet(port!, '/api/schema/declared');
      expect(res.status, 200);
      final body = res.body as Map;
      expect(body['available'], true);
      final tables = body['tables'] as List;
      expect(tables.length, 1);
      final users = tables.first as Map;
      expect(users['name'], 'users');
      final cols = users['columns'] as List;
      expect(cols.length, 2);
      final id = cols.first as Map;
      expect(id['name'], 'id');
      expect(id['sqlType'], 'INTEGER');
      expect(id['nullable'], false);
      expect(id['isPk'], true);
      final email = cols[1] as Map;
      expect(email['nullable'], true); // default
      expect(email['isPk'], false);
      expect(users['indexes'], <String>['idx_users_email']);
    });

    test('carries the Drift semantic type (driftType) when supplied', () async {
      DeclaredSchema declared() => <DeclaredTable>[
        const DeclaredTable(
          name: 'events',
          columns: <DeclaredColumn>[
            DeclaredColumn(name: 'id', sqlType: 'INTEGER', isPk: true),
            DeclaredColumn(
              name: 'startsAt',
              sqlType: 'INTEGER',
              driftType: 'dateTime',
            ),
            DeclaredColumn(
              name: 'isPublic',
              sqlType: 'INTEGER',
              driftType: 'bool',
            ),
          ],
        ),
      ];

      await DriftDebugServer.start(
        query: mockQuery,
        enabled: true,
        port: 0,
        declaredSchema: declared,
      );
      port = DriftDebugServer.port;

      final res = await httpGet(port!, '/api/schema/declared');
      final cols =
          ((res.body as Map)['tables'] as List).first['columns'] as List;
      // Drift's INTEGER storage hides date/bool; driftType preserves it.
      expect((cols[1] as Map)['driftType'], 'dateTime');
      expect((cols[2] as Map)['driftType'], 'bool');
      // No driftType supplied for `id` → key omitted (conditional emission).
      expect((cols.first as Map).containsKey('driftType'), false);
    });

    test('reports available:false when no callback is supplied', () async {
      await DriftDebugServer.start(query: mockQuery, enabled: true, port: 0);
      port = DriftDebugServer.port;

      final res = await httpGet(port!, '/api/schema/declared');
      expect(res.status, 200);
      final body = res.body as Map;
      expect(body['available'], false);
      expect((body['tables'] as List).isEmpty, isTrue);
    });

    test('returns 500 when the host callback throws', () async {
      DeclaredSchema declared() => throw StateError('boom');

      await DriftDebugServer.start(
        query: mockQuery,
        enabled: true,
        port: 0,
        declaredSchema: declared,
      );
      port = DriftDebugServer.port;

      final res = await httpGet(port!, '/api/schema/declared');
      expect(res.status, 500);
      expect((res.body as Map)['error'], isNotNull);
    });
  });
}
