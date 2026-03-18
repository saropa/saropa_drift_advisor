// Pure static utility methods extracted from
// ServerContext. These are stateless helper functions
// used across multiple handler files.

import 'dart:convert';
import 'dart:developer' as developer;

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

    return countValue is int
        ? countValue
        : (countValue is num ? countValue.toInt() : 0);
  }

  /// Fetches table names from sqlite_master
  /// (type='table', exclude sqlite_*).
  ///
  /// Returns a sorted list of non-empty table name
  /// strings.
  static Future<List<String>> getTableNames(DriftDebugQuery queryFn) async {
    final dynamic raw = await queryFn(ServerConstants.sqlTableNames);

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

  /// Escapes a value for use in a SQL INSERT literal.
  ///
  /// Returns a SQL-safe string representation: NULL for
  /// null, unquoted for numbers, quoted for strings,
  /// and X'...' for byte lists.
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
      final escaped = value.replaceAll(r'\', r'\\').replaceAll("'", "''");

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

    final escaped = value
        .toString()
        .replaceAll(r'\', r'\\')
        .replaceAll("'", "''");

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

    return s.replaceRange(safeEnd, s.length, '').replaceRange(0, start, '');
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

  /// Parses CSV text into a list of rows (each a list
  /// of field strings).
  ///
  /// Returns a list where each element is one parsed
  /// row. Handles quoted fields with embedded commas
  /// and escaped quotes ("").
  static List<List<String>> parseCsvLines(String csv) {
    final result = <List<String>>[];
    final lines = csv.split('\n');
    final current = StringBuffer();

    for (final line in lines) {
      if (line.trim().isNotEmpty) {
        final fields = <String>[];
        var inQuotes = false;

        current.clear();

        for (int i = 0; i < line.length; i++) {
          final c = line[i];

          if (c == '"') {
            if (inQuotes && i + 1 < line.length && line[i + 1] == '"') {
              current.write('"');
              i++;
            } else {
              inQuotes = !inQuotes;
            }
          } else if (c == ',' && !inQuotes) {
            fields.add(current.toString().trim());
            current.clear();
          } else {
            current.write(c);
          }
        }

        fields.add(current.toString().trim());
        result.add(fields);
      }
    }

    return result;
  }

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
