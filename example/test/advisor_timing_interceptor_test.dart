// Verifies AdvisorTimingInterceptor is transparent: it forwards every call to
// the wrapped executor and returns/propagates the result unchanged. The timing
// report itself (DriftDebugServer.reportAppQuery) is a no-op here because no
// advisor server is running, which is exactly the safe-when-idle contract — the
// point of this test is that wrapping an executor never changes query results.

import 'package:drift/drift.dart';
import 'package:example/database/advisor_timing_interceptor.dart';
import 'package:flutter_test/flutter_test.dart';

/// Minimal QueryExecutor that records calls and returns canned results. Only
/// the four methods the interceptor overrides are implemented; anything else
/// routing through noSuchMethod would fail the test loudly (it is never called).
class _RecordingExecutor implements QueryExecutor {
  final List<String> calls = <String>[];

  @override
  Future<List<Map<String, Object?>>> runSelect(
    String statement,
    List<Object?> args,
  ) async {
    calls.add('select:$statement');
    return <Map<String, Object?>>[
      {'value': 1},
      {'value': 2},
    ];
  }

  @override
  Future<int> runInsert(String statement, List<Object?> args) async {
    calls.add('insert:$statement');
    return 7;
  }

  @override
  Future<int> runUpdate(String statement, List<Object?> args) async {
    calls.add('update:$statement');
    return 3;
  }

  @override
  Future<int> runDelete(String statement, List<Object?> args) async {
    calls.add('delete:$statement');
    return 2;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  group('AdvisorTimingInterceptor', () {
    late _RecordingExecutor executor;
    late AdvisorTimingInterceptor interceptor;

    setUp(() {
      executor = _RecordingExecutor();
      interceptor = AdvisorTimingInterceptor();
    });

    test('runSelect forwards and returns rows unchanged', () async {
      final rows = await interceptor.runSelect(executor, 'SELECT * FROM t', []);
      expect(rows, [
        {'value': 1},
        {'value': 2},
      ]);
      expect(executor.calls, ['select:SELECT * FROM t']);
    });

    test('runInsert/runUpdate/runDelete forward affected-row counts', () async {
      expect(await interceptor.runInsert(executor, 'INSERT INTO t ...', []), 7);
      expect(await interceptor.runUpdate(executor, 'UPDATE t ...', []), 3);
      expect(await interceptor.runDelete(executor, 'DELETE FROM t ...', []), 2);
      expect(executor.calls, [
        'insert:INSERT INTO t ...',
        'update:UPDATE t ...',
        'delete:DELETE FROM t ...',
      ]);
    });

    test(
      'an executor error propagates (still reported, then rethrown)',
      () async {
        final throwing = _ThrowingExecutor();
        await expectLater(
          interceptor.runSelect(throwing, 'SELECT 1', []),
          throwsA(isA<StateError>()),
        );
      },
    );
  });
}

/// Executor whose runSelect always throws, to exercise the interceptor's
/// error path (report-then-rethrow).
class _ThrowingExecutor implements QueryExecutor {
  @override
  Future<List<Map<String, Object?>>> runSelect(
    String statement,
    List<Object?> args,
  ) async => throw StateError('boom');

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
