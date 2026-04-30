// Unit tests for [QueryRecorder]: ring buffer bounds, cursor paging, and config.
library;

import 'package:saropa_drift_advisor/src/query_recorder.dart';
import 'package:test/test.dart';

void main() {
  group('QueryRecorder', () {
    test('evicts oldest entries when maxQueries exceeded', () {
      final r = QueryRecorder(maxQueries: 3);
      r.startRecording();
      for (var i = 0; i < 5; i++) {
        r.recordRead(
          sql: 'SELECT $i',
          startedAtUtc: DateTime.utc(2026, 1, 1),
          elapsed: const Duration(milliseconds: 1),
          resultRowCount: i,
        );
      }
      expect(r.queryCount, 3);
      expect(r.minAvailableId, 2);
      expect(r.maxAvailableId, 4);
      final page = r.queriesPage(cursor: -1, limit: 10, direction: 'forward');
      expect(page.items.length, 3);
      expect(page.items.first.id, 2);
      expect(page.items.last.id, 4);
    });

    test('updateConfig trims buffer when maxQueries shrinks', () {
      final r = QueryRecorder(maxQueries: 100);
      r.startRecording();
      for (var i = 0; i < 10; i++) {
        r.recordRead(
          sql: 'SELECT',
          startedAtUtc: DateTime.utc(2026, 1, 1),
          elapsed: Duration.zero,
          resultRowCount: 0,
        );
      }
      expect(r.queryCount, 10);
      r.updateConfig(maxQueries: 4);
      expect(r.queryCount, 4);
      expect(r.maxBufferQueries, 4);
    });

    test('captureBeforeAfter=false drops beforeState/afterState on writes', () {
      final r = QueryRecorder(captureBeforeAfter: false);
      r.startRecording();
      r.recordWrite(
        sql: 'UPDATE t SET x=1',
        startedAtUtc: DateTime.utc(2026, 1, 1),
        elapsed: const Duration(milliseconds: 2),
        affectedRowCount: 1,
        beforeState: [
          <String, dynamic>{'id': 1},
        ],
        afterState: [
          <String, dynamic>{'id': 1, 'x': 1},
        ],
      );
      final q = r.queryBySessionAndId(r.sessionId, 0);
      expect(q, isNotNull);
      expect(q!.beforeState, isNull);
      expect(q.afterState, isNull);
    });

    test('queryBySessionAndId returns null for wrong session', () {
      final r = QueryRecorder();
      r.startRecording();
      r.recordRead(
        sql: 'SELECT 1',
        startedAtUtc: DateTime.utc(2026, 1, 1),
        elapsed: Duration.zero,
        resultRowCount: 1,
      );
      expect(r.queryBySessionAndId('other-session', 0), isNull);
      expect(r.queryBySessionAndId(r.sessionId, 0), isNotNull);
    });

    test('backward page respects cursor boundary', () {
      final r = QueryRecorder(maxQueries: 100);
      r.startRecording();
      for (var i = 0; i < 5; i++) {
        r.recordRead(
          sql: 'SELECT $i',
          startedAtUtc: DateTime.utc(2026, 1, 1),
          elapsed: Duration.zero,
          resultRowCount: 0,
        );
      }
      final back = r.queriesPage(cursor: 4, limit: 2, direction: 'backward');
      // Newest-first collection is reversed to ascending id order in the page payload.
      expect(back.items.map((e) => e.id).toList(), [2, 3]);
    });
  });
}
