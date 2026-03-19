# Connection banner UX and zero runtime dependencies (2025-03-18)

## Status: Implemented

## Summary

1. **Connection banner improvements** — The "Connection lost — reconnecting…" banner now shows: live countdown ("Next retry in Xs"), retry interval (e.g. "Retrying every 5s"), attempt count, and "(max interval)" when at 30s. A **Retry now** button triggers an immediate health check and resets backoff. A 1s ticker keeps the countdown accurate. Duplicate in-flight health checks are avoided (guard in `doHeartbeat` and Retry click) to prevent timer races.

2. **Zero runtime dependencies** — Removed the `crypto` package. Bearer auth now uses in-memory token comparison (constant-time); Basic auth unchanged. The Dart package has no third-party runtime dependencies, reducing app size and attack surface for all consumers.

## Files changed

- `lib/src/server/html_content.dart` — Banner markup: message, diagnostics span, Retry now button.
- `assets/web/app.js` — Connection state (nextHeartbeatAt, heartbeatInFlight, heartbeatAttemptCount, bannerUpdateIntervalId), `updateConnectionBannerText()`, banner ticker, Retry handler, heartbeat guards.
- `assets/web/style.scss` / `style.css` — Banner layout (banner-text, banner-diagnostics, banner-actions, banner-btn).
- `lib/src/server/server_context.dart` — `authTokenHash` → `authToken` (String?).
- `lib/src/server/auth_handler.dart` — Remove crypto; compare Bearer token with `_secureCompare(token, expectedToken)`.
- `lib/src/drift_debug_server_io.dart` — Remove crypto; pass `authToken` to ServerContext.
- `lib/src/server/router.dart` — Check `authToken` instead of `authTokenHash`.
- `pubspec.yaml` — Removed `crypto` dependency.
- `test/helpers/test_helpers.dart` — `authTokenHash` → `authToken` in `createTestContext`.
- `README.md` — Impact on app size: zero runtime dependencies.
- `CHANGELOG.md` — [Unreleased] entries for banner UX and zero deps.

## Related

- BUG-002 (no-offline-resilience) — Original connection banner; this enhances it with countdown, retry, and diagnostics.
- apk_bloat_problem.md — Previously reduced to single dep (crypto); this removes that last dependency.
