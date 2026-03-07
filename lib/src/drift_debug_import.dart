import 'dart:convert';

import 'drift_debug_import_result.dart';

export 'drift_debug_import_result.dart';

/// Processes data imports in CSV, JSON, or SQL format.
///
/// Stateless processor: call [processImport] with the parsed
/// request fields and a write-query callback. Used by the
/// `POST /api/import` handler to keep HTTP plumbing separate
/// from import logic.
final class DriftDebugImportProcessor {
  /// Creates a stateless import processor.
  const DriftDebugImportProcessor();

  /// Supported format identifiers.
  static const String formatJson = 'json';

  /// CSV format identifier.
  static const String formatCsv = 'csv';

  /// Raw SQL format identifier.
  static const String formatSql = 'sql';

  /// Imports [data] in the given [format] into [table].
  ///
  /// [writeQuery] executes a single SQL write statement.
  /// [sqlLiteral] converts a Dart value to a SQL literal
  /// string (for quoting).
  ///
  /// Throws [FormatException] for unsupported formats or
  /// malformed CSV. Per-row failures are collected in
  /// [DriftDebugImportResult.errors].
  Future<DriftDebugImportResult> processImport({
    required String format,
    required String data,
    required String table,
    required Future<void> Function(String sql) writeQuery,
    required String Function(Object? value) sqlLiteral,
  }) async {
    switch (format) {
      case formatJson:
        return await _importJson(
          data: data,
          table: table,
          writeQuery: writeQuery,
          sqlLiteral: sqlLiteral,
        );
      case formatCsv:
        return await _importCsv(
          data: data,
          table: table,
          writeQuery: writeQuery,
          sqlLiteral: sqlLiteral,
        );
      case formatSql:
        return await _importSql(
          data: data,
          table: table,
          writeQuery: writeQuery,
        );
      default:
        throw FormatException(
          'Unsupported format: $format. '
          'Use json, csv, or sql.',
        );
    }
  }

  Future<DriftDebugImportResult> _importJson({
    required String data,
    required String table,
    required Future<void> Function(String sql) writeQuery,
    required String Function(Object? value) sqlLiteral,
  }) async {
    final Object? decoded;
    try {
      decoded = jsonDecode(data);
    } on FormatException catch (e, st) {
      return Error.throwWithStackTrace(
        FormatException('Invalid JSON: ${e.message}'),
        st,
      );
    }

    if (decoded is! List) {
      throw const FormatException(
        'JSON data must be an array of objects.',
      );
    }
    int imported = 0;
    final errors = <String>[];

    for (int i = 0; i < decoded.length; i++) {
      final row = decoded[i];
      if (row is! Map) {
        errors.add('Row $i: not an object');
        continue;
      }
      try {
        final keys = row.keys.toList();
        final cols =
            keys.map(_escapeIdentifier).join(', ');
        final vals =
            keys.map((k) => sqlLiteral(row[k])).join(', ');
        await writeQuery(
          'INSERT INTO "$table" ($cols) VALUES ($vals)',
        );
        imported++;
      } on Object catch (e) {
        errors.add('Row $i: $e');
      }
    }

    return DriftDebugImportResult(
      imported: imported,
      errors: errors,
      format: formatJson,
      table: table,
    );
  }

  Future<DriftDebugImportResult> _importCsv({
    required String data,
    required String table,
    required Future<void> Function(String sql) writeQuery,
    required String Function(Object? value) sqlLiteral,
  }) async {
    final lines = parseCsvLines(data);
    if (lines.length < 2) {
      throw const FormatException(
        'CSV must have a header row and at least one data row.',
      );
    }

    final headers = lines[0];
    int imported = 0;
    final errors = <String>[];

    for (int i = 1; i < lines.length; i++) {
      try {
        final values = lines[i];
        if (values.length != headers.length) {
          errors.add(
            'Row $i: column count mismatch '
            '(${values.length} vs ${headers.length})',
          );
          continue;
        }
        final cols =
            headers.map(_escapeIdentifier).join(', ');
        final vals =
            values.map((v) => sqlLiteral(v)).join(', ');
        await writeQuery(
          'INSERT INTO "$table" ($cols) VALUES ($vals)',
        );
        imported++;
      } on Object catch (e) {
        errors.add('Row $i: $e');
      }
    }

    return DriftDebugImportResult(
      imported: imported,
      errors: errors,
      format: formatCsv,
      table: table,
    );
  }

  Future<DriftDebugImportResult> _importSql({
    required String data,
    required String table,
    required Future<void> Function(String sql) writeQuery,
  }) async {
    final statements = data
        .split(';')
        .map((s) => s.trim())
        .where((s) => s.isNotEmpty);
    int imported = 0;
    final errors = <String>[];

    for (final stmt in statements) {
      try {
        await writeQuery('$stmt;');
        imported++;
      } on Object catch (e) {
        errors.add('Statement error: $e');
      }
    }

    return DriftDebugImportResult(
      imported: imported,
      errors: errors,
      format: formatSql,
      table: table,
    );
  }

  /// Wraps a SQL identifier in double quotes, escaping any
  /// embedded double-quote characters by doubling them.
  static String _escapeIdentifier(Object? name) {
    final s = name.toString().replaceAll('"', '""');

    return '"$s"';
  }

  /// Parses CSV text into rows (each a list of field strings).
  ///
  /// Handles quoted fields with embedded commas, escaped
  /// quotes (`""`), CR+LF line endings, and UTF-8 BOM.
  /// Empty lines are skipped.
  ///
  /// Returns a list of rows where each row is a list of
  /// trimmed field values.
  static List<List<String>> parseCsvLines(String csv) {
    // Strip BOM and normalise line endings.
    var normalised = csv;
    if (normalised.isNotEmpty &&
        normalised.codeUnitAt(0) == 0xFEFF) {
      normalised = normalised.substring(1);
    }
    normalised = normalised
        .replaceAll('\r\n', '\n')
        .replaceAll('\r', '\n');

    final result = <List<String>>[];
    final lines = normalised.split('\n');

    for (final line in lines) {
      if (line.trim().isEmpty) continue;

      final fields = <String>[];
      var inQuotes = false;
      final current = StringBuffer();

      for (int i = 0; i < line.length; i++) {
        final c = line[i];
        if (c == '"') {
          if (inQuotes &&
              i + 1 < line.length &&
              line[i + 1] == '"') {
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

    return result;
  }

  @override
  String toString() =>
      'DriftDebugImportProcessor()';
}
