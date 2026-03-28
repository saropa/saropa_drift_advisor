// Unit tests for GenerationHandler — generation polling and web asset paths.
//
// Covers getCurrentGeneration with a minimal ServerContext, and a smoke test
// for sendWebStyle: on Flutter mobile, UnsupportedError from package URI
// resolution must not surface through onError (regression guard when run on
// device); on the Dart VM, behavior is unchanged (serve or 404 without errors).

import 'dart:io';

import 'package:saropa_drift_advisor/src/server/generation_handler.dart';
import 'package:test/test.dart';

import 'helpers/test_helpers.dart';

void main() {
  group('GenerationHandler', () {
    group('getCurrentGeneration', () {
      test('returns current generation value', () async {
        final ctx = createTestContext();
        final handler = GenerationHandler(ctx);

        // Initial generation is 0.
        final gen = await handler.getCurrentGeneration();
        expect(gen, 0);
      });

      test('returns bumped generation when data has changed', () async {
        // Simulate a data change: the first checkDataChange call
        // establishes a baseline signature, subsequent calls with a
        // different signature bump the generation.
        var callCount = 0;
        final ctx = createTestContext(
          query: (sql) async {
            // Table names query.
            if (sql.contains("type='table'") && sql.contains('ORDER BY name')) {
              return [
                {'name': 'items'},
              ];
            }
            // UNION ALL signature query — return different counts
            // to simulate a data change.
            if (sql.contains('UNION ALL') || sql.contains("AS t")) {
              callCount++;
              return [
                {'t': 'items', 'c': callCount},
              ];
            }
            return <Map<String, dynamic>>[];
          },
        );
        final handler = GenerationHandler(ctx);

        // First call establishes baseline (generation stays 0).
        final gen1 = await handler.getCurrentGeneration();
        expect(gen1, 0);

        // Second call detects a change (count changed from 1 to 2).
        final gen2 = await handler.getCurrentGeneration();
        expect(gen2, 1);
      });

      test('returns 0 when schema has no tables', () async {
        final ctx = createTestContext(
          query: (sql) async {
            if (sql.contains("type='table'") && sql.contains('ORDER BY name')) {
              return <Map<String, dynamic>>[];
            }
            return <Map<String, dynamic>>[];
          },
        );
        final handler = GenerationHandler(ctx);

        final gen = await handler.getCurrentGeneration();
        expect(gen, 0);
      });
    });

    group('sendWebStyle', () {
      test('completes with 200 or 404 and does not invoke onError', () async {
        final errors = <Object>[];
        final ctx = createTestContext(onError: (e, st) => errors.add(e));
        final handler = GenerationHandler(ctx);

        final server = await HttpServer.bind('127.0.0.1', 0);
        server.listen((HttpRequest request) async {
          await handler.sendWebStyle(request.response);
        });

        final client = HttpClient();
        try {
          final request = await client.getUrl(
            Uri.parse('http://127.0.0.1:${server.port}/assets/web/style.css'),
          );
          final response = await request.close().timeout(
            const Duration(seconds: 10),
          );

          // VM/desktop often serves the real file; Flutter mobile returns 404
          // and loads CDN — both are valid; neither should report resolution
          // as an application error (see UnsupportedError handling).
          expect(response.statusCode, anyOf(200, 404));
          expect(errors, isEmpty);
        } finally {
          client.close(force: true);
          await server.close(force: true);
        }
      });
    });
  });
}
