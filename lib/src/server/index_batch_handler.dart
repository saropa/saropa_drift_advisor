// Handles the website's bulk index-creation flow:
//   POST /api/indexes/preview — validate (no write) a list of CREATE INDEX
//     statements and report which are accepted vs rejected.
//   POST /api/indexes/apply — best-effort apply of CREATE INDEX statements via
//     [ServerContext.writeQuery], returning a per-index success/failure array.
//
// Index DDL is the only DDL the website may batch-apply, gated by the dedicated
// [SqlValidator.isSingleCreateIndexSql] check (the data-mutation validator
// rejects all DDL). Apply is best-effort per index — not one transaction —
// because each CREATE INDEX is independent and idempotent (with IF NOT EXISTS),
// so a single bad statement must report its own failure without dropping the
// others (the feature's exit gate). This differs deliberately from
// [EditsBatchHandler], where data edits are all-or-nothing.

import 'dart:convert';
import 'dart:io';

import 'server_constants.dart';
import 'server_context.dart';
import 'server_utils.dart';
import 'sql_validator.dart';

/// HTTP handler for website bulk CREATE INDEX preview and apply.
final class IndexBatchHandler {
  /// Creates a handler bound to [ctx].
  IndexBatchHandler(this._ctx);

  final ServerContext _ctx;

  /// Maximum index statements per request (guards oversized bodies).
  static const int maxIndexes = 200;

  /// Standard rejection reason for a statement that is not a single CREATE INDEX.
  static const String rejectionReason =
      'Not a single CREATE INDEX statement (allowed: '
      'CREATE [UNIQUE] INDEX [IF NOT EXISTS] ...).';

  /// POST /api/indexes/preview — validate without writing.
  ///
  /// Body: `{ "indexSqls": [ "CREATE INDEX ...", ... ] }`.
  /// Response: `{ "valid": [sql...], "rejected": [{index, sql, reason}] }`.
  /// Works on read-only servers — preview never touches the database.
  Future<void> handlePreview(HttpRequest request) async {
    final res = request.response;
    final sqls = await _readIndexSqls(request, res);
    if (sqls == null) return;

    final valid = <String>[];
    final rejected = <Map<String, dynamic>>[];
    for (var i = 0; i < sqls.length; i++) {
      final sql = sqls[i];
      if (SqlValidator.isSingleCreateIndexSql(sql)) {
        valid.add(sql);
      } else {
        rejected.add(<String, dynamic>{
          ServerConstants.jsonKeyIndex: i,
          ServerConstants.jsonKeySql: sql,
          ServerConstants.jsonKeyReason: rejectionReason,
        });
      }
    }

    _ctx.setJsonHeaders(res);
    res.write(
      jsonEncode(<String, dynamic>{
        ServerConstants.jsonKeyValid: valid,
        ServerConstants.jsonKeyRejected: rejected,
      }),
    );
    await res.close();
  }

  /// POST /api/indexes/apply — best-effort apply (requires [writeQuery]).
  ///
  /// Body: `{ "indexSqls": [ "CREATE INDEX ...", ... ] }`.
  /// Response: `{ "results": [{index, sql, ok, error?}], "applied": N }`.
  /// Invalid statements are reported as failed results; valid ones still apply.
  Future<void> handleApply(HttpRequest request) async {
    final res = request.response;
    final writeQuery = _ctx.writeQuery;
    if (writeQuery == null) {
      res.statusCode = HttpStatus.notImplemented;
      _ctx.setJsonHeaders(res);
      res.write(
        jsonEncode(<String, String>{
          ServerConstants.jsonKeyError:
              'Index apply not configured. Pass writeQuery to '
              'DriftDebugServer.start().',
        }),
      );
      await res.close();
      return;
    }

    final sqls = await _readIndexSqls(request, res);
    if (sqls == null) return;

    final results = <Map<String, dynamic>>[];
    var applied = 0;
    for (var i = 0; i < sqls.length; i++) {
      final sql = sqls[i];
      // Reject up front so a bad statement is reported, not executed, while the
      // remaining valid ones still apply (best-effort).
      if (!SqlValidator.isSingleCreateIndexSql(sql)) {
        results.add(<String, dynamic>{
          ServerConstants.jsonKeyIndex: i,
          ServerConstants.jsonKeySql: sql,
          ServerConstants.jsonKeyOk: false,
          ServerConstants.jsonKeyError: rejectionReason,
        });
        continue;
      }
      var stmt = sql.trim();
      if (!stmt.endsWith(';')) {
        stmt = '$stmt;';
      }
      try {
        await writeQuery(stmt);
        applied++;
        results.add(<String, dynamic>{
          ServerConstants.jsonKeyIndex: i,
          ServerConstants.jsonKeySql: sql,
          ServerConstants.jsonKeyOk: true,
        });
      } on Object catch (error, stack) {
        // Log but do not abort: index creation is independent, so one failure
        // must not drop the indexes that succeeded.
        _ctx.logError(error, stack);
        results.add(<String, dynamic>{
          ServerConstants.jsonKeyIndex: i,
          ServerConstants.jsonKeySql: sql,
          ServerConstants.jsonKeyOk: false,
          ServerConstants.jsonKeyError: error.toString(),
        });
      }
    }

    // Only fire change detection when at least one index was actually created.
    if (applied > 0) {
      await _ctx.checkDataChange();
    }

    _ctx.setJsonHeaders(res);
    res.write(
      jsonEncode(<String, dynamic>{
        ServerConstants.jsonKeyResults: results,
        ServerConstants.jsonKeyApplied: applied,
      }),
    );
    await res.close();
  }

  /// Reads and validates the `indexSqls` array from [request]. Writes a 400 and
  /// returns null on any structural problem; otherwise returns the string list.
  Future<List<String>?> _readIndexSqls(
    HttpRequest request,
    HttpResponse res,
  ) async {
    late String body;
    try {
      final bytes = await ServerUtils.readBodyBytes(
        request,
        maxBytes: ServerConstants.maxRequestBodyBytes,
      );
      if (bytes == null) {
        await _ctx.sendPayloadTooLarge(res);
        return null;
      }
      body = utf8.decode(bytes);
    } on Object catch (error, stack) {
      _ctx.logError(error, stack);
      await _badRequest(res, ServerConstants.errorInvalidRequestBody);
      return null;
    }

    final decoded = ServerUtils.parseJsonMap(body);
    if (decoded == null) {
      await _badRequest(res, ServerConstants.errorInvalidJson);
      return null;
    }

    final rawList = decoded[ServerConstants.jsonKeyIndexSqls];
    if (rawList is! List<dynamic>) {
      await _badRequest(
        res,
        'Body must include "${ServerConstants.jsonKeyIndexSqls}" as a JSON array.',
      );
      return null;
    }
    if (rawList.isEmpty) {
      await _badRequest(
        res,
        '"${ServerConstants.jsonKeyIndexSqls}" must be a non-empty array.',
      );
      return null;
    }
    if (rawList.length > maxIndexes) {
      await _badRequest(res, 'Too many statements (max $maxIndexes).');
      return null;
    }

    final sqls = <String>[];
    for (final item in rawList) {
      if (item is! String || item.trim().isEmpty) {
        await _badRequest(res, 'Each statement must be a non-empty string.');
        return null;
      }
      sqls.add(item);
    }
    return sqls;
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
