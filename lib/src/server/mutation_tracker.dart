/**
 * Captures INSERT/UPDATE/DELETE mutations triggered by the server's
 * [DriftDebugWriteQuery] callback and stores them in an in-memory ring buffer.
 *
 * The server currently exposes mutations only via the optional
 * `/api/mutations` endpoint, which is enabled when `writeQuery` is configured.
 *
 * Note: this implementation is best-effort. It infers the affected table/type
 * and, for INSERT, captures the inserted row using `last_insert_rowid()`.
 * For UPDATE/DELETE it only captures before/after rows when a simple WHERE
 * clause can be extracted from the SQL.
 */

import 'dart:async';
import 'dart:developer' as developer;

import 'server_typedefs.dart';

enum MutationType { insert, update, delete }

final class MutationEvent {
  MutationEvent({
    required this.id,
    required this.type,
    required this.table,
    required this.sql,
    required this.timestamp,
    required this.beforeRows,
    required this.afterRows,
  });

  final int id;
  final MutationType type;
  final String table;
  final String sql;
  final DateTime timestamp;
  final List<Map<String, dynamic>>? beforeRows;
  final List<Map<String, dynamic>>? afterRows;

  Map<String, dynamic> toJson() => {
    'id': id,
    'type': type.name,
    'table': table,
    'before': beforeRows,
    'after': afterRows,
    'sql': sql,
    'timestamp': timestamp.toUtc().toIso8601String(),
  };
}

class MutationTracker {
  static const int maxEvents = 500;

  final List<MutationEvent> _events = [];
  final List<Completer<void>> _waiters = [];
  int _latestId = 0;

  int get latestId => _latestId;

  List<MutationEvent> eventsSince(int since) {
    if (_events.isEmpty) return const [];
    // Ids are monotonically increasing with evictions, so linear scan
    // is fine for 500-entry buffers.
    return _events.where((e) => e.id > since).toList(growable: false);
  }

  Future<void> waitForAnyEvent(Duration timeout) async {
    final completer = Completer<void>();
    _waiters.add(completer);

    try {
      await completer.future.timeout(timeout);
    } on TimeoutException catch (error, stack) {
      // Timeout is expected for long-poll clients; log at trace level context.
      developer.log(
        'No mutation event arrived before timeout.',
        name: 'saropa_drift_advisor.mutation_tracker',
        error: error,
        stackTrace: stack,
      );
      if (!completer.isCompleted) completer.complete();
    } finally {
      _waiters.remove(completer);
    }
  }

  Future<void> captureFromWriteQuery({
    required DriftDebugWriteQuery originalWrite,
    required DriftDebugQuery readQuery,
    required String sql,
  }) async {
    final parsed = _parseSqlForMutation(sql);
    if (parsed == null) {
      await originalWrite(sql);
      return;
    }

    final type = parsed.type;
    final table = parsed.table;
    final whereClause = parsed.whereClause;

    List<Map<String, dynamic>>? beforeRows;
    List<Map<String, dynamic>>? afterRows;

    try {
      if (type == MutationType.insert) {
        // Insert: capture the inserted row by rowid after the write runs.
      } else {
        // Update/Delete: capture before/after when a simple WHERE can be
        // extracted. We best-effort this; when parsing fails, before/after
        // remain null.
        if (whereClause != null) {
          beforeRows = await _captureByWhere(
            readQuery: readQuery,
            table: table,
            whereClause: whereClause,
          );
        }
      }

      // Execute the write statement (may throw).
      await originalWrite(sql);

      if (type == MutationType.insert) {
        // Capture the inserted row by rowid.
        afterRows = await _captureAfterInsert(
          readQuery: readQuery,
          table: table,
        );
      } else {
        if (whereClause != null) {
          afterRows = await _captureByWhere(
            readQuery: readQuery,
            table: table,
            whereClause: whereClause,
          );
        }
      }
    } on Object catch (error, stack) {
      // Log best-effort capture failures so silent mutation losses are visible.
      developer.log(
        'Mutation capture failed for table "$table".',
        name: 'saropa_drift_advisor.mutation_tracker',
        error: error,
        stackTrace: stack,
      );
      // Don't prevent the caller from seeing writeQuery errors.
      // Still record the mutation so the UI can show what failed.
      _recordEvent(
        type: type,
        table: table,
        beforeRows: beforeRows,
        afterRows: afterRows,
        sql: sql,
      );
      rethrow;
    }

    _recordEvent(
      type: type,
      table: table,
      beforeRows: beforeRows,
      afterRows: afterRows,
      sql: sql,
    );
  }

  void _recordEvent({
    required MutationType type,
    required String table,
    required List<Map<String, dynamic>>? beforeRows,
    required List<Map<String, dynamic>>? afterRows,
    required String sql,
  }) {
    final id = ++_latestId;
    final event = MutationEvent(
      id: id,
      type: type,
      table: table,
      sql: sql,
      beforeRows: beforeRows,
      afterRows: afterRows,
      timestamp: DateTime.now(),
    );

    _events.add(event);
    if (_events.length > maxEvents) {
      _events.removeRange(0, _events.length - maxEvents);
    }

    // Notify all waiters that at least one event was added.
    for (final waiter in List<Completer<void>>.from(_waiters)) {
      if (!waiter.isCompleted) waiter.complete();
    }
    _waiters.clear();
  }

  Future<List<Map<String, dynamic>>?> _captureByWhere({
    required DriftDebugQuery readQuery,
    required String table,
    required String whereClause,
  }) async {
    try {
      final sql = 'SELECT * FROM "$table" WHERE $whereClause';
      return await readQuery(sql);
    } on Object catch (error, stack) {
      // Capture is optional; log and continue when snapshot reads fail.
      developer.log(
        'Failed to capture rows by WHERE clause for table "$table".',
        name: 'saropa_drift_advisor.mutation_tracker',
        error: error,
        stackTrace: stack,
      );
      return null;
    }
  }

  Future<List<Map<String, dynamic>>?> _captureAfterInsert({
    required DriftDebugQuery readQuery,
    required String table,
  }) async {
    try {
      // Capture a single row (best-effort). For multi-row inserts, this will
      // only reflect the last inserted row.
      final sql = 'SELECT * FROM "$table" WHERE rowid = last_insert_rowid()';
      return await readQuery(sql);
    } on Object catch (error, stack) {
      // Capture is optional; log and continue when post-insert lookup fails.
      developer.log(
        'Failed to capture inserted row for table "$table".',
        name: 'saropa_drift_advisor.mutation_tracker',
        error: error,
        stackTrace: stack,
      );
      return null;
    }
  }

  _ParsedMutation? _parseSqlForMutation(String rawSql) {
    final sql = rawSql.trim().replaceAll(RegExp(r';\\s*$'), '');

    final insertMatch = RegExp(
      r'insert\\s+into\\s+(?:(?:"([^"]+)")|(?:([A-Za-z_][\\w$]*)))',
      caseSensitive: false,
      dotAll: true,
    ).firstMatch(sql);
    if (insertMatch != null) {
      final table = _unescapeQuotedIdentifier(
        insertMatch.group(1) ?? insertMatch.group(2) ?? '',
      );
      if (table.isNotEmpty) {
        return _ParsedMutation(type: MutationType.insert, table: table);
      }
    }

    final updateMatch = RegExp(
      r'update\\s+(?:(?:"([^"]+)")|(?:([A-Za-z_][\\w$]*)))',
      caseSensitive: false,
      dotAll: true,
    ).firstMatch(sql);
    if (updateMatch != null) {
      final table = _unescapeQuotedIdentifier(
        updateMatch.group(1) ?? updateMatch.group(2) ?? '',
      );
      if (table.isNotEmpty) {
        return _ParsedMutation(
          type: MutationType.update,
          table: table,
          whereClause: _extractWhereClause(sql),
        );
      }
    }

    final deleteMatch = RegExp(
      r'delete\\s+from\\s+(?:(?:"([^"]+)")|(?:([A-Za-z_][\\w$]*)))',
      caseSensitive: false,
      dotAll: true,
    ).firstMatch(sql);
    if (deleteMatch != null) {
      final table = _unescapeQuotedIdentifier(
        deleteMatch.group(1) ?? deleteMatch.group(2) ?? '',
      );
      if (table.isNotEmpty) {
        return _ParsedMutation(
          type: MutationType.delete,
          table: table,
          whereClause: _extractWhereClause(sql),
        );
      }
    }

    return null;
  }

  String? _extractWhereClause(String sql) {
    final match = RegExp(
      r'\\bWHERE\\b\\s+(.+?)\\s*(?:\\bRETURNING\\b|$|;)',
      caseSensitive: false,
      dotAll: true,
    ).firstMatch(sql);
    if (match == null) return null;
    final where = match.group(1)?.trim();
    if (where == null || where.isEmpty) return null;
    return where;
  }

  String _unescapeQuotedIdentifier(String raw) {
    // Import escapes identifiers by doubling embedded quotes: "" -> "
    return raw.replaceAll('""', '"');
  }
}

final class _ParsedMutation {
  const _ParsedMutation({
    required this.type,
    required this.table,
    this.whereClause,
  });

  final MutationType type;
  final String table;
  final String? whereClause;
}
