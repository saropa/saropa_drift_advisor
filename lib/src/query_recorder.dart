/// Query Replay DVR recorder for debug SQL activity.
///
/// Stores a bounded in-memory timeline of query events with stable IDs so the
/// extension can scrub and inspect recent query history.
library;

import 'dart:math' as math;

/// Immutable DVR query event stored in the recorder ring buffer.
final class RecordedQuery {
  /// Creates a recorded query entry.
  const RecordedQuery({
    required this.sessionId,
    required this.id,
    required this.sequence,
    required this.sql,
    required this.params,
    required this.type,
    required this.timestamp,
    required this.durationMs,
    required this.affectedRowCount,
    required this.resultRowCount,
    required this.table,
    required this.beforeState,
    required this.afterState,
    this.meta,
  });

  final String sessionId;
  final int id;
  final int sequence;
  final String sql;
  final Map<String, Object?> params;
  final String type;
  final String timestamp;
  final double durationMs;
  final int affectedRowCount;
  final int resultRowCount;
  final String? table;
  final List<Map<String, dynamic>>? beforeState;
  final List<Map<String, dynamic>>? afterState;
  final Map<String, Object?>? meta;

  /// Converts this query entry to JSON for HTTP transport.
  Map<String, Object?> toJson() => <String, Object?>{
    'sessionId': sessionId,
    'id': id,
    'sequence': sequence,
    'sql': sql,
    'params': params,
    'type': type,
    'timestamp': timestamp,
    'durationMs': durationMs,
    'affectedRowCount': affectedRowCount,
    'resultRowCount': resultRowCount,
    'table': table,
    'beforeState': beforeState,
    'afterState': afterState,
    'meta': meta,
  };
}

/// Result page for cursor-based DVR query listing.
final class RecordedQueryPage {
  /// Creates a page with cursors for forward/backward pagination.
  const RecordedQueryPage({
    required this.items,
    required this.nextCursor,
    required this.prevCursor,
  });

  final List<RecordedQuery> items;
  final int? nextCursor;
  final int? prevCursor;
}

/// In-memory DVR ring buffer recorder.
final class QueryRecorder {
  /// Creates a query recorder with optional runtime configuration.
  QueryRecorder({int maxQueries = 5000, bool captureBeforeAfter = true})
    : _maxQueries = maxQueries > 0 ? maxQueries : 5000,
      _captureBeforeAfter = captureBeforeAfter;

  final List<RecordedQuery> _queries = <RecordedQuery>[];
  bool _recording = false;
  int _nextId = 0;
  int _maxQueries;
  bool _captureBeforeAfter;
  String _sessionId = 'dvr-session-0';

  /// Whether recording is currently active.
  bool get isRecording => _recording;

  /// Current ring buffer size.
  int get queryCount => _queries.length;

  /// Minimum available ID in the ring buffer, or null when empty.
  int? get minAvailableId => _queries.isEmpty ? null : _queries.first.id;

  /// Maximum available ID in the ring buffer, or null when empty.
  int? get maxAvailableId => _queries.isEmpty ? null : _queries.last.id;

  /// Active recording session ID.
  String get sessionId => _sessionId;

  /// Enables recording and resets the current session buffer.
  void startRecording() {
    _recording = true;
    _queries.clear();
    _nextId = 0;
    _sessionId = 'dvr-session-${DateTime.now().microsecondsSinceEpoch}';
  }

  /// Stops recording but keeps existing timeline data.
  void stopRecording() {
    _recording = false;
  }

  /// Updates recorder runtime configuration.
  void updateConfig({int? maxQueries, bool? captureBeforeAfter}) {
    if (maxQueries != null && maxQueries > 0) {
      _maxQueries = maxQueries;
      while (_queries.length > _maxQueries) {
        _queries.removeAt(0);
      }
    }
    if (captureBeforeAfter != null) {
      _captureBeforeAfter = captureBeforeAfter;
    }
  }

  /// Records a read query event.
  ///
  /// When [declaredParams] is non-null (from `/api/sql` `args` / `namedArgs`),
  /// stores them on the timeline and clears `bindingsUnavailable`. Otherwise
  /// records empty params with `bindingsUnavailable: true` (host callback
  /// does not expose bound parameters).
  void recordRead({
    required String sql,
    required DateTime startedAtUtc,
    required Duration elapsed,
    required int resultRowCount,
    Map<String, Object?>? declaredParams,
    bool declaredParamsTruncated = false,
    bool hasDeclaredBindings = false,
  }) {
    if (!_recording) {
      return;
    }
    final useDeclared = hasDeclaredBindings && declaredParams != null;
    final params = useDeclared
        ? declaredParams
        : const <String, Object?>{
            'positional': <Object?>[],
            'named': <String, Object?>{},
          };
    final meta = useDeclared
        ? <String, Object?>{
            'bindingsUnavailable': false,
            if (declaredParamsTruncated) 'truncated': true,
          }
        : const <String, Object?>{'bindingsUnavailable': true};
    _record(
      RecordedQuery(
        sessionId: _sessionId,
        id: _nextId,
        sequence: _nextId,
        sql: sql,
        params: params,
        type: _classifySql(sql),
        timestamp: startedAtUtc.toIso8601String(),
        durationMs: elapsed.inMicroseconds / 1000.0,
        affectedRowCount: 0,
        resultRowCount: resultRowCount,
        table: _parseTableName(sql),
        beforeState: null,
        afterState: null,
        meta: meta,
      ),
    );
    _nextId++;
  }

  /// Records a write query event with optional before/after snapshots.
  ///
  /// [declaredWriteParams] is reserved for future HTTP-declared write bindings;
  /// when null, `meta.bindingsUnavailable` stays true.
  void recordWrite({
    required String sql,
    required DateTime startedAtUtc,
    required Duration elapsed,
    required int affectedRowCount,
    List<Map<String, dynamic>>? beforeState,
    List<Map<String, dynamic>>? afterState,
    Map<String, Object?>? declaredWriteParams,
    bool declaredWriteParamsTruncated = false,
    bool hasDeclaredWriteBindings = false,
  }) {
    if (!_recording) {
      return;
    }
    final useDeclared = hasDeclaredWriteBindings && declaredWriteParams != null;
    final params = useDeclared
        ? declaredWriteParams
        : const <String, Object?>{
            'positional': <Object?>[],
            'named': <String, Object?>{},
          };
    final meta = useDeclared
        ? <String, Object?>{
            'bindingsUnavailable': false,
            if (declaredWriteParamsTruncated) 'truncated': true,
          }
        : const <String, Object?>{'bindingsUnavailable': true};
    _record(
      RecordedQuery(
        sessionId: _sessionId,
        id: _nextId,
        sequence: _nextId,
        sql: sql,
        params: params,
        type: _classifySql(sql),
        timestamp: startedAtUtc.toIso8601String(),
        durationMs: elapsed.inMicroseconds / 1000.0,
        affectedRowCount: math.max(0, affectedRowCount),
        resultRowCount: 0,
        table: _parseTableName(sql),
        beforeState: _captureBeforeAfter ? beforeState : null,
        afterState: _captureBeforeAfter ? afterState : null,
        meta: meta,
      ),
    );
    _nextId++;
  }

  /// Returns a cursor page of recorded queries.
  RecordedQueryPage queriesPage({
    required int cursor,
    required int limit,
    required String direction,
  }) {
    if (_queries.isEmpty) {
      return const RecordedQueryPage(
        items: <RecordedQuery>[],
        nextCursor: null,
        prevCursor: null,
      );
    }
    final normalizedLimit = limit <= 0 ? 100 : math.min(limit, 500);
    final isBackward = direction.toLowerCase() == 'backward';
    final items = <RecordedQuery>[];

    if (isBackward) {
      for (int i = _queries.length - 1; i >= 0; i--) {
        final q = _queries[i];
        if (cursor >= 0 && q.id >= cursor) {
          continue;
        }
        items.add(q);
        if (items.length >= normalizedLimit) {
          break;
        }
      }
      final ordered = items.reversed.toList(growable: false);
      items
        ..clear()
        ..addAll(ordered);
    } else {
      for (final q in _queries) {
        if (cursor >= 0 && q.id <= cursor) {
          continue;
        }
        items.add(q);
        if (items.length >= normalizedLimit) {
          break;
        }
      }
    }

    if (items.isEmpty) {
      return const RecordedQueryPage(
        items: <RecordedQuery>[],
        nextCursor: null,
        prevCursor: null,
      );
    }
    return RecordedQueryPage(
      items: items,
      nextCursor: items.last.id,
      prevCursor: items.first.id,
    );
  }

  /// Looks up a query by session and ID.
  RecordedQuery? queryBySessionAndId(String sessionId, int id) {
    for (final q in _queries) {
      if (q.sessionId == sessionId && q.id == id) {
        return q;
      }
    }
    return null;
  }

  /// Whether before/after snapshots are enabled.
  bool get captureBeforeAfter => _captureBeforeAfter;

  /// Current maximum number of timeline entries retained before eviction.
  int get maxBufferQueries => _maxQueries;

  /// Appends [query] to the ring buffer, evicting the oldest entry once the
  /// buffer exceeds [_maxQueries] so memory stays bounded under long sessions.
  void _record(RecordedQuery query) {
    _queries.add(query);
    if (_queries.length > _maxQueries) {
      _queries.removeAt(0);
    }
  }

  /// Classifies [sql] as `'select'` / `'insert'` / `'update'` / `'delete'` /
  /// `'other'` from the leading keyword (WITH...SELECT counts as select).
  static String _classifySql(String sql) {
    final trimmed = sql.trimLeft().toUpperCase();
    if (trimmed.startsWith('SELECT') || trimmed.startsWith('WITH'))
      return 'select';
    if (trimmed.startsWith('INSERT')) return 'insert';
    if (trimmed.startsWith('UPDATE')) return 'update';
    if (trimmed.startsWith('DELETE')) return 'delete';
    return 'other';
  }

  /// Extracts the target table identifier from [sql] for UPDATE / INSERT INTO
  /// / DELETE FROM / SELECT ... FROM. Returns null when no pattern matches.
  static String? _parseTableName(String sql) {
    final cleaned = sql.replaceAll('\n', ' ').trim();
    final patterns = <RegExp>[
      RegExp(r'^\s*UPDATE\s+"?([A-Za-z0-9_]+)"?', caseSensitive: false),
      RegExp(r'^\s*INSERT\s+INTO\s+"?([A-Za-z0-9_]+)"?', caseSensitive: false),
      RegExp(r'^\s*DELETE\s+FROM\s+"?([A-Za-z0-9_]+)"?', caseSensitive: false),
      RegExp(
        r'^\s*SELECT\s+.*?\s+FROM\s+"?([A-Za-z0-9_]+)"?',
        caseSensitive: false,
      ),
    ];
    for (final p in patterns) {
      final match = p.firstMatch(cleaned);
      if (match != null) {
        return match.group(1);
      }
    }
    return null;
  }
}
