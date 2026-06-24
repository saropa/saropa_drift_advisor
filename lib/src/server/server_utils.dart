// Pure static utility methods extracted from
// ServerContext. These are stateless helper functions
// used across multiple handler files.

import 'dart:async';
import 'dart:convert';
import 'dart:developer' as developer;
import 'dart:io';
import 'dart:typed_data';

import 'server_constants.dart';
import 'server_typedefs.dart';

/// Static utility methods shared across server handlers.
///
/// All methods are [static] and stateless — they depend
/// only on their parameters, never on instance fields.
/// Extracted from [ServerContext] to keep that class
/// focused on state management.
abstract final class ServerUtils {
  /// Normalizes raw query result to a list of maps.
  ///
  /// Returns an empty list when [raw] is null or not a
  /// [List]. Non-Map items are silently skipped.
  static List<Map<String, dynamic>> normalizeRows(dynamic raw) {
    if (raw == null) {
      return [];
    }
    if (raw is! List) {
      return [];
    }

    final out = <Map<String, dynamic>>[];

    for (final item in raw) {
      if (item is Map) {
        out.add(Map<String, dynamic>.from(item));
      }
    }

    return out;
  }

  /// `toEncodable` callback for [jsonEncode] that guarantees the encode never
  /// throws on a value SQLite/Drift can return but `dart:convert` cannot encode
  /// directly.
  ///
  /// `jsonEncode` throws `JsonUnsupportedObjectError` the moment it meets a
  /// value outside its built-in set (num, String, bool, null, List, Map). A
  /// query result can carry such a value — most commonly a `DateTime` (Drift
  /// `DateTimeColumn` rows), but also `BigInt`, `Duration`, or any custom type a
  /// host executor maps a column to. Before this, such a row made the SQL
  /// response handler's `jsonEncode` throw AFTER headers were set, producing an
  /// ambiguous truncated/empty body instead of either rows or a JSON error —
  /// exactly the "empty 200, no rows, no error" symptom reported by an external
  /// agent (plans/history/2026.06/2026.06.24/BUG_loopback_server_wedges_and_hard_to_discover_for_agents.md).
  ///
  /// Routing the encode through this fallback turns any unencodable value into a
  /// string (ISO-8601 for [DateTime]) so the response is always well-formed.
  /// `List<int>` (BLOB bytes) is intentionally NOT handled here — `jsonEncode`
  /// already encodes it as a JSON array of integers, so it never reaches this
  /// callback.
  static Object jsonEncodeFallback(Object? value) {
    if (value is DateTime) {
      return value.toIso8601String();
    }
    return value.toString();
  }

  /// Extracts COUNT(*) result from a single-row query
  /// (column 'c').
  ///
  /// Returns 0 if [rows] is empty or the count column
  /// is null.
  static int extractCountFromRows(List<Map<String, dynamic>> rows) {
    final firstRow = rows.firstOrNull;

    if (firstRow == null ||
        firstRow[ServerConstants.jsonKeyCountColumn] == null) {
      return 0;
    }

    final countValue = firstRow[ServerConstants.jsonKeyCountColumn];

    // Handle the String case: some host executors (JSON round-trips, certain
    // sqflite/custom backends) return numeric columns as strings. Without this
    // branch a string COUNT silently became 0, making every count-based anomaly
    // check (nulls, empty strings, duplicates, orphan FKs) report no findings.
    // Mirrors the String-tolerant parsing already in report_handler/analytics.
    // See plans/full-codebase-audit-2026.06.12.md M1.
    if (countValue is int) {
      return countValue;
    }
    if (countValue is num) {
      return countValue.toInt();
    }
    if (countValue is String) {
      return int.tryParse(countValue) ?? 0;
    }
    return 0;
  }

  /// Fetches object names from sqlite_master (excludes sqlite_* bookkeeping).
  ///
  /// Includes views by default so callers that display or browse the schema
  /// (sidebar, metadata, column pickers, table-data, diff) see the user's full
  /// data model — e.g. PowerSync fronts JSON-backed storage with views. Pass
  /// [includeViews] false for callers that reason specifically about base
  /// tables (the orphan-table check, which would otherwise flag every view as
  /// an undeclared orphan). See GitHub issue #32.
  ///
  /// Returns a sorted list of non-empty names.
  static Future<List<String>> getTableNames(
    DriftDebugQuery queryFn, {
    bool includeViews = true,
  }) async {
    final dynamic raw = await queryFn(
      includeViews
          ? ServerConstants.sqlTableNames
          : ServerConstants.sqlBaseTableNames,
    );

    final List<Map<String, dynamic>> rows = normalizeRows(raw);

    return rows
        .map((row) => row[ServerConstants.jsonKeyName] as String? ?? '')
        .where((nameStr) => nameStr.isNotEmpty)
        .toList();
  }

  /// Parses limit query param; clamps to 1..maxLimit.
  ///
  /// Returns [ServerConstants.defaultLimit] when
  /// [value] is null or not a valid positive integer.
  static int parseLimit(String? value) {
    if (value == null) {
      return ServerConstants.defaultLimit;
    }

    final int? n = int.tryParse(value);

    if (n == null || n < ServerConstants.minLimit) {
      return ServerConstants.defaultLimit;
    }

    return n.clamp(ServerConstants.minLimit, ServerConstants.maxLimit);
  }

  /// Parses offset query param.
  ///
  /// Returns 0 if [value] is null or not a valid
  /// non-negative integer; caps at
  /// [ServerConstants.maxOffset].
  static int parseOffset(String? value) {
    if (value == null) {
      return 0;
    }

    final int? n = int.tryParse(value);

    if (n == null || n < 0) {
      return 0;
    }

    return n > ServerConstants.maxOffset ? ServerConstants.maxOffset : n;
  }

  /// Reads the full request body into bytes, enforcing a [maxBytes] cap.
  ///
  /// Returns null when the body exceeds the cap — either by the declared
  /// `Content-Length` (fast reject) or by the bytes actually streamed (a client
  /// can lie about or omit Content-Length). The caller turns null into HTTP 413.
  ///
  /// Every POST handler buffers the whole body before validating it; without a
  /// cap a client could stream an arbitrarily large body and exhaust memory
  /// before any size check ran. See plans/full-codebase-audit-2026.06.12.md H3.
  ///
  /// Implemented with an explicit [StreamSubscription] rather than `await for`
  /// so the method needs no `async` wrapper — the overflow path cancels the
  /// subscription to stop reading immediately, which an `await for` + `return`
  /// also did, but without the redundant async/Future scheduling overhead.
  static Future<Uint8List?> readBodyBytes(
    HttpRequest request, {
    required int maxBytes,
  }) {
    // Fast path: trust a declared length only to reject early. -1 means unknown.
    final declared = request.contentLength;
    if (declared > maxBytes) {
      return Future<Uint8List?>.value(null);
    }

    final completer = Completer<Uint8List?>();
    final builder = BytesBuilder(copy: false);
    var total = 0;
    late final StreamSubscription<Uint8List> subscription;

    subscription = request.listen(
      (chunk) {
        total += chunk.length;
        if (total > maxBytes) {
          // The streamed size beat the cap regardless of what Content-Length
          // claimed. Cancel so we stop reading instead of buffering more, then
          // signal overflow. Guard isCompleted so a late onDone can't double
          // complete.
          unawaited(subscription.cancel());
          if (!completer.isCompleted) {
            completer.complete(null);
          }
          return;
        }
        builder.add(chunk);
      },
      onError: completer.completeError,
      onDone: () {
        if (!completer.isCompleted) {
          completer.complete(builder.takeBytes());
        }
      },
      // A stream error aborts the read; cancel and surface it to the caller,
      // matching the throw an `await for` would have produced.
      cancelOnError: true,
    );

    return completer.future;
  }

  /// Quotes [name] as a SQLite identifier (table or column), doubling any
  /// embedded double-quote.
  ///
  /// Every identifier interpolated into SQL must go through this. Table/column
  /// names are validated against `sqlite_master`/PRAGMA before use, but a name
  /// is a legal SQLite identifier even when it contains `"` (`CREATE TABLE
  /// "a""b" …`), so interpolating it raw as `"$name"` lets that `"` break out of
  /// the quoting — identifier injection / broken SQL. Doubling the quote closes
  /// that. See plans/full-codebase-audit-2026.06.12.md H2.
  static String quoteIdent(String name) => '"${name.replaceAll('"', '""')}"';

  /// Escapes a value for use in a SQL INSERT literal.
  ///
  /// Returns a SQL-safe string representation: NULL for
  /// null, unquoted for numbers, quoted for strings,
  /// and X'...' for byte lists.
  ///
  /// String escaping doubles single quotes ONLY (`'` → `''`). SQLite string
  /// literals have no backslash escape — `\` is an ordinary character — so the
  /// previous `\` → `\\` doubling silently corrupted any value containing a
  /// backslash (e.g. `C:\path` was stored as `C:\\path`). Doubling the quote is
  /// both necessary and sufficient to neutralize injection here.
  /// See plans/full-codebase-audit-2026.06.12.md C3.
  static String sqlLiteral(Object? value) {
    if (value == null) {
      return 'NULL';
    }
    if (value is num) {
      return value.toString();
    }
    if (value is bool) {
      return value ? '1' : '0';
    }

    if (value is String) {
      final escaped = value.replaceAll("'", "''");

      return "'$escaped'";
    }

    if (value is List<int>) {
      final hex = value
          .map(
            (b) => b
                .toRadixString(ServerConstants.hexRadix)
                .padLeft(ServerConstants.hexBytePadding, '0'),
          )
          .join();

      return "X'$hex'";
    }

    final escaped = value.toString().replaceAll("'", "''");

    return "'$escaped'";
  }

  /// Returns substring from [start] to [end] safely.
  ///
  /// Avoids RangeError by clamping indices. Returns
  /// empty string when bounds are invalid.
  static String safeSubstring(String s, {required int start, int? end}) {
    if (start < 0 || start >= s.length) {
      return '';
    }

    final endIndex = end ?? s.length;

    if (endIndex <= start) {
      return '';
    }

    final safeEnd = endIndex > s.length ? s.length : endIndex;

    if (start >= safeEnd) {
      return '';
    }

    // The four guards above prove 0 <= start < safeEnd <= s.length, so the
    // direct substring cannot throw. (Was a double replaceRange — correct but
    // obscure and double-allocating. See audit L4.)
    return s.substring(start, safeEnd);
  }

  /// Stable JSON string representation of a row for
  /// diffing (sorted keys).
  ///
  /// Returns a deterministic JSON encoding of [row]
  /// with keys in alphabetical order.
  static String rowSignature(Map<String, dynamic> row) {
    final keys = row.keys.toList()..sort();

    final sorted = <String, dynamic>{};

    for (final k in keys) {
      sorted[k] = row[k];
    }

    return jsonEncode(sorted);
  }

  /// Builds a composite primary key string for [row]
  /// by joining values of [pkColumns] with `|`.
  ///
  /// Returns a pipe-delimited string of PK column values
  /// used to match rows across snapshots by identity.
  static String compositePkKey(
    List<String> pkColumns,
    Map<String, dynamic> row,
  ) => pkColumns.map((c) => '${row[c]}').join('|');

  /// Fetches schema (CREATE statements) from
  /// sqlite_master, no data.
  ///
  /// Returns the schema DDL as a single string with
  /// each statement on its own line, terminated by a
  /// semicolon.
  static Future<String> getSchemaSql(DriftDebugQuery queryFn) async {
    final dynamic raw = await queryFn(ServerConstants.sqlSchemaMaster);

    final List<Map<String, dynamic>> rows = normalizeRows(raw);

    final buffer = StringBuffer();

    for (final row in rows) {
      final stmt = row[ServerConstants.jsonKeySql] as String?;

      if (stmt != null && stmt.isNotEmpty) {
        buffer.writeln(stmt);
        if (!stmt.trimRight().endsWith(';')) {
          buffer.write(';');
        }
        buffer.writeln();
      }
    }

    return buffer.toString();
  }

  /// Decodes a JSON string and returns it as a map,
  /// or null if the input is not a valid JSON object.
  static Map<String, dynamic>? parseJsonMap(String body) {
    final Object? decoded;
    try {
      decoded = jsonDecode(body);
    } on FormatException catch (e) {
      developer.log('parseJsonMap: $e', name: 'DriftDebugServer');
      return null;
    }

    return decoded is Map<String, dynamic> ? decoded : null;
  }

  static final RegExp _reTextType = RegExp(
    r'TEXT|VARCHAR|CHAR|CLOB|STRING',
    caseSensitive: false,
  );

  static final RegExp _reNumericType = RegExp(
    r'INT|REAL|NUM|FLOAT|DOUBLE|DECIMAL',
    caseSensitive: false,
  );

  /// Returns true if [type] is a SQLite TEXT type.
  static bool isTextType(String type) => _reTextType.hasMatch(type);

  /// Returns true if [type] is a SQLite numeric type.
  static bool isNumericType(String type) => _reNumericType.hasMatch(type);

  /// Returns true if [type] represents a boolean column.
  ///
  /// Matches `BOOLEAN`, `BOOL`, and `BIT` — column types
  /// that store true/false values as integers. Note that
  /// Drift compiles [BoolColumn] to `INTEGER` in SQLite
  /// (no native boolean type), so this check only catches
  /// columns whose declared type explicitly uses a boolean
  /// keyword. For `INTEGER`-typed boolean columns, the
  /// caller should also check the value domain (min/max).
  static bool isBooleanType(String type) {
    final upper = type.toUpperCase().trim();
    return upper == 'BOOLEAN' || upper == 'BOOL' || upper == 'BIT';
  }

  /// Safe double conversion from dynamic [value].
  ///
  /// Returns null when [value] is not a number or
  /// parseable string.
  static double? toDouble(Object? value) {
    if (value is double) {
      return value;
    }
    if (value is int) {
      return value.toDouble();
    }
    if (value is String) {
      return double.tryParse(value);
    }

    return null;
  }

  // NOTE: the CSV parser previously duplicated here was removed (audit L7). It
  // was the weaker of two copies — it split on `\n` before parsing quotes (so a
  // quoted newline broke the row) and trimmed quoted content — and was used only
  // by its own tests, never by production code. The canonical, RFC-4180-correct
  // parser is `DriftDebugImportProcessor.parseCsvLines`, which the import path
  // actually calls. Keeping one implementation avoids a future caller picking the
  // weaker one.

  /// Severity sort order fallback for unknown values.
  static const int _unknownSeverityOrder = 3;

  /// Sorts anomalies in-place: errors first, then
  /// warnings, then info.
  static void sortAnomaliesBySeverity(List<Map<String, dynamic>> anomalies) {
    const severityOrder = <String, int>{'error': 0, 'warning': 1, 'info': 2};

    anomalies.sort(
      (a, b) => (severityOrder[a['severity']] ?? _unknownSeverityOrder)
          .compareTo(severityOrder[b['severity']] ?? _unknownSeverityOrder),
    );
  }
}
