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
        <String, dynamic>{'name': 'createdAt', 'type': 'TEXT', 'pk': 0},
      ],
    },
    tableData: {
      'items': [
        <String, dynamic>{'id': 1, 'title': 'First', 'createdAt': '2025-01-01'},
        <String, dynamic>{
          'id': 2,
          'title': 'Second',
          'createdAt': '2025-01-02',
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

    test('GET /api/health returns ok, version, and capabilities', () async {
      final r = await httpGet(port!, '/api/health');
      expect(r.status, HttpStatus.ok);
      expect(r.body['ok'], isTrue);
      expect(r.body['version'], isA<String>());
      // Contract: shape matches doc/API.md § Health & Generation.
      expect(r.body['extensionConnected'], isA<bool>());
      expect(r.body['writeEnabled'], isFalse);
      expect(r.body['compareEnabled'], isFalse);
      expect(r.body['capabilities'], isA<List<dynamic>>());
      expect(
        (r.body['capabilities'] as List<dynamic>),
        contains('issues'),
        reason: 'Health must advertise GET /api/issues support',
      );
    });

    test('GET /api/health writeEnabled when writeQuery configured', () async {
      await DriftDebugServer.stop();
      await startServer(writeQuery: (sql) async {});
      final r = await httpGet(port!, '/api/health');
      expect(r.status, HttpStatus.ok);
      expect(r.body['writeEnabled'], isTrue);
      expect((r.body['capabilities'] as List<dynamic>), contains('cellUpdate'));
      expect((r.body['capabilities'] as List<dynamic>), contains('editsApply'));
    });

    test(
      'GET /api/health compareEnabled when queryCompare configured',
      () async {
        await DriftDebugServer.stop();
        await startServer(
          queryCompare: (sql) async => <Map<String, dynamic>>[],
        );
        final r = await httpGet(port!, '/api/health');
        expect(r.status, HttpStatus.ok);
        expect(r.body['compareEnabled'], isTrue);
      },
    );

    test('GET /api/generation returns generation number', () async {
      final r = await httpGet(port!, '/api/generation');
      expect(r.status, HttpStatus.ok);
      // Contract: shape matches doc/API.md § GET /api/generation.
      expect(r.body['generation'], isA<int>());
      expect(r.body['generation'] as int, greaterThanOrEqualTo(0));
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

    test(
      'GET /assets/web/style.css returns CSS with correct content-type',
      () async {
        final client = HttpClient();
        try {
          final req = await client.get(
            'localhost',
            port!,
            '/assets/web/style.css',
          );
          final resp = await req.close();
          expect(resp.statusCode, HttpStatus.ok);
          final ct = resp.headers.contentType;
          expect(ct, isNotNull);
          expect(ct!.mimeType, contains('css'));
          final body = await resp.transform(utf8.decoder).join();
          expect(body, contains(':root'));
          // Must be real CSS, not an HTML shell or JSON error accidentally routed here.
          expect(body.toLowerCase(), isNot(startsWith('<!doctype')));
        } finally {
          client.close();
        }
      },
    );

    test(
      'GET assets/web/style.css (no leading slash) returns same stylesheet',
      () async {
        final client = HttpClient();
        try {
          final req = await client.get(
            'localhost',
            port!,
            'assets/web/style.css',
          );
          final resp = await req.close();
          expect(resp.statusCode, HttpStatus.ok);
          final body = await resp.transform(utf8.decoder).join();
          expect(body, contains(':root'));
        } finally {
          client.close();
        }
      },
    );

    test(
      'GET /assets/web/bundle.js returns JavaScript with correct content-type',
      () async {
        final client = HttpClient();
        try {
          final req = await client.get(
            'localhost',
            port!,
            '/assets/web/bundle.js',
          );
          final resp = await req.close();
          expect(resp.statusCode, HttpStatus.ok);
          final ct = resp.headers.contentType;
          expect(ct, isNotNull);
          expect(ct!.mimeType, contains('javascript'));
          final body = await resp.transform(utf8.decoder).join();
          expect(body, contains('DRIFT_VIEWER_AUTH_TOKEN'));
          // bundle.js embeds CDN URLs for dynamic injection elsewhere;
          // ensure this is the script file, not HTML.
          expect(body.toLowerCase(), isNot(startsWith('<!doctype')));
          expect(body, contains('function authOpts'));
        } finally {
          client.close();
        }
      },
    );

    test(
      'GET /assets/web/not-a-real-asset.css returns 404 (no false match)',
      () async {
        final r = await httpGet(port!, '/assets/web/not-a-real-asset.css');
        expect(r.status, HttpStatus.notFound);
      },
    );

    test(
      'POST /assets/web/style.css returns 404 (GET-only asset routes)',
      () async {
        final client = HttpClient();
        try {
          final req = await client.post(
            'localhost',
            port!,
            '/assets/web/style.css',
          );
          final resp = await req.close();
          expect(resp.statusCode, HttpStatus.notFound);
        } finally {
          client.close();
        }
      },
    );
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
        final r = await httpGet(
          port!,
          '/api/tables',
          headers: {'Authorization': 'Bearer wrong-token'},
        );
        expect(r.status, HttpStatus.unauthorized);
      });

      test('accepts request with correct token', () async {
        final r = await httpGet(
          port!,
          '/api/tables',
          headers: {'Authorization': 'Bearer secret-token-123'},
        );
        expect(r.status, HttpStatus.ok);
      });

      test('rejects empty Bearer token', () async {
        final r = await httpGet(
          port!,
          '/api/tables',
          headers: {'Authorization': 'Bearer '},
        );
        expect(r.status, HttpStatus.unauthorized);
      });
    });

    group('Basic auth', () {
      setUp(() async {
        await startServer(basicAuthUser: 'admin', basicAuthPassword: 'pass123');
      });

      test('rejects request without auth', () async {
        final r = await httpGet(port!, '/api/tables');
        expect(r.status, HttpStatus.unauthorized);
      });

      test('accepts valid Basic credentials', () async {
        final encoded = base64.encode(utf8.encode('admin:pass123'));
        final r = await httpGet(
          port!,
          '/api/tables',
          headers: {'Authorization': 'Basic $encoded'},
        );
        expect(r.status, HttpStatus.ok);
      });

      test('rejects wrong Basic credentials', () async {
        final encoded = base64.encode(utf8.encode('admin:wrongpass'));
        final r = await httpGet(
          port!,
          '/api/tables',
          headers: {'Authorization': 'Basic $encoded'},
        );
        expect(r.status, HttpStatus.unauthorized);
      });

      test('rejects malformed Basic auth (no colon)', () async {
        final encoded = base64.encode(utf8.encode('nocolon'));
        final r = await httpGet(
          port!,
          '/api/tables',
          headers: {'Authorization': 'Basic $encoded'},
        );
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

    test('GET /api/tables returns table list with counts', () async {
      final r = await httpGet(port!, '/api/tables');
      expect(r.status, HttpStatus.ok);
      // Response shape: {"tables": [...], "counts": {...}}
      expect(r.body, isA<Map<String, dynamic>>());
      final body = r.body as Map<String, dynamic>;
      expect(body['tables'], isA<List<dynamic>>());
      expect(body['tables'] as List<dynamic>, contains('items'));
      expect(body['counts'], isA<Map<String, dynamic>>());
    });

    test('GET /api/table/items returns row data', () async {
      final r = await httpGet(port!, '/api/table/items');
      expect(r.status, HttpStatus.ok);
      // Contract: response is array of row objects (doc/API.md § Tables).
      expect(r.body, isA<List<dynamic>>());
      expect((r.body as List<dynamic>), hasLength(3));
      final firstRow = (r.body as List<dynamic>)[0] as Map<String, dynamic>;
      expect(firstRow, contains('id'));
      expect(firstRow, contains('title'));
    });

    test('GET /api/table/items/count returns row count', () async {
      final r = await httpGet(port!, '/api/table/items/count');
      expect(r.status, HttpStatus.ok);
      // Contract: {count: int} shape (doc/API.md § Tables).
      expect(r.body['count'], isA<int>());
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
        json: <String, dynamic>{'sql': 'INSERT INTO items (id) VALUES (1)'},
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

    test('POST /api/sql/explain returns explain plan with indexes', () async {
      final r = await httpPost(
        port!,
        '/api/sql/explain',
        json: <String, dynamic>{'sql': 'SELECT * FROM items'},
      );
      expect(r.status, HttpStatus.ok);
      expect(r.body['rows'], isA<List<dynamic>>());
      expect(r.body['sql'], contains('EXPLAIN'));
      // The enhanced explain endpoint now also returns
      // index info for tables referenced in the query plan.
      expect(r.body['indexes'], isA<Map<String, dynamic>>());
      // The mock EXPLAIN returns "SCAN TABLE items", so the
      // items table should appear in the indexes map.
      expect(r.body['indexes'], contains('items'));
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
      // Contract: {tables, foreignKeys} shape (doc/API.md § Schema).
      expect(r.body['tables'], isA<List<dynamic>>());
      expect(r.body['foreignKeys'], isA<List<dynamic>>());
      // Validate table entry shape: {name, columns}.
      final tables = r.body['tables'] as List<dynamic>;
      if (tables.isNotEmpty) {
        final firstTable = tables[0] as Map<String, dynamic>;
        expect(firstTable, contains('name'));
        expect(firstTable, contains('columns'));
        // Validate column entry shape: {name, type, pk}.
        final columns = firstTable['columns'] as List<dynamic>;
        if (columns.isNotEmpty) {
          final firstCol = columns[0] as Map<String, dynamic>;
          expect(firstCol, contains('name'));
          expect(firstCol, contains('type'));
          expect(firstCol, contains('pk'));
        }
      }
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
      await startServer(getDatabaseBytes: () async => <int>[0x53, 0x51, 0x4C]);
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
      // Contract: {id, createdAt, tableCount, tables} shape
      // (doc/API.md § Snapshots).
      final body = r.body as Map<String, dynamic>;
      expect(body, contains('id'));
      expect(body['id'], isA<String>());
      expect(body, contains('createdAt'));
      expect(body['createdAt'], isA<String>());
      expect(body, contains('tableCount'));
      expect(body['tableCount'], isA<int>());
      expect(body, contains('tables'));
      expect(body['tables'], isA<List<dynamic>>());
    });

    test('GET /api/snapshot returns captured snapshot', () async {
      // First capture.
      await httpPost(port!, '/api/snapshot');

      final r = await httpGet(port!, '/api/snapshot');
      expect(r.status, HttpStatus.ok);
      // Contract: {snapshot: {id, createdAt, tables, counts}} shape
      // (doc/API.md § Snapshots).
      expect(r.body['snapshot'], isNotNull);
      final snap = r.body['snapshot'] as Map<String, dynamic>;
      expect(snap, contains('id'));
      expect(snap, contains('createdAt'));
      expect(snap, contains('tables'));
      expect(snap, contains('counts'));
    });

    test('GET /api/snapshot/compare diffs current vs snapshot', () async {
      // Capture a snapshot first.
      await httpPost(port!, '/api/snapshot');

      final r = await httpGet(port!, '/api/snapshot/compare');
      expect(r.status, HttpStatus.ok);
      // Contract: {snapshotId, snapshotCreatedAt, comparedAt, tables}
      // shape (doc/API.md § Snapshots).
      final body = r.body as Map<String, dynamic>;
      expect(body, contains('snapshotId'));
      expect(body, contains('snapshotCreatedAt'));
      expect(body, contains('comparedAt'));
      expect(body, contains('tables'));
      expect(body['tables'], isA<List<dynamic>>());
      // Validate per-table diff shape.
      final tables = body['tables'] as List<dynamic>;
      if (tables.isNotEmpty) {
        final first = tables[0] as Map<String, dynamic>;
        expect(first, contains('table'));
        expect(first, contains('countThen'));
        expect(first, contains('countNow'));
        expect(first, contains('added'));
        expect(first, contains('removed'));
        expect(first, contains('unchanged'));
      }
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
      await startServer(queryCompare: mockQuery);
      final r = await httpGet(port!, '/api/compare/report');
      expect(r.status, HttpStatus.ok);
      // Contract: full compare report shape (doc/API.md § Compare).
      final body = r.body as Map<String, dynamic>;
      expect(body, contains('schemaSame'));
      expect(body['schemaSame'], isA<bool>());
      expect(body, contains('schemaDiff'));
      expect(body, contains('tablesOnlyInA'));
      expect(body['tablesOnlyInA'], isA<List<dynamic>>());
      expect(body, contains('tablesOnlyInB'));
      expect(body['tablesOnlyInB'], isA<List<dynamic>>());
      expect(body, contains('tableCounts'));
      expect(body['tableCounts'], isA<List<dynamic>>());
      expect(body, contains('generatedAt'));
      expect(body['generatedAt'], isA<String>());
    });

    test(
      'GET /api/migration/preview returns 501 without queryCompare',
      () async {
        await startServer();
        final r = await httpGet(port!, '/api/migration/preview');
        expect(r.status, HttpStatus.notImplemented);
      },
    );
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
      // Contract: full performance shape (doc/API.md § Performance).
      final body = r.body as Map<String, dynamic>;
      expect(body, contains('totalQueries'));
      expect(body['totalQueries'], isA<int>());
      expect(body, contains('totalDurationMs'));
      expect(body['totalDurationMs'], isA<int>());
      expect(body, contains('avgDurationMs'));
      expect(body['avgDurationMs'], isA<int>());
      expect(body, contains('slowQueries'));
      expect(body['slowQueries'], isA<List<dynamic>>());
      expect(body, contains('queryPatterns'));
      expect(body['queryPatterns'], isA<List<dynamic>>());
      expect(body, contains('recentQueries'));
      expect(body['recentQueries'], isA<List<dynamic>>());
    });

    test('DELETE /api/analytics/performance clears data', () async {
      final r = await httpDelete(port!, '/api/analytics/performance');
      expect(r.status, HttpStatus.ok);
      // Contract: {status: "cleared"} (doc/API.md § Performance).
      expect(r.body['status'], 'cleared');
    });

    test('GET /api/index-suggestions returns suggestions', () async {
      final r = await httpGet(port!, '/api/index-suggestions');
      expect(r.status, HttpStatus.ok);
      // Contract: {suggestions, tablesAnalyzed} shape
      // (doc/API.md § Analytics).
      final body = r.body as Map<String, dynamic>;
      expect(body, contains('suggestions'));
      expect(body['suggestions'], isA<List<dynamic>>());
      expect(body, contains('tablesAnalyzed'));
      expect(body['tablesAnalyzed'], isA<int>());
    });

    test('GET /api/analytics/anomalies returns anomaly report', () async {
      final r = await httpGet(port!, '/api/analytics/anomalies');
      expect(r.status, HttpStatus.ok);
      // Contract: {anomalies, tablesScanned, analyzedAt} shape
      // (doc/API.md § Analytics).
      final body = r.body as Map<String, dynamic>;
      expect(body, contains('anomalies'));
      expect(body['anomalies'], isA<List<dynamic>>());
      expect(body, contains('tablesScanned'));
      expect(body['tablesScanned'], isA<int>());
      expect(body, contains('analyzedAt'));
      expect(body['analyzedAt'], isA<String>());
    });

    test('GET /api/issues returns merged issues list', () async {
      final r = await httpGet(port!, '/api/issues');
      expect(r.status, HttpStatus.ok);
      final body = r.body as Map<String, dynamic>;
      expect(body, contains('issues'));
      expect(body['issues'], isA<List<dynamic>>());
      final issues = body['issues'] as List<dynamic>;
      for (final raw in issues) {
        final issue = raw as Map<String, dynamic>;
        expect(issue, contains('source'));
        expect(issue, contains('severity'));
        expect(issue, contains('table'));
        expect(issue, contains('message'));
        expect(
          issue['source'],
          anyOf('index-suggestion', 'anomaly'),
          reason: 'Stable issue shape (doc/API.md § Issues)',
        );
      }
    });

    test('GET /api/issues?sources=anomalies returns only anomalies', () async {
      final r = await httpGet(port!, '/api/issues?sources=anomalies');
      expect(r.status, HttpStatus.ok);
      final body = r.body as Map<String, dynamic>;
      expect(body['issues'], isA<List<dynamic>>());
      final issues = body['issues'] as List<dynamic>;
      for (final raw in issues) {
        expect((raw as Map<String, dynamic>)['source'], 'anomaly');
      }
    });

    test(
      'GET /api/issues?sources=index-suggestions returns only index suggestions',
      () async {
        final r = await httpGet(port!, '/api/issues?sources=index-suggestions');
        expect(r.status, HttpStatus.ok);
        final body = r.body as Map<String, dynamic>;
        expect(body['issues'], isA<List<dynamic>>());
        final issues = body['issues'] as List<dynamic>;
        for (final raw in issues) {
          expect((raw as Map<String, dynamic>)['source'], 'index-suggestion');
        }
      },
    );

    test('GET /api/analytics/size returns size analytics', () async {
      final r = await httpGet(port!, '/api/analytics/size');
      expect(r.status, HttpStatus.ok);
      // Contract: {pageSize, pageCount, totalSizeBytes, ..., tables}
      // shape (doc/API.md § Analytics).
      final body = r.body as Map<String, dynamic>;
      expect(body, contains('pageSize'));
      expect(body['pageSize'], isA<int>());
      expect(body, contains('pageCount'));
      expect(body, contains('totalSizeBytes'));
      expect(body, contains('freeSpaceBytes'));
      expect(body, contains('usedSizeBytes'));
      expect(body, contains('journalMode'));
      expect(body['journalMode'], isA<String>());
      expect(body, contains('tableCount'));
      expect(body, contains('tables'));
      expect(body['tables'], isA<List<dynamic>>());
    });

    // -------------------------------------------------------
    // Bug 044: analytics introspection queries must NOT
    // pollute the performance timing buffer. Before the fix,
    // calling /api/analytics/anomalies would record PRAGMA,
    // COUNT(*), and SELECT DISTINCT queries in queryTimings,
    // causing phantom slow-query-pattern diagnostics.
    // -------------------------------------------------------

    test(
      'anomaly scan does not record queries in performance timings',
      () async {
        // 1. Clear any timings from earlier requests.
        await httpDelete(port!, '/api/analytics/performance');

        // 2. Run an anomaly scan — this issues many internal
        //    queries (PRAGMA table_info, COUNT(*), SELECT
        //    DISTINCT, etc.) via the anomaly detector.
        final anomalyResp = await httpGet(port!, '/api/analytics/anomalies');
        expect(anomalyResp.status, HttpStatus.ok);
        expect(anomalyResp.body, contains('anomalies'));

        // 3. Fetch performance data — introspection queries
        //    from the anomaly scan must not appear here.
        final perfResp = await httpGet(port!, '/api/analytics/performance');
        expect(perfResp.status, HttpStatus.ok);
        final perfBody = perfResp.body as Map<String, dynamic>;

        // The performance endpoint itself is GET-only and uses
        // no SQL, so totalQueries should be 0 after clearing.
        expect(
          perfBody['totalQueries'],
          0,
          reason:
              'Anomaly scan introspection queries must not '
              'appear in performance timings (Bug 044)',
        );
      },
    );

    test(
      'index suggestions do not record queries in performance timings',
      () async {
        // Clear timings, run index suggestions, check timings.
        await httpDelete(port!, '/api/analytics/performance');
        final r = await httpGet(port!, '/api/index-suggestions');
        expect(r.status, HttpStatus.ok);

        final perfResp = await httpGet(port!, '/api/analytics/performance');
        final perfBody = perfResp.body as Map<String, dynamic>;

        expect(
          perfBody['totalQueries'],
          0,
          reason:
              'Index suggestion queries must not '
              'appear in performance timings (Bug 044)',
        );
      },
    );

    test(
      'size analytics does not record queries in performance timings',
      () async {
        // Clear timings, run size analytics, check timings.
        await httpDelete(port!, '/api/analytics/performance');
        final r = await httpGet(port!, '/api/analytics/size');
        expect(r.status, HttpStatus.ok);

        final perfResp = await httpGet(port!, '/api/analytics/performance');
        final perfBody = perfResp.body as Map<String, dynamic>;

        expect(
          perfBody['totalQueries'],
          0,
          reason:
              'Size analytics queries must not '
              'appear in performance timings (Bug 044)',
        );
      },
    );

    test(
      'issues endpoint does not record queries in performance timings',
      () async {
        // Clear timings, run merged issues, check timings.
        await httpDelete(port!, '/api/analytics/performance');
        final r = await httpGet(port!, '/api/issues');
        expect(r.status, HttpStatus.ok);

        final perfResp = await httpGet(port!, '/api/analytics/performance');
        final perfBody = perfResp.body as Map<String, dynamic>;

        expect(
          perfBody['totalQueries'],
          0,
          reason:
              'Issues endpoint queries must not '
              'appear in performance timings (Bug 044)',
        );
      },
    );
  });

  // =====================================================
  // DVR endpoints
  // =====================================================
  group('dvr endpoints', () {
    setUp(() async {
      await startServer();
    });

    test('POST /api/dvr/start and GET /api/dvr/status', () async {
      final started = await httpPost(port!, '/api/dvr/start');
      expect(started.status, HttpStatus.ok);
      expect(started.body['schemaVersion'], 1);

      final status = await httpGet(port!, '/api/dvr/status');
      expect(status.status, HttpStatus.ok);
      final data = (status.body['data'] as Map<String, dynamic>);
      expect(data['recording'], isTrue);
      expect(data['sessionId'], isA<String>());
      expect(data['queryCount'], isA<int>());
    });

    test('records SQL and returns it from /api/dvr/queries', () async {
      await httpPost(port!, '/api/dvr/start');
      final sqlResult = await httpPost(
        port!,
        '/api/sql',
        json: <String, dynamic>{'sql': 'SELECT * FROM items'},
      );
      expect(sqlResult.status, HttpStatus.ok);

      final queries = await httpGet(
        port!,
        '/api/dvr/queries?limit=20&direction=backward',
      );
      expect(queries.status, HttpStatus.ok);
      final data = queries.body['data'] as Map<String, dynamic>;
      final list = data['queries'] as List<dynamic>;
      expect(list, isNotEmpty);
      final first = list.first as Map<String, dynamic>;
      expect(first['sql'], contains('SELECT'));
      expect(first['sessionId'], isA<String>());
      expect(first['resultRowCount'], isA<int>());
    });

    test(
      'GET /api/dvr/query/:sessionId/:id returns QUERY_NOT_AVAILABLE for bad id',
      () async {
        await httpPost(port!, '/api/dvr/start');
        final status = await httpGet(port!, '/api/dvr/status');
        final sessionId =
            (status.body['data'] as Map<String, dynamic>)['sessionId']
                as String;
        final missing = await httpGet(
          port!,
          '/api/dvr/query/$sessionId/999999',
        );
        expect(missing.status, HttpStatus.notFound);
        expect(missing.body['error'], 'QUERY_NOT_AVAILABLE');
      },
    );

    test(
      'GET /api/dvr/query with wrong sessionId returns QUERY_NOT_AVAILABLE',
      () async {
        await httpPost(port!, '/api/dvr/start');
        await httpPost(
          port!,
          '/api/sql',
          json: <String, dynamic>{'sql': 'SELECT 1'},
        );
        final wrong = await httpGet(port!, '/api/dvr/query/wrong-session/0');
        expect(wrong.status, HttpStatus.notFound);
        expect(wrong.body['error'], 'QUERY_NOT_AVAILABLE');
      },
    );

    test(
      'POST /api/sql with args stores declared params on DVR entry',
      () async {
        await httpPost(port!, '/api/dvr/start');
        await httpPost(
          port!,
          '/api/sql',
          json: <String, dynamic>{
            'sql': 'SELECT * FROM items WHERE id = 1',
            'args': <dynamic>[1],
            'namedArgs': <String, dynamic>{'x': 42},
          },
        );
        final queries = await httpGet(
          port!,
          '/api/dvr/queries?limit=5&direction=backward',
        );
        expect(queries.status, HttpStatus.ok);
        final data = queries.body['data'] as Map<String, dynamic>;
        final list = data['queries'] as List<dynamic>;
        expect(list, isNotEmpty);
        final q = list.first as Map<String, dynamic>;
        final params = q['params'] as Map<String, dynamic>;
        expect((params['positional'] as List<dynamic>).length, 1);
        expect((params['named'] as Map<String, dynamic>)['x'], 42);
        expect(q['meta'], isA<Map<String, dynamic>>());
        final meta = q['meta'] as Map<String, dynamic>;
        expect(meta['bindingsUnavailable'], isFalse);
      },
    );

    test(
      'POST /api/dvr/config updates maxQueries and captureBeforeAfter',
      () async {
        await httpPost(port!, '/api/dvr/start');
        final cfg = await httpPost(
          port!,
          '/api/dvr/config',
          json: <String, dynamic>{'maxQueries': 2, 'captureBeforeAfter': false},
        );
        expect(cfg.status, HttpStatus.ok);
        final data = cfg.body['data'] as Map<String, dynamic>;
        expect(data['maxQueries'], 2);
        expect(data['captureBeforeAfter'], isFalse);

        final status = await httpGet(port!, '/api/dvr/status');
        final sdata = status.body['data'] as Map<String, dynamic>;
        expect(sdata['maxQueries'], 2);
        expect(sdata['captureBeforeAfter'], isFalse);
      },
    );
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
      // Contract: {id, url, expiresAt} shape (doc/API.md § Sessions).
      expect(r.body, containsPair('id', isA<String>()));
      expect(r.body, containsPair('url', isA<String>()));
      expect(r.body, containsPair('expiresAt', isA<String>()));
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
      // Contract: {state, createdAt, expiresAt, annotations} shape
      // (doc/API.md § Sessions).
      final body = r.body as Map<String, dynamic>;
      expect(body, contains('state'));
      expect(body, contains('createdAt'));
      expect(body['createdAt'], isA<String>());
      expect(body, contains('expiresAt'));
      expect(body['expiresAt'], isA<String>());
      expect(body, contains('annotations'));
      expect(body['annotations'], isA<List<dynamic>>());
      // Session stores the full POST body as its 'state' field.
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
        json: <String, dynamic>{'state': <String, dynamic>{}},
      );
      final id = created.body['id'] as String;

      final r = await httpPost(
        port!,
        '/api/session/$id/annotate',
        json: <String, dynamic>{'text': 'check this bug', 'author': 'tester'},
      );
      expect(r.status, HttpStatus.ok);
      // Contract: {status: "added"} (doc/API.md § Sessions).
      expect(r.body['status'], 'added');
    });
  });

  // =====================================================
  // Import endpoint
  // =====================================================
  group('import endpoint', () {
    test(
      'POST /api/import returns 501 when writeQuery not configured',
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
      },
    );

    test('POST /api/import succeeds with writeQuery configured', () async {
      final executedSql = <String>[];
      await startServer(writeQuery: (sql) async => executedSql.add(sql));

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
      // Contract: {imported, errors, format, table} shape
      // (doc/API.md § Import).
      final body = r.body as Map<String, dynamic>;
      expect(body['imported'], 1);
      expect(body, contains('errors'));
      expect(body['errors'], isA<List<dynamic>>());
      expect(body, contains('format'));
      expect(body['format'], isA<String>());
      expect(body, contains('table'));
      expect(body['table'], isA<String>());
    });

    test(
      'POST /api/cell/update returns 501 when writeQuery not configured',
      () async {
        await DriftDebugServer.stop();
        await startServer();
        final r = await httpPost(
          port!,
          '/api/cell/update',
          json: <String, dynamic>{
            'table': 'items',
            'pkColumn': 'id',
            'pkValue': 1,
            'column': 'title',
            'value': 'x',
          },
        );
        expect(r.status, HttpStatus.notImplemented);
      },
    );

    test('POST /api/cell/update succeeds with writeQuery configured', () async {
      final executedSql = <String>[];
      await DriftDebugServer.stop();
      await startServer(writeQuery: (sql) async => executedSql.add(sql));

      final r = await httpPost(
        port!,
        '/api/cell/update',
        json: <String, dynamic>{
          'table': 'items',
          'pkColumn': 'id',
          'pkValue': 1,
          'column': 'title',
          'value': 'Updated',
        },
      );
      expect(r.status, HttpStatus.ok);
      expect(r.body['ok'], isTrue);
      expect(executedSql, hasLength(1));
      expect(executedSql[0], contains('UPDATE "items"'));
      expect(executedSql[0], contains('"title"'));
      expect(executedSql[0], contains('WHERE "id"'));
    });

    test(
      'POST /api/cell/update rejects overflow integer string with 400',
      () async {
        final executedSql = <String>[];
        final integerAwareQuery = mockQueryWithTables(
          tableColumns: {
            'inventory': [
              <String, dynamic>{'name': 'id', 'type': 'INTEGER', 'pk': 1},
              <String, dynamic>{'name': 'qty', 'type': 'INTEGER', 'pk': 0},
            ],
          },
          tableData: {
            'inventory': [
              <String, dynamic>{'id': 1, 'qty': 3},
            ],
          },
          tableCounts: {'inventory': 1},
          tableForeignKeys: {'inventory': <Map<String, dynamic>>[]},
        );
        await DriftDebugServer.stop();
        await DriftDebugServer.start(
          query: integerAwareQuery,
          enabled: true,
          port: 0,
          writeQuery: (sql) async => executedSql.add(sql),
        );
        port = DriftDebugServer.port;

        final r = await httpPost(
          port!,
          '/api/cell/update',
          json: <String, dynamic>{
            'table': 'inventory',
            'pkColumn': 'id',
            'pkValue': 1,
            'column': 'qty',
            // Regex-valid integer that cannot be represented as Dart int.
            'value': '9999999999999999999999999999999999999999999',
          },
        );
        expect(r.status, HttpStatus.badRequest);
        expect((r.body as Map<String, dynamic>)['error'], isA<String>());
        // Validation failures must short-circuit before issuing SQL writes.
        expect(executedSql, isEmpty);
      },
    );

    test(
      'POST /api/cell/update rejects overflow real string with 400',
      () async {
        final executedSql = <String>[];
        final realAwareQuery = mockQueryWithTables(
          tableColumns: {
            'metrics': [
              <String, dynamic>{'name': 'id', 'type': 'INTEGER', 'pk': 1},
              <String, dynamic>{'name': 'value', 'type': 'REAL', 'pk': 0},
            ],
          },
          tableData: {
            'metrics': [
              <String, dynamic>{'id': 1, 'value': 1.0},
            ],
          },
          tableCounts: {'metrics': 1},
          tableForeignKeys: {'metrics': <Map<String, dynamic>>[]},
        );
        await DriftDebugServer.stop();
        await DriftDebugServer.start(
          query: realAwareQuery,
          enabled: true,
          port: 0,
          writeQuery: (sql) async => executedSql.add(sql),
        );
        port = DriftDebugServer.port;

        final r = await httpPost(
          port!,
          '/api/cell/update',
          json: <String, dynamic>{
            'table': 'metrics',
            'pkColumn': 'id',
            'pkValue': 1,
            'column': 'value',
            // Not a finite double; must be rejected by numeric coercion.
            'value': '1e1000000',
          },
        );
        expect(r.status, HttpStatus.badRequest);
        expect((r.body as Map<String, dynamic>)['error'], isA<String>());
        expect(executedSql, isEmpty);
      },
    );
  });

  group('edits batch endpoint', () {
    test('POST /api/edits/apply returns 501 without writeQuery', () async {
      await DriftDebugServer.stop();
      await startServer();
      final r = await httpPost(
        port!,
        '/api/edits/apply',
        json: <String, dynamic>{
          'statements': <String>[
            'UPDATE "items" SET "title" = \'x\' WHERE "id" = 1',
          ],
        },
      );
      expect(r.status, HttpStatus.notImplemented);
    });

    test('POST /api/edits/apply runs transaction with writeQuery', () async {
      final executedSql = <String>[];
      await DriftDebugServer.stop();
      await startServer(writeQuery: (sql) async => executedSql.add(sql));

      final r = await httpPost(
        port!,
        '/api/edits/apply',
        json: <String, dynamic>{
          'statements': <String>[
            'UPDATE "items" SET "title" = \'A\' WHERE "id" = 1',
            'DELETE FROM "items" WHERE "id" = 2',
          ],
        },
      );
      expect(r.status, HttpStatus.ok);
      final body = r.body as Map<String, dynamic>;
      expect(body['ok'], isTrue);
      expect(body['count'], 2);
      expect(executedSql.length, greaterThanOrEqualTo(4));
      expect(executedSql.first, contains('BEGIN'));
      expect(executedSql.last, contains('COMMIT'));
      expect(executedSql.where((s) => s.contains('UPDATE')), isNotEmpty);
      expect(executedSql.where((s) => s.contains('DELETE')), isNotEmpty);
    });

    test(
      'POST /api/edits/apply rejects invalid statement before transaction',
      () async {
        final executedSql = <String>[];
        await DriftDebugServer.stop();
        await startServer(writeQuery: (sql) async => executedSql.add(sql));

        final r = await httpPost(
          port!,
          '/api/edits/apply',
          json: <String, dynamic>{
            'statements': <String>['SELECT * FROM "items"'],
          },
        );
        expect(r.status, HttpStatus.internalServerError);
        final err = (r.body as Map<String, dynamic>)['error'] as String?;
        expect(err, isNotNull);
        // All statements validated before BEGIN — no writes or rollback needed.
        expect(executedSql, isEmpty);
      },
    );

    test(
      'POST /api/edits/apply returns failedIndex and failedStatement when a statement execution fails',
      () async {
        final executedSql = <String>[];
        await DriftDebugServer.stop();
        await startServer(
          writeQuery: (sql) async {
            executedSql.add(sql);
            if (sql.contains('DELETE FROM "items"')) {
              throw Exception('foreign key constraint failed');
            }
          },
        );

        final failedSql = 'DELETE FROM "items" WHERE "id" = 2';
        final r = await httpPost(
          port!,
          '/api/edits/apply',
          json: <String, dynamic>{
            'statements': <String>[
              'UPDATE "items" SET "title" = \'A\' WHERE "id" = 1',
              failedSql,
            ],
          },
        );
        expect(r.status, HttpStatus.internalServerError);
        final body = r.body as Map<String, dynamic>;
        expect(body['error'], isA<String>());
        expect(body['failedIndex'], 1);
        expect(body['failedStatement'], failedSql);
        expect(executedSql, contains('ROLLBACK;'));
      },
    );

    test(
      'POST /api/edits/apply rejects semicolon-chained SQL in one item',
      () async {
        final executedSql = <String>[];
        await DriftDebugServer.stop();
        await startServer(writeQuery: (sql) async => executedSql.add(sql));

        final r = await httpPost(
          port!,
          '/api/edits/apply',
          json: <String, dynamic>{
            'statements': <String>[
              'UPDATE "items" SET "title" = \'A\' WHERE "id" = 1; DELETE FROM "items" WHERE "id" = 2',
            ],
          },
        );
        expect(r.status, HttpStatus.internalServerError);
        final err = (r.body as Map<String, dynamic>)['error'] as String?;
        expect(err, isNotNull);
        expect(err, contains('Invalid data statement'));
        // Validation must fail before transaction start.
        expect(executedSql, isEmpty);
      },
    );
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
        expect(resp.headers.value('Access-Control-Allow-Origin'), isNull);
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

  // =====================================================
  // Rate limiting
  // =====================================================
  group('rate limiting', () {
    test('returns 429 when rate limit exceeded', () async {
      // Start server with a very low rate limit (2 req/s) so we can
      // trigger throttling without needing hundreds of requests.
      await DriftDebugServer.start(
        query: mockQuery,
        enabled: true,
        port: 0,
        maxRequestsPerSecond: 2,
      );
      port = DriftDebugServer.port;

      // First 2 requests should succeed.
      final r1 = await httpGet(port!, '/api/tables');
      expect(r1.status, HttpStatus.ok);
      final r2 = await httpGet(port!, '/api/tables');
      expect(r2.status, HttpStatus.ok);

      // 3rd request should be throttled.
      final r3 = await httpGet(port!, '/api/tables');
      expect(r3.status, HttpStatus.tooManyRequests);
      expect(r3.body['error'], contains('Rate limit'));
    });

    test('health endpoint is exempt from rate limiting', () async {
      await DriftDebugServer.start(
        query: mockQuery,
        enabled: true,
        port: 0,
        maxRequestsPerSecond: 1,
      );
      port = DriftDebugServer.port;

      // Exhaust the rate limit with a non-exempt endpoint.
      await httpGet(port!, '/api/tables');

      // Health should still succeed even though limit is exhausted,
      // because it is exempt.
      final r = await httpGet(port!, '/api/health');
      expect(r.status, HttpStatus.ok);
    });

    test('no rate limiting when maxRequestsPerSecond is null', () async {
      // Default (null) = no rate limiting.
      await DriftDebugServer.start(query: mockQuery, enabled: true, port: 0);
      port = DriftDebugServer.port;

      // Send many requests; all should succeed.
      for (int i = 0; i < 20; i++) {
        final r = await httpGet(port!, '/api/health');
        expect(r.status, HttpStatus.ok);
      }
    });
  });
}
