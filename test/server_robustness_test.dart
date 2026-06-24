// Tests for the server robustness + discovery hardening filed in
// plans/history/2026.06/2026.06.24/BUG_loopback_server_wedges_and_hard_to_discover_for_agents.md:
//   E2 — POST /api/sql never wedges: statement timeout, always-JSON responses
//        (encode-safe), and a bounded (truncated) result envelope.
//   E1 — discoverability: GET /api/health advertises endpoints, and GET /api/
//        serves a self-describing endpoint index.

import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:test/test.dart';

import 'package:saropa_drift_advisor/saropa_drift_advisor.dart';
import 'package:saropa_drift_advisor/src/server/server_constants.dart';
import 'package:saropa_drift_advisor/src/server/sql_handler.dart';

import 'helpers/test_helpers.dart';

void main() {
  // =====================================================
  // E2 — statement timeout (unit, via SqlHandler with a short timeout so the
  // production 30s default does not stall the suite).
  // =====================================================
  group('SQL statement timeout', () {
    test('a hung query returns the timeout error, not a hang', () async {
      // A never-completing future stands in for a query wedged in the host DB
      // layer. The .timeout() must fire and surface errorSqlTimeout. Using a
      // Completer (not Future.delayed) means there is no pending timer left
      // dangling after the test.
      final ctx = createTestContext(
        sqlStatementTimeout: const Duration(milliseconds: 50),
      );
      final handler = SqlHandler(ctx);

      final result = await handler.runSqlResult(
        (_) => Completer<List<Map<String, dynamic>>>().future,
        'SELECT * FROM items',
      );

      expect(
        result[ServerConstants.jsonKeyError],
        ServerConstants.errorSqlTimeout,
      );
      expect(result.containsKey(ServerConstants.jsonKeyRows), isFalse);
    });

    test('a fast query under the timeout returns rows normally', () async {
      final ctx = createTestContext(
        sqlStatementTimeout: const Duration(seconds: 5),
      );
      final handler = SqlHandler(ctx);

      final result = await handler.runSqlResult(
        (_) async => [
          <String, dynamic>{'id': 1},
        ],
        'SELECT id FROM items',
      );

      expect(result[ServerConstants.jsonKeyRows], hasLength(1));
    });
  });

  // =====================================================
  // E2 — encode-safe responses + bounded results (integration, via the real
  // server so the full handler + writeJsonResponse path is covered).
  // =====================================================
  group('SQL response robustness', () {
    int? port;

    tearDown(() async {
      await DriftDebugServer.stop();
      port = null;
    });

    Future<void> startWith(DriftDebugQuery query) async {
      await DriftDebugServer.start(query: query, port: 0);
      port = DriftDebugServer.port;
    }

    test(
      'a DateTime in a result row encodes to a string, not an empty body',
      () async {
        // Before the fix, a non-encodable value (DateTime) made jsonEncode throw
        // after headers were set, producing the reported "empty 200, no rows,
        // no error" body. writeJsonResponse + jsonEncodeFallback must turn it
        // into an ISO string so the response is always well-formed.
        await startWith(
          (sql) async => sql.contains('events')
              ? [
                  <String, dynamic>{'when': DateTime.utc(2020, 1, 2, 3, 4, 5)},
                ]
              : <Map<String, dynamic>>[],
        );

        final r = await httpPost(
          port!,
          '/api/sql',
          json: <String, dynamic>{'sql': 'SELECT "when" FROM events'},
        );

        expect(r.status, HttpStatus.ok);
        final rows = (r.body as Map<String, dynamic>)['rows'] as List<dynamic>;
        expect(rows, hasLength(1));
        expect((rows.first as Map)['when'], '2020-01-02T03:04:05.000Z');
      },
    );

    test('a result wider than the row cap is truncated with a flag', () async {
      final rowCount = ServerConstants.maxSqlResultRows + 1;
      await startWith(
        (sql) async => sql.contains('big')
            ? List<Map<String, dynamic>>.generate(
                rowCount,
                (i) => <String, dynamic>{'id': i},
              )
            : <Map<String, dynamic>>[],
      );

      final r = await httpPost(
        port!,
        '/api/sql',
        json: <String, dynamic>{'sql': 'SELECT id FROM big'},
      );

      expect(r.status, HttpStatus.ok);
      final body = r.body as Map<String, dynamic>;
      expect(
        (body['rows'] as List<dynamic>),
        hasLength(ServerConstants.maxSqlResultRows),
      );
      expect(body['truncated'], isTrue);
      expect(body['rowCount'], rowCount);
    });

    test('a query error returns JSON error and health still answers', () async {
      // A failing query must return a JSON error (not an empty/abandoned
      // response), and a subsequent /api/health probe must still succeed — the
      // server stays live through a bad request.
      await startWith((sql) async {
        if (sql.contains('boom')) {
          throw StateError('boom');
        }
        return <Map<String, dynamic>>[];
      });

      final bad = await httpPost(
        port!,
        '/api/sql',
        json: <String, dynamic>{'sql': 'SELECT * FROM boom'},
      );
      expect(bad.status, HttpStatus.internalServerError);
      expect((bad.body as Map<String, dynamic>)['error'], isA<String>());

      final health = await httpGet(port!, '/api/health');
      expect(health.status, HttpStatus.ok);
      expect((health.body as Map<String, dynamic>)['ok'], isTrue);
    });
  });

  // =====================================================
  // E1 — discoverability.
  // =====================================================
  group('API discovery', () {
    int? port;

    setUp(() async {
      await DriftDebugServer.start(
        query: (_) async => <Map<String, dynamic>>[],
        port: 0,
      );
      port = DriftDebugServer.port;
    });

    tearDown(() async {
      await DriftDebugServer.stop();
      port = null;
    });

    test('GET /api/health advertises the read endpoints', () async {
      final r = await httpGet(port!, '/api/health');
      expect(r.status, HttpStatus.ok);
      final endpoints =
          (r.body as Map<String, dynamic>)['endpoints'] as List<dynamic>;
      expect(endpoints, contains('/api/sql'));
      expect(endpoints, contains('/api/health'));
    });

    test('GET /api/ returns a self-describing endpoint index', () async {
      final r = await httpGet(port!, '/api/');
      expect(r.status, HttpStatus.ok);
      final body = r.body as Map<String, dynamic>;
      expect(body['name'], ServerConstants.appDisplayName);
      expect(body['version'], ServerConstants.packageVersion);
      expect(body['docs'], isA<String>());
      final endpoints = body['endpoints'] as List<dynamic>;
      expect(endpoints, isNotEmpty);
      final sqlEntry = endpoints.firstWhere(
        (e) => (e as Map)['path'] == '/api/sql',
        orElse: () => null,
      );
      expect(sqlEntry, isNotNull, reason: 'index must list POST /api/sql');
      expect((sqlEntry as Map)['method'], 'POST');
      expect(sqlEntry['description'], isA<String>());
    });

    test('GET /api (no trailing slash) also returns the index', () async {
      final r = await httpGet(port!, '/api');
      expect(r.status, HttpStatus.ok);
      expect(
        (r.body as Map<String, dynamic>)['endpoints'],
        isA<List<dynamic>>(),
      );
    });
  });

  // =====================================================
  // E1 — discovery manifest lifecycle. Guarded: when no home directory is
  // resolvable (some CI), the manifest is skipped by design, so skip the test
  // rather than assert a file that is never written.
  // =====================================================
  group('discovery manifest', () {
    final env = Platform.environment;
    final home = env['USERPROFILE'] ?? env['HOME'];

    test('written on start with the bound port, removed on stop', () async {
      if (home == null || home.isEmpty) {
        // No home dir → manifest is intentionally skipped; nothing to assert.
        return;
      }
      final file = File(
        '$home/${ServerConstants.discoveryDirName}/'
        '${ServerConstants.discoveryFileName}',
      );

      await DriftDebugServer.start(
        query: (_) async => <Map<String, dynamic>>[],
        port: 0,
      );
      final boundPort = DriftDebugServer.port;

      expect(await file.exists(), isTrue, reason: 'manifest must be written');
      final decoded =
          jsonDecode(await file.readAsString()) as Map<String, dynamic>;
      expect(decoded[ServerConstants.jsonKeyPort], boundPort);
      expect(
        decoded[ServerConstants.jsonKeyHost],
        ServerConstants.discoveryHost,
      );
      expect(
        decoded[ServerConstants.jsonKeyVersion],
        ServerConstants.packageVersion,
      );
      expect(decoded[ServerConstants.jsonKeyEndpoints], isA<List<dynamic>>());

      await DriftDebugServer.stop();
      expect(
        await file.exists(),
        isFalse,
        reason: 'manifest must be removed on stop (own pid)',
      );
    });
  });
}
