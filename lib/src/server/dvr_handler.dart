/// HTTP handler for Query Replay DVR endpoints.
library;

import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import '../query_recorder.dart';
import 'server_constants.dart';
import 'server_context.dart';
import 'server_utils.dart';

/// Serves `/api/dvr/*` routes from the in-memory [QueryRecorder].
final class DvrHandler {
  /// Creates a DVR handler for the shared server context.
  DvrHandler(this._ctx, this._recorder);

  final ServerContext _ctx;
  final QueryRecorder _recorder;

  /// Handles GET `/api/dvr/status`.
  Future<void> handleStatus(HttpResponse response) async {
    _ctx.setJsonHeaders(response);
    response.write(
      jsonEncode(<String, Object?>{
        'schemaVersion': 1,
        'generatedAt': DateTime.now().toUtc().toIso8601String(),
        'data': <String, Object?>{
          'recording': _recorder.isRecording,
          'queryCount': _recorder.queryCount,
          'sessionId': _recorder.sessionId,
          'minAvailableId': _recorder.minAvailableId,
          'maxAvailableId': _recorder.maxAvailableId,
          'maxQueries': _recorder.maxBufferQueries,
          'captureBeforeAfter': _recorder.captureBeforeAfter,
        },
      }),
    );
    await response.close();
  }

  /// Handles POST `/api/dvr/config` with JSON `{ maxQueries?, captureBeforeAfter? }`.
  Future<void> handleConfig(HttpRequest request, HttpResponse response) async {
    late String raw;
    try {
      final builder = BytesBuilder();
      await for (final chunk in request) {
        builder.add(chunk);
      }
      raw = utf8.decode(builder.toBytes());
    } on Object catch (error, stack) {
      _ctx.logError(error, stack);
      response.statusCode = HttpStatus.badRequest;
      _ctx.setJsonHeaders(response);
      response.write(
        jsonEncode(<String, String>{
          ServerConstants.jsonKeyError: ServerConstants.errorInvalidRequestBody,
        }),
      );
      await response.close();
      return;
    }

    final decoded = ServerUtils.parseJsonMap(raw);
    if (decoded == null) {
      response.statusCode = HttpStatus.badRequest;
      _ctx.setJsonHeaders(response);
      response.write(
        jsonEncode(<String, String>{
          ServerConstants.jsonKeyError: ServerConstants.errorInvalidJson,
        }),
      );
      await response.close();
      return;
    }

    final maxRaw = decoded['maxQueries'];
    final capRaw = decoded['captureBeforeAfter'];
    int? maxQueries;
    if (maxRaw != null) {
      if (maxRaw is int) {
        maxQueries = maxRaw;
      } else if (maxRaw is num) {
        maxQueries = maxRaw.toInt();
      }
    }
    bool? captureBeforeAfter;
    if (capRaw is bool) {
      captureBeforeAfter = capRaw;
    }

    if (maxQueries == null && captureBeforeAfter == null) {
      response.statusCode = HttpStatus.badRequest;
      _ctx.setJsonHeaders(response);
      response.write(
        jsonEncode(<String, String>{
          ServerConstants.jsonKeyError:
              'Body must include maxQueries and/or captureBeforeAfter.',
        }),
      );
      await response.close();
      return;
    }

    _recorder.updateConfig(
      maxQueries: maxQueries,
      captureBeforeAfter: captureBeforeAfter,
    );

    _ctx.setJsonHeaders(response);
    response.write(
      jsonEncode(<String, Object?>{
        'schemaVersion': 1,
        'generatedAt': DateTime.now().toUtc().toIso8601String(),
        'data': <String, Object?>{
          'maxQueries': _recorder.maxBufferQueries,
          'captureBeforeAfter': _recorder.captureBeforeAfter,
          'queryCount': _recorder.queryCount,
          'sessionId': _recorder.sessionId,
        },
      }),
    );
    await response.close();
  }

  /// Handles POST `/api/dvr/start`.
  Future<void> handleStart(HttpResponse response) async {
    _recorder.startRecording();
    _ctx.setJsonHeaders(response);
    response.write(
      jsonEncode(<String, Object?>{
        'schemaVersion': 1,
        'generatedAt': DateTime.now().toUtc().toIso8601String(),
        'data': <String, Object?>{
          'recording': true,
          'sessionId': _recorder.sessionId,
        },
      }),
    );
    await response.close();
  }

  /// Handles POST `/api/dvr/stop` and `/api/dvr/pause`.
  Future<void> handleStopOrPause(HttpResponse response) async {
    _recorder.stopRecording();
    _ctx.setJsonHeaders(response);
    response.write(
      jsonEncode(<String, Object?>{
        'schemaVersion': 1,
        'generatedAt': DateTime.now().toUtc().toIso8601String(),
        'data': <String, Object?>{
          'recording': false,
          'sessionId': _recorder.sessionId,
        },
      }),
    );
    await response.close();
  }

  /// Handles GET `/api/dvr/queries?cursor=<id>&limit=100&direction=forward`.
  Future<void> handleQueries(HttpRequest request, HttpResponse response) async {
    final cursor =
        int.tryParse(request.uri.queryParameters['cursor'] ?? '-1') ?? -1;
    final limit =
        int.tryParse(request.uri.queryParameters['limit'] ?? '100') ?? 100;
    final direction = request.uri.queryParameters['direction'] ?? 'forward';
    final page = _recorder.queriesPage(
      cursor: cursor,
      limit: limit,
      direction: direction,
    );
    _ctx.setJsonHeaders(response);
    response.write(
      jsonEncode(<String, Object?>{
        'schemaVersion': 1,
        'generatedAt': DateTime.now().toUtc().toIso8601String(),
        'data': <String, Object?>{
          'queries': page.items.map((q) => q.toJson()).toList(growable: false),
          'total': _recorder.queryCount,
          'sessionId': _recorder.sessionId,
          'minAvailableId': _recorder.minAvailableId,
          'maxAvailableId': _recorder.maxAvailableId,
          'nextCursor': page.nextCursor,
          'prevCursor': page.prevCursor,
        },
      }),
    );
    await response.close();
  }

  /// Handles GET `/api/dvr/query/:sessionId/:id`.
  Future<void> handleQuery(
    HttpResponse response, {
    required String sessionId,
    required int id,
  }) async {
    final query = _recorder.queryBySessionAndId(sessionId, id);
    if (query == null) {
      response.statusCode = HttpStatus.notFound;
      _ctx.setJsonHeaders(response);
      response.write(
        jsonEncode(<String, Object?>{
          'schemaVersion': 1,
          'generatedAt': DateTime.now().toUtc().toIso8601String(),
          'error': 'QUERY_NOT_AVAILABLE',
          'message': 'Query id is outside current ring buffer window.',
          'data': <String, Object?>{
            'sessionId': sessionId,
            'requestedId': id,
            'minAvailableId': _recorder.minAvailableId,
            'maxAvailableId': _recorder.maxAvailableId,
          },
        }),
      );
      await response.close();
      return;
    }

    _ctx.setJsonHeaders(response);
    response.write(
      jsonEncode(<String, Object?>{
        'schemaVersion': 1,
        'generatedAt': DateTime.now().toUtc().toIso8601String(),
        'data': query.toJson(),
      }),
    );
    await response.close();
  }
}
