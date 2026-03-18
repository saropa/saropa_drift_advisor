// Tests for the RateLimiter per-IP rate limiting logic.
//
// Uses shouldThrottleKey(String) to test the core algorithm
// without needing real HttpRequest objects.

import 'package:test/test.dart';

import 'package:saropa_drift_advisor/src/server/rate_limiter.dart';
import 'package:saropa_drift_advisor/src/server/server_context.dart';

void main() {
  /// Creates a [RateLimiter] with the given limit and a minimal
  /// [ServerContext] (no DB query needed for rate-limit tests).
  RateLimiter createLimiter(int maxPerSecond) {
    final ctx = ServerContext(query: (_) async => <Map<String, dynamic>>[]);

    return RateLimiter(maxPerSecond, ctx);
  }

  group('RateLimiter', () {
    test('allows requests up to the limit', () {
      final limiter = createLimiter(5);

      // First 5 requests should all be allowed.
      for (int i = 0; i < 5; i++) {
        expect(
          limiter.shouldThrottleKey('192.168.1.1'),
          isFalse,
          reason: 'request ${i + 1} of 5 should be allowed',
        );
      }
    });

    test('throttles requests exceeding the limit', () {
      final limiter = createLimiter(3);

      // First 3 allowed.
      for (int i = 0; i < 3; i++) {
        expect(limiter.shouldThrottleKey('10.0.0.1'), isFalse);
      }

      // 4th and beyond should be throttled.
      expect(limiter.shouldThrottleKey('10.0.0.1'), isTrue);
      expect(limiter.shouldThrottleKey('10.0.0.1'), isTrue);
    });

    test('tracks different IPs independently', () {
      final limiter = createLimiter(2);

      // IP A uses both allowed requests.
      expect(limiter.shouldThrottleKey('ip-a'), isFalse);
      expect(limiter.shouldThrottleKey('ip-a'), isFalse);
      expect(limiter.shouldThrottleKey('ip-a'), isTrue);

      // IP B should still have its full allowance.
      expect(limiter.shouldThrottleKey('ip-b'), isFalse);
      expect(limiter.shouldThrottleKey('ip-b'), isFalse);
      expect(limiter.shouldThrottleKey('ip-b'), isTrue);
    });

    test('limit of 1 allows exactly one request then throttles', () {
      final limiter = createLimiter(1);

      expect(limiter.shouldThrottleKey('single'), isFalse);
      expect(limiter.shouldThrottleKey('single'), isTrue);
    });

    test('large limit allows many requests', () {
      final limiter = createLimiter(1000);

      // All 1000 should be allowed.
      for (int i = 0; i < 1000; i++) {
        expect(
          limiter.shouldThrottleKey('bulk'),
          isFalse,
          reason: 'request ${i + 1} of 1000 should be allowed',
        );
      }

      // 1001st should be throttled.
      expect(limiter.shouldThrottleKey('bulk'), isTrue);
    });

    test('unknown key (first request) is never throttled', () {
      final limiter = createLimiter(5);

      // Each unique key's first request should always pass.
      expect(limiter.shouldThrottleKey('new-1'), isFalse);
      expect(limiter.shouldThrottleKey('new-2'), isFalse);
      expect(limiter.shouldThrottleKey('new-3'), isFalse);
    });

    test('maxRequestsPerSecond is stored correctly', () {
      final limiter = createLimiter(42);

      expect(limiter.maxRequestsPerSecond, equals(42));
    });
  });
}
