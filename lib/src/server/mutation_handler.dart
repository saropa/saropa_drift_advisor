/**
 * Handles GET /api/mutations — long-polls for recent mutation events.
 *
 * Enabled only when `writeQuery` was provided to DriftDebugServer.start().
 */

import 'dart:io';
import 'dart:convert';

import 'server_constants.dart';
import 'server_context.dart';
import 'mutation_tracker.dart';

final class MutationHandler {
  MutationHandler(this._ctx);

  final ServerContext _ctx;

  Future<void> handleMutations(HttpRequest request) async {
    final tracker = _ctx.mutationTracker;
    final res = request.response;

    if (tracker == null) {
      res.statusCode = HttpStatus.notImplemented;
      _ctx.setJsonHeaders(res);
      res.write(
        jsonEncode(<String, String>{
          ServerConstants.jsonKeyError:
              'Mutations not configured. Pass writeQuery to DriftDebugServer.start().',
        }),
      );
      await res.close();
      return;
    }

    final sinceStr = request.uri.queryParameters[ServerConstants.queryParamSince] ??
        '0';
    final since = int.tryParse(sinceStr) ?? 0;

    var events = tracker.eventsSince(since);
    if (events.isEmpty) {
      await tracker.waitForAnyEvent(ServerConstants.longPollTimeout);
      events = tracker.eventsSince(since);
    }

    _ctx.setJsonHeaders(res);
    res.write(
      jsonEncode(<String, Object?>{
        ServerConstants.jsonKeyEvents:
            events.map((e) => e.toJson()).toList(growable: false),
        ServerConstants.jsonKeyCursor: tracker.latestId,
      }),
    );
    await res.close();
  }
}

