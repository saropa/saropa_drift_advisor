// Tests for [MutationTracker]: long-poll wait semantics and mutation capture wiring.
//
// Regression: idle `/api/mutations` long-poll must complete on timeout without
// treating the expected TimeoutException as a loggable error (VM overhead).

import 'package:saropa_drift_advisor/src/server/mutation_tracker.dart';
import 'package:test/test.dart';

void main() {
  group('MutationTracker.waitForAnyEvent', () {
    test(
      'completes normally when timeout elapses with no mutations (idle long-poll)',
      () async {
        final tracker = MutationTracker();
        // Short timeout: exercises TimeoutException path used when no INSERT/UPDATE/DELETE
        // arrives before the long-poll deadline. Must complete without throwing.
        await expectLater(
          tracker.waitForAnyEvent(const Duration(milliseconds: 1)),
          completes,
        );
      },
    );

    test(
      'completes before deadline when a mutation is recorded first',
      () async {
        final tracker = MutationTracker();
        final longWait = tracker.waitForAnyEvent(const Duration(seconds: 30));

        await tracker.captureFromWriteQuery(
          originalWrite: (_) async {},
          readQuery: (_) async => <Map<String, dynamic>>[
            <String, dynamic>{'id': 1},
          ],
          sql: 'INSERT INTO t (id) VALUES (1)',
        );

        await expectLater(longWait, completes);
        expect(tracker.latestId, greaterThan(0));
      },
    );
  });
}
