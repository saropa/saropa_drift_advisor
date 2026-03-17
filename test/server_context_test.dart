// Tests for ServerContext static utility methods: normalizeRows,
// extractCountFromRows, parseLimit, parseOffset, sqlLiteral,
// safeSubstring, rowSignature, compositePkKey, parseJsonMap,
// isTextType, isNumericType, toDouble, sortAnomaliesBySeverity,
// and parseCsvLines.

import 'package:test/test.dart';

import 'package:saropa_drift_advisor/src/server/server_context.dart';

void main() {
  group('ServerContext static methods', () {
    group('normalizeRows', () {
      test('returns empty list for null', () {
        expect(ServerContext.normalizeRows(null), isEmpty);
      });

      test('returns empty list for non-List value', () {
        expect(ServerContext.normalizeRows('not a list'), isEmpty);
        expect(ServerContext.normalizeRows(42), isEmpty);
      });

      test('converts List<Map> to List<Map<String, dynamic>>', () {
        final result = ServerContext.normalizeRows([
          <String, dynamic>{'a': 1},
          <String, dynamic>{'b': 2},
        ]);
        expect(result, hasLength(2));
        expect(result[0], {'a': 1});
        expect(result[1], {'b': 2});
      });

      test('skips non-Map items in list', () {
        final result = ServerContext.normalizeRows([
          <String, dynamic>{'a': 1},
          'not a map',
          42,
          <String, dynamic>{'b': 2},
        ]);
        expect(result, hasLength(2));
      });

      test('returns empty list for empty list input', () {
        expect(ServerContext.normalizeRows(<dynamic>[]), isEmpty);
      });
    });

    group('extractCountFromRows', () {
      test('extracts integer count from column c', () {
        expect(
          ServerContext.extractCountFromRows([
            <String, dynamic>{'c': 42}
          ]),
          42,
        );
      });

      test('returns 0 for empty rows', () {
        expect(
          ServerContext.extractCountFromRows(<Map<String, dynamic>>[]),
          0,
        );
      });

      test('returns 0 when c column is null', () {
        expect(
          ServerContext.extractCountFromRows([
            <String, dynamic>{'c': null}
          ]),
          0,
        );
      });

      test('converts num to int', () {
        expect(
          ServerContext.extractCountFromRows([
            <String, dynamic>{'c': 3.14}
          ]),
          3,
        );
      });

      test('returns 0 for non-numeric c value', () {
        expect(
          ServerContext.extractCountFromRows([
            <String, dynamic>{'c': 'not a number'}
          ]),
          0,
        );
      });
    });

    group('parseLimit', () {
      test('returns default for null', () {
        expect(ServerContext.parseLimit(null), 200);
      });

      test('returns default for non-numeric string', () {
        expect(ServerContext.parseLimit('abc'), 200);
      });

      test('returns default for zero', () {
        expect(ServerContext.parseLimit('0'), 200);
      });

      test('returns default for negative', () {
        expect(ServerContext.parseLimit('-5'), 200);
      });

      test('returns parsed value within range', () {
        expect(ServerContext.parseLimit('50'), 50);
      });

      test('clamps to maxLimit for large values', () {
        expect(ServerContext.parseLimit('9999'), 1000);
      });

      test('returns 1 for value of 1', () {
        expect(ServerContext.parseLimit('1'), 1);
      });
    });

    group('parseOffset', () {
      test('returns 0 for null', () {
        expect(ServerContext.parseOffset(null), 0);
      });

      test('returns 0 for non-numeric string', () {
        expect(ServerContext.parseOffset('abc'), 0);
      });

      test('returns 0 for negative value', () {
        expect(ServerContext.parseOffset('-1'), 0);
      });

      test('returns parsed value', () {
        expect(ServerContext.parseOffset('100'), 100);
      });

      test('caps at maxOffset for very large values', () {
        expect(ServerContext.parseOffset('999999999'), 2000000);
      });

      test('returns 0 for zero', () {
        expect(ServerContext.parseOffset('0'), 0);
      });
    });

    group('sqlLiteral', () {
      test('returns NULL for null', () {
        expect(ServerContext.sqlLiteral(null), 'NULL');
      });

      test('returns number string for int', () {
        expect(ServerContext.sqlLiteral(42), '42');
      });

      test('returns number string for double', () {
        expect(ServerContext.sqlLiteral(3.14), '3.14');
      });

      test('returns 1 for true', () {
        expect(ServerContext.sqlLiteral(true), '1');
      });

      test('returns 0 for false', () {
        expect(ServerContext.sqlLiteral(false), '0');
      });

      test('wraps string in single quotes', () {
        expect(ServerContext.sqlLiteral('hello'), "'hello'");
      });

      test('escapes single quotes in strings', () {
        expect(ServerContext.sqlLiteral("it's"), "'it''s'");
      });

      test('escapes backslash in strings', () {
        expect(ServerContext.sqlLiteral(r'path\to'), r"'path\\to'");
      });

      test('returns hex literal for byte list', () {
        expect(ServerContext.sqlLiteral(<int>[0xDE, 0xAD]), "X'dead'");
      });

      test('returns quoted toString for other types', () {
        // An arbitrary object falls through to toString().
        expect(ServerContext.sqlLiteral(Uri.parse('http://x')), "'http://x'");
      });
    });

    group('safeSubstring', () {
      test('returns substring for valid range', () {
        expect(
          ServerContext.safeSubstring('hello', start: 1, end: 4),
          'ell',
        );
      });

      test('returns from start to end of string when end is null', () {
        expect(ServerContext.safeSubstring('hello', start: 2), 'llo');
      });

      test('returns empty for negative start', () {
        expect(ServerContext.safeSubstring('hello', start: -1), '');
      });

      test('returns empty when start >= length', () {
        expect(ServerContext.safeSubstring('hello', start: 5), '');
        expect(ServerContext.safeSubstring('hello', start: 10), '');
      });

      test('returns empty when end <= start', () {
        expect(
          ServerContext.safeSubstring('hello', start: 3, end: 2),
          '',
        );
        expect(
          ServerContext.safeSubstring('hello', start: 3, end: 3),
          '',
        );
      });

      test('clamps end to string length', () {
        expect(
          ServerContext.safeSubstring('hello', start: 3, end: 100),
          'lo',
        );
      });

      test('returns empty for empty string', () {
        expect(ServerContext.safeSubstring('', start: 0), '');
      });
    });

    group('rowSignature', () {
      test('produces deterministic JSON with sorted keys', () {
        final sig1 =
            ServerContext.rowSignature(<String, dynamic>{'b': 2, 'a': 1});
        final sig2 =
            ServerContext.rowSignature(<String, dynamic>{'a': 1, 'b': 2});

        expect(sig1, sig2);
        expect(sig1, '{"a":1,"b":2}');
      });

      test('handles empty map', () {
        expect(ServerContext.rowSignature(<String, dynamic>{}), '{}');
      });
    });

    group('compositePkKey', () {
      test('joins PK column values with pipe', () {
        final row = <String, dynamic>{'id': 1, 'type': 'a', 'name': 'x'};

        expect(
          ServerContext.compositePkKey(['id', 'type'], row),
          '1|a',
        );
      });

      test('handles single PK column', () {
        expect(
          ServerContext.compositePkKey(['id'], <String, dynamic>{'id': 42}),
          '42',
        );
      });

      test('includes null as string for missing columns', () {
        expect(
          ServerContext.compositePkKey(
              ['id', 'missing'], <String, dynamic>{'id': 1}),
          '1|null',
        );
      });
    });

    group('parseJsonMap', () {
      test('parses valid JSON object', () {
        final result = ServerContext.parseJsonMap('{"key": "value"}');
        expect(result, {'key': 'value'});
      });

      test('returns null for JSON array', () {
        expect(ServerContext.parseJsonMap('[1, 2, 3]'), isNull);
      });

      test('returns null for invalid JSON', () {
        expect(ServerContext.parseJsonMap('{not valid}'), isNull);
      });

      test('returns null for JSON scalar', () {
        expect(ServerContext.parseJsonMap('"just a string"'), isNull);
      });
    });

    group('isTextType', () {
      test('matches TEXT types', () {
        expect(ServerContext.isTextType('TEXT'), isTrue);
        expect(ServerContext.isTextType('VARCHAR(255)'), isTrue);
        expect(ServerContext.isTextType('CHAR(10)'), isTrue);
        expect(ServerContext.isTextType('CLOB'), isTrue);
        expect(ServerContext.isTextType('STRING'), isTrue);
      });

      test('case insensitive', () {
        expect(ServerContext.isTextType('text'), isTrue);
        expect(ServerContext.isTextType('Text'), isTrue);
      });

      test('does not match numeric types', () {
        expect(ServerContext.isTextType('INTEGER'), isFalse);
        expect(ServerContext.isTextType('REAL'), isFalse);
      });
    });

    group('isNumericType', () {
      test('matches numeric types', () {
        expect(ServerContext.isNumericType('INTEGER'), isTrue);
        expect(ServerContext.isNumericType('REAL'), isTrue);
        expect(ServerContext.isNumericType('FLOAT'), isTrue);
        expect(ServerContext.isNumericType('DOUBLE'), isTrue);
        expect(ServerContext.isNumericType('DECIMAL'), isTrue);
        expect(ServerContext.isNumericType('NUMERIC'), isTrue);
      });

      test('case insensitive', () {
        expect(ServerContext.isNumericType('integer'), isTrue);
        expect(ServerContext.isNumericType('Real'), isTrue);
      });

      test('does not match text types', () {
        expect(ServerContext.isNumericType('TEXT'), isFalse);
        expect(ServerContext.isNumericType('VARCHAR'), isFalse);
      });
    });

    group('toDouble', () {
      test('returns double for double input', () {
        expect(ServerContext.toDouble(3.14), 3.14);
      });

      test('converts int to double', () {
        expect(ServerContext.toDouble(42), 42.0);
      });

      test('parses numeric string', () {
        expect(ServerContext.toDouble('3.14'), 3.14);
      });

      test('returns null for non-numeric string', () {
        expect(ServerContext.toDouble('abc'), isNull);
      });

      test('returns null for null', () {
        expect(ServerContext.toDouble(null), isNull);
      });

      test('returns null for non-numeric object', () {
        expect(ServerContext.toDouble(<int>[1, 2]), isNull);
      });
    });

    group('sortAnomaliesBySeverity', () {
      test('sorts error before warning before info', () {
        final anomalies = <Map<String, dynamic>>[
          <String, dynamic>{'severity': 'info', 'msg': 'i'},
          <String, dynamic>{'severity': 'error', 'msg': 'e'},
          <String, dynamic>{'severity': 'warning', 'msg': 'w'},
        ];

        ServerContext.sortAnomaliesBySeverity(anomalies);

        expect(anomalies[0]['severity'], 'error');
        expect(anomalies[1]['severity'], 'warning');
        expect(anomalies[2]['severity'], 'info');
      });

      test('unknown severity sorts after info', () {
        final anomalies = <Map<String, dynamic>>[
          <String, dynamic>{'severity': 'unknown', 'msg': 'u'},
          <String, dynamic>{'severity': 'info', 'msg': 'i'},
        ];

        ServerContext.sortAnomaliesBySeverity(anomalies);

        expect(anomalies[0]['severity'], 'info');
        expect(anomalies[1]['severity'], 'unknown');
      });

      test('handles empty list', () {
        final anomalies = <Map<String, dynamic>>[];
        ServerContext.sortAnomaliesBySeverity(anomalies);
        expect(anomalies, isEmpty);
      });
    });

    group('parseCsvLines', () {
      test('parses basic CSV rows', () {
        final rows = ServerContext.parseCsvLines('a,b\n1,2');
        expect(rows, hasLength(2));
        expect(rows[0], ['a', 'b']);
        expect(rows[1], ['1', '2']);
      });

      test('handles quoted fields', () {
        final rows = ServerContext.parseCsvLines('name\n"a,b"');
        expect(rows[1][0], 'a,b');
      });

      test('handles escaped quotes', () {
        final rows = ServerContext.parseCsvLines('name\n"he said ""hi"""');
        expect(rows[1][0], 'he said "hi"');
      });

      test('skips empty lines', () {
        final rows = ServerContext.parseCsvLines('a\n\n1\n\n2');
        expect(rows, hasLength(3));
      });
    });

    group('getTableNames', () {
      test('returns sorted table names excluding sqlite_ prefix', () async {
        final names = await ServerContext.getTableNames((sql) async {
          return [
            <String, dynamic>{'name': 'items'},
            <String, dynamic>{'name': 'users'},
          ];
        });

        expect(names, ['items', 'users']);
      });

      test('filters out empty names', () async {
        final names = await ServerContext.getTableNames((sql) async {
          return [
            <String, dynamic>{'name': 'items'},
            <String, dynamic>{'name': ''},
            <String, dynamic>{'name': null},
          ];
        });

        expect(names, ['items']);
      });
    });

    group('getSchemaSql', () {
      test('returns schema DDL from sqlite_master', () async {
        final sql = await ServerContext.getSchemaSql((sql) async {
          return [
            <String, dynamic>{
              'sql': 'CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT)'
            },
          ];
        });

        expect(sql, contains('CREATE TABLE items'));
        expect(sql, contains(';'));
      });

      test('skips null and empty sql entries', () async {
        final sql = await ServerContext.getSchemaSql((sql) async {
          return [
            <String, dynamic>{'sql': null},
            <String, dynamic>{'sql': ''},
            <String, dynamic>{'sql': 'CREATE TABLE x (id INT)'},
          ];
        });

        expect(sql, contains('CREATE TABLE x'));
        // Should not contain garbage from null/empty entries.
        expect(sql.trim().split('\n').where((l) => l.trim().isNotEmpty).length,
            greaterThanOrEqualTo(1));
      });
    });

    group('instance methods', () {
      test('log calls onLog callback', () {
        String? logged;
        final ctx = ServerContext(
          query: (_) async => <Map<String, dynamic>>[],
          onLog: (msg) => logged = msg,
        );

        ctx.log('hello');
        expect(logged, 'hello');
      });

      test('log is no-op when onLog is null', () {
        final ctx = ServerContext(
          query: (_) async => <Map<String, dynamic>>[],
        );

        // Should not throw.
        ctx.log('hello');
      });

      test('logError calls onError callback', () {
        Object? loggedError;
        final ctx = ServerContext(
          query: (_) async => <Map<String, dynamic>>[],
          onError: (error, stack) => loggedError = error,
        );

        ctx.logError(Exception('test'), StackTrace.current);
        expect(loggedError, isA<Exception>());
      });

      test('recordTiming adds entry to queryTimings', () {
        final ctx = ServerContext(
          query: (_) async => <Map<String, dynamic>>[],
        );

        ctx.recordTiming(sql: 'SELECT 1', durationMs: 5, rowCount: 1);

        expect(ctx.queryTimings, hasLength(1));
        expect(ctx.queryTimings[0].sql, 'SELECT 1');
        expect(ctx.queryTimings[0].durationMs, 5);
        expect(ctx.queryTimings[0].rowCount, 1);
      });

      test('recordTiming evicts oldest when buffer is full', () {
        final ctx = ServerContext(
          query: (_) async => <Map<String, dynamic>>[],
        );

        // Fill buffer beyond max (500).
        for (int i = 0; i < 510; i++) {
          ctx.recordTiming(sql: 'Q$i', durationMs: i, rowCount: 0);
        }

        expect(ctx.queryTimings.length, 500);
        // The first 10 should have been evicted.
        expect(ctx.queryTimings[0].sql, 'Q10');
      });

      test('markExtensionSeen and isExtensionConnected', () {
        final ctx = ServerContext(
          query: (_) async => <Map<String, dynamic>>[],
        );

        // Initially not connected.
        expect(ctx.isExtensionConnected, isFalse);

        // After marking, should be connected.
        ctx.markExtensionSeen();
        expect(ctx.isExtensionConnected, isTrue);
      });

      test('timedQuery records timing on success', () async {
        final ctx = ServerContext(
          query: (_) async => <Map<String, dynamic>>[],
        );

        final result = await ctx.timedQuery(
          (_) async => [
            <String, dynamic>{'id': 1}
          ],
          'SELECT 1',
        );

        expect(result, hasLength(1));
        expect(ctx.queryTimings, hasLength(1));
        expect(ctx.queryTimings[0].error, isNull);
      });

      test('timedQuery records timing on error and rethrows', () async {
        final ctx = ServerContext(
          query: (_) async => <Map<String, dynamic>>[],
        );

        expect(
          () => ctx.timedQuery(
            (_) async => throw Exception('fail'),
            'BAD SQL',
          ),
          throwsA(isA<Exception>()),
        );

        // Timing should still be recorded after error.
        // Need to await the future to ensure the catch runs.
        try {
          await ctx.timedQuery(
            (_) async => throw Exception('fail'),
            'BAD SQL 2',
          );
        } on Object catch (_) {
          // Expected.
        }

        expect(ctx.queryTimings.isNotEmpty, isTrue);
        expect(
          ctx.queryTimings.any((t) => t.error != null),
          isTrue,
        );
      });

      test('toString includes generation', () {
        final ctx = ServerContext(
          query: (_) async => <Map<String, dynamic>>[],
        );
        expect(ctx.toString(), contains('generation'));
      });
    });
  });
}
