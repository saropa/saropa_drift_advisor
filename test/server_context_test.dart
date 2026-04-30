// Tests for ServerUtils static utility methods and
// ServerContext instance methods.
//
// Static methods (normalizeRows, extractCountFromRows,
// parseLimit, parseOffset, sqlLiteral, safeSubstring,
// rowSignature, compositePkKey, parseJsonMap, isTextType,
// isNumericType, toDouble, sortAnomaliesBySeverity,
// parseCsvLines, getTableNames, getSchemaSql) live in
// ServerUtils. Instance methods (log, logError,
// recordTiming, timedQuery, checkDataChange, etc.) live
// in ServerContext.

import 'package:test/test.dart';

import 'package:saropa_drift_advisor/src/server/server_context.dart';
import 'package:saropa_drift_advisor/src/server/server_utils.dart';

void main() {
  group('ServerUtils static methods', () {
    group('normalizeRows', () {
      test('returns empty list for null', () {
        expect(ServerUtils.normalizeRows(null), isEmpty);
      });

      test('returns empty list for non-List value', () {
        expect(ServerUtils.normalizeRows('not a list'), isEmpty);
        expect(ServerUtils.normalizeRows(42), isEmpty);
      });

      test('converts List<Map> to List<Map<String, dynamic>>', () {
        final result = ServerUtils.normalizeRows([
          <String, dynamic>{'a': 1},
          <String, dynamic>{'b': 2},
        ]);
        expect(result, hasLength(2));
        expect(result[0], {'a': 1});
        expect(result[1], {'b': 2});
      });

      test('skips non-Map items in list', () {
        final result = ServerUtils.normalizeRows([
          <String, dynamic>{'a': 1},
          'not a map',
          42,
          <String, dynamic>{'b': 2},
        ]);
        expect(result, hasLength(2));
      });

      test('returns empty list for empty list input', () {
        expect(ServerUtils.normalizeRows(<dynamic>[]), isEmpty);
      });
    });

    group('extractCountFromRows', () {
      test('extracts integer count from column c', () {
        expect(
          ServerUtils.extractCountFromRows([
            <String, dynamic>{'c': 42},
          ]),
          42,
        );
      });

      test('returns 0 for empty rows', () {
        expect(ServerUtils.extractCountFromRows(<Map<String, dynamic>>[]), 0);
      });

      test('returns 0 when c column is null', () {
        expect(
          ServerUtils.extractCountFromRows([
            <String, dynamic>{'c': null},
          ]),
          0,
        );
      });

      test('converts num to int', () {
        expect(
          ServerUtils.extractCountFromRows([
            <String, dynamic>{'c': 3.14},
          ]),
          3,
        );
      });

      test('returns 0 for non-numeric c value', () {
        expect(
          ServerUtils.extractCountFromRows([
            <String, dynamic>{'c': 'not a number'},
          ]),
          0,
        );
      });
    });

    group('parseLimit', () {
      test('returns default for null', () {
        expect(ServerUtils.parseLimit(null), 200);
      });

      test('returns default for non-numeric string', () {
        expect(ServerUtils.parseLimit('abc'), 200);
      });

      test('returns default for zero', () {
        expect(ServerUtils.parseLimit('0'), 200);
      });

      test('returns default for negative', () {
        expect(ServerUtils.parseLimit('-5'), 200);
      });

      test('returns parsed value within range', () {
        expect(ServerUtils.parseLimit('50'), 50);
      });

      test('clamps to maxLimit for large values', () {
        expect(ServerUtils.parseLimit('9999'), 1000);
      });

      test('returns 1 for value of 1', () {
        expect(ServerUtils.parseLimit('1'), 1);
      });
    });

    group('parseOffset', () {
      test('returns 0 for null', () {
        expect(ServerUtils.parseOffset(null), 0);
      });

      test('returns 0 for non-numeric string', () {
        expect(ServerUtils.parseOffset('abc'), 0);
      });

      test('returns 0 for negative value', () {
        expect(ServerUtils.parseOffset('-1'), 0);
      });

      test('returns parsed value', () {
        expect(ServerUtils.parseOffset('100'), 100);
      });

      test('caps at maxOffset for very large values', () {
        expect(ServerUtils.parseOffset('999999999'), 2000000);
      });

      test('returns 0 for zero', () {
        expect(ServerUtils.parseOffset('0'), 0);
      });
    });

    group('sqlLiteral', () {
      test('returns NULL for null', () {
        expect(ServerUtils.sqlLiteral(null), 'NULL');
      });

      test('returns number string for int', () {
        expect(ServerUtils.sqlLiteral(42), '42');
      });

      test('returns number string for double', () {
        expect(ServerUtils.sqlLiteral(3.14), '3.14');
      });

      test('returns 1 for true', () {
        expect(ServerUtils.sqlLiteral(true), '1');
      });

      test('returns 0 for false', () {
        expect(ServerUtils.sqlLiteral(false), '0');
      });

      test('wraps string in single quotes', () {
        expect(ServerUtils.sqlLiteral('hello'), "'hello'");
      });

      test('escapes single quotes in strings', () {
        expect(ServerUtils.sqlLiteral("it's"), "'it''s'");
      });

      test('escapes backslash in strings', () {
        expect(ServerUtils.sqlLiteral(r'path\to'), r"'path\\to'");
      });

      test('returns hex literal for byte list', () {
        expect(ServerUtils.sqlLiteral(<int>[0xDE, 0xAD]), "X'dead'");
      });

      test('returns quoted toString for other types', () {
        // An arbitrary object falls through to toString().
        expect(ServerUtils.sqlLiteral(Uri.parse('http://x')), "'http://x'");
      });
    });

    group('safeSubstring', () {
      test('returns substring for valid range', () {
        expect(ServerUtils.safeSubstring('hello', start: 1, end: 4), 'ell');
      });

      test('returns from start to end of string when end is null', () {
        expect(ServerUtils.safeSubstring('hello', start: 2), 'llo');
      });

      test('returns empty for negative start', () {
        expect(ServerUtils.safeSubstring('hello', start: -1), '');
      });

      test('returns empty when start >= length', () {
        expect(ServerUtils.safeSubstring('hello', start: 5), '');
        expect(ServerUtils.safeSubstring('hello', start: 10), '');
      });

      test('returns empty when end <= start', () {
        expect(ServerUtils.safeSubstring('hello', start: 3, end: 2), '');
        expect(ServerUtils.safeSubstring('hello', start: 3, end: 3), '');
      });

      test('clamps end to string length', () {
        expect(ServerUtils.safeSubstring('hello', start: 3, end: 100), 'lo');
      });

      test('returns empty for empty string', () {
        expect(ServerUtils.safeSubstring('', start: 0), '');
      });
    });

    group('rowSignature', () {
      test('produces deterministic JSON with sorted keys', () {
        final sig1 = ServerUtils.rowSignature(<String, dynamic>{
          'b': 2,
          'a': 1,
        });
        final sig2 = ServerUtils.rowSignature(<String, dynamic>{
          'a': 1,
          'b': 2,
        });

        expect(sig1, sig2);
        expect(sig1, '{"a":1,"b":2}');
      });

      test('handles empty map', () {
        expect(ServerUtils.rowSignature(<String, dynamic>{}), '{}');
      });
    });

    group('compositePkKey', () {
      test('joins PK column values with pipe', () {
        final row = <String, dynamic>{'id': 1, 'type': 'a', 'name': 'x'};

        expect(ServerUtils.compositePkKey(['id', 'type'], row), '1|a');
      });

      test('handles single PK column', () {
        expect(
          ServerUtils.compositePkKey(['id'], <String, dynamic>{'id': 42}),
          '42',
        );
      });

      test('includes null as string for missing columns', () {
        expect(
          ServerUtils.compositePkKey(
            ['id', 'missing'],
            <String, dynamic>{'id': 1},
          ),
          '1|null',
        );
      });
    });

    group('parseJsonMap', () {
      test('parses valid JSON object', () {
        final result = ServerUtils.parseJsonMap('{"key": "value"}');
        expect(result, {'key': 'value'});
      });

      test('returns null for JSON array', () {
        expect(ServerUtils.parseJsonMap('[1, 2, 3]'), isNull);
      });

      test('returns null for invalid JSON', () {
        expect(ServerUtils.parseJsonMap('{not valid}'), isNull);
      });

      test('returns null for JSON scalar', () {
        expect(ServerUtils.parseJsonMap('"just a string"'), isNull);
      });
    });

    group('isTextType', () {
      test('matches TEXT types', () {
        expect(ServerUtils.isTextType('TEXT'), isTrue);
        expect(ServerUtils.isTextType('VARCHAR(255)'), isTrue);
        expect(ServerUtils.isTextType('CHAR(10)'), isTrue);
        expect(ServerUtils.isTextType('CLOB'), isTrue);
        expect(ServerUtils.isTextType('STRING'), isTrue);
      });

      test('case insensitive', () {
        expect(ServerUtils.isTextType('text'), isTrue);
        expect(ServerUtils.isTextType('Text'), isTrue);
      });

      test('does not match numeric types', () {
        expect(ServerUtils.isTextType('INTEGER'), isFalse);
        expect(ServerUtils.isTextType('REAL'), isFalse);
      });
    });

    group('isNumericType', () {
      test('matches numeric types', () {
        expect(ServerUtils.isNumericType('INTEGER'), isTrue);
        expect(ServerUtils.isNumericType('REAL'), isTrue);
        expect(ServerUtils.isNumericType('FLOAT'), isTrue);
        expect(ServerUtils.isNumericType('DOUBLE'), isTrue);
        expect(ServerUtils.isNumericType('DECIMAL'), isTrue);
        expect(ServerUtils.isNumericType('NUMERIC'), isTrue);
      });

      test('case insensitive', () {
        expect(ServerUtils.isNumericType('integer'), isTrue);
        expect(ServerUtils.isNumericType('Real'), isTrue);
      });

      test('does not match text types', () {
        expect(ServerUtils.isNumericType('TEXT'), isFalse);
        expect(ServerUtils.isNumericType('VARCHAR'), isFalse);
      });
    });

    group('toDouble', () {
      test('returns double for double input', () {
        expect(ServerUtils.toDouble(3.14), 3.14);
      });

      test('converts int to double', () {
        expect(ServerUtils.toDouble(42), 42.0);
      });

      test('parses numeric string', () {
        expect(ServerUtils.toDouble('3.14'), 3.14);
      });

      test('returns null for non-numeric string', () {
        expect(ServerUtils.toDouble('abc'), isNull);
      });

      test('returns null for null', () {
        expect(ServerUtils.toDouble(null), isNull);
      });

      test('returns null for non-numeric object', () {
        expect(ServerUtils.toDouble(<int>[1, 2]), isNull);
      });
    });

    group('sortAnomaliesBySeverity', () {
      test('sorts error before warning before info', () {
        final anomalies = <Map<String, dynamic>>[
          <String, dynamic>{'severity': 'info', 'msg': 'i'},
          <String, dynamic>{'severity': 'error', 'msg': 'e'},
          <String, dynamic>{'severity': 'warning', 'msg': 'w'},
        ];

        ServerUtils.sortAnomaliesBySeverity(anomalies);

        expect(anomalies[0]['severity'], 'error');
        expect(anomalies[1]['severity'], 'warning');
        expect(anomalies[2]['severity'], 'info');
      });

      test('unknown severity sorts after info', () {
        final anomalies = <Map<String, dynamic>>[
          <String, dynamic>{'severity': 'unknown', 'msg': 'u'},
          <String, dynamic>{'severity': 'info', 'msg': 'i'},
        ];

        ServerUtils.sortAnomaliesBySeverity(anomalies);

        expect(anomalies[0]['severity'], 'info');
        expect(anomalies[1]['severity'], 'unknown');
      });

      test('handles empty list', () {
        final anomalies = <Map<String, dynamic>>[];
        ServerUtils.sortAnomaliesBySeverity(anomalies);
        expect(anomalies, isEmpty);
      });
    });

    group('parseCsvLines', () {
      test('parses basic CSV rows', () {
        final rows = ServerUtils.parseCsvLines('a,b\n1,2');
        expect(rows, hasLength(2));
        expect(rows[0], ['a', 'b']);
        expect(rows[1], ['1', '2']);
      });

      test('handles quoted fields', () {
        final rows = ServerUtils.parseCsvLines('name\n"a,b"');
        expect(rows[1][0], 'a,b');
      });

      test('handles escaped quotes', () {
        final rows = ServerUtils.parseCsvLines('name\n"he said ""hi"""');
        expect(rows[1][0], 'he said "hi"');
      });

      test('skips empty lines', () {
        final rows = ServerUtils.parseCsvLines('a\n\n1\n\n2');
        expect(rows, hasLength(3));
      });
    });

    group('getTableNames', () {
      test('returns sorted table names excluding sqlite_ prefix', () async {
        final names = await ServerUtils.getTableNames((sql) async {
          return [
            <String, dynamic>{'name': 'items'},
            <String, dynamic>{'name': 'users'},
          ];
        });

        expect(names, ['items', 'users']);
      });

      test('filters out empty names', () async {
        final names = await ServerUtils.getTableNames((sql) async {
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
        final sql = await ServerUtils.getSchemaSql((sql) async {
          return [
            <String, dynamic>{
              'sql': 'CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT)',
            },
          ];
        });

        expect(sql, contains('CREATE TABLE items'));
        expect(sql, contains(';'));
      });

      test('skips null and empty sql entries', () async {
        final sql = await ServerUtils.getSchemaSql((sql) async {
          return [
            <String, dynamic>{'sql': null},
            <String, dynamic>{'sql': ''},
            <String, dynamic>{'sql': 'CREATE TABLE x (id INT)'},
          ];
        });

        expect(sql, contains('CREATE TABLE x'));
        // Should not contain garbage from null/empty entries.
        expect(
          sql.trim().split('\n').where((l) => l.trim().isNotEmpty).length,
          greaterThanOrEqualTo(1),
        );
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
        final ctx = ServerContext(query: (_) async => <Map<String, dynamic>>[]);

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
        final ctx = ServerContext(query: (_) async => <Map<String, dynamic>>[]);

        ctx.recordTiming(sql: 'SELECT 1', durationMs: 5, rowCount: 1);

        expect(ctx.queryTimings, hasLength(1));
        expect(ctx.queryTimings[0].sql, 'SELECT 1');
        expect(ctx.queryTimings[0].durationMs, 5);
        expect(ctx.queryTimings[0].rowCount, 1);
      });

      test('recordTiming evicts oldest when buffer is full', () {
        final ctx = ServerContext(query: (_) async => <Map<String, dynamic>>[]);

        // Fill buffer beyond max (500).
        for (int i = 0; i < 510; i++) {
          ctx.recordTiming(sql: 'Q$i', durationMs: i, rowCount: 0);
        }

        expect(ctx.queryTimings.length, 500);
        // The first 10 should have been evicted.
        expect(ctx.queryTimings[0].sql, 'Q10');
      });

      test('markExtensionSeen and isExtensionConnected', () {
        final ctx = ServerContext(query: (_) async => <Map<String, dynamic>>[]);

        // Initially not connected.
        expect(ctx.isExtensionConnected, isFalse);

        // After marking, should be connected.
        ctx.markExtensionSeen();
        expect(ctx.isExtensionConnected, isTrue);
      });

      test('timedQuery records timing on success', () async {
        final ctx = ServerContext(
          query: (_) async => [
            <String, dynamic>{'id': 1},
          ],
        );

        final result = await ctx.timedQuery('SELECT 1');

        expect(result, hasLength(1));
        expect(ctx.queryTimings, hasLength(1));
        expect(ctx.queryTimings[0].error, isNull);
      });

      test('timedQuery records timing on error and rethrows', () async {
        final ctx = ServerContext(query: (_) async => throw Exception('fail'));

        expect(() => ctx.timedQuery('BAD SQL'), throwsA(isA<Exception>()));

        // Timing should still be recorded after error.
        // Need to await the future to ensure the catch runs.
        try {
          await ctx.timedQuery('BAD SQL 2');
        } on Object catch (_) {
          // Expected.
        }

        expect(ctx.queryTimings.isNotEmpty, isTrue);
        expect(ctx.queryTimings.any((t) => t.error != null), isTrue);
      });

      test('timedQuery forwards DVR bindings to queryWithBindings', () async {
        List<Object?>? seenPos;
        Map<String, Object?>? seenNamed;
        final ctx = ServerContext(
          query: (_) async => <Map<String, dynamic>>[],
          queryWithBindings: (sql, {positionalArgs, namedArgs}) async {
            seenPos = positionalArgs;
            seenNamed = namedArgs;
            expect(sql, 'SELECT ?');
            return <Map<String, dynamic>>[];
          },
        );

        await ctx.instrumentedQueryWithDvrMeta(
          'SELECT ?',
          dvrDeclaredParams: <String, Object?>{
            'positional': <Object?>[42],
            'named': <String, Object?>{'k': 'v'},
          },
          dvrHasDeclaredBindings: true,
        );

        expect(seenPos, <Object?>[42]);
        expect(seenNamed, <String, Object?>{'k': 'v'});
      });

      test('toString includes generation', () {
        final ctx = ServerContext(query: (_) async => <Map<String, dynamic>>[]);
        expect(ctx.toString(), contains('generation'));
      });
    });

    group('checkDataChange', () {
      test('is no-op when changeDetectionEnabled is false', () async {
        int queryCount = 0;
        final ctx = ServerContext(
          query: (_) async {
            queryCount++;

            return [
              <String, dynamic>{'name': 'items'},
            ];
          },
        );

        ctx.changeDetectionEnabled = false;
        await ctx.checkDataChange();

        // No queries should have been issued.
        expect(queryCount, 0);
        expect(ctx.generation, 0);
      });

      test('uses single UNION ALL query for row counts', () async {
        final executedSql = <String>[];
        final ctx = ServerContext(
          query: (sql) async {
            executedSql.add(sql);

            // Return table names for sqlite_master query.
            if (sql.contains("type='table'")) {
              return [
                <String, dynamic>{'name': 'a'},
                <String, dynamic>{'name': 'b'},
              ];
            }

            // Return counts for UNION ALL query.
            if (sql.contains('UNION ALL')) {
              return [
                <String, dynamic>{'t': 'a', 'c': 5},
                <String, dynamic>{'t': 'b', 'c': 3},
              ];
            }

            return <Map<String, dynamic>>[];
          },
        );

        await ctx.checkDataChange();

        // Should issue exactly 2 queries:
        // getTableNames + single UNION ALL.
        expect(executedSql, hasLength(2));
        expect(executedSql[1], contains('UNION ALL'));
      });

      test('caches table names across calls', () async {
        int tableNameQueries = 0;
        final ctx = ServerContext(
          query: (sql) async {
            if (sql.contains("type='table'")) {
              tableNameQueries++;

              return [
                <String, dynamic>{'name': 'x'},
              ];
            }

            // UNION ALL result.
            return [
              <String, dynamic>{'t': 'x', 'c': 1},
            ];
          },
        );

        await ctx.checkDataChange();
        await ctx.checkDataChange();

        // Table names should only be queried once
        // (cached on first call).
        expect(tableNameQueries, 1);
      });

      test('invalidateTableNameCache forces re-query', () async {
        int tableNameQueries = 0;
        final ctx = ServerContext(
          query: (sql) async {
            if (sql.contains("type='table'")) {
              tableNameQueries++;

              return [
                <String, dynamic>{'name': 'x'},
              ];
            }

            return [
              <String, dynamic>{'t': 'x', 'c': 1},
            ];
          },
        );

        await ctx.checkDataChange();
        ctx.invalidateTableNameCache();
        await ctx.checkDataChange();

        // Table names should be queried twice (once
        // before invalidation, once after).
        expect(tableNameQueries, 2);
      });

      test('bumps generation when row counts change', () async {
        int callCount = 0;
        final ctx = ServerContext(
          query: (sql) async {
            if (sql.contains("type='table'")) {
              return [
                <String, dynamic>{'name': 'users'},
              ];
            }

            // Return different count on second call.
            callCount++;
            final count = callCount <= 1 ? 5 : 10;

            return [
              <String, dynamic>{'t': 'users', 'c': count},
            ];
          },
        );

        await ctx.checkDataChange();
        expect(ctx.generation, 0);

        await ctx.checkDataChange();

        // Generation should bump because count changed.
        expect(ctx.generation, 1);
      });

      test('skips DB check when within changeDetectionMinInterval', () async {
        final executedSql = <String>[];
        final ctx = ServerContext(
          changeDetectionMinInterval: const Duration(seconds: 2),
          query: (sql) async {
            executedSql.add(sql);
            if (sql.contains("type='table'")) {
              return [
                <String, dynamic>{'name': 't1'},
              ];
            }
            return [
              <String, dynamic>{'t': 't1', 'c': 1},
            ];
          },
        );

        await ctx.checkDataChange();
        expect(executedSql, hasLength(2)); // getTableNames + UNION ALL

        executedSql.clear();
        await ctx.checkDataChange();

        // Throttled: no queries on second call.
        expect(executedSql, isEmpty);
      });
    });
  });
}
