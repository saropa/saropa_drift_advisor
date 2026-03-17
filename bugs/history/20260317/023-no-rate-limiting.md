# BUG-023: No rate limiting on the debug server

## Severity: Minor

## Component: Server

## File: `lib/src/server/router.dart`

## Description

The HTTP debug server has no rate limiting. A runaway polling client, a
misbehaving browser extension, or a script making rapid requests could
overwhelm the debug server and the underlying database.

## Impact

- A tight polling loop (e.g., broken client code) could saturate the server
- Database query callbacks are invoked for every request with no throttling
- The `checkDataChange()` method runs a UNION ALL across all tables on each
  generation poll — rapid polling amplifies this cost
- In extreme cases, could slow down the Flutter app being debugged

## Steps to Reproduce

1. Start the debug server
2. Send rapid requests in a loop: `while true; do curl localhost:8642/api/tables; done`
3. Observe: all requests are served with no throttling

## Expected Behavior

- Add per-IP rate limiting (e.g., 100 requests/second)
- Return HTTP 429 (Too Many Requests) when limit is exceeded
- Include `Retry-After` header in 429 responses
- Consider a configurable rate limit parameter in `DriftDebugServer.start()`
- The long-poll endpoint (`/api/generation`) should be exempt since it holds
  connections by design

## Fix

Added per-IP rate limiting using a fixed-window counter algorithm:

- New `RateLimiter` class in `lib/src/server/rate_limiter.dart`
- Each IP gets `maxRequestsPerSecond` requests per one-second window
- Returns HTTP 429 with `Retry-After: 1` header when limit exceeded
- `/api/generation` (long-poll) and `/api/health` endpoints are exempt
- Stale IP entries pruned when map exceeds 256 entries
- Optional `maxRequestsPerSecond` parameter on `DriftDebugServer.start()`
  (null = no rate limiting, preserving backward compatibility)
- Constants added to `ServerConstants`: `defaultMaxRequestsPerSecond`,
  `headerRetryAfter`, `errorRateLimited`, `rateLimitPruneThreshold`
- Rate limit check runs in `Router.onRequest()` after auth, before handlers
- Unit tests in `test/rate_limiter_test.dart`
