// Handles POST /api/edits/apply: run validated UPDATE/INSERT/DELETE statements
// in one SQLite transaction via [ServerContext.writeQuery].

import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'server_constants.dart';
import 'server_context.dart';
import 'server_utils.dart';
import 'sql_validator.dart';

/// HTTP handler for VS Code extension batch application of pending data edits.
final class EditsBatchHandler {
  /// Creates a handler bound to [ctx].
  EditsBatchHandler(this._ctx);

  final ServerContext _ctx;

  /// Maximum statements per request (guards oversized bodies).
  static const int maxStatements = 500;

  /// Validates and runs [statements] in one transaction. Used by HTTP and VM RPC.
  ///
  /// Requires [ServerContext.writeQuery]. Throws [ArgumentError], [FormatException],
  /// or the underlying DB error. Calls [ServerContext.checkDataChange] after commit.
  Future<void> runValidatedBatchStatements(List<String> statements) async {
    final writeQuery = _ctx.writeQuery;
    if (writeQuery == null) {
      throw StateError(
        'Batch apply not configured. Pass writeQuery to DriftDebugServer.start().',
      );
    }
    if (statements.isEmpty) {
      throw ArgumentError.value(statements, 'statements', 'must be non-empty');
    }
    if (statements.length > maxStatements) {
      throw ArgumentError(
        'Too many statements (max $maxStatements).',
      );
    }
    for (var i = 0; i < statements.length; i++) {
      final rawStmt = statements[i];
      if (rawStmt.trim().isEmpty) {
        throw FormatException('Empty statement at index $i');
      }
      if (!SqlValidator.isSingleDataMutationSql(rawStmt)) {
        throw FormatException(
          'Invalid data statement at index $i (allowed: single UPDATE, '
          'INSERT INTO, or DELETE FROM).',
        );
      }
    }

    try {
      await writeQuery('BEGIN IMMEDIATE;');
      for (final rawStmt in statements) {
        var s = rawStmt.trim();
        if (!s.endsWith(';')) {
          s = '$s;';
        }
        await writeQuery(s);
      }
      await writeQuery('COMMIT;');
    } on Object catch (_) {
      try {
        await writeQuery('ROLLBACK;');
      } on Object catch (_) {
        /* Best-effort rollback. */
      }
      rethrow;
    }

    await _ctx.checkDataChange();
  }

  /// POST body: `{ "statements": [ "UPDATE ...", ... ] }`.
  Future<void> handleApplyBatch(HttpRequest request) async {
    final res = request.response;
    final writeQuery = _ctx.writeQuery;

    if (writeQuery == null) {
      res.statusCode = HttpStatus.notImplemented;
      _ctx.setJsonHeaders(res);
      res.write(
        jsonEncode(<String, String>{
          ServerConstants.jsonKeyError:
              'Batch apply not configured. Pass writeQuery to '
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

    final rawList = decoded[ServerConstants.jsonKeyStatements];
    if (rawList is! List<dynamic>) {
      await _badRequest(
        res,
        'Body must include "${ServerConstants.jsonKeyStatements}" as a JSON array.',
      );
      return;
    }
    if (rawList.isEmpty) {
      await _badRequest(
        res,
        '"${ServerConstants.jsonKeyStatements}" must be a non-empty array.',
      );
      return;
    }
    if (rawList.length > maxStatements) {
      await _badRequest(
        res,
        'Too many statements (max $maxStatements).',
      );
      return;
    }

    final statements = <String>[];
    for (final item in rawList) {
      if (item is! String || item.trim().isEmpty) {
        await _badRequest(
          res,
          'Each statement must be a non-empty string.',
        );
        return;
      }
      statements.add(item);
    }

    try {
      await runValidatedBatchStatements(statements);
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

    res.statusCode = HttpStatus.ok;
    _ctx.setJsonHeaders(res);
    res.write(
      jsonEncode(<String, dynamic>{
        ServerConstants.jsonKeyOk: true,
        ServerConstants.jsonKeyCount: statements.length,
      }),
    );
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
