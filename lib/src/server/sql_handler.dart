// SQL handler extracted from _DriftDebugServerImpl.
// Handles POST /api/sql and POST /api/sql/explain.
// Read-only validation lives in sql_validator.dart.

import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'server_constants.dart';
import 'server_context.dart';
import 'server_utils.dart';
import 'server_types.dart';
import 'sql_validator.dart';

/// Handles SQL execution and explain plan endpoints.
final class SqlHandler {
  /// Creates a [SqlHandler] with the given [ServerContext].
  SqlHandler(this._ctx);

  final ServerContext _ctx;

  /// Runs read-only SQL and returns result map (for VM service RPC).
  /// Returns {@code {"rows": [...]}} on success or {@code {"error": "..."}} on failure.
  Future<Map<String, dynamic>> runSqlResult(
    DriftDebugQuery query,
    String sql,
  ) async {
    if (sql.trim().isEmpty) {
      return <String, String>{
        ServerConstants.jsonKeyError: ServerConstants.errorMissingSql,
      };
    }
    if (!SqlValidator.isReadOnlySql(sql)) {
      return <String, String>{
        ServerConstants.jsonKeyError: ServerConstants.errorReadOnlyOnly,
      };
    }
    try {
      final dynamic raw = await query(sql);
      final List<Map<String, dynamic>> rows = ServerUtils.normalizeRows(raw);
      return <String, dynamic>{ServerConstants.jsonKeyRows: rows};
    } on Object catch (error, stack) {
      return _handleQueryError(error, stack, sql);
    }
  }

  /// Handles POST /api/sql: body {"sql": "SELECT ..."}.
  /// Validates read-only; returns {"rows": [...]}.
  Future<void> handleRunSql(HttpRequest request, DriftDebugQuery query) async {
    final sql = await _readAndValidateSqlBody(request);
    if (sql == null) {
      return;
    }
    final res = request.response;
    final result = await runSqlResult(query, sql);
    _ctx.setJsonHeaders(res);
    if (result.containsKey(ServerConstants.jsonKeyError)) {
      res.statusCode = HttpStatus.internalServerError;
    }
    res.write(jsonEncode(result));
    await res.close();
  }

  /// Returns explain result for VM service RPC (Plan 68).
  /// [sql] must be read-only. Returns {rows, sql} or {error}.
  Future<Map<String, dynamic>> explainSqlResult(
    DriftDebugQuery query,
    String sql,
  ) async {
    if (sql.trim().isEmpty) {
      return <String, String>{
        ServerConstants.jsonKeyError: ServerConstants.errorMissingSql,
      };
    }
    if (!SqlValidator.isReadOnlySql(sql)) {
      return <String, String>{
        ServerConstants.jsonKeyError: ServerConstants.errorReadOnlyOnly,
      };
    }
    try {
      final explainSql = 'EXPLAIN QUERY PLAN $sql';
      final dynamic raw = await query(explainSql);
      final rows = ServerUtils.normalizeRows(raw);
      return <String, dynamic>{
        ServerConstants.jsonKeyRows: rows,
        ServerConstants.jsonKeySql: explainSql,
      };
    } on Object catch (error, stack) {
      return _handleQueryError(error, stack, sql);
    }
  }

  /// Handles POST /api/sql/explain: body {"sql": "SELECT ..."}.
  /// Prepends EXPLAIN QUERY PLAN; returns {"rows": [...], "sql": "..."}.
  Future<void> handleExplainSql(
    HttpRequest request,
    DriftDebugQuery query,
  ) async {
    final sql = await _readAndValidateSqlBody(request);
    if (sql == null) {
      return;
    }
    final res = request.response;
    final result = await explainSqlResult(query, sql);
    _ctx.setJsonHeaders(res);
    if (result.containsKey(ServerConstants.jsonKeyError)) {
      res.statusCode = HttpStatus.internalServerError;
    }
    res.write(jsonEncode(result));
    await res.close();
  }

  /// Validated POST /api/sql request body. Checks Content-Type then
  /// decodes and validates.
  ({SqlRequestBody? body, String? error}) parseSqlBody(
    HttpRequest request,
    String body,
  ) {
    final contentType = request.headers.contentType?.mimeType;
    if (contentType != 'application/json') {
      return (body: null, error: 'Content-Type must be application/json');
    }
    Object? decoded;
    try {
      decoded = jsonDecode(body);
    } on Object catch (error, stack) {
      _ctx.logError(error, stack);
      return (body: null, error: ServerConstants.errorInvalidJson);
    }
    if (decoded is! Map<String, dynamic>) {
      return (body: null, error: ServerConstants.errorInvalidJson);
    }
    final rawSql = decoded[ServerConstants.jsonKeySql];
    if (rawSql is! String || rawSql.trim().isEmpty) {
      return (body: null, error: ServerConstants.errorMissingSql);
    }
    final bodyObj = SqlRequestBody.fromJson(decoded);
    if (bodyObj == null) {
      return (body: null, error: ServerConstants.errorMissingSql);
    }
    return (body: bodyObj, error: null);
  }

  /// Reads, parses, and validates a POST SQL request body. Returns the
  /// validated read-only SQL string, or null if validation failed (error
  /// response already sent and closed).
  Future<String?> _readAndValidateSqlBody(HttpRequest request) async {
    final res = request.response;
    String body;
    try {
      final builder = BytesBuilder();
      await for (final chunk in request) {
        builder.add(chunk);
      }

      body = utf8.decode(builder.toBytes());
    } on Object catch (error, stack) {
      _ctx.logError(error, stack);
      res.statusCode = HttpStatus.badRequest;
      _ctx.setJsonHeaders(res);
      res.write(
        jsonEncode(<String, String>{
          ServerConstants.jsonKeyError: ServerConstants.errorInvalidRequestBody,
        }),
      );
      await res.close();
      return null;
    }
    final result = parseSqlBody(request, body);
    final bodyObj = result.body;
    if (bodyObj == null) {
      res.statusCode = HttpStatus.badRequest;
      _ctx.setJsonHeaders(res);
      res.write(
        jsonEncode(<String, String>{
          ServerConstants.jsonKeyError:
              result.error ?? ServerConstants.errorInvalidJson,
        }),
      );
      await res.close();
      return null;
    }
    final String sql = bodyObj.sql;
    if (!SqlValidator.isReadOnlySql(sql)) {
      res.statusCode = HttpStatus.badRequest;
      _ctx.setJsonHeaders(res);
      res.write(
        jsonEncode(<String, String>{
          ServerConstants.jsonKeyError: ServerConstants.errorReadOnlyOnly,
        }),
      );
      await res.close();
      return null;
    }
    return sql;
  }

  /// Handles query execution errors with reduced noise for
  /// expected "no such table/view" SQLite errors.
  ///
  /// These errors are common when the schema has changed since
  /// the last metadata fetch (e.g. a table was dropped or the
  /// connected app restarted with a different schema). A short
  /// warning is logged instead of the full stack trace.
  ///
  /// All other errors are logged with the full stack trace via
  /// [ServerContext.logError].
  Map<String, String> _handleQueryError(
    Object error,
    StackTrace stack,
    String sql,
  ) {
    final message = error.toString();

    if (message.contains('no such table') || message.contains('no such view')) {
      _ctx.log('Query skipped (table/view not found): $sql');
    } else {
      _ctx.logError(error, stack);
    }

    return <String, String>{ServerConstants.jsonKeyError: message};
  }
}
