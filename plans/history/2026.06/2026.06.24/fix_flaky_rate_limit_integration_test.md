# Fix flaky rate-limiting integration test

The "returns 429 when rate limit exceeded" integration test asserted that the
third of three sequential HTTP requests would be throttled, but the rate limiter
uses a fixed one-second wall-clock window; on a slow CI runner the third request
crossed into the next window where the counter reset to 1 and returned 200. The
test was rewritten to fire a burst of concurrent requests that cluster in one
window, removing the dependency on where second boundaries fall.

## Finish Report (2026-06-24)

### Defect
- CI run failed with `663 tests passed, 1 failed`: `test/handler_integration_test.dart`
  → "rate limiting returns 429 when rate limit exceeded", expected `<429>`, actual `<200>`.
- Root cause: `RateLimiter` (`lib/src/server/rate_limiter.dart`) implements a
  fixed-window counter keyed on `DateTime.now().millisecondsSinceEpoch ~/ 1000`.
  When the window second changes, the per-IP counter resets to 1. The test sent
  three sequential HTTP requests (`/api/tables`) with `maxRequestsPerSecond: 2`
  and assumed all three landed in the same window. On a slow runner the third
  request executed in the next wall-clock second, started a fresh window, and
  was allowed (200) instead of throttled (429). This is non-deterministic timing
  flakiness, not a behavioral regression in the limiter.

### Change
- `test/handler_integration_test.dart`, "returns 429 when rate limit exceeded":
  replaced the three sequential requests with a burst of 12 concurrent requests
  via `Future.wait`. The test now asserts at least one response is `429`
  (`HttpStatus.tooManyRequests`) and at least one is `200` (`HttpStatus.ok`),
  plus that the throttled response body contains `Rate limit`. With a limit of
  2/s and 12 concurrent requests, the limit is exceeded in at least one window
  regardless of how the requests straddle a second boundary, while some still
  succeed — confirming the limiter throttles without blocking everything.
- `CHANGELOG.md`: added an `[Unreleased]` section with a Maintenance note
  describing the flaky-test fix.

### Verification
- `dart test --name "rate limit" test/handler_integration_test.dart` → all 3
  rate-limiting tests pass (exit 0).
- No production code changed; limiter behavior is unaltered.

### Notes for maintainers
- The limiter remains wall-clock-window based and is not deterministically
  testable through the HTTP layer without a clock seam. If future integration
  tests need exact boundary behavior, inject a clock into `RateLimiter` rather
  than relying on sequential request timing. The unit tests in
  `test/rate_limiter_test.dart` exercise the counter synchronously and are not
  affected by this flakiness.
