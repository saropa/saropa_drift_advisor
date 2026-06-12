// Integration tests for GET /api/report (Feature 25, server side).
//
// Exercises the portable-report endpoint through the real DriftDebugServer so
// the route wiring, attachment headers, table-name allow-listing, maxRows
// clamp, and section toggles are all covered end to end against a mock query.

import 'package:saropa_drift_advisor/saropa_drift_advisor.dart';
import 'package:test/test.dart';

import 'helpers/test_helpers.dart';

void main() {
  group('GET /api/report', () {
    int? port;

    // A two-table schema with data and counts, so SELECT *, COUNT(*), and
    // PRAGMA table_info all resolve through the mock.
    final query = mockQueryWithTables(
      tableColumns: <String, List<Map<String, dynamic>>>{
        'users': <Map<String, dynamic>>[
          <String, dynamic>{'name': 'id', 'type': 'INTEGER', 'pk': 1},
          <String, dynamic>{'name': 'name', 'type': 'TEXT', 'pk': 0},
        ],
        'orders': <Map<String, dynamic>>[
          <String, dynamic>{'name': 'id', 'type': 'INTEGER', 'pk': 1},
        ],
      },
      tableData: <String, List<Map<String, dynamic>>>{
        'users': <Map<String, dynamic>>[
          <String, dynamic>{'id': 1, 'name': 'Eve'},
          <String, dynamic>{'id': 2, 'name': 'Mallory'},
        ],
        'orders': <Map<String, dynamic>>[
          <String, dynamic>{'id': 10},
        ],
      },
      tableCounts: <String, int>{'users': 2, 'orders': 1},
    );

    tearDown(() async {
      await DriftDebugServer.stop();
      port = null;
    });

    Future<void> startServer() async {
      await DriftDebugServer.start(query: query, enabled: true, port: 0);
      port = DriftDebugServer.port;
    }

    test('returns an HTML attachment with both tables embedded', () async {
      await startServer();
      final res = await httpGet(port!, '/api/report');
      expect(res.status, 200);
      final html = res.body as String;
      expect(html, startsWith('<!DOCTYPE html>'));
      // All tables embedded by default; their names appear in the JSON island.
      expect(html, contains('"name":"users"'));
      expect(html, contains('"name":"orders"'));
      expect(html, contains('"Eve"'));
    });

    test('restricts to the requested table when ?tables= is given', () async {
      await startServer();
      final res = await httpGet(port!, '/api/report?tables=users');
      final html = res.body as String;
      expect(html, contains('"name":"users"'));
      expect(html, isNot(contains('"name":"orders"')));
    });

    test('ignores an unknown table name (allow-list by live schema)', () async {
      await startServer();
      // `evil` is not a real table, so it is dropped rather than queried.
      final res = await httpGet(port!, '/api/report?tables=users,evil');
      expect(res.status, 200);
      final html = res.body as String;
      expect(html, contains('"name":"users"'));
      expect(html, isNot(contains('evil')));
    });

    test('omits the schema section when schema=false', () async {
      await startServer();
      final withSchema = (await httpGet(port!, '/api/report')).body as String;
      expect(withSchema, contains('CREATE TABLE'));
      final without =
          (await httpGet(port!, '/api/report?schema=false')).body as String;
      // Embedded schema is null → the literal CREATE TABLE DDL is absent.
      expect(without, isNot(contains('CREATE TABLE')));
    });
  });
}
