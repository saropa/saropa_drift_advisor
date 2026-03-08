# Feature 13: Live Query Performance Monitor

**Effort:** M (Medium) | **Priority:** 7

## Overview

Track the execution time of every SQL query that passes through the debug server. Show a performance dashboard with slow queries, average times, query frequency, and patterns. Helps developers identify Drift query performance bottlenecks during debug sessions.

**User value:** "Which queries are slow?" Answered in real time, without any extra setup. Just open the performance tab.

## Architecture

### Server-side (Dart)
Wrap the query callback with a timing interceptor (Stopwatch). Store recent timings in a ring buffer (max 500 entries). Add `GET /api/analytics/performance` to retrieve data and `DELETE /api/analytics/performance` to clear.

### Client-side (JS)
Add a collapsible "Performance" section with sortable query timing table, summary stats, and a clear button.

### VS Code Extension / Flutter
No changes.

### New Files
None.

## Implementation Details

### Timing Infrastructure

Add to `_DriftDebugServerImpl`:
```dart
static const int _maxQueryTimings = 500;
final List<_QueryTiming> _queryTimings = [];

Future<List<Map<String, dynamic>>> _timedQuery(
  DriftDebugQuery query,
  String sql,
) async {
  final stopwatch = Stopwatch()..start();
  try {
    final result = await query(sql);
    stopwatch.stop();
    _recordTiming(sql, stopwatch.elapsedMilliseconds, result.length, null);
    return result;
  } on Object catch (error) {
    stopwatch.stop();
    _recordTiming(sql, stopwatch.elapsedMilliseconds, 0, error.toString());
    rethrow;
  }
}

void _recordTiming(String sql, int durationMs, int rowCount, String? error) {
  _queryTimings.add(_QueryTiming(
    sql: sql,
    durationMs: durationMs,
    rowCount: rowCount,
    error: error,
    at: DateTime.now().toUtc(),
  ));
  if (_queryTimings.length > _maxQueryTimings) {
    _queryTimings.removeAt(0);
  }
}
```

Data class:
```dart
class _QueryTiming {
  _QueryTiming({
    required this.sql,
    required this.durationMs,
    required this.rowCount,
    required this.at,
    this.error,
  });

  final String sql;
  final int durationMs;
  final int rowCount;
  final DateTime at;
  final String? error;

  Map<String, dynamic> toJson() => <String, dynamic>{
    'sql': sql,
    'durationMs': durationMs,
    'rowCount': rowCount,
    'error': error,
    'at': at.toIso8601String(),
  };
}
```

### Query Wrapping (in `start()`)

The cleanest approach — wrap the query at assignment time so all queries are timed:

```dart
// In start(), after assigning parameters:
final originalQuery = query;
_instance._query = (String sql) => _instance._timedQuery(originalQuery, sql);
```

This ensures all internal queries (table listing, schema introspection) and user queries are timed. Two lines, zero handler modifications.

### Performance Endpoint: `GET /api/analytics/performance`

```dart
static const String _pathApiAnalyticsPerformance = '/api/analytics/performance';
static const String _pathApiAnalyticsPerformanceAlt = 'api/analytics/performance';

Future<void> _handlePerformanceAnalytics(HttpResponse response) async {
  final res = response;
  try {
    final timings = List<_QueryTiming>.from(_queryTimings);
    final totalQueries = timings.length;
    final totalDuration = timings.fold<int>(
      0, (sum, t) => sum + t.durationMs,
    );
    final avgDuration = totalQueries > 0
        ? (totalDuration / totalQueries).round()
        : 0;

    // Slow queries (> 100ms), sorted by duration desc
    final slowQueries = timings
        .where((t) => t.durationMs > 100)
        .toList()
      ..sort((a, b) => b.durationMs.compareTo(a.durationMs));

    // Group by SQL pattern (first 60 chars) for frequency
    final queryGroups = <String, List<_QueryTiming>>{};
    for (final t in timings) {
      final key = t.sql.trim().length > 60
          ? t.sql.trim().substring(0, 60)
          : t.sql.trim();
      queryGroups.putIfAbsent(key, () => []).add(t);
    }

    final patterns = queryGroups.entries.map((e) {
      final durations = e.value.map((t) => t.durationMs).toList();
      final avg = durations.reduce((a, b) => a + b) / durations.length;
      final max = durations.reduce((a, b) => a > b ? a : b);
      final total = durations.reduce((a, b) => a + b);
      return <String, dynamic>{
        'pattern': e.key,
        'count': durations.length,
        'avgMs': avg.round(),
        'maxMs': max,
        'totalMs': total,
      };
    }).toList()
      ..sort((a, b) =>
          (b['totalMs'] as int).compareTo(a['totalMs'] as int));

    _setJsonHeaders(res);
    res.write(jsonEncode(<String, dynamic>{
      'totalQueries': totalQueries,
      'totalDurationMs': totalDuration,
      'avgDurationMs': avgDuration,
      'slowQueries': slowQueries.take(20).map((t) => t.toJson()).toList(),
      'queryPatterns': patterns.take(20).toList(),
      'recentQueries': timings.reversed.take(50).map((t) => t.toJson()).toList(),
    }));
  } on Object catch (error, stack) {
    _logError(error, stack);
    await _sendErrorResponse(res, error);
  } finally {
    await res.close();
  }
}
```

### Clear Endpoint: `DELETE /api/analytics/performance`

```dart
Future<void> _clearPerformanceData(HttpResponse response) async {
  _queryTimings.clear();
  _setJsonHeaders(response);
  response.write(jsonEncode(<String, String>{'status': 'cleared'}));
  await response.close();
}
```

### Response Shape

```json
{
  "totalQueries": 147,
  "totalDurationMs": 1234,
  "avgDurationMs": 8,
  "slowQueries": [
    {
      "sql": "SELECT * FROM events WHERE ...",
      "durationMs": 245,
      "rowCount": 1500,
      "error": null,
      "at": "2026-03-07T12:00:00.000Z"
    }
  ],
  "queryPatterns": [
    {
      "pattern": "SELECT COUNT(*) AS c FROM",
      "count": 35,
      "avgMs": 2,
      "maxMs": 12,
      "totalMs": 70
    }
  ],
  "recentQueries": [
    { "sql": "...", "durationMs": 3, "rowCount": 5, "error": null, "at": "..." }
  ]
}
```

### Client-side UI

HTML:
```html
<div class="collapsible-header" id="perf-toggle">Query performance</div>
<div id="perf-collapsible" class="collapsible-body collapsed">
  <div class="sql-toolbar">
    <button type="button" id="perf-refresh">Refresh</button>
    <button type="button" id="perf-clear">Clear</button>
  </div>
  <div id="perf-results" style="display:none;"></div>
</div>
```

JS:
```javascript
document.getElementById('perf-refresh').addEventListener('click', function () {
  const container = document.getElementById('perf-results');
  fetch('/api/analytics/performance', authOpts())
    .then(function (r) { return r.json(); })
    .then(function (data) {
      let html = '<div style="display:flex;gap:1rem;flex-wrap:wrap;margin:0.3rem 0;">';
      html += '<div class="meta">Total: ' + data.totalQueries + ' queries</div>';
      html += '<div class="meta">Total time: ' + data.totalDurationMs + ' ms</div>';
      html += '<div class="meta">Avg: ' + data.avgDurationMs + ' ms</div>';
      html += '</div>';

      // Slow queries
      if (data.slowQueries && data.slowQueries.length > 0) {
        html += '<p class="meta" style="color:#e57373;font-weight:bold;">Slow queries (>100ms):</p>';
        html += '<table style="border-collapse:collapse;width:100%;font-size:11px;">';
        html += '<tr><th style="border:1px solid var(--border);padding:3px;">Duration</th><th style="border:1px solid var(--border);padding:3px;">Rows</th><th style="border:1px solid var(--border);padding:3px;">SQL</th></tr>';
        data.slowQueries.forEach(function (q) {
          html += '<tr><td style="border:1px solid var(--border);padding:3px;color:#e57373;font-weight:bold;">' + q.durationMs + ' ms</td>';
          html += '<td style="border:1px solid var(--border);padding:3px;">' + q.rowCount + '</td>';
          html += '<td style="border:1px solid var(--border);padding:3px;max-width:400px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + esc(q.sql) + '">' + esc(q.sql.slice(0, 80)) + '</td></tr>';
        });
        html += '</table>';
      }

      // Query patterns
      if (data.queryPatterns && data.queryPatterns.length > 0) {
        html += '<p class="meta" style="margin-top:0.5rem;">Most time-consuming patterns:</p>';
        html += '<table style="border-collapse:collapse;width:100%;font-size:11px;">';
        html += '<tr><th style="border:1px solid var(--border);padding:3px;">Total ms</th><th style="border:1px solid var(--border);padding:3px;">Count</th><th style="border:1px solid var(--border);padding:3px;">Avg ms</th><th style="border:1px solid var(--border);padding:3px;">Pattern</th></tr>';
        data.queryPatterns.forEach(function (p) {
          html += '<tr><td style="border:1px solid var(--border);padding:3px;">' + p.totalMs + '</td>';
          html += '<td style="border:1px solid var(--border);padding:3px;">' + p.count + '</td>';
          html += '<td style="border:1px solid var(--border);padding:3px;">' + p.avgMs + '</td>';
          html += '<td style="border:1px solid var(--border);padding:3px;" title="' + esc(p.pattern) + '">' + esc(p.pattern.slice(0, 60)) + '</td></tr>';
        });
        html += '</table>';
      }

      container.innerHTML = html;
      container.style.display = 'block';
    })
    .catch(function (e) {
      container.innerHTML = '<p class="meta" style="color:#e57373;">Error: ' + esc(e.message) + '</p>';
      container.style.display = 'block';
    });
});

document.getElementById('perf-clear').addEventListener('click', function () {
  fetch('/api/analytics/performance', authOpts({ method: 'DELETE' }))
    .then(function () {
      document.getElementById('perf-results').innerHTML = '<p class="meta">Cleared.</p>';
    });
});
```

## Effort Estimate

**M (Medium)**
- Server: ~80 lines (timing wrapper, data class, endpoint, clear endpoint)
- Client: ~70 lines JS, ~10 lines HTML
- Key design decision: query wrapping approach (2 lines in `start()`)

## Dependencies & Risks

- **Timing overhead**: `Stopwatch` is extremely lightweight (<1ms overhead per query). Acceptable for debug.
- **Memory**: 500 entries with SQL strings averages ~100-200 KB. Well within acceptable range.
- **Internal queries are timed**: The wrapping approach times ALL queries, including internal ones (`_getTableNames`, fingerprint checks, etc.). This is actually useful — shows infrastructure overhead. Could add a `source` field to distinguish user vs. internal queries.
- **Ring buffer**: Old entries are evicted automatically. No memory leak risk.
- **Thread safety**: Dart is single-threaded per isolate. No concurrency issues with the list.

## Testing Strategy

1. **Server test**: Start server, make requests, `GET /api/analytics/performance` — verify timings recorded
2. **Slow query**: Mock a query callback with `await Future.delayed(Duration(milliseconds: 150))` — verify it appears in slow queries
3. **Clear**: `DELETE /api/analytics/performance`, then GET — verify empty
4. **Pattern grouping**: Make same query 5 times — verify it shows count: 5 with averaged timing
5. **Ring buffer**: Record 600 timings — verify only 500 retained
6. **Error queries**: Query that throws — verify timing is recorded with error field
7. **Manual**: Browse tables, run SQL, check performance tab — verify real timings
