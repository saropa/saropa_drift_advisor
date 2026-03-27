// Handles POST /api/cell/update for browser (and API) inline cell edits.
//
// Requires [ServerContext.writeQuery]. Builds UPDATE from validated identifiers
// and typed values only — the client never supplies raw SQL.

import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'server_constants.dart';
import 'server_context.dart';
import 'server_utils.dart';

/// PRAGMA table_info-derived column metadata for validation.
final class _PragmaColumn {
  const _PragmaColumn({
    required this.name,
    required this.type,
    required this.pk,
    required this.notNull,
  });

  final String name;
  final String type;
  final bool pk;
  final bool notNull;
}

/// Result of parsing/coercing a cell value from JSON.
final class _CoerceResult {
  const _CoerceResult.ok(this.value) : errorMessage = null;
  const _CoerceResult.err(this.errorMessage) : value = null;

  final Object? value;
  final String? errorMessage;
}

/// HTTP handler for parameterized single-cell updates.
final class CellUpdateHandler {
  /// Creates a handler bound to [ctx].
  CellUpdateHandler(this._ctx);

  final ServerContext _ctx;

  /// POST body: `{ "table", "pkColumn", "pkValue", "column", "value" }`.
  /// [value] may be JSON null for SQL NULL when the column is nullable.
  Future<void> handleCellUpdate(HttpRequest request) async {
    final res = request.response;
    final writeQuery = _ctx.writeQuery;

    if (writeQuery == null) {
      res.statusCode = HttpStatus.notImplemented;
      _ctx.setJsonHeaders(res);
      res.write(
        jsonEncode(<String, String>{
          ServerConstants.jsonKeyError:
              'Cell update not configured. Pass writeQuery to '
              'DriftDebugServer.start().',
        }),
      );
      await res.close();
      return;
    }

    late String body;
    try {
      final builder = BytesBuilder();
      await for (final chunk in request) {
        builder.add(chunk);
      }
      body = utf8.decode(builder.toBytes());
    } on Object catch (error, stack) {
      _ctx.logError(error, stack);
      await _badRequest(res, ServerConstants.errorInvalidRequestBody);
      return;
    }

    final decoded = ServerUtils.parseJsonMap(body);
    if (decoded == null) {
      await _badRequest(res, ServerConstants.errorInvalidJson);
      return;
    }

    final table = decoded['table'];
    final pkColumn = decoded['pkColumn'];
    final column = decoded['column'];
    if (table is! String ||
        pkColumn is! String ||
        column is! String ||
        table.isEmpty ||
        pkColumn.isEmpty ||
        column.isEmpty) {
      await _badRequest(res, 'Missing or invalid table, pkColumn, or column.');
      return;
    }

    if (!decoded.containsKey('pkValue')) {
      await _badRequest(res, 'Missing pkValue.');
      return;
    }
    if (!decoded.containsKey('value')) {
      await _badRequest(res, 'Missing value field (use null for SQL NULL).');
      return;
    }
    final pkValueRaw = decoded['pkValue'];
    final valueRaw = decoded['value'];

    final tableNames = await ServerUtils.getTableNames(_ctx.instrumentedQuery);
    if (!tableNames.contains(table)) {
      await _badRequest(res, 'Table "$table" not found.');
      return;
    }

    final infoRows = ServerUtils.normalizeRows(
      await _ctx.instrumentedQuery('PRAGMA table_info("$table")'),
    );
    final columns = <String, _PragmaColumn>{};
    for (final r in infoRows) {
      final name = r[ServerConstants.jsonKeyName]?.toString() ?? '';
      if (name.isEmpty) {
        continue;
      }
      final type =
          r[ServerConstants.jsonKeyType]?.toString().toUpperCase() ?? '';
      final pkRaw = r[ServerConstants.jsonKeyPk];
      final pk = pkRaw is int
          ? pkRaw != 0
          : pkRaw is bool
          ? pkRaw
          : false;
      final nnRaw = r[ServerConstants.jsonKeyNotNull] ?? r['NOTNULL'];
      final notNull = nnRaw is int
          ? nnRaw != 0
          : nnRaw is bool
          ? nnRaw
          : false;
      columns[name] = _PragmaColumn(
        name: name,
        type: type,
        pk: pk,
        notNull: notNull,
      );
    }

    final pkMeta = columns[pkColumn];
    final colMeta = columns[column];
    if (pkMeta == null) {
      await _badRequest(res, 'pkColumn "$pkColumn" is not in table "$table".');
      return;
    }
    if (!pkMeta.pk) {
      await _badRequest(res, 'pkColumn must identify the primary key column.');
      return;
    }
    if (colMeta == null) {
      await _badRequest(res, 'Unknown column "$column" on "$table".');
      return;
    }
    if (colMeta.pk) {
      await _badRequest(res, 'Primary key columns cannot be edited inline.');
      return;
    }

    final coerced = _validateAndCoerceColumnValue(colMeta, valueRaw);
    if (coerced.errorMessage != null) {
      await _badRequest(res, coerced.errorMessage!);
      return;
    }

    final setLit = ServerUtils.sqlLiteral(coerced.value);
    final pkLit = ServerUtils.sqlLiteral(pkValueRaw);

    final sql =
        'UPDATE "$table" SET "$column" = $setLit '
        'WHERE "$pkColumn" = $pkLit';

    try {
      await writeQuery(sql);
    } on Object catch (error, stack) {
      _ctx.logError(error, stack);
      res.statusCode = HttpStatus.internalServerError;
      _ctx.setJsonHeaders(res);
      res.write(
        jsonEncode(<String, String>{
          ServerConstants.jsonKeyError: error.toString(),
        }),
      );
      await res.close();
      return;
    }

    await _ctx.checkDataChange();

    _ctx.setJsonHeaders(res);
    res.write(jsonEncode(<String, dynamic>{ServerConstants.jsonKeyOk: true}));
    await res.close();
  }

  Future<void> _badRequest(HttpResponse res, String message) async {
    res.statusCode = HttpStatus.badRequest;
    _ctx.setJsonHeaders(res);
    res.write(
      jsonEncode(<String, String>{ServerConstants.jsonKeyError: message}),
    );
    await res.close();
  }
}

/// Validates [raw] from JSON and returns a value suitable for [sqlLiteral].
_CoerceResult _validateAndCoerceColumnValue(_PragmaColumn col, Object? raw) {
  final typeUpper = col.type.toUpperCase();

  if (typeUpper.contains('BLOB') && raw != null) {
    final s = raw.toString().trim();
    if (s.isNotEmpty) {
      return const _CoerceResult.err(
        'BLOB columns cannot be edited as text in the web UI.',
      );
    }
  }

  if (raw == null) {
    if (col.notNull) {
      return _CoerceResult.err(
        'Column "${col.name}" is NOT NULL; value cannot be null.',
      );
    }
    return const _CoerceResult.ok(null);
  }

  if (raw is bool) {
    final numericBoolTarget =
        _isIntegerAffinity(typeUpper) || _isRealAffinity(typeUpper);
    if (!_isBooleanAffinity(typeUpper) && !numericBoolTarget) {
      return _CoerceResult.err(
        'Column "${col.name}" does not accept a boolean here.',
      );
    }
    if (_isBooleanAffinity(typeUpper)) {
      return _CoerceResult.ok(raw);
    }
    return _CoerceResult.ok(raw ? 1 : 0);
  }

  if (raw is num) {
    if (_isIntegerAffinity(typeUpper)) {
      if (raw is int) {
        return _CoerceResult.ok(raw);
      }
      if (raw.roundToDouble() == raw) {
        return _CoerceResult.ok(raw.toInt());
      }
      return _CoerceResult.err('Column "${col.name}" expects an integer.');
    }
    if (_isRealAffinity(typeUpper)) {
      return _CoerceResult.ok(raw.toDouble());
    }
    if (_isBooleanAffinity(typeUpper)) {
      if (raw == 0 || raw == 1) {
        return _CoerceResult.ok(raw != 0);
      }
      return _CoerceResult.err('Boolean column expects 0 or 1.');
    }
    return _CoerceResult.err(
      'Column "${col.name}" expects text; got a number.',
    );
  }

  if (raw is! String) {
    return const _CoerceResult.err('Unsupported JSON value type for cell.');
  }

  final trimmed = raw.trim();

  if (trimmed.isEmpty) {
    if (!col.notNull) {
      return const _CoerceResult.ok(null);
    }
    if (_isTextAffinity(typeUpper)) {
      return const _CoerceResult.ok('');
    }
    return _CoerceResult.err(
      'Column "${col.name}" is NOT NULL; enter a value.',
    );
  }

  if (_isTextAffinity(typeUpper)) {
    return _CoerceResult.ok(raw);
  }

  if (_isIntegerAffinity(typeUpper)) {
    if (!RegExp(r'^-?\d+$').hasMatch(trimmed)) {
      return _CoerceResult.err(
        'Column "${col.name}" expects an integer; got "$trimmed".',
      );
    }
    return _CoerceResult.ok(int.parse(trimmed));
  }

  if (_isRealAffinity(typeUpper)) {
    if (!RegExp(r'^-?\d+(\.\d+)?([eE][+-]?\d+)?$').hasMatch(trimmed)) {
      return _CoerceResult.err(
        'Column "${col.name}" expects a number; got "$trimmed".',
      );
    }
    return _CoerceResult.ok(double.parse(trimmed));
  }

  if (_isBooleanAffinity(typeUpper)) {
    final lower = trimmed.toLowerCase();
    if (!<String>{'0', '1', 'true', 'false', 'yes', 'no'}.contains(lower)) {
      return _CoerceResult.err('Column "${col.name}" expects a boolean value.');
    }
    return _CoerceResult.ok(lower == '1' || lower == 'true' || lower == 'yes');
  }

  return _CoerceResult.ok(raw);
}

bool _isTextAffinity(String typeUpper) {
  if (typeUpper.isEmpty ||
      typeUpper.contains('CHAR') ||
      typeUpper.contains('CLOB') ||
      typeUpper.contains('TEXT')) {
    return true;
  }
  return !_isIntegerAffinity(typeUpper) &&
      !_isRealAffinity(typeUpper) &&
      !_isBooleanAffinity(typeUpper) &&
      !typeUpper.contains('BLOB');
}

bool _isIntegerAffinity(String typeUpper) =>
    typeUpper == 'INTEGER' || typeUpper == 'INT';

bool _isRealAffinity(String typeUpper) =>
    typeUpper == 'REAL' ||
    typeUpper == 'FLOAT' ||
    typeUpper == 'DOUBLE' ||
    typeUpper == 'NUMERIC';

bool _isBooleanAffinity(String typeUpper) =>
    typeUpper == 'BOOLEAN' || typeUpper == 'BOOL';
