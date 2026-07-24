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

      test(
        'PRAGMA introspection excluded from aggregates, slow, and recent',
        () async {
          // Regression: BUG_EXPORT_PERF_SECTION_FALSE_POSITIVES.md Finding 2.
          // The schema browser records one PRAGMA table_info per table via
          // the instrumented query path; these self-introspection rows must
          // never pollute performance analytics or the exported report.
          final ctx = createTestContext();
          ctx.queryTimings.addAll([
            _timing('SELECT * FROM users', 150), // real app query, slow
            _timing('PRAGMA table_info("users")', 200), // browser noise, slow
            _timing(
              '  pragma table_info("orders")',
              5,
            ), // lowercase + leading ws
            // sqlite_master catalog read is introspection, not app workload.
            _timing('SELECT name FROM sqlite_master WHERE type=?', 300),
          ]);
          final handler = PerformanceHandler(ctx);

          final data = await handler.getPerformanceData();

          // Only the real query counts toward aggregates.
          expect(data['totalQueries'], 1);
          expect(data['totalDurationMs'], 150);

          // Neither the 200ms PRAGMA nor the 300ms sqlite_master read is slow.
          final slowQueries = data['slowQueries'] as List;
          expect(slowQueries, hasLength(1));
          expect((slowQueries.first as Map)['sql'], 'SELECT * FROM users');

          // recentQueries carries only the real query — no introspection rows.
          final recent = data['recentQueries'] as List;
          expect(recent, hasLength(1));
          expect((recent.first as Map)['sql'], 'SELECT * FROM users');
        },
      );

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

    // -------------------------------------------------------
    // recordAppTiming — host-reported app query ingest
    // (BUG_EXPORT_PERF_SECTION_FALSE_POSITIVES.md Finding 1)
    // -------------------------------------------------------
    group('recordAppTiming', () {
      test('app-reported query counts and is tagged source "app"', () async {
        final ctx = createTestContext();
        ctx.recordAppTiming(
          sql: 'SELECT * FROM contacts',
          durationMs: 42,
          rowCount: 7,
        );
        final handler = PerformanceHandler(ctx);

        final data = await handler.getPerformanceData();

        // A real app query now shows up in the perf stats (Finding 1).
        expect(data['totalQueries'], 1);
        expect(data['totalDurationMs'], 42);
        final recent = data['recentQueries'] as List;
        expect(recent, hasLength(1));
        expect((recent.first as Map)['source'], 'app');
      });

      test('perf hint appears until an app query is captured', () async {
        final ctx = createTestContext();
        final handler = PerformanceHandler(ctx);

        // No app-sourced timing yet (only browser/internal) → hint present so
        // the developer learns why totalQueries is empty and how to fix it.
        ctx.queryTimings.add(_timing('SELECT * FROM contacts', 5));
        var data = await handler.getPerformanceData();
        expect(data['hint'], contains('QueryInterceptor'));
        expect(data['hint'], contains('advisor_timing_interceptor.dart'));

        // Once the app reports a query, the hint clears itself.
        ctx.recordAppTiming(
          sql: 'SELECT * FROM contacts',
          durationMs: 4,
          rowCount: 1,
        );
        data = await handler.getPerformanceData();
        expect(data.containsKey('hint'), isFalse);
      });

      test('kill switch: nothing recorded while monitoring disabled', () {
        final ctx = createTestContext()..monitoringEnabled = false;
        ctx.recordAppTiming(
          sql: 'SELECT * FROM contacts',
          durationMs: 42,
          rowCount: 7,
        );
        expect(ctx.queryTimings, isEmpty);
      });

      test('isWrite feeds the static-table candidate signal', () {
        final ctx = createTestContext();
        ctx.recordAppTiming(
          sql: 'UPDATE contacts SET name = ? WHERE id = ?',
          durationMs: 5,
          rowCount: 1,
          isWrite: true,
        );
        ctx.recordAppTiming(
          sql: 'SELECT * FROM currency_rates',
          durationMs: 3,
          rowCount: 50,
        );

        // The written table is observed as mutated; the read-only one is not,
        // so it stays a valid static-table candidate (Finding 3 synergy).
        final mutated = ctx.tableActivity.tablesWithObservedMutations();
        expect(mutated, contains('contacts'));
        expect(mutated, isNot(contains('currency_rates')));
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
