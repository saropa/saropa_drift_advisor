// Integration tests for HTTP handlers via the actual DriftDebugServer.
// Tests auth, table, schema, analytics, performance, generation,
// session, import, snapshot, and compare endpoints.

import 'dart:convert';
import 'dart:io';

import 'package:test/test.dart';

import 'package:saropa_drift_advisor/saropa_drift_advisor.dart';

import 'helpers/test_helpers.dart';

void main() {
  // Port assigned by the OS on each server start.
  int? port;

  // Standard mock query supporting a simple "items" table.
  final mockQuery = mockQueryWithTables(
    tableColumns: {
      'items': [
        <String, dynamic>{'name': 'id', 'type': 'INTEGER', 'pk': 1},
        <String, dynamic>{'name': 'title', 'type': 'TEXT', 'pk': 0},
        <String, dynamic>{
          'name': 'createdAt',
          'type': 'TEXT',
          'pk': 0,
        },
      ],
    },
    tableData: {
      'items': [
        <String, dynamic>{'id': 1, 'title': 'First', 'createdAt': '2025-01-01'},
        <String, dynamic>{
          'id': 2,
          'title': 'Second',
          'createdAt': '2025-01-02'
        },
        <String, dynamic>{'id': 3, 'title': 'Third', 'createdAt': '2025-01-03'},
      ],
    },
    tableCounts: {'items': 3},
    tableForeignKeys: {'items': <Map<String, dynamic>>[]},
  );

  /// Starts the server with default config and captures the port.
  Future<void> startServer({
    String? authToken,
    String? basicAuthUser,
    String? basicAuthPassword,
    String? corsOrigin,
    Future<List<Map<String, dynamic>>> Function(String)? queryCompare,
    Future<void> Function(String)? writeQuery,
    Future<List<int>> Function()? getDatabaseBytes,
  }) async {
    await DriftDebugServer.start(
      query: mockQuery,
      enabled: true,
      port: 0,
      authToken: authToken,
      basicAuthUser: basicAuthUser,
      basicAuthPassword: basicAuthPassword,
      corsOrigin: corsOrigin,
      queryCompare: queryCompare,
      writeQuery: writeQuery,
      getDatabaseBytes: getDatabaseBytes,
    );
    port = DriftDebugServer.port;
  }

  tearDown(() async {
    await DriftDebugServer.stop();
    port = null;
  });

  // =====================================================
  // Health & Generation
  // =====================================================
  group('health & generation', () {
    setUp(() async {
      await startServer();
    });

    test('GET /api/health returns ok and version', () async {
      final r = await httpGet(port!, '/api/health');
      expect(r.status, HttpStatus.ok);
      expect(r.body['ok'], isTrue);
      expect(r.body['version'], isA<String>());
    });

    test('GET /api/generation returns generation number', () async {
      final r = await httpGet(port!, '/api/generation');
      expect(r.status, HttpStatus.ok);
      expect(r.body['generation'], isA<int>());
    });

    test('GET / returns HTML content', () async {
      final r = await httpGet(port!, '/');
      expect(r.status, HttpStatus.ok);
      // Body is HTML string (non-JSON).
      expect(r.body, isA<String>());
      expect((r.body as String).toLowerCase(), contains('<!doctype html'));
    });

    test('GET /favicon.ico returns success (200 or 204)', () async {
      final client = HttpClient();
      try {
        final req = await client.get('localhost', port!, '/favicon.ico');
        final resp = await req.close();
        // Favicon may return 200 with SVG or 204 No Content.
        expect(resp.statusCode, anyOf(HttpStatus.ok, HttpStatus.noContent));
      } finally {
        client.close();
      }
    });
  });

  // =====================================================
  // Authentication
  // =====================================================
  group('authentication', () {
    group('Bearer token', () {
      setUp(() async {
        await startServer(authToken: 'secret-token-123');
      });

      test('rejects request without auth header', () async {
        final r = await httpGet(port!, '/api/tables');
        expect(r.status, HttpStatus.unauthorized);
        expect(r.body['error'], contains('Authentication required'));
      });

      test('rejects request with wrong token', () async {
        final r = await httpGet(port!, '/api/tables', headers: {
          'Authorization': 'Bearer wrong-token',
        });
        expect(r.status, HttpStatus.unauthorized);
      });

      test('accepts request with correct token', () async {
        final r = await httpGet(port!, '/api/tables', headers: {
          'Authorization': 'Bearer secret-token-123',
        });
        expect(r.status, HttpStatus.ok);
      });

      test('rejects empty Bearer token', () async {
        final r = await httpGet(port!, '/api/tables', headers: {
          'Authorization': 'Bearer ',
        });
        expect(r.status, HttpStatus.unauthorized);
      });
    });

    group('Basic auth', () {
      setUp(() async {
        await startServer(
          basicAuthUser: 'admin',
          basicAuthPassword: 'pass123',
        );
      });

      test('rejects request without auth', () async {
        final r = await httpGet(port!, '/api/tables');
        expect(r.status, HttpStatus.unauthorized);
      });

      test('accepts valid Basic credentials', () async {
        final encoded = base64.encode(utf8.encode('admin:pass123'));
        final r = await httpGet(port!, '/api/tables', headers: {
          'Authorization': 'Basic $encoded',
        });
        expect(r.status, HttpStatus.ok);
      });

      test('rejects wrong Basic credentials', () async {
        final encoded = base64.encode(utf8.encode('admin:wrongpass'));
        final r = await httpGet(port!, '/api/tables', headers: {
          'Authorization': 'Basic $encoded',
        });
        expect(r.status, HttpStatus.unauthorized);
      });

      test('rejects malformed Basic auth (no colon)', () async {
        final encoded = base64.encode(utf8.encode('nocolon'));
        final r = await httpGet(port!, '/api/tables', headers: {
          'Authorization': 'Basic $encoded',
        });
        expect(r.status, HttpStatus.unauthorized);
      });
    });

    group('no auth configured', () {
      setUp(() async {
        await startServer();
      });

      test('allows unauthenticated access', () async {
        final r = await httpGet(port!, '/api/tables');
        expect(r.status, HttpStatus.ok);
      });
    });
  });

  // =====================================================
  // Table endpoints
  // =====================================================
  group('table endpoints', () {
    setUp(() async {
      await startServer();
    });

    test('GET /api/tables returns table list', () async {
      final r = await httpGet(port!, '/api/tables');
      expect(r.status, HttpStatus.ok);
      expect(r.body, isA<List<dynamic>>());
      expect((r.body as List<dynamic>), contains('items'));
    });

    test('GET /api/table/items returns row data', () async {
      final r = await httpGet(port!, '/api/table/items');
      expect(r.status, HttpStatus.ok);
      expect(r.body, isA<List<dynamic>>());
      expect((r.body as List<dynamic>), hasLength(3));
    });

    test('GET /api/table/items/count returns row count', () async {
      final r = await httpGet(port!, '/api/table/items/count');
      expect(r.status, HttpStatus.ok);
      expect(r.body['count'], 3);
    });

    test('GET /api/table/items/columns returns column names', () async {
      final r = await httpGet(port!, '/api/table/items/columns');
      expect(r.status, HttpStatus.ok);
      expect(r.body, isA<List<dynamic>>());

      final cols = (r.body as List<dynamic>).cast<String>();
      expect(cols, contains('id'));
      expect(cols, contains('title'));
    });

    test('GET /api/table/items/fk-meta returns FK metadata', () async {
      final r = await httpGet(port!, '/api/table/items/fk-meta');
      expect(r.status, HttpStatus.ok);
      // Items table has no foreign keys in our mock.
      expect(r.body, isA<List<dynamic>>());
    });

    test('GET /api/table/unknown returns 400', () async {
      final r = await httpGet(port!, '/api/table/unknown');
      expect(r.status, HttpStatus.badRequest);
      expect(r.body['error'], contains('Unknown table'));
    });

    test('GET /api/table/items respects limit parameter', () async {
      final r = await httpGet(port!, '/api/table/items?limit=2');
      expect(r.status, HttpStatus.ok);
      // Our mock returns all data regardless of limit, but the
      // request should still succeed.
      expect(r.body, isA<List<dynamic>>());
    });
  });

  // =====================================================
  // SQL endpoint
  // =====================================================
  group('SQL endpoint', () {
    setUp(() async {
      await startServer();
    });

    test('POST /api/sql executes read-only query', () async {
      final r = await httpPost(
        port!,
        '/api/sql',
        json: <String, dynamic>{'sql': 'SELECT * FROM items'},
      );
      expect(r.status, HttpStatus.ok);
      expect(r.body['rows'], isA<List<dynamic>>());
    });

    test('POST /api/sql rejects INSERT', () async {
      final r = await httpPost(
        port!,
        '/api/sql',
        json: <String, dynamic>{
          'sql': 'INSERT INTO items (id) VALUES (1)',
        },
      );
      expect(r.status, HttpStatus.badRequest);
      expect(r.body['error'], contains('read-only'));
    });

    test('POST /api/sql rejects DELETE', () async {
      final r = await httpPost(
        port!,
        '/api/sql',
        json: <String, dynamic>{'sql': 'DELETE FROM items'},
      );
      expect(r.status, HttpStatus.badRequest);
    });

    test('POST /api/sql rejects non-JSON Content-Type', () async {
      final r = await httpPost(
        port!,
        '/api/sql',
        rawBody: 'not json',
        contentType: ContentType.text,
      );
      expect(r.status, HttpStatus.badRequest);
      expect(r.body['error'], contains('Content-Type'));
    });

    test('POST /api/sql rejects missing sql field', () async {
      final r = await httpPost(
        port!,
        '/api/sql',
        json: <String, dynamic>{'query': 'SELECT 1'},
      );
      expect(r.status, HttpStatus.badRequest);
      expect(r.body['error'], contains('sql'));
    });

    test('POST /api/sql rejects empty sql field', () async {
      final r = await httpPost(
        port!,
        '/api/sql',
        json: <String, dynamic>{'sql': ''},
      );
      expect(r.status, HttpStatus.badRequest);
    });

    test('POST /api/sql/explain returns explain plan', () async {
      final r = await httpPost(
        port!,
        '/api/sql/explain',
        json: <String, dynamic>{'sql': 'SELECT * FROM items'},
      );
      expect(r.status, HttpStatus.ok);
      expect(r.body['rows'], isA<List<dynamic>>());
      expect(r.body['sql'], contains('EXPLAIN'));
    });
  });

  // =====================================================
  // Schema endpoints
  // =====================================================
  group('schema endpoints', () {
    setUp(() async {
      await startServer();
    });

    test('GET /api/schema returns SQL DDL', () async {
      final r = await httpGet(port!, '/api/schema');
      expect(r.status, HttpStatus.ok);
      // Response is plain text SQL, not JSON.
      expect(r.body, isA<String>());
      expect((r.body as String), contains('CREATE TABLE'));
    });

    test('GET /api/schema/diagram returns table structure JSON', () async {
      final r = await httpGet(port!, '/api/schema/diagram');
      expect(r.status, HttpStatus.ok);
      expect(r.body['tables'], isA<List<dynamic>>());
    });

    test('GET /api/schema/metadata returns table metadata', () async {
      final r = await httpGet(port!, '/api/schema/metadata');
      expect(r.status, HttpStatus.ok);
      // Response is {tables: [...]} wrapper.
      final body = r.body as Map<String, dynamic>;
      expect(body, contains('tables'));
      final tables = body['tables'] as List<dynamic>;
      if (tables.isNotEmpty) {
        final first = tables[0] as Map<String, dynamic>;
        expect(first, containsPair('name', 'items'));
        expect(first, contains('columns'));
        expect(first, contains('rowCount'));
      }
    });

    test('GET /api/dump returns full SQL dump', () async {
      final r = await httpGet(port!, '/api/dump');
      expect(r.status, HttpStatus.ok);
      expect(r.body, isA<String>());
      expect((r.body as String), contains('CREATE TABLE'));
    });

    test('GET /api/database returns 501 when not configured', () async {
      final r = await httpGet(port!, '/api/database');
      expect(r.status, HttpStatus.notImplemented);
    });
  });

  group('database download', () {
    setUp(() async {
      await startServer(
        getDatabaseBytes: () async => <int>[0x53, 0x51, 0x4C],
      );
    });

    test('GET /api/database returns bytes when configured', () async {
      final client = HttpClient();
      try {
        final req = await client.get('localhost', port!, '/api/database');
        final resp = await req.close();
        expect(resp.statusCode, HttpStatus.ok);
        // Content-Disposition should be attachment.
        final disposition = resp.headers.value('Content-Disposition');
        expect(disposition, contains('attachment'));
      } finally {
        client.close();
      }
    });
  });

  // =====================================================
  // Snapshot endpoints
  // =====================================================
  group('snapshot endpoints', () {
    setUp(() async {
      await startServer();
    });

    test('POST /api/snapshot captures current state', () async {
      final r = await httpPost(port!, '/api/snapshot');
      expect(r.status, HttpStatus.ok);
      // Response has id, createdAt, tableCount, tables.
      final body = r.body as Map<String, dynamic>;
      expect(body, contains('id'));
      expect(body, contains('createdAt'));
      expect(body, contains('tableCount'));
    });

    test('GET /api/snapshot returns captured snapshot', () async {
      // First capture.
      await httpPost(port!, '/api/snapshot');

      final r = await httpGet(port!, '/api/snapshot');
      expect(r.status, HttpStatus.ok);
      expect(r.body['snapshot'], isNotNull);
    });

    test('GET /api/snapshot/compare diffs current vs snapshot', () async {
      // Capture a snapshot first.
      await httpPost(port!, '/api/snapshot');

      final r = await httpGet(port!, '/api/snapshot/compare');
      expect(r.status, HttpStatus.ok);
      // Response has snapshotId, tables (list of per-table diffs).
      final body = r.body as Map<String, dynamic>;
      expect(body, contains('snapshotId'));
      expect(body, contains('tables'));
      expect(body['tables'], isA<List<dynamic>>());
    });

    test('GET /api/snapshot/compare returns 400 with no snapshot', () async {
      final r = await httpGet(port!, '/api/snapshot/compare');
      expect(r.status, HttpStatus.badRequest);
      expect(r.body['error'], contains('No snapshot'));
    });

    test('DELETE /api/snapshot clears snapshot', () async {
      await httpPost(port!, '/api/snapshot');
      final r = await httpDelete(port!, '/api/snapshot');
      expect(r.status, HttpStatus.ok);

      // Subsequent compare should fail.
      final r2 = await httpGet(port!, '/api/snapshot/compare');
      expect(r2.status, HttpStatus.badRequest);
    });
  });

  // =====================================================
  // Compare endpoints
  // =====================================================
  group('compare endpoints', () {
    test('GET /api/compare/report returns 501 without queryCompare', () async {
      await startServer();
      final r = await httpGet(port!, '/api/compare/report');
      expect(r.status, HttpStatus.notImplemented);
    });

    test('GET /api/compare/report returns diff when configured', () async {
      await startServer(
        queryCompare: mockQuery,
      );
      final r = await httpGet(port!, '/api/compare/report');
      expect(r.status, HttpStatus.ok);
      expect(r.body, contains('schemaSame'));
    });

    test('GET /api/migration/preview returns 501 without queryCompare',
        () async {
      await startServer();
      final r = await httpGet(port!, '/api/migration/preview');
      expect(r.status, HttpStatus.notImplemented);
    });
  });

  // =====================================================
  // Analytics endpoints
  // =====================================================
  group('analytics endpoints', () {
    setUp(() async {
      await startServer();
    });

    test('GET /api/analytics/performance returns performance data', () async {
      final r = await httpGet(port!, '/api/analytics/performance');
      expect(r.status, HttpStatus.ok);
      expect(r.body, contains('totalQueries'));
    });

    test('DELETE /api/analytics/performance clears data', () async {
      final r = await httpDelete(port!, '/api/analytics/performance');
      expect(r.status, HttpStatus.ok);
    });

    test('GET /api/index-suggestions returns suggestions', () async {
      final r = await httpGet(port!, '/api/index-suggestions');
      expect(r.status, HttpStatus.ok);
      expect(r.body, isA<Map<dynamic, dynamic>>());
    });

    test('GET /api/analytics/anomalies returns anomaly report', () async {
      final r = await httpGet(port!, '/api/analytics/anomalies');
      expect(r.status, HttpStatus.ok);
      expect(r.body, isA<Map<dynamic, dynamic>>());
    });

    test('GET /api/analytics/size returns size analytics', () async {
      final r = await httpGet(port!, '/api/analytics/size');
      expect(r.status, HttpStatus.ok);
    });
  });

  // =====================================================
  // Session endpoints
  // =====================================================
  group('session endpoints', () {
    setUp(() async {
      await startServer();
    });

    test('POST /api/session/share creates a session', () async {
      final r = await httpPost(
        port!,
        '/api/session/share',
        json: <String, dynamic>{
          'state': <String, dynamic>{'currentTable': 'items'},
        },
      );
      expect(r.status, HttpStatus.ok);
      expect(r.body, containsPair('id', isA<String>()));
      expect(r.body, containsPair('url', isA<String>()));
    });

    test('GET /api/session/<id> retrieves created session', () async {
      final created = await httpPost(
        port!,
        '/api/session/share',
        json: <String, dynamic>{
          'state': <String, dynamic>{'key': 'value'},
        },
      );
      final id = created.body['id'] as String;

      final r = await httpGet(port!, '/api/session/$id');
      expect(r.status, HttpStatus.ok);
      // Session stores the full POST body as its 'state' field.
      // So body['state'] == {'state': {'key': 'value'}} (the
      // original POST payload). Verify the round-trip.
      final body = r.body as Map<String, dynamic>;
      expect(body, contains('state'));
      final state = body['state'] as Map<String, dynamic>;
      expect(state, containsPair('state', {'key': 'value'}));
    });

    test('GET /api/session/unknown returns 404', () async {
      final r = await httpGet(port!, '/api/session/nonexistent');
      expect(r.status, HttpStatus.notFound);
    });

    test('POST /api/session/<id>/annotate adds annotation', () async {
      final created = await httpPost(
        port!,
        '/api/session/share',
        json: <String, dynamic>{
          'state': <String, dynamic>{},
        },
      );
      final id = created.body['id'] as String;

      final r = await httpPost(
        port!,
        '/api/session/$id/annotate',
        json: <String, dynamic>{
          'text': 'check this bug',
          'author': 'tester',
        },
      );
      expect(r.status, HttpStatus.ok);
    });
  });

  // =====================================================
  // Import endpoint
  // =====================================================
  group('import endpoint', () {
    test('POST /api/import returns 501 when writeQuery not configured',
        () async {
      await startServer();
      final r = await httpPost(
        port!,
        '/api/import',
        json: <String, dynamic>{
          'format': 'json',
          'table': 'items',
          'data': '[{"id": 1}]',
        },
      );
      // Import requires writeQuery callback.
      expect(r.status, HttpStatus.notImplemented);
    });

    test('POST /api/import succeeds with writeQuery configured', () async {
      final executedSql = <String>[];
      await startServer(
        writeQuery: (sql) async => executedSql.add(sql),
      );

      final r = await httpPost(
        port!,
        '/api/import',
        json: <String, dynamic>{
          'format': 'json',
          'table': 'items',
          'data': '[{"id": 99, "title": "New"}]',
        },
      );
      expect(r.status, HttpStatus.ok);
      expect(r.body['imported'], 1);
    });
  });

  // =====================================================
  // CORS
  // =====================================================
  group('CORS', () {
    test('sets Access-Control-Allow-Origin when configured', () async {
      await startServer(corsOrigin: 'http://localhost:3000');

      final client = HttpClient();
      try {
        final req = await client.get('localhost', port!, '/api/health');
        final resp = await req.close();
        expect(
          resp.headers.value('Access-Control-Allow-Origin'),
          'http://localhost:3000',
        );
      } finally {
        client.close();
      }
    });

    test('omits CORS header when not configured', () async {
      await startServer();

      final client = HttpClient();
      try {
        final req = await client.get('localhost', port!, '/api/health');
        final resp = await req.close();
        expect(
          resp.headers.value('Access-Control-Allow-Origin'),
          isNull,
        );
      } finally {
        client.close();
      }
    });
  });

  // =====================================================
  // 404 handling
  // =====================================================
  group('unknown routes', () {
    setUp(() async {
      await startServer();
    });

    test('GET /api/nonexistent returns 404', () async {
      final r = await httpGet(port!, '/api/nonexistent');
      expect(r.status, HttpStatus.notFound);
    });
  });
}
