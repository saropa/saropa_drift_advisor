import 'dart:convert';
import 'dart:io';

import 'package:test/test.dart';

import 'package:saropa_drift_viewer/saropa_drift_viewer.dart';

void main() {
  test('start with enabled: false is a no-op and does not throw', () async {
    await DriftDebugServer.start(
      query: (_) async => <Map<String, dynamic>>[],
      enabled: false,
    );
  });

  test('DriftDebugErrorLogger callbacks never throw', () {
    final log = DriftDebugErrorLogger.logCallback(prefix: 'Test');
    final error = DriftDebugErrorLogger.errorCallback(prefix: 'Test');

    expect(() => log('message'), returnsNormally);
    expect(
      () => error(Exception('test'), StackTrace.current),
      returnsNormally,
    );
  });

  test('DriftDebugErrorLogger.callbacks returns both callbacks', () {
    final c = DriftDebugErrorLogger.callbacks(prefix: 'Test');
    expect(c.log, isNotNull);
    expect(c.error, isNotNull);
    expect(() => c.log('x'), returnsNormally);
    expect(
      () => c.error(Exception('e'), StackTrace.current),
      returnsNormally,
    );
  });

  test('stop when server not started is no-op and does not throw', () async {
    await DriftDebugServer.stop();
  });

  group('export endpoints', () {
    late Future<List<Map<String, dynamic>>> Function(String sql) mockQuery;

    setUp(() {
      mockQuery = (String sql) async {
        if (sql.contains('ORDER BY type, name')) {
          return [
            {
              'type': 'table',
              'name': 'items',
              'sql': 'CREATE TABLE items(id INTEGER PRIMARY KEY, name TEXT);',
            },
          ];
        }
        if (sql.contains("type='table'") && sql.contains('ORDER BY name')) {
          return [{'name': 'items'}];
        }
        if (sql.contains('SELECT * FROM "items"')) {
          return [
            {'id': 1, 'name': 'first'},
            {'id': 2, 'name': "second's"},
          ];
        }
        return <Map<String, dynamic>>[];
      };
    });

    tearDown(() async {
      await DriftDebugServer.stop();
    });

    test('GET /api/schema returns schema SQL without data', () async {
      await DriftDebugServer.start(
        query: mockQuery,
        enabled: true,
        port: 0,
      );
      final port = DriftDebugServer.port;
      expect(port, isNotNull);

      final client = HttpClient();
      try {
        final req = await client.get('localhost', port!, '/api/schema');
        final resp = await req.close();
        expect(resp.statusCode, HttpStatus.ok);
        final body = await resp.transform(utf8.decoder).join();
        expect(body, contains('CREATE TABLE items'));
        expect(body, isNot(contains('INSERT INTO')));
        expect(resp.headers.value('content-disposition'), contains('schema.sql'));
      } finally {
        client.close();
      }
    });

    test('GET /api/dump returns schema plus INSERT statements', () async {
      await DriftDebugServer.start(
        query: mockQuery,
        enabled: true,
        port: 0,
      );
      final port = DriftDebugServer.port;
      expect(port, isNotNull);

      final client = HttpClient();
      try {
        final req = await client.get('localhost', port!, '/api/dump');
        final resp = await req.close();
        expect(resp.statusCode, HttpStatus.ok);
        final body = await resp.transform(utf8.decoder).join();
        expect(body, contains('CREATE TABLE items'));
        expect(body, contains('INSERT INTO "items"'));
        expect(body, contains("'first'"));
        expect(body, contains("'second''s'"));
        expect(resp.headers.value('content-disposition'), contains('dump.sql'));
      } finally {
        client.close();
      }
    });
  });
}
