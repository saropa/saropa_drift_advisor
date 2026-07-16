// Authentication handler extracted from _DriftDebugServerImpl.
// Handles Bearer token and HTTP Basic auth verification.

import 'dart:convert';
import 'dart:io';

import 'server_constants.dart';
import 'server_context.dart';
import 'server_utils.dart';

/// Handles authentication for the Drift Debug Server.
///
/// Supports Bearer token (plain in-memory comparison) and HTTP Basic auth.
/// All comparisons are constant-time to mitigate timing side channels.
final class AuthHandler {
  /// Creates an [AuthHandler] with the given [ServerContext].
  AuthHandler(this._ctx);

  final ServerContext _ctx;

  /// Returns true if the request has valid token (Bearer header only) or
  /// HTTP Basic credentials. Token in URL is not supported
  /// (avoid_token_in_url).
  bool isAuthenticated(HttpRequest request) {
    final expectedToken = _ctx.authToken;
    if (expectedToken != null && expectedToken.isNotEmpty) {
      final authHeader = request.headers.value(
        ServerConstants.headerAuthorization,
      );
      if (authHeader != null &&
          authHeader.length > ServerConstants.authSchemeBearer.length &&
          authHeader.startsWith(ServerConstants.authSchemeBearer)) {
        final token = ServerUtils.safeSubstring(
          authHeader,
          start: ServerConstants.authSchemeBearer.length,
        );
        if (token.isEmpty) {
          return false;
        }
        if (_secureCompare(token, expectedToken)) {
          return true;
        }
      }
    }
    final user = _ctx.basicAuthUser;
    final password = _ctx.basicAuthPassword;
    if (user != null && user.isNotEmpty && password != null) {
      final authHeader = request.headers.value(
        ServerConstants.headerAuthorization,
      );
      if (authHeader != null &&
          authHeader.length >= ServerConstants.authSchemeBasic.length &&
          authHeader.startsWith(ServerConstants.authSchemeBasic)) {
        try {
          final basicPayload = ServerUtils.safeSubstring(
            authHeader,
            start: ServerConstants.authSchemeBasic.length,
          );
          if (basicPayload.isEmpty) {
            return false;
          }
          final decoded = utf8.decode(base64.decode(basicPayload));
          final colon = decoded.indexOf(':');
          if (colon >= 0 && colon < decoded.length) {
            final userPart = ServerUtils.safeSubstring(
              decoded,
              start: 0,
              end: colon,
            );
            final passwordPart = ServerUtils.safeSubstring(
              decoded,
              start: colon + 1,
            );
            if (_secureCompare(userPart, user) &&
                _secureCompare(passwordPart, password)) {
              return true;
            }
          }
        } on Object catch (error, stack) {
          _ctx.logError(error, stack);
        }
      }
    }
    return false;
  }

  /// Sends 401 with JSON body; sets WWW-Authenticate for Basic when
  /// Basic auth is configured.
  Future<void> sendUnauthorized(HttpResponse response) async {
    final res = response;
    res.statusCode = HttpStatus.unauthorized;
    if (_ctx.basicAuthUser != null && _ctx.basicAuthPassword != null) {
      res.headers.set(
        ServerConstants.headerWwwAuthenticate,
        'Basic realm="${ServerConstants.realmDriftDebug}"',
      );
    }
    _ctx.setJsonHeaders(res);
    res.write(
      jsonEncode(<String, String>{
        ServerConstants.jsonKeyError: ServerConstants.authRequiredMessage,
      }),
    );
    await res.close();
  }

  /// Constant-time string comparison to reduce timing side channels.
  ///
  /// Does NOT early-return on a length mismatch — that short-circuit leaked the
  /// expected secret's length via response timing. Instead the length difference
  /// is folded into the accumulator and the loop always runs for the expected
  /// secret's length [b] (a per-config constant), reading [a] modulo its own
  /// length so a shorter candidate still costs the same number of iterations.
  /// See plans/history/2026.06/2026.06.12/full-codebase-audit-2026.06.12.md L1.
  bool _secureCompare(String a, String b) {
    final int lenA = a.length;
    final int lenB = b.length;
    // A length mismatch alone guarantees a non-zero (failing) result.
    int result = lenA ^ lenB;
    for (int i = 0; i < lenB; i++) {
      final int ca = lenA == 0 ? 0 : a.codeUnitAt(i % lenA);
      result |= ca ^ b.codeUnitAt(i);
    }

    return result == 0;
  }
}
