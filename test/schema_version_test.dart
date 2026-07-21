// Tests for the schema-version plumbing: declaredSchemaVersion threading
// and PRAGMA user_version query via Router.getDbSchemaVersion.

import 'package:saropa_drift_advisor/src/drift_debug_session.dart';
import 'package:saropa_drift_advisor/src/query_recorder.dart';
import 'package:saropa_drift_advisor/src/server/router.dart';
import 'package:saropa_drift_advisor/src/server/server_utils.dart';
import 'package:test/test.dart';

import 'helpers/test_helpers.dart';

void main() {
  group('declaredSchemaVersion threading', () {
    test('reaches ServerContext when provided', () {
      final ctx = createTestContext(declaredSchemaVersion: 7);
      expect(ctx.declaredSchemaVersion, 7);
    });

    test('defaults to null when omitted', () {
      final ctx = createTestContext();
      expect(ctx.declaredSchemaVersion, isNull);
    });
  });

  group('Router.getDbSchemaVersion', () {
    test('returns PRAGMA user_version value', () async {
      final ctx = createTestContext(
        query: (sql) async {
          if (sql == 'PRAGMA user_version') {
            return [
              <String, dynamic>{'user_version': 5},
            ];
          }
          return <Map<String, dynamic>>[];
        },
        queryRecorder: QueryRecorder(),
      );
      final router = Router(ctx, DriftDebugSessionStore());

      final version = await router.getDbSchemaVersion();

      expect(version, 5);
    });

    test('returns null when PRAGMA returns non-int', () async {
      final ctx = createTestContext(
        query: (sql) async {
          if (sql == 'PRAGMA user_version') {
            return [
              <String, dynamic>{'user_version': 'not_a_number'},
            ];
          }
          return <Map<String, dynamic>>[];
        },
        queryRecorder: QueryRecorder(),
      );
      final router = Router(ctx, DriftDebugSessionStore());

      final version = await router.getDbSchemaVersion();

      expect(version, isNull);
    });

    test('returns null when PRAGMA query throws', () async {
      final errors = <Object>[];
      final ctx = createTestContext(
        query: (sql) async {
          if (sql == 'PRAGMA user_version') {
            throw Exception('DB locked');
          }
          return <Map<String, dynamic>>[];
        },
        onError: (e, _) => errors.add(e),
        queryRecorder: QueryRecorder(),
      );
      final router = Router(ctx, DriftDebugSessionStore());

      final version = await router.getDbSchemaVersion();

      expect(version, isNull);
      expect(errors, hasLength(1));
    });

    test('returns null when PRAGMA returns empty rows', () async {
      final ctx = createTestContext(
        query: (_) async => <Map<String, dynamic>>[],
        queryRecorder: QueryRecorder(),
      );
      final router = Router(ctx, DriftDebugSessionStore());

      final version = await router.getDbSchemaVersion();

      expect(version, isNull);
    });
  });

  group('ServerUtils.normalizeRows with PRAGMA user_version', () {
    test('preserves original key casing', () {
      final rows = ServerUtils.normalizeRows([
        <String, dynamic>{'USER_VERSION': 3},
      ]);
      // normalizeRows preserves original key case
      expect(rows.first['USER_VERSION'], 3);
      expect(rows.first['user_version'], isNull);
    });

    test('passes through standard PRAGMA key', () {
      final rows = ServerUtils.normalizeRows([
        <String, dynamic>{'user_version': 7},
      ]);
      expect(rows.first['user_version'], 7);
    });
  });
}
