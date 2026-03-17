// Per-IP rate limiter for the Drift Debug Server.
// Uses a fixed-window counter: each IP gets N requests per second.
// Exceeding the limit returns HTTP 429 (Too Many Requests).

import 'dart:convert';
import 'dart:io';

import 'server_constants.dart';
import 'server_context.dart';

/// Tracks request count within a one-second window.
class _WindowEntry {
  _WindowEntry(this.windowSecond);

  /// The second (epoch milliseconds ÷ 1000) this window covers.
  int windowSecond;

  /// Number of requests seen in this window.
  int count = 1;
}

/// Per-IP rate limiter using a fixed-window counter algorithm.
///
/// Each unique client IP is allowed [maxRequestsPerSecond] requests
/// within a one-second window. When the limit is exceeded,
/// [shouldThrottle] returns true and the caller should respond
/// with HTTP 429 via [sendTooManyRequests].
///
/// Stale entries (IPs not seen in the current window) are pruned
/// when the map grows beyond [ServerConstants.rateLimitPruneThreshold]
/// to prevent unbounded memory growth.
final class RateLimiter {
  /// Creates a [RateLimiter] with the given per-second limit.
  ///
  /// [maxRequestsPerSecond] must be positive.
  RateLimiter(this.maxRequestsPerSecond, this._ctx)
      : assert(maxRequestsPerSecond > 0,
            'maxRequestsPerSecond must be positive');

  /// Maximum number of requests each IP may send per second.
  final int maxRequestsPerSecond;

  /// Server context for setting response headers (CORS, JSON).
  final ServerContext _ctx;

  /// Per-IP request counters keyed by IP address string.
  final Map<String, _WindowEntry> _windows = {};

  /// Returns true if [request] should be throttled (rate limit exceeded).
  ///
  /// Delegates to [shouldThrottleKey] using the client's IP address
  /// as the rate-limit key.
  bool shouldThrottle(HttpRequest request) {
    return shouldThrottleKey(_clientKey(request));
  }

  /// Returns true if the client identified by [key] should be throttled.
  ///
  /// Increments the counter for [key] in the current one-second window.
  /// If the counter exceeds [maxRequestsPerSecond], returns true.
  /// When the window rolls over to a new second, the counter resets to 1.
  ///
  /// This method is the core rate-limit logic, separated from
  /// [shouldThrottle] so it can be unit-tested without a real
  /// [HttpRequest].
  bool shouldThrottleKey(String key) {
    final now = DateTime.now().millisecondsSinceEpoch ~/ 1000;

    final entry = _windows[key];

    if (entry == null || entry.windowSecond != now) {
      // New window: reset counter for this key.
      _windows[key] = _WindowEntry(now);

      // Prune stale entries when the map grows too large to
      // prevent unbounded memory from many distinct IPs.
      if (_windows.length > ServerConstants.rateLimitPruneThreshold) {
        _pruneStaleEntries(now);
      }

      return false;
    }

    // Same window: increment and check.
    entry.count++;

    return entry.count > maxRequestsPerSecond;
  }

  /// Sends an HTTP 429 (Too Many Requests) JSON response with a
  /// `Retry-After` header indicating the client should wait 1 second.
  Future<void> sendTooManyRequests(HttpResponse response) async {
    response.statusCode = HttpStatus.tooManyRequests;
    response.headers
        .set(ServerConstants.headerRetryAfter, '1');
    _ctx.setJsonHeaders(response);
    response.write(jsonEncode(<String, String>{
      ServerConstants.jsonKeyError: ServerConstants.errorRateLimited,
    }));
    await response.close();
  }

  /// Removes entries whose window second is older than [currentSecond].
  ///
  /// Called when the map exceeds [ServerConstants.rateLimitPruneThreshold]
  /// to reclaim memory from IPs that are no longer sending requests.
  void _pruneStaleEntries(int currentSecond) {
    _windows.removeWhere(
      (_, entry) => entry.windowSecond != currentSecond,
    );
  }

  /// Extracts the client IP address from the request for use as
  /// the rate-limit key. Falls back to 'unknown' if connection
  /// info is unavailable (should not happen in practice).
  static String _clientKey(HttpRequest request) {
    return request.connectionInfo?.remoteAddress.address ?? 'unknown';
  }
}
