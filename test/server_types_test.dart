// Tests for server helper types: Snapshot, QueryTiming,
// SqlRequestBody.

import 'package:test/test.dart';

import 'package:saropa_drift_advisor/src/server/server_types.dart';

void main() {
  group('Snapshot', () {
    test('stores id, createdAt, and tables', () {
      final now = DateTime.now().toUtc();
      final snapshot = Snapshot(
        id: 'abc123',
        createdAt: now,
        tables: <String, List<Map<String, dynamic>>>{
          'users': [
            <String, dynamic>{'id': 1, 'name': 'Alice'},
          ],
        },
      );

      expect(snapshot.id, 'abc123');
      expect(snapshot.createdAt, now);
      expect(snapshot.tables, hasLength(1));
      expect(snapshot.tables['users'], hasLength(1));
    });

    test('toString includes id and table count', () {
      final snapshot = Snapshot(
        id: 'test',
        createdAt: DateTime.now().toUtc(),
        tables: <String, List<Map<String, dynamic>>>{
          'a': <Map<String, dynamic>>[],
          'b': <Map<String, dynamic>>[],
        },
      );

      expect(snapshot.toString(), contains('test'));
      expect(snapshot.toString(), contains('2'));
    });
  });

  group('QueryTiming', () {
    test('toJson includes all fields', () {
      final now = DateTime.utc(2025, 1, 15, 12, 0, 0);
      final timing = QueryTiming(
        sql: 'SELECT * FROM users',
        durationMs: 42,
        rowCount: 10,
        at: now,
      );

      final json = timing.toJson();
      expect(json['sql'], 'SELECT * FROM users');
      expect(json['durationMs'], 42);
      expect(json['rowCount'], 10);
      expect(json['at'], now.toIso8601String());
      // Error should not be present when null.
      expect(json.containsKey('error'), isFalse);
    });

    test('toJson includes error when present', () {
      final timing = QueryTiming(
        sql: 'BAD SQL',
        durationMs: 1,
        rowCount: 0,
        at: DateTime.now().toUtc(),
        error: 'syntax error',
      );

      final json = timing.toJson();
      expect(json['error'], 'syntax error');
    });

    test('toJson omits callerFile and callerLine when null', () {
      final timing = QueryTiming(
        sql: 'SELECT 1',
        durationMs: 1,
        rowCount: 1,
        at: DateTime.now().toUtc(),
      );

      final json = timing.toJson();
      // Null-aware element syntax (?callerFile) should omit the
      // key entirely, matching the pattern used for ?error.
      expect(json.containsKey('callerFile'), isFalse);
      expect(json.containsKey('callerLine'), isFalse);
    });

    test('toJson includes callerFile and callerLine when present', () {
      final timing = QueryTiming(
        sql: 'SELECT * FROM users',
        durationMs: 10,
        rowCount: 5,
        at: DateTime.now().toUtc(),
        callerFile: 'package:myapp/src/user_repo.dart',
        callerLine: 42,
      );

      final json = timing.toJson();
      expect(json['callerFile'], 'package:myapp/src/user_repo.dart');
      expect(json['callerLine'], 42);
    });
  });

  group('SqlRequestBody', () {
    test('fromJson parses valid map with sql key', () {
      final body = SqlRequestBody.fromJson(<String, dynamic>{
        'sql': 'SELECT 1',
      });

      expect(body, isNotNull);
      expect(body!.sql, 'SELECT 1');
      // Default — requests from user code must never be tagged internal.
      expect(body.isInternal, isFalse);
    });

    test('fromJson captures internal flag when true', () {
      final body = SqlRequestBody.fromJson(<String, dynamic>{
        'sql': 'SELECT 1',
        'internal': true,
      });

      expect(body, isNotNull);
      expect(body!.sql, 'SELECT 1');
      expect(body.isInternal, isTrue);
    });

    test('fromJson treats non-bool internal values as false', () {
      // Boundary hardening: the internal flag is extension-controlled and
      // must not be toggled by arbitrary truthy JSON (strings, numbers).
      // Guards against a browser client opportunistically silencing its
      // own slow queries by sending `"internal": "1"`.
      for (final raw in <Object>['1', 'true', 1, 'yes']) {
        final body = SqlRequestBody.fromJson(<String, dynamic>{
          'sql': 'SELECT 1',
          'internal': raw,
        });
        expect(body, isNotNull);
        expect(
          body!.isInternal,
          isFalse,
          reason: 'internal=$raw (${raw.runtimeType}) must not set isInternal',
        );
      }
    });

    test('fromJson trims whitespace from sql', () {
      final body = SqlRequestBody.fromJson(<String, dynamic>{
        'sql': '  SELECT 1  ',
      });

      expect(body, isNotNull);
      expect(body!.sql, 'SELECT 1');
    });

    test('fromJson returns null for non-Map', () {
      expect(SqlRequestBody.fromJson('not a map'), isNull);
      expect(SqlRequestBody.fromJson(42), isNull);
      expect(SqlRequestBody.fromJson(null), isNull);
    });

    test('fromJson returns null when sql key is missing', () {
      expect(SqlRequestBody.fromJson(<String, dynamic>{'other': 'x'}), isNull);
    });

    test('fromJson returns null when sql is not a String', () {
      expect(SqlRequestBody.fromJson(<String, dynamic>{'sql': 42}), isNull);
    });

    test('fromJson returns null when sql is empty after trim', () {
      expect(SqlRequestBody.fromJson(<String, dynamic>{'sql': '   '}), isNull);
    });

    test('fromJson returns null for empty string sql', () {
      expect(SqlRequestBody.fromJson(<String, dynamic>{'sql': ''}), isNull);
    });
  });
}
