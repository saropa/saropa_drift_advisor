// Unit tests for PerformanceHandler — query timing aggregation logic.
//
// Tests getPerformanceData() and clearPerformance() by pre-populating
// the ServerContext.queryTimings buffer with known QueryTiming entries.

import 'package:saropa_drift_advisor/src/server/performance_handler.dart';
import 'package:saropa_drift_advisor/src/server/server_types.dart';
import 'package:test/test.dart';

import 'helpers/test_helpers.dart';

void main() {
  group('PerformanceHandler', () {
    group('getPerformanceData', () {
      test('returns zeroes when no queries recorded', () async {
        final ctx = createTestContext();
        final handler = PerformanceHandler(ctx);

        final data = await handler.getPerformanceData();

        expect(data['totalQueries'], 0);
        expect(data['totalDurationMs'], 0);
        expect(data['avgDurationMs'], 0);
        expect(data['slowQueries'] as List, isEmpty);
        expect(data['queryPatterns'] as List, isEmpty);
        expect(data['recentQueries'] as List, isEmpty);
      });

      test('totalQueries matches number of recorded timings', () async {
        final ctx = createTestContext();
        _addTimings(ctx.queryTimings, count: 5, durationMs: 10);
        final handler = PerformanceHandler(ctx);

        final data = await handler.getPerformanceData();

        expect(data['totalQueries'], 5);
      });

      test('totalDurationMs is sum of all durations', () async {
        final ctx = createTestContext();
        // Add timings with durations 10, 20, 30.
        ctx.queryTimings.addAll([
          _timing('SELECT 1', 10),
          _timing('SELECT 2', 20),
          _timing('SELECT 3', 30),
        ]);
        final handler = PerformanceHandler(ctx);

        final data = await handler.getPerformanceData();

        expect(data['totalDurationMs'], 60);
      });

      test('avgDurationMs is rounded mean', () async {
        final ctx = createTestContext();
        // 10 + 20 + 30 = 60 / 3 = 20.
        ctx.queryTimings.addAll([
          _timing('SELECT 1', 10),
          _timing('SELECT 2', 20),
          _timing('SELECT 3', 30),
        ]);
        final handler = PerformanceHandler(ctx);

        final data = await handler.getPerformanceData();

        expect(data['avgDurationMs'], 20);
      });

      test('slowQueries only includes queries > 100ms', () async {
        final ctx = createTestContext();
        ctx.queryTimings.addAll([
          _timing('fast', 50),
          _timing('slow', 150),
          _timing('also fast', 100), // exactly 100 = NOT slow.
          _timing('very slow', 300),
        ]);
        final handler = PerformanceHandler(ctx);

        final data = await handler.getPerformanceData();
        final slowQueries = data['slowQueries'] as List;

        expect(slowQueries, hasLength(2));
        // Should include 150ms and 300ms only.
        final durations = slowQueries
            .map((q) => (q as Map)['durationMs'])
            .toList();
        expect(durations, containsAll([150, 300]));
        expect(durations, isNot(contains(50)));
        expect(durations, isNot(contains(100)));
      });

      test('slowQueries sorted by duration descending', () async {
        final ctx = createTestContext();
        ctx.queryTimings.addAll([
          _timing('a', 150),
          _timing('b', 300),
          _timing('c', 200),
        ]);
        final handler = PerformanceHandler(ctx);

        final data = await handler.getPerformanceData();
        final slowQueries = data['slowQueries'] as List;
        final durations = slowQueries
            .map((q) => (q as Map)['durationMs'] as int)
            .toList();

        // Should be sorted descending: 300, 200, 150.
        expect(durations, [300, 200, 150]);
      });

      test('slowQueries capped at 20 entries', () async {
        final ctx = createTestContext();
        // Add 25 slow queries (all > 100ms).
        for (var i = 0; i < 25; i++) {
          ctx.queryTimings.add(_timing('q$i', 101 + i));
        }
        final handler = PerformanceHandler(ctx);

        final data = await handler.getPerformanceData();
        final slowQueries = data['slowQueries'] as List;

        expect(slowQueries, hasLength(20));
      });

      test('queryPatterns groups by first 60 chars of SQL', () async {
        final ctx = createTestContext();
        // Same SQL pattern → should be grouped.
        ctx.queryTimings.addAll([
          _timing('SELECT * FROM users', 10),
          _timing('SELECT * FROM users', 20),
          _timing('SELECT * FROM orders', 15),
        ]);
        final handler = PerformanceHandler(ctx);

        final data = await handler.getPerformanceData();
        final patterns = data['queryPatterns'] as List;

        expect(patterns, hasLength(2));
      });

      test('queryPatterns truncates long SQL at 60 chars', () async {
        final ctx = createTestContext();
        // SQL longer than 60 chars.
        final longSql = 'SELECT ${'a, ' * 30}b FROM some_very_long_table_name';
        expect(longSql.length, greaterThan(60));
        ctx.queryTimings.add(_timing(longSql, 10));
        final handler = PerformanceHandler(ctx);

        final data = await handler.getPerformanceData();
        final patterns = data['queryPatterns'] as List;
        final pattern = (patterns.first as Map)['pattern'] as String;

        expect(pattern.length, 60);
      });

      test('queryPatterns includes count, avgMs, maxMs, totalMs', () async {
        final ctx = createTestContext();
        ctx.queryTimings.addAll([
          _timing('SELECT 1', 10),
          _timing('SELECT 1', 30),
        ]);
        final handler = PerformanceHandler(ctx);

        final data = await handler.getPerformanceData();
        final patterns = data['queryPatterns'] as List;
        final p = patterns.first as Map;

        expect(p['count'], 2);
        expect(p['totalMs'], 40);
        expect(p['avgMs'], 20);
        expect(p['maxMs'], 30);
      });

      test('queryPatterns sorted by totalMs descending', () async {
        final ctx = createTestContext();
        ctx.queryTimings.addAll([
          _timing('fast query', 5),
          _timing('fast query', 5),
          _timing('slow query', 50),
        ]);
        final handler = PerformanceHandler(ctx);

        final data = await handler.getPerformanceData();
        final patterns = data['queryPatterns'] as List;

        // "slow query" has totalMs=50, "fast query" has totalMs=10.
        final firstPattern = (patterns.first as Map)['pattern'] as String;
        expect(firstPattern, 'slow query');
      });

      test('queryPatterns capped at 20 entries', () async {
        final ctx = createTestContext();
        // Add 25 distinct SQL patterns.
        for (var i = 0; i < 25; i++) {
          ctx.queryTimings.add(_timing('query_pattern_$i', 10));
        }
        final handler = PerformanceHandler(ctx);

        final data = await handler.getPerformanceData();
        final patterns = data['queryPatterns'] as List;

        expect(patterns, hasLength(20));
      });

      test('recentQueries are in reverse chronological order', () async {
        final ctx = createTestContext();
        // Add timings with ascending timestamps.
        final now = DateTime.now().toUtc();
        ctx.queryTimings.addAll([
          _timingAt('first', 10, now.subtract(const Duration(seconds: 3))),
          _timingAt('second', 20, now.subtract(const Duration(seconds: 2))),
          _timingAt('third', 30, now.subtract(const Duration(seconds: 1))),
        ]);
        final handler = PerformanceHandler(ctx);

        final data = await handler.getPerformanceData();
        final recent = data['recentQueries'] as List;

        // Reversed: third, second, first.
        expect((recent[0] as Map)['sql'], 'third');
        expect((recent[1] as Map)['sql'], 'second');
        expect((recent[2] as Map)['sql'], 'first');
      });

      test(
        'internal queries excluded from totalQueries and slowQueries',
        () async {
          final ctx = createTestContext();
          ctx.queryTimings.addAll([
            _timing('SELECT * FROM users', 150), // user query, slow
            _timing('SELECT * FROM orders', 50), // user query, fast
            _internalTiming(
              // internal probe, slow — should be excluded
              "SELECT 'users' AS t, COUNT(*) AS c FROM \"users\"",
              200,
            ),
            _internalTiming(
              // internal probe, fast — should be excluded
              "SELECT 'orders' AS t, COUNT(*) AS c FROM \"orders\"",
              30,
            ),
          ]);
          final handler = PerformanceHandler(ctx);

          final data = await handler.getPerformanceData();

          // Only the 2 user queries count toward aggregates.
          expect(data['totalQueries'], 2);
          expect(data['totalDurationMs'], 200); // 150 + 50
          expect(data['avgDurationMs'], 100); // 200 / 2

          // Only the user's 150ms query is slow; the 200ms
          // internal probe must not appear.
          final slowQueries = data['slowQueries'] as List;
          expect(slowQueries, hasLength(1));
          expect((slowQueries.first as Map)['sql'], 'SELECT * FROM users');
        },
      );

      test('internal queries excluded from queryPatterns', () async {
        final ctx = createTestContext();
        ctx.queryTimings.addAll([
          _timing('SELECT * FROM users', 10),
          _internalTiming(
            "SELECT 'users' AS t, COUNT(*) AS c FROM \"users\"",
            20,
          ),
        ]);
        final handler = PerformanceHandler(ctx);

        final data = await handler.getPerformanceData();
        final patterns = data['queryPatterns'] as List;

        // Only 1 pattern — the internal probe is excluded.
        expect(patterns, hasLength(1));
        expect((patterns.first as Map)['pattern'], 'SELECT * FROM users');
      });

      test('internal queries still appear in recentQueries', () async {
        final ctx = createTestContext();
        ctx.queryTimings.addAll([
          _timing('SELECT * FROM users', 10),
          _internalTiming(
            "SELECT 'users' AS t, COUNT(*) AS c FROM \"users\"",
            20,
          ),
        ]);
        final handler = PerformanceHandler(ctx);

        final data = await handler.getPerformanceData();
        final recent = data['recentQueries'] as List;

        // Both queries appear in recentQueries (internal ones
        // are tagged via isInternal in JSON, not hidden).
        expect(recent, hasLength(2));
      });

      test('recentQueries capped at 50 entries', () async {
        final ctx = createTestContext();
        // Add 60 timings.
        for (var i = 0; i < 60; i++) {
          ctx.queryTimings.add(_timing('q$i', 10));
        }
        final handler = PerformanceHandler(ctx);

        final data = await handler.getPerformanceData();
        final recent = data['recentQueries'] as List;

        expect(recent, hasLength(50));
      });
    });

    group('clearPerformance', () {
      test('clears all timings from context', () {
        final ctx = createTestContext();
        _addTimings(ctx.queryTimings, count: 5, durationMs: 10);
        expect(ctx.queryTimings, isNotEmpty);

        final handler = PerformanceHandler(ctx);
        handler.clearPerformance();

        expect(ctx.queryTimings, isEmpty);
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/// Creates a [QueryTiming] with the given SQL and duration.
QueryTiming _timing(String sql, int durationMs) => QueryTiming(
  sql: sql,
  durationMs: durationMs,
  rowCount: 0,
  at: DateTime.now().toUtc(),
);

/// Creates an internal (extension-owned) [QueryTiming] that should
/// be excluded from user-facing slow-query diagnostics.
QueryTiming _internalTiming(String sql, int durationMs) => QueryTiming(
  sql: sql,
  durationMs: durationMs,
  rowCount: 0,
  isInternal: true,
  at: DateTime.now().toUtc(),
);

/// Creates a [QueryTiming] with a specific timestamp.
QueryTiming _timingAt(String sql, int durationMs, DateTime at) =>
    QueryTiming(sql: sql, durationMs: durationMs, rowCount: 0, at: at);

/// Adds [count] identical timings to the list.
void _addTimings(
  List<QueryTiming> timings, {
  required int count,
  required int durationMs,
}) {
  for (var i = 0; i < count; i++) {
    timings.add(_timing('SELECT $i', durationMs));
  }
}
